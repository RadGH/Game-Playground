// What a hero WEARS, drawn on the body (live report #4, 2026-11-16: "Character does not appear to wear weapons. We had
// this all figured out in Thousandvale"). Pure — no three, no DOM — so node tests read it too.
//
// Copied from Thousandvale's js/client/gear-look.js (gearLook / heldLook / offhandLook / applyG5): an equipped item
// becomes a Chibi 2 part in the avatar JSON, and avatar-3d builds that part ON THE HAND BONES (gripR for the main hand,
// gripL / the forearm strap for the off hand) as part of the body's skinned mesh, so it moves with every clip. The hold
// that the parts make (`holdFor`: blade, haft, heavy, polearm, bow, staff, wand, dual…) is also what picks the strike
// each `attack` clip plays — a bow draws, a staff casts, a greatsword slams — so the right animation comes for free.
//
// The model for each item base is DATA: data/gear-looks.json (byBase, then byKind / byProf). Thousandvale's rules kept:
//   * the main hand is ALWAYS what is equipped (nothing = empty fists), never the look's own costume prop;
//   * a weapon in the off hand (dual wield, Doubled Grasp) is drawn as that weapon in the left hand;
//   * an empty armour slot keeps the hero's own clothes (Rogueloot heroes are dressed by the creator; Thousandvale used
//     plain clothes instead);
//   * gloves merge into the top (`top.gloves`), rings into the accessory (`accessory.ring / ring2`) — one level deep,
//     exactly like avatar-3d gear-catalog.js `applyGear`.
//
//   heroAvatar(baseAvatar, equip, { table, bases })  -> a NEW avatar wearing the gear
//   gearSig(equip)                                     -> a short key; changes only when the drawn gear would
//   compactGear(equip)                                 -> { slot: { b, r } } — what other players need to draw you (roster)

/** Equipment slots that are drawn, in a fixed order (the weapon-swap set `weapon2/offhand2` is in the pack, not drawn). */
export const DRAWN = ['weapon', 'offhand', 'head', 'chest', 'hands', 'feet', 'belt', 'neck', 'ring1', 'ring2'];

const baseOf = (bases, id) => {
  if (!bases || !id) return null;
  if (Array.isArray(bases)) return bases.find(b => b.id === id) || null;
  return bases[id] || null;
};
const qualityOf = (table, it) => table?.quality?.[it?.rarity] ?? 0;

/** The held model id (and colour) for a weapon base, wherever it is held. Pure. */
export function weaponPart(table, base, it = null) {
  const T = table?.weapon || {};
  const id = T.byBase?.[base?.id] || T.byKind?.[base?.kind] || 'fh_sword';
  const color = T.colour?.byBase?.[base?.id] || T.colour?.default || '#c8ccd6';
  return { id, color, quality: qualityOf(table, it) };
}
/** The off-hand model for a shield / focus / quiver base. Pure. */
export function offhandPart(table, base, it = null) {
  const T = table?.offhand || {};
  const id = T.byBase?.[base?.id] || T.byKind?.[base?.kind] || 'none';
  const color = T.colour?.byBase?.[base?.id] || T.colour?.byKind?.[base?.kind] || T.colour?.default || '#8d97a3';
  return { id, color, quality: qualityOf(table, it) };
}
/** The worn model for an armour base in head / chest / hands / feet. Pure. */
export function armourPart(table, slot, base, it = null) {
  const T = table?.armour || {}, S = T[slot] || {};
  const id = S.byBase?.[base?.id] || S.byProf?.[base?.proficiency] || null;
  if (!id) return null;
  const trim = T.colour?.trimByRarity?.[it?.rarity];
  const color = T.colour?.byBase?.[base?.id] || T.colour?.byProf?.[base?.proficiency] || '#6a6a6a';
  return { id, color, ...(trim ? { color2: trim } : {}), quality: qualityOf(table, it) };
}

/**
 * The avatar a hero is drawn with: the look's own avatar (face, body, clothes) with the equipment laid over it.
 * `equip` = the character's `equip` ({ weapon: { base, rarity, … }, … }) or the compact roster form ({ weapon: { b, r } }).
 */
export function heroAvatar(avatar, equip, { table, bases } = {}) {
  const out = JSON.parse(JSON.stringify(avatar || {}));
  const eq = equip || {};
  const item = slot => { const it = eq[slot]; if (!it) return null; const id = it.base ?? it.b; const b = baseOf(bases, id); return b ? { it: { rarity: it.rarity ?? it.r }, b } : null; };
  // hands: always what is equipped
  const main = item('weapon'), off = item('offhand');
  out.held = main ? weaponPart(table, main.b, main.it) : { id: 'none' };
  if (!off) out.offhand = { id: 'none' };
  else if (off.b.slot === 'weapon') out.offhand = weaponPart(table, off.b, off.it);          // dual wield / Doubled Grasp
  else out.offhand = offhandPart(table, off.b, off.it);
  // armour: head -> hat, chest -> top, feet -> shoes; an empty slot keeps the look's own clothes
  const keepGloves = out.top?.gloves;
  for (const [slot, part] of [['head', 'hat'], ['chest', 'top'], ['feet', 'shoes']]) {
    const x = item(slot); if (!x) continue;
    const p = armourPart(table, slot, x.b, x.it); if (p) out[part] = p;
  }
  if (keepGloves && out.top && !out.top.gloves) out.top.gloves = keepGloves;
  const hands = item('hands');
  if (hands) { const p = armourPart(table, 'hands', hands.b, hands.it); if (p) out.top = { ...(out.top || { id: 'tshirt' }), gloves: p }; }
  // waist, neck, rings (the catalog's one-level-deep merge)
  const belt = item('belt');
  if (belt) out.decor = { id: table?.belt?.byBase?.[belt.b.id] || table?.belt?.default || 'belt_pouches', color: table?.belt?.colour?.[belt.b.id] || '#6a4a2a' };
  const neck = item('neck'), acc = out.accessory?.id;
  if (neck && (!acc || acc === 'none')) out.accessory = { ...(out.accessory || {}), id: table?.neck?.default || 'pendant', color: table?.neck?.colour?.[neck.b.id] || '#c8ccd6' };
  for (const [slot, field] of [['ring1', 'ring'], ['ring2', 'ring2']]) {
    const r = item(slot); if (!r) continue;
    out.accessory = { ...(out.accessory || { id: 'none' }), [field]: { id: table?.ring?.default || 'g5_signet', color: table?.ring?.colour?.[r.b.id] || '#e0b850' } };
  }
  return out;
}

/** What other players need to draw you: base + rarity per drawn slot. Pure; small enough for the roster. */
export function compactGear(equip) {
  const out = {};
  for (const s of DRAWN) { const it = equip?.[s]; if (it && (it.base || it.b)) out[s] = { b: it.base ?? it.b, ...(it.rarity || it.r ? { r: it.rarity ?? it.r } : {}) }; }
  return out;
}
/** A short key of what is drawn: a change means the body must be re-dressed. Pure. */
export function gearSig(equip) {
  return DRAWN.map(s => { const it = equip?.[s]; return it ? `${it.base ?? it.b}:${it.rarity ?? it.r ?? ''}` : '-'; }).join('|');
}
