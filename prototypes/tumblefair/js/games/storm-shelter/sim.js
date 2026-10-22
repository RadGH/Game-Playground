// STORM SHELTER — co-op, on a screen. The team is stuck in a little shelter through a long storm. Three meters:
// HEAT, ROOF and FOOD (0-10, start at 6). If any one reaches 0, the storm wins.
// Every beat (5 s) an EVENT card arrives from the deck (deck.js: 45 events): its hit happens whatever you do, and
// the team votes one of its 2-3 choices (each a trade-off). The WIND also takes a few points, shown on the card
// before you choose (it grows as the storm goes on, and with the size of the team).
// Each player holds a private hand of 3 ACTION cards (light the stove, patch the roof, forage…) and plays ONE a beat;
// a meter cannot go over 10, so piling everything on the same meter is wasted — talk it over.
// When everyone has played and voted the beat ends early. Survive all 13 beats = success.
// Scores: the meter points each player's cards actually added. Solo: a hand of 4 and TWO cards a beat (a team of
// one does two people's work, against the same wind as two).
import { EVENTS, CARDS, CARD_IDS, METERS } from './deck.js';
export { EVENTS, CARDS, METERS };

export const meta = {
  id: 'storm-shelter', title: 'Storm Shelter', blurb: 'Keep the shelter warm, dry and fed until the storm passes!',
  how: ['Every few seconds the storm throws an event: vote how to handle it.', 'Play one action card from your hand each beat.', 'Talk it over: a meter tops out at 10, and if any hits 0 you lose!', 'Survive all 13 beats.'],
  kind: 'ui', min: 1, max: 4, seconds: 75, scoring: 'coop', unit: 'points', tags: ['coop', 'puzzle'], card: 'card-storm-shelter', css: true,
};
export const RULES = { start: 2.5, beat: 5, beats: 13, end: 2.5, max: 10, begin: 6, hand: 3, soloHand: 4, early: 0.8 };
/** Cards each player plays a beat, and the wind (points taken each beat on top of the event): by team size (tuned
 *  with tests/storm-shelter.test.js's bots so a talking team nearly always makes it and a random one rarely does),
 *  plus one more every 6 beats as the storm builds. */
export const perBeat = n => (n === 1 ? 2 : 1);
export const WIND = [0, 2, 2, 3.5, 5.5];
export const windFor = (n, beat) => Math.floor(WIND[n] + beat / 6);
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

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), n = pids.length, cpb = perBeat(n), handN = n === 1 ? RULES.soloHand : RULES.hand;
  const order = rng.shuffle(EVENTS.map((_, i) => i)).slice(0, RULES.beats);
  let pile = [];
  const draw = () => { if (!pile.length) pile = rng.shuffle(CARD_IDS.flatMap(id => Array(CARDS[id].w).fill(id))); return pile.pop(); };
  const hand = new Map(pids.map(p => [p, Array.from({ length: handN }, draw)]));
  const play = new Map(pids.map(p => [p, []])), vote = new Map(), score = Object.fromEntries(pids.map(p => [p, 0]));
  let m = [RULES.begin, RULES.begin, RULES.begin], phase = 'ready', beat = -1, left = RULES.start, time = meta.seconds, over = false, success = false, wind = [0, 0, 0], last = null, voteOrder = [];
  const events = [];

  function nextBeat() {
    beat++; phase = 'beat'; left = RULES.beat; vote.clear(); voteOrder = [];
    for (const p of pids) play.set(p, []);
    wind = [0, 0, 0]; for (let k = windFor(n, beat); k > 0; k--) wind[rng.int(0, 2)]--;
  }
  function chosen() {
    const ev = EVENTS[order[beat]], counts = ev.ch.map(() => 0);
    for (const c of vote.values()) counts[c]++;
    const best = Math.max(...counts);
    if (best === 0) return 0;
    return voteOrder.find(c => counts[c] === best);        // a tie goes to the choice that got its first vote first
  }
  function resolve() {
    const ev = EVENTS[order[beat]], ch = chosen(), before = m.slice();
    for (const [k, v] of Object.entries(ev.hit)) m[METERS.indexOf(k)] += v;
    for (const [k, v] of Object.entries(ev.ch[ch].fx)) m[METERS.indexOf(k)] += v;
    for (let i = 0; i < 3; i++) m[i] += wind[i];
    const played = [];
    for (const p of pids) {
      const h = hand.get(p), picks = play.get(p).slice().sort((a, b) => b - a);
      for (const i of picks) { const id = h[i]; const got = applyCard(m, CARDS[id].fx); score[p] += got; played.push([p, id, got]); h.splice(i, 1); }
      while (h.length < handN) h.push(draw());
    }
    const dead = m.some(v => v <= 0);
    m = m.map(clamp);
    last = { beat, ch, d: m.map((v, i) => v - before[i]), played };
    events.push({ e: 'resolve', ...last, m: m.slice() });
    if (dead) { over = true; success = false; phase = 'end'; left = 0; events.push({ e: 'end', ok: 0 }); return; }
    if (beat + 1 >= RULES.beats) { phase = 'end'; left = RULES.end; success = true; events.push({ e: 'end', ok: 1 }); return; }
    nextBeat();
  }
  const ready = () => pids.every(p => vote.has(p) && play.get(p).length >= Math.min(cpb, hand.get(p).length));
  return {
    events,
    init: () => ({ beats: RULES.beats, per: cpb, max: RULES.max, solo: n === 1 }),
    act(pid, a, d) {
      if (phase !== 'beat' || !pids.includes(pid)) return;
      const ev = EVENTS[order[beat]];
      if (a === 'vote') { if (!Number.isInteger(d) || d < 0 || d >= ev.ch.length) return; vote.set(pid, d); if (!voteOrder.includes(d)) voteOrder.push(d); }
      else if (a === 'play') {
        const P = play.get(pid); if (!Number.isInteger(d) || d < 0 || d >= hand.get(pid).length) return;
        const at = P.indexOf(d);
        if (at >= 0) P.splice(at, 1); else { P.push(d); if (P.length > cpb) P.shift(); }
      } else return;
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
      const g = { ph: phase, beat, m: m.slice(), sc: { ...score }, left: Math.max(0, Math.ceil(time)) };
      if (phase === 'beat') {
        const ev = EVENTS[order[beat]], counts = ev.ch.map(() => 0); for (const c of vote.values()) counts[c]++;
        g.ev = order[beat]; g.wind = wind.slice(); g.votes = counts; g.bl = Math.max(0, Math.ceil(left));
        g.done = pids.filter(p => play.get(p).length >= Math.min(cpb, hand.get(p).length));
        g.voted = pids.filter(p => vote.has(p));
      }
      if (last) g.last = last;
      if (phase === 'end') g.ok = success ? 1 : 0;
      return g;
    },
    priv: pid => ({ hand: hand.get(pid).slice(), play: play.get(pid).slice(), vote: vote.has(pid) ? vote.get(pid) : null }),
    get over() { return over; },
    result: () => ({ coop: { success: success && !m.some(v => v <= 0) }, order: [pids.slice()], scores: { ...score }, unit: meta.unit }),
  };
}
