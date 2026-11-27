// Tree Kit — the species data and everything that reads it without drawing (pure: no three.js, no DOM).
//
// data/species.json holds every tree as PARTS (trunk, roots, branches, crown, leaves, bark, wind, size); the builder
// (js/build.js) reads the flat row `rowOf(species)` makes from them. The same file holds each game's tree kinds
// (today only "oathwild": art id → which tree, how tall in metres, plus its MEASURED trunk / crown, written by
// tools/measure.mjs from the drawn tree), so the collider a server uses is the trunk the browser draws (lessons rule 22).
//
//   import { DATA, SPECIES, rowOf, KNOBS, getKnob, setKnob, formatSpecies, gameKinds } from 'treekit/js/species.js'
//   DATA            the parsed file (loaded once: fetch in a browser, the file system in node)
//   SPECIES         DATA.species (id → parts)
//   rowOf(sp)       → the flat row the builder reads (cached per object; call forget(sp) after changing it)
//   KNOBS           every knob the page and the command line may change: path, label, min, max, step, kind
//   getKnob(sp, 'trunk.radius') / setKnob(sp, 'trunk.radius', 1.3) → the value (clamped, rounded to the knob's step)
//   formatSpecies(DATA) → the file's text (one line per part, so a change is a one-line diff)
//   gameKinds('oathwild') → { trees: { 'oak-a': { story, h, trunk, crown, giant } }, understory: { … } }
const FILE = new URL('../data/species.json', import.meta.url);

async function loadFile() {
  if (typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined') {
    const fs = await import('node:fs');
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  }
  const r = await fetch(FILE);
  if (!r.ok) throw new Error(`treekit: species.json ${r.status}`);
  return r.json();
}
export const DATA = await loadFile();
export const SPECIES = DATA.species;
export const SPECIES_FILE = FILE;

// ---------------------------------------------------------------- the knobs (page sliders, CLI, validation)
// kind: 'n' number (min..max, step), 'i' whole number, 'b' on/off, 'c' colour multiplier [r,g,b], 's' one of `of`
const K = (path, label, min, max, step, kind = 'n', more = {}) => ({ path, label, min, max, step, kind, ...more });
export const KNOBS = Object.freeze([
  K('size.height', 'Height (own units)', 0.8, 40, 0.1, 'n', { part: 'Size' }),
  K('size.age', 'Age (young slender … old stocky)', 0.3, 1.6, 0.01, 'n', { part: 'Size' }),
  K('trunk.radius', 'Trunk radius at the ground', 0.03, 4, 0.005, 'n', { part: 'Trunk' }),
  K('trunk.topRadius', 'Trunk radius at the top', 0.02, 3, 0.005, 'n', { part: 'Trunk' }),
  K('trunk.crownStart', 'Crown starts at (of the height)', 0.04, 0.8, 0.01, 'n', { part: 'Trunk' }),
  K('trunk.flare', 'Root flare', 0, 2, 0.01, 'n', { part: 'Trunk' }),
  K('trunk.flutes', 'Bark ridges (flutes)', 0, 0.4, 0.005, 'n', { part: 'Trunk' }),
  K('trunk.twist', 'Ridge twist (turns)', 0, 3, 0.05, 'n', { part: 'Trunk' }),
  K('trunk.lean', 'Lean (of the height)', 0, 0.3, 0.005, 'n', { part: 'Trunk' }),
  K('trunk.bend', 'S-bend (of the height)', 0, 0.2, 0.005, 'n', { part: 'Trunk' }),
  K('roots.count', 'Roots', 0, 9, 1, 'i', { part: 'Roots' }),
  K('roots.reach', 'Root reach (× trunk radius)', 1, 5, 0.05, 'n', { part: 'Roots' }),
  K('roots.thickness', 'Root thickness (× trunk radius)', 0.1, 0.9, 0.01, 'n', { part: 'Roots' }),
  K('roots.rise', 'Root climbs the trunk (× trunk radius)', 0.1, 2, 0.05, 'n', { part: 'Roots' }),
  K('branches.count', 'Branches', 0, 9, 1, 'i', { part: 'Branches' }),
  K('branches.from', 'Branches leave the trunk from', 0.3, 0.98, 0.01, 'n', { part: 'Branches' }),
  K('branches.to', '… up to', 0.3, 0.99, 0.01, 'n', { part: 'Branches' }),
  K('branches.rise', 'Branch arch', -0.5, 1.2, 0.01, 'n', { part: 'Branches' }),
  K('branches.thickness', 'Branch thickness (× trunk)', 0.2, 1, 0.01, 'n', { part: 'Branches' }),
  K('branches.tip', 'Branch tip thickness (× trunk)', 0.05, 0.8, 0.01, 'n', { part: 'Branches' }),
  K('crown.radius', 'Crown radius', 0.4, 20, 0.05, 'n', { part: 'Crown' }),
  K('crown.clumps', 'Leaf clumps', 1, 12, 1, 'i', { part: 'Crown' }),
  K('crown.clumpSize', 'Clump size', 0.5, 1.6, 0.01, 'n', { part: 'Crown' }),
  K('crown.squash', 'Crown height / width', 0.3, 2.2, 0.01, 'n', { part: 'Crown' }),
  K('crown.tiers', 'Needle tiers', 2, 9, 1, 'i', { part: 'Crown' }),
  K('crown.strands', 'Hanging strands', 4, 40, 1, 'i', { part: 'Crown' }),
  K('crown.strandLength', 'Strand length', 0.2, 1.4, 0.01, 'n', { part: 'Crown' }),
  K('crown.fronds', 'Fronds', 3, 16, 1, 'i', { part: 'Crown' }),
  K('crown.frondLength', 'Frond length', 0.5, 6, 0.05, 'n', { part: 'Crown' }),
  K('leaves.picture', 'Leaf tufts', 0, 0, 0, 's', { part: 'Leaves', of: ['broadleaf', 'needle'] }),
  K('leaves.tint', 'Leaf colour', 0, 3, 0.01, 'c', { part: 'Leaves' }),
  K('leaves.tuftSize', 'Leaf tuft size (big leaves)', 0.6, 1.8, 0.01, 'n', { part: 'Leaves' }),
  K('leaves.tuftCount', 'Leaf tufts per clump', 0.4, 2, 0.01, 'n', { part: 'Leaves' }),
  K('bark.tint', 'Bark colour', 0, 9, 0.01, 'c', { part: 'Bark' }),
  K('bark.bands', 'Birch bands', 0, 1, 1, 'b', { part: 'Bark' }),
  K('wind.stiffness', 'Stiffness (heavy … whippy)', 0, 1, 0.01, 'n', { part: 'Wind' }),
  K('wind.sway', 'Sway speed (per second)', 0.1, 2, 0.01, 'n', { part: 'Wind' }),
  K('wind.flutter', 'Leaf flutter', 0, 2, 0.01, 'n', { part: 'Wind' }),
]);
export const knobOf = path => KNOBS.find(k => k.path === path) || null;
/** The knobs that mean something for this species (a pine has no hanging strands). */
export function knobsFor(sp) {
  return KNOBS.filter(k => {
    const [part, key] = k.path.split('.');
    if (!sp[part]) return false;
    if (part === 'crown' || part === 'branches' || part === 'trunk') return sp[part][key] !== undefined;
    if (part === 'leaves' && (sp.form === 'palm' || sp.form === 'fern') && key !== 'tint') return false;   // fronds: their own picture, no tufts
    return true;
  });
}

const roundTo = (v, step) => (step ? Math.round(v / step) * step : v);
const tidy = v => Math.round(v * 1e6) / 1e6;
export function getKnob(sp, path) {
  const [part, key] = path.split('.');
  return sp?.[part]?.[key];
}
/** Change one knob (clamped to its range, rounded to its step). Returns the stored value. Throws on an unknown knob. */
export function setKnob(sp, path, value) {
  const k = knobOf(path);
  if (!k) throw new Error(`treekit: no knob "${path}" (tree-edit.mjs knobs lists them)`);
  const [part, key] = path.split('.');
  if (!sp[part]) sp[part] = {};
  let v;
  if (k.kind === 'b') v = value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
  else if (k.kind === 's') { if (!k.of.includes(value)) throw new Error(`treekit: ${path} is one of ${k.of.join(', ')}`); v = value; }
  else if (k.kind === 'c') {
    const arr = Array.isArray(value) ? value : String(value).split(/[ ,]+/).filter(Boolean).map(Number);
    if (arr.length !== 3 || arr.some(x => !Number.isFinite(x))) throw new Error(`treekit: ${path} takes three numbers (red green blue multipliers)`);
    v = arr.map(x => tidy(Math.min(k.max, Math.max(k.min, roundTo(x, k.step)))));
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`treekit: ${path} takes a number`);
    v = tidy(Math.min(k.max, Math.max(k.min, roundTo(n, k.step))));
    if (k.kind === 'i') v = Math.round(v);
  }
  sp[part][key] = v;
  forget(sp);
  return v;
}

// ---------------------------------------------------------------- parts → the builder's flat row
const ROWS = new WeakMap();
export const forget = sp => ROWS.delete(sp);
const PIC_ROW = { broadleaf: 0, needle: 1, small: 2, frond: 3 };
/** The flat row js/build.js reads (the names the storybook builder always used). Age reshapes, at 1 it changes nothing. */
export function rowOf(sp) {
  if (ROWS.has(sp)) return ROWS.get(sp);
  const t = sp.trunk || {}, c = sp.crown || {}, b = sp.branches || {}, l = sp.leaves || {}, w = sp.wind || {};
  const age = sp.size?.age ?? 1;
  // a young tree is slender with a small crown; an old one stocky with a wide one (the game still scales it to its height)
  const kR = age === 1 ? 1 : Math.pow(age, 0.9), kC = age === 1 ? 1 : 0.55 + 0.45 * age;
  const row = {
    form: sp.form, h: sp.size?.height ?? 10,
    rB: t.radius * kR, rT: t.topRadius * kR, flare: t.flare ?? 0.5, twist: t.twist ?? 0, ridge: t.flutes ?? 0,
    lean: t.lean, bend: t.bend,
    bark: sp.bark?.tint || [1, 1, 1], bands: !!sp.bark?.bands,
    roots: sp.roots || null,
    branchFrom: b.from ?? 0.82, branchTo: b.to ?? 0.95, branchRise: b.rise ?? 0.25, branchR0: b.thickness ?? 0.62, branchR1: b.tip ?? 0.28,
    clumpK: c.clumpSize ?? 1,
    tuftSize: l.tuftSize ?? 1, tuftCount: l.tuftCount ?? 1,
    stiffness: w.stiffness ?? 0.5, sway: w.sway ?? 0.6, flutter: w.flutter ?? 1,
  };
  if (t.crownStart != null) row.trunkH = t.crownStart;
  if (b.count != null) row.limbs = b.count;
  if (b.tall) row.tall = true;
  if (c.radius != null) row.crownR = c.radius * kC;
  if (c.clumps != null) row.clumps = c.clumps;
  if (c.squash != null) row.squash = c.squash;
  if (c.tiers != null) row.tiers = c.tiers;
  if (c.strands != null) { row.strands = c.strands; row.strandK = c.strandLength ?? 1; }
  if (c.fronds != null) { row.fronds = c.fronds; row.frondLen = c.frondLength * kC; }
  if (l.picture) { row.leafRow = PIC_ROW[l.picture] ?? 0; row.leaf = l.tint || [1, 1, 1]; }
  if (l.accent) row.accent = l.accent;
  ROWS.set(sp, row);
  return row;
}

// ---------------------------------------------------------------- a game's tree kinds
/**
 * A game's tree kinds with the sizes its server uses: `h` metres tall as drawn (scatter's height at scale 1), `trunk`
 * the drawn trunk's radius at 1 m above the ground, `crown` the drawn canopy's radius — both MEASURED from the built
 * tree by tools/measure.mjs (tests/measure.test.mjs rebuilds and compares).
 */
export function gameKinds(game = 'oathwild') {
  const G = DATA[game];
  if (!G) throw new Error(`treekit: no "${game}" block in species.json`);
  const map = rows => Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, Object.freeze({ story: r.tree, h: r.height, ...(r.trunk != null ? { trunk: r.trunk } : {}), ...(r.crown != null ? { crown: r.crown } : {}), ...(r.giant ? { giant: true } : {}), ...(r.shadow != null ? { shadow: r.shadow } : {}) })]));
  return { trees: Object.freeze(map(G.trees)), understory: Object.freeze(map(G.understory || {})) };
}

// ---------------------------------------------------------------- the file's text
/** One line per part (and per game kind), so saving a single knob shows as a one-line change. */
export function formatSpecies(data) {
  const inline = v => JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']');
  const deep = v => v && typeof v === 'object' && Object.values(v).some(x => x && typeof x === 'object' && !Array.isArray(x));
  const out = (v, depth, pad) => {
    if (depth >= 3 || !deep(v)) return inline(v);
    const arr = Array.isArray(v), ents = arr ? v.map(x => [null, x]) : Object.entries(v);
    const body = ents.map(([k, x]) => pad + '  ' + (arr ? '' : JSON.stringify(k) + ': ') + out(x, depth + 1, pad + '  ')).join(',\n');
    return (arr ? '[' : '{') + '\n' + body + '\n' + pad + (arr ? ']' : '}');
  };
  return out(data, 0, '') + '\n';
}
