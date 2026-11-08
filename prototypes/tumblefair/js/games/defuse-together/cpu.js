// Defuse Together CPU: plays every role with taps only. Holding the device it calls out the clue after a moment and
// cuts the wire it is sent (or, holding the whole book itself, the one its own book names). Holding the book it
// looks down its page for the called clue — longer pages and the near-twin words take longer — and sends the line;
// Family sometimes misreads a near-twin and sends the wrong one. It never cuts a wire blind.
import { by, readDelay, slip } from '../cpu-kit.js';
import { solve } from './sim.js';

/** Seconds to talk one clue through, by CPU skill (Expansion 1 M2). */
export const TALK = { family: 7, normal: 6, tricky: 3.5 };

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const wait = (key, s) => { if (mem.key !== key) { mem.key = key; mem.at = mem.t + s; } return mem.t >= mem.at; };
  return {
    tick(v) {
      const g = v.g, p = v.priv; mem.t = v.t;
      if (!g || !p || g.phase !== 'go' || p.mod !== g.mod) return;
      const tag = g.mod + ':' + g.mistakes;
      if (p.role === 'op') {
        const own = p.lines?.length ? solve(g.dev, p.lines) : null;          // alone with the whole book
        if (own) { if (wait('own' + tag, readDelay(sk, c.rng, 1.2 + p.lines.length * 0.35))) v.act('cut', own[0][1]); return; }
        if (!g.called) { if (wait('call' + tag, readDelay(sk, c.rng, 0.5))) v.act('call'); return; }
        if (!g.hint) return;
        const i = g.dev.w.indexOf(g.hint.col);
        if (i >= 0 && !g.dev.cut[i] && wait('cut' + tag + ':' + g.hint.by + g.hint.col, readDelay(sk, c.rng, 0.3))) v.act('cut', i);
        return;
      }
      if (!g.called || (g.hint && g.hint.v === g.dev.v)) return;            // nothing called yet / the right line is already in
      const i = p.lines.findIndex(l => l.v === g.dev.v); if (i < 0) return;
      // M2 (2026-11-07): plus the time a person takes to say a clue out loud and be understood — without it a CPU team
      // cleared all five modules in ~20 s, where real tables take over a minute (live: 74 s of the clock)
      const look = by(sk, [0.65, 0.45, 0.32]) * p.lines.length + (p.kind === 'word' ? by(sk, [1.6, 1, 0.6]) : 0) + by(sk, [TALK.family, TALK.normal, TALK.tricky]);
      if (!wait('tell' + tag + ':' + (g.hint ? g.hint.v : ''), readDelay(sk, c.rng, 0.6) + look)) return;
      let d = i;
      if (p.kind === 'word' && slip(sk, c.rng, 0.6)) {                       // misread the near-twin spelling
        const twin = p.lines.findIndex(l => l.v !== g.dev.v && l.v.slice(0, 4) === String(g.dev.v).slice(0, 4)); if (twin >= 0) d = twin;
      }
      mem.key = null; v.act('tell', d);
    },
  };
}
