// The one place sim code reads tuning numbers from. In the browser the game binds T to the live object from
// shared/tune.js (the tuning panel moves it); node tests load data/tuning.json with useTuning(). Code reads T.key at
// the moment it needs it — never copies it into a constant — so the panel and tests can move any number.
export const T = {};

/** Install plain values from data/tuning.json (entries { value, min, max… } or bare numbers). */
export function useTuning(json) {
  for (const k of Object.keys(T)) delete T[k];
  for (const [k, v] of Object.entries(json || {})) {
    if (k.startsWith('_')) continue;
    T[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
  }
  return T;
}
/** Read through a live object (shared/tune.js loadTuning) so panel moves show up at once. */
export function bindLive(live) {
  for (const k of Object.keys(T)) delete T[k];
  for (const k of Object.keys(live)) Object.defineProperty(T, k, { get: () => live[k], enumerable: true, configurable: true });
  return T;
}
export function milestones() { return [T.milestone1, T.milestone2, T.milestone3, T.milestone4, T.milestone5, T.milestone6]; }
