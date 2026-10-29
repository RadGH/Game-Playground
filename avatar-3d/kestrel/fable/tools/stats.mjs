// Writes stats.json (CONTRACT §6) from a headless build of both looks: node avatar-3d/kestrel/fable/tools/stats.mjs
import { register } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
register('../../../tests/three-loader.mjs', import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { createKestrelCharacter, KESTREL_INFO } = await import(pathToFileURL(join(here, '../js/kestrel.js')).href);
const { lookFor } = await import(pathToFileURL(join(here, '../../js/looks.js')).href);
const pick = s => ({ triangles: s.triangles, drawCalls: s.drawCalls, bones: s.bones, buildMs: Math.round(s.buildMs * 10) / 10 });
const out = { attempt: KESTREL_INFO.attempt, by: KESTREL_INFO.by, version: KESTREL_INFO.version, date: new Date().toISOString().slice(0, 10), textures: 0, note: 'headless node build on the VM; buildMs is the first (cold) build of each look, lod1 = the far version' };
for (const [key, body] of [['male', 'male'], ['female', 'female']]) {
  const a = await createKestrelCharacter(lookFor(body, false)); out[key] = pick(a.stats());
  a.setLod(1); out[key].lod1 = { triangles: a.stats().triangles, buildMs: Math.round(a.stats().buildMs * 10) / 10 }; a.dispose();
}
const m = await createKestrelCharacter(lookFor('male', true)), f = await createKestrelCharacter(lookFor('female', true));
out.outfit = { male: pick(m.stats()), female: pick(f.stats()), adds: { male: m.stats().triangles - out.male.triangles, female: f.stats().triangles - out.female.triangles } };
m.dispose(); f.dispose();
// a warm rebuild of a fresh look, which is what a game sees after the first character
const w = await createKestrelCharacter({ body: { form: 'masc', height: 0.62, width: 0.55 }, hair: { id: 'short' } });
out.warmBuildMs = Math.round(w.stats().buildMs * 10) / 10; w.dispose();
writeFileSync(join(here, '../stats.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
