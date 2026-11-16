// The sound settings and how they turn into bus levels. Pure — node-tested (tests/sound.test.mjs).
//
// voidwright.prefs keeps the whole settings object. Sound keys (same names Arcline uses):
//   volume    master 0..1          (old saves had only this and `muted` — they keep working)
//   sfxVol    effects 0..1         weapons, hits, explosions, loot, interface, boost and beam loops
//   musicVol  music 0..1           0 = no music at all (the player stops, ambience and effects go on)
//   ambVol    ambience 0..1        space hum, your engine, station chatter, alien whispers, the recorded void bed
//   muted     true silences everything
//
//   prefsFrom(raw)  → a full, clean settings object (old prefs, bad numbers, strings from old builds all fixed)
//   levelsFrom(s)   → { master, effects, music, ambience, muted } — the gains the mixer applies
//   duckFor(event)  → [depth, seconds] | null — how hard a blast pushes the music down

export const SOUND_DEFAULTS = { volume: 0.7, sfxVol: 1, musicVol: 0.55, ambVol: 0.75, muted: false };
export const DEFAULT_PREFS = { ...SOUND_DEFAULTS, quality: 1, shake: 1 };

const clamp01 = v => Math.max(0, Math.min(1, v));
/** A 0..1 number from anything a save may hold ("0.4", 40 from a percent build, null, NaN): `d` when it is not one. */
export function unit(v, d) {
  if (v === null || v === '' || typeof v === 'boolean' || v === undefined) return d;
  let n = +v; if (!Number.isFinite(n)) return d;
  if (n > 1 && n <= 100) n /= 100;   // a percent slipped in
  return clamp01(n);
}

/** Old or partial prefs → a complete settings object. Keys this file does not own pass through untouched. */
export function prefsFrom(raw) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { ...DEFAULT_PREFS, ...s };
  out.volume = unit(s.volume, SOUND_DEFAULTS.volume);
  out.sfxVol = unit(s.sfxVol, SOUND_DEFAULTS.sfxVol);
  out.musicVol = unit(s.musicVol, s.music === false ? 0 : SOUND_DEFAULTS.musicVol);   // a plain on/off from elsewhere
  out.ambVol = unit(s.ambVol, SOUND_DEFAULTS.ambVol);
  out.muted = s.muted === true || s.muted === 'true';
  delete out.music;
  return out;
}

/** Settings → the gains each bus gets. Master carries mute, so a muted game can unmute without losing a slider. */
export function levelsFrom(s = {}) {
  const p = prefsFrom(s);
  return { master: p.muted ? 0 : p.volume, effects: p.sfxVol, music: p.musicVol, ambience: p.ambVol, muted: p.muted };
}

/**
 * A ship dying pushes the music down for a moment: bigger wrecks deeper and longer; your own ship the most.
 * `near` 0..1 is how close to the view it happened (1 = on screen); far-off blasts barely touch the music.
 * Returns [depth (the music's level while ducked, 0..1), seconds] or null.
 */
export function duckFor(e, near = 1) {
  if (!e) return null;
  let d = null;
  if (e.t === 'jump') d = [0.45, 2.6];
  else if (e.t === 'death' || e.t === 'boom') {
    const r = +e.r || 0;
    if (e.player) d = [0.2, 2.4];
    else if (e.t === 'boom') d = r >= 90 ? [0.7, 0.6] : null;
    else if (r >= 150) d = [0.3, 2];
    else if (r >= 60) d = [0.55, 1.2];
    else d = [0.8, 0.5];
  }
  if (!d) return null;
  const k = e.player || e.t === 'jump' ? 1 : Math.max(0, Math.min(1, near));
  if (k < 0.2) return null;
  return [+(1 - (1 - d[0]) * k).toFixed(3), d[1]];
}
