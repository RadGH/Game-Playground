// Sound: the playground's shared sound library (sfx/), driven by world events. Everything is
// optional — if the library fails to load the game is silent and nothing else changes.
let sfx = null, volume = 0.7, last = {};

export async function initAudio(vol) {
  volume = vol ?? 0.7;
  try {
    const { Sfx } = await import('../../../../sfx/js/sfx.js');
    sfx = await Sfx.create({ method: 'hybrid', volume, base: new URL('../../../../sfx/', import.meta.url).href });
    // fetch the big ones in the background so the first meteor is not late (recordings load on first use)
    sfx.preload(['explosion.large', 'explosion.small', 'meteor.fall', 'thunder', 'spell.fire.launch', 'fire.whoosh', 'tornado', 'dragon.roar', 'ambience.forest']).catch(() => {});
  } catch (e) { console.warn('sound off:', e.message); sfx = null; }
}
/** What the sound engine is doing right now — for bug reports and tests. */
export function audioInfo() {
  if (!sfx) return { on: false };
  let bytes = 0; for (const r of sfx._cache.values()) bytes += r.buffer.length * r.buffer.numberOfChannels * 4;
  return { on: true, state: sfx._ctx?.state || 'not started', cached: sfx._cache.size, mb: +(bytes / 1048576).toFixed(1), pending: sfx._pending.size, loops: sfx.loopingIds(), lastError: sfx.lastError?.message || null };
}
export function setVolume(v) { volume = v; if (sfx) { sfx.setVolume(v); sfx.setMuted(v <= 0); } }

/** Play a sound, at most once per `gap` ms for the same id (a wildfire must not machine-gun).
 *  Always a one-shot: only `ambience()` may start a loop, so nothing can hang on after its moment. */
export function play(id, opts = {}, gap = 60) {
  if (!sfx || volume <= 0) return;
  const now = performance.now();
  if (last[id] && now - last[id] < gap) return;
  last[id] = now;
  try { sfx.cue(id, { ...opts, loop: false }); } catch { /* unknown id */ }
}
export function ambience(id) { if (sfx) try { sfx.ambience(id); } catch { /* */ } }
export function stopAmbience() { if (sfx) try { sfx.stopLoops(); } catch { /* */ } }

/** What each spell sounds like when it is cast. Lightning, blasts and meteors also sound where they land. */
export const CAST_SOUNDS = {
  fireball: 'spell.fire.launch', rain: 'water.pour', earth: 'stone.crumble', meteor: 'meteor.fall', frost: 'spell.ice.impact',
  growth: 'spell.nature.launch', heal: 'heal', gale: 'spell.physical.travel', bless: 'spell.holy.launch', quake: 'quake.rumble',
  storm: 'thunder', spring: 'water.pour', sinkhole: 'fragment.crash.medium', firewall: 'fire.whoosh', tornado: 'tornado',
  smite: 'spell.holy.impact', chain: 'spell.lightning.launch', shower: 'meteor.fall', volcano: 'quake.rumble',
  acidrain: 'spell.poison.launch', void: 'spell.shadow.launch', fireflies: 'spell.arcane.launch', holyrain: 'spell.holy.launch',
  barrier: 'status.barrier.apply', missiles: 'magic.missile',
};
/** Reaction / spell sound names from the sim (data/reactions.json "sound", sim.fire('sound')) to library ids. */
export const EVENT_SOUNDS = { hiss: 'steam.hiss', chime: 'spell.holy.impact', fizz: 'status.poison.apply', frost: 'ice.form', quake: 'quake.rumble', 'meteor-fall': null };

/** Hook a session's world events to sounds. `panOf(x)` turns a world x into -1..1. */
export function wireSounds(sim, panOf) {
  const pan = (e) => ({ pan: e && e.x != null ? panOf(e.x) : 0 });
  sim.on('blast', (e) => {
    if (e.quiet) return;
    if (e.by === 'meteor' || e.power > 4) play('explosion.large', pan(e), 120);
    else if (e.power > 2) play('explosion.small', pan(e), 80);
    else play('fragment.crash.small', pan(e), 80);
  });
  sim.on('lightning', (e) => play('thunder', pan(e), 250));
  sim.on('cast', (e) => { if (CAST_SOUNDS[e.id]) play(CAST_SOUNDS[e.id], pan(e), 50); });
  sim.on('death', (e) => {
    if (e.tags?.has?.('swarm')) { play('melee.hit', pan(e), 90); return; }
    if (e.species === 'sheep') play('animal.sheep.bleat', pan(e), 400);
    else if (e.species === 'chicken') play('animal.hen.cluck', pan(e), 400);
    else if (e.species === 'pig') play('animal.pig.oink', pan(e), 400);
    else if (e.species === 'cow') play('animal.cow.moo', pan(e), 400);
    else if (e.c?.sp?.kind === 'person') play('death.humanoid', pan(e), 200);
    else if (e.species === 'dragon' || e.species === 'elderwyrm') play('dragon.roar', pan(e), 100);
    else play('death.beast', pan(e), 200);
  });
  sim.on('birth', (e) => { if (e.species === 'sheep') play('animal.sheep.bleat', pan(e), 700); else if (e.species === 'chicken') play('animal.hen.cluck', pan(e), 700); });
  sim.on('built', (e) => play('build.done', pan(e), 200));
  sim.on('chop', (e) => play('wood.chop', pan(e.c), 300));
  sim.on('building-lost', (e) => play('stone.crumble', pan(e), 200));
  sim.on('smash', (e) => play('fragment.crash.medium', pan(e), 200));
  sim.on('roar', (e) => { play('dragon.roar', pan(e.c), 1500); play('fire.whoosh', pan(e.c), 300); });
  sim.on('dragon-enrage', (e) => play('dragon.roar', pan(e), 300));
  sim.on('risen', (e) => play('spell.shadow.impact', pan(e), 300));
  sim.on('shoot', (e) => play(e.kind === 'missile' ? 'magic.missile' : e.kind === 'bolt' ? 'spell.arcane.launch' : 'arrow.shot', pan(e.c), 120));
  sim.on('sound', (e) => { const id = EVENT_SOUNDS[e.id]; if (id) play(id, pan(e), 150); });
  sim.on('omen', (e) => { if (e.warn) play('night.ambush', {}, 2000); });
  sim.on('discover', () => play('loot.rare', {}, 300));
  sim.on('result', (r) => play(r.won ? 'quest.complete' : 'night.ambush', {}, 500));
}

/** Which ambience bed suits the world right now. */
export function ambienceFor(w, daylight) {
  if (w.stats.burning > 80) return 'ambience.fire';
  if (w.rain.length) return w.rain.some(r => r.storm) ? 'ambience.storm' : 'ambience.rain.light';
  return daylight < 0.25 ? 'ambience.night' : 'ambience.forest';
}
