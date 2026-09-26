// The procedural score (docs/10 §10.5, R14/B11): "the rain is the score". No recorded music — a few oscillators
// and the rain beds, on the sfx engine's own AudioContext, played through the `music` bus that
// js/audio/sfx-bridge.js adds (the rain beds play on the engine's `ambience` bus). Knobs: data/score.json.
//
//   const score = createScore({ sfx: audio, data: game.data.score, bus: game.bus });
//   score.setAct('act2', lampsLit)   per-act drone; one voice added for each Great Lamp relit so far
//   score.rainIntensity(0.8)         crossfades the light and heavy rain beds
//   score.bossPhase(2) / (null)      a low drum pulse that tightens per phase; null stops it
//   score.motif()                    the 6-note Guild bell motif (lamp-posts, title cards, relights)
//   score.silence(true)              the Rain stops: everything fades out (cs_rain_stops)
//   score.stop()
//
// Nothing is built before audio is unlocked (the first user gesture): calls only record what should be
// playing, and the graph catches up on 'audio.unlocked'. The pure helpers (noteFreq, droneNotes, rainMix,
// motifFreqs) are exported for the node tests.

const NOTE = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
/** 'A4' → 440, 'F#3', 'Eb2'… (scientific pitch). */
export function noteFreq(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(String(name).trim()); if (!m) throw new Error('bad note ' + name);
  const semis = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}
/** The notes an act's drone plays with `lampsLit` Great Lamps relit (one voice per Lamp, in order). */
export function droneNotes(act, lampsLit = 0) {
  if (!act) return [];
  const extra = act.voicesPerLamp || []; const n = Math.max(0, Math.min(extra.length, Math.floor(lampsLit)));
  return [...(act.drone || []), ...extra.slice(0, n)];
}
/** Light and heavy rain bed gains for intensity 0..1: light first, heavy takes over from heavyFrom. */
export function rainMix(i, cfg = {}) {
  const x = Math.max(0, Math.min(1, Number(i) || 0)); const from = cfg.heavyFrom ?? 0.45;
  const heavy = x <= from ? 0 : (x - from) / (1 - from);
  const light = Math.min(1, x / Math.max(0.01, from)) * (1 - 0.6 * heavy);
  return { light: light * (cfg.lightMax ?? 1), heavy: heavy * (cfg.heavyMax ?? 1) };
}
/** The motif in an act's key (semitone shift). */
export function motifFreqs(motif, shift = 0) { return (motif?.notes || []).map(n => noteFreq(n) * Math.pow(2, shift / 12)); }

export function createScore({ sfx = null, data = null, bus = null } = {}) {
  const S = data || {};
  const want = { act: null, lamps: 0, rain: 0, phase: null, silent: false };
  let ctx = null, out = null, master = null, droneBus = null, lfo = null, noiseBuf = null;
  let voices = [];                 // { note, oscs, gain }
  let rain = { light: null, heavy: null, starting: false };
  let pulseTimer = null, nextBeat = 0, beat = 0;
  const engine = () => sfx?.sfx || (sfx?.play ? sfx : null);   // the bridge or a raw Sfx

  /** Build the graph once the context may run. Returns false while audio is still locked. */
  function ensure() {
    if (ctx) return true;
    if (sfx && sfx.unlocked === false) return false;
    const eng = engine(); if (!eng) return false;
    try {
      ctx = sfx.context?.() || eng.context;
      out = sfx.bus?.music || sfx.graph?.()?.music || null;
      if (!out) { out = ctx.createGain(); out.connect(eng.master || ctx.destination); }
      master = ctx.createGain(); master.gain.value = 1; master.connect(out);
      droneBus = ctx.createBiquadFilter(); droneBus.type = 'lowpass'; droneBus.frequency.value = 900; droneBus.Q.value = 0.7;
      const dg = ctx.createGain(); dg.gain.value = S.drone?.gain ?? 0.16; droneBus.connect(dg).connect(master);
      lfo = ctx.createOscillator(); lfo.frequency.value = S.drone?.lfoRate ?? 0.05; const lg = ctx.createGain(); lg.gain.value = 900 * (S.drone?.lfoDepth ?? 0.35); lfo.connect(lg).connect(droneBus.frequency); lfo.start(); lfo.depth = lg;
      sync();
      return true;
    } catch (e) { console.warn('[score] could not start', e); ctx = null; return false; }
  }
  bus?.on?.('audio.unlocked', () => ensure());

  const now = () => ctx.currentTime;
  function fadeTo(param, v, secs) { const t = now(); param.cancelScheduledValues(t); param.setValueAtTime(Math.max(0.0001, param.value), t); param.linearRampToValueAtTime(Math.max(0.0001, v), t + Math.max(0.02, secs)); }

  function makeVoice(note, wave, attack) {
    const f = noteFreq(note); const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(droneBus);
    const detune = S.drone?.detune ?? 5; const oscs = [-detune, detune].map(d => { const o = ctx.createOscillator(); o.type = wave || 'triangle'; o.frequency.value = f; o.detune.value = d; o.connect(g); o.start(); return o; });
    fadeTo(g.gain, S.drone?.voiceGain ?? 0.5, attack);
    return { note, oscs, gain: g };
  }
  function dropVoice(v, release) { fadeTo(v.gain.gain, 0.0001, release); const end = now() + release + 0.1; for (const o of v.oscs) { try { o.stop(end); } catch { /* already stopped */ } } }

  /** Bring the drone, rain and pulse in line with `want`. */
  function sync() {
    if (!ctx) return;
    const act = S.acts?.[want.act];
    const notes = want.silent || !act ? [] : droneNotes(act, want.lamps);
    const sameAct = voices.length && voices.act === want.act;
    if (!sameAct) { for (const v of voices) dropVoice(v, S.drone?.release ?? 4); voices = []; voices.act = want.act; }
    if (act) { droneBus.frequency.setTargetAtTime(act.filter || 900, now(), 1.5); if (lfo?.depth) lfo.depth.gain.setTargetAtTime((act.filter || 900) * (S.drone?.lfoDepth ?? 0.35), now(), 1.5); }
    // add the voices that are missing (a relit Lamp fades its voice in slowly), drop the ones no longer wanted
    for (const v of [...voices]) if (!notes.includes(v.note)) { dropVoice(v, S.drone?.release ?? 4); voices.splice(voices.indexOf(v), 1); }
    for (const n of notes) if (!voices.some(v => v.note === n)) { const lamp = !(act.drone || []).includes(n); voices.push(makeVoice(n, act.wave, lamp && sameAct ? (S.drone?.lampAttack ?? 6) : (S.drone?.attack ?? 3))); }
    voices.act = want.act;
    syncRain(); syncPulse();
  }

  function syncRain() {
    const eng = engine(); if (!eng || !ctx) return;
    const mix = want.silent ? { light: 0, heavy: 0 } : rainMix(want.rain, S.rain);
    const fade = want.silent ? (S.rainStops?.fadeOut ?? 4) : (S.rain?.fade ?? 1.5);
    for (const k of ['light', 'heavy']) {
      const id = S.rain?.[k]; if (!id) continue;
      const h = rain[k];
      if (h && h.gain) { fadeTo(h.gain.gain, mix[k], fade); continue; }
      if (mix[k] > 0.001 && !rain[k + 'Starting']) {
        rain[k + 'Starting'] = true;
        Promise.resolve(eng.play(id, { loop: true, gain: 0.0001 })).then(handle => { rain[k] = handle; rain[k + 'Starting'] = false; if (handle?.gain) { const m = want.silent ? { light: 0, heavy: 0 } : rainMix(want.rain, S.rain); setTimeout(() => { if (ctx) fadeTo(handle.gain.gain, want.silent ? 0 : rainMix(want.rain, S.rain)[k], fade); }, 450); } }).catch(() => { rain[k + 'Starting'] = false; });
      }
    }
  }

  function drum(t, accent = 1) {
    const p = S.boss?.pulse || {}; const [f0, f1] = p.sweep || [95, 42]; const dec = p.decay ?? 0.35;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime((p.gain ?? 0.55) * accent, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(master); o.start(t); o.stop(t + dec + 0.05);
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); }
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; const ng = ctx.createGain(); ng.gain.value = 0.12 * accent; const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1200;
    n.connect(nf).connect(ng).connect(master); n.start(t);
  }
  function syncPulse() {
    if (!ctx) return;
    const on = want.phase != null && !want.silent;
    if (!on) { if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; } return; }
    if (pulseTimer) return;
    nextBeat = now() + 0.1; beat = 0;
    pulseTimer = setInterval(() => {   // a small look-ahead scheduler: beats are placed on the audio clock, not the timer
      if (!ctx || want.phase == null) return;
      const bpms = S.boss?.pulse?.bpm || [72, 88, 104, 120]; const bpm = bpms[Math.max(0, Math.min(bpms.length - 1, want.phase - 1))];
      while (nextBeat < now() + 0.25) { drum(nextBeat, beat % 4 === 0 ? (S.boss?.pulse?.accent ?? 1.35) : 1); nextBeat += 60 / bpm; beat++; }
    }, 100);
  }

  return {
    /** The act's drone, with one extra voice per Great Lamp relit so far. */
    setAct(actId, lampsLit = 0) { want.act = actId; want.lamps = lampsLit; if (ensure()) sync(); },
    /** The boss pulse: phase 1..4, or null to stop it. */
    bossPhase(n) { want.phase = n == null ? null : Math.max(1, Math.floor(n)); if (ensure()) syncPulse(); },
    /** Rain density 0..1 → the two rain beds. */
    rainIntensity(i) { const v = Math.max(0, Math.min(1, Number(i) || 0)); if (Math.abs(v - want.rain) < 0.02 && (rain.light || rain.heavy || v === 0)) return; want.rain = v; if (ensure()) syncRain(); },
    /** The Rain stops (or starts again): fade everything out, silence, then back. */
    silence(on = true) {
      want.silent = !!on; if (!ensure()) return;
      fadeTo(master.gain, on && S.rainStops?.silence !== false ? 0.0001 : 1, on ? (S.rainStops?.fadeOut ?? 4) : 2);
      syncRain(); syncPulse();
    },
    /** Ring the Guild motif once (in the current act's key). */
    motif() {
      if (!ensure() || want.silent) return;
      const m = S.motif || {}; const freqs = motifFreqs(m, S.acts?.[want.act]?.motifShift || 0); const beatS = 60 / (m.tempo || 60);
      const partials = m.partials || [1, 2, 2.76, 5.4], pg = m.partialGains || [1, 0.5, 0.35, 0.15], dec = m.decay ?? 2.4;
      freqs.forEach((f, i) => {
        const t = now() + 0.05 + i * beatS;
        partials.forEach((p, k) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * p; const g = ctx.createGain(); const d = dec / (1 + k * 0.6);
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime((m.gain ?? 0.3) * (pg[k] ?? 0.1), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.05); });
      });
    },
    /** Stop everything the score started. */
    stop() {
      want.phase = null; if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
      if (!ctx) return;
      for (const v of voices) dropVoice(v, 0.5); voices = [];
      for (const k of ['light', 'heavy']) { if (S.rain?.[k]) engine()?.stopLoop?.(S.rain[k]); rain[k] = null; }
      try { lfo?.stop(); } catch { /* already stopped */ }
      ctx = null; out = null;
    },
    state: () => ({ ...want, started: !!ctx, voices: voices.map(v => v.note), pulsing: !!pulseTimer }),
  };
}
