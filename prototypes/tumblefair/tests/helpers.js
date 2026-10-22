// A pretend server for tests: a hub on a clock the test moves by hand, and fake phones that record what they are sent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHub } from '../js/sim/hub.js';
import { createProfiles } from '../js/sim/profiles.js';
import { cleanLook } from '../../thousandvale/js/sim/looks.js';
import { PROTOCOL, TICK_MS } from '../js/shared/protocol.js';
import { GAMES } from '../js/games/index.js';
import { runBall as prRun } from '../js/games/portal-routing/sim.js';
import { RULE as wrRule } from '../js/games/word-relay/sim.js';
import { WORDS as wrWords } from '../js/games/word-relay/words.js';
import { score as scScore } from '../js/games/safecracker/sim.js';

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
  // auction-of-chaos: bids a little on each lot (by pid and lot, never more than it has) and locks in
  'auction-of-chaos': P => {
    const g = P.last.s?.g, k = P.last.phase; if (g?.phase !== 'bid' || !k || k.acL === g.lot) return;
    k.acL = g.lot; P.send({ t: 'act', a: 'bid', d: Math.min(g.chips[P.pid], (P.pid + g.lot) % 4 + 1) }); P.send({ t: 'act', a: 'lock', d: true });
  },
  // treasure-map-bluff: says one thing, picks a route (by pid and round), locks in — once a round
  'treasure-map-bluff': P => {
    const g = P.last.s?.g, k = P.last.phase; if (g?.phase !== 'plan' || !k || k.tmR === g.round) return;
    k.tmR = g.round; P.send({ t: 'act', a: 'say', d: { k: 'safe', r: P.pid % 4 } });
    P.send({ t: 'act', a: 'pick', d: (P.pid + g.round) % 4 }); P.send({ t: 'act', a: 'lock', d: true });
  },
  // portal-routing: finds the gate settings that roll the marble home (tries them all), flips its own gates to match
  'portal-routing': P => {
    const g = P.last.s?.g, k = P.last.phase; if (!g || !k || g.phase === 'clear') return;
    const init = k.prInit || (k.prInit = P.got.findLast(m => m.t === 'phase' && m.phase === 'intro')?.init); if (!init) return;
    P.prTick = (P.prTick || 0) + 1; if (P.prTick % 4) return;
    const s = init.stages[g.stage], n = s.gates.length;
    if (k.prStage !== g.stage) { k.prStage = g.stage; k.prPlan = null; for (let m = 0; m < 1 << n && !k.prPlan; m++) { const st = [...Array(n).keys()].map(i => (m >> i) & 1); if (prRun(s, st) === 'goal') k.prPlan = st; } }
    const seat = P.room.members.find(m => m.pid === P.pid)?.seat;
    const i = k.prPlan ? s.gates.findIndex((ci, j) => s.cells[ci].own === seat && +g.st[j] !== k.prPlan[j]) : -1;
    if (i >= 0) P.send({ t: 'act', a: 'flip', d: i });
  },
  // word-relay: sends a dictionary word that fits the letter and rule (a different one per player), once a link, after a pause
  'word-relay': P => {
    const g = P.last.s?.g, k = P.last.phase; if (g?.phase !== 'go' || !k) return;
    if (k.wrLink !== g.link) { k.wrLink = g.link; k.wrWait = 20 + P.pid * 7; k.wrTry = 0; }
    if (--k.wrWait > 0 || k.wrTry >= 3 || g.got.some(x => x[0] === P.pid)) return;
    k.wrWait = 12; const t = wrRule[g.rule].test, seen = new Set([...g.chain.map(c => c[0]), ...g.got.map(x => x[1])]);
    const fits = wrWords.split(' ').filter(w => w[0] === g.letter && w.length >= 3 && t(w) && !seen.has(w));
    if (fits.length) P.send({ t: 'act', a: 'word', d: fits[(P.pid * 5 + k.wrTry++) % fits.length] });
  },
  // safecracker: guesses the first code that agrees with every answer so far (a small search), twice a second
  'safecracker': P => {
    const g = P.last.s?.g, me = P.last.gp?.d, k = P.last.phase; if (!g || !me || !k) return;
    const init = k.scInit || (k.scInit = P.got.findLast(m => m.t === 'phase' && m.phase === 'intro')?.init); if (!init) return;
    const L = init.levels[me.lvl]; if (!L || me.lock) return;
    P.scTick = (P.scTick || 0) + 1; if (P.scTick % 10) return;
    const key = me.lvl + ':' + me.guesses.length + ':' + JSON.stringify(me.seen); if (k.scKey === key) return; k.scKey = key;
    const hist = me.guesses.map(([gs, hit, near]) => ({ g: [...gs].map(Number), hit, near }));
    for (let n = 0; n < L.sym ** L.len; n++) {
      const c = []; for (let i = 0, v = n; i < L.len; i++, v = Math.floor(v / L.sym)) c.push(v % L.sym + 1);
      if (!L.rep && new Set(c).size < L.len) continue;
      if (Object.entries(me.seen || {}).some(([i, v]) => c[+i] !== v)) continue;
      if (hist.every(h => { const r = scScore(c, h.g); return r.hit === h.hit && r.near === h.near; })) { P.send({ t: 'act', a: 'guess', d: c }); return; }
    }
  },
  // monster-forecast: one pick a round while the tell plays (not always the right one)
  'monster-forecast': P => { const g = P.last.s?.g, k = P.last.phase; if (g?.phase !== 'tell' || !k || k.mfR === g.round) return; k.mfR = g.round; P.send({ t: 'act', a: 'pick', d: ['dodge', 'block', 'counter'][(P.pid + g.round) % 3] }); },
  // tile-flip-race: picks the first tile it may take (a different one by pid), skipping every third flip
  'tile-flip-race': P => {
    const g = P.last.s?.g, k = P.last.phase; if (g?.phase !== 'play' || !k || k.tfF === g.flip) return;
    const init = k.tfInit || (k.tfInit = P.got.findLast(m => m.t === 'phase' && m.phase === 'intro')?.init); if (!init) return;
    k.tfF = g.flip; if ((g.flip + P.pid) % 3 === 0) return;
    const me = String(init.who.findIndex(w => w.pid === P.pid)), homes = init.who.map(w => w.home), W = init.w, N = W * init.h;
    const near = i => [i - W, i + W, i % W ? i - 1 : -1, (i + 1) % W ? i + 1 : -1].some(j => j >= 0 && j < N && g.o[j] === me);
    const ok = []; for (let i = 0; i < N; i++) if (init.values[i] > 0 && g.o[i] !== me && !homes.includes(i) && near(i)) ok.push(i);
    if (ok.length) P.send({ t: 'act', a: 'pick', d: ok[P.pid % ok.length] });
  },
  // costume-catwalk: wears one piece in four slots, picks a pose, says ready; then votes for the next look along
  'costume-catwalk': P => {
    const g = P.last.s?.g, k = P.last.phase, me = P.last.gp?.d; if (!g || !k || !me?.tray) return;
    if (g.phase === 'dress' && !k.ckDressed) { k.ckDressed = true; for (const s of ['hat', 'top', 'bottom', 'prop']) P.send({ t: 'act', a: 'wear', d: { s, i: P.pid % me.tray[s].length } }); P.send({ t: 'act', a: 'pose', d: P.pid % 4 }); P.send({ t: 'act', a: 'done', d: true }); }
    if (g.phase === 'vote' && !k.ckVoted && me.mine != null && g.show.length > 1) { k.ckVoted = true; P.send({ t: 'act', a: 'vote', d: (me.mine + 1) % g.show.length }); }
  },
  // one-button-orchestra: counts its own clock from the first 'play' state and judges each note just after its time
  // (every seventh one missed, every third one only good)
  'one-button-orchestra': P => {
    const g = P.last.s?.g, k = P.last.phase; if (g?.phase !== 'play' || !k) return;
    const init = k.obInit || (k.obInit = P.got.findLast(m => m.t === 'phase' && m.phase === 'intro')?.init); if (!init) return;
    k.obT = (k.obT || 0) + 0.05; k.obN = k.obN ?? -1;
    const ss = 30 / init.chart.bpm;
    while (k.obN + 1 < init.chart.steps.length && init.chart.steps[k.obN + 1] * ss < k.obT - 0.05) { const n = ++k.obN; if ((n + P.pid) % 7) P.send({ t: 'act', a: 'hit', d: { n, q: (n + P.pid) % 3 ? 0 : 1 } }); }
  },
  // going-going-gone: rummages a little, bids a small amount, locks in — once a round
  'going-going-gone': P => {
    const g = P.last.s?.g, k = P.last.phase; if (g?.phase !== 'bid' || !k || k.ggR === g.round) return;
    k.ggR = g.round; P.send({ t: 'act', a: 'mash' });
    P.send({ t: 'act', a: 'bid', d: Math.min(g.energy[P.pid], (P.pid + g.round) % 5 + 1) }); P.send({ t: 'act', a: 'lock', d: true });
  },
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
  // writes a caption (a short one, then submits), then votes for the next caption along that is not its own
  'caption-clash': P => {
    const g = P.last.s?.g, k = P.last.phase, me = P.last.gp?.d; if (!g || !k || !me?.starters) return;
    if (g.phase === 'write' && !k.ccWrote) { k.ccWrote = true; P.send({ t: 'act', a: 'cap', d: `${me.starters[0]} bot ${P.pid}` }); P.send({ t: 'act', a: 'done', d: true }); }
    if (g.phase === 'vote' && !k.ccVoted && me.mine != null && g.caps.length > 1) { k.ccVoted = true; P.send({ t: 'act', a: 'vote', d: (me.mine + 1) % g.caps.length }); }
  },
  // taps one tile per round (not always the right one)
  'pattern-impostor': P => { const g = P.last.s?.g, k = P.last.phase; if (g?.phase === 'play' && g.items && k && k.piR !== g.round) { k.piR = g.round; P.send({ t: 'act', a: 'tap', d: (P.pid * 3 + g.round) % g.items.split(',').length }); } },
  // a different split each round, then locks in
  'coinstorm': P => { const g = P.last.s?.g, k = P.last.phase; if (g?.phase === 'pick' && k && k.cnR !== g.round) { k.cnR = g.round; const m = (P.pid + g.round) % 5, c = g.f >= 50 ? 3 : 0; P.send({ t: 'act', a: 'set', d: [10 - m - c, m, c] }); P.send({ t: 'act', a: 'lock', d: true }); } },
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
