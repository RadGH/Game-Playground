// Story Night (Expansion 1, M8): the story grammar and the party's memory. Pure — no clock, no sockets, no Math.random
// (the rng comes in), so tests/story.test.js can run thousands of stories in a second. js/sim/story-run.js puts it on
// the room's clock (cards, timers, votes, CPUs, minigames).
//
// The design doc's RPG one-shot, scaled to a party game:
//   opening hook -> beats (a scene card: the leader picks for the party, or everyone votes; most choices lead into a
//   minigame ENCOUNTER whose winner / loser shapes what happens next) -> interludes (a quick choice, no minigame)
//   -> a climax (a co-op boss or a final minigame) -> an epilogue that says who did what.
// Everything that happens is remembered as a MEMORY ({ who, deed, tags }). A later card may call one back ("After Mabel
// outran the clockwork guard, …") — only a memory that really was recorded earlier in THIS story, with the name as it
// was then (safeName: no braces, 16 characters). Choices set FLAGS; later events, choices and lines need or avoid them.
//
// Data (data/story/, loaded by the server; schema in the README "Story Night"):
//   index.json  { arcs: [ids] }       common.json  { recall, interludes, titles, party }       arcs/<id>.json  one arc
import { render, safeName, cap } from './story-text.js';

/** The arcs, in the order the lobby lists them (tests/story.test.js checks this against data/story/index.json). */
export const STORY_ARCS = Object.freeze(['runaway-carousel', 'hall-of-mirrors', 'lost-prize-pony', 'balloon-getaway', 'midnight-big-top']);
export const STORY = Object.freeze({
  MIN_BEATS: 3, MAX_BEATS: 5, DEF_BEATS: 4,
  /** A card holds at most this many lines (a phone is the main screen). */
  MAX_LINES: 3,
  /** The chance a beat card with no matching callback gets a general one ("After Mabel …, …"), when there is a memory. */
  RECALL_CHANCE: 0.6,
});

/** Where the beats, interludes and the climax go, for n beats. */
export function planFor(n) {
  n = Math.max(STORY.MIN_BEATS, Math.min(STORY.MAX_BEATS, n | 0));
  const acts = n === 3 ? [1, 2, 3] : n === 4 ? [1, 2, 2, 3] : [1, 2, 2, 3, 3];
  const plan = [{ slot: 'hook' }];
  acts.forEach((act, i) => { plan.push({ slot: 'beat', act, beat: i + 1 }); if ((n === 3 && i === 1) || (n > 3 && (i === 0 || i === n - 2))) plan.push({ slot: 'interlude' }); });
  plan.push({ slot: 'climax' }, { slot: 'end' });
  return plan;
}

const weighted = (list, rng) => { const tot = list.reduce((a, e) => a + (e.weight ?? 1), 0); let r = rng() * tot; for (const e of list) { r -= e.weight ?? 1; if (r < 0) return e; } return list[list.length - 1]; };

/**
 * One story. `players()` = the seated players now, [{ pid, name, cpu }]. `award(pid, n, why)` pays story stars (the
 * runner adds them to the match points). `rng` = the room's seeded random numbers.
 */
export function createStory({ data, arcId = null, beats = STORY.DEF_BEATS, rng, players, award = () => {} }) {
  const ids = (data.index?.arcs || Object.keys(data.arcs)).filter(id => data.arcs[id]);
  const arc = data.arcs[arcId && data.arcs[arcId] ? arcId : ids[Math.floor(rng() * ids.length)]];
  const common = data.common || {};
  const cast = Object.fromEntries(Object.entries(arc.cast || {}).map(([k, list]) => [k, list[Math.floor(rng() * list.length)]]));
  const plan = planFor(beats);
  const flags = new Set(), used = new Set(), memory = [], log = [], queue = [];
  const stats = {};                     // pid -> { stars, led, wins, lasts, moods: { bold: n, … } }
  const st = pid => (stats[pid] ||= { stars: 0, led: 0, wins: 0, lasts: 0, moods: {}, deeds: [] });
  let at = 0, cardNo = 0, pending = null, lead = null, nextLead = null, climaxWon = null, chapter = 0, rot = Math.floor(rng() * 4);
  const beatCount = plan.filter(p => p.slot === 'beat').length;

  const who = () => players();
  const nameOf = pid => safeName(who().find(p => p.pid === pid)?.name ?? memoryName(pid));
  const memoryName = pid => { for (const m of memory) { const i = m.pids.indexOf(pid); if (i >= 0 && m.pids.length === 1) return m.name; } return 'Someone'; };
  const okFlags = e => (e.requires || []).every(f => flags.has(f)) && !(e.not || []).some(f => flags.has(f));
  const pay = (pid, n, why) => { if (!n || pid == null) return; st(pid).stars += n; award(pid, n, why); };
  /** The leader of the next event: the winner/loser a minigame named, else the next person round the table (people first). */
  function pickLead() {
    const all = who(); if (!all.length) return null;
    if (nextLead != null && all.some(p => p.pid === nextLead)) { const l = nextLead; nextLead = null; return l; }
    nextLead = null;
    const pool = all.some(p => !p.cpu) ? all.filter(p => !p.cpu) : all;
    return pool[(rot++) % pool.length].pid;
  }
  const vals = (extra = {}) => ({ ...cast, hero: lead != null ? nameOf(lead) : null, ...extra });
  /** A title or a button label: one line, cast names filled in. */
  const one = t => (t ? render(t, vals(), rng)[0] || '' : '');

  /** A callback line for this event, from a memory that really happened (or null). */
  function recall(ev, general) {
    const rec = [];
    for (const cb of ev.callbacks || []) {
      const m = [...memory].reverse().find(x => x.tags.some(t => (cb.tags || []).includes(t)) && x.recalled < 2);
      if (m) { const l = render(cb.text, vals({ who: m.name, deed: m.deed }), rng); if (l.length) { m.recalled++; rec.push(m.id); return { line: l[0], ids: rec }; } }
    }
    if (!general || !memory.length || !(common.recall || []).length || rng() >= STORY.RECALL_CHANCE) return null;
    const fresh = memory.filter(m => m.recalled === 0), list = fresh.length ? fresh : memory.filter(m => m.recalled < 2);
    if (!list.length) return null;
    const m = list[Math.floor(rng() * list.length)];
    const l = render({ any: common.recall }, vals({ who: m.name, deed: m.deed }), rng);
    if (!l.length) return null;
    m.recalled++;
    return { line: l[0], ids: [m.id] };
  }
  /** Remember a deed. pids [] = the whole party. */
  function remember(pids, deed, kind, evId) {
    if (!deed?.text) return null;
    const all = who().map(p => p.pid);
    const party = !pids.length || (pids.length > 2 && pids.length >= all.length);
    const name = party ? (common.party || 'the whole party') : pids.map(p => nameOf(p)).join(' and ');
    const text = render(deed.text, { ...cast }, rng)[0];          // a deed may name the cast ("caught {prize}"), never a player
    if (!text) return null;
    const m = { id: 'm' + memory.length, at: cardNo, event: evId, pids: party ? [] : [...pids], name, deed: text.charAt(0).toLowerCase() + text.slice(1), tags: deed.tags || [], kind, recalled: 0 };
    memory.push(m);
    for (const p of m.pids) st(p).deeds.push(m.deed);
    if (party) for (const p of all) st(p).deeds.push(m.deed);
    return m;
  }
  function card(c) {
    const lines = c.lines.slice(0, STORY.MAX_LINES);
    const out = { n: ++cardNo, chapter, chapters: beatCount + 2, arc: arc.id, arcTitle: arc.title, icon: arc.icon || '★', kind: c.kind, title: c.title || '', lines, lead,
      ...(c.choices ? { choices: c.choices, who: c.who } : {}), ...(c.stars ? { stars: c.stars } : {}), ...(c.game ? { game: true } : {}), ...(c.end ? { end: c.end } : {}) };
    log.push({ n: out.n, kind: c.kind, event: c.event, lines, recall: c.recall || [], choices: c.choices?.map(x => x.label) });
    return out;
  }

  // ---------------------------------------------------------------- events
  function pickEvent(slot) {
    let pool;
    if (slot.slot === 'hook') pool = arc.hooks;
    else if (slot.slot === 'climax') pool = arc.climax;
    else if (slot.slot === 'interlude') pool = [...(arc.interludes || []), ...(common.interludes || [])];
    else pool = arc.beats;
    const fresh = pool.filter(e => !used.has(e.id) && okFlags(e));
    let list = slot.slot === 'beat' ? fresh.filter(e => (e.act ?? 2) === slot.act) : fresh;
    if (!list.length && slot.slot === 'beat') list = fresh;                     // nothing for this act: any beat that fits
    if (!list.length) list = pool.filter(e => okFlags(e));                      // every one used: allow a repeat
    if (!list.length) list = pool;
    const e = weighted(list, rng); used.add(e.id); return e;
  }
  function startEvent(slot) {
    if (slot.slot === 'beat' || slot.slot === 'climax' || slot.slot === 'hook') chapter++;
    const ev = pickEvent(slot);
    lead = pickLead();
    if (lead != null && slot.slot !== 'hook') st(lead).led++;
    const rc = slot.slot === 'hook' ? null : recall(ev, slot.slot !== 'interlude');
    const extra = (ev.extra || []).filter(okFlags).flatMap(x => render(x.text, vals(), rng)).slice(0, 1);
    const text = render(ev.text, vals(), rng);
    const room = STORY.MAX_LINES - (rc ? 1 : 0) - extra.length;
    const lines = [...(rc ? [rc.line] : []), ...text.slice(0, Math.max(1, room)), ...extra].slice(0, STORY.MAX_LINES);
    const choices = (ev.choices || []).filter(okFlags);
    const kind = slot.slot;
    if (choices.length) {
      pending = { t: 'choice', ev, slot, choices };
      return card({ kind: 'scene', event: ev.id, title: one(ev.title), lines, recall: rc?.ids, who: ev.who || 'active', choices: choices.map(c => ({ label: one(c.label), ...(c.mood ? { mood: c.mood } : {}) })) });
    }
    // no choice: the event is read, then its encounter (if any)
    if (ev.game) { if (ev.game.intro) lines.push(...render(ev.game.intro, vals(), rng)); queue.push({ t: 'game', hook: ev.game, ev, slot }); }
    if (kind === 'climax' && !ev.game) climaxWon = true;
    return card({ kind: 'say', event: ev.id, title: one(ev.title), lines: lines.slice(0, STORY.MAX_LINES), recall: rc?.ids, game: !!ev.game });
  }

  /** Resolve the pending choice: i = the option picked; voters = who picked it (a vote), else the leader chose. */
  function choose(i, { voters = null } = {}) {
    if (!pending || pending.t !== 'choice') return false;
    const { ev, slot, choices } = pending; pending = null;
    const c = choices[Math.max(0, Math.min(choices.length - 1, i | 0))];
    const by = voters?.length ? voters : lead != null ? [lead] : [];
    for (const f of c.flags || []) flags.add(f);
    for (const f of c.unflags || []) flags.delete(f);
    const stars = {};
    if (c.stars) for (const p of by) { pay(p, c.stars, 'choice'); stars[p] = (stars[p] || 0) + c.stars; }
    if (c.party) for (const p of who()) { pay(p.pid, c.party, 'party'); stars[p.pid] = (stars[p.pid] || 0) + c.party; }
    if (c.mood) for (const p of by) st(p).moods[c.mood] = (st(p).moods[c.mood] || 0) + 1;
    const m = remember(c.deed?.party ? [] : by, c.deed, 'choice', ev.id);
    const deedVals = m ? { who: m.name, deed: m.deed } : {};
    const lines = render(c.text, vals(deedVals), rng);
    const game = c.game || ev.game;
    if (game?.intro) lines.push(...render(game.intro, vals(), rng));
    if (game) queue.push({ t: 'game', hook: game, ev, slot });
    else if (slot.slot === 'climax') climaxWon = true;
    log.push({ chose: c.label, by, event: ev.id });
    return card({ kind: 'say', event: ev.id, title: one(c.label), lines: lines.slice(0, STORY.MAX_LINES), stars: Object.keys(stars).length ? stars : null, game: !!game });
  }

  /**
   * A minigame finished: res = the game's result(). Competitive: the WIN branch with the winner (and a line about the
   * last place, when there is a different one); co-op: WIN or LOSE for everyone.
   */
  function gameResult(res, played = null) {
    if (!pending || pending.t !== 'game') return false;
    const { hook, ev, slot } = pending; pending = null;
    const inGame = new Set(played || who().map(p => p.pid));
    const groups = (res?.order || []).map(g => g.filter(p => inGame.has(p))).filter(g => g.length);
    let branch, winner = null, loser = null, success = true;
    if (res?.coop) { success = !!res.coop.success; branch = success ? hook.win : hook.lose || hook.win; }
    else {
      const top = groups[0] || [...inGame].slice(0, 1);
      winner = top.length ? top[Math.floor(rng() * top.length)] : null;
      const last = groups.length > 1 ? groups[groups.length - 1] : [];
      loser = last.length ? last[Math.floor(rng() * last.length)] : null;
      if (loser === winner) loser = null;
      branch = hook.win;
    }
    if (winner != null) st(winner).wins++;
    if (loser != null) st(loser).lasts++;
    const stars = {};
    const give = (p, n) => { if (!n || p == null) return; pay(p, n, 'encounter'); stars[p] = (stars[p] || 0) + n; };
    if (res?.coop) { if (branch?.stars) for (const p of inGame) give(p, branch.stars); }
    else give(winner, branch?.stars || 0);
    for (const f of branch?.flags || []) flags.add(f);
    const v = { winner: winner != null ? nameOf(winner) : null, loser: loser != null ? nameOf(loser) : null };
    const m = remember(res?.coop || branch?.deed?.party ? [] : winner != null ? [winner] : [], branch?.deed, res?.coop ? (success ? 'win' : 'lose') : 'win', ev.id);
    let lines = render(branch?.text, vals({ ...v, hero: v.winner ?? vals().hero, ...(m ? { who: m.name, deed: m.deed } : {}) }), rng);
    // the last place gets a (kind, silly) line of their own, and is remembered for it
    if (!res?.coop && loser != null && hook.lose) {
      const lm = remember([loser], hook.lose.deed, 'last', ev.id);
      lines = [...lines, ...render(hook.lose.text, vals({ ...v, ...(lm ? { who: lm.name, deed: lm.deed } : {}) }), rng)];
    }
    if (!lines.length) lines = render({ any: (res?.coop && !success ? common.fallback?.lose : common.fallback?.win) || ['On you go!'] }, vals(), rng);   // e.g. a co-op game on a competitive encounter
    if (hook.lead === 'winner' && winner != null) nextLead = winner;
    if (hook.lead === 'loser' && loser != null) nextLead = loser;
    if (slot.slot === 'climax') climaxWon = res?.coop ? success : true;
    log.push({ game: true, event: ev.id, winner, loser, success });
    return card({ kind: 'say', event: ev.id, title: res?.coop ? (success ? 'You did it!' : 'Not this time…') : v.winner ? `${v.winner} wins!` : 'Done!', lines: lines.slice(0, STORY.MAX_LINES), stars: Object.keys(stars).length ? stars : null });
  }

  /** The closing card: how it ended, then who did what, a hero and a title for everyone. */
  function epilogue(points = {}) {
    const won = climaxWon !== false;
    const ep = arc.epilogue || {};
    const lines = render(won ? ep.win : ep.lose || ep.win, vals(), rng);
    for (const x of ep.lines || []) if (okFlags(x)) lines.push(...render(x.text, vals(), rng));
    const people = who();
    const score = p => (points[p.pid] ?? st(p.pid).stars);
    const ranked = [...people].sort((a, b) => score(b) - score(a) || st(b.pid).deeds.length - st(a.pid).deeds.length || a.pid - b.pid);
    const titles = assignTitles(ranked, common.titles || [], pid => st(pid), people.length);
    const rows = ranked.map(p => ({ pid: p.pid, name: nameOf(p.pid), stars: score(p), title: titles[p.pid]?.title || '', why: titles[p.pid]?.text || '', deeds: [...new Set(st(p.pid).deeds)].slice(-3) }));
    const hero = ranked.length > 1 && score(ranked[0]) > score(ranked[1]) ? ranked[0].pid : ranked.length === 1 ? ranked[0].pid : null;
    return { arc: arc.id, arcTitle: arc.title, icon: arc.icon || '★', won, lines: lines.slice(0, STORY.MAX_LINES), hero, rows };
  }

  // ---------------------------------------------------------------- stepping
  /** The next thing to show: { t: 'card', card } | { t: 'game', hook } | { t: 'end' }. Call choose/gameResult as asked. */
  function next() {
    if (pending) return pending.t === 'choice' ? { t: 'wait' } : { t: 'game', hook: pending.hook, wait: true };
    if (queue.length) { const q = queue.shift(); if (q.t === 'game') { pending = q; return { t: 'game', hook: q.hook, lead }; } return q; }
    if (at >= plan.length) return { t: 'end' };
    const slot = plan[at++];
    if (slot.slot === 'end') { at = plan.length; return { t: 'end' }; }
    return { t: 'card', card: startEvent(slot) };
  }

  return {
    arc, cast, flags, memory, log, stats, plan,
    next, choose, gameResult, epilogue,
    get pending() { return pending; }, get lead() { return lead; }, get chapter() { return chapter; }, get chapters() { return beatCount + 2; },
    get cardNo() { return cardNo; }, get won() { return climaxWon; },
    /** How many slots are left (for the time estimate). */
    get slotsLeft() { return plan.slice(at).filter(p => p.slot !== 'end'); },
  };
}

/**
 * A fun title for everyone: the hero (most stars) first, then each player the title whose stat they lead (and is above
 * zero), else a friendly fallback. Never two players with the same title.
 * titles: [{ id, title, text, stat }] — stat: 'stars' | 'led' | 'wins' | 'lasts' | 'deeds' | 'mood:<m>' | 'fallback'.
 */
export function assignTitles(ranked, titles, statsOf, n) {
  const out = {}, taken = new Set();
  const val = (pid, stat) => { const s = statsOf(pid); if (stat === 'stars') return s.stars; if (stat === 'deeds') return s.deeds.length; if (stat.startsWith('mood:')) return s.moods[stat.slice(5)] || 0; return s[stat] || 0; };
  const real = titles.filter(t => t.stat !== 'fallback'), fall = titles.filter(t => t.stat === 'fallback');
  for (const p of ranked) {
    let best = null, bestV = 0;
    for (const t of real) {
      if (taken.has(t.id)) continue;
      const v = val(p.pid, t.stat);
      if (v <= 0) continue;
      if (n > 1 && ranked.some(q => q.pid !== p.pid && val(q.pid, t.stat) > v)) continue;     // they must lead it
      if (!best || v > bestV) { best = t; bestV = v; }
    }
    if (!best) best = fall.find(t => !taken.has(t.id)) || null;
    if (best) { taken.add(best.id); out[p.pid] = best; }
  }
  return out;
}
export { cap };
