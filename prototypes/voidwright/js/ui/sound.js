// Sound wiring between the game and core/audio.js: what the music and the ambience should be doing right now
// (read from the game every frame), and the Sound group of the settings sheet (title + in-game ☰ menu).
//
//   soundTick(app, dt)          once a frame from main.js: picks the music mood, feeds the ambience bed
//   soundEvent(app, e, near)    a sim event: big blasts and jumps duck the music
//   soundRows(app)              the settings sheet's Sound group: Volume, Effects, Music, Ambience sliders + Mute
//   applySound(app)             push app.settings into the mixer (boot, every slider move)
//
// The mood choice itself is pure (core/music.js pickMood); this file only gathers its inputs.

import { pickMood } from '../core/music.js';
import { levelsFrom, duckFor } from '../core/mix.js';
import { setLevels, musicMood, ambienceTick, duckMusic } from '../core/audio.js';
import { hostile } from '../sim/world.js';
import { anomaliesNear } from '../sim/encounters.js';
import { FACTIONS } from '../data/factions.js';
import { el } from './dom.js';
import { pct } from '../../../../shared/format.js';

/** Push the saved sliders into the mixer. */
export function applySound(app) { setLevels(levelsFrom(app.settings)); }

const ALIEN_NEAR = 2600, HOSTILE_NEAR = 2500;
/** The inputs pickMood / bedMix read, from the live game. Exported for tests and game-eye. */
export function soundInputs(app) {
  const w = app.w, P = app.P, G = app.G;
  const mode = app.mode === 'title' || !G ? 'title' : app.mode;
  const sys = G && app.galaxy ? app.galaxy.systems[G.system] : null;
  const tier = sys?.tier ?? w?.tier ?? 1;
  let hostiles = 0, aliens = 0, alien = 0;
  if (w && P && !P.dead && mode === 'fly') {
    for (const b of w.bodies) {
      if (b.kind !== 'ship' || b.dead || b === P) continue;
      const d = Math.hypot(b.x - P.x, b.y - P.y);
      if (d < HOSTILE_NEAR && hostile(w, b, P)) hostiles++;
      if (d < ALIEN_NEAR && FACTIONS[b.faction] && !FACTIONS[b.faction].human) aliens++;
    }
    const owner = FACTIONS[sys?.owner];
    if (owner && !owner.human) alien = 0.7;                               // alien-held star
    alien = Math.max(alien, Math.min(1, aliens / 3));                     // alien ships around you
    try { for (const a of anomaliesNear(w, P.x, P.y, ALIEN_NEAR)) alien = Math.max(alien, 1 - Math.hypot(a.x - P.x, a.y - P.y) / ALIEN_NEAR * 0.5); } catch { /* no encounters yet */ }
  }
  return {
    mode, tier, hostiles, alien: +alien.toFixed(2), now: performance.now() / 1000,
    combatAgo: w && mode === 'fly' ? w.t - (w.combatT ?? -99) : 99,
    speed: P ? Math.hypot(P.vx || 0, P.vy || 0) : 0, thrust: app.boostFx || 0, size: P?.r || 20,
  };
}

let memo = {}, moodT = 0, last = null;
export function soundTick(app, dt) {
  moodT -= dt;
  if (moodT <= 0 || !last) {
    moodT = 0.4;
    last = soundInputs(app);
    const pick = pickMood(last, memo); memo = pick.memory;
    musicMood(pick.mood, pick.intensity);
    app.musicMood = pick.mood;
  }
  // the engine reads speed every frame; the rest only changes as often as the mood is picked
  const P = app.P;
  if (P && last) { last.speed = Math.hypot(P.vx || 0, P.vy || 0); last.thrust = app.boostFx || 0; last.mode = app.mode === 'title' || !app.G ? 'title' : app.mode; }
  ambienceTick(dt, last);
}

/** A sim event: ships dying near you, big blasts and jumps push the music down for a moment. */
export function soundEvent(app, e, near = 1) {
  const d = duckFor(e, near);
  if (d) duckMusic(d[0], d[1]);
}

/** The Sound group for the settings sheet. Each slider saves as it moves. */
export function soundRows(app, save) {
  const s = app.settings;
  const changed = () => { applySound(app); save(); };
  const slider = (label, key, note) => {
    const out = el('output', { class: 'snd-val' }, pct(s[key]));
    const input = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], 'aria-label': label, 'data-setting': key,
      oninput: e => { s[key] = +e.target.value; out.textContent = pct(s[key]); changed(); } });
    return el('label', { class: 'snd-row' }, el('span', { class: 'snd-name' }, label), out, input, note ? el('small', { class: 'snd-note' }, note) : null);
  };
  const mute = el('input', { type: 'checkbox', checked: s.muted, 'data-setting': 'muted', onchange: e => { s.muted = e.target.checked; changed(); box.classList.toggle('muted', s.muted); } });
  const box = el('div', { class: 'snd-group' + (s.muted ? ' muted' : '') },
    el('h3', {}, 'Sound'),
    slider('Volume', 'volume', 'Everything at once'),
    slider('Effects', 'sfxVol', 'Weapons, blasts, loot, buttons'),
    slider('Music', 'musicVol', 'Follows what you are doing. 0% turns it off.'),
    slider('Ambience', 'ambVol', 'Space hum, engines, station chatter'),
    el('label', { class: 'snd-mute' }, mute, el('span', {}, 'Mute everything')));
  return box;
}
