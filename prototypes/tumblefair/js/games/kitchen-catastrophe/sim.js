// KITCHEN CATASTROPHE — co-op. A fair food stall in a rush. Orders (lemonade, a corn dog, candy floss…) come in at the
// serving hatch with a patience timer each; the team builds the OLDEST order on the one shared tray at the hatch, a
// part at a time, in the order the recipe says. Eight stations round the kitchen each hand out one ingredient, and
// every station belongs to one player (its colour mat + shape tag): only its owner can take from it. So a corn dog
// (sausage -> batter -> mustard) usually needs two or three people, and they have to queue up at the tray in turn.
//
//   A at your station      take its ingredient (you carry one thing at a time; taking again swaps it)
//   A at the tray          add what you carry. The right next step goes on; the WRONG one spoils the tray (it is
//                          emptied, the item is lost and the order loses some patience)
//   an order runs out      the customer stomps off (no penalty beyond the lost order)
// Fill RULES.target orders before the bell (75 s) to win together. Fewer players = each owns more stations (solo: all
// eight, a lower target and more patient customers). Each player's score = parts they put on the tray.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'kitchen-catastrophe', title: 'Kitchen Catastrophe', blurb: 'Grab your ingredients and build every order on the tray, in the right order!',
  how: ['Stations with YOUR colour and shape are yours: press A there to grab.', 'Press A at the tray to add it. Follow the recipe order!', 'A wrong step spoils the tray. Fill enough orders together!'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'coop', unit: 'items', tags: ['coop', 'action'], card: 'card-kitchen-catastrophe', css: true,
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
  target: { 1: 6, 2: 8, 3: 9, 4: 10 }, diff: { easy: -2, normal: 0, hard: 2 },
  maxOpen: 3, gap: 7, patience: 16, perStep: 5, soloPatience: 1.35, spoilCost: 3, tier1At: 18,
  reach: 1.35, trayReach: 1.6,
};
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

export function create({ rng, players, difficulty = 'normal' }) {
  const S = RULES, n = players.length, pids = players.map(p => p.pid), events = [];
  const target = Math.max(2, (S.target[n] ?? S.target[4]) + (S.diff[difficulty] ?? 0));
  const stations = dealStations(rng, pids);
  const bodies = new Map(), P = new Map();
  players.forEach((p, i) => {
    const b = makeBody(r2((i - (n - 1) / 2) * 1.6), 1.2, Math.PI);
    bodies.set(p.pid, b); P.set(p.pid, { hold: -1, prevB: 0, added: 0, spoiled: 0 });
  });
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
    const b = bodies.get(pid), st = P.get(pid);
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
      } else {
        spoils++; st.spoiled++; o.left = Math.max(0.5, o.left - S.spoilCost);
        events.push({ e: 'spoil', pid, item, want: rec.steps[tray.length], had: tray.length }); tray = [];
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
  return {
    bodies, events,
    init: () => ({ arena: ARENA, target, stations, tray: TRAY, spots: STATIONS }),
    input(pid, inp) {
      const b = bodies.get(pid), st = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(st.prevB & IN.A); st.prevB = bits;
      stepBody(b, inp, meta.move, ARENA);
      if (pa) use(pid);
    },
    step(dt) {
      if (over) return;
      t += dt; time -= dt;
      separate(bodies.values());
      nextOrder -= dt;
      if (!orders.length || (nextOrder <= 0 && orders.length < S.maxOpen)) { newOrder(); nextOrder = S.gap; }
      for (let i = orders.length - 1; i >= 0; i--) {
        const o = orders[i]; o.left -= dt;
        if (o.left <= 0) { lost++; events.push({ e: 'gone', id: o.id, r: o.r }); if (i === 0) tray = []; orders.splice(i, 1); }
      }
      if (time <= 0) { time = 0; finish(served >= target); }
    },
    state() {
      const hold = {}, sc = {};
      for (const [pid, st] of P) { hold[pid] = st.hold; sc[pid] = st.added; }
      return { o: orders.map(o => [o.id, o.r, Math.ceil(o.left), r2(o.left / o.max)]), tray, hold, sc, served, lost, target, left: Math.max(0, Math.ceil(time)) };
    },
    get over() { return over; },
    /** For tests. */
    player: pid => P.get(pid), stations, get orders() { return orders; }, get tray() { return tray; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, P.get(p).added]));
      return { coop: { success }, order: [pids.slice()], scores, unit: meta.unit };
    },
  };
}
