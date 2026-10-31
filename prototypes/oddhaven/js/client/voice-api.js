// The one way anything in Oddhaven makes a person speak (PLAN §2 "Voice"). Nothing else imports voice-lab, so a better voice
// is one new file in voice-engines/ and one line in ENGINES. A profile says what the person sounds like, in no engine's
// terms, and that is what would be saved.
//
//   profile = { gender:'f'|'m', age:0..1, pitch:0..1, warmth:0..1, rough:0..1, speed:0..1, seed }
//   const voice = createVoice({ level });
//   const line = voice.speak(profile, text, { engine?, priority?, speaker? });   // { done: Promise, cancel() }
//
// An engine file exports `id`, `load()` and `render(text, profile)` -> { samples, sampleRate } | null.
// Rules from Lanternfall's bridge: two voices at once, a higher priority cuts the lowest, the same speaker cuts themself,
// a line is rendered in idle time, and a line with nothing to play stays text only.

/** Pure: a person's voice. Race and age push it around; the seed keeps two dwarves apart. */
const RACE_VOICE = { human: {}, elf: { pitch: 0.08, warmth: 0.1, speed: -0.05 }, dwarf: { pitch: -0.12, rough: 0.25 }, orc: { pitch: -0.2, rough: 0.35, warmth: -0.05 }, giant: { pitch: -0.3, speed: -0.15 }, goblin: { pitch: 0.22, rough: 0.2, speed: 0.15 }, halfling: { pitch: 0.14, warmth: 0.15, speed: 0.08 }, undead: { pitch: -0.08, rough: 0.3, warmth: -0.25, speed: -0.12 }, beast: { pitch: -0.05, rough: 0.3 } };
export function profileFor(p) {
  const seed = (p.id ?? 1) * 7 + 11, r = RACE_VOICE[p.race] || {}, wob = k => (((seed * (k + 3) * 2654435761) >>> 0) % 100) / 100 - 0.5;
  const c = v => +Math.max(0, Math.min(1, v)).toFixed(2);
  const base = { gender: p.gender, age: c(((p.age ?? 30) - 18) / 70), pitch: c(0.5 + (r.pitch || 0) + wob(0) * 0.2), warmth: c(0.5 + (r.warmth || 0) + wob(1) * 0.3), rough: c(0.1 + (r.rough || 0) + wob(2) * 0.1), speed: c(0.5 + (r.speed || 0) + wob(3) * 0.15), seed };
  // someone made in the creator chose theirs
  return p.voice ? { ...base, pitch: c(p.voice.pitch), warmth: c(p.voice.warmth), rough: c(p.voice.rough), speed: c(p.voice.speed), engine: p.voice.engine ?? 'formant' } : base;
}
/** Pure: what a line becomes in the ear. Your own household speaks in full; everyone else mutters a short bark. */
export function delivery(text, { household = false, engineFull = 'formant', engineBark = 'babble', profile = null } = {}) {
  if (profile?.engine === 'babble') engineFull = 'babble';
  if (household) return { engine: engineFull, text, priority: 2 };
  const words = String(text).split(/\s+/).slice(0, 4).join(' ');
  return { engine: engineBark, text: words, priority: 1 };
}

const ENGINES = {
  formant: () => import('./voice-engines/formant.js'),
  babble: () => import('./voice-engines/babble.js'),
};
export const registerEngine = (id, loader) => { ENGINES[id] = loader; };
export const engineIds = () => Object.keys(ENGINES);

export function createVoice({ max = 2, audioContext = null, volume = 0.8 } = {}) {
  const active = [], loaded = new Map();
  let ctx = audioContext, bus = null, spoken = 0, rendered = 0;
  const idle = typeof requestIdleCallback === 'function' ? fn => requestIdleCallback(fn, { timeout: 200 }) : fn => setTimeout(fn, 0);
  const context = () => {
    if (!ctx) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume?.();
    if (!bus) { bus = ctx.createGain(); bus.gain.value = volume; bus.connect(ctx.destination); }
    return ctx;
  };
  async function engine(id) {
    let e = loaded.get(id);
    if (!e) { e = (async () => { const m = await ENGINES[id](); await m.load?.(); return m; })(); loaded.set(id, e); }
    return e;
  }
  function stop(a) { try { a.source.stop(); } catch { /* it had finished */ } const i = active.indexOf(a); if (i >= 0) active.splice(i, 1); }
  function admit(speaker, priority) {
    for (const a of [...active]) if (a.speaker === speaker) stop(a);
    if (active.length < max) return true;
    const low = active.reduce((m, a) => (a.priority < m.priority ? a : m), active[0]);
    if (priority > low.priority) { stop(low); return true; }
    return false;
  }
  const self = {
    get spoken() { return spoken; }, get rendered() { return rendered; }, get playing() { return active.length; },
    unlock() { context(); },
    /** The context died (audio-wake.js): the next line builds a new one. */
    reset() { active.length = 0; ctx = null; bus = null; },
    setVolume(v) { volume = v; if (bus) bus.gain.value = v; },
    speak(profile, text, { engine: id = 'formant', priority = 1, speaker = profile?.seed } = {}) {
      let cancelled = false, playing = null, finish;
      const done = new Promise(res => { finish = res; });
      idle(async () => {
        try {
          if (cancelled || volume <= 0) return finish(false);
          const eng = await engine(id), out = await eng.render(text, profile);
          rendered++;
          if (cancelled || !out || !admit(speaker, priority)) return finish(false);
          const c = context(); if (!c) return finish(false);
          const buf = c.createBuffer(1, out.samples.length, out.sampleRate); buf.copyToChannel(out.samples, 0);
          const source = c.createBufferSource(); source.buffer = buf; source.connect(bus);
          playing = { source, speaker, priority };
          source.onended = () => { const i = active.indexOf(playing); if (i >= 0) active.splice(i, 1); finish(true); };
          active.push(playing); source.start(); spoken++;
        } catch (e) { console.warn('[oddhaven] voice', e?.message || e); finish(false); }
      });
      return { done, cancel() { cancelled = true; if (playing) stop(playing); finish(false); } };
    },
    stopAll() { for (const a of [...active]) stop(a); },
  };
  return self;
}
