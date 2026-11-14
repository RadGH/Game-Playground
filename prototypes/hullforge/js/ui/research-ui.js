// The Research lab: a tree of permanent upgrades. Rows are branches, columns are Mk I-IV; a line joins each node to
// the ones it needs. Pick a node to see exactly what it gives and what it costs; research it with credits + ore.
// The numbers live in sim/research.js.

import { el, btn, panel, toast, num, credits as cr } from './dom.js';
import { BRANCHES, NODES, NODE_BY_ID, TIER_COST, nodeCost, nodeBlock, isDone, doResearch, nodeLines, researchBonus, BONUS_WORDS, RP_VALUE } from '../sim/research.js';
import { save } from '../sim/state.js';
import { ORES, TIER_NAMES } from '../data/blocks.js';
import { fmt } from '../../../../shared/format.js';
import { play } from '../core/audio.js';

// tree layout (px)
const COL0 = 112, COL = 200, NODE_W = 176, NODE_H = 92, ROW = 112, TOP = 34;
const f1 = v => fmt(v, { decimals: 1 });
let selected = 'thrust1';

export function openResearch(app, redraw) {
  const G = app.G;
  const P = panel('Research lab', redraw, { cls: 'research-panel', sub: 'Permanent upgrades for every ship you fly' });
  const credLine = el('div', { class: 'stat amber' }); P.head.insertBefore(credLine, P.head.lastChild);
  const tree = el('div', { class: 'rs-tree' }); const side = el('div', { class: 'rs-side' });
  P.body.append(el('div', { class: 'rs-wrap' }, el('div', { class: 'section rs-tree-box' }, tree), side));

  const pos = n => ({ x: COL0 + (n.tier - 1) * COL, y: TOP + BRANCHES.findIndex(b => b.id === n.branch) * ROW });
  const state = n => (isDone(G, n.id) ? 'done' : !nodeBlock(G, n) ? 'ready' : (n.need || []).every(id => isDone(G, id)) ? 'short' : 'locked');

  function draw() { credLine.textContent = cr(G.credits); drawTree(); drawSide(); }

  function drawTree() {
    const W = COL0 + 3 * COL + NODE_W + 8, H = TOP + BRANCHES.length * ROW;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'rs-lines');
    for (const n of NODES) for (const id of n.need || []) {
      const a = pos(NODE_BY_ID[id]), b = pos(n);
      const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2; const mx = (x1 + x2) / 2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      path.setAttribute('class', isDone(G, id) ? (isDone(G, n.id) ? 'done' : 'open') : 'shut');
      svg.append(path);
    }
    const kids = [svg];
    // column heads and row names
    TIER_NAMES.forEach((t, i) => kids.push(el('span', { class: 'rs-col', style: `left:${COL0 + i * COL}px;width:${NODE_W}px` }, `${t} · ${cr(TIER_COST[i].cr)}`)));
    BRANCHES.forEach((b, i) => kids.push(el('span', { class: 'rs-row', style: `top:${TOP + i * ROW + NODE_H / 2 - 10}px;color:${b.color}` }, b.name)));
    for (const n of NODES) {
      const p = pos(n); const st = state(n); const br = BRANCHES.find(b => b.id === n.branch);
      const b = btn('', () => { selected = n.id; draw(); }, `rs-node ${st}${selected === n.id ? ' sel' : ''}`, { style: `left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px;--bc:${br.color}`, 'data-node': n.id });
      const c = nodeCost(n, G);
      b.append(el('b', {}, n.name), el('span', { class: 'rs-eff' }, nodeLines(n, f1)[0]),
        el('small', {}, st === 'done' ? 'Researched' : `${cr(c.cr)} · ${Object.entries(c.ore).map(([o, k]) => `${num(k)} ${ORES[o].name.replace(' ore', '')}`).join(' · ')}`));
      kids.push(b);
    }
    tree.style.width = `${W}px`; tree.style.height = `${H}px`;
    tree.replaceChildren(...kids);
  }

  function drawSide() {
    const n = NODE_BY_ID[selected]; const br = BRANCHES.find(b => b.id === n.branch); const c = nodeCost(n, G);
    const why = nodeBlock(G, n); const done = isDone(G, n.id);
    const chip = (label, ok) => el('span', { class: 'rs-chip ' + (ok ? 'ok' : 'no') }, label);
    const box = el('div', { class: 'section rs-detail', style: `--bc:${br.color}` },
      el('span', { class: 'rs-branch' }, `${br.name} · ${TIER_NAMES[n.tier - 1]}`),
      el('h3', {}, n.name),
      el('ul', { class: 'rs-gives' }, ...nodeLines(n, f1).map(l => el('li', {}, l))),
      n.need?.length ? el('p', { class: 'hint' }, 'Needs: ', ...n.need.map((id, i) => [i ? ', ' : '', el('b', { class: isDone(G, id) ? 'good' : 'bad' }, NODE_BY_ID[id].name)]).flat()) : '',
      done ? el('p', { class: 'good' }, 'Researched. The bonus is already on your ship.') : el('div', { class: 'rs-cost' },
        chip(cr(c.cr), G.credits >= c.cr),
        c.rp ? chip(`${num(c.rp)} research points (−${cr(c.crFull - c.cr)})`, true) : '',
        ...Object.entries(c.ore).map(([o, k]) => chip(`${num(k)} ${ORES[o].name} (you have ${num(G.cargo[o] || 0)})`, (G.cargo[o] || 0) >= k))),
      done ? '' : btn(why ? why : `Research ${n.name}`, () => {
        if (!doResearch(G, n.id)) return;
        play('rare'); toast(`Researched: ${n.name}`, 'good'); save(G); app.redrawStation?.(); draw();
      }, why ? '' : 'primary', { disabled: !!why, 'data-act': 'research' }));
    side.replaceChildren(box, summary());
  }

  function summary() {
    const b = researchBonus(G); const lines = [];
    for (const k of ['thrust', 'turn', 'shield', 'regen', 'turretTurn', 'power', 'cargo', 'mining']) if (b[k] !== 1) lines.push(`+${f1((b[k] - 1) * 100)}% ${BONUS_WORDS[k][0]}`);
    if (b.repair !== 1) lines.push(`Repairs and rebuilds ${f1((1 - b.repair) * 100)}% cheaper`);
    if (b.trade) lines.push(`Trade prices ${f1(b.trade * 100)}% better`);
    if (b.craftLuck) lines.push(`+${f1(b.craftLuck)} craft rarity luck`);
    if (b.shopTier) lines.push(`Outfitters stock ${num(b.shopTier)} Mk higher`);
    const done = NODES.filter(n => isDone(G, n.id)).length;
    return el('div', { class: 'section' }, el('div', { class: 'row between' }, el('h3', {}, 'Your research'), el('span', { class: 'dim' }, `${num(done)} of ${num(NODES.length)}`)),
      lines.length ? el('ul', { class: 'rs-gives' }, ...lines.map(l => el('li', {}, l))) : el('p', { class: 'hint' }, 'Nothing yet. Mk I nodes need iron ore: mine some, or keep it instead of selling it.'),
      el('p', { class: 'hint' }, `Research points: ${num(Math.floor(G.researchPoints || 0))} — each pays ${num(RP_VALUE)} cr of a node's cost. An outpost's R&D lab makes them.`));
  }
  draw();
}
