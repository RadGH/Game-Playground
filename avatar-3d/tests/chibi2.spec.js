import { test, expect } from '@playwright/test';

async function openLab(page, view = 'portrait') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/avatar-3d/chibi2.html?view=' + view);
  await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 60000 });
  return errors;
}

test('Chibi 2 shares assets, bends at joints, completes one-shots and releases resources', async ({ page }) => {
  const errors = await openLab(page);
  const result = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character, chibi2CacheStats } = await import('/avatar-3d/js/chibi2.js');
    const { normalizeAvatar } = await import('/avatar-2d/js/render.js');
    const data = await (await fetch('/avatar-3d/data/chibi2-presets.json')).json();
    const before = chibi2CacheStats(), a = await createChibi2Character(data.presets[0].avatar), b = await createChibi2Character(data.presets[0].avatar);
    const ma = a.group.getObjectByName('chibi2-cloth'), mb = b.group.getObjectByName('chibi2-cloth');
    const shared = ma.geometry === mb.geometry && ma.material === mb.material;
    const independent = a.skeleton !== b.skeleton && a.parts.elbowR !== b.parts.elbowR;
    let invalid = 0;
    a.group.traverse(o => {
      if (!o.isMesh) return;
      for (const key of ['position', 'normal', 'skinWeight']) for (const v of o.geometry.attributes[key].array) if (!Number.isFinite(v)) invalid++;
      const weights = o.geometry.attributes.skinWeight, indices = o.geometry.attributes.skinIndex;
      for (let i = 0; i < weights.count; i++) {
        if (Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) > 0.0001) invalid++;
        for (let j = 0; j < 4; j++) if (indices.getComponent(i, j) >= a.skeleton.bones.length) invalid++;
      }
    });
    a.group.position.set(3, 2, 1); a.setAnim('attack', 0); a.update(0.1); a.update(0.1);
    a.group.updateMatrixWorld(true); a.skeleton.update();
    const bend = a.parts.elbowR.rotation.x;
    const position = a.group.position.toArray();
    for (let i = 0; i < 14; i++) a.update(0.1);
    const finished = a.anim;
    a.setAnim('dead', 0); for (let i = 0; i < 14; i++) a.update(0.1);
    const dead = a.anim, fallen = a.parts.root.rotation.x;
    a.setAnim('idle', 0); a.update(0.1); const revived = a.parts.root.rotation.x;
    const stats = a.stats(); a.dispose(); b.setAnim('run'); b.update(0.1);
    const survives = b.group.getObjectByName('chibi2-cloth').geometry.attributes.position.count > 0;
    const missingIds = [];
    for (const preset of data.presets) {
      const normalized = normalizeAvatar(preset.avatar);
      for (const [slot, value] of Object.entries(preset.avatar)) if (value?.id && normalized[slot].id !== value.id) missingIds.push(slot + ':' + value.id);
      await b.setAvatar(preset.avatar);
    }
    b.dispose(); b.dispose();
    return { shared, independent, invalid, bend, position, finished, dead, fallen, revived, stats, survives, before, after: chibi2CacheStats(), missingIds };
  });
  expect(result.shared).toBe(true); expect(result.independent).toBe(true); expect(result.invalid).toBe(0);
  expect(result.bend).toBeLessThan(-0.2); expect(result.position).toEqual([3, 2, 1]);
  expect(result.finished).toBe('idle'); expect(result.dead).toBe('dead'); expect(result.fallen).toBeCloseTo(-Math.PI / 2);
  expect(result.revived).toBeCloseTo(0); expect(result.survives).toBe(true);
  expect(result.stats.meshes).toBe(2); expect(result.stats.triangles).toBeLessThan(8500);
  expect(result.after).toEqual(result.before); expect(result.missingIds).toEqual([]); expect(errors).toEqual([]);
});

test('the Bard feather cap is a distinct indexed Chibi 2 asset', async ({ page }) => {
  const errors = await openLab(page);
  const result = await page.evaluate(async () => {
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const looks = await (await fetch('/prototypes/emberveil/data/class-looks.json')).json();
    const index = await (await fetch('/avatar-3d/data/chibi2-assets.json')).json();
    const bard = looks.classes.bard.avatar;
    const plain = structuredClone(bard); plain.hat = { id: 'none', color: bard.hat.color }; plain.hair = { id: 'bald', color: bard.hair.color };
    const withCap = await createChibi2Character(bard), withoutCap = await createChibi2Character(plain);
    const result = { hat: bard.hat, indexed: index.assets.some(a => a.id === 'bard_red_feather_hat' && a.variant === 'feather_cap'), withCap: withCap.stats(), withoutCap: withoutCap.stats() };
    withCap.dispose(); withoutCap.dispose(); return result;
  });
  expect(result.hat).toEqual({ id: 'feather_cap', color: '#b02020', color2: '#3aa65a' });
  expect(result.indexed).toBe(true); expect(result.withCap.triangles - result.withoutCap.triangles).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('the raised hood wraps the head and frames the face; the lowered hood sits behind the neck', async ({ page }) => {
  const errors = await openLab(page);
  const result = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character, hoodGrid, HOOD_SHAPE } = await import('/avatar-3d/js/chibi2.js');
    const looks = await (await fetch('/prototypes/emberveil/data/class-looks.json')).json();
    // Head-space measurements of the cowl grid (+z forward; the head spans y 0..0.60, half-width 0.335,
    // half-depth 0.271, and the face plane is the nose/cheek front at z ~0.27).
    const { outer, inner, columns, rows } = hoodGrid(HOOD_SHAPE);
    const box = new THREE.Box3().setFromPoints(outer), size = box.getSize(new THREE.Vector3());
    const rim = Array.from({ length: columns + 1 }, (_, j) => outer[j * (rows + 1)]);
    const rimFront = rim.filter(p => p.y > 0.1 && p.y < 0.5);
    const headInside = p => (p.x / 0.335) ** 2 + ((p.y - 0.30) / 0.30) ** 2 + (p.z / 0.271) ** 2 < 1;
    // The built mesh: triangle cost of each hood over a hatless version of the same character.
    const tri = async av => { const c = await createChibi2Character(av); const s = c.stats(); c.dispose(); return s.triangles; };
    // Bald and earless on both sides of the comparison, so hair and ears the hood tucks away do not offset its cost.
    const shorn = av => ({ ...structuredClone(av), hair: { ...av.hair, id: 'bald' }, ears: { ...av.ears, id: 'none' } });
    const cleric = shorn(looks.classes.cleric.avatar), storm = shorn(looks.classes.stormcaller.avatar);
    const bare = av => ({ ...structuredClone(av), hat: { id: 'none', color: av.hat.color } });
    // The skinned hood in bind pose: the cloth mesh grows forward past the face when the hood is added.
    const clothBox = async av => { const c = await createChibi2Character(av); const m = c.group.getObjectByName('chibi2-cloth'); m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone(); c.dispose(); return b; };
    const hooded = await clothBox(cleric), plain = await clothBox(bare(cleric));
    return {
      width: size.x, depth: size.z, height: size.y, maxZ: box.max.z, minZ: box.min.z, maxY: box.max.y, minY: box.min.y,
      rimMinZ: Math.min(...rimFront.map(p => p.z)), rimCount: rimFront.length,
      innerClipsHead: inner.filter(headInside).length,
      hoodTris: await tri(cleric) - await tri(bare(cleric)), downTris: await tri(storm) - await tri(bare(storm)),
      hoodedTop: hooded.max.y, plainTop: plain.max.y,
    };
  });
  const facePlane = 0.27;
  expect(result.maxZ).toBeGreaterThan(facePlane + 0.03);           // the cowl reaches forward past the face
  expect(result.depth / result.width).toBeGreaterThan(0.75);        // round, not squashed flat
  expect(result.width).toBeGreaterThan(0.335 * 2);                  // wider than the head
  expect(result.minZ).toBeLessThan(-0.3);                           // and wraps the back of the head
  expect(result.maxY).toBeGreaterThan(0.62);                        // rises above the crown
  expect(result.minY).toBeLessThan(0);                              // hangs below the jaw onto the neck
  expect(result.rimCount).toBeGreaterThan(4);
  expect(result.rimMinZ).toBeGreaterThan(facePlane - 0.02);         // the rim sits around the face, not behind the head
  expect(result.innerClipsHead).toBe(0);                            // the lining never passes through the head
  expect(result.hoodedTop).toBeGreaterThan(result.plainTop);
  expect(result.hoodTris).toBeGreaterThan(300); expect(result.hoodTris).toBeLessThan(1400);
  expect(result.downTris).toBeGreaterThan(100); expect(result.downTris).toBeLessThan(700);
  expect(errors).toEqual([]);
});

test('no Emberveil headwear lets the skull show through it', async ({ page }) => {
  const errors = await openLab(page);
  const result = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const looks = await (await fetch('/prototypes/emberveil/data/class-looks.json')).json();
    const hits = {};
    // Rays aimed at the head centre from above and all around (50-90 degrees up): the first visible
    // (front-facing) surface must not carry the skin colour. A cap or crown whose shell sits inside
    // the skull fails here, because the scalp is the first thing the ray meets.
    for (const [cls, look] of Object.entries(looks.classes)) {
      const av = look.avatar; if (!av.hat || av.hat.id === 'none') continue;
      const c = await createChibi2Character(av); c.group.updateMatrixWorld(true);
      const meshes = c.group.children[0].children.filter(o => o.isSkinnedMesh).map(m => new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial()));
      const H = c.parts.eyeR.position.x / 0.12, center = new THREE.Vector3();
      c.parts.head.getWorldPosition(center); center.y += 0.30 * H;
      const skin = new THREE.Color(av.body.skin), ray = new THREE.Raycaster();
      let skinHits = 0, rays = 0;
      for (let el = 50; el <= 90; el += 8) for (let az = 0; az < 360; az += 15) {
        const e = el * Math.PI / 180, z = az * Math.PI / 180;
        const d = new THREE.Vector3(Math.sin(z) * Math.cos(e), Math.sin(e), Math.cos(z) * Math.cos(e));
        ray.set(center.clone().addScaledVector(d, 3), d.negate()); rays++;
        const hit = ray.intersectObjects(meshes, false)[0]; if (!hit) continue;
        const col = hit.object.geometry.attributes.color, rgb = new THREE.Color(col.getX(hit.face.a), col.getY(hit.face.a), col.getZ(hit.face.a));
        // Vertex colours carry a 0.94-1.0 vertical tint, so compare hue at matched brightness.
        const k = (rgb.r + rgb.g + rgb.b) / (skin.r + skin.g + skin.b);
        if (k > 0.9 && k < 1.02 && Math.abs(rgb.r - skin.r * k) + Math.abs(rgb.g - skin.g * k) + Math.abs(rgb.b - skin.b * k) < 0.02) skinHits++;
      }
      hits[cls + ':' + av.hat.id] = { skinHits, rays };
      c.dispose();
    }
    return hits;
  });
  expect(Object.keys(result).length).toBeGreaterThan(10);
  for (const [key, r] of Object.entries(result)) expect({ key, skinHits: r.skinHits }).toEqual({ key, skinHits: 0 });
  expect(errors).toEqual([]);
});

test('every part id an Emberveil class uses builds its own Chibi 2 shape, and every class carries a decoration', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await openLab(page);
  const result = await page.evaluate(async () => {
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { SLOTS } = await import('/avatar-2d/js/parts/index.js');
    const { DEFAULT_AVATAR, normalizeAvatar } = await import('/avatar-2d/js/render.js');
    const looks = await (await fetch('/prototypes/emberveil/data/class-looks.json')).json();
    // Geometry fingerprint: vertex count, rounded positions and triangle count of both body meshes.
    const print = async av => {
      const c = await createChibi2Character(av); let h = 0, n = 0;
      for (const m of c.group.children[0].children) if (m.isSkinnedMesh) { const p = m.geometry.attributes.position.array; n += p.length; for (let i = 0; i < p.length; i += 3) h = (h * 31 + Math.round(p[i] * 1000) * 7 + Math.round(p[i + 1] * 1000) * 13 + Math.round(p[i + 2] * 1000)) % 2147483647; }
      const r = { key: n + ':' + h, triangles: c.stats().triangles, meshes: c.stats().meshes }; c.dispose(); return r;
    };
    const used = {}, problems = [], budgets = {}, missingDecor = [], fallback = [];
    for (const [cls, look] of Object.entries(looks.classes)) {
      const n = normalizeAvatar(look.avatar);
      if (!look.avatar.decor || look.avatar.decor.id === 'none' || n.decor.id !== look.avatar.decor.id) missingDecor.push(cls);
      const b = await print(look.avatar); budgets[cls] = b.triangles; if (b.meshes !== 2) problems.push(cls + ': ' + b.meshes + ' meshes');
      for (const slot of SLOTS) {
        const id = slot === 'headShape' ? look.avatar.headShape : look.avatar[slot]?.id; if (!id) continue;
        if ((slot === 'headShape' ? n.headShape : n[slot].id) !== id) fallback.push(cls + ' ' + slot + ':' + id);
        (used[slot] ||= new Set()).add(id);
      }
    }
    // Each used id on a plain, hatless base: it must differ from the slot's empty/default part and from every other used id.
    for (const [slot, ids] of Object.entries(used)) {
      const base = structuredClone(DEFAULT_AVATAR); base.hat.id = 'none';
      const baseId = slot === 'headShape' ? base.headShape : base[slot].id, prints = {};
      const baseline = await print(base);
      for (const id of ids) {
        const a = structuredClone(base); if (slot === 'headShape') a.headShape = id; else a[slot].id = id;
        prints[id] = (await print(a)).key;
        if (id !== baseId && id !== 'none' && prints[id] === baseline.key) problems.push(`${slot}:${id} builds nothing (same as ${baseId})`);
      }
      const seen = {};
      for (const [id, key] of Object.entries(prints)) { if (seen[key]) problems.push(`${slot}:${id} has the same shape as ${seen[key]}`); else seen[key] = id; }
    }
    return { problems, budgets, missingDecor, fallback, decorIds: [...used.decor] };
  });
  expect(result.fallback).toEqual([]);
  expect(result.missingDecor).toEqual([]);
  expect(result.decorIds.length).toBeGreaterThanOrEqual(8);
  expect(result.problems).toEqual([]);
  for (const [cls, t] of Object.entries(result.budgets)) expect({ cls, under: t < 8500 }).toEqual({ cls, under: true });
  expect(errors).toEqual([]);
});

test('eight fighters reduce draw calls and geometry under identical rendering settings', async ({ page }) => {
  const errors = await openLab(page, 'combat');
  const result = await page.evaluate(async () => {
    const lab = window.chibi2;
    await lab.configure({ engine: 'original', spells: false, paused: true });
    lab.scene.renderer.render(lab.scene.scene, lab.scene.camera); const old = lab.stats();
    await lab.configure({ engine: 'chibi2', spells: false, paused: true });
    lab.scene.renderer.render(lab.scene.scene, lab.scene.camera); const fresh = lab.stats();
    await lab.configure({ spells: true, paused: false });
    return { old, fresh };
  });
  expect(result.old.actors).toBe(8); expect(result.fresh.actors).toBe(8);
  expect(result.fresh.calls).toBeLessThan(result.old.calls * 0.25);
  expect(result.fresh.triangles).toBeLessThan(result.old.triangles * 0.6);
  expect(result.fresh.calls).toBe(19); // Sixteen body draws, ground, scenery and contact shadows.
  await page.waitForFunction(() => window.chibi2.fx.stats().batchedSprites > 5, null, { timeout: 20000 });
  expect((await page.evaluate(() => window.chibi2.stats())).sprites.overflow).toBe(0);
  await page.screenshot({ path: 'test-results/chibi2-combat.png' });
  expect(errors).toEqual([]);
});

test('rendering controls, paused billboards and comparison results remain consistent', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await openLab(page, 'combat');
  await page.selectOption('#resolution', '1.5'); await page.selectOption('#shadows', 'dynamic');
  expect(await page.evaluate(() => window.chibi2.scene.renderer.getPixelRatio())).toBe(1.5);
  expect(await page.evaluate(() => window.chibi2.scene.renderer.shadowMap.enabled)).toBe(true);
  await page.evaluate(() => window.chibi2.configure({ resolution: 1, shadows: 'contact' }));
  await expect(page.locator('#resolution')).toHaveValue('1'); await expect(page.locator('#shadows')).toHaveValue('contact');
  await page.waitForFunction(() => window.chibi2.fx.stats().batchedSprites > 5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(() => {
    const lab = window.chibi2;
    lab.scene.camera.position.set(4, 3, 6); lab.scene.controls.update();
  });
  await page.waitForTimeout(200);
  const billboardAngle = await page.evaluate(async () => {
    const THREE = await import('three'), lab = window.chibi2;
    const batch = [...lab.fx.spriteBatches.values()].find(b => b.mesh.count > 0);
    const matrix = new THREE.Matrix4(); batch.mesh.getMatrixAt(0, matrix);
    const rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(); matrix.decompose(position, rotation, scale);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
    const cameraNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(lab.scene.camera.quaternion);
    return normal.angleTo(cameraNormal);
  });
  expect(billboardAngle).toBeLessThan(0.01);
  const result = await page.evaluate(async () => {
    const lab = window.chibi2, before = { ...lab.state };
    const rows = await lab.benchmark({ frames: 12, warmup: 8 });
    return { rows, before, after: { ...lab.state }, shadows: lab.scene.renderer.shadowMap.enabled, resolution: lab.scene.renderer.getPixelRatio() };
  });
  expect(result.rows).toHaveLength(3); expect(result.rows.every(r => r.frameAvg > 0 && r.frameP95 > 0 && r.frames === 12)).toBe(true);
  expect(result.rows.map(r => r.settings)).toEqual(Array(3).fill(result.rows[0].settings));
  expect(result.shadows).toBe(false); expect(result.resolution).toBe(1);
  for (const key of Object.keys(result.before)) expect(result.after[key]).toEqual(result.before[key]);
  await expect(page.locator('#results tr')).toHaveCount(3); await expect(page.locator('#download-results')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible(); expect(errors).toEqual([]);
});

test('the full avatar builder keeps Chibi 2 separate from the original renderer', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/avatar-3d/'); await page.waitForFunction(() => window.avatar3d && !window.avatar3d.isBuilding());
  await page.getByRole('button', { name: 'Chibi 2', exact: true }).click();
  await page.waitForFunction(() => !window.avatar3d.isBuilding() && !!window.avatar3d.character.skeleton);
  await expect(page.locator('#status')).toContainText('Chibi 2:');
  await page.locator('.anim-chips .chip', { hasText: /^cast$/ }).click();
  expect(await page.evaluate(() => window.avatar3d.character.anim)).toBe('cast');
  await page.getByRole('button', { name: 'Chibi (procedural)', exact: true }).click();
  await page.waitForFunction(() => !window.avatar3d.isBuilding() && !window.avatar3d.character.skeleton);
  await expect(page.locator('#status')).toContainText('Chibi:');
  await page.evaluate(() => { window.avatar3d.setMode('quaternius'); window.avatar3d.setMode('chibi2'); });
  await page.waitForFunction(() => !window.avatar3d.isBuilding() && window.avatar3d.mode === 'chibi2' && !!window.avatar3d.character.skeleton, null, { timeout: 60000 });
  await expect(page.locator('#status')).toContainText('Chibi 2:'); expect(errors).toEqual([]);
});

test('batched sprites preserve appearance, visibility and disposal', async ({ page }) => {
  const errors = await openLab(page);
  const result = await page.evaluate(async () => {
    const THREE = await import('three');
    const { BatchedSpellFx } = await import('/avatar-3d/js/spellfx-batched.js');
    const lab = window.chibi2; lab.state.paused = true;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 4;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(16, 16, 13, 0, Math.PI * 2); ctx.fill();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const fx = new BatchedSpellFx(scene, { camera, textures: { dot: texture } });
    const sprite = fx._sprite('dot', { size: 0.8, color: '#77bbdd', opacity: 0.65, blending: THREE.NormalBlending });
    sprite.position.set(0.12, 0.08, 0); sprite.scale.y *= 0.7; sprite.material.rotation = 0.35; fx.root.add(sprite);
    const renderer = lab.scene.renderer; renderer.setSize(128, 128, false);
    const gl = renderer.getContext();
    function pixels() { const p = new Uint8Array(128 * 128 * 4); renderer.render(scene, camera); gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; }
    sprite.layers.set(0); fx.batchRoot.visible = false; const original = pixels();
    sprite.layers.set(31); fx.batchRoot.visible = true; fx.update(0); const batched = pixels();
    let difference = 0, colored = 0;
    for (let i = 0; i < original.length; i += 4) { for (let j = 0; j < 3; j++) difference += Math.abs(original[i + j] - batched[i + j]); if (batched[i + 2] > 30) colored++; }
    sprite.visible = false; fx.update(0); const hidden = fx.renderedSprites;
    sprite.visible = true; fx.root.visible = false; fx.update(0); const parentHidden = fx.renderedSprites;
    fx.root.visible = true;
    for (let i = 0; i < 100; i++) fx.root.add(fx._sprite('dot', { size: 0.05, blending: THREE.NormalBlending }));
    fx.update(0); const count = fx.renderedSprites, batches = fx.stats().batches;
    sprite.material.dispose(); const deleted = !fx.spriteRecords.has(sprite);
    fx.dispose(); const remaining = scene.children.length; texture.dispose(); lab.scene.resize();
    return { difference: difference / (128 * 128 * 3), colored, hidden, parentHidden, count, batches, deleted, remaining };
  });
  expect(result.difference).toBeLessThan(2); expect(result.colored).toBeGreaterThan(200);
  expect(result.hidden).toBe(0); expect(result.parentHidden).toBe(0);
  expect(result.count).toBe(101); expect(result.batches).toBe(1); expect(result.deleted).toBe(true); expect(result.remaining).toBe(0);
  expect(errors).toEqual([]);
});

test('comparison controls and mobile framing stay usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openLab(page);
  await page.getByRole('button', { name: 'Side by side', exact: true }).click();
  await page.waitForFunction(() => window.chibi2.actors.length === 2 && !window.chibi2.building);
  await page.selectOption('#animation', 'wave');
  await expect(page.locator('#pair-labels')).toBeVisible();
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await page.waitForFunction(() => window.chibi2.actors.length === 1 && !window.chibi2.building);
  await page.selectOption('#preset', '2');
  await page.waitForFunction(() => !window.chibi2.building);
  const bounds = await page.evaluate(() => {
    const lab = window.chibi2, camera = lab.scene.camera;
    camera.updateMatrixWorld();
    const group = lab.actors[0].ctrl.group; group.updateMatrixWorld(true);
    const head = lab.actors[0].ctrl.parts.head.position.clone(); lab.actors[0].ctrl.parts.head.getWorldPosition(head); head.project(camera);
    const canvas = document.querySelector('#stage canvas');
    const small = document.createElement('canvas'); small.width = small.height = 64; const ctx = small.getContext('2d');
    lab.scene.renderer.render(lab.scene.scene, camera); ctx.drawImage(canvas, 0, 0, 64, 64);
    const pixels = ctx.getImageData(0, 0, 64, 64).data; let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 125 && pixels[i + 1] < 130) dark++;
    return { scroll: document.documentElement.scrollWidth, width: innerWidth, head: head.toArray(), dark };
  });
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width); expect(Math.abs(bounds.head[0])).toBeLessThan(1); expect(Math.abs(bounds.head[1])).toBeLessThan(1); expect(bounds.dark).toBeGreaterThan(60);
  await page.screenshot({ path: 'test-results/chibi2-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('Emberveil opt-in stages Chibi 2 fighters and completes spells', async ({ page }) => {
  test.setTimeout(120000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/prototypes/emberveil/?quality=low');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  await page.click('#btn-new'); await page.click('#btn-suggest'); await page.click('#btn-start');
  await page.waitForFunction(() => window.emberveil.stage?.chars.size >= 4, null, { timeout: 60000 });
  const result = await page.evaluate(async () => {
    const E = window.emberveil; E.talk.muted = true;
    const stage = E.stage, party = [...stage.chars.values()].filter(c => c.side === 'left');
    const enemies = party.slice(0, 4).map((c, i) => ({ ...c.ch, id: 'chibi2-test-' + i }));
    await stage.setSide(enemies, 'right');
    const source = party[0].ch.id, target = enemies[0].id;
    await stage.cast(source, target, { element: 'fire' }); stage.impact(target, 'fire');
    stage.status(target, 'regen', true);
    const bones = [...stage.chars.values()].filter(c => c.ctrl.skeleton).length;
    return { count: stage.chars.size, bones, batched: typeof stage.fx.syncSprites === 'function', status: stage.statusesOn(target) };
  });
  expect(result.count).toBeGreaterThanOrEqual(8); expect(result.bones).toBeGreaterThanOrEqual(8);
  expect(result.batched).toBe(true); expect(result.status).toContain('regen'); expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/chibi2-emberveil.png' });
});
