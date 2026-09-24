// Round 23 — the graphics round, in a real browser.
//
// The node test (tests/round23-graphics.test.js) checks what the shaders are TOLD. This checks that
// the game still boots and draws with them at every level of the Graphics setting, that a frame is a
// picture and not a black rectangle at noon, at sunset and at night, that the rain is really the GPU
// rain when the weather is rain, and that climbing into orbit takes the fog away with the air.
//
// `?quality=low` keeps the world budgets small (that is what every spec here runs at); `?graphics=`
// overrides the level that `?quality=low` would otherwise force to Off.

import { test, expect } from '@playwright/test';

async function land(page, graphics, extra = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger&graphics=${graphics}${extra}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 180000 });
  return errors;
}

/**
 * Put the sun at a height, draw one frame through the real pipeline and read a grid of pixels back
 * in the same task (the canvas is not preserved between frames). Returns mean brightness 0..255 and
 * how much the picture varies — a flat colour, black or not, is a broken frame.
 */
const FRAME_AT = async (sunY, evening) => {
  const f = window.farhold;
  const dl = f.balance.sky?.dayLengthSeconds ?? 900;
  const lon = f.control.x / f.terrain.widthM;
  let best = f.state.elapsed, err = 9;
  for (let k = 0; k < 360; k++) {
    const e = f.state.elapsed + (k * dl) / 360;
    f.sky.update(e, { longitude: lon }); const a = f.sky.sunDirection.y;
    f.sky.update(e + 5, { longitude: lon }); const b = f.sky.sunDirection.y;
    if ((b < a) !== evening) continue;
    if (Math.abs(a - sunY) < err) { err = Math.abs(a - sunY); best = e; }
  }
  f.state.elapsed = best;
  // look at the sun for the sunset, away from it otherwise
  const d = f.sky.sunDirection;
  f.control.yaw = Math.atan2(d.x, d.z) + (evening && sunY > 0 ? 0 : Math.PI * 0.75);
  await new Promise(r => setTimeout(r, 400));
  const gl = f.renderer.getContext();
  const draw = () => {
    f.renderer.clear();
    f.renderer.render(f.sky.scene, f.sky.camera(f.camera));
    f.renderer.clearDepth();
    f.renderer.render(f.scene, f.camera);
  };
  f.sky.update(best, { longitude: lon, gloom: 0, cloud: 0 });
  f.graphics.update(0.016, { mode: 'ground', blended: f.weather.blend(), x: f.control.x, z: f.control.z, y: f.control.y });
  f.graphics.render('ground', draw);
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(4);
  const lums = [];
  for (let j = 1; j < 10; j++) for (let i = 1; i < 16; i++) {
    gl.readPixels(Math.floor((i / 16) * w), Math.floor((j / 10) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    lums.push(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]);
  }
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const spread = Math.sqrt(lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length);
  return { sunY: +f.sky.sunDirection.y.toFixed(2), mean: +mean.toFixed(1), spread: +spread.toFixed(1) };
};

for (const level of ['off', 'low', 'high']) {
  test(`graphics ${level}: boots clean and draws a picture at noon, sunset and night`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors = await land(page, level);
    const out = await page.evaluate(async frameSrc => {
      const frame = eval('(' + frameSrc + ')');
      const f = window.farhold;
      f.setWeather('clear', true);
      const g = f.graphics.stats();
      return {
        level: g.level, flags: g.flags,
        noon: await frame(0.9, false),
        sunset: await frame(0.03, true),
        night: await frame(-0.5, true),
        passes: f.graphics.stats().passes,
        grass: f.graphics.grass ? f.graphics.grass.count : 0,
        grassMode: f.props.grassMode,
        hdr: document.body.dataset.graphics,
      };
    }, FRAME_AT.toString());
    expect(errors).toEqual([]);
    expect(out.level).toBe(level);
    expect(out.hdr).toBe(level);
    // a picture, not a black (or flat) rectangle
    expect(out.noon.mean).toBeGreaterThan(60);
    expect(out.noon.spread).toBeGreaterThan(8);
    expect(out.sunset.mean).toBeGreaterThan(20);
    expect(out.sunset.spread).toBeGreaterThan(6);
    // the night is dark — but it is not black
    expect(out.night.mean).toBeGreaterThan(3);
    expect(out.night.mean).toBeLessThan(out.noon.mean);
    // and the setting really turns the passes on and off
    if (level === 'off') {
      expect(out.flags.postfx).toBe(false);
      expect(out.passes).toBe(0);
      expect(out.grass).toBe(0);
      expect(out.grassMode).toBe('cpu');
    } else {
      expect(out.passes).toBeGreaterThanOrEqual(3);     // the scene, the bloom, the final grade
    }
    if (level === 'high') {
      expect(out.grass).toBeGreaterThan(10000);
      expect(out.grassMode).toBe('gpu');
    }
  });
}

test('changing the setting in play rebuilds the pipeline and hands the grass back', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await land(page, 'high');
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const before = { level: f.graphics.level, grass: !!f.graphics.grass, mode: f.props.grassMode };
    // the panel: picking a level there wins over the page's ?graphics= (which only sets the boot level)
    f.settings.set('graphics', 'off');
    await new Promise(r => setTimeout(r, 1500));
    const after = { level: f.graphics.level, grass: !!f.graphics.grass, mode: f.props.grassMode, postfx: f.graphics.post.enabled };
    f.settings.set('graphics', 'low');
    await new Promise(r => setTimeout(r, 1500));
    const low = { level: f.graphics.level, grass: !!f.graphics.grass, postfx: f.graphics.post.enabled, gpuRain: f.weatherView.rain.name };
    f.settings.set('graphics', 'high');          // leave the browser's stored setting as it found it
    return { before, after, low, hasField: f.settings.fields.some(x => x.key === 'graphics') };
  });
  expect(errors).toEqual([]);
  expect(out.hasField).toBe(true);
  expect(out.before).toEqual({ level: 'high', grass: true, mode: 'gpu' });
  expect(out.after).toEqual({ level: 'off', grass: false, mode: 'cpu', postfx: false });
  expect(out.low.level).toBe('low');
  expect(out.low.grass).toBe(false);
  expect(out.low.postfx).toBe(true);
  expect(out.low.gpuRain).toBe('farhold-rain-gpu');
});

test('rain is the GPU rain: streaks, splashes and sheets, leaning with the one wind', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await land(page, 'low', '&weather=rain');
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.graphics.wind.set({ angle: 0, strength: 0.9 });
    await new Promise(r => setTimeout(r, 2500));
    const rain = f.weatherView.rain;
    const p = f.weatherView.precip;
    const vel = rain.material.uniforms?.uVel?.value;
    return {
      name: rain.name, visible: rain.visible, drops: rain.geometry.instanceCount,
      splashes: !!p?.splashes?.mesh.visible, sheets: !!p?.sheets?.mesh.visible,
      lineRain: f.weatherView.lineRain.visible,
      lean: vel ? [vel.x, vel.z] : null,
      wet: f.graphics.wet, fog: f.graphics.stats().fog,
    };
  });
  expect(errors).toEqual([]);
  expect(out.name).toBe('farhold-rain-gpu');
  expect(out.visible).toBe(true);
  expect(out.drops).toBeGreaterThan(1000);
  expect(out.splashes).toBe(true);
  expect(out.sheets).toBe(true);
  expect(out.lineRain).toBe(false);
  // the wind blows toward +x, so the rain leans toward +x
  expect(out.lean[0]).toBeGreaterThan(3);
  expect(Math.abs(out.lean[1])).toBeLessThan(0.5);
  // and the ground is getting wet
  expect(out.wet).toBeGreaterThan(0);
});

test('orbit has no fog wall: the height fog leaves with the air, and space draws', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await land(page, 'low');
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const ground = f.graphics.stats().fog.amount;
    // halfway up through the atmosphere, and then out of it
    f.graphics.update(0.016, { mode: 'air', blended: f.weather.blend(), space: 0.5, x: f.control.x, z: f.control.z, y: 3000 });
    const half = f.graphics.stats().fog.amount;
    f.sky.update(f.state.elapsed, { space: 1 });
    const skyTop = f.sky.state;
    f.graphics.update(0.016, { mode: 'air', blended: f.weather.blend(), space: 1, x: f.control.x, z: f.control.z, y: 9000 });
    const top = f.graphics.stats().fog.amount;
    f.toSpace();
    for (let i = 0; i < 30; i++) await new Promise(r => requestAnimationFrame(r));
    return {
      ground, half, top, mode: f.mode, spaceFog: f.space.scene.fog || null,
      look: f.graphics.stats().space,
      zenith: skyTop.zenith, stars: skyTop.stars,
    };
  });
  expect(errors).toEqual([]);
  expect(out.ground).toBe(1);
  expect(out.half).toBeLessThan(1);
  expect(out.top).toBe(0);
  expect(out.mode).toBe('space');
  expect(out.spaceFog).toBe(null);
  expect(out.look).toBe(1);
  expect(Math.max(...out.zenith)).toBeLessThan(0.05);
  expect(out.stars).toBe(1);
});
