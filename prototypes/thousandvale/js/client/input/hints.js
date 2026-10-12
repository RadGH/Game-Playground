// Input layer (T27) — every key shown on screen follows the device used last.
//
// The game prints keys as <kbd>E</kbd> (prompts, the menu bar, the help window) and as <span class="key">F</span> on the
// action bar. This module finds them, works out which ACTION each one stands for (a `data-action` attribute wins; else
// the default key text is looked up in input/bindings.js) and re-labels it: the player's own key on a keyboard, the
// button glyph on a gamepad (Xbox / PlayStation / generic), nothing on touch (the control is on the screen itself).
// On a keyboard with default keys it never touches the page at all.
import { ACTIONS, ACTION_BY_ID, keyLabel, padParts } from './bindings.js';
import { B, onBindings } from './keyboard.js';
import { device } from './device.js';

const SEL = 'kbd, .slot > .key';
/** Default key text -> action id. Actions that share a key with another (E turns the camera AND uses) yield to the main one. */
const BY_TEXT = new Map();
for (const a of ACTIONS) { if (!a.key || a.shares) continue; const t = a.keyText || keyLabel(a.key); if (!BY_TEXT.has(t)) BY_TEXT.set(t, a.id); }
BY_TEXT.set('F1', 'help');

export function actionOf(el) {
  if (el.dataset.action) return ACTION_BY_ID[el.dataset.action] ? el.dataset.action : null;
  if (el.dataset.key0 == null) el.dataset.key0 = el.textContent.trim();
  return BY_TEXT.get(el.dataset.key0) || null;
}
/** The text (and, for a pad, the button names) to show for an action right now. */
export function hintFor(id, dev = device.current, set = device.glyphs) {
  if (dev === 'pad') { const parts = padParts(id, set).filter(p => p.btn !== 'WHEEL'); const a = ACTION_BY_ID[id]; if (!a?.pad) return { text: '', btns: [] }; return { text: parts.map(p => p.text).join('+'), btns: parts.map(p => p.btn) }; }
  if (dev === 'touch') return { text: '', btns: [] };
  return { text: B.label(id), btns: [] };
}
function relabel(el) {
  const id = actionOf(el); if (!id) return;
  const h = hintFor(id);
  const want = device.current === 'keyboard' && !B.changed(id) ? el.dataset.key0 : h.text;
  if (el.textContent !== want) el.textContent = want;
  el.classList.toggle('pad-glyph', device.current === 'pad' && !!want);
  el.classList.toggle('hint-empty', !want);
  if (device.current === 'pad' && h.btns.length) el.dataset.btn = h.btns[h.btns.length - 1]; else delete el.dataset.btn;
  el.dataset.hinted = '1';
}
let dirty = false, active = false, timer = 0;
function sweep() { timer = 0; dirty = false; for (const el of document.querySelectorAll(SEL)) relabel(el); }
const needed = () => device.current !== 'keyboard' || Object.keys(B.overrides).length > 0 || active;
function schedule() { if (!needed()) return; active = true; if (!timer) timer = setTimeout(sweep, dirty ? 120 : 0); dirty = true; }

export function installHints() {
  device.on(schedule); onBindings(schedule);
  if (typeof MutationObserver !== 'undefined') new MutationObserver(list => { if (!needed()) return; for (const m of list) if (m.addedNodes.length) { schedule(); return; } }).observe(document.body, { subtree: true, childList: true });
  schedule();
  return { sweep, schedule };
}
