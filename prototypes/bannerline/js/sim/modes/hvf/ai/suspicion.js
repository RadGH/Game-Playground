// Stream E — the hunter AI's SUSPICION MAP (docs/hvf-PLAN.md §10, R13). Points of interest are the
// map's graph nodes (glades, junctions, landmarks, hollow mouths) and its pockets (hollows): the forest
// layout is public, what is IN it is not. Each think, evidence the hunter's team could perceive is spread
// onto the points within EVIDENCE_R metres:
//
//   seen building (the team's memory)  10      animal seen now           5
//   watchstone sees an animal           6      stray track (projected)   4  (Veteran / Commander)
//   noise heard (the sim's own rule)    3      unexplored pocket         1
//
// Suspicion decays every think by `hunt.decay` (Recruit fast, Commander slow), and a point the team can
// see with nothing on it is marked checked (its suspicion mostly cleared). The hunter goes to
// argmax(suspicion / (travel + 30 m)).
//
// Noise: an animal calls on its own beat ((tick + id * 7) % period === 0, animals.js); a hunter within
// its noise radius hears it through the fog. The AI applies the same rule to the beats since its last
// think — the same information a player gets as a ripple on the minimap.

import { HUNTERS } from '../state.js';
import { canSee, hasBit } from '../vision.js';
import { sin, cos } from '../../../mathx.js';
import { d2, dist, live, cellOf } from './common.js';

export const EVIDENCE_R = 25;
export const W = { building: 10, animal: 5, ward: 6, track: 4, noise: 3, pocket: 1 };

/** The points of interest for a map (cached per map; plain objects, not state). */
const POIS = new WeakMap();
export function poisOf(map) {
  let p = POIS.get(map);
  if (p) return p;
  p = map.graph.nodes.filter(n => n.kind !== 'kennel').map(n => ({ x: n.x, z: n.z, kind: n.kind, hollow: n.hollow ?? -1 }))
    .concat(map.hollows.map(h => ({ x: h.x, z: h.z, kind: 'pocket', hollow: h.id, cells: h.cells })));
  POIS.set(map, p);
  return p;
}

/**
 * Does the hunters' team know this point is there? Trails and glades are the map everyone reads; a
 * hollow (and the mouth of one) is a secret until some of it has been seen — no peeking at the
 * generator's hollow list.
 */
export function known(state, map, poi) {
  if (poi.kind !== 'pocket' && poi.kind !== 'hollowMouth') return true;
  const ex = state.hvf.explored[HUNTERS];
  if (poi.kind === 'hollowMouth') return hasBit(ex, cellOf(map, poi.x, poi.z));
  for (const c of poi.cells) if (hasBit(ex, c)) return true;
  return false;
}

/** Remember a point of evidence itself (for following a bleat into a pocket nobody has seen yet). */
function remember(m, x, z, w, tick) {
  if (!m.hot) m.hot = [];
  for (const h of m.hot) if (d2(h.x, h.z, x, z) < 64) { h.w = Math.min(h.w + w, 30); h.x = Math.round((h.x + x) / 2); h.z = Math.round((h.z + z) / 2); h.tick = tick; return; }
  m.hot.push({ x: Math.round(x), z: Math.round(z), w, tick, tries: 0 });
  if (m.hot.length > 12) { let k = 0; for (let i = 1; i < m.hot.length; i++) if (m.hot[i].w < m.hot[k].w) k = i; m.hot.splice(k, 1); }
}

function spread(map, sus, x, z, w, state) {
  const P = poisOf(map), R2 = EVIDENCE_R * EVIDENCE_R;
  for (let i = 0; i < P.length; i++) {
    if (state && !known(state, map, P[i])) continue;
    const dd = d2(P[i].x, P[i].z, x, z);
    if (dd > R2) continue;
    sus[i] += w * (1 - Math.sqrt(dd) / EVIDENCE_R);
  }
}

/** Fold this think's evidence into p.ai.sus; returns { hot: [{x, z, w, kind}] } (the strongest direct sightings). */
export function updateSuspicion(ctx, p, K, me) {
  const { state, data, map } = ctx;
  const m = p.ai, P = poisOf(map), H = K.hunt;
  if (!m.sus || m.sus.length !== P.length) { m.sus = new Array(P.length).fill(0); m.checked = new Array(P.length).fill(-1); }
  const sus = m.sus;
  for (let i = 0; i < sus.length; i++) sus[i] = Math.round(sus[i] * H.decay * 1000) / 1000;
  const since = m.lastThink ?? state.tick - 1;
  const hot = [];
  // seen buildings (team memory)
  for (const b of state.hvf.seen[HUNTERS]) { spread(map, sus, b.x, b.z, W.building, state); hot.push({ x: b.x, z: b.z, w: W.building, kind: 'building', id: b.id }); }
  // animals the team sees now (watchstone sightings count more: the farmer cannot know they were seen)
  const wards = state.ents.filter(w => w.kind === 'ward' && w.team === HUNTERS && live(w));
  let n = 0;
  for (const a of state.ents) {
    if (a.kind !== 'animal' || !live(a) || !canSee(ctx, HUNTERS, a)) continue;
    const byWard = wards.some(w => d2(w.x, w.z, a.x, a.z) <= 144);
    spread(map, sus, a.x, a.z, byWard ? W.ward : W.animal, state);
    remember(m, a.x, a.z, byWard ? W.ward : W.animal, state.tick);
    if (n++ < 12) hot.push({ x: a.x, z: a.z, w: W.animal, kind: 'animal', id: a.id });
  }
  // tracks (Tracking, level 3+): the print points where the animal went, usually home
  if (H.tracks && p.level >= data.hvf.hunter.tracking.level) {
    const vis = state.hvf.vision[HUNTERS];
    for (const t of state.hvf.tracks) {
      if (t.tick <= since - 20 || !hasBit(vis, cellOf(map, t.x, t.z))) continue;
      spread(map, sus, t.x + sin(t.dir) * 10, t.z + cos(t.dir) * 10, W.track, state);
      remember(m, t.x + sin(t.dir) * 10, t.z + cos(t.dir) * 10, W.track, state.tick);
    }
  }
  // noise: the animals whose beat fell since the last think, within earshot of me
  if (me && me.alive && H.noise > 0) {
    for (const a of state.ents) {
      if (a.kind !== 'animal' || !live(a)) continue;
      const K2 = data.hvf.animals.kinds[a.type], period = Math.round(K2.noiseEvery * 20);
      if (d2(me.x, me.z, a.x, a.z) > K2.noise * K2.noise) continue;
      let beat = false;
      for (let t = since + 1; t <= state.tick && !beat; t++) if ((t + a.id * 7) % period === 0) beat = true;
      if (beat) { spread(map, sus, Math.round(a.x), Math.round(a.z), W.noise * H.noise, state); remember(m, a.x, a.z, W.noise * H.noise, state.tick); }
    }
  }
  // unexplored pockets, and points in sight with nothing on them
  const vis = state.hvf.vision[HUNTERS], ex = state.hvf.explored[HUNTERS];
  for (let i = 0; i < P.length; i++) {
    const c = cellOf(map, P[i].x, P[i].z);
    // unexplored ground: a weak pull toward places nobody has looked at yet
    if (!hasBit(ex, c) && known(state, map, P[i])) sus[i] += W.pocket * (1 - H.decay) * 3;
    if (hasBit(vis, c) && !hot.some(h => d2(h.x, h.z, P[i].x, P[i].z) < 100)) { sus[i] *= 0.3; m.checked[i] = state.tick; }
  }
  if (m.hot) { for (const h of m.hot) h.w = Math.round(h.w * H.decay * 1000) / 1000; m.hot = m.hot.filter(h => h.w > 0.3); }
  m.lastThink = state.tick;
  return { hot };
}

/** Where to go: argmax suspicion / (travel + 30), a little sticky; or the stalest unchecked glade. */
export function bestPoi(ctx, p, me) {
  const { state, map } = ctx;
  const P = poisOf(map), m = p.ai;
  let best = -1, bs = 0;
  const banned = i => m.banned && m.banned[i] > state.tick;
  for (let i = 0; i < P.length; i++) {
    if (!known(state, map, P[i]) || banned(i)) continue;
    let s = m.sus[i] / (dist(me.x, me.z, P[i].x, P[i].z) + 30);
    if (i === m.target) s *= 1.25;
    if (s > bs) { bs = s; best = i; }
  }
  if (best >= 0 && m.sus[best] > 0.4) return best;
  // nothing to go on: the glade or pocket checked longest ago (never = first), nearest first
  let stale = -1, ss = -Infinity;
  for (let i = 0; i < P.length; i++) {
    if (P[i].kind === 'commons' || !known(state, map, P[i]) || banned(i)) continue;
    const age = m.checked[i] < 0 ? 100000 : state.tick - m.checked[i];
    const s = Math.min(age, 6000) - dist(me.x, me.z, P[i].x, P[i].z) * 8;
    if (s > ss) { ss = s; stale = i; }
  }
  return stale;
}
