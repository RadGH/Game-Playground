// The research screen: the whole tree as a graph, laid out in columns by tier, with a queue.
//
// The engine only ever works on one node, so the queue lives here: when a node finishes, the screen
// starts the next one. Everything else - what can be started, what it costs, what it unlocks - comes
// straight off the data.

import { $, el, fill, num, clamp } from './dom.js';
import { icon, rawIcon } from './icons.js';

const COL_W = 186, ROW_H = 82, PAD = 24;

export class ResearchScreen {
  constructor({ game, sound, onJump }) {
    this.game = game;
    this.sound = sound;
    this.onJump = onJump;
    this.queue = [];
    this.selected = null;
    this.zoom = 1;
    this.filter = 'open';
    this.built = false;
    this._wire();
  }

  setGame(game) { this.game = game; this.queue = []; this.selected = null; this.built = false; }

  _wire() {
    $('tree-filter').addEventListener('change', e => { this.filter = e.target.value; this.built = false; this.render(); });
    $('tree-zoom-in').addEventListener('click', () => { this.zoom = clamp(this.zoom * 1.15, 0.5, 1.8); this._applyZoom(); });
    $('tree-zoom-out').addEventListener('click', () => { this.zoom = clamp(this.zoom / 1.15, 0.5, 1.8); this._applyZoom(); });
  }

  _applyZoom() {
    const c = $('tree-canvas');
    c.style.transform = `scale(${this.zoom})`;
    c.parentElement.scrollLeft *= 1;
  }

  /** Called when the screen is shown and whenever research state changes. */
  render() {
    if (!this.built) this._buildTree();
    this._refreshStates();
    this._detail();
    this._queue();
    const g = this.game;
    $('tree-note').textContent = `${g.research.done.length} of ${g.data.techs.length} done`
      + (g.research.current ? ` · working on ${g.data.tech[g.research.current]?.name}` : ' · nothing running')
      + (g.flags.researchStalled ? ' · stalled, the labs cannot see the packs' : '');
  }

  // ------------------------------------------------------------------ layout
  _visible() {
    const g = this.game;
    return g.data.techs.filter(t => {
      if (t.planetRequirement && !g.planetHas(t.planetRequirement) && this.filter !== 'all') return false;
      if (this.filter === 'todo') return !g.research.done.includes(t.id);
      if (this.filter === 'open') return g.research.done.includes(t.id) || g.canResearch(t.id).ok || this._oneStepAway(t);
      return true;
    });
  }

  /** A node whose requirements are all either done or available - the next ring out. */
  _oneStepAway(t) {
    const g = this.game;
    return (t.requires || []).every(r => g.research.done.includes(r) || g.canResearch(r).ok);
  }

  _buildTree() {
    const g = this.game;
    const list = this._visible();
    const byTier = new Map();
    for (const t of list) {
      const tier = t.tier ?? 0;
      if (!byTier.has(tier)) byTier.set(tier, []);
      byTier.get(tier).push(t);
    }
    const tiers = [...byTier.keys()].sort((a, b) => a - b);
    this.pos = new Map();
    let maxRows = 0;
    tiers.forEach((tier, col) => {
      const rows = byTier.get(tier);
      rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      maxRows = Math.max(maxRows, rows.length);
      rows.forEach((t, i) => this.pos.set(t.id, { x: PAD + col * COL_W, y: PAD + 22 + i * ROW_H }));
    });

    const canvas = $('tree-canvas');
    canvas.replaceChildren();
    canvas.style.width = (PAD * 2 + tiers.length * COL_W) + 'px';
    canvas.style.height = (PAD * 2 + 30 + maxRows * ROW_H) + 'px';

    // the wires, drawn behind everything
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', canvas.style.width);
    svg.setAttribute('height', canvas.style.height);
    svg.style.position = 'absolute'; svg.style.inset = '0'; svg.style.pointerEvents = 'none';
    for (const t of list) {
      const to = this.pos.get(t.id);
      for (const req of t.requires || []) {
        const from = this.pos.get(req);
        if (!from || !to) continue;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const x1 = from.x + 150, y1 = from.y + 20, x2 = to.x, y2 = to.y + 20;
        const mid = (x1 + x2) / 2;
        path.setAttribute('d', `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', g.research.done.includes(req) ? 'rgba(92,224,138,0.4)' : 'rgba(60,90,110,0.5)');
        path.setAttribute('stroke-width', '1.4');
        svg.append(path);
      }
    }
    canvas.append(svg);

    tiers.forEach((tier, col) => {
      canvas.append(el('div.tree-tier-label', { text: 'tier ' + tier, style: { left: (PAD + col * COL_W) + 'px', top: '4px' } }));
    });

    this.nodes = new Map();
    for (const t of list) {
      const p = this.pos.get(t.id);
      const node = el('div.tech', { style: { left: p.x + 'px', top: p.y + 'px' } });
      node.append(el('span.nm', { text: t.name }));
      node.append(el('span.cost', { text: `${t.work}s · ${Object.entries(t.cost || {}).map(([r, n]) => n + '×' + shortPack(r)).join(' ') || 'free'}` }));
      const unl = el('div.unl');
      for (const id of (t.unlocks || []).slice(0, 8)) unl.append(this._unlockIcon(id, true));
      node.append(unl);
      node.append(el('span.qn'));
      node.addEventListener('click', () => this.select(t.id));
      node.addEventListener('dblclick', () => this.start(t.id));
      canvas.append(node);
      this.nodes.set(t.id, node);
    }
    this.built = true;
    this._applyZoom();
  }

  _unlockIcon(id, small = false) {
    const g = this.game;
    const size = small ? 15 : 20;
    if (g.data.structure[id]) return icon('bld', g.data.structure[id], { size });
    if (g.data.vehicle[id]) return icon('veh', g.data.vehicle[id], { size });
    if (g.data.unit[id]) return icon('unit', g.data.unit[id], { size });
    const rec = g.data.recipe[id];
    if (rec) {
      const out = Object.keys(rec.outputs || {})[0];
      if (out && g.data.resource[out]) return icon('res', g.data.resource[out], { size });
    }
    return rawIcon('ui_research', { size });
  }

  _refreshStates() {
    const g = this.game;
    if (!this.nodes) return;
    for (const [id, node] of this.nodes) {
      const done = g.research.done.includes(id);
      const avail = !done && g.canResearch(id).ok;
      node.classList.toggle('done', done);
      node.classList.toggle('avail', avail);
      node.classList.toggle('locked', !done && !avail);
      node.classList.toggle('current', g.research.current === id);
      node.classList.toggle('sel', this.selected === id);
      const qi = this.queue.indexOf(id);
      node.querySelector('.qn').textContent = qi >= 0 ? '#' + (qi + 1) : '';
    }
  }

  select(id) {
    this.selected = id;
    this.sound?.ui('click');
    this._refreshStates();
    this._detail();
  }

  _detail() {
    const g = this.game;
    const box = $('tech-detail');
    const t = this.selected ? g.data.tech[this.selected] : (g.research.current ? g.data.tech[g.research.current] : null);
    if (!t) { fill(box, el('p.tiny', { text: 'Pick a node to read it.' })); return; }
    const done = g.research.done.includes(t.id);
    const check = g.canResearch(t.id);
    const kids = [el('h4', { text: t.name }), el('p.tiny', { text: t.desc || '' })];
    kids.push(el('div.stat-row', null, el('span', { text: 'Work' }), el('b', { text: t.work + ' lab-seconds' })));
    for (const [r, n] of Object.entries(t.cost || {})) {
      const have = g.available(r);
      kids.push(el('div.stat-row', null,
        el('span', null, icon('res', g.data.resource[r], { size: 14 }), ' ' + (g.data.resource[r]?.name || r)),
        el('b', { class: have >= n ? '' : 'warn', text: `${Math.round(have)} / ${n}` })));
    }
    if (t.requires?.length) {
      kids.push(el('h4.ruled', { text: 'Needs first' }));
      for (const r of t.requires) {
        kids.push(el('div.unlock-row', null,
          el('i.dot.' + (g.research.done.includes(r) ? 'ok' : 'off')),
          el('span', { text: g.data.tech[r]?.name || r })));
      }
    }
    if (t.unlocks?.length) {
      kids.push(el('h4.ruled', { text: 'Unlocks' }));
      for (const id of t.unlocks) {
        const name = g.data.structure[id]?.name || g.data.recipe[id]?.name || g.data.vehicle[id]?.name || g.data.unit[id]?.name || id;
        const what = g.data.structure[id] ? 'building' : g.data.recipe[id] ? 'recipe' : g.data.vehicle[id] ? 'vehicle' : g.data.unit[id] ? 'unit' : '';
        kids.push(el('div.unlock-row', null, this._unlockIcon(id), el('span', { text: name }), el('span.tiny', { text: what })));
      }
    }
    if (t.effects) {
      kids.push(el('h4.ruled', { text: 'Effects' }));
      for (const [k, v] of Object.entries(t.effects)) {
        kids.push(el('div.stat-row', null, el('span', { text: k.replace(/([A-Z])/g, ' $1').toLowerCase() }), el('b', { text: '×' + v })));
      }
    }
    const actions = el('div.sp-actions');
    if (done) actions.append(el('span.tiny.good', { text: 'Researched.' }));
    else if (g.research.current === t.id) actions.append(el('span.tiny.warn', { text: `Running — ${Math.round(g.research.progress)} / ${t.work}` }));
    else if (check.ok) {
      actions.append(el('button.primary.small', { text: 'Start now', onClick: () => this.start(t.id) }));
      actions.append(el('button.small', { text: this.queue.includes(t.id) ? 'Remove from queue' : 'Add to queue', onClick: () => this.toggleQueue(t.id) }));
    } else {
      actions.append(el('span.tiny.warn', { text: check.reason }));
      actions.append(el('button.small', { text: 'Queue the path', tip: 'Queue every node this one needs, in order', onClick: () => this.queuePath(t.id) }));
    }
    kids.push(actions);
    if (!g.structures.some(s => s.state === 'done' && s.def.researchRate)) {
      kids.push(el('p.tiny.warn', { text: 'No lab is standing. Research will not move until one is built and powered.' }));
    }
    fill(box, ...kids);
  }

  start(id) {
    const out = this.game.startResearch(id);
    if (!out.ok) { this.sound?.ui('error'); return out; }
    this.sound?.research();
    this.queue = this.queue.filter(q => q !== id);
    this.render();
    return out;
  }

  toggleQueue(id) {
    if (this.queue.includes(id)) this.queue = this.queue.filter(q => q !== id);
    else this.queue.push(id);
    this.sound?.ui('tab');
    this.render();
  }

  /** Queue every unfinished requirement, deepest first, then the node itself. */
  queuePath(id) {
    const g = this.game, out = [], seen = new Set();
    const walk = tid => {
      if (seen.has(tid) || g.research.done.includes(tid)) return;
      seen.add(tid);
      for (const r of g.data.tech[tid]?.requires || []) walk(r);
      out.push(tid);
    };
    walk(id);
    for (const t of out) if (!this.queue.includes(t)) this.queue.push(t);
    if (!g.research.current && this.queue.length) this.start(this.queue[0]);
    this.sound?.ui('tab');
    this.render();
  }

  _queue() {
    const g = this.game;
    const box = $('tech-queue');
    if (!this.queue.length) { fill(box, el('p.tiny', { text: 'Nothing queued. Double-click a node to start it, or queue a path to something further out.' })); return; }
    fill(box, this.queue.map((id, i) => {
      const t = g.data.tech[id];
      const row = el('div.qitem');
      row.append(el('b', { text: '#' + (i + 1) }), el('span', { text: t?.name || id }), el('span.spacer'));
      row.append(el('button.small.ghost', { text: '↑', onClick: () => { if (i > 0) { [this.queue[i - 1], this.queue[i]] = [this.queue[i], this.queue[i - 1]]; this.render(); } } }));
      row.append(el('button.small.danger', { text: '×', onClick: () => this.toggleQueue(id) }));
      return row;
    }));
  }

  /** Called by the main loop when a node finishes: pull the next one off the queue. */
  onResearchDone() {
    this.built = false;
    while (this.queue.length) {
      const next = this.queue.shift();
      if (this.game.research.done.includes(next)) continue;
      if (this.game.startResearch(next).ok) break;
    }
  }
}

/** "pack_basic" -> "basic", so a node's cost line fits on one row. */
const shortPack = r => String(r).replace(/^pack_/, '');
