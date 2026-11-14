// Economy check (owner 2026-11-13: "rebalance the economy"). For each danger level: what a minute of fighting,
// mining or odd jobs pays, measured in the real sim (loot that drops, ore that falls out of rocks), next to what the
// next step of progress costs (warp core, the next hull, an outpost). Prints "minutes of play" to afford each step.
//   node tools/econ.mjs [runs=4]
import { createWorld, step, destroy } from '../js/sim/world.js';
import { spawnGroup, makeRock, WARP_CORES } from '../js/sim/galaxy.js';
import { buildPremade } from '../js/sim/shipgen.js';
import { itemValue } from '../js/sim/loot.js';
import { MATERIALS, matTier } from '../js/data/types.js';
import { CLASSES, PREMADES } from '../js/data/hulls.js';
import { growCost } from '../js/sim/hullgrow.js';
import { foundCost } from '../js/sim/colony.js';
import { MISSION_PAY } from '../js/sim/missions.js';
import { factionsForTier } from '../js/data/factions.js';
import { rng } from '../js/core/math.js';
import { LADDER, fight } from './combat-sim.mjs';

const runs = +(process.argv[2] || 4);
// what a drop is worth to you: credits as they are, ore at its market price, parts at what a shop pays
const value = p => p.kind === 'cr' ? p.n : p.kind === 'mat' ? (MATERIALS[p.mat]?.price || 1) * p.n : p.kind === 'item' ? itemValue(p.item) : 0;

/** Loot from one pack kill at a danger (a fresh fight; every enemy dies, pickups counted where they fall). */
function packLoot(tier, seed) {
  const w = createWorld({ seed, game: { credits: 0, cargo: {}, goods: {}, parts: [], rep: {} } });
  const P = buildPremade('sparrow'); w.bodies.push(P); w.player = P; P.x = -5000;
  const f = factionsForTier(tier)[seed % factionsForTier(tier).length];
  const g = spawnGroup(w, { x: 700, y: 0 }, f, tier, rng(seed), 'pack');
  for (const s of g) { s.lastAttacker = P; destroy(w, s); }
  return { v: w.pickups.reduce((a, p) => a + value(p), 0), n: g.length };
}

/** Ore mined in 60 s by the starter Sparrow (one Mining Laser I) cutting a typed rock of this danger. */
function mining(design, tier, seed) {
  const w = createWorld({ seed, tier, game: { credits: 0, cargo: {}, goods: {}, parts: [], rep: {}, settings: {} } });
  w.tier = tier;
  const P = buildPremade(design); w.bodies.push(P); w.player = P;
  let got = 0;
  const rocks = [];
  const fresh = () => { const R = makeRock(seed * 13 + rocks.length, 14, tier, { type: Object.keys(MATERIALS).find(k => MATERIALS[k].tier === matTier(tier) && MATERIALS[k].role === 'structural') }); R.x = P.x + 160 + P.r; R.y = P.y; R.vx = R.vy = 0; w.bodies.push(R); rocks.push(R); return R; };
  let R = fresh();
  for (let t = 0; t < 60; t += 1 / 60) {
    if (R.dead || !R.grid.blocks.some(b => b.alive)) R = fresh();
    const live = R.grid.blocks.filter(b => b.alive); const tgt = live[(t * 3 | 0) % live.length];
    const [ax, ay] = [R.x + (tgt ? (tgt.x - R.grid.w / 2) * 10 : 0), R.y + (tgt ? (tgt.y - R.grid.h / 2) * 10 : 0)];
    step(w, 1 / 60, { mx: 0, my: 0, ax, ay, fire: true });
    P.vx = P.vy = 0;
    for (const p of w.pickups) if (p.kind === 'mat' && !p.counted) { p.counted = true; got += value(p); }
  }
  return got;
}

const MIN = 60;
// mining lasers' worth by danger, against one Mining Laser I (II = 1.9x, III = 3.3x, a Strip Miner 5x; ships carry 1-3)
const MINERS = t => [1, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9][t];
console.log('danger | fight: loot/pack  win%  cr/min | mine cr/min | job cr | next steps (cost → minutes fighting / mining)');
for (let tier = 1; tier <= 10; tier++) {
  const ship = LADDER[tier][0];
  let loot = 0, wins = 0, tWin = 0;
  for (let k = 0; k < runs; k++) { loot += packLoot(tier, 77 * tier + k).v; const r = fight(ship, factionsForTier(tier)[k % factionsForTier(tier).length], tier, 'pack', 500 * tier + k); if (r.win) { wins++; tWin += r.t; } }
  loot /= runs;
  // a fight takes its sim time plus ~60 s of finding the next pack and scooping the loot
  const fightMin = ((wins ? tWin / wins : 90) + 60) / MIN;
  const crFight = loot * (wins / runs) / fightMin;
  let mine = 0; for (let k = 0; k < 2; k++) mine += mining('sparrow', tier, 31 * tier + k); mine /= 2;
  const crMine = mine * 0.7 * MINERS(tier);   // 30% of the time flying between rocks; deeper in you carry more and better lasers
  // a typical job: ~4 minutes, missions.js reward() for a clear-site job (base 380-620)
  const job = Math.round(500 * MISSION_PAY(tier));
  const steps = [];
  const nextCore = WARP_CORES.find(c => c.reach > tier && c.reach - 2 <= tier && c.cr);
  if (nextCore && tier % 2 === 0) steps.push([`${nextCore.name.replace(' warp core', '')} core`, nextCore.cr + Object.entries(nextCore.mats).reduce((a, [m, n]) => a + MATERIALS[m].price * n, 0)]);
  const nextHull = Object.entries(CLASSES).find(([id, c]) => c.tier === tier + 1 && c.price && id !== 'carrier');
  if (nextHull) { const pm = PREMADES.find(p => p.cls === nextHull[0]); steps.push([`buy ${pm?.name || nextHull[0]}`, pm?.price || nextHull[1].price]); const g = growCost(nextHull[0]); steps.push([`grow to ${nextHull[1].name}`, g.cr]); }
  const fc = foundCost(tier); steps.push(['outpost', fc.cr + Object.entries(fc.mats).reduce((a, [m, n]) => a + (MATERIALS[m]?.price || 1) * n, 0)]);
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
  console.log(`${String(tier).padStart(6)} | ${fmt(loot).padStart(13)} ${String(Math.round(wins / runs * 100)).padStart(5)} ${fmt(crFight).padStart(7)} | ${fmt(crMine).padStart(11)} | ${fmt(job).padStart(6)} | ` +
    steps.map(([n, c]) => `${n} ${fmt(c)} → ${Math.round(c / Math.max(1, crFight))}/${Math.round(c / Math.max(1, crMine))} min`).join(' · '));
}
