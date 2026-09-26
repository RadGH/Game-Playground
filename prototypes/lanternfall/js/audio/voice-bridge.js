// Voices (docs/10 §10.2, 01 §12.6, 02 §19.3): speaks every 'talk.line' with voice-lab (our formant engine; babble
// for rats, moths, the Unlit, Saint Gnaw and Hush). Voices come from shared/voices.js voiceFor({ role, gender, seed })
// with each speaker's tweaks and fx from data/npcs.json. Playback goes through the `voice` bus that
// js/audio/sfx-bridge.js adds (so the Voices slider and the master limiter apply); without it, voice-lab plays
// on its own.
//
//   const voices = await createVoiceBridge({ game, settings, sfx: audio, talk });
//   voices.speaking('npc_aldra') → true while her line plays; voices.level(id) → 0..1 for mouth flaps
//
// Rules: at most 2 voices at once (npcs.json bark.voices); a new line from the same speaker cuts its old one; a
// higher-priority line (story > boss > NPC > bark > idle) cuts the lowest; a lower one is dropped. Synthesis never
// runs inside the game frame: lines wait in a queue that is worked through when the browser is idle. Pre-rendered
// barks ('talk.prerender') are synthesized ahead in idle time; a bark that is NOT ready and would cost more than
// 30 ms is shown as text only (01 §12.6). Settings: audio.voices (on/off), audio.voiceEngine (formant | espeak |
// piper | webspeech | babble = babble only | off), audio.babbleCreatures, audio.narrator, audio.speechSpeed.

const VOICE_JS = new URL('../../../../voice-lab/js/voice.js', import.meta.url);
const VOICES_JS = new URL('../../../../shared/voices.js', import.meta.url);
const NPCS_URL = new URL('../../data/npcs.json', import.meta.url);

/**
 * The voice JSON for one line. Pure (voiceFor is passed in) so the node tests can check it.
 * @param {object} line   a talk.line payload (speakerId, voiceOf, fx, phase, kind, seed, gloss…)
 * @param {object} o      { npcs, voiceFor, settings, underwater, met: [npc ids], rng }
 * @returns {object|null} null = this line has no voice
 */
export function voiceForLine(line, { npcs, voiceFor, settings = {}, underwater = false, met = [], rng = Math.random } = {}) {
  const byId = Object.fromEntries((npcs?.list || []).map(n => [n.id, n]));
  const engineSetting = settings.voiceEngine || 'formant';
  if (settings.voices === false || engineSetting === 'off') return null;
  if (line.speakerId === 'narrator' && settings.narrator === false) return null;
  const build = (spec, gender, fxExtra) => {
    if (!spec || spec.engine === 'none') return null;
    let v;
    if (spec.engine === 'babble') v = { engine: 'babble', babbleMode: spec.babbleMode || 'letters', pitch: spec.pitch ?? 0.6, speed: spec.speed ?? 0.6, depth: spec.depth ?? 0.4, tone: spec.tone ?? 0.5, breath: spec.breath ?? 0.2, gender };
    else { v = Object.assign(voiceFor({ role: spec.role || 'villager', gender: gender || 'n', seed: spec.seed || 1 }), spec.tweaks || {}); }
    // 01 writes intonation on a 0..1 scale; voice-lab's knob is 1..4 (flat → sing-song)
    if (v.intonation != null && v.intonation < 1) v.intonation = +(1 + v.intonation * 3).toFixed(2);
    v.fx = { ...(spec.fx || {}), ...(fxExtra || {}) };
    return v;
  };
  let v = null;
  const n = byId[line.speakerId];
  if (line.enemy || line.kind) {
    const k = npcs?.enemyVoices?.[line.kind]; if (!k) return null;
    if (k.voice?.engine === 'babble' && settings.babbleCreatures === false) return null;
    v = build({ ...k.voice, seed: line.seed ?? k.voice?.seed }, k.voice?.gender || 'n');
  } else if (n?.voice?.stolen || line.voiceOf) {
    // the Widow speaks in the voice of somebody you have met (01 §6.4)
    const who = line.voiceOf && (met.length === 0 || met.includes(line.voiceOf)) ? line.voiceOf : (met.length ? met[Math.floor(rng() * met.length)] : 'npc_aldra');
    const src = byId[who] || byId.npc_aldra;
    v = build(src?.voice, src?.gender, { ...(src?.voice?.fx || {}), ...((n?.voice?.stolen ? n.voice.fx : null) || byId.boss_widow?.voice?.fx || {}) });
  } else if (n) {
    v = build(n.voice, n.gender, n.voice?.fxByPhase?.[line.phase] ? n.voice.fxByPhase[line.phase] : null);
    if (v && n.voice?.fxByPhase?.[line.phase]) v.fx = { ...n.voice.fxByPhase[line.phase] };
  } else return null;
  if (!v) return null;
  if (line.fx) v.fx = { ...v.fx, ...line.fx };
  if (engineSetting === 'babble') { v.engine = 'babble'; v.babbleMode = v.babbleMode || 'simlish'; }
  else if (v.engine !== 'babble' && engineSetting !== 'formant') v.engine = engineSetting;
  if (settings.speechSpeed && settings.speechSpeed !== 1) v.speed = Math.max(0, Math.min(1, (v.speed ?? 0.5) * settings.speechSpeed));
  if (underwater || byId[line.speakerId]?.underwater) v.fx.lowpass = Math.min(v.fx.lowpass || 1e9, 1500);
  return v;
}

/** What a voice actually says: babble speaks the gloss (brackets and quotes off); others the Lingo speech text. */
export function spokenText(line) {
  const t = line.gloss || line.babble ? String(line.speech || line.text).replace(/^\[|\]$/g, '').replace(/["“”*]/g, '') : String(line.speech || line.text);
  return t.trim();
}

export async function createVoiceBridge({ game, settings = {}, sfx = null, npcs = null, voiceModule = null, voicesModule = null } = {}) {
  try { return await build({ game, settings, sfx, npcs, voiceModule, voicesModule }); }
  catch (err) { console.warn('[voices] unavailable, text only:', err?.message || err); return stubVoices(String(err?.message || err)); }
}

async function build({ game, settings, sfx, npcs, voiceModule, voicesModule }) {
  const VL = voiceModule || await import(VOICE_JS.href);
  const { voiceFor } = voicesModule || await import(VOICES_JS.href);
  npcs = npcs || game?.data?.npcs || await (await fetch(NPCS_URL)).json();
  const audio = settings.audio || settings;
  const MAX = npcs.bark?.voices ?? 2;
  const active = [];        // { speakerId, priority, source, gain, samples, sr, start }
  const queue = [];         // lines waiting for synthesis
  const ready = new Set();  // keys already synthesized (voice-lab caches the buffers themselves)
  let msPerChar = 0.6, busy = false;
  const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 120 }) : (fn) => setTimeout(fn, 0);
  const keyOf = (text, v) => JSON.stringify([text, v]);
  const underwater = () => !!(game?.player?.headUnder || game?.cam?.underwater);
  const met = () => game?.story?.met || [];
  const bridge = { ready: true };

  const ctxOf = () => (sfx?.unlocked && sfx.context?.()) || null;
  function stop(a) { try { a.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.04); a.source.stop(a.ctx.currentTime + 0.15); } catch { /* already done */ } const i = active.indexOf(a); if (i >= 0) active.splice(i, 1); }
  /** Make room for a new line: same speaker cuts itself; otherwise the lowest priority goes, or the new line waits out. */
  function admit(line) {
    for (const a of [...active]) if (a.speakerId === line.speakerId) stop(a);
    if (active.length < MAX) return true;
    const low = active.reduce((m, a) => (a.priority < m.priority ? a : m), active[0]);
    if ((line.priority ?? 2) > low.priority) { stop(low); return true; }
    return false;
  }

  function playResult(line, result) {
    if (!result) return;
    if (!admit(line)) return;
    const ctx = ctxOf();
    const cam = game?.cam; const cx = cam ? (cam.cx ?? cam.x + (cam.vw || 0) / 2) : null;
    const pan = line.x == null || cx == null ? 0 : Math.max(-1, Math.min(1, (line.x - cx) / 240));
    const dist = line.x == null || cx == null ? 0 : Math.hypot(line.x - cx, (line.y ?? 0) - (cam.cy ?? cam.y + (cam.vh || 0) / 2));
    const vol = Math.max((line.priority ?? 2) >= 3 ? 0.25 : 0, 1 - Math.min(1, dist / 360));
    if (!ctx) { VL.play(result, { volume: vol * (audio.voice ?? 0.9), pan }); return; }   // no sfx bus: voice-lab's own output
    const buf = ctx.createBuffer(1, result.samples.length, result.sampleRate); buf.copyToChannel(result.samples, 0);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol; let node = src.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = g.connect(p); }
    node.connect(sfx.bus?.voice || sfx.graph?.()?.voice || ctx.destination);
    const a = { speakerId: line.speakerId, priority: line.priority ?? 2, source: src, gain: g, ctx, samples: result.samples, sr: result.sampleRate, start: ctx.currentTime };
    src.onended = () => { const i = active.indexOf(a); if (i >= 0) active.splice(i, 1); };
    active.push(a); src.start();
  }

  /** Render one voice line (or a choir: several babble voices a little apart, mixed into one buffer). */
  async function render(line, v) {
    const text = spokenText(line); if (!text) return null;
    const n = (npcs.list || []).find(x => x.id === line.speakerId);
    if (n?.voice?.choir && v.engine === 'babble') {
      const parts = await Promise.all(n.voice.choir.map(off => VL.synthesize(text, { ...v, pitch: Math.max(0, Math.min(1, v.pitch + off)) })));
      const len = Math.max(...parts.map(p => p.samples.length)); const mix = new Float32Array(len);
      for (const p of parts) for (let i = 0; i < p.samples.length; i++) mix[i] += p.samples[i] / parts.length * 1.6;
      return { samples: mix, sampleRate: parts[0].sampleRate, duration: len / parts[0].sampleRate };
    }
    const t0 = performance.now();
    const r = await VL.synthesize(text, v);
    msPerChar = msPerChar * 0.8 + ((performance.now() - t0) / Math.max(1, text.length)) * 0.2;
    ready.add(keyOf(text, v));
    return r;
  }

  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    idle(async () => {
      const job = queue.shift();
      try {
        const r = await render(job.line, job.v);
        if (!job.warm && performance.now() - job.at < 4000) playResult(job.line, r);
      } catch (e) { if (!job.warm) console.warn('[voices]', e?.message || e); }
      busy = false; pump();
    });
  }

  /** Speak a talk.line payload. Returns false when the line stays text-only. */
  bridge.speak = (line) => {
    const v = voiceForLine(line, { npcs, voiceFor, settings: audio, underwater: underwater(), met: met() }); if (!v) return false;
    const text = spokenText(line); if (!text) return false;
    if (!VL.ENGINES?.[v.engine]?.meta?.yieldsBuffer && v.engine !== 'formant' && v.engine !== 'babble') { VL.say(text, v, { volume: audio.voice ?? 0.9 }).catch(() => {}); return true; }   // Web Speech: plays itself
    const cached = ready.has(keyOf(text, v));
    if (!cached && (line.priority ?? 2) <= 2 && text.length * msPerChar > 30) return false;                  // a bark not ready in time: text only
    const job = { line, v, at: performance.now() };
    if ((line.priority ?? 2) >= 4) queue.unshift(job); else queue.push(job);
    while (queue.filter(j => !j.warm).length > 6) queue.splice(queue.findIndex(j => !j.warm), 1);      // never let old barks pile up
    pump(); return true;
  };
  /** Synthesize lines ahead (room load, hub entry) so their barks are a lookup later. */
  bridge.warm = (lines = []) => {
    for (const line of lines) { const v = voiceForLine(line, { npcs, voiceFor, settings: audio, met: met() }); const text = spokenText(line); if (v && text && !ready.has(keyOf(text, v))) queue.push({ line, v, at: 0, warm: true }); }
    pump();
  };
  bridge.speaking = (id) => active.some(a => a.speakerId === id);
  /** RMS of the playing line over the last 30 ms (mouth flap when > 0.05, 01 §12.6). */
  bridge.level = (id) => {
    const a = active.find(x => x.speakerId === id); if (!a) return 0;
    const pos = Math.floor((a.ctx.currentTime - a.start) * a.sr), w = Math.floor(a.sr * 0.03); let s = 0, n = 0;
    for (let i = Math.max(0, pos - w); i < Math.min(a.samples.length, pos); i++) { s += a.samples[i] * a.samples[i]; n++; }
    return n ? Math.sqrt(s / n) : 0;
  };
  bridge.stopAll = () => { for (const a of [...active]) stop(a); queue.length = 0; try { VL.stopAll(); } catch { /* no window */ } };
  bridge.active = () => active.length;
  let offs = [game?.bus?.on?.('talk.line', l => bridge.speak(l)), game?.bus?.on?.('talk.prerender', e => bridge.warm(e.lines))];
  bridge.attach = g => { for (const o of offs) o?.(); game = g; offs = [game?.bus?.on?.('talk.line', l => bridge.speak(l)), game?.bus?.on?.('talk.prerender', e => bridge.warm(e.lines))]; };
  bridge.dispose = () => { for (const o of offs) o?.(); bridge.stopAll(); };
  return bridge;
}

export function stubVoices(reason = 'not loaded') {
  return { ready: false, reason, speak: () => false, warm() {}, speaking: () => false, level: () => 0, stopAll() {}, active: () => 0, dispose() {} };
}
