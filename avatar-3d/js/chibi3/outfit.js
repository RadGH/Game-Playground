// Chibi 3 outfit: clothes, armour, hair, beards, headwear, capes and held things, built as layers on
// the body. (Garments in progress.)
import { buildHeld } from './weapons.js';
export function buildOutfit(a, R, body, asm, opts = {}) {
  const hold = buildHeld(a, R, body, asm, opts);
  return { hold };
}
