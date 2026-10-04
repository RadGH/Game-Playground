// The Barracks panel — THE way to hire units (owner rulings: spam sends, no stock, no time locks).
//
// Every unit of your race from query.roster (12 per race, new ones appear on their own), grouped by
// tier. Each card: icon, name, cost, +income, how many you can afford right now (×N) and a grid
// hotkey (Q W E R / A S D F / Z X C V — the old lane-war maps' command-card layout). A detail pane
// explains the focused / hovered unit in one line ("Sends a Levy into your rival's field. +1.8
// income for the rest of the match.") plus payback, toughness and counters. Built for SPAM:
// holding the mouse, the hotkey, Enter or the pad's A keeps buying (~9 a second).
//
//   mouse    click / hold a card · keyboard: its letter (hold), or arrows + Enter (hold) · Esc closes
//   pad      d-pad / stick to move, A (hold) to hire, B to close

import { h, setText, toggle } from './dom.js';
import { icon } from './icons.js';
import { createTownPanel } from './townpanel.js';
import { hp as fmtHp, fmt } from '../../../../shared/format.js';

const TIER_NAMES = { 1: 'Tier I', 2: 'Tier II', 3: 'Tier III', 4: 'Tier IV', 5: 'Tier V', 6: 'Champions' };
const DMG = { blade: 'Blade', pierce: 'Pierce', fire: 'Fire', nature: 'Nature' };
const ARM = { light: 'Light', heavy: 'Heavy', spectral: 'Spectral', hide: 'Hide', fortified: 'Fortified' };
export const GRID_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
const REPEAT_DELAY = 0.3, REPEAT_EVERY = 0.11;

export function createBarracks({ root, sim, Q, player, seat, isPad = false, iconUrl = () => null, onSend = () => {} }) {
  const data = sim.data;
  const base = createTownPanel({
    root, kind: 'barracks', sim, player, isPad, navSelector: '.bk-card',
    subtitle: 'Hire units to march on your rival. Every unit you hire raises your income.',
    footKbm: 'Click or press a unit\'s key to hire — <b>hold to keep hiring</b> · arrows + <kbd>Enter</kbd> · <kbd>B</kbd>/<kbd>Esc</kbd> close',
    footPad: '<kbd class="pad">A</kbd> hire — <b>hold to keep hiring</b> · <kbd class="pad">B</kbd> close',
  });
  base.body.innerHTML = '<div class="bk-tiers"></div><div class="tw-detail"></div>';
  const tiersEl = base.body.querySelector('.bk-tiers');
  const detail = base.body.querySelector('.tw-detail');
  const cards = new Map();
  let order = [];                    // unit ids in display order (for grid hotkeys)
  let rosterKey = '';
  let focusUnit = null;
  let hold = null;                   // { unit, t, next, src }

  function build(ro) {
    const byTier = new Map();
    for (const r of ro) { if (!byTier.has(r.tier)) byTier.set(r.tier, []); byTier.get(r.tier).push(r); }
    tiersEl.replaceChildren(); cards.clear(); order = [];
    for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
      const row = h('div', 'bk-tier');
      row.innerHTML = `<div class="bk-th">${TIER_NAMES[tier] || 'Tier ' + tier}</div>`;
      const grid = h('div', 'bk-row');
      for (const r of byTier.get(tier)) {
        const idx = order.length; order.push(r.unit);
        const key = GRID_KEYS[idx] ? GRID_KEYS[idx].slice(3) : '';
        const c = h('button', 'bk-card t' + tier, null, { type: 'button', 'data-unit': r.unit, 'data-tip-render': 'bl-unit', 'data-tip-unit': r.unit, 'data-tip-player': String(player) });
        const url = iconUrl(r.unit);
        c.innerHTML = `
          <span class="bk-ic">${url ? `<img src="${url}" alt="" draggable="false">` : `<b>${initials(r.name)}</b>`}</span>
          <span class="bk-nm">${r.name}${r.bodies > 1 ? ` <small>×${r.bodies}</small>` : ''}</span>
          <span class="bk-cost">${icon('coin')}<b>${r.cost}</b></span>
          <span class="bk-plus">${r.income > 0 ? `+${fmt(r.income, { decimals: 1 })}` : 'no'}</span>
          <span class="bk-afford"></span>
          ${key && !isPad ? `<kbd class="bk-key">${key}</kbd>` : ''}
          <span class="bk-pop"></span>`;
        grid.append(c); cards.set(r.unit, c);
      }
      row.append(grid);
      tiersEl.append(row);
    }
  }
  function initials(n) { return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

  function hire(unit) {
    const el = cards.get(unit);
    const r = Q.sendInfo(sim.state, data, player, unit);
    seat.issue({ type: 'send', unit });
    const ok = r.canBuy;
    if (el) {
      el.classList.remove('bought', 'refused'); void el.offsetWidth; el.classList.add(ok ? 'bought' : 'refused');
      if (ok) { const p = h('span', 'coin-pop', `−${r.cost}`); el.querySelector('.bk-pop').append(p); setTimeout(() => p.remove(), 650); }
    }
    onSend({ unit, ok, info: r });
  }

  // Mouse: press = hire, hold = keep hiring.
  tiersEl.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.bk-card'); if (!c || e.button !== 0) return;
    e.preventDefault();
    focusUnit = c.dataset.unit; base.nav.focus(c);
    hire(focusUnit);
    hold = { unit: focusUnit, at: performance.now(), next: REPEAT_DELAY, src: 'mouse' };
  });
  const stopHold = () => { if (hold?.src === 'mouse') hold = null; };
  window.addEventListener('pointerup', stopHold);
  tiersEl.addEventListener('pointerleave', stopHold);
  tiersEl.addEventListener('mouseover', (e) => { const c = e.target.closest('.bk-card'); if (c) focusUnit = c.dataset.unit; });
  // A keyboard / pad "click" (menunav) — detail 0 = not a real mouse click; the frame handler hires.
  tiersEl.addEventListener('click', (e) => { if (e.detail !== 0) e.preventDefault(); });

  base.onOpenChange = (v) => {
    hold = null;
    if (v) {
      update(0);
      const first = (focusUnit && cards.get(focusUnit)) || [...cards.values()][0];
      if (first) { base.nav.focus(first); focusUnit = first.dataset.unit; }
    }
  };

  function update(dt) {
    if (!base.open) return;
    base.purse();
    const ro = Q.roster(sim.state, data, player);
    const key = ro.map((r) => r.unit).join(',');
    if (key !== rosterKey) { rosterKey = key; build(ro); }
    const p = sim.state.players[player];
    for (const r of ro) {
      const c = cards.get(r.unit); if (!c) continue;
      const n = Math.max(0, Math.floor(p.gold / Math.max(1, r.cost)));
      setText(c.querySelector('.bk-afford'), n > 0 ? `×${n > 99 ? '99+' : n}` : '');
      toggle(c, 'can', n > 0);
      toggle(c, 'poor', n === 0);
    }
    const fu = (base.nav.current && base.nav.current.dataset.unit) || focusUnit;
    if (fu) { focusUnit = fu; drawDetail(ro.find((r) => r.unit === fu)); }
    // Repeat-buy on the wall clock: a slow frame rate must not slow the hiring (frame dt is capped).
    if (hold && dt > 0) {
      const t = (performance.now() - hold.at) / 1000;
      let n = 0;
      while (hold && t >= hold.next && n++ < 6) { hold.next += REPEAT_EVERY; hire(hold.unit); }
    }
  }

  function drawDetail(r) {
    if (!r) return;
    const k = `${r.unit}|${r.cost}|${r.income}|${r.vsRival?.dealt}|${r.vsRival?.taken}`;
    if (detail._k === k) return;
    detail._k = k;
    const url = iconUrl(r.unit);
    const article = /^[aeiou]/i.test(r.name) ? 'an' : 'a';
    const what = r.bodies > 1 ? `${r.bodies} × ${r.name}` : `${article} ${r.name}`;
    const vs = r.vsRival;
    const pip = (v) => (v > 100 ? 'good' : v < 100 ? 'bad' : 'even');
    detail.innerHTML = `
      <div class="sd-top">
        <span class="sd-ic">${url ? `<img src="${url}" alt="">` : ''}</span>
        <div><div class="sd-name">${r.name}</div><div class="sd-tier">${TIER_NAMES[r.tier] || ''}${r.roleText ? ` · ${r.roleText}` : ''}</div></div>
      </div>
      <p class="sd-line">Sends ${what} into your rival's field. ${r.income > 0 ? `<b>+${fmt(r.income, { decimals: 1 })} income</b> for the rest of the match.` : '<b>Adds no income</b> — pure pressure.'}</p>
      <dl class="sd-stats">
        <dt>Cost</dt><dd>${r.cost} gold${r.paybackSeconds != null ? ` · pays for itself in ${r.paybackSeconds} s` : ''}</dd>
        <dt>Health</dt><dd>${fmtHp(r.hp)}${r.bodies > 1 ? ` ×${r.bodies}` : ''} · ${ARM[r.armour] || r.armour} armour</dd>
        <dt>Damage</dt><dd>${fmt(r.dps, { decimals: 0 })} a second · ${DMG[r.dmg] || r.dmg}${r.range > 3 ? ' · ranged' : ''}</dd>
        <dt>Banners</dt><dd>tears ${fmt(r.leak, { decimals: 1 })} if it reaches the Keep</dd>
        <dt>Bounty</dt><dd>${r.bounty} gold to the defender per kill</dd>
      </dl>
      ${(r.counters?.lines || []).length ? `<ul class="sd-counters">${r.counters.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
      ${vs ? `<div class="sd-vs"><span class="pip ${pip(vs.dealt)}" data-tip="Its damage against your rival hero's armour right now">vs rival hero ${vs.dealt}%</span><span class="pip ${pip(200 - vs.taken)}" data-tip="Your rival hero's damage against its armour">rival hits it ${vs.taken}%</span></div>` : ''}
      ${(r.traitsText || []).length ? `<p class="sd-traits">${r.traitsText.join(' ')}</p>` : ''}`;
  }

  return Object.assign(base, {
    update,
    /** Menu input while open: move, A/Enter hire (hold repeats), grid letter keys hire (hold repeats). */
    frame(f, dt) {
      if (!base.open || !f) return false;
      const confirm = f.pressed.has('confirm');
      const pressed = new Set(f.pressed); pressed.delete('confirm');
      base.nav.handle({ pressed });
      if (base.nav.current) focusUnit = base.nav.current.dataset.unit;
      if (confirm && focusUnit) { hire(focusUnit); hold = { unit: focusUnit, at: performance.now(), next: REPEAT_DELAY, src: 'nav' }; }
      if (hold?.src === 'nav' && !f.held.has('confirm')) hold = null;
      // Grid letter keys (keyboard only): press = hire, hold = keep hiring.
      if (f.device === 'kbm') {
        for (const code of f.rawPressed || []) {
          const i = GRID_KEYS.indexOf(code);
          if (i >= 0 && order[i]) { focusUnit = order[i]; base.nav.focus(cards.get(order[i])); hire(order[i]); hold = { unit: order[i], at: performance.now(), next: REPEAT_DELAY, src: 'key', code }; }
        }
        if (hold?.src === 'key' && !base.heldKey?.(hold.code)) hold = null;
      }
      return true;
    },
    destroy() { window.removeEventListener('pointerup', stopHold); base.nav.destroy(); base.el.remove(); },
  });
}
