// Galaxy events (PLAN §E1 E10 "galaxy events" + E4 "treasure systems"). Every so often something sweeps a region
// of the galaxy for a while: an alien invasion, a gold rush, a pirate war, or one star turns into a treasure
// system. They come from the galaxy seed and the play clock alone (G.playTime), cut into windows, so the same
// save always sees the same events at the same time, and the star map can show them before you get there.
//
// Readers (each multiplier is applied in exactly one place):
//   eventMods(gal, sysId, t).luck   -> world.js destroy() adds it to the loot luck (via w.eventLuck)
//   eventMods(...).rich             -> sectors.js rock fields: extra chance a rock is rich (via w.eventRich)
//   eventMods(...).spawn            -> encounters.js eventSpawner(): extra alien swarms / corsair fleets / raided convoys
//   eventMods(...).bounty           -> encounters.js onKill(): credits per kill of the named faction kind
//   eventMods(...).tough            -> encounters.js: hostile ships in a treasure system hit harder and take more
//
// Pure: no DOM, no clock.

import { rng, hash } from '../core/math.js';

/** One window of the event clock, in seconds of play. A new set of events is rolled for each window. */
export const EVENT_WINDOW = 1200;

export const EVENT_KINDS = {
  invasion: { name: 'Alien invasion', color: '#a6ff4a', gives: 'Alien swarms pour in. Every alien ship you destroy pays a bounty.' },
  goldrush: { name: 'Gold rush', color: '#ffd84a', gives: 'Rich asteroids everywhere: far more ore, and better ore.' },
  piratewar: { name: 'Pirate war', color: '#ff7a4a', gives: 'Corsair fleets raid the convoys. Corsair kills pay a bounty.' },
  treasure: { name: 'Treasure system', color: '#ff9a1f', gives: 'Much better drops, and much tougher enemies.' },
};

/** The events rolled for one window (each lasts 60-120% of a window, so some overlap into the next). */
export function eventsForWindow(gal, k) {
  if (k < 0) return [];
  const r = rng(hash('gevent', gal.seed, k));
  const out = [];
  const n = 1 + (r() < 0.55 ? 1 : 0);
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const kind = r.weighted([{ id: 'invasion', w: 3 }, { id: 'goldrush', w: 3 }, { id: 'piratewar', w: 3 }, { id: 'treasure', w: 3 }], x => x.w).id;
    // never at the starting star (a new pilot should not wake up in a war), aliens only past danger 1
    const pool = gal.systems.filter(s => s.id !== gal.start && !used.has(s.id) && (kind === 'goldrush' || s.tier >= 2));
    if (!pool.length) continue;
    const center = r.pick(pool);
    const reach = kind === 'treasure' ? 0 : 1 + (r() < 0.35 ? 1 : 0);
    const systems = region(gal, center.id, reach).filter(id => id !== gal.start && (kind === 'goldrush' || gal.systems[id].tier >= 2));
    for (const id of systems) used.add(id);
    const start = k * EVENT_WINDOW + Math.floor(r() * EVENT_WINDOW * 0.5);
    const end = start + Math.floor(EVENT_WINDOW * (0.6 + r() * 0.6));
    out.push({ id: `ev${k}-${i}`, kind, center: center.id, systems, start, end });
  }
  return out;
}

/** Every event running at play time t (seconds). */
export function activeEvents(gal, t) {
  const k = Math.floor((t || 0) / EVENT_WINDOW);
  const out = [];
  for (let j = k - 2; j <= k; j++) for (const e of eventsForWindow(gal, j)) if (e.start <= t && t < e.end) out.push(e);
  return out;
}
/** Events that will start before `ahead` seconds from now (the star map's "coming soon" line). */
export function upcomingEvents(gal, t, ahead = 600) {
  const k = Math.floor((t || 0) / EVENT_WINDOW);
  const out = [];
  for (let j = k; j <= k + 1; j++) for (const e of eventsForWindow(gal, j)) if (e.start > t && e.start <= t + ahead) out.push(e);
  return out;
}

/** The events touching one star. */
export const eventsAt = (gal, sysId, t) => activeEvents(gal, t).filter(e => e.systems.includes(sysId));

/** What the events at one star change. All zero when nothing is happening. */
export function eventMods(gal, sysId, t) {
  const m = { luck: 0, rich: 0, tough: 1, spawn: { aliens: 0, pirates: 0, raids: 0 }, bounty: { aliens: 0, pirates: 0 }, kinds: [] };
  for (const e of eventsAt(gal, sysId, t)) {
    m.kinds.push(e.kind);
    const tier = gal.systems[sysId].tier;
    if (e.kind === 'invasion') { m.spawn.aliens += 1; m.bounty.aliens += 60 * tier; }
    if (e.kind === 'goldrush') { m.rich += 0.35; m.luck += 0.1; }
    if (e.kind === 'piratewar') { m.spawn.pirates += 1; m.spawn.raids += 1; m.bounty.pirates += 50 * tier; }
    if (e.kind === 'treasure') { m.luck += 0.9; m.tough = 1.35; m.rich += 0.1; }
  }
  return m;
}

/** The stars within `reach` lanes of a star (itself included). */
function region(gal, id, reach) {
  const seen = new Set([id]); let front = [id];
  for (let i = 0; i < reach; i++) { const next = []; for (const s of front) for (const l of gal.systems[s].links) if (!seen.has(l)) { seen.add(l); next.push(l); } front = next; }
  return [...seen];
}

/** "12 min" / "45 s" for a timer on the star map. */
export const timeLeft = (e, t) => { const s = Math.max(0, e.end - t); return s >= 60 ? `${Math.ceil(s / 60)} min` : `${Math.ceil(s)} s`; };
