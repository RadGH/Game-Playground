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

export function vignettePoint(pl, lx, lz) {
  const c = Math.cos(pl.yaw || 0), s = Math.sin(pl.yaw || 0);
  return { x: pl.x + lx * c + lz * s, z: pl.z - lx * s + lz * c };
}

export function vignetteContent(placements, recipes, { band = [1, 6], respawnMs = 5 * 60000 } = {}) {
  const byId = new Map(recipes.map(r => [r.id, r]));
  const camps = [], objects = [];
  for (const pl of placements || []) {
    const v = byId.get(pl.id);
    if (!v) continue;
    const key = 'vig:' + pl.id;
    objects.push({ type: 'vignette', name: v.name, x: pl.x, z: pl.z, key, r: v.radius || pl.radius || 10, lore: v.lore || null });
    (v.objects || []).forEach((o, i) => {
      const p = vignettePoint(pl, o.x || 0, o.z || 0);
      const okey = `${key}:${i}`;
      if (o.type === 'note') objects.push({ type: 'note', name: o.name, x: p.x, z: p.z, key: okey, note: { text: o.text || '', quest: o.quest || null } });
      else if (o.type === 'npc') objects.push({ type: 'npc', npc: { says: o.says || [], quest: o.quest || null, role: o.role || null }, name: o.name, x: p.x, z: p.z, key: okey });
      else if (o.type === 'chest') {
        const after = o.after ? (v.objects || []).findIndex(x => x.name === o.after) : -1;
        objects.push({ type: 'chest', name: o.name, x: p.x, z: p.z, key: okey, hidden: !!o.hidden, hint: o.hint || null,
          chest: { key: okey, tier: o.tier || 'common', level: band[0] + (pl.level || 1), after: after >= 0 ? `${key}:${after}` : null, afterName: o.after || null } });
      } else if (o.type === 'use') objects.push({ type: 'use', name: o.name, x: p.x, z: p.z, key: okey, use: { text: o.text || '', gives: o.gives || null, cost: o.cost || null, buff: o.buff || null } });
    });
    for (const m of v.monsters || []) {
      const p = vignettePoint(pl, m.x || 0, m.z || 0);
      camps.push({ type: m.type, level: band[0] + (m.level || 0), x: p.x, z: p.z, count: m.count || 1, radius: m.radius || 5, respawnMs, vignette: pl.id });
    }
  }
  return { camps, objects };
}
