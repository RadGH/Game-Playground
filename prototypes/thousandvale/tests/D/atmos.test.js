// node --test prototypes/thousandvale/tests/D/atmos.test.js
// 2026-10-16 — graphics (G-ATMOS): the tier table, the water's colour / foam / waterline distance, the baked hollows, the
// warm / cool light, cloud-shadow strength, the grade, the mist's rules, and that the shader patches still find the three.js
// lines they hook (a three upgrade that renames one would otherwise drop the effect without an error).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ATMOS_TIERS, atmosTier, tierWords, WATER, depthMix, waterColour, shoreFoam, shoreDistance, hollowShade, warmCool, cloudShadowStrength, gradeRGB, MIST, mistSpotOk, mistAlpha } from '../../js/client/gfx-tiers.js';

const at = p => fileURLToPath(new URL(p, import.meta.url));

test('tier table: every quality has a row with every field; Low is cheapest, High the richest; ?atmos=0 is the old look', () => {
  const keys = Object.keys(ATMOS_TIERS.high).sort();
  for (const q of ['low', 'medium', 'high', 'off']) assert.deepEqual(Object.keys(ATMOS_TIERS[q]).sort(), keys, q);
  const { low, medium, high, off } = ATMOS_TIERS;
  // the phone tier (Medium) gets no extra full-screen pass: bloom is High only
  assert.equal(medium.bloom, false); assert.equal(low.bloom, false); assert.equal(high.bloom, true);
  assert.equal(low.water, 'basic'); assert.equal(medium.water, 'shaded'); assert.equal(off.water, 'legacy');
  assert.ok(low.mist === 0 && medium.mist > 0 && high.mist >= medium.mist);
  assert.equal(low.cloudShadows, false);
  // Low has no shadow map, so its contact shadow is the darkest
  assert.ok(low.contact > medium.contact && medium.contact >= high.contact && high.contact > 0);
  for (const k of keys) if (typeof off[k] === 'boolean') assert.equal(off[k], false, 'off.' + k); else if (typeof off[k] === 'number') assert.equal(off[k], 0, 'off.' + k);
  assert.equal(atmosTier('medium'), medium); assert.equal(atmosTier('nonsense'), high);
  assert.equal(atmosTier('high', '0'), off); assert.equal(atmosTier('low', 'off'), off);
  assert.match(tierWords('high'), /glow/); assert.doesNotMatch(tierWords('medium'), /glow/); assert.match(tierWords('low'), /foam/);
});

test('water colour: turquoise in the shallows, deep blue far down, more see-through where shallow', () => {
  assert.equal(depthMix(-3), 0); assert.ok(depthMix(1) < depthMix(4) && depthMix(4) < depthMix(20)); assert.ok(depthMix(60) > 0.99);
  const s = waterColour(0.2), d = waterColour(40);
  assert.ok(s.g > s.r * 2 && s.g > d.g * 2, 'shallow water is a light green-blue');
  assert.ok(d.b > d.g && d.b < 0.2, 'deep water is a dark blue');
  assert.ok(s.a < d.a && s.a >= WATER.alphaShallow && d.a <= WATER.alphaDeep);
  // monotonic darkening
  let prev = Infinity; for (let z = 0; z <= 40; z += 2) { const c = waterColour(z), l = c.r + c.g + c.b; assert.ok(l <= prev + 1e-9, 'darker with depth at ' + z); prev = l; }
});

test('foam: white at the waterline, gone a few metres out; foam round an object counts', () => {
  assert.equal(shoreFoam(0, 0, 0), 1, 'at the waterline'); assert.ok(shoreFoam(1.2) > 0.4); assert.equal(shoreFoam(WATER.foamWidth + 0.81), 0);
  assert.ok(shoreFoam(0.5, 0, 6) > 0.8, 'a sheer quay face: deep water, foam all the same');
  assert.equal(shoreFoam(10, 0.7), 0.7);
});

test('waterline distance: 0 on the bank, grows across the water, capped; no sheet = NaN', () => {
  // a 12 x 12 grid, step 2 m: a bank in the first three columns (ground above the sheet), water to the east, a dry
  // strip with no sheet in the last column
  const res = 12, step = 2, N = res * res, surf = new Float32Array(N), grid = new Float32Array(N);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const k = j * res + i;
    surf[k] = i === res - 1 ? NaN : 1;
    grid[k] = i < 3 ? 1.5 : -2;
  }
  const d = shoreDistance(surf, grid, res, step, 10);
  const D = (i, j) => d[j * res + i];
  assert.equal(D(1, 5), 0); assert.equal(D(2, 5), 0);
  assert.ok(Math.abs(D(3, 5) - 2) < 1e-6 && Math.abs(D(5, 5) - 6) < 1e-6, 'two metres a sample, straight out');
  assert.ok(Number.isNaN(D(res - 1, 5)));
  // the sample next to the sheet's own edge is a waterline too
  assert.equal(D(res - 2, 5), 0);
  assert.ok(D(7, 5) <= 10, 'capped');
  // a big zone-sized grid stays fast (a zone is 1025 x 1025; most of it has no sheet)
  const R = 1025, S = new Float32Array(R * R).fill(NaN), G = new Float32Array(R * R);
  for (let j = 400; j < 600; j++) for (let i = 300; i < 700; i++) { S[j * R + i] = 0; G[j * R + i] = (i < 320 ? 1 : -3); }
  const t0 = performance.now(); shoreDistance(S, G, R, 2, 32); const ms = performance.now() - t0;
  assert.ok(ms < 600, `zone-sized sweep took ${ms.toFixed(0)} ms`);
});

test('hollows: a pit is darker than flat ground; a ridge is not darkened; never below the floor', () => {
  const flat = () => 10, pit = (i, j) => (i === 0 && j === 0 ? 4 : 10), ridge = (i, j) => (i === 0 && j === 0 ? 16 : 10);
  assert.equal(hollowShade(flat, 0, 0), 1);
  assert.ok(hollowShade(pit, 0, 0) < 0.9); assert.equal(hollowShade(ridge, 0, 0), 1);
  assert.equal(hollowShade((i, j) => (i === 0 && j === 0 ? -500 : 10), 0, 0), 0.72);
});

test('light: the sun a little warmer, the sky fill a little cooler, moonlight untouched', () => {
  const r = warmCool([1, 1, 1], [1, 1, 1], 0);
  assert.ok(r.key[0] > r.key[2] && r.hemiSky[2] > r.hemiSky[0]);
  assert.deepEqual(warmCool([0.5, 0.6, 1], [0.4, 0.5, 0.9], 1), { key: [0.5, 0.6, 1], hemiSky: [0.4, 0.5, 0.9] });
});

test('cloud shadows: none at night or underground; deeper when cloudy; fade as the sun sets', () => {
  assert.equal(cloudShadowStrength({ night: 1 }), 0); assert.equal(cloudShadowStrength({ dungeon: true }), 0);
  const clear = cloudShadowStrength({ sunY: 0.8 }), cloudy = cloudShadowStrength({ sunY: 0.8, weather: 'cloudy' });
  assert.ok(clear > 0.15 && cloudy > clear && cloudy < 0.5);
  assert.ok(cloudShadowStrength({ sunY: 0.05 }) < clear * 0.3);
});

test('grade: grey stays grey-ish, shadows lean cool and highlights warm, nothing leaves 0..1', () => {
  const dark = gradeRGB([0.08, 0.08, 0.08]), bright = gradeRGB([0.8, 0.8, 0.8]), mid = gradeRGB([0.4, 0.4, 0.4]);
  assert.ok(dark[2] > dark[0], 'shadows cool'); assert.ok(bright[0] > bright[2], 'highlights warm');
  for (const c of [dark, bright, mid]) for (const v of c) assert.ok(v >= 0 && v <= 1);
  assert.ok(Math.abs(mid[0] - 0.4) < 0.04 && Math.abs(mid[2] - 0.4) < 0.04, 'mid grey barely moves');
  for (const v of gradeRGB([1, 0, 0])) assert.ok(v >= 0 && v <= 1);
});

test('mist: only over water or down in a valley, never near the player, invisible close to the camera', () => {
  assert.equal(mistSpotOk({ y: 0, wet: true, dPlayer: MIST.playerClear - 1, focusY: 0 }), false);
  assert.equal(mistSpotOk({ y: 0, wet: true, dPlayer: 100, focusY: 0 }), true);
  assert.equal(mistSpotOk({ y: 50, wet: false, dPlayer: 100, focusY: 52 }), false, 'level ground: no');
  assert.equal(mistSpotOk({ y: 50, wet: false, dPlayer: 200, focusY: 52 }), true, 'far off over the fields: yes');
  assert.equal(mistSpotOk({ y: 90, wet: false, dPlayer: 200, focusY: 52 }), false, 'not up on a hill above you');
  assert.equal(mistSpotOk({ y: 30, wet: false, dPlayer: 100, focusY: 52 }), true, 'a valley below: yes');
  assert.equal(mistSpotOk({ y: NaN, wet: false, dPlayer: 100, focusY: 0 }), false);
  assert.equal(mistAlpha(10, 60, 10), 0, 'nothing within a few dozen metres of the camera');
  assert.ok(mistAlpha(30, 60, 200) > 0.2); assert.equal(mistAlpha(0, 60, 200), 0); assert.ok(mistAlpha(59.9, 60, 200) < 0.01);
});

test('the shader patches still find their three.js lines (water, grade, ground cloud) and the mist / glow shaders compile in shape', { skip: !existsSync(at('../../../../avatar-3d/tests/three-register.mjs')) && 'the playground three loader is not here' }, () => {
  const code = `
    const THREE = await import('three');
    const A = await import(${JSON.stringify(new URL('../../js/client/atmos.js', import.meta.url).href)});
    const { ATMOS_TIERS } = await import(${JSON.stringify(new URL('../../js/client/gfx-tiers.js', import.meta.url).href)});
    const m = new THREE.MeshStandardMaterial();
    A.patchWater(m, ATMOS_TIERS.high, new THREE.Texture());
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(sh);
    const r = { vert: sh.vertexShader.includes('vWater = aWater'), color: sh.fragmentShader.includes('float tvFoam = max('), normal: sh.fragmentShader.includes('wn = normalize(vec3(sl.x'), sky: sh.fragmentShader.includes('wFres') && sh.fragmentShader.includes('directSpecular *= 0.35'), waves: sh.fragmentShader.includes('#define TV_WAVES'), key: m.customProgramCacheKey() };
    const renderer = { toneMapping: 0 };
    r.grade = A.installGrade(renderer, ATMOS_TIERS.medium) && renderer.toneMapping === THREE.CustomToneMapping && THREE.ShaderChunk.tonemapping_pars_fragment.includes('color = ACESFilmicToneMapping( color );');
    r.lowGrade = A.installGrade({ toneMapping: 4 }, ATMOS_TIERS.low);
    r.noise = A.noiseTexture().image.width;
    console.log(JSON.stringify(r));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--import', at('../../../../avatar-3d/tests/three-register.mjs'), '--input-type=module', '-e', code], { encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepEqual(out, { vert: true, color: true, normal: true, sky: true, waves: true, key: 'tv-water|#define TV_SHADED,#define TV_CLOUDS,#define TV_WAVES,#define TV_SPARK', grade: true, lowGrade: false, noise: 128 });
});
