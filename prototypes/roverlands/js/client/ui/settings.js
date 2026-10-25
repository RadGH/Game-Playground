// Per-device settings (game-standards §4): kept in localStorage, every read and write wrapped (a private window just
// keeps them for this visit). The game reads them through ui.settings() and hears changes through ui.onSettings(fn).
// The names match js/game/input.js (mouseSens, padSens, invertY) so its `settings` option can be ui.settings.
import { store } from './dom.js';

const KEY = 'roverlands.settings';
export const DEFAULTS = Object.freeze({ quality: 'medium', volume: 0.8, mouseSens: 1, padSens: 1, invertY: false, camDist: 1, touchSize: 1 });
export const QUALITIES = [['low', 'Low (faster)'], ['medium', 'Medium'], ['high', 'High (prettier)']];

export function createSettings() {
  let cur = { ...DEFAULTS, ...(store.get(KEY, {}) || {}) };
  const subs = new Set();
  return {
    get: () => cur,
    set(patch) { cur = { ...cur, ...patch }; store.set(KEY, cur); for (const f of subs) { try { f(cur, patch); } catch (e) { console.error(e); } } },
    on(f) { subs.add(f); return () => subs.delete(f); },
  };
}
