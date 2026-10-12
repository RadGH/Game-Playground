// Small window manager for the M3 panels (friends, guild, mail, Callboard, account, help): a framed window with a
// title bar you can drag, a close button, a body, and one registry so Esc closes the top one and a hotkey toggles
// its own window. Positions are remembered per window for the session (makeDraggable below, play-test 9). DOM only.

import { installKeepScroll } from './ui/keep-scroll.js';

// play-test 10 (Y27): every list in every window keeps its scroll position through a redraw (ui/keep-scroll.js)
installKeepScroll();

const OPEN = [];                 // open panels, last = on top
const ALL = new Map();           // id -> panel
let zTop = 30;
const Z_WINDOW_MAX = 900;       // css/pt10.css: --z-ask (5000) and --z-confirm (99500) sit above this
const posKey = id => 'tv.panel.' + id;

export function createPanel({ id, title, cls = '', width = 340, parent = null, onOpen = null, onClose = null, closable = true }) {
  const root = document.createElement('section');
  root.className = `tv-panel ${cls}`;
  root.id = 'panel-' + id;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', title);
  root.style.width = width + 'px';
  root.hidden = true;
  root.innerHTML = `<header class="tvp-head"><h3></h3><span class="tvp-sub"></span>${closable ? '<button class="ghost tvp-x" aria-label="Close" data-tip="Close (Esc)">×</button>' : ''}</header><div class="tvp-body"></div>`;
  root.querySelector('h3').textContent = title;
  (parent || document.getElementById('hud') || document.body).appendChild(root);
  const head = root.querySelector('.tvp-head'), body = root.querySelector('.tvp-body');

  // play-test 9 (X3): drag by the title bar, remembered for the session, never off screen, double-click to put it back
  makeDraggable({ root, handle: head, id, onGrab: () => raise() });
  root.addEventListener('pointerdown', () => raise());
  // typing in a panel never moves the character
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { panel.close(); e.preventDefault(); } e.stopPropagation(); });
  root.querySelector('.tvp-x')?.addEventListener('click', () => panel.close());

  function raise() {
    const i = OPEN.indexOf(panel); if (i >= 0) { OPEN.splice(i, 1); OPEN.push(panel); }
    root.style.zIndex = String(++zTop);
    // play-test 10 (Y39): the counter never climbs past the things that must stay above every window (css/pt10.css)
    if (zTop > Z_WINDOW_MAX) { zTop = 30; for (const p of ALL.values()) if (!OPEN.includes(p)) p.root.style.zIndex = '30'; for (const p of OPEN) p.root.style.zIndex = String(++zTop); }
  }
  function clampOnScreen() { clampPlaced(root); }

  const panel = {
    id, root, body, head,
    get isOpen() { return !root.hidden; },
    /** Replace the body's content (null/false children are skipped — replaceChildren would print "null"). */
    fill(...kids) { body.replaceChildren(...kids.flat().filter(k => k != null && k !== false)); },
    setTitle(t, sub = '') { root.querySelector('h3').textContent = t; root.querySelector('.tvp-sub').textContent = sub; },
    open() {
      if (!root.hidden) { raise(); return; }
      // cascade windows that sit at the default spot so a second one does not hide the first
      if (!root.classList.contains('placed') && !root.classList.contains('centered')) {
        const stack = OPEN.filter(p => !p.root.classList.contains('placed') && !p.root.classList.contains('centered')).length;
        root.style.top = (90 + stack * 28) + 'px'; root.style.right = (70 + stack * 22) + 'px';
      }
      root.hidden = false; OPEN.push(panel); raise(); clampOnScreen();
      document.getElementById('menu-' + id)?.classList.add('on');
      onOpen?.(panel);
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      const i = OPEN.indexOf(panel); if (i >= 0) OPEN.splice(i, 1);
      document.getElementById('menu-' + id)?.classList.remove('on');
      onClose?.(panel);
      if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    },
    toggle(force) { const want = force ?? root.hidden; if (want) panel.open(); else panel.close(); return want; },
  };
  ALL.set(id, panel);
  return panel;
}

// ---- play-test 9 (X3, report S#49): windows you can move --------------------------------------------------------------
// One rule for every floating window (the panels above, and the bag): press the title bar and drag. Where you leave it is
// kept for the SESSION (sessionStorage `tv.panel.<id>`: a new visit starts tidy), the whole window always stays on screen,
// a double-click on the title bar puts it back where it opens by itself, and a resized browser pulls it back in.
// In the phone layout windows are sheets: nothing drags there.
const isPhone = () => typeof document !== 'undefined' && document.documentElement.dataset.layout === 'phone';
/** Pure: the top-left corner of a w x h box kept wholly inside a W x H screen (`m` = margin; a box bigger than the screen sits at the margin). */
export function clampBox(x, y, w, h, W, H, m = 4) {
  const cx = Math.max(m, Math.min(Math.max(m, W - w - m), x));
  const cy = Math.max(m, Math.min(Math.max(m, H - h - m), y));
  return { x: Math.round(cx), y: Math.round(cy) };
}
function clampPlaced(root) {
  if (!root.classList.contains('placed') || root.hidden) return;
  const r = root.getBoundingClientRect();
  const p = clampBox(r.left, r.top, r.width, r.height, window.innerWidth, window.innerHeight);
  if (Math.abs(p.x - r.left) > 0.5) root.style.left = p.x + 'px';
  if (Math.abs(p.y - r.top) > 0.5) root.style.top = p.y + 'px';
}
const DRAGGABLE = new Set();
if (typeof window !== 'undefined') window.addEventListener('resize', () => { for (const r of DRAGGABLE) clampPlaced(r); });
/**
 * Make `root` movable by `handle`. `id` names its saved place. Returns { reset, clamp, restore }.
 * The window must be absolutely / fixedly positioned; while it carries the class `placed` its `left` / `top` are ours.
 */
export function makeDraggable({ root, handle, id, onGrab = null }) {
  const key = posKey(id);
  const load = () => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  const save = p => { try { if (p) sessionStorage.setItem(key, JSON.stringify(p)); else sessionStorage.removeItem(key); } catch { /* private window */ } };
  const place = (x, y) => { root.style.left = x + 'px'; root.style.top = y + 'px'; root.classList.add('placed'); };
  function restore() { if (isPhone()) return; const p = load(); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { place(p.x, p.y); clampPlaced(root); } }
  function reset() { root.classList.remove('placed'); root.style.left = ''; root.style.top = ''; save(null); }
  restore();
  DRAGGABLE.add(root);
  handle.classList.add('tv-drag');
  handle.addEventListener('pointerdown', e => {
    if (isPhone() || e.button > 0 || e.target.closest('button,input,select,textarea,a,[data-nodrag]')) return;
    const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    let moved = false;
    try { handle.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;      // a click (or the first half of a double-click) moves nothing
      moved = true;
      const p = clampBox(ev.clientX - dx, ev.clientY - dy, r.width, r.height, window.innerWidth, window.innerHeight);
      place(p.x, p.y); root.classList.add('dragging');
    };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      root.classList.remove('dragging');
      if (moved) save({ x: parseInt(root.style.left, 10), y: parseInt(root.style.top, 10) });
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    onGrab?.();
  });
  handle.addEventListener('dblclick', e => { if (isPhone() || e.target.closest('button,input,select,textarea,a')) return; reset(); });
  return { reset, restore, clamp: () => clampPlaced(root), get placed() { return root.classList.contains('placed'); } };
}

/** Close the top-most open panel. Returns true when one was closed (Esc handling). */
export function closeTop() { const p = OPEN[OPEN.length - 1]; if (!p) return false; p.close(); return true; }
export const getPanel = id => ALL.get(id);
export const openPanels = () => OPEN.map(p => p.id);

/** Tiny element helper: h('button.ghost', { onclick }, 'Text', child…). Text is always set as text, never HTML. */
export function h(tag, props = {}, ...kids) {
  const [t, ...classes] = tag.split('.');
  const e = document.createElement(t || 'div');
  if (classes.length) e.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'title') e.dataset.tip = v;            // P5: the shared tooltip, never a native title bubble
    else if (k === 'style') e.style.cssText = v;
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

/** Play-test 10 (Y39, report D#59: "the abandon quest confirmation appears beneath the journal"): every dialog that asks
 *  a question is mounted on <body> with class `tv-confirm` — css/pt10.css puts that above every window, on every layout. */
export function mountConfirm(box) { box.classList.add('tv-confirm'); document.body.appendChild(box); return box; }

/** A modal-ish confirm drawn in the HUD (no browser confirm(): it freezes the frame loop and the socket pings). */
export function confirmBox(text, { yes = 'Yes', no = 'Cancel', danger = false } = {}) {
  return new Promise(res => {
    const box = h('div.tv-confirm', { role: 'alertdialog' },
      h('p', {}, text),
      h('div.row', {},
        h('button.ghost', { onclick: () => done(false) }, no),
        h('button.' + (danger ? 'danger' : 'primary'), { onclick: () => done(true) }, yes)));
    const done = v => { box.remove(); res(v); };
    box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); });
    mountConfirm(box);
    box.querySelector('button:last-child').focus();
  });
}
