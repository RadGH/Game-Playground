// The raid bot match (PLAN M4): the bot (tools/bot.mjs + bot-defence.mjs) plays N seeds for M game minutes on a
// difficulty with raids on; writes research/balance-m4.md.   node tools/raid-match.mjs [--seeds 6] [--minutes 60] [--difficulty standard]
import { writeFileSync } from 'node:fs';
import { runBot } from './bot.mjs';
import { loadData, ROOT } from './lib-data.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const n = +arg('seeds', 6), minutes = +arg('minutes', 60), difficulty = arg('difficulty', 'standard');
const seeds = [108, 209, 310, 411, 512, 613, 714, 815, 916, 1017].slice(0, n);
const data = loadData();
const rows = [];
for (const seed of seeds) {
  const t0 = Date.now();
  const r = runBot({ seed, size: 'small', minutes, untilGoal: false, difficulty, data });
  rows.push({ seed, ...r.defence, bars: r.bars, barsAt: r.minutes, ms: Date.now() - t0 });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
const lost = {}; for (const r of rows) for (const [k, v] of Object.entries(r.lost)) lost[k] = (lost[k] || 0) + v;
const md = `# M4 raid bot match (${new Date().toISOString().slice(0, 10)})

${seeds.length} seeds, small map, ${minutes} game minutes, ${difficulty}, the bot defending (tools/bot-defence.mjs).

| seed | raids | beaten | at a wall | breaches | kills | carriers lost | buildings lost | towers | walls | HQ fell | 500 bars at (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.seed} | ${r.raids} | ${r.beaten} | ${r.atWall} | ${r.breaches} | ${r.kills} | ${r.convoys} | ${Object.values(r.lost).reduce((a, v) => a + v, 0)} | ${r.towers} | ${r.walls} | ${r.over ? 'yes' : 'no'} | ${r.barsAt ?? '—'} |`).join('\n')}

Totals: ${sum('raids')} raids, ${sum('kills')} raiders killed, ${sum('convoys')} carriers lost, HQ fell on ${rows.filter((r) => r.over).length} of ${rows.length}.
Buildings lost to raids: ${Object.entries(lost).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.
Wall clock: ${(rows.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0)} s.
`;
writeFileSync(ROOT + 'research/balance-m4.md', md);
console.log(md);
