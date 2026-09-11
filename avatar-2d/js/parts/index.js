// Part catalog + layer order for the 2D avatar. To add a part: add an entry to the right catalog with { name, pieces: [{ layer, svg, group? }] }
// (or { svg } for face parts drawn around the origin). Layers draw in this order (back → front):
import { headShape, ears, eyes, brows, nose, mouth, facialHair } from './face.js';
import { hair } from './hair.js';
import { top, bottom, shoes, bodyBase, armsBase, legsBase } from './clothes.js';
import { accessory, hat, extras } from './accessories.js';
import { cape, held, offhand, EXTRA_HATS, EXTRA_TOPS, EXTRA_ACCESSORIES, EXTRA_MARKS, EXTRA_EYES } from './gear.js';
// Emberveil-era additions merge into the original catalogs (gear.js documents them)
Object.assign(hat, EXTRA_HATS); Object.assign(top, EXTRA_TOPS); Object.assign(accessory, EXTRA_ACCESSORIES); Object.assign(extras, EXTRA_MARKS); Object.assign(eyes, EXTRA_EYES);

export const LAYERS = ['hairBack', 'hatBack', 'capeBack', 'arms', 'legs', 'shoes', 'bottom', 'body', 'top', 'skirtOver', 'sleeves', 'capeFront', 'headShape', 'ears', 'extras', 'eyes', 'brows', 'nose', 'mouth', 'facialHair', 'hairFront', 'accessory', 'hat', 'hatFront', 'offhand', 'held'];
/** Slots a character JSON can set (each maps to a catalog). */
export const SLOTS = ['headShape', 'hair', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'facialHair', 'top', 'bottom', 'shoes', 'accessory', 'hat', 'extras', 'cape', 'held', 'offhand'];
export const PARTS = { headShape, hair, eyes, brows, nose, mouth, ears, facialHair, top, bottom, shoes, accessory, hat, extras, cape, held, offhand, bodyBase, armsBase, legsBase };
/** Which slots carry a colour, and which CSS var they feed. */
export const COLOR_SLOTS = { hair: '--hair', eyes: '--eye', mouth: '--mouth', top: '--top', bottom: '--bottom', shoes: '--shoes', accessory: '--acc', hat: '--hat', extras: '--extra', cape: '--cape', held: '--held', offhand: '--offhand' };
export const SLOT_LABELS = { headShape: 'Head shape', hair: 'Hair', eyes: 'Eyes', brows: 'Eyebrows', nose: 'Nose', mouth: 'Mouth', ears: 'Ears', facialHair: 'Facial hair', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', accessory: 'Accessory', hat: 'Hat', extras: 'Marks', cape: 'Cape', held: 'Held (right hand)', offhand: 'Off-hand' };
export function partIds(slot) { return Object.keys(PARTS[slot] || {}); }
export function catalogSummary() { return Object.fromEntries(SLOTS.map(s => [s, partIds(s)])); }
