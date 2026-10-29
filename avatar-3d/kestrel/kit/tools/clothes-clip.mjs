// Kestrel kit — no-clip report for clothing (batch 4): builds looks and prints where anything comes out through a garment.
//   node --import ./avatar-3d/tests/three-register.mjs avatar-3d/kestrel/kit/tools/clothes-clip.mjs [wardrobe|worn|long|races] [clips=core|game|a,b] [only=label-substring]
import { measureLook, TOL } from '../tests/clothes-check.js';
import { wardrobeLooks, wornLooks, longLooks, GAME_CLIPS, CORE_CLIPS } from '../tests/clothes-looks.js';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.includes('=') ? a.split('=') : [a, true]));
const set = ['wardrobe', 'worn', 'long', 'races'].find(k => args[k]) || 'wardrobe';
const clips = args.clips === 'game' ? GAME_CLIPS : args.clips && args.clips !== 'core' ? args.clips.split(',') : CORE_CLIPS;
let looks = set === 'worn' ? wornLooks() : set === 'long' ? longLooks() : set === 'races' ? wardrobeLooks({ races: ['dwarf', 'elf', 'halfling'], classes: ['warrior', 'mage', 'ranger', 'knight', 'monk', 'tactician', 'bard', 'druid'] }) : wardrobeLooks();
if (args.only) looks = looks.filter(l => l.label.includes(args.only));
let bad = 0, t0 = performance.now();
for (const L of looks) {
  const r = await measureLook(L.look, { clips });
  const agg = list => { const m = new Map(); for (const e of list) { const k = `${e.inner}>${e.garment}@${e.clip}`; m.set(k, Math.max(m.get(k) || 0, e.depth)); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${(v * 1000).toFixed(1)}`).join(', '); };
  const ok = r.countLayer === 0 && r.countSkirt === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${L.label.padEnd(30)} tris ${r.stats.triangles} bones ${r.stats.bones} | layer ${r.countLayer} (${(Math.max(0, r.maxLayer) * 1000).toFixed(1)}mm) skirt ${r.countSkirt} (${(Math.max(0, r.maxSkirt) * 1000).toFixed(1)}mm)${ok ? '' : '\n      L: ' + agg(r.layer) + '\n      S: ' + agg(r.skirt)}`);
}
console.log(`${looks.length} looks, ${bad} with clipping over ${TOL * 1000} mm, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
