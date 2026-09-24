// Farhold round 23 — WHAT THE "GRAPHICS EFFECTS" SETTING TURNS ON.
//
// Pure: no Three.js, no DOM. One function decides every pass and every particle budget, so a test
// can ask it what "low" means and nothing else in the game hard-codes the answer.
//
//   const g = resolveGraphics(settings.get('graphics'), { lowQuality });
//   g.postfx, g.bloom, g.shafts, g.gpuGrass, g.rainDrops ...
//
// Three levels, because that is what a player can reason about:
//
//   off   today's picture at today's cost. Straight to the screen, no tone mapping, the CPU grass
//         tufts and the old line rain, and the height fog and the wet ground compiled OUT of every
//         shader. What stays: the sky's colours (worked out once a frame on the processor, so the
//         sunsets are free) and the wind (the rain leans with it and the trees sway — a few vertex
//         instructions, no measurable cost).
//   low   the picture pipeline without the expensive half: an HDR frame, bloom at half resolution,
//         ACES tone mapping and the colour grade, the GPU rain and snow with splashes, rain sheets
//         and blown leaves at small budgets. No light shafts, no GPU grass, no multisampling.
//   high  everything: light shafts, 4x multisampled HDR, full bloom, film grain, the GPU grass
//         field and the bigger particle budgets. The default — the user plays on a strong card.
//
// `?quality=low` (what the Playwright specs use) forces `off`, so the specs keep testing the cheap
// path and their timings do not move.

export const GRAPHICS_LEVELS = ['off', 'low', 'high'];
export const DEFAULT_GRAPHICS = 'high';

export function resolveGraphics(level, { lowQuality = false, override = null } = {}) {
  let l = GRAPHICS_LEVELS.includes(level) ? level : DEFAULT_GRAPHICS;
  if (lowQuality) l = 'off';
  if (override && GRAPHICS_LEVELS.includes(override)) l = override;
  const on = l !== 'off', high = l === 'high';
  return {
    level: l,
    // --- the picture pipeline
    postfx: on,
    toneMapping: on ? 'aces' : 'none',
    msaa: high ? 4 : 0,
    bloom: on,
    bloomScale: high ? 1 : 0.5,
    shafts: high,
    shaftSamples: 36,
    grade: on,
    grain: high ? 0.012 : 0,
    vignette: on ? 0.22 : 0,
    // --- the world
    gpuGrass: high,
    grassRadius: 38,
    grassBlades: 48000,
    /** 0 = the old CPU line rain in js/weather.js */
    rainDrops: high ? 9000 : on ? 3600 : 0,
    snowFlakes: high ? 6000 : on ? 2400 : 0,
    splashes: high ? 220 : on ? 90 : 0,
    rainSheets: on,
    debris: high ? 380 : on ? 150 : 0,
    // per-pixel arithmetic: on everywhere but Off, which is the "as it was" level
    heightFog: on,
    wetGround: on,
    // a few vertex instructions — on at every level
    sway: true,
  };
}
