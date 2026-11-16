// Voidwright's music: original space music made live with WebAudio — no recordings, no third-party tracks.
// Owner 2026-11-16: "Voidwright could do with some more interesting music". Five moods crossfade as the game changes:
//
//   station  docked — warm major-ish chords (lydian / ionian), a soft glass piano, slow pads, the odd rim click
//   cruise   open space — wide detuned pads drifting through slow two-bar chords, an echoing 16th-note sequence,
//            a glassy lead phrase now and then, sparse soft percussion
//   danger   a high-danger star with no fight on — darker scales, a low pulse, a ticking hat and a heartbeat kick
//   alien    alien space or near an anomaly — whole-tone and odd five-note scales, a gliding sine voice, metal shimmer,
//            no beat, very slow chords
//   combat   a fight — drums that build with `intensity` 1..3 (kick + hats → + 16th hats, toms → four-on-the-floor,
//            snare rolls, sub hits), a driving octave bass, a fast arpeggio
//
// Variation over long play (no short loops): every 8 bars a seeded phrase planner picks a SECTION (intro, build, full,
// break, outro-like thin-out) from a small chain, which layers play, the drum variant, the arpeggio shape and rhythm, and
// a variation of the current motif (transposed, inverted, displaced); every 4 phrases the chord progression is swapped or
// generated, every ~6 the key moves. At 80 bpm a phrase is 24 s, a progression lasts ~1.5 min, a key ~2.5 min.
//
//   const m = new Music({ ctx, out, seed }); m.start(); m.setMood('cruise'); m.setIntensity(2); m.duck(0.3, 1.5); m.state(); m.stop();
//   pickMood(state, memory) → { mood, intensity, memory }      (pure, node-tested)
//   planPhrase(r, mood, phraseNo, prevSection) → plan            (pure, node-tested)
//
// Notes are scheduled a quarter second ahead on the audio clock; a page that was hidden skips missed notes.

// ------------------------------------------------------------------ pure parts
export const MOOD_IDS = ['station', 'cruise', 'danger', 'alien', 'combat'];
export const COMBAT_HOLD = 14;      // seconds the battle music stays after the last shot
export const MIN_DWELL = 10;        // calm moods hold at least this long before drifting to another calm mood
export const DANGER_TIER = 6;       // stars this dangerous get the darker travelling music
export const ALIEN_ON = 0.6, ALIEN_OFF = 0.3;

/**
 * Which mood fits the game right now.
 * state: { mode: 'title'|'fly'|'docked'|'jumping'|'dead', tier, combatAgo (s since the last real exchange),
 *          hostiles (hostile ships within ~2.5 km), alien 0..1 (alien space / ships / anomaly nearby), now (s) }
 * Battle starts at once and holds COMBAT_HOLD s after the last sign of it; docking switches at once; the calm moods
 * hold MIN_DWELL s so passing an alien wreck does not flip the music back and forth. Jumping keeps what was playing.
 */
export function pickMood(st = {}, mem = {}) {
  const { mode = 'fly', tier = 1, combatAgo = 99, hostiles = 0, alien = 0, now = 0 } = st;
  const m = { mood: mem.mood || null, since: mem.since ?? -1e9, combatUntil: mem.combatUntil ?? -1, alienOn: !!mem.alienOn, intensity: mem.intensity || 1 };
  const set = mood => { if (m.mood !== mood) { m.mood = mood; m.since = now; } };
  m.alienOn = m.alienOn ? alien > ALIEN_OFF : alien >= ALIEN_ON;
  if (mode === 'docked') { set('station'); m.combatUntil = -1; m.intensity = 1; return { mood: m.mood, intensity: 1, memory: m }; }
  if (mode === 'title') { set('cruise'); m.combatUntil = -1; return { mood: m.mood, intensity: 1, memory: m }; }
  if (mode === 'jumping' && m.mood) return { mood: m.mood, intensity: m.intensity, memory: m };
  if (mode === 'fly' && (combatAgo < 4 || hostiles >= 3)) m.combatUntil = now + COMBAT_HOLD;
  if (now < m.combatUntil) {
    set('combat');
    m.intensity = 1 + (hostiles >= 4 || tier >= 5 ? 1 : 0) + (hostiles >= 8 || (tier >= 7 && hostiles >= 3) ? 1 : 0);
    return { mood: 'combat', intensity: m.intensity, memory: m };
  }
  m.intensity = 1;
  const calm = m.alienOn ? 'alien' : tier >= DANGER_TIER ? 'danger' : 'cruise';
  if (!m.mood || m.mood === 'combat' || m.mood === 'station' || now - m.since >= MIN_DWELL) set(calm);
  return { mood: m.mood, intensity: 1, memory: m };
}

/** A small seeded random (mulberry32): same seed, same music. */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.int = n => Math.floor(f() * n); f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}

export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], locrian: [0, 1, 3, 5, 6, 8, 10],
  wholetone: [0, 2, 4, 6, 8, 10], hollow: [0, 2, 3, 7, 8], phrygdom: [0, 1, 4, 5, 7, 8, 10],
};

/**
 * Each mood: tempo, scales, chord progressions (scale steps), bars per chord, how likely each layer is in a FULL
 * section, the instrument mix and colours. Progressions marked null are generated (a slow random walk) instead.
 */
export const MOODS = {
  station: { bpm: 68, scales: ['lydian', 'ionian', 'mixolydian'], barsPerChord: 2, root: [48, 55],
    progs: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 1, 0, 4], [3, 4, 0, 5], [0, 2, 3, 1], null],
    odds: { drone: 0.4, bass: 0.55, arp: 0.45, glass: 0.85, lead: 0.15, perc: 0.35, swell: 0.25 },
    arps: ['up', 'updown', 'pattern'], arpRate: 2, cutoff: 1300, verb: 0.55, echo: 0.3, padWave: 'triangle',
    mix: { pad: 0.13, drone: 0.08, bass: 0.13, arp: 0.05, glass: 0.07, lead: 0.05, kick: 0.12, rim: 0.05, hat: 0.02, shaker: 0.025, swell: 0.035 } },
  cruise: { bpm: 80, scales: ['dorian', 'aeolian', 'lydian'], barsPerChord: 2, root: [45, 52],
    progs: [[0, 5, 3, 6], [0, 3, 0, 4], [5, 3, 0, 4], [0, 6, 5, 3], [0, 2, 5, 4], null, null],
    odds: { drone: 0.6, bass: 0.55, arp: 0.85, glass: 0.4, lead: 0.4, perc: 0.5, swell: 0.4 },
    arps: ['up', 'updown', 'pattern', 'down', 'euclid'], arpRate: 4, cutoff: 1500, verb: 0.65, echo: 0.55, padWave: 'sawtooth',
    mix: { pad: 0.13, drone: 0.09, bass: 0.14, arp: 0.045, glass: 0.05, lead: 0.05, kick: 0.2, rim: 0.05, hat: 0.025, shaker: 0.02, swell: 0.04 } },
  danger: { bpm: 80, scales: ['phrygian', 'locrian', 'aeolian'], barsPerChord: 2, root: [43, 50],
    progs: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 0, 6, 5], [0, 3, 1, 1], null],
    odds: { drone: 0.95, bass: 0.8, arp: 0.5, glass: 0.25, lead: 0.2, perc: 0.75, swell: 0.45 },
    arps: ['pattern', 'euclid', 'down'], arpRate: 4, cutoff: 1000, verb: 0.6, echo: 0.5, padWave: 'sawtooth',
    mix: { pad: 0.11, drone: 0.12, bass: 0.16, arp: 0.04, glass: 0.045, lead: 0.045, kick: 0.24, rim: 0.05, hat: 0.03, shaker: 0.02, swell: 0.045 } },
  alien: { bpm: 58, scales: ['wholetone', 'hollow', 'phrygdom'], barsPerChord: 4, root: [44, 51],
    progs: [null, null, [0, 1, 0, 2], [0, 2, 1, 3]],
    odds: { drone: 0.85, bass: 0.15, arp: 0.3, glass: 0.65, lead: 0.8, perc: 0.3, swell: 0.6 },
    arps: ['pattern', 'euclid'], arpRate: 2, cutoff: 1100, verb: 0.9, echo: 0.65, padWave: 'triangle',
    mix: { pad: 0.13, drone: 0.1, bass: 0.1, arp: 0.04, glass: 0.06, lead: 0.06, kick: 0, rim: 0, hat: 0, shaker: 0.03, swell: 0.05 } },
  combat: { bpm: 118, scales: ['harmonic', 'phrygian', 'aeolian'], barsPerChord: 1, root: [43, 50],
    progs: [[0, 0, 5, 4], [0, 5, 6, 4], [0, 1, 0, 6], [0, 3, 5, 4], [0, 6, 5, 6]],
    odds: { drone: 0.4, bass: 1, arp: 0.9, glass: 0.15, lead: 0.35, perc: 1, swell: 0.3 },
    arps: ['up', 'pattern', 'down', 'updown'], arpRate: 4, cutoff: 2000, verb: 0.4, echo: 0.35, padWave: 'sawtooth',
    mix: { pad: 0.1, drone: 0.08, bass: 0.18, arp: 0.05, glass: 0.04, lead: 0.05, kick: 0.36, rim: 0.08, hat: 0.04, shaker: 0.025, snare: 0.15, tom: 0.14, sub: 0.25, swell: 0.04 } },
};

/**
 * Drum patterns (16 steps, one bar): x = hit, o = soft hit, ? = sometimes. Each mood has variants, combat has them
 * per intensity; the phrase plan picks one so the groove changes too.
 */
export const GROOVES = {
  station: [{ rim: '........x.......', shaker: '..o...o...o...o.' }, { kick: 'o...............', rim: '............?...' }, { shaker: 'o.o.o.o.o.o.o.o.' }],
  cruise: [{ kick: 'x.........?.....', rim: '........x.......', hat: '..o...o...o...o.' },
    { kick: 'x.......o.......', shaker: 'o.o.o.o.o.o.o.o.' }, { kick: 'x.....?...x.....', rim: '....x.......x...', hat: '..?...?...?...o.' }],
  danger: [{ kick: 'x..x............', hat: 'o.o.o.o.o.o.o.o.' }, { kick: 'x..x....x..x....', rim: '............x...', hat: '..o...o...o...o.' },
    { kick: 'x...............', hat: 'oooooooooooooooo' }],
  alien: [{ shaker: '....o.......o...' }, {}, { shaker: 'o..?..o..?..o...' }],
  combat: {
    1: [{ kick: 'x.......x.......', snare: '....o.......o...', hat: 'o.o.o.o.o.o.o.o.' }, { kick: 'x.....x...x.....', snare: '....x.......x...', hat: '..o...o...o...o.' }],
    2: [{ kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'oxoooxoooxoooxoo', tom: '..............?x' },
      { kick: 'x..x..x...x.....', snare: '....x.......x..?', hat: 'oooooooooooooooo', tom: '.............x.x' }],
    3: [{ kick: 'x...x...x...x...', snare: '....x.......x.?x', hat: 'oxoxoxoxoxoxoxox', tom: '............xxx.', sub: 'x...............' },
      { kick: 'x.x.x...x.x.x..x', snare: '....x..?....x.xx', hat: 'oooxoooxoooxooox', tom: '..........x.x.xx', sub: 'x.......x.......' }],
  },
};

/** Which section follows which (a small chain): a phrase's section decides how full it is. */
const NEXT = { intro: ['build', 'build', 'full'], build: ['full', 'full', 'break'], full: ['full', 'break', 'build', 'thin'], break: ['build', 'full', 'thin'], thin: ['build', 'full', 'break'] };
const FILL = { intro: 0.25, build: 0.65, full: 1, break: 0.35, thin: 0.5 };

/** Euclidean rhythm: k hits spread as evenly as possible over n steps, rotated. */
export function euclid(k, n = 16, rot = 0) { const out = []; for (let i = 0; i < n; i++) out.push(((i + rot) * k) % n < k); return out; }

/** What the next 8 bars do. Pure: same rng state, same plan. */
export function planPhrase(r, mood, phraseNo = 0, prev = null) {
  const M = MOODS[mood] || MOODS.cruise, o = M.odds;
  const section = phraseNo === 0 ? 'intro' : r.pick(NEXT[prev] || NEXT.full);
  const f = FILL[section];
  const on = k => r() < o[k] * f;
  const layers = { pad: true, drone: r() < o.drone, bass: on('bass'), arp: on('arp'), glass: on('glass'), lead: section !== 'intro' && on('lead'), perc: section !== 'intro' && on('perc'), swell: r() < o.swell };
  if (mood === 'combat' && section !== 'intro') layers.bass = layers.perc = true;
  if (section === 'break') { layers.perc = mood === 'combat' && r() < 0.5; layers.bass = layers.bass && r() < 0.5; }
  if (!layers.arp && !layers.glass && !layers.lead && section !== 'intro') layers[r() < 0.5 ? 'arp' : 'glass'] = true;   // something moves over the pads
  const shape = r.pick(M.arps);
  const arp = { shape, octaves: 1 + r.int(2), pattern: Array.from({ length: 8 }, () => r.int(5)), hits: euclid(5 + r.int(5), 16, r.int(16)), every: mood === 'alien' ? 2 : 1 };
  const motifVar = r.pick(['same', 'same', 'up', 'invert', 'shift', 'thin']);
  const groove = r.int(16);
  return { section, layers, arp, motifVar, groove, fill: f };
}

/** A fresh motif: 16 eighth-note slots over two bars, chord-tone steps or rests. */
export function makeMotif(r, density = 0.45) { return Array.from({ length: 16 }, (_, i) => (r() < (i % 4 === 0 ? density + 0.2 : density - 0.1) ? r.int(6) : null)); }
/** A variation of a motif (keeps the idea recognisable while it changes). */
export function varyMotif(m, how) {
  if (how === 'up') return m.map(v => (v == null ? v : v + 1));
  if (how === 'invert') return m.map(v => (v == null ? v : Math.max(0, 5 - v)));
  if (how === 'shift') return m.slice(2).concat(m.slice(0, 2));
  if (how === 'thin') return m.map((v, i) => (i % 2 ? null : v));
  return m.slice();
}
/** A generated progression: a slow walk over the scale's steps that starts and ends near home. */
export function walkProg(r, len = 4, steps = 7) { const p = [0]; for (let i = 1; i < len; i++) p.push(((p[i - 1] + r.pick([1, 2, 3, -1, -2, 4])) % steps + steps) % steps); return p; }

/** The notes of chord `deg` (MIDI, root `key`) in any scale: stacked every other scale step, sometimes a 4th note. */
export function chordNotes(key, scale, deg, extra = false) {
  const s = SCALES[scale] || SCALES.aeolian, n = s.length, at = i => key + s[(deg + i) % n] + 12 * Math.floor((deg + i) / n);
  return extra ? [at(0), at(2), at(4), at(6)] : [at(0), at(2), at(4)];
}
export const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const hit = (pat, i, r) => { const c = pat?.[i]; return c === 'x' ? 1 : c === 'o' ? 0.6 : c === '?' ? (r() < 0.45 ? 0.6 : 0) : 0; };

// ------------------------------------------------------------------ the player
export class Music {
  constructor({ ctx, out, seed = 1 }) {
    this.ctx = ctx; this.out = out; this.seed = seed >>> 0; this.r = rng(this.seed);
    this.mood = null; this.intensity = 1; this.players = []; this.timer = null; this.notes = 0; this.playing = false; this._duckUntil = 0; this._duckDepth = 1;
    const c = ctx;
    this.duckG = c.createGain(); this.duckG.connect(out);
    this.glue = c.createDynamicsCompressor(); this.glue.threshold.value = -20; this.glue.ratio.value = 3; this.glue.attack.value = 0.02; this.glue.release.value = 0.35;
    this.glue.connect(this.duckG);
    this.bus = c.createGain(); this.bus.connect(this.glue);
    // a long, dark, stereo reverb (space is big) and a ping-pong echo
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(5.5);
    const vlp = c.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 5200; const vg = c.createGain(); vg.gain.value = 0.7;
    this.verb.connect(vlp).connect(vg).connect(this.bus);
    this.echoL = c.createDelay(3); this.echoR = c.createDelay(3);
    const fb = c.createGain(); fb.gain.value = 0.42; const elp = c.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 2400;
    const merge = c.createChannelMerger ? c.createChannelMerger(2) : null;
    this.echoIn = c.createGain();
    this.echoIn.connect(this.echoL); this.echoL.connect(elp); elp.connect(this.echoR); this.echoR.connect(fb); fb.connect(this.echoL);
    const eg = c.createGain(); eg.gain.value = 0.55;
    if (merge) { this.echoL.connect(merge, 0, 0); this.echoR.connect(merge, 0, 1); merge.connect(eg); } else { this.echoL.connect(eg); this.echoR.connect(eg); }
    eg.connect(this.bus); const ev = c.createGain(); ev.gain.value = 0.3; eg.connect(ev).connect(this.verb);
    this.noise = this._noiseBuf();
  }
  start() { if (this.playing) return; this.playing = true; this.timer = setInterval(() => this._tick(), 50); if (!this.mood) this.setMood('cruise'); }
  stop() { this.playing = false; clearInterval(this.timer); this.timer = null; for (const p of this.players) { p.fade(0, 0.6); const o = p.out; setTimeout(() => { try { o.disconnect(); } catch { /* */ } }, 900); } this.players = []; this.mood = null; }
  /** Crossfade to a mood: battle and docking come in quickly, the others drift in over several seconds. */
  setMood(mood) {
    if (!MOODS[mood] || mood === this.mood) return;
    const t = this.ctx.currentTime, fadeIn = mood === 'combat' ? 1.5 : mood === 'station' ? 3 : 6, fadeOut = this.mood === 'combat' ? 7 : 4;
    for (const p of this.players) { p.fade(0, fadeOut); p.dieAt = t + fadeOut * 1.2; }
    const p = new MoodPlayer(this, mood, (this.seed + this.r.int(1e9)) >>> 0);
    p.fade(1, fadeIn);
    this.players.push(p); this.mood = mood;
  }
  setIntensity(n) { this.intensity = Math.max(1, Math.min(3, n | 0 || 1)); }
  /** Push the music down to `depth` (0..1) for about `sec` seconds — under a big blast. Deeper ducks win. */
  duck(depth = 0.35, sec = 1.5) {
    const g = this.duckG.gain, t = this.ctx.currentTime;
    if (this._duckUntil > t && depth >= this._duckDepth) return;
    this._duckUntil = t + sec; this._duckDepth = depth;
    g.cancelScheduledValues(t); g.setTargetAtTime(depth, t, 0.03); g.setTargetAtTime(1, t + sec * 0.4, sec * 0.25);
  }
  state() {
    const p = this.players[this.players.length - 1];
    return { playing: this.playing, mood: this.mood, intensity: this.intensity, players: this.players.length, notes: this.notes, bpm: p?.M.bpm ?? 0, key: p?.key ?? null, scale: p?.scale ?? null, bar: p?.bar ?? 0, phrase: p?.phraseNo ?? 0, section: p?.plan?.section ?? null, layers: p?.plan?.layers ?? null, duck: +this.duckG.gain.value.toFixed(3) };
  }
  _tick() {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.players = this.players.filter(p => { if (p.dieAt && t > p.dieAt) { p.out.disconnect(); return false; } return true; });
    for (const p of this.players) p.schedule(t + 0.25);
  }
  _impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const k = i / n; lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - k, 2.2) * (k < 0.02 ? k * 50 : 1); } }
    return b;
  }
  _noiseBuf() { const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
}

/** One mood playing: its own clock, key, progression, motif and phrase plan, through its own fade gain. */
class MoodPlayer {
  constructor(music, mood, seed) {
    this.m = music; this.ctx = music.ctx; this.mood = mood; this.M = MOODS[mood]; this.r = rng(seed);
    this.out = this.ctx.createGain(); this.out.gain.value = 0.0001; this.out.connect(music.bus);
    this.sendVerb = this.ctx.createGain(); this.sendVerb.gain.value = this.M.verb; this.sendVerb.connect(music.verb);
    this.sendEcho = this.ctx.createGain(); this.sendEcho.gain.value = this.M.echo; this.sendEcho.connect(music.echoIn);
    this.key = this.M.root[0] + this.r.int(this.M.root[1] - this.M.root[0] + 1);
    this.scale = this.r.pick(this.M.scales); this._newProg();
    this.step = 0; this.bar = 0; this.phraseNo = 0; this.next = this.ctx.currentTime + 0.1;
    this.beat = 60 / this.M.bpm; this.sixteenth = this.beat / 4;
    const t = this.ctx.currentTime;
    music.echoL.delayTime.setTargetAtTime(this.beat * 0.75, t, 0.3); music.echoR.delayTime.setTargetAtTime(this.beat * 0.5, t, 0.3);
    this.motif = makeMotif(this.r, mood === 'combat' ? 0.55 : 0.4);
    this.plan = planPhrase(this.r, mood, 0); this.cur = this.motif;
    this.chord = chordNotes(this.key + 12, this.scale, 0);
  }
  _newProg() { const p = this.r.pick(this.M.progs); this.prog = p || walkProg(this.r, 4, (SCALES[this.scale] || SCALES.aeolian).length); }
  fade(v, sec) { const g = this.out.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(Math.max(0.0001, v), t + sec); }

  schedule(until) {
    const now = this.ctx.currentTime;
    if (this.next < now - 0.1) { const skip = Math.ceil((now - this.next) / this.sixteenth); this.step += skip; this.next += skip * this.sixteenth; }
    while (this.next < until) { this._step(this.step, this.next); this.step++; this.next += this.sixteenth; }
  }

  _groove() {
    const g = GROOVES[this.mood];
    const list = this.mood === 'combat' ? g[this.m.intensity] || g[1] : g;
    return list[this.plan.groove % list.length];
  }

  _step(step, t) {
    const s16 = step % 16;
    if (s16 === 0) this._bar(step / 16 | 0, t);
    const M = this.M, L = this.plan.layers, mix = M.mix, chord = this.chord, r = this.r, I = this.m.intensity;
    // percussion
    if (L.perc) {
      const G = this._groove(), lastBar = this.bar % 8 === 7;
      let v;
      if (mix.kick && (v = hit(G.kick, s16, r))) this._kick(t, mix.kick * v);
      if (mix.rim && (v = hit(G.rim, s16, r))) this._rim(t, mix.rim * v);
      if (mix.hat && (v = hit(G.hat, s16, r))) this._hat(t, mix.hat * v * (s16 % 4 === 2 ? 1.2 : 0.8));
      if (mix.shaker && (v = hit(G.shaker, s16, r))) this._shaker(t, mix.shaker * v);
      if (mix.snare && (v = hit(G.snare, s16, r))) this._snare(t, mix.snare * v);
      if (mix.tom && (v = hit(G.tom, s16, r)) && (lastBar || this.bar % 4 === 3)) this._tom(t, mix.tom * v, 90 - s16 * 2.5);
      if (mix.sub && (v = hit(G.sub, s16, r))) this._sub(t, mix.sub * v);
    }
    // bass
    if (L.bass) {
      const root = chord[0] - 12 - (chord[0] - 12 - this.key >= 7 ? 12 : 0);
      if (this.mood === 'combat') { if (s16 % 2 === 0) this._bass(t, s16 % 4 === 0 ? root : root + 12, this.sixteenth * (I >= 3 ? 1.4 : 1.7), mix.bass * (s16 % 4 === 0 ? 1 : 0.75)); }
      else if (this.mood === 'danger') { if (s16 % 2 === 0) this._bass(t, root, this.sixteenth * 1.5, mix.bass * (s16 % 8 === 0 ? 1 : 0.55)); }
      else if (this.mood === 'alien') { if (s16 === 0 && this.bar % 2 === 0) this._bass(t, root, this.beat * 7, mix.bass); }
      else if (this.mood === 'station') { if (s16 === 0) this._bass(t, root, this.beat * 3, mix.bass); else if (s16 === 10 && r() < 0.5) this._bass(t, root + 7, this.beat, mix.bass * 0.6); }
      else if (s16 === 0 || (s16 === 6 && r() < 0.5) || s16 === 8) this._bass(t, s16 === 8 && r() < 0.4 ? root + 7 : root, this.beat * (s16 === 0 ? 1.8 : 0.9), mix.bass * (s16 === 0 ? 1 : 0.7));
    }
    // arpeggio / sequence
    if (L.arp) {
      const a = this.plan.arp, per = 4 / M.arpRate * a.every;
      const go = a.shape === 'euclid' ? a.hits[s16] && s16 % a.every === 0 : s16 % per === 0;
      if (go) {
        const tones = []; for (let o = 0; o < a.octaves + 1; o++) for (const n of chord) tones.push(n + 12 + 12 * o);
        const i = a.shape === 'euclid' ? step : (step / per) | 0, N = tones.length;
        const idx = a.shape === 'up' ? i % N : a.shape === 'down' ? N - 1 - (i % N) : a.shape === 'updown' ? (() => { const k = i % (2 * N - 2 || 1); return k < N ? k : 2 * N - 2 - k; })() : a.pattern[i % 8] % N;
        this._arp(t, tones[idx], mix.arp * (s16 % 4 === 0 ? 1 : 0.7), (s16 % 8 < 4 ? -0.35 : 0.35));
      }
    }
    // glass motif (the tune): two bars of chord-tone steps on eighth notes
    if (L.glass && s16 % 2 === 0) {
      const slot = ((this.bar % 2) * 8 + s16 / 2) | 0, v = this.cur[slot];
      if (v != null) this._glass(t, chord[v % chord.length] + 12 + (v >= 3 ? 12 : 0), mix.glass);
    }
    // a slow lead: one long note every bar or two, gliding (alien) or bowed
    if (L.lead && s16 === 0 && this.bar % (this.mood === 'combat' ? 2 : 1) === 0 && r() < 0.75) {
      const v = this.cur[(this.bar * 3) % 16] ?? this.cur.find(x => x != null) ?? 0;
      this._lead(t, chord[v % chord.length] + 24 - (this.mood === 'alien' ? 0 : 12), this.beat * (this.mood === 'combat' ? 6 : 3.5), mix.lead);
    }
    this.m.notes++;
  }

  _bar(bar, t) {
    this.bar = bar;
    if (bar > 0 && bar % 8 === 0) {
      this.phraseNo++;
      if (this.phraseNo % 4 === 0) { this._newProg(); this.motif = makeMotif(this.r, this.mood === 'combat' ? 0.55 : 0.4); }
      if (this.phraseNo % 6 === 0 && this.r() < 0.6) {
        const [lo, hi] = this.M.root, span = hi - lo + 1;
        this.key = lo + ((this.key - lo + this.r.pick([5, 7, -2, 3, 2])) % span + span) % span; this.scale = this.r.pick(this.M.scales); this._newProg();
      }
      this.plan = planPhrase(this.r, this.mood, this.phraseNo, this.plan.section);
      this.cur = varyMotif(this.motif, this.plan.motifVar);
    }
    const ci = Math.floor(bar / this.M.barsPerChord) % this.prog.length, deg = this.prog[ci];
    this.chord = chordNotes(this.key + 12, this.scale, deg, this.r() < 0.4);
    if (bar % this.M.barsPerChord === 0) {
      const dur = this.beat * 4 * this.M.barsPerChord;
      this._pad(t, this.chord, dur, this.M.mix.pad * (this.plan.section === 'break' || this.plan.section === 'intro' ? 1.25 : 1));
      if (this.plan.layers.drone) this._drone(t, this.key - 12, dur, this.M.mix.drone);
    }
    if (this.plan.layers.swell && bar % 8 === 6) this._swell(t, this.beat * 8, this.M.mix.swell);   // rises into the next phrase
  }

  // ---------------------------------------------------------------- instruments
  _env(g, t, a, peak, d, sustain, rel, end) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    if (d) g.gain.setTargetAtTime(peak * sustain, t + a, d);
    g.gain.setTargetAtTime(0.0001, end, rel);
  }
  _voice(verb = 0, echo = 0, pan = 0) {
    const c = this.ctx, g = c.createGain();
    let tail = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    tail.connect(this.out);
    if (verb) { const s = c.createGain(); s.gain.value = verb; tail.connect(s).connect(this.sendVerb); }
    if (echo) { const s = c.createGain(); s.gain.value = echo; tail.connect(s).connect(this.sendEcho); }
    return g;
  }
  /** Wide pad: each chord note twice, detuned, one hard-ish left and one right, through a slowly breathing filter. */
  _pad(t, notes, dur, level) {
    const c = this.ctx, end = t + dur, stopAt = end + 4, cut = this.M.cutoff;
    for (const [side, det] of [[-0.7, -9], [0.7, 8]]) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(cut * 0.35, t); f.frequency.linearRampToValueAtTime(cut * (0.8 + this.r() * 0.4), t + dur * (0.4 + this.r() * 0.3)); f.frequency.linearRampToValueAtTime(cut * 0.4, end + 2);
      const g = this._voice(1, 0, side); f.connect(g);
      this._env(g, t, Math.min(2.5, dur * 0.35), level, 0, 1, 1.4, end);
      for (const n of notes) {
        const o = c.createOscillator(); o.type = this.M.padWave; o.frequency.value = hz(n); o.detune.value = det + (this.r() - 0.5) * 6;
        if (this.mood === 'alien') { o.detune.setValueAtTime(det, t); o.detune.linearRampToValueAtTime(det + (this.r() - 0.5) * 60, end); }
        const og = c.createGain(); og.gain.value = 1 / (notes.length * 2); o.connect(og).connect(f); o.start(t); o.stop(stopAt);
      }
    }
  }
  _drone(t, n, dur, level) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = this._voice(0.6);
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = hz(n); o2.frequency.value = hz(n) * 1.5 * (1 + (this.r() - 0.5) * 0.004);
    const g2 = c.createGain(); g2.gain.value = 0.3; o2.connect(g2).connect(f);
    f.type = 'lowpass'; f.frequency.value = 420; o.connect(f).connect(g);
    // a slow tremble (danger) or a slow swell (others)
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = this.mood === 'danger' ? 1.1 : 0.12; lg.gain.value = level * 0.35; lfo.connect(lg).connect(g.gain);
    this._env(g, t, Math.min(3, dur * 0.4), level, 0, 1, 1.6, t + dur);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 6); }
  }
  _bass(t, n, dur, level) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = this._voice();
    o.type = this.mood === 'alien' || this.mood === 'station' ? 'triangle' : 'sawtooth'; o2.type = 'sine'; o.frequency.value = hz(n); o2.frequency.value = hz(n - 12);
    const g2 = c.createGain(); g2.gain.value = 0.6; o2.connect(g2).connect(g);
    f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(this.mood === 'combat' ? 1300 : 700, t); f.frequency.setTargetAtTime(180, t, dur * 0.3);
    o.connect(f).connect(g); this._env(g, t, 0.01, level, 0.2, 0.7, 0.08, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.6); o2.stop(t + dur + 0.6);
  }
  _arp(t, n, level, pan) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = this._voice(0.35, 1, pan);
    o.type = this.mood === 'combat' || this.mood === 'danger' ? 'square' : 'sawtooth'; o2.type = 'sine'; o.frequency.value = hz(n); o2.frequency.value = hz(n + 12);
    const g2 = c.createGain(); g2.gain.value = 0.3; o2.connect(g2).connect(f);
    f.type = 'lowpass'; f.Q.value = 5; f.frequency.setValueAtTime(this.M.cutoff * 2.4, t); f.frequency.exponentialRampToValueAtTime(this.M.cutoff * 0.45, t + 0.18);
    o.connect(f).connect(g); this._env(g, t, 0.004, level, 0.05, 0.25, 0.07, t + 0.13);
    o.start(t); o2.start(t); o.stop(t + 0.7); o2.stop(t + 0.7);
  }
  /** Glass: an FM bell. Alien space uses an inharmonic ratio so it rings strange. */
  _glass(t, n, level) {
    const c = this.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = this._voice(0.9, 0.6, (this.r() - 0.5) * 0.8);
    const ratio = this.mood === 'alien' ? 1.414 : this.mood === 'station' ? 2 : 3.5;
    car.type = 'sine'; mod.type = 'sine'; car.frequency.value = hz(n); mod.frequency.value = hz(n) * ratio;
    mg.gain.setValueAtTime(hz(n) * (this.mood === 'station' ? 1.2 : 2), t); mg.gain.exponentialRampToValueAtTime(hz(n) * 0.04, t + 1.2);
    mod.connect(mg).connect(car.frequency); car.connect(g); this._env(g, t, 0.005, level, 0.3, 0.35, 0.5, t + 0.4);
    car.start(t); mod.start(t); car.stop(t + 3); mod.stop(t + 3);
  }
  /** A long lead note: a soft sine/triangle pair with slow vibrato; in alien space it glides up into the note. */
  _lead(t, n, dur, level) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = this._voice(1, 0.7, (this.r() - 0.5) * 0.6);
    o.type = 'sine'; o2.type = 'triangle';
    const f0 = hz(n), from = this.mood === 'alien' ? f0 * Math.pow(2, (this.r() < 0.5 ? -3 : 4) / 12) : f0;
    for (const [x, m] of [[o, 1], [o2, 1.003]]) { x.frequency.setValueAtTime(from * m, t); x.frequency.exponentialRampToValueAtTime(f0 * m, t + (this.mood === 'alien' ? dur * 0.4 : 0.06)); }
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 4.6; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f0 * 0.006, t + dur * 0.6); vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const g2 = c.createGain(); g2.gain.value = 0.35; o.connect(g); o2.connect(g2).connect(g);
    this._env(g, t, Math.min(0.8, dur * 0.25), level, 0, 1, 0.6, t + dur);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + 3); }
  }
  /** Filtered noise rising over two bars into the next phrase (a reverse swell). */
  _swell(t, dur, level) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = this._voice(1.2);
    s.buffer = this.m.noise; s.loop = true; f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(this.mood === 'alien' ? 5000 : 3200, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + dur * 0.97); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    s.connect(f).connect(g); s.start(t); s.stop(t + dur + 0.2);
  }
  _kick(t, level) {
    const c = this.ctx, o = c.createOscillator(), g = this._voice(this.mood === 'combat' ? 0 : 0.25);
    o.type = 'sine'; o.frequency.setValueAtTime(this.mood === 'combat' ? 150 : 110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (this.mood === 'combat' ? 0.35 : 0.6));
    o.connect(g); o.start(t); o.stop(t + 0.65);
  }
  _rim(t, level) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = this._voice(0.8, 0.4, 0.25);
    o.type = 'square'; o.frequency.value = 1750; f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 4;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(f).connect(g); o.start(t); o.stop(t + 0.07);
  }
  _noiseHit(t, level, type, freq, len, verb = 0.15, pan = 0, q = 0.7) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = this._voice(verb, 0, pan);
    s.buffer = this.m.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }
  _hat(t, level) { this._noiseHit(t, level, 'highpass', 7600, 0.04, 0.1, -0.3); }
  _shaker(t, level) { this._noiseHit(t, level, 'bandpass', 5200, 0.08, 0.3, 0.35, 1.2); }
  _snare(t, level) {
    this._noiseHit(t, level, 'bandpass', 1800, 0.22, 1, 0, 0.6);
    const c = this.ctx, o = c.createOscillator(), og = this._voice(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    og.gain.setValueAtTime(level * 0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); o.start(t); o.stop(t + 0.12);
  }
  _tom(t, level, f0) {
    const c = this.ctx, o = c.createOscillator(), g = this._voice(0.5, 0, (f0 - 70) / 60);
    o.type = 'sine'; o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.08);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); o.start(t); o.stop(t + 0.32);
  }
  /** A deep sub hit with a long tail — the "big ship" accent at the top of a combat phrase. */
  _sub(t, level) {
    const c = this.ctx, o = c.createOscillator(), g = this._voice(0.6);
    o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(g); o.start(t); o.stop(t + 1.7);
    this._noiseHit(t, level * 0.25, 'lowpass', 600, 0.9, 0.8);
  }
}
