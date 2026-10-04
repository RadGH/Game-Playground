// node --test prototypes/thousandvale/tests/C/purity.test.mjs
//
// js/rules/ is SERVER-SAFE AND PURE (PLAN §16): no Three.js, no DOM, no window, no storage, no
// fetch, no Math.random, no Date.now — so the same modules run in a Web Worker, under Node, and in
// the client's prediction, and a fight replays bit-for-bit from its seed. Only js/rules/farhold.js
// may reach into Farhold, so there is exactly one list of what Thousandvale borrows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = join(dirname(fileURLToPath(import.meta.url)), '../../js/rules');
/** Stream C's files (terrain-read.js is stream B's, dungeon-tiers.js stream E's: purity applies, the import rule is theirs). */
const OTHERS = new Set(['terrain-read.js', 'dungeon-tiers.js']);
const files = readdirSync(RULES).filter(f => f.endsWith('.js'));
const src = f => readFileSync(join(RULES, f), 'utf8');
/** strip comments so prose may say "Math.random" without tripping the check */
const code = f => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const BANNED = [
  [/from ['"]three['"]|import\(['"]three['"]\)/, 'Three.js'],
  [/\bwindow\./, 'window'], [/\bdocument\./, 'document'], [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, 'storage'],
  [/\bfetch\(/, 'fetch'], [/\bXMLHttpRequest\b/, 'XHR'], [/Math\.random\(/, 'Math.random'], [/Date\.now\(/, 'Date.now'],
  [/performance\.now\(/, 'performance.now'], [/from ['"]node:/, 'node: built-ins'], [/\bsetTimeout\(|\bsetInterval\(/, 'timers (use the room clock)'],
];

test('no js/rules file touches Three.js, the DOM, storage, fetch, wall clocks or unseeded random', () => {
  const bad = [];
  for (const f of files) for (const [re, what] of BANNED) if (re.test(code(f))) bad.push(`${f}: ${what}`);
  assert.deepEqual(bad, []);
});

test('only js/rules/farhold.js imports Farhold or Emberveil; everything else stays inside js/rules', () => {
  const bad = [];
  for (const f of files) {
    if (OTHERS.has(f)) continue;
    for (const m of code(f).matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (f === 'farhold.js') { if (!/^\.\.\/\.\.\/\.\.\/(farhold|emberveil)\/js\//.test(spec)) bad.push(`${f}: ${spec}`); continue; }
      if (!/^\.\/[\w-]+\.js$/.test(spec)) bad.push(`${f}: ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every js/rules module loads in plain Node with no Three.js loader registered', async () => {
  for (const f of files) {
    if (OTHERS.has(f)) continue;
    await assert.doesNotReject(import(join(RULES, f)), f);
  }
});

test('seeded everywhere: every call that can roll dice is handed a generator', () => {
  const bad = [];
  for (const f of files) {
    if (OTHERS.has(f)) continue;
    const c = code(f);
    for (const m of c.matchAll(/\.makeEnemy\(([^;]*?)\)/g)) if (m[1].split(',').length < 3) bad.push(`${f}: makeEnemy without rng`);
    for (const m of c.matchAll(/\.rollDrops\(([^;]*?)\)\s/g)) if (!/rng:/.test(m[1])) bad.push(`${f}: rollDrops without rng`);
    for (const m of c.matchAll(/loot\.generate\(([^;]*?)\)\)/g)) if (!/rng:/.test(m[1])) bad.push(`${f}: loot.generate without rng`);
    for (const m of c.matchAll(/rpg\.strike\(([^;]*?)\)/g)) if (!/rng/.test(m[1])) bad.push(`${f}: rpg.strike without the room rng`);
    if (/\brpg\.rng\(\)/.test(c)) bad.push(`${f}: the engine's shared rpg.rng — use the room's stream`);
    if (/xpForLevel\(|levelFromXp\(/.test(c) && !/xpForLevel\([^)]*,|levelFromXp\([^)]*,/.test(c)) bad.push(`${f}: level maths without an explicit cap`);
  }
  assert.deepEqual(bad, []);
});
