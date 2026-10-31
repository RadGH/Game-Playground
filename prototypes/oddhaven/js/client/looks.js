// From a person in the sim to a Chibi 2.5 avatar. A person's look is an id; the avatar is worked out from it, so 300 people
// cost nothing until somebody needs drawing, and the same id gives the same face on every device. Colours come from short
// palettes because the template key is the whole look (recon §2.1): repeats mean cache hits.
//
//   const looks = createLooks({ presets, premades });
//   looks.avatar(person)   // full avatar JSON, cached
//   looks.colours(person)  // { shirt, legs, skin, hair, scale } for a stand-in
import { randomChibi2 } from '../../../../avatar-3d/js/chibi2-races.js';
import { randomAvatar, makeRng } from '../../../../avatar-2d/js/random.js';
import { partIds } from '../../../../avatar-2d/js/parts/index.js';
import { tidyFace } from '../../../tumblefair/js/client/look-tidy.js';
import { UNIFORMS, setFor, dress } from './outfits.js';
import { designAvatar, designFromAvatar } from './design.js';

export const SHIRTS = ['#c2493d', '#3f78b5', '#e0b93c', '#4e9a6a', '#8d5aa8', '#e8e2d4', '#2f3d55', '#d97e36', '#5db7bd', '#b5476f'];
export const LEGS = ['#2d3a55', '#3a3a40', '#6a5a44', '#50606e', '#7a7468', '#23232a'];
const EYES = ['#3b2a1a', '#5b7fa6', '#4e7a52', '#6b4a2a', '#23232a'];
const SHOES = ['#3a3430', '#23232a', '#6a4a3c', '#e8e2d4'];
const EVERYDAY = {
  f: { top: ['tshirt', 'blouse', 'polo', 'cardigan', 'hoodie', 'tank', 'sweater', 'button_shirt', 'blazer'], bottom: ['jeans', 'long_skirt', 'pencil_skirt', 'leggings', 'joggers', 'pants'], shoes: ['sneakers', 'shoes', 'ankle_boots', 'sandals'], hair: ['long', 'bob', 'ponytail', 'wavy', 'curly', 'bun', 'braids', 'pixie', 'bangs'] },
  m: { top: ['tshirt', 'polo', 'button_shirt', 'hoodie', 'sweater', 'blazer', 'overalls', 'vest', 'tank'], bottom: ['jeans', 'pants', 'cargo_pants', 'joggers', 'shorts'], shoes: ['sneakers', 'work_boots', 'dress_shoes', 'boots'], hair: ['short', 'side_part', 'buzz', 'curly', 'slicked', 'messy', 'spiky', 'bald'] },
};
const STANDIN_SCALE = { giant: 1.4, orc: 1.12, human: 1, elf: 1.05, undead: 1, beast: 1.05, dwarf: 0.84, halfling: 0.78, goblin: 0.76 };

export { UNIFORMS } from './outfits.js';
export function wearUniform(a, job) { const u = UNIFORMS[job]; if (u) for (const [slot, row] of Object.entries(u)) a[slot] = { ...row }; return a; }

export const hashText = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const known = (slot, id) => partIds(slot).includes(id);

/** One avatar, from the look id. `row` = the premade's hand-written look, if any. */
export function buildAvatar({ race, gender, look, presets, row = null }) {
  const seed = hashText(look) % 2000000, rng = makeRng(seed ^ 0x51ed);
  const raw = randomChibi2(randomAvatar, presets, { race, seed, makeRng, known });
  const a = tidyFace(raw, seed);
  if (race === 'beast' && raw.ears) a.ears = raw.ears;                 // tidyFace only knows the ear list of the playable peoples
  const g = EVERYDAY[gender] || EVERYDAY.m, pick = (l, k) => l[Math.floor(rng() * l.length) % l.length] ?? k;
  for (const slot of ['held', 'offhand', 'hat', 'cape', 'decor']) a[slot] = { id: 'none' };
  a.top = { id: pick(g.top), color: pick(SHIRTS) }; a.bottom = { id: pick(g.bottom), color: pick(LEGS) }; a.shoes = { id: pick(g.shoes), color: pick(SHOES) };
  if (a.hair) a.hair = { ...a.hair, id: pick(g.hair) };
  if (gender === 'f') a.facialHair = { ...(a.facialHair || {}), id: 'none' };
  if (a.eyes && ['human', 'halfling', 'dwarf', 'elf'].includes(race)) a.eyes = { ...a.eyes, color: pick(EYES) };
  if (row) {
    if (row.hair) a.hair = { ...a.hair, id: row.hair };
    if (row.hairColor) a.hair = { ...a.hair, color: row.hairColor };
    if (row.skin) a.body = { ...a.body, skin: row.skin };
    for (const slot of ['top', 'bottom', 'shoes']) if (row[slot]) a[slot] = { id: row[slot], color: row[slot + 'Color'] || a[slot].color };
    a.facialHair = { ...(a.facialHair || {}), id: row.facialHair || 'none' };
    a.accessory = { ...(a.accessory || {}), id: row.accessory || 'none' };
    if (!row.accessory) a.accessory.id = 'none';
  }
  if (!a.body) a.body = {};
  a.body.v = 2.5;
  return a;
}

/** A whole person from one seed: the same rules a townsperson gets, so Random never makes a face the town would not. */
export function randomDesign(seed, { presets, people }) {
  const rng = makeRng(seed ^ 0x2f6e2b1), one = l => l[Math.floor(rng() * l.length) % l.length], total = people.races.reduce((n, r) => n + r.weight, 0);
  let roll = rng() * total, race = people.races[0].id;
  for (const r of people.races) { roll -= r.weight; if (roll <= 0) { race = r.id; break; } }
  const gender = rng() < 0.5 ? 'f' : 'm', look = `${race}-${gender}-r${seed}`, a = buildAvatar({ race, gender, look, presets });
  const traits = []; while (traits.length < people.traitsPerPerson) { const t = one(people.traits).id; if (!traits.includes(t)) traits.push(t); }
  const r01 = (m = 0.3) => +(0.5 + (rng() - 0.5) * m * 2).toFixed(2);
  return designFromAvatar(a, { race, gender, look, age: 20 + Math.floor(rng() * 45), name: `${one(people.given[gender])} ${one(people.family)}`, traits, quirks: [one(people.quirks).id], voice: { engine: 'formant', pitch: r01(), warmth: r01(), rough: +(rng() * 0.4).toFixed(2), speed: r01(0.2) } });
}

export function createLooks({ presets, premades }) {
  const byHousehold = new Map((premades?.households || []).map(h => [h.id, h]));
  const avatars = new Map(), colours = new Map();
  const keyOf = (p, wear) => `${p.look}|${wear}|${wear === 'work' ? p.job ?? '' : ''}`;
  const self = {
    rowOf(look) { const m = /premade-(.+)-(\d+)$/.exec(look); return m ? byHousehold.get(m[1])?.members[Number(m[2])]?.look ?? null : null; },
    /** Their avatar in what they have on: `wear` is the sim's word. Everyday clothes are the seed's, or the premade's written ones. */
    avatarFor(p, wear = 'casual') {
      const key = keyOf(p, wear);
      let a = avatars.get(key);
      if (!a) {
        if (p.design) a = designAvatar(p.design, wear, p.job);
        else {
          a = buildAvatar({ race: p.race, gender: p.gender, look: p.look, presets, row: self.rowOf(p.look) });
          if (wear === 'work') wearUniform(a, p.job); else if (wear !== 'casual') dress(a, setFor(hashText(p.look) % 2000000, p.gender, wear));
        }
        avatars.set(key, a);
      }
      return a;
    },
    colours(p, wear = 'casual') {
      const key = keyOf(p, wear);
      let c = colours.get(key);
      if (!c) { const a = self.avatarFor(p, wear); c = { shirt: a.top.color, legs: a.bottom.color, skin: a.body.skin || '#e0ac69', hair: a.hair?.id === 'bald' ? (a.body.skin || '#e0ac69') : a.hair?.color || '#3b2a1a', scale: STANDIN_SCALE[p.race] ?? 1 }; colours.set(key, c); }
      return c;
    },
    /** The avatar for a gallery row, before there is any sim. */
    premadeAvatar(h, m) { const r = h.members[m]; return buildAvatar({ race: r.race, gender: r.gender, look: `${r.race}-premade-${h.id}-${m}`, presets, row: r.look }); },
    /** What the creator starts from when you change someone who already lives here. */
    designOf(p) { return p.design ? JSON.parse(JSON.stringify(p.design)) : designFromAvatar(self.avatarFor(p), { ...p, voice: p.voice }); },
  };
  return self;
}
