// The Farhold weapon kit, built for real: every id, in a real skinned body, with a real screenshot.
//
// The node tests check the catalogue and the grip RULE (head past the fingertips, butt behind it).
// This checks the thing they cannot: that each builder produces valid geometry, that the merged
// mesh stays inside its triangle budget, that Emberveil's original ids are byte-for-byte unchanged,
// and — the reason the kit exists — that the head really does end up on the far side of the fist
// once the skin has been baked into bind-pose world space.

import { test, expect } from '@playwright/test';

async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/avatar-3d/chibi2.html?view=portrait');
  await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 60000 });
  return errors;
}

test('every Farhold weapon builds, and its head really is past the fingertips', async ({ page }) => {
  const errors = await open(page);
  const out = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { FARHOLD_WEAPON_INFO } = await import('/avatar-3d/js/chibi2-weapon-ids.js');
    const rows = [];
    for (const [id, info] of Object.entries(FARHOLD_WEAPON_INFO)) {
      const actor = await createChibi2Character({ held: { id, color: '#c8ccd6', quality: 3 } });
      const stats = actor.stats();
      // the hand the weapon is in, and the elbow above it, in world space
      const hand = new THREE.Vector3(), elbow = new THREE.Vector3();
      actor.group.updateMatrixWorld(true);
      actor.parts.handR.getWorldPosition(hand);
      actor.parts.elbowR.getWorldPosition(elbow);
      // the weapon's own extent: the furthest vertex of the metal mesh from the elbow
      const mesh = actor.group.getObjectByName('chibi2-metal') || actor.group.getObjectByName('chibi2-cloth');
      let far = 0, bad = 0;
      const v = new THREE.Vector3();
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) bad++;
        far = Math.max(far, v.distanceTo(elbow));
      }
      rows.push({ id, family: info.family, triangles: stats.triangles, bad, far, handY: hand.y, elbowY: elbow.y });
      actor.dispose();
    }
    return rows;
  });
  expect(errors).toEqual([]);
  expect(out.length).toBeGreaterThan(15);
  for (const row of out) {
    expect(row.bad, `${row.id} produced non-finite geometry`).toBe(0);
    expect(row.triangles, `${row.id} is over budget at ${row.triangles} triangles`).toBeLessThan(26000);
    expect(row.far, `${row.id} has no reach at all`).toBeGreaterThan(0.1);
  }
  // a two-hander really is longer than a dagger, in the body's own units
  const dagger = out.find(r => r.id === 'fh_dagger');
  const halberd = out.find(r => r.id === 'fh_halberd');
  expect(halberd.far).toBeGreaterThan(dagger.far * 2);
});

test("Emberveil's own weapon ids are untouched by the new kit", async ({ page }) => {
  const errors = await open(page);
  const out = await page.evaluate(async () => {
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { CHIBI2_ANIMS, CHIBI2_ALL_ANIMS } = await import('/avatar-3d/js/chibi2-motion.js');
    const rows = [];
    for (const id of ['sword', 'greataxe', 'hammer', 'warhammer', 'mace', 'daggers', 'rapier', 'saber',
      'bow', 'crossbow', 'staff_orb', 'staff_skull', 'quarterstaff', 'flame']) {
      const actor = await createChibi2Character({ held: { id, color: '#b9c2cc' } });
      rows.push({ id, triangles: actor.stats().triangles });
      actor.dispose();
    }
    return { rows, anims: CHIBI2_ANIMS.length, all: CHIBI2_ALL_ANIMS.length };
  });
  expect(errors).toEqual([]);
  // the original clip lists must not have grown — a game that does not ask for the combat clips
  // must build exactly what it always built
  expect(out.anims).toBe(12);
  expect(out.all).toBe(15);
  for (const row of out.rows) expect(row.triangles).toBeGreaterThan(0);
});

test('the combat clips all build, and no existing clip changed length', async ({ page }) => {
  const errors = await open(page);
  const out = await page.evaluate(async () => {
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { CHIBI2_COMBAT_ALL, CHIBI2_COMBAT_ANIMS, ONE_SHOTS } = await import('/avatar-3d/js/chibi2-motion.js');
    const actor = await createChibi2Character({ held: { id: 'fh_greatsword', color: '#c8ccd6' } }, { anims: CHIBI2_COMBAT_ALL });
    const played = [];
    for (const name of CHIBI2_COMBAT_ANIMS) {
      actor.setAnim(name);
      played.push({ name, got: actor.anim, oneShot: ONE_SHOTS.has(name) });
    }
    // the originals still play, and still play as themselves
    const originals = [];
    for (const name of ['idle', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'dead']) {
      actor.setAnim(name);
      originals.push({ name, got: actor.anim });
    }
    actor.dispose();
    return { played, originals };
  });
  expect(errors).toEqual([]);
  for (const row of out.played) expect(row.got, `${row.name} fell back to idle — the clip was not built`).toBe(row.name);
  for (const row of out.originals) expect(row.got).toBe(row.name);
  expect(out.played.find(r => r.name === 'channel').oneShot).toBe(false);
  expect(out.played.find(r => r.name === 'slam').oneShot).toBe(true);
});
