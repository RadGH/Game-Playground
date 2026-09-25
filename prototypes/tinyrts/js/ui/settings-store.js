// Settings saved in localStorage. Every access is wrapped: storage can be missing or blocked.

const KEY = 'tinyrts.settings.v1';

export const DEFAULTS = {
  master: 0.8, music: 0.5, sfx: 0.8, muteOnBlur: true,
  scale: 'auto', shake: 0.7, damageNumbers: false, particles: 'med', showFps: false, highContrast: false,
  edgePan: true, panSpeed: 1, rebuildDuringWaves: false, pauseOnBlur: true, defaultSpeed: 1,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* storage blocked */ }
  return { ...DEFAULTS };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
  return fallback;
}

export function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ }
}
