// Random character generation for the 2D avatar. Uses race rules from presets.json (allowed parts/colours per race)
// with a seeded rng so "random goblin #1234" is reproducible.
import { PARTS, SLOTS, partIds } from './parts/index.js';
import { DEFAULT_AVATAR, normalizeAvatar } from './render.js';

export function makeRng(seed) {
  let a = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const next = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.pick = arr => arr[Math.floor(next() * arr.length)]; next.range = (lo, hi) => lo + next() * (hi - lo); next.chance = p => next() < p;
  return next;
}

const FACE_SLOTS = ['headShape', 'hair', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'facialHair', 'extras'];
const OUTFIT_SLOTS = ['top', 'bottom', 'shoes', 'accessory', 'hat'];

/**
 * randomAvatar({ palettes, raceRules }, { race, seed, base, only: 'face'|'outfit'|'body'|null })
 * race: key of raceRules (unknown → generic). base: start from this avatar and only re-roll `only`.
 */
export function randomAvatar(data, { race = null, seed, base = null, only = null } = {}) {
  const rng = makeRng(seed); const rules = (race && data.raceRules?.[race]) || {}; const pal = data.palettes;
  const a = normalizeAvatar(base || DEFAULT_AVATAR);
  const allowed = slot => rules[slot]?.filter(id => PARTS[slot][id]) || partIds(slot);
  const pickPart = slot => rng.pick(allowed(slot));
  const doFace = !only || only === 'face', doOutfit = !only || only === 'outfit', doBody = !only || only === 'body';
  if (doBody) {
    const r = rules.body || {};
    a.body.height = +rng.range(...(r.height || [0, 1])).toFixed(2); a.body.width = +rng.range(...(r.width || [0, 1])).toFixed(2); a.body.headSize = +rng.range(...(r.headSize || [0.3, 0.8])).toFixed(2);
    a.body.skin = rng.pick(rules.skin || pal.skin);
  }
  if (doFace) {
    for (const slot of FACE_SLOTS) { const id = pickPart(slot); if (slot === 'headShape') a.headShape = id; else a[slot].id = id; }
    if (rng.chance(0.55)) a.facialHair.id = 'none'; if (rng.chance(0.6)) a.extras.id = 'none';
    a.hair.color = rng.pick(rules.hairColor || pal.hair); a.eyes.color = rng.pick(rules.eyeColor || pal.eye);
    a.eyes.x = +rng.range(-0.4, 0.4).toFixed(2); a.eyes.y = +rng.range(-0.3, 0.3).toFixed(2); a.eyes.scale = +rng.range(0.8, 1.25).toFixed(2); a.eyes.rot = Math.round(rng.range(-10, 10));
    a.brows.y = +rng.range(-0.3, 0.3).toFixed(2); a.brows.rot = Math.round(rng.range(-10, 10)); a.brows.x = a.eyes.x;
    a.nose.y = +rng.range(-0.2, 0.3).toFixed(2); a.nose.scale = +rng.range(0.8, 1.3).toFixed(2);
    a.mouth.y = +rng.range(-0.2, 0.3).toFixed(2); a.mouth.scale = +rng.range(0.8, 1.3).toFixed(2); a.mouth.color = rng.pick(['#b5484d', '#a04040', '#7a2a2a', '#5a2a2a', '#c96a6a']);
    a.extras.color = rng.pick(pal.cloth);
  }
  if (doOutfit) {
    for (const slot of OUTFIT_SLOTS) a[slot].id = pickPart(slot);
    if (rng.chance(0.55)) a.accessory.id = 'none'; if (rng.chance(0.5)) a.hat.id = 'none';
    a.top.color = rng.pick(pal.cloth); a.top.color2 = rng.pick(pal.cloth); a.bottom.color = rng.pick(pal.cloth); a.shoes.color = rng.pick(pal.cloth); a.accessory.color = rng.pick(pal.cloth); a.hat.color = rng.pick(pal.cloth);
  }
  return a;
}
