// Vignettes as room content (stream A, reading stream E's data: data/vignettes/{m1,m2,m2b}.json recipes +
// data/vignettes/placements/<zone>.json). Pure.
//
//   vignetteContent(placements, recipes, { band }) -> { camps, objects }
//
// Each placement becomes:
//   * a `vignette` marker object (info: name, key, r, lore) — the client shows the lore line when you walk in;
//   * its `objects[]`: note (read: text + quest), npc (an NPC entity: says + quest), chest (per character;
//     `hidden` + `hint`, `after` = opens only once the named object was used), use (per character: text, gives
//     gold, costs gold, a buff);
//   * its `monsters[]` as a camp (level = the zone's low band + the recipe's level).
// Props (trees, rocks) are the client's to draw from the same two files.
//
// Recipe coordinates are local: rotated by the placement's yaw (protocol convention: yaw 0 faces +z, the
// local +z axis points along (sin yaw, cos yaw)) and moved to the placement's (x, z). vignettePoint() is
// the one formula; the client must use the same.

/** Footprint radius (m) of a vignette prop, for keeping monsters out of it. */
export const PROP_R = { default: 1.3, well: 1.6, ruined_wall: 2.2, wall: 2.2, cart: 2, wagon: 2.4, tent: 2.4, hut: 3, shack: 3, barrel: 0.9, crate: 0.9 };

export function vignettePoint(pl, lx, lz) {
  // a set piece BOUND onto one of stream B's ground pieces is shrunk to fit it (E: `scale` 0.4-1, play-test 2 Q18)
  const k = pl.scale > 0 ? pl.scale : 1;
  lx *= k; lz *= k;
  const c = Math.cos(pl.yaw || 0), s = Math.sin(pl.yaw || 0);
  return { x: pl.x + lx * c + lz * s, z: pl.z - lx * s + lz * c };
}

/**
 * The stand-in model a `use` object is drawn as, from its name (js/client/objects.js draws it). One table, here, so the
 * sim can ask the same question the client does.
 */
export function usePropKind(name) {
  const n = name || '';
  return /well/i.test(n) ? 'well' : /shrine|altar|statue|idol|stone|cairn/i.test(n) ? 'rune_stone' : /fire|hearth|brazier/i.test(n) ? 'fire_ring' : 'stone_step';
}
/** How close (recipe metres) a recipe's own prop must be for a `use` object to count as "that thing", and not draw a second one. */
export const USE_OWN_PROP_R = 2.5;
/**
 * Report #63 ("there are two wells on top of each other"): a recipe that draws a well as a PROP and also has a `use`
 * object called "Well" beside it got two wells, because the client gives every `use` object a stand-in model by name.
 * True when the recipe already draws that same kind of thing within USE_OWN_PROP_R — the object is then `bare` (ring,
 * glow and prompt, no model of its own).
 */
export function useIsDrawn(recipe, o) {
  const kind = usePropKind(o.name);
  return [...(recipe.props || []), ...(recipe.models || [])].some(q => q.kind !== 'ground' && q.id === kind && Math.hypot((q.x || 0) - (o.x || 0), (q.z || 0) - (o.z || 0)) <= USE_OWN_PROP_R);
}

export function vignetteContent(placements, recipes, { band = [1, 6], respawnMs = 5 * 60000 } = {}) {
  const byId = new Map(recipes.map(r => [r.id, r]));
  const camps = [], objects = [];
  for (const pl of placements || []) {
    const v = byId.get(pl.recipe || pl.id);      // a curio names its recipe (data/vignettes/curios.json)
    if (!v) continue;
    const key = 'vig:' + pl.id;
    objects.push({ type: 'vignette', name: v.name, x: pl.x, z: pl.z, key, r: (v.radius || pl.radius || 10) * (pl.scale > 0 && !pl.radius ? pl.scale : 1), lore: v.lore || null });
    (v.objects || []).forEach((o, i) => {
      const p = vignettePoint(pl, o.x || 0, o.z || 0);
      const okey = `${key}:${i}`;
      if (o.type === 'note') objects.push({ type: 'note', name: o.name, x: p.x, z: p.z, key: okey, note: { text: o.text || '', quest: o.quest || null } });
      else if (o.type === 'npc') objects.push({ type: 'npc', npc: { says: o.says || [], quest: o.quest || null, role: o.role || null }, name: o.name, x: p.x, z: p.z, key: okey });
      else if (o.type === 'chest') {
        const after = o.after ? (v.objects || []).findIndex(x => x.name === o.after) : -1;
        objects.push({ type: 'chest', name: o.name, x: p.x, z: p.z, key: okey, hidden: !!o.hidden, hint: o.hint || null,
          chest: { key: okey, tier: o.tier || 'common', level: (pl.levelBase ?? band[0]) + (pl.level || 1), after: after >= 0 ? `${key}:${after}` : null, afterName: o.after || null } });
      } else if (o.type === 'use') objects.push({ type: 'use', name: o.name, x: p.x, z: p.z, key: okey, use: { text: o.text || '', gives: o.gives || null, cost: o.cost || null, buff: o.buff || null }, ...(useIsDrawn(v, o) ? { bare: true } : {}) });
    });
    // props a monster must not stand inside (P28: slimes spawned in the pump house's well and barrel — half
    // buried in a model, unclickable behind it). Ground decals (kind 'ground') are walked on.
    const avoid = (v.props || []).filter(q => q.kind !== 'ground').map(q => ({ ...vignettePoint(pl, q.x || 0, q.z || 0), r: PROP_R[q.id] || PROP_R.default }));
    for (const m of v.monsters || []) {
      const p = vignettePoint(pl, m.x || 0, m.z || 0);
      // P26: the level of the SPOT (E's ramp from the capital: levelBase, capped at levelCap) and countCap near the start
      camps.push({ type: m.type, level: Math.max(1, Math.min(pl.levelCap ?? 99, (pl.levelBase ?? band[0]) + (m.level || 0))), x: p.x, z: p.z, count: Math.min(m.count || 1, pl.countCap ?? 99), radius: (m.radius || 5) * (pl.scale > 0 ? pl.scale : 1), respawnMs, vignette: pl.id, ...(avoid.length ? { avoid } : {}) });
    }
  }
  return { camps, objects };
}
