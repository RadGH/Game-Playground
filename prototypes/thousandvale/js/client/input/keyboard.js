// Input layer (T27) — the player's own keys. The table is input/bindings.js; the overrides are saved in this browser
// (localStorage 'tv.keys'). A re-bound key is TRANSLATED: the physical key is swallowed in the capture phase and the
// action's default key event is dispatched instead (input/emit.js), so every handler in the game keeps working without
// knowing keys can move. This listener is added when the module is first imported — before main.js creates anything —
// so it runs ahead of every other window listener.
import { createBindings, ACTION_BY_ID } from './bindings.js';
import { keyEvent, typing } from './emit.js';
import { device } from './device.js';

const KEY = 'tv.keys';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
export const B = createBindings(typeof localStorage !== 'undefined' ? load() : {});
const subs = new Set();
export function saveBindings() { try { localStorage.setItem(KEY, JSON.stringify(B.overrides)); } catch { /* private window */ } for (const fn of [...subs]) fn(); }
export const onBindings = fn => { subs.add(fn); return () => subs.delete(fn); };

let runner = null, capture = null, gate = () => true;
/** input/index.js hands over how to run the actions that have no key event (party targeting …) and when keys count. */
export function setRunner(run, inWorld) { runner = run; if (inWorld) gate = inWorld; }
/** The settings tab: the next key pressed is handed to `fn(code)` instead of the game (Esc cancels with null). */
export function captureNextKey(fn) { capture = fn; }

function onKey(e) {
  if (e.tvSynth) return;
  // a phone's own keyboard typing into a text box is still the touch screen (it does not switch the hints to keys)
  const softKeys = device.current === 'touch' && e.target?.closest?.('input, textarea, [contenteditable]');
  if (e.type === 'keydown' && !e.repeat && !softKeys) device.seen('keyboard');
  if (capture) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === 'keydown' && !e.repeat && !/^(Shift|Control|Alt|Meta)/.test(e.code)) { const fn = capture; capture = null; fn(e.code === 'Escape' ? null : e.code); }
    return;
  }
  if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
  // actions the input layer runs itself (no key event the game knows)
  if (gate()) for (const id of B.actionsFor(e.code)) {
    const a = ACTION_BY_ID[id];
    if (!a.run) continue;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === 'keydown' && !e.repeat) runner?.(a.run, id);
    return;
  }
  const to = B.translate(e.code);
  if (to === undefined) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (to) keyEvent(e.type, to, { shiftKey: e.shiftKey, repeat: e.repeat });
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('pointerdown', e => { if (e.isTrusted) device.seen(e.pointerType === 'touch' ? 'touch' : 'keyboard'); }, true);   // not the clicks the pad's pointer makes
}
