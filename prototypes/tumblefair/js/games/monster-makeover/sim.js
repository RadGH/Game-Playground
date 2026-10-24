// MONSTER MAKEOVER (Halloween only) — Costume Catwalk's dress-up, but your model is a fuzzy MONSTER and it has a
// request card. Everyone gets the same client (a monster who walked into the salon) and the same card: two or three
// wishes ("3 EYES", "PURPLE fur", "a CROWN", "NO horns") and a style ("Make me CUTE / SPOOKY / FANCY"). From your own
// tray of parts (fur dye, eyes, horns, a hat, a mouth, something to wear) tap a piece onto each slot. When time is up
// every makeover takes a turn in the mirror, anonymous and shuffled, and the client gives STARS: one per wish met, and
// up to two more for pieces in the asked style (3 pieces = +1, 5 = +2). Then (three or more players) everyone votes for
// their favourite look, never their own. Points = stars + votes, +1 to the client's favourite (most stars; first
// finished wins a tie). Alone: the stars are your score, with medals.
// Difficulty: Family = two wishes and five parts a slot; Normal = three wishes, four parts; Tricky = three wishes
// (one of them a "NO …"), three parts a slot, a shorter clock. Every wish is reachable from every tray.
export const meta = {
  id: 'monster-makeover', title: 'Monster Makeover', blurb: 'Give the monster the makeover it asked for — then vote for the best look!',
  how: ['A monster wants a makeover: read its request card.', 'Tap parts onto it: fur, eyes, horns, hat, mouth and more.', 'It gives a star for each wish, and more for its style.', 'Then vote for your favourite look (not your own!).'],
  kind: 'ui', min: 1, max: 4, seconds: 72, scoring: 'vote', unit: 'points', tags: ['social', 'holiday'], season: 'halloween', card: 'card-monster-makeover', css: true,
};
export const SHOW_S = 3.2, VOTE_S = 12, REVEAL_S = 6;
export const STYLES = ['cute', 'spooky', 'fancy'];
/** Every slot's parts: id -> theme tags. 'none' is always on the tray for hat / horns / extra (and has no style). */
export const PARTS = {
  fur: { purple: ['spooky', 'fancy'], green: ['spooky'], orange: ['cute'], blue: ['cute'], pink: ['cute', 'fancy'], lime: ['cute'], grey: ['spooky'], red: ['fancy'] },
  eyes: { 1: ['spooky'], 2: ['cute'], 3: ['fancy'], 5: ['spooky'], 7: ['spooky'] },
  horns: { little: ['cute'], big: ['spooky'], curly: ['fancy'] },
  hat: { witch: ['spooky'], top: ['fancy'], bow: ['cute'], crown: ['fancy'], pumpkin: ['spooky', 'cute'], cap: ['cute'] },
  mouth: { smile: ['cute'], tongue: ['cute'], grin: ['spooky'], oh: [] },
  extra: { cape: ['spooky', 'fancy'], bowtie: ['fancy'], scarf: ['cute'], wings: ['spooky'] },
};
export const SLOTS = ['fur', 'eyes', 'horns', 'hat', 'mouth', 'extra'];
export const NONE_OK = new Set(['horns', 'hat', 'extra']);
/** What the client looks like when it walks in (a slot left alone keeps this). */
export const BASE = { eyes: '2', horns: 'none', hat: 'none', mouth: 'oh', extra: 'none' };
export const LEVELS = {
  easy: { dress: 32, wishes: 2, deal: 5, no: false },
  normal: { dress: 28, wishes: 3, deal: 4, no: false },
  hard: { dress: 24, wishes: 3, deal: 3, no: true },
};
export const CLIENT_NAMES = ['Gorbo', 'Mildred the Mild', 'Fuzzwick', 'Countess Snuggle', 'Bumbleguts', 'Sir Squelch', 'Wobbleton', 'Madame Moss'];
/** Does the look meet the wish? wish = { s, v } (that part), { s, any: true } (any part but none), { s, none: true }. */
export const meets = (look, w) => w.none ? look[w.s] === 'none' : w.any ? look[w.s] !== 'none' && look[w.s] != null : String(look[w.s]) === String(w.v);
/** The client's stars for a look: one per wish met + style stars (pieces you CHOSE in the style: 3 = +1, 5 = +2). */
export function starsFor(look, chosen, req) {
  const wishes = req.wishes.filter(w => meets(look, w)).length;
  const styled = SLOTS.filter(s => chosen[s] && look[s] !== 'none' && (PARTS[s][look[s]] || []).includes(req.style)).length;
  return { wishes, styled, stars: wishes + (styled >= 5 ? 2 : styled >= 3 ? 1 : 0) };
}
export const maxStars = req => req.wishes.length + 2;
/** The client and its request card, from the rng. */
export function makeRequest(rng, L) {
  const style = rng.pick(STYLES), slots = rng.shuffle(SLOTS).slice(0, L.wishes), base = { ...BASE, fur: null };
  const wishes = slots.map((s, i) => {
    if (L.no && i === 0 && NONE_OK.has(s)) return { s, none: true };
    if (s === 'hat' && rng.chance(0.35)) return { s, any: true };
    const opts = Object.keys(PARTS[s]).filter(v => v !== BASE[s]);
    return { s, v: rng.pick(opts) };
  });
  // a "NO …" wish needs a slot that can be empty: on Tricky, if the first wish slot can't be, swap one in
  if (L.no && !wishes.some(w => w.none)) { const s = rng.pick([...NONE_OK].filter(x => !slots.includes(x))); wishes[0] = { s, none: true }; }
  const furWish = wishes.find(w => w.s === 'fur')?.v;
  base.fur = rng.pick(Object.keys(PARTS.fur).filter(f => f !== furWish));
  // a "NO horns" / "NO hat" wish only makes sense if the client walks in wearing one
  for (const w of wishes) if (w.none) base[w.s] = rng.pick(Object.keys(PARTS[w.s]));
  return { style, wishes, base, body: rng.int(0, 3), legs: rng.int(2, 4), spots: rng.int(0, 4), name: rng.pick(CLIENT_NAMES) };
}
/** One player's tray: slot -> [part ids], `deal` parts a slot (+ 'none' where allowed); every wish reachable; at least 4 slots offer the style. */
export function dealTray(rng, req, L) {
  const tray = {};
  for (const s of SLOTS) {
    let pick = rng.shuffle(Object.keys(PARTS[s])).slice(0, L.deal);
    const w = req.wishes.find(x => x.s === s && x.v != null);
    if (w && !pick.includes(String(w.v))) pick[0] = String(w.v);
    if (!pick.some(v => PARTS[s][v].includes(req.style))) {
      const fit = Object.keys(PARTS[s]).filter(v => PARTS[s][v].includes(req.style) && !pick.includes(v));
      const free = pick.findIndex(v => !(w && String(w.v) === v));
      if (fit.length && free >= 0 && rng.chance(0.75)) pick[free] = rng.pick(fit);
    }
    pick = rng.shuffle(pick);
    tray[s] = NONE_OK.has(s) ? ['none', ...pick] : pick;
  }
  return tray;
}
/** The look a player made: slot -> part id (a slot left alone keeps the client's own). */
export function lookOf(req, tray, outfit) {
  const look = {}, chosen = {};
  for (const s of SLOTS) { const i = outfit[s]; chosen[s] = i >= 0; look[s] = i >= 0 ? tray[s][i] : req.base[s]; }
  return { look, chosen };
}
/** The best outfit a tray allows (a wish wins its slot; otherwise a piece in the style) — what a careful dresser does. */
export function bestOutfit(tray, req) {
  const out = {};
  for (const s of SLOTS) {
    const w = req.wishes.find(x => x.s === s);
    let i = -1;
    if (w) { i = tray[s].findIndex(v => meets({ [s]: v }, w)); if (w.any) { const st = tray[s].findIndex(v => v !== 'none' && PARTS[s][v].includes(req.style)); if (st >= 0) i = st; } }
    if (!w) i = tray[s].findIndex(v => v !== 'none' && PARTS[s][v].includes(req.style));
    out[s] = i;
  }
  return out;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1, vote = pids.length >= 3;
  const req = makeRequest(rng, L);
  const tray = {}, outfit = {}, at = {}, points = {}, done = new Set();
  pids.forEach(p => { tray[p] = dealTray(rng, req, L); outfit[p] = Object.fromEntries(SLOTS.map(s => [s, -1])); at[p] = Infinity; points[p] = 0; });
  let phase = 'dress', left = L.dress, over = false, clock = 0, walk = 0, order = null, show = null, reveal = null;
  const votes = {};
  const looks = p => lookOf(req, tray[p], outfit[p]);
  function toMirror() {
    order = rng.shuffle(pids);
    show = order.map(p => { const { look, chosen } = looks(p); return { look, stars: starsFor(look, chosen, req).stars }; });
    phase = 'show'; walk = 0; left = SHOW_S;
  }
  function settle() {
    const got = Object.fromEntries(pids.map(p => [p, 0]));
    for (const v of Object.values(votes)) got[order[v]] += 1;
    const stars = Object.fromEntries(pids.map(p => { const { look, chosen } = looks(p); return [p, starsFor(look, chosen, req).stars]; }));
    let fav = null;
    if (!solo) { const ranked = pids.slice().sort((a, b) => stars[b] - stars[a] || at[a] - at[b] || pids.indexOf(a) - pids.indexOf(b)); fav = stars[ranked[0]] > 0 ? ranked[0] : null; }
    for (const p of pids) points[p] = stars[p] + got[p] + (p === fav ? 1 : 0);
    reveal = { who: order, votes: { ...votes }, got, stars, fav };
  }
  return {
    init: () => ({ req, solo, vote, n: pids.length, max: maxStars(req), dress: L.dress, parts: PARTS, slots: SLOTS }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'dress') {
        if (a === 'wear') {
          if (!d || typeof d !== 'object' || !SLOTS.includes(d.s) || !Number.isInteger(d.i)) return;
          if (d.i < -1 || d.i >= tray[pid][d.s].length || outfit[pid][d.s] === d.i) return;
          outfit[pid][d.s] = d.i; at[pid] = clock; done.delete(pid);
        } else if (a === 'done') {
          if (d === false) { done.delete(pid); return; }
          if (d !== true) return;
          done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.5);
        }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (!Number.isInteger(d) || d < 0 || d >= order.length || order[d] === pid || pid in votes) return;
        votes[pid] = d;
        if (pids.every(p => p in votes)) left = Math.min(left, 0.8);
      }
    },
    step(dt) {
      if (over) return;
      clock += dt; left -= dt; if (left > 0) return;
      if (phase === 'dress') toMirror();
      else if (phase === 'show') {
        if (walk + 1 < show.length) { walk++; left = SHOW_S; }
        else if (vote) { phase = 'vote'; left = VOTE_S; }
        else { settle(); phase = 'reveal'; left = REVEAL_S; }
      } else if (phase === 'vote') { settle(); phase = 'reveal'; left = REVEAL_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)) };
      if (phase === 'dress') g.done = pids.filter(p => done.has(p));
      if (show) g.show = show;
      if (phase === 'show') g.walk = walk;
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    priv: pid => ({ tray: tray[pid], outfit: { ...outfit[pid] }, done: done.has(pid), mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null }),
    get over() { return over; },
    result() {
      if (!reveal) { if (!order) { order = pids.slice(); show = order.map(p => ({ look: looks(p).look, stars: 0 })); } settle(); }
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
    get request() { return req; }, trayOf: p => tray[p],
  };
}
