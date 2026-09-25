// Shared tooltip system for playground pages — no library, one floating box, works with the mouse and the keyboard.
//
//   import { installTooltips } from '../../shared/tooltip.js';
//   installTooltips();                       // watches the whole document
//   <b data-tip="Plain text">gold</b>
//   <b data-tip-html="<b>Rich</b> markup">…</b>
//   <b data-tip-render="item" data-item-id="7">…</b>   + registerTip('item', el => node)
//
// Markup is read fresh every time the tooltip opens, so a render function can show live numbers.
// Styles live in shared/tooltip.css (link it in the page head).

const DELAY = 150;          // ms before the box appears
const GAP = 14;             // distance from the pointer
const renderers = new Map();

let box = null, timer = 0, current = null, installed = false;

/** Register a rich tooltip builder. `fn(el)` returns a DOM node, an HTML string, or null for "no tooltip". */
export function registerTip(name, fn) { renderers.set(name, fn); }

/**
 * Re-run the renderer for whatever is open right now, in place. For a tooltip whose CONTENT depends
 * on something other than the pointer — Farhold's item cards change what they compare against while
 * Shift is held — so the box does not have to be closed and reopened to change.
 */
export function refreshTip() {
  if (!current || !box || box.hidden) return false;
  const node = content(current);
  if (!node) return false;
  const left = box.style.left, top = box.style.top;
  box.replaceChildren(node);
  box.style.left = left; box.style.top = top;
  return true;
}

/** Is a tooltip open at the moment? */
export function tipOpen() { return !!current && !!box && !box.hidden; }

/** Hide the tooltip right now (call it when the thing under the pointer disappears). */
export function hideTip() { clearTimeout(timer); current = null; if (box) { box.hidden = true; box.classList.remove('show'); box.replaceChildren(); } }

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'tipbox'; box.id = 'tipbox'; box.hidden = true; box.setAttribute('role', 'tooltip');
  document.body.append(box);
  return box;
}

/** The nearest ancestor that carries tooltip data. */
function target(node) { return node?.closest?.('[data-tip],[data-tip-html],[data-tip-render]') || null; }

function content(el) {
  if (el.dataset.tipRender) {
    const fn = renderers.get(el.dataset.tipRender);
    const out = fn?.(el);
    if (!out) return null;
    if (typeof out === 'string') { const d = document.createElement('div'); d.innerHTML = out; return d; }
    return out;
  }
  if (el.dataset.tipHtml) { const d = document.createElement('div'); d.innerHTML = el.dataset.tipHtml; return d; }
  if (el.dataset.tip) { const d = document.createElement('div'); d.textContent = el.dataset.tip; return d; }
  return null;
}

function place(x, y, anchor) {
  const b = ensureBox(); const w = b.offsetWidth, h = b.offsetHeight;
  const vw = innerWidth, vh = innerHeight;
  let left = x + GAP, top = y + GAP;
  if (anchor) {                                   // keyboard focus: hang it under the element
    const r = anchor.getBoundingClientRect();
    left = r.left; top = r.bottom + 8;
  }
  if (left + w > vw - 8) left = Math.max(8, (anchor ? vw - w - 8 : x - w - GAP));
  if (top + h > vh - 8) top = Math.max(8, (anchor ? anchor.getBoundingClientRect().top - h - 8 : y - h - GAP));
  b.style.left = Math.round(left) + 'px';
  b.style.top = Math.round(top) + 'px';
}

function show(el, x, y, anchor) {
  const node = content(el);
  if (!node) return;
  const b = ensureBox();
  b.className = 'tipbox' + (el.dataset.tipClass ? ' ' + el.dataset.tipClass : '');
  b.replaceChildren(node);
  b.hidden = false; b.style.left = '-9999px'; b.style.top = '-9999px';
  requestAnimationFrame(() => { if (current !== el) return; place(x, y, anchor); b.classList.add('show'); });
  current = el;
}

function onOver(e) {
  const el = target(e.target);
  if (!el) { if (current && !target(e.target)) hideTip(); return; }
  if (el === current) return;
  if (el.hasAttribute('data-tip-off')) return;
  clearTimeout(timer);
  const x = e.clientX, y = e.clientY;
  current = el;
  timer = setTimeout(() => { if (current === el) show(el, x, y, null); }, DELAY);
}

function onMove(e) {
  if (!current || box?.hidden) return;
  if (!target(e.target)) return hideTip();
  if (box.dataset.pinned === '1') return;
  place(e.clientX, e.clientY, null);
}

function onOut(e) { const el = target(e.target); if (el && el === current && !el.contains(e.relatedTarget)) hideTip(); }

/**
 * Start watching a root (default: the document) for tooltip attributes. Safe to call more than once.
 * Returns a function that stops watching.
 */
export function installTooltips(root = document) {
  ensureBox();
  const host = root === document ? document : root;
  const over = e => onOver(e), move = e => onMove(e), out = e => onOut(e);
  host.addEventListener('pointerover', over, true);
  host.addEventListener('pointermove', move, true);
  host.addEventListener('pointerout', out, true);
  host.addEventListener('pointerdown', hideTip, true);
  if (!installed) {
    installed = true;
    document.addEventListener('focusin', e => { const el = target(e.target); if (el) { current = el; show(el, 0, 0, el); } });
    document.addEventListener('focusout', hideTip);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
    addEventListener('scroll', hideTip, true);
    addEventListener('blur', hideTip);
  }
  return () => { host.removeEventListener('pointerover', over, true); host.removeEventListener('pointermove', move, true); host.removeEventListener('pointerout', out, true); host.removeEventListener('pointerdown', hideTip, true); };
}

/** Convenience: set plain-text tooltip on an element (also fills `title` off, so there is only one bubble). */
export function tip(el, text) { if (text == null) { delete el.dataset.tip; return el; } el.dataset.tip = text; el.removeAttribute('title'); return el; }
