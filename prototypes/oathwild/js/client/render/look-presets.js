// The Look setting (world-tools round 2026-11-26, owner: "shaders like visual effects like used in minecraft with mods …
// Can we have some shader options to adjust the look"). Plain data: named presets, the Custom sliders and the effects
// with their phone cost. Classic is today's picture exactly (every number null = "leave the game's own value").
//
// A preset only changes NUMBERS (uniforms, light strengths, shadow settings): switching between presets never builds a
// shader. An effect that needs its own pass (`pass: true`) is built once when a preset first turns it on, behind a short
// fade, and afterwards only its strength changes (lessons rule 29).
//
// Grade numbers are FACTORS on the Look tuning numbers (data/tuning.json, group Look) and on the map editor's region
// looks, so a region's own mood survives every preset. Effects are 0..1 strengths.
// Waving grass and leaves are not an effect here: the one wind (render/wind.js) moves them in every preset, Classic too.

/** Every knob a preset can set: label, range, what the player reads. `kind: 'grade'` multiplies a Look number. */
export const LOOK_KNOBS = Object.freeze({
  exposure:   { label: 'Brightness', min: 0.8, max: 1.2, step: 0.01, kind: 'grade', of: 'lookExposure' },
  saturation: { label: 'Colour', min: 0.85, max: 1.2, step: 0.01, kind: 'grade', of: 'lookSaturation' },
  contrast:   { label: 'Contrast', min: 0.9, max: 1.15, step: 0.01, kind: 'grade', of: 'lookContrast' },
  warm:       { label: 'Warm light', min: 0, max: 3, step: 0.1, kind: 'grade', of: 'lookWarm' },
  cool:       { label: 'Cool shade', min: 0, max: 3, step: 0.1, kind: 'grade', of: 'lookCool' },
  vignette:   { label: 'Dark corners', min: 0, max: 2.2, step: 0.1, kind: 'grade', of: 'lookVignette' },
  bloom:      { label: 'Glow', min: 0, max: 1.5, step: 0.05, kind: 'grade', of: 'lookBloom' },
  sun:        { label: 'Sunlight', min: 0.8, max: 1.2, step: 0.01, kind: 'grade', of: 'lookSun' },
  clouds:     { label: 'Cloud shadows', min: 0, max: 2, step: 0.1, kind: 'grade', of: 'lookClouds' },
});

/**
 * The effects, each a 0..1 strength. cost = the extra time it adds on a phone, measured (README "Look": the numbers
 * come from tests/ui/look-shots.mjs on this machine's software renderer, scaled to a mid phone). `low: false` = never
 * on the Low graphics setting. `pass: true` = its own shader pass (built once, on pick).
 */
export const LOOK_EFFECTS = Object.freeze({
  rays:     { label: 'Light shafts', help: 'Sun rays through the leaves and gaps in the clouds', cost: 'medium', low: false, pass: true },
  shadows:  { label: 'Soft long shadows', help: 'Softer shadow edges that reach further from you', cost: 'medium', low: false },
  contact:  { label: 'Contact shading', help: 'Soft shade where things meet the ground and each other', cost: 'high', low: false, pass: true },
  depth:    { label: 'Distance blur', help: 'Far hills soften a little, like a camera lens', cost: 'medium', low: false, pass: true },
  water:    { label: 'Water shine', help: 'Water mirrors the sky, ripples and foams at the shore', cost: 'low', low: true },
  sky:      { label: 'Rich sky', help: 'Fuller clouds and a warmer glow round the sun', cost: 'low', low: true },
  wet:      { label: 'Wet look in rain', help: 'Ground and roofs darken and shine when it rains', cost: 'low', low: true },
});
export const COST_WORDS = { low: 'Light on a phone', medium: 'Some phone cost', high: 'Heavy on a phone' };

const CLASSIC = { exposure: null, saturation: null, contrast: null, warm: null, cool: null, vignette: null, bloom: null, sun: null, clouds: null,
  fx: { rays: null, shadows: 0, contact: null, depth: 0, water: 0, sky: 0, wet: 0 } };

/** The named presets, in the order the Settings window shows them. null = today's value (Classic). */
export const LOOK_PRESETS = Object.freeze({
  classic: { name: 'Classic', blurb: 'The look Oathwild has always had.', ...CLASSIC },
  vivid: { name: 'Vivid', blurb: 'Bright, saturated storybook colour, rich sky, shining water.',
    exposure: 1.0, saturation: 1.1, contrast: 1.04, warm: 1.3, cool: 0.8, vignette: 0.7, bloom: 1.0, sun: 1.05, clouds: 0.8,
    fx: { rays: 0.7, shadows: 0.6, contact: 0.6, depth: 0, water: 1, sky: 1, wet: 1 } },
  cinematic: { name: 'Cinematic', blurb: 'Warm light, cool shade, light shafts and a soft lens in the distance.',
    exposure: 0.98, saturation: 1.0, contrast: 1.08, warm: 2.2, cool: 2.0, vignette: 1.8, bloom: 1.3, sun: 1.04, clouds: 1.2,
    fx: { rays: 1, shadows: 1, contact: 1, depth: 0.8, water: 1, sky: 1, wet: 1 } },
  moody: { name: 'Moody', blurb: 'Deeper shadows, quieter colour, heavier skies.',
    exposure: 0.94, saturation: 0.9, contrast: 1.1, warm: 0.6, cool: 2.6, vignette: 2.1, bloom: 0.8, sun: 0.92, clouds: 1.8,
    fx: { rays: 0.8, shadows: 1, contact: 1, depth: 0.5, water: 0.8, sky: 0.6, wet: 1 } },
  custom: { name: 'Custom', blurb: 'Your own: start from any preset and move the sliders.', ...CLASSIC },
});
export const LOOK_IDS = Object.keys(LOOK_PRESETS);

/** The look a player has: { id, custom? } from settings → the full set of numbers (Custom = its saved sliders). */
export function resolveLook(setting = {}) {
  const id = LOOK_IDS.includes(setting?.id) ? setting.id : 'classic';
  const base = LOOK_PRESETS[id];
  if (id !== 'custom') return { id, ...base, fx: { ...base.fx } };
  const c = setting.custom || {};
  const out = { id, name: base.name, blurb: base.blurb, fx: {} };
  for (const [k, K] of Object.entries(LOOK_KNOBS)) out[k] = Number.isFinite(c[k]) ? Math.min(K.max, Math.max(K.min, c[k])) : null;
  for (const k of Object.keys(LOOK_EFFECTS)) out.fx[k] = Number.isFinite(c.fx?.[k]) ? Math.min(1, Math.max(0, c.fx[k])) : CLASSIC.fx[k];
  return out;
}
/** A preset's numbers as Custom sliders (the starting point when the player picks Custom from it). */
export function customFrom(id) {
  const P = LOOK_PRESETS[id] || LOOK_PRESETS.classic;
  const c = { fx: {} };
  for (const k of Object.keys(LOOK_KNOBS)) c[k] = P[k] ?? 1;
  for (const k of Object.keys(LOOK_EFFECTS)) c.fx[k] = P.fx[k] ?? (k === 'rays' || k === 'contact' ? 1 : 0);
  return c;
}
