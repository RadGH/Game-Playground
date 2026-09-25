// Farhold — the skies a system can have.
//
// Split out of `js/sky.js` so `node --test` can check them: the module that draws the texture pulls
// in Three.js, and this is a table of colours. Same split as `dungeon-plan.js`, `water-plan.js` and
// `town-plan.js`.
//
//   "The skybox with the purple haze and stars is very cool. Can we have several variations of this
//    skybox used by different stars? Can each one customize the colors of the skybox so that stars
//    all feel more unique and different?"
//
// The sky was already seeded by the star, so no two systems shared one — but every one of them was
// the same *kind* of sky: one dusty band in blue and violet. These are six genuinely different
// looks. A star picks one from its own seed and then recolours it inside that look's ranges, so a
// system reads as somewhere rather than as another roll of the same dice.
//
//   base    the empty colour behind everything
//   hueA    the hue range most of the dust is drawn from
//   hueB    …and the range the rest of it uses, for a two-tone band
//   dust    how many blobs make the band up
//   spread  how far each one reaches
//   glow    how bright they are
//   sat     how coloured, 0 (grey) to 100

export const SKY_LOOKS = [
  { key: 'veil', name: 'the Veil', base: '#04050b', hueA: [200, 260], hueB: [280, 330], dust: 1, spread: 1, glow: 1, sat: 60 },
  { key: 'ember', name: 'the Ember Reach', base: '#0a0503', hueA: [10, 40], hueB: [330, 360], dust: 0.85, spread: 1.2, glow: 1.15, sat: 68 },
  { key: 'jade', name: 'the Jade Drift', base: '#030806', hueA: [140, 180], hueB: [180, 210], dust: 1.1, spread: 0.85, glow: 0.9, sat: 55 },
  { key: 'deep', name: 'the Deep', base: '#020309', hueA: [215, 240], hueB: [240, 265], dust: 0.5, spread: 0.7, glow: 0.7, sat: 40 },
  { key: 'furnace', name: 'the Furnace', base: '#0b0604', hueA: [25, 55], hueB: [0, 20], dust: 1.35, spread: 1.4, glow: 1.3, sat: 75 },
  { key: 'pale', name: 'the Pale Shoal', base: '#060810', hueA: [190, 220], hueB: [40, 60], dust: 0.75, spread: 1.1, glow: 0.85, sat: 30 },
];

/** Which sky a star has. Deterministic, so a system always looks like itself. */
export function skyLookFor(seed = 1) {
  let h = ((seed >>> 0) * 2654435761) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return SKY_LOOKS[h % SKY_LOOKS.length];
}
