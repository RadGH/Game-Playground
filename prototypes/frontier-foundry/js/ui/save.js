// Saving. The engine's toJSON() is the whole world; this wraps it with the few things the interface
// needs to rebuild the same run (which galaxy the planets came from, where the camera was) and puts
// it in localStorage. Export and import are the same object as a file.

const KEY = 'foundry.save.v1';
const SETTINGS_KEY = 'foundry.settings.v1';

export const DEFAULT_SETTINGS = {
  method: 'hybrid', master: 0.7, ui: 0.6, effects: 0.8, muted: false,
  speed: 1, notifyDensity: 2, autosave: true,
};

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

/** Everything needed to rebuild a run. */
export function pack(game, { galaxySeed, starIndex, cam, speed }) {
  return {
    v: 1, at: Date.now(),
    galaxySeed, starIndex,
    cam: cam ? { x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), zoom: +cam.zoom.toFixed(2) } : null,
    speed,
    planetName: game.planet.name,
    summary: `${game.planet.name} · day ${Math.floor(game.time / game.planet.dayLength) + 1} · `
      + `${game.structures.filter(s => s.state === 'done').length} buildings · ${game.research.done.length} research`,
    game: game.toJSON(),
  };
}

export function write(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; }
  catch (err) { console.warn('save failed', err); return false; }
}

export function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.game ? s : null;
  } catch { return null; }
}

export function clear() { try { localStorage.removeItem(KEY); } catch {} }

/** Hand the player a .json file of the current save. */
export function exportFile(save) {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `frontier-foundry-${save.planetName || 'run'}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Ask for a .json file and resolve with the parsed save. */
export function importFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try { resolve(JSON.parse(await file.text())); } catch { resolve(null); }
    });
    input.click();
  });
}
