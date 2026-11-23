// HIGH-DETAIL MODELS — who is drawn with which model (pure: no three.js, so node tests can check every enemy, boss,
// speaker and gear piece). js/render/hd.js builds the bodies this module names.
//
//   const H = hdIndex(map, falCatalog, tabardData)        // data/hd-models.json + avatar-3d/fal catalog + Tabard items
//   hdSpecFor(H, data, e, look) → null (draw the old model) | { key, type: 'fal', body, weapon, offhand, tint, tintK, glow }
//                                                        | { key, type: 'tabard', body, items: [tabard item ids] }
//   tabardFromLook(H, look) → { body, items }             // a Chibi look (dressed from gear) → Tabard parts
//   pickClip(H, name, has) → a model clip key            // has(key) says whether the model has that clip
// Rules: anything without a mapping, or mapped to a model that is not in the catalog, returns null and keeps its old
// model (never an error). The catalogs are read live, so a model fixed or added in avatar-3d reaches the game as is.

/** One lookup object from the three files (any of them may be null: then nothing is high detail). */
export function hdIndex(map, fal, tabard) {
  const bodies = new Map((fal?.bodies || []).map(b => [b.id, b]));
  const weapons = new Map((fal?.items || []).filter(i => i.kind !== 'wear').map(i => [i.id, i]));
  const items = tabard?.items?.items || {};
  return { map: map || {}, bodies, weapons, items, ok: !!(map && (fal || tabard)) };
}

const first = (list, ok) => (list || []).find(ok) ?? null;

/** Tabard parts for a Chibi look: the body by form, each worn part by the tables in hd-models.json `heroes`. */
export function tabardFromLook(H, look = {}) {
  const T = H.map.heroes || {}, items = H.items;
  const has = id => !!items[id];
  const body = T.body?.[look.body?.form || 'masc'] || T.body?.masc || 'male';
  const out = [];
  const robeIds = new Set(T.robes || []);
  // an outfit piece: the first paint in the part's list that some item of this slot is painted with
  const wear = (slot, partId, { robe = null } = {}) => {
    const paints = T.wear?.[partId]; if (!paints) return null;
    for (const p of paints) {
      const all = Object.entries(items).filter(([, it]) => it.slot === slot && it.paint === p);
      if (!all.length) continue;
      const isRobe = ([, it]) => (it.geosets || []).includes('robe');
      const pick = robe == null ? all[0] : (all.find(x => isRobe(x) === robe) || all[0]);
      return { id: pick[0], paint: p };
    }
    return null;
  };
  const top = look.top?.id, chest = top ? wear('chest', top, { robe: robeIds.has(top) }) : null;
  if (chest) {
    out.push(chest.id);
    const hands = Object.entries(items).find(([, it]) => it.slot === 'hands' && it.paint === chest.paint);
    if (hands) out.push(hands[0]);
  }
  const legs = look.bottom?.id ? wear('legs', look.bottom.id) : null;
  if (legs) out.push(legs.id);
  else if (chest) { const l = Object.entries(items).find(([, it]) => it.slot === 'legs' && it.paint === chest.paint); if (l) out.push(l[0]); }
  const feet = look.shoes?.id ? wear('feet', look.shoes.id) : null;
  if (feet) out.push(feet.id);
  const sh = top ? first(T.shoulders?.[top], has) : null;
  if (sh) out.push(sh);
  const head = look.hat?.id ? first(T.heads?.[look.hat.id], has) : null;
  if (head) out.push(head);
  if (!head || !items[head]?.hidesHair) { const hair = first(T.hair?.[look.hair?.id], has); if (hair) out.push(hair); }
  const held = look.held?.id ? first(T.held?.[look.held.id], has) : null;
  if (held) out.push(held);
  const off = look.offhand?.id ? first(T.offhand?.[look.offhand.id], id => has(id) && items[id].slot === 'offhand') : null;
  if (off) out.push(off);
  const cape = look.cape?.id ? first(T.cape?.[look.cape.id], has) : null;
  if (cape) out.push(cape);
  // one item per slot (the last listed wins, as Tabard would)
  const bySlot = new Map(); for (const id of out) bySlot.set(items[id].slot, id);
  return { body, items: [...bySlot.values()] };
}

/** entry.body may list several bodies: the first that is in the catalog wins (a planned model takes over when it lands). */
export const bodyOf = (H, entry) => [].concat(entry?.body || []).find(id => H.bodies.has(id)) || null;

function falSpec(H, entry, def) {
  const id = bodyOf(H, entry), b = id && H.bodies.get(id); if (!b) return null;
  const wep = k => { const v = entry[k] === undefined ? b[k] : entry[k]; return v && H.weapons.has(v) ? v : null; };
  return {
    type: 'fal', body: id, weapon: wep('weapon'), offhand: wep('offhand'), tint: entry.tint || null, tintK: entry.tintK ?? 0.35,
    glow: entry.glow || null,
  };
}

/**
 * What to draw entity `e` with in high detail. `look` = the look the old renderer would dress it in (heroes: the dressed
 * look; story people: their own look). null = keep the old model.
 */
export function hdSpecFor(H, data, e, look = null) {
  if (!H?.ok) return null;
  let spec = null;
  if (e.side === 'hero') spec = H.map.heroes ? { type: 'tabard', ...tabardFromLook(H, look || {}) } : null;
  else if (e.lookDirect) {
    const entry = e.speaker && H.map.speakers?.[e.speaker];
    if (entry?.tabard) spec = { type: 'tabard', ...tabardFromLook(H, e.lookDirect) };
    else if (entry?.body) spec = falSpec(H, entry, null);
  } else {
    const def = data.enemies.foes[e.kind] || data.enemies.bosses[e.kind];
    const entry = H.map.foes?.[e.kind] || H.map.bosses?.[e.kind];
    if (!def || !entry || entry.legacy || def.backEdge) return null;
    if (entry.tabard) spec = def.look && def.body !== 'creature' ? { type: 'tabard', ...tabardFromLook(H, def.look) } : null;
    else if (entry.body) spec = falSpec(H, entry, def);
  }
  if (!spec) return null;
  spec.key = 'hd:' + JSON.stringify(spec);
  return spec;
}

/** The model clip to play for a Wyrmroad clip name: the first candidate the model has, else a sensible default. */
export function pickClip(H, name, has, { once = false } = {}) {
  const list = H.map.clips?.[name] || [name];
  for (const k of list) if (has(k)) return k;
  for (const k of once ? ['attack', 'punch', 'idle'] : ['idle']) if (has(k)) return k;
  return null;
}
