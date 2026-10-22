// GOING, GOING, GONE! — a five-lot auction paid in ENERGY, not coins. Everyone starts with 20 energy for the whole
// game. All five lots are shown at the start (their worth in points), so you can plan. Each round you set a secret
// bid and lock it in; everyone's bid is revealed together.
//   A normal lot     goes to the highest bid, who pays it. A tie splits the points (rounded down) and every tied
//                    bidder pays. Nobody bids above 0: the lot goes unsold.
//   The mystery lot  is the same, but its worth (0-10) is only revealed when it sells.
//   The cursed lot   is worth -4, and goes to the LOWEST bid (every tied lowest takes the curse) — and everyone pays
//                    what they offered, so you have to spend something to dodge it.
// THE TWIST: while bidding you can RUMMAGE — mash the button and every 4 taps finds 1 energy (3 a round at most). But
// the rattle is public: everyone sees who is rummaging, which tells them who is planning a big bid.
// Most points after five lots wins; a tie on points goes to whoever has more energy left. Alone you bid against
// Auntie Gavel, a CPU bidder whose bids are rolled from the seed.
export const meta = {
  id: 'going-going-gone', title: 'Going, Going, Gone!', blurb: 'Bid your energy in secret and win the best lots!',
  how: ['Five lots, one pool of 20 energy for the whole auction.', 'Set a secret bid and lock it in. Highest bid wins the lot and pays.', 'Mash RUMMAGE for a little more energy, but everyone hears you.', 'Beware the cursed lot: the LOWEST bid gets stuck with it!'],
  kind: 'ui', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['chance', 'social'], card: 'card-going-going-gone', css: true,
};
export const ENERGY = 20, ROUNDS = 5, TAPS_PER = 4, MASH_CAP = 3, CURSE = -4;
export const SHOW_S = 2.5, BID_S = 7, REVEAL_S = 3.2, END_S = 3;
export const CPU_NAME = 'Auntie Gavel';
export const LOTS = {
  normal: ['Giant Plush Duck', 'Golden Teacup', 'Candyfloss Crown', 'Lucky Horseshoe', 'Singing Fish Trophy', 'Bottomless Popcorn Bucket',
    'Velvet Top Hat', 'Glow-in-the-dark Kite', 'Pet Rock (with a bow)', 'Carousel Horse', 'Tin Robot', 'Prize Pumpkin', 'Snow Globe of the Fair', 'Clockwork Mouse'],
  mystery: ['Mystery Box', 'Unlabelled Jar', 'Wobbling Parcel', 'Locked Suitcase'],
  cursed: ['Haunted Teapot', 'Grumpy Garden Gnome', 'Cursed Accordion', 'Squeaky Boot of Doom', 'Sulking Scarecrow'],
};

/** Settle one lot. bids: id -> bid (ids may include 'cpu'). -> { win: [ids], gain: id -> points, pay: id -> energy } */
export function settleLot(lot, bids) {
  const ids = Object.keys(bids), gain = {}, pay = {};
  for (const k of ids) { gain[k] = 0; pay[k] = 0; }
  if (!ids.length) return { win: [], gain, pay };
  if (lot.kind === 'cursed') {
    const low = Math.min(...ids.map(k => bids[k])), win = ids.filter(k => bids[k] === low);
    for (const k of ids) pay[k] = bids[k];
    for (const k of win) gain[k] = lot.v;
    return { win, gain, pay };
  }
  const top = Math.max(...ids.map(k => bids[k]));
  if (top <= 0) return { win: [], gain, pay };
  const win = ids.filter(k => bids[k] === top), share = Math.floor(lot.v / win.length);
  for (const k of win) { gain[k] = share; pay[k] = top; }
  return { win, gain, pay };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  // the five lots: three normal (different worths), one mystery, one cursed (never first or last)
  const vals = rng.shuffle([2, 3, 4, 5, 6, 7]).slice(0, 3);
  const names = rng.shuffle(LOTS.normal);
  const lots = vals.map((v, i) => ({ kind: 'normal', name: names[i], v }));
  lots.push({ kind: 'mystery', name: rng.pick(LOTS.mystery), v: rng.int(0, 10) });
  const order = rng.shuffle(lots);
  order.splice(rng.int(1, 3), 0, { kind: 'cursed', name: rng.pick(LOTS.cursed), v: CURSE });
  const ids = solo ? [...pids.map(String), 'cpu'] : pids.map(String);
  const energy = Object.fromEntries(ids.map(k => [k, ENERGY])), pts = Object.fromEntries(ids.map(k => [k, 0]));
  const cpuPlan = order.map(() => ({ r: rng.range(0.6, 1.4), lowball: rng.int(1, 3), mash: rng.int(0, MASH_CAP), mystery: rng.int(1, 6) }));
  let phase = 'show', round = -1, left = SHOW_S, over = false, step = 0;
  let bid = {}, locked = new Set(), taps = {}, found = {}, lastTap = {}, reveal = null;
  const sold = [];                                         // per round: { win: [ids], gain, v }

  function next() {
    round++; phase = 'bid'; left = BID_S;
    bid = Object.fromEntries(ids.map(k => [k, 0])); locked = new Set(); taps = Object.fromEntries(ids.map(k => [k, 0])); found = Object.fromEntries(ids.map(k => [k, 0]));
    if (solo) { const c = cpuPlan[round]; found.cpu = Math.min(c.mash, MASH_CAP); taps.cpu = found.cpu * TAPS_PER; energy.cpu += found.cpu; }
  }
  function cpuBid() {
    const lot = order[round], c = cpuPlan[round], e = energy.cpu;
    if (lot.kind === 'cursed') return Math.min(e, c.lowball);
    if (lot.kind === 'mystery') return Math.min(e, c.mystery);
    const rest = order.slice(round).filter(l => l.kind === 'normal').reduce((s, l) => s + l.v, 0) + 5;
    return Math.max(0, Math.min(e, Math.round(lot.v / rest * e * c.r * 1.6)));
  }
  function settle() {
    if (solo) bid.cpu = cpuBid();
    const lot = order[round], bids = {};
    for (const k of ids) bids[k] = Math.max(0, Math.min(energy[k], bid[k] | 0));
    const r = settleLot(lot, bids);
    for (const k of ids) { energy[k] -= r.pay[k]; pts[k] += r.gain[k]; }
    reveal = { bids, win: r.win, gain: r.gain, pay: r.pay, v: lot.v };
    sold.push({ win: r.win, gain: r.gain, v: lot.v });
    phase = 'reveal'; left = REVEAL_S;
  }
  const publicLots = () => order.map((l, i) => ({ kind: l.kind, name: l.name, v: l.kind === 'mystery' && i >= sold.length ? null : l.v, win: sold[i]?.win ?? null }));

  return {
    init: () => ({ energy: ENERGY, rounds: ROUNDS, solo, cpu: solo ? CPU_NAME : null, tapsPer: TAPS_PER, cap: MASH_CAP, curse: CURSE }),
    act(pid, a, d) {
      if (phase !== 'bid' || !pids.includes(pid)) return;
      const k = String(pid);
      if (a === 'bid') { if (!Number.isInteger(d) || d < 0 || d > energy[k]) return; bid[k] = d; locked.delete(pid); }
      else if (a === 'lock') {
        if (d === false) { locked.delete(pid); return; }
        if (d !== true) return;
        locked.add(pid); if (pids.every(p => locked.has(p))) left = Math.min(left, 0.6);
      } else if (a === 'mash') {
        if (locked.has(pid) || found[k] >= MASH_CAP || lastTap[k] === step) return;   // one tap counted a step (20 a second at most)
        lastTap[k] = step; taps[k]++;
        if (taps[k] % TAPS_PER === 0) { found[k]++; energy[k]++; }
      }
    },
    step(dt) {
      if (over) return;
      step++; left -= dt; if (left > 0) return;
      if (phase === 'show') next();
      else if (phase === 'bid') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), round, lots: publicLots(), energy: { ...energy }, pts: { ...pts } };
      if (phase === 'bid') { g.locked = pids.filter(p => locked.has(p)); g.rattle = { ...taps }; }
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv: pid => ({ bid: bid[String(pid)] ?? 0, locked: locked.has(pid), found: found[String(pid)] ?? 0, taps: taps[String(pid)] ?? 0 }),
    get over() { return over; },
    result() {
      const key = p => `${pts[p]}|${energy[p]}`, groups = new Map();
      const sorted = pids.slice().sort((a, b) => pts[b] - pts[a] || energy[b] - energy[a]);
      for (const p of sorted) { if (!groups.has(key(p))) groups.set(key(p), []); groups.get(key(p)).push(p); }
      return { order: [...groups.values()], scores: Object.fromEntries(pids.map(p => [p, pts[p]])), unit: meta.unit };
    },
  };
}
