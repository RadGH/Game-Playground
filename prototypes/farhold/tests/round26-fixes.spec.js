// Farhold R26 — two play-test reports, checked in a real browser.
//
// 1. "Sometimes after creating a character I still get stuck at 'Waking the wayfarer...' — I can
//    tell by the sfx the game is running in the background but the menu just doesn't hide."
//    title.css's `#boot[data-screen="boot-world"] { display: flex }` tied style.css's
//    `#boot.hidden { display: none }` on specificity and was linked later, so on the world step
//    (the screen Start is on) adding `.hidden` hid nothing. Every older spec waited for
//    `body[data-ready]` or checked the CLASS, and the class was always there — so this one asks the
//    browser what is actually on screen.
//
// 2. "The third attack from the longsword (Overhead) still … looks like the character is swinging
//    into the air. Can you flip that cone around so it looks like the slash is coming from above?"
//    The ribbon was a sector centred on straight up, standing across your facing. It is now in the
//    plane of your facing, from over the head down to the ground in front, revealed top first.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // main.js's hideBoot() forces the title off and says so if the stylesheet did not — that is the
  // safety net, and it must never be what did the job
  page.on('console', m => { if (/did not hide the title/.test(m.text())) errors.push('css: ' + m.text()); });
  return errors;
}

async function startFromTitle(page, classId, seed) {
  await page.goto(BASE + '?quality=low&sound=off');
  await page.waitForSelector('#boot-menu:not(.hidden)', { timeout: 30000 });
  await page.click('#boot-new');
  await page.selectOption('#boot-class', classId);
  if (classId === 'custom') {
    await page.click('.cb-open');
    await page.locator('.cb:not([hidden]) .cb-rail button', { hasText: 'Spells' }).click();
    await page.locator('.cb:not([hidden]) .cb-opt:not([disabled])').first().click();
    await page.locator('.cb-done').click();
  }
  await page.click('#boot-to-world');
  await page.fill('#boot-seed', String(seed));
  await page.selectOption('#boot-scale', '0.2');
  await page.click('#boot-start');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
}

for (const [classId, seed] of [['fighter', 11], ['custom', 7]]) {
  test(`Start from the world step (${classId}): the title really leaves the screen`, async ({ page }) => {
    const errors = watch(page);
    await startFromTitle(page, classId, seed);
    // a couple of frames, so the loop's own first-frame check has run too
    await page.waitForTimeout(500);
    const boot = await page.evaluate(() => {
      const b = document.getElementById('boot');
      const r = b.getBoundingClientRect();
      return { display: getComputedStyle(b).display, screen: b.dataset.screen, w: r.width, h: r.height, status: document.getElementById('boot-status').textContent };
    });
    expect(boot.screen, 'the title was not left on the world step, so this is not the reported path').toBe('boot-world');
    expect(boot.display, 'the title is still drawn over the running game').toBe('none');
    expect(boot.w * boot.h).toBe(0);
    await expect(page.locator('#boot')).toBeHidden();
    expect(boot.status, '"waking the wayfarer…" was left behind').toBe('');
    expect(errors).toEqual([]);
  });
}

test('the overhead ribbon falls from over the head to the ground in front, in the plane of your facing', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE + '?auto&class=fighter&seed=11&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  const out = await page.evaluate(() => {
    const f = window.farhold, c = f.control, T = f.THREE;
    const reach = 3.45;
    const s = f.fx.swipe({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, reach, arc: 1.27, shape: { key: 'overhead', shake: 0.4 }, life: 10000 });
    s.mesh.updateMatrixWorld(true);
    const pos = s.mesh.geometry.attributes.position;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const pts = [];
    const v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(s.mesh.matrixWorld);
      const dx = v.x - c.x, dz = v.z - c.z;
      pts.push({ fwd: dx * fx + dz * fz, side: dx * fz - dz * fx, up: v.y - c.y });
    }
    // the part drawn FIRST (the start of the draw range) must be the top of the chop
    const range = s.mesh.geometry.drawRange;
    const idx = s.mesh.geometry.index;
    const firstShown = [];
    for (let k = range.start; k < range.start + range.count; k++) firstShown.push(pts[idx.getX(k)]);
    s.life = 0; s.mesh.visible = false;
    return {
      top: Math.max(...pts.map(p => p.up)),
      lowest: Math.min(...pts.map(p => p.up)),
      fwdAtLowest: pts.reduce((a, b) => (b.up < a.up ? b : a)).fwd,
      fwdAtTop: pts.reduce((a, b) => (b.up > a.up ? b : a)).fwd,
      maxFwd: Math.max(...pts.map(p => p.fwd)),
      minFwd: Math.min(...pts.map(p => p.fwd)),
      firstShownUp: Math.min(...firstShown.map(p => p.up)),
    };
  });
  // it rises well over the head (the body is ~1.4 m tall) …
  expect(out.top).toBeGreaterThan(3);
  // … the top is over the head, not out in front of you …
  expect(out.fwdAtTop).toBeLessThan(0.5);
  // … and it comes down to near the ground, in FRONT of you
  expect(out.lowest).toBeLessThan(0.6);
  expect(out.fwdAtLowest).toBeGreaterThan(1.5);
  expect(out.maxFwd).toBeGreaterThan(2.5);
  // it starts slightly behind the head, like a blade brought back over the shoulder
  expect(out.minFwd).toBeLessThan(0);
  // what is shown at the start of the swing is the high part, not the low part
  expect(out.firstShownUp).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

/**
 * 3. "When I stand nearby and look at these coordinates, a large black square fills my interface"
 *    (seed 19629, Thinareik, Grassland, x 13318 z 2171 — the Super tiny planet size). A road deck's
 *    side wall had a zero-length normal, the lighting made one NaN pixel of it, and the bloom
 *    blurred that NaN across the screen. See tests/round26-nan.test.js for the geometry.
 *
 * `frameStats` draws one frame through the real pipeline (js/postfx.js on the current Graphics
 * level) and copies the canvas inside the same task, which is the only moment a WebGL canvas can be
 * read back, then counts the pixels that are pure black.
 */
const frameStats = page => page.evaluate(() => new Promise(resolve => {
  // registered between frames, so it runs right after the game's own tick has drawn the next one
  requestAnimationFrame(() => {
    const c = window.farhold.renderer.domElement, w = 160, h = Math.round(160 * c.height / c.width);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(c, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let black = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 4 && d[i + 1] < 4 && d[i + 2] < 4) black++;
    resolve({ black: black / (w * h), level: document.body.dataset.graphics });
  });
}));

test('the reported spot on Thinareik draws a picture, not a black square, with every graphics effect on', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE + '?auto&class=fighter&seed=19629&sound=off&scale=0.1');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  await page.evaluate(() => { window.farhold.graphics.setLevel('high'); window.farhold.teleport(13318, 2171); });
  await page.waitForTimeout(4000);
  const worst = [];
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    await page.evaluate(y => { window.farhold.control.yaw = y; }, yaw);
    await page.waitForTimeout(600);
    worst.push((await frameStats(page)).black);
  }
  // the report was ~100% black facing east (yaw pi/2); a normal frame here is well under 1%
  expect(Math.max(...worst), `black share by heading: ${worst.map(b => b.toFixed(3)).join(', ')}`).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test('a NaN from any material stays one pixel: it is not blurred into a square by the bloom', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE + '?auto&class=fighter&seed=11&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  await page.evaluate(() => window.farhold.graphics.setLevel('high'));
  await page.waitForTimeout(1000);
  const before = await frameStats(page);
  await page.evaluate(() => {
    const f = window.farhold, T = f.THREE, cam = f.camera;
    /**
     * The real fault, reproduced on purpose: a lit surface whose vertex normals are zero. The
     * lighting normalises (0, 0, 0) and writes NaN, exactly as the road deck's side wall did.
     */
    const g = new T.PlaneGeometry(0.3, 0.3);
    g.attributes.normal.array.fill(0);
    const bad = new T.Mesh(g, new T.MeshLambertMaterial({ color: 0xffffff }));
    bad.name = 'test-nan';
    cam.updateMatrixWorld();
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    bad.position.copy(cam.position).addScaledVector(dir, 6);
    bad.quaternion.copy(cam.quaternion);
    bad.frustumCulled = false;
    f.scene.add(bad);
  });
  await page.waitForTimeout(300);
  const stats = await frameStats(page);
  await page.evaluate(() => { const f = window.farhold; f.scene.remove(f.scene.getObjectByName('test-nan')); });
  // the patch itself is a fraction of a percent of the frame; without the guard the bloom turned it
  // into a black square many times its size
  expect(stats.level).toBe('high');
  expect(stats.black - before.black, `black share ${before.black.toFixed(3)} without the patch, ${stats.black.toFixed(3)} with it`).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

/**
 * 4. "I got a quest 'Clear the Mauran Undercroft' … a big rock thing there that looks like maybe a
 *    cave entrance … despite the yellow arrow pointing to it, I cannot interact with it in any way."
 *    js/sites.js builds a beast den on the mouth, and its earth bank is ~7 m of solid around the
 *    very point `E` measured 4.5 m from. Stood at from eight sides, on the mouths
 *    nearest the start of seed 3 that a job could name (World Forge's dungeons and the instance
 *    mouths) — then a clear job is taken, the place is entered, and killing its boss finishes it.
 */
test('every dungeon mouth a job can send you to has a door you can walk up to, and clearing it finishes the job', async ({ page }) => {
  test.setTimeout(420000);
  const errors = watch(page);
  await page.goto(BASE + '?auto&class=fighter&seed=3&sound=off&quality=low');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  // nobody gets killed and nothing gets in the way while we walk
  await page.evaluate(() => {
    const f = window.farhold;
    window.__guard = setInterval(() => {
      f.player.hp = f.player.maxHp = 1e7;
      if (!f.dungeon) for (const e of f.field.enemies) e.hp = 0;
    }, 50);
  });
  const mouths = await page.evaluate(() => {
    const f = window.farhold, c = f.control;
    const all = f.gates.nodes
      .map(n => ({ id: n.id, name: n.name, kind: n.kind, x: n.x, z: n.z, d: Math.hypot(n.x - c.x, n.z - c.z) }))
      .sort((a, b) => a.d - b.d);
    // World Forge's own dungeons (a beast den is often built right on top of one — the report) and
    // the instance mouths js/sites.js adds
    return [...all.filter(n => n.kind !== 'instance').slice(0, 3), ...all.filter(n => n.kind === 'instance').slice(0, 2)];
  });
  expect(mouths.length).toBeGreaterThan(0);
  /**
   * Stand where a player walking up to the mouth would end up: on each of eight bearings, the
   * nearest spot to the mouth that none of the game's own obstacle fields refuses. (Walking there
   * with the keys is the same thing slower, and a straight walk can snag on a cairn a player would
   * simply step round.) Then ask the game what E does from there.
   */
  const results = [];
  for (const m of mouths) {
    await page.evaluate(m => window.farhold.teleport(m.x, m.z + 20), m);
    await page.waitForTimeout(1200);
    results.push(await page.evaluate(m => {
      const f = window.farhold, c = f.control, body = 0.4;
      const fields = c.obstacles || [];
      const free = (x, z) => fields.every(fl => !fl?.blocked?.(x, z, body));
      const rows = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        let d = 0;
        while (d < 20 && !free(m.x + Math.sin(a) * d, m.z + Math.cos(a) * d)) d += 0.25;
        const x = m.x + Math.sin(a) * d, z = m.z + Math.cos(a) * d;
        if (f.terrain.waterAt?.(x, z)) continue;          // a bearing into a river is not an approach
        c.teleport(x, z);
        const it = f.interactTarget();
        rows.push({ a: +a.toFixed(2), d: +d.toFixed(2), ok: it?.kind === 'dungeon' && it.gate?.name === m.name });
      }
      return { name: m.name, rows };
    }, m));
  }
  const tried = results.flatMap(r => r.rows);
  expect(tried.length, 'no bearing to any mouth could be tried').toBeGreaterThan(8);
  // the reported fault: on at least one of these a den's bank keeps you further from the middle
  // than the old 4.5 m reach on EVERY side
  const walled = results.filter(r => r.rows.length && r.rows.every(x => x.d > 4.6));
  expect(walled.length, 'nothing here is built over a mouth — the test is not testing the bug').toBeGreaterThan(0);
  for (const r of results) {
    const good = r.rows.filter(x => x.ok).length;
    expect(good, `${r.name}: E works from ${good} of ${r.rows.length} sides — ${JSON.stringify(r.rows)}`).toBeGreaterThanOrEqual(Math.ceil(r.rows.length * 0.75));
  }

  // now the job: a clear job on the nearest mouth, enter it, find its targets, drop the boss
  const out = await page.evaluate(async m => {
    const f = window.farhold;
    const def = f.field.defs.find(d => (d.minLevel ?? 1) <= 3) || f.field.defs[0];
    const q = {
      id: 'q_test_clear', kind: 'clear', giverId: 1, giverName: 'Ada', progress: 0, done: false, turnedIn: false,
      reward: { gold: 10, xp: 10, kind: 'coin' }, target: def.id, targetName: def.name, count: 3,
      place: { x: m.x, z: m.z, name: m.name }, title: `Clear ${m.name}`, text: '',
    };
    f.questLog.add(q);
    const node = f.gates.nodes.find(n => n.id === m.id);
    await f.enterDungeon(node);
    const targets = f.field.enemies.filter(e => e.defId === def.id || e.def?.id === def.id || e.id === def.id).length;
    const boss = f.bossUnit;
    if (boss) { boss.hp = 0; f.field.kill(boss); }
    await new Promise(r => setTimeout(r, 400));
    return { inside: !!f.dungeon, targets, boss: !!boss, done: f.questLog.active.find(j => j.id === q.id)?.done ?? null };
  }, mouths[0]);
  await page.evaluate(() => clearInterval(window.__guard));
  expect(out.inside, 'the mouth did not open onto a dungeon').toBe(true);
  expect(out.targets, 'the job\'s quarry was not put inside').toBeGreaterThanOrEqual(3);
  expect(out.boss).toBe(true);
  expect(out.done, 'the boss went down and the clear job did not finish').toBe(true);
  expect(errors).toEqual([]);
});
