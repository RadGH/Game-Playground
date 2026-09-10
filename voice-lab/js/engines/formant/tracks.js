// Phonemes → synthesizer frames. Handles durations (stress, phrase-final lengthening, speed), the pitch contour
// (declination, accents on stressed syllables, final fall / question rise, pauses) and the parameter tracks with
// coarticulation: formants glide between anchor points (two per vowel, one per consonant locus), amplitudes ramp,
// stops get closure + burst + aspiration, affricates a burst + frication tail.
import { PHONEMES, isVowel, stripStress, stressOf } from './phonemes.js';
import { FRAME_MS } from './synth.js';

const ms2f = ms => Math.max(1, Math.round(ms / FRAME_MS));

/**
 * opts: { f0 (Hz base), speed (1 = normal; >1 faster), formantScale (1 = adult male), intonation (0..1.5),
 *         breath 0..1, tone 0..1, wordGapMs, pauseScale }
 */
export function buildFrames(words, opts = {}) {
  const speed = opts.speed ?? 1, fs = opts.formantScale ?? 1, f0base = opts.f0 ?? 110, into = opts.intonation ?? 0.8, breath = opts.breath ?? 0, tone = opts.tone ?? 0.5;
  // ---- 1. segments with durations
  const segs = []; // { ph, def, dur(ms), stress, wordEnd, punct, vowel }
  words.forEach((w, wi) => {
    const last = wi === words.length - 1; const nVow = w.phones.filter(isVowel).length;
    w.phones.forEach((p, pi) => {
      const base = stripStress(p), def = PHONEMES[base]; if (!def) return;
      const stress = stressOf(p), isV = isVowel(p);
      let dur = def.dur;
      if (isV) { if (stress === 0) dur *= 0.62; else if (stress === 2) dur *= 0.85; if (nVow === 1 && stress >= 1) dur *= 1.1; }
      const finalInWord = pi === w.phones.length - 1;
      if (finalInWord && (w.punct || last)) dur *= isV ? 1.35 : 1.25;   // phrase-final lengthening
      else if (finalInWord) dur *= 1.08;
      if (def.cls === 'stop' || def.cls === 'affr') { const onset = pi < w.phones.length - 1 && isVowel(w.phones[pi + 1] || ''); dur = def.closure + def.burstDur + (def.cls === 'affr' ? def.fricDur : (def.voiced ? def.asp : (onset && stressOf(w.phones[pi + 1]) >= 1 ? def.asp : def.asp * 0.4))); }
      segs.push({ ph: base, def, dur: dur / speed, stress, wordEnd: finalInWord, punct: finalInWord ? w.punct : '', vowel: isV, word: w.text });
    });
    // pause after punctuation / small gap between words
    const gap = (w.punct === '.' || w.punct === '!' || w.punct === '?' ? 380 : w.punct === ';' ? 260 : w.punct === ',' ? 170 : last ? 60 : 14) + (opts.wordGapMs || 0);
    if (gap > 0) segs.push({ ph: '_', def: null, dur: gap / Math.sqrt(speed), stress: -1, wordEnd: true, punct: w.punct, vowel: false, pause: true });
  });
  // ---- 2. pitch contour: phrases split at pauses ≥ comma; declination top→bottom, accent bumps, final movement
  const total = segs.reduce((a, s) => a + s.dur, 0); let t = 0;
  const phrases = []; let cur = { start: 0, segs: [] };
  // phrase.end = end of the last spoken segment (pauses excluded), so final falls/rises land on the last syllable
  for (const s of segs) { cur.segs.push(s); s.t0 = t; t += s.dur; s.t1 = t; if (!s.pause) cur.end = t; if (s.pause && s.punct) { cur.punct = s.punct; cur.pauseEnd = t; phrases.push(cur); cur = { start: t, segs: [] }; } }
  if (cur.segs.length) { cur.end = cur.end ?? t; cur.pauseEnd = t; cur.punct = cur.segs[cur.segs.length - 1].punct || '.'; phrases.push(cur); }
  const f0At = (time) => {
    const ph = phrases.find(p => time >= p.start && time <= p.pauseEnd) || phrases[phrases.length - 1]; const len = Math.max(1, ph.end - ph.start), x = Math.min(1, (time - ph.start) / len);
    let f = f0base * (1 + into * (0.18 - 0.28 * x));          // declination: +18% → −10%
    // accents: hat on each stressed vowel (rise into it, fall after)
    for (const s of ph.segs) { if (!s.vowel || s.stress !== 1) continue; const c = (s.t0 + s.t1) / 2, w = Math.max(160, s.dur) * 2.2; const d = Math.abs(time - c) / w; if (d < 1) f *= 1 + into * 0.12 * 0.5 * (1 + Math.cos(Math.PI * d)); }  // smooth cosine hat
    // final movement over the last 35% of the phrase
    if (x > 0.65) { const k = (x - 0.65) / 0.35; if (ph.punct === '?') f *= 1 + into * 0.55 * k * k; else if (ph.punct === ',' || ph.punct === ';') f *= 1 + into * 0.06 * k; else f *= 1 - into * 0.22 * k; }
    return f;
  };
  // ---- 3. anchor points for formants (coarticulation targets)
  const anchors = []; // { t, F: [F1,F2,F3], B: [..] }
  let prevVowelF = null;
  for (const s of segs) {
    if (s.pause) continue;
    const d = s.def;
    if (s.vowel) {
      const F = d.f, F2 = d.f2 || d.f, a = s.t0 + s.dur * 0.3, b = s.t0 + s.dur * (d.diph ? 0.8 : 0.7);
      anchors.push({ t: a, F, B: d.bw }); anchors.push({ t: b, F: F2, B: d.bw }); prevVowelF = F2;
    } else if (d.locus) { // consonant: one anchor at its centre at the locus (or its own formants for sonorants)
      const F = d.f || d.locus; anchors.push({ t: (s.t0 + s.t1) / 2, F, B: d.bw || [100, 150, 200] });
    } else if (d.cls === 'asp') { // HH takes the shape of the following vowel (handled by neighbours)
    }
  }
  if (!anchors.length) anchors.push({ t: 0, F: [500, 1500, 2500], B: [80, 110, 180] });
  const formantsAt = (time) => {
    let i = 0; while (i < anchors.length - 1 && anchors[i + 1].t < time) i++;
    const a = anchors[i], b = anchors[Math.min(anchors.length - 1, i + 1)];
    if (time <= a.t || a === b) return { F: a.F, B: a.B }; if (time >= b.t) return { F: b.F, B: b.B };
    const k = (time - a.t) / (b.t - a.t), kk = k * k * (3 - 2 * k); // smoothstep
    return { F: a.F.map((v, j) => v + (b.F[j] - v) * kk), B: a.B.map((v, j) => v + (b.B[j] - v) * kk) };
  };
  // ---- 4. frames
  const frames = []; const nFrames = Math.ceil(total / FRAME_MS);
  const RAMP = 12; // ms amplitude ramp at segment edges
  for (let fi = 0; fi < nFrames; fi++) {
    const time = (fi + 0.5) * FRAME_MS; const s = segs.find(x => time >= x.t0 && time < x.t1) || segs[segs.length - 1];
    const { F, B } = formantsAt(time);
    const fr = { f0: f0At(time), av: 0, ah: 0, af: 0, F1: F[0] * fs, F2: F[1] * fs, F3: F[2] * fs, B1: B[0], B2: B[1], B3: B[2], nasal: 0, bands: null, bypass: 0, tilt: 0.05 + (1 - tone) * 0.45 + breath * 0.2 };
    if (!s.pause) {
      const d = s.def, into_ = Math.min(1, (time - s.t0) / RAMP), out_ = Math.min(1, (s.t1 - time) / RAMP), env = Math.min(into_, out_);
      const cls = d.cls;
      if (cls === 'vowel' || cls === 'diph') { fr.av = (s.stress >= 1 ? 1 : 0.8) * env; fr.ah = breath * 0.35; }
      else if (cls === 'nasal') { fr.av = d.av * env; fr.nasal = 1; }
      else if (cls === 'liquid' || cls === 'glide') { fr.av = d.av * env; }
      else if (cls === 'asp') { fr.ah = d.ah * env; fr.av = 0; fr.tilt = 0.6; }
      else if (cls === 'fric') { fr.af = d.af * env; fr.av = (d.av || 0) * env; fr.bands = d.bands.map(b => [b[0] * fs, b[1], b[2]]); fr.bypass = d.bypass; }
      else if (cls === 'stop' || cls === 'affr') {
        const rel = (time - s.t0) * speed; // ms into the stop at normal speed
        if (rel < d.closure) { fr.av = d.voiced ? 0.25 : 0; fr.F1 = 180 * fs; fr.B1 = 150; }   // closure (voice bar for voiced)
        else if (rel < d.closure + d.burstDur) { fr.af = 1; fr.bands = d.burst.map(b => [b[0] * fs, b[1], b[2]]); fr.bypass = 0.15; fr.av = d.voiced ? 0.25 : 0; }
        else if (cls === 'affr') { const f = PHONEMES[d.fric]; fr.af = f.af * env; fr.bands = f.bands.map(b => [b[0] * fs, b[1], b[2]]); fr.bypass = f.bypass; fr.av = (f.av || 0); }
        else { const k = (rel - d.closure - d.burstDur) / Math.max(1, d.asp); fr.ah = d.voiced ? 0.15 : 0.7 * (1 - k * 0.5); fr.av = d.voiced ? 0.6 + 0.4 * k : 0.15 * k; fr.tilt = 0.5; }
      }
      // nasalize vowels next to nasals a little
      if (s.vowel) { const idx = segs.indexOf(s); for (const nb of [segs[idx - 1], segs[idx + 1]]) if (nb?.def?.cls === 'nasal') fr.nasal = Math.max(fr.nasal, 0.35); }
    }
    frames.push(fr);
  }
  return { frames, segs, phrases };
}
