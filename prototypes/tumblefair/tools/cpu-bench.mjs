#!/usr/bin/env node
// CPU bench (Expansion 1, M1): plays minigames headless with CPUs and prints how often each CPU skill beats a Normal
// "reference" player (the same game's CPU at Normal, standing in for a person). Ties count half.
//
//   node prototypes/tumblefair/tools/cpu-bench.mjs [ids…] [--seeds 10] [--players 2] [--quiet]
//   (no ids = every game that has a cpu.js)
//
// What good looks like: Family well under 0.5 (it rarely beats the reference), Normal about 0.5, Tricky over 0.5.
// Co-op games print the team's success rate per skill instead. A CPU that throws is reported (it is benched in a room).
import { CPUS, simulateGame, SKILL_IDS } from '../js/sim/cpu.js';
import { GAMES } from '../js/games/index.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const seeds = +opt('--seeds', 10), want = +opt('--players', 2), quiet = args.includes('--quiet');
const ids = args.filter(a => !a.startsWith('--'));
const list = (ids.length ? ids : Object.keys(CPUS)).filter(id => { if (!GAMES[id]) { console.log(`${id}: no such game`); return false; } if (!CPUS[id]) { console.log(`${id}: no cpu.js`); return false; } return true; });

export function benchGame(id, { seeds = 10, players = 2 } = {}) {
  const m = GAMES[id].meta, n = Math.max(m.min, Math.min(m.max, players)), coop = m.scoring === 'coop';
  const out = { id, n, coop, rows: {}, errors: [], unfinished: 0 };
  for (const sk of SKILL_IDS) {
    let share = 0, games = 0, ok = 0, cpuSum = 0, refSum = 0;
    for (let s = 1; s <= seeds; s++) {
      const seats = [{ skill: 'normal' }, ...Array.from({ length: n - 1 }, () => ({ skill: sk }))];
      const r = simulateGame({ id, seats, seed: s * 7919 + 13, log: (k, d) => out.errors.push(d.msg) });
      if (!r.ended && r.steps < Math.ceil((m.seconds + 3) / 0.05)) out.unfinished++;
      games++;
      const res = r.result, ref = r.pids[0], cpus = r.pids.slice(1);
      if (coop) { ok += res.coop?.success ? 1 : 0; continue; }
      const sc = res.scores || {}; refSum += +sc[ref] || 0; cpuSum += cpus.reduce((a, p) => a + (+sc[p] || 0), 0) / cpus.length;
      // the CPU side wins if its best placed CPU is ahead of the reference; the same group = a tie
      const place = pid => res.order.findIndex(g => g.includes(pid));
      const best = Math.min(...cpus.map(place)), rp = place(ref);
      share += best < rp ? 1 : best === rp ? 0.5 : 0;
    }
    out.rows[sk] = coop ? { success: ok / games } : { win: share / games, cpu: cpuSum / games, ref: refSum / games };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now(), all = [];
  for (const id of list) {
    const b = benchGame(id, { seeds, players: want }); all.push(b);
    const f = x => x.toFixed(2).padStart(5);
    const line = b.coop ? SKILL_IDS.map(sk => `${sk} ${f(b.rows[sk].success)}`).join('  ') : SKILL_IDS.map(sk => `${sk} ${f(b.rows[sk].win)} (${b.rows[sk].cpu.toFixed(1)} v ${b.rows[sk].ref.toFixed(1)})`).join('  ');
    if (!quiet) console.log(`${id.padEnd(24)} n=${b.n} ${b.coop ? 'co-op success: ' : 'cpu beats ref: '}${line}${b.unfinished ? `  UNFINISHED x${b.unfinished}` : ''}${b.errors.length ? `  ERRORS: ${[...new Set(b.errors)].join(' | ')}` : ''}`);
  }
  const comp = all.filter(b => !b.coop), avg = sk => comp.reduce((a, b) => a + b.rows[sk].win, 0) / (comp.length || 1);
  console.log(`\n${all.length} games, ${seeds} seeds each, ${((Date.now() - t0) / 1000).toFixed(1)} s. Average CPU win share vs a Normal reference: ${SKILL_IDS.map(sk => `${sk} ${avg(sk).toFixed(2)}`).join(', ')}`);
}
