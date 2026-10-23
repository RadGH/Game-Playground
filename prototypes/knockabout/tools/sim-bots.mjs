#!/usr/bin/env node
// Knockabout — headless bot matches for balance.
//   node prototypes/knockabout/tools/sim-bots.mjs [--arena saw-pit] [--mode versus|teams|waves|all] [--runs 3]
//        [--fighters 4] [--level normal] [--seed 1] [--json]
// Prints, per arena and mode: how long rounds/waves last, how fighters go out (ring / spikes / fire / crush),
// knockdowns, punches landed, throws, and the sim's cost per step (average and worst, in ms).

import { createMatch, ARENAS } from '../js/sim/match.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const arenas = opt('arena') ? [opt('arena')] : ARENAS.map((a) => a.id);
const modeArg = opt('mode', 'versus');
const modes = modeArg === 'all' ? ['versus', 'teams', 'waves'] : [modeArg];
const runs = +opt('runs', 3);
const nf = +opt('fighters', 4);
const level = opt('level', 'normal');
const seed0 = +opt('seed', 1);
const maxSecs = +opt('max', 900);

export function runMatch({ arena, mode, fighters = 4, level = 'normal', seed = 1, maxSecs = 900, rounds }) {
  const players = Array.from({ length: mode === 'waves' ? Math.min(fighters, 3) : fighters }, (_, i) => ({ pid: i + 1, cpu: true, level, team: i % 2 }));
  const m = createMatch({ arena, mode, players, seed, difficulty: 'normal', rounds: rounds || (mode === 'waves' ? undefined : 2), waves: mode === 'waves' ? 5 : undefined });
  const st = { rounds: [], outs: {}, downs: 0, hits: 0, throws: 0, hazards: {}, stepMs: [], worstMs: 0, secs: 0, waves: 0, credited: 0, outsTotal: 0 };
  let roundStart = null;
  const last = {}; // pid -> { throw, down, hazard, hit } times
  st.why = {};
  const mark = (pid, k) => { (last[pid] = last[pid] || {})[k] = m.time(); };
  const dt = 1 / 60;
  let steps = 0;
  while (!m.over && steps < maxSecs * 60) {
    const t0 = process.hrtime.bigint();
    m.step(dt);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (steps > 60) { st.stepMs.push(ms); if (ms > st.worstMs) st.worstMs = ms; }
    steps++;
    for (const e of m.events.splice(0)) {
      if (e.e === 'fight') roundStart = m.time();
      else if (e.e === 'round' || (e.e === 'wave' && e.n > 1)) { if (roundStart != null) st.rounds.push(m.time() - roundStart); roundStart = null; }
      else if (e.e === 'out') {
        st.outs[e.how] = (st.outs[e.how] || 0) + 1; st.outsTotal++; if (e.by != null) st.credited++;
        const l = last[e.pid] || {}; const ago = (k) => (l[k] != null ? m.time() - l[k] : 99);
        const why = ago('throw') < 3 ? 'thrown' : ago('hazard') < 3 ? 'hazard-hit' : ago('down') < 3 ? 'knocked-down' : ago('hit') < 2 ? 'punched' : 'walked';
        st.why[why] = (st.why[why] || 0) + 1;
      }
      else if (e.e === 'down') { st.downs++; mark(e.pid, 'down'); }
      else if (e.e === 'punch' && e.hit != null) { st.hits++; mark(e.hit, 'hit'); }
      else if (e.e === 'throw') { st.throws++; if (typeof e.who === 'number') mark(e.who, 'throw'); }
      else if (e.e === 'glitch') { st.glitches = (st.glitches || 0) + 1; }
      else if (e.e === 'hazard') { st.hazards[e.kind] = (st.hazards[e.kind] || 0) + 1; mark(e.pid, 'hazard'); }
    }
  }
  st.secs = m.time();
  st.over = m.over;
  st.result = m.over ? m.result() : null;
  st.waves = m.score.waves || 0;
  return st;
}

function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1].endsWith('sim-bots.mjs')) {
  const all = [];
  for (const arena of arenas) for (const mode of modes) {
    const agg = { why: {}, rounds: [], outs: {}, downs: 0, hits: 0, throws: 0, hazards: {}, ms: [], worst: 0, unfinished: 0, waves: [], credited: 0, outsTotal: 0, secs: [] };
    for (let r = 0; r < runs; r++) {
      const st = runMatch({ arena, mode, fighters: nf, level, seed: seed0 + r * 101, maxSecs });
      agg.rounds.push(...st.rounds); agg.downs += st.downs; agg.hits += st.hits; agg.throws += st.throws;
      for (const [k, v] of Object.entries(st.outs)) agg.outs[k] = (agg.outs[k] || 0) + v;
      for (const [k, v] of Object.entries(st.why)) agg.why[k] = (agg.why[k] || 0) + v;
      for (const [k, v] of Object.entries(st.hazards)) agg.hazards[k] = (agg.hazards[k] || 0) + v;
      agg.ms.push(...st.stepMs); agg.worst = Math.max(agg.worst, st.worstMs);
      if (!st.over) agg.unfinished++;
      agg.waves.push(st.waves); agg.glitches = (agg.glitches || 0) + (st.glitches || 0); agg.credited += st.credited; agg.outsTotal += st.outsTotal; agg.secs.push(st.secs);
    }
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const sorted = agg.ms.slice().sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const row = {
      arena, mode, runs, roundsAvg: fmt(avg(agg.rounds)), roundsMin: fmt(Math.min(...agg.rounds, Infinity)), roundsMax: fmt(Math.max(...agg.rounds, 0)), nRounds: agg.rounds.length,
      outs: agg.outs, why: agg.why, creditedPct: agg.outsTotal ? Math.round(agg.credited / agg.outsTotal * 100) : 0,
      downsPerRound: fmt(agg.downs / Math.max(1, agg.rounds.length)), hits: agg.hits, throws: agg.throws, hazardHits: agg.hazards,
      msAvg: avg(agg.ms).toFixed(3), msP99: p99.toFixed(3), msWorst: agg.worst.toFixed(2), unfinished: agg.unfinished, glitches: agg.glitches || 0,
      wavesCleared: mode === 'waves' ? agg.waves.join('/') : undefined, matchSecs: agg.secs.map((s) => Math.round(s)).join('/'),
    };
    all.push(row);
    if (!flag('json')) {
      console.log(`\n${arena} / ${mode}  (${runs} matches, ${mode === 'waves' ? Math.min(nf, 3) : nf} ${level} bots)`);
      console.log(`  ${mode === 'waves' ? 'waves' : 'rounds'}: ${row.nRounds}, avg ${row.roundsAvg}s (min ${row.roundsMin}, max ${row.roundsMax}); match secs ${row.matchSecs}; unfinished ${row.unfinished}${row.glitches ? '; GLITCHES ' + row.glitches : ''}`);
      console.log(`  outs: ${JSON.stringify(row.outs)} why ${JSON.stringify(row.why)} credited ${row.creditedPct}%  | knockdowns/round ${row.downsPerRound}, hits ${row.hits}, throws ${row.throws}`);
      console.log(`  hazard hits: ${JSON.stringify(row.hazardHits)}${mode === 'waves' ? '  waves cleared ' + row.wavesCleared : ''}`);
      console.log(`  step cost: avg ${row.msAvg} ms, p99 ${row.msP99} ms, worst ${row.msWorst} ms`);
    }
  }
  if (flag('json')) console.log(JSON.stringify(all, null, 1));
}
