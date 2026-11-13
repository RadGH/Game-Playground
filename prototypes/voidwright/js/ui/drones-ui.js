// Drone cards and the "which drones fly" picker (reports #53 and #54).
//
// One card printer for every drone list (hold, drone shop, build mode), so a drone's numbers read the same
// everywhere: health, speed, damage per second or mining speed (compared with the Mining Laser I), repairs,
// shield. The picker lives in the hold's Drones tab (C): the drones flying now on top — Store or Swap each — and
// the drones in storage underneath — Fly when a port is free, otherwise Swap in for one that is flying.

import { el, btn, esc, toast } from './dom.js';
import { fmt as fmtN } from '../../../../shared/format.js';
import { DRONES, droneNumbers } from '../data/drones.js';
import { RARITY_BY_ID, DAMAGE } from '../data/types.js';
import { WEAPONS } from '../data/weapons.js';
import { fitDrone, unfitDrone, swapDrone } from '../sim/state.js';
import { droneIcon } from '../render/drone-art.js';

const fmt = (v, o = { decimals: 0 }) => fmtN(v, o);

/** What the first mining laser cuts from rock per second (damage × its rock multiplier) — the yardstick on cards. */
export const LASER_I_MINING = WEAPONS.mining_laser.dmg * WEAPONS.mining_laser.mineMult;

/** The [label, value-html] rows for a drone item. */
export function droneRows(item) {
  const N = droneNumbers(item.kind, item.rarity || 'common'); if (!N) return [];
  const rows = [['Health', fmt(N.hp)], ['Speed', `${fmt(N.speed)} m/s`]];
  if (N.mine) rows.push(['Mining', `${fmt(N.mine)} rock/s <span class="hint">(Mining Laser I: ${fmt(LASER_I_MINING)})</span>`], ['Reach', `${fmt(N.range)} m`]);
  else if (N.dps) { const DM = DAMAGE[N.type]; rows.push(['Damage per second', `${fmt(N.dps, { decimals: 1 })} <b style="color:${DM.color}">${esc(DM.name)}</b>`], ['Range', `${fmt(N.range)} m`]); }
  if (N.repair) rows.push(['Repairs', `${fmt(N.repair, { decimals: 1 })} health/s — you, then your wingmen`]);
  if (N.intercept) rows.push(['Special', 'Shoots down missiles']);
  if (N.shield) rows.push(['Flying shield', fmt(N.shield)]);
  if (N.mul > 1) rows.push(['Rarity', `<span class="good">+${fmt((N.mul - 1) * 100)}% to every number</span>`]);
  return rows;
}

/** A drone card (element). `state` = 'flying' | 'stored' | null; `actions` = buttons for the footer. */
export function droneCard(item, { state = null, actions = [], extra = null } = {}) {
  const D = DRONES[item.kind]; const R = RARITY_BY_ID[item.rarity || 'common'];
  let icon = null; try { icon = droneIcon(item.kind, 56); } catch { /* no canvas (tests) */ }
  return el('div', { class: 'card drone-card' + (state === 'flying' ? ' flying' : ''), style: `border-color:${R.color}66` },
    el('div', { class: 'row' }, icon, el('div', { class: 'grow' }, el('b', { style: `color:${R.color}` }, `${R.index ? R.name + ' ' : ''}${D.name}`),
      el('div', { class: 'hint' }, D.blurb || '')),
      state ? el('span', { class: 'dr-state ' + state }, state === 'flying' ? 'Flying' : 'Stored') : null),
    el('div', { class: 'kv', html: droneRows(item).map(([a, b]) => `<span>${esc(a)}</span><span>${b}</span>`).join('') }),
    extra, actions.length ? el('div', { class: 'row wrap it-foot' }, el('div', { class: 'grow' }), ...actions) : null);
}

/**
 * The picker. `ctx` = { G, cap, onChange, more? } — onChange runs after every change (save + relaunch in flight);
 * more(item, redraw) may add buttons to a card (the drone shop adds Sell).
 * Returns an element; it redraws itself.
 */
export function dronePicker(ctx) {
  const box = el('div', { class: 'drone-picker' });
  let swapFor = null;   // the stored drone waiting to pick which flying drone it replaces
  const draw = () => {
    const { G, cap } = ctx; box.innerHTML = '';
    const own = G.droneItems || []; const flying = (G.ship.drones || []).map(u => own.find(d => d.uid === u)).filter(Boolean).slice(0, cap);
    const stored = own.filter(d => !flying.includes(d));
    const changed = (msg) => { swapFor = null; ctx.onChange?.(msg); draw(); };
    box.append(el('h3', { class: 'st-h' }, `Flying with you — ${flying.length} of ${cap} drone port${cap === 1 ? '' : 's'}`));
    if (!cap) box.append(el('p', { class: 'hint' }, 'You have no drone port. Outfitters sell them (Drone ports shelf); place one in Build mode (B).'));
    const fl = el('div', { class: 'cards' });
    for (const d of flying) {
      const pick = swapFor && btn(`Put ${DRONES[swapFor.kind].name} here`, () => { const r = swapDrone(G, d.uid, swapFor.uid); if (!r.ok) toast(r.why, 'bad'); changed(r.ok ? `${DRONES[d.kind].name} stored.` : ''); }, 'small primary');
      fl.append(droneCard(d, { state: 'flying', actions: pick ? [pick] : [...(ctx.more?.(d, draw) || []), btn('Store', () => { unfitDrone(G, d.uid); changed(`${DRONES[d.kind].name} stored.`); }, 'small')] }));
    }
    for (let i = flying.length; i < cap; i++) fl.append(el('div', { class: 'card drone-empty' }, el('b', { class: 'hint' }, 'Empty port'), el('span', { class: 'hint' }, stored.length ? 'Pick a stored drone below.' : 'Buy or build a drone to fill it.')));
    box.append(fl);
    box.append(el('h3', { class: 'st-h' }, `In storage — ${stored.length}`));
    if (!own.length) box.append(el('p', { class: 'hint' }, 'No drones yet. Drone shops sell them; workshops build them; wrecks sometimes drop them.'));
    const st = el('div', { class: 'cards' });
    for (const d of stored) {
      const waiting = swapFor === d;
      const act = !cap ? [] : flying.length < cap
        ? [btn('Fly', () => { const r = fitDrone(G, d.uid, cap); if (!r.ok) { toast(r.why, 'bad'); return; } changed(`${DRONES[d.kind].name} launched.`); }, 'small primary')]
        : [btn(waiting ? 'Cancel' : 'Swap in', () => { swapFor = waiting ? null : d; draw(); }, 'small' + (waiting ? '' : ' primary'))];
      st.append(droneCard(d, { state: 'stored', actions: [...(ctx.more?.(d, draw) || []), ...act], extra: waiting ? el('p', { class: 'amber' }, 'Now pick the flying drone it replaces (above).') : null }));
    }
    box.append(st);
  };
  draw();
  return box;
}
