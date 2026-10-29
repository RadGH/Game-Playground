// Kestrel kit — a Chibi 2 avatar as a Kestrel look (Thousandvale batch 1, 2026-10-27).
//
// Games that draw people with Chibi 2 hand the shared avatar JSON (shared/character-schema.md) to the body factory.
// `kestrelLookFromChibi(avatar)` turns it into what kestrel.js reads, and carries the normalised Chibi look along
// (`look.chibi`) so the body gets that look's held items, cape, pack, belt and hat (gear-bridge.js) and plays that
// look's hold-aware clips (retarget.js). Pure apart from the Chibi tables it imports; never throws on an odd look.
//
// DECISIONS (batch 1 — batch 2 adds a Body pick to the editor, batch 4 real clothes):
//   * form: there is no gender anywhere in Thousandvale's data. `body.form` wins when a look has one; otherwise facial
//     hair (a beard, a moustache, stubble) reads as 'masc', then long hair styles as 'fem' (avatar-3d/kestrel/js/swap.js
//     formFor), then 'masc'.
//   * race: proportions, not a different body — RACE_K below (overall height, girth, head and hand size). A dwarf is
//     1.36 m and broad with big hands, a halfling 1.2 m, an elf a little taller and slimmer.
//   * dials: Chibi's 0..1 height / width move Kestrel's own (±4.5 % height) mildly; roundness adds girth.
//   * clothes (batch 4): every top / bottom / shoe / glove id passes through to clothes-catalog.js (the stand-in shirt,
//     trousers and boots of batch 1 are gone).
//   * hair under a hat: kept as it is — batch 3 (hat-build.js) cuts it to the hat.
import { normalizeAvatar } from '../../../../avatar-2d/js/render.js';
import { raceOf } from '../../../js/chibi2-races.js';
import { holdFor, applyHandsRule } from '../../../js/chibi2-weapon-ids.js';
import { CHIBI2_ONLY_PARTS } from '../../../js/chibi2.js';

/** Per race: overall scale (× a 1.78 m / 1.68 m body), girth, head and hand size. */
export const RACE_K = {
  human:    { scale: 1.0,  girth: 1.0,  head: 1.0,  hand: 1.0 },
  elf:      { scale: 1.03, girth: 0.92, head: 0.97, hand: 0.96 },
  dwarf:    { scale: 0.77, girth: 1.24, head: 1.13, hand: 1.14 },
  halfling: { scale: 0.68, girth: 1.02, head: 1.14, hand: 1.0 },
  orc:      { scale: 1.06, girth: 1.18, head: 1.04, hand: 1.12 },
  giant:    { scale: 1.2,  girth: 1.2,  head: 0.96, hand: 1.15 },
  goblin:   { scale: 0.66, girth: 0.9,  head: 1.18, hand: 1.05 },
  undead:   { scale: 1.0,  girth: 0.86, head: 1.0,  hand: 1.0 },
  beast:    { scale: 1.02, girth: 1.08, head: 1.05, hand: 1.06 },
};

const LONG_HAIR = /pony|tail|long|braid|bun|bob|wavy|curly_bob|half_up|ribbon|crown|rolled|twin|pixie/;
/** 'masc' | 'fem' for a Chibi look (pure — exported for tests). */
export function formForChibi(a) {
  const f = a?.body?.form || a?.gender;
  if (f) return /^f/i.test(String(f)) ? 'fem' : 'masc';
  const fh = String(a?.facialHair?.id || 'none');
  if (fh && fh !== 'none') return 'masc';      // any beard, moustache or stubble
  return LONG_HAIR.test(String(a?.hair?.id || '')) ? 'fem' : 'masc';
}

const NONE = v => !v || v === 'none' || v === 'bare' || v === 'nothing';
const pass = p => { const o = { id: p.id }; for (const k of ['color', 'color2', 'quality', 'emblem', 'emblemColor', 'emblemBack', 'gloves']) if (p[k] != null) o[k] = p[k]; return o; };
/**
 * The garments a Chibi outfit becomes (pure). Batch 4: every id passes through as it is — clothes-catalog.js knows
 * each one (or maps it to the nearest row of its kind) and clothes.js builds it for this body; colours, trim (color2),
 * quality, emblems and the gloves (`top.gloves`) ride along. (Batch 1 turned every top into the kit shirt, every bottom
 * into trousers and every pair of shoes into boots.)
 */
export function garmentsForChibi(a) {
  const out = {};
  for (const slot of ['top', 'bottom', 'shoes']) { const p = a?.[slot]; if (p && !NONE(p.id)) out[slot] = pass(p); }
  // gloves on a look with no top (a bare-chested look still wears its gloves)
  if (!out.top && a?.top?.gloves && !NONE(a.top.gloves.id)) out.gloves = pass(a.top.gloves);
  return out;
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const q8 = v => Math.round(v * 8) / 8;
/** A Chibi 2 avatar JSON -> a Kestrel kit look (with `chibi` attached). */
export function kestrelLookFromChibi(avatar) {
  let a;
  try {
    a = normalizeAvatar(avatar || {});
    for (const [slot, ids] of Object.entries(CHIBI2_ONLY_PARTS)) { const want = avatar?.[slot]?.id; if (want && ids.includes(want)) a[slot] = { ...(a[slot] || {}), id: want }; }
    a = applyHandsRule(a);
  } catch { a = avatar || {}; }
  const b = a.body || {}, race = b.race || 'human';
  // an explicit Body pick (form-pick.js; the 2D normaliser does not know the field) wins over the guess
  const picked = avatar?.body?.form === 'masc' || avatar?.body?.form === 'fem' ? avatar.body.form : null;
  const num = (v, d = 0.5) => (Number.isFinite(+v) ? +v : d);
  const hairId = a.hair?.id || 'short';
  const look = {
    body: {
      form: picked || formForChibi(a),
      // in eighths, so similar bodies share one rig's clips (the clip cache is keyed by the body)
      height: q8(clamp01(0.5 + (num(b.height) - 0.5) * 0.6)),
      width: q8(clamp01(0.5 + (num(b.width) - 0.5) * 0.6 + num(b.round, 0) * 0.25)),
      skin: b.skin || '#e0b090',
      raceK: RACE_K[race] || RACE_K.human,
      grade: { skin: 1.05, skinLift: 1.0, hair: 1.1, hairLift: 1.2 },      // Chibi colours are game colours already: barely graded
      race,
    },
    // the face and hair fields pass through whole (batch 2's faceLook in kestrel.js reads them)
    hair: { ...(avatar?.hair || {}), ...(a.hair || {}), id: hairId, color: a.hair?.color || '#3a2417' },   // (batch 3 cuts the hair to the hat)
    eyes: { ...(avatar?.eyes || {}), ...(a.eyes || {}), color: a.eyes?.color || '#4a2a16' },
    facialHair: a.facialHair, headShape: a.headShape,
    ...Object.fromEntries(['brows', 'nose', 'mouth', 'ears', 'accessory', 'extras'].filter(k => a[k] || avatar?.[k]).map(k => [k, { ...(avatar?.[k] || {}), ...(a[k] || {}) }])),
    ...garmentsForChibi(a),
  };
  look.chibi = { look: a, race: raceOf(a), hold: holdFor(a) };
  return look;
}
