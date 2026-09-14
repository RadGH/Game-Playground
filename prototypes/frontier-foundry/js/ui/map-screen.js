// The planet screen: the world map you landed on, drawn by the worldgen renderer, with the landing
// cell marked and the regions you could send scouts to listed beside it.
//
// Scope line from the design note: a region is surveyed for intel and a supply cache, not to become a
// second build site. So this screen is a map, a scout dispatcher and a quest board.

import { $, el, fill, num, clamp, countdown } from './dom.js';
import { icon, rawIcon } from './icons.js';
import { renderWorld, cellAt, regionColor } from '../../../../worldgen/js/render.js';

export class MapScreen {
  constructor({ game, sound, onJump }) {
    this.game = game;
    this.sound = sound;
    this.onJump = onJump;
    this.view = null;
    this.selected = null;
    this.canvas = $('world-canvas');
    this.canvas.addEventListener('click', e => this._click(e));
  }

  setGame(game) { this.game = game; this.selected = null; this.view = null; }

  render() {
    this._drawWorld();
    this._regions();
    this._survey();
    this._quests();
    const g = this.game;
    $('world-note').textContent = `${g.planet.name} — ${g.planet.archetype}, ${g.world.width}×${g.world.height} cells. `
      + `You are on ${g.worldCell.x},${g.worldCell.y} (${g.map.biomeName || 'unknown ground'}).`;
    $('world-legend').textContent = 'The amber square is your landing site. Regions you have surveyed are outlined; click a cell to read it.';
  }

  _drawWorld() {
    const g = this.game, c = this.canvas;
    const box = c.parentElement.getBoundingClientRect();
    const w = Math.max(480, Math.round(box.width - 28));
    const h = Math.round(w * g.world.height / g.world.width);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    this.view = renderWorld(ctx, g.world, {
      layers: { biomes: true, hillshade: true, rivers: true, roads: false, nodes: false, labels: true, borders: true, regions: false },
      labelDensity: 0.35,
    });

    const X = x => this.view.ox + (x + 0.5) * this.view.scale;
    const Y = y => this.view.oy + (y + 0.5) * this.view.scale;

    // surveyed regions get an outline and a name
    ctx.save();
    for (const id of g.exploredRegions) {
      const r = g.world.regions[id];
      if (!r) continue;
      ctx.strokeStyle = 'rgba(63,211,232,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(r.center.x), Y(r.center.y), 14, 0, Math.PI * 2); ctx.stroke();
    }
    for (const s of g.pendingSurveys) {
      const r = g.world.regions[s.regionId];
      if (!r) continue;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,182,72,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(r.center.x), Y(r.center.y), 12, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.selected) {
      ctx.strokeStyle = '#3fd3e8'; ctx.lineWidth = 2;
      ctx.strokeRect(X(this.selected.x) - this.view.scale, Y(this.selected.y) - this.view.scale, this.view.scale * 2, this.view.scale * 2);
    }
    // the landing site: an amber box with a pulse ring
    const lx = X(g.worldCell.x), ly = Y(g.worldCell.y);
    ctx.strokeStyle = '#ffb648'; ctx.lineWidth = 2.5;
    ctx.strokeRect(lx - 6, ly - 6, 12, 12);
    ctx.strokeStyle = 'rgba(255,182,72,0.4)';
    ctx.beginPath(); ctx.arc(lx, ly, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffe0a0';
    ctx.font = '600 11px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LANDING', lx, ly - 12);
    ctx.restore();
  }

  _click(e) {
    if (!this.view) return;
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.canvas.width / r.width);
    const py = (e.clientY - r.top) * (this.canvas.height / r.height);
    const cell = cellAt(this.game.world, px, py, this.view);
    if (!cell) return;
    this.selected = cell;
    this.sound?.ui('click');
    this.render();
  }

  _regions() {
    const g = this.game;
    const here = g.world.region ? g.world.region[g.worldCell.y * g.world.width + g.worldCell.x] : -1;
    const list = g.knownRegions();
    fill($('region-list'), list.length ? list.map(r => {
      const done = g.exploredRegions.includes(r.id);
      const pending = g.pendingSurveys.find(s => s.regionId === r.id);
      const row = el('button.region', { tip: `${r.biomeName || ''} — danger ${Math.round((r.danger ?? 0.3) * 100)}%. ${done ? 'Surveyed.' : pending ? 'Scouts on the way.' : 'Not surveyed.'}` });
      row.append(el('i.swatch', { style: { background: regionColor(r.id) } }));
      row.append(el('div', null,
        el('b', { text: r.name + (r.id === here ? ' (here)' : '') }),
        el('span.tiny', { text: `${r.biomeName || 'unknown'} · danger ${Math.round((r.danger ?? 0.3) * 100)}%` })));
      row.append(el('span.tiny', { text: done ? 'surveyed' : pending ? countdown(pending.doneAt - g.time) : '—' }));
      row.addEventListener('click', () => { this.selected = { ...r.center }; this.sound?.ui('click'); this.render(); this._survey(r); });
      return row;
    }) : el('p.tiny', { text: 'No regions in reach yet.' }));
  }

  _survey(preferred = null) {
    const g = this.game;
    const box = $('survey-box');
    const scouts = g.units.filter(u => u.alive && u.type === 'scout').length;
    const skimmers = g.vehicles.filter(v => v.alive && v.type === 'skimmer').length;
    const kids = [el('p.tiny', {
      text: scouts || skimmers
        ? `${scouts} scout${scouts === 1 ? '' : 's'} and ${skimmers} skimmer${skimmers === 1 ? '' : 's'} available. A skimmer surveys twice as fast.`
        : 'No scouts. Build a survey station (it comes with one) or research the skimmer.',
    })];
    const options = g.knownRegions().filter(r => !g.exploredRegions.includes(r.id) && !g.pendingSurveys.some(s => s.regionId === r.id));
    if (!options.length) kids.push(el('p.tiny', { text: 'Nothing left in reach to survey.' }));
    else {
      const sel = el('select.small');
      for (const r of options) sel.append(el('option', { value: r.id, text: r.name, selected: preferred && r.id === preferred.id }));
      const problem = el('p.tiny.bad');
      const go = el('button.small.primary', { text: 'Send scouts' });
      go.addEventListener('click', () => {
        const out = g.exploreRegion(+sel.value);
        if (!out.ok) { this.sound?.ui('error'); problem.textContent = out.reason; return; }
        this.sound?.ui('open');
        this.render();
      });
      kids.push(el('div.row', null, sel, go), problem);
    }
    for (const s of g.pendingSurveys) {
      const r = g.world.regions[s.regionId];
      kids.push(el('div.qitem', null, rawIcon('ui_vision', { size: 14 }),
        el('span', { text: `${r?.name || 'a region'} — back in ${countdown(s.doneAt - g.time)}` })));
    }
    kids.push(el('h4.ruled', { text: 'From orbit' }));
    kids.push(el('div.stat-row', null, el('span', { text: 'Satellites' }), el('b', { text: String(g.space.satellites) })));
    kids.push(el('div.stat-row', null, el('span', { text: 'Local map revealed' }), el('b', { text: g.fog.everything ? 'all of it' : Math.round(exploredShare(g) * 100) + '%' })));
    if (g.space.probes.length) {
      for (const pr of g.space.probes) {
        const target = g.planets.get(pr.planetId);
        kids.push(el('div.stat-row', null, el('span', { text: 'Probe to ' + (target?.name || pr.planetId) }), el('b', { text: countdown(pr.arrivesAt - g.time) })));
      }
    } else kids.push(el('p.tiny', { text: g.space.satellites ? 'A satellite is up: every patch on this world is on the map.' : 'No satellite yet. Until one goes up, a scanner tower or a radar is the only way to find what is under the ground.' }));
    fill(box, ...kids);
  }

  _quests() {
    fill($('map-quests'), questCards(this.game, { onJump: this.onJump, limit: 6, fieldOnly: true }));
  }
}

/** How much of the local map has ever been seen. */
function exploredShare(g) {
  let n = 0;
  for (let i = 0; i < g.fog.explored.length; i++) n += g.fog.explored[i];
  return n / g.fog.explored.length;
}

/** Quest cards, shared by this screen and the quest board. */
export function questCards(game, { onJump = null, limit = 99, fieldOnly = false, includeDone = false } = {}) {
  const out = [];
  const ids = [...game.quests.active, ...(includeDone ? game.quests.done : [])];
  for (const id of ids) {
    const q = game.data.quest[id];
    if (!q) continue;
    if (fieldOnly && !['scan_nodes', 'scan_all_of_kind', 'explore_regions', 'kill_nests', 'reach_rare'].includes(q.type)) continue;
    const done = game.quests.done.includes(id);
    const p = game.questProgress(q);
    const card = el('div.quest' + (done ? '.done' : ''));
    card.append(el('div', null, el('b', { text: q.name }), el('span.goal', { text: `  ${Math.min(p.have, q.goal)} / ${q.goal}` })));
    card.append(el('div.tiny', { text: done ? (q.done || 'Done.') : q.text || '' }));
    const bar = el('div.bar'); bar.append(el('i.bar-fill', { style: { width: (p.pct * 100) + '%', background: done ? 'var(--green)' : '' } }));
    card.append(bar);
    const reward = [];
    if (q.reward?.resources) reward.push(Object.entries(q.reward.resources).map(([r, n]) => `${n} ${game.data.resource[r]?.name || r}`).join(', '));
    if (q.reward?.research) reward.push(`${q.reward.research} free research`);
    if (q.reward?.crew) reward.push(`${q.reward.crew} crew`);
    if (reward.length) card.append(el('div.tiny', { text: 'Reward: ' + reward.join(' · ') }));
    const target = onJump ? questTarget(game, q) : null;
    if (target) card.append(el('button.small.ghost', { text: 'show me', onClick: () => onJump(target.x, target.y) }));
    out.push(card);
    if (out.length >= limit) break;
  }
  if (!out.length) out.push(el('p.tiny', { text: 'Nothing outstanding.' }));
  return out;
}

/** A place on the local map that would help with this quest, if there is an obvious one. */
function questTarget(game, q) {
  switch (q.type) {
    case 'build': case 'build_count': {
      const s = game.structures.find(x => x.type === q.target);
      return s ? { x: s.x, y: s.y } : game.hq();
    }
    case 'scan_nodes': case 'scan_all_of_kind': {
      const n = game.map.nodes.find(x => !x.scanned && (q.type === 'scan_nodes' || x.kind === q.target));
      return n ? { x: n.x, y: n.y } : null;
    }
    case 'kill_nests': {
      const n = game.nests.find(x => x.alive && x.known);
      return n ? { x: n.x, y: n.y } : null;
    }
    case 'reach_rare': {
      const n = game.map.nodes.find(x => x.scanned && !x.depleted && game.data.resource[x.resource]?.kind === 'rare');
      return n ? { x: n.x, y: n.y } : null;
    }
    default: return null;
  }
}
