// The build bar and the placement ghost.
//
// Pick a building from the bar (or press B), the ghost follows the cursor and tints itself with
// whatever canPlace() says, R turns it, click drops an outline, shift keeps the tool up for another.
// Roads and walls are one tile each, so dragging with one of those selected lays a line.

import { $, el, fill, num, kw, clamp, titleCase } from './dom.js';
import { icon, rawIcon, spriteFor, CATEGORY_ICON } from './icons.js';

const CATEGORY_ORDER = ['base', 'extraction', 'processing', 'power', 'logistics', 'defence', 'scan', 'science', 'space', 'variant'];
const CATEGORY_NAME = {
  base: 'Base', extraction: 'Mining', processing: 'Factory', power: 'Power', logistics: 'Hauling',
  defence: 'Defence', scan: 'Scanning', science: 'Science', space: 'Space', variant: 'This world',
};

export class BuildTool {
  constructor({ game, surface, sound, onMessage }) {
    this.game = game;
    this.surface = surface;
    this.sound = sound;
    this.onMessage = onMessage || (() => {});
    this.category = 'extraction';
    this.type = null;
    this.rot = 0;
    this.line = null;                 // { x0, y0 } while dragging a road or wall
    this.lastCheck = null;
    this._wire();
  }

  setGame(game) { this.game = game; this.type = null; this.renderBar(true); }

  _wire() {
    $('bb-tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      this.category = b.dataset.cat;
      this.renderBar(true);
      this.sound?.ui('tab');
    });
  }

  // ------------------------------------------------------------------ the bar
  renderBar(force = false) {
    const g = this.game;
    const list = g.buildable();
    const cats = CATEGORY_ORDER.filter(c => list.some(s => s.category === c));
    if (!cats.includes(this.category)) this.category = cats[0] || 'base';
    const key = cats.join(',') + '|' + this.category + '|' + list.length;
    if (force || key !== this._tabKey) {
      this._tabKey = key;
      fill($('bb-tabs'), cats.map(c => {
        const b = el('button' + (c === this.category ? '.on' : ''), { dataset: { cat: c }, tip: this._catTip(c) });
        b.append(rawIcon(CATEGORY_ICON[c] || 'ui_build', { size: 14 }), el('span', { text: CATEGORY_NAME[c] || titleCase(c) }));
        return b;
      }));
      this._itemKey = null;
    }
    const items = list.filter(s => s.category === this.category);
    const affordKey = items.map(s => s.id + (this._affordable(s) ? '1' : '0')).join(',') + '|' + this.type;
    if (!force && affordKey === this._itemKey) return;
    this._itemKey = affordKey;
    fill($('bb-items'), items.map(s => this._itemButton(s)));
  }

  _catTip(c) {
    return {
      base: 'The pod, crew housing and the workshop that makes builders faster.',
      extraction: 'Drills, pumps and harvesters. Most of these have to sit on a scanned patch.',
      processing: 'Smelters, assemblers and every chemistry building.',
      power: 'Generation, storage, and the poles that carry the grid.',
      logistics: 'Stores, garages, docks and roads. Two stores that reach each other share everything.',
      defence: 'Walls, gates, turrets, shields and repair bays.',
      scan: 'Scanner towers and radars find what is under the ground. The cheapest one is the best early building in the game.',
      science: 'Labs eat science packs; the archive carries your research to the next planet.',
      space: 'Launchers, the pad and the beacon that claims a world.',
      variant: 'Buildings that only exist because of what this planet has in the ground.',
    }[c] || '';
  }

  _affordable(def) {
    const g = this.game;
    for (const [res, n] of Object.entries(def.cost || {})) if (g.available(res) < n) return false;
    return true;
  }

  _itemButton(def) {
    const poor = !this._affordable(def);
    const b = el('button.bb-item' + (poor ? '.poor' : '') + (this.type === def.id ? '.on' : ''), {
      dataset: { type: def.id }, tipHtml: this.tipFor(def),
    });
    b.append(icon('bld', def, { size: 30 }));
    b.append(el('span.nm', { text: def.name }));
    const cost = Object.entries(def.cost || {}).map(([r, n]) => n).join('/');
    b.append(el('span.cs', { text: cost || 'free' }));
    b.addEventListener('click', () => this.pick(def.id));
    return b;
  }

  /** The hover card: what it does, what it costs, what it eats, what it makes. */
  tipFor(def) {
    const g = this.game;
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = [];
    const cost = Object.entries(def.cost || {}).map(([r, n]) =>
      `<b class="${g.available(r) >= n ? '' : 'bad'}">${n}</b> ${esc(g.data.resource[r]?.name || r)}`).join(' · ');
    rows.push(`<b style="color:var(--cyan)">${esc(def.name)}</b> <span class="tiny">${def.size.w}×${def.size.h}</span>`);
    rows.push(`<div class="tiny">${esc(def.desc || '')}</div>`);
    if (cost) rows.push(`<div>${cost}</div>`);
    const bits = [];
    if (def.buildTime) bits.push(`${def.buildTime}s of work`);
    if (def.hp) bits.push(`${def.hp} hp`);
    if (def.powerUse) bits.push(`${def.powerUse} kW draw`);
    if (def.powerGen) bits.push(`${def.powerGen} kW out`);
    if (def.powerStore) bits.push(`${def.powerStore} kWs store`);
    if (def.storage) bits.push(`${def.storage} storage`);
    if (def.linkRadius) bits.push(`link ${def.linkRadius}`);
    if (def.supplyRadius) bits.push(`grid ${def.supplyRadius}`);
    if (def.extractRate) bits.push(`${def.extractRate}/s extraction`);
    if (def.researchRate) bits.push(`${def.researchRate} research/s`);
    if (def.dps) bits.push(`${def.dps} dps, range ${def.range}`);
    if (def.scanRadius) bits.push(`scans ${def.scanRadius}${def.nodeOnly ? ' (underground only)' : ''}`);
    if (def.vision) bits.push(`sees ${def.vision}`);
    if (def.requiresNode) bits.push(`needs a ${def.requiresNode.join('/')} patch`);
    if (bits.length) rows.push(`<div class="tiny">${esc(bits.join(' · '))}</div>`);
    const recipes = [...(g.data.recipesFor[def.id] || [])].filter(r => g.isUnlocked(r));
    if (recipes.length) rows.push(`<div class="tiny">recipes: ${esc(recipes.map(r => g.data.recipe[r]?.name || r).join(', '))}</div>`);
    return rows.join('');
  }

  // ------------------------------------------------------------------ picking
  pick(typeId) {
    if (this.type === typeId) return this.cancel();
    this.type = typeId;
    this.rot = 0;
    this.surface.setMode('build', this);
    this.renderBar(true);
    this.sound?.ui('open');
    const def = this.game.data.structure[typeId];
    this.onMessage(`${def.name} — click to place${this._isLine(def) ? ', drag to lay a line' : ''}. R turns it, shift keeps it up, Esc cancels.`);
  }

  /** Drop the tool without touching the surface - the surface calls this when it swaps tools. */
  reset() {
    this.type = null;
    this.line = null;
    this.lastCheck = null;
    this.renderBar(true);
  }

  cancel() {
    if (this.surface.tool === this) this.surface.setMode('select');
    this.reset();
    this.onMessage(null);
  }

  rotate() {
    if (!this.type) return;
    this.rot = (this.rot + 1) % 4;
    this.sound?.ui('tab');
  }

  _isLine(def) { return def && def.size.w === 1 && def.size.h === 1 && (def.roadTier || def.blocks); }

  /** Where the ghost's top-left corner sits for a cursor at (x, y). */
  _anchor(p) {
    const def = this.game.data.structure[this.type];
    const fp = this.game.footprint(this.type, this.rot);
    return { x: Math.round(p.x - fp.w / 2), y: Math.round(p.y - fp.h / 2), w: fp.w, h: fp.h, def };
  }

  // ------------------------------------------------------------------ surface hooks
  down(p, e) {
    if (!this.type) return;
    const def = this.game.data.structure[this.type];
    if (this._isLine(def)) { this.line = { x0: Math.floor(p.x), y0: Math.floor(p.y), x1: Math.floor(p.x), y1: Math.floor(p.y) }; return; }
    this._placeAt(p, e);
  }

  move(p, e) {
    if (this.line) { this.line.x1 = Math.floor(p.x); this.line.y1 = Math.floor(p.y); }
  }

  up(p, e) {
    if (!this.line) return;
    const tiles = this._lineTiles(this.line);
    this.line = null;
    let placed = 0;
    for (const t of tiles) {
      const out = this.game.place(this.type, t.x, t.y, { rot: this.rot });
      if (out.ok) placed++;
    }
    if (placed) { this.sound?.build(); this.onMessage(`${placed} laid.`); }
    else { this.sound?.ui('error'); this.onMessage('Nothing could go there.', true); }
    if (!e.shiftKey) this.cancel();
    this.surface.dirty.roads = true;
  }

  _placeAt(p, e) {
    const a = this._anchor(p);
    const check = this.game.canPlace(this.type, a.x, a.y, { rot: this.rot });
    if (!check.ok) { this.sound?.ui('error'); this.onMessage(check.reason, true); return; }
    const out = this.game.place(this.type, a.x, a.y, { rot: this.rot });
    if (!out.ok) { this.sound?.ui('error'); this.onMessage(out.reason, true); return; }
    this.sound?.build();
    this.renderBar(true);
    if (!e.shiftKey) this.cancel();
    else this.onMessage(`${a.def.name} placed. Shift is held, so the tool stays up.`);
  }

  /** An L-shaped run of tiles from the drag start to the drag end: along x first, then y. */
  _lineTiles(line) {
    const out = [];
    const stepX = Math.sign(line.x1 - line.x0), stepY = Math.sign(line.y1 - line.y0);
    let x = line.x0, y = line.y0;
    out.push({ x, y });
    while (x !== line.x1) { x += stepX; out.push({ x, y }); }
    while (y !== line.y1) { y += stepY; out.push({ x, y }); }
    return out.slice(0, 200);
  }

  // ------------------------------------------------------------------ drawing
  draw(g, v, surface) {
    if (!this.type) return;
    const game = this.game;
    const def = game.data.structure[this.type];
    if (this.line) {
      for (const t of this._lineTiles(this.line)) {
        const ok = game.canPlace(this.type, t.x, t.y, { rot: this.rot }).ok;
        const p = surface.tileToScreen(t.x, t.y);
        g.fillStyle = ok ? 'rgba(70,220,180,0.35)' : 'rgba(230,70,70,0.35)';
        g.fillRect(p.x, p.y, v.z, v.z);
        g.strokeStyle = ok ? 'rgba(120,255,210,0.8)' : 'rgba(255,120,120,0.8)';
        g.lineWidth = 1;
        g.strokeRect(p.x + 0.5, p.y + 0.5, v.z - 1, v.z - 1);
      }
      return;
    }
    if (!surface.mouse.inside) return;
    const a = this._anchor({ x: surface.mouse.tx, y: surface.mouse.ty });
    const check = game.canPlace(this.type, a.x, a.y, { rot: this.rot });
    if (this.lastCheck !== check.reason) { this.lastCheck = check.reason; if (!check.ok) this.onMessage(check.reason, true); else this.onMessage(`${def.name} — click to place.`); }
    const p = surface.tileToScreen(a.x, a.y);
    const w = a.w * v.z, h = a.h * v.z;
    g.save();
    g.fillStyle = check.ok ? 'rgba(70,220,180,0.22)' : 'rgba(230,70,70,0.25)';
    g.fillRect(p.x, p.y, w, h);
    g.setLineDash([6, 4]);
    g.strokeStyle = check.ok ? '#6ffcd0' : '#ff7a7a';
    g.lineWidth = 2;
    g.strokeRect(p.x + 1, p.y + 1, w - 2, h - 2);
    g.setLineDash([]);
    const sp = spriteFor('bld', def, Math.min(w, h));
    if (sp) {
      g.globalAlpha = 0.75;
      const size = Math.min(w, h) * 0.9;
      g.translate(p.x + w / 2, p.y + h / 2);
      g.rotate(this.rot * Math.PI / 2);
      g.drawImage(sp, -size / 2, -size / 2, size, size);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
    }
    g.restore();

    // helper rings so you can see what this thing will reach before you commit to it
    const c = surface.tileToScreen(a.x + a.w / 2, a.y + a.h / 2);
    const rings = [];
    if (def.supplyRadius) rings.push([def.supplyRadius, 'rgba(255,210,74,0.6)']);
    if (def.linkRadius) rings.push([def.linkRadius, 'rgba(90,220,240,0.6)']);
    if (def.range && def.dps) rings.push([def.range, 'rgba(255,110,90,0.6)']);
    if (def.scanRadius) rings.push([def.scanRadius, 'rgba(160,255,180,0.5)']);
    g.save(); g.setLineDash([5, 5]); g.lineWidth = 1.4;
    for (const [r, colour] of rings) { g.strokeStyle = colour; g.beginPath(); g.arc(c.x, c.y, r * v.z, 0, Math.PI * 2); g.stroke(); }
    g.restore();

    // if it needs a patch, light up every scanned patch it could actually use
    if (def.requiresNode) {
      g.save();
      g.setLineDash([3, 4]);
      g.strokeStyle = 'rgba(120,255,210,0.55)'; g.lineWidth = 1.2;
      for (const n of game.map.nodes) {
        if (!n.scanned || n.depleted || n.claimedBy != null) continue;
        if (!def.requiresNode.includes(n.kind) && !def.requiresNode.includes(n.resource)) continue;
        if (def.nodeResource && n.resource !== def.nodeResource) continue;
        const q = surface.tileToScreen(n.x + 0.5, n.y + 0.5);
        if (q.x < -40 || q.y < -40 || q.x > v.w + 40 || q.y > v.h + 40) continue;
        g.beginPath(); g.arc(q.x, q.y, (n.radius + 0.6) * v.z, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
  }
}
