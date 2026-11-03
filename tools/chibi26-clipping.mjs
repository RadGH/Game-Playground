// Reproducible M6 2.6 clothing/gear check. Run with:
// node --import ./avatar-3d/tests/three-register.mjs tools/chibi26-clipping.mjs > avatar-3d/data/chibi26-clipping.json
import { readFileSync } from 'node:fs';
import { buildMeasured, clipCheck, robeCheck } from './chibi25-measure.mjs';
import { CHIBI26_ALL_ANIMS } from '../avatar-3d/js/chibi26-motion.js';
import { dressAs } from '../avatar-3d/js/class-outfits.js';

const base = JSON.parse(readFileSync(new URL('../avatar-2d/data/presets.json', import.meta.url))).presets[0].avatar;
const classes = JSON.parse(readFileSync(new URL('../avatar-3d/data/class-outfits.json', import.meta.url))).classes;
const spread = [
  ['mage-robe-staff', 'mage', 'long'],
  ['armour-shield', 'warrior', 'short'],
  ['heavy-cape-twohand', 'fighter', 'short'],
  ['nature-hair-pack', 'druid', 'long'],
].map(([name, id, hair], i) => {
  const look = dressAs(base, classes[id]);
  look.body = { ...(look.body || {}), race: ['human','elf','dwarf','orc'][i], form: i % 2 ? 'masc' : 'fem' };
  look.hair = { ...(look.hair || {}), id: hair === 'long' ? (i === 0 ? 'long' : 'braid') : 'short' };
  look.hat = { ...(look.hat || {}), id: classes[id].hat?.id || 'none' };
  return [name, look];
});
const report = { version: '2.6', clips: CHIBI26_ALL_ANIMS.length, samplesPerClip: 4, sampleUpdateMaxSeconds: 0.08, spread: [], note: 'Proxy results use CPU-skinned vertices; each reported clip time is reached using updates of at most 0.08 s. Robe ray-profile gaps are approximate. Positive body-solid depth above 0.004 m is a clipping event.' };
for (const [name, look] of spread) {
  const measured = await buildMeasured(look, { v25: true, v26: true, trace: true, anims: CHIBI26_ALL_ANIMS });
  const clips = clipCheck(measured, CHIBI26_ALL_ANIMS, { steps: 4 });
  const robes = robeCheck(measured, CHIBI26_ALL_ANIMS, { steps: 4 });
  const bodyEvents = Object.entries(clips).flatMap(([clip, pairs]) => Object.entries(pairs).map(([pair, r]) => ({ clip, pair, frames: r.frames, vertices: r.n, deepestM: r.deep, at: r.at })).filter(r => r.vertices));
  const skirtEvents = Object.entries(robes).filter(([, r]) => r.pokes).map(([clip, r]) => ({ clip, frames: r.pokeFrames, vertices: r.pokes, minGapM: r.minGap, worst: r.worst }));
  report.spread.push({ name, triangles: measured.actor.stats().triangles, bodyEvents, skirtEvents });
  measured.actor.dispose();
}
report.totals = {
  bodyPairsWithEvents: report.spread.reduce((n, s) => n + s.bodyEvents.length, 0),
  skirtClipsWithEvents: report.spread.reduce((n, s) => n + s.skirtEvents.length, 0),
  bodyVerticesInside: report.spread.reduce((n, s) => n + s.bodyEvents.reduce((m, e) => m + e.vertices, 0), 0),
};
console.log(JSON.stringify(report, null, 2));
