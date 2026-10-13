// PROFESSIONS — the server side (round 8, W9; stream P-core). Pure (no DOM, no Node APIs).
//
// The numbers and every roll are js/rules/professions.js over data/rules/professions.json; the mini-games are
// js/rules/professions-games.js; materials, node kinds, recipes, trainers and where the nodes stand are
// data/provinces/professions.json + professions-nodes.json (made by tools/content-professions.mjs). This file runs it
// for real players: nodes in the world, the gather / craft / temper loops, the saved skills, the trainers.
//
//   learn    `prof {op:'learn', id, npc}`               -> `profR {op, ok, id, tool?}` + `you {professions}`
//   gather   `gather {op:'start', id?}`                  -> `gatherR {ok, state:'play', id, prof, node, game}`  (you are held still)
//            `gather {op:'done', id, inputs:[t,v,…]}`    -> `gatherDone {ok, quality, score, marks, items, got, xp, skill, key, reopenMs}`
//            `gather {op:'stop'}`                        -> `gatherR {ok, state:'idle', why}`
//   make     `craft {op:'list', npc?}`                   -> `craftList {ok, station, level, recipes}`
//            `craft {op:'start', id, base?, n?, uid?, index?, element?}` -> `craftR {ok, state:'play', id, game, cost}`
//            `craft {op:'done', id, inputs}`             -> `craftDone {ok, quality, score, marks, items, got, item?, xp, skill}` + a fresh `craftList`
//            `craft {op:'quote', id, uid, index?, element?}` -> `craftQuote {ok, can, why?, needs, gold, text}`   (tempering)
// Everyone near sees `ev fx {kind:'gather'|'craft', id, phase, prof, …}` and the worker's `info.working = {prof, anim, node?|at?}`.
//
// NODES are room objects (`type:'node'`, `info.node = {prof, kind, tier, minSkill, look}`, `info.key = 'node:<id>'`) and they
// are PER PLAYER: one entity for everyone, spent only for the character who worked it (`char.opened['node:<id>']` = the
// wall time it comes back — the same saved table the per-character chests use, sent in `joined.you.opened`). Nobody can
// take the boulder in front of you. A wilds copy holds every node of its zones; a town's room the ones within
// `gather.townBorderM` of its edge (you see the copper from the gate).
// SKINNING has no node: a beast that dies with your credit is yours to skin (`skinnable {id, on, tier, minSkill}`).
// The mini-game is seeded HERE; the client sends raw input times; `scoreGame` here decides. A walk-away costs nothing.
//
// SAVED on the character (`professions`): { known: [ids], xp: { id: n }, made: { recipe: n }, tools: { prof: 1 } }.
// Angling's skill stays in `char.angling` (js/sim/angling.js); it is only shown here.
//
//   const W = createProfessions({ ...province helpers })
//   W.prof(o, m) ; W.gather(o, m) ; W.craft(o, m) ; W.tick() ; W.stop(o, why) ; W.view(ch) ; W.ensureNodes(room)
//   W.npcExtra(o, obj) ; W.useItem(o, item, idx, R) -> bool ; W.onKill(room, dead, creditedRecords) ; W.onEvent(o, ev)

import { STATE } from '../net/protocol.js';
import { createProfessions as createRules, PROFESSIONS } from '../rules/professions.js';
import { scoreGame, checkInputs } from '../rules/professions-games.js';

export const PROF_OPS = Object.freeze(['learn', 'tool']);
export const GATHER_OPS = Object.freeze(['start', 'done', 'stop', 'cancel']);
export const CRAFT_OPS = Object.freeze(['list', 'start', 'done', 'stop', 'cancel', 'quote']);

const hash01 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

export function createProfessions({ layouts, online, provOf, grant, journal, questEvent = () => {}, now, wallNow = () => Date.now(), log = () => {}, counters = {},
  fighting = () => false, dismount = () => {}, endMeal = () => {}, stopFishing = () => {}, wantSheet = () => {}, bagCap = () => 120, isFire = () => false, anglingView = () => ({ level: 1, xp: 0, next: null }),
  spend = (o, gold) => { o.char.gold -= gold; }, potionText = null, tradeHolds = () => false, loadEngine = null, opts = {} }) {
  const first = layouts[0] || {};
  const D = first.professions || null;               // { numbers, content, nodes }
  const P = D && D.numbers ? createRules(D.numbers, D.content || {}) : null;
  const content = (D && D.content) || {};
  const nodeData = (D && D.nodes) || null;
  const G = P ? P.gatherNumbers : {}, K = P ? P.craftNumbers : {};
  const working = new Set();                          // province records in a mini-game
  const trainerIds = new Set((content.trainers || []).map(t => t.id));      // the trainers of this system teach at the first word
  const reply = (o, t, x) => { if (o.conn) o.conn.sendJSON({ t, ...x }); };
  let engine = opts.engine || null, engineAsked = false;
  /**
   * Tempering and the extra-property roll need stream C's engine and the temper rules. Wrap-up (Y13, "The forge is still
   * warming up" for ever): both used to be asked for ONCE, on the first order — a load that failed left `engineAsked` true
   * and the forge refused everybody until a restart. Now both are asked for as soon as this system sees its first room
   * (`ensureNodes`, i.e. at server start), a failed load is asked for again (at most every RETRY_MS), and `forgeWhy()`
   * says which of the three things is actually the matter.
   */
  const RETRY_MS = 3000;
  let engineErr = null, engineTriedAt = -Infinity, temperErr = null, temperAsked = false, temperTriedAt = -Infinity;
  function wantEngine(room) {
    if (engine || engineAsked || !room || !room.rules || !room.rules.makeItem) return;
    if (engineErr && now() - engineTriedAt < RETRY_MS) return;
    engineAsked = true; engineTriedAt = now();
    const get = loadEngine || (() => import('../rules/index.js').then(m => m.rulesEngine()));
    Promise.resolve().then(get).then(e => { engine = e || null; engineErr = engine ? null : 'the item rules came back empty'; engineAsked = !!engine; })
      .catch(err => { engineErr = (err && err.message) || 'the item rules did not load'; engineAsked = false; log('professions: no engine', engineErr); });
  }
  let temperKit = opts.temperKit || null;
  function wantTemper() {
    if (temperKit || temperAsked) return;
    if (temperErr && now() - temperTriedAt < RETRY_MS) return;
    temperAsked = true; temperTriedAt = now();
    const get = opts.loadTemper || (() => import('../rules/professions-temper.js'));
    Promise.resolve().then(get).then(m => { temperKit = m || null; temperErr = temperKit ? null : 'the tempering rules came back empty'; temperAsked = !!temperKit; })
      .catch(err => { temperErr = (err && err.message) || 'the tempering rules did not load'; temperAsked = false; log('professions: temper rules', temperErr); });
  }
  /** Why the forge cannot take a tempering order right now, in plain words (null = it can). Asks again for whatever is missing. */
  function forgeWhy(room) {
    if (engine && temperKit) return null;
    wantEngine(room); wantTemper();
    if (!engine && !(room && room.rules && room.rules.makeItem)) return 'Tempering cannot be done in this place. Try a forge in one of the towns.';
    if ((!engine && engineErr) || (!temperKit && temperErr)) return 'The forge is out of order: the server could not load its tempering rules. It keeps trying — please send a report if this lasts.';
    return 'The forge is still warming up. Try again in a moment.';
  }

  // ---- the saved record ----
  function stateOf(ch) {
    const s = ch.professions && typeof ch.professions === 'object' ? ch.professions : (ch.professions = {});
    s.known = Array.isArray(s.known) ? s.known : [];
    s.xp = s.xp && typeof s.xp === 'object' ? s.xp : {};
    s.made = s.made && typeof s.made === 'object' ? s.made : {};
    s.tools = s.tools && typeof s.tools === 'object' ? s.tools : {};
    return s;
  }
  const peek = ch => (ch.professions && typeof ch.professions === 'object' ? ch.professions : { known: [], xp: {}, made: {}, tools: {} });
  const knows = (ch, id) => { const d = P && P.def(id); return !!d && (!!d.start || (peek(ch).known || []).includes(id)); };
  const levelOf = (ch, id) => (id === 'angling' ? (anglingView(ch).level || 1) : P ? P.levelOf((peek(ch).xp || {})[id] || 0) : 1);
  /** What the client gets as `you.professions` (never creates the record). */
  function view(ch) {
    if (!P) return { list: [] };
    const s = peek(ch);
    // W9 (P-client): how long each node this character has worked stays bare (ms left) — `you.opened` has the keys but
    // not the times, so after a re-join the client held every listed node bare for the longest respawn there is
    const nodes = {}, tNow = wallNow();
    for (const [k, until] of Object.entries(ch.opened || {})) if (k.startsWith('node:') && until > tNow) nodes[k] = Math.round(until - tNow);
    return { nodes, list: PROFESSIONS.map(id => {
      const d = P.def(id);
      const tl = d.kind === 'gather' && id !== 'angling' ? P.bestTool(ch.bag, id) : null;
      if (id === 'angling') { const a = anglingView(ch); return { id, name: d.name, kind: d.kind, known: a.learned !== false, level: a.level || 1, xp: a.xp || 0, next: a.next ?? null, rank: a.rank || P.rank(a.level || 1), max: a.max || 100, tool: null }; }
      const xp = (s.xp || {})[id] || 0, level = P.levelOf(xp);
      return { id, name: d.name, kind: d.kind, known: knows(ch, id), level, xp, next: P.next(level, xp), rank: P.rank(level), max: P.maxLevel, tool: tl ? { id: tl.id, name: tl.name, tier: tl.tier } : null };
    }) };
  }
  function saved(o) { journal(o, 'set', { k: 'professions', v: o.char.professions }); o.dirty = true; }
  const tell = o => reply(o, 'you', { professions: view(o.char) });
  const skillView = g => ({ level: g.level, xp: g.xp, next: g.next, ...(g.up > 0 ? { up: g.up } : {}) });
  /** Add skill xp; says so when a level is gained. */
  function addXp(o, id, add) {
    const s = stateOf(o.char);
    const g = P.gain({ xp: s.xp[id] || 0 }, add);
    s.xp[id] = g.xp;
    if (g.up > 0) { const d = P.def(id); reply(o, 'chat', { ch: 'system', from: 0, name: d.name, text: `Your ${d.name.toLowerCase()} is now ${g.level}${P.rank(g.level) ? ' (' + P.rank(g.level) + ')' : ''}.` }); wantSheet(o); }
    return g;
  }

  // ---- nodes in the world ----
  const seen = new Set();            // room ids whose nodes (and trainers) are in
  const nodesIn = new Map();         // room id -> Map(node id -> entity)
  function spawnNode(room, n, zone) {
    const kd = P.nodeKind(n.k);
    if (!kd) return null;
    const t = P.tier(kd.tier);
    const e = room.spawn({ kind: 'object', type: 'node', name: kd.name, x: n.x, z: n.z, yaw: hash01('yaw' + n.id) * 6.283, team: 0,
      data: { key: 'node:' + n.id, r: G.reach, node: { prof: kd.prof, kind: kd.id, tier: kd.tier, minSkill: t.minSkill, look: { ...kd.look, v: n.v | 0 }, ...(n.s ? { starter: 1 } : {}) }, nodeId: n.id, zone } });
    let m = nodesIn.get(room.id); if (!m) { m = new Map(); nodesIn.set(room.id, m); }
    m.set(n.id, e);
    return e;
  }
  /** Put a room's nodes and trainers in, the first time anyone could see them. */
  function ensureNodes(room) {
    if (P) { wantEngine(room); wantTemper(); }            // Y13: the forge's rules are loaded at start, not on the first order
    if (!P || seen.has(room.id) || (room.kind !== 'wilds' && room.kind !== 'town')) return;
    seen.add(room.id);
    const pv = provOf(room);
    if (!pv) return;
    const ti = room.kind === 'town' ? pv.towns.indexOf(room) : -1, t = ti >= 0 ? pv.L.towns[ti] : null;
    let n = 0;
    if (nodeData && nodeData.zones) for (const [wid, list] of Object.entries(nodeData.zones)) {
      if (!(pv.L.zones || []).some(q => q.key === wid)) continue;
      for (const nd of list || []) {
        if (room.kind === 'town' && !(t && Math.hypot(nd.x - t.x, nd.z - t.z) < t.r + (G.townBorderM || 160))) continue;
        if (spawnNode(room, nd, wid)) n++;
      }
    }
    // the trainers this system places (the prospector by Torborhold's gate): in the town's room when they stand in a town
    for (const tr of content.trainers || []) {
      // already placed as a quest NPC (<zone>.quest.json, tools/content-hunts.mjs): then he only has to STAY — a town's
      // quest folk go to the inn at night, and a newcomer at midnight must still find the trainer by the gate
      const placed = [...room.objects.values()].find(x => x.data && x.data.key === 'npc:' + tr.id);
      if (placed) { placed.data = { ...placed.data, schedule: { blocks: [{ from: 0, at: { x: tr.x, z: tr.z, yaw: tr.yaw || 0 }, do: 'work' }], says: null } }; if (Math.hypot(placed.x - tr.x, placed.z - tr.z) > 0.5) placed.moveTo(tr.x, tr.z); continue; }
      const inTown = pv.L.towns.findIndex(q => Math.hypot(tr.x - q.x, tr.z - q.z) < q.r);
      if (room.kind === 'town' ? inTown !== ti : inTown >= 0) continue;
      if (!(pv.L.zones || []).some(q => q.key === tr.zone)) continue;
      room.spawn({ kind: 'npc', type: 'npc', name: tr.name, x: tr.x, z: tr.z, yaw: tr.yaw || 0, team: 1, state: STATE.friendly,
        data: { key: 'npc:' + tr.id, titled: true, title: tr.title || null,      // wrap-up (report #62): the plain title — no "— teaches mining"; the trade button in his dialog says what he teaches
          npc: { id: tr.id, role: tr.role, says: tr.greeting ? [tr.greeting] : [], quest: null, quests: [], teachOnTalk: true } } });
    }
    counters.profNodes = (counters.profNodes || 0) + n;
  }
  const spentUntil = (ch, key) => ((ch.opened || {})[key] || 0);
  /** The nearest node in reach this character could work right now (optionally of one profession). */
  function nodeNear(o, prof = null) {
    const e = o.entity, t = wallNow();
    let best = null, bd = Infinity;
    for (const x of o.room.host.near(e.x, e.z, G.reach + 1.5, q => q.kind === 'object' && q.type === 'node')) {
      const nd = x.data && x.data.node;
      if (!nd || (prof && nd.prof !== prof) || spentUntil(o.char, x.data.key) > t) continue;
      const d = Math.hypot(x.x - e.x, x.z - e.z);
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  }

  // ---- shared: starting and ending a piece of work ----
  function begin(o, w) {
    const e = o.entity;
    if (o.mount) dismount(o, 'work');
    if (e.sitting) endMeal(o, 'work');
    if (o.fishing) stopFishing(o, 'work');
    w.startedAt = now(); w.from = { x: e.x, z: e.z }; w.room = o.room;
    o.work = w; working.add(o);
    e.held = 'work';
    const anim = (P.def(w.prof) || {}).anim || 'interact';
    e.working = { prof: w.prof, anim, ...(w.target ? { node: w.target.id } : {}), ...(w.station ? { at: w.station.id } : {}) };
    e.infoVer++; e.busyUntil = 0; e.loop(anim);
    if (w.target) e.face(Math.atan2(w.target.x - e.x, w.target.z - e.z));
    else if (w.station) e.face(Math.atan2(w.station.x - e.x, w.station.z - e.z));
    o.room.emit({ type: 'fx', kind: w.kind, id: e.id, phase: 'start', prof: w.prof, x: e.x, z: e.z, ...(w.target ? { node: w.target.id } : {}), ...(w.station ? { at: w.station.id } : {}) });
  }
  /** End the work. `phase` = what everyone near sees ('done' | 'fail' | 'end'). `quiet` = send the worker nothing. */
  function stop(o, why = 'stopped', quiet = false, phase = 'end', quality = null) {
    const w = o.work;
    if (!w) return;
    o.work = null; working.delete(o);
    const e = o.entity;
    if (e) {
      if (e.held === 'work') e.held = null;
      if (e.working) { e.working = null; e.infoVer++; }
      if (!e.dead && !e.removed) { e.busyUntil = 0; e.loop('idle'); }
      if (o.room && !e.removed) o.room.emit({ type: 'fx', kind: w.kind, id: e.id, phase, prof: w.prof, x: e.x, z: e.z, ...(quality ? { quality } : {}), ...(w.target ? { node: w.target.id } : {}), ...(w.station ? { at: w.station.id } : {}) });
    }
    if (!quiet) reply(o, w.kind === 'gather' ? 'gatherR' : 'craftR', { ok: true, state: 'idle', why });
  }
  /** May they start anything at all? -> a refusal `{why, msg}` or null. */
  function blocked(o) {
    const e = o.entity;
    if (!P) return { why: 'notReady', msg: 'Nobody works a trade on this server yet.' };
    if (e.dead) return { why: 'dead', msg: 'You are dead.' };
    if (e.state & STATE.swimming) return { why: 'swim', msg: 'Not while swimming.' };
    if (e.airborne) return { why: 'busy', msg: 'Land first.' };
    if (e.state & STATE.combat) return { why: 'combat', msg: 'Not while fighting.' };      // (a hit also ends work under way: tick)
    if (e.held && e.held !== 'work') return { why: 'busy', msg: 'You are busy.' };
    return null;
  }
  /** Score what the client sent for the running game: `{ quality, score, marks, flags }` (a bad list = a failed game). */
  function judge(o, m) {
    const w = o.work;
    const chk = checkInputs(w.game, Array.isArray(m.inputs) ? m.inputs : [], { elapsedMs: now() - w.startedAt, graceMs: G.graceMs, lateMs: G.lateMs, minGapMs: G.minGapMs });
    if (!chk.ok) {
      counters.profBadInputs = (counters.profBadInputs || 0) + 1;
      log('professions: inputs refused', o.char.name, w.prof, chk.why);
      return { quality: 'fail', score: 0, marks: new Array(w.game.steps).fill(0), flags: ['inputs:' + chk.why], bad: chk.why };
    }
    const r = scoreGame(w.game, chk.inputs);
    return { ...r, quality: P.qualityOf(r.score) };
  }
  const gotRow = (it, n, bonus = false) => ({ id: it.id, name: it.name, n, kind: it.kind, icon: it.icon || null, tint: it.tint || null, rarity: it.rarity || 'normal', ...(bonus ? { bonus: true } : {}) });

  // ---- gathering ----
  const gatherRefuse = (o, why, msg, extra = {}) => reply(o, 'gatherR', { ok: false, state: 'idle', why, msg, ...extra });
  function gatherStart(o, m, onlyProf = null) {
    const e = o.entity, ch = o.char, room = o.room;
    const b = blocked(o);
    if (b) return gatherRefuse(o, b.why, b.msg);
    ensureNodes(room);
    if (o.work) stop(o, 'restart', true);
    let target = m.id != null ? room.entities.get(m.id) : nodeNear(o, onlyProf);
    if (!target || target.removed) return gatherRefuse(o, m.id != null ? 'unknown' : 'far', m.id != null ? 'That is gone.' : 'Nothing to gather in reach.');
    let node, key = null, skin = null;
    if (target.kind === 'object' && target.type === 'node' && target.data && target.data.node) {
      node = { ...P.nodeKind(target.data.node.kind), starter: !!target.data.node.starter };
      key = target.data.key;
      if (Math.hypot(target.x - e.x, target.z - e.z) > G.reach + 0.5) return gatherRefuse(o, 'far', 'Too far away.');
      if (spentUntil(ch, key) > wallNow()) return gatherRefuse(o, 'spent', 'You have already worked this one. It will be back in a few minutes.', { key, reopenMs: spentUntil(ch, key) - wallNow() });
    } else if (target.kind === 'monster' && target.dead) {
      skin = o.skins && o.skins.get(target.id);
      node = P.skinOf(target.type, target.level || 1);
      if (!node) return gatherRefuse(o, 'noHide', P.skinRefusal(target.type) || 'There is nothing on that to skin.');      // (report #26: say WHY)
      if (!skin || skin.ent !== target) return gatherRefuse(o, 'notYours', 'You can only skin a beast you helped kill.');
      if (Math.hypot(target.x - e.x, target.z - e.z) > (G.skinReach || 4) + 0.5) return gatherRefuse(o, 'far', 'Too far away.');
    } else return gatherRefuse(o, 'unknown', 'You cannot gather that.');
    const prof = node.prof, skill = levelOf(ch, prof), tool = P.bestTool(ch.bag, prof);
    const can = P.canGather({ known: knows(ch, prof), skill, node, tool });
    if (!can.ok) return gatherRefuse(o, can.why, can.text, can.need ? { need: can.need } : {});
    if ((ch.bag || []).length >= bagCap(o)) {
      // a full bag still takes what tops up a stack already in it
      const ids = (Array.isArray(node.gives) ? node.gives : [{ id: node.gives }]).map(g => g.id);
      if (!ids.every(id => (ch.bag || []).some(it => it.kind === 'material' && it.id === id && (it.count || 1) < 46))) return gatherRefuse(o, 'bagFull', 'Your bag is full.');
    }
    const seed = (room.host.random('prof') * 4294967296) >>> 0;
    const game = P.gatherGame({ prof, tier: node.tier, skill, tool, seed });
    begin(o, { kind: 'gather', prof, game, target, node, key, skin, tool, skill });
    counters.gatherStarts = (counters.gatherStarts || 0) + 1;
    reply(o, 'gatherR', { ok: true, state: 'play', id: target.id, prof, node: { kind: node.id || 'corpse', tier: node.tier, name: node.name }, game, ...(tool ? { tool: tool.id } : {}) });
  }
  function gatherDone(o, m) {
    const w = o.work, ch = o.char, e = o.entity;
    if (!w || w.kind !== 'gather') return gatherRefuse(o, 'idle', 'You are not gathering anything.');
    if (m.id != null && m.id !== w.target.id) return gatherRefuse(o, 'idle', 'That is not what you were working.');
    const r = judge(o, m);
    const base = { id: w.target.id, prof: w.prof, quality: r.quality, score: r.score, marks: r.marks, flags: r.flags, key: w.key || undefined };
    if (r.quality === 'fail') {
      const g = addXp(o, w.prof, P.xpFor({ tier: w.node.tier, quality: 'fail', skill: w.skill }));
      saved(o);
      stop(o, 'fail', true, 'fail', 'fail');
      counters.gatherFails = (counters.gatherFails || 0) + 1;
      return reply(o, 'gatherDone', { ...base, ok: false, items: [], got: [], xp: 0, skill: skillView(g), reopenMs: 0, msg: w.skin ? 'A botched cut. Try again.' : 'You got nothing out of it. It is still there: try again.' });
    }
    const rng = () => w.room.host.random('prof');
    const yields = P.gatherYield({ node: w.node, quality: r.quality, rng, tool: w.tool, extra: w.room.rules && w.room.rules.gatherBonus ? +w.room.rules.gatherBonus(o.entity) || 0 : 0 });      // (stream C, round 9: Forager's Covenant)
    const items = yields.map(y => P.item(y.id, y.n)).filter(Boolean);
    const got = yields.map(y => gotRow(P.item(y.id, 1), y.n, !!y.bonus));
    const xp = P.xpFor({ tier: w.node.tier, quality: r.quality, skill: w.skill });
    const g = addXp(o, w.prof, xp);
    let reopenMs = 0;
    if (w.key) {
      reopenMs = P.respawnMs(w.node, hash01(w.key + ':' + ch.id));
      ch.opened ||= {};
      ch.opened[w.key] = wallNow() + reopenMs;
      journal(o, 'opened', { key: w.key, until: ch.opened[w.key] });
    }
    if (w.skin) { o.skins.delete(w.target.id); reply(o, 'skinnable', { id: w.target.id, on: false }); }
    saved(o);
    stop(o, 'done', true, 'done', r.quality);
    const added = grant(o, { items, gold: 0, reason: 'gather' }) || [];
    counters.gathered = (counters.gathered || 0) + 1;
    counters['gather_' + w.prof] = (counters['gather_' + w.prof] || 0) + 1;
    reply(o, 'gatherDone', { ...base, ok: true, items: added, got, xp, skill: skillView(g), reopenMs,
      msg: `${P.qualityName(r.quality)} work: ${got.map(x => x.n + ' ' + x.name).join(', ')}.` });
    tell(o);
    for (const y of yields) if (!y.bonus) for (let k = 0; k < y.n; k++) questEvent(o, { kind: 'gather', prof: w.prof, mat: y.id, tier: w.node.tier, x: e.x, z: e.z });
  }
  function gather(o, m) {
    if (!GATHER_OPS.includes(m.op)) return 'op';
    if (m.op === 'start') return gatherStart(o, m);
    if (m.op === 'done') return gatherDone(o, m);
    if (o.work && o.work.kind === 'gather') stop(o, 'stopped'); else reply(o, 'gatherR', { ok: true, state: 'idle' });
  }

  // ---- skinning: what a kill leaves for a skinner ----
  function onKill(room, dead, who) {
    if (!P || !dead || !who || !who.length) return;
    const sk = P.skinOf(dead.type, dead.level || 1);
    if (!sk) {
      // report #26 ("why can't I skin barrow hounds"): a skinner is TOLD why a creature has no hide — once per kind of
      // monster per session in the log, and again whenever they put the knife to one (useItem below). People are obvious.
      const row = P.skinNone(dead.type), why = row && !row.person && row.why;
      if (!why) return;
      for (const o of who) {
        if (!o || !o.char || !knows(o.char, 'skinning')) continue;
        (o.noSkins ||= new Map()).set(dead.id, { ent: dead, at: now(), why });
        if (!(o.noSkinTold ||= new Set()).has(dead.type)) { o.noSkinTold.add(dead.type); reply(o, 'chat', { ch: 'system', from: 0, name: 'Skinning', text: `${dead.name || 'That'}: ${why}` }); }
      }
      return;
    }
    const t = P.tier(sk.tier);
    for (const o of who) {
      if (!o || !o.char || !knows(o.char, 'skinning')) continue;
      (o.skins ||= new Map()).set(dead.id, { ent: dead, at: now() });
      reply(o, 'skinnable', { id: dead.id, on: true, tier: sk.tier, minSkill: t.minSkill, name: sk.name });
    }
  }

  // ---- stations ----
  /** The work place in reach: `{ kinds: [prof ids], name, npc (entity id), ent, fire }` or null. `npcId` = the one the client means. */
  function stationNear(o, npcId = null) {
    const e = o.entity, R = K.stationM || 9;
    const kinds = new Set();
    let best = null, bd = Infinity, fire = false;
    for (const x of o.room.host.near(e.x, e.z, R, q => q.kind === 'object' || q.kind === 'npc')) {
      const d = Math.hypot(x.x - e.x, x.z - e.z);
      const role = x.data && x.data.npc && x.data.npc.role;
      const row = role ? P.roleOf(role) : null;
      const isF = isFire(x) && d <= (x.kind === 'npc' ? R : (K.fireM || 6));
      if (!(row && row.stations && row.stations.length && d <= R) && !isF) continue;
      if (row) for (const k of row.stations) kinds.add(k);
      if (isF) { kinds.add('cooking'); fire = true; }
      const pri = x.id === npcId ? -1 : d;
      if (pri < bd) { bd = pri; best = x; }
    }
    return best ? { kinds: [...kinds], name: best.name, npc: best.id, ent: best, fire } : null;
  }
  const plainCache = new Map();
  /** The list price of a plain item of a level (the crafting fee is a share of it). */
  function plainPrice(room, level) {
    if (plainCache.has(level)) return plainCache.get(level);
    let p = 0;
    try { const it = room.rules.makeItem ? room.rules.makeItem(null, { base: 'sword', rarity: 'normal', level }) : null; p = it && room.rules.price ? +room.rules.price(it) || 0 : 0; } catch { p = 0; }
    plainCache.set(level, p);
    return p;
  }
  const listPrice = (room, item) => { try { return room.rules.price ? +room.rules.price(item) || 0 : 0; } catch { return 0; } };

  // ---- making ----
  function temperRow(op, ch, st) {
    const row = P.temper.ops[op], skill = levelOf(ch, 'tempering');
    const stationOk = !!(st && st.kinds.includes('tempering'));
    const known = knows(ch, 'tempering');
    return { id: op, prof: 'tempering', tier: 1, skill: 1 + (row.skill || 0), name: row.name, desc: row.text, kind: 'temper', can: known && stationOk && skill >= 1 + (row.skill || 0),
      ...(!known ? { why: 'You have not learned Tempering.', code: 'notLearned' } : !stationOk ? { why: `You need ${P.N.stationNames.tempering}: ${P.N.stationHint.tempering}.`, code: 'station' } : skill < 1 + (row.skill || 0) ? { why: `Needs Tempering ${1 + (row.skill || 0)}.`, code: 'skill' } : {}),
      needs: [], gold: 0, makes: null, game: 'gauge', ...(row.elements ? { elements: row.elements } : {}),
      ...(op === 'temper_promote' && P.temper.legendary ? { legendary: { material: { id: P.temper.legendary.material, name: (P.material(P.temper.legendary.material) || {}).name || 'Sovereign Core' }, skill: P.temper.legendary.skill } } : {}) };
  }
  function craftList(o, m = {}) {
    const ch = o.char;
    if (!P) return reply(o, 'craftList', { ok: false, station: null, level: {}, recipes: [], why: 'notReady', msg: 'Nobody works a trade on this server yet.' });
    wantEngine(o.room); wantTemper();
    const st = stationNear(o, m.npc ?? null);
    const counts = P.countsOf(ch.bag);
    const level = Object.fromEntries(PROFESSIONS.map(id => [id, levelOf(ch, id)]));
    const kinds = st ? st.kinds : null;
    const rows = [];
    for (const rc of P.recipes) {
      if (kinds && !kinds.includes(rc.prof)) continue;
      if ((rc.tier || 1) > P.tierForSkill(level[rc.prof]).tier + 1) continue;       // two tiers past your skill is not shown yet
      const gl = rc.kind === 'gear' ? P.gearLevel(rc, ch.level || 1) : 1;
      rows.push(P.recipeView(rc, { known: knows(ch, rc.prof), skill: level[rc.prof], counts, gold: ch.gold || 0, plainPrice: rc.kind === 'gear' ? plainPrice(o.room, gl) : 0, station: kinds || [], level: ch.level || 1 }));
    }
    if (!kinds || kinds.includes('tempering')) for (const op of Object.keys(P.temper.ops || {})) rows.push(temperRow(op, ch, st));
    reply(o, 'craftList', { ok: true, station: st ? { kinds: st.kinds, name: st.name, npc: st.npc, ...(st.fire ? { fire: true } : {}) } : null, level, recipes: rows });
  }
  const craftRefuse = (o, id, why, msg, extra = {}) => reply(o, 'craftR', { ok: false, state: 'idle', id, why, msg, ...extra });
  /** Everything a tempering order needs, checked: `{ ok, item, cost, chk }` or `{ ok:false, why, text }`. */
  function temperOrder(o, m, st) {
    const ch = o.char;
    { const why = forgeWhy(o.room); if (why) return { ok: false, why: 'notReady', text: why }; }
    if (!P.temper.ops[m.id]) return { ok: false, why: 'recipe', text: 'No such work.' };
    if (!knows(ch, 'tempering')) return { ok: false, why: 'notLearned', text: 'You have not learned Tempering. A smith teaches it.' };
    if (!st || !st.kinds.includes('tempering')) return { ok: false, why: 'station', text: `You need ${P.N.stationNames.tempering}: ${P.N.stationHint.tempering}.` };
    const item = (ch.bag || []).find(i => i.uid === m.uid);
    if (!item) return { ok: false, why: 'item', text: 'That item is not in your bag. (Take it off first if you are wearing it.)' };
    if (tradeHolds(ch.id, item.uid)) return { ok: false, why: 'item', text: 'That item is in your trade window.' };
    const skill = levelOf(ch, 'tempering');
    const chk = temperKit.temperCheck(P, engine, m.id, item, { index: m.index | 0, element: m.element || null, skill });
    if (!chk.ok) return { ok: false, why: chk.why, text: chk.text, need: chk.need };
    const cost = temperKit.temperCost(P, engine, m.id, item, listPrice(o.room, item));
    const counts = P.countsOf(ch.bag);
    const needs = cost.needs.map(nd => ({ id: nd.id, name: (P.material(nd.id) || {}).name || nd.id, n: nd.n, have: counts[nd.id] || 0, ...(nd.kept ? { kept: true } : {}) }));
    const out = { item, cost: { ...cost, needs }, chk, skill };
    if (skill < cost.skill) return { ...out, ok: false, why: 'skill', need: cost.skill, text: `This item needs Tempering ${cost.skill}. Yours is ${skill}.` };
    const short = needs.find(nd => nd.have < nd.n);
    if (short) return { ...out, ok: false, why: 'needs', text: `You need ${short.n} ${short.name} (you have ${short.have}).` };
    if ((ch.gold || 0) < cost.gold) return { ...out, ok: false, why: 'gold', text: `That costs ${cost.gold} gold.` };
    return { ...out, ok: true };
  }
  function craftQuote(o, m) {
    if (!P) return reply(o, 'craftQuote', { ok: false, id: m.id, uid: m.uid, can: false, why: 'Nobody works a trade on this server yet.' });
    const st = stationNear(o, m.npc ?? null);
    const q = temperOrder(o, m, st);
    reply(o, 'craftQuote', { ok: true, id: m.id, uid: m.uid, can: !!q.ok, ...(q.ok ? {} : { why: q.text, code: q.why }), needs: q.cost ? q.cost.needs : [], gold: q.cost ? q.cost.gold : 0, skill: q.cost ? q.cost.skill : undefined, ...(q.chk && q.chk.to ? { to: q.chk.to } : {}), text: q.chk && q.chk.ok ? q.chk.text : (q.text || '') });
  }
  function craftStart(o, m) {
    const ch = o.char, room = o.room;
    const b = blocked(o);
    if (b) return craftRefuse(o, m.id, b.why, b.msg);
    if (o.work) stop(o, 'restart', true);
    const st = stationNear(o, m.npc ?? null);
    const seed = (room.host.random('prof') * 4294967296) >>> 0;
    if (P.temper.ops[m.id]) {
      const q = temperOrder(o, m, st);
      if (!q.ok) return craftRefuse(o, m.id, q.why, q.text, q.need ? { need: q.need } : {});
      const game = P.gameFor('tempering', { skill: q.skill, need: q.cost.skill, seed });
      begin(o, { kind: 'craft', prof: 'tempering', game, station: st.ent, temper: { op: m.id, uid: m.uid, index: m.index | 0, element: m.element || null }, skill: q.skill, tier: q.cost.tier });
      return reply(o, 'craftR', { ok: true, state: 'play', id: m.id, uid: m.uid, game, cost: { needs: q.cost.needs, gold: q.cost.gold }, text: q.chk.text });
    }
    const rc = P.recipe(m.id);
    if (!rc) return craftRefuse(o, m.id, 'recipe', 'No such recipe.');
    const skill = levelOf(ch, rc.prof);
    const n = rc.kind === 'gear' || rc.kind === 'tool' ? 1 : Math.max(1, Math.min(K.batchMax || 10, m.n | 0 || 1));
    const fee = P.feeOf(rc, rc.kind === 'gear' ? plainPrice(room, P.gearLevel(rc, ch.level || 1)) : 0) * n;
    const needs = (rc.needs || []).map(nd => ({ ...nd, n: nd.n * n }));
    const can = P.canCraft({ ...rc, needs }, { known: knows(ch, rc.prof), skill, counts: P.countsOf(ch.bag), gold: ch.gold || 0, fee, station: st ? st.kinds : [], level: ch.level || 1, base: m.base || null });
    if (!can.ok) return craftRefuse(o, m.id, can.why, can.text, can.need ? { need: can.need } : {});
    if ((rc.kind === 'gear' || rc.kind === 'tool') && (ch.bag || []).length >= bagCap(o)) return craftRefuse(o, m.id, 'bagFull', 'Your bag is full.');
    if (rc.kind === 'gear') wantEngine(room);
    const game = P.craftGame(rc, { skill, seed });
    begin(o, { kind: 'craft', prof: rc.prof, game, station: st.ent, rc, n, fee, needs, base: m.base || null, skill });
    counters.craftStarts = (counters.craftStarts || 0) + 1;
    reply(o, 'craftR', { ok: true, state: 'play', id: rc.id, game, n, cost: { needs: needs.map(nd => ({ id: nd.id, name: (P.material(nd.id) || {}).name || nd.id, n: nd.n })), gold: fee } });
  }
  /** Take materials out of the bag (cheapest bookkeeping: one `bag` message). Returns false and takes nothing when short. */
  function takeMats(o, needs) {
    const ch = o.char, bag = ch.bag || [];
    const counts = P.countsOf(bag);
    for (const nd of needs) if ((counts[nd.id] || 0) < nd.n) return false;
    // plan first (the smallest stacks first, so loose ends are used up); nothing changes unless everything is there
    const plan = [];
    for (const nd of needs) {
      let left = nd.n;
      const stacks = bag.filter(it => it && it.kind === 'material' && it.id === nd.id && !tradeHolds(ch.id, it.uid)).sort((x, y) => (x.count || 1) - (y.count || 1));
      for (const st of stacks) { if (!left) break; const k = Math.min(left, Math.max(1, st.count | 0 || 1)); left -= k; plan.push([st, k]); }
      if (left) return false;
    }
    const changed = new Set(), gone = [];
    for (const [st, k] of plan) { if (k >= (st.count | 0 || 1)) gone.push(st); else { st.count = (st.count | 0) - k; changed.add(st); } }
    ch.bag = bag.filter(it => !gone.includes(it));
    for (const it of gone) { journal(o, 'bagDel', { uid: it.uid }); changed.delete(it); }
    for (const it of changed) { journal(o, 'bagDel', { uid: it.uid }); journal(o, 'bagAdd', { item: it }); }
    o.dirty = true;
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: [...changed], remove: [...gone, ...changed].map(it => it.uid), gold: ch.gold });
    return true;
  }
  function craftDone(o, m) {
    const w = o.work, ch = o.char, e = o.entity, room = o.room;
    if (!w || w.kind !== 'craft') return craftRefuse(o, m.id, 'idle', 'You are not making anything.');
    const r = judge(o, m);
    const rng = () => room.host.random('prof');
    const id = w.temper ? w.temper.op : w.rc.id;
    const base = { id, prof: w.prof, quality: r.quality, score: r.score, marks: r.marks, flags: r.flags };
    const again = () => craftList(o, { npc: w.station ? w.station.id : null });
    // ---- tempering: a miss spends the materials, never the item ----
    if (w.temper) {
      const st = stationNear(o, w.station ? w.station.id : null);
      const q = temperOrder(o, { id: w.temper.op, uid: w.temper.uid, index: w.temper.index, element: w.temper.element }, st);
      if (!q.ok) { stop(o, 'fail', true, 'fail'); reply(o, 'craftDone', { ...base, ok: false, quality: 'fail', items: [], got: [], xp: 0, msg: q.text }); return again(); }
      const miss0 = r.quality === 'fail' || r.marks[0] === 0;
      const kept = miss0 ? q.cost.needs.filter(nd => nd.kept) : [];      // X5: a Sovereign Core is not lost on a miss
      if (!takeMats(o, q.cost.needs.filter(nd => !(miss0 && nd.kept)))) { stop(o, 'fail', true, 'fail'); reply(o, 'craftDone', { ...base, ok: false, quality: 'fail', items: [], got: [], xp: 0, msg: 'The materials are no longer in your bag.' }); return again(); }
      if (q.cost.gold) spend(o, q.cost.gold, 'temper');
      const miss = r.quality === 'fail' || r.marks[0] === 0;
      const xp = P.xpFor({ tier: w.tier, quality: miss ? 'poor' : r.quality, skill: w.skill, kind: 'craft' });
      const g = addXp(o, 'tempering', xp);
      let res = { ok: false, text: (r.flags.includes('over') ? 'Too far: the work is spoiled.' : 'Not far enough: the work did not take.') + (kept.length ? ' The other materials are gone; the Sovereign Core and the item are unharmed.' : ' The materials are gone; the item is unharmed.') };
      if (!miss) {
        res = temperKit.temperApply(P, engine, w.temper.op, q.item, { index: w.temper.index, element: w.temper.element, rng, quality: r.quality, skill: w.skill });
        if (res.ok) {
          journal(o, 'bagDel', { uid: q.item.uid }); journal(o, 'bagAdd', { item: q.item });
          if (o.conn) o.conn.sendJSON({ t: 'bag', add: [q.item], remove: [q.item.uid], gold: ch.gold });
          stateOf(ch).made[w.temper.op] = (stateOf(ch).made[w.temper.op] || 0) + 1;
          questEvent(o, { kind: 'craft', prof: 'tempering', recipe: w.temper.op, x: e.x, z: e.z });
        }
      }
      saved(o);
      stop(o, res.ok ? 'done' : 'fail', true, res.ok ? 'done' : 'fail', r.quality);
      counters.tempered = (counters.tempered || 0) + (res.ok ? 1 : 0);
      reply(o, 'craftDone', { ...base, ok: !!res.ok, items: [], got: [], item: res.ok ? q.item : undefined, was: res.was, now: res.now, ...(res.to ? { to: res.to } : {}), ...(kept.length ? { kept: kept.map(nd => nd.id) } : {}), xp, skill: skillView(g), msg: res.text });
      tell(o);
      return again();
    }
    // ---- recipes ----
    const rc = w.rc;
    if (r.quality === 'fail') {
      stop(o, 'fail', true, 'fail', 'fail');
      counters.craftFails = (counters.craftFails || 0) + 1;
      reply(o, 'craftDone', { ...base, ok: false, items: [], got: [], xp: 0, skill: skillView(P.gain({ xp: stateOf(ch).xp[rc.prof] || 0 }, 0)), msg: 'Botched. Nothing was used up: try again.' });
      return again();
    }
    const st = stationNear(o, w.station ? w.station.id : null);
    const can = P.canCraft({ ...rc, needs: w.needs }, { known: knows(ch, rc.prof), skill: levelOf(ch, rc.prof), counts: P.countsOf(ch.bag), gold: ch.gold || 0, fee: w.fee, station: st ? st.kinds : [], level: ch.level || 1, base: w.base });
    if (!can.ok || !takeMats(o, w.needs)) { stop(o, 'fail', true, 'fail'); reply(o, 'craftDone', { ...base, ok: false, quality: 'fail', items: [], got: [], xp: 0, msg: can.ok ? 'The materials are no longer in your bag.' : can.text }); return again(); }
    if (w.fee) spend(o, w.fee, 'craft');
    const items = [], got = [];
    for (let k = 0; k < w.n; k++) {
      const res = P.craftResult(rc, { quality: r.quality, skill: w.skill, level: ch.level || 1, base: w.base, rng, bonus: k === 0 });
      if (res.gear) {
        let it = null;
        try { it = room.rules.makeItem ? room.rules.makeItem(e, { base: res.gear.base, rarity: res.gear.rarity, level: res.gear.level }) : null; } catch (err) { log('professions: makeItem failed', err && err.message); }
        if (it) {
          if (res.gear.extraAffix && engine && temperKit && !it.pack) { const a = temperKit.freshAffix(engine, it, rng); if (a) { it.affixes.push(a); it.fineWork = true; } }
          it.crafted = true; it.maker = ch.name;
          items.push(it); got.push({ id: it.baseKey, name: it.name, n: 1, kind: 'gear', rarity: it.rarity, slot: it.slot });
        }
      } else for (const it of res.items) {
        if (it.kind === 'potion' && potionText) { try { const t = potionText(it, o); if (t) { it.desc = t.desc; if (t.restore) it.restore = t.restore; } } catch { /* the plain text stays */ } }
        const same = it.tool ? null : items.find(x => x.kind === it.kind && x.id === it.id && !x.tool);
        if (same) { same.count = (same.count || 1) + (it.count || 1); got.find(x => x.id === it.id).n += it.count || 1; }
        else { items.push(it); got.push(gotRow(it, it.count || 1)); }
      }
    }
    if (!items.length) { log('professions: recipe made nothing', rc.id); }
    const xp = P.xpFor({ tier: rc.tier || 1, quality: r.quality, skill: w.skill, kind: rc.refine ? 'refine' : 'craft', mult: w.n });
    const g = addXp(o, rc.prof, xp);
    const s = stateOf(ch);
    s.made[rc.id] = (s.made[rc.id] || 0) + w.n;
    saved(o);
    stop(o, 'done', true, 'done', r.quality);
    const added = grant(o, { items, gold: 0, reason: 'craft' }) || [];
    counters.crafted = (counters.crafted || 0) + w.n;
    counters['craft_' + rc.prof] = (counters['craft_' + rc.prof] || 0) + w.n;
    reply(o, 'craftDone', { ...base, ok: true, items: added, got, xp, skill: skillView(g), msg: `${P.qualityName(r.quality)} work: ${got.map(x => (x.n > 1 ? x.n + ' x ' : '') + x.name).join(', ')}.` });
    tell(o);
    for (let k = 0; k < w.n; k++) questEvent(o, { kind: 'craft', prof: rc.prof, recipe: rc.id, makes: rc.makes ? rc.makes.id : rc.pattern || null, x: e.x, z: e.z });
    again();
  }
  function craft(o, m) {
    const op = m.op || 'list';
    if (!CRAFT_OPS.includes(op)) return 'op';
    if (op === 'list') return craftList(o, m);
    if (op === 'quote') return craftQuote(o, m);
    if (!P) return craftRefuse(o, m.id, 'notReady', 'Nobody works a trade on this server yet.');
    if (op === 'start') return craftStart(o, m);
    if (op === 'done') return craftDone(o, m);
    if (o.work && o.work.kind === 'craft') stop(o, 'stopped'); else reply(o, 'craftR', { ok: true, state: 'idle' });
  }

  // ---- trainers ----
  function teach(o, id, quiet = false) {
    const ch = o.char, d = P.def(id), s = stateOf(ch);
    let toolIt = null;
    if (!s.known.includes(id) && !d.start) s.known.push(id);
    const tid = (content.starterTools || {})[id];
    if (tid && !s.tools[id] && !(ch.bag || []).some(it => P.isTool(it, id))) {
      s.tools[id] = 1;
      const made = P.toolItem(tid);
      toolIt = made ? (grant(o, { items: [made], gold: 0, reason: 'trainer' }) || [])[0] || null : null;
    }
    saved(o);
    counters.profLearned = (counters.profLearned || 0) + 1;
    if (!quiet) reply(o, 'chat', { ch: 'system', from: 0, name: d.name, text: `You have learned ${d.name}.${toolIt ? ' ' + toolIt.name + ' is in your bag: it takes no slot.' : ''} ${d.blurb || ''}`.trim() });
    tell(o); wantSheet(o);
    questEvent(o, { kind: 'learn', prof: id, x: o.entity.x, z: o.entity.z });
    return toolIt;
  }
  function trainerAt(o, npcId) {
    const r = o.room.objectNear(o.entity, npcId, 6);
    if (r.why) return { why: r.why };
    const role = r.o.data && r.o.data.npc && r.o.data.npc.role;
    const row = role ? P.roleOf(role) : null;
    return row ? { npc: r.o, row } : { why: 'unknown' };
  }
  function prof(o, m) {
    if (!PROF_OPS.includes(m.op)) return 'op';
    const R = x => reply(o, 'profR', { op: m.op, id: m.id, ...x });
    if (!P) return R({ ok: false, why: 'notReady', msg: 'Nobody teaches a trade on this server yet.' });
    const d = P.def(m.id);
    if (!d) return R({ ok: false, why: 'unknown', msg: 'No such profession.' });
    const t = trainerAt(o, m.npc);
    if (t.why) return R({ ok: false, why: t.why, msg: t.why === 'far' ? 'Too far away.' : 'They do not teach that.' });
    if (!(t.row.trains || []).includes(m.id)) return R({ ok: false, why: 'unknown', msg: 'They do not teach that.' });
    const ch = o.char;
    if (m.op === 'learn') {
      if (knows(ch, m.id) && (d.start || stateOf(ch).tools[m.id] || !(content.starterTools || {})[m.id])) return R({ ok: false, why: 'known', msg: `You already know ${d.name}.` });
      const toolIt = teach(o, m.id);
      return R({ ok: true, ...(toolIt ? { tool: toolIt } : {}), msg: `You have learned ${d.name}.` });
    }
    // 'tool': the basic tool again, for gold
    const tid = (content.starterTools || {})[m.id];
    if (!tid) return R({ ok: false, why: 'unknown', msg: 'That trade needs no tool.' });
    if (!knows(ch, m.id)) return R({ ok: false, why: 'notLearned', msg: `Learn ${d.name} first.` });
    if ((ch.bag || []).some(it => P.isTool(it, m.id))) return R({ ok: false, why: 'known', msg: 'You already have one.' });
    const price = P.N.toolPrice || 12;
    if ((ch.gold || 0) < price) return R({ ok: false, why: 'gold', msg: `That costs ${price} gold.` });
    if ((ch.bag || []).length >= bagCap(o)) return R({ ok: false, why: 'bagFull', msg: 'Your bag is full.' });
    spend(o, price, 'tool');
    const toolIt = (grant(o, { items: [P.toolItem(tid)], gold: 0, reason: 'trainer' }) || [])[0] || null;
    tell(o);
    R({ ok: true, tool: toolIt, gold: price });
  }
  /** What an NPC's `used` reply gains: `{ prof: { trains, stations, known, price } }` (and a trainer placed by this system teaches on the first word). */
  function npcExtra(o, obj, { taught: taughtElsewhere = null } = {}) {
    if (!P || !obj || !obj.data || !obj.data.npc) return {};
    const row = P.roleOf(obj.data.npc.role);
    if (!row) return {};
    const ch = o.char;
    // wrap-up (report #56): the angler is a trainer like the others. Angling used to be filtered out of `trains`, which left
    // his list empty and the client with no trade button to show. It is taught by the province's own `use` (Y15, with the
    // rod) — passed in as `taughtElsewhere` — and "known" for it is the angling record's `learned`, not the `start` flag.
    let taught = taughtElsewhere && taughtElsewhere.length ? taughtElsewhere.filter(id => (row.trains || []).includes(id)) : null;
    if (taught && !taught.length) taught = null;
    if (taught) tell(o);                                   // the Professions list's Angling row turns to "known" at once
    const has = id => (id === 'angling' ? anglingView(ch).learned !== false : knows(ch, id));
    if (obj.data.npc.teachOnTalk || trainerIds.has(obj.data.npc.id)) for (const id of row.trains || []) if (!knows(ch, id)) { teach(o, id); (taught ||= []).push(id); }
    return { prof: { trains: (row.trains || []).slice(), stations: row.stations || [], known: (row.trains || []).filter(has), toolPrice: P.N.toolPrice || 12, ...(taught ? { taught } : {}) } };
  }
  /** A gathering tool used from the bag = start on the nearest node of its trade. Returns true when `item` was a tool. */
  function useItem(o, item, idx, R) {
    if (!P || !P.isTool(item)) return false;
    const pr = item.use.prof;
    if (pr === 'skinning') {
      const e = o.entity;
      let best = null, bd = (G.skinReach || 4) + 0.5;
      if (o.skins) for (const [id, s] of o.skins) { if (s.ent.removed) continue; const d = Math.hypot(s.ent.x - e.x, s.ent.z - e.z); if (d <= bd) { bd = d; best = id; } }
      R({ ok: true, id: item.id, gather: true });
      let none = null;      // (a fresh kill in reach that has no hide: say why, not "nothing in reach")
      if (best == null && o.noSkins) for (const s of o.noSkins.values()) if (!s.ent.removed && Math.hypot(s.ent.x - e.x, s.ent.z - e.z) <= (G.skinReach || 4) + 0.5) none = s;
      if (best == null) gatherRefuse(o, none ? 'noHide' : 'far', none ? none.why : 'Nothing to skin in reach. Stand by a beast you killed.'); else gatherStart(o, { id: best });
      return true;
    }
    R({ ok: true, id: item.id, gather: true });
    gatherStart(o, {}, pr);
    return true;
  }
  /**
   * X5 (round 9): a Sovereign Core — only from a world boss (each credited player rolls) and from a WON event of the
   * province's top levels. Returns the bag item to add to that player's share, or null.
   */
  function eventDrop(o, { worldBoss = false, level = 1, rng = Math.random } = {}) {
    const LG = P && P.temper.legendary;
    if (!LG || !o || !o.char) return null;
    const chance = worldBoss ? LG.chance.worldBoss : level >= (LG.topEventLevel || 99) ? LG.chance.topEvent : 0;
    if (!(chance > 0) || rng() >= chance) return null;
    counters.sovereignCores = (counters.sovereignCores || 0) + 1;
    reply(o, 'chat', { ch: 'system', from: 0, name: 'Tempering', text: 'A Sovereign Core! A master temperer can promote a rare item to legendary with it.' });
    return P.item(LG.material, 1);
  }
  /** Quest events pass through here too: the old `cook` (fish at a fire) teaches cooking. */
  function onEvent(o, ev) {
    if (!P || !ev || ev.kind !== 'cook' || ev.prof) return;
    addXp(o, 'cooking', P.xpFor({ tier: 1, quality: 'good', skill: levelOf(o.char, 'cooking'), kind: 'craft' }));
    saved(o); tell(o);
  }

  /** Every tick: work whose worker moved, was hit, swims, died, left or ran out of time ends (nothing is lost). */
  function tick() {
    if (!working.size) return;
    const t = now();
    for (const o of [...working]) {
      const w = o.work, e = o.entity;
      if (!w) { working.delete(o); continue; }
      const why = !e || e.removed || o.room !== w.room ? 'left' : e.dead ? 'dead' : (e.state & STATE.swimming) ? 'swim' : (o.lastHitAt || 0) > w.startedAt ? 'hit'
        : Math.hypot(e.x - w.from.x, e.z - w.from.z) > (G.driftM || 2) ? 'moved' : !o.conn ? 'left' : (w.target && w.target.removed) ? 'gone'
          : t > w.startedAt + w.game.ms + (G.lateMs || 4000) + 1000 ? 'timeout' : null;
      if (why) stop(o, why);
    }
  }
  /** How much longer (ms) a dead beast must lie because a skinner with credit has not been to it yet (0 = let it go). */
  function keepBody(e) {
    if (!P || !e || e.kind !== 'monster' || !e.dead) return 0;
    const t = now();
    for (const o of online.values()) { const s = o.skins && o.skins.get(e.id); if (s && s.ent === e && t - s.at < (G.skinKeepMs || 60000)) return 5000; }
    return 0;
  }
  /** 1 Hz housekeeping: forget corpses that are gone. */
  function sweep() {
    for (const o of online.values()) {
      if (o.noSkins && o.noSkins.size) { const t = now(); for (const [id, s] of o.noSkins) if (s.ent.removed || t - s.at > (G.skinKeepMs || 60000)) o.noSkins.delete(id); }
      if (!o.skins || !o.skins.size) continue;
      const t = now();
      for (const [id, s] of o.skins) if (s.ent.removed || t - s.at > (G.skinKeepMs || 60000) || (s.ent.room && o.room !== s.ent.room)) { o.skins.delete(id); reply(o, 'skinnable', { id, on: false }); }
    }
  }

  return { P, prof, gather, craft, tick, sweep, keepBody, stop, view, ensureNodes, npcExtra, forgeWhy, useItem, onKill, onEvent, eventDrop, teach, stationNear, nodeNear, nodesIn, working, knows, levelOf, stateOf,
    get engine() { return engine; }, setEngine(e) { engine = e; }, ready: () => !!P };
}
