// Procedural buildings: one recipe per building kind, each a function of a few numbers (floors, size, style, seed),
// so the same Hotel comes in 1, 2, 3, 4… floors and every variant is repeatable. The review page lists every recipe
// with sliders for its params; the game asks for exactly the variants it needs and bakes them.
//
// Contract for a recipe (other files add recipes the same way — see js/kit/README in ../../README.md):
//   { name, group, zone?, size: [w, d] tiles (the lot), params: [{ key, label, min, max, step, def, unit? }],
//     build(p) → THREE.Group with its ground origin at the lot centre, nothing outside ±size/2 in x/z }
// Common params every recipe gets: style (one of STYLE_IDS), seed (whole number). Use p.R (a seeded random) for any
// random choice so a seed is repeatable.
import * as THREE from 'three';
import { rng } from './rng.js';
import { STYLES, STYLE_IDS } from './materials.js';
import { box, cyl, dome, storeys, slab, neonEdges, sign, roofProps, balconies, lotPad, FLOOR, bodyMat, trimMat, neonMat, glassMat } from './shapes.js';
import { wreck, DAMAGE_NAMES } from './wreck.js';

export const GROUPS = [
  { id: 'homes', label: 'Homes' },
  { id: 'shops', label: 'Shops & offices' },
  { id: 'industry', label: 'Industry' },
  { id: 'services', label: 'Services' },
  { id: 'colony', label: 'Colony' },
  { id: 'landmarks', label: 'Landmarks' },
  { id: 'outposts', label: 'Outposts' },
  { id: 'defence', label: 'Walls & turrets' },
  { id: 'creatures', label: 'Creatures' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'swarm', label: 'Swarm' },
  { id: 'army', label: 'Rival army' },
];

/** Categories to filter the catalog by game or genre (a recipe's optional `genre`: an array of these ids). Arcline's
 *  futuristic city is 'neon'; every recipe without a `genre` counts as neon. */
export const CATEGORIES = [
  { id: 'neon', label: 'Neon city' },
  { id: 'industrial', label: 'Industrial & workshop' },
  { id: 'military', label: 'Military' },
  { id: 'alien', label: 'Alien' },
  { id: 'moon', label: 'Moon outpost' },     // Overdrive Frame round 5 (kit/moon.js)
];
/** Groups whose recipes are buildings: each gets the common `damage` setting (whole → damaged → burning → rubble). */
export const WRECK_GROUPS = ['homes', 'shops', 'industry', 'services', 'parks', 'colony', 'landmarks', 'outposts'];

export const RECIPES = {};
/** Register recipes (other kit files call this). A recipe without a `genre` is in the 'neon' category. */
export function addRecipes(obj) { for (const r of Object.values(obj)) if (!Array.isArray(r.genre)) r.genre = ['neon']; Object.assign(RECIPES, obj); }
/** The categories a recipe is in. */
export function genreOf(id) { const g = RECIPES[id]?.genre; return Array.isArray(g) && g.length ? g : ['neon']; }

/** Settings every recipe of a kind gets on top of its own params (the review page shows them as sliders too). */
export function commonParams(id) {
  const r = RECIPES[id];
  return r && WRECK_GROUPS.includes(r.group) && !r.noWreck
    ? [{ key: 'damage', label: 'Damage', min: 0, max: 3, step: 1, def: 0, names: DAMAGE_NAMES }] : [];
}

const neonOf = (p, i = 0) => STYLES[p.style].neon[(p.seed + i) % STYLES[p.style].neon.length];

addRecipes({
  'res-pods': {
    name: 'Habitat Pods', group: 'homes', zone: 'R', size: [1, 1],
    params: [{ key: 'floors', label: 'Storeys', min: 1, max: 3, step: 1, def: 1 }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#4f5a52');
      const n = p.R.int(2, 3);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.3, z = p.R.range(-0.18, 0.18);
        const top = storeys(g, { w: 0.24, d: 0.3, floors: p.floors, x, z, y: y0, style: p.style, kind: 'bands', seed: p.seed + i, bay: 0.12 });
        dome(g, 0.15, bodyMat(p.style, i), x, top, z, { squash: 0.55 });
        box(g, 0.05, 0.02, 0.02, neonMat(neonOf(p, i), 0.4), x, y0 + 0.12, z + 0.16);
      }
      // a little garden strip with glowing shrubs
      for (let i = 0; i < 3; i++) dome(g, 0.05, bodyMat('pearl', 0, { color: '#3f9e6a' }), p.R.range(-0.4, 0.4), y0, p.R.range(0.3, 0.42), { squash: 1 });
      return g;
    },
  },
  'res-terrace': {
    name: 'Terrace Homes', group: 'homes', zone: 'R', size: [2, 1],
    params: [{ key: 'floors', label: 'Storeys', min: 2, max: 5, step: 1, def: 3 }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 2, 1);
      // stepped blocks: each unit one storey shorter toward the street
      const units = 4;
      for (let i = 0; i < units; i++) {
        const x = -0.75 + i * 0.5, f = Math.max(1, p.floors - (i % 2));
        const top = storeys(g, { w: 0.44, d: 0.62, floors: f, x, z: -0.08, y: y0, style: p.style, kind: 'grid', seed: p.seed + i });
        slab(g, 0.48, 0.66, p.style, x, top, -0.08);
        box(g, 0.44, 0.02, 0.2, trimMat(p.style), x, y0 + FLOOR, 0.33);           // porch roof
        box(g, 0.03, 0.2, 0.03, neonMat(neonOf(p, i), 0.3), x + 0.18, y0, 0.36);  // door light
      }
      return g;
    },
  },
  'res-block': {
    name: 'Apartment Block', group: 'homes', zone: 'R', size: [2, 2],
    params: [{ key: 'floors', label: 'Storeys', min: 4, max: 16, step: 1, def: 8 }, { key: 'wings', label: 'Wings', min: 1, max: 2, step: 1, def: 2 }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 2, 2);
      const podium = storeys(g, { w: 1.8, d: 1.8, floors: 1, y: y0, style: p.style, kind: 'curtain', seed: p.seed });
      slab(g, 1.86, 1.86, p.style, 0, podium);
      const wings = p.wings === 2 ? [[-0.42, 0, 0.8, 1.6], [0.48, -0.4, 0.7, 0.8]] : [[0, 0, 1.3, 1.3]];
      wings.forEach(([x, z, w, d], i) => {
        const f = i === 0 ? p.floors : Math.max(2, Math.round(p.floors * 0.6));
        const top = storeys(g, { w, d, floors: f, x, z, y: podium, style: p.style, kind: 'grid', seed: p.seed + i });
        balconies(g, w, d, podium, f, p.style, 2, x, z);
        slab(g, w + 0.04, d + 0.04, p.style, x, top, z);
        roofProps(g, w * 0.8, d * 0.8, top + 0.04, p.style, p.R, { tank: true, x, z });
      });
      neonEdges(g, 1.8, 1.8, neonOf(p), 0, podium - 0.01, 0);
      return g;
    },
  },
  'res-tower': {
    name: 'Residential Tower', group: 'homes', zone: 'R', size: [2, 2],
    params: [{ key: 'floors', label: 'Storeys', min: 12, max: 60, step: 1, def: 30 }, { key: 'taper', label: 'Setbacks', min: 0, max: 3, step: 1, def: 2 }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 2, 2);
      let y = storeys(g, { w: 1.7, d: 1.7, floors: 2, y: y0, style: p.style, kind: 'curtain', seed: p.seed });
      y = slab(g, 1.76, 1.76, p.style, 0, y);
      const parts = p.taper + 1; let w = 1.25, left = p.floors - 2;
      for (let i = 0; i < parts; i++) {
        const f = i === parts - 1 ? left : Math.round(left * 0.5);
        left -= f;
        const top = storeys(g, { w, d: w, floors: f, y, style: p.style, kind: i % 2 ? 'bands' : 'grid', seed: p.seed + i });
        balconies(g, w, w, y, f, p.style, 3);
        neonEdges(g, w, w, neonOf(p, i), 0, top, 0, 0.025);
        y = slab(g, w + 0.05, w + 0.05, p.style, 0, top);
        w *= 0.8;
        if (left <= 0) break;
      }
      // crown: a glowing ring and a spire
      cyl(g, w * 0.45, 0.25, glassMat(p.style), 0, y, 0, { rt: w * 0.3, seg: 16 });
      cyl(g, 0.02, 0.6, trimMat(p.style), 0, y + 0.25, 0, { seg: 6 });
      box(g, 0.05, 0.05, 0.05, neonMat('#ff3030', 0.9), 0, y + 0.85, 0);
      return g;
    },
  },
  'com-market': {
    name: 'Street Market', group: 'shops', zone: 'C', size: [1, 1],
    params: [{ key: 'stalls', label: 'Stalls', min: 2, max: 6, step: 1, def: 4 }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#62666f');
      for (let i = 0; i < p.stalls; i++) {
        const x = ((i % 3) - 1) * 0.3, z = i < 3 ? -0.2 : 0.2;
        box(g, 0.22, 0.18, 0.2, bodyMat(p.style, i), x, y0, z);
        box(g, 0.28, 0.02, 0.26, neonMat(neonOf(p, i), 0.6), x, y0 + 0.2, z + 0.03);     // glowing awning
        box(g, 0.2, 0.06, 0.01, neonMat(neonOf(p, i + 1), 0.8), x, y0 + 0.24, z + 0.12); // little sign
      }
      return g;
    },
  },
  'com-shops': {
    name: 'Shop Row', group: 'shops', zone: 'C', size: [2, 1],
    params: [{ key: 'floors', label: 'Storeys', min: 1, max: 4, step: 1, def: 2 }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 2, 1);
      const top = storeys(g, { w: 1.86, d: 0.78, floors: p.floors, y: y0, style: p.style, kind: 'bands', seed: p.seed, z: -0.05 });
      // shopfronts: glass ground floor + a sign band of holo panels
      box(g, 1.8, FLOOR * 0.9, 0.02, glassMat(p.style), 0, y0, 0.35);
      for (let i = 0; i < 4; i++) box(g, 0.36, 0.07, 0.03, neonMat(neonOf(p, i), 0.75), -0.69 + i * 0.46, y0 + FLOOR, 0.36);
      slab(g, 1.9, 0.82, p.style, 0, top, -0.05);
      roofProps(g, 1.6, 0.6, top + 0.04, p.style, p.R, { antenna: p.floors > 2, z: -0.05 });
      if (p.floors >= 2) sign(g, '+x', neonOf(p, 2), p.seed, { x: 0.96, y: y0 + FLOOR, z: 0.1, h: Math.min(0.5, p.floors * FLOOR * 0.7) });
      return g;
    },
  },
  'com-office': {
    name: 'Office Tower', group: 'shops', zone: 'C', size: [2, 2],
    params: [{ key: 'floors', label: 'Storeys', min: 6, max: 70, step: 1, def: 34 }, { key: 'shape', label: 'Shape', min: 0, max: 2, step: 1, def: 1, names: ['Slab', 'Setback', 'Twin'] }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#646b76');
      let y = storeys(g, { w: 1.8, d: 1.8, floors: 2, y: y0, style: p.style, kind: 'curtain', seed: p.seed });
      y = slab(g, 1.86, 1.86, p.style, 0, y);
      neonEdges(g, 1.8, 1.8, neonOf(p), 0, y0 + 2 * FLOOR, 0);
      if (p.shape === 2) {
        for (const [x, f] of [[-0.42, p.floors], [0.42, Math.round(p.floors * 0.75)]]) {
          const top = storeys(g, { w: 0.7, d: 1.3, floors: f, x, y, style: p.style, kind: 'curtain', seed: p.seed + x * 10 });
          slab(g, 0.74, 1.34, p.style, x, top); roofProps(g, 0.6, 1.1, top + 0.04, p.style, p.R, { x });
        }
        box(g, 0.2, 0.12, 0.6, glassMat(p.style), 0, y + Math.round(p.floors * 0.5) * FLOOR, 0);   // sky bridge
        return g;
      }
      const steps = p.shape === 1 ? 3 : 1; let w = 1.45, left = p.floors - 2;
      for (let i = 0; i < steps && left > 0; i++) {
        const f = i === steps - 1 ? left : Math.round(left * 0.55); left -= f;
        const top = storeys(g, { w, d: w * 0.9, floors: f, y, style: p.style, kind: 'curtain', seed: p.seed + i });
        y = slab(g, w + 0.04, w * 0.9 + 0.04, p.style, 0, top); w *= 0.78;
      }
      roofProps(g, w, w * 0.9, y, p.style, p.R, { helipad: p.floors > 30 });
      return g;
    },
  },
  'com-hotel': {
    name: 'Hotel', group: 'shops', zone: 'C', size: [2, 2],
    params: [{ key: 'floors', label: 'Storeys', min: 1, max: 48, step: 1, def: 4 }],
    build(p) {
      // One recipe from a 1-storey motel court to a 48-storey tower: podium (lobby) + tower + vertical sign; a roof
      // pool from 8 storeys, a helipad from 24.
      const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#5d6470');
      const low = p.floors <= 3;
      const lobby = storeys(g, { w: low ? 1.8 : 1.84, d: low ? 1.2 : 1.84, floors: 1, y: y0, z: low ? -0.25 : 0, style: p.style, kind: 'curtain', seed: p.seed });
      box(g, 0.7, 0.03, 0.3, neonMat(neonOf(p), 0.6), 0, y0 + FLOOR * 0.95, low ? 0.48 : 0.8);      // entrance canopy (inside the lot)
      if (low) {
        // motel court: rooms around a little pool
        const top = p.floors > 1 ? storeys(g, { w: 1.8, d: 1.2, floors: p.floors - 1, y: lobby, z: -0.25, style: p.style, kind: 'grid', seed: p.seed + 1 }) : lobby;
        slab(g, 1.86, 1.26, p.style, 0, top, -0.25);
        box(g, 0.8, 0.02, 0.4, bodyMat('pearl', 0, { color: '#3cc6e8', metal: 0.2, rough: 0.1 }), 0.3, y0 + 0.005, 0.6);
        sign(g, '+x', neonOf(p, 1), p.seed, { x: 0.92, y: lobby, z: 0.3, h: 0.45, w: 0.14 });
        return g;
      }
      let y = slab(g, 1.9, 1.9, p.style, 0, lobby);
      const rest = p.floors - 1;
      const top = storeys(g, { w: 1.2, d: 1.5, floors: rest, x: -0.2, y, style: p.style, kind: 'grid', seed: p.seed + 2 });
      balconies(g, 1.2, 1.5, y, rest, p.style, 1, -0.2, 0);
      y = slab(g, 1.26, 1.56, p.style, -0.2, top);
      // the vertical sign runs down the tower's right corner
      sign(g, '+x', neonOf(p, 1), p.seed, { x: 0.42, y: lobby + FLOOR * 0.5, z: 0.55, h: Math.min(rest * FLOOR * 0.8, 3), w: 0.16 });
      if (p.floors >= 24) roofProps(g, 1.2, 1.5, y, p.style, p.R, { helipad: true, antenna: false, x: -0.2 });
      else if (p.floors >= 8) { box(g, 0.7, 0.03, 0.5, bodyMat('pearl', 0, { color: '#3cc6e8', metal: 0.2, rough: 0.1 }), -0.2, y, 0.3); neonEdges(g, 0.72, 0.52, '#3ff0ff', -0.2, y + 0.03, 0.3, 0.015, 0.2); }
      else roofProps(g, 1.0, 1.3, y, p.style, p.R, { x: -0.2 });
      return g;
    },
  },
});

/** Build any recipe. params: recipe params + style + seed (missing ones take their defaults). */
export function build(id, params = {}) {
  const r = RECIPES[id]; if (!r) throw new Error(`unknown recipe ${id}`);
  const p = { style: 'chrome', seed: 1 };
  for (const k of r.params || []) p[k.key] = k.def;
  const common = commonParams(id);
  for (const k of common) p[k.key] = k.def;
  Object.assign(p, params);
  p.R = rng(p.seed * 9973 + id.length);
  const g = r.build(p);
  // wreck stages are a post-process on the finished model, so every building gets them without its own code
  if (common.length && p.damage > 0) wreck(g, Math.round(p.damage), p.seed, { size: r.size, style: STYLES[p.style] ? p.style : 'concrete', smoke: p.smoke !== 0 });   // smoke: 0 = no baked smoke (a game draws its own, live)
  g.userData.recipe = id; g.userData.params = { ...p, R: undefined };
  return g;
}

/** The defaults of a recipe's params, common ones included (for the review page and the game's catalog). */
export function defaults(id) { const o = { style: 'chrome', seed: 1 }; for (const k of [...(RECIPES[id].params || []), ...commonParams(id)]) o[k.key] = k.def; return o; }
export { STYLE_IDS, STYLES };
