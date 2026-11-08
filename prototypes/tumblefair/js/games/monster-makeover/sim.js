// MONSTER MAKEOVER (Halloween only) — ONE idea: give the monster exactly what its wish card asks for.
// Everyone gets the same client (a monster who walked into the salon), the same card of wishes ("3 EYES", "PURPLE
// fur", "a CROWN", "NO horns") and the SAME tray of parts. Tap parts onto it; each wish ticks green when it is met.
// Press DONE: the first to finish with EVERY wish met wins the client's Quick ribbon (+1). Then the mirror shows every
// makeover (shuffled, anonymous), the client gives one star per wish met, and with three or more players everyone
// votes for their favourite look, never their own (+1 a vote). Alone you race Stylist Stitch (CPU) for the ribbon.
// Expansion 1, M4 ("confusing", "short"): the old card also asked for a STYLE (cute / spooky / fancy) scored as
// "3 pieces in the style = +1 star, 5 = +2", every part wore style badges, each player got a different random tray,
// and a tie went to whoever tapped their last part first. Too many rules for a 28-second dress-up, and not fair. Now:
// wishes only, one shared tray, a ribbon for the quickest full match, and a longer clock.
export const meta = {
  id: 'monster-makeover', title: 'Monster Makeover', blurb: 'Give the monster every wish on its card — fastest full makeover wins the ribbon!',
  how: ['Read the wish card. Tap parts onto the monster until every wish is ticked.', 'Press DONE. First with every wish met wins the Quick ribbon (+1).', 'One star per wish. With 3 or more players, vote for a favourite look (not your own!).'],
  kind: 'ui', min: 1, max: 4, seconds: 84, scoring: 'vote', unit: 'points', tags: ['social', 'holiday'], season: 'halloween', card: 'card-monster-makeover', css: true, rival: true,
};
export const SHOW_S = 3.2, VOTE_S = 12, REVEAL_S = 6, QUICK = 1;
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
  easy: { dress: 40, wishes: 3, no: false, cpu: [18, 26], cpuSlip: 0.5 },
  normal: { dress: 40, wishes: 4, no: false, cpu: [12, 18], cpuSlip: 0.25 },
  hard: { dress: 36, wishes: 4, no: true, cpu: [8, 12], cpuSlip: 0 },
};
export const CPU_NAME = 'Stylist Stitch';
export const CLIENT_NAMES = ['Gorbo', 'Mildred the Mild', 'Fuzzwick', 'Countess Snuggle', 'Bumbleguts', 'Sir Squelch', 'Wobbleton', 'Madame Moss'];
/** Does the look meet the wish? wish = { s, v } (that part), { s, any: true } (any part but none), { s, none: true }. */
export const meets = (look, w) => w.none ? look[w.s] === 'none' : w.any ? look[w.s] !== 'none' && look[w.s] != null : String(look[w.s]) === String(w.v);
/** The client's stars for a look: one per wish met. */
export const starsFor = (look, req) => req.wishes.filter(w => meets(look, w)).length;
export const maxStars = req => req.wishes.length;
/** The client and its request card, from the rng. */
export function makeRequest(rng, L) {
  const slots = rng.shuffle(SLOTS).slice(0, L.wishes), base = { ...BASE, fur: null };
  const wishes = slots.map((s, i) => {
    if (L.no && i === 0 && NONE_OK.has(s)) return { s, none: true };
    if (s === 'hat' && rng.chance(0.35)) return { s, any: true };
    const opts = Object.keys(PARTS[s]).filter(v => v !== BASE[s]);
    return { s, v: rng.pick(opts) };
  });
  // a "NO …" wish needs a slot that can be empty: on Tricky, if the first wish slot can't be, swap one in
  if (L.no && !wishes.some(w => w.none)) {
    const free = [...NONE_OK].filter(x => !slots.includes(x));
    if (free.length) wishes[0] = { s: rng.pick(free), none: true };
    else { const i = wishes.findIndex(w => NONE_OK.has(w.s)); wishes[i] = { s: wishes[i].s, none: true }; }   // 4 wishes can cover every can-be-empty slot
  }
  const furWish = wishes.find(w => w.s === 'fur')?.v;
  base.fur = rng.pick(Object.keys(PARTS.fur).filter(f => f !== furWish));
  // a "NO horns" / "NO hat" wish only makes sense if the client walks in wearing one
  for (const w of wishes) if (w.none) base[w.s] = rng.pick(Object.keys(PARTS[w.s]));
  return { wishes, base, body: rng.int(0, 3), legs: rng.int(2, 4), spots: rng.int(0, 4), name: rng.pick(CLIENT_NAMES) };
}
/** THE tray (the same for every player): every part of every slot, shuffled once (+ 'none' first where allowed). */
export function dealTray(rng) {
  const tray = {};
  for (const sl of SLOTS) { const pick = rng.shuffle(Object.keys(PARTS[sl])); tray[sl] = NONE_OK.has(sl) ? ['none', ...pick] : pick; }
  return tray;
}
/** The look a player made: slot -> part id (a slot left alone keeps the client's own). */
export function lookOf(req, tray, outfit) {
  const look = {};
  for (const s of SLOTS) { const i = outfit[s]; look[s] = i >= 0 ? tray[s][i] : req.base[s]; }
  return look;
}
/** The outfit that meets every wish (slots without a wish left as the client came in). */
export function bestOutfit(tray, req) {
  const out = {};
  for (const s of SLOTS) { const w = req.wishes.find(x => x.s === s); out[s] = w ? tray[s].findIndex(v => meets({ [s]: v }, w)) : -1; }
  return out;
}

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1, vote = pids.length >= 3;
  const req = makeRequest(rng, L), tray = dealTray(rng);
  const outfit = {}, doneAt = {}, points = {};
  pids.forEach(p => { outfit[p] = Object.fromEntries(SLOTS.map(s => [s, -1])); points[p] = 0; });
  // Stitch (solo): finishes at a rolled time; on easier levels may miss a wish; dresses the free slots for fun
  let cpu = null;
  if (solo && rivals !== false) {                    // "Rival when alone" off: no Stitch, a solo makeover for stars
    const o = bestOutfit(tray, req);
    for (const s of SLOTS) if (o[s] < 0 && rng.chance(0.6)) o[s] = rng.int(NONE_OK.has(s) ? 1 : 0, tray[s].length - 1);
    if (rng.chance(L.cpuSlip)) { const w = rng.pick(req.wishes); o[w.s] = tray[w.s].findIndex(v => !meets({ [w.s]: v }, w)); }
    cpu = { at: rng.range(...L.cpu), look: lookOf(req, tray, o), done: false };
  }
  let phase = 'dress', left = L.dress, over = false, clock = 0, walk = 0, order = null, show = null, reveal = null;
  const votes = {}, events = [];
  const looks = p => p === 'cpu' ? cpu.look : lookOf(req, tray, outfit[p]);
  const full = p => starsFor(looks(p), req) === req.wishes.length;
  /** Who wins the Quick ribbon: the earliest DONE with every wish met (Stitch counts, alone). */
  function quickWinner() {
    const cands = pids.filter(p => doneAt[p] != null && full(p)).map(p => [p, doneAt[p]]);
    if (cpu?.done && full('cpu')) cands.push(['cpu', cpu.at]);
    cands.sort((a, b) => a[1] - b[1]);
    return cands.length ? cands[0][0] : null;
  }
  function toMirror() {
    order = rng.shuffle(cpu ? [...pids, 'cpu'] : pids.slice());
    show = order.map(p => ({ look: looks(p), stars: starsFor(looks(p), req) }));
    phase = 'show'; walk = 0; left = SHOW_S;
  }
  function settle() {
    const all = order || pids, got = Object.fromEntries(all.map(p => [p, 0]));
    for (const v of Object.values(votes)) got[order[v]] += 1;
    const stars = Object.fromEntries(all.map(p => [p, starsFor(looks(p), req)]));
    const quick = quickWinner();
    for (const p of pids) points[p] = stars[p] + got[p] + (p === quick ? QUICK : 0);
    reveal = { who: all, votes: { ...votes }, got, stars, quick };
  }
  return {
    events,
    init: () => ({ req, solo, vote, n: pids.length, max: maxStars(req), dress: L.dress, parts: PARTS, slots: SLOTS, tray, cpu: cpu ? CPU_NAME : null }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'dress') {
        if (a === 'wear') {
          if (!d || typeof d !== 'object' || !SLOTS.includes(d.s) || !Number.isInteger(d.i)) return;
          if (d.i < -1 || d.i >= tray[d.s].length || outfit[pid][d.s] === d.i) return;
          outfit[pid][d.s] = d.i; delete doneAt[pid];
        } else if (a === 'done') {
          if (d === false) { delete doneAt[pid]; return; }
          if (d !== true || doneAt[pid] != null) return;
          doneAt[pid] = clock;
          if (full(pid) && quickWinner() === pid) events.push({ e: 'quick', pid });
          if (pids.every(p => doneAt[p] != null)) left = Math.min(left, 0.5);
        }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (!Number.isInteger(d) || d < 0 || d >= order.length || order[d] === pid || order[d] === 'cpu' || pid in votes) return;
        votes[pid] = d;
        if (pids.every(p => p in votes)) left = Math.min(left, 0.8);
      }
    },
    step(dt) {
      if (over) return;
      clock += dt; left -= dt;
      if (cpu && !cpu.done && phase === 'dress' && clock >= cpu.at) { cpu.done = true; events.push({ e: 'cpu', full: full('cpu') }); if (full('cpu') && quickWinner() === 'cpu') events.push({ e: 'quick', pid: 'cpu' }); }
      if (left > 0) return;
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
      if (phase === 'dress') { g.done = pids.filter(p => doneAt[p] != null); const q = quickWinner(); if (q != null) g.quick = q; if (cpu?.done) g.cpuDone = 1; }
      if (show) g.show = show;
      if (phase === 'show') g.walk = walk;
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    priv: pid => ({ outfit: { ...outfit[pid] }, done: doneAt[pid] != null, mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null }),
    get over() { return over; },
    result() {
      if (!reveal) { if (!order) { order = cpu ? [...pids, 'cpu'] : pids.slice(); show = order.map(p => ({ look: looks(p), stars: 0 })); } settle(); }
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
    get request() { return req; }, get tray() { return tray; }, _cpu: cpu,
  };
}
