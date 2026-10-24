// WAGON TRAIL — the whole party rides one covered wagon across the frontier to Fairhaven Valley. Between rolling legs
// the trail throws a quick challenge at you, and EVERYONE plays it at the same moment on their own phone:
//   river  (8 s)  pick a crossing — shallow ford 1 / rope ferry 2 / deep swim 3 — then tap GO while the bobbing marker
//                 is in the calm water. The deeper the crossing, the smaller the calm patch. A miss loses a food barrel.
//   hunt   (9 s)  critters hop across the meadow: tap them to bag supper (+1 point and +1 food; the golden one is +3).
//   wheel  (≤8 s) a wheel came off! Tap the bolts in the order they light up. First fixed 3, second 2, the rest 1.
//                 If nobody fixes it, the wagon takes a knock.
//   storm  (10 s) vote a route (4 s): the RIDGE is quick but stormy, the VALLEY is muddy (costs 2 food). Then HOLD ON:
//                 tap the moment lightning flashes (+1, the quickest +1 more). On the ridge, if the party misses most
//                 flashes, the canvas tears (the wagon takes a knock).
//   post   (7 s)  a trading post: the price needle swings — tap a spare wheel or a food sack when it shows a LOW price.
//                 Price 1 = 3 points, 2 = 2, 3 = 1. It costs the party that much food.
// Food and the wagon are shared; points are yours. At the end everyone gets a bonus for the food left over.
// The order: the river first, the trading post last, the other three shuffled. Timed taps carry the phone's clock
// (toss-kit's phoneTime), so a slow network never costs you the calm patch.
import { phoneTime, pingPong, r1, r2 } from '../toss-kit.js';

export const meta = {
  id: 'wagon-trail', title: 'Wagon Trail', blurb: 'Roll the party\'s wagon across the frontier — ford rivers, fix wheels and ride out the storm together!',
  how: ['Your wagon meets a quick challenge every few seconds. Everyone plays it at once.', 'Read the big card: it says what to tap. Food and the wagon are shared.', 'The best at each challenge scores the most points!'],
  kind: 'ui', min: 1, max: 4, seconds: 78, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-wagon-trail', css: true,
};
export const COUNT_S = 3, TRAVEL_S = 2.6, OUT_S = 2.0, END_S = 4.5;
export const DUR = { river: 8, hunt: 9, wheel: 8, storm: 10, post: 7 };
export const VOTE_S = 4, FLASH_WIN = 0.9, SHOT_GAP = 0.4, JAM_S = 0.6, BOLTS = 6, SLOTS = 8;
export const CROSS = [{ id: 'ford', pts: 1, w: 0.34 }, { id: 'ferry', pts: 2, w: 0.2 }, { id: 'swim', pts: 3, w: 0.11 }];
export const STRIP = [4, 2, 1, 3, 5];                     // the trading post's prices, left to right
export const ITEMS = [{ id: 'wheel', hp: 1 }, { id: 'sack', food: 4 }];
export const LEVELS = {
  easy: { river: 1.7, band: 1.2, hunt: 8, post: 2.6, food: 5 },
  normal: { river: 1.35, band: 1, hunt: 7, post: 2.1, food: 4 },
  hard: { river: 1.05, band: 0.85, hunt: 6, post: 1.7, food: 3 },
};
export const FIELD = { w: 100, h: 60 };
/** Where a critter is at challenge time t (or null when it is off the field). */
export function critterAt(c, t) {
  const u = t - c.s; if (u < 0) return null;
  const x = c.dir > 0 ? -6 + c.v * u : FIELD.w + 6 - c.v * u; if (x < -6 || x > FIELD.w + 6) return null;
  return { x: r1(x), y: r1(c.y - Math.abs(Math.sin(u * c.hop)) * 5) };
}
/** The river marker 0..1 at challenge time t. */
export const riverAt = (t, L) => pingPong(t, L.river);
/** The trading post's price at challenge time t. */
export const priceAt = (t, L) => STRIP[Math.min(STRIP.length - 1, Math.floor(pingPong(t + 0.37, L.post) * STRIP.length))];
export const postPts = p => (p <= 1 ? 3 : p === 2 ? 2 : p === 3 ? 1 : 0);

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), n = pids.length, solo = n === 1;
  const order = ['river', ...rng.shuffle(['hunt', 'wheel', 'storm']), 'post'];
  const river = { c: r2(rng.range(0.28, 0.72)) };
  const critters = [];
  for (let i = 0; i < 12; i++) critters.push({ i, s: r2(i * 0.6 + rng.range(0, 0.5)), y: r1(rng.range(32, 56)), dir: rng.chance(0.5) ? 1 : -1, v: r1(rng.range(18, 30)), hop: r1(rng.range(5, 8)), gold: 0 });
  critters[rng.int(4, 9)].gold = 1;
  const seq = []; for (let i = 0; i < BOLTS; i++) { let s; do s = rng.int(0, SLOTS - 1); while (s === seq[i - 1]); seq.push(s); }
  const flash = (k) => { const out = []; for (let i = 0; i < k; i++) out.push(r2(VOTE_S + 0.7 + i * (5 / k) + rng.range(0, 5 / k - 1.1))); return out; };
  const flashes = { ridge: flash(3), valley: flash(2) };
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, got: 0, did: null, last: null, prog: 0, jam: 0, done: null, vote: null, caught: [], best: {} }]));
  const events = [];
  let phase = 'count', left = COUNT_S, el = 0, ci = -1, t0 = 0, t1 = 0, over = false, food = L.food + n, hp = 3, route = null, res = null, hit = new Set(), outcome = [];
  const cid = () => order[ci];
  const add = (pid, k) => { S[pid].pts += k; S[pid].got += k; };
  function begin() {
    ci++; phase = 'travel'; left = TRAVEL_S; res = null; route = null; hit = new Set();
    for (const p of pids) Object.assign(S[p], { got: 0, did: null, prog: 0, jam: 0, done: null, vote: null, caught: [], best: {} });
    events.push({ e: 'next', c: cid(), i: ci });
  }
  function go() { phase = 'go'; t0 = r2(el); t1 = r2(el + DUR[cid()]); events.push({ e: 'go', c: cid(), t0, t1 }); }
  function finish() {
    // settle the challenge: shared effects + a line for the card
    const c = cid(), notes = [];
    if (c === 'river') {
      for (const p of pids) if (!S[p].did?.ok) { food = Math.max(0, food - 1); }
      const lost = pids.filter(p => !S[p].did?.ok).length; if (lost) notes.push(`-${lost} food (barrels floated away)`); else notes.push('Everyone made it across!');
    } else if (c === 'hunt') { const g = pids.reduce((a, p) => a + (S[p].did || 0), 0); notes.push(`+${g} food for supper`); }
    else if (c === 'wheel') { if (!pids.some(p => S[p].done != null)) { hp = Math.max(1, hp - 1); notes.push('Nobody fixed it: the wagon wobbles on (-1 ❤)'); } else notes.push('Wheel fixed!'); }
    else if (c === 'storm') {
      const fl = flashes[route], caught = pids.reduce((a, p) => a + S[p].caught.length, 0);
      // the quickest catch of each flash gets a point more
      fl.forEach((f, k) => { let best = null, bt = 9; for (const p of pids) { const r = S[p].best[k]; if (r != null && r < bt) { bt = r; best = p; } } if (best != null && n > 1) add(best, 1); });
      if (route === 'valley') { food = Math.max(0, food - 2); notes.push('The valley was muddy: -2 food'); }
      else if (caught < fl.length * n * 0.5) { hp = Math.max(1, hp - 1); notes.push('The canvas tore in the storm (-1 ❤)'); }
      else notes.push('You held on through the storm!');
    } else if (c === 'post') { const b = pids.filter(p => S[p].did).length; notes.push(b ? `${b} bought for the party` : 'Nobody bought anything'); }
    const top = Math.max(...pids.map(p => S[p].got)), best = top > 0 ? pids.filter(p => S[p].got === top) : [];
    res = { c, notes, best, got: Object.fromEntries(pids.map(p => [p, S[p].got])) };
    outcome.push(res);
    phase = 'out'; left = OUT_S; events.push({ e: 'out', ...res, food, hp });
  }
  function arrive() {
    const bonus = Math.floor(food / 5) + (hp >= 3 ? 1 : 0);
    for (const p of pids) add(p, bonus);
    phase = 'end'; left = END_S; events.push({ e: 'arrive', bonus, food, hp });
  }
  return {
    events,
    init: () => ({ solo, order, level: L, dur: DUR, travel: TRAVEL_S, vote: VOTE_S, river, cross: CROSS, critters, field: FIELD, seq, slots: SLOTS, flashes, flashWin: FLASH_WIN, strip: STRIP, items: ITEMS }),
    act(pid, a, d) {
      const s = S[pid]; if (!s || over || phase !== 'go' || !d || typeof d !== 'object') return;
      const c = cid(), tt = () => { const t = phoneTime(d, el, null, { ahead: 0.15, lag: 1.0 }); return t == null || t < t0 - 0.05 || t > t1 + 0.05 ? null : t - t0; };
      if (c === 'river' && a === 'ford') {
        if (s.did) return; const k = d.c | 0; if (k < 0 || k > 2) return; const t = tt(); if (t == null) return;
        const x = riverAt(t, L), ok = Math.abs(x - river.c) <= CROSS[k].w * L.band / 2;
        s.did = { k, ok, x: r2(x) }; if (ok) add(pid, CROSS[k].pts);
        events.push({ e: 'ford', pid, k, ok, x: r2(x) });
      } else if (c === 'hunt' && a === 'shot') {
        const t = phoneTime(d, el, s.last, { ahead: 0.15, lag: 1.0, gap: SHOT_GAP }); if (t == null || t < t0 || t > t1) return; s.last = t;
        const x = +d.x, y = +d.y; if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        let best = null, bd = L.hunt;
        for (const cr of critters) { if (hit.has(cr.i)) continue; const p = critterAt(cr, t - t0); if (!p) continue; const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = cr; } }
        if (best) { hit.add(best.i); const k = best.gold ? 3 : 1; add(pid, k); s.did = (s.did || 0) + 1; food += 1; events.push({ e: 'bag', pid, i: best.i, k }); }
        else events.push({ e: 'miss', pid, x: r1(x), y: r1(y) });
      } else if (c === 'wheel' && a === 'bolt') {
        if (s.done != null || s.jam > el) return; const i = d.i | 0;
        if (i === seq[s.prog]) { s.prog++; if (s.prog >= BOLTS) { s.done = r2(el - t0); const place = pids.filter(p => S[p].done != null).length; add(pid, place === 1 ? 3 : place === 2 ? 2 : 1); events.push({ e: 'fixed', pid, place }); } }
        else { s.jam = el + JAM_S; events.push({ e: 'jam', pid }); }
      } else if (c === 'storm' && a === 'vote') {
        if (el - t0 >= VOTE_S || s.vote != null || (d.r !== 0 && d.r !== 1)) return; s.vote = d.r; events.push({ e: 'vote', pid, r: d.r });
      } else if (c === 'storm' && a === 'grab') {
        if (!route) return; const t = tt(); if (t == null) return;
        const fl = flashes[route]; const k = fl.findIndex((f, j) => t >= f && t - f <= FLASH_WIN && !s.caught.includes(j));
        if (k >= 0) { s.caught.push(k); s.best[k] = r2(t - fl[k]); add(pid, 1); events.push({ e: 'grab', pid, k, rt: r2(t - fl[k]) }); }
        else events.push({ e: 'slip', pid });
      } else if (c === 'post' && a === 'buy') {
        if (s.did) return; const it = d.it | 0; if (it < 0 || it > 1) return; const t = tt(); if (t == null) return;
        const price = priceAt(t, L);
        if (it === 0 && (food < price || hp >= 3)) { events.push({ e: 'nobuy', pid, why: hp >= 3 ? 'full' : 'food' }); return; }
        food = Math.max(0, food - price); if (it === 0) hp = Math.min(3, hp + 1); else food += ITEMS[1].food;
        s.did = { it, price }; add(pid, postPts(price)); events.push({ e: 'buy', pid, it, price });
      }
    },
    step(dt) {
      if (over) return;
      el += dt; left -= dt;
      if (phase === 'count') { if (left <= 0) begin(); }
      else if (phase === 'travel') { if (left <= 0) go(); }
      else if (phase === 'go') {
        const c = cid();
        if (c === 'storm' && !route && el - t0 >= VOTE_S) {
          const v = [0, 0]; for (const p of pids) if (S[p].vote != null) v[S[p].vote]++;
          route = v[0] > v[1] ? 'ridge' : 'valley'; events.push({ e: 'route', route, v });
        }
        const allDone = c === 'wheel' ? pids.every(p => S[p].done != null) : c === 'river' || c === 'post' ? pids.every(p => S[p].did) : false;
        if (el >= t1 || (allDone && el >= t0 + 1)) finish();
      } else if (phase === 'out') { if (left <= 0) { if (ci + 1 >= order.length) arrive(); else begin(); } }
      else if (phase === 'end' && left <= 0) over = true;
    },
    state() {
      const sc = {}, pr = {}, dn = [], vt = {}, cg = {};
      for (const p of pids) { const s = S[p]; sc[p] = s.pts; pr[p] = s.prog; if (s.did || s.done != null) dn.push(p); if (s.vote != null) vt[p] = s.vote; cg[p] = s.caught.length; }
      const g = { ph: phase, el: Math.floor(el * 2) / 2, ci, c: ci >= 0 ? cid() : null, t0, t1, food, hp, sc, left: Math.max(0, Math.ceil(phase === 'go' ? t1 - el : left)) };
      if (phase === 'go' || phase === 'out') { const c = cid(); g.dn = dn; if (c === 'wheel') g.pr = pr; if (c === 'storm') { g.vt = vt; g.rt = route; g.cg = cg; } if (c === 'hunt') g.hit = [...hit]; }
      if (res) g.res = res;
      return g;
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts])), groups = new Map();
      for (const p of pids) { if (!groups.has(S[p].pts)) groups.set(S[p].pts, []); groups.get(S[p].pts).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get _phase() { return phase; }, get _el() { return el; }, get _c() { return cid(); }, get _t0() { return t0; }, get _route() { return route; }, get _food() { return food; }, get _hp() { return hp; },
    _stats: S, _level: L, _river: river, _critters: critters, _seq: seq, _flashes: flashes, _order: order, _outcome: outcome,
  };
}

/** What a player taps right now (tests + room bots): skill 1 = sharp, 0 = sloppy. Returns [action, data] or null. */
export function trailBot(g, pid, skill = 1, tick = 0) {
  if (g._phase !== 'go') return null;
  const s = g._stats[pid], t = g._el - g._t0, L = g._level, c = g._c;
  if (c === 'river') {
    if (s.did) return null; const k = skill > 0.5 ? 1 : 2, x = riverAt(t, L);
    if (skill > 0.5 ? Math.abs(x - g._river.c) < 0.04 : t > 3) return ['ford', { c: k, t: g._el }];
  } else if (c === 'hunt') {
    if (tick % (skill > 0.5 ? 7 : 16)) return null;
    const cr = g._critters.map(x => [x, critterAt(x, t)]).find(([, p]) => p && p.x > 5 && p.x < 95);
    if (cr) return ['shot', { x: cr[1].x + (skill > 0.5 ? 0 : 9), y: cr[1].y, t: g._el }];
  } else if (c === 'wheel') {
    if (s.done != null || tick % (skill > 0.5 ? 6 : 14)) return null;
    return ['bolt', { i: skill > 0.5 || tick % 3 ? g._seq[s.prog] : (g._seq[s.prog] + 1) % SLOTS }];
  } else if (c === 'storm') {
    if (t < VOTE_S) return s.vote == null ? ['vote', { r: pid % 2 }] : null;
    const fl = g._flashes[g._route] || []; const k = fl.findIndex((f, j) => t >= f + (skill > 0.5 ? 0.25 : 0.75) && t - f <= FLASH_WIN && !s.caught.includes(j));
    if (k >= 0) return ['grab', { t: g._el }];
  } else if (c === 'post') {
    if (s.did) return null; const p = priceAt(t, L);
    if (skill > 0.5 ? p === 1 : t > 2.5) return ['buy', { it: g._hp < 3 && g._food >= p ? 0 : 1, t: g._el }];
  }
  return null;
}
