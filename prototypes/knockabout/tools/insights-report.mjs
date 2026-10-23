#!/usr/bin/env node
// What players think of each arena, and how online Knockabout is used (server/room.js reports into Tumblefair's
// server/insights.mjs log: <data>/insights/YYYY-MM.jsonl + counts-YYYY-MM-DD.json).
//   node tools/insights-report.mjs [--env stable|dev] [--days 30]          markdown to the terminal
//   node tools/insights-report.mjs --dir /var/lib/knockabout               another server's data (the droplet, as root)
//   node tools/insights-report.mjs --json                                  the same numbers as JSON
//
// Per arena: plays, 👍 / 👎 and a SCORE (the lower edge of a 90% Wilson interval on the share of 👍, so an arena liked
// by 3 of 3 does not outrank one liked by 40 of 50), how many ratings said Buggy / Unfair (asked on both thumbs), the
// reasons people gave, how often it was OFFERED in the vote and how often it WON, the average round length, how many
// matches were ended early, and how people went out (ring-out / spikes / fire / crush).
// Couch (offline-page) ratings arrive through POST /tally as page counts ('rate' events with arena + v): they are
// listed separately at the bottom, because the tally keeps counts, not who rated.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const env = arg('env', 'stable'), days = +arg('days', 30);
const dir = join(arg('dir', null) || join(homedir(), '.local/share/knockabout', env), 'insights');
if (!existsSync(dir)) { console.log(`no insights yet (${dir})`); process.exit(0); }
const since = new Date(Date.now() - days * 864e5).toISOString();
const lines = readdirSync(dir).filter(f => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort()
  .flatMap(f => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })).filter(r => r && r.at >= since);

// arena names from the game's data, when this runs inside the repo
let NAMES = {};
try { const a = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../data/arenas.json'), 'utf8')); NAMES = Object.fromEntries(a.arenas.map(x => [x.id, x.name])); } catch { /* names optional */ }

const A = new Map(), get = id => { if (!A.has(id)) A.set(id, { id, plays: 0, early: 0, rounds: 0, roundSecs: 0, secs: 0, outs: {}, offered: 0, picked: 0, votes: 0, latest: new Map(), modes: {} }); return A.get(id); };
let matches = 0, finals = 0, humans = 0, cpus = 0;
for (const r of lines) {
  if (r.kind === 'played') {
    const g = get(r.arena); g.plays++; g.secs += r.seconds || 0; if (r.endedEarly) g.early++;
    for (const s of r.roundSecs || []) { g.rounds++; g.roundSecs += s; }
    for (const [how, n] of Object.entries(r.outs || {})) g.outs[how] = (g.outs[how] || 0) + n;
    g.modes[r.mode] = (g.modes[r.mode] || 0) + 1;
  }
  else if (r.kind === 'vote') { for (const o of r.offered || []) { const g = get(o.arena); g.offered++; g.votes += o.votes || 0; } if (r.pick) get(r.pick).picked++; }
  else if (r.kind === 'rate') get(r.arena).latest.set(r.voter || Math.random(), r);      // a change of mind replaces the earlier rating
  else if (r.kind === 'match') { matches++; humans += r.humans || 0; cpus += r.cpus || 0; }
  else if (r.kind === 'final') finals++;
}
/** Lower bound of the Wilson score interval (z = 1.645, 90%). 0 with no ratings. */
const wilson = (up, n) => { if (!n) return 0; const z = 1.645, p = up / n; return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n); };
const rows = [...A.values()].map(g => {
  const rs = [...g.latest.values()], up = rs.filter(r => r.v > 0).length, down = rs.length - up, why = {};
  for (const r of rs) for (const k of r.why || []) why[(r.v > 0 ? '+' : '-') + k] = (why[(r.v > 0 ? '+' : '-') + k] || 0) + 1;
  const flag = k => rs.filter(r => (r.why || []).includes(k)).length;
  const outTotal = Object.values(g.outs).reduce((a, b) => a + b, 0);
  return { id: g.id, name: NAMES[g.id] || g.id, plays: g.plays, up, down, score: Math.round(wilson(up, up + down) * 100), buggy: flag('buggy'), unfair: flag('unfair'),
    why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`).join(' '),
    offered: g.offered, picked: g.picked, pickRate: g.offered ? Math.round(g.picked / g.offered * 100) : null,
    avgRound: g.rounds ? Math.round(g.roundSecs / g.rounds) : null, avgMatch: g.plays ? Math.round(g.secs / g.plays) : null, earlyPct: g.plays ? Math.round(g.early / g.plays * 100) : null,
    outs: g.outs, outMix: outTotal ? Object.entries(g.outs).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${Math.round(n / outTotal * 100)}%`).join(', ') : '', modes: g.modes };
}).sort((a, b) => b.score - a.score || (b.up - b.down) - (a.up - a.down) || b.plays - a.plays);

const counts = readdirSync(dir).filter(f => /^counts-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-days).map(f => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
const couch = {};
for (const c of counts) for (const [k, n] of Object.entries(c.props || {})) { const m = /^rate\|arena=(.+)$/.exec(k); if (m) couch[m[1]] = (couch[m[1]] || 0) + n; }
if (process.argv.includes('--json')) { console.log(JSON.stringify({ days, matches, finals, humans, cpus, arenas: rows, couchRatings: couch, counts }, null, 1)); process.exit(0); }

console.log(`# Knockabout insights — last ${days} days (${dir})\n`);
console.log(`${matches} online matches started (${humans} people and ${cpus} CPU seats in all), ${finals} rooms finished a session. ${rows.reduce((n, r) => n + r.up + r.down, 0)} ratings on ${rows.filter(r => r.up + r.down).length} arenas.\n`);
console.log('| # | Arena | Plays | 👍 | 👎 | Score | Buggy | Unfair | Reasons | Offered | Won vote | Avg round s | Avg match s | Ended early | How people went out |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.name} | ${r.plays} | ${r.up} | ${r.down} | ${r.up + r.down ? r.score : '–'} | ${r.buggy || ''} | ${r.unfair || ''} | ${r.why || ''} | ${r.offered} | ${r.pickRate == null ? '–' : r.pickRate + '%'} | ${r.avgRound ?? '–'} | ${r.avgMatch ?? '–'} | ${r.earlyPct == null ? '–' : r.earlyPct + '%'} | ${r.outMix} |`));
console.log('\nScore = how sure we are that players like it (0–100; few ratings keep it low). Buggy / Unfair count both thumbs. "Won vote" = picked when offered.');
if (Object.keys(couch).length) console.log(`\nCouch ratings (page counts, no thumbs split): ${Object.entries(couch).map(([k, n]) => `${NAMES[k] || k} ${n}`).join(', ')}`);
if (counts.length) {
  console.log('\n## Visits and actions (no cookies; a visitor is counted once a day)\n');
  const names = [...new Set(counts.flatMap(c => Object.keys(c.events)))].filter(n => !n.startsWith('room_')).sort();
  console.log(`| Day | Visitors | ${names.join(' | ')} |`); console.log(`|---|---|${names.map(() => '---').join('|')}|`);
  for (const c of counts) console.log(`| ${c.day} | ${c.visitors} | ${names.map(n => c.events[n] || 0).join(' | ')} |`);
}
