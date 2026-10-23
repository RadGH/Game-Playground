#!/usr/bin/env node
// What players think of each minigame, and how the fair is used (round 7, server/insights.mjs).
//   node tools/insights-report.mjs [--env stable|dev] [--days 30]          markdown to the terminal
//   node tools/insights-report.mjs --dir /var/lib/tumblefair               the public server's data (on the droplet, as root)
//   node tools/insights-report.mjs --json                                  the same numbers as JSON
//
// Per minigame: plays, 👍 / 👎 and a SCORE — the lower edge of a 90% Wilson interval on the share of 👍, so a game liked
// by 3 of 3 does not outrank one liked by 40 of 50 — the reasons people gave, how often it is OFFERED in the vote and how
// often it WINS, how long it really runs against its clock, how often it ends early, and drop-outs. The games at the
// bottom of the score (and the ones nobody votes for) are the candidates to fix or retire; the top ones to feature.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const env = arg('env', 'stable'), days = +arg('days', 30);
const dir = join(arg('dir', null) || join(homedir(), '.local/share/tumblefair', env), 'insights');
if (!existsSync(dir)) { console.log(`no insights yet (${dir})`); process.exit(0); }
const since = new Date(Date.now() - days * 864e5).toISOString();
const lines = readdirSync(dir).filter(f => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort()
  .flatMap(f => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })).filter(r => r && r.at >= since);

// titles from the game metas, when this runs inside the repo
let TITLES = {};
try { const metas = await import(resolve(dirname(fileURLToPath(import.meta.url)), '../js/games/metas.js')); TITLES = Object.fromEntries(Object.entries(metas.GAMES).map(([id, g]) => [id, g.meta.title])); } catch { /* titles optional */ }

const G = new Map(), get = id => { if (!G.has(id)) G.set(id, { id, plays: 0, secs: 0, limit: 0, early: 0, dropped: 0, ties: 0, coopWin: 0, coopRuns: 0, offered: 0, picked: 0, votes: 0, latest: new Map() }); return G.get(id); };
let matches = 0, finals = 0;
for (const r of lines) {
  if (r.kind === 'played') { const g = get(r.game); g.plays++; g.secs += r.seconds || 0; g.limit = r.limit || g.limit; if (r.endedEarly) g.early++; g.dropped += r.dropped || 0; if (r.allTied) g.ties++; if (r.coop != null) { g.coopRuns++; if (r.coop) g.coopWin++; } }
  else if (r.kind === 'vote') { for (const o of r.offered || []) { const g = get(o.game); g.offered++; g.votes += o.votes || 0; } if (r.pick) get(r.pick).picked++; }
  else if (r.kind === 'rate') get(r.game).latest.set(r.voter || Math.random(), r);      // a change of mind replaces the earlier rating
  else if (r.kind === 'match') matches++;
  else if (r.kind === 'final') finals++;
}
/** Lower bound of the Wilson score interval (z = 1.645, 90%). 0 with no ratings. */
const wilson = (up, n) => { if (!n) return 0; const z = 1.645, p = up / n; return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n); };
const rows = [...G.values()].map(g => {
  const rs = [...g.latest.values()], up = rs.filter(r => r.v > 0).length, down = rs.length - up, why = {};
  for (const r of rs) for (const k of r.why || []) why[(r.v > 0 ? '+' : '-') + k] = (why[(r.v > 0 ? '+' : '-') + k] || 0) + 1;
  const flag = k => rs.filter(r => (r.why || []).includes(k)).length;      // asked on both thumbs: a fun game can still be buggy
  return { id: g.id, title: TITLES[g.id] || g.id, plays: g.plays, up, down, buggy: flag('buggy'), unfair: flag('unfair'), score: Math.round(wilson(up, up + down) * 100), why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`).join(' '),
    offered: g.offered, picked: g.picked, pickRate: g.offered ? Math.round(g.picked / g.offered * 100) : null, avgSecs: g.plays ? Math.round(g.secs / g.plays) : null, limit: g.limit, earlyPct: g.plays ? Math.round(g.early / g.plays * 100) : null,
    drops: g.dropped, ties: g.ties, coopWinPct: g.coopRuns ? Math.round(g.coopWin / g.coopRuns * 100) : null };
}).sort((a, b) => b.score - a.score || (b.up - b.down) - (a.up - a.down) || b.plays - a.plays);

const counts = readdirSync(dir).filter(f => /^counts-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-days).map(f => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ days, matches, finals, games: rows, counts }, null, 1)); process.exit(0); }

console.log(`# Tumblefair insights — last ${days} days (${dir})\n`);
console.log(`${matches} matches started, ${finals} finished. ${rows.reduce((n, r) => n + r.up + r.down, 0)} ratings on ${rows.filter(r => r.up + r.down).length} minigames.\n`);
console.log('| # | Minigame | Plays | 👍 | 👎 | Score | Buggy | Unfair | Reasons | Offered | Won vote | Avg s / clock | Ended early | Drop-outs |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.title} | ${r.plays} | ${r.up} | ${r.down} | ${r.up + r.down ? r.score : '–'} | ${r.buggy || ''} | ${r.unfair || ''} | ${r.why || ''} | ${r.offered} | ${r.pickRate == null ? '–' : r.pickRate + '%'} | ${r.avgSecs ?? '–'} / ${r.limit || '–'} | ${r.earlyPct == null ? '–' : r.earlyPct + '%'} | ${r.drops} |`));
console.log('\nScore = how sure we are that players like it (0–100; few ratings keep it low). Buggy / Unfair count both thumbs. "Won vote" = picked when offered.');
if (counts.length) {
  console.log('\n## Visits and actions (no cookies; a visitor is counted once a day)\n');
  const names = [...new Set(counts.flatMap(c => Object.keys(c.events)))].filter(n => !n.startsWith('room_')).sort();
  console.log(`| Day | Visitors | ${names.join(' | ')} |`); console.log(`|---|---|${names.map(() => '---').join('|')}|`);
  for (const c of counts) console.log(`| ${c.day} | ${c.visitors} | ${names.map(n => c.events[n] || 0).join(' | ')} |`);
  const devices = {}; for (const c of counts) for (const [k, n] of Object.entries(c.props)) if (k.startsWith('page_view|device=')) devices[k.slice(17)] = (devices[k.slice(17)] || 0) + n;
  if (Object.keys(devices).length) console.log(`\nDevices (page views): ${Object.entries(devices).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
