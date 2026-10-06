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

export const FACE_SLOTS = [
  { slot: 'headShape', label: 'Head', ids: ['round', 'oval', 'square', 'heart', 'long', 'wide', 'chiseled'] },
  { slot: 'hair', label: 'Hair', color: 'hair', ids: ['bald', 'buzz', 'short', 'side_part', 'bangs', 'bob', 'long', 'wavy', 'ponytail', 'bun', 'buns', 'mohawk', 'spiky', 'curly', 'afro', 'braids', 'pixie', 'slicked', 'tonsure'] },
  { slot: 'eyes', label: 'Eyes', color: 'eye', ids: ['round', 'almond', 'narrow', 'wide', 'sleepy', 'angry', 'dot', 'anime', 'happy', 'tired'] },
  { slot: 'brows', label: 'Brows', ids: ['straight', 'arched', 'angry', 'worried', 'thick', 'thin', 'raised', 'none'] },
  { slot: 'nose', label: 'Nose', ids: ['small', 'dot', 'button', 'long', 'wide', 'hook', 'upturned', 'none'] },
  { slot: 'mouth', label: 'Mouth', ids: ['smile', 'neutral', 'frown', 'open', 'grin', 'smirk', 'o'] },
  { slot: 'ears', label: 'Ears', ids: ['normal', 'pointed', 'big', 'none'] },
  { slot: 'facialHair', label: 'Beard', color: 'hair', ids: ['none', 'stubble', 'goatee', 'mustache', 'full', 'long', 'chinstrap', 'soul_patch', 'braided_beard'] },
];
export const BODY_DIALS = [
  { key: 'height', label: 'Height', min: 0, max: 1 },
  { key: 'width', label: 'Build', min: 0, max: 1 },
  { key: 'headSize', label: 'Head size', min: 0.2, max: 1 },
  { key: 'round', label: 'Roundness', min: 0, max: 0.85 },
];
export const PALETTES = {
  skin: ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#d98f6a', '#c9cfc3'],
  hair: ['#111111', '#3b2a1a', '#6b4a2a', '#a86a3a', '#d9c27a', '#f2e2b0', '#8a1a1a', '#d94a2a', '#888888', '#eeeeee', '#4a3a8a', '#2a7a5a'],
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
    if (Object.keys(b).length) out.body = b;
  }
  for (const s of FACE_SLOTS) {
    let v = c[s.slot];
    if (s.slot === 'headShape') { const id = typeof v === 'object' && v ? v.id : v; if (SLOT_IDS.headShape.has(id)) out.headShape = id; continue; }
    if (typeof v === 'string') v = { id: v };          // A's look format allows `<slot>: id` as well as `{id, color}`
    if (!v || typeof v !== 'object' || !SLOT_IDS[s.slot].has(v.id)) continue;
    out[s.slot] = { id: v.id };
    if (s.color && HEX.test(v.color || '')) out[s.slot].color = v.color.toLowerCase();
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
  if (avatar.headShape) c.headShape = avatar.headShape;
  for (const s of FACE_SLOTS) if (s.slot !== 'headShape' && avatar[s.slot]?.id) c[s.slot] = { id: avatar[s.slot].id, ...(s.color && avatar[s.slot].color ? { color: avatar[s.slot].color } : {}) };
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
export const lookCustom = look => (look ? look.avatar || look.custom || null : null);

/** The look to send: race + seed + custom (null custom = the random face from the seed). Always under 1.5 KB. */
export function lookWith(look, custom) {
  const c = cleanCustom(custom);
  const out = { race: look?.race || 'human', seed: (look?.seed >>> 0) || 1, v: 1 };
  if (c) out.avatar = c;                               // protocol v6: `avatar` = avatar-2d JSON (the server checks ids, clamps numbers)
  return out;
}
