// The repair kit (round 7 — owner: "start with a repair kit that heals 30% hp, with a way to upgrade"). Every pilot
// carries one; it isn't a part and takes no slot. Key 1 · controller d-pad left · touch Fix. Charges refill every
// mission. The workshop upgrades it Mk I → Mk V (credits + materials); Frame Tuning's Plating board adds charges and
// strength; a Field Kit mod adds a charge. perks.js uses it in the mission; the HUD shows the charges.

/** Mk I–V. heal = share of full armour restored; cd = seconds before the next use; cost = the workshop upgrade to this Mk. */
export const KIT_LEVELS = [
  { lv: 1, name: 'Repair Kit Mk I', heal: 0.30, charges: 2, cd: 4 },
  { lv: 2, name: 'Repair Kit Mk II', heal: 0.35, charges: 2, cd: 4, cost: { credits: 6000, alloy: 4 } },
  { lv: 3, name: 'Repair Kit Mk III', heal: 0.35, charges: 3, cd: 3.5, cost: { credits: 14000, alloy: 10 } },
  { lv: 4, name: 'Repair Kit Mk IV', heal: 0.42, charges: 3, cd: 3, cost: { credits: 26000, alloy: 18, exotic: 2 } },
  { lv: 5, name: 'Repair Kit Mk V', heal: 0.5, charges: 3, cd: 3, cleanse: true, cost: { credits: 45000, alloy: 30, exotic: 5 } },
];
export const KIT_MAX = KIT_LEVELS.length;

/** The kit a frame carries: its Mk plus tuning/mod rules (kitCharges, kitHeal). */
export function kitStats(level = 1, rules = {}) {
  const K = KIT_LEVELS[Math.max(1, Math.min(KIT_MAX, level | 0)) - 1];
  return { ...K, charges: K.charges + Math.round(rules.kitCharges || 0), heal: K.heal + (rules.kitHeal || 0) };
}

/** What the kit does, in words (the workshop and the Tuning rig print this). */
export const kitLine = K => `Restores ${Math.round(K.heal * 100)}% of your armour · ${K.charges} charges a mission · ${K.cd} s between uses${K.cleanse ? ' · puts out fire and shakes off slows' : ''}`;
