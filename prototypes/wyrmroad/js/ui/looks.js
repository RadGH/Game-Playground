// The hero creator's choices (Chibi 2.6 look fields — avatar-3d/CHIBI26.md M7: body.form 'masc' | 'fem'; face slots from
// avatar-3d/js/chibi25-options.js) with our own names, plus random names, random looks
// and the solo companion. A hero's look is merged over its class look and its gear is drawn on top (sim/items.js
// dressedLook), so the class's build is kept in body. Chibi 2.6 reads the skin colour from body.skin (avatar-3d
// chibi2-face.js); skin.color is kept beside it for the game's own data shape. The form alone decides the chest (owner
// 2026-11-21: masculine flat, feminine round — js/render/actors.js bodyShape); an old save's body.chestSize is ignored.
import { starterGear, rollItem } from '../sim/items.js';
import { rng } from '../sim/rng.js';

export const LOOK = {
  skin: [['#f6d7bd', 'Fair'], ['#f0c9a8', 'Light'], ['#e7b48f', 'Warm'], ['#d59c74', 'Tan'], ['#c98e66', 'Olive'], ['#a9714c', 'Bronze'], ['#8d5a3c', 'Brown'], ['#5e3b28', 'Deep']],
  hair: [['short', 'Short'], ['side_part', 'Side part'], ['bangs', 'Fringe'], ['bob', 'Bob'], ['long', 'Long'], ['wavy', 'Wavy'], ['ponytail', 'Ponytail'],
    ['bun', 'Bun'], ['braids', 'Braids'], ['spiky', 'Spiky'], ['curly', 'Curly'], ['afro', 'Big curls'], ['mohawk', 'Crest'], ['undercut', 'Undercut'],
    ['topknot', 'Top knot'], ['high_ponytail', 'High ponytail'], ['twin_tails', 'Twin tails'], ['messy', 'Messy'], ['locs', 'Locs'],
    ['long_braid', 'Long braid'], ['wolf_cut', 'Wolf cut'], ['curly_bob', 'Curly bob'], ['warrior_braids', 'Warrior braids'], ['buzz', 'Cropped'], ['bald', 'Shaved']],
  // natural colours first (the default and random hair come from these), a few dyed ones after
  hairColor: [['#1d1a22', 'Black'], ['#3b2618', 'Dark brown'], ['#5a3a22', 'Brown'], ['#7a2e1a', 'Auburn'], ['#b0431e', 'Copper red'],
    ['#e6c25a', 'Golden blonde'], ['#f1e6c8', 'Platinum'], ['#9a9aa2', 'Grey'], ['#4a6a8a', 'Dusk blue'], ['#6a4a7a', 'Plum'], ['#3f6a4a', 'Moss']],
  eyes: [['round', 'Round'], ['almond', 'Almond'], ['storybook', 'Storybook'], ['narrow', 'Narrow'], ['sleepy', 'Sleepy'], ['doe', 'Wide'], ['sharp', 'Sharp'], ['hooded', 'Hooded'], ['cat', 'Upswept']],
  eyeColor: [['#5a3a22', 'Brown'], ['#3a6a9a', 'Blue'], ['#4a7a4a', 'Green'], ['#8a6a3a', 'Hazel'], ['#6a6a7a', 'Grey'], ['#9a5a2a', 'Amber']],
  brows: [['straight', 'Straight'], ['arched', 'Arched'], ['thick', 'Thick'], ['thin', 'Thin'], ['soft', 'Soft'], ['bushy', 'Bushy'], ['slanted', 'Slanted'], ['curved', 'High curve']],
  extras: [['none', 'None'], ['freckles', 'Freckles'], ['freckles_nose', 'Freckles over the nose'], ['blush_soft', 'Soft blush'], ['scar', 'Scar'],
    ['scar_brow', 'Scar through the brow'], ['beauty_mark', 'Beauty mark'], ['warpaint', 'War paint'], ['star_mark', 'Star mark']],
  facialHair: [['none', 'None'], ['stubble', 'Stubble'], ['short_beard', 'Short beard'], ['full', 'Full beard'], ['goatee', 'Goatee'], ['mustache', 'Moustache'], ['mutton_chops', 'Mutton chops']],
  form: [['masc', 'Masculine'], ['fem', 'Feminine']],
};

export const NAMES = ['Ash', 'Bryn', 'Corra', 'Dain', 'Edda', 'Fenn', 'Garrow', 'Hale', 'Ilse', 'Jory', 'Linnet', 'Marek', 'Nell', 'Orrin', 'Pell',
  'Quill', 'Rowan', 'Sabe', 'Teagan', 'Ulla', 'Vey', 'Wren', 'Yarrow', 'Zeb', 'Brannock', 'Cass', 'Doran', 'Elsabet', 'Hollis', 'Merrit', 'Odile', 'Perrin'];

export const pickOf = (rand, list) => list[Math.floor(rand() * list.length)];
const NATURAL_HAIR = 7;     // the first seven hair colours are natural ones

/** How far apart two colours look: luminance contrast ratio (1 = the same, 21 = black on white). */
export function contrast(a, b) {
  const lum = hex => { const n = parseInt(String(hex).replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const HAIR_CONTRAST = 1.9;
/** Natural hair colours that stand apart from this skin (hair never reads as a skin-coloured mask). */
export const hairFor = skin => LOOK.hairColor.slice(0, NATURAL_HAIR).filter(([c]) => contrast(c, skin) >= HAIR_CONTRAST);

export function randomName(rand = Math.random, not = []) {
  for (let i = 0; i < 20; i++) { const n = pickOf(rand, NAMES); if (!not.includes(n)) return n; }
  return pickOf(rand, NAMES);
}

/** A look the creator edits: every field the creator offers, built on the class's build. */
export function randomLook(CLASSES, cls, rand = Math.random) {
  const C = CLASSES.classes[cls];
  const form = rand() < 0.5 ? 'masc' : 'fem';
  const p = list => pickOf(rand, list)[0];
  const skin = p(LOOK.skin);
  return {
    body: { ...(C.look.body || {}), form, skin },
    skin: { color: skin },
    hair: { id: p(LOOK.hair.filter(h => form === 'fem' || !['twin_tails', 'long_braid'].includes(h[0]))), color: p(hairFor(skin)) },
    eyes: { id: p(LOOK.eyes), color: p(LOOK.eyeColor) },
    brows: { id: p(LOOK.brows) },
    extras: { id: rand() < 0.55 ? 'none' : p(LOOK.extras) },
    facialHair: { id: form === 'masc' && rand() < 0.4 ? p(LOOK.facialHair.slice(1)) : 'none' },
  };
}

/** The class look as a starting point for the creator (keeps the class's hair and skin). */
export function classLook(CLASSES, cls) {
  const C = CLASSES.classes[cls], skin = C.look.skin?.color || LOOK.skin[2][0], want = C.look.hair?.color;
  return {
    body: { ...(C.look.body || {}), form: 'masc', skin }, skin: { color: skin },
    hair: { id: C.look.hair?.id || 'short', color: want && contrast(want, skin) >= HAIR_CONTRAST ? want : hairFor(skin)[0][0] }, eyes: { id: 'round', color: LOOK.eyeColor[0][0] },
    brows: { id: 'straight' }, extras: { id: 'none' }, facialHair: { id: 'none' },
  };
}

/** The solo partner (PLAN §0): a bot hero of another class at your level, in this chapter's plain gear. */
export function companionFor(data, lead, chIndex, seed = 7) {
  const rand = rng(seed * 7919 + chIndex * 31 + 1);
  const order = ['warden', 'arcanist', 'vanguard', 'duelist'];
  const cls = order.find(c => c !== lead.cls) || 'warden';
  const gear = starterGear(data.items, cls);
  for (const slot of ['head', 'chest', 'legs', 'feet']) {
    const it = rollItem(data.items, { chapter: data.chapters.chapters[chIndex]?.tier ?? chIndex, cls, rand, slot, upTo: true });
    if (it) gear[slot] = { ...it, rarity: 'common', bonus: [] };
  }
  const C = data.classes.classes[cls], unlocked = C.spells.filter(s => data.classes.spells[s].level <= lead.level);
  return {
    id: 'companion', name: randomName(rand, [lead.name]), cls, look: randomLook(data.classes, cls, rand), level: lead.level,
    xp: data.classes.levels[lead.level - 1] || 0, gold: 0, gear, bag: [], spells: unlocked.length >= 2 ? unlocked.slice(-2) : C.spells.slice(0, 2),
    story: { reached: 5, done: [], ending: null }, playTime: 0, best: {}, bot: true,
  };
}
