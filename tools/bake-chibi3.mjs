// Bake the Chibi 3 presets (avatar-3d/data/chibi3-presets.json) into avatar-3d/data/chibi3-baked/.
// Run after any change to avatar-3d/js/chibi3/: node --import ./avatar-3d/tests/three-register.mjs tools/bake-chibi3.mjs
// The comparison page loads these so it opens in a second instead of building each look live.
import '../avatar-3d/tests/fake-dom.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { bakeLook } = await import('../avatar-3d/js/chibi3/index.js');
const { presets } = JSON.parse(fs.readFileSync(path.join(root, 'avatar-3d/data/chibi3-presets.json')));
const outDir = path.join(root, 'avatar-3d/data/chibi3-baked');
fs.mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
for (const p of presets) {
  if (only.length && !only.includes(p.id)) continue;
  const t = performance.now();
  const bufs = bakeLook(p.avatar);
  // gzipped: about half the size; the page unpacks them with DecompressionStream
  bufs.forEach((b, lod) => fs.writeFileSync(path.join(outDir, `${p.id}.lod${lod}.c3b.gz`), zlib.gzipSync(Buffer.from(b), { level: 9 })));
  console.log(p.id, Math.round(performance.now() - t) + ' ms', bufs.map(b => (b.byteLength / 1024).toFixed(0) + ' KB raw').join(' / '));
}
