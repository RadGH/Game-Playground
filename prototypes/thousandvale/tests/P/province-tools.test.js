// Expansion 1, stream P — THE CONTENT TOOLS ARE PER PROVINCE. Every tools/content-*.mjs (and place-vignettes) takes
// `--province=<id>` (default torbor_downs) and reads / writes that province's own files through js/sim/province-files.js;
// Torbor Downs keeps its old paths, so its made files are still current (`--check` exits 0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HOME_PROVINCE, provinceArg, provinceDataPath, provinceDataSync, namesPath, PLACED_KEYS } from '../../js/sim/province-files.js';
import { zoneBelongs } from '../../tools/content-lib.mjs';

const ROOT = new URL('../../', import.meta.url);
const GAME = fileURLToPath(ROOT);

test('provinceArg: --province=<id>, --province <id>, default the home province', () => {
  assert.equal(provinceArg(['node', 'tool.mjs']), HOME_PROVINCE);
  assert.equal(provinceArg(['node', 'tool.mjs', '--check', '--province=vharlen']), 'vharlen');
  assert.equal(provinceArg(['node', 'tool.mjs', '--province', 'vharlen', '--check']), 'vharlen');
  assert.equal(provinceArg(['node', 'tool.mjs', '--province', '--check']), HOME_PROVINCE);
});

test('provinceDataPath: the home province keeps the old paths, another gets <dir>/<prov>-<file>', () => {
  assert.equal(provinceDataPath(HOME_PROVINCE, 'shops'), 'data/provinces/shops.json');
  assert.equal(provinceDataPath(HOME_PROVINCE, 'givers'), 'data/quests/marks/givers.json');
  assert.equal(provinceDataPath('vharlen', 'shops'), 'data/provinces/vharlen-shops.json');
  assert.equal(provinceDataPath('vharlen', 'givers'), 'data/quests/marks/vharlen-givers.json');
  assert.equal(provinceDataPath('vharlen', 'angling-pools'), 'data/provinces/vharlen-angling-pools.json');
  assert.equal(namesPath('vharlen'), 'data/names/vharlen.json');
  assert.equal(namesPath(HOME_PROVINCE), 'data/names/torbor.json');
});

test('provinceDataSync: shared files are lent without their placed keys; an own file is laid over; placed files are never lent', () => {
  const files = {
    'data/provinces/shops.json': { kinds: { general: {} }, towns: { Torborhold: {} }, pricing: { a: 1 } },
    'data/provinces/carts.json': { stops: [{ id: 'torborhold' }] },
    'data/provinces/p2-carts.json': { stops: [{ id: 'port' }] },
  };
  const read = f => { if (!(f in files)) throw new Error('ENOENT ' + f); return JSON.parse(JSON.stringify(files[f])); };
  // home: the file as it is
  assert.deepEqual(provinceDataSync(read, HOME_PROVINCE, 'shops'), files['data/provinces/shops.json']);
  // another province, no own file: lent, minus Torbor's towns
  const lent = provinceDataSync(read, 'p2', 'shops');
  assert.ok(PLACED_KEYS.shops.includes('towns'));
  assert.equal(lent.towns, undefined, "Torbor's towns are not lent");
  assert.deepEqual(lent.kinds, { general: {} });
  // an own file: its keys win, the rest comes from home
  files['data/provinces/p2-shops.json'] = { towns: { 'Port Vharl': { shops: ['general'] } }, pricing: { a: 2 } };
  const own = provinceDataSync(read, 'p2', 'shops');
  assert.deepEqual(own.towns, { 'Port Vharl': { shops: ['general'] } });
  assert.deepEqual(own.pricing, { a: 2 });
  assert.deepEqual(own.kinds, { general: {} });
  // placed: only the province's own
  assert.deepEqual(provinceDataSync(read, 'p2', 'carts'), { stops: [{ id: 'port' }] });
  assert.equal(provinceDataSync(read, 'p3', 'carts'), null, 'no own carts file = no carts');
});

test('zoneBelongs: a zone in a province map is that province\'s; a zone in no map is the home province\'s', () => {
  const maps = { torbor_downs: { test: 'z12_02', ashcombe: 'z12_01' }, vharlen: { blackstrand: 'z13_10' } };
  assert.equal(zoneBelongs(HOME_PROVINCE, 'ashcombe', maps), true);
  assert.equal(zoneBelongs('vharlen', 'ashcombe', maps), false);
  assert.equal(zoneBelongs('vharlen', 'blackstrand', maps), true);
  assert.equal(zoneBelongs(HOME_PROVINCE, 'blackstrand', maps), false);
  assert.equal(zoneBelongs(HOME_PROVINCE, 'some_part_file', maps), true);
  assert.equal(zoneBelongs('vharlen', 'some_part_file', maps), false);
});

test('no content tool hard-codes torbor_downs (or data/names/torbor.json) in a path', () => {
  const tools = readdirSync(new URL('tools/', ROOT)).filter(f => /^(content-.*|place-vignettes|assign-vignettes)\.mjs$/.test(f));
  assert.ok(tools.length >= 15);
  for (const f of tools) {
    const code = readFileSync(new URL('tools/' + f, ROOT), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!/['"`]torbor_downs['"`]/.test(code), `${f} names torbor_downs in code`);
    assert.ok(!/data\/provinces\/torbor_downs/.test(code), `${f} reads a torbor_downs path`);
    assert.ok(!/data\/names\/torbor\.json/.test(code), `${f} reads data/names/torbor.json directly`);
  }
});

const run = (tool, args = []) => { try { return { code: 0, out: execFileSync(process.execPath, [`tools/${tool}.mjs`, ...args], { cwd: GAME, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 }) }; } catch (err) { return { code: err.status, out: String(err.stdout || '') + String(err.stderr || '') }; } };

for (const tool of ['content-towns', 'content-givers', 'content-pools', 'content-events']) {
  test(`${tool} --check: Torbor Downs' made files are current (nothing would change)`, { timeout: 120000 }, () => {
    const r = run(tool, ['--check']);
    assert.equal(r.code, 0, r.out.slice(-1500));
  });
}

test('a province with no map entry / sheet / bake: one clear line, no stack trace', { timeout: 60000 }, () => {
  for (const tool of ['content-towns', 'content-givers', 'content-pools', 'content-offices']) {
    const r = run(tool, ['--check', '--province=no_such_province']);
    assert.equal(r.code, 2, tool + ': ' + r.out);
    assert.match(r.out, /province no_such_province: /, tool);
    assert.ok(!/\n\s+at /.test(r.out), tool + ' printed a stack trace: ' + r.out);
  }
});
