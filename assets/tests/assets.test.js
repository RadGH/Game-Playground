// Node tests for the asset library: the manifest is valid, the files it lists are on disk,
// and the pure helpers behave. Scenery art may still be in progress, so a missing scenery file
// is reported as a note instead of failing the run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Assets, svgInner, svgRootAttrs, fallbackScene } from '../js/assets.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'));

test('manifest parses and has scenery, icons and props', () => {
  assert.equal(typeof manifest.scenery, 'object');
  assert.equal(typeof manifest.icons, 'object');
  assert.equal(typeof manifest.props, 'object');
  assert.ok(Object.keys(manifest.scenery).length >= 30, 'at least 30 scenes listed');
  assert.ok(Object.keys(manifest.icons).length >= 13, 'at least 13 icons listed');
});

test('every entry names a file and tags', () => {
  for (const kind of ['scenery', 'icons', 'props']) {
    for (const [id, spec] of Object.entries(manifest[kind])) {
      assert.match(spec.file, /\.svg$/, `${kind}.${id} has an svg file`);
      assert.ok(spec.file.startsWith(kind === 'scenery' ? 'scenery/' : kind + '/'), `${kind}.${id} sits in the right folder`);
      assert.ok(Array.isArray(spec.tags), `${kind}.${id} has tags`);
    }
  }
});

test('fx sprites are listed, on disk, 64x64 and transparent', () => {
  assert.equal(typeof manifest.fx, 'object', 'the manifest has an fx section');
  assert.ok(Object.keys(manifest.fx).length >= 30, 'at least 30 particle sprites listed');
  for (const [id, spec] of Object.entries(manifest.fx)) {
    assert.match(spec.file, /^fx\/.+\.svg$/, `fx.${id} sits in fx/`);
    assert.ok(Array.isArray(spec.tags) && spec.tags.length, `fx.${id} has tags`);
    const p = join(dataDir, spec.file);
    assert.ok(existsSync(p), `${spec.file} exists`);
    const text = readFileSync(p, 'utf8');
    assert.equal(svgRootAttrs(text).viewBox, '0 0 64 64', `${id} uses the sprite viewBox`);
    assert.ok(svgInner(text).length > 0, `${id} has markup`);
    // a backing rect would make the sprite a square block once it is drawn additively
    assert.ok(!/<rect[^>]*width="(100%|64)"[^>]*height="(100%|64)"/.test(text), `${id} has no opaque backing rect`);
  }
});

test('every element and status the effects layer names has a sprite in the manifest', () => {
  // ids referenced by avatar-3d/js/spellfx.js (ELEMENTS trails + STATUS_FX auras)
  const needed = ['flame', 'ember', 'smoke', 'ice_shard', 'snowflake', 'frost_ring', 'skull', 'wisp', 'shadow_claw',
    'holy_rune', 'holy_mote', 'feather', 'leaf', 'thorn', 'bubble', 'drop', 'slash', 'spark', 'bolt',
    'arcane_rune', 'arcane_shard', 'shield_ring', 'star_daze', 'zzz', 'question', 'chain', 'eye_closed',
    'arrow_down', 'arrow_up', 'crack', 'target', 'mute', 'root_vine', 'ring', 'glow'];
  const missing = needed.filter(id => !manifest.fx?.[id]);
  assert.deepEqual(missing, [], 'no sprite the effects layer asks for is missing');
});

test('icon files exist and are standalone svgs in a -4 -4 8 8 box', () => {
  for (const [id, spec] of Object.entries(manifest.icons)) {
    const p = join(dataDir, spec.file);
    assert.ok(existsSync(p), `${spec.file} exists`);
    const text = readFileSync(p, 'utf8');
    assert.equal(svgRootAttrs(text).viewBox, '-4 -4 8 8', `${id} uses the icon viewBox`);
    assert.ok(svgInner(text).length > 0, `${id} has markup`);
  }
});

test('scenery files are standalone full-bleed svgs (missing ones are only noted)', () => {
  const missing = [];
  for (const [id, spec] of Object.entries(manifest.scenery)) {
    const p = join(dataDir, spec.file);
    if (!existsSync(p)) { missing.push(id); continue; }
    const text = readFileSync(p, 'utf8');
    const attrs = svgRootAttrs(text);
    assert.equal(attrs.viewBox, '0 0 100 100', `${id} uses the scenery viewBox`);
    assert.equal(attrs.preserveAspectRatio, 'none', `${id} stretches to its box`);
    assert.ok(svgInner(text).length > 0, `${id} has markup`);
  }
  if (missing.length) console.log(`  note: ${missing.length} scenery file(s) not drawn yet — ${missing.join(', ')}`);
});

test('props files exist when listed', () => {
  for (const spec of Object.values(manifest.props)) assert.ok(existsSync(join(dataDir, spec.file)), `${spec.file} exists`);
});

test('svgInner returns what is inside the root svg', () => {
  assert.equal(svgInner('<svg viewBox="0 0 100 100"><rect x="1"/></svg>'), '<rect x="1"/>');
  assert.equal(svgInner('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg">\n  <g><circle r="2"/></g>\n</svg>\n'), '<g><circle r="2"/></g>');
  assert.equal(svgInner('<rect/>'), '<rect/>');     // already inner markup
  assert.equal(svgInner(null), '');
  assert.equal(svgInner(''), '');
});

test('svgRootAttrs reads the root attributes', () => {
  const a = svgRootAttrs('<svg xmlns="x" viewBox="0 0 100 100" preserveAspectRatio="none">…</svg>');
  assert.equal(a.viewBox, '0 0 100 100');
  assert.equal(a.preserveAspectRatio, 'none');
});

test('listByTag, tags and sceneryInfo read the manifest without fetching', () => {
  const a = new Assets('/assets/', manifest);
  assert.ok(a.sceneryIds().includes('village'));
  assert.ok(a.iconTypes().includes('combat'));
  assert.ok(a.listByTag('forest').includes('forest'));
  assert.ok(a.listByTag('node', 'icons').includes('boss'));
  assert.ok(a.tags().includes('outdoor'));
  assert.equal(a.sceneryInfo('nope'), null);
  assert.equal(a.isNightScene('camp'), true);
  assert.equal(a.isNightScene('village'), false);
});

test('fallbackScene is a self-contained gradient with a unique id', () => {
  const a = fallbackScene('village'), b = fallbackScene('village');
  assert.match(a, /<linearGradient id="fb_village_/);
  assert.notEqual(a, b, 'two calls do not collide on one gradient id');
});

test('ui art: every manifest entry exists in ui/, and the sets a themed interface needs are all there', () => {
  assert.equal(typeof manifest.ui, 'object', 'the manifest has a ui section');
  for (const [id, spec] of Object.entries(manifest.ui)) {
    assert.match(spec.file, /^ui\/.+\.svg$/, `${id} sits in ui/`);
    assert.ok(Array.isArray(spec.tags), `${id} has tags`);
    assert.ok(existsSync(join(dataDir, spec.file)), `${spec.file} exists`);
  }
  const ids = Object.keys(manifest.ui);
  for (const need of ['emblem', 'frame_corner', 'divider', 'button_end', 'title_banner', 'panel_tile', 'ember_particle']) assert.ok(ids.includes(need), `ornament ${need} is listed`);
  for (const need of ['gold', 'fame', 'day', 'night', 'ration', 'torch', 'tent', 'boot', 'wagon', 'hp', 'mp', 'xp']) assert.ok(ids.includes(need), `hud icon ${need} is listed`);
  assert.equal(ids.filter(i => i.startsWith('tab_')).length, 8, 'eight tab icons');
  assert.equal(ids.filter(i => i.startsWith('slot_')).length, 9, 'nine equipment slot icons');
  assert.equal(ids.filter(i => i.startsWith('stat_')).length, 4, 'four attribute icons');
  assert.equal(ids.filter(i => i.startsWith('rarity_')).length, 7, 'seven rarity gems');
  // the currentColor art is what a page masks to take the surrounding text colour
  for (const id of ids.filter(i => /^(tab_|slot_|stat_)/.test(i))) {
    assert.match(readFileSync(join(dataDir, manifest.ui[id].file), 'utf8'), /currentColor/, `${id} is drawn with currentColor`);
  }
});
