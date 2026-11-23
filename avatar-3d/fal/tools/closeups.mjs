#!/usr/bin/env node
// Close-ups of armed enemies' hands and shields on the real page (three.js, the same code games use).
//   node avatar-3d/fal/tools/closeups.mjs <out.png> <body> [<body> …]      (needs the dev server on 8401)
// One row per body: idle front, idle side, weapon-ready front, weapon-ready side, each framed on the chest and both
// hands. Side = the body's own left (shield arm) toward the camera. Env CLIPS="idle,ready" to change the clips;
// FOCUS=hand_r (or hand_l) frames that hand alone, close (the grip), side view from the hand's own side.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [out, ...ids] = process.argv.slice(2);
const BASE = process.env.FAL_URL || 'http://localhost:8401/avatar-3d/fal/index.html';
const clips = (process.env.CLIPS || 'idle,ready').split(',');
const W = 300, H = 300;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const tiles = [];
for (const id of ids) {
  for (const clip of clips) {
    await page.goto(`${BASE}?tab=enemies&enemy=${id}&eclip=${clip}`);
    await page.waitForFunction(() => window.__fal?.ready || window.__fal?.errors.length, null, { timeout: 120000 });
    await page.waitForTimeout(1200);
    for (const view of ['front', 'side']) {
      const err = await page.evaluate(([view, focus]) => {
        const f = window.__fal, c = f.enemies[0], v = f.view, T = v.THREE;
        if (!c) return 'no enemy';
        v.setTurntable(0);
        c.group.rotation.y = view === 'side' ? (focus === 'hand_r' ? Math.PI / 2 : -Math.PI / 2) : 0;   // side: that hand's side toward the camera
        c.group.updateMatrixWorld(true);
        const p = n => { const b = c.bones[n]; return b ? b.getWorldPosition(new T.Vector3()) : null; };
        const hr = p('hand_r'), hl = p('hand_l'), ch = p('spine_03') || p('hips');
        let mid = new T.Vector3().addVectors(hr || ch, hl || ch).multiplyScalar(0.5).lerp(ch, 0.3);
        let span = Math.max(0.5, (hr && hl ? hr.distanceTo(hl) : 0.5) * 1.5, (c.def.height || 1) * 0.55);
        if (focus) { const h = p(focus), e = p(focus.replace('hand', 'lowerarm')); mid = h.clone().lerp(e, -0.25); span = (c.def.height || 1) * 0.3; }
        const t = Math.tan(v.camera.fov * Math.PI / 360);
        v.controls.target.copy(mid); v.camera.position.set(mid.x, mid.y + span * 0.1, mid.z + span / 2 / t / Math.min(1, v.camera.aspect));
        v.controls.update(); return null;
      }, [view, process.env.FOCUS || '']);
      if (err) throw new Error(id + ': ' + err);
      await page.waitForTimeout(250);
      const shot = await page.screenshot({ clip: await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); const s = Math.min(r.width, r.height); return { x: r.x + (r.width - s) / 2, y: r.y + (r.height - s) / 2, width: s, height: s }; }) });
      tiles.push({ id, clip, view, shot });
    }
  }
}
// compose with a canvas in the page
const data = tiles.map(t => 'data:image/png;base64,' + t.shot.toString('base64'));
const png = await page.evaluate(async ({ data, cols, W, H, labels }) => {
  const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = Math.ceil(data.length / cols) * (H + 18);
  const g = cv.getContext('2d'); g.fillStyle = '#14171d'; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < data.length; i++) {
    const im = new Image(); im.src = data[i]; await im.decode();
    const x = (i % cols) * W, y = Math.floor(i / cols) * (H + 18);
    g.drawImage(im, x, y + 18, W, H); g.fillStyle = '#e8e4da'; g.font = '13px sans-serif'; g.fillText(labels[i], x + 6, y + 13);
  }
  return cv.toDataURL('image/png');
}, { data, cols: clips.length * 2, W, H, labels: tiles.map(t => `${t.id} · ${t.clip} · ${t.view}`) });
writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
console.log('closeups', out, tiles.length);
await browser.close();
