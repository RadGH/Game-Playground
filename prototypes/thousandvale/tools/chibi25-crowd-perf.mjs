// Chibi 2.5 adoption (2026-10-16): how long Thousandvale's bodies take to build, Chibi 2 against Chibi 2.5.
// Builds one template per class look (all 31 classes, four races, Thousandvale's real clip list) from a cold cache,
// then the same looks again (the cache hit a town square full of the same class pays).
//   node --import ../../avatar-3d/tests/three-register.mjs tools/chibi25-crowd-perf.mjs [--n=31]
import { readFileSync } from 'node:fs';
import { randomAvatar, makeRng } from '../../../avatar-2d/js/random.js';
import { partIds } from '../../../avatar-2d/js/parts/index.js';
import { randomChibi2 } from '../../../avatar-3d/js/chibi2-races.js';
import { dressAs } from '../../../avatar-3d/js/class-outfits.js';
import { createChibi2Character } from '../../../avatar-3d/js/chibi2.js';
import { CHIBI2_MOUNT_ANIMS } from '../../../avatar-3d/js/mounts.js';
import { CHIBI2_DUAL_ANIMS, CHIBI2_ANGLE_ANIMS, CHIBI2_REVIVE_ANIMS } from '../../../avatar-3d/js/chibi2-motion-dual.js';
import { CHIBI2_PROF_ANIMS } from '../../../avatar-3d/js/chibi2-motion-prof.js';

const at = p => new URL(p, import.meta.url);
const presets = JSON.parse(readFileSync(at('../../../avatar-2d/data/presets.json')));
const outfits = { ...JSON.parse(readFileSync(at('../../../avatar-3d/data/class-outfits.json'))).classes, ...(JSON.parse(readFileSync(at('../data/class-outfits-tv.json'))).classes || {}) };
const ANIMS = ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead', 'swim', 'sitGround', 'drink', 'cheer', 'bowGreet', 'point', 'dance', ...CHIBI2_MOUNT_ANIMS, ...CHIBI2_DUAL_ANIMS, ...CHIBI2_ANGLE_ANIMS, ...CHIBI2_REVIVE_ANIMS, ...CHIBI2_PROF_ANIMS];
const N = +(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 99);
const races = ['human', 'elf', 'dwarf', 'halfling'];
const looks = Object.entries(outfits).slice(0, N).map(([cls, o], i) => {
  const base = randomChibi2(randomAvatar, presets, { race: races[i % 4], seed: 1000 + i, makeRng, known: (s, id) => partIds(s).includes(id) });
  return { cls, robe: /robe|dress|cassock|gown|coat|trench|surcoat|skirt|kilt/.test(o.top?.id + ' ' + o.bottom?.id), a: dressAs(base, o) };
});
const out = {};
for (const v25 of [false, true]) {
  const cold = [], warm = [];
  for (const L of looks) {
    const t0 = performance.now(); const b = await createChibi2Character(L.a, { anims: ANIMS, v25 }); cold.push({ ms: performance.now() - t0, robe: L.robe, cls: L.cls });
    const t1 = performance.now(); const b2 = await createChibi2Character(L.a, { anims: ANIMS, v25 }); warm.push(performance.now() - t1);
    b2.dispose(); b.dispose();
  }
  const st = xs => { const s = [...xs].sort((p, q) => p - q); return { mean: +(s.reduce((n, x) => n + x, 0) / s.length).toFixed(1), median: +s[s.length >> 1].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
  out[v25 ? 'chibi25' : 'chibi2'] = { looks: looks.length, coldAll: st(cold.map(c => c.ms)), coldRobed: st(cold.filter(c => c.robe).map(c => c.ms)), coldPlain: st(cold.filter(c => !c.robe).map(c => c.ms)), cached: st(warm), slowest: cold.sort((p, q) => q.ms - p.ms).slice(0, 4).map(c => `${c.cls} ${c.ms.toFixed(0)}ms`) };
}
console.log(JSON.stringify(out, null, 1));
