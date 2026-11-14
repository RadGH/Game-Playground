// Drones: little block-built craft launched from Drone bays (one drone per bay). They fly in formation off your
// wings and up front, and each kind has one job:
//   fighter  Combat drone — carries a real gun (an autocannon of the drone's Mk and rarity) and goes after enemies
//            within 450 m of you
//   miner    Mining drone — cuts the nearest asteroid within 250 m when nothing is shooting, and nudges the ore it
//            frees toward your hold
//   mender   Repair drone — patches your damaged blocks (not ones shot clean off: those need a station)
// A lost drone is rebuilt free at its bay REBUILD seconds later (if the bay is still on the ship). B launches or
// recalls them all.
//
// Save: G.drones = [{ uid, kind: 'drone', drone: 'fighter'|'miner'|'mender', tier, rarity }]; G.droneBays =
// { bayItemUid: droneUid }; G.dronesOut = launched or not. In the world: w.drones = [{ bay, item, body, downAt }].

import { RARITY, TIER_LIFT, TIER_NAMES } from '../data/blocks.js';
import { makeItem, partStats, turretDps } from './items.js';
import { createBody, toWorld, forward, upOf } from './body.js';
import { generateDrone } from './shipgen.js';
import { addBody, DT, hitBlock } from './world.js';
import { steerTo, attackMove, nearestFoe } from './npc.js';
import { vadd, vsub, vscale, vnorm, vdist, vcross, vlen } from '../core/math.js';
import { rayBody } from './hit.js';

export const REBUILD = 12;          // s until a lost drone is rebuilt at its bay
export const LEASH = 450;           // m from you that combat drones will chase an enemy
export const MINE_REACH = 250;      // m from you that mining drones look for rock
export const CUT_RANGE = 45;        // m a mining drone's cutter reaches
export const MEND_RANGE = 60;       // m a repair drone must be from you to patch

export const DRONE_KINDS = {
  fighter: { name: 'Combat drone', color: '#ff9a6a', blurb: 'Carries its own autocannon and goes after enemies near you.', price: 420 },
  miner: { name: 'Mining drone', color: '#ffe066', blurb: 'Cuts nearby asteroids and sends the ore your way.', price: 380 },
  mender: { name: 'Repair drone', color: '#7affd8', blurb: 'Patches your damaged blocks, even mid-fight.', price: 520 },
};
export const DRONE_IDS = Object.keys(DRONE_KINDS);

export function makeDrone(drone, tier = 1, rarity = 0, uid = null) {
  const it = makeItem('cargo', tier, rarity, uid);       // borrow the uid counter; then make it a drone
  return { uid: it.uid, kind: 'drone', drone, tier: it.tier, rarity: it.rarity };
}
export const droneName = d => `${DRONE_KINDS[d.drone]?.name || 'Drone'} ${TIER_NAMES[d.tier - 1]}`;
/** The gun a combat drone carries (its Mk and rarity), so its numbers are the real turret's. */
const droneGun = d => ({ uid: -d.uid, kind: 'autocannon', tier: d.tier, rarity: d.rarity });

/** Every number a drone card shows — the same ones the sim uses. */
export function droneNumbers(d) {
  const tl = TIER_LIFT[d.tier - 1] || 1, rl = (RARITY[d.rarity] || RARITY[0]).lift;
  const hull = Math.round((30 + 3 * 30 + 1.2 * 30) * tl * (0.85 + rl * 0.15));   // bridge-ish core + hull + engine (approx)
  const out = { hull, speed: 0, dps: 0, cut: 0, repair: 0 };
  if (d.drone === 'fighter') { const g = droneGun(d); out.dps = turretDps(g); out.range = partStats(g).range; }
  if (d.drone === 'miner') out.cut = 40 * tl * rl;            // rock block damage per second (a Mk I mining laser cuts 80)
  if (d.drone === 'mender') out.repair = 5 * tl * rl;         // hit points mended per second
  return out;
}
export function dronePrice(d) { return Math.round(DRONE_KINDS[d.drone].price * [1, 2.6, 6.5, 15][d.tier - 1] * [1, 1.5, 2.4, 4, 7][d.rarity] / 10) * 10; }
/** Card lines for a drone. */
export function droneLines(d) {
  const n = droneNumbers(d); const L = [['Kind', DRONE_KINDS[d.drone].name]];
  if (n.dps) { L.push(['Damage per second', String(Math.round(n.dps * 10) / 10)]); L.push(['Gun range', `${Math.round(n.range)} m`]); L.push(['Chases enemies', `within ${LEASH} m of you`]); }
  if (n.cut) { L.push(['Cutting', `${Math.round(n.cut)} per second on rock`]); L.push(['Works', `within ${MINE_REACH} m of you`]); }
  if (n.repair) L.push(['Repairs', `${Math.round(n.repair * 10) / 10} hit points per second`]);
  L.push(['Rebuilt after loss', `${REBUILD} s, free`]);
  return L;
}

/** Bays on the live ship (blocks still attached) and the drone loaded in each. */
export function loadedBays(G, P) {
  const byUid = new Map(G.drones.map(d => [d.uid, d]));
  return (P.stats.bays || []).map(bl => ({ bay: bl, item: byUid.get(G.droneBays[bl.item?.uid]) || null })).filter(x => x.item);
}

function droneBody(w, slot, P, paint) {
  const d = slot.item;
  const items = { bridge: makeItem('bridge', d.tier, 0), thruster: makeItem('thruster', d.tier, d.rarity), tool: d.drone === 'fighter' ? makeItem('autocannon', d.tier, d.rarity) : makeItem('mining', d.tier, d.rarity) };
  const g = generateDrone(d.drone, items, paint, 4);
  const at = toWorld(P, { x: slot.bay.x + 0.5, y: slot.bay.y + 1.5, z: slot.bay.z + 0.5 });
  const b = createBody(g, { kind: 'ship', team: 'player', pos: at, quat: P.quat, name: droneName(d) });
  b.drone = { slot, kind: d.drone, n: droneNumbers(d), idx: 0 };
  b.vel = { ...P.vel }; b.think = droneThink;
  return addBody(w, b);
}

/** Put every loaded drone out (B, or on launch when they were out). */
export function launchDrones(w, G, P, paint = 0) {
  const D = (w.drones ||= []);
  const bays = loadedBays(G, P);
  bays.forEach((s, i) => {
    let slot = D.find(x => x.bay === s.bay);
    if (!slot) { slot = { bay: s.bay, item: s.item, body: null, downAt: null }; D.push(slot); }
    slot.item = s.item;
    if (!slot.body || slot.body.dead) { slot.body = droneBody(w, slot, P, paint); slot.downAt = null; }
    slot.body.drone.idx = i;
  });
  w.dronesOut = true;
  return bays.length;
}
export function recallDrones(w) {
  for (const s of w.drones || []) if (s.body && !s.body.dead) { w.events.push({ type: 'droneHome', pos: { ...s.body.pos } }); s.body.dead = true; s.body = null; }
  w.dronesOut = false;
}

/** Formation slot i of n: off the wings and a little ahead and above. */
function slotPos(P, i, n) {
  const f = forward(P), u = upOf(P), r = vnorm(vcross(u, f));
  const side = i % 2 === 0 ? 1 : -1, row = Math.floor(i / 2);
  const off = P.radius + 7 + row * 6;
  return vadd(P.pos, vadd(vadd(vscale(r, side * off), vscale(u, 3 + row * 3)), vscale(f, P.radius * 0.6 + row * 4)));
}

/** A drone's pilot (world.js step runs b.think for every ship that has one). */
export function droneThink(w, b) {
  const P = w.player; const D = b.drone;
  if (!P || P.dead) { steerTo(b, b.pos, 0); return; }
  b.thinkT = (b.thinkT || 0) - 1 / 60;
  const n = (w.drones || []).filter(s => s.body && !s.body.dead).length;
  const home = slotPos(P, D.idx, n);
  // far behind (you boosted away): it jumps back to its slot rather than chase you across the system
  if (vdist(b.pos, P.pos) > 700) { b.pos = home; b.vel = { ...P.vel }; return; }
  if (b.thinkT > 0) return;
  b.thinkT = 0.12;
  D.work = null;
  if (D.kind === 'fighter') {
    const T = nearestFoe(w, b, P.pos, LEASH);
    if (T) { attackMove(w, b, T); return; }
  }
  if (D.kind === 'miner' && w.t - (w.combatT ?? -99) > 4) {
    const rock = nearestRock(w, P.pos, MINE_REACH);
    if (rock) {
      const to = vnorm(vsub(b.pos, rock.pos));
      const spot = vadd(rock.pos, vscale(to, rock.radius + 18));
      steerTo(b, spot, 0.8, 6); b.input.aimDir = vscale(to, -1);
      D.work = rock; return;
    }
  }
  // formation: match your speed, settle into the slot
  const to = vsub(home, b.pos); const d = vlen(to);
  b.input.aimDir = forward(P);
  const want = vadd(P.vel, vscale(to, Math.min(3, d * 0.4)));
  // flight assist asks for a velocity in the drone's own frame; aim along your nose, so ask along it
  const sp = b.stats.maxSpeed || 60; const f = forward(b);
  const fz = (want.x * f.x + want.y * f.y + want.z * f.z) / sp;
  b.input.thrust = { x: 0, y: 0, z: Math.max(-1, Math.min(1, fz)) };
  // and slide sideways/up toward the slot
  const r = vnorm(vcross(upOf(b), f)), u = upOf(b);
  b.input.thrust.x = Math.max(-1, Math.min(1, (want.x * r.x + want.y * r.y + want.z * r.z) / sp / 0.75));
  b.input.thrust.y = Math.max(-1, Math.min(1, (want.x * u.x + want.y * u.y + want.z * u.z) / sp / 0.75));
  b.input.boost = d > 60;
}
function nearestRock(w, p, range) {
  let best = null, bd = range * range;
  for (const o of w.bodies) {
    if (o.dead || o.kind !== 'rock' || o.cache || o.derelict || o.tractor || o.harpooned) continue;
    const d2 = (o.pos.x - p.x) ** 2 + (o.pos.y - p.y) ** 2 + (o.pos.z - p.z) ** 2;
    if (d2 < bd) { bd = d2; best = o; }
  }
  return best;
}

/** One sim step for the drones: cutting, mending, pulling ore, and rebuilding lost ones. */
export function droneStep(w, G, P, paint = 0) {
  const D = w.drones; if (!D || !P || P.dead) return;
  for (const s of D) {
    const b = s.body;
    if (b && b.dead) { s.body = null; s.downAt = w.t; w.events.push({ type: 'droneLost', pos: { ...b.pos }, name: b.name }); }
    if (!s.body) {
      // rebuilt free at the bay, if the bay is still on the ship
      if (w.dronesOut && s.downAt != null && w.t - s.downAt >= REBUILD && P.grid.cells.has(keyOf(s.bay)) ) {
        s.body = droneBody(w, s, P, paint); s.downAt = null; w.events.push({ type: 'droneBack', name: s.body.name });
        s.body.drone.idx = D.indexOf(s);
      }
      continue;
    }
    const k = b.drone;
    if (k.kind === 'miner' && k.work && !k.work.dead) {
      const rock = k.work; const from = vadd(b.pos, vscale(forward(b), 2));
      const dir = vnorm(vsub(rock.pos, from));
      const h = rayBody(rock, from, dir, CUT_RANGE + rock.radius);
      if (h && h.t < CUT_RANGE) {
        const end = vadd(from, vscale(dir, h.t));
        w.beams.push({ from, to: end, kind: 'mining', color: '#ffe066', owner: b.id, tkey: 0, hit: true });
        hitBlock(w, rock, h.blk, k.n.cut * DT, 'energy', b, end);
      }
    }
    if (k.kind === 'mender' && vdist(b.pos, P.pos) < MEND_RANGE + P.radius) mend(w, P, k.n.repair * DT);
  }
  // mining drones send freed ore your way
  const miners = D.filter(s => s.body && !s.body.dead && s.body.drone.kind === 'miner');
  if (miners.length) for (const pk of w.pickups) {
    if (pk.kind !== 'ore') continue;
    if (miners.some(s => vdist(s.body.pos, pk.pos) < 80)) pk.vel = vadd(vscale(pk.vel, 0.95), vscale(vnorm(vsub(P.pos, pk.pos)), 3));
  }
}
const keyOf = bl => (bl.x + 512) + (bl.y + 512) * 1024 + (bl.z + 512) * 1048576;

/** Spread `amount` hit points over your most damaged blocks. Returns what was mended. */
export function mend(w, P, amount) {
  let left = amount, done = 0;
  const hurt = [...P.grid.cells.values()].filter(bl => bl.hp < bl.maxHp - 0.01).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp);
  for (const bl of hurt) {
    if (left <= 0) break;
    const add = Math.min(left, bl.maxHp - bl.hp); bl.hp += add; left -= add; done += add;
  }
  if (done > 0) { P.stats.hp += done; P.version++; P.hpDirty = true; }
  return done;
}
