// Shared frame for the four town-building panels (Outfitter, Barracks, Drill Yard, Sanctum):
// header (name, one-line purpose, gold + income), a body the panel fills, a footer of key hints,
// and a menu nav so the panel works by mouse, keyboard (arrows + Enter) and pad (d-pad + A).
//
// Every panel built on it returns the same shape to js/main.js:
//   { kind, el, open, setOpen(v), toggle(), update(dt), frame(deviceFrame, dt) -> true, destroy() }

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { createMenuNav } from './menunav.js';

export const BUILDING_NAMES = { shop: 'Outfitter', barracks: 'Barracks', drillyard: 'Drill Yard', sanctum: 'Sanctum' };
export const BUILDING_KEYS = { shop: 'O', barracks: 'B', drillyard: 'U', sanctum: 'P' };
export const BUILDING_PAD = { shop: 'View', barracks: '↓', drillyard: '↑', sanctum: 'LB' };
export const BUILDING_ICONS = { shop: 'bag', barracks: 'people', drillyard: 'hammer', sanctum: 'bolt' };

export function createTownPanel({ root, kind, sim, player, isPad, subtitle, footKbm, footPad, navSelector, onClose = null }) {
  const panel = h('div', 'town-panel tp-' + kind, null, { 'data-ui': true, hidden: true });
  const name = BUILDING_NAMES[kind];
  panel.innerHTML = `
    <div class="tw-head">
      <span class="tw-badge">${icon(BUILDING_ICONS[kind])}</span>
      <div class="tw-title"><b>${name}</b><span>${subtitle}</span></div>
      <div class="tw-purse"><span class="tw-gold" data-tip="Your gold">${icon('coin')}<b></b></span><span class="tw-inc" data-tip="Your income per payout">${icon('income')}<b></b></span></div>
      <button class="tw-close" data-act="close" aria-label="Close" data-tip="Close (${isPad ? 'B' : 'Esc'})">×</button>
    </div>
    <div class="tw-body"></div>
    <div class="tw-foot">${isPad ? footPad : footKbm}</div>`;
  root.append(panel);
  const body = panel.querySelector('.tw-body');
  let open = false;
  const nav = createMenuNav(body, { selector: navSelector, onBack: () => api.setOpen(false) });
  panel.querySelector('.tw-close').addEventListener('click', () => api.setOpen(false));

  const api = {
    kind, name, el: panel, body, nav,
    get open() { return open; },
    setOpen(v) {
      open = !!v; panel.hidden = !open;
      if (!open) onClose?.();
      api.onOpenChange?.(open);
    },
    toggle() { api.setOpen(!open); },
    purse() {
      const p = sim.state.players[player];
      setText(panel.querySelector('.tw-gold b'), Math.floor(p.gold));
      setText(panel.querySelector('.tw-inc b'), '+' + Math.round(p.income));
    },
    destroy() { nav.destroy(); panel.remove(); },
  };
  return api;
}

/** Clock text m:ss from seconds. */
export function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
