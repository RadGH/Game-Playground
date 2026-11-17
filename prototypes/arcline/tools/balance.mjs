// Balance bot: plays a "sensible player" city for N game years and prints how it went — population, the monthly
// balance, when each milestone came (real minutes at 1×), and the fighting (creatures, kills, wall breaches, wrecks).
// Use it after moving any number in data/tuning.json or data/catalog.json.
//
//   node prototypes/arcline/tools/balance.mjs [--years 3] [--seed 12] [--nofight] [--quiet] [--json] [--set key=v,key=v]
//
// The player it imitates: a street grid around the Colony Core; zones a new block for whichever of homes / shops /
// industry the demand meter wants most; adds a Fusion Plant or a Water Pump when the grid runs short; a park now and
// then and a school once unlocked; a wall ring with gates that moves outward as the city grows; turrets along the ring
// (more as the city grows, more where a wall broke) and repairs walls every few days. It never takes a loan.
// --nofight skips the creatures (fast: shows the growth curve alone). DBG=1 in the environment prints every breach,
// wreck and lost turret, and what the bot spent each month. The creature fight uses citykit's Horde/Defence, which
// roll Math.random, so two runs differ a little — compare a few runs, not one.
import { freshTuning } from '../tests/arcline-setup.mjs';
import { generateWorld } from '../js/sim/world.js';
import { newRegion, found } from '../js/sim/region.js';
import { T, milestones } from '../js/sim/tuning.js';
import { item } from '../js/sim/catalog.js';
import { lineTiles, rectTiles, buildRoad, paintZone, place, buildLine, buildWall, buildTurret, bulldoze, repairWalls, ZONE } from '../js/sim/build.js';
import * as city from '../js/sim/city.js';
import * as ships from '../js/sim/ships.js';
import * as nests from '../js/sim/nests.js';
import { Horde } from '../../../citykit/js/world/horde.js';
import { Defence } from '../../../citykit/js/world/defence.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };

/**
 * Play one city. → { years: [{ year, people, money, net, minNet, lots, turrets, nests, spawned, kills, breaches, wrecks }],
 *   milestones: [{ n, people, day, minutes }], months: [{ day, people, net }], firstNet, negativeMonths }
 */
export function play({ years = 3, seed = 12, fight = true, log = () => {}, set = {} } = {}) {
  freshTuning();
  Object.assign(T, set);   // --set key=value,key=value: try a tuning without editing data/tuning.json
  // a medium (128-tile) region; the core in the middle of a big flat dry square (no luck with the terrain)
  const world = generateWorld({ seed, cells: 8 });
  const wr = world.regions.find(o => o.span === 2 && o.land > 0.7) || world.regions.find(o => o.land > 0.7);
  const r = newRegion(world, wr), N = r.size;
  const cx = N >> 1, cz = N >> 1, HALF = Math.min(46, Math.floor(N / 2) - 6);
  const lo = cx - HALF, hi = cx + HALF;
  for (let z = lo; z <= hi; z++) for (let x = lo; x <= hi; x++) { const i = z * N + x; r.ter.water[i] = 0; r.ter.deposit[i] = 0; r.ter.height[i] = 2; }
  found(r, cx - 1, cz - 1);
  if (!place(r, 'col-core', cx - 1, cz - 1).ok) throw new Error('core');
  // the street grid: streets every 6 tiles; blocks are the 5×5 squares between them
  const SP = 6, gx0 = r.core.x - 1, gz0 = r.core.z + 3;   // a street runs right below the core
  const blocks = [];
  for (let bz = -7; bz <= 7; bz++) for (let bx = -7; bx <= 7; bx++) {
    const x = gx0 + bx * SP + 1, z = gz0 + bz * SP + 1;
    if (x < lo + 1 || z < lo + 1 || x + 5 > hi - 1 || z + 5 > hi - 1) continue;
    if (x <= r.core.x + 2 && x + 4 >= r.core.x && z <= r.core.z + 2 && z + 4 >= r.core.z) continue;   // the core's block
    blocks.push({ x, z, d: Math.hypot(x + 2 - cx, z + 2 - cz), use: null });
  }
  blocks.sort((a, b) => a.d - b.d);
  // a pond beside the first pump block
  const pond = blocks.find(b => b.d > 10);
  r.ter.water[(pond.z + 2) * N + pond.x + 2] = 1; pond.use = 'pond';

  const streets = b => [...lineTiles(b.x - 1, b.z - 1, b.x + 5, b.z - 1), ...lineTiles(b.x + 5, b.z - 1, b.x + 5, b.z + 5), ...lineTiles(b.x + 5, b.z + 5, b.x - 1, b.z + 5), ...lineTiles(b.x - 1, b.z + 5, b.x - 1, b.z - 1)];
  const track = (k, fn) => { const m0 = r.money; const v = fn(); spentBy[k] = (spentBy[k] || 0) + (m0 - r.money); return v; };
  const spentBy = {};
  let saving = 0;   // credits put aside for the next, bigger wall ring
  const reserve = () => 2000 + r.turrets.length * 25 + saving;
  // the player builds only inside the wall ring (a block whose streets stay 2 tiles clear of it)
  const inside = b => ring != null && Math.max(Math.abs(b.x - 1 - cx), Math.abs(b.x + 5 - cx), Math.abs(b.z - 1 - cz), Math.abs(b.z + 5 - cz)) <= ring - 2;
  function openBlock(use) {
    const b = blocks.find(b => !b.use && inside(b) && (use !== 'I' || b.d > 12)) || blocks.find(b => !b.use && inside(b));
    if (!b) return null;
    const road = streets(b).filter(([x, z]) => !r.tiles.road[z * N + x] && !r.tiles.wall[z * N + x]);
    if (road.length && !buildRoad(r, road).ok) return null;
    buildLine(r, streets(b), 'pipe');
    b.use = use;
    if (use === 'R' || use === 'C' || use === 'I') paintZone(r, rectTiles(b.x, b.z, b.x + 4, b.z + 4), ZONE[use]);
    return b;
  }
  // zoned tiles that can still grow: empty, in a plot a road reaches (city.growableTiles — what city.grow() builds on)
  const emptyZoned = z => city.growableTiles(r, { [ZONE.R]: 'R', [ZONE.C]: 'C', [ZONE.I]: 'I' }[z]);
  function placeIn(id, use) {
    const e = item(id); const b = blocks.find(b => b.use === 'svc' && b.free?.length) || openBlock('svc');
    if (!b) return false; b.free ??= [[b.x, b.z], [b.x + 3, b.z], [b.x, b.z + 3], [b.x + 3, b.z + 3]];
    for (const [x, z] of b.free) { const q = place(r, id, x, z); if (q.ok) { b.free = b.free.filter(p => p[0] !== x || p[1] !== z); return true; } }
    return false;
  }
  function pump() {   // pumps stand by the pond
    for (const [x, z] of [[pond.x, pond.z], [pond.x + 3, pond.z], [pond.x, pond.z + 3], [pond.x + 3, pond.z + 3]]) if (place(r, 'svc-water', x, z).ok) return true;
    return false;
  }

  // the wall ring: a square around the city; when the city nears it, a bigger one replaces it
  let ring = null, ringTiles = [];
  function ringAround(half) {
    const a = cx - half, b = cz - half, c = cx + half, d = cz + half;
    return [...lineTiles(a, b, c, b), ...lineTiles(c, b, c, d), ...lineTiles(c, d, a, d), ...lineTiles(a, d, a, b)].filter(([x, z]) => x > 0 && z > 0 && x < N - 1 && z < N - 1);
  }
  function wallUp(half) {
    if (ring) {   // take down the old ring (its turrets stay: an inner line of defence)
      bulldoze(r, ringTiles.filter(([x, z]) => r.tiles.wall[z * N + x] && !r.tiles.road[z * N + x]));
      for (const [x, z] of ringTiles) { const i = z * N + x; if (r.tiles.road[i]) { r.tiles.wall[i] = 0; r.tiles.wallHp[i] = 0; } }   // gates come off, the road stays
    }
    ring = half; ringTiles = ringAround(half);
    // the player clears the nests the new ring would shut inside the city (turrets + strikes, in a real game)
    r.nests = r.nests.filter(n => Math.max(Math.abs(n.x - cx), Math.abs(n.z - cz)) > half + 2);
    buildWall(r, ringTiles.filter(([x, z]) => !r.tiles.road[z * N + x]));
    const gates = ringTiles.filter(([x, z]) => r.tiles.road[z * N + x]);
    if (gates.length) buildWall(r, gates, 'gate');
    // gates draw the creatures (they're cheaper to break): two turrets guard each one from a few tiles inside
    for (const [x, z] of gates) { const ix = Math.sign(cx - x) * (Math.abs(cx - x) === half ? 1 : 0), iz = Math.sign(cz - z) * (Math.abs(cz - z) === half ? 1 : 0); gateGuards.push([x + ix * 3, z + iz * 3]); }
  }
  const gateGuards = [];
  /** A turret on the nearest free tile to (x, z) — the player answering creatures that got inside. */
  function turretNear(x, z) {
    // a pulse gun up close (a mortar can't hit what's next to it); not where three guns already stand
    const id = r.milestone >= 2 ? 'tur-arc' : 'tur-pulse';
    if (r.money - item(id).cost < 1000) return false;
    if (r.turrets.filter(t => Math.hypot(t.x - x, t.z - z) <= 4).length >= 3) return false;
    for (let rad = 1; rad <= 6; rad++) for (let k = -rad; k <= rad; k++) for (let j = -rad; j <= rad; j++) {
      if (Math.max(Math.abs(j), Math.abs(k)) !== rad) continue;
      if (buildTurret(r, id, x + j, z + k).ok) { def?.add(item(id).turret, x + j, z + k); return true; }
    }
    return false;
  }
  function addTurret(nearX = null, nearZ = null) {
    let id = r.milestone >= 2 && r.turrets.length % 4 === 3 ? 'tur-arc' : r.milestone >= 1 && r.turrets.length % 3 === 2 ? 'tur-mortar' : 'tur-pulse';
    if (r.money - item(id).cost < reserve()) id = 'tur-pulse';   // can't afford the big one yet: a pulse gun now
    if (r.money - item(id).cost < reserve()) return false;
    // just inside the ring, spread out: the ring tile farthest from every turret (or nearest the breach)
    const inside = ringTiles.map(([x, z]) => [x + Math.sign(cx - x) * (Math.abs(cx - x) === ring ? 1 : 0), z + Math.sign(cz - z) * (Math.abs(cz - z) === ring ? 1 : 0)]);
    const score = ([x, z]) => nearX != null ? -Math.hypot(x - nearX, z - nearZ) : Math.min(99, ...r.turrets.map(t => Math.hypot(t.x - x, t.z - z)));
    const cands = inside.map(p => [p, score(p)]).sort((a, b) => b[1] - a[1]);
    for (const [[x, z]] of cands.slice(0, 40)) {
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) if (buildTurret(r, id, x + ox, z + oz).ok) { def?.add(item(id).turret, x + ox, z + oz); return true; }
    }
    return false;
  }

  // ---- found: a main cross of streets through the core's block, first blocks, power, water, the first ring
  buildRoad(r, lineTiles(cx - 22, gz0, cx + 22, gz0)); buildRoad(r, lineTiles(gx0, cz - 22, gx0, cz + 22));
  wallUp(+opt('ring', 14));   // the first wall ring's half-size (--ring; 20 before 2026-11-17 — a 164-tile ring at founding left no money for guns)
  openBlock('R'); openBlock('R'); openBlock('C'); openBlock('I');
  placeIn('svc-power'); pump(); placeIn('col-comms');
  let def = null;
  for (let k = 0; k < 6; k++) addTurret();
  if (process.env.DBG) console.log('after founding:', Math.round(r.money), 'cr left,', r.turrets.length, 'turrets, ring tiles', ringTiles.length, 'wall upkeep/mo', Math.round(city.monthBudget(r).upkeep.walls), 'turret upkeep/mo', Math.round(city.monthBudget(r).upkeep.turrets));

  // ---- the run
  let g = fight ? nests.makeField(r) : null;
  const horde = fight ? new Horde(g) : null;
  def = fight ? new Defence(horde) : null;
  if (def) for (const t of r.turrets) def.add(t.kind, t.x, t.z);
  const ms = milestones(), reached = [], months = [], years_ = [];
  let y = { spawned: 0, kills: 0, breaches: 0, wrecks: 0, minNet: Infinity };
  const DT = 1 / 30, days = DT / T.dayLengthSec;
  let lastBreach = null, lastDay = 0; const wreckFix = [], spent = { repair: 0, rebuild: 0 };
  for (let step = 0; r.day < years * 360; step++) {
    city.tick(r, fight ? days : 1);
    const day = Math.floor(r.day);
    // ships: let any settlers land (old builds); buy strikes when rich; never merchants
    for (const e of ships.shipsTick?.(r, fight ? days : 1) || []) {
      if (e.type !== 'ship-arrived') continue;
      if (e.ship.kind === 'settlers') ships.answer(r, e.ship.id, 'accept'); else ships.answer(r, e.ship.id, 'refuse');
    }
    if (fight) {
      const o = nests.nestsTick(r, days, { field: g, alive: horde.list.length });
      for (const s of o.spawns) { horde.spawn(s.kind, s.x, s.z); y.spawned++; }
      const before = horde.list.length; horde.step(DT); def.step(DT);
      y.kills += Math.max(0, before - horde.list.length);
      if (step % 30 === 0) {
        const res = nests.syncField(r, g);
        for (const e of res.events) {
          if (e.type === 'wall-broken') { y.breaches++; lastBreach = e; }
          if (e.type === 'building-wrecked') { y.wrecks++; if (!wreckFix.some(w => Math.hypot(w[0] - e.x, w[1] - e.z) < 5)) wreckFix.push([e.x, e.z]); if (Math.max(Math.abs(e.x - cx), Math.abs(e.z - cz)) >= ring) y.wrecksOutside = (y.wrecksOutside || 0) + 1; if (process.env.DBG) console.log('wreck', e.id, e.x - cx, e.z - cz, 'ring', ring, 'day', Math.floor(r.day), 'creatures', horde.list.length, 'inside', horde.list.filter(c => Math.max(Math.abs(c.x - cx), Math.abs(c.z - cz)) < ring).length); }
          if (process.env.DBG && (e.type === 'turret-wrecked' || e.type === 'wall-broken')) console.log(e.type, e.x - cx, e.z - cz, 'day', Math.floor(r.day), 'money', Math.round(r.money));
          if (e.type === 'turret-wrecked') y.turretsLost = (y.turretsLost || 0) + 1;
          if (e.type === 'turret-wrecked') def.turrets = def.turrets.filter(t => !(t.x === e.x && t.z === e.z));
        }
        if (res.changed) { g = nests.makeField(r); horde.grid = g; }
      }
    }
    if (day === lastDay) continue;
    lastDay = day;
    nests.siegeNests?.(r, 1);
    // ---- the player, every 3 days
    const mP = r.money;
    if (day % 3 === 0) {
      const dm = city.demand(r);
      // defence first: the ring's turrets (a few per side + more as the city grows) before new blocks
      const wantTurrets = Math.ceil(ringTiles.length / 10) + Math.floor(r.people.total / 80);
      const onRing = r.turrets.filter(t => Math.max(Math.abs(t.x - cx), Math.abs(t.z - cz)) >= ring - 4).length;
      if (onRing < wantTurrets) track('turrets', () => addTurret());
      // a new block whenever the city wants one and there's money after the guns (2026-11-17: it used to wait for 90% of
      // the wanted ring guns first — with walls eating the money that never came, and the bot's city stalled at ~200)
      for (const [k, z] of Object.entries({ R: ZONE.R, C: ZONE.C, I: ZONE.I }).sort((a, b) => dm[b[0]] - dm[a[0]]))
        if (dm[k] > 0.1 && emptyZoned(z) < 6 && r.money > reserve() + 1500) track('blocks', () => openBlock(k));
      if (r.power && r.power.demand > r.power.supply * 0.85 && r.money > item('svc-power').cost + reserve()) track('power', () => placeIn('svc-power'));
      if (r.waterNet && r.waterNet.demand > r.waterNet.supply * 0.85 && r.money > item('svc-water').cost + reserve()) pump();
      const parks = r.lots.filter(l => l.id === 'svc-park').length;
      if (r.people.total > 120 * (parks + 1) && r.money > 6000 + reserve()) placeIn('svc-park');
      const schools = r.lots.filter(l => l.id === 'svc-school').length;
      if (r.milestone >= 1 && r.people.total > 400 * (schools + 1) && r.money > 12000 + reserve()) placeIn('svc-school');
      // the ring moves out when the built blocks reach it
      const full = !blocks.some(b => !b.use && inside(b));
      saving = 0;
      if (full && ring < HALF - 2) {
        const want = Math.min(HALF - 2, ring + 12), cost = ringAround(want).length * 50 + reserve() + 8 * 700;
        saving = cost;   // stop spending on anything else but emergencies until the new ring is up
        // a sensible player borrows for the bigger wall when the city pays its way and the loan closes the gap
        if (r.money < cost && r.money + T.loanSize >= cost && r.loans.length < 2 && (r.budget?.net ?? 0) > T.loanSize / 48 * 2) city.takeLoan(r);
        if (r.money > cost) { saving = 0; wallUp(want); if (fight) { g = nests.makeField(r); horde.grid = g; def.turrets = []; for (const t of r.turrets) def.add(t.kind, t.x, t.z); } } }
      // emergencies: guns at new gates, where buildings were wrecked, where a wall broke
      while (gateGuards.length && r.money > 3000) { const [x, z] = gateGuards.shift(); track('gateTurrets', () => { turretNear(x, z); turretNear(x, z); }); }
      if (wreckFix.length) { const [x, z] = wreckFix.shift(); wreckFix.length = 0; track('wreckTurrets', () => turretNear(x, z)); }
      if (lastBreach && onRing >= wantTurrets * 0.7) { track('breachTurrets', () => turretNear(lastBreach.x + Math.sign(cx - lastBreach.x) * 2, lastBreach.z + Math.sign(cz - lastBreach.z) * 2)); lastBreach = null; }
      // repairs: rebuild broken ring tiles, patch the rest
      const broken = ringTiles.filter(([x, z]) => !r.tiles.wall[z * N + x] && !r.turrets.some(t => t.x === x && t.z === z));
      // from milestone 2 the player rebuilds with Plated Wall when there's Steel for it
      const wallId = r.milestone >= 2 && (r.stock.steel || 0) >= broken.length * 2 ? 'wall-2' : 'wall-1';
      if (broken.length) { const m0 = r.money; buildWall(r, broken.filter(([x, z]) => !r.tiles.road[z * N + x]), wallId); buildWall(r, broken.filter(([x, z]) => r.tiles.road[z * N + x]), 'gate'); spent.rebuild += m0 - r.money; }
      if (r.money > reserve()) { const m0 = r.money; repairWalls(r, ringTiles); spent.repair += m0 - r.money; }
      if (fight && (broken.length || r.wallsChanged)) { g = nests.makeField(r); horde.grid = g; }
    }
    spent.player = (spent.player || 0) + (mP - r.money);
    // ---- bookkeeping
    while (reached.length < ms.length && r.people.total >= ms[reached.length]) reached.push({ n: reached.length + 1, people: ms[reached.length], day, minutes: Math.round(day * T.dayLengthSec / 6) / 10 });
    if (day % 30 === 0) {
      const b = city.monthBudget(r); months.push({ day, people: r.people.total, net: Math.round(b.net), money: Math.round(r.money) });
      y.minNet = Math.min(y.minNet, b.net);
      log(`day ${day}: ${r.people.total} people (${r.people.arriving} waiting, homes ${city.housing(r)}), ${Math.round(b.net)}/mo, ${Math.round(r.money)} cr, ${r.turrets.length} turrets, ${r.nests.length} nests, ring ${ring}, player ${Math.round(spent.player || 0)} full ${!blocks.some(b => !b.use && inside(b))} saving ${saving} repairs ${Math.round(spent.repair)} rebuild ${Math.round(spent.rebuild)}, demand ${Object.values(city.demand(r)).map(v => v.toFixed(2)).join('/')}`); spent.repair = spent.rebuild = spent.player = 0; if (process.env.DBG) { console.log('  spent', JSON.stringify(Object.fromEntries(Object.entries(spentBy).map(([k, v]) => [k, Math.round(v)])))); for (const k in spentBy) delete spentBy[k]; }
    }
    if (day % 360 === 0) {
      const b = city.monthBudget(r);
      years_.push({ year: day / 360, people: r.people.total, money: Math.round(r.money), net: Math.round(b.net), minNet: Math.round(y.minNet), lots: r.lots.length, turrets: r.turrets.length, nests: r.nests.length, ...y, minNet: Math.round(y.minNet) });
      y = { spawned: 0, kills: 0, breaches: 0, wrecks: 0, minNet: Infinity };
    }
  }
  return { years: years_, milestones: reached, months, firstNet: months.slice(0, 3).map(m => m.net), negativeMonths: months.filter(m => m.net < 0).length, r };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const set = Object.fromEntries(String(opt('set', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, +v]; }));
  const res = play({ years: +opt('years', 3), seed: +opt('seed', 12), fight: !opt('nofight', false), set, log: opt('quiet', false) ? () => {} : s => console.log(s) });
  if (opt('json', false)) { delete res.r; console.log(JSON.stringify(res, null, 1)); }
  else {
    console.log('\nyear | people | money | net/mo | worst net/mo | lots | turrets | nests | creatures | killed | wall tiles broken | buildings wrecked | turrets lost');
    for (const y of res.years) console.log([y.year, y.people, y.money, y.net, y.minNet, y.lots, y.turrets, y.nests, y.spawned, y.kills, y.breaches, y.wrecks, y.turretsLost || 0].join(' | '));
    console.log('\nmilestones: ' + (res.milestones.map(m => `M${m.n} (${m.people}) day ${m.day} = ${m.minutes} min`).join(', ') || 'none'));
    console.log(`first 3 months net: ${res.firstNet.join(', ')}; months with a negative balance: ${res.negativeMonths} of ${res.months.length}`);
  }
}
