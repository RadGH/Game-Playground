// Firmware chips: slotted into the CPU, their costs must fit its firmware capacity (owner: "firmware chips … e.g. a
// two-handed weapon in one arm"). data/chips.json says what each does; this is the ONE place those effects touch the
// mech's numbers (called from loadout.js mechStats, so the hangar's stat panel and the mission agree).

export const chipsIndex = json => Object.fromEntries((json.chips || json).map(c => [c.id, c]));
export const chipId = c => (typeof c === 'string' ? c : c?.id);

/** Firmware the chips use. */
export const chipLoad = (chips, C) => (chips || []).reduce((s, c) => s + (C[chipId(c)]?.cost || 0), 0);

/** Does any slotted chip grant this rule? (e.g. 'twoHandInOne') */
export const chipRule = (chips, C, rule) => (chips || []).some(c => C[chipId(c)]?.fx?.rule === rule);

/** Fold chip effects into a mechStats result (changes st in place; returns it). Chips over capacity do nothing — the
 *  assembly bay never lets that happen, but an old save could. Stats it knows: mul (multiply), add (plus), res (plus to
 *  a resistance), weapon (per-shot changes weaponSpec reads from st.wfx). */
export function applyChips(st, chips, C) {
  st.wfx = { rate: 1, heat: 1, missileTurn: 1, missileDmg: 1 };
  st.magnet = 1.6; st.matBonus = 0; st.partLuck = 0;
  if (!chips?.length || !C) return st;
  let left = st.firmware;
  for (const c of chips) {
    const chip = C[chipId(c)]; if (!chip || chip.cost > left) continue;
    left -= chip.cost;
    const fx = chip.fx || {};
    for (const [k, v] of Object.entries(fx.mul || {})) {
      if (k === 'energyCap') st.energyMax = (100 + st.energyMax) * v - 100;      // tuning energyMax 100 + the generator's share
      else if (k === 'heatMax') st.heatMax = (100 + st.heatMax) * v - 100;
      else if (k === 'qbCooldownMul') st.qbCooldown = (st.qbCooldown ?? 0.6) * v;
      else if (k === 'hp') st.hp = Math.round(st.hp * v);
      else if (typeof st[k] === 'number') st[k] *= v;
    }
    for (const [k, v] of Object.entries(fx.add || {})) {
      if (k === 'pickupRange') st.magnet *= 1 + v;
      else st[k] = (st[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(fx.res || {})) st.resist[k] = Math.min(0.75, (st.resist[k] || 0) + v);
    for (const [k, v] of Object.entries(fx.weapon || {})) st.wfx[k] *= v;
  }
  return st;
}
