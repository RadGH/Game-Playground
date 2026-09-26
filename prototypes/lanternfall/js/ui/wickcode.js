// Wick codes (docs/03 §16.3, §19.2; 02 §15.6): `LF1:` + the wick hash
//   flame:shape:charms(sorted, joined by +):knotTrigger:childFlame:childShape:childCharm   ('-' for an empty part)
// Pasting a code is checked with the builder's own rules (validateWick + knot rules). Pure.
import { validateWick } from '../spells/wick.js';

export const KNOT_TRIGGERS = [
  { id: 'on_hit', name: 'Hitknot', desc: 'fires when an instance hits an enemy' },
  { id: 'on_kill', name: 'Deathknot', desc: 'fires when an instance kills an enemy' },
];
/** Charms a knot's child may not hold (03 §8.2). */
export const CHILD_BANNED = ['echo', 'split'];

export function wickHash(w) {
  const charms = [...(w.charms || [])].sort().join('+') || '-';
  const k = w.knot || {};
  return [w.flame || '-', w.shape || '-', charms, k.trigger || '-', k.flame || '-', k.shape || '-', k.charm || '-'].join(':');
}
export function wickCode(w) { return 'LF1:' + wickHash(w); }

/** Knot legality: null or a reason. unlocks.knots = owned trigger ids. */
export function validateKnot(knot, data, unlocks = null) {
  if (!knot || !knot.trigger) return null;
  if (!KNOT_TRIGGERS.some(t => t.id === knot.trigger)) return `Unknown knot ${knot.trigger}.`;
  if (unlocks && !unlocks.knots?.includes(knot.trigger)) return `You have not learned the ${KNOT_TRIGGERS.find(t => t.id === knot.trigger).name} yet.`;
  if (!knot.flame || !knot.shape) return 'A knot needs a child Flame and Shape.';
  if (knot.charm && CHILD_BANNED.includes(knot.charm)) return `A knot's child cannot hold ${data.charms.byId[knot.charm]?.name || knot.charm}.`;
  return validateWick({ flame: knot.flame, shape: knot.shape, charms: knot.charm ? [knot.charm] : [] }, data, unlocks, 1);
}

/** Parse a pasted code. Returns { wick } or { error }. unlocks/charmSlots null = do not check ownership. */
export function parseWickCode(code, data, unlocks = null, charmSlots = 3) {
  const s = String(code || '').trim();
  const m = /^LF1[:\-](.+)$/.exec(s); if (!m) return { error: 'That is not a wick code (it should start with LF1:).' };
  const parts = m[1].split(':'); if (parts.length !== 7) return { error: 'That wick code is damaged (it needs 7 parts).' };
  const v = x => (x === '-' || x === '' ? null : x);
  const [flame, shape, charms, trig, cf, cs, cc] = parts.map(v);
  const wick = { flame, shape, charms: charms ? charms.split('+') : [] };
  if (trig) wick.knot = { trigger: trig, flame: cf, shape: cs, charm: cc };
  if (!flame || !shape) return { error: 'A wick needs a Flame and a Shape.' };
  const why = validateWick(wick, data, unlocks, charmSlots) || validateKnot(wick.knot, data, unlocks);
  return why ? { error: why, wick } : { wick };
}
