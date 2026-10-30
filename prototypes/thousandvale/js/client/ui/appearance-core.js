// Character appearance (play-test 2 Q20 Barber, Q21 "Customize Appearance" on the title screen) — pure, no DOM.
//
// A player's look on the wire stays small: `{ race, seed, v, avatar? }` (protocol v6 §18; `custom` is read too).
// `avatar` holds ONLY the face and body choices
// a person made in the editor; everything else (clothes, the class outfit on the title preview, worn gear in the world)
// still comes from the class and the gear, so a custom look never fights the P22 gear rules:
//
//   custom = { body: { height, width, headSize, round, skin }, headShape, hair: { id, color }, eyes: { id, color },
//              brows: { id }, nose: { id }, mouth: { id }, ears: { id }, facialHair: { id, color } }
//
// applyCustom(avatar, custom) lays those over a Chibi 2 avatar built by randomChibi2 (looks.js avatarFor calls it).
// The part ids are the avatar-2d catalog's (avatar-2d/js/parts/*), which Chibi 2 draws — the same lists Farhold's
// avatar editor offers.

// 2026-10-16 (Chibi 2.5, owner: "Yes go with the 2.5 for Thousandvale"): every slot also offers the ids Chibi 2.5 added
// (avatar-3d/js/chibi25-options.js CHIBI25_OPTIONS — registered in avatar-2d as `bespoke`, so a random roll never picks
// them and an old save's random face is the face it always was), plus 2.5's extra fields on a part (`fields`: the
// pupil and iris shape, a second eye colour for odd eyes, brow thickness, ear size, a second hair colour) and its body
// options (`BODY_DIALS` shoulders / legs / arms, `BODY_PICKS` shape and posture). Tails are not offered: none of the
// four playable peoples has one (CHIBI25_OPTIONS.body.raceTails), and clothes come from your calling and your gear.
import { CHIBI25_OPTIONS } from '../../../../../avatar-3d/js/chibi25-options.js';
import { KESTREL } from '../chars-mode.js';
const C25 = CHIBI25_OPTIONS.face, F25 = CHIBI25_OPTIONS.fields, B25 = CHIBI25_OPTIONS.body;
const plus = (ids, slot, skip = []) => [...ids, ...C25[slot].added.filter(id => !ids.includes(id) && !skip.includes(id))];
/** Ear shapes for beast folk only (none of Thousandvale's peoples). */
const BEAST_EARS = ['cat_ears', 'wolf_ears'];
/** Menu names for 2.5 ids (the rest are shown from their id). */
export const PART_NAMES = Object.fromEntries(Object.entries(C25).map(([slot, o]) => [slot, o.names || {}]));

export const FACE_SLOTS = [
  { slot: 'headShape', label: 'Head', ids: ['round', 'oval', 'square', 'heart', 'long', 'wide', 'chiseled'] },
  { slot: 'hair', label: 'Hair', color: 'hair', ids: plus(['bald', 'buzz', 'short', 'side_part', 'bangs', 'bob', 'long', 'wavy', 'ponytail', 'bun', 'buns', 'mohawk', 'spiky', 'curly', 'afro', 'braids', 'pixie', 'slicked', 'tonsure'], 'hair'),
    fields: [{ key: 'color2', label: 'Second colour', type: 'color', palette: 'hair', when: ['twin_tails', 'locs', 'long_braid'] }] },
  { slot: 'eyes', label: 'Eyes', color: 'eye', ids: plus(['round', 'almond', 'narrow', 'wide', 'sleepy', 'angry', 'dot', 'anime', 'happy', 'tired'], 'eyes'),
    fields: [{ key: 'pupil', label: 'Pupils', type: 'pick', ids: F25.eyes.pupil.ids, names: F25.eyes.pupil.names }, { key: 'iris', label: 'Iris', type: 'pick', ids: F25.eyes.iris.ids, names: F25.eyes.iris.names },
      { key: 'colorR', label: 'Right eye', type: 'color', palette: 'eye', clear: 'Same' }] },
  { slot: 'brows', label: 'Brows', ids: plus(['straight', 'arched', 'angry', 'worried', 'thick', 'thin', 'raised', 'none'], 'brows'),
    fields: [{ key: 'thick', label: 'Brow thickness', type: 'range', min: F25.brows.thick.min, max: F25.brows.thick.max, def: 1 }] },
  { slot: 'nose', label: 'Nose', ids: plus(['small', 'dot', 'button', 'long', 'wide', 'hook', 'upturned', 'none'], 'nose') },
  { slot: 'mouth', label: 'Mouth', ids: plus(['smile', 'neutral', 'frown', 'open', 'grin', 'smirk', 'o'], 'mouth') },
  { slot: 'ears', label: 'Ears', ids: plus(['normal', 'pointed', 'big', 'none'], 'ears', BEAST_EARS), byRace: CHIBI25_OPTIONS.raceEars,
    fields: [{ key: 'scale', label: 'Ear size', type: 'range', min: F25.ears.scale.min, max: F25.ears.scale.max, def: 1 }] },
  { slot: 'facialHair', label: 'Beard', color: 'hair', ids: plus(['none', 'stubble', 'goatee', 'mustache', 'full', 'long', 'chinstrap', 'soul_patch', 'braided_beard'], 'facialHair') },
  // R1 "face, accessories, hair": glasses, earrings, a scarf… and marks on the skin. A new character starts with NONE of either.
  { slot: 'accessory', label: 'Accessory', color: 'cloth', ids: ['none', 'glasses', 'round_glasses', 'monocle', 'eyepatch', 'goggles', 'earrings', 'nose_ring', 'sunglasses', 'scarf', 'pendant', 'prayer_beads'] },
  { slot: 'extras', label: 'Face marks', ids: plus(['none', 'freckles', 'blush', 'scar', 'scar_cheek', 'warpaint', 'wrinkles', 'freckles_heavy', 'cheek_stripes', 'war_stripe'], 'extras') },
];
export const BODY_DIALS = [
  { key: 'height', label: 'Height', min: 0, max: 1 },
  { key: 'width', label: 'Build', min: 0, max: 1 },
  { key: 'headSize', label: 'Head size', min: 0.2, max: 1 },
  { key: 'round', label: 'Roundness', min: 0, max: 0.85 },
  // Chibi 2.5 body sliders (0.5 = as your people are built)
  { key: 'shoulders', label: 'Shoulders', min: 0, max: 1 },
  { key: 'legs', label: 'Leg length', min: 0, max: 1 },
  { key: 'arms', label: 'Arm thickness', min: 0, max: 1 },
];
/** Chibi 2.5 body choices from a list (`avatar.body.shape`, `.posture`). */
// Kestrel (batch 1, `?chars=kestrel` only): the Body pick (masc / fem → avatar.body.form) comes first; a Chibi body has
// no use for it. Kept HERE, not imported from avatar-3d/kestrel/: Tumblefair and Knockabout load this file, their public
// copies leave the Kestrel trial out, and one missing import took their look code down (2026-10-30).
const BODY_FORM_PICK = { key: 'form', label: 'Body', ids: ['masc', 'fem'], names: { masc: 'Broad (masculine)', fem: 'Slender (feminine)' } };
export const BODY_PICKS = [
  ...(KESTREL ? [BODY_FORM_PICK] : []),
  { key: 'shape', label: 'Body type', ids: B25.shape.ids, names: B25.shape.names },
  { key: 'posture', label: 'Posture', ids: B25.posture.ids, names: B25.posture.names },
];
/** A slot's ids in the order a people's editor offers them (ears: the ones that suit your people first). */
export function slotIds(s, race) {
  const pref = s.byRace?.[race];
  return pref ? [...pref.filter(id => s.ids.includes(id)), ...s.ids.filter(id => !pref.includes(id))] : s.ids;
}
export const PALETTES = {
  skin: ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#d98f6a', '#c9cfc3'],
  hair: ['#111111', '#3b2a1a', '#6b4a2a', '#a86a3a', '#d9c27a', '#f2e2b0', '#8a1a1a', '#d94a2a', '#888888', '#eeeeee', '#4a3a8a', '#2a7a5a'],
  cloth: ['#2a2a3a', '#c9a227', '#8a8f99', '#2f4f7f', '#8a2e2e', '#2e7d32', '#e8e8e8', '#6b4a2a'],
  eye: ['#4a6b8a', '#3a8a5a', '#6b4a2a', '#222222', '#8a6a2a', '#5a4aaa', '#c33333', '#7fe0ee', '#e0c040'],
};
const HEX = /^#[0-9a-f]{6}$/i;
const SLOT_IDS = Object.fromEntries(FACE_SLOTS.map(s => [s.slot, new Set(s.ids)]));

/** A custom blob from anywhere (the wire, localStorage), cleaned: unknown slots/ids dropped, dials clamped, colours checked. */
export function cleanCustom(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  if (c.body && typeof c.body === 'object') {
    const b = {};
    for (const d of BODY_DIALS) if (Number.isFinite(c.body[d.key])) b[d.key] = Math.round(Math.max(d.min, Math.min(d.max, c.body[d.key])) * 100) / 100;
    if (HEX.test(c.body.skin || '')) b.skin = c.body.skin.toLowerCase();
    for (const p of BODY_PICKS) if (p.ids.includes(c.body[p.key])) b[p.key] = c.body[p.key];
    if (Object.keys(b).length) out.body = b;
  }
  for (const s of FACE_SLOTS) {
    let v = c[s.slot];
    if (s.slot === 'headShape') { const id = typeof v === 'object' && v ? v.id : v; if (SLOT_IDS.headShape.has(id)) out.headShape = id; continue; }
    if (typeof v === 'string') v = { id: v };          // A's look format allows `<slot>: id` as well as `{id, color}`
    if (!v || typeof v !== 'object' || !SLOT_IDS[s.slot].has(v.id)) continue;
    out[s.slot] = { id: v.id };
    if (s.color && HEX.test(v.color || '')) out[s.slot].color = v.color.toLowerCase();
    for (const f of s.fields || []) {
      const x = v[f.key];
      if (f.type === 'color' && HEX.test(x || '')) out[s.slot][f.key] = x.toLowerCase();
      else if (f.type === 'pick' && f.ids.includes(x)) out[s.slot][f.key] = x;
      else if (f.type === 'range' && Number.isFinite(x)) out[s.slot][f.key] = Math.round(Math.max(f.min, Math.min(f.max, x)) * 100) / 100;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** The avatar with the custom face/body laid over it (a new object; the input is not changed). */
export function applyCustom(avatar, custom) {
  const c = cleanCustom(custom);
  if (!avatar || !c) return avatar;
  const a = { ...avatar };
  if (c.body) a.body = { ...(avatar.body || {}), ...c.body };
  if (c.headShape) a.headShape = c.headShape;
  for (const s of FACE_SLOTS) {
    if (s.slot === 'headShape' || !c[s.slot]) continue;
    a[s.slot] = { ...(avatar[s.slot] || {}), ...c[s.slot] };
  }
  return a;
}

/** A custom blob that reproduces this avatar's face and body (the editor starts from the look you have). */
export function customFrom(avatar) {
  if (!avatar) return null;
  const c = { body: {} };
  for (const d of BODY_DIALS) if (Number.isFinite(avatar.body?.[d.key])) c.body[d.key] = avatar.body[d.key];
  if (avatar.body?.skin) c.body.skin = avatar.body.skin;
  for (const p of BODY_PICKS) if (avatar.body?.[p.key]) c.body[p.key] = avatar.body[p.key];
  if (avatar.headShape) c.headShape = avatar.headShape;
  for (const s of FACE_SLOTS) {
    const v = avatar[s.slot];
    if (s.slot === 'headShape' || !v?.id) continue;
    c[s.slot] = { id: v.id, ...(s.color && v.color ? { color: v.color } : {}) };
    for (const f of s.fields || []) if (v[f.key] != null) c[s.slot][f.key] = v[f.key];
  }
  return cleanCustom(c);
}

/** A short stable key for a custom blob (look caches, portrait caches). */
export function customKey(custom) {
  const c = cleanCustom(custom);
  if (!c) return '';
  const s = JSON.stringify(c);
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** The custom part of a look, whichever key it came under (`avatar` on the wire, `custom` in older saves). */
export const lookCustom = look => (look ? look.custom || look.avatar || null : null);

/** The look to send: race + seed + custom (null custom = the random face from the seed). Always under 1.5 KB. */
export function lookWith(look, custom) {
  const c = cleanCustom(custom);
  const out = { race: look?.race || 'human', seed: (look?.seed >>> 0) || 1, v: 1 };
  if (c) out.custom = c;                               // protocol v6 §18 stores it as `custom` (avatar-2d ids checked, numbers clamped)
  return out;
}

// ---- the barber's bill (play-test 2 Q20) — the same sums as the server (js/sim/province.js barberCost) ----------
/** Only the parts of `cur` that differ from `base` (the editor starts from your whole face; the barber charges for changes). */
export function diffCustom(base, cur) {
  const b = cleanCustom(base) || {}, c = cleanCustom(cur) || {};
  const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  const out = {};
  for (const k of Object.keys(c)) {
    if (k === 'body') { const d = {}; for (const [bk, v] of Object.entries(c.body)) if (!same(v, b.body?.[bk])) d[bk] = v; if (Object.keys(d).length) out.body = d; }
    else if (!same(c[k], b[k])) out[k] = c[k];
  }
  return out;
}
/** Lay changed parts over a stored custom blob (body dials merged, not replaced). */
export function mergeCustom(stored, changes) {
  const s = cleanCustom(stored) || {}, ch = cleanCustom(changes) || {};
  const out = { ...s, ...ch };
  if (s.body || ch.body) out.body = { ...(s.body || {}), ...(ch.body || {}) };
  return cleanCustom(out);
}
export const BARBER_DEFAULT = { prices: { hair: 5, hairColour: 4, beard: 4, eyes: 6, face: 10, skin: 12, body: 20, everything: 40 }, perLevel: 0.05 };
/** Gold for a barber change: each part at its list price, a new people = everything, capped, scaled by level; first visit free. */
export function barberCost(before, after, { prices = {}, perLevel = 0.05, level = 1, free = false, raceChanged = false, seedChanged = false } = {}) {
  if (free) return 0;
  const P = { ...BARBER_DEFAULT.prices, ...prices };
  const a = before || {}, b = after || {};
  const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  const idOf = v => (v && typeof v === 'object' ? v.id : v);
  let sum = 0;
  if (raceChanged) sum = P.everything;
  else {
    if (!same(idOf(a.hair), idOf(b.hair))) sum += P.hair;
    if (!same(a.hair?.color, b.hair?.color) || !same(a.hair?.color2, b.hair?.color2)) sum += P.hairColour;
    if (!same(a.facialHair, b.facialHair)) sum += P.beard;
    if (!same(a.eyes, b.eyes)) sum += P.eyes;
    if (['headShape', 'nose', 'mouth', 'brows', 'ears'].some(k => !same(a[k], b[k])) || seedChanged) sum += P.face;
    const ab = a.body || {}, bb = b.body || {};
    if (!same(ab.skin, bb.skin)) sum += P.skin;
    const { skin: _x, ...ra } = ab, { skin: _y, ...rb } = bb; void _x; void _y;
    if (!same(ra, rb)) sum += P.body;
  }
  return Math.round(Math.min(sum, P.everything) * (1 + perLevel * (level - 1)));
}

/** A NEW character's starting face: no accessory and no face marks (the seeded random face may roll a visor or a scar). */
export function freshCustom(custom) { return { ...(custom || {}), accessory: { id: 'none' }, extras: { id: 'none' } }; }
