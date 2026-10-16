// Graphics pass 2026-10-16 (G-PROPS) — what every prop and building surface is MADE of, and how much detail each
// graphics tier draws. Pure (no three, no DOM): the tables and the classifier; js/client/surface-tex.js paints the
// layers and js/client/surface-mat.js draws them.
//
// The idea: the world's props and buildings are unit shapes (proctown's kit: box, cyl, gable…) and vertex-coloured kit
// models, each with ONE flat colour. That colour stays (it is the town's palette), but every surface now also says what
// it is made of — planks, cut stone, plaster, thatch, clay tiles… — and the shader multiplies a small painted detail
// layer (grain, seams, mortar, cracks, straw, tile rows) over it, darkens the foot of a wall and the crease under an
// eave, and lightens worn edges. One texture array for the whole game, one attribute per instance, no new draw calls.
//
//   SURF.planks …                            surface codes (0 = none: drawn exactly as before)
//   LAYERS[code - 1]                         { id, size (metres one tile covers), bump, rough }
//   surfaceForPart(part, desc)               a proctown kit part (tag + the building's wall/roof material) -> code
//   surfaceByColour('#8a6a44')               the fallback for an untagged part or a vertex colour
//   PROP_TIERS[quality]                      what each graphics tier draws (quality = main.js low | medium | high)

export const LAYERS = Object.freeze([
  { id: 'planks', size: 1.4, bump: 0.6, rough: 0.9, wood: true },     // 1 sawn boards with seams, grain and nail heads
  { id: 'logs', size: 1.6, bump: 1.0, rough: 0.95, wood: true },      // 2 round log courses / rough beams
  { id: 'ashlar', size: 1.8, bump: 0.8, rough: 0.92 },                // 3 cut stone blocks with mortar
  { id: 'rubble', size: 1.6, bump: 1.0, rough: 0.95 },                // 4 fieldstone
  { id: 'brick', size: 1.1, bump: 0.7, rough: 0.92 },                 // 5 brick courses
  { id: 'plaster', size: 2.6, bump: 0.35, rough: 0.95 },              // 6 limewash / daub: patches, cracks, stains
  { id: 'thatch', size: 1.5, bump: 1.0, rough: 1.0 },                 // 7 straw strands in courses
  { id: 'tile', size: 1.3, bump: 1.0, rough: 0.85 },                  // 8 clay tile rows
  { id: 'shingle', size: 1.1, bump: 0.8, rough: 0.9 },                // 9 slate / wooden shingles, staggered
  { id: 'metal', size: 1.0, bump: 0.4, rough: 0.55 },                 // 10 iron: hammer marks, rust, rivets
  { id: 'cloth', size: 0.7, bump: 0.3, rough: 1.0 },                  // 11 canvas weave, folds, stains
  { id: 'rope', size: 0.35, bump: 0.8, rough: 1.0 },                  // 12 twisted strands (rope, straw bands)
]);
export const SURF = Object.freeze(Object.fromEntries(LAYERS.map((l, i) => [l.id, i + 1])));
export const LAYER_COUNT = LAYERS.length;

/** proctown buildkit wall materials -> surface. */
export const WALL_SURF = Object.freeze({
  timber_frame: 'plaster', wattle: 'plaster', cut_stone: 'ashlar', rubble: 'rubble', brick: 'brick', log: 'logs',
  plaster: 'plaster', mud_brick: 'brick', carved_trunk: 'logs', chitin: 'plaster', bone: 'plaster', hide: 'cloth',
  scrap: 'metal', basalt: 'rubble', ochre_plaster: 'plaster',
});
/** proctown buildkit roof materials -> surface. */
export const ROOF_SURF = Object.freeze({
  thatch: 'thatch', slate: 'shingle', clay_tile: 'tile', shingle: 'shingle', turf: 'thatch', lead: 'metal',
  canvas: 'cloth', bone_plate: 'shingle', leaf_scale: 'shingle', copper: 'metal', reed_thatch: 'thatch',
});
/** Part tags (proctown buildkit / offices / town-edge kit) whose material does not depend on the building. */
const TAG_SURF = { eave: 'planks', trim: 'planks', door: 'planks', chimney: 'rubble', goods: 'cloth', gatehouse: 'ashlar', tower: 'ashlar', beam: 'planks', frame: 'planks', shutter: 'planks', rope: 'rope', ridge: 'tile' };

/** '#rrggbb' -> [h (0..360), s (0..1), l (0..1)]. */
export function hsl(hex) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0.5];
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}

/**
 * The fallback: what a flat colour most likely is. Browns are wood, pale warm creams are plaster, greys are stone,
 * near-black greys are iron, straw yellows are thatch, saturated colours (banners, awnings, painted sacks) are cloth.
 * Returns a surface code (never 0: everything gets SOMETHING).
 */
export function surfaceByColour(hex) {
  const [h, s, l] = hsl(hex);
  if (s < 0.14) return l < 0.24 ? SURF.metal : SURF.ashlar;
  if (l > 0.7 && s < 0.65) return SURF.plaster;
  if (h >= 38 && h <= 62 && s > 0.38 && l > 0.42) return SURF.thatch;
  if (h >= 12 && h < 48 && l < 0.58) return s < 0.22 ? SURF.ashlar : SURF.planks;
  if (l > 0.66 && s < 0.45) return SURF.plaster;
  if (s < 0.24) return l < 0.3 ? SURF.metal : SURF.ashlar;
  return SURF.cloth;
}

/**
 * A kit part's surface. `part` = { tag, colour, mesh, surf? } (an explicit `surf` id wins); `desc` = the proctown
 * building description (wallMaterial / roofMaterial), or null for a prop.
 */
export function surfaceForPart(part, desc = null) {
  if (part?.surf) return typeof part.surf === 'number' ? part.surf : (SURF[part.surf] || 0);
  const tag = part?.tag;
  if (desc) {
    if (tag === 'wall') return SURF[WALL_SURF[desc.wallMaterial]] || surfaceByColour(part.colour);
    if (tag === 'roof') return SURF[ROOF_SURF[desc.roofMaterial]] || SURF.thatch;
  }
  if (tag && TAG_SURF[tag]) return SURF[TAG_SURF[tag]];
  return surfaceByColour(part?.colour || '#808080');
}

/**
 * What each graphics tier draws (Settings → Graphics quality, main.js `quality`; a phone starts on medium, a software
 * renderer on low). The phone tier is the one with the frame-time budget (≤ ~10% worse than before this pass).
 *   detail    the surface layers at all (low keeps the plain flat colours and the old Lambert material)
 *   bump      the layers' relief lights the surface (one extra derivative per pixel; desktop only)
 *   wear      AO at the foot of walls / under eaves + lighter worn edges + a per-instance weathering tint
 *   layerPx   size of one layer in the texture array (memory = LAYER_COUNT * layerPx² * 4 * 1.33)
 *   clutter   share of the extra small props (barrels, crates, sacks, benches, planters) a street / quay / square gets
 *   trim      window frames, sills, shutters, ridge caps and door steps on buildings
 *   painted   the live portrait's painted-look filter (desktop) — phones show the painted art / 2D picture anyway
 */
export const PROP_TIERS = Object.freeze({
  low: Object.freeze({ detail: false, bump: false, wear: false, layerPx: 0, clutter: 0.35, trim: false, painted: true }),
  medium: Object.freeze({ detail: true, bump: false, wear: true, layerPx: 128, clutter: 0.6, trim: true, painted: true }),
  high: Object.freeze({ detail: true, bump: true, wear: true, layerPx: 256, clutter: 1, trim: true, painted: true }),
});
/** The tier for a quality string (unknown -> high, like main.js). `off` (URL ?props=0) = the look before this pass. */
export function propTier(quality, { off = false } = {}) {
  if (off) return { detail: false, bump: false, wear: false, layerPx: 0, clutter: 0, trim: false, painted: false, off: true };
  return PROP_TIERS[quality] || PROP_TIERS.high;
}
/** Texture memory one tier spends on the layers, in bytes (with mipmaps). */
export const layerBytes = tier => (tier.detail ? Math.round(LAYER_COUNT * tier.layerPx * tier.layerPx * 4 * 4 / 3) : 0);

/** Is the URL asking for the old look? (`?props=0`) — read once by the views; pure on a search string. */
export const propsOff = (search = (typeof location !== 'undefined' ? location.search : '')) => /[?&]props=0(&|$)/.test(search || '');

/** One line for the Settings window (plain words), for G-ATMOS's Graphics section to show beside its own. */
export function propTierWords(quality) {
  const t = PROP_TIERS[quality]; if (!t) return '';
  if (!t.detail) return 'plain props and buildings, a few barrels and crates, painted portraits';
  return [t.bump ? 'detailed, worn props and buildings with relief' : 'detailed, worn props and buildings', t.clutter >= 1 ? 'busy streets and quays' : 'some street clutter', 'painted portraits'].join(', ');
}
