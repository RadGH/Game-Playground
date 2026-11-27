// Measures every basic-attack swing from the REAL clips (owner report #138: auto attacks get a swing trail like
// Cleave that follows the swing's direction and motion, one per weapon kind whose animation differs). For each kind in
// data/swing-visuals.json it builds a Tabard hero holding that kind's sample weapon, plays the kind's clip exactly as
// the game does (0.12 s blend from idle), samples the weapon holder (its origin = the grip, its +Z = along the blade)
// 60 times a second in the body's own frame, finds the stroke (the fastest stretch of the tip) and writes it back as
// kinds[kind].path = [[t, hx, hy, hz, dx, dy, dz], ...] plus `contact` (the tip's fastest moment) and `blade`
// ([grip-to-back-end, grip-to-tip] metres of the sample weapon). render/swings.js draws the trail along that path on
// the clip's own clock, so a re-timed or new clip only needs this tool run again.
//   flock /tmp/oathwild-browser.lock node prototypes/oathwild/tools/measure-swings.mjs [--base http://localhost:8401] [--dry]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:8401');
const file = new URL('../data/swing-visuals.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const jobs = Object.entries(data.kinds).filter(([, k]) => k.measure).map(([id, k]) => ({ id, ...k.measure, clip: k.measure.clip || k.clip, hand: k.measure.hand || 'hand_r' }));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(`${base}/prototypes/oathwild/editor/`);   // any page with the game's import map
await page.waitForTimeout(1500);
const res = await page.evaluate(async jobs => {
  const T = await import('/avatar-3d/tabard/js/tabard.js');
  const THREE = await import('three');
  const out = {};
  for (const j of jobs) {
    const tb = await T.createTabard({ body: 'male', items: j.item ? [j.item] : [], clip: 'idle' });
    new THREE.Scene().add(tb.group);
    const holder = j.item ? tb.bones[j.hand].children.find(c => /@/.test(c.name)) : null;
    const from = holder || tb.bones[j.hand];
    let blade = [0, 0.1];
    if (holder) {                                     // the weapon's extent along its own +Z, from the grip
      tb.update(0); holder.updateMatrixWorld(true);
      const inv = holder.matrixWorld.clone().invert(), bb = new THREE.Box3();
      holder.traverse(m => { if (m.isMesh) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv)); } });
      blade = [+bb.min.z.toFixed(2), +bb.max.z.toFixed(2)];
    }
    tb.play('idle', 0); for (let i = 0; i < 30; i++) tb.update(1 / 30);
    tb.play(j.clip, 0.12);
    const s = [], p = new THREE.Vector3(), q = new THREE.Vector3(), inv = new THREE.Matrix4();
    for (let i = 0; i <= 60 * 1.4; i++) {
      if (i) tb.update(1 / 60);
      tb.group.updateMatrixWorld(true); inv.copy(tb.group.matrixWorld).invert();
      p.setFromMatrixPosition(from.matrixWorld).applyMatrix4(inv);
      // the blade's direction: the holder's +Z (a bare fist: straight up, a short band across the knuckles)
      if (holder) q.set(0, 0, 1).transformDirection(from.matrixWorld).transformDirection(inv); else q.set(0, 1, 0);
      s.push([i / 60, p.x, p.y, p.z, q.x, q.y, q.z]);
    }
    out[j.id] = { s, blade, dur: tb.duration() };
  }
  return out;
}, jobs);
await browser.close();

const r3 = v => Math.round(v * 1000) / 1000;
for (const j of jobs) {
  const { s, blade } = res[j.id];
  const reach = holder => (holder ? blade[1] : 0);
  const tip = q => [q[1] + q[4] * reach(j.item), q[2] + q[5] * reach(j.item), q[3] + q[6] * reach(j.item)];
  const sp = s.map((q, i) => (i ? Math.hypot(...tip(q).map((v, k) => v - tip(s[i - 1])[k])) * 60 : 0));
  // the stroke: from the fastest frame (after the clip's own blend-in, unless the kind says where to look) out to
  // where the tip slows under a quarter of its peak
  const lo = Math.round((j.after ?? 0.05) * 60), hi = Math.round((j.before ?? 1.2) * 60);
  let pk = lo; for (let i = lo; i <= hi; i++) if (sp[i] > sp[pk]) pk = i;
  let a = pk, b = pk; while (a > lo && sp[a - 1] > sp[pk] * 0.25) a--; while (b < hi && sp[b + 1] > sp[pk] * 0.25) b++;
  a = Math.max(0, a - 1); b = Math.min(s.length - 1, b + 1);
  const path = s.slice(a, b + 1).map(q => q.map(r3));
  const k = data.kinds[j.id];
  k.path = path; k.contact = r3(s[pk][0]); k.blade = j.item ? blade : [-0.06, 0.12];
  const t0 = tip(s[a]), t1 = tip(s[b]);
  console.log(j.id.padEnd(10), j.clip.padEnd(13), `stroke ${s[a][0].toFixed(2)}-${s[b][0].toFixed(2)} s, fastest ${s[pk][0].toFixed(2)} s (${sp[pk].toFixed(1)} m/s), tip from`, t0.map(v => v.toFixed(2)).join(','), 'to', t1.map(v => v.toFixed(2)).join(','), 'blade', k.blade.join('..'));
}
if (!process.argv.includes('--dry')) {
  // one keyframe per line keeps the file readable
  const txt = JSON.stringify(data, null, 2).replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2, $3, $4, $5, $6, $7]')
    .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]').replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\s+("[^"]*"),\s+("[^"]*")(,\s+("[^"]*"))?\s+\]/g, (m, a, b, c, d) => `[${a}, ${b}${d ? ', ' + d : ''}]`);
  writeFileSync(file, txt + '\n');
  console.log('wrote', file.pathname);
}
