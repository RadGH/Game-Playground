// Kestrel kit — the clothing catalogue (Thousandvale batch 4, 2026-10-28). Pure data, no Three.js.
//
// Every top, bottom, pair of shoes and pair of gloves a Thousandvale (Chibi 2 / 2.5) look can name, described as what
// it COVERS on the Kestrel body and what it is made of. clothes.js turns a row into surfaces: each garment is the body's
// own surface sampled again over the range a row names and pushed out by its layer's thickness, so it carries the skin
// weights under it (README "The surface API"); long garments get a skirt surface on the skirt bones (skirt.js).
//
// TOPS
//   layer   1 shirt (next to the skin) · 2 tunic / jerkin / gambeson · 3 mail / coat / robe · 4 plate. The layer sets the
//           thickness off the skin (LAYER_OFFSET) so a belt, a cape or a pack can be laid on the outermost one.
//   mat     cloth | linen | silk | leather | fur | quilt | mail | scale | plate | brigandine — colour treatment + relief
//   sleeve  { to: none | cap | short | elbow | forearm | wrist, shape: fit | bell | puff | rolled | mail | wide,
//             under: true = the sleeves are the shirt under a vest / jerkin (color2) }
//   neck    round | v | scoop | high | crossed | laced | lapels | hood | fur | gorget | none
//   hem     waist | hip | seat | thigh | knee | calf | floor  — where the top ends (seat = just under the crotch);
//           anything below `hip` is a SKIRT (skirt surface, skirt bones). `open: true`: split up the front (coats).
//   flare   how far a skirt bells out at the hem (0..1)
//   front   what runs down the front: none | buttons | laces | band | seam | panels | open | straps | quilt | apron |
//           sash | patches | pocket | harness | wraps | studs
//   belt    none | plain | wide | sash | rope       (drawn by clothes.js over the outermost layer)
//   extras  separate pieces that still ride the body's weights: pauldrons (plate caps over the shoulder patch),
//           tassets (plates hanging from the belt), fauld (lames over the belly), cuffs, bracers, gauntletCuffs,
//           collarRim, furTrim, hoodDown, lapels, tabard, peplum, apron, jagged (a torn hem), mailSkirt
//   bare    the torso itself is skin (harness, wraps): only the straps are cloth
//
// BOTTOMS  fit tight | fit | loose | wide · to thigh | knee | shin | ankle · mat · extras (kneeCops, greaves, cuisses,
//          stockings, straps, torn, bloused, pleats) · skirt { hem, flare, open, arc } for kilts / skirts / loincloths
// SHOES    shaft none | ankle | low | mid | calf | knee · foot boot | heavy | shoe | slipper | sandal | bare | pointed |
//          wrap | curl | sabaton · cuff · mat
// GLOVES   cover wrap | glove | mitt | gauntlet · cuff (m up the forearm) · mat
//
// Unknown ids resolve to the nearest row by kind (`clothesLook`): Chibi 2's own style table first (its sleeve / hem /
// armour words), then word rules on the id, then a plain tunic / trousers / boots.

/** Thickness off the skin per top layer at the chest (m); sleeves and skirts derive from it. */
export const LAYER_OFFSET = { 1: 0.009, 2: 0.014, 3: 0.019, 4: 0.03 };
/** Trousers off the skin (m) by fit, at the thigh / at the ankle. */
export const FIT_OFFSET = { tight: [0.006, 0.007], fit: [0.009, 0.014], loose: [0.016, 0.03], wide: [0.022, 0.05] };

const T = (o) => ({ kind: 'top', layer: 2, mat: 'cloth', sleeve: { to: 'wrist', shape: 'fit' }, neck: 'round', hem: 'hip', flare: 0, front: 'none', belt: 'none', extras: [], ...o });
const B = (o) => ({ kind: 'bottom', fit: 'fit', to: 'ankle', mat: 'cloth', extras: [], skirt: null, waist: 'plain', ...o });
const S = (o) => ({ kind: 'shoes', shaft: 'mid', foot: 'boot', cuff: false, mat: 'leather', ...o });
const G = (o) => ({ kind: 'gloves', cover: 'glove', cuff: 0.06, mat: 'leather', ...o });

export const TOPS = {
  // the kit's own test outfit (CONTRACT §4) — a plain fitted shirt
  shirt: T({ layer: 1, hem: 'hip', sleeve: { to: 'elbow', shape: 'fit' } }),
  tshirt: T({ layer: 1, mat: 'linen', hem: 'hip', sleeve: { to: 'short', shape: 'fit' } }),
  tunic: T({ layer: 2, neck: 'laced', hem: 'seat', front: 'laces', belt: 'plain', extras: ['cuffs'] }),
  travel_shirt: T({ layer: 1, mat: 'linen', neck: 'v', front: 'buttons', hem: 'hip', sleeve: { to: 'forearm', shape: 'rolled' } }),
  gambeson: T({ layer: 2, mat: 'quilt', neck: 'high', front: 'quilt', hem: 'seat', belt: 'wide', extras: ['cuffs'] }),
  hoodie: T({ layer: 2, neck: 'hood', front: 'pocket', hem: 'hip', extras: ['cuffs', 'hoodDown'] }),
  vest: T({ layer: 2, neck: 'v', front: 'panels', hem: 'hip', sleeve: { to: 'wrist', shape: 'fit', under: true } }),
  leather: T({ layer: 2, mat: 'leather', neck: 'v', front: 'laces', hem: 'seat', belt: 'plain', sleeve: { to: 'wrist', shape: 'fit', under: true }, extras: ['bracers'] }),
  strapped_leather: T({ layer: 2, mat: 'leather', neck: 'v', front: 'straps', hem: 'seat', belt: 'plain', sleeve: { to: 'short', shape: 'fit' }, extras: ['bracers', 'studs'] }),
  plate: T({ layer: 4, mat: 'plate', neck: 'gorget', front: 'none', hem: 'hip', belt: 'plain', sleeve: { to: 'wrist', shape: 'mail' }, extras: ['pauldrons', 'tassets', 'fauld', 'gauntletCuffs'] }),
  chainmail: T({ layer: 3, mat: 'mail', neck: 'round', hem: 'seat', belt: 'plain', sleeve: { to: 'elbow', shape: 'mail' }, extras: ['mailSkirt'] }),
  scale_plate: T({ layer: 4, mat: 'scale', neck: 'high', hem: 'hip', belt: 'wide', sleeve: { to: 'wrist', shape: 'mail' }, extras: ['pauldrons', 'tassets', 'gauntletCuffs'] }),
  surcoat: T({ layer: 3, mat: 'cloth', neck: 'round', front: 'band', hem: 'knee', open: true, flare: 0.25, belt: 'plain', sleeve: { to: 'wrist', shape: 'mail', under: true }, extras: ['tabard'] }),
  robe: T({ layer: 3, neck: 'v', hem: 'floor', flare: 0.35, belt: 'sash', sleeve: { to: 'wrist', shape: 'bell' } }),
  trim_robe: T({ layer: 3, neck: 'v', front: 'band', hem: 'floor', flare: 0.35, belt: 'sash', sleeve: { to: 'wrist', shape: 'bell' }, extras: ['hemTrim'] }),
  sash_robe: T({ layer: 3, neck: 'crossed', hem: 'floor', flare: 0.3, belt: 'sash', sleeve: { to: 'wrist', shape: 'bell' } }),
  gi: T({ layer: 2, neck: 'crossed', hem: 'seat', belt: 'sash', sleeve: { to: 'forearm', shape: 'wide' }, extras: ['wraps'] }),
  high_collar_robe: T({ layer: 3, neck: 'high', front: 'band', hem: 'floor', flare: 0.3, sleeve: { to: 'wrist', shape: 'bell' }, extras: ['collarRim', 'hemTrim'] }),
  dress: T({ layer: 2, neck: 'round', hem: 'knee', flare: 0.45, belt: 'sash', sleeve: { to: 'short', shape: 'puff' } }),
  coat: T({ layer: 3, neck: 'lapels', front: 'buttons', hem: 'knee', open: true, flare: 0.2, sleeve: { to: 'wrist', shape: 'fit' }, extras: ['cuffs', 'lapels'] }),
  open_coat: T({ layer: 3, neck: 'lapels', front: 'open', hem: 'knee', open: true, flare: 0.22, sleeve: { to: 'wrist', shape: 'fit' }, extras: ['cuffs', 'lapels', 'shirtFront'] }),
  trench: T({ layer: 3, neck: 'lapels', front: 'buttons', hem: 'calf', open: true, flare: 0.25, belt: 'wide', sleeve: { to: 'wrist', shape: 'fit' }, extras: ['cuffs', 'lapels'] }),
  doublet: T({ layer: 2, neck: 'high', front: 'buttons', hem: 'hip', belt: 'plain', sleeve: { to: 'wrist', shape: 'puff' }, extras: ['peplum'] }),
  fur_tunic: T({ layer: 2, mat: 'fur', neck: 'fur', front: 'laces', hem: 'seat', belt: 'wide', sleeve: { to: 'none' }, extras: ['furTrim'] }),
  wraps: T({ layer: 1, bare: true, neck: 'none', front: 'wraps', hem: 'waist', sleeve: { to: 'none' }, extras: ['wraps'] }),
  silks: T({ layer: 1, mat: 'silk', neck: 'v', front: 'sash', hem: 'hip', belt: 'sash', sleeve: { to: 'wrist', shape: 'fit' } }),
  smith_apron: T({ layer: 2, mat: 'leather', neck: 'round', front: 'apron', hem: 'hip', sleeve: { to: 'forearm', shape: 'rolled', under: true }, extras: ['apron'], under: true }),
  apron: T({ layer: 2, neck: 'round', front: 'apron', hem: 'hip', sleeve: { to: 'forearm', shape: 'rolled', under: true }, extras: ['apron'], under: true }),
  tank: T({ layer: 1, neck: 'scoop', hem: 'hip', sleeve: { to: 'none' } }),
  rags: T({ layer: 2, mat: 'linen', neck: 'round', front: 'patches', hem: 'seat', belt: 'rope', sleeve: { to: 'short', shape: 'fit' }, extras: ['jagged'] }),
  harness: T({ layer: 1, bare: true, mat: 'leather', neck: 'none', front: 'harness', hem: 'waist', belt: 'wide', sleeve: { to: 'none' }, extras: ['bracers'] }),
  // play-test 5 armour (chibi2-gear5-ids.js G5_TOPS)
  g5_cloth_vestment: T({ layer: 3, neck: 'crossed', hem: 'knee', flare: 0.3, sleeve: { to: 'wrist', shape: 'bell' }, extras: ['hemTrim', 'stole'] }),
  g5_leather_brigandine: T({ layer: 2, mat: 'brigandine', neck: 'round', hem: 'hip', sleeve: { to: 'short', shape: 'fit', under: true }, extras: ['studs'] }),
  g5_mail_hauberk: T({ layer: 3, mat: 'mail', neck: 'round', hem: 'seat', sleeve: { to: 'wrist', shape: 'mail' }, extras: ['mailSkirt', 'yoke'] }),
  g5_plate_cuirass: T({ layer: 4, mat: 'plate', neck: 'gorget', hem: 'hip', sleeve: { to: 'elbow', shape: 'mail' }, extras: ['pauldrons', 'fauld', 'flutes'] }),
  // Chibi 2.5 tops (chibi25-outfits.js TOP25)
  cassock: T({ layer: 3, neck: 'high', front: 'buttons', hem: 'floor', flare: 0.2, belt: 'sash', sleeve: { to: 'wrist', shape: 'fit' }, extras: ['cuffs'] }),
  gown: T({ layer: 2, mat: 'silk', neck: 'round', front: 'band', hem: 'floor', flare: 0.5, belt: 'sash', sleeve: { to: 'short', shape: 'puff' } }),
  bodice_dress: T({ layer: 2, neck: 'scoop', front: 'laces', hem: 'floor', flare: 0.5, belt: 'sash', sleeve: { to: 'none' } }),
  hauberk: T({ layer: 3, mat: 'mail', neck: 'round', hem: 'knee', flare: 0.15, belt: 'wide', sleeve: { to: 'wrist', shape: 'mail' } }),
  duster: T({ layer: 3, mat: 'leather', neck: 'lapels', front: 'open', hem: 'calf', open: true, flare: 0.25, sleeve: { to: 'wrist', shape: 'fit' }, extras: ['cuffs', 'lapels', 'shirtFront'] }),
  brigandine: T({ layer: 3, mat: 'brigandine', neck: 'high', front: 'quilt', hem: 'seat', belt: 'wide', sleeve: { to: 'wrist', shape: 'fit' }, extras: ['bracers', 'studs'] }),
};

export const BOTTOMS = {
  pants: B({}),
  leggings: B({ fit: 'tight', waist: 'none' }),
  breeches: B({ to: 'knee', extras: ['stockings'] }),
  baggy: B({ fit: 'loose', extras: ['bloused'] }),
  shorts: B({ to: 'thigh' }),
  ragged: B({ to: 'shin', waist: 'rope', extras: ['torn'] }),
  greaves: B({ fit: 'fit', mat: 'cloth', extras: ['greaves', 'kneeCops'] }),
  skirt: B({ to: null, waist: 'none', skirt: { hem: 'knee', flare: 0.4 } }),
  kilt: B({ to: null, skirt: { hem: 'aboveKnee', flare: 0.25, pleats: true } }),
  loincloth: B({ to: null, waist: 'rope', skirt: { hem: 'thigh', flare: 0.05, arcs: [[-0.55, 0.55], [Math.PI - 0.6, Math.PI + 0.6]] } }),
  g5_cloth_pleats: B({ fit: 'wide', waist: 'sash', extras: ['pleats', 'bloused'] }),
  g5_leather_chaps: B({ mat: 'leather', extras: ['straps'] }),
  g5_mail_chausses: B({ fit: 'tight', mat: 'mail' }),
  g5_plate_cuisses: B({ extras: ['cuisses', 'kneeCops', 'greaves'] }),
  long_skirt: B({ to: null, waist: 'none', skirt: { hem: 'floor', flare: 0.4 } }),
  pleated_skirt: B({ to: null, skirt: { hem: 'calf', flare: 0.35, pleats: true } }),
  wide_trousers: B({ fit: 'wide', waist: 'sash' }),
};

export const SHOES = {
  boots: S({ shaft: 'mid', foot: 'boot', cuff: true }),
  heavy: S({ shaft: 'calf', foot: 'heavy', cuff: true, mat: 'plate' }),
  shoes: S({ shaft: 'ankle', foot: 'shoe' }),
  sneakers: S({ shaft: 'ankle', foot: 'shoe', mat: 'cloth' }),
  slippers: S({ shaft: 'none', foot: 'slipper', mat: 'cloth' }),
  sandals: S({ shaft: 'none', foot: 'sandal' }),
  barefoot: S({ shaft: 'none', foot: 'bare' }),
  pointed: S({ shaft: 'low', foot: 'pointed', mat: 'cloth' }),
  hooves: S({ shaft: 'none', foot: 'bare' }),
  wraps: S({ shaft: 'mid', foot: 'wrap', mat: 'linen' }),
  g5_cloth_curltoes: S({ shaft: 'none', foot: 'curl', mat: 'cloth' }),
  g5_leather_cuffboots: S({ shaft: 'calf', foot: 'boot', cuff: true }),
  g5_mail_splints: S({ shaft: 'mid', foot: 'boot', mat: 'mail', extras: ['splints'] }),
  g5_plate_sabatons: S({ shaft: 'calf', foot: 'sabaton', mat: 'plate' }),
  knee_boots: S({ shaft: 'knee', foot: 'boot', cuff: true }),
  ankle_boots: S({ shaft: 'low', foot: 'boot' }),
  soft_boots: S({ shaft: 'calf', foot: 'slipper', mat: 'leather' }),
};

export const GLOVES = {
  g5_cloth_handwraps: G({ cover: 'wrap', cuff: 0.07, mat: 'linen' }),
  g5_leather_gloves: G({ cover: 'glove', cuff: 0.13, mat: 'leather', extras: ['studs'] }),
  g5_mail_mitts: G({ cover: 'mitt', cuff: 0.08, mat: 'mail' }),
  g5_plate_gauntlets: G({ cover: 'gauntlet', cuff: 0.1, mat: 'plate' }),
  gloves: G({}),
};

export const CLOTHES = { top: TOPS, bottom: BOTTOMS, shoes: SHOES, gloves: GLOVES };
/** Every id per slot (the review page and the tests walk these). */
export const CLOTHES_IDS = Object.fromEntries(Object.entries(CLOTHES).map(([k, t]) => [k, Object.keys(t)]));

// ------------------------------------------------------------------------------------------- nearest row for unknown ids
const NONE = v => !v || v === 'none' || v === 'bare' || v === 'nothing';
/** Chibi 2's TOP_STYLES row (sleeve/hem/armor words) → the nearest catalogue top. */
function nearestTop(id, style) {
  const s = String(id).toLowerCase();
  if (style) {
    if (style.armor === 'plate' || style.armor === 'g5' && /plate|cuirass/.test(s)) return 'plate';
    if (style.armor === 'scale') return 'scale_plate';
    if (style.armor === 'mail' || style.armor === 'g5') return style.hem === 'knee' ? 'hauberk' : 'chainmail';
    if (style.bare) return style.front === 'harness' ? 'harness' : 'wraps';
    if (style.hem === 'long') return style.collar === 'high' ? 'high_collar_robe' : style.collar === 'crossed' ? 'sash_robe' : 'robe';
    if (style.hem === 'knee') return style.sleeve === 'bell' ? 'g5_cloth_vestment' : 'dress';
    if (style.hem === 'trench') return 'trench';
    if (style.hem === 'coat') return style.front === 'open' ? 'open_coat' : 'coat';
    if (style.shirt) return 'vest';
    if (style.sleeve === 'none') return 'tank';
    if (style.sleeve === 'short') return 'tshirt';
  }
  if (/robe|gown|cassock|vestment|habit|kaftan|caftan/.test(s)) return 'robe';
  if (/plate|cuirass|breast/.test(s)) return 'plate';
  if (/scale/.test(s)) return 'scale_plate';
  if (/mail|chain|hauberk/.test(s)) return 'chainmail';
  if (/coat|duster|jacket/.test(s)) return 'coat';
  if (/dress|frock/.test(s)) return 'dress';
  if (/leather|jerkin|brigand/.test(s)) return 'leather';
  if (/vest|bodice/.test(s)) return 'vest';
  if (/shirt|blouse/.test(s)) return 'travel_shirt';
  return 'tunic';
}
function nearestBottom(id, style) {
  const s = String(id).toLowerCase();
  if (style) {
    if (style.garment === 'kilt') return 'kilt';
    if (style.garment === 'skirt') return (style.length || 0) > 0.7 ? 'long_skirt' : 'skirt';
    if (style.garment === 'loincloth') return 'loincloth';
    if (style.armor) return 'greaves';
    if (style.loose) return 'baggy';
    if (style.tight) return 'leggings';
    if (style.leg && style.leg < 0.45) return 'shorts';
    if (style.leg && style.leg < 0.9) return 'breeches';
  }
  if (/skirt/.test(s)) return 'skirt';
  if (/kilt/.test(s)) return 'kilt';
  if (/greave|plate|cuisse/.test(s)) return 'greaves';
  if (/short/.test(s)) return 'shorts';
  if (/legging|hose|tight/.test(s)) return 'leggings';
  return 'pants';
}
function nearestShoes(id, style) {
  const s = String(id).toLowerCase();
  if (style) {
    if (style.foot === 'bare' || style.foot === 'hoof') return 'barefoot';
    if (style.foot === 'sandal') return 'sandals';
    if (style.foot === 'slipper') return style.shaft > 0.3 ? 'soft_boots' : 'slippers';
    if (style.foot === 'heavy') return 'heavy';
    if (style.foot === 'pointed') return 'pointed';
    if (style.foot === 'wrap') return 'wraps';
    if (style.foot === 'shoe') return 'shoes';
    if (style.shaft > 0.85) return 'knee_boots';
    if (style.shaft < 0.3) return 'ankle_boots';
  }
  if (/sandal/.test(s)) return 'sandals';
  if (/slipper/.test(s)) return 'slippers';
  if (/bare|hoof|feet/.test(s)) return 'barefoot';
  if (/sabaton|plate|heavy/.test(s)) return 'heavy';
  if (/shoe/.test(s)) return 'shoes';
  return 'boots';
}
function nearestGloves(id) {
  const s = String(id).toLowerCase();
  if (/gauntlet|plate/.test(s)) return 'g5_plate_gauntlets';
  if (/mail|mitt/.test(s)) return 'g5_mail_mitts';
  if (/wrap|cloth/.test(s)) return 'g5_cloth_handwraps';
  return 'g5_leather_gloves';
}

/**
 * The clothes a look wears, as catalogue rows with their colours: `{ top, bottom, shoes, gloves }`, each null or
 * `{ id, row, color, color2, quality, emblem }`. `styles` (optional) = Chibi 2's style tables { top, bottom, shoes }
 * for the nearest-row rules. Never throws.
 */
export function clothesLook(look = {}, styles = {}) {
  const out = { top: null, bottom: null, shoes: null, gloves: null };
  const one = (slot, part, nearest, table, dflt) => {
    const id = String(part?.id || 'none');
    if (NONE(id)) return null;
    const cid = table[id] ? id : nearest(id, styles[slot]?.[id]);
    const row = table[cid] || table[dflt];
    const r = { id: cid, asked: id, color: part.color || null, color2: part.color2 || null, quality: +part.quality || 0, emblem: part.emblem || null, emblemColor: part.emblemColor || null };
    Object.defineProperty(r, 'row', { value: row, enumerable: false });      // (off the template cache key)
    return r;
  };
  try {
    out.top = one('top', look.top, nearestTop, TOPS, 'tunic');
    out.bottom = one('bottom', look.bottom, nearestBottom, BOTTOMS, 'pants');
    out.shoes = one('shoes', look.shoes, nearestShoes, SHOES, 'boots');
    if (out.shoes?.row.foot === 'bare') out.shoes = null;            // bare feet / hooves: nothing on them
    const gl = look.top?.gloves || look.gloves;
    out.gloves = gl && !NONE(gl.id) ? one('gloves', gl, nearestGloves, GLOVES, 'g5_leather_gloves') : null;
  } catch { /* an odd look: whatever resolved so far */ }
  return out;
}

/** Hem heights (real metres at base scale, before P.k) per named level, per body — clothes.js scales them. */
export const HEM_LEVEL = {
  masc: { waist: 1.03, hip: 0.95, seat: 0.79, thigh: 0.7, aboveKnee: 0.6, knee: 0.5, calf: 0.33, floor: 0.105 },
  fem: { waist: 0.99, hip: 0.91, seat: 0.76, thigh: 0.67, aboveKnee: 0.57, knee: 0.47, calf: 0.31, floor: 0.1 },
};

/** Does this outfit hang anything below the crotch (a skirt surface on the skirt bones)? → the lowest hem level. */
export function skirtOf(c) {
  const top = c?.top?.row, sk = c?.bottom?.row?.skirt;
  const order = ['seat', 'thigh', 'aboveKnee', 'knee', 'calf', 'floor'];
  let lo = -1;
  if (top && order.includes(top.hem)) lo = Math.max(lo, order.indexOf(top.hem));
  if (top?.extras.includes('tassets') || top?.extras.includes('mailSkirt')) lo = Math.max(lo, order.indexOf('seat'));
  if (top?.extras.includes('apron')) lo = Math.max(lo, order.indexOf('knee'));
  if (sk) lo = Math.max(lo, order.indexOf(sk.hem));
  return lo < 0 ? null : order[lo];
}

/**
 * The robe stride (how much of a gait a clip keeps): a floor-length skirt shortens the step the most, as a person in a
 * long robe does. `null` = the plain gait. Read by clips.js (kit gaits) and retarget.js (Chibi's gaits, `rig.stride`).
 */
export function strideOf(c) {
  const lv = skirtOf(c);
  if (!lv) return null;
  const open = !!c.top?.row?.open && !c.bottom?.row?.skirt;
  if (lv === 'floor') return open ? { swing: 0.82, kick: 0.7, lift: 0.7 } : { swing: 0.62, kick: 0.45, lift: 0.42 };
  if (lv === 'calf') return open ? { swing: 0.86, kick: 0.75, lift: 0.75 } : { swing: 0.68, kick: 0.55, lift: 0.55 };
  if (lv === 'knee' || lv === 'aboveKnee') return open ? { swing: 0.92, kick: 0.9, lift: 0.95 } : { swing: 0.82, kick: 0.76, lift: 0.86 };
  return null;      // seat / thigh: the skirt bones alone keep the cloth off the thighs
}
