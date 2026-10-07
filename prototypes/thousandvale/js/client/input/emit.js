// Input layer (T27) — turning "the player did action X" into what the game listens for: the action's DEFAULT key event.
// controls.js, main.js, ui/hotbar.js and ui/angling.js all listen on `window` for KeyboardEvent.code, so a gamepad
// button, a touch control or a re-bound key becomes exactly the event the default key would have made. Events made here
// carry `tvSynth = true` so input/keyboard.js does not translate them a second time.
import { ACTION_BY_ID } from './bindings.js';

const KEY = { Space: ' ', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', ShiftLeft: 'Shift', ShiftRight: 'Shift', Slash: '/', F1: 'F1', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
const keyOf = code => KEY[code] ?? (/^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : /^Digit\d$/.test(code) ? code.slice(5) : code);
const held = new Set();

/** One synthetic key event on `window` (returns false when a handler called preventDefault). */
export function keyEvent(type, code, more = {}) {
  const ev = new KeyboardEvent(type, { code, key: keyOf(code), bubbles: true, cancelable: true, shiftKey: !!more.shiftKey, repeat: !!more.repeat });
  ev.tvSynth = true;
  return window.dispatchEvent(ev);
}
export function keyDown(code) { if (!code) return; const rep = held.has(code); held.add(code); keyEvent('keydown', code, { repeat: rep }); }
export function keyUp(code) { if (!code || !held.has(code)) return; held.delete(code); keyEvent('keyup', code); }
/** Press and let go (a tap). */
export function keyTap(code, ms = 70) { keyDown(code); setTimeout(() => keyUp(code), ms); }
export function releaseAll() { for (const c of [...held]) keyUp(c); }

/** An action by id: its default key, pressed (down = true), released (false) or tapped (undefined). */
export function actionKey(id, down) {
  const code = ACTION_BY_ID[id]?.key; if (!code) return false;
  if (down === true) keyDown(code); else if (down === false) keyUp(code); else keyTap(code);
  return true;
}
/** Typing somewhere? (The game's own handlers use the same test.) */
export const typing = () => { const a = document.activeElement; return !!a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !a.readOnly; };
