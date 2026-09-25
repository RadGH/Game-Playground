// Campaign progress and "creatures seen" (for the Field Guide), in localStorage.

import { loadJSON, saveJSON } from './settings-store.js';

const KEY = 'tinyrts.campaign.v1';
const DEFAULT = { unlocked: 0, stars: {}, best: {}, seen: {}, difficulty: 'normal' };

export function loadProgress() {
  return { ...DEFAULT, ...loadJSON(KEY, {}) };
}

export function saveProgress(p) { saveJSON(KEY, p); }

export function markSeen(types) {
  const p = loadProgress();
  let changed = false;
  for (const t of types) if (!p.seen[t]) { p.seen[t] = true; changed = true; }
  if (changed) saveProgress(p);
}

export function resetProgress() { saveProgress({ ...DEFAULT, seen: loadProgress().seen }); }
