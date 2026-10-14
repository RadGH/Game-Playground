// CIRCUIT SCRAMBLE — co-op. A shared board of wire tiles; the board is split into parts and each player may only turn
// the tiles in their own part (tap = a quarter turn clockwise). Power flows from the battery along wires whose ends
// meet; when every machine (a bulb) lights, the stage is cleared and a bigger board comes up. Everyone scores the
// number of stages cleared; the team wins if it clears the target before the clock runs out.
//
// A board is built solved and then scrambled, so it can always be solved: a random spanning tree over the grid gives
// every tile its wires (a tree reaches every cell, so the battery reaches every bulb), the battery and the bulbs are
// fixed tiles, and every other tile is turned a random number of quarter turns (re-rolled if it came out solved).
export const meta = {
  id: 'circuit-scramble', title: 'Circuit Scramble', blurb: 'Rotate the tiles together to power the machine!',
  how: ['Tap your tiles to turn them. You can only turn tiles in your colour.', 'Join the wires from the battery to every bulb.', 'Light them all to clear the board. Clear enough boards as a team to win!'],
  kind: 'ui', min: 1, max: 4, seconds: 64, scoring: 'coop', unit: 'boards', tags: ['coop', 'puzzle'], card: 'card-circuit-scramble', css: true,
};
export const N = 1, E = 2, S = 4, W = 8;
const DIRS = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
export const STAGES = [{ w: 3, h: 3, bulbs: 1 }, { w: 4, h: 4, bulbs: 1 }, { w: 5, h: 4, bulbs: 2 }, { w: 5, h: 5, bulbs: 2 }, { w: 6, h: 5, bulbs: 3 }, { w: 6, h: 6, bulbs: 3 }];
export const GAME_S = 60, CLEAR_S = 1.8;
export const TARGET = { easy: 2, normal: 3, hard: 4 };

/** Turn a wire mask a quarter turn clockwise, `r` times. */
export const turn = (m, r = 1) => { for (let i = 0; i < (r & 3); i++) m = ((m << 1) | (m >> 3)) & 15; return m; };

/** A solved board: { w, h, tiles: [mask], src, bulbs: [index] }. */
export function makeBoard(rng, w, h, nBulbs) {
  const n = w * h, tiles = new Array(n).fill(0), seen = new Array(n).fill(false);
  const src = rng.int(0, n - 1), stack = [src]; seen[src] = true;
  while (stack.length) {                                                // randomised depth-first search: long winding wires
    const i = stack[stack.length - 1], x = i % w, y = (i / w) | 0;
    const next = DIRS.filter(([, dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx]; });
    if (!next.length) { stack.pop(); continue; }
    const [bit, dx, dy, back] = rng.pick(next), j = (y + dy) * w + x + dx;
    tiles[i] |= bit; tiles[j] |= back; seen[j] = true; stack.push(j);
  }
  // bulbs on dead ends, as far from the battery as possible
  const dist = new Array(n).fill(-1), q = [src]; dist[src] = 0;
  while (q.length) { const i = q.shift(); for (const j of links(tiles, w, h, i)) if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } }
  const leaf = i => i !== src && [N, E, S, W].filter(b => tiles[i] & b).length === 1;
  let ends = [...Array(n).keys()].filter(i => leaf(i) && dist[i] >= 2);              // never right beside the battery
  if (!ends.length) ends = [...Array(n).keys()].filter(leaf);                         // (a tree always has a leaf)
  ends = rng.shuffle(ends).sort((a, b) => dist[b] - dist[a]);
  const bulbs = ends.slice(0, Math.max(1, Math.min(nBulbs, ends.length)));
  return { w, h, tiles, src, bulbs };
}
/** Neighbours of cell i that i's wires reach AND that reach back. `tiles` are the current (turned) masks. */
export function links(tiles, w, h, i) {
  const out = [], x = i % w, y = (i / w) | 0;
  for (const [bit, dx, dy, back] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (!(tiles[i] & bit) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = ny * w + nx; if (tiles[j] & back) out.push(j);
  }
  return out;
}
/** Which cells the battery powers. */
export function powered(tiles, w, h, src) {
  const on = new Array(tiles.length).fill(false), q = [src]; on[src] = true;
  while (q.length) { const i = q.shift(); for (const j of links(tiles, w, h, i)) if (!on[j]) { on[j] = true; q.push(j); } }
  return on;
}
/** Who owns each cell: seat number, or -1 for the fixed battery and bulbs. The board is cut into one part per player. */
export function owners(w, h, seats, fixed) {
  const n = seats.length;
  return [...Array(w * h).keys()].map(i => {
    if (fixed.has(i)) return -1;
    const x = i % w, y = (i / w) | 0;
    const part = n === 4 ? (x >= w / 2 ? 1 : 0) + (y >= h / 2 ? 2 : 0) : Math.min(n - 1, Math.floor(x * n / w));
    return seats[part];
  });
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), seatOf = Object.fromEntries(players.map(p => [p.pid, p.seat]));
  const target = Math.max(1, (TARGET[difficulty] || TARGET.normal) - (pids.length === 1 ? 1 : 0));
  let stage = -1, board = null, rot = null, own = null, on = null, phase = 'play', left = GAME_S, clearLeft = 0, cleared = 0, over = false;
  const taps = Object.fromEntries(pids.map(p => [p, 0]));
  const cur = () => board.tiles.map((m, i) => turn(m, rot[i]));
  const lit = () => board.bulbs.every(b => on[b]);
  function next() {
    stage++;
    const S0 = STAGES[stage];
    for (let tries = 0; tries < 60; tries++) {                         // scramble; a board that comes out already lit is re-rolled
      if (tries % 10 === 0) board = makeBoard(rng, S0.w, S0.h, S0.bulbs);   // (and now and then a whole new board)
      const fixed = new Set([board.src, ...board.bulbs]);
      rot = board.tiles.map((_, i) => fixed.has(i) ? 0 : rng.int(0, 3));
      on = powered(cur(), S0.w, S0.h, board.src);
      if (!lit()) break;
    }
    own = owners(S0.w, S0.h, players.map(p => p.seat), new Set([board.src, ...board.bulbs]));
    phase = 'play';
  }
  next();
  return {
    init: () => ({ stages: STAGES.length, target, seconds: GAME_S }),
    act(pid, a, d) {
      if (over || phase !== 'play' || a !== 'rot' || !pids.includes(pid)) return;
      if (!Number.isInteger(d) || d < 0 || d >= board.tiles.length || own[d] !== seatOf[pid]) return;
      rot[d] = (rot[d] + 1) & 3; taps[pid]++;
      on = powered(cur(), board.w, board.h, board.src);
      if (lit()) { cleared++; phase = 'clear'; clearLeft = CLEAR_S; }
    },
    step(dt) {
      if (over) return;
      left -= dt;
      if (left <= 0) { left = 0; over = true; return; }
      if (phase === 'clear') { clearLeft -= dt; if (clearLeft <= 0) { if (stage + 1 >= STAGES.length) over = true; else next(); } }
    },
    state: () => ({
      phase, left: Math.max(0, Math.ceil(left)), stage, cleared, target, w: board.w, h: board.h, src: board.src, bulbs: board.bulbs,
      t: board.tiles.map(m => m.toString(16)).join(''), r: rot.join(''), o: own.map(o => o < 0 ? '-' : o).join(''), p: on.map(v => v ? 1 : 0).join(''),
    }),
    get over() { return over; },
    result() {
      return { coop: { success: cleared >= target }, order: [pids.slice()], scores: Object.fromEntries(pids.map(p => [p, cleared])), unit: meta.unit };
    },
  };
}
