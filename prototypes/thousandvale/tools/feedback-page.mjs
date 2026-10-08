#!/usr/bin/env node
// Build a read-only HTML page of feedback reports for the owner to browse on the LAN.
//   node tools/feedback-report.mjs --json | node tools/feedback-page.mjs > ../../tools/scratch/feedback.html
//   sudo "$(command -v node)" tools/feedback-report.mjs --env stable --json | node tools/feedback-page.mjs --round ~/claude/agent/mmo/round-playtest6.md > ...
// The output folder (playground/tools/scratch/) is git-ignored: reports carry account ids and browser details.
import { readFileSync } from 'node:fs';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const raw = JSON.parse(readFileSync(0, 'utf8'));
const rows = Array.isArray(raw) ? raw : (raw.reports || raw.rows || []);
// Optional: the lead's round file, to show which work item each report became ("| U3 | #18 | ...").
const ri = process.argv.indexOf('--round'); const plan = new Map();
if (ri > 0) for (const line of readFileSync(process.argv[ri + 1], 'utf8').split('\n')) {
  const m = line.match(/^\|\s*(U\d+|—)\s*\|\s*([^|]+)\|\s*([^|]+)\|/); if (!m) continue;
  for (const n of m[2].matchAll(/#(\d+)/g)) plan.set(+n[1], { item: m[1], what: m[3].trim() });
}
const card = r => {
  const s = r.server || {}, c = r.client || {}, t = s.target, p = plan.get(r.id);
  const log = (c.log || c.logs || []).map(l => esc(typeof l === 'string' ? l : `[${l.k || l.kind || ''}] ${l.t || l.text || ''}`)).join('\n');
  return `<article class="fb ${esc(r.kind)} st-${esc(r.state)}" data-kind="${esc(r.kind)}" data-state="${esc(r.state)}">
<header><b>#${r.id}</b> <span class="kind">${r.kind === 'bug' ? 'Bug' : 'Suggestion'}</span> <span class="state">${esc(r.state)}</span>
<span class="who">${esc(r.name)} · level ${esc(r.level)} ${esc(r.cls)}</span> <time>${new Date(r.at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</time></header>
<p class="text">${esc(r.text)}</p>
${p ? `<p class="plan"><b>${p.item === '—' ? 'Declined' : 'Work item ' + esc(p.item)}:</b> ${esc(p.what)}</p>` : ''}
${r.ref != null ? `<p class="plan"><b>Reply to:</b> #${esc(r.ref)}</p>` : ''}
${r.note ? `<p class="plan"><b>Admin note:</b> ${esc(r.note)}</p>` : ''}
${r.state === 'completed' || r.done ? `<p class="plan done"><b>Completed:</b> ${esc(r.done || '(no note)')}</p>` : ''}
<p class="where">${esc(s.roomName || '')} · zone ${esc(s.zone || '')} · x ${esc(s.x)} z ${esc(s.z)} · ${esc(s.roomKind || '')}${t ? ` · target: ${esc(t.name)} (level ${esc(t.level)}${t.dead ? ', dead' : ''})` : ''} · build ${esc(s.build || '')}</p>
<details><summary>Everything attached</summary><pre>${esc(JSON.stringify({ server: s, client: { ...c, log: undefined, logs: undefined } }, null, 1))}</pre>${log ? `<h4>Client log</h4><pre>${log}</pre>` : ''}</details>
</article>`;
};
const count = k => rows.filter(k).length;
process.stdout.write(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thousandvale feedback</title><link rel="stylesheet" href="feedback-page.css">
<h1>Thousandvale feedback <small>${rows.length} reports · built ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</small></h1>
<nav id="f"><button data-f="all" class="on">All ${rows.length}</button><button data-f="bug">Bugs ${count(r => r.kind === 'bug')}</button><button data-f="suggestion">Suggestions ${count(r => r.kind !== 'bug')}</button>
<button data-f="new">New ${count(r => r.state === 'new')}</button><button data-f="approved">Approved ${count(r => r.state === 'approved')}</button><button data-f="declined">Declined ${count(r => r.state === 'declined')}</button><button data-f="completed">Completed ${count(r => r.state === 'completed')}</button>
<input id="q" placeholder="Search text…"></nav>
<main>${rows.map(card).join('\n')}</main>
<script>
const arts=[...document.querySelectorAll('.fb')];let f='all';const q=document.getElementById('q');
const go=()=>arts.forEach(a=>{const ok=(f==='all'||a.dataset.kind===f||a.dataset.state===f)&&a.textContent.toLowerCase().includes(q.value.toLowerCase());a.hidden=!ok});
document.getElementById('f').addEventListener('click',e=>{if(!e.target.dataset.f)return;f=e.target.dataset.f;document.querySelectorAll('#f button').forEach(b=>b.classList.toggle('on',b===e.target));go()});q.addEventListener('input',go);
</script>`);
