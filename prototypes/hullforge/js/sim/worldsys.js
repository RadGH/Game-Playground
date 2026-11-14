// The round-2 systems in one place: attach them to a freshly populated world and they run every sim step through
// w.hooks (world.js). Pure — the browser glue (ui/world-ext.js) and the node tests both call `attachWorld` and then
// just step the world.
//
// Order each step: read new sim events (who killed what → standing), the harpoon and towing, the station's tractor
// beam, drones, encounters, jobs, a live outpost raid. Messages for the screen collect in w.ext.msgs.

import { vadd, vdist, vscale, vrand, rng, hash, qaxis } from '../core/math.js';
import { createBody } from './body.js';
import { generateShip } from './shipgen.js';
import { addBody, DT, SAFE_RADIUS } from './world.js';
import { FACTIONS, stationOwner, repForKill, shipsHostile, piratesCalm, priceMul } from './factions.js';
import { rollEncounters, encounterStep, ENCOUNTERS } from './encounters.js';
import { missionStep } from './missions.js';
import { harpoonStep, harpoonState, tractorIn, tractorStep, salvageValue, inDock } from './harpoon.js';
import { droneStep } from './drones.js';
import { outpostIn, orbitSpot, outpostBody, spawnRaid, raidStep, nextRaid, levelOf } from './outposts.js';
import { pilot } from './npc.js';
import { fmt } from '../../../../shared/format.js';

/** Is this body on your side (you, your drones, your outpost)? */
export const mine = (w, b) => !!b && (b === w.player || b.team === 'player');

/**
 * Hook the systems into a populated world. opts: { planet: {x,y,z} (where the planet is drawn), paint, accent,
 * traffic: true (traders and patrols flying about) }.
 */
export function attachWorld(w, G, gal, opts = {}) {
  const sys = w.sys;
  const msgs = [];
  w.ext = { G, gal, msgs, say: m => msgs.push(m), paint: opts.paint ?? 0, accent: opts.accent ?? 2, reel: false };
  // the station's owner sets its ore prices
  if (w.station) { w.station.faction = stationOwner(sys); }
  sys.oreMul = priceMul(G, stationOwner(sys));
  // pirates who like you look the other way (ai.js reads this)
  w.sightMul = b => (b.faction === 'pirate' && piratesCalm(G) && !b.raider && b.target !== w.player ? 0.38 : 1);
  w.enc = rollEncounters(sys, w.seed);
  // the outpost (or the empty orbit spot where one could go)
  w.orbit = orbitSpot(w.station ? w.station.pos : { x: 0, y: 0, z: 0 }, opts.planet || null);
  const o = outpostIn(G, sys.id);
  if (o) w.outpostBody = outpostBody(w, o, w.orbit, { paint: w.ext.paint, accent: w.ext.accent });
  if (opts.traffic !== false) traffic(w, G);
  (w.hooks ||= []).push(stepWorld);
  return w;
}
/** Rebuild the outpost body (a module was built: it grows a piece). */
export function refreshOutpost(w, G) {
  const o = outpostIn(G, w.sys.id); if (!o) return null;
  if (w.outpostBody) w.outpostBody.dead = true;
  w.outpostBody = outpostBody(w, o, w.orbit, { paint: w.ext.paint, accent: w.ext.accent });
  return w.outpostBody;
}

/** Traders hauling between the station and the rock fields, and the patrol near home in its own systems. */
function traffic(w, G) {
  const sys = w.sys; const r = rng(hash(w.seed, 'traffic')); const st = w.station; if (!st) return;
  const navy = stationOwner(sys) === 'navy';
  const mk = (faction, team, i, name, danger) => {
    const { grid } = generateShip(hash(w.seed, faction, i), { danger, faction, small: danger <= 2 });
    const b = createBody(grid, { kind: 'ship', team, faction, danger, name, pos: vadd(st.pos, vscale(vrand(r), SAFE_RADIUS + 200 + r() * 600)) });
    b.quat = qaxis({ x: 0, y: 1, z: 0 }, r() * 6); b.think = pilot; b.angry = shipsHostile(G, faction);
    return addBody(w, b);
  };
  if (w.fields?.length) {
    const f = w.fields[Math.floor(r() * w.fields.length)];
    const t = mk('traders', 'neutral', 0, `Hauler ${['Plover', 'Saffron', 'Tallow', 'Brisk'][Math.floor(r() * 4)]}`, Math.max(1, sys.danger - 1));
    t.ai = { route: [f, vadd(st.pos, { x: 0, y: 100, z: 0 })], loop: true, speed: 0.3, reach: 200 };
  }
  if (navy) {
    const pts = [0, 1, 2, 3].map(i => { const a = i * Math.PI / 2 + r(); return vadd(st.pos, { x: Math.cos(a) * 1500, y: r.range(-120, 120), z: Math.sin(a) * 1500 }); });
    for (let i = 0; i < 2; i++) { const p = mk('navy', 'ally', i + 1, `Patrol cutter ${i + 1}`, Math.max(1, sys.danger)); p.ai = { route: pts, loop: true, speed: 0.4, reach: 150, sight: 650 }; p.pos = vadd(pts[0], { x: i * 30, y: 0, z: 0 }); }
  }
}

/** One step of every round-2 system. */
export function stepWorld(w) {
  const X = w.ext; if (!X) return; const G = X.G; const P = w.player;
  // --- who killed what (standing), from this step's events
  for (const e of w.events) {
    if (e._world) continue; e._world = true;
    if (e.type === 'shipDown' && !e.player) {
      const b = e.body; b.killedBy = mine(w, e.src) ? 'player' : 'other';
      if (b.killedBy === 'player' && FACTIONS[b.faction] && !b.drone) {
        const ch = repForKill(G, b.faction);
        if (ch.length && b.faction !== 'pirate' && b.faction !== 'swarm') X.say({ t: 'toast', text: `${FACTIONS[b.faction].short} standing ${fmt(ch[0].d, { decimals: 1 })}`, kind: 'bad' });
      }
    }
  }
  if (!P || P.dead) return;
  // --- harpoon, towing, salvage
  harpoonStep(w, !!X.reel);
  const T = harpoonState(w).tether;
  if (T && !T.b.job && !T.b.cache && !T.b.derelict && (T.b.kind === 'rock' || T.b.kind === 'wreck') && inDock(w, T.b)) {
    const v = salvageValue(T.b); tractorIn(w, T.b, w.station.pos);
    G.credits += v; G.stats.earned += v; G.stats.salvaged = (G.stats.salvaged || 0) + 1;
    X.say({ t: 'banner', title: 'Salvage sold', text: `${T.b.name || (T.b.kind === 'rock' ? 'Asteroid' : 'Wreck')}: +${fmt(v, { decimals: 0 })} cr` }); X.say({ t: 'sound', id: 'coin' });
  }
  tractorStep(w);
  // --- drones
  droneStep(w, G, P, X.paint);
  // --- encounters and jobs
  encounterStep(w, X);
  missionStep(w, X);
  // --- a live outpost raid
  const R = w.raid;
  if (R) {
    const o = (G.outposts || []).find(x => x.id === R.o);
    const res = o && w.outpostBody ? raidStep(w, o, w.outpostBody, R, DT) : 'timeout';
    if (res === 'won') {
      const cr = Math.round(200 * (1 + (o.danger - 1) * 0.75) / 10) * 10; G.credits += cr; G.stats.earned += cr;
      o.log.unshift(`You beat the raiders at ${o.name}.`); o.log.length = Math.min(o.log.length, 6);
      X.say({ t: 'banner', title: 'Raid beaten', text: `${o.name} thanks you: +${fmt(cr, { decimals: 0 })} cr` }); X.say({ t: 'sound', id: 'rare' });
      nextRaid(G, o, G.playTime || 0); w.raid = null;
    } else if (res === 'timeout') {
      if (o) { o.log.unshift(`Raiders stripped part of ${o.name}'s store, then left.`); o.log.length = Math.min(o.log.length, 6); nextRaid(G, o, G.playTime || 0); }
      for (const s of R.ships) if (!s.dead) s.ai = { leave: true };
      X.say({ t: 'toast', text: 'The outpost raiders have left with what they took.', kind: 'bad' });
      w.raid = null;
    }
  }
}

/** Start a live raid at this system's outpost (raidClock said 'live'). */
export function startLiveRaid(w, o) {
  if (!w.outpostBody) return null;
  const ships = spawnRaid(w, o, w.outpostBody);
  w.raid = { o: o.id, ships, start: w.t };
  const guns = levelOf(o, 'turrets') * 2;
  w.ext?.say({ t: 'banner', title: 'Raid!', text: guns ? `Raiders are attacking ${o.name}. Its ${guns} guns are firing.` : `Raiders are attacking ${o.name}, and it has no guns. Fly over and drive them off.` });
  w.ext?.say({ t: 'sound', id: 'warn' });
  return w.raid;
}
/** Leaving the system mid-raid settles it on paper (raidClock picks it up next tick). */
export function abandonLiveRaid(w, G) { if (!w?.raid) return; const o = (G.outposts || []).find(x => x.id === w.raid.o); if (o) { o.raid.live = false; o.raid.at = G.playTime || 0; } w.raid = null; }

/**
 * What F does here now (nearest first): dock at your outpost, found one at the orbit spot, trade with a merchant,
 * or join a convoy's raiders. Returns { kind, label, target } or null.
 */
export function interaction(w) {
  const P = w.player; if (!P || P.dead) return null;
  const opts = [];
  if (w.outpostBody && !w.outpostBody.dead) { const d = vdist(P.pos, w.outpostBody.pos); if (d < w.outpostBody.radius + P.radius + 150) opts.push({ d, kind: 'outpost', label: `Dock at ${w.outpostBody.name}`, target: w.outpostBody }); }
  else if (w.orbit && vdist(P.pos, w.orbit) < 260) opts.push({ d: vdist(P.pos, w.orbit), kind: 'found', label: 'Found an outpost here', target: null });
  for (const e of w.enc || []) {
    if (e.kind === 'merchant' && e.body && !e.body.dead && e.state !== 'done' && !e.body.angry) { const d = vdist(P.pos, e.body.pos); if (d < e.body.radius + P.radius + 140) opts.push({ d, kind: 'merchant', label: `Trade with ${e.body.name.split(',')[0]}`, target: e }); }
    if (e.kind === 'convoy' && e.state === 'fight' && !e.joined) { const d = vdist(P.pos, e.pos); const near = (e.ships || []).some(s => !s.dead && vdist(s.pos, P.pos) < 650); if (near) opts.push({ d: d + 1000, kind: 'join', label: 'Join the raiders', target: e }); }
  }
  opts.sort((a, b) => a.d - b.d);
  return opts[0] || null;
}
export { ENCOUNTERS };
