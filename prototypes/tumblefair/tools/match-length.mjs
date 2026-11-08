#!/usr/bin/env node
// How long a whole match really takes (Expansion 1, M2 "Finish the night"). Plays matches headless on the test server
// (tests/helpers.js: a hub on a pretend clock, fake phones that roll, vote and play) and prints the minutes from Start
// to the final screen, next to what the lobby's estimate (js/sim/match-time.js) says for the same settings.
//
//   node prototypes/tumblefair/tools/match-length.mjs [--seeds 4] [--mode board] [--rounds 4] [--people 1] [--cpus 3]
//
// Two paces per setting: "waits" = nobody taps ready, every intro / results / bonus timer runs out (the slowest a
// match gets); "taps" = everyone taps ready / continue as soon as the screen opens (the quickest). Real groups land in
// between. The minigames are played by the test bots and CPUs, so they end when they end (often on the clock).
import { world, withBots } from '../tests/helpers.js';
import { matchEstimate } from '../js/sim/match-time.js';
import { TIMES } from '../js/sim/room.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };

/** Plays one match; returns { ms, rounds, games } (ms from Start to the final screen). */
export function playMatch({ mode = 'board', rounds = 4, people = 1, cpus = 3, seed = 1, taps = false, quick = false, extra = {} } = {}) {
  const w = world({ seed });
  const phones = [];
  const mk = () => { const P = withBots(w.phone()); if (!taps) { const send = P.send; P.send = m => { if (m.t !== 'skip') send(m); }; } phones.push(P); return P; };
  const host = mk(); host.send({ t: 'create' });
  for (let i = 1; i < people; i++) mk().send({ t: 'join', code: host.room.code });
  if (quick) { if (cpus) host.send({ t: 'opt', key: 'cpus', value: cpus }); host.send({ t: 'quick' }); }
  else {
    host.send({ t: 'opt', key: 'mode', value: mode }); host.send({ t: 'opt', key: 'rounds', value: rounds });
    for (const [k, v] of Object.entries(extra)) host.send({ t: 'opt', key: k, value: v });
    if (cpus) host.send({ t: 'opt', key: 'cpus', value: cpus });
    host.send({ t: 'start' });
  }
  const t0 = w.now;
  const ok = w.run(90 * 60 * 1000, () => host.phase === 'final');
  if (!ok) throw new Error(`stuck in ${host.phase}`);
  const m = host.room.match;
  return { ms: w.now - t0, rounds: m?.round ?? null, games: host.got.filter(x => x.t === 'phase' && x.phase === 'results').length, est: host.room.match?.est ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = +opt('--seeds', 4), mode = opt('--mode', 'board'), rounds = +opt('--rounds', 4), people = +opt('--people', 1), cpus = +opt('--cpus', 3);
  const quick = args.includes('--quick');
  const min = ms => (ms / 60000).toFixed(1);
  for (const taps of [false, true]) {
    const runs = [];
    for (let s = 1; s <= seeds; s++) runs.push(playMatch({ mode, rounds, people, cpus, seed: s * 31 + 7, taps, quick }));
    const avg = runs.reduce((a, r) => a + r.ms, 0) / runs.length;
    console.log(`${quick ? 'Quick Match' : `${mode} x${rounds}`}, ${people} ${people > 1 ? 'people' : 'person'} + ${cpus} CPU, ${taps ? 'taps' : 'waits'}: ${runs.map(r => min(r.ms)).join(' / ')} min (avg ${min(avg)}, ${runs[0].games} games)`);
  }
  const est = matchEstimate({ mode, rounds, players: Math.min(4, people + cpus), times: TIMES });
  console.log(`lobby estimate: ${min(est)} min`);
}
