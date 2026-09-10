// Part catalog + layer order for the 2D avatar. To add a part: add an entry to the right catalog with { name, pieces: [{ layer, svg, group? }] }
// (or { svg } for face parts drawn around the origin). Layers draw in this order (back → front):
import { headShape, ears, eyes, brows, nose, mouth, facialHair } from './face.js';
import { hair } from './hair.js';
import { top, bottom, shoes, bodyBase, armsBase, legsBase } from './clothes.js';
import { accessory, hat, extras } from './accessories.js';

export const LAYERS = ['hairBack', 'hatBack', 'arms', 'legs', 'shoes', 'bottom', 'body', 'top', 'skirtOver', 'sleeves', 'headShape', 'ears', 'extras', 'eyes', 'brows', 'nose', 'mouth', 'facialHair', 'hairFront', 'accessory', 'hat', 'hatFront'];
/** Slots a character JSON can set (each maps to a catalog). */
export const SLOTS = ['headShape', 'hair', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'facialHair', 'top', 'bottom', 'shoes', 'accessory', 'hat', 'extras'];
export const PARTS = { headShape, hair, eyes, brows, nose, mouth, ears, facialHair, top, bottom, shoes, accessory, hat, extras, bodyBase, armsBase, legsBase };
/** Which slots carry a colour, and which CSS var they feed. */
export const COLOR_SLOTS = { hair: '--hair', eyes: '--eye', mouth: '--mouth', top: '--top', bottom: '--bottom', shoes: '--shoes', accessory: '--acc', hat: '--hat', extras: '--extra' };
export const SLOT_LABELS = { headShape: 'Head shape', hair: 'Hair', eyes: 'Eyes', brows: 'Eyebrows', nose: 'Nose', mouth: 'Mouth', ears: 'Ears', facialHair: 'Facial hair', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', accessory: 'Accessory', hat: 'Hat', extras: 'Marks' };
export function partIds(slot) { return Object.keys(PARTS[slot] || {}); }
export function catalogSummary() { return Object.fromEntries(SLOTS.map(s => [s, partIds(s)])); }
