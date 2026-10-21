// The CONTROLLER layout's own pieces (2026-10-16 — owner, on a Steam Deck: "there was no way to open the inventory or
// other menus using the controller and the chat, quests, etc took up too much screen").
//
// Everything here only SHOWS under <html data-layout="pad"> (css/layout-pad.css); input/layout.js turns that on when a
// controller is the device in use and off again when the mouse, the keyboard or a finger takes over. It adds:
//
//   · the CONTROLLER MENU — Menu / Start opens one big window of tiles (input/bindings.js PAD_MENU_TILES): Bag,
//     Character, Skills, Perks, Journal, Map · Party, Friends, Guild, Mail, Market, Group Finder, Chat · Settings,
//     Controls, What's new, Feedback, Account, Damage meter, Log out. The focus ring (input/focus.js) walks it; A opens a
//     tile; B or Menu closes it. A tile opens the window through main.js's PANELS table — the same toggles the menu bar
//     and the window keys use — or presses the pause menu's own button, so it can never do something the keyboard cannot.
//   · the FOLDED CHAT — the chat box, its tabs and its scroll-back are hidden; the last three lines show for a few
//     seconds when something new arrives, then fade. LT + View (or the Chat tile) opens the whole chat with the on-screen
//     keyboard; B puts both away again.
//   · the ONE-LINE TRACKER — the quest and event cards fold to one pill under the minimap ("Wolves at the Waystone ·
//     +2"); LT + Menu (action `hudInfo`) shows them in full and folds them again. Remembered in this browser.
//   · a small HINT strip in the bottom-right corner: Menu = menu · View = map · hold LB = wheel · LT + View = chat.
//     The glyphs are <kbd data-action> caps, so input/hints.js prints the right controller's button names.
//
// One call: createPadLayout({ api, focus, osk, device }) from input/index.js; tick() once a frame (cheap: the pill is
// refreshed twice a second). Test hooks under window.tvinput.padLayout.
import { PAD_MENU_TILES, ACTION_BY_ID } from './bindings.js';
import { actionKey } from './emit.js';
import { createPanel, h } from '../ui-panel.js';
import { uiIconSvg } from '../../../../../icons/js/game-icons.js';

const INFO_KEY = 'tv.pad.info';
const PEEK_MS = 7000;
const GROUPS = [['You', 'You'], ['People', 'People'], ['Game', 'Game']];

export function createPadLayout({ api = {}, focus = null, osk = null, run = null } = {}) {
  const html = document.documentElement;
  const hud = document.getElementById('hud') || document.body;

  // ------------------------------------------------------------------ the controller menu
  const panel = createPanel({ id: 'padmenu', title: 'Menu', cls: 'pad-menu-panel centered', width: 1000 });
  panel.setTitle('Menu', '');
  const panels = () => (typeof api.panels === 'function' ? api.panels() : api.panels) || {};
  /** A tile's count badge: the menu bar's (or the party window's tab) badge for the same window — unread mail, friends online. */
  const badgeOf = t => (document.querySelector(`#menubar [data-panel="${t.panel || t.id}"] > b`)?.textContent || document.querySelector(`#menu-${t.panel || t.id} > b`)?.textContent || '').trim();
  const iconOf = t => uiIconSvg(t.icon || t.id, 34) || document.querySelector(`#menubar [data-panel="${t.panel || t.id}"] svg`)?.outerHTML || '';
  /** Do what a tile says (after the menu has closed, so the window it opens is the one on top). */
  function doTile(t) {
    if (t.run) { run?.(t.run, t.id); return true; }
    if (t.act) {
      const b = document.querySelector(`#panel-pause .pause-list [data-act="${t.act}"]`);
      if (b) { b.click(); return true; }
      if (t.act === 'settings' && api.settings?.panel) { api.settings.panel.open(); return true; }
      return false;
    }
    const P = panels()[t.panel];
    if (P?.toggle) { P.toggle(true); return true; }
    if (P?.open) { P.open(); return true; }
    if (t.action && ACTION_BY_ID[t.action]?.key) { actionKey(t.action); return true; }   // the window's own key, as a last resort
    return false;
  }
  function pick(t) {
    panel.close();
    setTimeout(() => { if (!doTile(t)) api.hud?.toast?.(`${t.label} is not ready yet.`, 'warn'); }, 30);
  }
  /** A plain button cap (no action: input/hints.js leaves it alone — `key0` empty — and labelGlyphs names it). */
  const cap = (btn, text) => h('kbd.pad-glyph', { dataset: { btn, key0: '', hinted: '1' } }, text);
  function draw() {
    const groups = GROUPS.map(([g, title]) => {
      const tiles = PAD_MENU_TILES.filter(t => t.group === g).map((t, i) => {
        const n = badgeOf(t);
        const b = h('button.pad-tile' + (t.danger ? '.danger' : ''), { type: 'button', dataset: { tile: t.id, ...(g === 'You' && i === 0 ? { padFirst: '' } : {}) }, onclick: () => pick(t) },
          h('span.pt-ico'), h('strong', {}, t.label), h('small', {}, t.sub || ''), n ? h('b.pt-badge', {}, n) : null);
        b.querySelector('.pt-ico').innerHTML = iconOf(t);
        return b;
      });
      return h('section.pad-group', {}, h('h4', {}, title), h('div.pad-tiles', {}, ...tiles));
    });
    const legend = h('p.pad-legend', {},
      h('span', {}, cap('A', 'A'), ' open'), h('span', {}, cap('B', 'B'), ' back'),
      h('span', {}, cap('START', 'Menu'), ' close'), h('span', {}, 'In a window: ', cap('LB', 'LB'), ' ', cap('RB', 'RB'), ' tabs · ', cap('Y', 'Y'), ' card · right stick scrolls'));
    panel.fill(h('div.pad-menu', {}, ...groups), legend);
    labelGlyphs(panel.root);
  }
  /** The legend's caps follow the controller in hand (the action-bound caps are done by input/hints.js). */
  function labelGlyphs(root) {
    const G = api.glyphs?.() || null; if (!G) return;
    for (const k of root.querySelectorAll('kbd.pad-glyph[data-btn]')) k.textContent = G[k.dataset.btn] || k.textContent;
  }
  function open() { draw(); panel.open(); focus?.sync?.(); return true; }
  function close() { panel.close(); }
  function toggle() { if (panel.isOpen) close(); else open(); return panel.isOpen; }

  // ------------------------------------------------------------------ the folded chat
  const log = document.getElementById('chat-log'), chatInput = document.getElementById('chat-input');
  let peekT = 0;
  function peek() { html.dataset.chatpeek = '1'; clearTimeout(peekT); peekT = setTimeout(() => { delete html.dataset.chatpeek; }, PEEK_MS); }
  if (log && typeof MutationObserver !== 'undefined') new MutationObserver(list => { if (list.some(m => m.addedNodes.length)) peek(); }).observe(log, { childList: true });
  const chatOpen = on => { if (html.dataset.layout === 'phone') return; if (on) html.dataset.chat = 'open'; else if (html.dataset.chat === 'open') delete html.dataset.chat; };
  chatInput?.addEventListener('focus', () => chatOpen(true));
  chatInput?.addEventListener('blur', () => setTimeout(() => { if (!(osk?.isOpen && osk.input === chatInput)) chatOpen(false); }, 0));
  // B on the on-screen keyboard puts the chat away too (otherwise the box keeps the focus and the pad drives nothing)
  // Only when it really went from open to shut: on a phone the first letter typed counts as 'keyboard', which asks the
  // (never opened) on-screen keyboard to close, and blurring the box then dropped the phone's own keyboard mid-word.
  let oskWasOpen = !!osk?.isOpen;
  if (osk?.root && typeof MutationObserver !== 'undefined') new MutationObserver(() => { const shut = osk.root.hidden, was = oskWasOpen; oskWasOpen = !shut; if (!shut || !was) return; if (document.activeElement === chatInput) chatInput.blur(); else chatOpen(false); }).observe(osk.root, { attributes: true, attributeFilter: ['hidden'] });

  // ------------------------------------------------------------------ the one-line tracker
  const keep = !html.dataset.gallery;      // the gallery's frames start every scene folded
  let infoOpen = false; try { infoOpen = keep && localStorage.getItem(INFO_KEY) === 'open'; } catch { /* private window */ }
  const pill = h('button.pad-info.pad-only', { type: 'button', dataset: { tip: 'Your quests and the events around you. Hold LT and press Menu to show them in full.' }, onclick: () => toggleInfo() },
    h('kbd', { dataset: { action: 'hudInfo' } }, '—'), h('span.pi-text'), h('b.pi-more'));
  hud.appendChild(pill);
  const applyInfo = () => { if (html.dataset.layout === 'phone') return; if (infoOpen) html.dataset.hudinfo = 'open'; else if (html.dataset.hudinfo === 'open') delete html.dataset.hudinfo; pill.classList.toggle('on', infoOpen); };
  function toggleInfo(force) { infoOpen = force ?? !infoOpen; try { if (keep) localStorage.setItem(INFO_KEY, infoOpen ? 'open' : ''); } catch { /* private window */ } applyInfo(); refresh(); return infoOpen; }
  const txt = e => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  /** The pill's one line: the first event you are in (they are urgent), else the first tracked quest. Pure-ish: reads the DOM. */
  function summary() {
    const col = document.getElementById('right-col');
    const events = col ? [...col.querySelectorAll('.et-card')].filter(e => e.getClientRects().length || !col.closest('[hidden]')) : [];
    const quests = col ? [...col.querySelectorAll('.tv-tracker .tr-main, .tv-tracker .tr-row')] : [];
    const first = events[0] ? (txt(events[0].querySelector('.et-name')) || txt(events[0]).slice(0, 48)) : quests[0] ? txt(quests[0].querySelector('b, strong, .tr-name') || quests[0]).slice(0, 56) : '';
    const n = events.length + quests.length;
    return { text: first || 'No quests tracked', more: n > 1 ? `+${n - 1}` : '', n, events: events.length, quests: quests.length };
  }
  let lastSum = '';
  function refresh() {
    const s = summary(), sig = s.text + '|' + s.more + '|' + infoOpen;
    if (sig === lastSum) return s; lastSum = sig;
    pill.querySelector('.pi-text').textContent = infoOpen ? (s.n ? 'Fold the trackers' : 'No quests tracked') : s.text;
    pill.querySelector('.pi-more').textContent = infoOpen ? '' : s.more;
    pill.classList.toggle('empty', !s.n);
    return s;
  }

  // ------------------------------------------------------------------ the hint strip
  const hint = (action, label) => h('span', {}, h('kbd', { dataset: { action } }, '—'), ' ', label);
  const hints = h('div.pad-hints.pad-only', { 'aria-hidden': 'true' }, hint('pause', 'Menu'), hint('map', 'Map'), hint('radial', 'Wheel (hold)'), hint('chat', 'Chat'));
  hud.appendChild(hints);

  // ------------------------------------------------------------------ switching
  function onLayout(l) {
    if (l !== 'pad') { if (panel.isOpen) close(); if (html.dataset.chat === 'open' && document.activeElement !== chatInput) delete html.dataset.chat; if (html.dataset.hudinfo === 'open' && html.dataset.layout !== 'phone') delete html.dataset.hudinfo; return; }
    applyInfo(); refresh();
  }
  if (html.dataset.layout === 'pad') onLayout('pad');

  let acc = 0;
  return {
    panel, open, close, toggle, toggleInfo, chatOpen, summary, refresh, onLayout, peek, doTile,
    get isOpen() { return panel.isOpen; }, get infoOpen() { return infoOpen; },
    tick(dt = 0.016) { if (html.dataset.layout !== 'pad') return; acc += dt; if (acc < 0.5) return; acc = 0; refresh(); },
  };
}
