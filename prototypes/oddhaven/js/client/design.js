// A person as the creator makes them (M7, pure: no three, no DOM, so node tests read it). A design is plain data the sim keeps and
// never reads. `TABS` lists every row of the creator; each row has a `path` into the design, so one test can walk every option there is.
//
//   designAvatar(design, wear, job)     the avatar JSON for what they have on
//   designFromAvatar(a, person)         the design for someone who has none yet
//   randomDesign(seed, lists)           a whole person
import { CHIBI25_OPTIONS } from '../../../../avatar-3d/js/chibi25-options.js';
import { CHIBI2_RACES } from '../../../../avatar-3d/js/chibi2-races.js';
import { FACE_SLOTS, BODY_PICKS, PALETTES, slotIds } from '../../../thousandvale/js/client/ui/appearance-core.js';
import { WEAR_KINDS, WEAR_NAMES, WEAR_SLOTS, UNIFORMS, CLOTH, setFor, dress } from './outfits.js';
import { RACE_NAMES } from './mood.js';

const C25 = CHIBI25_OPTIONS, BODY = C25.body, PIECES = BODY.outfit;
const titled = id => String(id).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const faceSlot = id => FACE_SLOTS.find(s => s.slot === id);
const named = (ids, names = {}) => ids.map(v => ({ v, name: names[v] ?? titled(v) }));
const pickOf = (slot, race) => { const s = faceSlot(slot); return named(slotIds(s, race), C25.face[slot]?.names); };
const colours = list => list.map(v => ({ v, name: '' }));
export const clothName = (slot, id) => PIECES[slot]?.names?.[id] ?? titled(id);
const skins = race => colours([...new Set([...(CHIBI2_RACES[race]?.skin ?? []), ...PALETTES.skin])]);
const TAILS = BODY.tail, SHAPES = BODY_PICKS.find(p => p.key === 'shape'), POSTURES = BODY_PICKS.find(p => p.key === 'posture');
export const RACES = Object.keys(CHIBI2_RACES);
const MARKS = ['none', 'freckles', 'freckles_nose', 'freckles_heavy', 'blush', 'blush_soft', 'beauty_mark', 'scar', 'scar_cheek', 'scar_brow', 'scar_lip', 'wrinkles', 'cheek_stripes', 'star_mark', 'moon_mark', 'tear_mark', 'chin_lines'];
const WORN = ['none', 'glasses', 'round_glasses', 'sunglasses', 'monocle', 'earrings', 'nose_ring', 'pendant', 'scarf', 'scarf_cowl', 'scarf_striped', 'neckerchief'];

const pick = (path, label, options) => ({ path, label, type: 'pick', options });
const shade = (path, label, list = () => colours(CLOTH), extra = {}) => ({ path, label, type: 'color', options: list, ...extra });
const dial = (path, label, min = 0, max = 1, step = 0.05) => ({ path, label, type: 'range', min, max, step });
const clothes = (slot, label) => pick(`wardrobe.$wear.${slot}.id`, label, ctx => named(WEAR_SLOTS[ctx.wear][slot], PIECES[slot]?.names));
const clothColour = (slot, label) => shade(`wardrobe.$wear.${slot}.color`, label);

/** Eleven tabs, six rows at most, so nothing on a phone ever scrolls over the picture. */
export const TABS = [
  { id: 'who', label: 'Who', view: 'body', rows: [
    { path: 'name', label: 'Name', type: 'name' }, pick('race', 'Race', () => RACES.map(v => ({ v, name: RACE_NAMES[v] }))), pick('gender', 'Person', () => [{ v: 'f', name: 'Woman' }, { v: 'm', name: 'Man' }]), dial('age', 'Age', 18, 90, 1),
  ] },
  { id: 'body', label: 'Body', view: 'body', rows: [
    shade('body.skin', 'Skin', ctx => skins(ctx.design.race)), pick('body.shape', 'Body type', () => named(SHAPES.ids, SHAPES.names)), dial('body.height', 'Height'), dial('body.width', 'Width'), dial('body.round', 'Roundness', 0, 0.85), dial('body.headSize', 'Head size', 0.2, 1),
  ] },
  { id: 'build', label: 'Build', view: 'body', rows: [
    dial('body.shoulders', 'Shoulders'), dial('body.legs', 'Legs'), dial('body.arms', 'Arms'), pick('body.posture', 'Posture', () => named(POSTURES.ids, POSTURES.names)), pick('body.tail', 'Tail', () => named(TAILS.ids, TAILS.names)), pick('body.cheeks', 'Cheeks', () => [{ v: false, name: 'Plain' }, { v: true, name: 'Rosy' }]),
  ] },
  { id: 'face', label: 'Face', view: 'head', rows: [
    pick('face.headShape', 'Head', () => named(faceSlot('headShape').ids)), pick('face.nose.id', 'Nose', ctx => pickOf('nose', ctx.design.race)), pick('face.mouth.id', 'Mouth', ctx => pickOf('mouth', ctx.design.race)), pick('face.ears.id', 'Ears', ctx => pickOf('ears', ctx.design.race)), dial('face.ears.scale', 'Ear size', C25.fields.ears.scale.min, C25.fields.ears.scale.max), pick('face.extras.id', 'Marks', () => named(MARKS, C25.face.extras.names)),
  ] },
  { id: 'eyes', label: 'Eyes', view: 'head', rows: [
    pick('face.eyes.id', 'Eyes', ctx => pickOf('eyes', ctx.design.race)), shade('face.eyes.color', 'Eye colour', () => colours(PALETTES.eye)), pick('face.eyes.pupil', 'Pupils', () => named(C25.fields.eyes.pupil.ids, C25.fields.eyes.pupil.names)), pick('face.eyes.iris', 'Iris', () => named(C25.fields.eyes.iris.ids, C25.fields.eyes.iris.names)), pick('face.brows.id', 'Brows', ctx => pickOf('brows', ctx.design.race)), dial('face.brows.thick', 'Brow size', C25.fields.brows.thick.min, C25.fields.brows.thick.max),
  ] },
  { id: 'hair', label: 'Hair', view: 'head', rows: [
    pick('face.hair.id', 'Hair', ctx => pickOf('hair', ctx.design.race)), shade('face.hair.color', 'Colour', () => colours(PALETTES.hair)), shade('face.hair.color2', 'Streaks', () => colours(PALETTES.hair)), pick('face.facialHair.id', 'Beard', ctx => pickOf('facialHair', ctx.design.race)), pick('face.accessory.id', 'Wearing', () => named(WORN, C25.body.outfit.accessory?.names)), shade('face.accessory.color', 'Its colour'),
  ] },
  { id: 'clothes', label: 'Clothes', view: 'body', rows: [
    { path: '$wear', label: 'Outfit', type: 'wear', options: () => WEAR_KINDS.map(v => ({ v, name: WEAR_NAMES[v] })) }, clothes('top', 'Top'), clothColour('top', 'Top colour'), shade('wardrobe.$wear.top.color2', 'Trim'), clothes('bottom', 'Bottom'), clothColour('bottom', 'Bottom colour'),
  ] },
  { id: 'extras', label: 'Shoes', view: 'body', rows: [
    { path: '$wear', label: 'Outfit', type: 'wear', options: () => WEAR_KINDS.map(v => ({ v, name: WEAR_NAMES[v] })) }, clothes('shoes', 'Shoes'), clothColour('shoes', 'Shoe colour'), clothes('hat', 'Hat'), clothColour('hat', 'Hat colour'),
  ] },
  { id: 'self', label: 'Self', view: 'body', rows: [
    pick('traits.0', 'Nature', ctx => named(ctx.lists.traits)), pick('traits.1', 'And also', ctx => named(ctx.lists.traits)), pick('quirk', 'Quirk', ctx => ctx.lists.quirks.map(q => ({ v: q.id, name: q.label }))),
  ] },
  { id: 'voice', label: 'Voice', view: 'head', rows: [
    pick('voice.engine', 'Speech', () => [{ v: 'formant', name: 'Clear words' }, { v: 'babble', name: 'Mumble' }]), dial('voice.pitch', 'Pitch'), dial('voice.warmth', 'Warmth'), dial('voice.rough', 'Rough'), dial('voice.speed', 'Speed'), { path: '$sample', label: 'Hear it', type: 'action', text: 'Play a sample' },
  ] },
  { id: 'home', label: 'Home', view: 'body', rows: [
    pick('$household', 'Lives with', ctx => ctx.households), pick('$job', 'Job', ctx => ctx.jobs),
  ] },
];
export const ROWS = TABS.flatMap(t => t.rows.map(r => ({ ...r, tab: t.id })));

// ---- the path a row points at
const real = (path, ctx) => path.replace('$wear', ctx.wear);
export function getPath(design, path, ctx) {
  let v = design;
  for (const k of real(path, ctx).split('.')) v = v?.[k];
  return v;
}
export function setPath(design, path, value, ctx) {
  const keys = real(path, ctx).split('.'); let o = design;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

/** Rows that mean nothing right now are not drawn: no second colour on a plain cut, no beard row needed for bald chins. */
export function rowShown(row, ctx) {
  if (row.path === 'wardrobe.$wear.top.color2') return ['tie', 'zip', 'stripes', 'print', 'sequins', 'hivis', 'panels', 'open'].includes(PIECE_FRONT(getPath(ctx.design, 'wardrobe.$wear.top.id', ctx)));
  if (row.path === 'wardrobe.$wear.hat.color') return getPath(ctx.design, 'wardrobe.$wear.hat.id', ctx) !== 'none';
  if (row.path === 'face.accessory.color') return getPath(ctx.design, 'face.accessory.id', ctx) !== 'none';
  if (row.path === 'face.hair.color2') return ['twin_tails', 'locs', 'long_braid'].includes(ctx.design.face.hair.id);
  if (row.path === '$household') return !ctx.editing;
  if (row.path === '$job') return !ctx.editing;
  return true;
}
const FRONTS = { henley: 'buttons', print_tee: 'print', dress_shirt: 'tie', police_shirt: 'tie', bomber_jacket: 'zip', track_jacket: 'zip', swim_vest: 'zip', parka: 'zip', sport_tee: 'stripes', sports_vest: 'stripes', swim_costume: 'stripes', sequin_top: 'sequins', party_dress: 'sequins', denim_jacket: 'open', suit_jacket: 'open', velvet_jacket: 'open', blazer: 'open', waistcoat: 'panels', vest: 'panels' };
const PIECE_FRONT = id => FRONTS[id] ?? 'none';

// ---- from a design to a body
export function designAvatar(d, wear = 'casual', job = null) {
  const f = d.face, a = {
    body: { ...d.body, race: d.race, v: 2.5 }, headShape: f.headShape, hair: { ...f.hair }, eyes: { ...f.eyes }, brows: { ...f.brows }, nose: { ...f.nose }, mouth: { ...f.mouth }, ears: { ...f.ears }, facialHair: { ...f.facialHair }, extras: { ...f.extras }, accessory: { ...f.accessory },
    held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' },
  };
  if (a.hair.color2 == null) delete a.hair.color2;
  const key = wear === 'work' ? null : d.wardrobe[wear] ? wear : 'casual';
  dress(a, wear === 'work' ? UNIFORMS[job] ?? d.wardrobe.casual : d.wardrobe[key]);
  return a;
}

/** Two avatars with the same key have the same face and clothes. */
export const faceKey = avatar => { const text = JSON.stringify(avatar); let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const seedOf = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const FACE_KEYS = ['hair', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'facialHair', 'extras', 'accessory'];
const DEFAULT_FIELDS = { eyes: { pupil: 'round', iris: 'normal', color: '#3b2a1a' }, brows: { thick: 1 }, ears: { scale: 1 }, hair: { color: '#3b2a1a' }, accessory: { color: '#2a2a3a' } };

/** Someone who was generated, or a premade: what the creator starts from. */
export function designFromAvatar(a, p) {
  const b = a.body ?? {}, seed = seedOf(p.look ?? String(p.id ?? 1)), wardrobe = {};
  const face = { headShape: typeof a.headShape === 'object' ? a.headShape?.id : a.headShape ?? 'round' };
  for (const k of FACE_KEYS) face[k] = { ...DEFAULT_FIELDS[k], ...(a[k] ?? {}) };
  for (const k of FACE_KEYS) { face[k].id ??= 'none'; }
  wardrobe.casual = { top: { ...a.top }, bottom: { ...a.bottom }, shoes: { ...a.shoes }, hat: { id: 'none', color: '#2f3d55', ...(a.hat ?? {}) } };
  for (const w of WEAR_KINDS) if (w !== 'casual') wardrobe[w] = setFor(seed, p.gender, w);
  for (const w of WEAR_KINDS) wardrobe[w].hat.color ??= '#2f3d55';
  const round = n => (Number.isFinite(n) ? n : 0.5);
  return { v: 1, race: p.race, gender: p.gender, age: p.age ?? 30, name: p.name ?? '', traits: [...(p.traits ?? [])], quirk: p.quirks?.[0] ?? null,
    body: { skin: b.skin ?? '#e0ac69', shape: b.shape ?? 'average', height: round(b.height), width: round(b.width), round: Number.isFinite(b.round) ? b.round : 0.2, headSize: round(b.headSize), shoulders: round(b.shoulders), legs: round(b.legs), arms: round(b.arms), posture: b.posture ?? 'neutral', tail: b.tail ?? 'none', cheeks: !!b.cheeks },
    face, wardrobe, voice: { engine: 'formant', pitch: 0.5, warmth: 0.5, rough: 0.1, speed: 0.5, ...(p.voice ?? {}) } };
}

/** The race changed: what suits the new one, without touching what the player chose on purpose elsewhere. */
export function fitRace(d, race) {
  const r = CHIBI2_RACES[race]; d.race = race;
  d.face.ears.id = C25.raceEars[race]?.[0] ?? 'normal';
  d.body.skin = r.skin[0]; d.face.hair.color = r.hairColor?.[0] ?? d.face.hair.color;
  d.body.tail = BODY.raceTails[race]?.[0] ?? 'none';
  d.body.round = r.ranges?.round?.[0] ?? d.body.round;
  return d;
}

/** The command the sim takes. */
export function makerOf(d, { household = null, job = null } = {}) {
  const [given, ...rest] = String(d.name).trim().split(/\s+/);
  return { given, family: rest.join(' '), gender: d.gender, race: d.race, age: d.age, traits: d.traits, quirk: d.quirk, voice: d.voice, design: d, household, job };
}
