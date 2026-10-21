// The experiments home page is drawn from data/experiments.json. These checks keep that file honest:
// every folder that IS an experiment (an index.html and a README.md) has a row, every row points at
// something that exists, and the helpers the page uses for the Thousandvale buttons behave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { filterEntries, serverUrl, onPublicSite, forHost, sameHost, STATUS } from '../js/home.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const data = read('data/experiments.json');
const live = read('data/live-links.json');
const isDir = p => statSync(p, { throwIfNoEntry: false })?.isDirectory();
/** A link target on disk: a folder link means that folder's index.html. */
const target = href => { const p = join(ROOT, href.split('#')[0].split('?')[0]); return href.endsWith('/') ? join(p, 'index.html') : p; };

test('every folder with an index.html and a README.md is on the home page', () => {
  const skip = new Set(['node_modules', 'vendor', 'test-results', 'tools', 'docs', 'shared', 'data', 'js', 'css', 'tests']);
  const folders = [];
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith('.') || skip.has(name) || !isDir(join(ROOT, name))) continue;
    if (name === 'prototypes') { for (const p of readdirSync(join(ROOT, name))) if (isDir(join(ROOT, name, p))) folders.push(`${name}/${p}`); }
    else folders.push(name);
  }
  const listed = new Set(data.entries.map(e => e.folder));
  const missing = folders.filter(f => existsSync(join(ROOT, f, 'index.html')) && existsSync(join(ROOT, f, 'README.md')) && !listed.has(f));
  assert.deepEqual(missing, [], 'add a row to data/experiments.json for: ' + missing.join(', '));
});

test('every prototype folder with a page is listed, README or not', () => {
  const listed = new Set(data.entries.map(e => e.folder));
  const missing = readdirSync(join(ROOT, 'prototypes')).map(p => 'prototypes/' + p).filter(f => existsSync(join(ROOT, f, 'index.html')) && !listed.has(f));
  assert.deepEqual(missing, []);
});

test('every listed path exists, is relative, and every row is complete', () => {
  const groups = new Set(data.groups.map(g => g.id)), ids = new Set();
  for (const e of data.entries) {
    assert.ok(e.id && !ids.has(e.id), `duplicate or missing id: ${e.id}`); ids.add(e.id);
    assert.ok(groups.has(e.group), `${e.id}: unknown group ${e.group}`);
    assert.ok(STATUS[e.status], `${e.id}: unknown status ${e.status}`);
    assert.ok(e.title && e.summary && e.summary.length > 40, `${e.id}: needs a title and a real summary`);
    assert.ok(e.href || e.server, `${e.id}: needs a page (href) or a game server`);
    assert.ok(isDir(join(ROOT, e.folder)), `${e.id}: folder ${e.folder} does not exist`);
    for (const href of [e.href, ...(e.links || []).map(l => l.href)].filter(Boolean)) {
      assert.ok(!href.startsWith('/') && !/^https?:/.test(href), `${e.id}: ${href} must be a relative path (GitHub Pages serves under /Game-Playground/)`);
      assert.ok(existsSync(target(href)), `${e.id}: ${href} does not exist`);
    }
    assert.ok(existsSync(join(ROOT, e.readme || e.folder + '/README.md')), `${e.id}: no README (set "readme" if the docs live elsewhere)`);
    if (e.status === 'deprecated') assert.ok(e.deprecated, `${e.id}: a deprecated row says what replaced it`);
    if (e.server) { assert.ok(Number.isInteger(e.server.port)); assert.ok(existsSync(join(ROOT, e.server.path, 'index.html')), `${e.id}: server path has no page`); }
    if (e.live) assert.ok(/^https:\/\//.test(live[e.live]?.url || ''), `${e.id}: data/live-links.json has no https url for "${e.live}"`);
  }
  for (const g of data.groups) assert.ok(data.entries.some(e => e.group === g.id), `group ${g.id} is empty`);
});

test('no player-facing text on the home page uses a banned word', () => {
  const text = data.entries.filter(e => e.id !== 'emberveil').map(e => e.title + ' ' + e.summary).join(' ').toLowerCase();
  for (const w of ['muster', 'skyrim', 'warcraft', 'diablo', 'skada', 'rimworld', 'tomodachi']) assert.ok(!text.includes(w), `"${w}" is on the home page`);
});

test('the links the old home page had still exist', () => {
  const old = ['voice-lab/', 'lingo/', 'avatar-2d/', 'avatar-3d/', 'avatar-3d/chibi3.html', 'namegen/', 'items/', 'conversations/', 'meters/', 'assets/', 'library/',
    'avatar-3d/creatures.html', 'avatar-3d/vehicles.html', 'avatar-3d/mounts.html', 'avatar-3d/spellfx.html', 'sfx/', 'worldgen/', 'universe/', 'proctown/', 'proctown/kit.html',
    'proctown/propkit.html', 'highdef-3d/', 'combined/', 'prototypes/emberveil/', 'prototypes/frontier-foundry/', 'prototypes/farhold/',
    'prototypes/tinyrts/', 'prototypes/lanternfall/', 'prototypes/bannerline/'];
  const now = new Set(data.entries.map(e => e.href));
  assert.deepEqual(old.filter(h => !now.has(h)), []);
});

test('Thousandvale: a network button on the LAN, none on the public site, and a separate live link', () => {
  const tv = data.entries.find(e => e.id === 'thousandvale');
  assert.equal(tv.group, 'prototypes');
  assert.equal(serverUrl(tv.server, '192.168.1.34'), 'http://192.168.1.34:8490/prototypes/thousandvale/');
  assert.equal(serverUrl(tv.server, 'localhost'), 'http://localhost:8490/prototypes/thousandvale/');
  assert.equal(serverUrl(tv.server, 'fd7a::1'), 'http://[fd7a::1]:8490/prototypes/thousandvale/');
  assert.equal(serverUrl(tv.server, 'radgh.github.io'), null);
  assert.ok(onPublicSite('radgh.github.io') && !onPublicSite('192.168.1.34') && !onPublicSite('github.io.example.com'));
  assert.ok(live.thousandvale.url.startsWith('https://') && live.thousandvale.note && /^\d{4}-\d\d-\d\d$/.test(live.thousandvale.updated));
});

test('search and status filters', () => {
  const all = data.entries;
  assert.equal(filterEntries(all).length, all.length);
  assert.ok(filterEntries(all, { q: 'thousandvale online' }).some(e => e.id === 'thousandvale'));
  assert.ok(filterEntries(all, { q: 'sword dagger' }).some(e => e.id === 'armory'));
  assert.ok(filterEntries(all, { status: 'deprecated' }).some(e => e.id === 'avatar-3d'), 'a partly deprecated card shows under Deprecated');
  assert.ok(filterEntries(all, { status: 'playable' }).every(e => e.status === 'playable'));
  assert.equal(filterEntries(all, { q: 'zzzz-no-such-thing' }).length, 0);
});

test('served by the game server: the Thousandvale card is a same-address page link, and links the host cannot serve are left out', () => {
  assert.deepEqual(read('data/served-by.json'), {}, 'the committed file is empty: only the game server fills it in');
  assert.equal(forHost(data.entries, {}), data.entries, 'an empty answer changes nothing (8400, GitHub Pages)');
  const host = { game: 'thousandvale', path: 'prototypes/thousandvale/', unavailable: ['prototypes/tinyrts/', 'prototypes/tinyrts/README.md', 'prototypes/thousandvale/docs/PLAN.md', 'avatar-3d/armour2.html'] };
  const shown = forHost(data.entries, host);
  const tv = shown.find(e => e.id === 'thousandvale');
  assert.equal(tv.href, 'prototypes/thousandvale/'); assert.equal(tv.server, undefined); assert.equal(tv.noReadme, true);
  assert.ok(!shown.some(e => e.id === 'tinyrts'), 'a card whose page cannot be served is not drawn');
  assert.ok(!shown.find(e => e.id === 'avatar-3d').links.some(l => l.href === 'avatar-3d/armour2.html'));
  assert.equal(shown.length, data.entries.length - 1);
  for (const e of shown) assert.ok(!String(e.href || '').startsWith('/'), `${e.id}: a path starting with / breaks under /Game-Playground/`);
  assert.ok(data.entries.find(e => e.id === 'thousandvale').server, 'forHost works on copies');
  assert.ok(sameHost(live.thousandvale.url, new URL(live.thousandvale.url).hostname) && !sameHost(live.thousandvale.url, '192.168.1.34'));
});
