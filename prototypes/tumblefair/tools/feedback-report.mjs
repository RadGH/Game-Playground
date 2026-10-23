#!/usr/bin/env node
// Read the players' bug reports and suggestions (the "!" button in the game).
//   node tools/feedback-report.mjs [--env stable|dev] [--state new|all]      markdown, newest last
//   node tools/feedback-report.mjs --env stable --html <file.html>           a page with the pictures (put it somewhere git-ignored)
//   node tools/feedback-report.mjs --env stable --mark 3,4 --state done --note "what was done"
// Reports live in ~/.local/share/tumblefair/<env>/feedback/<id>.json (+ <id>.jpg). No sudo needed.
//   node tools/feedback-report.mjs --dir /var/lib/tumblefair                 the public server's (on the droplet, as root)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { markReports } from '../server/feedback.mjs';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
// --dir <data dir>: another server's data folder (the games.radgh.com droplet keeps it in /var/lib/tumblefair)
const env = arg('env', 'stable'), dir = arg('dir', null) ? join(arg('dir', null), 'feedback') : join(homedir(), '.local/share/tumblefair', env, 'feedback');
if (!existsSync(dir)) { console.log(`no reports yet (${dir})`); process.exit(0); }
const all = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8'))).sort((a, b) => a.id - b.id);
const mark = arg('mark', null);
if (mark) {
  markReports(dir, mark.split(',').map(Number), arg('state', 'done'), arg('note', ''), { log: console.log });
  process.exit(0);
}
const want = arg('state', 'new'), list = all.filter(r => want === 'all' || r.state === want);
const html = arg('html', null);
if (html) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const img = r => r.shot && existsSync(join(dir, r.shot)) ? `<img src="data:image/jpeg;base64,${readFileSync(join(dir, r.shot)).toString('base64')}">` : '';
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><title>Tumblefair reports (${env})</title><style>body{font:15px/1.4 system-ui;margin:16px;background:#f4efe2}article{background:#fff;border:2px solid #123;border-radius:12px;padding:12px;margin:0 0 14px}img{max-width:480px;width:100%;border-radius:8px;display:block;margin:8px 0}pre{white-space:pre-wrap;font-size:12px;background:#f2f2f2;padding:8px;border-radius:8px;max-height:260px;overflow:auto}</style><h1>Tumblefair reports — ${env} (${list.length})</h1>` +
    list.map(r => `<article><b>#${r.id} ${r.kind}</b> · ${esc(r.state)} · ${esc(r.at)} · ${esc(r.name)} · build ${esc(r.build)}<p>${esc(r.text)}</p>${img(r)}${r.note ? `<p><i>${esc(r.note)}</i></p>` : ''}<details><summary>debug</summary><pre>${esc(JSON.stringify(r.debug, null, 1))}</pre></details></article>`).join(''));
  console.log(`wrote ${html} (${list.length} reports)`); process.exit(0);
}
console.log(`# Tumblefair reports — ${env} — ${list.length} ${want}\n`);
for (const r of list) {
  const d = r.debug || {};
  console.log(`## #${r.id} · ${r.kind} · ${r.state} · ${r.at} · ${r.name || '?'} · build ${r.build}\n\n${r.text}\n`);
  console.log(`- screen: ${d.phase || '-'}${d.game ? ' / ' + d.game : ''} · room ${d.room?.code || '-'} (${d.room?.members?.length ?? 0} people) · ${d.screen?.w}x${d.screen?.h} @${d.screen?.dpr} ${d.screen?.orient || ''} · quality ${d.quality} · net ${d.net?.status} ${d.net?.ping}ms`);
  console.log(`- device: ${d.ua || '?'}${d.gl ? ' · ' + d.gl : ''}`);
  if (d.log?.length) console.log(`- recent phases: ${d.log.slice(-8).join(' | ')}`);
  if (d.errors?.length) console.log(`- errors:\n${d.errors.map(e => '    ' + e).join('\n')}`);
  if (r.shot) console.log(`- picture: ${join(dir, r.shot)}`);
  if (r.note) console.log(`- note: ${r.note}`);
  console.log('');
}
