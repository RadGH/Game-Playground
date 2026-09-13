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
};

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
  constructor({ namegen = null, raceTable = DEFAULT_RACE_TABLE, seed = 1 } = {}) {
    this.gen = namegen; this.raceTable = { ...DEFAULT_RACE_TABLE, ...(raceTable || {}) }; this.seed = seed >>> 0;
    this.used = new Set();
  }
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
    const shapes = FEATURE[kind] || FEATURE.range;
    const rng = makeRng((seed ^ hashStr(kind)) >>> 0);
    return { text: titleCase(this.shape(rng.pick(shapes), race, seed)), kind, race };
  }
  /** A landmark / dungeon / port name: kind is a LANDMARK_SHAPES key. */
  landmark(kind, race, seed) {
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
