// A CHARACTER'S LOOK, checked (stream A, play-test 2: Q20 barber, Q21 "Customize Appearance" on the title screen). Pure.
//
// The look is the shared character JSON's `avatar` section (shared/character-schema.md, avatar-2d/README.md) plus the
// two things Thousandvale adds: the playable `race` and a `seed` (the client's defaultLook rolls the rest from them).
//
//   { v: 1, race: 'human'|'elf'|'dwarf'|'halfling', seed: <uint32>, custom?: { body: {height, width, headSize, skin,
//     round?, cheeks?, ...}, <slot>: 'id' | { id, color?, color2?, x?, y?, scale?, rot? } } }
// `custom` (D-UI's name; `avatar` is read as the same thing) is the avatar-2d JSON that overrides the class default.
//
// cleanLook(raw) -> { ok, look, why? }. Nothing the client sends is stored as it is: unknown keys are dropped, part ids are
// checked against avatar-2d's catalog (an unknown id drops that slot, so the default shows — the schema's rule), colours
// must be #rrggbb, numbers are clamped. Held / off-hand parts are dropped: what you hold is your gear, not your face.

import { PARTS, SLOTS } from '../../../../avatar-2d/js/parts/index.js';

export const PLAYABLE_RACES = Object.freeze(['human', 'elf', 'dwarf', 'halfling']);
export const LOOK_MAX_BYTES = 4096;
const LOOK_SLOTS = SLOTS.filter(s => s !== 'held' && s !== 'offhand');
const HEX = /^#[0-9a-fA-F]{6}$/;
const KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,23}$/;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = v => typeof v === 'number' && Number.isFinite(v);
/** Per-part knobs and their ranges (avatar-2d's Mii-style face sliders). */
const PART_NUM = { x: [-1, 1], y: [-1, 1], scale: [0.4, 2.5], rot: [-60, 60] };

function cleanBody(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(b)) {
    if (n >= 24 || !KEY.test(k)) continue;
    if (k === 'skin' || k === 'skin2') { if (typeof v === 'string' && HEX.test(v)) { out[k] = v.toLowerCase(); n++; } continue; }
    if (k === 'race') { if (typeof v === 'string' && /^[a-z_]{1,24}$/.test(v)) { out.race = v; n++; } continue; }
    if (k === 'c3' && v && typeof v === 'object' && !Array.isArray(v)) {            // Chibi 3 dials: numbers only
      const c3 = {};
      for (const [ck, cv] of Object.entries(v)) if (KEY.test(ck) && num(cv) && Object.keys(c3).length < 32) c3[ck] = clamp(cv, -2, 2);
      out.c3 = c3; n++; continue;
    }
    if (num(v)) { out[k] = clamp(v, -2, 2); n++; }
    else if (typeof v === 'boolean') { out[k] = v; n++; }
  }
  return out;
}
function cleanPart(slot, v) {
  const known = PARTS[slot] || {};
  const okId = id => typeof id === 'string' && (id === 'none' || Object.prototype.hasOwnProperty.call(known, id));
  if (typeof v === 'string') return okId(v) ? v : null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (!okId(v.id)) return null;
  const out = { id: v.id };
  for (const c of ['color', 'color2']) if (typeof v[c] === 'string' && HEX.test(v[c])) out[c] = v[c].toLowerCase();
  for (const [k, [a, b]] of Object.entries(PART_NUM)) if (num(v[k])) out[k] = clamp(v[k], a, b);
  return out;
}

/** Clean a look a client sent. `fallback` (the stored look) fills race / seed when the new one leaves them out. */
export function cleanLook(raw, fallback = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, why: 'look', msg: 'That is not a look.' };
  let size = 0;
  try { size = JSON.stringify(raw).length; } catch { return { ok: false, why: 'look', msg: 'That is not a look.' }; }
  if (size > LOOK_MAX_BYTES) return { ok: false, why: 'look', msg: 'That look is too big.' };
  const race = PLAYABLE_RACES.includes(raw.race) ? raw.race : (fallback && PLAYABLE_RACES.includes(fallback.race) ? fallback.race : 'human');
  const seed = Number.isSafeInteger(raw.seed) ? raw.seed >>> 0 : (fallback && Number.isSafeInteger(fallback.seed) ? fallback.seed >>> 0 : 1);
  const look = { v: 1, race, seed };
  const a = raw.custom && typeof raw.custom === 'object' ? raw.custom : raw.avatar;
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    const av = {};
    const body = cleanBody(a.body);
    if (body && Object.keys(body).length) av.body = body;
    for (const slot of LOOK_SLOTS) {
      if (a[slot] === undefined) continue;
      const p = cleanPart(slot, a[slot]);
      if (p !== null) av[slot] = p;
    }
    if (Object.keys(av).length) look.custom = av;
  }
  return { ok: true, look };
}

/** The stored look is a custom one (it overrides the class default the client would otherwise draw). */
export const isCustom = look => !!(look && look.custom && typeof look.custom === 'object');
