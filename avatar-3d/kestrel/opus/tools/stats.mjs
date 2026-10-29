// Kestrel (opus) — write stats.json (CONTRACT §6) from headless builds.
//   node --import ./avatar-3d/tests/three-register.mjs avatar-3d/kestrel/opus/tools/stats.mjs
import { writeFileSync } from 'node:fs';
import { createKestrelCharacter, kestrelCacheStats } from '../js/kestrel.js';
import { lookFor } from '../../js/looks.js';
const out = { about: 'Headless numbers (node, this VM). buildMs = first build of that look in this process (the very first build also pays JIT warm-up: coldMs); cachedMs = the same look again.', male: {}, female: {}, outfit: {} };
const t0 = performance.now(); const warm = await createKestrelCharacter(lookFor('male')); out.coldMs = Math.round(performance.now() - t0); warm.dispose();
for (const body of ['male', 'female']) {
  for (const outfit of [false, true]) {
    const look = lookFor(body, outfit); look.body.width += 0.001;          // a look this process has not built yet
    const a0 = performance.now(); const a = await createKestrelCharacter(look); const ms = performance.now() - a0;
    const b0 = performance.now(); const b = await createKestrelCharacter(look); const cached = performance.now() - b0;
    const l1 = await createKestrelCharacter(look, { lod: 1 });
    const s = a.stats();
    const row = { triangles: s.triangles, drawCalls: s.drawCalls, bones: s.bones, textures: s.textures, buildMs: Math.round(ms), cachedMs: +cached.toFixed(1), lod1Triangles: l1.stats().triangles, height: +a.metrics().height.toFixed(3) };
    if (outfit) out.outfit[body] = { ...row, addsTriangles: s.triangles - out[body].triangles };
    else out[body] = row;
    a.dispose(); b.dispose(); l1.dispose();
  }
}
out.cache = kestrelCacheStats();
writeFileSync(new URL('../stats.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
