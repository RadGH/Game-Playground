// Sound (M12): effects through the shared sound library (sfx/ — one logical id per meaning, one
// loudness for everything), an ambience bed that follows the view (town by day, night, an attack),
// and simple generated music beds that change at night and when the town is attacked (owner:
// "generated music beds change at night and during attacks"). Starts on the first tap — browsers
// refuse to make sound before that. Settings: Sound and Music volume sliders (☰ → Settings; 0 = off).

import { hooks, ui as UI } from '../ui/hooks.js';

let sfx = null, starting = false, music = null;
// volume 0..100 per slider (prefs.soundVol / prefs.musicVol); 0 is off. 70 = the level the game
// always played at, so an old save sounds the same.
const vol = k => { const p = UI.app?.prefs || {}; if (p[k] === false) return 0; const v = p[k + 'Vol']; return typeof v === 'number' ? Math.max(0, Math.min(100, v)) : 70; };
const on = k => vol(k) > 0;
/** Put the sliders' levels on the sound library and the music (Settings calls this as a slider moves). */
export function applyVolumes() {
  try { sfx?.setVolume?.(vol('sound') / 100); } catch { /* fine */ }
  music?.level(vol('music') / 70);
  if (sfx) bed();
}
UI.applyVolumes = applyVolumes;

async function start() {
  if (sfx || starting) return; starting = true;
  try {
    const { Sfx } = await import('../../../../sfx/js/sfx.js');
    sfx = await Sfx.create({ method: 'hybrid', volume: vol('sound') / 100 });
    sfx.preload?.(['explosion.large', 'explosion.small', 'meteor.fall', 'thunder', 'spell.ice.impact'])?.catch?.(() => {});
  } catch (e) { console.warn('[sound] no sound library', e); }
  try { music = createMusic(); music.level(vol('music') / 70); } catch (e) { console.warn('[sound] no music', e); }
}
window.addEventListener('pointerdown', () => { start(); try { sfx?.wake?.(); } catch { /* fine */ } }, { passive: true });
window.addEventListener('keydown', start, { passive: true });

export function play(id, opts) { if (id && sfx && on('sound')) try { sfx.play(id, opts)?.catch?.(() => {}); } catch { /* an id this method lacks */ } }
UI.sound = play;

// ---- what the sim says → sounds
const MAP = { collapse: 'stone.crumble', fire: 'fire.whoosh', enemyDown: 'death.beast', guardDown: 'death.humanoid', power: 'thunder', node: 'loot.uncommon', blast: 'explosion.small', blastBig: 'explosion.large' };
let lastSay = 0;
const lastKind = {};
// A sound from the world plays only when it happens ON SCREEN (or near the middle of it) and at
// most once every couple of seconds per kind: a wildfire on the far side of the map used to play a
// fire whoosh for every cell that caught, all game long (play-test 1).
function heard(x, y) {
  const c = UI.camera?.()?.cam; if (!c || x == null) return true;
  if (UI.camera().globeAmount?.() > 0.5) return false;
  const W = UI.app.world.W; let dx = x - c.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
  const halfW = innerWidth / 2 / c.ppc + 20, halfH = innerHeight / 2 / c.ppc + 20;
  return Math.abs(dx) < halfW && Math.abs(y - c.y) < halfH;
}
const GAP = { fire: 4000, collapse: 700, enemyDown: 250, guardDown: 400, power: 500, node: 0, blast: 250, blastBig: 400 };
const lastSfx = {};
hooks.tick.push(msg => {
  const now = performance.now();
  for (const s of msg.sounds || []) {
    const [k, x, y, id, big] = Array.isArray(s) ? s : [s];
    // a named sound from a power (meteor falling, its impact, thunder, frost): heard a little off screen
    // too when it is a big one, at most every 150 ms per id
    if (k === 'sfx') { if (now - (lastSfx[id] || 0) > 150 && (big || id === 'meteor.fall' || heard(x, y))) { lastSfx[id] = now; play(id); } continue; }
    if (now - (lastKind[k] || 0) < (GAP[k] ?? 1000) || !heard(x, y)) continue;
    lastKind[k] = now; play(MAP[k]);
  }
  for (const s of msg.said || []) {
    if (s.built) play('build.done');
    else if (s.warn) play('bell.toll');
    else if (s.defeated) play('night.ambush');
    // only BAD news makes a sound, and not more than once every 5 s (play-test 2: "little beep sounds of
    // settlers arriving constantly" — every good toast used to play one)
    else if (s.text && s.kind === 'bad' && now - lastSay > 5000) { lastSay = now; play('ui.error'); }
  }
  // the horn sounds once when an attack STARTS, not every time the sim notices enemies near a town
  if (msg.attack && now > attackUntil) play('hvf.horn');
  if (msg.attack || msg.fighting) attackUntil = now + 30000;
  const t = msg.clock?.tod ?? 0.3;
  mood = now < attackUntil ? 'attack' : (t > 0.55 && t < 0.95) ? 'night' : 'day';
  bed();
});
let attackUntil = 0, mood = 'day', bedNow = null;
function bed() {
  if (!sfx) return;
  const cam = UI.camera?.()?.cam;
  const close = cam && cam.ppc > 1.2;
  const want = !on('sound') ? null : mood === 'attack' ? 'ambience.storm' : mood === 'night' ? 'ambience.night' : close ? 'ambience.town' : 'ambience.wind';
  if (want !== bedNow) { bedNow = want; try { if (want) sfx.ambience(want); else sfx.stopLoops(); } catch { /* fine */ } }
  music?.set(on('music') ? mood : null);
}
document.addEventListener('click', e => { if (e.target.closest('button')) play('ui.click'); }, true);

// ---- music: three slow generated beds (day: warm major drone, night: soft minor, attack: low pulse)
function createMusic() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const SETS = { day: [196, 246.9, 293.7, 392], night: [174.6, 207.7, 261.6, 311.1], attack: [110, 130.8, 164.8, 220] };
  const voices = [0, 1, 2, 3].map(k => {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = k === 0 ? 'triangle' : 'sine'; f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.value = 0; o.connect(f); f.connect(g); g.connect(master); o.start();
    return { o, g };
  });
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(master.gain); lfo.start();
  let cur = null, scale = 1;
  return {
    /** Loudness from the Music slider: 1 = the old fixed level, 0 = silent. */
    level(v) {
      scale = Math.max(0, v);
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(cur ? (cur === 'attack' ? 0.07 : 0.045) * scale : 0, t + 0.3);
    },
    set(m) {
      if (m === cur) return; cur = m;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.linearRampToValueAtTime(m ? (m === 'attack' ? 0.07 : 0.045) * scale : 0, t + 3);
      if (!m) return;
      const notes = SETS[m];
      voices.forEach((v, k) => { v.o.frequency.linearRampToValueAtTime(notes[k] * (m === 'attack' ? 0.5 : 0.5), t + 4); v.g.gain.linearRampToValueAtTime(k === 0 ? 0.5 : 0.25, t + 4); });
      lfo.frequency.value = m === 'attack' ? 1.6 : 0.08; lg.gain.value = m === 'attack' ? 0.03 : 0.015;
    },
  };
}
