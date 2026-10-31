// The Oddhaven line pack: data/lines/*.txt are the readable source (a "# pool tag" header, then one line per row), lingo/data/packs/oddhaven.json is what the game reads. Pools already in
// the pack keep their hand-written rows; a row from here goes on the end, tagged by what it is about. Run again after changing a file: it is safe to run more than once.
//   node prototypes/oddhaven/tools/build-lines.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const pack = new URL('../../../lingo/data/packs/oddhaven.json', import.meta.url), dir = new URL('../data/lines/', import.meta.url), p = JSON.parse(readFileSync(pack, 'utf8'));
for (const s of Object.values(p.symbols)) for (let i = s.length - 1; i >= 0; i--) if (s[i].src) s.splice(i, 1);
for (const f of readdirSync(dir).filter(n => n.endsWith('.txt')).sort()) {
  let pool = null, tags = [];
  for (const raw of readFileSync(new URL(f, dir), 'utf8').split('\n')) {
    const line = raw.trim(); if (!line) continue;
    if (line.startsWith('# ')) { const [name, ...t] = line.slice(2).split(/\s+/); pool = name; tags = t; (p.symbols[pool] ||= []); continue; }
    p.symbols[pool].push({ t: line, tags, src: f.replace('.txt', '') });
  }
}
writeFileSync(pack, JSON.stringify(p, null, 1) + '\n');
const n = Object.values(p.symbols).reduce((a, s) => a + s.length, 0);
console.log(`${n} lines in ${Object.keys(p.symbols).length} pools`);
