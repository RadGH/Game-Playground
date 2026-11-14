// The star map: systems as stars on a chart, lines for jump links, danger as colour. Pick a star to see it; jump
// to a linked one (out of combat). Suggested ship rating per danger is shown against yours.

import { $, el, btn, panel, num } from './dom.js';
import { DANGER_NAMES, SUGGESTED, sunOf } from '../sim/galaxy.js';
import { computeStats } from '../sim/stats.js';
import { designGrid } from '../sim/state.js';
import { FACTIONS, stationOwner, repLevel } from '../sim/factions.js';   // world: station owners, outposts, jobs
import { missionState } from '../sim/missions.js';

const DCOL = ['#62f0a8', '#9fe06a', '#ffd25a', '#ffa04a', '#ff6a4a', '#ff3a6a'];
export function openStarMap(app) {
  if ($('#panels .starmap')) return;
  const G = app.G, gal = app.gal; const here = gal.systems[G.system];
  const P = panel('Star map', null, { sub: 'Danger rises the further you go from home' });
  const wrap = el('div', { class: 'map-wrap' }); P.body.append(wrap);
  const mapBox = el('div', { class: 'starmap section', style: 'margin:0;padding:0;overflow:hidden' });
  const side = el('div', { class: 'map-side' });
  wrap.append(mapBox, side);
  let sel = here;
  const rating = computeStats(designGrid(G)).rating;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  // world: which systems hold your outposts and your jobs' places
  const jobSys = id => missionState(G).active.filter(m => (m.kind === 'delivery' ? m.to.system : m.kind === 'acquire' ? m.board.system : m.system) === id);
  const outpostAt = id => (G.outposts || []).find(o => o.system === id);
  function drawMap() {
    const svg = s('svg', { viewBox: '0 0 1000 620', preserveAspectRatio: 'xMidYMid meet' });
    const X = x => 40 + x * 920, Y = y => 30 + y * 560;
    for (const a of gal.systems) for (const l of a.links) { if (l < a.id) continue; const b = gal.systems[l]; const near = a.id === here.id || b.id === here.id; svg.append(s('line', { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), stroke: near ? '#5fd8ff' : '#2a3a58', 'stroke-width': near ? 2.2 : 1.4, 'stroke-dasharray': near ? '' : '5 5' })); }
    for (const sy of gal.systems) {
      const g = s('g', { style: 'cursor:pointer', 'data-sys': sy.id, tabindex: 0, role: 'button', 'aria-label': sy.name });
      const col = DCOL[sy.danger - 1];
      if (sy.id === here.id) g.append(s('circle', { cx: X(sy.x), cy: Y(sy.y), r: 20, fill: 'none', stroke: '#5fd8ff', 'stroke-width': 2 }));
      if (sy.id === sel.id) g.append(s('circle', { cx: X(sy.x), cy: Y(sy.y), r: 26, fill: 'none', stroke: '#ffc45a', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
      g.append(s('circle', { cx: X(sy.x), cy: Y(sy.y), r: 13, fill: col, opacity: 0.18 }));
      g.append(s('circle', { cx: X(sy.x), cy: Y(sy.y), r: 7, fill: sunOf(sy).color, stroke: col, 'stroke-width': 2.5 }));
      if (outpostAt(sy.id)) g.append(s('rect', { x: X(sy.x) + 11, y: Y(sy.y) - 17, width: 9, height: 9, rx: 2, fill: '#62f0a8', stroke: '#05070c', 'stroke-width': 1.5 }));   // world: your outpost
      if (jobSys(sy.id).length) g.append(s('circle', { cx: X(sy.x), cy: Y(sy.y), r: 16, fill: 'none', stroke: '#ffd27a', 'stroke-width': 2, 'stroke-dasharray': '2 3' }));   // world: a job takes you here
      const t = s('text', { x: X(sy.x), y: Y(sy.y) + 34, fill: G.visited.includes(sy.id) ? '#e4ecf7' : '#93a3bd', 'font-size': 15, 'text-anchor': 'middle', 'font-family': 'Oxanium, sans-serif' }); t.textContent = sy.name; g.append(t);
      const d = s('text', { x: X(sy.x), y: Y(sy.y) + 50, fill: col, 'font-size': 12, 'text-anchor': 'middle', 'font-family': 'Barlow, sans-serif' }); d.textContent = `danger ${sy.danger}`; g.append(d);
      g.addEventListener('click', () => { sel = sy; draw(); });
      g.addEventListener('keydown', e => { if (e.key === 'Enter') { sel = sy; draw(); } });
      svg.append(g);
    }
    mapBox.replaceChildren(svg);
    // controller: tiles for each system in the side list instead of the svg (padnav moves between buttons)
  }
  function drawSide() {
    const linked = here.links.includes(sel.id);
    const sug = SUGGESTED[sel.danger];
    const pips = el('span', { class: 'danger-pips' }, ...[1, 2, 3, 4, 5, 6].map(i => el('i', { class: i <= sel.danger ? 'on' : '' })));
    side.replaceChildren(
      el('h3', {}, sel.name), el('div', { class: 'row' }, pips, el('b', { style: `color:${DCOL[sel.danger - 1]}` }, `${DANGER_NAMES[sel.danger - 1]} (danger ${sel.danger})`)),
      el('div', { class: 'kv' },
        el('span', {}, 'Star'), el('b', {}, sunOf(sel).name),
        el('span', {}, 'Who flies here'), el('b', {}, sel.faction === 'swarm' ? 'Hive swarms + pirates' : 'Pirates'),
        el('span', {}, 'Ore'), el('b', {}, sel.rich ? 'Rich fields' : 'Normal fields'),
        el('span', {}, 'Suggested rating'), el('b', { class: rating >= sug ? 'good' : 'bad' }, sug ? `${num(sug)} (yours ${num(rating)})` : `Any (yours ${num(rating)})`),
        el('span', {}, 'Visited'), el('b', {}, G.visited.includes(sel.id) ? 'Yes' : 'Not yet'),
        sel.danger >= 4 ? el('span', {}, 'Capital ship') : '', sel.danger >= 4 ? el('b', { class: 'bad' }, 'One patrols here') : '',
        el('span', {}, 'Station run by'), el('b', { style: `color:${FACTIONS[stationOwner(sel)].color}` }, `${FACTIONS[stationOwner(sel)].short} · you are ${repLevel(G, stationOwner(sel)).name}`),   // world:
        el('span', {}, 'Your outpost'), el('b', { class: outpostAt(sel.id) ? 'good' : 'dim' }, outpostAt(sel.id) ? outpostAt(sel.id).name : 'None'),
        jobSys(sel.id).length ? el('span', {}, 'Your jobs') : '', jobSys(sel.id).length ? el('b', { class: 'amber' }, jobSys(sel.id).map(m => m.title).join(' · ')) : ''),
      sel.id === here.id ? el('p', { class: 'hint' }, 'You are here.')
        : linked ? btn(`Jump to ${sel.name}`, () => { if (app.jumpTo(sel.id)) P.root.remove(); }, 'primary')
          : el('p', { class: 'hint' }, `No direct link from ${here.name}. Jump along the lines.`),
      el('h4', { style: 'margin-top:8px' }, 'Linked from here'),
      el('div', { class: 'col' }, ...here.links.map(id => { const o = gal.systems[id]; return btn(`${o.name} · danger ${o.danger}`, () => { sel = o; draw(); }, sel.id === id ? 'on small' : 'small'); })),
    );
  }
  function draw() { drawMap(); drawSide(); }
  draw();
}
