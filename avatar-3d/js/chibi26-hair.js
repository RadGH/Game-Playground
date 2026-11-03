// Chibi 2.6 hair fits the new scaled skull through the same all-style / all-hat fitter as 2.5.
// Keeping the adapter separate lets future 2.6 hair volume updates stay out of the v2/2.5 path.
import { buildHair25 } from './chibi25-hair.js';

export function buildHair26(look, rig, ctx) {
  return buildHair25(look, rig, ctx);
}
