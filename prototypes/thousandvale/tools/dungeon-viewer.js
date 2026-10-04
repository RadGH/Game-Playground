// Thousandvale dungeon floor viewer (stream E). Draws js/rules/dungeon-tiers.js plans: rooms by kind,
// packs by rank, the gate + lever, stairs / exits / chest / shortcut, arena props, and (optionally)
// shades every tile that is only reachable once the lever opens the gate. Open on the playground dev
// server: http://<LAN-IP>:8401/prototypes/thousandvale/tools/dungeon-viewer.html
import { planDungeon, FAMILIES, flood, tileIndex } from '../js/rules/dungeon-tiers.js';

const $ = id => document.getElementById(id);
const PX = 6;                                         // canvas pixels per tile
const KIND = { entry: '#3d7a4a', arrival: '#3d6a7a', fight: '#4a4f58', key: '#8a7a2a', miniboss: '#8a4a2a', boss: '#9a2a2a', reward: '#b08a20' };
const RANK = { normal: '#c8ccd2', elite: '#f0a040', boss: '#ff4040' };
const PROP = { pillar: '#9aa0aa', brazier: '#ff9a30', cracked_floor: '#7a5a3a', lever: '#ffee55', pool: '#4aa0a0', rock: '#8a7a6a' };
let encounters = {};

for (const [k, f] of Object.entries(FAMILIES)) $('family').add(new Option(f.name + (f.ready ? '' : ' (planned → ' + FAMILIES[f.fallback].name + ')'), k));
const q = new URLSearchParams(location.search);
if (q.get('family')) $('family').value = q.get('family');
if (q.get('seed')) $('seed').value = q.get('seed');
if (q.get('floors')) $('floors').value = q.get('floors');

$('legend').innerHTML = [...Object.entries(KIND).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`),
  ...Object.entries(RANK).map(([k, c]) => `<span><i style="background:${c};border-radius:50%"></i>${k} pack</span>`),
  ...Object.entries(PROP).map(([k, c]) => `<span><i style="background:${c}"></i>arena ${k.replace('_', ' ')}</span>`),
  '<span><i style="background:#e33"></i>gate</span>', '<span><i style="background:#ff0"></i>lever</span>',
  '<span><i style="background:#6cf"></i>stairs</span>', '<span><i style="background:#6f6"></i>exit</span>',
  '<span><i style="background:#c6f"></i>shortcut up</span>', '<span><i style="background:#ffd700"></i>reward chest</span>'].join('');

fetch('../data/encounters/index.json').then(r => r.ok ? r.json() : null).then(async idx => {
  if (!idx) return;
  for (const file of idx.files || []) {
    const d = await (await fetch('../data/encounters/' + file)).json();
    if (d.id && d.phases) encounters[d.id] = d;
  }
  draw();
}).catch(() => {});

function draw() {
  const seed = (+$('seed').value) >>> 0, floors = +$('floors').value, level = +$('level').value || 3;
  const t0 = performance.now();
  const arenas = Object.fromEntries(Object.values(encounters).map(e => [e.id, e.arena?.objects || []]));
  const plan = planDungeon(seed, { floors, level, family: $('family').value, arenas });
  const ms = performance.now() - t0;
  history.replaceState(null, '', `?family=${$('family').value}&seed=${seed}&floors=${floors}`);
  const wrap = $('floors-wrap');
  wrap.textContent = '';
  plan.floors.forEach(f => wrap.appendChild(drawFloor(plan, f)));
  $('status').textContent = `${plan.name} · ${ms.toFixed(1)} ms`;
  const s = plan.floors.map(f => `<li>Floor ${f.index + 1} (lv ${f.level}): ${f.rooms.length} rooms, ${f.packs.reduce((a, p) => a + p.count, 0)} monsters, ${f.props.length} props</li>`).join('');
  $('summary').innerHTML = `<b>${plan.name}</b><br>${plan.encounters.setName ? 'Encounter set: <b>' + plan.encounters.setName + '</b><br>' : ''}${plan.familyName}${plan.familyFallback ? ` (asked for ${plan.familyFallback})` : ''} · look <b>${plan.look}</b><ul>${s}</ul>`;
  const encLine = id => { const e = encounters[id]; return e ? `<li><b>${e.name}</b> — ${e.phases ? e.phases.length + ' phases, ' : ''}${Object.keys(e.abilities || {}).length} abilities${e.enrage ? ', enrage at ' + e.enrage.seconds + ' s' : ''}</li>` : `<li>${id} <span class="error">(not loaded)</span></li>`; };
  $('enc').innerHTML = `<b>Encounters</b><ul>${plan.encounters.miniboss.map(encLine).join('')}${encLine(plan.encounters.boss)}</ul>`;
}

function drawFloor(plan, f) {
  const box = document.createElement('div'); box.className = 'floor';
  const h = document.createElement('h2'); h.textContent = `Floor ${f.index + 1} · level ${f.level} · ${f.w}×${f.h} tiles (${f.w * plan.cell}×${f.h * plan.cell} m)`;
  const c = document.createElement('canvas'); c.width = f.w * PX; c.height = f.h * PX;
  box.append(h, c);
  const g = c.getContext('2d');
  const shut = $('shut').checked ? flood(f, f.entry, { gateShut: true }) : null;
  const roomOf = new Int16Array(f.w * f.h).fill(-1);
  f.rooms.forEach(r => { for (let j = r.j; j < r.j + r.h; j++) for (let i = r.i; i < r.i + r.w; i++) roomOf[j * f.w + i] = r.id; });
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    const k = j * f.w + i;
    if (!f.tiles[k]) continue;
    const r = roomOf[k] >= 0 ? f.rooms[roomOf[k]] : null;
    g.fillStyle = r ? KIND[r.kind] : '#3a3d44';
    g.fillRect(i * PX, j * PX, PX, PX);
    if (shut && !shut[k]) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(i * PX, j * PX, PX, PX); }
  }
  const toPx = p => [(p.x - f.origin.x) / plan.cell * PX, (p.z - f.origin.z) / plan.cell * PX];
  const dot = (p, col, r = 4, sq = false) => { const [x, y] = toPx(p); g.fillStyle = col; g.beginPath(); if (sq) g.rect(x - r, y - r, 2 * r, 2 * r); else g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); };
  // an underground river (cave_river): drawn as a line over the floor
  if (f.river) { g.strokeStyle = 'rgba(80,160,220,0.7)'; g.lineWidth = 3; g.beginPath(); f.river.forEach((p, k) => { const [x, y] = toPx(p); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1; }
  // gate
  g.fillStyle = '#e33'; g.fillRect(f.gate.i * PX, f.gate.j * PX, f.gate.w * PX, f.gate.h * PX);
  for (const p of f.props) {
    const [x, y] = toPx(p);
    g.fillStyle = PROP[p.type] || '#fff';
    if (p.r) { g.globalAlpha = 0.55; g.beginPath(); g.arc(x, y, p.r / plan.cell * PX, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    else g.fillRect(x - 4, y - 4, 8, 8);
    g.strokeStyle = '#000'; g.strokeRect(x - 4, y - 4, 8, 8);
  }
  for (const p of f.packs) {
    dot(p, RANK[p.rank], p.rank === 'boss' ? 8 : p.rank === 'elite' ? 6 : 4);
    if (p.rank === 'normal' && p.radius > 1) { const [x, y] = toPx(p); g.strokeStyle = 'rgba(200,204,210,0.35)'; g.beginPath(); g.arc(x, y, p.radius / plan.cell * PX, 0, Math.PI * 2); g.stroke(); }
  }
  dot(f.lever, '#ff0', 4, true);
  if (f.stairsDown) dot(f.stairsDown, '#6cf', 5, true);
  if (f.stairsUp) dot(f.stairsUp, '#6cf', 5, true);
  if (f.exit) dot(f.exit, '#6f6', 5, true);
  if (f.chest) dot(f.chest, '#ffd700', 6, true);
  if (f.shortcutUp) dot(f.shortcutUp, '#c6f', 5, true);
  dot(f.entry, '#fff', 3);
  if ($('labels').checked) {
    g.font = 'bold 11px system-ui'; g.textAlign = 'center';
    for (const r of f.rooms) {
      const [x, y] = toPx(r);
      const pk = f.packs.find(p => p.room === r.id && p.encounter);
      const label = pk ? (encounters[pk.encounter]?.name || pk.encounter) : r.kind;
      g.fillStyle = '#000'; g.fillText(label, x + 1, y - 9); g.fillStyle = '#fff'; g.fillText(label, x, y - 10);
    }
  }
  c.addEventListener('mousemove', ev => {
    const rect = c.getBoundingClientRect();
    const i = Math.floor((ev.clientX - rect.left) / rect.width * f.w), j = Math.floor((ev.clientY - rect.top) / rect.height * f.h);
    const x = f.origin.x + (i + 0.5) * plan.cell, z = f.origin.z + (j + 0.5) * plan.cell;
    const k = tileIndex(f, x, z);
    const r = k >= 0 && roomOf[k] >= 0 ? f.rooms[roomOf[k]] : null;
    const near = [...f.packs.map(p => ['pack ' + p.rank + ' ' + p.type + ' x' + p.count + (p.encounter ? ' → ' + p.encounter : ''), p]), ...f.props.map(p => ['prop ' + p.name + ' (' + p.type + ')', p])]
      .filter(([, p]) => Math.hypot(p.x - x, p.z - z) < 4).map(([s]) => s);
    $('readout').textContent = `floor ${f.index + 1}  tile ${i},${j}\nmetres ${x.toFixed(0)}, ${z.toFixed(0)}\n${k >= 0 && f.tiles[k] ? 'floor' : 'wall'}${r ? '  room ' + r.id + ' (' + r.kind + ')' : ''}${shut && k >= 0 && f.tiles[k] && !shut[k] ? '\nbehind the gate' : ''}${near.length ? '\n' + near.join('\n') : ''}`;
  });
  return box;
}

for (const id of ['family', 'floors', 'level', 'shut', 'labels']) $(id).addEventListener('change', draw);
$('seed').addEventListener('input', draw);
$('prev').onclick = () => { $('seed').value = Math.max(0, +$('seed').value - 1); draw(); };
$('next').onclick = () => { $('seed').value = +$('seed').value + 1; draw(); };
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'ArrowLeft') $('prev').click(); if (e.key === 'ArrowRight') $('next').click(); });
draw();
