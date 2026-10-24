// PATCHWORK PAL (Halloween only; round 12, built on Pin the Tail — the best-rated game, 9 to 0). A friendly stitched
// monster hangs in a picture frame with its face finished: googly eyes, a button nose, a stitched grin, a little hat,
// a neck bolt, a heart patch… For a few seconds you see where everything goes. Then the stitches pop and the parts fly
// off, leaving the bare face. One part at a time comes back on the tray ("Pin the HAT!"): tap where it goes, ONE tap,
// it sticks where you put it. Nobody sees anyone's face until the last part is on, then the GALLERY shows every
// player's monster side by side — usually very silly — with how close each part landed. Three monsters a game.
// Scoring per part: up to 5 for how close it is (none from NEAR away), +1 for a "perfect stitch" (within PERFECT).
// Difficulty: Easy shows the face longer and forgives more; Tricky adds a part and, from the second monster on, the
// bare face is hung a little higher, lower, bigger or smaller than it was shown (place parts on the FACE, not the
// spot on the screen). Alone: the same, with medals. Everything is from the seed; the parts' spots are in the state
// only while they are shown, and again in the gallery.
export const meta = {
  id: 'patchwork-pal', title: 'Patchwork Pal', blurb: 'Remember the monster\'s face, then stitch every part back on!',
  how: ['Look closely: the monster\'s eyes, nose, grin and hat are all in place.', 'Then they pop off! Each part comes back one at a time.', 'Tap ONCE where it goes. Closer = more points.', 'Then see everyone\'s silly monsters side by side!'],
  kind: 'ui', min: 1, max: 4, seconds: 76, scoring: 'points', unit: 'points', tags: ['puzzle', 'action', 'holiday'], season: 'halloween', card: 'card-patchwork-pal', css: true,
};
export const BW = 160, BH = 120, HEAD = [80, 66];
export const ROUNDS = 3, START_S = 2, PART_S = 4, REVEAL_S = 4, END_S = 3, ALL_IN_S = 0.4, PERFECT = 3, MAX_PART = 5;
export const LEVEL = {
  easy: { parts: 3, show: 4, near: 26, wriggle: false },
  normal: { parts: 3, show: 3, near: 22, wriggle: false },
  hard: { parts: 4, show: 3, near: 18, wriggle: true },
};
/** Where each part sits on the face (offset from the head centre) and how much its spot varies from monster to monster. */
export const PARTS = {
  eyeL: { at: [-13, -9], j: [4, 4], name: 'left eye' },
  eyeR: { at: [13, -9], j: [4, 4], name: 'right eye' },
  nose: { at: [0, 4], j: [4, 3], name: 'nose' },
  grin: { at: [0, 18], j: [6, 3], name: 'grin' },
  hat: { at: [0, -42], j: [9, 2], name: 'hat' },
  bolt: { at: [40, 14], j: [2, 6], side: true, name: 'bolt' },
  patch: { at: [22, 12], j: [4, 4], side: true, name: 'heart patch' },
  bow: { at: [24, -32], j: [5, 4], side: true, name: 'bow' },
};
export const PART_IDS = Object.keys(PARTS);
export const SHAPES = ['round', 'square', 'pear'];
export const SKINS = ['#8fd18a', '#b7a1e8', '#f4a6c0', '#9ad7e0', '#f2c26b', '#c9e27a'];
const r1 = v => Math.round(v * 10) / 10;
export const pointsFor = (d, near) => d == null ? 0 : Math.max(0, Math.round(MAX_PART * (1 - d / near))) + (d <= PERFECT ? 1 : 0);
/** Where a spot shown at `p` is on a face hung with transform `h` ({ dx, dy, s } around HEAD). */
export const moved = (p, h) => !h ? p : [r1(HEAD[0] + (p[0] - HEAD[0]) * h.s + h.dx), r1(HEAD[1] + (p[1] - HEAD[1]) * h.s + h.dy)];

/** One monster: its look, its parts (shown spots), the order they come back in, and how the bare face is hung. */
export function planMonster(rng, i, difficulty = 'normal') {
  const L = LEVEL[difficulty] || LEVEL.normal;
  const look = { shape: rng.pick(SHAPES), skin: rng.int(0, SKINS.length - 1), patch: rng.int(0, SKINS.length - 1), stitch: rng.int(0, 9) };
  const pool = rng.shuffle(PART_IDS), parts = [];
  for (const k of pool) {
    if (parts.length >= L.parts) break;
    const P = PARTS[k], side = P.side && rng.chance(0.5) ? -1 : 1;
    const x = r1(HEAD[0] + P.at[0] * side + rng.range(-P.j[0], P.j[0])), y = r1(HEAD[1] + P.at[1] + rng.range(-P.j[1], P.j[1]));
    if (parts.some(q => Math.hypot(q.x - x, q.y - y) < 12)) continue;                                 // two parts never share a spot
    parts.push({ k, x, y, f: side < 0 ? 1 : 0 });
  }
  const order = rng.shuffle(parts.map((_, j) => j));
  const hang = L.wriggle && i > 0 ? { dx: r1(rng.range(-14, 14)), dy: r1(rng.range(-6, 6)), s: +rng.range(0.85, 1.15).toFixed(2) } : null;
  return { look, parts, order, hang };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVEL[difficulty] || LEVEL.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = Array.from({ length: ROUNDS }, (_, i) => planMonster(rng, i, difficulty));
  const total = Object.fromEntries(pids.map(p => [p, 0]));
  const maxPts = plan.reduce((n, m) => n + m.parts.length * (MAX_PART + 1), 0);
  let phase = 'ready', round = -1, n = 0, left = START_S, over = false, pins = {}, gallery = null;
  const M = () => plan[round];
  function next() { round++; phase = 'show'; left = L.show; n = 0; pins = Object.fromEntries(pids.map(p => [p, Array(M().parts.length).fill(null)])); gallery = null; }
  function settle() {
    const m = M(), targets = m.parts.map(p => moved([p.x, p.y], m.hang)), dist = {}, gain = {};
    for (const p of pids) {
      dist[p] = m.parts.map((_, j) => pins[p][j] ? r1(Math.hypot(pins[p][j][0] - targets[j][0], pins[p][j][1] - targets[j][1])) : null);
      gain[p] = dist[p].reduce((s, d) => s + pointsFor(d, L.near), 0); total[p] += gain[p];
    }
    const best = Math.max(...pids.map(p => gain[p]));
    gallery = { targets, pins: Object.fromEntries(pids.map(p => [p, pins[p]])), dist, gain, best: best > 0 ? pids.filter(p => gain[p] === best) : [] };
    phase = 'gallery'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo, bw: BW, bh: BH, head: HEAD, near: L.near, perfect: PERFECT, max: maxPts, medals: [0.35, 0.55, 0.72].map(k => Math.round(maxPts * k)), skins: SKINS }),
    act(pid, a, d) {
      if (phase !== 'place' || a !== 'pin' || !pids.includes(pid)) return;
      if (!d || typeof d !== 'object' || d.n !== n || !Array.isArray(d.p) || d.p.length !== 2 || !d.p.every(v => typeof v === 'number' && Number.isFinite(v))) return;
      if (d.p[0] < 0 || d.p[0] > BW || d.p[1] < 0 || d.p[1] > BH) return;
      const j = M().order[n]; if (pins[pid][j]) return;                                           // one tap per part: it sticks
      pins[pid][j] = [r1(d.p[0]), r1(d.p[1])];
      if (pids.every(p => pins[p][j])) left = Math.min(left, ALL_IN_S);
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'show') { phase = 'place'; n = 0; left = PART_S; }
      else if (phase === 'place') { if (n + 1 < M().parts.length) { n++; left = PART_S; } else settle(); }
      else if (phase === 'gallery') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (round < 0 || phase === 'end') return g;
      const m = M(); g.look = m.look; g.count = m.parts.length;
      if (phase === 'show') g.parts = m.parts;
      if (phase === 'place') { const j = m.order[n]; g.n = n; g.cur = m.parts[j].k; g.cf = m.parts[j].f; g.hang = m.hang; g.placed = pids.filter(p => pins[p][j]); g.done = m.order.slice(0, n).map(i => m.parts[i].k); }
      if (phase === 'gallery') { g.hang = m.hang; g.parts = m.parts.map((p, j) => ({ k: p.k, f: p.f, x: gallery.targets[j][0], y: gallery.targets[j][1] })); g.gallery = { pins: gallery.pins, dist: gallery.dist, gain: gallery.gain, best: gallery.best }; }
      return g;
    },
    priv: pid => ({ pins: phase === 'place' && pins[pid] ? M().parts.map((p, j) => pins[pid][j] ? { k: p.k, f: p.f, p: pins[pid][j] } : null).filter(Boolean) : [] }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
    plan,
  };
}
