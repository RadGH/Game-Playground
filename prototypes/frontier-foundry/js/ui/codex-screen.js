// Quests on the left, and a codex of everything this run has actually turned up on the right.
//
// Nothing here is a spoiler list: a resource appears once you have held some or scanned a patch of
// it, an enemy once one has walked onto your map, a building once you could build it.

import { $, el, fill, num } from './dom.js';
import { icon, rawIcon } from './icons.js';
import { questCards } from './map-screen.js';

const TABS = [
  ['resources', 'Materials'],
  ['structures', 'Buildings'],
  ['enemies', 'Wildlife'],
  ['vehicles', 'Haulers'],
  ['crew', 'Crew'],
];

export class CodexScreen {
  constructor({ game, sound, onJump }) {
    this.game = game;
    this.sound = sound;
    this.onJump = onJump;
    this.tab = 'resources';
    this.seenEnemies = new Set();
    this.seenResources = new Set();
    this._tabsBuilt = false;
  }

  setGame(game) { this.game = game; this.seenEnemies = new Set(); this.seenResources = new Set(); }

  /** Called every second by the main loop, so the codex fills in as the run goes on. */
  observe() {
    const g = this.game;
    for (const e of g.enemies) if (e.alive) this.seenEnemies.add(e.type);
    for (const n of g.nests) if (n.known) this.seenEnemies.add(n.type);
    for (const r of Object.keys(g.inventory())) this.seenResources.add(r);
    for (const r of Object.keys(g.stats.produced || {})) this.seenResources.add(r);
    for (const n of g.map.nodes) if (n.scanned) this.seenResources.add(n.resource);
  }

  render() {
    const g = this.game;
    if (!this._tabsBuilt) {
      fill($('codex-tabs'), TABS.map(([id, name]) =>
        el('button' + (id === this.tab ? '.on' : ''), { text: name, dataset: { tab: id }, onClick: () => { this.tab = id; this._tabsBuilt = false; this.sound?.ui('tab'); this.render(); } })));
      this._tabsBuilt = true;
    }
    fill($('quest-list'), questCards(g, { onJump: this.onJump, includeDone: true }));
    this.observe();
    fill($('codex-body'), ...this._cards());
  }

  _cards() {
    const g = this.game;
    const card = (kind, def, meta) => el('div.codex-card', null, icon(kind, def, { size: 30 }),
      el('div', null, el('b', { text: def.name }), el('div.d', { text: def.desc || '' }), meta ? el('div.meta', { text: meta }) : null));

    if (this.tab === 'resources') {
      const inv = g.inventory(), made = g.stats.produced || {};
      return [...this.seenResources].map(id => g.data.resource[id]).filter(Boolean)
        .sort((a, b) => (a.kind || '').localeCompare(b.kind || '') || a.name.localeCompare(b.name))
        .map(d => card('res', d, `${d.kind} · ${Math.round(inv[d.id] || 0)} held · ${Math.round(made[d.id] || 0)} made`));
    }
    if (this.tab === 'structures') {
      const built = new Map();
      for (const s of g.structures) if (s.state === 'done') built.set(s.type, (built.get(s.type) || 0) + 1);
      return g.buildable().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map(d => card('bld', d, `${d.category} · ${d.size.w}×${d.size.h} · ${built.get(d.id) || 0} standing`));
    }
    if (this.tab === 'enemies') {
      const list = [...this.seenEnemies].map(id => g.data.unit[id]).filter(Boolean);
      if (!list.length) return [el('p.tiny', { text: 'Nothing hostile has shown itself yet. It will.' })];
      return list.sort((a, b) => (a.threat || 0) - (b.threat || 0))
        .map(d => card('unit', d, `${d.hp} hp · ${d.dps} dps · speed ${d.speed || 0}${d.air ? ' · flies' : ''}${d.armor ? ' · armour ' + d.armor : ''}${d.boss ? ' · BOSS' : ''}`));
    }
    if (this.tab === 'vehicles') {
      return g.data.vehicles.filter(v => g.isUnlocked(v.id))
        .map(d => card('veh', d, `${d.capacity} a trip · ${d.baseSpeed} tiles/s · carries ${d.carries.join('/')}`));
    }
    const crew = g.data.units.filter(u => u.side === 'player' && (g.isUnlocked(u.id) || u.id === 'builder'));
    const live = new Map();
    for (const u of g.units) if (u.alive) live.set(u.type, (live.get(u.type) || 0) + 1);
    return crew.map(d => card('unit', d, `${live.get(d.id) || 0} alive · ${d.hp} hp${d.buildRate ? ' · builds ' + d.buildRate + '/s' : ''}${d.dps ? ' · ' + d.dps + ' dps' : ''}`));
  }
}
