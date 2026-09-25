// The selection panel: whatever you clicked, and everything you can do to it.
//
// The three fields that answer "why has this stopped" get their own row at the top of a machine:
// powered (the grid is short), starvedFor (an input is missing), blocked (the output has nowhere to
// go). Between them they cover almost every jam in the game, so they are the first thing you read.

import { $, el, fill, patch, num, kw, clamp, countdown, titleCase } from './dom.js';
import { icon, rawIcon } from './icons.js';
import { openDialog, closeDialog } from './hud.js';
import { routeList } from './route-tool.js';

export class Panel {
  constructor({ game, surface, sound, onMessage }) {
    this.game = game;
    this.surface = surface;
    this.sound = sound;
    this.onMessage = onMessage || (() => {});
    this.node = $('sidepanel');
    this.selection = [];
  }

  setGame(game) { this.game = game; this.show([]); }

  show(selection) {
    this.selection = selection;
    if (!selection.length) { this.node.hidden = true; return; }
    this.node.hidden = false;
    this.render(true);
  }

  /** Called every frame while something is selected, so the numbers stay live. */
  refresh() {
    if (this.node.hidden || !this.selection.length) return;
    if (performance.now() - (this._at || 0) < 220) return;
    this._at = performance.now();
    // a selection whose subject has been destroyed closes itself
    const s = this.selection[0];
    if (s.kind === 'structure' && !this.game.byId(s.structure.id)) { this.surface.select([]); return; }
    if (s.kind === 'enemy' && !s.enemy.alive) { this.surface.select([]); return; }
    this.render();
  }

  /**
   * `fresh` is a new selection, so the old panel is thrown away outright; a refresh of the same
   * selection is patched in place instead. That is what keeps an open recipe dropdown open — the
   * panel redraws four times a second and the old code replaced the <select> element every time.
   */
  render(fresh = false) {
    const sel = this.selection;
    const s = sel[0];
    const body = sel.length > 1 ? this._multi(sel) :
      s.kind === 'structure' ? this._structure(s.structure)
        : s.kind === 'unit' ? this._unit(s.unit)
          : s.kind === 'vehicle' ? this._vehicle(s.vehicle)
            : s.kind === 'enemy' ? this._enemy(s.enemy)
              : s.kind === 'nest' ? this._nest(s.nest)
                : s.kind === 'node' ? this._node(s.node)
                  : el('p.tiny', { text: 'Nothing here.' });
    const close = el('button.small.ghost', { text: 'close', onClick: () => this.surface.select([]) });
    if (fresh) fill(this.node, body, close);
    else patch(this.node, body, close);
  }

  _head(iconEl, title, sub) {
    return el('div.sp-head', null, iconEl, el('div', null, el('b', { text: title }), el('div.tiny', { text: sub })));
  }
  _row(label, value, tip = null) {
    return el('div.sp-row', tip ? { tip } : null, el('span', { text: label }), el('b', { text: String(value) }));
  }
  _section(title, ...kids) { return el('div.sp-section', null, el('h5', { text: title }), ...kids); }

  // ------------------------------------------------------------------ structure
  _structure(s) {
    const g = this.game;
    const box = el('div');
    box.append(this._head(icon('bld', s.def, { size: 26 }), s.def.name, `${titleCase(s.def.category)} · ${s.w}×${s.h}`));
    box.append(el('p.tiny', { text: s.def.desc || '' }));

    if (s.state !== 'done') {
      const t = clamp(s.progress / Math.max(1, s.def.buildTime || 1), 0, 1);
      box.append(this._row('Building', `${(t * 100) | 0}%`));
      const b = el('div.bar'); b.append(el('i.bar-fill', { style: { width: (t * 100) + '%' } }));
      box.append(b);
      const builders = g.units.filter(u => u.alive && u.target === s.id).length;
      box.append(el('p.tiny', { text: builders ? `${builders} builder${builders === 1 ? '' : 's'} on it.` : 'No builder has reached it yet.' }));
      box.append(el('div.sp-actions', null,
        el('button.small', { text: 'Send builders', tip: 'Point every idle builder at this outline', onClick: () => this._sendBuilders(s) }),
        el('button.small.danger', { text: 'Cancel', tip: 'Scrap the outline; the materials come back', onClick: () => { g.cancelBuild(s.id); this.surface.select([]); this.sound?.ui('close'); } })));
      return box;
    }

    // why has this stopped
    box.append(this._status(s));

    box.append(this._row('Health', `${Math.round(s.hp)} / ${s.maxHp}`));
    if (s.def.powerUse) box.append(this._row('Power draw', kw(s.def.powerUse) + (s.busy ? '' : ' (idle)'), 'A machine that is not working draws a quarter of its rating.'));
    if (s.def.powerGen) box.append(this._row('Generating', kw(s.def.powerGen * (s.duty ?? 0)) + ' of ' + kw(s.def.powerGen), 'Generators only burn what the grid asked for.'));
    if (s.def.powerStore) box.append(this._row('Charge', `${Math.round(s.charge || 0)} / ${s.def.powerStore}`));
    if (s.def.shieldPool) box.append(this._row('Shield', `${Math.round(s.shield || 0)} / ${s.def.shieldPool}`));
    if (s.def.extractRate && s.nodeId) {
      const n = g.nodeById(s.nodeId);
      if (n) {
        box.append(this._row('Working', g.data.resource[n.resource]?.name || n.resource));
        box.append(this._row('Patch left', n.depleted ? 'empty' : `${num(n.amount)} (${Math.round(n.amount / Math.max(1, n.initial) * 100)}%)`,
          'A patch is finite. When it runs dry the drill stops and you move it.'));
        box.append(this._row('Richness', '×' + n.richness));
      }
    }
    if (s.def.storage) {
      const load = Object.values(s.inv).reduce((a, b) => a + b, 0);
      box.append(this._row('Store', `${Math.round(load)} / ${s.cap}`,
        'One resource may take at most a quarter of a store, and raw materials half of it together — otherwise ore fills every crate and the factory deadlocks.'));
    }
    const pool = el('div.sp-pool');            // always present: a pool can appear and vanish as you build
    if (s.pool != null && s.pool >= 0) {
      const mates = (s.links || []).length;
      pool.append(this._row('Store pool', mates ? `${mates + 1} buildings` : 'on its own',
        'Everything in one pool shares its contents for free. Anything outside it needs a delivery run.'));
    } else if (s.def.storage || s.recipe) {
      pool.append(el('div.status-line', null, el('i.dot.warn'), el('span', { text: 'Out of reach of any store — it can only use its own buffer.' })));
    }
    box.append(pool);

    // inventory - in its own slot, because a machine empties and fills while you are looking at it
    const hold = el('div.sp-hold');
    const inv = Object.entries(s.inv).filter(([, n]) => n > 0.01);
    if (inv.length) {
      const grid = el('div.inv-grid');
      for (const [r, n] of inv.sort((a, b) => b[1] - a[1])) {
        const d = g.data.resource[r];
        grid.append(el('span.iv', { tip: d?.name || r }, icon('res', d, { size: 14 }), String(Math.round(n * 10) / 10)));
      }
      hold.append(this._section('Holding', grid));
    }
    box.append(hold);

    // recipe
    // The <select> carries a key, so a refresh updates this element instead of building a new one.
    // The key has the building's id in it: point at a different building and you get a new control,
    // because the change handler below is wired to this one.
    const recipes = [...(g.data.recipesFor[s.type] || [])].filter(r => g.isUnlocked(r));
    if (recipes.length) {
      const cur = s.recipe ? g.data.recipe[s.recipe] : null;
      const sel = el('select.small', { key: 'recipe:' + s.id });
      sel.append(el('option', { value: '', text: '— nothing —' }));
      for (const r of recipes) {
        const rd = g.data.recipe[r];
        sel.append(el('option', { value: r, text: rd?.name || r, selected: r === s.recipe }));
      }
      sel.addEventListener('change', () => { g.setRecipe(s.id, sel.value || null); this.sound?.ui('tab'); this.render(); });
      const bits = [];
      if (cur) {
        bits.push(el('div.tiny', {
          text: `${Object.entries(cur.inputs || {}).map(([r, n]) => `${n} ${g.data.resource[r]?.name || r}`).join(' + ') || 'nothing'}`
            + ` → ${Object.entries(cur.outputs || {}).map(([r, n]) => `${n} ${g.data.resource[r]?.name || r}`).join(' + ')}`
            + ` every ${cur.time}s`,
        }));
        const t = clamp(s.craft / Math.max(0.1, cur.time), 0, 1);
        const b = el('div.bar'); b.append(el('i.bar-fill', { style: { width: (t * 100) + '%' } }));
        bits.push(b);
        bits.push(el('div.tiny', { text: `${s.crafted} made` }));
      }
      box.append(el('div.sp-recipe', null, this._section('Recipe', sel, ...bits)));
    } else box.append(el('div.sp-recipe'));      // always present, so the recipe control never moves

    // routes touching this building
    const mine = g.routes.filter(r => r.from === s.id || r.to === s.id);
    if (mine.length) {
      box.append(this._section('Delivery runs', routeList(g, {
        routes: mine,
        onJump: t => this.surface.jumpTo(t.x + t.w / 2, t.y + t.h / 2),
        onRemove: r => { g.removeRoute(r.id); this.render(); },
      })));
    }

    // actions
    const actions = el('div.sp-actions');
    if (s.def.powerUse || s.recipe || s.def.extractRate) {
      actions.append(el('button.small', {
        text: s.enabled ? 'Switch off' : 'Switch on',
        tip: 'A machine that is off draws no power and does no work.',
        onClick: () => { g.toggle(s.id); this.sound?.ui('click'); this.render(); },
      }));
    }
    const upgrade = g.data.structures.find(d => d.upgradeOf === s.type && g.isUnlocked(d.id));
    if (upgrade) {
      actions.append(el('button.small', {
        text: 'Upgrade → ' + upgrade.name,
        tip: `Tear this down (half the materials come back) and put a ${upgrade.name} outline in its place.`,
        onClick: () => this._upgrade(s, upgrade),
      }));
    }
    actions.append(el('button.small', { text: 'Route from here', tip: 'Start a delivery run with this building as the source', onClick: () => this.onRouteFrom?.(s) }));
    if (s !== g.hq()) {
      actions.append(el('button.small.danger', {
        text: 'Demolish', tip: 'Half the materials come back (Del)',
        onClick: () => { g.removeStructure(s.id, { refund: 0.5 }); this.surface.select([]); this.sound?.ui('close'); },
      }));
    }
    box.append(actions);
    return box;
  }

  _status(s) {
    const g = this.game;
    const box = el('div');
    const lines = [];
    if (!s.enabled) lines.push(['off', 'Switched off.']);
    else if (s.def.powerUse && s.powered < 0.5) lines.push(['warn', `Grid is short — running at ${Math.round(s.powered * 100)}%.`]);
    if (s.blocked) lines.push(['bad', 'Output has nowhere to go: the stores it can reach are full of it.']);
    if (s.starvedFor && !s.crafting) lines.push(['warn', `Waiting for ${g.data.resource[s.starvedFor]?.name || s.starvedFor}.`]);
    if (!lines.length && s.busy) lines.push(['ok', 'Running.']);
    if (!lines.length && !s.busy && (s.recipe || s.def.extractRate)) lines.push(['off', 'Idle.']);
    for (const [cls, text] of lines) box.append(el('div.status-line', null, el('i.dot.' + cls), el('span', { text })));
    return box;
  }

  _sendBuilders(s) {
    for (const u of this.game.units) if (u.alive && u.def.buildRate) { u.moveTo = null; u.target = s.id; }
    this.onMessage('Every builder is on its way.');
    this.sound?.ui('click');
  }

  _upgrade(s, upgrade) {
    const g = this.game;
    const { x, y, rot } = s;
    g.removeStructure(s.id, { refund: 0.5 });
    const out = g.place(upgrade.id, x, y, { rot: rot || 0 });
    if (!out.ok) { this.onMessage('Could not upgrade: ' + out.reason, true); this.sound?.ui('error'); }
    else { this.sound?.build(); this.surface.select([{ kind: 'structure', structure: out.structure }]); }
  }

  // ------------------------------------------------------------------ the rest
  _unit(u) {
    const box = el('div');
    box.append(this._head(icon('unit', u.def, { size: 26 }), u.def.name, u.def.desc || 'crew'));
    box.append(this._row('Health', `${Math.round(u.hp)} / ${u.maxHp}`));
    box.append(this._row('Speed', u.def.speed + ' tiles/s'));
    if (u.def.buildRate) box.append(this._row('Build rate', u.def.buildRate + '/s'));
    if (u.def.dps) box.append(this._row('Damage', `${u.def.dps} dps, range ${u.def.range || 5}`));
    const job = u.moveTo ? 'walking to a spot you picked' : u.target ? 'working on an outline' : u.def.buildRate ? 'looking for work' : 'standing guard';
    box.append(this._row('Doing', job));
    box.append(el('p.tiny', { text: 'Right-click the map to send them somewhere; right-click an outline to put them on it.' }));
    return box;
  }

  _vehicle(v) {
    const g = this.game;
    const box = el('div');
    box.append(this._head(icon('veh', v.def, { size: 26 }), v.def.name, v.def.desc || 'hauler'));
    const r = g.routes.find(x => x.id === v.route);
    if (r) {
      const from = g.byId(r.from), to = g.byId(r.to);
      const est = g.estimateTrip(r);
      box.append(this._row('Run', `${from?.def.name} → ${to?.def.name}`));
      box.append(this._row('Carrying', g.data.resource[r.resource]?.name || r.resource));
      box.append(this._row('Doing', r.waiting ? 'out of fuel' : r.state));
      box.append(this._row('Load', `${Math.round(v.cargo)} / ${v.def.capacity}`));
      if (est) box.append(this._row('Throughput', est.throughput.toFixed(2) + '/s', 'What this run moves per second when the source can keep up.'));
      box.append(this._row('Delivered', num(r.delivered) + ` over ${r.trips} trips`));
      box.append(el('div.sp-actions', null,
        el('button.small', { text: r.enabled ? 'Pause run' : 'Resume run', onClick: () => { r.enabled = !r.enabled; this.render(); } }),
        el('button.small.danger', { text: 'Scrap run', onClick: () => { g.removeRoute(r.id); this.surface.select([]); } })));
    } else box.append(el('p.tiny', { text: 'Not on a run.' }));
    if (v.def.fuelUse) box.append(this._row('Fuel', Math.round(v.fuel || 0)));
    return box;
  }

  _enemy(e) {
    const box = el('div');
    box.append(this._head(icon('unit', e.def, { size: 26 }), e.def.name, `wave ${e.wave || '—'}${e.def.boss ? ' · boss' : ''}`));
    box.append(el('p.tiny', { text: e.def.desc || '' }));
    box.append(this._row('Health', `${Math.round(e.hp)} / ${Math.round(e.maxHp)}`));
    box.append(this._row('Damage', e.dps.toFixed(1) + ' dps'));
    box.append(this._row('Armour', e.armor.toFixed(1)));
    box.append(this._row('Speed', e.speed.toFixed(2) + (e.air ? ' · flies' : '')));
    const t = this.game.byId(e.target);
    if (t) box.append(this._row('Heading for', t.def.name));
    if (e.def.phasesWalls) box.append(el('p.tiny.warn', { text: 'Walks straight through walls.' }));
    return box;
  }

  _nest(n) {
    const box = el('div');
    box.append(this._head(icon('unit', n.def, { size: 26 }), n.def.name, 'nest'));
    box.append(el('p.tiny', { text: n.def.desc || 'Every nest left standing adds to the threat clock.' }));
    box.append(this._row('Health', `${Math.round(n.hp)} / ${n.maxHp}`));
    if (n.def.spawns) box.append(this._row('Breeds', `${n.def.spawns.count} × ${this.game.data.unit[n.def.spawns.unit]?.name} every ${n.def.spawns.every}s`));
    box.append(el('p.tiny', { text: 'Artillery in range will shell it on its own.' }));
    return box;
  }

  _node(n) {
    const g = this.game;
    const def = g.data.resource[n.resource];
    const box = el('div');
    box.append(this._head(icon('res', def, { size: 26 }), def?.name || n.resource, `${n.kind} patch`));
    box.append(el('p.tiny', { text: def?.desc || '' }));
    box.append(this._row('Left', n.depleted ? 'empty' : num(n.amount)));
    box.append(this._row('Of', num(n.initial)));
    box.append(this._row('Richness', '×' + n.richness, 'Richness multiplies whatever a drill on it pulls out.'));
    const claim = n.claimedBy != null ? g.byId(n.claimedBy) : null;
    box.append(this._row('Worked by', claim ? claim.def.name : 'nobody'));
    if (!claim && !n.depleted) {
      const fits = g.buildable().filter(d => d.requiresNode && (d.requiresNode.includes(n.kind) || d.requiresNode.includes(n.resource)) && (!d.nodeResource || d.nodeResource === n.resource));
      if (fits.length) {
        const acts = el('div.sp-actions');
        for (const d of fits.slice(0, 4)) acts.append(el('button.small', { text: d.name, onClick: () => this.onBuildHere?.(d.id, n) }));
        box.append(this._section('Put one here', acts));
      }
    }
    return box;
  }

  _multi(sel) {
    const box = el('div');
    const units = sel.filter(s => s.kind === 'unit');
    box.append(this._head(rawIcon('ui_build', { size: 26 }), `${sel.length} selected`, units.length ? `${units.length} crew` : ''));
    const counts = new Map();
    for (const s of sel) {
      const name = s.structure?.def.name || s.unit?.def.name || s.vehicle?.def.name || s.kind;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    for (const [name, n] of counts) box.append(this._row(name, n));
    if (units.length) box.append(el('p.tiny', { text: 'Right-click the map to send them; right-click an outline to put them all on it.' }));
    return box;
  }
}
