// What a browser may load from the game server. Dev (8491) applies server/static.js to the working tree;
// stable (8490, and the public link) serves a copy tools/publish-thousandvale.sh builds. These checks hold the
// two together and keep the private things private:
//   * the publish script has no list of its own — it reads the lists from static.js at the commit it publishes;
//   * `/` is the playground home page, and every page data/experiments.json links is either served or reported
//     as unavailable (so the home page hides it) — never a dead link;
//   * server code, tools, tests, notes, package files, dotfiles and the synced library are refused everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { ALLOW, DENY, PRIVATE_DIRS, PRIVATE_FILES, BROWSER_CODE, DEV_ONLY, HOST_INFO, resolveStatic, isPrivate, canServe, hostInfo, createStaticHandler } from '../../server/static.js';

const GAME = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PLAY = join(GAME, '..', '..');
const script = readFileSync(join(GAME, 'tools/publish-thousandvale.sh'), 'utf8');
const experiments = JSON.parse(readFileSync(join(PLAY, 'data/experiments.json'), 'utf8'));

test('the publish script takes its lists from server/static.js and keeps none of its own', () => {
  assert.match(script, /git show "\$SHA:prototypes\/thousandvale\/server\/static\.js"/, 'reads static.js at the commit being published');
  for (const name of ['ALLOW', 'DENY', 'PRIVATE_DIRS', 'PRIVATE_FILES', 'BROWSER_CODE']) assert.match(script, new RegExp(`< <\\(list ${name}\\)`), `${name} comes from static.js`);
  assert.doesNotMatch(script, /^\s*ALLOW=\(/m, 'a hand-written ALLOW=( list would drift from static.js');
  assert.doesNotMatch(script, /prototypes\/farhold/, 'no folder list written into the script');
});

test('the publish script still refuses a public copy that holds something private', () => {
  // the contents gate is written out by hand so that emptying a list in static.js cannot switch it off
  for (const name of ['node_modules', 'server', 'ops', 'tools', 'tests', 'research', 'test-results', 'synced', 'secrets']) assert.match(script, new RegExp(`-name ${name}\\b`), `gate looks for a ${name} folder`);
  for (const name of ['package.json', 'package-lock.json', "'\\*.env'", 'env.example', 'CLAUDE.md']) assert.match(script, new RegExp(`-name '?${name.replace(/'/g, '')}'?`.replace('*', '\\*')), `gate looks for ${name}`);
  assert.match(script, /-type l -print -quit/, 'no symlink may reach the public copy');
  assert.match(script, /which the allow-list does not name/, 'nothing outside the allow-list at the top of public/');
  assert.match(script, /PGPASSWORD=/, 'the secrets scan is still there');
  for (const f of ['index.html', 'js/home.js', 'data/experiments.json', 'prototypes/thousandvale/index.html', 'library/js/make.js']) assert.ok(script.includes(f), `gate requires ${f}`);
});

test('the allow-list: explicit, relative, and covering the home page and everything it links', () => {
  assert.equal(new Set(ALLOW).size, ALLOW.length);
  for (const a of ALLOW) { assert.ok(!a.startsWith('/') && !a.endsWith('/') && !a.includes('..') && !a.startsWith('.'), a); assert.ok(!isPrivate(a), `${a} is both allowed and private`); }
  for (const a of ['index.html', 'js', 'css', 'data', 'shared', 'vendor', 'library', 'prototypes/thousandvale', 'prototypes/emberveil', 'prototypes/tumblefair']) assert.ok(ALLOW.includes(a), `${a} is not allowed`);
  for (const a of ['tools', 'docs', 'tests', 'node_modules', 'prototypes', 'prototypes/tinyrts', 'CLAUDE.md', 'README.md', 'package.json', 'serve.sh', 'test-results']) assert.ok(!ALLOW.includes(a), `${a} must not be allowed`);
  // every folder the allow-list names that exists here is a real folder or file — a symlink cannot be published
  const allowed = p => ALLOW.some(a => p === a || p.startsWith(a + '/'));
  for (const e of experiments.entries) {
    if (e.folder === 'prototypes/tinyrts') continue;                 // a symlink to another repo: reported, not served
    assert.ok(allowed(e.folder), `${e.id}: its folder ${e.folder} is not in server/static.js ALLOW, so the game server cannot show it`);
    for (const href of [e.href, ...(e.links || []).map(l => l.href)].filter(Boolean)) assert.ok(allowed(href.replace(/\/$/, '')), `${e.id}: ${href} is outside the allow-list`);
  }
});

test('refused wherever it sits, on the working tree and in a published copy', () => {
  const refused = [
    '/prototypes/thousandvale/server/main.mjs', '/prototypes/thousandvale/ops/setup-stable.sh', '/prototypes/thousandvale/tests/H/vps.test.js',
    '/prototypes/thousandvale/docs/PLAN.md', '/prototypes/thousandvale/package.json', '/prototypes/thousandvale/package-lock.json',
    '/prototypes/thousandvale/node_modules/ws/index.js', '/prototypes/thousandvale/.data/dev-store.json',
    '/prototypes/tumblefair/server/main.mjs', '/prototypes/tumblefair/ops/x.sh', '/prototypes/tumblefair/package.json', '/prototypes/tumblefair/node_modules/ws/index.js',
    '/prototypes/farhold/tests/x.spec.js', '/prototypes/farhold/tools/x.mjs', '/prototypes/farhold/research/review-round10.md', '/prototypes/lanternfall/test-results/a.png',
    '/library/synced/library.json', '/library/tests/library.spec.js', '/items/tools/build-items.py', '/avatar-3d/tests/three-register.mjs',
    '/.git/config', '/.gitignore', '/data/.hidden', '/shared/..%2f..%2fCLAUDE.md', '/%2e%2e/secrets/.env', '/shared/x%00.js', '/shared\\..\\CLAUDE.md', '/vendor/some.env',
  ];
  for (const p of refused) for (const allowAll of [false, true]) assert.equal(resolveStatic(PLAY, p, allowAll), null, `${p} (${allowAll ? 'published copy' : 'working tree'})`);
  // not on the allow-list: refused on the working tree (a published copy simply does not hold them)
  for (const p of ['/CLAUDE.md', '/README.md', '/package.json', '/tools/serve.py', '/tools/certs/dev.key', '/docs/research-voices.md', '/tests/experiments.test.js', '/serve.sh', '/prototypes/tinyrts/index.html', '/prototypes/', '/node_modules/x.js', '/test-results/a.png'])
    assert.equal(resolveStatic(PLAY, p), null, p);
  for (const d of DENY) assert.ok(isPrivate(d) && isPrivate(d + '/x'), d);
  for (const d of PRIVATE_DIRS) assert.ok(isPrivate(`shared/${d}/x.js`) && isPrivate(`shared/${d}/x.js`, { dev: true }), d);
  for (const f of PRIVATE_FILES) assert.ok(isPrivate('shared/' + f), f);
  // the short exception list: page scripts that live in a folder called tools/, and nothing private under it
  assert.ok(BROWSER_CODE.length <= 3);
  for (const d of BROWSER_CODE) {
    assert.match(d, /^prototypes\/(?!thousandvale\/)[a-z-]+\/js\//, `${d}: only a page-script folder inside another prototype's js/`);
    for (const allowAll of [false, true]) { assert.ok(resolveStatic(PLAY, `/${d}/icons-page.js`, allowAll), d); assert.equal(resolveStatic(PLAY, `/${d}/tests/x.js`, allowAll), null); assert.equal(resolveStatic(PLAY, `/${d}/package.json`, allowAll), null); }
  }
  assert.equal(resolveStatic(PLAY, '/prototypes/bannerline/tools/x.mjs'), null, "Bannerline's own build tools stay private");
  assert.equal(resolveStatic(PLAY, '/prototypes/bannerline/tools/js/tools/x.mjs'), null);
  // the one difference: dev serves Thousandvale's own tool pages, a published copy never does
  for (const d of DEV_ONLY) { assert.ok(resolveStatic(PLAY, `/${d}/dungeon-viewer.html`)); assert.equal(resolveStatic(PLAY, `/${d}/dungeon-viewer.html`, true), null); }
});

test('served: the home page at /, its files, and the file Emberveil could not load', () => {
  assert.equal(resolveStatic(PLAY, '/'), PLAY);
  for (const p of ['index.html', 'js/home.js', 'css/home.css', 'data/experiments.json', 'data/live-links.json', 'shared/style.css', 'shared/ui.js', 'GAME-GUIDE.md',
    'library/js/make.js', 'library/data/defaults.json', 'prototypes/emberveil/js/main.js', 'prototypes/thousandvale/index.html', 'prototypes/wildmarch/docs/00-OVERVIEW.md', 'armory/README.md'])
    assert.ok(canServe(PLAY, p), `${p} should be served`);
  assert.ok(canServe(PLAY, 'prototypes/emberveil/') && canServe(PLAY, 'avatar-3d/chibi3.html#x'));
  // what Emberveil's entry scripts import from the library must be inside the allow-list
  for (const f of ['main.js', 'talk.js']) for (const m of readFileSync(join(PLAY, 'prototypes/emberveil/js', f), 'utf8').matchAll(/from\s+'(\.\.\/\.\.\/\.\.\/[^']+)'/g))
    assert.ok(canServe(PLAY, join('prototypes/emberveil/js', m[1])), `emberveil/js/${f} imports ${m[1]}`);
});

test('the home page is told who serves it, and every link it keeps is one the server answers', () => {
  const info = hostInfo(PLAY);
  assert.equal(info.game, 'thousandvale'); assert.equal(info.path, 'prototypes/thousandvale/');
  assert.ok(!info.path.startsWith('/'), 'a path starting with / would break a copy served under a sub-folder');
  assert.ok(info.unavailable.includes('prototypes/thousandvale/docs/PLAN.md'), "Thousandvale's docs are private, so its Docs button is hidden");
  if (experiments.entries.some(e => e.id === 'tinyrts')) assert.ok(info.unavailable.includes('prototypes/tinyrts/'), 'Tiny RTS is not served, so its card is hidden');
  const gone = new Set(info.unavailable);
  for (const e of experiments.entries) for (const href of [e.href, ...(e.links || []).map(l => l.href)].filter(Boolean))
    assert.ok(gone.has(href) || canServe(PLAY, href), `${e.id}: ${href} is neither served nor reported`);
  // only Tiny RTS's card and README, and Thousandvale's private plan, are missing — a new gap must be a decision
  // and Chibi 4 (owner 2026-10-16: a LAN-only experiment for a future game, never public)
  assert.deepEqual(info.unavailable.filter(u => !u.startsWith('prototypes/tinyrts/') && !u.startsWith('prototypes/tumblefair/') && !u.startsWith('avatar-3d/chibi4/')), ['prototypes/thousandvale/docs/PLAN.md']);
});

test('over http: / is the home page (no redirect), a published copy behaves the same, private paths are 404', async () => {
  // a tiny published copy: only approved files, plus things that must still be refused if they ever got in
  const pub = mkdtempSync(join(tmpdir(), 'tv-public-'));
  const put = (p, body) => { mkdirSync(dirname(join(pub, p)), { recursive: true }); writeFileSync(join(pub, p), body); };
  put('index.html', '<!doctype html><title>Playground</title>');
  put('data/experiments.json', JSON.stringify({ entries: [{ id: 'thousandvale', folder: 'prototypes/thousandvale', readme: 'prototypes/thousandvale/docs/PLAN.md', server: { port: 8490, path: 'prototypes/thousandvale/' } }, { id: 'gone', href: 'prototypes/tinyrts/', folder: 'prototypes/tinyrts' }, { id: 'lib', href: 'library/', folder: 'library' }] }));
  put('data/served-by.json', '{}');
  put('library/index.html', 'library'); put('library/README.md', '# library'); put('library/js/make.js', 'export const x = 1;');
  put('prototypes/thousandvale/index.html', 'game');
  put('prototypes/thousandvale/server/main.mjs', 'secret'); put('library/synced/library.json', '{}'); put('shared/tools/x.py', 'x'); put('shared/package.json', '{}'); put('.env', 'x');
  const servers = [];
  const start = handler => new Promise(done => { const s = http.createServer((req, res) => { if (!handler(req, res)) { res.writeHead(404); res.end('not found'); } }); s.listen(0, '127.0.0.1', () => { servers.push(s); done(`http://127.0.0.1:${s.address().port}`); }); });
  try {
    for (const [name, base] of [['working tree', await start(createStaticHandler(PLAY))], ['published copy', await start(createStaticHandler(pub, { allowAll: true }))]]) {
      const home = await fetch(base + '/', { redirect: 'manual' });
      assert.equal(home.status, 200, `${name}: / is a page, not a redirect`);
      assert.match(await home.text(), /<title>Playground/, `${name}: / is the playground home page`);
      const info = await (await fetch(`${base}/${HOST_INFO}`)).json();
      assert.equal(info.game, 'thousandvale', `${name}: the server answers ${HOST_INFO} itself, not the empty file`);
      assert.ok(info.unavailable.includes('prototypes/tinyrts/') && info.unavailable.includes('prototypes/thousandvale/docs/PLAN.md'), name);
      assert.ok(!info.unavailable.includes('library/'), name);
      assert.equal((await fetch(base + '/library/js/make.js')).status, 200, name);
      assert.equal((await fetch(base + '/prototypes/thousandvale/')).status, 200, name);
      assert.equal((await fetch(base + '/library', { redirect: 'manual' })).status, 301, `${name}: a folder without its slash is sent to the folder`);
      for (const p of ['/prototypes/thousandvale/server/main.mjs', '/library/synced/library.json', '/shared/tools/x.py', '/shared/package.json', '/.env', '/CLAUDE.md', '/tools/serve.py', '/prototypes/thousandvale/docs/PLAN.md'])
        assert.equal((await fetch(base + p)).status, 404, `${name}: ${p}`);
    }
  } finally { for (const s of servers) s.close(); rmSync(pub, { recursive: true, force: true }); }
});

test('the committed data/served-by.json is empty: only the game server fills it in', () => {
  const p = join(PLAY, HOST_INFO);
  assert.ok(existsSync(p), 'without the file the home page logs a 404 on port 8400');
  assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), {});
});
