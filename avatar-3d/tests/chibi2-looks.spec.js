// Chibi 2 look fixes, 2026-09-25 — measured on the real geometry so they cannot come back quietly.
//
//   1. INSIDE OUT. `profile()` faced its surface outward only when its rings climbed; legs, upper
//      arms, hems and robes are written top-to-bottom, so their outer walls were culled ("legs and
//      clothing have textures on the inside-out", "I can see through the front of the robe").
//   2. THE BOB. Its lining was copied after the shell had been placed, so the copy was placed twice
//      and floated above the head as a small cap.
import { test, expect } from '@playwright/test';

async function modulePage(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('avatar-3d/creatures.html');
  await page.waitForFunction(() => !!window.creatures3d, null, { timeout: 60_000 });
  return errors;
}

test('a profile faces outward whichever way its rings run', async ({ page }) => {
  const errors = await modulePage(page);
  const r = await page.evaluate(async () => {
    const THREE = await import('three');
    const { profile } = await import('/avatar-3d/js/chibi2-geometry.js');
    // the share of triangles whose winding normal points away from the axis
    const outward = rings => {
      const g = profile(rings, 12), p = g.attributes.position, idx = g.index.array;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
      let out = 0, all = 0;
      for (let i = 0; i < idx.length; i += 3) {
        a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]);
        n.subVectors(b, a).cross(m.subVectors(c, a));
        if (n.lengthSq() < 1e-12) continue;
        const mid = a.clone().add(b).add(c).divideScalar(3); mid.y = 0;
        all++; if (n.dot(mid) > 0) out++;
      }
      return out / all;
    };
    return {
      up: outward([[0, 0.1, 0.1], [0.5, 0.12, 0.12], [1, 0.1, 0.1]]),
      down: outward([[1, 0.1, 0.1], [0.5, 0.12, 0.12], [0, 0.1, 0.1]]),        // a leg or a robe
      flare: outward([[0.06, 0.2, 0.15], [-0.1, 0.25, 0.2], [-0.8, 0.35, 0.3]]), // a long hem
    };
  });
  expect(r.up, 'rings that climb').toBeGreaterThan(0.95);
  expect(r.down, 'rings written top-to-bottom (legs, arms, robes)').toBeGreaterThan(0.95);
  expect(r.flare, 'a flared hem').toBeGreaterThan(0.95);
  expect(errors).toEqual([]);
});

test('a bob haircut has nothing floating above the head', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await modulePage(page);
  const r = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const top = async a => {
      const ch = await createChibi2Character(a);
      ch.update(0.01); ch.group.updateMatrixWorld(true);
      let y = -Infinity;
      ch.group.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox?.(); const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) y = Math.max(y, p.getY(i)); } });
      ch.dispose(); return y;
    };
    const base = { body: { height: 0.5, width: 0.5, headSize: 0.5, skin: '#e0ac69' }, top: { id: 'tunic', color: '#555' } };
    const bob = await top({ ...base, hair: { id: 'bob', color: '#111' } });
    const short = await top({ ...base, hair: { id: 'short', color: '#111' } });
    return { bob, short };
  });
  // the floating cap sat ~0.2 above the crown; a bob may be a little fuller than short hair, no more
  expect(r.bob - r.short, 'something of the bob stands above the head').toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test('the overhead winds up BEHIND the head and chops down in front', async ({ page }) => {
  // "The third attack (Overhead) still plays the animation that looks like the character is
  // swinging into the air." The old wind lifted the blade up through the front, slowly, and chopped
  // down in a twentieth of a second — the lift was what anybody saw.
  test.setTimeout(90_000);
  const errors = await modulePage(page);
  const track = await page.evaluate(async () => {
    const THREE = await import('three');
    const M = await import('/avatar-3d/js/chibi2-motion.js');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const anims = [...new Set([...M.CHIBI2_ANIMS, ...M.CHIBI2_MELEE_ANIMS, ...M.CHIBI2_COMBAT_ANIMS])];
    const ch = await createChibi2Character({ body: { height: 0.5, width: 0.5, headSize: 0.5 }, held: { id: 'fh_longsword', color: '#ccc' } }, { anims });
    ch.setAnim('overhead', 0, true);
    const grip = ch.parts.gripR, head = ch.parts.head, v = new THREE.Vector3(), d = new THREE.Vector3(), h = new THREE.Vector3();
    const out = [];
    for (let i = 0; i <= 17; i++) {
      ch.group.updateMatrixWorld(true);
      grip.getWorldPosition(v); head.getWorldPosition(h);
      d.set(0, -1, 0).transformDirection(grip.matrixWorld);
      const tip = v.clone().addScaledVector(d, 0.81);
      out.push({ y: tip.y, z: tip.z, headTop: h.y + 0.54 });
      ch.update(0.05);
    }
    ch.dispose();
    return out;
  });
  const top = track.reduce((a, b) => (b.y > a.y ? b : a));
  expect(top.y, 'the blade never gets above the head').toBeGreaterThan(top.headTop);
  const before = track.slice(0, track.indexOf(top));
  const risingInFront = before.filter(t => t.y > 1.0 && t.z > 0.3);
  expect(risingInFront.length, 'the blade rises through the front of the body').toBe(0);
  const end = track.at(-8);
  expect(end.z, 'the chop does not finish in front').toBeGreaterThan(0.4);
  expect(errors).toEqual([]);
});
