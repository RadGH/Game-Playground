// The top bar, the message feed, the toasts and the two sticky banners.
//
// Everything here reads the game and writes the DOM; it never changes the world. The one exception is
// the jump-to button on a message, and that only moves the camera.

import { $, el, fill, num, kw, clamp, planetClock, countdown } from './dom.js';
import { icon, rawIcon, iconUrl } from './icons.js';

/** notifications.json names an icon with a short word; these are the files those words mean. */
const NOTE_ICON = {
  pod: 'bld_landing_pod', scan: 'ui_scan', drill: 'bld_drill_mk1', build: 'ui_build', warn: 'ui_alert',
  power: 'ui_power', crate: 'ui_storage', truck: 'ui_delivery', lab: 'ui_research', quest: 'ui_quest',
  attack: 'ui_attack', crew: 'unit_builder', hazard: 'ui_hazard', map: 'ui_planet', space: 'ui_rocket',
  beacon: 'bld_beacon',
};
export const noteIcon = key => NOTE_ICON[key] || 'ui_alert';

/** Which bucket a message belongs to, read off the icon the data already gives it. */
const KIND_OF = {
  build: 'build', pod: 'build', crew: 'build',
  scan: 'economy', drill: 'economy', crate: 'economy', truck: 'economy', power: 'economy',
  attack: 'combat', warn: 'combat', hazard: 'combat',
  lab: 'science', quest: 'quests', map: 'quests',
  space: 'space', beacon: 'space',
};
export const noteKind = n => KIND_OF[n.icon] || 'economy';

/** Resources always worth a place on the strip, in this order, when the base has any. */
const HEADLINE = [
  'iron_plate', 'steel_plate', 'gear', 'copper_wire', 'circuit', 'iron_ingot', 'copper_ingot',
  'stone', 'concrete', 'coal', 'iron_ore', 'copper_ore', 'fuel', 'pack_basic',
];

export class Hud {
  constructor({ game, surface, sound, onScreen }) {
    this.game = game;
    this.surface = surface;
    this.sound = sound;
    this.onScreen = onScreen;
    this.minImportance = 2;
    this.kind = 'all';
    this.seenToast = new Set();
    this.feedRows = new Map();
    this._wire();
  }

  setGame(game) { this.game = game; this.feedRows.clear(); this.seenToast.clear(); fill($('feed-list')); }

  _wire() {
    $('feed-filter').addEventListener('change', e => { this.minImportance = +e.target.value; this.renderFeed(true); });
    $('feed-kind').addEventListener('change', e => { this.kind = e.target.value; this.renderFeed(true); });
    $('feed-clear').addEventListener('click', () => { this.game.markSeen(); this.renderFeed(true); this.sound?.ui('tab'); });
    $('res-strip').addEventListener('click', () => this.showInventory());
  }

  // ------------------------------------------------------------------ top bar
  update() {
    const g = this.game;
    this._resources(g);
    this._power(g);
    this._research(g);
    this._threat(g);
    this._clock(g);
    this.renderFeed();
    this._banners(g);
  }

  _resources(g) {
    const inv = g.inventory();
    const strip = $('res-strip');
    const list = HEADLINE.filter(r => inv[r] > 0).slice(0, 9);
    // anything the base is making that is not on the headline list, biggest first, fills the gaps
    if (list.length < 9) {
      const rest = Object.entries(inv).filter(([r, n]) => n > 0 && !list.includes(r)).sort((a, b) => b[1] - a[1]);
      for (const [r] of rest) { if (list.length >= 9) break; list.push(r); }
    }
    const key = list.map(r => r + ':' + Math.round(inv[r])).join('|');
    if (key === this._resKey) return;
    this._resKey = key;
    fill(strip, list.map(r => {
      const def = g.data.resource[r];
      const row = el('span.r' + (inv[r] < 20 ? '.low' : ''), { tip: `${def?.name || r} — ${Math.round(inv[r])} across every store` });
      row.append(icon('res', def), Math.round(inv[r]) === 0 ? '0' : num(inv[r]));
      return row;
    }), list.length ? null : el('span.tiny', { text: 'stores empty' }));
  }

  _power(g) {
    const p = g.stats.power;
    const gauge = $('power-gauge');
    const ratio = p.use > 0 ? clamp((p.supplied ?? p.gen) / p.use, 0, 1) : 1;
    $('power-fill').style.width = (ratio * 100).toFixed(0) + '%';
    $('power-text').textContent = `${kw(p.supplied ?? p.gen)} / ${kw(p.use)}`;
    gauge.classList.toggle('hot', p.satisfaction < 0.85);
    gauge.dataset.tip = p.satisfaction < 0.85
      ? `Brownout: the grid is at ${Math.round(p.satisfaction * 100)}%. Extraction, defence and scanning keep their power; the factory is shed first. Build more generation or fewer machines.`
      : `Generating ${kw(p.supplied ?? p.gen)} of a possible ${kw(p.gen)}, against ${kw(p.use)} of demand.`;
  }

  _research(g) {
    const cur = g.research.current ? g.data.tech[g.research.current] : null;
    const gauge = $('research-gauge');
    if (!cur) {
      $('research-fill').style.width = '0%';
      $('research-text').textContent = g.research.done.length + ' done';
      gauge.dataset.tip = 'Nothing is being researched. Open the tree and start a node.';
      return;
    }
    const t = clamp(g.research.progress / Math.max(1, cur.work), 0, 1);
    $('research-fill').style.width = (t * 100).toFixed(1) + '%';
    $('research-text').textContent = `${cur.name} ${(t * 100) | 0}%`;
    const packs = Object.entries(cur.cost || {}).map(([r, n]) => `${g.data.resource[r]?.name || r} ${n}`).join(', ');
    gauge.dataset.tip = `${cur.name} — ${(t * 100) | 0}% of ${cur.work} lab-seconds. Packs: ${packs || 'none'}.${g.flags.researchStalled ? ' Stalled: the labs cannot see the packs.' : ''}`;
  }

  _threat(g) {
    const gauge = $('threat-gauge');
    const live = g.enemies.filter(e => e.alive).length;
    const W = g.data.waves;
    let label, ratio, hot = false;
    if (live) { label = `wave ${g.waveNumber} · ${live} left`; ratio = 1; hot = true; }
    else if (g.nextWaveAt != null) {
      const left = Math.max(0, g.nextWaveAt - g.time);
      label = `wave ${g.waveNumber + 1} in ${countdown(left)}`;
      ratio = 1 - clamp(left / 420, 0, 1);
      hot = left < 60;
    } else {
      const grace = W.grace[g.difficulty] ?? W.grace.normal;
      const thr = W.firstThreatThreshold[g.difficulty] ?? W.firstThreatThreshold.normal;
      const byTime = clamp(g.time / grace, 0, 1), byThreat = clamp(g.threat / thr, 0, 1);
      ratio = Math.max(byTime, byThreat);
      label = ratio > 0.75 ? 'they are coming' : ratio > 0.4 ? 'something stirs' : 'quiet';
    }
    $('threat-fill').style.width = (ratio * 100).toFixed(0) + '%';
    $('threat-text').textContent = label;
    gauge.classList.toggle('hot', hot);
    gauge.dataset.tip = `Threat ${Math.round(g.threat)}. Crafting makes smoke, drills and guns make noise, and every nest left standing adds more. It decays when you are quiet.`;
  }

  _clock(g) {
    const c = planetClock(g.time, g.planet.dayLength);
    $('clock-day').textContent = 'day ' + c.day;
    $('clock-time').textContent = c.hhmm + (g.isNight ? ' ·night' : '');
    $('planet-name').textContent = g.planet.name;
    $('planet-sub').textContent = `${g.planet.archetype} · ${g.structures.filter(s => s.state === 'done').length} built · ${g.units.filter(u => u.alive).length}/${g.crewCap()} crew`;
  }

  // ------------------------------------------------------------------ banners
  _banners(g) {
    const banner = $('wave-banner');
    const live = g.enemies.filter(e => e.alive);
    const soon = g.nextWaveAt != null && g.nextWaveAt - g.time < 45 && g.nextWaveAt - g.time > 0;
    if (live.length || soon) {
      banner.hidden = false;
      const text = live.length
        ? `⚠ wave ${g.waveNumber} — ${live.length} hostile${live.length === 1 ? '' : 's'} on the ground`
        : `⚠ wave ${g.waveNumber + 1} incoming — ${countdown(g.nextWaveAt - g.time)}`;
      if (banner.dataset.text !== text) {
        banner.dataset.text = text;
        fill(banner, rawIcon('ui_attack'), el('span', { text }),
          el('button.small', { text: 'show', onClick: () => this._jumpToThreat() }));
      }
    } else { banner.hidden = true; banner.dataset.text = ''; }

    const hz = $('hazard-banner');
    if (g.hazard) {
      hz.hidden = false;
      const text = `${g.hazard.type} — ${countdown(g.hazard.until - g.time)} left`;
      if (hz.dataset.text !== text) { hz.dataset.text = text; fill(hz, rawIcon('ui_hazard'), el('span', { text })); }
    } else { hz.hidden = true; hz.dataset.text = ''; }
  }

  _jumpToThreat() {
    const g = this.game;
    const e = g.enemies.find(x => x.alive);
    if (e) { this.onScreen?.('surface'); this.surface.jumpTo(e.x, e.y); return; }
    const last = [...g.notifications].reverse().find(n => n.type === 'wave_incoming' && n.at);
    if (last) { this.onScreen?.('surface'); this.surface.jumpTo(last.at.x, last.at.y); }
  }

  // ------------------------------------------------------------------ feed
  renderFeed(force = false) {
    const g = this.game;
    const list = $('feed-list');
    const wanted = g.notifications.filter(n => n.importance >= this.minImportance && (this.kind === 'all' || noteKind(n) === this.kind)).slice(-70);
    if (force) { list.replaceChildren(); this.feedRows.clear(); }
    for (const n of wanted) {
      let row = this.feedRows.get(n.id);
      if (!row) {
        row = this._noteRow(n);
        this.feedRows.set(n.id, row);
        list.prepend(row);
      }
      row.classList.toggle('unseen', !n.seen);
    }
    // drop rows that have scrolled out of the window we keep
    if (this.feedRows.size > 90) {
      const keep = new Set(wanted.map(n => n.id));
      for (const [id, row] of this.feedRows) if (!keep.has(id)) { row.remove(); this.feedRows.delete(id); }
    }
    const unread = g.unread(this.minImportance).length;
    const pill = $('feed-unread');
    pill.textContent = unread;
    pill.classList.toggle('hot', unread > 0 && g.unread(4).length > 0);
  }

  _noteRow(n) {
    const g = this.game;
    const row = el('div.note.i' + n.importance);
    row.append(rawIcon(noteIcon(n.icon)));
    row.append(el('div', null, el('span', { text: n.text })));
    const right = el('div.t', { text: planetClock(n.time, g.planet.dayLength).hhmm });
    if (n.at) {
      const jump = el('button.jump', { text: 'go', tip: 'Centre the map on this (N cycles through them)' });
      jump.addEventListener('click', ev => { ev.stopPropagation(); this.jump(n); });
      row.append(el('div', null, right, jump));
    } else row.append(right);
    row.addEventListener('click', () => { n.seen = true; if (n.at) this.jump(n); row.classList.remove('unseen'); });
    return row;
  }

  /** Centre the surface camera on a message and mark it read. */
  jump(n) {
    if (!n?.at) return;
    n.seen = true;
    this.onScreen?.('surface');
    this.surface.jumpTo(n.at.x, n.at.y);
    this.sound?.ui('tab');
    this.renderFeed();
  }

  /** Jump to the oldest unread message that has a place (the N key). */
  jumpNext() {
    const n = this.game.notifications.find(x => !x.seen && x.at && x.importance >= this.minImportance)
      || this.game.notifications.slice().reverse().find(x => x.at);
    if (n) this.jump(n);
  }

  // ------------------------------------------------------------------ toasts
  /** Called from the game's notify event. Anything at importance 4 or 5 interrupts. */
  toast(n) {
    if (n.importance < 4 || this.seenToast.has(n.id)) return;
    this.seenToast.add(n.id);
    this.sound?.alert(n.importance);
    const box = $('toasts');
    const t = el('div.toast.i' + n.importance);
    t.append(rawIcon(noteIcon(n.icon), { size: 20 }), el('span', { text: n.text }));
    if (n.at) t.append(el('button.small', { text: 'go', onClick: () => { this.jump(n); t.remove(); } }));
    t.append(el('button.small.ghost', { text: '×', onClick: () => t.remove() }));
    box.append(t);
    setTimeout(() => t.remove(), n.importance >= 5 ? 11000 : 7000);
    while (box.children.length > 4) box.firstChild.remove();
  }

  // ------------------------------------------------------------------ inventory popup
  showInventory() {
    const g = this.game;
    const inv = g.inventory();
    const rows = Object.entries(inv).filter(([, n]) => n > 0.01)
      .sort((a, b) => (g.data.resource[a[0]]?.kind || '').localeCompare(g.data.resource[b[0]]?.kind || '') || b[1] - a[1]);
    const byKind = new Map();
    for (const [r, n] of rows) {
      const kind = g.data.resource[r]?.kind || 'other';
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push([r, n]);
    }
    const body = el('div.dlg-body');
    body.append(el('h3.ruled', { text: 'Everything in every store' }));
    if (!rows.length) body.append(el('p.tiny', { text: 'The stores are empty.' }));
    for (const [kind, list] of byKind) {
      body.append(el('h4.ruled', { text: kind }));
      const grid = el('div.codex-body');
      for (const [r, n] of list) {
        const def = g.data.resource[r];
        grid.append(el('div.codex-card', null, icon('res', def, { size: 26 }),
          el('div', null, el('b', { text: def?.name || r }), el('div.meta', { text: Math.round(n * 10) / 10 + ' held · ' + (def?.desc || '') }))));
      }
      body.append(grid);
    }
    openDialog(body);
  }
}

/** A plain modal with a close button — used by the inventory, the cargo picker and the recipe list. */
export function openDialog(body, { title = null, wide = false } = {}) {
  const dlg = $('dlg');
  dlg.replaceChildren();
  if (title) dlg.append(el('h3.ruled', { text: title }));
  dlg.append(body);
  dlg.append(el('div.dlg-actions', null, el('button', { text: 'Close', onClick: () => dlg.close() })));
  dlg.style.maxWidth = wide ? 'min(960px, 94vw)' : '';
  if (!dlg.open) dlg.showModal();
  return dlg;
}
export const closeDialog = () => { const d = $('dlg'); if (d.open) d.close(); };
