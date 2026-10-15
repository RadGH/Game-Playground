// Thousandvale — SHRINE BLESSINGS (World stream, round 11 — live #47: "'Spare ribbon … You feel stronger.' But does that
// ACTUALLY make me stronger? If it doesn't actually give the player anything, it should not claim to make you stronger.")
//
// It did not: 59 vignette objects (curios, set pieces, the m1/m2 recipes, Vharlen's) carry `use.buff: { status, seconds }`,
// the province called `rules.buff` — and the rules never had one, so every pilgrim post, shrine and spring did nothing and
// the dialog said "You feel stronger" anyway.
//
// Now each of the five words a vignette uses is a real, small blessing — a status on you (`bless:<word>`), a fraction of
// the combat status of the same name, for the seconds the object says (capped):
//   haste  Light-footed   +10% speed on foot              (A's footMul reads `blessMove`, js/sim/province.js)
//   might  Emboldened     +6% damage                      (Farhold's buffsOf `damage`)
//   guard  Warded         8% less damage taken            (Farhold's buffsOf `resist`)
//   rally  Heartened      +4% damage and 4% less taken
//   regen  Restored       0.4% of your health a second    (Farhold's tickStatuses `healPerSecond`)
// A second blessing of the same word refreshes it; different words stack (they are separate shrines). Like every status
// it ends on death. `blessingText` writes the one sentence the dialog shows, from the same numbers. Pure.

export const BLESSINGS = Object.freeze({
  haste: { name: 'Light-footed', blessMove: 0.10 },
  might: { name: 'Emboldened', damage: 0.06 },
  guard: { name: 'Warded', resist: 0.08 },
  rally: { name: 'Heartened', damage: 0.04, resist: 0.04 },
  regen: { name: 'Restored', healPerSecond: 0.004 },
});
export const BLESS_PREFIX = 'bless:';
export const BLESS_MAX_SECONDS = 600;

const pct = v => `${+(v * 100).toFixed(1)}%`;
const minutes = s => { const m = s / 60; return m >= 1 && Math.abs(m - Math.round(m)) < 0.05 ? `${Math.round(m)} minute${Math.round(m) === 1 ? '' : 's'}` : m >= 1 ? `${+m.toFixed(1)} minutes` : `${Math.round(s)} seconds`; };

/** The blessing a vignette's `use.buff` names, or null. */
export const blessingOf = spec => (spec && typeof spec.status === 'string' && BLESSINGS[spec.status]) || null;
/** Seconds a blessing lasts: the object's own, held to 10 s .. BLESS_MAX_SECONDS. */
export const blessSeconds = spec => Math.max(10, Math.min(BLESS_MAX_SECONDS, Math.round(+spec?.seconds || 180)));

/** The sentence: "Light-footed: 10% faster on foot for 4 minutes." */
export function blessingText(spec) {
  const b = blessingOf(spec);
  if (!b) return '';
  const bits = [];
  if (b.blessMove) bits.push(`${pct(b.blessMove)} faster on foot`);
  if (b.damage) bits.push(`${pct(b.damage)} more damage`);
  if (b.resist) bits.push(`${pct(b.resist)} less damage taken`);
  if (b.healPerSecond) bits.push(`you heal ${pct(b.healPerSecond)} of your health every second`);
  const list = bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0];
  return `${b.name}: ${list} for ${minutes(blessSeconds(spec))}.`;
}

/** Put the blessing on a unit (a Farhold-shaped status). -> { ok, id, name, seconds, text } | { ok:false } */
export function applyBlessing(unit, spec) {
  const b = blessingOf(spec);
  if (!unit || !b) return { ok: false };
  const seconds = blessSeconds(spec), id = BLESS_PREFIX + spec.status;
  unit.statuses ||= {};
  unit.statuses[id] = {
    type: id, kind: 'buff', name: b.name, remaining: seconds, power: 1, element: 'holy',
    damage: b.damage || 0, resist: b.resist || 0, healPerSecond: b.healPerSecond || 0, blessMove: b.blessMove || 0,
    perSecond: 0, slow: 0, takeMore: 0, dealLess: 0, haste: 0, move: 0, armor: 0,
  };
  return { ok: true, id, name: b.name, seconds, text: blessingText(spec) };
}

/** The extra share of speed on foot a unit's blessings give (0.10 = +10%). A's footMul adds it. */
export function blessMove(unit) {
  let m = 0;
  for (const [id, st] of Object.entries(unit?.statuses || {})) if (id.startsWith(BLESS_PREFIX) && st.remaining > 0) m += st.blessMove || 0;
  return m;
}
