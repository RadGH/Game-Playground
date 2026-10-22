// Little looping tunes and a few made-up sounds for minigames, synthesized with Web Audio (no files). Any game view
// may use it; nothing else depends on it.
//   const tunes = createTunes();
//   tunes.start('jig')        loop a tune ('jig' = fiddle reel, 'sing' = a sing-song tiger lullaby, 'boogie' = fair organ, 'spooky' = Halloween creep)
//   tunes.stop(true)          stop (true = with a record scratch)       tunes.mute(on)  silence it without losing the beat
//   tunes.fx('roar' | 'scratch' | 'tick' | 'boing' | 'honk' | 'pop' | 'whistle' | 'ding' | 'knock' | 'boo' | 'slime' | 'chime', pitch?)
//   tunes.dispose()           call from the view's dispose()
// Browsers only play sound after a tap; by the time a minigame starts the player has tapped plenty. If the audio
// context cannot run, every call is silently nothing — a sound must never break a game.
const SEMI = n => Math.pow(2, n / 12);
// [semitones from the key note, beats]; null = rest
const TUNES = {
  jig: { bpm: 168, key: 440, wave: 'sawtooth', cut: 2600, vib: 6, bass: [-24, -17, -24, -17], notes: [
    [0, .5], [4, .5], [7, .5], [4, .5], [5, .5], [9, .5], [12, .5], [9, .5], [7, .5], [5, .5], [4, .5], [2, .5], [0, 1], [-5, 1],
    [0, .5], [4, .5], [7, .5], [12, .5], [11, .5], [9, .5], [7, .5], [5, .5], [4, .5], [2, .5], [4, .5], [5, .5], [7, 1], [null, 1],
    [9, .5], [7, .5], [5, .5], [4, .5], [5, .5], [7, .5], [9, .5], [11, .5], [12, .5], [11, .5], [9, .5], [7, .5], [5, 1], [2, 1],
    [4, .5], [5, .5], [7, .5], [4, .5], [2, .5], [-1, .5], [0, .5], [2, .5], [0, 1.5], [null, .5]] },
  sing: { bpm: 112, key: 392, wave: 'triangle', cut: 3000, vib: 5, bass: [-12, -19, -12, -17], notes: [
    [0, 1], [4, .5], [4, .5], [7, 1], [4, 1], [5, .5], [4, .5], [2, .5], [0, .5], [2, 2],
    [2, 1], [5, .5], [5, .5], [9, 1], [7, 1], [5, .5], [4, .5], [2, .5], [-1, .5], [0, 2]] },
  boogie: { bpm: 132, key: 523, wave: 'square', cut: 1800, vib: 0, bass: [-24, -20, -17, -15], notes: [
    [0, .5], [4, .5], [7, .5], [9, .5], [10, .5], [9, .5], [7, .5], [4, .5], [5, .5], [9, .5], [12, .5], [14, .5], [15, .5], [14, .5], [12, .5], [9, .5]] },
  // spooky-cute (Halloween games): a tiptoeing minor-key creep with a little giggle at the end of each line
  spooky: { bpm: 126, key: 440, wave: 'triangle', cut: 2400, vib: 7, bass: [-24, -17, -21, -16], notes: [
    [0, .5], [3, .5], [7, .5], [3, .5], [6, .5], [3, .5], [0, 1],
    [-2, .5], [2, .5], [5, .5], [2, .5], [3, .5], [2, .5], [-1, 1],
    [0, .5], [3, .5], [7, .5], [12, .5], [11, .5], [7, .5], [8, .5], [7, .5],
    [3, .5], [6, .5], [5, .5], [2, .5], [0, .25], [12, .25], [0, .25], [12, .25], [null, 1]] },
};

export function createTunes({ volume = 0.32 } = {}) {
  let ac = null, master = null, musicBus = null, noiseBuf = null, timer = 0, tune = null, beat = 0, nextAt = 0, idx = 0, bassBeat = 0, muted = false;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = volume; master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = 1; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.0, ac.sampleRate); const d = noiseBuf.getChannelData(0); let s = 9;
    for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    ac.resume?.().catch(() => {});
  } catch { ac = null; }
  const ok = () => ac && ac.state !== 'closed';
  function env(at, peak, dur, dest = master, attack = 0.01) { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); g.connect(dest); return g; }
  function tone(at, type, f0, f1, peak, dur, dest = master, cut = 0, vib = 0) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur * 0.9);
    let out = o;
    if (cut) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); out = f; }
    if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(at); l.stop(at + dur + 0.05); }
    out.connect(env(at, peak, dur, dest, Math.min(0.02, dur / 4))); o.start(at); o.stop(at + dur + 0.05);
  }
  function noise(at, type, f0, f1, q, peak, dur) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const bq = ac.createBiquadFilter(); bq.type = type; bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, at); bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
    s.connect(bq); bq.connect(env(at, peak, dur, master, 0.005)); s.start(at); s.stop(at + dur + 0.05);
  }
  function schedule() {
    if (!ok() || !tune) return;
    if (ac.state !== 'running') { ac.resume?.().catch(() => {}); return; }
    const T = TUNES[tune], spb = 60 / T.bpm;
    if (nextAt < ac.currentTime) nextAt = ac.currentTime + 0.05;
    while (nextAt < ac.currentTime + 0.25) {
      const [n, beats] = T.notes[idx % T.notes.length], dur = beats * spb;
      if (n != null) tone(nextAt, T.wave, T.key * SEMI(n), T.key * SEMI(n), 0.22, dur * 0.92, musicBus, T.cut, T.vib);
      // oom-pah: a bass note on every beat that falls inside this note
      while (bassBeat < beat + beats - 1e-6) { const at = nextAt + (bassBeat - beat) * spb, b = T.bass[Math.floor(bassBeat) % T.bass.length];
        tone(at, 'triangle', T.key * SEMI(b), T.key * SEMI(b), 0.3, spb * 0.45, musicBus); if (bassBeat % 1 === 0) tone(at + spb / 2, 'sine', T.key * SEMI(b + 12), T.key * SEMI(b + 12), 0.08, spb * 0.3, musicBus); bassBeat += 1; }
      beat += beats; idx++; nextAt += dur;
    }
  }
  const api = {
    start(name) {
      if (!TUNES[name] || !ok()) return;
      if (tune === name) return;
      tune = name; idx = 0; beat = 0; bassBeat = 0; nextAt = 0;
      musicBus.gain.cancelScheduledValues(ac.currentTime); musicBus.gain.setValueAtTime(muted ? 0.0001 : 1, ac.currentTime);
      clearInterval(timer); timer = setInterval(schedule, 50); schedule();
    },
    stop(scratch = false) {
      if (!ok()) return;
      const was = tune; tune = null; clearInterval(timer); timer = 0;
      musicBus.gain.cancelScheduledValues(ac.currentTime); musicBus.gain.setValueAtTime(musicBus.gain.value, ac.currentTime); musicBus.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);
      // a fresh bus for the next tune (the old one fades out with whatever notes were already scheduled)
      const old = musicBus; musicBus = ac.createGain(); musicBus.connect(master); setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, 600);
      if (scratch && was) api.fx('scratch');
    },
    mute(on) {
      if (!ok() || muted === !!on) return; muted = !!on;
      musicBus.gain.cancelScheduledValues(ac.currentTime); musicBus.gain.setTargetAtTime(on ? 0.0001 : 1, ac.currentTime, 0.02);
    },
    get playing() { return tune; },
    fx(name, pitch = 1) {
      if (!ok() || ac.state !== 'running') { ac?.resume?.().catch(() => {}); return; }
      const at = ac.currentTime + 0.01;
      try {
        if (name === 'roar') { tone(at, 'sawtooth', 120, 55, 0.5, 0.9, master, 900); tone(at, 'square', 82, 41, 0.25, 0.9, master, 500); noise(at, 'lowpass', 1600, 200, 0.7, 0.6, 1.0); }
        else if (name === 'scratch') { noise(at, 'bandpass', 2400, 300, 2, 0.5, 0.22); noise(at + 0.12, 'bandpass', 600, 2000, 2, 0.35, 0.16); }
        else if (name === 'tick') tone(at, 'square', 1700 * pitch, 1700 * pitch, 0.1, 0.04, master, 4000);
        else if (name === 'boing') tone(at, 'sine', 180 * pitch, 520 * pitch, 0.5, 0.28);
        else if (name === 'honk') { tone(at, 'square', 330 * pitch, 320 * pitch, 0.18, 0.18, master, 1400); tone(at, 'square', 415 * pitch, 405 * pitch, 0.14, 0.18, master, 1400); }
        else if (name === 'pop') { noise(at, 'lowpass', 3000, 300, 0.8, 0.9, 0.35); tone(at, 'sine', 160, 50, 0.7, 0.3); }
        else if (name === 'whistle') { tone(at, 'sine', 1400, 2300, 0.18, 0.18); tone(at + 0.2, 'sine', 2300, 1500, 0.15, 0.22); }
        else if (name === 'knock') { for (const k of [0, 0.16]) { tone(at + k, 'sine', 190 * pitch, 90 * pitch, 0.7, 0.09); noise(at + k, 'lowpass', 900, 200, 1, 0.5, 0.06); } }
        else if (name === 'boo') { tone(at, 'sine', 300 * pitch, 520 * pitch, 0.3, 0.35, master, 0, 9); tone(at + 0.3, 'sine', 520 * pitch, 260 * pitch, 0.28, 0.5, master, 0, 9); }
        else if (name === 'slime') { tone(at, 'sine', 420 * pitch, 90 * pitch, 0.45, 0.32); noise(at + 0.05, 'lowpass', 700, 120, 3, 0.5, 0.3); }
        else if (name === 'chime') { tone(at, 'sine', 1568 * pitch, 1568 * pitch, 0.18, 0.25); tone(at + 0.07, 'sine', 2093 * pitch, 2093 * pitch, 0.16, 0.35); }
        else if (name === 'ding') { tone(at, 'sine', 1320 * pitch, 1320 * pitch, 0.35, 1.2); tone(at, 'sine', 3300 * pitch, 3300 * pitch, 0.08, 0.6); }
      } catch { /* never break the game for a sound */ }
    },
    dispose() { clearInterval(timer); tune = null; try { ac?.close(); } catch { /* already closed */ } ac = null; },
  };
  return api;
}
