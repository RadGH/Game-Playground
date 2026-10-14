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
};
export const withBots = P => { P.botAct = (p, meta) => UI_BOTS[meta.id]?.(p); return P; };
