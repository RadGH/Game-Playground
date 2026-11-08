// KITCHEN CATASTROPHE — co-op. A fair food stall in a rush. Orders (lemonade, a corn dog, candy floss…) come in at the
// serving hatch with a patience timer each; the team builds the OLDEST order on the one shared tray at the hatch, a
// part at a time, in the order the recipe says. Eight stations round the kitchen each hand out one ingredient, and
// every station belongs to one player (its colour mat + shape tag): only its owner can take from it. So a corn dog
// (sausage -> batter -> mustard) usually needs two or three people, and they have to queue up at the tray in turn.
//
//   A at your station      take its ingredient (you carry one thing at a time; taking again swaps it)
//   A at the tray          add what you carry. The right next step goes on; a part that is not next yet is handed
//                          back to you ("Not yet!") and the order loses a little patience — the tray is never wiped
//   an order runs out      the customer stomps off (the tray is cleared if it was the front order)
// Only the FRONT order's patience runs at full speed; the ones queued behind it wait at a third of the speed (you
// cannot work on them yet). Fill RULES.target orders before the bell (75 s) to win together. Each player's score =
// parts they put on the tray.
//
// Chef Crumb (a computer cook, id 'cpu') works the kitchen with you when you play alone — the stations are dealt
// between you and him, so it is still a team game — and takes over the counters of anyone who drops out (no input
// for RULES.awayS seconds), handing them back when they return. Before Expansion 1 (M4) a dropped player's counters
// were locked for good, which made every order needing them impossible ("buggy"), and one wrong part wiped the tray.
import { makeBody, stepBody, separate, F, DT as DT_IN } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'kitchen-catastrophe', title: 'Kitchen Catastrophe', blurb: 'Grab your ingredients and build every order on the tray, in the right order!',
  how: ['Counters with a ★ are yours: stand on the mat, press A to grab.', 'Bring it to the TRAY and press A when it is NEXT on the order card.', 'Fill enough orders together before the bell!'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'coop', unit: 'items', tags: ['coop', 'action'], card: 'card-kitchen-catastrophe', css: true, rival: true,
  controls: { stick: true, a: 'Grab / Add' }, move: { speed: 5.6, accel: 30, carryMul: 0.92 },
  arena: { shape: 'rect', hw: 7, hd: 5, wall: true }, pitch: 60,
};

export const ITEMS = [
  { id: 'cup', name: 'Cup' }, { id: 'lemon', name: 'Lemon' }, { id: 'ice', name: 'Ice' }, { id: 'sausage', name: 'Sausage' },
  { id: 'batter', name: 'Batter' }, { id: 'mustard', name: 'Mustard' }, { id: 'cone', name: 'Cone' }, { id: 'floss', name: 'Floss' },
];
const I = Object.fromEntries(ITEMS.map((it, i) => [it.id, i]));
/** Recipes: the parts in the order they go on the tray. `tier` 0 = short (offered from the start), 1 = later. */
export const RECIPES = [
  { name: 'Lemonade', steps: ['cup', 'lemon', 'ice'], tier: 0 },
  { name: 'Corn Dog', steps: ['sausage', 'batter', 'mustard'], tier: 0 },
  { name: 'Candy Floss', steps: ['cone', 'floss'], tier: 0 },
  { name: 'Hot Dog', steps: ['sausage', 'mustard'], tier: 0 },
  { name: 'Fizzy Floss', steps: ['cup', 'ice', 'floss'], tier: 1 },
  { name: 'Sour Floss', steps: ['cone', 'floss', 'lemon'], tier: 1 },
  { name: 'Snack Combo', steps: ['sausage', 'batter', 'cup', 'lemon'], tier: 1 },
  { name: 'Party Platter', steps: ['cone', 'floss', 'sausage', 'mustard'], tier: 1 },
].map(r => ({ ...r, steps: r.steps.map(s => I[s]) }));

export const RULES = {
  target: { 1: 6, 2: 7, 3: 8, 4: 9 }, diff: { easy: -2, normal: 0, hard: 2 },   // round 5: one dish easier than the bot-tuned numbers, for real families
  // M2 bug (2026-11-07): an all-Family CPU team filled the target at every difficulty. Easy keeps `diff`; Normal and
  // Tricky add dishes by team size (index = players - 1), measured with tools/cpu-bench.mjs so a Normal team usually
  // wins and a Family team usually does not (tests/coop-difficulty.test.js).
  diffBySize: { normal: [7, 4, 5, 6], hard: [9, 5, 6, 7] },
  maxOpen: 3, gap: 7, patience: 16, perStep: 5, soloPatience: 1.35, spoilCost: 2, tier1At: 18, queueRate: 0.35,
  reach: 1.35, trayReach: 1.6,
  awayS: 3,                                   // no input this long = dropped out: Chef Crumb takes over your counters
  cpu: { easy: { speed: 0.7, think: 0.6 }, normal: { speed: 0.85, think: 0.4 }, hard: { speed: 1, think: 0.2 } },
};
export const CPU = 'cpu', CPU_NAME = 'Chef Crumb';
// The kitchen. Stations stand round the walls (the camera looks from +z, so "front" is the bottom of the screen);
// each has a counter block and a spot in front of it where you stand to use it. The hatch with the tray is at the back.
export const TRAY = { x: 0, z: -4.4, hw: 1.5, hd: 0.55, use: { x: 0, z: -3.35 } };
export const STATIONS = [
  { x: -4.3, z: -4.5, face: [0, 1] }, { x: 4.3, z: -4.5, face: [0, 1] },
  { x: -6.5, z: -1.6, face: [1, 0] }, { x: 6.5, z: -1.6, face: [-1, 0] },
  { x: -6.5, z: 1.8, face: [1, 0] }, { x: 6.5, z: 1.8, face: [-1, 0] },
  { x: -2.6, z: 4.5, face: [0, -1] }, { x: 2.6, z: 4.5, face: [0, -1] },
].map(s => ({ ...s, use: { x: +(s.x + s.face[0] * 1.15).toFixed(2), z: +(s.z + s.face[1] * 1.15).toFixed(2) } }));
const ARENA = {
  ...meta.arena,
  blocks: [{ x: TRAY.x, z: TRAY.z, hw: TRAY.hw, hd: TRAY.hd }, ...STATIONS.map(s => ({ x: s.x, z: s.z, hw: s.face[0] ? 0.5 : 0.75, hd: s.face[0] ? 0.75 : 0.5 }))],
};
const r2 = v => Math.round(v * 100) / 100;

/** Who owns which station: ingredients dealt round the players from a shuffled order, so a recipe crosses owners. */
export function dealStations(rng, pids) {
  const items = rng.shuffle(ITEMS.map((_, i) => i)), spots = rng.shuffle(STATIONS.map((_, i) => i));
  return spots.map((spot, k) => ({ spot, item: items[k], own: pids[k % pids.length] })).sort((a, b) => a.spot - b.spot);
}

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const S = RULES, n = players.length, pids = players.map(p => p.pid), events = [];
  const target = Math.max(2, (S.target[n] ?? S.target[4]) + (S.diffBySize[difficulty]?.[Math.min(4, n) - 1] ?? S.diff[difficulty] ?? 0));
  const solo = n === 1, crumb = solo && rivals !== false, stations = dealStations(rng, crumb ? [...pids, CPU] : pids);   // "Rival when alone" off: every counter is yours
  const home = Object.fromEntries(stations.map(s => [s.spot, s.own]));        // who each counter was dealt to
  const bodies = new Map(), P = new Map();
  const cpuSkill = S.cpu[difficulty] ?? S.cpu.normal;
  const cpu = { body: makeBody(2.2, 1.2, Math.PI), hold: -1, added: 0, think: 0, on: crumb };
  const cpuMove = { ...meta.move, speed: meta.move.speed * cpuSkill.speed };
  const away = new Map(pids.map(p => [p, 0]));
  players.forEach((p, i) => {
    const b = makeBody(r2((i - (n - 1) / 2) * 1.6), 1.2, Math.PI);
    bodies.set(p.pid, b); P.set(p.pid, { hold: -1, prevB: 0, added: 0, spoiled: 0 });
  });
  let ownKey = '';
  /** Counters of players who are away go to Chef Crumb; they come back when the player does. */
  function reown() {
    let any = false;
    for (const s of stations) {
      const h = home[s.spot], gone = h !== CPU && away.get(h) >= S.awayS;
      if (gone) s.own = CPU; else if (s.own === CPU && h !== CPU) s.own = h;
      if (s.own === CPU) any = true;
    }
    cpu.on = any;
    const k = stations.map(s => s.own).join(','); if (k !== ownKey) { if (ownKey) events.push({ e: 'own', own: stations.map(s => s.own) }); ownKey = k; }
  }
  let time = meta.seconds, t = 0, over = false, served = 0, lost = 0, spoils = 0, oid = 0, nextOrder = 0, success = false;
  let orders = [], tray = [];
  const patienceFor = r => (S.patience + S.perStep * r.steps.length) * (n === 1 ? S.soloPatience : 1);
  function newOrder() {
    const pool = RECIPES.filter(r => r.tier === 0 || t >= S.tier1At), last = orders[orders.length - 1];
    let r = rng.pick(pool); if (last && r === RECIPES[last.r] && pool.length > 1) r = rng.pick(pool.filter(x => x !== r));
    const p = patienceFor(r);
    orders.push({ id: ++oid, r: RECIPES.indexOf(r), left: p, max: p });
    events.push({ e: 'order', id: oid, r: RECIPES.indexOf(r) });
  }
  const near = (b, u, d) => Math.hypot(b.x - u.x, b.z - u.z) <= d;
  function use(pid) {
    const b = pid === CPU ? cpu.body : bodies.get(pid), st = pid === CPU ? cpu : P.get(pid);
    if (st.hold >= 0 && near(b, TRAY.use, S.trayReach)) {
      const o = orders[0]; if (!o) { events.push({ e: 'wait', to: pid }); return; }
      const rec = RECIPES[o.r], item = st.hold; st.hold = -1; b.flags &= ~F.CARRY;
      if (rec.steps[tray.length] === item) {
        tray.push(item); st.added++;
        events.push({ e: 'add', pid, item, n: tray.length });
        if (tray.length === rec.steps.length) {
          served++; events.push({ e: 'serve', id: o.id, r: o.r, n: served }); orders.shift(); tray = [];
          if (served >= target) finish(true);
        }
      } else {         // not next yet: handed back (the tray is kept), the customer frowns a little
        spoils++; if (st.spoiled != null) st.spoiled++; o.left = Math.max(0.5, o.left - S.spoilCost);
        st.hold = item; b.flags |= F.CARRY;
        events.push({ e: 'spoil', pid, item, want: rec.steps[tray.length], had: tray.length });
      }
      return;
    }
    let best = null, bd = 1e9;
    for (const s of stations) { const u = STATIONS[s.spot].use, d = Math.hypot(b.x - u.x, b.z - u.z); if (d <= S.reach && d < bd) { bd = d; best = s; } }
    if (!best) return;
    if (best.own !== pid) { events.push({ e: 'nope', to: pid, spot: best.spot, own: best.own }); return; }
    if (st.hold === best.item) return;
    st.hold = best.item; b.flags |= F.CARRY;
    events.push({ e: 'grab', pid, item: best.item, spot: best.spot });
  }
  function finish(ok) {
    if (over) return; over = true; success = ok; time = Math.max(0, time);
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0, served });
  }
  const near2 = (b, u) => Math.hypot(b.x - u.x, b.z - u.z);
  const toward = (b, x, z) => { const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz); return d < 0.2 ? { mx: 0, mz: 0 } : { mx: dx / d, mz: dz / d }; };
  /** Chef Crumb's turn: fetch the earliest part of the front order that is his and nobody carries, bring it to the
   *  tray when it is next, wait beside the tray otherwise. He thinks every `think` seconds (slower on easy). */
  function cpuStep(dt) {
    const b = cpu.body, o = orders[0], rec = o ? RECIPES[o.r] : null, rest = rec ? rec.steps.slice(tray.length) : [];
    const need = rest.length ? rest[0] : -1, wait = { x: TRAY.use.x + 2.3, z: TRAY.use.z + 1.2 };
    let goal = wait, act = null;
    if (cpu.hold >= 0 && cpu.hold === need) { goal = TRAY.use; act = 'tray'; }
    else if (cpu.hold >= 0 && rest.includes(cpu.hold)) goal = wait;
    else {
      const held = new Set([...P.values()].map(st => st.hold).filter(h => h >= 0));
      const want = rest.find(it => !held.has(it) && stations.find(s => s.item === it).own === CPU);
      if (want !== undefined) { const s = stations.find(x => x.item === want); goal = STATIONS[s.spot].use; act = 'grab'; }
    }
    stepBody(b, toward(b, goal.x, goal.z), cpuMove, ARENA);
    cpu.think -= dt;
    if (act && cpu.think <= 0 && near2(b, goal) < (act === 'tray' ? 1.2 : 0.9)) { cpu.think = cpuSkill.think; use(CPU); }
  }
  return {
    bodies, events,
    init: () => ({ arena: ARENA, target, stations, tray: TRAY, spots: STATIONS, cpu: CPU_NAME }),
    input(pid, inp) {
      const b = bodies.get(pid), st = P.get(pid); if (!b || over) return;
      away.set(pid, inp ? 0 : away.get(pid) + DT_IN);
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(st.prevB & IN.A); st.prevB = bits;
      stepBody(b, inp, meta.move, ARENA);
      if (pa) use(pid);
    },
    step(dt) {
      if (over) return;
      t += dt; time -= dt;
      reown();
      if (cpu.on) cpuStep(dt); else if (cpu.hold >= 0) { cpu.hold = -1; cpu.body.flags &= ~F.CARRY; }
      separate(cpu.on ? [...bodies.values(), cpu.body] : [...bodies.values()]);
      nextOrder -= dt;
      if (!orders.length || (nextOrder <= 0 && orders.length < S.maxOpen)) { newOrder(); nextOrder = S.gap; }
      for (let i = orders.length - 1; i >= 0; i--) {
        const o = orders[i]; o.left -= i === 0 ? dt : dt * S.queueRate;
        if (o.left <= 0) { lost++; events.push({ e: 'gone', id: o.id, r: o.r, front: i === 0 ? 1 : 0 }); if (i === 0) tray = []; orders.splice(i, 1); }
      }
      if (time <= 0) { time = 0; finish(served >= target); }
    },
    state() {
      const hold = {}, sc = {};
      for (const [pid, st] of P) { hold[pid] = st.hold; sc[pid] = st.added; }
      const g = { o: orders.map(o => [o.id, o.r, Math.ceil(o.left), r2(o.left / o.max)]), tray, hold, sc, served, lost, target, left: Math.max(0, Math.ceil(time)) };
      if (cpu.on) { const b = cpu.body; g.cpu = [r2(b.x), r2(b.z), r2(b.yaw), cpu.hold, cpu.added]; }
      return g;
    },
    get over() { return over; },
    /** For tests. */
    player: pid => P.get(pid), stations, get orders() { return orders; }, get tray() { return tray; }, get cpu() { return cpu; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, P.get(p).added]));
      return { coop: { success }, order: [pids.slice()], scores, unit: meta.unit };
    },
  };
}
