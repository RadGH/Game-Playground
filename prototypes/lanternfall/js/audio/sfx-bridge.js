// Sound effects bridge (docs/10 §10.4, 02 §19.2): the shared sfx engine (sfx/js/sfx.js) driven by the game bus.
// Every bus event becomes a key (`cast.ember`, `impact.rime`, `status.apply.soaked`, `fragment.land.large`…), the
// key becomes a catalog id through data/sfx-map.json, and the id plays panned by its x against the camera.
// Lanternfall adds two buses the engine does not have — `music` (the score, js/audio/score.js) and `voice`
// (js/audio/voice-bridge.js) — as gain nodes in front of the engine's own master limiter, so all five sliders
// (master, music, effects, interface, ambience, voices) work without editing sfx/.
//
//   const audio = await createSfxBridge({ game, settings });   // never rejects: a stub when audio cannot load
//   audio.unlocked        false until the first click / key / touch (browsers block sound before a gesture)
//   audio.play('cast.ember', { x })   audio.cue('bell.toll')   audio.apply(settings)   audio.bus.music / .voice
//
// Tide's spell.water.* recipes live in data/sfx-map.json `local` and are added to the catalog at load.
// Sounds are dropped (not queued) until audio is unlocked, so nothing piles up behind the title screen.

const SFX_JS = new URL('../../../../sfx/js/sfx.js', import.meta.url);
const MAP_URL = new URL('../../data/sfx-map.json', import.meta.url);

export const DEFAULT_AUDIO = { master: 0.8, music: 0.6, sfx: 0.8, ui: 0.6, ambience: 0.7, voice: 0.9, sfxMethod: 'hybrid', muteHidden: true, voices: true, babbleCreatures: true, narrator: true, speechSpeed: 1, voiceEngine: 'formant' };

const RARITY = { common: 'common', fine: 'fine', rare: 'rare', relic: 'relic' };
const CONSTRUCT = /construct|bronze|bell|golem|armoured/;

/**
 * Which map key a bus event plays, or null. Pure: the node test runs every event in the brief through it.
 * @param {string} type  bus event type
 * @param {object} e     its payload
 * @param {object} map   data/sfx-map.json
 */
export function sfxKeyFor(type, e = {}, map = {}) {
  const ev = map.events || {};
  const pick = (...keys) => keys.find(k => k && ev[k]) || null;
  switch (type) {
    case 'cast.release': return pick(`cast.${e.plan?.flame || e.flame}`);
    case 'spell.end': return e.impact === false ? null : pick(`impact.${e.flame}`);
    case 'spell.burst': return pick(`impact.${e.flame}`, 'burst.default');
    case 'hit': {
      if (e.target?.kind === 'player') return null;                       // player.hurt has its own sound
      if (e.dot) return pick(`dot.${e.flame}`, 'dot.default');
      if (e.crit) return pick('hit.crit');
      if (!e.flame || e.flame === 'physical' || e.via === 'melee' || e.via === 'pole') return pick('hit.physical');
      return null;                                                            // spells: their impact already sounded
    }
    case 'kill': {
      if (e.via === 'fall') return pick('death.fall');
      const tags = (e.target?.tags || []).join(' ');
      return pick(CONSTRUCT.test(tags) ? 'death.construct' : /human/.test(tags) ? 'death.humanoid' : 'death.beast');
    }
    case 'status.apply': return pick(`status.apply.${e.id}`);
    case 'status.expire': return pick(`status.expire.${e.id}`);
    case 'combo': return pick(`combo.${e.id}`, 'combo.default');
    case 'fragment.land': { const f = map.fragments || { small: 30, large: 150 }; const m = e.mass || 0; return pick(`fragment.land.${m >= f.large ? 'large' : m >= f.small ? 'medium' : 'small'}`); }
    case 'player.land': return pick((e.fall || 0) >= (map.hardLand ?? 40) ? 'player.land.hard' : 'player.land');
    case 'player.splash': return pick(Math.abs(e.v || 0) >= (map.splashBig ?? 220) ? 'player.splash.big' : 'player.splash');
    case 'pickup': {
      if (e.item) return pick(`loot.${RARITY[e.item.rarity] || 'common'}`);
      return pick(`pickup.${e.kind}`, 'pickup.default');
    }
    default: return pick(type);
  }
}

/** Pan -1..1 from a world x against the camera centre (01 §12.6: ±240 cells is hard left/right). */
export function panFor(x, cam, width = 240) {
  if (x == null || !cam) return 0;
  const cx = cam.cx ?? (cam.x != null ? cam.x + (cam.vw || cam.w || 0) / 2 : null);
  if (cx == null) return 0;
  return Math.max(-1, Math.min(1, (x - cx) / width));
}

/** Append the map's local recipes to a catalog (a copy), skipping ids it already has. */
export function withLocal(catalog, map) {
  const have = new Set(catalog.sounds.map(s => s.id));
  return { ...catalog, sounds: [...catalog.sounds, ...(map.local || []).filter(s => !have.has(s.id))] };
}

/** A catalog id that exists: the id itself, else its fallback chain. */
export function resolveId(id, has, map) {
  let cur = id; for (let i = 0; i < 4 && cur; i++) { if (has(cur)) return cur; cur = map.fallbacks?.[cur]; }
  return null;
}

export async function createSfxBridge({ game, settings = {}, map = null, sfxModule = null, catalog = null, listenGestures = true } = {}) {
  try { return await build({ game, settings, map, sfxModule, catalog, listenGestures }); }
  catch (err) { console.warn('[audio] sound unavailable, running silent:', err?.message || err); return stubSfx(String(err?.message || err)); }
}

async function build({ game, settings, map, sfxModule, catalog, listenGestures }) {
  const mod = sfxModule || await import(SFX_JS.href);
  map = map || game?.data?.sfx_map || await (await fetch(MAP_URL)).json();
  const cat = withLocal(catalog || await mod.loadCatalog(), map);
  const audio = { ...DEFAULT_AUDIO, ...(settings.audio || {}) };
  const sfx = await mod.Sfx.create({ catalog: cat, method: audio.sfxMethod, volume: audio.master });
  const has = id => !!sfx.entry(id);
  const bridge = { ready: true, unlocked: false, sfx, map, bus: { music: null, voice: null }, settings: audio };
  const recent = new Map();   // id → last time played (ms), so a volley of hits is one sound

  function graph() {
    if (bridge.bus.music) return bridge.bus;
    const ctx = sfx.context;   // creates the context + the engine's buses on first touch
    for (const name of ['music', 'voice']) { const g = ctx.createGain(); g.gain.value = audio[name]; g.connect(sfx.master); bridge.bus[name] = g; }
    return bridge.bus;
  }
  bridge.context = () => (bridge.unlocked ? sfx.context : null);
  bridge.graph = graph;

  /** Apply the audio settings (02 §19.2); safe to call any time. */
  bridge.apply = (s = {}) => {
    Object.assign(audio, s.audio || s);
    sfx.setVolume(audio.master);
    for (const b of ['sfx', 'ui', 'ambience']) sfx.setBusVolume(b, audio[b]);
    if (bridge.bus.music) bridge.bus.music.gain.value = audio.music;
    if (bridge.bus.voice) bridge.bus.voice.gain.value = audio.voice;
    if (audio.sfxMethod && audio.sfxMethod !== sfx.method()) { try { sfx.setMethod(audio.sfxMethod); } catch { /* unknown method: keep the old one */ } }
  };
  bridge.apply(audio);

  /** Unlock on the first user gesture: start the context, build the buses, tell everyone. */
  bridge.unlock = () => {
    if (bridge.unlocked) return true;
    try { graph(); bridge.unlocked = true; bridge.apply(audio); game?.bus?.emitNow?.('audio.unlocked', { context: sfx.context }); } catch (e) { console.warn('[audio] unlock failed', e); }
    return bridge.unlocked;
  };
  const gestures = ['pointerdown', 'keydown', 'touchstart'];
  const onGesture = () => { if (bridge.unlock()) for (const g of gestures) window.removeEventListener(g, onGesture, true); };
  if (listenGestures && typeof window !== 'undefined') for (const g of gestures) window.addEventListener(g, onGesture, true);
  const onHidden = () => { if (audio.muteHidden) sfx.setMuted(document.hidden); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHidden);

  /** Play a catalog id (or its fallback). opts: { x, pan, pitch, gain }. */
  bridge.cue = (id, opts = {}) => {
    if (!bridge.unlocked || !id) return null;
    const real = resolveId(id, has, map); if (!real) return null;
    const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (t - (recent.get(real) ?? -1e9) < 40) return null; recent.set(real, t);
    const pan = opts.pan ?? panFor(opts.x, game?.cam, map.pan || 240);
    sfx.cue(real, { pan, pitch: opts.pitch, gain: opts.gain });
    return real;
  };
  /** Play a map key (`cast.ember`…). */
  bridge.play = (key, payload = {}) => bridge.cue(map.events?.[key], { x: payload.x, pitch: map.pitch?.[key], gain: map.gain?.[key] });
  bridge.keyFor = (type, e) => sfxKeyFor(type, e, map);

  const listen = () => game?.bus?.on?.('*', (e, type) => {
    if (!bridge.unlocked) return;
    const key = sfxKeyFor(type, e || {}, map); if (!key) return;
    const x = e?.x ?? e?.target?.x ?? e?.enemy?.x ?? e?.caster?.x ?? (type.startsWith('player.') ? game.player?.x : null);
    bridge.play(key, { x });
  });
  let off = listen();
  /** Follow a new game object (new game, load, back to title). */
  bridge.attach = g => { off?.(); game = g; off = listen(); };
  bridge.dispose = () => { off?.(); if (typeof window !== 'undefined') for (const g of gestures) window.removeEventListener(g, onGesture, true); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHidden); sfx.stopAll(); };
  bridge.stopAll = () => sfx.stopAll();
  return bridge;
}

/** Same API, makes no sound. */
export function stubSfx(reason = 'not loaded') {
  const nil = () => null;
  return { ready: false, reason, unlocked: false, sfx: null, map: null, bus: { music: null, voice: null }, settings: { ...DEFAULT_AUDIO },
    context: nil, graph: nil, apply() {}, unlock: () => false, cue: nil, play: nil, keyFor: nil, dispose() {}, stopAll() {} };
}
