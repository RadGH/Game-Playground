// Kestrel kit — the face and hair CATALOGUE: every id a game can put on a Kestrel face, what each one means as numbers,
// and `faceLook(look)`, the one normaliser that turns any avatar JSON (Chibi 2 / 2.5 ids, Thousandvale's editor, the
// seeded random roll, old saves, nonsense) into a small plain object the builders read. Pure data, no Three.js.
//
// The ids are Chibi 2.5's (avatar-3d/js/chibi25-options.js CHIBI25_OPTIONS + the avatar-2d catalog + Thousandvale's
// editor lists), so a look made for Chibi 2.5 means the same thing here. An unknown id goes to the NEAREST one (an alias
// table, then a few word rules), never an error. Numbers are multipliers on the form's own face (face.js headSpec), so
// a masc and a fem face stay themselves whatever is picked.

export const FACE_IDS = {
  headShape: ['oval', 'round', 'square', 'heart', 'long', 'wide', 'chiseled'],
  hair: ['bald', 'buzz', 'short', 'side_part', 'bangs', 'bob', 'long', 'wavy', 'ponytail', 'bun', 'buns', 'mohawk', 'spiky', 'curly', 'afro',
    'braids', 'pixie', 'slicked', 'hood_hair', 'tonsure', 'horns_hair', 'undercut', 'topknot', 'high_ponytail', 'twin_tails', 'messy',
    'pompadour', 'locs', 'long_braid', 'mullet', 'side_swept', 'crown_braid', 'side_shave', 'wolf_cut', 'half_up', 'ribbon_loops', 'cornrows',
    'warrior_braids', 'feathered', 'curly_bob', 'puff', 'rolled_tail', 'bowl', 'court_cut'],
  eyes: ['almond', 'round', 'narrow', 'wide', 'sleepy', 'angry', 'dot', 'anime', 'happy', 'wink', 'hollow', 'slit', 'tired', 'glow',
    'cat', 'doe', 'droopy', 'sharp', 'button', 'sparkle', 'hooded', 'lashes', 'heart', 'storybook'],
  pupil: ['round', 'slit', 'dot', 'star', 'heart', 'cross', 'ring', 'none'],
  iris: ['normal', 'large', 'small', 'ring', 'none'],
  brows: ['straight', 'arched', 'angry', 'worried', 'thick', 'thin', 'none', 'raised', 'bushy', 'unibrow', 'slanted', 'soft', 'split', 'dots', 'curved', 'bold'],
  nose: ['small', 'dot', 'button', 'long', 'wide', 'hook', 'upturned', 'none', 'snout', 'pointed', 'round', 'flat'],
  mouth: ['neutral', 'smile', 'frown', 'open', 'grin', 'smirk', 'o', 'tongue', 'fangs', 'sad_open', 'stitched', 'tusks', 'laugh', 'cat', 'pout',
    'gritted', 'wavy', 'buck', 'fang', 'shark'],
  ears: ['normal', 'pointed', 'big', 'none', 'fins', 'long_pointed', 'swept', 'notched', 'small', 'cat_ears', 'wolf_ears'],
  facialHair: ['none', 'stubble', 'goatee', 'mustache', 'full', 'long', 'chinstrap', 'soul_patch', 'braided_beard', 'mutton_chops', 'handlebar',
    'van_dyke', 'short_beard', 'forked_beard', 'sideburns'],
  accessory: ['none', 'glasses', 'round_glasses', 'monocle', 'eyepatch', 'mask', 'scarf_mask', 'goggles', 'earrings', 'nose_ring', 'blindfold',
    'sunglasses', 'g5_torc', 'scarf_trailing', 'scarf_cowl', 'scarf_striped', 'neckerchief', 'scarf', 'pendant', 'prayer_beads'],
  extras: ['none', 'freckles', 'freckles_heavy', 'freckles_nose', 'blush', 'blush_soft', 'scar', 'scar_cheek', 'scar_brow', 'scar_lip', 'burn_scar',
    'warpaint', 'war_stripe', 'war_mask', 'cheek_stripes', 'eye_black', 'face_glyphs', 'paint_dots', 'third_eye', 'wrinkles', 'dirt', 'mud',
    'blood', 'brand', 'undead_skin', 'pale', 'beauty_mark', 'chin_lines', 'tear_mark', 'star_mark', 'moon_mark'],
};

/** Ear shapes that suit each people, best first (Chibi 2.5's table): used when a look names no ears. */
export const RACE_EARS = {
  human: ['normal', 'small', 'big'], elf: ['pointed', 'long_pointed', 'swept'], dwarf: ['normal', 'big', 'small'],
  orc: ['notched', 'pointed', 'big'], giant: ['normal', 'big', 'notched'], goblin: ['big', 'swept', 'notched', 'pointed'],
  halfling: ['pointed', 'small', 'normal'], undead: ['notched', 'normal', 'none'], beast: ['wolf_ears', 'cat_ears', 'pointed'],
};

// ------------------------------------------------------------------------------------------------ what each id is
/** Head shapes: w = whole width, jaw = width below the mouth, cheek = width at the cheekbones, chin = width near the chin
 *  (below 1 = pointed), sq = squareness added to the front superellipse, len = lower-face length, bone = cheekbone. */
export const HEAD_SHAPES = {
  oval: {},
  round: { w: 1.03, jaw: 1.05, chin: 1.12, sq: -0.15, len: 0.97, bone: 0.7 },
  square: { jaw: 1.09, chin: 1.14, sq: 0.55, bone: 1.1 },
  heart: { cheek: 1.04, jaw: 0.9, chin: 0.72, sq: -0.05 },
  long: { w: 0.95, len: 1.07, jaw: 0.97 },
  wide: { w: 1.07, jaw: 1.06, cheek: 1.04, len: 0.97 },
  chiseled: { jaw: 1.07, chin: 1.0, sq: 0.38, bone: 1.6, jawEdge: 1.8 },
};

/** Eyes: w/t/b = half-width / top / bottom of the almond; tilt = outer corner lift (head m); arch = how far the lower
 *  lid curves UP (a smiling crescent); inner = the inner end of the upper lid pulled down (a glare); lashK = lash
 *  thickness; wing = how far the lash flicks past the corner; low = lower lashes; iris = iris size; catch = catchlights;
 *  crease = upper-lid crease depth (-1 = a heavy hooded lid); bags = tired lower lids; hollow / glow / closed = special. */
export const EYE_SHAPES = {
  almond: {},
  round: { w: 0.94, t: 1.25, b: 1.3, tilt: -0.0015, iris: 1.02 },
  narrow: { t: 0.66, b: 0.7, iris: 0.92 },
  wide: { w: 1.1, t: 1.2, b: 1.15, iris: 1.06 },
  sleepy: { t: 0.62, b: 0.95, tilt: -0.0015, crease: 0.4, lidColor: true },
  angry: { t: 0.92, inner: 0.006, tilt: 0.0035, lashK: 1.15 },
  dot: { w: 0.48, t: 0.62, b: 0.62, iris: 0.9, irisFill: true, white: false, lashK: 0.6 },
  anime: { w: 1.16, t: 1.42, b: 1.22, iris: 1.3, lashK: 1.35, catch: 2, wing: 1.4 },
  happy: { t: 0.95, b: 0.55, arch: 0.55, tilt: 0.001 },
  wink: { closedL: true },
  hollow: { hollow: true, t: 1.1, b: 1.1 },
  slit: { pupil: 'slit', t: 0.82, tilt: 0.004, iris: 1.12 },
  tired: { t: 0.8, bags: true, crease: 0.5 },
  glow: { glow: true },
  cat: { tilt: 0.0075, wing: 1.7, t: 0.95, b: 0.85, lashK: 1.2 },
  doe: { w: 1.04, t: 1.32, b: 1.35, iris: 1.18, low: true, catch: 2 },
  droopy: { tilt: -0.0065, t: 0.85, crease: 0.6 },
  sharp: { w: 1.05, t: 0.7, b: 0.68, tilt: 0.0065, lashK: 1.1 },
  button: { w: 0.46, t: 0.6, b: 0.6, iris: 0.95, irisFill: true, white: false, irisNone: true, lashK: 0.5 },
  sparkle: { t: 1.15, b: 1.1, iris: 1.18, catch: 3 },
  hooded: { t: 0.78, crease: -1, tilt: -0.001 },
  lashes: { lashK: 1.85, wing: 1.9, low: true },
  heart: { pupil: 'heart', iris: 1.12, t: 1.08 },
  storybook: { w: 0.82, t: 1.25, b: 1.22, irisNone: true, iris: 1.1, catch: 2 },
};

/** Pupil outlines (r as a share of the iris radius, by angle a). */
export const PUPILS = ['round', 'slit', 'dot', 'star', 'heart', 'cross', 'ring', 'none'];

/** Brows: arch = how much it humps; slant = inner end up (+) or down (-) (head m); lift = whole brow up; thick =
 *  thickness; taper = outer-end thickness share; len = length; gap = a shaved split; dots / bridge / rough = special. */
export const BROW_SHAPES = {
  straight: { arch: 0.4 },
  arched: { arch: 1.45, lift: 0.0012 },
  angry: { slant: -0.0062, arch: 0.25, thick: 1.12 },
  worried: { slant: 0.0058, arch: 0.25, outer: -0.002 },
  thick: { thick: 1.6, taper: 0.7 },
  thin: { thick: 0.48 },
  none: { none: true },
  raised: { lift: 0.0062, arch: 1.0 },
  bushy: { thick: 1.85, taper: 0.8, rough: true, len: 1.04 },
  unibrow: { thick: 1.3, bridge: true, arch: 0.5 },
  slanted: { slant: -0.0042, arch: 0.1, len: 1.06 },
  soft: { len: 0.74, thick: 0.85, start: 0.006 },
  split: { gap: [0.48, 0.6], thick: 1.1 },
  dots: { dots: true },
  curved: { arch: 2.1, lift: 0.0028, thick: 0.9 },
  bold: { thick: 1.45, taper: 0.88, arch: 0.7 },
};

/** Noses (multipliers on the form's nose): tip = how far it stands out, w = ridge width, wing = nostril wings, bridge,
 *  ball = tip bulb, y = the tip line moved up (+) / down (-), hook = a bump on the bridge, up = the tip turned up,
 *  snout = a flat forward pad with big nostrils, none = no nose. */
export const NOSE_SHAPES = {
  small: {},
  dot: { tip: 0.42, w: 0.8, wing: 0.72, bridge: 0.3, ball: 1.4, y: 0.005 },
  button: { tip: 0.62, w: 0.95, wing: 0.9, ball: 2.2, up: 0.5, bridge: 0.6 },
  long: { tip: 1.15, w: 0.9, y: -0.006, bridge: 1.2 },
  wide: { w: 1.38, wing: 1.45, tip: 0.95 },
  hook: { tip: 1.12, hook: 1, y: -0.004, w: 0.95 },
  upturned: { tip: 0.82, up: 1, ball: 1.3, y: 0.003 },
  none: { none: true },
  snout: { snout: true, tip: 1.05, w: 2.0, wing: 1.7, ball: 0.4 },
  pointed: { tip: 1.28, w: 0.68, ball: 0.25, bridge: 1.15 },
  round: { ball: 2.8, w: 1.12, wing: 1.1 },
  flat: { tip: 0.52, w: 1.42, wing: 1.32, bridge: 0.35 },
};

/** Mouths: rest = the mouth's resting pose as bone offsets (the same units as expressions.js), w = width, full = lip
 *  fullness; teeth / lower = which teeth show; extras: fangs, fang, tusks, shark, buck, tongue, stitched, cat, wavy. */
export const MOUTH_SHAPES = {
  neutral: {},
  smile: { rest: { mouthC: [0.0018, 0.0034, -0.0012], cheek: [0, 0.0012, 0.0004], lipD: [0, -0.0003, 0] } },
  frown: { rest: { mouthC: [-0.0006, -0.0032, 0], lipD: [0, 0.0005, 0.0004] } },
  open: { rest: { jaw: 0.14, lipU: [0, 0.0008, 0] }, teeth: 1, lower: true },
  grin: { rest: { mouthC: [0.0028, 0.0042, -0.0016], lipU: [0, 0.0016, 0.0003], lipD: [0, -0.0016, 0.0003], jaw: 0.05, cheek: [0, 0.0018, 0.0006] }, teeth: 1.15, lower: true, w: 1.06 },
  smirk: { rest: { side: { R: { mouthC: [0.0016, 0.0036, -0.001] }, L: { mouthC: [-0.0004, -0.0006, 0] } } } },
  o: { rest: { mouthC: [-0.0055, 0.0004, 0.0012], jaw: 0.12, lipU: [0, 0.0012, 0.001], lipD: [0, -0.001, 0.001] }, w: 0.86, full: 1.15 },
  tongue: { rest: { jaw: 0.1, mouthC: [0.0008, 0.0012, 0] }, tongue: true, teeth: 1 },
  fangs: { fangs: 2, rest: { lipU: [0, 0.0007, 0] } },
  sad_open: { rest: { jaw: 0.13, mouthC: [-0.0012, -0.004, 0], lipU: [0, 0.0006, 0] }, teeth: 1, lower: true },
  stitched: { stitched: true, w: 1.05, full: 0.7 },
  tusks: { tusks: true, w: 1.08, rest: { lipD: [0, 0.0006, 0.0006] } },
  laugh: { rest: { jaw: 0.24, mouthC: [0.0032, 0.0045, -0.0016], cheek: [0, 0.0024, 0.0008], lipU: [0, 0.0018, 0] }, teeth: 1.15, lower: true, w: 1.08, tongue: 'low' },
  cat: { cat: true, rest: { mouthC: [0.0012, 0.0028, -0.0006], lipU: [0, -0.0006, 0] } },
  pout: { rest: { mouthC: [-0.0032, -0.001, 0.0008], lipU: [0, 0.0004, 0.0018], lipD: [0, -0.0002, 0.0022] }, w: 0.9, full: 1.3 },
  gritted: { rest: { mouthC: [0.0024, 0.0006, -0.0008], lipU: [0, 0.0022, 0.0004], lipD: [0, -0.0022, 0.0004] }, teeth: 1.2, lower: true, clench: true, w: 1.04 },
  wavy: { wavy: true, rest: { side: { R: { mouthC: [0, 0.0012, 0] }, L: { mouthC: [0, -0.0012, 0] } } } },
  buck: { buck: true, rest: { lipU: [0, 0.0009, 0.0004] } },
  fang: { fangs: 1 },
  shark: { shark: true, rest: { lipU: [0, 0.0018, 0.0002], lipD: [0, -0.0018, 0.0002], mouthC: [0.0018, 0.001, -0.0006], jaw: 0.04 }, w: 1.1 },
};

/** Ears: h = height, d = depth (front to back), out = how far it stands off the head, tip = a point at the top-back
 *  (length, angle: 0 = straight up, 1 = straight back), notch = torn V cuts, fin / animal = special. */
export const EAR_SHAPES = {
  normal: {},
  pointed: { tip: [0.017, 0.35] },
  big: { h: 1.25, d: 1.2, out: 1.35 },
  none: { none: true },
  fins: { fin: true },
  long_pointed: { tip: [0.05, 0.62], out: 1.15 },
  swept: { tip: [0.034, 0.86], out: 0.9 },
  notched: { tip: [0.008, 0.4], notch: true },
  small: { h: 0.8, d: 0.82, out: 0.85 },
  cat_ears: { animal: 'cat' },
  wolf_ears: { animal: 'wolf' },
};

/** Default per form when a look names nothing (the two test characters' faces). */
const DEFAULTS = {
  masc: { headShape: 'oval', eyes: 'almond', brows: 'straight', nose: 'small', mouth: 'neutral', ears: 'normal', facialHair: 'none', accessory: 'none', extras: 'none' },
  fem: { headShape: 'oval', eyes: 'almond', brows: 'arched', nose: 'small', mouth: 'neutral', ears: 'normal', facialHair: 'none', accessory: 'none', extras: 'none' },
};

// ------------------------------------------------------------------------------------------------ nearest id
/** Ids that are not in a slot's list but mean something close (older catalogs, other games, typos). */
const ALIAS = {
  headShape: { oblong: 'long', narrow: 'long', diamond: 'chiseled', angular: 'chiseled', square_jaw: 'square', broad: 'wide', egg: 'oval' },
  eyes: { normal: 'almond', default: 'almond', big: 'wide', small: 'narrow', closed: 'happy', squint: 'narrow', beady: 'button', snake: 'slit', reptile: 'slit', dead: 'hollow', empty: 'hollow', glowing: 'glow', starry: 'sparkle', winking: 'wink', upturned: 'cat', downturned: 'droopy' },
  pupil: { normal: 'round', cat: 'slit', snake: 'slit', small: 'dot', plus: 'cross' },
  iris: { big: 'large', default: 'normal', ringed: 'ring' },
  brows: { normal: 'straight', default: 'straight', flat: 'straight', heavy: 'bushy', high: 'raised', sad: 'worried', furrowed: 'angry', mono: 'unibrow', scarred: 'split', short: 'soft', noble: 'dots' },
  nose: { normal: 'small', default: 'small', big: 'wide', broad: 'wide', aquiline: 'hook', roman: 'hook', pug: 'button', snub: 'upturned', bulb: 'round', pig: 'snout', sharp: 'pointed' },
  mouth: { default: 'neutral', closed: 'neutral', happy: 'smile', sad: 'frown', toothy: 'grin', teeth: 'gritted', vampire: 'fangs', fanged: 'fangs', sewn: 'stitched', tusk: 'tusks', kiss: 'pout', smug: 'smirk', surprised: 'o' },
  ears: { human: 'normal', default: 'normal', elf: 'pointed', elven: 'pointed', high_elf: 'long_pointed', round: 'small', torn: 'notched', fish: 'fins', cat: 'cat_ears', wolf: 'wolf_ears', fox_ears: 'wolf_ears', dog_ears: 'wolf_ears', large: 'big' },
  facialHair: { beard: 'full', moustache: 'mustache', mustache_long: 'handlebar', goatee_long: 'van_dyke', braid: 'braided_beard', chops: 'mutton_chops', fork: 'forked_beard', short: 'short_beard', scruff: 'stubble', shadow: 'stubble' },
  accessory: { spectacles: 'glasses', specs: 'glasses', shades: 'sunglasses', patch: 'eyepatch', bandana_mask: 'scarf_mask', veil: 'scarf_mask', torc: 'g5_torc', necklace: 'pendant', amulet: 'pendant', beads: 'prayer_beads', earring: 'earrings', cowl: 'scarf_cowl', kerchief: 'neckerchief' },
  extras: { freckle: 'freckles', scars: 'scar', scar_eye: 'scar', tattoo: 'face_glyphs', glyphs: 'face_glyphs', runes: 'face_glyphs', paint: 'warpaint', soot: 'dirt', grime: 'dirt', undead: 'undead_skin', zombie: 'undead_skin', ghost: 'pale', ashen: 'pale', mole: 'beauty_mark', tear: 'tear_mark', star: 'star_mark', moon: 'moon_mark', blushing: 'blush' },
};

/** Word rules for ids nobody listed (checked in order; the first that matches wins). */
const RULES = {
  hair: [[/pony|tail/, 'ponytail'], [/braid|plait/, 'braids'], [/bun|knot/, 'bun'], [/curl|perm|coil/, 'curly'], [/spik|punk/, 'spiky'], [/mess|tous|shag|scruff|wild/, 'messy'],
    [/mohawk|crest|hawk/, 'mohawk'], [/shav|skin|bald/, 'bald'], [/buzz|crew|crop/, 'buzz'], [/slick|comb|back/, 'slicked'], [/wav|flow|loose|long|mane/, 'long'], [/bob/, 'bob'], [/bang|fringe/, 'bangs'], [/lock|dread/, 'locs'], [/afro|puff/, 'afro']],
  eyes: [[/glow|shin/, 'glow'], [/slit|snake|serp/, 'slit'], [/hollow|void|dead/, 'hollow'], [/big|large/, 'wide'], [/close|shut/, 'happy']],
  brows: [[/thick|heavy|bush/, 'bushy'], [/thin|fine/, 'thin'], [/arch/, 'arched'], [/ang|furrow/, 'angry']],
  nose: [[/big|broad|wide/, 'wide'], [/long/, 'long'], [/hook|beak/, 'hook'], [/snout|pig|boar/, 'snout']],
  mouth: [[/fang|vamp/, 'fangs'], [/tusk|orc/, 'tusks'], [/smil|happy/, 'smile'], [/open|shout|yell/, 'open'], [/teeth|tooth/, 'grin'], [/sad|frown/, 'frown']],
  ears: [[/long|high/, 'long_pointed'], [/point|elf|sharp/, 'pointed'], [/big|large/, 'big'], [/fin|fish|gill/, 'fins'], [/cat|lynx/, 'cat_ears'], [/wolf|dog|fox/, 'wolf_ears']],
  facialHair: [[/braid/, 'braided_beard'], [/fork/, 'forked_beard'], [/long|wizard|great/, 'long'], [/stache|moust/, 'mustache'], [/goat/, 'goatee'], [/stub|scruff|shadow/, 'stubble'], [/beard/, 'full'], [/burn|side/, 'sideburns']],
  accessory: [[/sun|shade/, 'sunglasses'], [/glass|spec/, 'glasses'], [/goggle/, 'goggles'], [/patch/, 'eyepatch'], [/blind/, 'blindfold'], [/mask/, 'mask'], [/scarf|cowl|wrap/, 'scarf'], [/ear/, 'earrings'], [/torc|collar/, 'g5_torc'], [/neck|pend|amul|charm/, 'pendant'], [/bead|rosary/, 'prayer_beads']],
  extras: [[/freck/, 'freckles'], [/scar/, 'scar'], [/burn/, 'burn_scar'], [/paint|stripe/, 'warpaint'], [/glyph|rune|tattoo|tatt/, 'face_glyphs'], [/dirt|soot|grime|ash/, 'dirt'], [/mud/, 'mud'], [/blood/, 'blood'], [/undead|rot|zomb/, 'undead_skin'], [/pale|ghost/, 'pale'], [/blush/, 'blush']],
};

/** The id in `slot` nearest to `id` (or `fallback` when nothing is close). */
export function nearestId(slot, id, fallback) {
  const list = FACE_IDS[slot];
  if (!list) return fallback;
  const s = String(id ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return fallback;
  if (list.includes(s)) return s;
  const a = ALIAS[slot]?.[s];
  if (a) return a;
  for (const [re, to] of RULES[slot] || []) if (re.test(s)) return to;
  if (slot === 'hair' && /^(none|no|bald)$/.test(s)) return 'bald';
  return fallback;
}

// ------------------------------------------------------------------------------------------------ the normaliser
const HEX = /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i;
const hex = v => (typeof v === 'string' && HEX.test(v.trim()) ? (v.trim()[0] === '#' ? v.trim() : '#' + v.trim()) : null);
const idOf = v => (v && typeof v === 'object' ? v.id : v);
const num = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null && v !== '' && typeof v !== 'boolean' ? Math.max(lo, Math.min(hi, +v)) : d);

/**
 * Everything a Kestrel face and hair read from a look, normalised. Small and plain (it is part of the template cache
 * key): ids are always valid, numbers clamped, colours are hex or null.
 */
export function faceLook(look = {}) {
  const L = look || {}, body = L.body || {};
  const form = body.form === 'fem' || /^f/i.test(String(body.form || L.gender || '')) ? 'fem' : 'masc';
  const D = DEFAULTS[form];
  const race = String(body.race || L.race || 'human').toLowerCase();
  const pick = (slot, raw, def) => nearestId(slot, idOf(raw), def);
  const eyes = L.eyes || {}, brows = L.brows || {}, ears = L.ears || {}, hair = L.hair || {}, fh = L.facialHair || {}, acc = L.accessory || {}, x = L.extras || {};
  const earDef = (RACE_EARS[race] || RACE_EARS.human)[0];
  const eyeId = pick('eyes', eyes, D.eyes);
  return {
    form, race,
    head: pick('headShape', L.headShape ?? L.head?.shape, D.headShape),
    eyes: {
      id: eyeId,
      pupil: nearestId('pupil', eyes.pupil, EYE_SHAPES[eyeId]?.pupil || 'round'),
      iris: nearestId('iris', eyes.iris, 'normal'),
      color: hex(eyes.color), colorR: hex(eyes.colorR), white: hex(eyes.white),
      blink: eyes.blink !== false, height: num(eyes.height, 0.7, 1.35, 1),
    },
    brows: { id: pick('brows', brows, D.brows), thick: num(brows.thick, 0.5, 1.8, 1), color: hex(brows.color) },
    nose: pick('nose', L.nose, D.nose),
    mouth: pick('mouth', L.mouth, D.mouth),
    ears: { id: idOf(ears) == null || idOf(ears) === '' ? earDef : pick('ears', ears, earDef), scale: num(ears.scale, 0.6, 1.6, 1) },
    beard: { id: pick('facialHair', fh, 'none'), color: hex(fh.color) },
    acc: { id: pick('accessory', acc, 'none'), color: hex(acc.color), color2: hex(acc.color2) },
    marks: { id: pick('extras', x, 'none'), color: hex(x.color) },
    hair: {
      id: hairIdOf(hair.id ?? (form === 'fem' ? 'high_ponytail' : 'spiky')), color2: hex(hair.color2),
      // crop the hair to sit under a hat (batch 3 sets this when it draws the hat): true = by the hat id, or the brim heights
      underHat: hair.underHat === true ? true : hair.underHat && typeof hair.underHat === 'object' ? { front: num(hair.underHat.front, 0.05, 0.24, 0.178), back: num(hair.underHat.back, 0, 0.24, 0.11) } : null,
    },
    hat: idOf(L.hat) && idOf(L.hat) !== 'none' ? String(idOf(L.hat)) : null,
  };
}

/** The canonical hair id ('' → short, 'none' → bald, unknown → the nearest). hair.js hairStyleFor is this. */
export function hairIdOf(id) {
  const s = String(id ?? '').trim().toLowerCase();
  if (!s) return 'short';
  if (s === 'none') return 'bald';
  return nearestId('hair', s, 'short');
}

/** Every (slot, id) pair, for review pages and tests. */
export function allFaceIds() {
  const out = [];
  for (const [slot, ids] of Object.entries(FACE_IDS)) for (const id of ids) out.push([slot, id]);
  return out;
}
