// Kestrel kit — the HAT catalogue (batch 3, 2026-10-28). Pure data + the normaliser; no Three.js.
//
// Every hat id a Chibi 2 / 2.5 / Thousandvale look can name (the 2D catalogue's 37 hats, which is a superset of the 24 that
// Thousandvale's data reaches — class outfits, tier-2 outfits, gear-look.js, monsters; see README "Hats (batch 3)"), with
// what each one does to the head under it:
//
//   kind    cap | brimmed | helm | closed | hood | coif | band | down | whole   (how hat-build.js treats it)
//   (the hat's lower edge — where the hair is cut — is each builder's own `fit(θ)` in hats.js, beside the pieces it
//    describes, so the two can never disagree)
//   hair    'crop' (cut at the rim) | 'none' (no hair at all: a closed helm, a pumpkin) | 'keep' (a band: on the hair)
//   ears    'show' | 'hide' (inside the hat) | 'tips' (a soft cap: pointed ears come out under / past it)
//   beard   false = no facial hair is built (it could only come out through the hat); 'shell' = only what lies on the face
//           (the beard shell and the moustache: a braid or a long hanging beard would go through the throat cover)
//   face    false = the face pieces are not built and the face skin is dropped (a closed helm is all there is to see)
//   acc     which accessories stay: 'all' | 'face' (no neck pieces / earrings) | 'none'
//   neck    true = the hat reaches the neck / shoulders (a hood's mantle, a coif, an aventail): neck skin under it drops
//
//   hatIdOf(id)        → a known id (unknown → the nearest by its words, then by kind; never throws)
//   hatLookOf(look)    → { id, color, color2, emblem, emblemColor, quality } | null — from `look.hat`, or the Chibi look a
//                        Thousandvale look carries (`look.chibi.look.hat`)
//   HAT_IDS, HAT_INFO, rimAt({ front, side, back }, θ)

const PI = Math.PI;

/** kind defaults */
const KIND = {
  cap:     { hair: 'crop', ears: 'tips', beard: true, face: true, acc: 'all', neck: false },
  brimmed: { hair: 'crop', ears: 'tips', beard: true, face: true, acc: 'all', neck: false },
  helm:    { hair: 'crop', ears: 'hide', beard: true, face: true, acc: 'face', neck: false },
  coif:    { hair: 'crop', ears: 'hide', beard: true, face: true, acc: 'face', neck: true },
  hood:    { hair: 'crop', ears: 'hide', beard: true, face: true, acc: 'face', neck: true },
  closed:  { hair: 'none', ears: 'hide', beard: false, face: false, acc: 'none', neck: false },
  whole:   { hair: 'none', ears: 'hide', beard: false, face: false, acc: 'none', neck: false },
  band:    { hair: 'keep', ears: 'show', beard: true, face: true, acc: 'all', neck: false },
  down:    { hair: 'keep', ears: 'show', beard: true, face: true, acc: 'face', neck: false },
};


/**
 * The table. `color` / `color2` are the defaults when a look names none (Chibi 2's own defaults, so a look keeps its
 * colours). `name` is for the review page only.
 */
export const HAT_INFO = {
  // ---- soft caps
  cap:            { kind: 'cap', name: 'Cloth cap', color: '#6a4a2a' },
  leather_cap:    { kind: 'cap', name: 'Leather cap', color: '#6a4a2a', ears: 'hide' },   // ear flaps
  bandana:        { kind: 'cap', name: 'Bandana', color: '#8a2a2a' },
  feather_cap:    { kind: 'cap', name: 'Feathered cap', color: '#b02020', color2: '#3aa65a' },
  bard_red_feather: { alias: 'feather_cap' },
  goggles_up:     { kind: 'cap', name: 'Aviator cap and goggles', color: '#6a4a2a', ears: 'hide' },
  bolt_crown:     { kind: 'cap', name: 'Flat-top with neck bolts', color: '#1a1a20', color2: '#9aa0a8' },
  toadstool_cap:  { kind: 'cap', name: 'Toadstool cap', color: '#d02a2a', color2: '#ffffff' },
  g5_cloth_wrap:  { kind: 'cap', name: "Scholar's headwrap", color: '#7a6a8a', color2: '#d8b040' },
  // ---- brimmed hats
  wide_brim:      { kind: 'brimmed', name: 'Wide-brimmed hat', color: '#40352f' },
  straw:          { kind: 'brimmed', name: 'Straw hat', color: '#d8c078', color2: '#8a3a2a' },
  top_hat:        { kind: 'brimmed', name: 'Top hat', color: '#1e1e24', color2: '#6a2a3a' },
  tricorn:        { kind: 'brimmed', name: 'Tricorn', color: '#1e2436', color2: '#d8b040' },
  wizard:         { kind: 'brimmed', name: 'Wizard hat', color: '#3a3a8a' },
  witch_hat:      { kind: 'brimmed', name: "Witch's hat", color: '#2a1a3a', color2: '#8a3ad8' },
  candy_corn_hat: { kind: 'brimmed', name: 'Candy corn hat', color: '#ff8a1a', color2: '#ffd23f' },
  g5_leather_slouch: { kind: 'brimmed', name: 'Pinned slouch hat', color: '#6a4a30', color2: '#c8b890' },
  // ---- open-faced helms
  helmet:         { kind: 'helm', name: 'Helmet', color: '#9aa2ac', ears: 'tips' },
  horned_helm:    { kind: 'helm', name: 'Horned helm', color: '#9aa2ac', ears: 'tips' },
  rune_helm:      { kind: 'helm', name: "Runesmith's helm", color: '#6a6258', color2: '#58d8f0', ears: 'tips' },
  war_helm:       { kind: 'helm', name: "Warrior's helm", color: '#8a9098' },
  plate_helm:     { kind: 'helm', name: "Knight's helm", color: '#b8c0cc', color2: '#c8323a' },
  g5_mail_cap:    { kind: 'helm', name: 'Banded cap and aventail', color: '#8a9098', color2: '#536a73', neck: true },
  wolf_helm:      { kind: 'helm', name: 'Wolf helm', color: '#7a7068', neck: true },
  // ---- closed helms and whole-head pieces
  great_helm:     { kind: 'closed', name: 'Great helm', color: '#d8dce4', color2: '#d8b040' },
  dragon_helm:    { kind: 'closed', name: 'Dragon helm', color: '#2a5a2a' },
  g5_plate_armet: { kind: 'closed', name: 'Houndsnout armet', color: '#a0a8b2', color2: '#d8b040' },
  pumpkin_head:   { kind: 'whole', name: 'Pumpkin head', color: '#ff8a1a', color2: '#4a7a2a' },
  ghost_sheet:    { kind: 'whole', name: 'Ghost sheet', color: '#f8f8ff', neck: true },
  // ---- mail and cloth hoods
  chain_coif:     { kind: 'coif', name: 'Mail coif', color: '#9aa2ac', beard: 'shell' },
  hood:           { kind: 'hood', name: 'Hood', color: '#4b536c', beard: 'shell' },
  hood_down:      { kind: 'down', name: 'Hood (down)', color: '#4b536c' },
  // ---- bands, crowns and things on the hair
  crown:          { kind: 'band', name: 'Crown', color: '#d8b040' },
  circlet:        { kind: 'band', name: 'Circlet', color: '#c8c8d8', color2: '#7fd4ff' },
  headband:       { kind: 'band', name: 'Headband', color: '#6a4a2a' },
  feather_band:   { kind: 'band', name: 'Feather band', color: '#6a4a2a' },
  flower:         { kind: 'band', name: 'Flower', color: '#f0a0c0', color2: '#f2d040' },
  bone_headdress: { kind: 'band', name: 'Feathered headdress', color: '#8a5a3a', color2: '#c8402a' },
};
export const HAT_IDS = Object.keys(HAT_INFO).filter(id => !HAT_INFO[id].alias);
for (const id of HAT_IDS) HAT_INFO[id] = { ...KIND[HAT_INFO[id].kind], ...HAT_INFO[id], id };

/** Words → the nearest hat, for ids nobody wrote a model for (a new game's "iron_sallet", "Bishop's mitre"…). */
const WORDS = [
  [/pumpkin|jack/, 'pumpkin_head'], [/ghost|sheet|shroud/, 'ghost_sheet'], [/dragon|wyrm/, 'dragon_helm'],
  [/great.?helm|bucket|barrel|closed|armet|bascinet|sallet/, 'great_helm'], [/wolf|bear|pelt|beast/, 'wolf_helm'],
  [/horn/, 'horned_helm'], [/rune/, 'rune_helm'], [/plate|knight|visor/, 'plate_helm'], [/war|nasal|cheek/, 'war_helm'],
  [/aventail|mail.?cap|banded/, 'g5_mail_cap'], [/coif|chain|mail/, 'chain_coif'], [/helm|helmet|steel|iron/, 'helmet'],
  [/hood.?down|cowl.?down|lowered/, 'hood_down'], [/hood|cowl|cloak|cape/, 'hood'],
  [/witch/, 'witch_hat'], [/wizard|mage|point|cone|sorcer/, 'wizard'], [/candy/, 'candy_corn_hat'], [/top.?hat|stovepipe/, 'top_hat'],
  [/tricorn|bicorn|admiral|captain|pirate.?hat/, 'tricorn'], [/straw|sun.?hat|farmer/, 'straw'], [/slouch|cavalier|plume/, 'g5_leather_slouch'],
  [/brim|ranger|cowboy|traveller|fedora/, 'wide_brim'], [/toadstool|mushroom/, 'toadstool_cap'],
  [/crown|tiara|diadem/, 'crown'], [/circlet|coronet/, 'circlet'], [/feather|plume|quill/, 'feather_band'], [/headdress|bone|tribal/, 'bone_headdress'],
  [/flower|blossom|rose|wreath|garland/, 'flower'], [/band|sweat|ribbon/, 'headband'],
  [/goggle|aviator|tinker/, 'goggles_up'], [/wrap|turban|scholar/, 'g5_cloth_wrap'], [/bandana|kerchief|scarf/, 'bandana'],
  [/bolt|frank|flat.?top/, 'bolt_crown'], [/leather/, 'leather_cap'], [/bard|beret|feathered/, 'feather_cap'], [/cap|beanie|hat|skull|bonnet/, 'cap'],
];
/** A known hat id for anything a look names (null for none / nothing). Never throws. */
export function hatIdOf(raw) {
  const s = String(raw?.id ?? raw ?? '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'bald' || s === 'nothing') return null;
  if (HAT_INFO[s]) return HAT_INFO[s].alias || s;
  const k = s.replace(/[\s-]+/g, '_');
  if (HAT_INFO[k]) return HAT_INFO[k].alias || k;
  for (const [re, id] of WORDS) if (re.test(s)) return id;
  return 'cap';
}

const hex = v => (typeof v === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim()) ? (v.trim()[0] === '#' ? v.trim() : '#' + v.trim()).toLowerCase() : null);
/** The hat a look wears, normalised (small and plain: it is part of the template cache key). */
export function hatLookOf(look) {
  const L = look || {};
  const src = (L.hat && L.hat.id && L.hat.id !== 'none') || typeof L.hat === 'string' ? L.hat : L.chibi?.look?.hat;
  const id = hatIdOf(src);
  if (!id) return null;
  const h = typeof src === 'object' && src ? src : {};
  const q = Number.isFinite(+h.quality) ? Math.max(0, Math.min(3, Math.round(+h.quality))) : 0;
  return { id, color: hex(h.color), color2: hex(h.color2), emblem: typeof h.emblem === 'string' && h.emblem ? h.emblem : null, emblemColor: hex(h.emblemColor), quality: q };
}

/** The rim height (head space) of a { front, side, back } table at θ — smooth, flat at the front, side and back. */
export function rimAt(rim, th) {
  const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
  return a < PI / 2 ? rim.front + (rim.side - rim.front) * (1 - Math.cos(2 * a)) / 2 : rim.side + (rim.back - rim.side) * (1 - Math.cos(2 * a - PI)) / 2;
}
