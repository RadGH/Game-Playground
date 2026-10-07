// A contact sheet of round-5 gear (g5_ ids), for LOOKING at rather than asserting on.
//
// Skipped unless G5_IDS is set, so the normal suite never pays for it. One WebGL renderer draws every cell
// and each frame is copied onto a 2D canvas (a browser drops the oldest of many live WebGL contexts).
//
//   G5_IDS=g5_kris,g5_leafblade G5_OUT=blades \
//     flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/tests/gear5-shots.spec.js
//
//   G5_IDS    comma list of ids from chibi2-gear5-ids.js — or any old part as slot:id (held:fh_sword, hat:hood)
//   G5_OUT    file name (no extension) under G5_DIR                       default "sheet"
//   G5_DIR    output directory                                            default /tmp/claude-1000/g5-shots/
//   G5_VIEWS  comma list of views for every model, each `preset[@anim]`   default depends on the slot
//             presets: front back left right handR handL head headBack chest chestBack legs legsBack feet hips
//   G5_EXTRA  a JSON avatar patch merged into every model (e.g. '{"top":{"id":"g5_plate_cuirass"}}')
//   G5_OFF    "1": put each held id in the OFF hand too (dual wield check)
//   G5_CELL   cell size "WxH"                                              default 280x340
import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { G5_TABLES } from '../js/chibi2-gear5-ids.js';

const IDS = (process.env.G5_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const DIR = process.env.G5_DIR || '/tmp/claude-1000/g5-shots';
const DEFAULT_VIEWS = {
  held: 'front,right@ready,itemR', offhand: 'front,left@ready,itemL', hat: 'head,headBack', top: 'chest,chestBack', gloves: 'front,handR,handL',
  bottom: 'legs,legsBack', shoes: 'feet,legsBack', cape: 'back,left', decor: 'hips,back', accessory: 'chest,head', ring: 'handR,handL',
};

test('g5 contact sheet', async ({ page }) => {
  test.skip(!IDS.length, 'set G5_IDS to draw a sheet');
  test.setTimeout(240_000);
  const models = IDS.map(raw => {
    if (raw.includes(':')) { const [slot, id] = raw.split(':'); return { id, slot, field: null, color: null }; }
    const t = G5_TABLES.find(t => t.table[raw]);
    if (!t) throw new Error('unknown g5 id ' + raw);
    return { id: raw, slot: t.slot, field: t.field || null, color: t.table[raw].color || null, color2: t.table[raw].color2 || null, hands: t.table[raw].hands || null, hold: t.table[raw].hold || t.table[raw].left || null };
  });
  const [cw, ch] = (process.env.G5_CELL || '280x340').split('x').map(Number);
  const opts = { models, views: process.env.G5_VIEWS || null, defaults: DEFAULT_VIEWS, extra: process.env.G5_EXTRA ? JSON.parse(process.env.G5_EXTRA) : null, off: process.env.G5_OFF === '1', cw, ch };
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto('/avatar-3d/chibi2.html?view=portrait');
  await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 60000 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.evaluate(async (o) => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    document.body.innerHTML = '<div id="grid" style="display:flex;flex-wrap:wrap;width:1740px;background:#3a3f4a"></div>';
    document.body.style.cssText = 'margin:0;background:#3a3f4a;overflow:auto';
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(o.cw, o.ch);
    const sc = new THREE.Scene(); sc.background = new THREE.Color('#59606e');
    sc.add(new THREE.HemisphereLight('#ffffff', '#55556a', 2.0));
    const dl = new THREE.DirectionalLight('#fff', 1.6); dl.position.set(2, 4, 3); sc.add(dl);
    const dl2 = new THREE.DirectionalLight('#fff', 0.8); dl2.position.set(-3, 2, -3); sc.add(dl2);
    const cam = new THREE.PerspectiveCamera(30, o.cw / o.ch, 0.05, 40);
    const merge = (a, p) => { for (const [k, v] of Object.entries(p || {})) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(a[k] || {}), ...v } : v; return a; };
    // full-body presets: [camera offset from the body centre, look-at height]; bone presets: [bone, offset, distance]
    const FULL = { front: [[1.9, 0.5, 4.0], 0.82], back: [[-1.9, 0.6, -4.0], 0.82], left: [[4.3, 0.4, 1.1], 0.82], right: [[-4.3, 0.4, 1.1], 0.82] };
    const BONE = {
      handR: ['handR', [-0.9, 0.35, 1.0], 1.9], handL: ['handL', [0.9, 0.35, 1.0], 1.9], head: ['head', [0.5, 0.25, 1.6], 2.3, [0, 0.3, 0]], headBack: ['head', [-0.7, 0.3, -1.5], 2.3, [0, 0.3, 0]],
      chest: ['chest', [0.6, 0.25, 1.9], 2.7, [0, 0.05, 0]], chestBack: ['chest', [-0.7, 0.3, -1.9], 2.7, [0, 0.05, 0]],
      legs: ['hips', [0.6, 0.1, 1.9], 2.9, [0, -0.3, 0]], legsBack: ['hips', [-0.7, 0.15, -1.9], 2.9, [0, -0.3, 0]], feet: ['hips', [0.8, 0.5, 1.5], 2.2, [0, -0.55, 0]], hips: ['hips', [0.9, 0.2, 1.7], 2.2, [0, 0, 0]],
    };
    for (const m of o.models) {
      const avatar = { top: { id: 'tshirt', color: '#cdbf9f' }, bottom: { id: 'shorts', color: '#6b5a44' }, shoes: { id: 'wraps', color: '#8a7a62' }, hair: { id: 'short', color: '#3b2a1a' } };
      const part = { id: m.id, ...(m.color ? { color: m.color } : {}), ...(m.color2 ? { color2: m.color2 } : {}), quality: 3 };
      if (m.field === 'ring') merge(avatar, { accessory: { ring: part, ring2: part } });
      else if (m.field) merge(avatar, { [m.slot]: { [m.field]: part } });
      else merge(avatar, { [m.slot]: part });
      if (o.off && m.slot === 'held') merge(avatar, { offhand: part });
      merge(avatar, o.extra);
      const kind = m.field || m.slot;
      const views = (o.views || o.defaults[kind] || 'front,back').split(',');
      const wrap = document.createElement('div'); wrap.style.cssText = 'position:relative;margin:2px;border:1px solid #222';
      const lab = document.createElement('div'); lab.textContent = m.id; lab.style.cssText = 'position:absolute;left:4px;top:2px;color:#fff;font:bold 13px sans-serif;text-shadow:0 0 3px #000;z-index:2';
      wrap.appendChild(lab); document.getElementById('grid').appendChild(wrap);
      let actor;
      try { actor = await createChibi2Character(avatar); } catch (e) { lab.textContent = m.id + ' FAILED: ' + e.message; lab.style.color = '#f66'; continue; }
      sc.add(actor.group);
      for (const v of views) {
        const [preset, anim = 'idle'] = v.split('@');
        actor.setAnim(anim, 0); actor.update(0.45);
        actor.group.updateMatrixWorld(true);
        if (FULL[preset]) { const [p, y] = FULL[preset]; cam.position.set(...p); cam.lookAt(0, y, 0); }
        else if (preset === 'itemR' || preset === 'itemL') {
          // look at the thing in the hand rather than the hand: a point along the grip's own y axis
          const side = m.hold === 'none' && m.slot === 'held' ? 'L' : preset.slice(-1), off = m.hold === 'staff' ? 0.45 : m.hold === 'heavy' || m.hold === 'polearm' ? -0.75 : m.hold === 'shield' ? 0 : m.hold === 'orb' || m.hold === 'caster' || m.hold === 'none' || m.hold === 'crossbow' ? 0.1 : -0.28;
          const dist = Math.abs(off) > 0.4 ? 3.0 : 1.9;
          const t = actor.parts['grip' + side].localToWorld(new THREE.Vector3(0, off, 0.06));
          cam.position.copy(t).add(new THREE.Vector3(side === 'R' ? -0.9 : 0.9, 0.3, 1.0).normalize().multiplyScalar(dist)); cam.lookAt(t);
        } else {
          const [bone, dir, dist, lift = [0, 0, 0]] = BONE[preset] || BONE.chest;
          const t = new THREE.Vector3(); actor.parts[bone].getWorldPosition(t); t.add(new THREE.Vector3(...lift));
          cam.position.copy(t).add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist)); cam.lookAt(t);
        }
        r.render(sc, cam);
        const cv = document.createElement('canvas'); cv.width = o.cw; cv.height = o.ch; cv.getContext('2d').drawImage(r.domElement, 0, 0);
        cv.style.display = 'inline-block'; cv.title = v; wrap.appendChild(cv);
      }
      const st = actor.stats(); lab.textContent += `  (${st.triangles} tris)`;
      sc.remove(actor.group); actor.dispose();
    }
  }, opts);
  mkdirSync(DIR, { recursive: true });
  await page.locator('#grid').screenshot({ path: `${DIR}/${process.env.G5_OUT || 'sheet'}.png` });
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
});
