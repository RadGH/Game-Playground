// Chibi 2 races: body proportions, race-only face shaping and weighted random looks. No Three.js here,
// so node tests, tools and the avatar editor can read it without a renderer.
//
// A race is a PARAMETER SET on the one Chibi 2 body, not a second model. Every race wears every part
// (hats, tops, weapons, capes, decorations) because every part is built against the same named bones
// and the same torso/head surfaces, which the proportions below stretch. What changes per race:
//
//   body     multipliers on the rig — leg and torso length, shoulder width, arm length, hand size,
//            head size, neck — plus a default ROUNDNESS (belly, hips, thicker limbs)
//   face     shaping the avatar slots cannot express: jaw width, brow ridge, ear size, cheek hollow,
//            muzzle; these ride on top of whatever headShape / ears / nose the avatar picked
//   posture  a constant lean folded into every animation clip (an orc hunches, an undead slumps)
//   weights  how likely each part id is when the character is rolled at random. Weights, not an
//            allow-list: a human can still roll pointed ears, just rarely, and an elf can roll a beard
//   ranges   the body sliders a random roll stays inside
//
// The race is stored at `avatar.body.race` (and roundness at `avatar.body.round`) because the shared
// 2D normaliser keeps unknown keys inside `body` and drops unknown top-level keys — so both survive
// Farhold's and Emberveil's own normalise-then-build path without any change on their side.

/** Every race, in menu order. `label` is what the avatar page shows ("Chibi 2 Human"). */
export const CHIBI2_RACES = {
  human: {
    name: 'Human', label: 'Chibi 2 Human',
    body: { leg: 1, torso: 1, width: 1, shoulders: 1, arm: 1, hand: 1, head: 1, neck: 1, round: 0.12 },
    face: { jaw: 1, brow: 0, ear: 1, hollow: 0, muzzle: 0 },
    posture: { chest: 0, head: 0, knees: 0 },
    ranges: { height: [0.2, 0.9], width: [0.25, 0.8], headSize: [0.35, 0.7], round: [0, 0.55] },
    skin: ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'],
    hairColor: ['#111111', '#3b2a1a', '#6b4a2a', '#a86a3a', '#d9c27a', '#f2e2b0', '#8a1a1a', '#888888'],
    weights: {
      ears: { normal: 10, big: 2, pointed: 1 },
      hair: { short: 6, side_part: 4, long: 3, wavy: 3, ponytail: 3, bun: 2, bob: 2, buzz: 3, curly: 3, slicked: 2, bangs: 2, braids: 1, bald: 1 },
      facialHair: { none: 12, stubble: 3, goatee: 2, mustache: 2, full: 2, chinstrap: 1 },
      top: { tunic: 6, tshirt: 3, doublet: 3, vest: 3, leather: 3, coat: 2, open_coat: 2, chainmail: 2, surcoat: 1, hoodie: 1, dress: 2, smith_apron: 1, travel_shirt: 4, gambeson: 3 },
      bottom: { pants: 8, breeches: 4, skirt: 2, baggy: 2, shorts: 1, kilt: 1 },
      shoes: { boots: 8, shoes: 4, sandals: 1, heavy: 2 },
      hat: { none: 12, hood: 2, cap: 2, wide_brim: 1, feather_cap: 1, bandana: 1, leather_cap: 2, straw: 1 },
      cape: { none: 10, cape: 2, travel_cloak: 2, shoulder_cape: 1 },
      decor: { none: 8, belt_pouches: 3, bedroll_pack: 2, waterskin: 2, scroll_case: 1 },
    },
  },
  elf: {
    name: 'Elf', label: 'Chibi 2 Elf',
    body: { leg: 1.1, torso: 1.03, width: 0.88, shoulders: 0.92, arm: 1.04, hand: 0.92, head: 0.95, neck: 1.2, round: 0 },
    face: { jaw: 0.9, brow: 0, ear: 1.3, hollow: 0.2, muzzle: 0 },
    posture: { chest: -0.03, head: -0.03, knees: 0 },
    ranges: { height: [0.55, 1], width: [0.1, 0.45], headSize: [0.3, 0.55], round: [0, 0.15] },
    skin: ['#ffdbb4', '#f1c27d', '#e0ac69', '#c9cfc3', '#b8a1d9'],
    hairColor: ['#d9c27a', '#f2e2b0', '#eeeeee', '#111111', '#4a3a8a', '#2a7a5a'],
    weights: {
      ears: { pointed: 20, normal: 1 },
      hair: { long: 6, wavy: 4, braids: 3, ponytail: 4, bun: 2, side_part: 2, bangs: 2, pixie: 2, slicked: 1 },
      facialHair: { none: 30, goatee: 1 },
      eyes: { almond: 6, round: 2, narrow: 2, anime: 2, glow: 1 },
      nose: { small: 5, upturned: 2, long: 2, dot: 1 },
      top: { tunic: 4, leather: 4, robe: 3, dress: 2, coat: 2, silks: 2, trim_robe: 2, travel_shirt: 2 },
      bottom: { pants: 5, leggings: 5, skirt: 2 },
      shoes: { pointed: 5, boots: 5, sandals: 2, shoes: 2 },
      hat: { none: 10, hood: 4, circlet: 3, feather_band: 2 },
      cape: { none: 6, cape: 3, half_cape: 2, travel_cloak: 3, shawl: 1 },
      decor: { none: 8, herb_satchel: 2, belt_pouches: 2, prayer_ribbons: 1 },
    },
  },
  dwarf: {
    name: 'Dwarf', label: 'Chibi 2 Dwarf',
    body: { leg: 0.62, torso: 0.9, width: 1.22, shoulders: 1.12, arm: 0.92, hand: 1.18, head: 1.08, neck: 0.6, round: 0.45 },
    face: { jaw: 1.1, brow: 0.6, ear: 0.95, hollow: 0, muzzle: 0 },
    posture: { chest: 0.02, head: 0, knees: 0.04 },
    ranges: { height: [0, 0.35], width: [0.6, 1], headSize: [0.5, 0.8], round: [0.25, 0.85] },
    skin: ['#f1c27d', '#e0ac69', '#c68642', '#d98f6a'],
    hairColor: ['#a86a3a', '#d94a2a', '#3b2a1a', '#888888', '#eeeeee', '#6b4a2a'],
    weights: {
      ears: { normal: 10, big: 3 },
      hair: { braids: 4, buzz: 2, short: 3, bald: 3, bun: 2, slicked: 1, long: 2 },
      facialHair: { full: 8, long: 8, goatee: 1, mustache: 2, chinstrap: 1, braided_beard: 6 },
      nose: { button: 4, wide: 4, hook: 1, small: 1 },
      top: { chainmail: 3, plate: 2, smith_apron: 3, leather: 3, tunic: 2, gambeson: 3, fur_tunic: 2 },
      bottom: { pants: 6, baggy: 3, greaves: 2, kilt: 1 },
      shoes: { heavy: 6, boots: 5 },
      hat: { none: 8, horned_helm: 2, plate_helm: 1, leather_cap: 2, chain_coif: 2 },
      cape: { none: 10, fur_mantle: 3, cape: 1 },
      decor: { none: 6, belt_pouches: 3, knife_rig: 1, belt_lantern: 2, gear_pack: 1 },
    },
  },
  orc: {
    name: 'Orc', label: 'Chibi 2 Orc',
    body: { leg: 1.04, torso: 1.1, width: 1.2, shoulders: 1.22, arm: 1.12, hand: 1.2, head: 0.94, neck: 0.75, round: 0.18 },
    face: { jaw: 1.18, brow: 1, ear: 1.1, hollow: 0, muzzle: 0.15 },
    posture: { chest: 0.12, head: -0.1, knees: 0.08 },
    ranges: { height: [0.4, 1], width: [0.6, 1], headSize: [0.35, 0.6], round: [0, 0.5] },
    skin: ['#9db38a', '#7fa86a', '#6e8f5a', '#8a9a70', '#6e8fb3'],
    hairColor: ['#111111', '#3b2a1a', '#8a1a1a', '#2a2a2a'],
    weights: {
      ears: { pointed: 6, big: 4, normal: 1 },
      mouth: { tusks: 10, grin: 2, frown: 3, neutral: 2 },
      nose: { wide: 5, snout: 2, hook: 2, button: 1 },
      eyes: { angry: 5, narrow: 4, round: 1, slit: 1 },
      brows: { angry: 5, thick: 4, straight: 1 },
      hair: { mohawk: 5, bald: 3, buzz: 2, braids: 2, ponytail: 3, spiky: 2, hood_hair: 1 },
      facialHair: { none: 10, stubble: 2, goatee: 1 },
      extras: { none: 5, warpaint: 3, scar: 2, scar_cheek: 2, war_stripe: 2 },
      top: { leather: 3, rags: 3, harness: 4, tank: 3, chainmail: 2, fur_tunic: 3, plate: 1 },
      bottom: { ragged: 3, loincloth: 3, greaves: 1, pants: 3, kilt: 1 },
      shoes: { barefoot: 3, heavy: 3, boots: 4, wraps: 2 },
      hat: { none: 12, horned_helm: 2, bandana: 1, headband: 2 },
      cape: { none: 10, fur_mantle: 3, tattered_cape: 2 },
      decor: { none: 6, bone_charms: 3, knife_rig: 2, pauldrons: 2, trophy_belt: 3 },
    },
  },
  giant: {
    name: 'Giant', label: 'Chibi 2 Giant',
    body: { leg: 1.75, torso: 1.55, width: 1.3, shoulders: 1.22, arm: 1.12, hand: 1.3, head: 0.9, neck: 0.8, round: 0.3 },
    face: { jaw: 1.14, brow: 0.8, ear: 1, hollow: 0, muzzle: 0 },
    posture: { chest: 0.08, head: -0.06, knees: 0.05 },
    ranges: { height: [0.5, 1], width: [0.6, 1], headSize: [0.2, 0.45], round: [0.1, 0.8] },
    skin: ['#e0ac69', '#c68642', '#b8a18a', '#9aa4b0', '#d98f6a', '#a8b8c8'],
    hairColor: ['#3b2a1a', '#888888', '#eeeeee', '#6b4a2a', '#a86a3a'],
    weights: {
      ears: { normal: 8, big: 4 },
      hair: { long: 3, braids: 3, bald: 3, buzz: 2, ponytail: 2, curly: 2 },
      facialHair: { full: 4, long: 3, none: 4, braided_beard: 2, stubble: 2 },
      nose: { wide: 4, button: 3, hook: 2 },
      top: { fur_tunic: 5, rags: 3, harness: 3, tunic: 3, leather: 2, gambeson: 2 },
      bottom: { kilt: 3, loincloth: 3, pants: 4, baggy: 3 },
      shoes: { barefoot: 3, wraps: 4, boots: 3, sandals: 2 },
      hat: { none: 12, headband: 3, horned_helm: 1 },
      cape: { none: 8, fur_mantle: 5, travel_cloak: 1 },
      decor: { none: 6, bone_charms: 2, bedroll_pack: 2, trophy_belt: 2 },
    },
  },
  goblin: {
    name: 'Goblin', label: 'Chibi 2 Goblin',
    body: { leg: 0.72, torso: 0.84, width: 0.84, shoulders: 0.86, arm: 1.08, hand: 1.05, head: 1.18, neck: 0.7, round: 0.15 },
    face: { jaw: 0.88, brow: 0.2, ear: 1.7, hollow: 0.1, muzzle: 0 },
    posture: { chest: 0.16, head: -0.12, knees: 0.16 },
    ranges: { height: [0, 0.3], width: [0.2, 0.6], headSize: [0.6, 1], round: [0, 0.5] },
    skin: ['#7fa86a', '#9db38a', '#8aa05a', '#a8b870', '#d98f6a'],
    hairColor: ['#111111', '#3b2a1a', '#2a2a2a', '#8a1a1a'],
    weights: {
      ears: { big: 8, pointed: 6 },
      nose: { long: 6, hook: 4, wide: 1 },
      eyes: { wide: 4, narrow: 3, slit: 3, angry: 2, round: 2 },
      mouth: { grin: 6, fangs: 4, smirk: 2, open: 1 },
      hair: { bald: 6, spiky: 3, mohawk: 2, buzz: 2, hood_hair: 1 },
      facialHair: { none: 20, stubble: 1 },
      top: { rags: 5, vest: 3, leather: 3, tank: 3, harness: 2 },
      bottom: { ragged: 4, shorts: 4, loincloth: 3 },
      shoes: { barefoot: 6, sandals: 2, boots: 2, wraps: 2 },
      accessory: { none: 6, goggles: 3, earrings: 2, nose_ring: 2 },
      hat: { none: 8, leather_cap: 2, bandana: 2, goggles_up: 2 },
      cape: { none: 12, tattered_cape: 2 },
      decor: { none: 5, belt_pouches: 3, knife_rig: 2, gear_pack: 2, trophy_belt: 1 },
    },
  },
  halfling: {
    name: 'Halfling', label: 'Chibi 2 Halfling',
    body: { leg: 0.74, torso: 0.86, width: 0.96, shoulders: 0.92, arm: 0.94, hand: 0.96, head: 1.06, neck: 0.8, round: 0.35 },
    face: { jaw: 0.96, brow: 0, ear: 1.15, hollow: 0, muzzle: 0 },
    posture: { chest: -0.02, head: 0, knees: 0 },
    ranges: { height: [0, 0.3], width: [0.35, 0.8], headSize: [0.5, 0.85], round: [0.15, 0.75] },
    skin: ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642'],
    hairColor: ['#3b2a1a', '#6b4a2a', '#a86a3a', '#d9c27a'],
    weights: {
      ears: { pointed: 5, normal: 4, big: 1 },
      hair: { curly: 8, short: 3, wavy: 3, bob: 2, bangs: 2 },
      facialHair: { none: 12, stubble: 1, mustache: 1 },
      eyes: { round: 5, happy: 3, anime: 2, almond: 1 },
      mouth: { smile: 6, grin: 3, smirk: 2, neutral: 2 },
      top: { vest: 5, tunic: 4, travel_shirt: 4, doublet: 2, coat: 1 },
      bottom: { breeches: 6, pants: 3, shorts: 2 },
      shoes: { barefoot: 8, shoes: 2, sandals: 1 },
      hat: { none: 10, straw: 2, cap: 2, feather_cap: 1 },
      cape: { none: 8, travel_cloak: 3, shawl: 1 },
      decor: { none: 6, bedroll_pack: 3, belt_pouches: 3, waterskin: 2, herb_satchel: 2 },
    },
  },
  undead: {
    name: 'Undead', label: 'Chibi 2 Undead',
    body: { leg: 1.02, torso: 1.0, width: 0.84, shoulders: 0.96, arm: 1.06, hand: 0.95, head: 0.98, neck: 0.95, round: 0 },
    face: { jaw: 0.9, brow: 0.3, ear: 1, hollow: 1, muzzle: 0 },
    posture: { chest: 0.14, head: 0.08, knees: 0.06 },
    ranges: { height: [0.3, 0.8], width: [0, 0.35], headSize: [0.4, 0.7], round: [0, 0.05] },
    skin: ['#c9cfc3', '#b8a1d9', '#9db38a', '#a8b0a0', '#d8d0c0'],
    hairColor: ['#eeeeee', '#888888', '#111111', '#5a5a5a'],
    weights: {
      eyes: { hollow: 8, narrow: 2, tired: 2, dot: 2, glow: 3 },
      mouth: { stitched: 4, frown: 3, neutral: 2, fangs: 2, sad_open: 2 },
      extras: { none: 4, scar: 2, soot: 2 },
      hair: { bald: 5, slicked: 2, long: 3, wavy: 1, hood_hair: 2, tonsure: 1 },
      facialHair: { none: 10, stubble: 1, long: 1 },
      top: { rags: 6, coat: 2, robe: 3, chainmail: 2, tunic: 1 },
      bottom: { ragged: 6, pants: 2, skirt: 1 },
      shoes: { barefoot: 4, boots: 3, wraps: 3 },
      hat: { none: 8, hood: 4, crown: 1, circlet: 1 },
      cape: { none: 6, tattered_cape: 5, cape: 1 },
      decor: { none: 6, bone_charms: 3, chained_tome: 1, rune_halo: 1 },
    },
  },
  beast: {
    name: 'Beastkin', label: 'Chibi 2 Beastkin',
    body: { leg: 1.02, torso: 1.04, width: 1.08, shoulders: 1.1, arm: 1.04, hand: 1.1, head: 1.0, neck: 0.85, round: 0.1 },
    face: { jaw: 1.05, brow: 0.4, ear: 1.4, hollow: 0, muzzle: 1 },
    posture: { chest: 0.08, head: -0.04, knees: 0.1 },
    ranges: { height: [0.3, 1], width: [0.5, 1], headSize: [0.4, 0.7], round: [0, 0.4] },
    skin: ['#8d5524', '#5c3a1e', '#c68642', '#a87a4a', '#d8c8a8', '#6a6a6a'],
    hairColor: ['#3b2a1a', '#6b4a2a', '#eeeeee', '#888888', '#a86a3a'],
    weights: {
      ears: { pointed: 8, big: 3 },
      nose: { snout: 10, wide: 2 },
      mouth: { fangs: 5, grin: 2, tusks: 2, neutral: 1 },
      eyes: { slit: 5, angry: 2, wide: 2, narrow: 2 },
      hair: { spiky: 3, horns_hair: 3, hood_hair: 2, afro: 1, curly: 2, mohawk: 2 },
      facialHair: { none: 10 },
      top: { rags: 3, tank: 3, leather: 3, harness: 4, fur_tunic: 3 },
      bottom: { loincloth: 4, ragged: 3, kilt: 2, pants: 2 },
      shoes: { hooves: 3, barefoot: 5, wraps: 2 },
      hat: { none: 14, headband: 2 },
      cape: { none: 8, fur_mantle: 3, tattered_cape: 2 },
      decor: { none: 6, bone_charms: 3, trophy_belt: 3, knife_rig: 1 },
    },
  },
};

export const CHIBI2_RACE_IDS = Object.keys(CHIBI2_RACES);

/** The race record for an avatar (human when unset or unknown). */
export function raceOf(avatar) {
  const id = avatar?.body?.race;
  return CHIBI2_RACES[id] || CHIBI2_RACES.human;
}

/** Roundness 0..1: the avatar's own value, else the race default. */
export function roundOf(avatar) {
  const r = avatar?.body?.round;
  return Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : raceOf(avatar).body.round;
}

/**
 * Pick from `{ id: weight }`, ignoring ids `known` rejects (so a weight table can name a part a
 * renderer does not have yet without ever handing that id out).
 */
export function weightedPick(rng, weights, known = () => true) {
  const rows = Object.entries(weights || {}).filter(([id, w]) => w > 0 && known(id));
  const total = rows.reduce((n, [, w]) => n + w, 0);
  if (!total) return null;
  let roll = rng() * total;
  for (const [id, w] of rows) { roll -= w; if (roll <= 0) return id; }
  return rows[rows.length - 1][0];
}

/**
 * A random Chibi 2 character for a race: roll the whole look with the 2D generator (which already
 * knows every slot, palette and colour), then re-pick the slots the race has an opinion about from
 * its weights, and stamp race + roundness on the body.
 *
 *   randomChibi2(randomAvatar, presetsData, { race: 'dwarf', seed, base, only, known })
 *
 * `randomAvatar` is passed in rather than imported so this file stays importable from node without
 * pulling the SVG part catalogue. `known(slot, id)` says whether a part id exists (the avatar page
 * passes one that accepts both the 2D catalogue and the Chibi 2-only parts).
 */
export function randomChibi2(randomAvatar, data, { race = 'human', seed, base = null, only = null, known = () => true, rng: rngIn = null, makeRng } = {}) {
  const r = CHIBI2_RACES[race] || CHIBI2_RACES.human;
  const rng = rngIn || (makeRng ? makeRng((seed ?? Math.floor(Math.random() * 1e9)) ^ 0x5bd1e995) : Math.random);
  const a = randomAvatar(data, { race: data.raceRules?.[race] ? race : null, seed, base, only });
  const doFace = !only || only === 'face', doOutfit = !only || only === 'outfit', doBody = !only || only === 'body';
  const range = (lo, hi) => +(lo + rng() * (hi - lo)).toFixed(2);
  if (doBody) {
    const g = r.ranges;
    a.body.height = range(...g.height); a.body.width = range(...g.width); a.body.headSize = range(...g.headSize);
    a.body.round = range(...g.round);
    a.body.skin = r.skin[Math.floor(rng() * r.skin.length)];
    // cheeks are a style choice now, not a feature of every face
    a.body.cheeks = rng() < 0.15;
  }
  a.body.race = race;
  const FACE = ['ears', 'hair', 'facialHair', 'eyes', 'nose', 'mouth', 'brows', 'extras'];
  const OUTFIT = ['top', 'bottom', 'shoes', 'accessory', 'hat', 'cape', 'decor'];
  for (const slot of [...(doFace ? FACE : []), ...(doOutfit ? OUTFIT : [])]) {
    const id = weightedPick(rng, r.weights[slot], id => known(slot, id));
    if (id) a[slot] = { ...(a[slot] || {}), id };
  }
  if (doFace && r.hairColor) a.hair.color = r.hairColor[Math.floor(rng() * r.hairColor.length)];
  return a;
}
