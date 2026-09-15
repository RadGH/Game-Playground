// Naming for the world generator. Wraps Name Forge (`/namegen/js/namegen.js`) when a game has it,
// and falls back to a small built-in syllable namer so `worldgen/` works on its own.
//
//   import { Namer } from './names.js';
//   const namer = new Namer({ namegen });          // namegen = a NameGen instance, or null
//   namer.region('elf', 1234)                      // → { text: 'The Weeping Downs', adj, people, race }
//   namer.feature('range', 'dwarf', 99)            // → { text: 'the Ironspine Wall' }
//
// Every name is derived from a seed, so the same world always gets the same names. All names are
// invented here — nothing is taken from any existing game or book.

import { makeRng, hashStr } from './noise.js';

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------- fallback namer
// Small sound sets per race flavour so a dwarf region does not sound like an elf one.
const SOUNDS = {
  human:    { on: ['b', 'br', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'r', 's', 'st', 't', 'w'], nu: ['a', 'e', 'i', 'o', 'u', 'ai', 'ea'], co: ['n', 'r', 'l', 'd', 'm', 'st', 'nd', ''] },
  elf:      { on: ['l', 'th', 'n', 's', 'v', 'm', 'ael', 'il', 'y'], nu: ['a', 'e', 'i', 'ae', 'ia', 'io', 'y'], co: ['l', 'n', 'r', 'th', 's', ''] },
  dwarf:    { on: ['b', 'd', 'g', 'k', 'kh', 'r', 'th', 'm', 'gr', 'br', 'dr'], nu: ['a', 'o', 'u', 'i'], co: ['k', 'r', 'm', 'n', 'z', 'd', 'rn', 'g'] },
  orc:      { on: ['g', 'gr', 'k', 'kr', 'm', 'n', 'r', 'sk', 'z', 'dr'], nu: ['a', 'o', 'u'], co: ['g', 'k', 'r', 'z', 'sh', 'rk', 'gh'] },
  goblin:   { on: ['g', 'n', 'sn', 'sk', 'v', 'z', 'k'], nu: ['i', 'e', 'a', 'u'], co: ['k', 't', 'z', 'ch', 'g', ''] },
  giant:    { on: ['b', 'br', 'h', 'j', 'm', 'r', 'sv', 't', 'v'], nu: ['a', 'o', 'u', 'au', 'o'], co: ['r', 'n', 'm', 'rn', 'lf', 'd'] },
  halfling: { on: ['b', 'd', 'f', 'h', 'm', 'p', 't', 'w'], nu: ['a', 'e', 'i', 'o'], co: ['n', 'l', 'r', 't', 'ck', ''] },
  gnome:    { on: ['b', 'f', 'g', 'kl', 'p', 'tw', 'z'], nu: ['i', 'e', 'o', 'u'], co: ['k', 'n', 'z', 'p', 'ck', ''] },
  fey:      { on: ['l', 'm', 'n', 'ph', 's', 'th', 'w', 'y'], nu: ['i', 'e', 'a', 'ia', 'ae'], co: ['n', 'l', 'sh', 'th', ''] },
  undead:   { on: ['m', 'n', 'v', 'z', 'gh', 'thr', 'x'], nu: ['a', 'o', 'u', 'e'], co: ['l', 'r', 'th', 'sh', 'x', 'm'] },
  troll:    { on: ['b', 'gr', 'h', 'm', 'r', 'thr', 'ug'], nu: ['a', 'o', 'u'], co: ['g', 'm', 'r', 'k', 'l'] },
  dragon:   { on: ['ar', 'dr', 'kh', 'm', 's', 'th', 'v', 'z'], nu: ['a', 'i', 'o', 'au'], co: ['x', 'r', 'th', 'n', 's'] },
};
const PLAIN = ['ash', 'amber', 'bleak', 'briar', 'cinder', 'dusk', 'ember', 'fen', 'frost', 'gale', 'glim', 'grey', 'hollow', 'iron', 'mire', 'moss', 'north', 'quill', 'raven', 'salt', 'shale', 'sable', 'stone', 'storm', 'thorn', 'tide', 'weep', 'wild', 'wolf', 'wyrm'];
const LANDFORM = ['downs', 'reach', 'march', 'moor', 'vale', 'expanse', 'hollow', 'basin', 'flats', 'steppe', 'highlands', 'lowlands', 'wastes', 'scar', 'verge', 'weald'];
const TOWN_SUFFIX = ['ford', 'hold', 'gate', 'burn', 'mere', 'cross', 'stead', 'watch', 'barrow', 'hearth', 'fall', 'row', 'haven', 'keep', 'wick'];

function fallbackWord(race, rng, syllables = 2) {
  const s = SOUNDS[race] || SOUNDS.human;
  let out = '';
  for (let i = 0; i < syllables; i++) {
    out += rng.pick(s.on) + rng.pick(s.nu) + (i === syllables - 1 || rng() < 0.4 ? rng.pick(s.co) : '');
  }
  out = out.replace(/(.)\1\1/g, '$1$1').replace(/^(.)\1/, '$1');
  return cap(out);
}

// ---------------------------------------------------------------- feature name shapes
const FEATURE = {
  range:    ['the {W} {~Range|Spine|Wall|Teeth|Ridges|Crags}', 'the {w}spine', 'the {W} Peaks'],
  river:    ['the {W}', 'the {W} {~River|Water|Run|Race}', '{w}flow', 'the {W}mouth'],
  lake:     ['{W} {~Lake|Mere|Tarn|Water}', 'Lake {W}', 'the {W} Pool'],
  sea:      ['the {W} {~Sea|Deeps|Reach|Expanse|Gulf}', 'the {W}main', 'the Sea of {W}'],
  forest:   ['the {w}wood', 'the {W} {~Wood|Forest|Thicket|Grove}', '{w}shade'],
  isle:     ['the {W} {~Isles|Skerries|Shoals}', '{W} Isle'],
  desert:   ['the {W} {~Waste|Sands|Barrens|Pan}'],
  marsh:    ['the {W} {~Marsh|Fen|Mire|Sink}'],
  pass:     ['the {W} {~Pass|Gap|Saddle|Notch}'],
  bay:      ['{W} Bay', 'the {W} {~Bight|Sound|Narrows}'],
  continent: ['{W}', 'the {W} {~Mainland|Expanse|Continent}', '{W}{~ia|or|eth|and|mark}'],
  ocean:    ['the {W} Ocean', 'the {~Great|Endless|Outer|Sunless} {W}', 'the {W} {~Vast|Waters}'],
};

const LANDMARK_SHAPES = {
  ruin:        ['the Ruins of {W}', 'fallen {W}', 'the {W} Ruin', 'broken {W}'],
  shrine:      ['the Shrine of {W}', '{W} Shrine', 'the {W} Altar'],
  cave:        ['the {W} {~Cave|Hollow|Deep|Grotto}', '{w}delve'],
  tower:       ['the {W} {~Tower|Spire|Watch|Beacon}', '{w}spire'],
  monolith:    ['the {W} {~Stones|Monolith|Pillar|Standing Stones}'],
  volcano:     ['Mount {W}', 'the {W} {~Cone|Forge|Maw}'],
  waterfall:   ['the {W} {~Falls|Cascade|Drop}', '{w}fall'],
  ancientwood: ['the Elder {W}', 'the {W} Heartwood', 'old {w}wood'],
  battlefield: ['the {W} {~Field|Ground|Rout|Slaughter}', 'the Fall of {W}'],
  lair:        ['the {W} {~Lair|Den|Nest|Warren}', '{w}den'],
  dungeon:     ['the {~Sunken|Buried|Lost|Black} {W}', 'the {W} {~Vault|Crypt|Undercroft|Labyrinth}'],
  port:        ['{W} {~Harbour|Quay|Landing|Anchorage}'],
  bridge:      ['{W} {~Bridge|Span|Crossing|Ford}'],
  camp:        ['the {W} {~Camp|Muster|Staging}'],
  crater:      ['the {W} Crater', '{W} Basin', 'the {W} Pit'],
  vent:        ['the {W} {~Vents|Fumaroles|Smokers}'],
};

// ---------------------------------------------------------------- body themes
// A dead moon should not have a "Silver Fen". A theme gives a world a vocabulary: the landform words
// its regions are named with, the concept tags its plain words come from, and the words it must never
// use. Themes are off by default (`nameTheme: null`), so World Forge's own worlds name exactly as before.

/** Words that mean liquid water, or ground that only exists beside it. */
export const WATER_WORDS = ['fen', 'fens', 'marsh', 'marshes', 'mire', 'mires', 'mere', 'meres', 'lake', 'lakes', 'loch', 'tarn', 'tarns', 'pool', 'pools', 'pond', 'ponds', 'river', 'rivers', 'brook', 'brooks', 'stream', 'streams', 'creek', 'water', 'waters', 'wet', 'rain', 'rains', 'tide', 'tides', 'sea', 'seas', 'ocean', 'oceans', 'bay', 'gulf', 'harbour', 'harbor', 'quay', 'anchorage', 'spring', 'springs', 'well', 'wells', 'falls', 'cascade', 'ford', 'fords', 'shallows', 'sound', 'narrows', 'bight', 'deeps', 'main', 'mainland', 'swamp', 'swamps', 'bog', 'bogs', 'isle', 'isles', 'island', 'islands', 'shore', 'shores', 'coast', 'coasts', 'mud', 'muddy', 'run', 'runs'];
/** Wet ground only — for a world that has seas but should not have marshes (a desert). */
export const WETLAND_WORDS = ['fen', 'fens', 'marsh', 'marshes', 'mire', 'mires', 'bog', 'bogs', 'swamp', 'swamps', 'reed', 'reeds'];
/** Words that say somebody lives, rules or builds here. */
export const WILD_WORDS = ['kingdom', 'principality', 'protectorate', 'dominion', 'holdfast', 'freehold', 'realm', 'throne', 'crown', 'empire', 'barony', 'duchy', 'county', 'shire', 'republic', 'league', 'march', 'marches', 'hold', 'keep', 'stead', 'haven', 'town', 'burg', 'burgh', 'gate', 'tower', 'watch', 'market', 'bridge', 'road', 'inn', 'abbey', 'temple'];
/** Words that mean living, growing or tended things. */
export const LIFE_WORDS = ['wood', 'woods', 'forest', 'forests', 'grove', 'groves', 'thicket', 'weald', 'moss', 'mossy', 'briar', 'briars', 'thorn', 'thorns', 'leaf', 'leaves', 'bloom', 'blossom', 'flower', 'flowers', 'meadow', 'meadows', 'garden', 'gardens', 'green', 'grass', 'reed', 'reeds', 'fern', 'ferns', 'vine', 'vines', 'oak', 'oaks', 'willow', 'birch', 'pine', 'pines', 'root', 'roots', 'farm', 'farms', 'field', 'fields', 'orchard', 'hearth', 'heartwood', 'wolf', 'wolves', 'raven', 'ravens', 'boar', 'deer', 'fish', 'bird', 'birds', 'herd', 'herds', 'nest', 'den', 'warren', 'lair', 'rose', 'roses', 'ivy', 'elm', 'fox', 'bat', 'bats', 'bear', 'bears', 'hound', 'hounds', 'stag', 'lion', 'ox', 'eagle', 'hawk', 'owl', 'crow', 'serpent', 'snake', 'horse', 'bull', 'goat', 'hart', 'hare', 'lamb', 'sheep', 'cat'];
/** Stems also caught inside compounds ("Silvermere", "Mistwood") — only when they are in the forbidden set. */
const COMPOUND_STEMS = ['mere', 'water', 'wood', 'brook', 'fen', 'mire', 'marsh', 'moss', 'reed', 'grove', 'lake', 'river', 'tide', 'rain', 'fern', 'leaf', 'thorn', 'briar', 'vine', 'meadow', 'pool', 'pond', 'sea', 'bay', 'spring', 'field', 'farm', 'forest', 'swamp', 'bog', 'isle', 'shore', 'pine', 'ivy', 'rose', 'oak', 'elm', 'fox', 'bat', 'bear', 'stag', 'hound', 'serpent', 'hold', 'keep', 'stead', 'haven', 'town', 'burg', 'gate', 'tower', 'watch', 'shire', 'crown', 'market', 'bridge'];
const WORD_LISTS = { water: WATER_WORDS, life: LIFE_WORDS, wetland: WETLAND_WORDS, wild: WILD_WORDS };

export const NAME_THEMES = {
  dead:    { forbid: ['water', 'life', 'wild'], tags: 'stone,metal,hard,element,dark,quality', landforms: ['Basin', 'Flats', 'Scarp', 'Plateau', 'Craters', 'Rille', 'Wastes', 'Shelf', 'Expanse', 'Scar', 'Highlands', 'Plain', 'Terraces', 'Barrens'] },
  ice:     { forbid: ['water', 'life', 'wild'], tags: 'stone,hard,weather,element,quality,dark', landforms: ['Icefield', 'Glacier', 'Shelf', 'Plateau', 'Sheet', 'Rime', 'Expanse', 'Crevasses', 'Drifts', 'Flats', 'Highlands', 'Cap'] },
  lava:    { forbid: ['water', 'life', 'wild'], allow: ['sea', 'seas', 'ocean', 'gulf', 'bay', 'lake', 'lakes', 'river', 'rivers', 'deeps', 'falls', 'narrows', 'main', 'isle', 'isles', 'island', 'islands', 'shore', 'shores', 'coast', 'run', 'runs'], tags: 'element,stone,metal,dark,hard,quality', landforms: ['Calderas', 'Ashfield', 'Cinders', 'Scoria', 'Flats', 'Burn', 'Scar', 'Plateau', 'Rift', 'Wastes', 'Highlands', 'Cones'] },
  crystal: { forbid: ['water', 'life', 'wild'], tags: 'stone,hard,metal,quality,element', landforms: ['Facets', 'Spires', 'Shelf', 'Plateau', 'Lattice', 'Expanse', 'Flats', 'Highlands', 'Scar', 'Wastes', 'Prisms'] },
  void:    { forbid: ['water', 'life', 'wild'], tags: 'dark,abstract,stone,element,quality', landforms: ['Wastes', 'Scar', 'Hollow', 'Rift', 'Expanse', 'Flats', 'Shelf', 'Barrens', 'Verge', 'Plateau'] },
  desert:  { forbid: ['life', 'wetland', 'wild'], tags: 'stone,element,weather,quality,dark', landforms: ['Sands', 'Barrens', 'Pan', 'Mesas', 'Dunes', 'Flats', 'Scarp', 'Wastes', 'Expanse', 'Badlands'] },
  toxic:   { forbid: ['life', 'wild'], tags: 'element,dark,quality,stone', landforms: ['Wastes', 'Flats', 'Basin', 'Scar', 'Barrens', 'Expanse', 'Lowlands', 'Highlands', 'Sinks'] },
  // a tidally locked world: seas, rivers and something growing in the twilight ring, but nobody's kingdom
  twilight: { forbid: ['wild'], tags: 'weather,element,landform,dark,quality', landforms: ['Verge', 'Reach', 'Flats', 'Highlands', 'Basin', 'Scarp', 'Shelf', 'Expanse', 'Lowlands', 'Downs', 'Vale', 'Moor', 'Hollow', 'Barrens'] },
};

/** Plain words that fit any theme — the last resort when rolled names keep hitting forbidden words. */
const SAFE_PLAIN = ['ash', 'amber', 'bleak', 'cinder', 'dusk', 'ember', 'frost', 'gale', 'glim', 'grey', 'hollow', 'iron', 'north', 'quill', 'salt', 'shale', 'sable', 'stone', 'storm', 'silent', 'pale', 'black', 'copper', 'glass', 'dust', 'rust', 'shard', 'cold', 'far'];
/** The noun a last-resort name ends in, per feature or landmark kind. */
const SAFE_NOUN = { range: 'Ridges', pass: 'Gap', continent: 'Expanse', sea: 'Lava Sea', ocean: 'Lava Ocean', lake: 'Caldera', river: 'Lava Run', bay: 'Slag Bay', isle: 'Outcrops', marsh: 'Sinks', forest: 'Stands', desert: 'Barrens', ruin: 'Ruin', cave: 'Cave', crater: 'Crater', vent: 'Vents', volcano: 'Cone', monolith: 'Stones', dungeon: 'Vault', tower: 'Spire', shrine: 'Altar', camp: 'Camp' };

/** Feature shapes for a world with no water (only a lava world has the liquid ones, and they are molten). */
const THEMED_FEATURE = {
  continent: ['{W}', 'the {W} {~Expanse|Shield|Plateau|Uplands}'],
  sea:    ['the {W} {~Lava Sea|Magma Deeps|Fire Gulf}', 'the Burning {W}'],
  ocean:  ['the {W} {~Lava Ocean|Magma Main}', 'the {~Great|Endless|Molten} {W}'],
  lake:   ['the {W} {~Caldera|Crucible|Cauldron}', '{W} Fire Lake'],
  river:  ['the {W} {~Lava Run|Flow|Burn}', '{w}burn'],
  bay:    ['the {W} {~Fire Bight|Slag Bay}'],
  isle:   ['the {W} {~Outcrops|Cinder Isles}', '{W} Outcrop'],
  marsh:  ['the {W} {~Slag|Sinks}'],
  forest: ['the {W} {~Spires|Pillars}'],
};
const THEMED_LANDMARK = {
  cave:    ['the {W} {~Cave|Hollow|Deep|Rift}', '{w}delve'],
  crater:  ['the {W} Crater', '{W} Basin', 'the {W} Pit', 'the {P} Crater'],
  vent:    ['the {W} {~Vents|Fumaroles|Smokers}', 'the {P} Vents'],
  dungeon: ['the {~Buried|Lost|Black|Silent} {W}', 'the {W} {~Vault|Undercroft|Labyrinth}'],
  volcano: ['Mount {W}', 'the {W} {~Cone|Forge|Maw}'],
};

const _themeSets = new Map();
function themeSets(key) {
  if (_themeSets.has(key)) return _themeSets.get(key);
  const t = NAME_THEMES[key];
  let v = null;
  if (t) {
    const allow = new Set(t.allow || []);
    const forbid = new Set(t.forbid.flatMap(k => WORD_LISTS[k] || []).filter(w => !allow.has(w)));
    v = { forbid, stems: COMPOUND_STEMS.filter(st => forbid.has(st)) };
  }
  _themeSets.set(key, v);
  return v;
}

/**
 * The first word in `text` that a theme forbids, or null. A whole word counts ("the Silver Fen"), and
 * so does a forbidden stem at either end of a longer word ("Silvermere", "Mistwood").
 */
export function forbiddenWordIn(text, theme) {
  const sets = themeSets(theme);
  if (!sets) return null;
  for (const w of String(text).toLowerCase().split(/[^a-z]+/)) {
    if (!w) continue;
    if (sets.forbid.has(w)) return w;
    for (const st of sets.stems) if (w.length > st.length && (w.startsWith(st) || w.endsWith(st))) return w;
  }
  return null;
}

/** Tidy a composed name: collapse triples, fix "the the", capitalise leading article words for display. */
function tidy(s) {
  return s.replace(/(.)\1\1/g, '$1$1').replace(/\bthe the\b/gi, 'the').replace(/\s+/g, ' ').trim();
}
/** Title case for display, leaving small connecting words lowercase unless they start the name. */
export function titleCase(s) {
  const small = new Set(['of', 'the', 'and', 'in', 'on', 'at']);
  return s.split(' ').map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : cap(w))).join(' ');
}

/**
 * Which race's language names a place. Biome and temperature pick it; a game can pass its own table
 * through `opts.raceTable` in generateWorld.
 */
export const DEFAULT_RACE_TABLE = {
  ice: ['giant', 'undead'], tundra: ['giant', 'dwarf'], borealForest: ['giant', 'dwarf', 'human'],
  mountains: ['dwarf', 'giant'], snowyPeaks: ['dwarf', 'giant'], hills: ['dwarf', 'halfling', 'human'],
  temperateForest: ['elf', 'human', 'halfling'], rainforest: ['elf', 'fey', 'troll'],
  grassland: ['human', 'halfling'], savanna: ['human', 'orc'], shrubland: ['human', 'gnome'],
  desert: ['human', 'undead'], badlands: ['orc', 'goblin'], marsh: ['troll', 'goblin', 'fey'],
  volcanic: ['dragon', 'orc'], beach: ['human'], coast: ['human'],
  blighted: ['undead', 'goblin'], ashPlain: ['undead', 'dragon'], veiledHills: ['fey', 'undead'],
  hallowed: ['elf', 'fey'], glimmerwaste: ['fey', 'gnome'],
};

export class Namer {
  /** namegen: a Name Forge instance (optional). raceTable: biome name → array of race ids. */
  constructor({ namegen = null, raceTable = DEFAULT_RACE_TABLE, seed = 1, theme = null } = {}) {
    this.gen = namegen; this.raceTable = { ...DEFAULT_RACE_TABLE, ...(raceTable || {}) }; this.seed = seed >>> 0;
    this.used = new Set();
    // a NAME_THEMES key, or null for the classic vocabulary (every themed branch below is skipped)
    this.theme = theme && NAME_THEMES[theme] ? { key: theme, ...NAME_THEMES[theme] } : null;
  }
  /** True when a name uses nothing the theme forbids (always true without a theme). */
  fits(text) { return !this.theme || !forbiddenWordIn(text, this.theme.key); }
  /** Roll `make(seed)` until it fits the theme; after ten misses use `fallback()`, which always fits. */
  themed(make, seed, fallback) {
    for (let t = 0; t < 10; t++) {
      const r = make((seed + Math.imul(t, 0x9e3779b1)) >>> 0);
      if (r && this.fits(r.text)) return r;
    }
    return fallback();
  }
  /** A plain word from the always-safe list. */
  safePlain(seed) { return makeRng((seed ^ 0x51f15e) >>> 0).pick(SAFE_PLAIN); }
  /** Race for a biome name + temperature; deterministic from the seed passed in. */
  raceFor(biomeName, seed, temperature = 0.5) {
    const rng = makeRng((seed ^ this.seed) >>> 0);
    let pool = this.raceTable[biomeName] || ['human'];
    if (temperature < 0.2 && !pool.includes('giant')) pool = pool.concat('giant');
    const race = rng.pick(pool);
    return this.gen && !this.gen.languages[race] ? 'human' : race;
  }
  /** A bare invented word in a race's language — the building block for composed names. */
  word(race, seed, syllables = 2) {
    const rng = makeRng((seed ^ 0x5bf03635) >>> 0);
    if (this.gen) { try { return this.gen.nativeWord(race, rng, { syllables }).text; } catch { /* fall through */ } }
    return fallbackWord(race, rng, syllables);
  }
  /** A plain-tongue evocative word ('ash', 'briar') — used where a compound should read in the common tongue. */
  plainWord(race, seed) {
    if (this.theme) {
      for (let t = 0; t < 6; t++) {
        const rng = makeRng((seed ^ 0x1f2e3d4c ^ Math.imul(t, 0x2545f491)) >>> 0);
        let word = null;
        if (this.gen) { try { const c = this.gen.pickConcept(rng, this.theme.tags, race); word = (c.adj && rng() < 0.4 ? c.adj : c.en).toLowerCase(); } catch { /* fall through */ } }
        if (!word) word = rng.pick(SAFE_PLAIN);
        if (this.fits(word)) return word;
      }
      return this.safePlain(seed);
    }
    const rng = makeRng((seed ^ 0x1f2e3d4c) >>> 0);
    if (this.gen) { try { const c = this.gen.pickConcept(rng, 'nature,element,weather,dark,quality,animal', race); return (c.adj && rng() < 0.4 ? c.adj : c.en).toLowerCase(); } catch { /* fall through */ } }
    return rng.pick(PLAIN);
  }
  /** Expand a shape string: {W} word (capitalised), {w} word (lowercase), {P} plain word, {~a|b|c} pick. */
  shape(tpl, race, seed) {
    const rng = makeRng((seed ^ 0x27d4eb2f) >>> 0);
    let n = 0;
    return tidy(tpl.replace(/\{([^{}]+)\}/g, (m, body) => {
      if (body.startsWith('~')) return rng.pick(body.slice(1).split('|'));
      n++;
      if (body === 'W') return this.word(race, (seed + n * 7919) >>> 0, rng() < 0.35 ? 3 : 2);
      if (body === 'w') return this.word(race, (seed + n * 7919) >>> 0, 2).toLowerCase();
      if (body === 'P') return cap(this.plainWord(race, (seed + n * 104729) >>> 0));
      if (body === 'p') return this.plainWord(race, (seed + n * 104729) >>> 0);
      return m;
    }));
  }
  /** Region name. Uses Name Forge's `region` patterns when available (they already read like "The Weeping Downs"). */
  region(race, seed) {
    if (this.theme) return this.themedRegion(race, seed);
    if (this.gen) {
      try {
        const r = this.gen.generate('region', { race, seed });
        return { text: titleCase(r.text), adj: r.forms.adj || r.text, people: r.forms.people || r.text + ' folk', race, gloss: r.gloss };
      } catch { /* fall through */ }
    }
    const rng = makeRng(seed >>> 0);
    const text = titleCase(rng() < 0.5 ? `the ${cap(rng.pick(PLAIN))} ${rng.pick(LANDFORM)}` : `${this.word(race, seed, 2)} ${rng.pick(LANDFORM)}`);
    return { text, adj: text.replace(/^The /, ''), people: text.replace(/^The /, '') + ' folk', race, gloss: [] };
  }
  /**
   * A region name in the world's theme, built only from the theme's own vocabulary: a plain word
   * picked by the theme's concept tags (Name Forge's pickConcept) or a native word, then one of the
   * theme's landforms. Name Forge's general region patterns are not used here — they lean on
   * kingdoms, animals and wetlands, which is exactly what a dead world must not be called.
   */
  themedRegion(race, seed) {
    const t = this.theme;
    const pack = text => ({ text, adj: text.replace(/^The /, ''), people: text.replace(/^The /, '') + ' folk', race, gloss: [] });
    return this.themed(s => {
      const rng = makeRng(s >>> 0);
      const lf = rng.pick(t.landforms);
      return pack(titleCase(rng() < 0.55 ? `the ${cap(this.plainWord(race, s))} ${lf}` : `${this.word(race, s, 2)} ${lf}`));
    }, seed, () => pack(titleCase(`the ${cap(this.safePlain(seed))} ${makeRng(seed >>> 0).pick(t.landforms)}`)));
  }
  /** Settlement name, tier is 'capital'|'city'|'town'|'village'|'hamlet' (only used to pick grander shapes). */
  settlement(race, seed, tier = 'town') {
    if (this.gen) {
      try { const r = this.gen.generate('settlement', { race, seed }); return { text: titleCase(r.text), race, gloss: r.gloss, people: r.forms?.people }; } catch { /* fall through */ }
    }
    const rng = makeRng((seed ^ 0x8a5cd7) >>> 0);
    const base = rng() < 0.5 ? cap(rng.pick(PLAIN)) : this.word(race, seed, 2);
    const text = tier === 'capital' || tier === 'city' ? titleCase(`${base}${rng.pick(['hold', 'gate', 'crown', 'reach', 'keep'])}`) : titleCase(base + rng.pick(TOWN_SUFFIX));
    return { text, race, gloss: [] };
  }
  /** A named geographic feature: kind is one of the FEATURE keys (range, river, lake, sea, forest, isle…). */
  feature(kind, race, seed) {
    if (this.theme) {
      const shapes = (this.theme.forbid.includes('water') ? THEMED_FEATURE[kind] : null) || FEATURE[kind] || FEATURE.range;
      return this.themed(s => {
        const rng = makeRng((s ^ hashStr(kind)) >>> 0);
        return { text: titleCase(this.shape(rng.pick(shapes), race, s)), kind, race };
      }, seed, () => ({ text: titleCase(`the ${cap(this.safePlain(seed))} ${SAFE_NOUN[kind] || 'Reach'}`), kind, race }));
    }
    const shapes = FEATURE[kind] || FEATURE.range;
    const rng = makeRng((seed ^ hashStr(kind)) >>> 0);
    return { text: titleCase(this.shape(rng.pick(shapes), race, seed)), kind, race };
  }
  /** A landmark / dungeon / port name: kind is a LANDMARK_SHAPES key. */
  landmark(kind, race, seed) {
    if (this.theme) {
      const shapes = THEMED_LANDMARK[kind] || LANDMARK_SHAPES[kind] || LANDMARK_SHAPES.ruin;
      return this.themed(s => {
        const rng = makeRng((s ^ hashStr('lm' + kind)) >>> 0);
        return { text: titleCase(this.shape(rng.pick(shapes), race, s)), kind, race };
      }, seed, () => ({ text: titleCase(`the ${cap(this.safePlain(seed))} ${SAFE_NOUN[kind] || 'Ruin'}`), kind, race }));
    }
    const shapes = LANDMARK_SHAPES[kind] || LANDMARK_SHAPES.ruin;
    const rng = makeRng((seed ^ hashStr('lm' + kind)) >>> 0);
    return { text: titleCase(this.shape(rng.pick(shapes), race, seed)), kind, race };
  }
  /** A person's name, for history events ("founded by …"). */
  person(race, seed, gender) {
    if (this.gen) { try { const r = this.gen.generate('person.full', { race, seed, gender }); return { text: r.text, short: r.forms.short || r.text, race }; } catch { /* fall through */ } }
    const rng = makeRng((seed ^ 0x2545f491) >>> 0);
    const given = this.word(race, seed, 2), family = cap(rng.pick(PLAIN)) + rng.pick(['hand', 'wood', 'stone', 'brook', 'crest', 'vane']);
    return { text: `${given} ${family}`, short: given, race };
  }
  /** Make a name unique in this world by adding a distinguishing word if it repeats. */
  unique(name, race, seed) {
    let text = name.text;
    if (!this.used.has(text.toLowerCase())) { this.used.add(text.toLowerCase()); return name; }
    const rng = makeRng((seed ^ 0x6b43a9) >>> 0);
    for (let i = 0; i < 12; i++) {
      const alt = titleCase(rng.pick(['Upper ', 'Lower ', 'Old ', 'New ', 'Far ', 'Little ', 'Great ']) + text.replace(/^the /i, ''));
      if (!this.used.has(alt.toLowerCase())) { this.used.add(alt.toLowerCase()); return { ...name, text: alt }; }
    }
    this.used.add(text.toLowerCase()); return name;
  }
}
