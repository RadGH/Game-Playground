// Node tests for the bespoke formant engine: g2p (dictionary, derivations, rules, phoneme blocks), prosody/tracks, synth spectra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToPhonemes, loadDictionary, addPronunciation, espeakToArpabet, normalize, assignStress } from '../js/engines/formant/g2p.js';
import { lettersToPhones } from '../js/engines/formant/rules.js';
import { buildFrames } from '../js/engines/formant/tracks.js';
import { synthesize, SR } from '../js/engines/formant/synth.js';
import { PHONEMES } from '../js/engines/formant/phonemes.js';
await loadDictionary();
const ph = t => textToPhonemes(t).words.map(w => w.phones.join(' '));

test('dictionary words', () => {
  assert.deepEqual(ph('hello world'), ['HH AH0 L OW1', 'W ER1 L D']);
  assert.equal(textToPhonemes('goblin').words[0].source, 'dict');
});
test('derivations: plurals, possessives, -ed, -ing, -ly', () => {
  assert.deepEqual(ph("goblins Thalen's"), ['G AA1 B L IH0 N Z', 'TH EY1 L AH0 N Z']);
  assert.equal(textToPhonemes('gloomcaps').words[0].source, 'rules');
  assert.deepEqual(ph('walked wanted'), ['W AO1 K T', 'W AO1 N T IH0 D']);
  assert.deepEqual(ph('hunting'), ['HH AH1 N T IH0 NG']);
});
test('letter-to-sound rules on invented names produce plausible phones with one primary stress', () => {
  for (const name of ['Kaelith', 'Thalen', 'Vessari', 'Greyharbor', 'Frostspine', 'Zorbax', 'Mira']) {
    const w = textToPhonemes(name).words[0]; assert.ok(w.phones.length >= 3, name + ': ' + w.phones.join(' ')); assert.equal(w.phones.filter(p => /1$/.test(p)).length, 1, name + ' stress: ' + w.phones.join(' '));
    for (const p of w.phones) assert.ok(PHONEMES[p.replace(/\d$/, '')], name + ' unknown phone ' + p);
  }
  assert.deepEqual(lettersToPhones('thalen'), ['TH', 'EY', 'L', 'AH', 'N']);
  assert.deepEqual(lettersToPhones('kaelith').slice(0, 2), ['K', 'EY']);
});
test('custom pronunciations override, espeak and ARPAbet phoneme blocks are accepted', () => {
  addPronunciation('kaelith', 'K EY1 L IH0 TH');
  assert.deepEqual(ph('Kaelith'), ['K EY1 L IH0 TH']);
  assert.deepEqual(ph("[[h@l'oU]] there"), ['HH AH0 L OW1', 'DH EH1 R']);
  assert.deepEqual(ph('[[K EY1 L IH0 TH]]'), ['K EY1 L IH0 TH']);
  assert.deepEqual(espeakToArpabet("'TeIlen"), ['TH', 'EY1', 'L', 'EH0', 'N']);
});
test('normalization: numbers, punctuation, abbreviations', () => {
  assert.equal(normalize('Mr. Smith owes 42 coins.'), 'mister . Smith owes forty two coins.'.replace('mister . ', 'mister . '));
  const r = textToPhonemes('Two hundred, three hundred. Really?'); assert.equal(r.words[1].punct, ','); assert.equal(r.words[3].punct, '.'); assert.equal(r.words[4].punct, '?');
  assert.deepEqual(assignStress(['K', 'AE', 'T']), ['K', 'AE1', 'T']);
});
test('tracks: durations scale with speed, stressed vowels longer than unstressed, question rises at the end', () => {
  const w = textToPhonemes('Is anyone there?').words;
  const a = buildFrames(w, { f0: 110, speed: 1 }), b = buildFrames(w, { f0: 110, speed: 2 });
  assert.ok(b.frames.length < a.frames.length * 0.7);
  const s = buildFrames(textToPhonemes('banana').words, { speed: 1 }).segs.filter(x => x.vowel); assert.ok(s[1].dur > s[0].dur && s[1].dur > s[2].dur, 'stressed middle vowel longest');
  const voiced = a.frames.filter(f => f.av > 0.5); const early = voiced[Math.floor(voiced.length * 0.6)].f0, late = voiced[voiced.length - 2].f0; assert.ok(late > early * 1.1, `question should rise: ${early} → ${late}`);
  const st = buildFrames(textToPhonemes('Is anyone there.').words, { f0: 110, speed: 1 }).frames.filter(f => f.av > 0.5); assert.ok(st[st.length - 2].f0 < st[Math.floor(st.length * 0.3)].f0, 'statement should fall');
});
// spectral helpers
function spectrumPeak(samples, lo, hi) { const N = 2048; let best = 0, bestF = 0; for (let f = lo; f <= hi; f += 25) { let re = 0, im = 0; for (let n = 0; n < N; n++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N); re += samples[n] * w * Math.cos(2 * Math.PI * f * n / SR); im -= samples[n] * w * Math.sin(2 * Math.PI * f * n / SR); } const mag = re * re + im * im; if (mag > best) { best = mag; bestF = f; } } return bestF; }
function bandEnergy(samples, lo, hi) { let e = 0; for (let f = lo; f <= hi; f += 200) { let re = 0, im = 0; for (let n = 0; n < 1024; n++) { re += samples[n] * Math.cos(2 * Math.PI * f * n / SR); im -= samples[n] * Math.sin(2 * Math.PI * f * n / SR); } e += re * re + im * im; } return e; }
function render(text, opts = {}) { const w = textToPhonemes(text).words; const { frames } = buildFrames(w, { f0: 110, speed: 1, ...opts }); return synthesize(frames, { jitter: 0, shimmer: 0, flutter: 0 }); }
test('synth: a sustained vowel shows its formants; S has high-frequency energy; output is finite and normalized', () => {
  const iy = render('[[IY1]]'), aa = render('[[AA1]]'); const mid = s => s.subarray(Math.floor(s.length * 0.35));
  const iyF2 = spectrumPeak(mid(iy), 1800, 2700), aaF1 = spectrumPeak(mid(aa), 400, 1000);
  assert.ok(iyF2 > 1900 && iyF2 < 2700, 'IY F2 ≈ 2290, got ' + iyF2); assert.ok(aaF1 > 550 && aaF1 < 950, 'AA F1 ≈ 730, got ' + aaF1);
  const s = render('[[S]]'); const hi = bandEnergy(s.subarray(400), 4000, 8000), lo = bandEnergy(s.subarray(400), 200, 1500); assert.ok(hi > lo * 3, 'S should be mostly high-frequency');
  const all = render('The quick brown fox jumps over the lazy dog.'); let peak = 0; for (const x of all) { assert.ok(Number.isFinite(x)); peak = Math.max(peak, Math.abs(x)); } assert.ok(peak > 0.5 && peak <= 0.95);
});
test('synth: formant scale moves formants, f0 follows the pitch parameter', () => {
  const small = render('[[AA1]]', { formantScale: 1.25 }), big = render('[[AA1]]', { formantScale: 0.8 }); const mid = s => s.subarray(Math.floor(s.length * 0.35));
  assert.ok(spectrumPeak(mid(small), 400, 1200) > spectrumPeak(mid(big), 400, 1200));
  const lowV = render('[[AA1]]', { f0: 90 }), highV = render('[[AA1]]', { f0: 220 });
  // normalized autocorrelation, first strong peak (avoids picking a formant period)
  const f0of = raw => { const lp = new Float32Array(raw.length); let acc = 0; const W = 48; for (let i = 0; i < raw.length; i++) { acc += raw[i] - (i >= W ? raw[i - W] : 0); lp[i] = acc / W; } const s = lp; const seg = s.subarray(Math.floor(s.length * 0.3), Math.floor(s.length * 0.3) + 3000); const minLag = Math.floor(SR / 500), maxLag = Math.floor(SR / 50); let e = 0; for (let i = 0; i < seg.length; i++) e += seg[i] * seg[i]; const r = new Float32Array(maxLag + 1); for (let lag = minLag; lag <= maxLag; lag++) { let c = 0; for (let i = 0; i < seg.length - lag; i++) c += seg[i] * seg[i + lag]; r[lag] = c / e; } let max = 0; for (let lag = minLag; lag <= maxLag; lag++) max = Math.max(max, r[lag]); for (let lag = minLag + 1; lag < maxLag; lag++) if (r[lag] > 0.6 * max && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) return SR / lag; return 0; };
  const fl = f0of(lowV), fh = f0of(highV); assert.ok(fl > 75 && fl < 115, 'low f0 ' + fl); assert.ok(fh > 190 && fh < 260, 'high f0 ' + fh);
});
