// The DOM menu router (docs/02 §6, §2.5, §27.1): a stack of full screens over the canvas in #screens. While any
// screen is open the game is paused (game.paused = true) and every key goes to the menu context: arrows / WASD move
// focus, Enter/Space confirm, Esc goes back one level (held 0.5 s closes everything), Q/E switch Satchel tabs,
// 1-6 jump to a tab, [ ] sub-tabs, X/Y secondary actions (handled by the screen's onKey).
//
// A screen module exports { id, title?, satchel?, noPause?, render(root, ctx, args, router), onKey?(code, e),
//   destroy?(), badge?(ctx), tips?(ctx) -> { rendererName: fn } }.
// The six character screens are TABS of one Satchel frame (02 §6): Inventory · Wicks · Skills · Attributes · Ledger · Journal.
import { installTooltips, registerTip, hideTip } from '../../../../shared/tooltip.js';
import { el, toast, cycle } from './menukit.js';
import { deriveStats, applyStats } from '../rpg/hero.js';
import * as Items from '../rpg/items.js';
import * as title from './title.js';
import * as classselect from './classselect.js';
import * as pause from './pause.js';
import * as inventory from './inventory.js';
import * as character from './character.js';
import * as wickbuilder from './wickbuilder.js';
import * as ledger from './ledger.js';
import * as settings from './settings.js';
import * as death from './death.js';
import * as journal from './journal.js';
import * as shop from './shop.js';
import * as dialogue from './dialogue.js';
import * as map from './map.js';

export const SATCHEL_TABS = [
  { id: 'inventory', label: 'Inventory' }, { id: 'wickbuilder', label: 'Wicks' }, { id: 'skills', label: 'Skills' },
  { id: 'attributes', label: 'Attributes' }, { id: 'ledger', label: 'Ledger' }, { id: 'journal', label: 'Journal' },
];
const ALIAS = { character: 'attributes', wicks: 'wickbuilder', wick_builder: 'wickbuilder', builder: 'wickbuilder', satchel: 'inventory' };
/** Every screen module, by id (a module may export several screens as `screens`). */
export const MODULES = {};
for (const m of [title, classselect, pause, inventory, character, wickbuilder, ledger, settings, death, journal, shop, dialogue, map])
  for (const s of m.screens || [m]) if (s?.id) MODULES[s.id] = s;

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';
const visible = n => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length) && getComputedStyle(n).visibility !== 'hidden';

/**
 * createScreens({ root, ctx }) -> router
 * ctx is the shared context every screen reads (see the Integration notes in README / the build report):
 * { game, data, hero (getter ok), profile, settings, saves, shops, meter, actions, canRekindle(), atLampPost, act, sound(id) }
 */
export function createScreens({ root = document.getElementById('screens'), ctx = {} } = {}) {
  root.classList.add('lf-menus');
  const stack = [];
  let escTimer = 0, escHeld = false, capture = null;
  ctx.actions = { ...defaultActions(ctx), ...(ctx.actions || {}) };
  installTooltips();
  for (const m of Object.values(MODULES)) for (const [name, fn] of Object.entries(m.tips?.(ctx) || {})) registerTip(name, fn);

  const router = {
    ctx, stack,
    /** Open a screen (or switch the Satchel frame's tab). args are passed to render. */
    open(name, args = {}) {
      name = ALIAS[name] || name;
      const mod = MODULES[name]; if (!mod) { console.warn('no screen', name); return null; }
      if (mod.canOpen) { const why = mod.canOpen(ctx, args); if (why) { toast(why, 'bad'); ctx.sound?.('ui.error'); return null; } }
      const top = stack[stack.length - 1];
      if (mod.satchel && top?.satchel) { swapTab(top, name, args); return top; }
      hideTip();
      const entry = { id: name, mod, args, satchel: !!mod.satchel, prevFocus: document.activeElement };
      entry.el = el('div', { class: `scr scr-${name}${mod.overlay ? ' overlay' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': mod.title || name });
      entry.el.addEventListener('contextmenu', e => { if (e.target === entry.el || e.target.classList.contains('lf-frame')) { e.preventDefault(); router.back(); } });
      if (top && !mod.overlay) top.el.hidden = true;
      stack.push(entry); root.append(entry.el);
      if (entry.satchel) buildFrame(entry); else renderEntry(entry, entry.el);
      syncPause(); ctx.sound?.('ui.open');
      focusFirst(entry);
      return entry;
    },
    /** Close the top screen (back one level). */
    close() { closeTop(); },
    back() { closeTop(); },
    closeAll() { while (stack.length) closeTop(true); },
    top: () => stack[stack.length - 1]?.id || null,
    /** isOpen() = any screen; isOpen(id) = that screen anywhere in the stack. */
    isOpen: id => id ? stack.some(s => s.id === id || s.tab === id) : stack.length > 0,
    /** Re-render the top screen in place (after the game changed something it shows). */
    refresh() { const t = stack[stack.length - 1]; if (!t) return; t.mod.destroy?.(); if (t.satchel) renderTab(t); else { t.el.replaceChildren(); renderEntry(t, t.el); } },
    /** A screen can take every key for itself (the rebind screen's capture mode). fn(e) -> void; null ends it. */
    capture(fn) { capture = fn; },
    /** Open a screen from a gameplay key (main.js calls this with the action id). Returns true if it acted. */
    fromAction(action) {
      const map = { pause: 'pause', inventory: 'inventory', character: 'attributes', skills: 'skills', wick_builder: 'wickbuilder', ledger: 'ledger', journal: 'journal' };
      if (action === 'map') { if (router.top() === 'map') router.closeAll(); else router.open('map'); return true; }
      const id = map[action]; if (!id) return false;
      if (stack.length && router.top() === id) { router.closeAll(); return true; }
      router.open(id); return true;
    },
    destroy() { router.closeAll(); removeEventListener('keydown', onCapture, true); removeEventListener('keyup', onCapture, true); document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp); },
  };

  function renderEntry(entry, host) {
    try { entry.mod.render(host, ctx, entry.args, router); }
    catch (e) { console.error(e); host.append(el('div', { class: 'lf-error', text: `This screen failed to draw: ${e.message}` })); ctx.errors?.push?.(String(e.stack || e)); }
  }
  function buildFrame(entry) {
    entry.tab = entry.id;
    entry.frame = el('div', { class: 'lf-frame satchel' });
    entry.rail = el('div', { class: 'lf-rail', role: 'tablist', 'aria-label': 'Satchel' });
    entry.body = el('div', { class: 'lf-frame-body' });
    const close = el('button', { type: 'button', class: 'lf-close', 'aria-label': 'Close', text: '✕', onclick: () => router.closeAll() });
    entry.frame.append(el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: 'Satchel' }), entry.rail, close), entry.body);
    entry.el.append(entry.frame);
    renderTab(entry);
  }
  function renderTab(entry) {
    entry.rail.replaceChildren(...SATCHEL_TABS.map((t, i) => {
      const m = MODULES[t.id]; const on = t.id === entry.tab;
      const b = el('button', { type: 'button', role: 'tab', class: 'lf-tab' + (on ? ' on' : ''), 'aria-selected': String(on), dataset: { tab: t.id } }, el('kbd', { text: String(i + 1) }), t.label, m?.badge?.(ctx) ? el('i', { class: 'dot', 'aria-label': 'something new' }) : null);
      b.addEventListener('click', () => swapTab(entry, t.id, {}));
      return b;
    }));
    entry.body.replaceChildren(); entry.body.className = 'lf-frame-body tab-' + entry.tab;
    entry.mod = MODULES[entry.tab]; entry.id = entry.tab;
    renderEntry(entry, entry.body);
  }
  function swapTab(entry, id, args) {
    if (id === entry.tab) return;
    entry.mod.destroy?.(); hideTip(); entry.tab = id; entry.args = args; renderTab(entry); ctx.sound?.('ui.tab');
    focusFirst(entry);
  }
  function closeTop(silent) {
    const t = stack.pop(); if (!t) return;
    hideTip(); t.mod.destroy?.(); t.el.remove(); capture = null;
    const next = stack[stack.length - 1]; if (next) { next.el.hidden = false; if (!silent) router.refresh(); }
    syncPause(); if (!silent) ctx.sound?.('ui.close');
    if (t.prevFocus && document.contains(t.prevFocus)) t.prevFocus.focus?.(); else if (!stack.length) document.getElementById('view')?.focus?.();
    if (!stack.length) ctx.onClose?.();
  }
  function syncPause() {
    const paused = stack.some(s => !s.mod.noPause);
    if (ctx.game) ctx.game.paused = paused;
    ctx.onPause?.(paused);
  }
  function focusFirst(entry) {
    requestAnimationFrame(() => {
      const host = entry.el; if (host.contains(document.activeElement) && document.activeElement !== host) return;
      const want = host.querySelector('[data-autofocus]') || [...host.querySelectorAll(FOCUSABLE)].find(visible);
      want?.focus?.();
    });
  }
  /** Spatial focus: pick the nearest focusable in the pressed direction. */
  function moveFocus(dx, dy) {
    const top = stack[stack.length - 1]; if (!top) return;
    const host = top.el.querySelector('.lf-modal') || top.el;
    const all = [...host.querySelectorAll(FOCUSABLE)].filter(visible);
    const cur = document.activeElement; if (!all.length) return;
    if (!host.contains(cur) || cur === host) { all[0].focus(); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestD = Infinity;
    for (const n of all) {
      if (n === cur) continue; const b = n.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const px = bx - ax, py = by - ay; const along = px * dx + py * dy; if (along <= 2) continue;
      const across = Math.abs(px * dy - py * dx); const d = along + across * 2.2;
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best) { best.focus(); best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); ctx.sound?.('ui.hover'); }
  }

  // The rebind screen's capture mode takes the key before anything else sees it.
  function onCapture(e) { if (!capture || !stack.length) return; e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'keydown' && !e.repeat) capture(e); }
  // Menu keys are read on `document` in the bubble phase: controls inside the screen handle their own keys first,
  // then the router, and propagation stops here so main.js's window listeners never see a menu key (02 §5).
  function onKeyDown(e) {
    if (!stack.length) return;
    e.stopPropagation();
    if (e.defaultPrevented && e.code !== 'Escape') return;
    const top = stack[stack.length - 1];
    const modal = top.el.querySelector('.lf-modal');
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'radio' && e.target.type !== 'range';
    if (e.code === 'Escape') {
      e.preventDefault(); hideTip();
      if (modal) { modal._cancel?.(); return; }
      if (typing) { e.target.blur(); return; }
      if (!e.repeat && !escTimer) { escHeld = false; escTimer = setTimeout(() => { escHeld = true; router.closeAll(); }, 500); }
      return;
    }
    if (typing) return; // text context: everything but Esc goes to the field
    if (!modal && top.mod.onKey?.(e.code, e)) { e.preventDefault(); return; }
    const dirs = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
    if (dirs[e.code] && !(e.target?.type === 'range' && /Arrow/.test(e.code))) { e.preventDefault(); moveFocus(...dirs[e.code]); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && e.target?.getAttribute?.('role') && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.target.click(); return; }
    if (modal) return;
    if (top.satchel) {
      const ids = SATCHEL_TABS.map(t => t.id);
      if (e.code === 'KeyQ' || e.code === 'KeyE') { e.preventDefault(); swapTab(top, cycle(ids, top.tab, e.code === 'KeyQ' ? -1 : 1), {}); return; }
      const d = /^Digit([1-6])$/.exec(e.code); if (d) { e.preventDefault(); swapTab(top, ids[+d[1] - 1], {}); return; }
    }
  }
  function onKeyUp(e) {
    if (!stack.length && !escTimer) return;
    e.stopPropagation();
    if (e.code === 'Escape' && escTimer) { clearTimeout(escTimer); escTimer = 0; if (!escHeld) { if (router.top() && !stack[stack.length - 1].mod.noEscape) closeTop(); } escHeld = false; }
  }
  addEventListener('keydown', onCapture, true); addEventListener('keyup', onCapture, true);
  document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
  return router;
}

/**
 * The default actions every screen calls (ctx.actions.*). main.js may replace any of them; these work on game.hero
 * directly so the dev page and early builds are playable. Items: see js/rpg/hero.js (uid, slot, rarity, implicit, affixes).
 */
export function defaultActions(ctx) {
  const H = () => (typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero) || ctx.game?.hero;
  const restat = () => { const h = H(); if (!h || !ctx.data?.classes) return; if (ctx.game?.player?.maxHp != null) applyStats(h, ctx.game.player, ctx.data); else deriveStats(h, ctx.data); ctx.game?.bus?.emit?.('stats.changed', {}); };
  const unbelt = (h, uid) => { h.belt = (h.belt || [null, null, null, null]).map(u => (u === uid ? null : u)); };
  return {
    /** Equip a gear item from the satchel; the worn one goes back into the satchel (items.js equip). */
    equip(item) { const r = Items.equip(H(), item, ctx.data); if (!r.ok) return r.reason; restat(); ctx.sound?.('equip'); return null; },
    unequip(slot) { const r = Items.unequip(H(), slot, ctx.data); if (!r.ok) return r.reason; restat(); ctx.sound?.('equip'); return null; },
    /** Use a consumable: the effect itself belongs to the game (bus 'item.use'); this spends one from the stack. */
    use(item) { const h = H(); ctx.game?.bus?.emit?.('item.use', { item }); const left = (item.qty || 1) - 1; Items.removeFromSatchel(h, item.uid, 1); if (left <= 0) unbelt(h, item.uid); return null; },
    drop(item) { const h = H(); Items.removeFromSatchel(h, item.uid); unbelt(h, item.uid); ctx.game?.bus?.emit?.('item.drop', { item }); return null; },
    junk(item) { Items.setJunk(H(), item.uid, !item.junk); return null; },
    /** Fasten a satchel stack to belt slot k (0-3), or null to unfasten. */
    belt(item, k) { const h = H(); unbelt(h, item.uid); if (k != null) h.belt[k] = item.uid; return null; },
    /** staged = { might: 2, ... } from the Attributes tab. */
    spendAttrs(staged) {
      const h = H(); const n = Object.values(staged).reduce((s, v) => s + v, 0); if (n > h.unspent.attr) return 'Not enough points.';
      for (const [k, v] of Object.entries(staged)) h.attrs[k] += v; h.unspent.attr -= n; restat(); ctx.sound?.('levelup'); return null;
    },
    skillsChanged() { restat(); },
    /** The wick library changed (saved, deleted, equipped). */
    wicksChanged() { ctx.game?.bus?.emit?.('wicks.changed', {}); },
    resume() {}, restat,
  };
}
