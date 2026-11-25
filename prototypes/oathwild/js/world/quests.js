// Oathwild — quests and NPC talk (data/quests.json + data/npcs.json). Pure: no DOM, no sockets, no clock.
// Quest PROGRESS belongs to the shared world (js/rules/world-state.js: ws.quests); REWARDS belong to each player,
// collected once each from the hand-in NPC — also by a player who joined after the quest was done (owner ruling).
//
//   const book = createQuestBook({ quests, npcs, placements, map, regions })   index + checks (throws on bad refs)
//   questStatus(book, ws, id, ctx)        'locked' | 'available' | 'active' | 'ready' | 'done'
//   accept(book, ws, id, ctx)             → { ok, why, events }
//   notify(book, ws, event, ctx)          feed world happenings → events [{ t: 'quest-step' | 'quest-ready' |
//                                         'quest-done', quest, step, text }]. Event kinds:
//                                           { t: 'death', def: monsterId, camp?, by: [playerIds] }   (combat.js 'death')
//                                           { t: 'talk', npc, player }        { t: 'reach', at: [x, z], player }
//                                           { t: 'take', object, player }     (a quest item taken from a container)
//                                           { t: 'use', object, player }      (an object used: a bell, a cage, a seal)
//   escortTick(book, ws, heroes, dt, { walkable })  move every escort toward its nearest hero → events
//   talkTo(book, ws, npcId, ctx)          the dialogue the player sees: { npc, lines, options: [{ id, text, kind }] }
//   choose(book, rules, ws, npcId, optionId, ctx)   act on an option → { lines, events, open, rewards }
//   claimReward(book, rules, ws, id, char, { pick, rng })  one player's reward (XP, gold, items, personal flags)
//   questLog(book, ws, ctx)               the quest log model for the UI (active / ready / available / done)
//   npcPresent(book, ws, npcId)           NPCs can appear or leave with world flags
//   npcAt(book, ws, npcId)                where the NPC stands now (escorts walk; `moves` relocates)
//   servicesOf(book, ws, npcId, ctx)      shop / trainer / stable / respec / pact, with prices that read the world
//   markerOf(book, ws, id)                where the current step points: { at: [x, z], radius, label }
//
// ctx = { playerId, level, flags } (flags = world-state flagsFor(ws, playerId)).

import { startQuest, setQuestStep, completeQuest, claimQuestReward, setFlag, hasFlag, flagsFor, note } from '../rules/world-state.js';
import { addXp } from '../rules/levels.js';
import { makeNamed } from '../rules/casters.js';

// How a sentence names a person: main-story people by name ("Captain Edda Brandt"), everyone else by
// their job ("the Blacksmith"; `start` = at the start of a sentence, "The Blacksmith"). Name tags and window
// headers show the bare `name` ("Blacksmith").
export function npcCall(n, { start = false } = {}) {
  if (!n) return start ? 'Someone' : 'someone';
  return n.role ? `${start ? 'The' : 'the'} ${n.name}` : n.name;
}

export const STEP_KINDS = Object.freeze(['talk', 'kill', 'collect', 'reach', 'use', 'escort']);

// ---------------------------------------------------------------- the book

export function createQuestBook({ quests, npcs, placements, map, regions }) {
  const Q = {}, order = [];
  for (const [id, q] of Object.entries(quests.quests)) { Q[id] = { id, ...q }; order.push(id); }
  const N = {};
  for (const [id, n] of Object.entries(npcs.npcs)) N[id] = { id, ...n };
  const objects = Object.fromEntries((placements.objects || []).map(o => [o.id, o]));
  const places = Object.fromEntries(Object.entries(map.places).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, { id: k, ...v }]));
  const camps = {};
  for (const [rid, r] of Object.entries(regions.regions)) for (const [cid, c] of Object.entries(r.camps || {})) camps[cid] = { id: cid, region: rid, ...c };
  const book = { quests: Q, order, npcs: N, objects, places, camps, data: quests };
  const bad = checkBook(book);
  if (bad.length) throw new Error(`oathwild quests: ${bad.join('; ')}`);
  return book;
}

/** Every reference a quest makes must exist (the tests also call this). */
export function checkBook(book) {
  const out = [];
  const { quests: Q, npcs: N, objects: O, places: P } = book;
  for (const q of Object.values(Q)) {
    if (q.giver && !N[q.giver]) out.push(`${q.id}: giver ${q.giver} missing`);
    if (q.turnIn && !N[q.turnIn]) out.push(`${q.id}: turnIn ${q.turnIn} missing`);
    for (const r of q.requires?.quests || []) if (!Q[r]) out.push(`${q.id}: needs unknown quest ${r}`);
    if (!q.steps?.length) out.push(`${q.id}: no steps`);
    for (const s of q.steps || []) {
      if (!STEP_KINDS.includes(s.kind)) out.push(`${q.id}/${s.id}: unknown step kind ${s.kind}`);
      if ((s.kind === 'talk' || s.kind === 'escort') && !N[s.npc]) out.push(`${q.id}/${s.id}: npc ${s.npc} missing`);
      if (s.kind === 'reach' && !P[s.place]) out.push(`${q.id}/${s.id}: place ${s.place} missing`);
      if (s.kind === 'escort' && !P[s.to]) out.push(`${q.id}/${s.id}: escort goal ${s.to} missing`);
      if ((s.kind === 'collect' || s.kind === 'use')) for (const o of s.objects || []) if (!O[o]) out.push(`${q.id}/${s.id}: object ${o} missing`);
      if (s.kind === 'kill') for (const t of s.targets || []) if (t.camp && !book.camps[t.camp]) out.push(`${q.id}/${s.id}: camp ${t.camp} missing`);
    }
  }
  return out;
}

const ctxFlags = (ws, ctx) => ctx?.flags || (ctx?.playerId ? flagsFor(ws, ctx.playerId) : ws.flags);
const stepCount = s => s.kind === 'kill' ? null : (s.count || (s.objects?.length) || 1);

// ---------------------------------------------------------------- status

export function questStatus(book, ws, id, ctx = {}) {
  const q = book.quests[id];
  const st = ws.quests[id];
  if (st?.done) return 'done';
  if (st) return st.step >= q.steps.length ? 'ready' : 'active';
  return refusal(book, ws, id, ctx) ? 'locked' : 'available';
}

/** Why a player cannot take a quest yet (plain words), or null. */
export function refusal(book, ws, id, ctx = {}) {
  const q = book.quests[id];
  if (!q) return 'There is no such quest.';
  for (const r of q.requires?.quests || []) if (!ws.quests[r]?.done) return `Finish "${book.quests[r].title}" first.`;
  const flags = ctxFlags(ws, ctx);
  for (const f of q.requires?.flags || []) if (!flags.includes(f)) return 'Something in the world has to happen first.';
  const min = q.minLevel ?? Math.max(1, q.level - 2);
  if ((ctx.level ?? 99) < min) return `You need to be level ${min} (you are ${ctx.level}).`;
  return null;
}

export function accept(book, ws, id, ctx = {}) {
  const why = ws.quests[id] ? 'Your group has already started that quest.' : refusal(book, ws, id, ctx);
  if (why) return { ok: false, why, events: [] };
  startQuest(ws, id);
  const q = book.quests[id];
  note(ws, `Quest started: ${q.title}`);
  const events = [{ t: 'quest-start', quest: id, by: ctx.playerId || null, text: q.steps[0].text }];
  events.push(...enterStep(book, ws, id));
  return { ok: true, why: null, events };
}

function enterStep(book, ws, id) {
  const q = book.quests[id], st = ws.quests[id];
  const s = q.steps[st.step];
  if (!s) return ready(book, ws, id);
  if (s.kind === 'escort') {
    const from = book.npcs[s.npc].at;
    st.data.escort = { x: from[0], z: from[1], moving: false };
  }
  return [];
}

function ready(book, ws, id) {
  const q = book.quests[id];
  if (!q.turnIn) return finish(book, ws, id);
  return [{ t: 'quest-ready', quest: id, text: `Return to ${npcCall(book.npcs[q.turnIn])}.` }];
}

function finish(book, ws, id) {
  const q = book.quests[id];
  completeQuest(ws, id);
  for (const f of q.rewards?.worldFlags || []) setFlag(ws, f);
  note(ws, `Quest done: ${q.title}`);
  return [{ t: 'quest-done', quest: id, text: q.title }];
}

function advance(book, ws, id) {
  const st = ws.quests[id];
  const q = book.quests[id];
  const s = q.steps[st.step];
  for (const f of s.worldFlags || []) setFlag(ws, f);
  st.step++;
  const events = [{ t: 'quest-step', quest: id, step: s.id, text: q.steps[st.step]?.text || null }];
  return events.concat(enterStep(book, ws, id));
}

// ---------------------------------------------------------------- progress

/** One world happening → quest events. Only quests already started count it (nothing completes ahead of time). */
export function notify(book, ws, ev, ctx = {}) {
  const out = [];
  for (const id of book.order) {
    const st = ws.quests[id];
    if (!st || st.done) continue;
    const q = book.quests[id];
    const s = q.steps[st.step];
    if (!s) continue;
    if (s.kind === 'kill' && ev.t === 'death') {
      let hit = false;
      for (const [i, t] of s.targets.entries()) {
        const match = (t.monster && t.monster === ev.def) || (t.camp && t.camp === ev.camp && (!t.monster || t.monster === ev.def));
        if (!match) continue;
        const key = `${s.id}:${i}`;
        if ((st.data[key] || 0) >= t.count) continue;
        st.data[key] = (st.data[key] || 0) + 1;
        hit = true;
        break;
      }
      if (hit) {
        out.push({ t: 'quest-count', quest: id, step: s.id, progress: progressText(book, ws, id) });
        if (s.targets.every((t, i) => (st.data[`${s.id}:${i}`] || 0) >= t.count)) out.push(...advance(book, ws, id));
      }
    } else if ((s.kind === 'collect' && ev.t === 'take') || (s.kind === 'use' && ev.t === 'use')) {
      if (!s.objects.includes(ev.object)) continue;
      const list = st.data[s.id] = st.data[s.id] || [];
      if (list.includes(ev.object)) continue;
      list.push(ev.object);
      out.push({ t: 'quest-count', quest: id, step: s.id, progress: progressText(book, ws, id) });
      if (list.length >= stepCount(s)) out.push(...advance(book, ws, id));
    } else if (s.kind === 'reach' && ev.t === 'reach') {
      const p = book.places[s.place];
      if (Math.hypot(ev.at[0] - p.at[0], ev.at[1] - p.at[1]) <= (s.radius || p.radius || 12)) out.push(...advance(book, ws, id));
    } else if (s.kind === 'talk' && ev.t === 'talk' && ev.npc === s.npc && !s.options?.length) {
      out.push(...advance(book, ws, id));
    }
  }
  return out;
}

/** Quest objects that are live now (a container with a quest item in it, or a thing to use) — the client shows a glint. */
export function liveObjects(book, ws) {
  const out = [];
  for (const id of book.order) {
    const st = ws.quests[id];
    if (!st || st.done) continue;
    const s = book.quests[id].steps[st.step];
    if (s && (s.kind === 'collect' || s.kind === 'use')) for (const o of s.objects) if (!(st.data[s.id] || []).includes(o)) out.push({ object: o, quest: id, step: s.id, kind: s.kind, item: s.item || null });
  }
  return out;
}

/**
 * Escorts follow the nearest hero along the hero's own footsteps (a short trail of crumbs kept in the quest data),
 * so they cross where the hero crossed (bridges, fords) instead of walking into a river. Lite: they cannot be hurt;
 * they wait when nobody is within `waitMetres`, and stop `keep` metres short of the hero.
 */
export function escortTick(book, ws, heroes, dt, { walkable = null, speed = 4.2, waitMetres = 25, keep = 3 } = {}) {
  const out = [];
  for (const id of book.order) {
    const st = ws.quests[id];
    if (!st || st.done) continue;
    const q = book.quests[id], s = q.steps[st.step];
    if (!s || s.kind !== 'escort' || !st.data.escort?.moving) continue;
    const e = st.data.escort;
    const goal = book.places[s.to];
    if (Math.hypot(e.x - goal.at[0], e.z - goal.at[1]) <= (s.radius || goal.radius || 10)) { e.moving = false; delete e.trail; out.push(...advance(book, ws, id)); continue; }
    let near = null, nd = Infinity;
    for (const h of heroes) { const d = Math.hypot(h.x - e.x, h.z - e.z); if (d < nd) { nd = d; near = h; } }
    if (!near || nd > waitMetres) continue;
    const trail = e.trail = e.trail || [];
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(near.x - last[0], near.z - last[1]) > 1.5) { trail.push([Math.round(near.x * 10) / 10, Math.round(near.z * 10) / 10]); if (trail.length > 80) trail.shift(); }
    if (nd <= keep) continue;
    let budget = speed * dt;
    while (budget > 0 && trail.length) {
      const [tx, tz] = trail[0];
      const d = Math.hypot(tx - e.x, tz - e.z);
      if (d < 0.5) { trail.shift(); continue; }
      const len = Math.min(d, budget);
      const nx = e.x + (tx - e.x) / d * len, nz = e.z + (tz - e.z) / d * len;
      if (walkable && !walkable(nx, nz)) { trail.shift(); continue; }
      e.x = Math.round(nx * 100) / 100; e.z = Math.round(nz * 100) / 100;
      budget -= len;
      if (Math.hypot(near.x - e.x, near.z - e.z) <= keep) break;
    }
  }
  return out;
}
/** Where each escort is (the server draws the NPC there). */
export function escorts(book, ws) {
  const out = [];
  for (const id of book.order) {
    const st = ws.quests[id];
    const s = st && !st.done ? book.quests[id].steps[st.step] : null;
    if (s?.kind === 'escort' && st.data.escort) out.push({ quest: id, npc: s.npc, at: [st.data.escort.x, st.data.escort.z], moving: st.data.escort.moving });
  }
  return out;
}

// ---------------------------------------------------------------- text for the log

export function progressText(book, ws, id) {
  const q = book.quests[id], st = ws.quests[id];
  const s = st && q.steps[st.step];
  if (!s) return null;
  if (s.kind === 'kill') return s.targets.map((t, i) => `${t.label}: ${Math.min(t.count, st.data[`${s.id}:${i}`] || 0)}/${t.count}`).join(', ');
  if (s.kind === 'collect' || s.kind === 'use') return `${(st.data[s.id] || []).length}/${stepCount(s)}`;
  return null;
}

export function markerOf(book, ws, id) {
  const q = book.quests[id], st = ws.quests[id];
  if (!st || st.done) return null;
  const s = q.steps[st.step];
  if (!s) { const n = book.npcs[q.turnIn]; return n ? { at: n.at, radius: 3, label: npcCall(n) } : null; }
  if (s.kind === 'talk') return { at: book.npcs[s.npc].at, radius: 3, label: npcCall(book.npcs[s.npc]) };
  if (s.kind === 'reach') { const p = book.places[s.place]; return { at: p.at, radius: s.radius || p.radius || 12, label: p.name }; }
  if (s.kind === 'escort') { const g = book.places[s.to]; return st.data.escort?.moving ? { at: g.at, radius: s.radius || g.radius || 10, label: g.name } : { at: book.npcs[s.npc].at, radius: 3, label: npcCall(book.npcs[s.npc]) }; }
  if (s.kind === 'collect' || s.kind === 'use') {
    const left = s.objects.filter(o => !(st.data[s.id] || []).includes(o)).map(o => book.objects[o].at);
    if (!left.length) return null;
    const cx = left.reduce((a, p) => a + p[0], 0) / left.length, cz = left.reduce((a, p) => a + p[1], 0) / left.length;
    const r = Math.max(6, ...left.map(p => Math.hypot(p[0] - cx, p[1] - cz) + 4));
    return { at: [Math.round(cx), Math.round(cz)], radius: Math.round(r), label: s.item || book.objects[s.objects[0]].name };
  }
  if (s.kind === 'kill') {
    const t = s.targets.find((t, i) => (st.data[`${s.id}:${i}`] || 0) < t.count) || s.targets[0];
    const where = t.camp ? book.camps[t.camp] : t.near ? book.places[t.near] : null;
    return where ? { at: where.at, radius: where.radius || 30, label: t.label } : null;
  }
  return null;
}

/** Rewards as lines a player reads ("520 XP", "18 gold", "choose one: …"). */
export function rewardLines(book, id) {
  const r = book.quests[id].rewards || {};
  const out = [];
  if (r.xp) out.push(`${r.xp} XP`);
  if (r.gold) out.push(`${r.gold} gold`);
  for (const it of r.items || []) out.push(it.label);
  if (r.pick?.length) out.push(`Choose one: ${r.pick.map(p => p.label).join(', ')}`);
  for (const f of r.flagsText || []) out.push(f);
  return out;
}

export function questLog(book, ws, ctx = {}) {
  const out = { active: [], ready: [], available: [], done: [] };
  for (const id of book.order) {
    const q = book.quests[id];
    const status = questStatus(book, ws, id, ctx);
    if (status === 'locked') continue;
    const st = ws.quests[id];
    const entry = {
      id, title: q.title, kind: q.kind, region: q.region, level: q.level, status, summary: q.summary,
      giver: q.giver ? { id: q.giver, name: npcCall(book.npcs[q.giver]), at: book.npcs[q.giver].at } : null,
      turnIn: q.turnIn ? { id: q.turnIn, name: npcCall(book.npcs[q.turnIn]), at: book.npcs[q.turnIn].at } : null,
      steps: q.steps.map((s, i) => ({ id: s.id, text: s.text, done: !!st && (st.done || i < st.step), current: !!st && !st.done && i === st.step })).filter((s, i) => !st || st.done || i <= st.step),
      progress: st && !st.done ? progressText(book, ws, id) : null,
      marker: markerOf(book, ws, id),
      rewards: rewardLines(book, id),
      rewardWaiting: !!st?.done && !!ctx.playerId && !st.rewarded[ctx.playerId],
    };
    if (status === 'available' && !q.giver) continue;   // found in the world, not offered
    out[status].push(entry);
  }
  const lv = q => q.level;
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'main' ? -1 : 1) || lv(a) - lv(b));
  return out;
}

// ---------------------------------------------------------------- NPCs and talk

export function npcPresent(book, ws, npcId) {
  const n = book.npcs[npcId];
  if (!n) return false;
  if (n.appears?.flag && !hasFlag(ws, n.appears.flag)) return false;
  if (n.leaves?.flag && hasFlag(ws, n.leaves.flag)) return false;
  return true;
}

/** Where an NPC stands now: an escort walks, `moves` relocates them once its flag is set. */
export function npcAt(book, ws, npcId) {
  const n = book.npcs[npcId];
  if (!n) return null;
  const e = escorts(book, ws).find(x => x.npc === npcId);
  if (e) return e.at;
  if (n.moves?.flag && hasFlag(ws, n.moves.flag)) return n.moves.at;
  return n.at;
}

export function servicesOf(book, ws, npcId, ctx = {}) {
  const n = book.npcs[npcId];
  const out = [];
  for (const s of n.services || []) {
    if (s.flag && !hasFlag(ws, s.flag)) continue;
    const row = { ...s };
    if (s.kind === 'stable' && s.discountFlag && hasFlag(ws, s.discountFlag)) row.priceMult = s.discount;
    out.push(row);
  }
  return out;
}

const SERVICE_TEXT = {
  shop: 'Show me what you sell.', trainer: 'Teach me.', stable: 'I need a horse.', respec: 'I want to change my path (respec).',
  travel: 'Travel to another shrine.', pact: 'About the pact...', repair: 'Mend my gear.',
};

export function talkTo(book, ws, npcId, ctx = {}) {
  const n = book.npcs[npcId];
  if (!n || !npcPresent(book, ws, npcId)) return { npc: null, lines: [], options: [] };
  const lines = [];
  const options = [];
  for (const id of book.order) {
    const q = book.quests[id];
    const status = questStatus(book, ws, id, ctx);
    const st = ws.quests[id];
    if (q.turnIn === npcId && status === 'ready') options.push({ id: `turnin:${id}`, text: `${q.title} (done)`, kind: 'turnin' });
    if (q.turnIn === npcId && status === 'done' && ctx.playerId && !st.rewarded[ctx.playerId]) options.push({ id: `reward:${id}`, text: `${q.title}: collect your reward`, kind: 'reward' });
    if (q.giver === npcId && status === 'available') options.push({ id: `offer:${id}`, text: q.title, kind: 'offer' });
    if (status === 'active') {
      const s = q.steps[st.step];
      if (s.kind === 'talk' && s.npc === npcId) options.push({ id: `step:${id}`, text: s.ask || q.title, kind: 'step' });
      if (s.kind === 'escort' && s.npc === npcId && !st.data.escort?.moving) options.push({ id: `escort:${id}`, text: s.ask || 'Come with me.', kind: 'step' });
    }
  }
  const pick = n.lines?.find(l => l.flag && hasFlag(ws, l.flag)) || n.lines?.find(l => !l.flag);
  lines.push(...(pick?.say || [`${npcCall(n, { start: true })} nods to you.`]));
  for (const s of servicesOf(book, ws, npcId, ctx)) options.push({ id: `service:${s.kind}`, text: s.text || SERVICE_TEXT[s.kind] || s.kind, kind: 'service' });
  options.push({ id: 'bye', text: 'Goodbye.', kind: 'bye' });
  return { npc: { id: n.id, name: n.name, title: n.title || null }, lines, options };
}

/**
 * Act on a dialogue option. Returns { lines, options, events, open, rewards } — `options` are the follow-up
 * choices (accept / not now, a story choice), `open` names a window for the client (shop, trainer, stable, respec…).
 */
export function choose(book, rules, ws, npcId, optionId, ctx = {}) {
  const [kind, qid, extra] = optionId.split(':');
  const q = qid ? book.quests[qid] : null;
  const st = qid ? ws.quests[qid] : null;
  const res = { lines: [], options: [], events: [], open: null, rewards: null };
  if (kind === 'bye') return res;
  if (kind === 'service' && qid === 'pact') {
    const sv = servicesOf(book, ws, npcId, ctx).find(s => s.kind === 'pact');
    if (sv && ctx.playerId) { setFlag(ws, sv.personalFlag, { player: ctx.playerId }); res.lines = ['A drop of you, a drop of me. It is done.']; res.events = [{ t: 'flag', flag: sv.personalFlag, player: ctx.playerId }]; }
    return res;
  }
  if (kind === 'service') { res.open = { kind: qid, npc: npcId, ...servicesOf(book, ws, npcId, ctx).find(s => s.kind === qid) }; return res; }
  if (kind === 'offer') {
    res.lines = [...q.offer];
    res.options = [{ id: `accept:${qid}`, text: q.acceptText || 'I will do it.', kind: 'accept' }, { id: 'bye', text: 'Not now.', kind: 'bye' }];
    return res;
  }
  if (kind === 'accept') {
    const r = accept(book, ws, qid, ctx);
    res.lines = r.ok ? [q.acceptReply || 'Good. Be careful out there.'] : [r.why];
    res.events = r.events;
    return res;
  }
  if (kind === 'step' && st && !st.done) {
    const s = q.steps[st.step];
    if (s.kind !== 'talk' || s.npc !== npcId) return res;
    res.lines = [...(s.say || [])];
    if (s.options?.length) { res.options = s.options.map(o => ({ id: `pick:${qid}:${o.id}`, text: o.text, kind: 'choice' })); return res; }
    res.events = advance(book, ws, qid);
    return res;
  }
  if (kind === 'pick' && st && !st.done) {
    const s = q.steps[st.step];
    const o = s.options?.find(x => x.id === extra);
    if (!o || s.npc !== npcId) return res;
    res.lines = [...(o.reply || [])];
    if (o.flag) setFlag(ws, o.flag);
    if (o.personalFlag && ctx.playerId) setFlag(ws, o.personalFlag, { player: ctx.playerId });
    st.data.choice = o.id;
    res.events = advance(book, ws, qid);
    return res;
  }
  if (kind === 'escort' && st && !st.done) {
    const s = q.steps[st.step];
    if (s.kind !== 'escort' || s.npc !== npcId) return res;
    st.data.escort.moving = true;
    res.lines = [...(s.say || [])];
    res.events = [{ t: 'escort-start', quest: qid, npc: npcId }];
    return res;
  }
  if (kind === 'turnin' && st && !st.done && st.step >= q.steps.length && q.turnIn === npcId) {
    res.lines = [...(q.done || [])];
    res.events = finish(book, ws, qid);
    if (ctx.char) res.rewards = claimReward(book, rules, ws, qid, ctx.char, ctx);
    return res;
  }
  if (kind === 'reward' && st?.done && q.turnIn === npcId && ctx.char) {
    res.lines = [...(q.done || [])];
    res.rewards = claimReward(book, rules, ws, qid, ctx.char, ctx);
    return res;
  }
  return res;
}

/**
 * One player's reward: XP (through levels.addXp), gold (handed over in person — loot gold is still taken from
 * windows), items made with Farhold's loot maker at the quest's level, personal flags (a pact, a contract, a tome).
 * `byChoice` swaps parts by the story choice the group made. `pick` = index into `pick` items (default 0).
 */
export function claimReward(book, rules, ws, id, char, { pick = 0, rng = null } = {}) {
  const q = book.quests[id];
  const r = claimQuestReward(ws, id, char.id);
  if (!r.ok) return { ok: false, why: r.why };
  const st = ws.quests[id];
  const base = q.rewards || {};
  const R = { ...base, ...(base.byChoice?.[st.data.choice] || {}) };
  const out = { ok: true, xp: 0, gold: 0, items: [], flags: [] };
  if (R.xp) out.xp = addXp(rules, char, R.xp).added;
  if (R.gold) { char.gold = (char.gold || 0) + R.gold; out.gold = R.gold; }
  const dice = rng || seeded(`${ws.seed}:${id}:${char.id}`);
  const specs = [...(R.items || [])];
  if (R.pick?.length) specs.push(R.pick[Math.max(0, Math.min(R.pick.length - 1, pick))]);
  for (const sp of specs) {
    // `named`: a named magic weapon from data/casters.json (its element and attack style are fixed)
    const it = sp.named ? makeNamed(rules, sp.named, { rng: dice, ilvl: sp.ilvl || q.level, level: q.level })
      : rules.rpg.loot.generate(sp.base, sp.rarity || 'magic', sp.quality || 'high', { rng: dice, ilvl: sp.ilvl || q.level, level: q.level });
    if (it) { char.bag = char.bag || []; char.bag.push(it); out.items.push(it); }
  }
  for (const f of R.flags || []) { setFlag(ws, f, { player: char.id }); out.flags.push(f); }
  return out;
}

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// re-exported so the server needs one import for quest state
export { setQuestStep };
