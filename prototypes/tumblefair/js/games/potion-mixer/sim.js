// POTION MIXER (Halloween only) — a witchy kitchen race. A recipe card shows a few ingredients in order (an Eye of
// Newt that is really a googly eye, a Glow Mushroom, a Bat Wing…); tap them off the shelf into your cauldron in that
// order. Finish the recipe = one potion bottled, and the next recipe appears (they get longer). A wrong ingredient goes
// up in a puff of smoke: that potion starts again from the top and the smoke takes a second to clear.
// Everyone gets the same recipes in the same order and brews at their own speed. Most potions wins (ties share).
// Easy: 5 things on the shelf, short recipes. Normal: 6. Hard: 8, longer recipes, and the shelf shuffles after every
// potion. Alone it is a score attack with medals.
//
// Recipes and shelves go out in init(), so the phone adds an ingredient the moment you tap; it sends
// `add` { k: recipe, s: step, i: ingredient } and the server checks it again and keeps the count.
export const meta = {
  id: 'potion-mixer', title: 'Potion Mixer', blurb: 'Follow the recipe and brew the most potions!',
  how: ['Your recipe card shows what goes in, in order.', 'Tap each ingredient on the shelf to drop it in your cauldron.', 'Wrong one? Puff! That potion starts again.', 'Most potions bottled wins!'],
  kind: 'ui', min: 1, max: 4, seconds: 52, scoring: 'points', unit: 'potions', tags: ['action', 'puzzle', 'holiday'], season: 'halloween', card: 'card-potion-mixer', css: true,
};
export const READY_S = 3, PLAY_S = 45, END_S = 3, SMOKE_S = 1, RECIPES = 60;
/** Every ingredient: id (index), name, picture ('eye' is drawn by the view; the rest are Font Awesome duotone), colour. */
export const INGREDIENTS = [
  { name: 'Eye of Newt', icon: 'eye', color: '#7dd36b' }, { name: 'Glow Mushroom', icon: 'mushroom', color: '#38c6f4' },
  { name: 'Bat Wing', icon: 'bat', color: '#8a62d8' }, { name: 'Spider Silk', icon: 'spider-web', color: '#8f9bb0' },
  { name: 'Candy Corn', icon: 'candy-corn', color: '#ff8a1a' }, { name: 'Old Bone', icon: 'bone', color: '#c9b78f' },
  { name: 'Crow Feather', icon: 'feather', color: '#4a5266' }, { name: 'Moon Dust', icon: 'moon', color: '#f2c200' },
  { name: 'Pixie Sparkle', icon: 'sparkles', color: '#ff6fc8' }, { name: 'Frog Burp', icon: 'frog', color: '#3fae4a' },
  { name: 'Acorn Cap', icon: 'acorn', color: '#b06a2b' }, { name: 'Wiggle Worm', icon: 'worm', color: '#ff8fb0' },
  { name: 'Pumpkin Seed', icon: 'pumpkin', color: '#ff7a14' },
];
export const LEVEL = {
  easy: { shelf: 5, len: k => (k < 3 ? 3 : 4), shuffle: false, medals: [5, 8, 11] },
  normal: { shelf: 6, len: k => (k < 2 ? 3 : k < 4 ? 4 : 5), shuffle: false, medals: [4, 7, 10] },
  hard: { shelf: 8, len: k => (k < 2 ? 4 : k < 4 ? 5 : 6), shuffle: true, medals: [3, 6, 8] },
};
export const levelOf = d => LEVEL[d] ? d : 'normal';

/** -> { shelf: [ingredient ids], recipes: [[ids]], shelves: [[ids] per recipe: the order they sit on the shelf] } */
export function makeKitchen(rng, difficulty = 'normal', count = RECIPES) {
  const L = LEVEL[levelOf(difficulty)];
  const shelf = rng.shuffle(INGREDIENTS.map((_, i) => i)).slice(0, L.shelf);
  const recipes = [], shelves = [];
  for (let k = 0; k < count; k++) {
    const r = []; for (let s = 0; s < L.len(k); s++) { let i; do { i = rng.pick(shelf); } while (i === r[s - 1]); r.push(i); }
    recipes.push(r);
    shelves.push(L.shuffle && k > 0 ? rng.shuffle(shelf) : shelf.slice());
  }
  return { shelf, recipes, shelves };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, diff = levelOf(difficulty);
  const K = makeKitchen(rng, diff), events = [];
  const P = Object.fromEntries(pids.map(p => [p, { at: 0, prog: 0, lock: -1, potions: 0, smoke: 0 }]));
  let phase = 'ready', left = READY_S, t = 0, over = false;
  return {
    events,
    init: () => ({ ...K, diff, solo, smoke: SMOKE_S, medals: LEVEL[diff].medals }),
    act(pid, a, d) {
      if (a !== 'add' || phase !== 'play' || !P[pid] || !d || typeof d !== 'object') return;
      const s = P[pid], R = K.recipes[s.at];
      if (!R || d.k !== s.at || d.s !== s.prog || !Number.isInteger(d.i) || !K.shelf.includes(d.i) || t < s.lock - 0.15) return;
      if (R[s.prog] === d.i) {
        s.prog++;
        if (s.prog === R.length) { s.potions++; s.at++; s.prog = 0; events.push({ e: 'brew', pid, k: d.k }); }
      } else { s.prog = 0; s.lock = t + SMOKE_S; s.smoke++; events.push({ e: 'smoke', pid, k: d.k }); }
    },
    step(dt) {
      if (over) return;
      if (phase === 'play') t += dt;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') { phase = 'play'; left = PLAY_S; }
      else if (phase === 'play') { phase = 'end'; left = END_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), scores: {}, at: {}, prog: {}, lock: phase === 'play' ? pids.filter(p => t < P[p].lock) : [] };
      for (const p of pids) { g.scores[p] = P[p].potions; g.at[p] = P[p].at; g.prog[p] = P[p].prog; }
      return g;
    },
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { const v = P[p].potions; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, P[p].potions])), unit: meta.unit };
    },
    _K: K, _P: P,
  };
}
