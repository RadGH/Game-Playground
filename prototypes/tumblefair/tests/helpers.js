// A pretend server for tests: a hub on a clock the test moves by hand, and fake phones that record what they are sent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHub } from '../js/sim/hub.js';
import { createProfiles } from '../js/sim/profiles.js';
import { cleanLook } from '../../thousandvale/js/sim/looks.js';
import { PROTOCOL, TICK_MS } from '../js/shared/protocol.js';
import { GAMES } from '../js/games/index.js';

const json = p => JSON.parse(readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8'));
export const DATA = { boards: { fairground: json('data/boards/fairground.json') }, chance: json('data/chance.json'), cosmetics: json('data/cosmetics.json') };

export function world({ seed = 7 } = {}) {
  let t = 1000, n = 0;
  const profiles = createProfiles({ cosmetics: DATA.cosmetics, cleanLook, randomToken: () => 'tok' + (++n), now: () => t });
  const hub = createHub({ now: () => t, data: DATA, profiles, seed });
  const phones = [];
  /** A fake phone. `bot: true` makes it play: it rolls, votes and presses things so a match can run to the end. */
  function phone({ token = null, bot = true } = {}) {
    const P = { got: [], last: {}, room: null, me: null, pid: null, phase: null, open: true, bot, seq: 0, game: null };
    const h = hub.accept({ ip: '10.0.0.' + (phones.length + 1), send: s => { if (!P.open) return; const m = JSON.parse(s); P.got.push(m); P.last[m.t] = m; on(m); } });
    P.send = m => h.message(JSON.stringify(m));
    P.close = () => { P.open = false; h.close(); };
    function on(m) {
      if (m.t === 'welcome') { P.token = m.token; P.me = m; }
      if (m.t === 'me') P.me = { ...P.me, ...m };
      if (m.t === 'wallet') P.me = { ...P.me, coins: m.coins };
      if (m.t === 'room') { P.room = m; P.pid = m.you; P.phase = m.phase; }
      if (m.t === 'phase') { P.phase = m.phase; if (m.phase === 'intro') P.game = m.game; }
    }
    /** What a bot does each tick. */
    P.act = () => {
      if (!P.bot || !P.open || !P.room) return;
      const seat = P.room.members.find(x => x.pid === P.pid)?.seat;
      if (seat == null) return;
      if (P.phase === 'board') { const b = P.last.bd; if (b?.ev === 'turn' && b.pid === P.pid) { P.last.bd = null; P.send({ t: 'roll' }); } if (b?.ev === 'ask' && b.pid === P.pid) { P.last.bd = null; P.send({ t: 'choose', i: 0 }); } }
      if (P.phase === 'vote' && !P.voted) { P.voted = true; P.send({ t: 'vote', i: (P.pid + P.room.match.round) % P.last.phase.options.length }); }
      if (P.phase !== 'vote') P.voted = false;
      if (P.phase === 'intro' || P.phase === 'results' || P.phase === 'final') { if (P.skipFor !== P.last.phase) { P.skipFor = P.last.phase; P.send({ t: 'skip' }); } }
      if (P.phase === 'game') {
        const meta = GAMES[P.game].meta;
        if (meta.kind === 'arena') { const a = (t / 700 + P.pid * 2.1); P.send({ t: 'in', s: ++P.seq, mx: Math.sin(a), mz: Math.cos(a * 0.7), b: (P.seq % 9 === 0) ? 1 : 0 }); }
        else P.botAct?.(P, meta);
      }
    };
    P.send({ t: 'hello', v: PROTOCOL, ...(token ? { token } : {}) });
    phones.push(P); return P;
  }
  function run(ms, until = null) {
    for (let e = 0; e < ms; e += TICK_MS) { t += TICK_MS; for (const p of phones) p.act(); hub.tick(); if (until && until()) return true; }
    return !until;
  }
  return { hub, profiles, phone, run, phones, get now() { return t; }, advance: ms => { t += ms; } };
}
/** Presses that make sense in each non-arena game, so bots can finish them. One entry per game id. */
export const UI_BOTS = {
  'trapdoor-treasury': P => { const g = P.last.s?.g; if (g?.phase === 'pick' && P.pickedRound !== g.round) { P.pickedRound = g.round; P.send({ t: 'act', a: 'pick', d: g.round % 3 === 0 ? 'bank' : (P.pid + g.round) % 3 }); } },
  // draws three lines and says done, then votes for the next picture along that is not its own
  'draw-the-disaster': P => {
    const g = P.last.s?.g, k = P.last.phase, me = P.last.gp?.d; if (!g?.judge || !k) return;
    if (g.phase === 'draw' && !k.ddDrew) { k.ddDrew = true; for (let s = 1; s <= 3; s++) P.send({ t: 'act', a: 'ink', d: { s, c: (P.pid + s) % 8, w: s & 1, p: [0, 1, 2, 3].map(i => ((P.pid * 37 + s * 50 + i * 20) & 255).toString(16).padStart(2, '0') + ((s * 60 + i * 15) & 255).toString(16).padStart(2, '0')).join('') } }); P.send({ t: 'act', a: 'done', d: true }); }
    if (g.phase === 'vote' && !k.ddVoted && me?.mine != null) { k.ddVoted = true; const n = P.room.members.filter(m => m.seat != null).length; P.send({ t: 'act', a: 'vote', d: n === 2 && P.pid % 2 ? 'both' : (me.mine + 1) % n }); }
  },
  // answers each question once, not always right
  'memory-heist': P => { const g = P.last.s?.g, k = P.last.phase; if (g?.phase === 'q' && g.q && k && k.mhQ !== g.qi) { k.mhQ = g.qi; P.send({ t: 'act', a: 'ans', d: (P.pid + g.qi) % g.q.opts.length }); } },
  // works out a rotation for every tile where all wire ends meet (a small backtracking search), then turns its own
  // tiles towards it a few times a second
  'circuit-scramble': P => {
    const g = P.last.s?.g; if (g?.phase !== 'play' || !g.o) return;
    P.csTick = (P.csTick || 0) + 1; if (P.csTick % 3) return;
    const key = g.stage + g.t; if (P.csKey !== key) { P.csKey = key; P.csPlan = solveWires(g); }
    const seat = String(P.room.members.find(m => m.pid === P.pid)?.seat);
    const i = [...g.o].findIndex((o, j) => o === seat && P.csPlan && +g.r[j] !== P.csPlan[j]);
    if (i >= 0) P.send({ t: 'act', a: 'rot', d: i });
  },
};
/** Test-bot helper: turns (0-3) for every Circuit Scramble tile so every wire end meets another and none leaves the board. */
function solveWires(g) {
  const w = g.w, h = g.h, base = [...g.t].map(c => parseInt(c, 16)), fixed = [...g.o].map(o => o === '-');
  const turn = (m, r) => { for (let k = 0; k < r; k++) m = ((m << 1) | (m >> 3)) & 15; return m; };
  const rot = new Array(w * h).fill(0), m = new Array(w * h).fill(0);
  const fits = i => { const x = i % w, y = (i / w) | 0, v = m[i];
    if ((y === 0 && v & 1) || (x === w - 1 && v & 2) || (y === h - 1 && v & 4) || (x === 0 && v & 8)) return false;
    if (y > 0 && !!(v & 1) !== !!(m[i - w] & 4)) return false;
    if (x > 0 && !!(v & 8) !== !!(m[i - 1] & 2)) return false;
    return true; };
  const go = i => { if (i === w * h) return true;
    for (const r of fixed[i] ? [0] : [0, 1, 2, 3]) { rot[i] = r; m[i] = turn(base[i], r); if (fits(i) && go(i + 1)) return true; }
    return false; };
  return go(0) ? rot : null;
}
export const withBots = P => { P.botAct = (p, meta) => UI_BOTS[meta.id]?.(p); return P; };
