// CPU Fairgoers (Expansion 1, M1): computer players that sit in empty seats. Server side only.
//
//   CPUS                 game id -> that game's CPU module (js/games/<id>/cpu.js), found by trying every game folder
//   hasCpu(id)           can this minigame be played with CPUs seated? (it has a cpu.js and its meta does not say cpu: false)
//   makeCpuMember(...)   a member record for the room: a name, a look, a costume, a skill; no socket, no token
//   createCpuDriver(...) runs the seated CPUs through one minigame, one 50 ms tick at a time (the room and the tests
//                        both use it, so a test plays exactly what a room plays)
//   boardMove(...)       what a CPU presses on the board right now (roll, crossroads, live events), at a human pace
//   simulateGame(...)    a whole minigame headless: players are CPUs at given skills (the balance test and
//                        tools/cpu-bench.mjs use it)
// The kit the per-game CPUs are written with is js/games/cpu-kit.js. Pure: seeded rng in, inputs out.
import { GAMES } from '../games/index.js';
import { skillOf, SKILL_IDS, gauss } from '../games/cpu-kit.js';
import { strikePower } from '../shared/board-rules.js';
import { makeRng, hashStr } from '../shared/rng.js';
import { DT } from '../shared/arena.js';

// ---------------------------------------------------------------- the CPU modules
async function load(id) {
  try { return await import(`../games/${id}/cpu.js`); }
  catch (e) { if (e?.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes(`/${id}/cpu.js`)) return null; throw e; }
}
const loaded = await Promise.all(Object.keys(GAMES).map(async id => [id, await load(id)]));
export const CPUS = Object.freeze(Object.fromEntries(loaded.filter(([, m]) => m && typeof m.createCpu === 'function')));
export const hasCpu = id => !!CPUS[id] && GAMES[id]?.meta.cpu !== false;
export { SKILL_IDS };

// ---------------------------------------------------------------- who they are
/** The fairgoers' names (original, fair-themed; 14 characters at most like a player's). */
export const CPU_NAMES = Object.freeze(['Biscuit', 'Pickles', 'Marzipan', 'Noodle', 'Gumdrop', 'Barnaby', 'Clementine', 'Waffles', 'Tater', 'Popcorn Pete', 'Jellyroll', 'Rosie', 'Sprocket', 'Muffin', 'Pip Wobbleton', 'Fizzwick', 'Hazel', 'Dumpling', 'Taffy', 'Bramble']);
const RACES = ['human', 'elf', 'dwarf', 'halfling'];
/**
 * A CPU member for the room. `taken` = names already in the room (no two Biscuits); `costumes` = the costume ids that
 * may be worn right now (in season). Draws from the room's rng, so a room's CPUs come from its seed.
 */
export function makeCpuMember({ pid, seat, skill, rng, taken = [], costumes = [] }) {
  const free = CPU_NAMES.filter(n => !taken.includes(n)), name = free.length ? free[Math.floor(rng() * free.length)] : 'Fairgoer ' + (seat + 1);
  const seed = Math.floor(rng() * 2 ** 31), costume = costumes.length && rng() < 0.85 ? costumes[Math.floor(rng() * costumes.length)] : 'cos_none';
  return { pid, token: null, cpu: { skill: skillOf(skill).id }, name, look: { v: 1, race: RACES[seed % RACES.length], seed }, costume, send: null, connected: true, goneAt: null, ready: true, display: false, seat, queue: [], lastIn: null, starve: 0, ack: 0, skip: false };
}

// ---------------------------------------------------------------- minigames
/**
 * Drives the CPUs through one minigame. `inst` = the game instance, `players` = [{ pid, seat, name }] (everyone in it),
 * `cpus` = Map(pid -> skill id). Per tick: `before(t)` -> Map(pid -> arena input) (ui taps go straight to inst.act),
 * then the game steps, then `after(g, events)` with the state and events everyone was just sent.
 * A CPU that throws is benched for the rest of the game (logged once) — a broken CPU must never stop a room.
 */
export function createCpuDriver({ id, inst, players, cpus, seed = 1, difficulty = 'normal', log = () => {} }) {
  const mod = CPUS[id], meta = GAMES[id]?.meta, list = [];
  if (!mod || !meta) return { before: () => new Map(), after: () => {}, size: 0 };
  const init = inst.init();
  for (const [pid, skill] of cpus) {
    const p = players.find(x => x.pid === pid); if (!p) continue;
    const rng = makeRng((seed ^ hashStr(id + ':' + pid)) >>> 0);
    let brain = null;
    try { brain = mod.createCpu({ pid, seat: p.seat, players, meta, init, skill: skillOf(skill), rng, difficulty }); } catch (e) { log('cpu.error', { game: id, at: 'create', msg: String(e?.message || e).slice(0, 200) }); }
    if (brain) list.push({ pid, brain, events: [], g: null, ok: true });
  }
  let t0 = null;
  function before(now, alive = () => true) {
    if (t0 == null) t0 = now;
    const out = new Map(), t = (now - t0) / 1000;
    for (const c of list) {
      if (!c.ok || !alive(c.pid)) continue;
      const act = (a, d) => { if (typeof a !== 'string') return; inst.act?.(c.pid, a, d != null && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : d); };
      const v = { t, dt: DT, g: c.g, priv: inst.priv ? inst.priv(c.pid) : null, init, me: inst.bodies?.get(c.pid) || null, bodies: inst.bodies || null, events: c.events, act };
      try {
        const inp = c.brain.tick(v);
        if (meta.kind === 'arena') out.set(c.pid, inp && typeof inp === 'object' ? { mx: clampU(inp.mx), mz: clampU(inp.mz), b: (inp.b | 0) & 3 } : { mx: 0, mz: 0, b: 0 });
      } catch (e) { c.ok = false; log('cpu.error', { game: id, at: 'tick', msg: String(e?.message || e).slice(0, 200) }); if (meta.kind === 'arena') out.set(c.pid, { mx: 0, mz: 0, b: 0 }); }
      c.events = [];
    }
    return out;
  }
  function after(g, events = []) {
    for (const c of list) { c.g = g; for (const ev of events) if (ev.to == null || ev.to === c.pid) c.events.push(ev); }
  }
  return { before, after, size: list.length };
}
const clampU = x => (Number.isFinite(+x) ? Math.max(-1, Math.min(1, +x)) : 0);

/**
 * A whole minigame with no room: `seats` = [{ skill }] (one per player; skill id). -> { result, pids, ok } where ok is
 * false if it never ended. The same driver a room uses; the clock stops at meta.seconds + the room's 3 s grace.
 */
export function simulateGame({ id, seats, seed = 1, difficulty = 'normal', season = null, extra = {}, log = () => {} }) {
  const def = GAMES[id], rng = makeRng(seed);
  const players = seats.map((s, i) => ({ pid: 101 + i, seat: i, name: 'P' + (i + 1) }));
  const inst = def.create({ seed: Math.floor(rng() * 2 ** 31), rng: rng.fork(), players, difficulty, season, teams: false, rivals: true, ...extra });
  const cpus = new Map(seats.map((s, i) => [players[i].pid, s.skill]));
  const driver = createCpuDriver({ id, inst, players, cpus, seed: Math.floor(rng() * 2 ** 31), difficulty, log });
  const steps = Math.ceil((def.meta.seconds + 3) / DT), arena = def.meta.kind === 'arena';
  let k = 0;
  for (; k < steps && !inst.over; k++) {
    const inp = driver.before(k * DT * 1000);
    if (arena) for (const p of players) inst.input(p.pid, inp.get(p.pid) || null);
    inst.step(DT);
    const ev = inst.events ? inst.events.splice(0) : [];
    driver.after(inst.state(), ev);
  }
  return { result: inst.result(), pids: players.map(p => p.pid), steps: k, ended: !!inst.over };
}

// ---------------------------------------------------------------- the board
/**
 * What a CPU does on the board right now: null (nothing yet) or a room message ({ t: 'roll' } / { t: 'card', i } /
 * { t: 'choose', i }). It waits like a person (a moment to "look" before rolling, a reaction before a timed tap), and
 * it only uses what a phone is shown — the shell game's answer comes from watching, which is a skill roll.
 */
export function boardMove(board, pid, now, skill, rng, mem) {
  const S = board.S, sk = skillOf(skill), E = S.ev;
  const wait = (key, s) => { if (mem.key !== key) { mem.key = key; mem.at = now + s * 1000; } return now >= mem.at; };
  if (S.sub === 'roll' && S.pid === pid) {
    if (!wait('roll:' + S.turn + ':' + S.since + ':' + (S.used ? 1 : 0), 0.9 + rng() * 0.9)) return null;
    const h = S.items?.[pid] || [];
    if (!S.used && h.length && rng() < 0.4 + sk.q * 0.5) {                     // play a prize card first, sometimes
      const k = h.findIndex(id => id !== 'trap' || (S.traps[S.pos[pid]] == null && board.byId.get(S.pos[pid])?.type !== 'start'));
      if (k >= 0) { mem.key = null; return { t: 'choose', i: k }; }
    }
    if (S.hands?.[pid]) { const hand = S.hands[pid]; if (!hand.length || rng() < 0.15) return { t: 'card', i: -1 }; let bi = 0; hand.forEach((n, i) => { if (n > hand[bi]) bi = i; }); return { t: 'card', i: rng() < sk.best ? bi : Math.floor(rng() * hand.length) }; }
    return { t: 'roll' };
  }
  if (S.sub === 'ask' && S.pid === pid && S.ask) {
    if (!wait('ask:' + S.since, 1 + rng() * 1.2)) return null;
    if (S.ask.kind === 'fork') {
      const opts = S.ask.options.map((_, i) => i).filter(i => !(S.ask.cost?.[i]) || S.tickets[pid] >= S.ask.cost[i]);
      const paid = opts.find(i => S.ask.cost?.[i]);                     // the toll road is usually the shortcut
      return { t: 'choose', i: paid != null && rng() < sk.q ? paid : opts[Math.floor(rng() * opts.length)] ?? 0 };
    }
    return { t: 'choose', i: Math.floor(rng() * S.ask.options.length) };
  }
  if (S.sub !== 'event' || !E || !E.pids.includes(pid) || pid in E.inp || E.stage === 'settle' || E.stage === 'shuffle') return null;
  const el = now - E.t0;
  switch (E.kind) {
    case 'duel': return wait('duel:' + E.t0, 0.5 + rng() * 1.2) ? { t: 'choose', i: 0 } : null;
    case 'striker': {                                                   // tap near the top of the bar, as well as you can
      if (mem.key !== 'strike:' + E.t0) { mem.key = 'strike:' + E.t0; const P = E.pub.period, peak = P / 2 + P * Math.floor(1 + rng() * 2); mem.at = E.t0 + Math.max(300, peak + gauss(rng) * sk.tapMs * 1.6); }
      return now >= mem.at ? { t: 'choose', i: Math.min(el, E.ms - 50) } : null;
    }
    case 'wheel': return wait('wheel:' + E.t0, 0.8 + rng() * 2) ? { t: 'choose', i: el } : null;
    case 'shell': {
      if (!wait('shell:' + E.t0 + ':' + E.stage, 0.6 + rng() * 1)) return null;
      if (E.stage === 'hide') return { t: 'choose', i: Math.floor(rng() * 3) };
      const watched = rng() < 0.3 + sk.q * 0.55;                        // followed the cups (everyone saw the shuffle)
      return { t: 'choose', i: watched && E.hid?.end != null ? E.hid.end : Math.floor(rng() * 3) };
    }
    case 'pact': return wait('pact:' + E.t0, 1 + rng() * 2) ? { t: 'choose', i: rng() < 0.65 ? 0 : 1 } : null;
    case 'crowd': {
      if (!wait('crowd:' + E.t0, 1 + rng() * 2)) return null;
      const opts = E.pub.options.map((p, i) => [p, i]).filter(([p]) => p !== pid);
      if (!opts.length) return null;
      const lead = opts.slice().sort((a, b) => (S.ribbons[b[0]] * 10 + S.tickets[b[0]]) - (S.ribbons[a[0]] * 10 + S.tickets[a[0]]))[0];
      return { t: 'choose', i: rng() < sk.q ? lead[1] : opts[Math.floor(rng() * opts.length)][1] };
    }
    case 'fortune': return wait('fortune:' + E.t0, 0.8 + rng() * 1.5) ? { t: 'choose', i: Math.floor(rng() * 3) } : null;
  }
  return null;
}
export { strikePower };
