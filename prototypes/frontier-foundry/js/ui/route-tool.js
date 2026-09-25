// The route tool: click a source store, click a destination, pick what to carry and what carries it.
//
// A route is the answer to "this cluster is out of reach of that one". Inside one storage pool
// everything is shared for free, so the tool warns you when both ends are already in the same pool -
// that route would be a truck driving in a circle for nothing.

import { $, el, fill, num, countdown } from './dom.js';
import { icon, rawIcon } from './icons.js';
import { openDialog, closeDialog } from './hud.js';
import { acceptsDelivery } from '../production.js';

export class RouteTool {
  constructor({ game, surface, sound, onMessage }) {
    this.game = game;
    this.surface = surface;
    this.sound = sound;
    this.onMessage = onMessage || (() => {});
    this.from = null;
  }

  setGame(game) { this.game = game; this.from = null; }

  start() {
    this.from = null;
    this.surface.setMode('route', this);
    this.onMessage('Route: click the building the goods come FROM.');
    this.sound?.ui('open');
  }

  /** Drop the tool without touching the surface - see Surface.setMode. */
  reset() { this.from = null; }

  cancel() {
    if (this.surface.tool === this) this.surface.setMode('select');
    this.reset();
    this.onMessage(null);
  }

  down(p) {
    const hit = this.game.selectAt(p.x, p.y);
    if (hit.kind !== 'structure' || hit.structure.state !== 'done') {
      this.sound?.ui('error');
      this.onMessage('That is not a finished building.', true);
      return;
    }
    if (!this.from) {
      this.from = hit.structure;
      this.onMessage(`From ${this.from.def.name}. Now click the building it delivers TO.`);
      this.sound?.ui('click');
      return;
    }
    if (hit.structure === this.from) { this.onMessage('Pick a different building for the other end.', true); return; }
    this.openPicker(this.from, hit.structure);
  }

  move() {}
  up() {}

  /** The little "what and with what" dialog, with the throughput of each choice worked out first. */
  openPicker(from, to) {
    const g = this.game;
    const samePool = from.pool != null && from.pool >= 0 && from.pool === to.pool;
    const body = el('div.dlg-body');
    body.append(el('h3.ruled', { text: `${from.def.name} → ${to.def.name}` }));
    if (samePool) body.append(el('p.tiny.warn', { text: 'These two are already in the same store pool — they share everything for free. A truck between them would do nothing.' }));

    // What could sensibly move, read off the engine rather than guessed: see sourceResources.
    const candidates = sourceResources(g, from);
    const takes = r => acceptsDelivery(g, to, r);
    // the ones the far end will actually take come first, and one of those is picked for you
    const order = [...candidates.keys()].sort((a, b) => (takes(b) ? 1 : 0) - (takes(a) ? 1 : 0)
      || (from.inv[b] || 0) - (from.inv[a] || 0)
      || String(g.data.resource[a]?.name || a).localeCompare(g.data.resource[b]?.name || b));

    let resource = order.find(takes) || order[0] || null;
    let vehicle = null;

    const resBox = el('div.picker');
    const vehBox = el('div.picker');
    const note = el('p.tiny');

    const refreshVehicles = () => {
      const list = g.data.vehicles.filter(v => v.carries.includes(phase(g, resource)) && g.isUnlocked(v.id) && !v.buildRate);
      if (!list.some(v => v.id === vehicle)) vehicle = list[0]?.id || null;
      fill(vehBox, list.length ? list.map(v => {
        const b = el('button' + (v.id === vehicle ? '.on' : ''), { tip: `${v.desc || ''} — ${v.capacity} a trip at ${v.baseSpeed} tiles/s` });
        b.append(icon('veh', v, { size: 18 }), el('span', { text: v.name }));
        b.addEventListener('click', () => { vehicle = v.id; refreshVehicles(); });
        return b;
      }) : el('p.tiny.bad', { text: 'Nothing you have researched can carry that. A tanker needs Fluid Hauling; a gas hauler needs Gas Handling.' }));
      refreshNote();
    };

    const refreshNote = () => {
      const vdef = vehicle ? g.data.vehicle[vehicle] : null;
      if (!vdef) { note.textContent = ''; return; }
      const garage = g.data.vehicles.length && hasGarage(g, vdef);
      const dist = Math.hypot(from.x - to.x, from.y - to.y);
      const rough = dist / Math.max(0.2, vdef.baseSpeed * 0.7);
      const cycle = rough * 2 + vdef.loadTime + vdef.unloadTime;
      const dry = vdef.fuelUse > 0 && g.available('fuel') <= 0;
      // the two things that stop a brand new run are a full garage and no fuel; the third is a
      // destination machine nothing has wired up yet, which looks like the run is broken
      const offGrid = !!to.def.powerUse && to.net < 0;
      note.className = 'tiny' + (garage && !dry && !offGrid ? '' : ' warn');
      note.textContent = `${vdef.name}: about ${countdown(cycle)} a round trip, roughly ${(vdef.capacity / cycle).toFixed(2)} a second.`
        + (garage ? '' : `  No free ${vdef.class === 'air' ? 'pad' : 'garage'} slot — build a ${vdef.garages?.[0]?.replace(/_/g, ' ') || 'garage'} first.`)
        + (dry ? '  This truck burns refined fuel and the base has none: it will sit at the bay until a refinery makes some. A hover truck runs on grid power instead.' : '')
        + (offGrid ? `  ${to.def.name} is not on any power grid, so the load will pile up in it and nothing will be made. Run a pole out to it or give it its own generator.` : '');
    };

    const refreshRes = () => {
      fill(resBox, order.length ? order.map(r => {
        const def = g.data.resource[r];
        const ok = takes(r);
        const held = Math.round(from.inv[r] || 0);
        const b = el('button' + (r === resource ? '.on' : '') + (ok ? '' : '.poor'), {
          tip: `${def?.name || r} — ${candidates.get(r)}, ${held} here right now.`
            + (ok ? '' : `  ${to.def.name} neither stores this nor uses it in a recipe, so a run carrying it would have nowhere to tip.`),
        });
        b.append(icon('res', def, { size: 18 }), el('span', { text: `${def?.name || r} ${held}` }));
        b.addEventListener('click', () => { resource = r; refreshRes(); refreshVehicles(); });
        return b;
      }) : el('p.tiny.bad', { text: `${from.def.name} neither holds nor makes anything. Pick a store, a drill, a harvester or a machine as the source.` }));
    };

    refreshRes(); refreshVehicles();
    body.append(el('h4.ruled', { text: 'Carry' }), resBox, el('h4.ruled', { text: 'With' }), vehBox, note);

    const go = el('button.primary', { text: 'Start the run' });
    go.addEventListener('click', () => {
      const out = g.addRoute({ from: from.id, to: to.id, resource, vehicle });
      if (!out.ok) { note.textContent = out.reason; note.className = 'tiny bad'; this.sound?.ui('error'); return; }
      this.sound?.deliver();
      closeDialog();
      this.cancel();
      this.onMessage(`Route running: ${g.data.resource[resource]?.name} to ${to.def.name}.`);
    });
    const dlg = openDialog(body);
    dlg.querySelector('.dlg-actions').prepend(go);
  }

  draw(g, v, surface) {
    if (!this.from) return;
    const a = surface.tileToScreen(this.from.x + this.from.w / 2, this.from.y + this.from.h / 2);
    g.save();
    g.strokeStyle = '#ffb648'; g.lineWidth = 2;
    g.strokeRect(surface.tileToScreen(this.from.x, this.from.y).x - 2, surface.tileToScreen(this.from.x, this.from.y).y - 2, this.from.w * v.z + 4, this.from.h * v.z + 4);
    if (surface.mouse.inside) {
      g.setLineDash([8, 6]);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(surface.mouse.x, surface.mouse.y); g.stroke();
    }
    g.restore();
  }
}

/**
 * Everything a building could sensibly send, and why — straight out of the engine's own stores,
 * patches and recipe table, never a hand-written list.
 *
 * The case that used to fall through the cracks is a biomass harvester: it has no patch and no
 * recipe, it cuts the ground under it, and it pushes what it cuts straight into the store pool, so
 * for most of a tick its own inventory is empty and the old "whatever it is holding" rule found
 * nothing. The terrain harvesters, the quarry's fixed mix, and every recipe a machine could be
 * switched to are all read here.
 *
 * Returns a Map of resource id → a short phrase saying where it comes from.
 */
export function sourceResources(g, from) {
  const out = new Map();
  const add = (r, why) => { if (r && g.data.resource[r] && !out.has(r)) out.set(r, why); };

  for (const [r, n] of Object.entries(from.inv || {})) if (n > 0.001) add(r, 'in its own store');
  // a drill or a pump works one patch
  if (from.nodeId) { const n = g.nodeById(from.nodeId); if (n) add(n.resource, 'out of the patch under it'); }
  // a quarry has no patch, it has a fixed mix
  for (const r of Object.keys(from.def.yields || {})) add(r, 'dug straight out of the ground');
  // a harvester cuts the ground inside its reach instead of working a patch
  if (from.def.harvestsTerrain) add(from.def.harvestYield || 'biomass', 'cut from the ground around it');
  // what it makes: the recipe it is set to first, then anything else it could be switched to
  const recipes = [from.recipe, ...(g.data.recipesFor[from.type] || [])].filter(Boolean);
  for (const id of recipes) {
    if (id !== from.recipe && !g.isUnlocked(id)) continue;
    const r = g.data.recipe[id];
    for (const res of Object.keys(r?.outputs || {})) add(res, id === from.recipe ? 'made here now' : `made here if you set it to ${r?.name || id}`);
  }
  // a store shares its pool for free, so anything in the pool can leave from here
  for (const id of from.links || []) {
    const mate = g.byId(id);
    if (!mate) continue;
    for (const [r, n] of Object.entries(mate.inv || {})) if (n > 0.001) add(r, 'in the store pool this is part of');
  }
  return out;
}

const phase = (g, res) => {
  const r = g.data.resource[res];
  return r?.phase === 'liquid' ? 'liquid' : r?.phase === 'gas' ? 'gas' : 'solid';
};

function hasGarage(g, vdef) {
  for (const s of g.structures) {
    if (s.state !== 'done' || !(vdef.garages || []).includes(s.type)) continue;
    if (g.vehicles.filter(v => v.alive && v.garage === s.id).length < (s.def.vehicleSlots || 3)) return true;
  }
  return false;
}

/** The route list panel body - used by the side panel and by the logistics popup. */
export function routeList(game, { onJump, onRemove, routes = null } = {}) {
  const box = el('div');
  const list = routes || game.routes;
  if (!list.length) { box.append(el('p.tiny', { text: 'No delivery runs yet. Press R, click a source, then a destination.' })); return box; }
  for (const r of list) {
    const from = game.byId(r.from), to = game.byId(r.to);
    if (!from || !to) continue;
    const est = game.estimateTrip(r) || {};
    const res = game.data.resource[r.resource];
    // say why it is standing still, not just which leg it is on
    const veh = game.vehicles.find(v => v.id === r.vehicle);
    const state = !r.enabled ? 'paused'
      : r.waiting ? 'out of fuel'
        : r.state === 'unloading' && veh && veh.cargo > 0 && r.fullSince ? 'destination full'
          : r.state === 'loading' && (!game.byId(r.from)?.inv[r.resource]) ? 'waiting for goods'
            : r.state;
    const row = el('div.qitem');
    row.append(icon('res', res, { size: 16 }));
    row.append(el('div', null,
      el('b', { text: `${from.def.name} → ${to.def.name}` }),
      el('div.tiny', {
        text: `${res?.name || r.resource} · ${est.throughput ? est.throughput.toFixed(2) + '/s' : '—'} · ${Math.round(r.delivered)} delivered · ${r.trips} trips · ${state}`,
      })));
    row.append(el('span.spacer'));
    if (onJump) row.append(el('button.small.ghost', { text: 'go', onClick: () => onJump(to) }));
    if (onRemove) row.append(el('button.small.danger', { text: '×', tip: 'Stop the run and scrap the truck', onClick: () => onRemove(r) }));
    box.append(row);
  }
  return box;
}
