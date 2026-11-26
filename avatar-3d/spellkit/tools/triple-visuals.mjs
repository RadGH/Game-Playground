// Spell Kit: the "TRIPLE the graphics" pass (Oathwild owner 2026-11-26: "TRIPLE the amount of graphics used EVERYWHERE
// for ALL spells and attacks … I want things to get blown apart by fireball explosions and smack things in a circle").
// Rewrites prototypes/oathwild/data/spell-visuals.json through the parsed object (README lesson: never as text):
//   1. every layer: ~3x the particles (burst / rate / max), bigger sizes (sparks and motes most), longer lives on
//      impacts and decals, brighter lights, longer + wider trails, stronger shakes (rules in grow() below);
//   2. missing layers added per kind and school: a wind-up for EVERY visual (≥ 30 motes gathering at the hands, a glow,
//      a spinning rune at the feet, a ring closing), a release (white + coloured flash, motes out, a camera-facing
//      ring, a "bloom" of big shapes round the caster), a halo round every missile body (≥ 1 m), impacts with a flash
//      ≥ 1.3 m, a ground shockwave ring, school debris (embers / ice / rock / leaves…), a school decal that lingers, a
//      light and a shake; the new `point` phase (drawn at each point of the spell's true shape) and `area` phase (once
//      at the real radius: rune 2.2 R, rings rising off the rim, rim motes, a flat ring of shards skidding out);
//   3. new visuals for the rebuilt class trees: fireball, ground_slam, leap_slam, whirlwind, cleave_arc, shield_bash,
//      charge_rush, line_wave, ice_spikes, earthquake, war_cry (fallbacks by shape x element point at them).
// Safe to run more than once: `look` in the file records the pass; the multiply step runs only below it.
//   node avatar-3d/spellkit/tools/triple-visuals.mjs [--force]      then: node avatar-3d/spellkit/tools/map-spells.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', '..', '..', 'prototypes', 'oathwild', 'data', 'spell-visuals.json');
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const LOOK = 3;
const force = process.argv.includes('--force');
const r2 = v => Math.round(v * 100) / 100;
const PH = ['windup', 'release', 'travel', 'impact', 'point', 'area', 'linger', 'aura', 'beam', 'sweep'];
const layersOf = (v, ph) => (Array.isArray(v[ph]) ? v[ph] : v[ph]?.layers || null);

// ------------------------------------------------------------------------------------------------ school families
const FAM = { ice: 'ice', frost: 'ice', fire: 'fire', holy: 'holy', dawn: 'holy', nature: 'nature', poison: 'poison', fel: 'poison',
  shadow: 'shadow', blood: 'blood', bleed: 'blood', lightning: 'lightning', haste: 'lightning', arcane: 'arcane', moon: 'arcane', true: 'arcane', physical: 'physical' };
const fam = s => FAM[s] || 'arcane';
const DUST = ['#8a7a60', '#6a5a48', '#4a4030'];
const ROCK = ['#7a6a58', '#5a4c3e', '#3a3028'];
const SMOKE_DARK = ['#3a2a22', '#2a201c', '#1a1412'];

/** flying debris for an impact of `n` pieces, by school family */
function debris(f, n, at = 'point') {
  const sp = { type: 'emitter', at, tex: 'spark_streak', burst: n, dir: 'outUp', speed: [5, 10], spread: 0.5, gravity: 10, drag: 0.4, life: [0.5, 1], size: [0.08, 0.14], stretch: 0.06, color: ['white', 'accent', 'hot'] };
  const rocks = { type: 'emitter', at, blend: 'normal', tex: 'shard_ice', burst: Math.round(n * 0.6), dir: 'outUp', speed: [4, 9], spread: 0.6, gravity: 14, drag: 0.3, spin: [3, 9], life: [0.7, 1.2], size: [0.14, 0.3], color: ROCK, edge: '#201810', alpha: [1, 1, 0.8] };
  const dust = { type: 'emitter', at, blend: 'normal', texs: ['dust_1', 'smoke_1', 'smoke_3'], burst: Math.round(n * 0.4), shape: 'ring', radius: 0.4, onGround: true, offset: [0, 0.3, 0], dir: 'out', speed: [2.5, 5], drag: 2, life: [0.9, 1.6], size: [1, 1.8], sizeCurve: [0.5, 1, 1.5], alpha: [0, 0.5, 0], color: DUST, edge: '#2a2418' };
  switch (f) {
    case 'fire': return [sp,
      { type: 'emitter', at, texs: ['flame_1', 'flame_2', 'flame_3', 'flame_5'], burst: Math.round(n * 0.5), shape: 'sphere', radius: 0.6, dir: 'outUp', speed: [1.5, 4], gravity: -1, drag: 1.5, life: [0.45, 0.8], size: [0.6, 1.1], sizeCurve: [0.6, 1, 0.3], spin: [1, 3], color: ['hot', 'mid', 'deep'] },
      { type: 'emitter', at, blend: 'normal', texs: ['smoke_1', 'smoke_2', 'smoke_3'], burst: Math.round(n * 0.4), shape: 'sphere', radius: 0.6, dir: 'up', speed: [0.6, 1.6], life: [1.2, 2.2], size: [1, 1.8], sizeCurve: [0.5, 1, 1.6], alpha: [0, 0.55, 0], color: SMOKE_DARK, edge: '#120c0a', delay: 0.06 }];
    case 'ice': return [{ ...sp, tex: 'shard_ice', size: [0.18, 0.34], stretch: 0.03, spin: [2, 6], color: ['white', 'accent', 'hot'] },
      { type: 'emitter', at, tex: 'shard_ice', burst: Math.round(n * 0.3), shape: 'disc', radius: 0.8, onGround: true, rot: 0, dir: 'up', speed: [1, 2.5], gravity: 6, life: [0.6, 1], size: [0.45, 0.8], color: ['white', 'hot', 'mid'] },
      { type: 'emitter', at, blend: 'normal', texs: ['smoke_1', 'smoke_2'], burst: Math.round(n * 0.35), shape: 'sphere', radius: 0.6, dir: 'out', speed: [1, 2.5], drag: 2, life: [1, 1.8], size: [0.9, 1.5], sizeCurve: [0.6, 1, 1.5], alpha: [0, 0.45, 0], color: ['smoke'], edge: 'hot' }];
    case 'holy': return [{ ...sp, tex: 'mote_star', size: [0.1, 0.18], stretch: 0, gravity: 1, drag: 2, color: ['white', 'hot', 'accent'] },
      { type: 'emitter', at, tex: 'leaf', burst: Math.round(n * 0.2), shape: 'sphere', radius: 0.5, dir: 'outUp', speed: [1, 2.5], gravity: 0.6, drag: 1.5, swirl: 1.5, spin: [1, 3], life: [1.2, 1.8], size: [0.22, 0.32], color: ['white', 'hot', 'mid'] },
      { type: 'shell', at, shape: 'cylinder', tex: 'band_light', radius: 0.45, height: 4, heightGrow: [0.1, 1, 0.18], y: 0, life: 0.75, fadeIn: 0, fadeOut: 0.45, opacity: 0.9, fade: 1.1, scroll: [0, -1.2], repeat: [3, 1], color: 'white', edge: 'hot' }];
    case 'nature': return [{ ...sp, tex: 'leaf', stretch: 0, size: [0.2, 0.32], gravity: 3, drag: 1.2, spin: [2, 6], color: ['hot', 'mid', 'deep'] },
      { ...dust, burst: Math.round(n * 0.3) }, { ...sp, burst: Math.round(n * 0.4), tex: 'mote_star', size: [0.1, 0.16], stretch: 0, gravity: 1, color: ['white', 'accent', 'hot'] }];
    case 'poison': return [{ type: 'emitter', at, blend: 'normal', tex: 'cloud_poison', burst: Math.round(n * 0.4), shape: 'sphere', radius: 0.6, dir: 'out', speed: [1.5, 3.5], drag: 2, life: [1.1, 1.8], size: [1.1, 1.8], alpha: [0, 0.55, 0], color: ['mid'], edge: 'smoke' },
      { ...sp, tex: 'dot_soft', stretch: 0, size: [0.1, 0.18], color: ['hot', 'accent', 'deep'] }];
    case 'shadow': case 'blood': return [{ ...sp, texs: ['flame_2', 'flame_4', 'spark_streak'], tex: undefined, color: ['hot', 'accent', 'deep'] },
      { type: 'emitter', at, blend: 'normal', texs: ['smoke_2', 'smoke_4'], burst: Math.round(n * 0.5), shape: 'sphere', radius: 0.6, dir: 'out', speed: [1.5, 3], drag: 2, life: [1, 1.6], size: [1, 1.6], sizeCurve: [0.6, 1, 1.4], alpha: [0, 0.7, 0], color: ['smoke'], edge: '#000000' }];
    case 'lightning': return [{ ...sp, color: ['white', 'accent', 'hot'] },
      { type: 'emitter', at, tex: 'bolt_fork', burst: Math.max(3, Math.round(n * 0.08)), shape: 'sphere', radius: 0.8, life: [0.08, 0.16], size: [1.2, 1.8], color: ['white', 'hot', 'mid'], alpha: [1, 1, 0] }];
    case 'physical': return [{ ...sp, color: ['white', 'accent', '#ff7a20'] }, rocks, dust];
    default: return [{ ...sp, tex: 'mote_star', stretch: 0, size: [0.1, 0.16], gravity: 2, drag: 2, color: ['white', 'hot', 'accent'] },
      { type: 'emitter', at, tex: 'rune_{school}', burst: 3, shape: 'sphere', radius: 0.6, dir: 'up', speed: [0.5, 1.2], spin: [1, 3], life: [0.6, 0.9], size: [0.6, 0.9], alpha: [1, 0.8, 0], color: ['hot', 'mid', 'deep'] }];
  }
}
/** the mark an impact leaves on the ground, by school family */
function markOf(f, size) {
  const m = {
    fire: [{ type: 'decal', tex: 'scorch', blend: 'normal', size, life: 8, fadeIn: 0.1, fadeOut: 3, opacity: 0.9, color: '#100806', edge: '#2a1a10', layer: 1 },
      { type: 'decal', tex: 'scorch', size: r2(size * 0.85), life: 2.4, fadeOut: 1.8, opacity: 0.95, color: 'hot', edge: 'deep', layer: 2 }],
    ice: [{ type: 'decal', tex: 'frost_patch', size, life: 7, fadeIn: 0.1, fadeOut: 2.5, opacity: 0.6, color: 'hot', edge: 'deep', layer: 1 }],
    holy: [{ type: 'decal', tex: 'glow_holy', size, life: 2.2, fadeOut: 1.4, opacity: 0.85, color: 'hot', edge: 'mid', layer: 1 }],
    nature: [{ type: 'decal', tex: 'rune_nature', size, spin: 0.5, life: 2.2, fadeOut: 1.2, opacity: 0.7, color: 'hot', edge: 'deep', layer: 1 }],
    poison: [{ type: 'decal', tex: 'splat_poison', size, life: 6, fadeOut: 2.5, opacity: 0.8, color: 'hot', edge: 'deep', layer: 1 }],
    shadow: [{ type: 'decal', tex: 'stain_shadow', blend: 'normal', size, life: 6, fadeOut: 2.5, opacity: 0.8, color: '#0c0610', edge: '#2a1030', layer: 1 }],
    blood: [{ type: 'decal', tex: 'stain_shadow', blend: 'normal', size, life: 5, fadeOut: 2, opacity: 0.75, color: '#2a0408', edge: '#5a0a10', layer: 1 }],
    lightning: [{ type: 'decal', tex: 'scorch', blend: 'normal', size, life: 5, fadeOut: 2, opacity: 0.8, color: '#0a0a10', edge: '#202030', layer: 1 }],
    physical: [{ type: 'decal', tex: 'crack_ground', blend: 'normal', size, life: 6, fadeIn: 0.05, fadeOut: 2.5, opacity: 0.85, color: '#1a140e', edge: '#3a3024', layer: 1 }],
    arcane: [{ type: 'decal', tex: 'rune_arcane', size, spin: 0.8, life: 2, fadeOut: 1.2, opacity: 0.8, color: 'hot', edge: 'deep', layer: 1 }],
  };
  return m[f] || m.arcane;
}
const flash = (size, at = 'point') => [
  { type: 'flipbook', at, tex: 'fx_burst', size: r2(size * 1.25), life: 0.32, color: ['white', 'hot', 'mid'], edge: 'deep' },
  { type: 'emitter', at, tex: 'burst_star', burst: 1, life: 0.2, size: [size, size], rot: 0, alpha: [1, 0.85, 0], color: ['white', 'white', 'hot'] },
];
const camRing = (size, at = 'point') => ({ type: 'emitter', at, tex: 'ring_shock', burst: 1, life: 0.32, size: [size, size], sizeCurve: [0.3, 1, 1.5], rot: 0, color: ['white', 'accent', 'mid'] });
const shock = (size, rad = null) => ({ type: 'decal', at: 'ground', tex: 'ring_shock', ...(rad ? { rad } : { size }), grow: [0.08, 1, 0.4], life: 0.6, fadeIn: 0, fadeOut: 0.35, color: 'white', edge: 'accent', layer: 3 });
const light = (intensity, range, life = 0.5, at) => ({ type: 'light', ...(at ? { at } : {}), intensity, range, life, y: 0.8 });

// ------------------------------------------------------------------------------------------------ 1. multiply
function grow(L, ph, v) {
  const t = L.type || 'emitter';
  const persistent = ph === 'aura' || ph === 'linger' || ph === 'windup' || ph === 'travel';
  if (t === 'emitter') {
    if (L.burst) L.burst = L.burst <= 2 ? L.burst : Math.round(L.burst * 3);
    if (L.rate) L.rate = r2(L.rate * 3);
    if (L.max) L.max = Math.round(L.max * 3);
    if (Array.isArray(L.size)) { const k = L.size[1] < 0.15 ? 1.6 : L.size[1] < 0.5 ? 1.35 : 1.2; L.size = L.size.map(s => r2(s * k)); }
    if (!persistent && Array.isArray(L.life)) L.life = L.life.map(s => r2(s * 1.3));
    else if (!persistent && typeof L.life === 'number') L.life = r2(L.life * 1.3);
  } else if (t === 'flipbook') {
    L.size = r2(Math.max(1.3, (L.size ?? 2) * 1.4));
    if (L.life && !persistent) L.life = r2(L.life * 1.25);
  } else if (t === 'decal') {
    if (L.size) L.size = r2(L.size * 1.3);
    if (L.rad && L.rad < 0.95) L.rad = r2(Math.min(1.2, L.rad * 1.15));
    if (L.life && !persistent) L.life = r2(Math.max(1.2, L.life * 1.5));
  } else if (t === 'shell') {
    if (L.life && !persistent) L.life = r2(L.life * 1.35);
    if (L.height) L.height = r2(L.height * 1.2);
  } else if (t === 'mesh') {
    const body = ph === 'travel' && (L.kind === 'core' || L.kind === 'shard' || !L.kind);
    L.size = r2(body ? Math.max(0.95, (L.size ?? 0.4) * 2) : (L.size ?? 0.4) * 1.4);
  } else if (t === 'light') {
    L.intensity = r2((L.intensity ?? 4) * 1.6); L.range = r2((L.range ?? 6) * 1.3);
    if (L.life && !persistent) L.life = r2(L.life * 1.4);
  } else if (t === 'shake') {
    L.strength = r2(Math.min(0.55, (L.strength ?? 0.4) * 2));
  } else if (t === 'ribbon' || t === 'trail') {
    L.width = r2(Math.max(0.42, (L.width ?? 0.3) * 1.7)); L.seconds = r2(Math.max(0.4, (L.seconds ?? 0.25) * 2));
  } else if (t === 'arc') {
    L.width = r2((L.width ?? 0.22) * 1.6);
  } else if (t === 'sweep') {
    L.seconds = r2((L.seconds ?? 0.18) * 1.3);
  }
}

// ------------------------------------------------------------------------------------------------ 2. add what is missing
const has = (list, f) => (list || []).some(f);
function windupFor(f) {
  return [
    { type: 'emitter', at: 'hands', follow: true, tex: 'mote_star', rate: 60, max: 48, life: [0.3, 0.5], size: [0.08, 0.13], shape: 'sphere', radius: 0.5, converge: true, color: ['white', 'hot', 'accent'] },
    { type: 'emitter', at: 'hands', follow: true, tex: 'dot_soft', rate: 30, max: 14, life: [0.18, 0.28], size: [0.45, 0.6], alpha: [0, 0.6, 0], color: ['hot', 'mid', 'mid'] },
    { type: 'emitter', at: 'hands', tex: 'spark_streak', rate: 24, max: 24, life: [0.25, 0.45], size: [0.06, 0.1], stretch: 0.12, dir: 'up', speed: [1, 2.4], spread: 0.6, drag: 1.5, color: ['white', 'accent', 'mid'] },
    ...(f === 'physical' ? [{ type: 'emitter', at: 'caster', blend: 'normal', tex: 'dust_1', rate: 16, max: 14, shape: 'ring', radius: 0.7, onGround: true, dir: 'in', speed: [0.5, 1.2], life: [0.4, 0.7], size: [0.5, 0.8], alpha: [0, 0.4, 0], color: DUST, edge: '#2a2418' }] : []),
  ];
}
const windupGround = () => [
  { type: 'decal', at: 'caster', tex: 'rune_{school}', size: 1.8, spin: 1.6, grow: [0.3, 1, 0.2], fadeIn: 0.05, fadeOut: 0.25, opacity: 0.9, color: 'hot', edge: 'deep' },
  { type: 'decal', at: 'caster', tex: 'ring_shock', size: 1.6, grow: [1, 0.2, 0.3], life: 0.32, fadeIn: 0, fadeOut: 0.1, color: 'white', edge: 'accent', layer: 1 },
];
const releaseFor = () => [
  ...flash(1.3, 'hand_r'),
  { type: 'emitter', at: 'hand_r', tex: 'dot_soft', burst: 1, life: 0.22, size: [1.6, 1.6], rot: 0, alpha: [0.9, 0.6, 0], color: ['hot', 'mid', 'mid'] },
  { type: 'emitter', at: 'hand_r', tex: 'mote_star', burst: 40, dir: 'random', speed: [2.5, 5], drag: 3, life: [0.35, 0.6], size: [0.09, 0.15], color: ['white', 'accent', 'hot'] },
  camRing(0.9, 'hand_r'),
  // the Paladin-style bloom: big shapes spiralling up round the caster
  { type: 'emitter', at: 'caster', texs: ['rune_{school}', 'mote_star'], burst: 18, shape: 'ring', radius: 0.9, dir: 'up', speed: [1.2, 2.6], swirl: 3, life: [0.6, 0.95], size: [0.4, 0.6], spin: [1, 3], alpha: [0, 1, 0], color: ['white', 'hot', 'accent'] },
  light(16, 5, 0.25, 'hand_r'),
];
function pointFor(f, kind) {
  return [
    ...flash(1.3),
    { type: 'emitter', tex: 'mote_star', burst: 12, dir: 'outUp', speed: [2, 4.5], drag: 2, gravity: 2, life: [0.4, 0.75], size: [0.1, 0.16], color: ['white', 'accent', 'hot'] },
    camRing(1),
    ...debris(f, 10).slice(0, 2),
    ...(f === 'holy' ? [] : [{ type: 'decal', at: 'ground', tex: 'ring_shock', size: 2.2, grow: [0.1, 1, 0.3], life: 0.45, fadeIn: 0, fadeOut: 0.25, color: 'hot', edge: 'accent', layer: 2 }]),
  ];
}
function areaFor(f) {
  const skidTex = f === 'ice' ? 'shard_ice' : f === 'physical' ? 'shard_ice' : f === 'nature' ? 'leaf' : f === 'holy' ? 'mote_star' : 'spark_streak';
  return [
    { type: 'decal', tex: 'rune_{school}', rad: 1.1, grow: [0.4, 1, 0.3], spin: 0.8, life: 1.4, fadeOut: 0.8, opacity: 0.9, color: 'hot', edge: 'deep' },
    shock(null, 1.2),
    { type: 'shell', shape: 'cylinder', tex: 'band_light', rad: 1, height: 1.6, heightGrow: [0.2, 1, 0.25], life: 0.7, fadeIn: 0, fadeOut: 0.4, opacity: 0.75, fade: 1.2, scroll: [0, -0.9], repeat: [8, 1], color: 'hot', edge: 'accent' },
    { type: 'shell', shape: 'cylinder', tex: 'band_runes', rad: 0.85, height: 1, heightGrow: [0.2, 1, 0.3], delay: 0.12, life: 0.7, fadeIn: 0, fadeOut: 0.4, opacity: 0.6, fade: 1, scroll: [0.3, 0], repeat: [6, 1], color: 'white', edge: 'mid' },
    { type: 'emitter', tex: 'mote_star', rate: 150, duration: 0.6, max: 120, shape: 'ring', rad: 1, onGround: true, dir: 'up', speed: [1, 2.8], life: [0.7, 1.2], size: [0.1, 0.16], color: ['white', 'accent', 'hot'] },
    { type: 'emitter', blend: f === 'physical' || f === 'ice' ? 'normal' : 'add', tex: skidTex, burst: 30, shape: 'ring', radius: 0.2, onGround: true, offset: [0, 0.15, 0], dir: 'out', speed: [4, 6.5], drag: 1.6, spin: [2, 6], life: [0.6, 1], size: [0.22, 0.38], color: f === 'physical' ? ROCK : ['white', 'accent', 'hot'], ...(f === 'physical' ? { edge: '#201810' } : {}) },
    ...markOf(f, 4).map(d => ({ ...d, size: undefined, rad: 0.95 })),
    light(26, 12, 0.7),
    { type: 'shake', strength: 0.4 },
  ];
}
const lingerExtra = () => [
  { type: 'decal', tex: 'rune_{school}', rad: 1.05, spin: 0.35, opacity: 0.55, fadeIn: 0.4, fadeOut: 1, color: 'hot', edge: 'deep', layer: 2 },
  { type: 'decal', tex: 'rune_{school}', rad: 0.6, spin: -0.6, opacity: 0.5, fadeIn: 0.5, fadeOut: 1, color: 'white', edge: 'mid', layer: 3 },
  { type: 'emitter', tex: 'mote_star', rate: 36, max: 90, shape: 'disc', rad: 1, onGround: true, dir: 'up', speed: [0.6, 1.6], life: [1, 1.8], size: [0.08, 0.14], color: ['white', 'accent', 'hot'] },
  { type: 'emitter', texs: ['rune_{school}', 'mote_star'], rate: 4, max: 6, shape: 'ring', rad: 1, onGround: true, offset: [0, 0.5, 0], swirl: 0.8, dir: 'up', speed: [0.05, 0.2], life: [1.4, 2], size: [0.5, 0.7], spin: [0.5, 1.5], alpha: [0, 0.9, 0], color: ['hot', 'mid', 'deep'] },
];

function complete(id, v) {
  if (v.ref) return;
  const f = fam(v.school), k = v.kind;
  if (k === 'aura' || v.plain) return;   // plain: drawn many times a fight (thrown bodies) — kept as written
  // windup: every visual (the client plays ≥ 0.25 s of it for every cast, instant spells too)
  const W = (v.windup ||= []);
  if (!has(W, L => L.converge)) W.push(windupFor(f)[0]);
  if (!has(W, L => (L.tex === 'dot_soft'))) W.push(windupFor(f)[1]);
  if (!has(W, L => L.tex === 'spark_streak')) W.push(windupFor(f)[2]);
  if (f === 'physical' && !has(W, L => L.tex === 'dust_1')) W.push(windupFor(f)[3]);
  if (!has(W, L => L.type === 'decal')) W.push(...windupGround());
  if (!has(W, L => L.type === 'light')) W.push({ type: 'light', at: 'hand_r', intensity: 7, range: 4, flicker: 0.2, y: 0 });
  if (!v.windupTime) v.windupTime = k === 'melee' || k === 'cone' ? 0.3 : 0.6;
  // release
  const R = (v.release ||= []);
  if (!has(R, L => L.type === 'flipbook' || L.tex === 'burst_star')) R.push(...flash(1.3, 'hand_r'));
  if (!has(R, L => L.at === 'caster')) R.push(...releaseFor().slice(2));
  // travel: a halo round the body, accent sparks in the trail
  if (v.travel?.layers && k === 'missile' && id !== 'arrow') {
    const T = v.travel.layers, body = T.find(L => L.type === 'mesh');
    const bs = body ? body.size : 0.9;
    if (!has(T, L => L.halo)) T.push({ type: 'emitter', at: 'missile', halo: true, follow: true, tex: 'dot_soft', rate: 40, max: 10, life: [0.12, 0.2], size: [r2(bs * 1.7), r2(bs * 1.9)], alpha: [0, 0.7, 0], color: ['hot', 'mid', 'deep'] });
    if (!has(T, L => Array.isArray(L.color) && L.color.includes('accent'))) T.push({ type: 'emitter', at: 'missile', tex: 'spark_streak', rate: 60, max: 50, life: [0.25, 0.5], size: [0.07, 0.11], stretch: 0.1, dir: 'random', speed: [0.8, 2.2], gravity: 2, color: ['white', 'accent', 'hot'] });
  }
  // impact
  const I = (v.impact ||= []);
  if (k !== 'shift') {
    if (!has(I, L => L.type === 'flipbook' || L.tex === 'burst_star')) I.unshift(...flash(1.5));
    if (!has(I, L => L.tex === 'ring_shock' && L.type === 'decal')) I.push(shock(3.2));
    if (!has(I, L => L.debris)) I.push(...debris(f, 36).map(L => ({ ...L, debris: true })));
    if (!has(I, L => L.type === 'decal' && (L.life ?? 1) >= 1.2 && L.tex !== 'ring_shock')) I.push(...markOf(f, 2.6));
    if (!has(I, L => L.type === 'light')) I.push(light(20, 8, 0.5));
    if (!has(I, L => L.type === 'shake')) I.push({ type: 'shake', strength: 0.28 });
  }
  // point + area phases (true-shape spread), for everything that hits an area or a swing
  if (['ground', 'nova', 'cone', 'melee', 'self', 'line', 'beam', 'summon', 'missile'].includes(k) && id !== 'knock_land') {
    // pointGen 2: the per-point burst was trimmed after measuring (12-point rings drew ~840 pieces from points alone);
    // hand-written point phases (ice spikes, earthquake) are kept
    if (!v.point || ((v.pointGen ?? 1) < 2 && !NEW[id]?.point)) { v.point = pointFor(f, k); v.pointGen = 2; }
    if (!v.area) v.area = areaFor(f);
  }
  // linger: the school glyph at 2.1 R + a second turning the other way + rising motes
  if (v.linger?.layers && v.linger.layers.filter(L => L.type === 'decal').length < 3) v.linger.layers.push(...lingerExtra());
  // a weapon / body school draws no magic circles (the Spell Lab strips of Ground Slam and Cleave showed arcane runes):
  // glowing cracks on the ground, sparks in the air instead
  if (f === 'physical') for (const ph of ['windup', 'release', 'point', 'area']) for (const L of v[ph] || []) {
    if (L.type === 'decal' && L.tex === 'rune_{school}') { L.tex = 'crack_ground'; L.spin = 0; }
    if (L.texs) L.texs = L.texs.map(t => (t === 'rune_{school}' ? 'spark_streak' : t));
    if (L.tex === 'rune_{school}') L.tex = 'spark_streak';
  }
  if (f === 'physical' && v.area) v.area = v.area.filter(L => L.tex !== 'band_runes');
  // no white sheets (lessons rule 75; the first fireball blast read as pure white): a BIG additive shape (flipbook
  // ≥ 2.5 m, sprite ≥ 1 m, a starburst ≥ 2 m) in an impact / area phase keeps white only for small cores — its colour
  // stops shift one step darker (white→hot→mid→deep; fire's `hot` is near-white too) and its alpha tops out at 0.75
  if (!v.tamed) {
    const down = { white: 'hot', hot: 'mid', mid: 'deep', deep: 'deep' };
    const fireLike = ['fire', 'physical', 'shadow', 'blood', 'poison', 'nature'].includes(f);
    for (const ph of ['impact', 'area']) for (const L of v[ph] || []) {
      if (L.blend === 'normal' || !(L.type === 'flipbook' || (L.type || 'emitter') === 'emitter')) continue;
      const big = L.type === 'flipbook' ? (L.size ?? 2) >= 2.5 : Array.isArray(L.size) && L.size[1] >= (L.tex === 'burst_star' ? 2 : 1);
      if (!big) continue;
      if (L.tex === 'burst_star') { L.size = L.size.map(x => Math.min(x, 2)); L.life = Math.min(L.life ?? 0.2, 0.14); continue; }
      if (Array.isArray(L.color)) L.color = L.color.map(c => (fireLike || c === 'white' ? down[c] || c : c));
      L.alpha = (L.alpha || (L.type === 'flipbook' ? [1, 1, 0] : [0, 1, 0])).map(a => Math.min(a, 0.75));
    }
    v.tamed = 2;
  } else if (v.tamed === 1) {   // the first pass gave flipbooks a fade-in by mistake (their default alpha starts full)
    for (const ph of ['impact', 'area']) for (const L of v[ph] || []) if (L.type === 'flipbook' && L.alpha?.[0] === 0 && L.alpha[1] === 0.75) L.alpha = [0.75, 0.75, 0];
    v.tamed = 2;
  }
  // weapon sweeps: a second, accent-coloured edge
  if (v.sweep && v.sweep.length < 2) v.sweep.push({ type: 'sweep', seconds: 0.3, color: 'hot', edge: 'accent', opacity: 0.9, tex: 'band_light', inner: 0.75 });
}

// ------------------------------------------------------------------------------------------------ 3. new visuals
const NEW = {
  // owner 2026-11-26: "The fireball should be massive, twice the size of your head, spinning with trailing embers falling
  // and a huge explosion. Not just a dink on the enemies little toe." A straight, aimed projectile (explodes on the
  // first enemy or at the end of its range; the client draws the explosion at the row's explode.radius).
  fireball: {
    label: 'Fireball (explodes)', kind: 'missile', school: 'fire', windupTime: 0.6, replaces: 2,
    windup: [
      { type: 'emitter', at: 'hands', follow: true, texs: ['flame_1', 'flame_2', 'flame_3', 'flame_4', 'flame_6'], rate: 110, max: 120, life: [0.3, 0.55], size: [0.26, 0.42], sizeCurve: [0.5, 1, 0.3], color: ['hot', 'mid', 'deep'], edge: 'deep', dir: 'up', speed: [0.3, 0.9], spread: 0.35, radius: 0.1, shape: 'sphere', rot: 0 },
      { type: 'emitter', at: 'hand_r', follow: true, tex: 'fx_flame', rate: 20, max: 14, life: [0.4, 0.6], size: [0.6, 0.8], color: ['hot', 'mid', 'deep'], alpha: [0, 0.9, 0], dir: 'up', speed: [0.2, 0.4], rot: 0 },
      { type: 'mesh', kind: 'core', at: 'hand_r', size: 0.35, grow: [0.2, 1, 0.5], color: 'hot', edge: 'mid', pulse: [0.15, 9] },
    ],
    release: [{ type: 'emitter', at: 'hand_r', tex: 'fx_flame', burst: 6, shape: 'sphere', radius: 0.3, life: [0.3, 0.5], size: [0.8, 1.2], dir: 'forward', speed: [2, 4], color: ['hot', 'mid', 'deep'] }],
    travel: { speed: 20, arc: 0, layers: [
      // the ball: ~0.55 m (twice a head) — a hot core, a spinning flame shell (flipbooks + licks that turn), a halo
      { type: 'mesh', kind: 'core', at: 'missile', size: 0.55, color: 'white', edge: 'hot', pulse: [0.12, 10], spin: [6, 9, 4], align: false },
      { type: 'emitter', at: 'missile', follow: true, tex: 'fx_flame', rate: 60, max: 14, life: [0.18, 0.28], size: [0.75, 0.95], spin: [6, 10], color: ['hot', 'mid', 'deep'], alpha: [0.6, 1, 0] },
      { type: 'emitter', at: 'missile', follow: true, texs: ['flame_1', 'flame_2', 'flame_4', 'flame_5'], rate: 120, max: 30, shape: 'sphere', radius: 0.22, swirl: 14, life: [0.12, 0.22], size: [0.35, 0.55], spin: [8, 14], color: ['white', 'hot', 'mid'] },
      { type: 'emitter', at: 'missile', follow: true, tex: 'dot_soft', rate: 40, max: 8, life: [0.12, 0.2], size: [1.1, 1.3], alpha: [0, 0.75, 0], color: ['hot', 'mid', 'deep'], halo: true },
      // the trail: flame licks left behind, embers that FALL and fade, smoke wisps
      { type: 'emitter', at: 'missile', texs: ['flame_1', 'flame_2', 'flame_4', 'flame_5'], rate: 200, max: 160, life: [0.25, 0.45], size: [0.45, 0.75], sizeCurve: [1, 0.7, 0.2], dir: 'random', speed: [0.3, 0.9], color: ['hot', 'mid', 'deep'], spin: [1, 3] },
      { type: 'emitter', at: 'missile', tex: 'spark_streak', rate: 140, max: 180, shape: 'sphere', radius: 0.25, life: [0.7, 1.3], size: [0.07, 0.12], stretch: 0.05, dir: 'random', speed: [0.3, 1.2], gravity: 7, drag: 0.4, color: ['white', 'accent', 'deep'], alpha: [1, 1, 0] },
      { type: 'emitter', at: 'missile', tex: 'dot_soft', rate: 60, max: 70, life: [0.6, 1.1], size: [0.08, 0.14], dir: 'random', speed: [0.2, 0.6], gravity: 4, color: ['accent', 'hot', 'deep'], alpha: [1, 0.8, 0] },
      { type: 'emitter', at: 'missile', blend: 'normal', texs: ['smoke_1', 'smoke_3'], rate: 50, max: 70, life: [0.7, 1.2], size: [0.5, 0.9], sizeCurve: [0.5, 1, 1.7], color: SMOKE_DARK, edge: '#120c0a', alpha: [0, 0.5, 0], dir: 'up', speed: [0.2, 0.5], spin: [0.5, 1.5] },
      { type: 'ribbon', at: 'missile', width: 0.7, seconds: 0.4, color: 'hot', edge: 'deep', tex: 'band_flame', texMix: 0.5 },
      { type: 'light', at: 'missile', intensity: 18, range: 9, flicker: 0.2, y: 0 },
    ] },
    impact: [
      // reads as FIRE, not a white sheet (lead review 2026-11-26, lessons rule 75): white only in a small, short core;
      // the big shapes are saturated orange / red / yellow at partial alpha (additive stacks go white fast); dark smoke
      // rolls up after; embers orange
      { type: 'emitter', tex: 'burst_star', burst: 1, life: 0.1, size: [1.6, 1.6], rot: 0, alpha: [0.9, 0.6, 0], color: ['white', '#ffd060', '#ff8a1a'] },
      { type: 'flipbook', tex: 'fx_burst', size: 5, life: 0.5, alpha: [0.75, 0.6, 0], color: ['#ffc040', '#ff6a10', '#c0240a'], edge: '#7a1004' },
      { type: 'emitter', tex: 'fx_flame', burst: 18, shape: 'sphere', rad: 0.35, life: [0.6, 1.1], size: [1.5, 2.4], dir: 'outUp', speed: [2, 5], drag: 1.5, gravity: -1, alpha: [0, 0.55, 0], color: ['#ffb030', '#ff5a10', '#a01806'], edge: '#5a0a02' },
      { type: 'emitter', texs: ['flame_1', 'flame_2', 'flame_3', 'flame_5'], burst: 50, shape: 'sphere', rad: 0.3, life: [0.5, 0.9], size: [0.6, 1.1], dir: 'outUp', speed: [4, 9], drag: 1.2, spin: [1, 3], alpha: [0, 0.75, 0], color: ['#ffc040', '#ff6a10', '#b02008'], edge: '#5a0a02' },
      { type: 'emitter', tex: 'spark_streak', burst: 140, dir: 'outUp', speed: [7, 15], spread: 0.5, gravity: 11, drag: 0.3, life: [0.7, 1.4], size: [0.09, 0.15], stretch: 0.06, color: ['#ffd060', '#ff8020', '#c03008'] },
      { type: 'emitter', blend: 'normal', tex: 'shard_ice', burst: 40, dir: 'outUp', speed: [6, 12], spread: 0.6, gravity: 15, drag: 0.2, spin: [4, 10], life: [0.8, 1.4], size: [0.2, 0.42], color: ROCK, edge: '#201810', alpha: [1, 1, 0.8] },
      { type: 'emitter', blend: 'normal', texs: ['smoke_1', 'smoke_2', 'smoke_3'], burst: 45, shape: 'sphere', rad: 0.45, life: [1.8, 3.2], size: [2, 3.6], sizeCurve: [0.5, 1, 1.7], dir: 'up', speed: [1, 2.6], drag: 0.8, alpha: [0, 0.75, 0], color: ['#2a1a12', '#1c1410', '#120c0a'], edge: '#080504', delay: 0.18 },
      { type: 'emitter', blend: 'normal', texs: ['dust_1', 'smoke_3'], burst: 30, shape: 'ring', rad: 0.3, onGround: true, offset: [0, 0.3, 0], dir: 'out', speed: [6, 10], drag: 2.2, life: [1, 1.7], size: [1.4, 2.2], sizeCurve: [0.5, 1, 1.4], alpha: [0, 0.55, 0], color: DUST, edge: '#2a2418' },
      { type: 'shell', shape: 'dome', tex: 'band_flame', rad: 0.25, grow: [0.4, 4.2, 0.35], height: 1.6, life: 0.5, fadeIn: 0, fadeOut: 0.35, opacity: 0.5, fade: 0.8, scroll: [0.4, -0.6], repeat: [4, 1], color: '#ff8a1a', edge: '#a01806' },
      { type: 'decal', at: 'ground', tex: 'ring_shock', rad: 1.2, grow: [0.05, 1, 0.45], life: 0.65, fadeIn: 0, fadeOut: 0.35, opacity: 0.8, color: '#ffb040', edge: '#c03008', layer: 3 },
      { type: 'decal', at: 'ground', tex: 'scorch', blend: 'normal', rad: 0.9, life: 9, fadeIn: 0.1, fadeOut: 3.5, opacity: 0.92, color: '#100806', edge: '#2a1a10', layer: 1 },
      { type: 'decal', at: 'ground', tex: 'scorch', rad: 0.75, life: 2.6, fadeOut: 2, opacity: 0.8, color: '#ff6a10', edge: '#a01806', layer: 2 },
      { type: 'light', intensity: 34, range: 16, life: 0.7, y: 1.4, color: '#ff7a20' },
      { type: 'shake', strength: 0.55 },
    ],
  },
  ground_slam: {
    label: 'Ground slam', kind: 'nova', school: 'physical', windupTime: 0.3,
    impact: [
      ...flash(2.2),
      { type: 'decal', at: 'ground', tex: 'ring_shock', rad: 1.25, grow: [0.05, 1, 0.42], life: 0.7, fadeIn: 0, fadeOut: 0.35, color: 'white', edge: 'accent', layer: 3 },
      { type: 'decal', at: 'ground', tex: 'crack_ground', blend: 'normal', rad: 0.7, grow: [0.2, 1, 0.2], life: 6, fadeOut: 2.5, opacity: 0.95, color: '#1a140e', edge: '#3a3024', layer: 1 },
      { type: 'decal', at: 'ground', tex: 'crack_ground', rad: 0.5, life: 1.4, fadeOut: 1, opacity: 0.9, color: 'accent', edge: 'deep', layer: 2 },
      { type: 'shell', shape: 'cylinder', tex: 'band_mist', rad: 0.12, grow: [0.5, 9, 0.45], height: 1.3, life: 0.7, fadeIn: 0, fadeOut: 0.4, opacity: 0.85, fade: 1.1, scroll: [0.3, 0], repeat: [6, 1], color: '#e8d8b0', edge: '#8a7a60' },
      { type: 'emitter', blend: 'normal', texs: ['dust_1', 'smoke_1', 'smoke_3'], burst: 70, shape: 'ring', radius: 0.6, onGround: true, offset: [0, 0.35, 0], dir: 'out', speed: [6, 11], drag: 2.2, life: [1.1, 1.8], size: [1.4, 2.4], sizeCurve: [0.5, 1, 1.5], alpha: [0, 0.6, 0], color: DUST, edge: '#2a2418' },
      { type: 'emitter', blend: 'normal', tex: 'shard_ice', burst: 70, shape: 'disc', rad: 0.6, onGround: true, dir: 'outUp', speed: [5, 11], spread: 0.6, gravity: 16, spin: [4, 10], life: [0.8, 1.3], size: [0.2, 0.42], color: ROCK, edge: '#201810', alpha: [1, 1, 0.8] },
      { type: 'emitter', tex: 'spark_streak', burst: 80, shape: 'ring', rad: 0.3, onGround: true, offset: [0, 0.4, 0], dir: 'out', speed: [8, 13], drag: 2, life: [0.4, 0.7], size: [0.09, 0.14], stretch: 0.1, color: ['white', 'accent', '#ff7a20'] },
      { type: 'light', intensity: 30, range: 14, life: 0.6, y: 1, color: 'accent' },
      { type: 'shake', strength: 0.55 },
    ],
  },
  whirlwind: {
    label: 'Whirlwind', kind: 'nova', school: 'physical', windupTime: 0.25,
    sweep: [{ type: 'sweep', color: 'white', edge: 'mid', opacity: 1, tex: 'band_mist' }, { type: 'sweep', color: 'hot', edge: 'accent', opacity: 0.9, tex: 'band_light', inner: 0.75 }],
    impact: [
      { type: 'shell', shape: 'cylinder', tex: 'band_mist', rad: 0.95, height: 1.1, y: 0.3, spin: 16, life: 0.6, fadeIn: 0, fadeOut: 0.35, opacity: 0.85, fade: 0.6, scroll: [2, 0], repeat: [3, 1], color: 'white', edge: 'mid' },
      { type: 'shell', shape: 'cylinder', tex: 'band_light', rad: 0.7, height: 1.6, y: 0.1, spin: -12, life: 0.55, fadeIn: 0, fadeOut: 0.35, opacity: 0.6, fade: 1, scroll: [1.4, 0], repeat: [4, 1], color: 'hot', edge: 'accent' },
      { type: 'emitter', tex: 'spark_streak', burst: 90, shape: 'ring', rad: 0.85, offset: [0, 1, 0], dir: 'out', speed: [4, 7], swirl: 5, drag: 2, life: [0.35, 0.6], size: [0.08, 0.13], stretch: 0.14, color: ['white', 'accent', 'hot'] },
      { type: 'emitter', blend: 'normal', texs: ['dust_1', 'smoke_1'], burst: 36, shape: 'ring', rad: 0.6, onGround: true, offset: [0, 0.3, 0], dir: 'out', speed: [2, 4], swirl: 3, drag: 2, life: [0.8, 1.3], size: [0.9, 1.5], alpha: [0, 0.5, 0], color: DUST, edge: '#2a2418' },
      { type: 'decal', at: 'ground', tex: 'ring_shock', rad: 1.05, grow: [0.3, 1, 0.25], life: 0.5, fadeIn: 0, fadeOut: 0.3, color: 'white', edge: 'accent', spin: 6 },
      { type: 'light', intensity: 16, range: 9, life: 0.5, y: 1, color: 'accent' },
      { type: 'shake', strength: 0.3 },
    ],
  },
  cleave_arc: {
    label: 'Wide weapon swing', kind: 'melee', school: 'physical', hitDelay: 0.15, sweepTime: 0.3,
    sweep: [{ type: 'sweep', color: 'white', edge: 'mid', opacity: 1, tex: 'band_mist' }, { type: 'sweep', color: 'hot', edge: 'accent', opacity: 0.95, tex: 'band_light', inner: 0.7 }],
    impact: [
      { type: 'emitter', tex: 'burst_star', burst: 1, life: 0.2, size: [1.6, 1.6], rot: 0, alpha: [1, 0.8, 0], color: ['white', 'white', 'accent'] },
      { type: 'emitter', tex: 'spark_streak', burst: 60, dir: 'random', speed: [4, 8], gravity: 8, drag: 0.8, life: [0.35, 0.6], size: [0.08, 0.13], stretch: 0.08, color: ['white', 'accent', '#ff7a20'] },
      camRing(1.4),
      { type: 'emitter', blend: 'normal', tex: 'dust_1', burst: 12, life: [0.6, 0.9], size: [0.7, 1.1], dir: 'up', speed: [0.3, 0.8], alpha: [0, 0.4, 0], color: DUST, edge: '#2a2418' },
      { type: 'light', intensity: 14, range: 6, life: 0.3, y: 0.4, color: 'accent' },
      { type: 'shake', strength: 0.22 },
    ],
  },
  shield_bash: { ref: 'cleave_arc', label: 'Shield bash', school: 'holy', impact: [
    ...flash(2),
    camRing(2),
    { type: 'emitter', tex: 'spark_streak', burst: 70, dir: 'outUp', speed: [5, 9], gravity: 8, drag: 0.6, life: [0.4, 0.7], size: [0.09, 0.14], stretch: 0.08, color: ['white', 'accent', 'hot'] },
    { type: 'emitter', blend: 'normal', tex: 'dust_1', burst: 20, shape: 'ring', radius: 0.3, onGround: true, dir: 'out', speed: [2, 4], drag: 2, life: [0.7, 1.1], size: [0.9, 1.4], alpha: [0, 0.5, 0], color: DUST, edge: '#2a2418' },
    { type: 'decal', at: 'ground', tex: 'ring_shock', size: 4.5, grow: [0.1, 1, 0.35], life: 0.55, fadeIn: 0, fadeOut: 0.3, color: 'white', edge: 'accent', layer: 3 },
    { type: 'light', intensity: 22, range: 8, life: 0.35, y: 0.8 },
    { type: 'shake', strength: 0.4 },
  ] },
  charge_rush: {
    label: 'Charge / rush', kind: 'line', school: 'physical', windupTime: 0.25,
    impact: [
      ...flash(2),
      { type: 'decal', at: 'ground', tex: 'ring_shock', size: 6, grow: [0.08, 1, 0.4], life: 0.6, fadeIn: 0, fadeOut: 0.35, color: 'white', edge: 'accent', layer: 3 },
      { type: 'decal', at: 'ground', tex: 'crack_ground', blend: 'normal', size: 3.2, life: 5, fadeOut: 2, opacity: 0.85, color: '#1a140e', edge: '#3a3024', layer: 1 },
      { type: 'emitter', blend: 'normal', texs: ['dust_1', 'smoke_1'], burst: 40, shape: 'ring', radius: 0.4, onGround: true, offset: [0, 0.3, 0], dir: 'out', speed: [4, 7], drag: 2, life: [0.9, 1.4], size: [1, 1.7], alpha: [0, 0.55, 0], color: DUST, edge: '#2a2418' },
      { type: 'emitter', tex: 'spark_streak', burst: 60, dir: 'outUp', speed: [5, 9], gravity: 9, life: [0.4, 0.7], size: [0.08, 0.13], stretch: 0.1, color: ['white', 'accent', '#ff7a20'] },
      { type: 'light', intensity: 22, range: 9, life: 0.45, y: 1, color: 'accent' },
      { type: 'shake', strength: 0.45 },
    ],
    aura: [
      { type: 'emitter', at: 'body', tex: 'spark_streak', rate: 120, shape: 'cylinder', radius: 0.4, height: 1.4, offset: [0, -0.7, 0], dir: 'back', speed: [3, 6], stretch: 0.35, life: [0.2, 0.35], size: [0.06, 0.1], color: ['white', 'accent', 'hot'] },
      { type: 'emitter', at: 'feet', blend: 'normal', tex: 'dust_1', rate: 40, max: 40, onGround: true, dir: 'up', speed: [0.3, 0.8], life: [0.6, 1], size: [0.8, 1.2], alpha: [0, 0.45, 0], color: DUST, edge: '#2a2418' },
    ],
    auraTime: 0.6,
  },
  line_wave: {
    label: 'Lance / wave along a line (any school)', kind: 'line', school: 'holy', windupTime: 0.4,
    beam: { seconds: 0.6, layers: [
      { type: 'arc', width: 0.55, jitter: 0.06, every: 0.05, color: 'white', edge: 'hot' },
      { type: 'arc', width: 1.6, jitter: 0.1, every: 0.08, color: 'mid', edge: 'deep' },
      { type: 'arc', width: 0.3, jitter: 0.35, every: 0.04, fork: 1, color: 'accent', edge: 'mid' },
    ] },
    impact: [
      ...flash(1.8),
      { type: 'emitter', tex: 'mote_star', burst: 50, dir: 'random', speed: [2.5, 5], drag: 3, life: [0.5, 0.8], size: [0.1, 0.16], color: ['white', 'accent', 'hot'] },
      { type: 'light', intensity: 22, range: 8, life: 0.4, y: 0.6 },
      { type: 'shake', strength: 0.3 },
    ],
  },
  ice_spikes: {
    label: 'Ice spikes along a line', kind: 'line', school: 'ice', windupTime: 0.45,
    point: [
      { type: 'emitter', tex: 'shard_ice', burst: 6, shape: 'disc', radius: 0.5, onGround: true, rot: 0, dir: 'up', speed: [3.5, 6], gravity: 9, life: [0.6, 0.9], size: [0.7, 1.2], color: ['white', 'hot', 'mid'] },
      { type: 'emitter', tex: 'shard_ice', burst: 24, dir: 'outUp', speed: [3, 7], gravity: 10, spin: [3, 8], life: [0.5, 0.9], size: [0.18, 0.32], color: ['white', 'accent', 'hot'] },
      { type: 'emitter', blend: 'normal', texs: ['smoke_1', 'smoke_2'], burst: 8, shape: 'sphere', radius: 0.4, dir: 'out', speed: [1, 2], drag: 2, life: [1, 1.6], size: [1, 1.5], alpha: [0, 0.45, 0], color: ['smoke'], edge: 'hot' },
      { type: 'decal', at: 'ground', tex: 'frost_patch', size: 3, life: 6, fadeOut: 2.5, opacity: 0.6, color: 'hot', edge: 'deep', layer: 1 },
      ...flash(1.3),
    ],
    impact: [
      { type: 'emitter', tex: 'shard_ice', burst: 40, dir: 'random', speed: [3, 6], drag: 2.5, gravity: 6, life: [0.6, 1], size: [0.2, 0.34], stretch: 0.05, color: ['white', 'accent', 'mid'] },
      { type: 'light', intensity: 20, range: 8, life: 0.4, y: 0.8 },
      { type: 'shake', strength: 0.3 },
    ],
  },
  earthquake: {
    label: 'Earthquake / fissure', kind: 'line', school: 'physical', windupTime: 0.4,
    point: [
      { type: 'decal', at: 'ground', tex: 'crack_ground', blend: 'normal', size: 4, grow: [0.3, 1, 0.2], life: 6, fadeOut: 2.5, opacity: 0.95, color: '#1a140e', edge: '#3a3024', layer: 1 },
      { type: 'decal', at: 'ground', tex: 'crack_ground', size: 3, life: 1.2, fadeOut: 0.9, opacity: 0.9, color: 'accent', edge: 'deep', layer: 2 },
      { type: 'emitter', blend: 'normal', tex: 'shard_ice', burst: 30, shape: 'disc', radius: 0.8, onGround: true, dir: 'outUp', speed: [5, 10], spread: 0.5, gravity: 16, spin: [4, 10], life: [0.8, 1.3], size: [0.25, 0.5], color: ROCK, edge: '#201810', alpha: [1, 1, 0.8] },
      { type: 'emitter', blend: 'normal', texs: ['dust_1', 'smoke_1', 'smoke_3'], burst: 20, shape: 'disc', radius: 1, onGround: true, offset: [0, 0.4, 0], dir: 'outUp', speed: [1.5, 3.5], drag: 1.5, life: [1.2, 2], size: [1.4, 2.4], sizeCurve: [0.5, 1, 1.4], alpha: [0, 0.6, 0], color: DUST, edge: '#2a2418' },
      { type: 'emitter', tex: 'spark_streak', burst: 20, dir: 'outUp', speed: [4, 8], gravity: 10, life: [0.4, 0.7], size: [0.08, 0.13], stretch: 0.08, color: ['white', 'accent', '#ff7a20'] },
    ],
    impact: [{ type: 'shake', strength: 0.55 }, { type: 'light', intensity: 26, range: 12, life: 0.6, y: 1, color: 'accent' }],
  },
  leap_slam: { ref: 'ground_slam', label: 'Leap and slam' },
  // a thrown body hitting the ground ('knock' events): dust, chips, a crack, a ring
  knock_land: {
    label: 'Thrown body lands', kind: 'nova', school: 'physical', replaces: 1, plain: true,
    impact: [
      { type: 'emitter', blend: 'normal', texs: ['dust_1', 'smoke_1', 'smoke_3'], burst: 26, shape: 'ring', radius: 0.3, onGround: true, offset: [0, 0.25, 0], dir: 'out', speed: [2.5, 5], drag: 2.2, life: [0.8, 1.4], size: [0.9, 1.5], sizeCurve: [0.5, 1, 1.4], alpha: [0, 0.6, 0], color: DUST, edge: '#2a2418' },
      { type: 'emitter', blend: 'normal', tex: 'shard_ice', burst: 16, dir: 'outUp', speed: [3, 6], spread: 0.6, gravity: 14, spin: [4, 9], life: [0.6, 1], size: [0.12, 0.24], color: ROCK, edge: '#201810', alpha: [1, 1, 0.8] },
      { type: 'emitter', tex: 'spark_streak', burst: 12, dir: 'outUp', speed: [3, 6], gravity: 9, life: [0.3, 0.55], size: [0.07, 0.11], stretch: 0.08, color: ['white', 'accent', '#ff7a20'] },
      { type: 'decal', at: 'ground', tex: 'ring_shock', size: 3, grow: [0.1, 1, 0.3], life: 0.45, fadeIn: 0, fadeOut: 0.3, color: 'white', edge: 'accent', layer: 3 },
      { type: 'decal', at: 'ground', tex: 'crack_ground', blend: 'normal', size: 1.8, life: 3.5, fadeOut: 1.5, opacity: 0.8, color: '#1a140e', edge: '#3a3024', layer: 1 },
    ],
  },
  war_cry: { ref: 'battle_shout', label: 'War cry', school: 'physical' },
};

// ------------------------------------------------------------------------------------------------ run
const V = data.visuals;
const was = data.look || 1;
if (was < LOOK || force) {
  for (const [id, v] of Object.entries(V)) { if (v.ref) continue; for (const ph of PH) for (const L of layersOf(v, ph) || []) grow(L, ph, v); }
}
let added = 0;
// `replaces: n`: an owner ruling changed a new visual — it replaces the copy in the file once per number
for (const [id, v] of Object.entries(NEW)) if (!V[id] || (v.replaces && (V[id].replaces || 0) < v.replaces)) { V[id] = structuredClone(v); added++; }
for (const [id, v] of Object.entries(V)) complete(id, v);
// layers that came from templates with undefined fields (spread overrides): drop the undefined keys
const clean = o => JSON.parse(JSON.stringify(o));
data.visuals = clean(V);
data.look = LOOK;
data._doc = data._doc.replace(/ Look pass:.*$/, '') + ' Look pass: ' + LOOK + ' (avatar-3d/spellkit/tools/triple-visuals.mjs: ~3x every layer + point/area phases; 2026-11-26).';

function pretty(v, ind = '') {
  const one = JSON.stringify(v);
  if (v === null || typeof v !== 'object') return one;
  const small = one.length < 110 || (!Array.isArray(v) && 'type' in v) || (Array.isArray(v) && v.every(x => typeof x !== 'object'));
  if (small) return one.replace(/":/g, '": ').replace(/,(?=["\[{\d-])/g, ', ');
  const next = ind + '  ';
  if (Array.isArray(v)) return '[\n' + v.map(x => next + pretty(x, next)).join(',\n') + '\n' + ind + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => next + JSON.stringify(k) + ': ' + pretty(x, next)).join(',\n') + '\n' + ind + '}';
}
writeFileSync(FILE, pretty(data) + '\n');
console.log(`look ${was} -> ${LOOK}${was >= LOOK && !force ? ' (multiply step skipped: already done)' : ''}; ${added} new visuals; ${Object.keys(data.visuals).length} visuals in all`);
