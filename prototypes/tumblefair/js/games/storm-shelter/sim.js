// STORM SHELTER — co-op, on a screen. The team is stuck in a little shelter through a long storm. Three meters:
// HEAT, ROOF and FOOD (0-10). If any one reaches 0, the storm wins.
// Every beat the storm shows what it is about to hit ("-2 Roof"); each player holds a private hand of 3 ACTION cards
// (light the stove, patch the roof, forage…) and plays ONE to cover it. When everyone has played the beat ends early.
// Survive every beat = success. Scores: the meter points each player's cards actually added.
//
// Expansion 1 M4 (2026-11-07): rated "confusing" + "controls", and the average game lasted 18 s of 75 — the shelter
// fell in the third beat. Five-second beats with the full wind from beat 1 left a new team no time to read a card,
// and solo asked for TWO cards a beat. Now: 7 s beats, the wind builds over the first three beats, meters start at 7,
// everyone (solo too) plays ONE card, cards that cover what is coming are marked "covers it", and a solo player has
// Bramble, a computer shelter-mate who plays a card of its own every beat after seeing yours.
import { EVENTS, CARDS, CARD_IDS, METERS } from './deck.js';
export { EVENTS, CARDS, METERS };

export const meta = {
  id: 'storm-shelter', title: 'Storm Shelter', blurb: 'Keep the shelter warm, dry and fed until the storm passes!',
  how: ['Each beat the storm shows what it will hit: "−2 Roof".', 'Tap ONE card that covers it — the ones that do say "covers it".', 'If any meter hits 0 you all lose. Survive all 10 beats!'],
  kind: 'ui', min: 1, max: 4, seconds: 75, scoring: 'coop', unit: 'points', tags: ['coop', 'puzzle'], card: 'card-storm-shelter', css: true, rival: true,
};
export const RULES = { start: 2.5, beat: 7, beats: 10, end: 2, max: 10, begin: 7, hand: 3, early: 0.8, ramp: 3 };
export const CPU = 'cpu', CPU_NAME = 'Bramble';
/** One card each a beat, always. The wind (points taken each beat on top of the event) grows with the TEAM (a solo
 *  player + Bramble is a team of two), builds up over the first RULES.ramp beats, and adds one more every 4 beats.
 *  Tuned with tests/storm-shelter.test.js's bots so a team that covers the hits nearly always makes it and a random one
 *  rarely does. */
export const perBeat = () => 1;
export const WIND = [0, 2.9, 2.6, 4.7, 6.6];   // [1] = you + Bramble; tuned 2026-11-07 (M4)
export const windFor = (team, beat) => Math.floor(WIND[team] * Math.min(1, (beat + 1) / (RULES.ramp + 1)) + beat / 4);
/** Alone with no Bramble ("Rival when alone" off): one card a beat, so about half the wind of a pair. */
export const windAlone = beat => Math.floor(1.3 * Math.min(1, (beat + 1) / (RULES.ramp + 1)) + beat / 5);
const clamp = v => Math.max(0, Math.min(RULES.max, v));

/** Apply a card's fx to meters m (array, changed in place) and return the points it actually added (caps count). */
export function applyCard(m, fx) {
  let added = 0;
  const add = (i, v) => { if (v > 0) { const room = Math.max(0, RULES.max - m[i]), got = Math.min(v, room); m[i] += got; added += got; } else m[i] += v; };
  for (const [k, v] of Object.entries(fx)) {
    if (k === 'low') { let lo = 0; for (let i = 1; i < 3; i++) if (m[i] < m[lo]) lo = i; add(lo, v); }
    else add(METERS.indexOf(k), v);
  }
  return added;
}

/** The best card for meters m (after the storm and the other cards): raise the lowest meter most, counting the cap. */
export function bestCard(m, hand) {
  let pick = 0, best = -1e9;
  hand.forEach((id, i) => { const mm = m.slice(); applyCard(mm, CARDS[id].fx); const s = Math.min(...mm) * 10 + mm.reduce((x, y) => x + Math.min(y, RULES.max), 0); if (s > best) { best = s; pick = i; } });
  return pick;
}

export function create({ rng, players, rivals = true }) {
  const pids = players.map(p => p.pid), n = pids.length, solo = n === 1, team = n, handN = RULES.hand;   // WIND[1] is for you + Bramble
  const bramble = solo && rivals !== false;          // "Rival when alone" off: one card a beat against a gentler wind
  const seats = bramble ? [...pids, CPU] : pids;
  const order = rng.shuffle(EVENTS.map((_, i) => i)).slice(0, RULES.beats);
  let pile = [];
  const draw = () => { if (!pile.length) pile = rng.shuffle(CARD_IDS.flatMap(id => Array(CARDS[id].w).fill(id))); return pile.pop(); };
  const hand = new Map(seats.map(p => [p, Array.from({ length: handN }, draw)]));
  const play = new Map(seats.map(p => [p, []])), score = Object.fromEntries(seats.map(p => [p, 0]));
  let m = [RULES.begin, RULES.begin, RULES.begin], phase = 'ready', beat = -1, left = RULES.start, time = meta.seconds, over = false, success = false, wind = [0, 0, 0], last = null;
  const events = [];

  function nextBeat() {
    beat++; phase = 'beat'; left = RULES.beat;
    for (const p of seats) play.set(p, []);
    wind = [0, 0, 0]; for (let k = bramble || !solo ? windFor(team, beat) : windAlone(beat); k > 0; k--) wind[rng.int(0, 2)]--;
  }
  function resolve() {
    const ev = EVENTS[order[beat]], before = m.slice();
    for (const [k, v] of Object.entries(ev.hit)) m[METERS.indexOf(k)] += v;
    for (let i = 0; i < 3; i++) m[i] += wind[i];
    const played = [];
    for (const p of seats) {
      const h = hand.get(p);
      if (p === CPU) play.set(p, [bestCard(m, h)]);                   // Bramble plays last, seeing what you played
      const picks = play.get(p).slice().sort((a, b) => b - a);
      for (const i of picks) { const id = h[i]; const got = applyCard(m, CARDS[id].fx); score[p] += got; played.push([p, id, got]); h.splice(i, 1); }
      while (h.length < handN) h.push(draw());
    }
    const dead = m.some(v => v <= 0);
    m = m.map(clamp);
    last = { beat, d: m.map((v, i) => v - before[i]), played };
    events.push({ e: 'resolve', ...last, m: m.slice() });
    if (dead) { over = true; success = false; phase = 'end'; left = 0; events.push({ e: 'end', ok: 0 }); return; }
    if (beat + 1 >= RULES.beats) { phase = 'end'; left = RULES.end; success = true; events.push({ e: 'end', ok: 1 }); return; }
    nextBeat();
  }
  const ready = () => pids.every(p => play.get(p).length >= 1);
  return {
    events,
    init: () => ({ beats: RULES.beats, beat: RULES.beat, per: 1, max: RULES.max, begin: RULES.begin, solo, cpu: bramble ? CPU_NAME : null }),
    act(pid, a, d) {
      if (phase !== 'beat' || !pids.includes(pid)) return;
      if (a !== 'play') return;
      const P = play.get(pid); if (!Number.isInteger(d) || d < 0 || d >= hand.get(pid).length) return;
      if (P[0] === d) P.length = 0; else { P.length = 0; P.push(d); }          // one card: tap another to switch, the same to take it back
      if (ready()) left = Math.min(left, RULES.early);
    },
    step(dt) {
      if (over) return;
      left -= dt; time -= dt;
      if (left > 1e-9) return;
      if (phase === 'ready') nextBeat();
      else if (phase === 'beat') resolve();
      else if (phase === 'end') over = true;
    },
    state() {
      const g = { ph: phase, beat, m: m.slice(), sc: Object.fromEntries(pids.map(p => [p, score[p]])), left: Math.max(0, Math.ceil(time)) };
      if (phase === 'beat') {
        g.ev = order[beat]; g.wind = wind.slice(); g.bl = Math.max(0, Math.ceil(left));
        g.done = pids.filter(p => play.get(p).length >= 1);
      }
      if (last) g.last = last;
      if (phase === 'end') g.ok = success ? 1 : 0;
      return g;
    },
    priv: pid => pids.includes(pid) ? { hand: hand.get(pid).slice(), play: play.get(pid).slice() } : {},
    get over() { return over; },
    result: () => ({ coop: { success: success && !m.some(v => v <= 0) }, order: [pids.slice()], scores: Object.fromEntries(pids.map(p => [p, score[p]])), unit: meta.unit }),
  };
}
