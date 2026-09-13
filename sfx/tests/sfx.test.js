// Node tests for the parts of the sfx library that do not need a browser: catalog completeness,
// per-method coverage, and the loudness/normalization maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyze, normalizeGain, normalize, applyGain, softLimit, loopify, dbToGain, gainToDb } from '../js/loudness.js';
import * as synth from '../js/methods/synth.js';
import * as library from '../js/methods/library.js';
import * as hybrid from '../js/methods/hybrid.js';
import * as retro from '../js/methods/retro.js';
import { METHODS, METHOD_ORDER, methodList } from '../js/sfx.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const catalog = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'catalog.json'), 'utf8'));
const ids = new Set(catalog.sounds.map(s => s.id));

/** The element and status tables straight out of spellfx.js, without importing three.js. */
function spellfxTables() {
  const src = fs.readFileSync(path.join(ROOT, 'avatar-3d', 'js', 'spellfx.js'), 'utf8');
  const grab = name => {
    const start = src.indexOf(`export const ${name} = {`);
    assert.ok(start >= 0, `${name} not found in spellfx.js`);
    const body = src.slice(start, src.indexOf('\n};', start));
    return [...body.matchAll(/^\s{2}([a-z]+):\s*\{/gm)].map(m => m[1]);
  };
  return { elements: grab('ELEMENTS'), statuses: grab('STATUS_FX') };
}

test('the catalog covers every element and status that spellfx can draw', () => {
  const { elements, statuses } = spellfxTables();
  assert.ok(elements.length >= 11, 'expected at least 11 elements, saw ' + elements.length);
  assert.ok(statuses.length >= 20, 'expected at least 20 statuses, saw ' + statuses.length);
  for (const el of elements) {
    for (const phase of ['launch', 'travel', 'impact']) {
      assert.ok(ids.has(`spell.${el}.${phase}`), `missing spell.${el}.${phase}`);
    }
  }
  for (const st of statuses) {
    assert.ok(ids.has(`status.${st}.apply`), `missing status.${st}.apply`);
    assert.ok(ids.has(`status.${st}.tick`), `missing status.${st}.tick`);
  }
  // and nothing extra that spellfx would never ask for
  for (const s of catalog.sounds) {
    const m = /^spell\.([a-z]+)\./.exec(s.id);
    if (m) assert.ok(elements.includes(m[1]), `catalog has spell element "${m[1]}" that spellfx does not`);
    const ms = /^status\.([a-z]+)\./.exec(s.id);
    if (ms) assert.ok(statuses.includes(ms[1]), `catalog has status "${ms[1]}" that spellfx does not`);
  }
});

test('the catalog covers the rest of the game vocabulary', () => {
  const want = [
    'cast.start', 'heal', 'revive',
    'melee.swing', 'melee.hit', 'melee.crit', 'melee.miss', 'melee.block',
    'death.humanoid', 'death.beast', 'death.construct',
    'levelup', 'quest.complete', 'night.ambush', 'coin', 'equip', 'camp.fire', 'travel.step',
    'ui.click', 'ui.hover', 'ui.tab', 'ui.open', 'ui.close',
  ];
  for (const id of want) assert.ok(ids.has(id), 'missing ' + id);
  for (const r of catalog.rarities) assert.ok(ids.has('loot.' + r), 'missing loot.' + r);
  for (const a of catalog.ambiences) assert.ok(ids.has('ambience.' + a), 'missing ambience.' + a);
  // Emberveil's four rarities and the Item Vault's five are both in there
  for (const r of ['normal', 'magic', 'rare', 'legendary', 'common', 'uncommon', 'epic']) {
    assert.ok(ids.has('loot.' + r), 'missing loot.' + r);
  }
});

test('every sound is well formed and belongs to a category with a loudness target', () => {
  const seen = new Set();
  for (const s of catalog.sounds) {
    assert.ok(!seen.has(s.id), 'duplicate id ' + s.id);
    seen.add(s.id);
    assert.ok(s.label && s.label.length, s.id + ' has no label');
    const cat = catalog.categories[s.category];
    assert.ok(cat, s.id + ' has unknown category ' + s.category);
    assert.ok(cat.target < 0 && cat.target > -50, s.id + ' category target out of range');
    assert.ok(['sfx', 'ui', 'ambience'].includes(cat.bus), s.id + ' bad bus');
    assert.equal(typeof s.loop, 'boolean');
    assert.ok(Math.abs(s.trim) <= 12, s.id + ' trim looks wrong: ' + s.trim);
  }
  assert.ok(catalog.peakCeilingDb <= 0 && catalog.peakCeilingDb >= -6);
  // loudest categories should be the ones a fight needs to punch through
  assert.ok(catalog.categories.impact.target > catalog.categories.ui.target, 'impacts should be louder than the interface');
  assert.ok(catalog.categories.ui.target > catalog.categories.ambience.target, 'the interface should be louder than ambience');
});

test('every method either maps every id or falls back to one that does', () => {
  for (const s of catalog.sounds) {
    assert.ok(synth.has(s), 'synth cannot make ' + s.id);
    assert.ok(retro.has(s), 'retro cannot make ' + s.id);
    assert.ok(hybrid.has(s), 'hybrid cannot make ' + s.id);
    const src = hybrid.sourceFor(s);
    assert.equal(src, library.has(s) ? 'library' : 'synth');
  }
  const withSamples = catalog.sounds.filter(library.has);
  assert.ok(withSamples.length >= 30, 'expected the sample pack to cover at least 30 ids, saw ' + withSamples.length);
  assert.ok(withSamples.length < catalog.sounds.length, 'the sample pack should not claim to cover everything');
});

test('every mapped sample file actually exists on disk', () => {
  for (const s of catalog.sounds) {
    if (!library.has(s)) continue;
    for (const f of s.library.files) {
      const p = path.join(HERE, '..', 'assets', f);
      assert.ok(fs.existsSync(p), 'missing sample file ' + f + ' for ' + s.id);
    }
    const [lo, hi] = s.library.pitch;
    assert.ok(lo > 0.5 && hi < 2 && lo < hi, s.id + ' pitch range looks wrong');
  }
});

test('synth layer recipes only use layer types the renderer knows', () => {
  const known = new Set(['noise', 'tone', 'fm', 'pluck', 'grain', 'chord', 'drone']);
  for (const s of catalog.sounds) {
    assert.ok(s.synth.dur > 0 && s.synth.dur <= 5, s.id + ' odd duration ' + s.synth.dur);
    for (const l of s.synth.layers) {
      assert.ok(known.has(l.type), s.id + ' uses unknown layer type ' + l.type);
      if (l.filter) {
        assert.ok(l.filter.f0 > 0 && l.filter.f0 < 22050, s.id + ' filter f0 out of range');
        assert.ok(l.filter.f1 > 0 && l.filter.f1 < 22050, s.id + ' filter f1 out of range');
      }
      if (l.type === 'tone' || l.type === 'fm') assert.ok(l.f0 > 0, s.id + ' f0 must be positive for an exponential sweep');
      if (l.type === 'chord') assert.ok(l.freqs.length && l.freqs.every(f => f > 0), s.id + ' bad chord');
    }
    // a loop must be long enough to cross-fade without eating itself
    if (s.loop) assert.ok(s.synth.dur >= 1, s.id + ' loops but is only ' + s.synth.dur + 's');
  }
});

test('retro builds a playable pattern for every id, chip channels only', () => {
  for (const s of catalog.sounds) {
    const p = retro.patternFor(s);
    assert.ok(p.steps.length >= 1, s.id + ' has no retro steps');
    assert.ok(['square', 'triangle', 'noise'].includes(p.wave), s.id + ' retro wave ' + p.wave);
    for (const st of p.steps) {
      assert.ok(Number.isFinite(st.n) && st.d > 0 && st.t >= 0, s.id + ' bad retro step');
    }
    assert.equal(p.loop, s.loop);
  }
  // the same id always lands on the same note
  const a = retro.patternFor(catalog.sounds[0]), b = retro.patternFor(catalog.sounds[0]);
  assert.deepEqual(a.steps, b.steps);
});

test('each method declares a licence and honest pros and cons', () => {
  const list = methodList();
  assert.equal(list.length, METHOD_ORDER.length);
  for (const m of list) {
    assert.ok(METHODS[m.id], 'method ' + m.id + ' is not registered');
    assert.ok(m.name && m.license && m.badge, m.id + ' is missing its badge or licence');
    assert.ok(m.pros.length >= 2 && m.cons.length >= 2, m.id + ' needs at least two pros and two cons');
  }
  assert.ok(list.find(m => m.id === 'library').license.includes('CC0'));
});

// ---- loudness maths -------------------------------------------------------------------------

/** A sine at a known amplitude: RMS is amplitude/sqrt(2), so the numbers are checkable by hand. */
function sine(amp, seconds = 1, freq = 1000, sr = 48000) {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
  return out;
}

test('analyze measures peak and RMS the way the maths says it should', () => {
  const m = analyze(sine(0.5), 48000);
  assert.ok(Math.abs(m.peak - 0.5) < 0.01, 'peak ' + m.peak);
  assert.ok(Math.abs(m.rms - 0.5 / Math.SQRT2) < 0.005, 'rms ' + m.rms);
  assert.ok(Math.abs(m.peakDb - gainToDb(0.5)) < 0.1);
  assert.ok(Math.abs(m.dur - 1) < 1e-6);
  assert.equal(m.silent, false);
  // a 1 kHz tone sits in the K-weighting's flat-ish region, so LUFS lands near the RMS level
  assert.ok(Math.abs(m.lufs - m.rmsDb) < 4, `lufs ${m.lufs} vs rms ${m.rmsDb}`);
});

test('analyze flags silence and rejects a broken buffer', () => {
  assert.equal(analyze(new Float32Array(1000), 48000).silent, true);
  assert.equal(analyze(new Float32Array(0), 48000).silent, true);
  const bad = sine(0.5, 0.1); bad[10] = NaN;
  assert.throws(() => analyze(bad, 48000), /not finite/);
});

test('halving the amplitude drops the measured loudness by 6 dB', () => {
  const loud = analyze(sine(0.8, 0.5), 48000);
  const quiet = analyze(sine(0.4, 0.5), 48000);
  assert.ok(Math.abs((loud.lufs - quiet.lufs) - 6.02) < 0.15, `${loud.lufs} vs ${quiet.lufs}`);
});

test('normalization lands clips 40 dB apart on the same target', () => {
  const target = -19;
  for (const amp of [0.01, 0.05, 0.3, 0.95]) {
    const s = sine(amp, 0.6);
    const r = normalize(s, 48000, { target, ceiling: -1 });
    const check = analyze(r.samples, 48000);
    assert.ok(Math.abs(check.lufs - target) < 0.6,
      `amp ${amp}: landed at ${check.lufs.toFixed(1)} LUFS instead of ${target}`);
    assert.ok(check.peakDb <= -0.9, `amp ${amp}: peak ${check.peakDb} passed the ceiling`);
    assert.ok(Math.abs(check.lufs - r.after.lufs) < 0.01, 'the reported after-level is the measured one');
    assert.ok(r.samples.every(Number.isFinite));
  }
});

test('a peaky clip still reaches its target — the soft ceiling eats the spike', () => {
  // a single full-scale click over a quiet body: quiet on average, peaking at 0 dBFS
  const s = new Float32Array(48000);
  for (let i = 0; i < s.length; i++) s[i] = 0.1 * Math.sin(2 * Math.PI * 400 * i / 48000);
  for (let i = 100; i < 130; i++) s[i] = 0.999;   // one 0 dBFS spike in an otherwise -20 dBFS clip
  const r = normalize(s, 48000, { target: -16, ceiling: -1 });
  const after = analyze(r.samples, 48000);
  assert.ok(after.peakDb <= -0.9, 'peak ' + after.peakDb + ' passed the ceiling');
  assert.ok(Math.abs(after.lufs - -16) < 1.5, 'body landed at ' + after.lufs.toFixed(1));
  assert.ok(r.limitedDb > 0, 'the limiter should have done some work here');
});

test('the soft ceiling never exceeds the ceiling and leaves quiet samples alone', () => {
  const s = new Float32Array([0, 0.1, -0.2, 0.4, 0.95, -1.6, 3.0, -0.05]);
  const out = softLimit(s, -1, 6);
  for (let i = 0; i < out.length; i++) assert.ok(Math.abs(out[i]) <= dbToGain(-1) + 1e-6, 'sample ' + i + ' = ' + out[i]);
  const knee = dbToGain(-7);
  for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) <= knee) assert.equal(out[i], s[i], 'quiet sample ' + i + ' should pass through');
  for (let i = 0; i < s.length; i++) assert.equal(Math.sign(out[i]), Math.sign(s[i]), 'sign flipped at ' + i);
});

test('gain is backed off rather than crushing a clip more than maxLimitDb', () => {
  const s = new Float32Array(48000);
  for (let i = 0; i < s.length; i++) s[i] = 0.002 * Math.sin(2 * Math.PI * 400 * i / 48000);
  s[50] = 0.999;                       // 54 dB of crest factor
  const r = normalize(s, 48000, { target: -10, ceiling: -1, maxLimitDb: 6 });
  assert.ok(r.limitedDb <= 6.01, 'limiter asked for ' + r.limitedDb + ' dB');
  assert.ok(analyze(r.samples, 48000).peakDb <= -0.9);
});

test('the trim column shifts the result by exactly that many dB', () => {
  const s = sine(0.2, 0.5);
  const a = normalize(s, 48000, { target: -20, ceiling: -1, trim: 0 });
  const b = normalize(s, 48000, { target: -20, ceiling: -1, trim: -6 });
  assert.ok(Math.abs((a.gainDb - b.gainDb) - 6) < 0.01, `${a.gainDb} vs ${b.gainDb}`);
  assert.equal(b.aim, -26);
  assert.ok(Math.abs(analyze(b.samples, 48000).lufs - -26) < 0.6);
});

test('a silent clip gets no gain instead of an infinite one', () => {
  const r = normalize(new Float32Array(4800), 48000, { target: -19 });
  assert.equal(r.gain, 0);
  assert.equal(r.samples.length, 4800);
  assert.equal(normalizeGain(null), 0);
});

test('boost and cut are clamped, so a near-silent clip is not multiplied by a thousand', () => {
  const g = normalizeGain({ lufs: -80, peakDb: -75, silent: false }, { target: -19, ceiling: -1, maxBoostDb: 24 });
  assert.ok(Math.abs(gainToDb(g) - 24) < 0.01, 'boost should stop at 24 dB, got ' + gainToDb(g));
  const cut = normalizeGain({ lufs: 6, peakDb: -2, silent: false }, { target: -19, ceiling: -1, maxCutDb: -24 });
  assert.ok(Math.abs(gainToDb(cut) - -24) < 0.01, 'cut should stop at -24 dB, got ' + gainToDb(cut));
});

test('dbToGain and gainToDb are inverses', () => {
  for (const db of [-40, -18, -6, 0, 6]) assert.ok(Math.abs(gainToDb(dbToGain(db)) - db) < 1e-9);
});

test('loopify makes the end of a loop match its start', () => {
  const sr = 48000;
  const n = sr * 2;
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = 0.4 * Math.sin(2 * Math.PI * 3.3 * i / sr) + 0.1 * (i / n); // drifting, so raw looping would click
  const looped = loopify(s, sr, 0.25);
  assert.equal(looped.length, n - Math.floor(0.25 * sr));
  const jump = Math.abs(looped[0] - looped[looped.length - 1]);
  const rawJump = Math.abs(s[0] - s[n - 1]);
  assert.ok(jump <= rawJump + 0.02, `loop seam ${jump} should not be worse than the raw one ${rawJump}`);
  assert.ok(looped.every(Number.isFinite));
});

test('a seeded synth rng repeats and different seeds diverge', () => {
  const a = synth.rngFrom(7), b = synth.rngFrom(7), c = synth.rngFrom(8);
  const A = [a(), a(), a()], B = [b(), b(), b()], C = [c(), c(), c()];
  assert.deepEqual(A, B);
  assert.notDeepEqual(A, C);
  assert.ok(A.every(v => v >= 0 && v < 1));
});

test('library picks a file deterministically from the seed and spreads across variants', () => {
  const entry = catalog.sounds.find(s => s.id === 'ui.click');
  assert.ok(library.has(entry));
  assert.equal(library.fileFor(entry, 3), library.fileFor(entry, 3));
  const picked = new Set([0, 1, 2, 3, 4].map(i => library.fileFor(entry, i)));
  assert.ok(picked.size >= 3, 'seeds should reach several of the mapped files');
});

test('analyze and normalize also take an AudioBuffer straight from Web Audio', () => {
  const data = sine(0.3, 0.5, 1000, 44100);
  const fakeBuffer = { sampleRate: 44100, length: data.length, numberOfChannels: 1, getChannelData: () => data };
  const direct = analyze(data, 44100);
  const viaBuffer = analyze(fakeBuffer);
  assert.ok(Math.abs(direct.lufs - viaBuffer.lufs) < 1e-9);
  assert.ok(Math.abs(viaBuffer.dur - 0.5) < 1e-6, 'the sample rate comes off the buffer');
  // normalize(buffer, targetDb) is the short form
  const r = normalize(fakeBuffer, -18);
  assert.equal(r.aim, -18);
  assert.ok(Math.abs(analyze(r.samples, 44100).lufs - -18) < 0.6);
});
