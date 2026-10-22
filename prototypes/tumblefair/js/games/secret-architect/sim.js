// SECRET ARCHITECT — co-op. Each round one player is the ARCHITECT (it rotates, so everyone gets a turn) and privately
// sees a blueprint: a little picture of blocks on a 6 x 6 grid. Everyone else is a BUILDER with an empty 6 x 6 grid on
// their phone, tapping cells to place blocks. The Architect may not draw it for them — only:
//   * 3 PINS ("a block goes here") and 2 CROSSES ("nothing here"), shown on every builder's grid;
//   * 6 MESSAGES from a list of canned lines ("It's tall and thin", "Move it all left", "Getting close!"…); saying the
//     blueprint's name ("It's a sailing boat!") is one of them and can be used once.
// The Architect sees every builder's grid live, with how close it is, so the lines can steer.
// Scoring: a builder's match = blocks in both / blocks in either, as a percentage (filling everything does not help).
// Builders score their match; the Architect scores half the builders' average. The team wins together when the
// builders' average match over the whole game is at least 50%. Ties on points go to whoever used fewer messages as
// Architect (printed on the card), which also settles a 2-player game.
// Solo: three rounds. The blueprint is shown for 4 s, then you build it from memory against the clock; one "peek
// again" per round shows it for 1.5 s. 50% average to pass.
import { GRID, SHAPES } from './shapes.js';

export const meta = {
  id: 'secret-architect', title: 'Secret Architect', blurb: 'Guide your builders to the secret blueprint, using only pins and a few words!',
  how: ['Each round one of you is the Architect and sees a secret blueprint.', 'The others build on their phones. The Architect can only place 3 pins, 2 crosses and send 6 short messages.', 'The closer each build is, the more points. Everyone gets a turn as Architect.', 'Builders averaging 50% or better is a team win!'],
  kind: 'ui', min: 1, max: 4, seconds: 88, scoring: 'coop', unit: 'points', tags: ['social', 'coop', 'puzzle'], card: 'card-secret-architect', css: true,
};
export const CELLS = GRID * GRID, PINS = 3, CROSSES = 2, MSGS = 6, NEED = 50;
export const PEEK_S = 2.5, SHOW_S = 3.5, SOLO_PEEK_S = 4, SOLO_BUILD_S = 16, SOLO_ROUNDS = 3, REPEEK_S = 1.5;
export const buildSeconds = n => ({ 2: 30, 3: 21, 4: 15 })[n] || 16;
export const LINES = {
  tall: "It's tall and thin", wide: "It's wide and flat", sym: 'Same on both sides', hole: 'It has a hole in it',
  top: 'Mostly at the top', bottom: 'Mostly at the bottom', left: 'Mostly on the left', right: 'Mostly on the right',
  middle: 'Fill the middle', corners: 'Nothing in the corners', more: 'Add more blocks', fewer: 'Too many blocks',
  warm: 'Getting close!', cold: 'Way off!', shiftL: 'Move it all left', shiftR: 'Move it all right',
  shiftU: 'Move it all up', shiftD: 'Move it all down', stop: 'Perfect, stop!',
};
export const toBits = rows => rows.join('').replace(/#/g, '1').replace(/\./g, '0');
/** Blocks in both / blocks in either, as a whole percentage. */
export function match(target, grid) {
  let both = 0, either = 0;
  for (let i = 0; i < CELLS; i++) { const a = target[i] === '1', b = grid[i] === '1'; if (a && b) both++; if (a || b) either++; }
  return either ? Math.round(100 * both / either) : 0;
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), n = pids.length, solo = n === 1;
  const rounds = solo ? SOLO_ROUNDS : n, BUILD_S = solo ? SOLO_BUILD_S : buildSeconds(n);
  const easy = rng.shuffle(SHAPES.filter(s => s.easy)), hard = rng.shuffle(SHAPES.filter(s => !s.easy));
  const plan = Array.from({ length: rounds }, (_, r) => (n >= 4 || r % 2 === 0 ? easy : hard).shift() || easy.shift());
  const score = Object.fromEntries(pids.map(p => [p, 0])), spent = Object.fromEntries(pids.map(p => [p, 0]));
  const builderMatches = [];
  let phase = 'peek', round = 0, left = solo ? SOLO_PEEK_S : PEEK_S, over = false;
  let grids = {}, marks = [], msgs = [], named = false, repeek = 0, peekLeft = 0, shown = null, done = new Set();

  const arch = () => (solo ? null : pids[round % n]);
  const builders = () => (solo ? pids : pids.filter(p => p !== arch()));
  const target = () => toBits(plan[round].rows);
  function begin() {
    grids = Object.fromEntries(builders().map(p => [p, '0'.repeat(CELLS)]));
    marks = []; msgs = []; named = false; done = new Set(); repeek = solo ? 1 : 0; peekLeft = 0; shown = null;
  }
  function settle() {
    const t = target(), m = Object.fromEntries(builders().map(p => [p, match(t, grids[p])]));
    for (const p of builders()) { score[p] += m[p]; builderMatches.push(m[p]); }
    const avg = builders().length ? builders().reduce((a, p) => a + m[p], 0) / builders().length : 0;
    let archGot = 0;
    if (!solo) { archGot = Math.round(avg / 2); score[arch()] += archGot; spent[arch()] += msgs.length; }
    shown = { target: t, name: plan[round].name, grids: { ...grids }, match: m, arch: arch(), archGot };
    phase = 'show'; left = SHOW_S;
  }
  const teamAvg = () => (builderMatches.length ? Math.round(builderMatches.reduce((a, b) => a + b, 0) / builderMatches.length) : 0);
  begin();

  return {
    init: () => ({ grid: GRID, rounds, solo, pins: PINS, crosses: CROSSES, msgs: MSGS, need: NEED, lines: LINES, arch: solo ? [] : pids.slice() }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'build' && pid in grids) {
        if (a === 'tap') {
          if (!Number.isInteger(d) || d < 0 || d >= CELLS) return;
          const g = grids[pid]; grids[pid] = g.slice(0, d) + (g[d] === '1' ? '0' : '1') + g.slice(d + 1); done.delete(pid);
        } else if (a === 'clear') grids[pid] = '0'.repeat(CELLS);
        else if (a === 'done') { if (d === false) { done.delete(pid); return; } done.add(pid); if (builders().every(p => done.has(p))) left = Math.min(left, 1); }
        else if (a === 'peek' && solo && repeek > 0) { repeek--; peekLeft = REPEEK_S; }
        return;
      }
      if ((phase === 'build' || phase === 'peek') && pid === arch()) {
        if (a === 'mark') {
          if (!d || typeof d !== 'object' || !Number.isInteger(d.c) || d.c < 0 || d.c >= CELLS || (d.k !== 'p' && d.k !== 'x')) return;
          if (marks.some(m => m[0] === d.c)) return;
          if (marks.filter(m => m[1] === d.k).length >= (d.k === 'p' ? PINS : CROSSES)) return;
          marks.push([d.c, d.k]);
        } else if (a === 'say') {
          if (msgs.length >= MSGS) return;
          if (d === 'name') { if (named) return; named = true; msgs.push('name'); }
          else if (typeof d === 'string' && Object.hasOwn(LINES, d)) msgs.push(d);
        }
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; if (peekLeft > 0) peekLeft = Math.max(0, peekLeft - dt);
      if (left > 1e-9) return;
      if (phase === 'peek') { phase = 'build'; left = BUILD_S; }
      else if (phase === 'build') settle();
      else if (round + 1 < rounds) { round++; begin(); phase = 'peek'; left = solo ? SOLO_PEEK_S : PEEK_S; }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), arch: arch(), marks, msgs: msgs.map(k => (k === 'name' ? `It's ${plan[round].name}!` : LINES[k])), scores: { ...score }, team: teamAvg() };
      if (phase === 'build') { g.blocks = Object.fromEntries(Object.entries(grids).map(([p, b]) => [p, b.split('1').length - 1])); g.done = [...done]; }
      if (phase === 'show') g.shown = shown;
      return g;
    },
    priv(pid) {
      if (!pids.includes(pid)) return {};
      if (phase === 'show') return { role: pid === arch() ? 'arch' : 'build' };
      if (pid === arch()) return { role: 'arch', target: target(), name: plan[round].name, named, grids: { ...grids }, match: Object.fromEntries(Object.entries(grids).map(([p, b]) => [p, match(target(), b)])) };
      const see = solo && (phase === 'peek' || peekLeft > 0);
      return { role: 'build', grid: grids[pid] ?? null, target: see ? target() : null, repeek, done: done.has(pid) };
    },
    get over() { return over; },
    result() {
      if (phase === 'build' && !shown) settle();
      const ranked = pids.slice().sort((a, b) => score[b] - score[a] || spent[a] - spent[b]);
      const order = [];
      for (const p of ranked) { const g = order[order.length - 1]; if (g && score[g[0]] === score[p] && spent[g[0]] === spent[p]) g.push(p); else order.push([p]); }
      return { coop: { success: teamAvg() >= NEED }, order, scores: { ...score }, unit: meta.unit };
    },
  };
}
