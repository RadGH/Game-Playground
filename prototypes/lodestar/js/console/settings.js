// Settings that persist per device (game standards §4): sound, voice, quality, CRT, controls. localStorage, every
// read and write wrapped in try/catch (a private window or a full disk must never stop the game). Pure load/save are
// node-tested with a fake storage.

export const SETTINGS_KEY = 'lodestar.settings';
export const SETTINGS_SPEC = {
  volume: { labels: ['OFF', '1', '2', '3', '4', '5'], default: 3 },
  hum: { bool: true, default: true },
  voice: { bool: true, default: true },
  quality: { labels: ['LOW', 'STD', 'HIGH'], names: ['Low', 'Standard', 'High'], default: 1 },
  crt: { bool: true, default: true },
  penOffset: { bool: true, default: true },
  padSpeed: { labels: ['SLOW', 'MED', 'FAST'], default: 1 },
};
export const defaults = () => Object.fromEntries(Object.entries(SETTINGS_SPEC).map(([k, s]) => [k, s.default]));

/** Read settings; anything missing, wrong-typed or out of range falls back to its default. */
export function loadSettings(storage = globalThis.localStorage) {
  const out = defaults();
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(SETTINGS_KEY) || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, s] of Object.entries(SETTINGS_SPEC)) {
    const v = raw[k];
    if (s.bool) { if (typeof v === 'boolean') out[k] = v; }
    else if (Number.isInteger(v) && v >= 0 && v < s.labels.length) out[k] = v;
  }
  return out;
}
export function saveSettings(settings, storage = globalThis.localStorage) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
export const volumeOf = s => s.volume / (SETTINGS_SPEC.volume.labels.length - 1);
