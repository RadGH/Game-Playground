// The game icon library (2026-10-14): every file loads, every picture is safe SVG, every id the game asks for exists,
// and every real item in Thousandvale's data finds a picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI_ICONS, ITEM_ART, MOTIFS, PALETTES, CLASS_MOTIFS, uiIconSvg, itemArtKey, itemIconSvg, itemIconUrl, motifSvg, classPalette } from '../js/game-icons.js';

const root = new URL('../../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const ALLOWED = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'g', 'defs', 'lineargradient', 'radialgradient', 'stop']);
function checkArt(id, art) {
  assert.equal(typeof art, 'string', id);
  assert.ok(art.length > 40, `${id}: a real picture, not a stub`);
  for (const m of art.matchAll(/<\s*([a-zA-Z][\w-]*)/g)) assert.ok(ALLOWED.has(m[1].toLowerCase()), `${id}: <${m[1]}> is not allowed`);
  assert.doesNotMatch(art, /<script|<text|<image|<style|<foreignObject|\son[a-z]+=|javascript:|href=/i, `${id}: unsafe SVG`);
  for (const m of art.matchAll(/url\(([^)]*)\)/g)) assert.match(m[1], /^#gi-/, `${id}: url() may only name a gi- gradient`);
  for (const m of art.matchAll(/\sid="([^"]+)"/g)) assert.match(m[1], /^gi-/, `${id}: gradient ids start gi-`);
}

test('every picture in every file is safe, finished SVG', () => {
  for (const [id, v] of Object.entries({ ...UI_ICONS, ...ITEM_ART, ...MOTIFS })) { assert.ok(v.name, id + ' has a name'); assert.ok(v.description, id + ' has a description'); checkArt(id, v.art); }
});

test('the buttons the game draws all have a picture', () => {
  const need = ['attack', 'cast_line', 'hook', 'lock', 'mount', 'jump', 'target', 'ally', 'belt', 'wheel', 'chat', 'close', 'menu', 'autorun', 'camp',
    'party', 'friends', 'guild', 'mail', 'callboard', 'bag', 'account', 'map', 'journal', 'skills', 'perks', 'sheet', 'feedback', 'help',
    'wave', 'sit', 'dance', 'cheer', 'bow', 'point', 'eye', 'locate', 'doll',
    ...['mining', 'logging', 'foraging', 'skinning', 'angling', 'smithing', 'outfitting', 'alchemy', 'cooking', 'tempering'].map(p => 'prof_' + p)];
  for (const id of need) assert.ok(UI_ICONS[id], 'ui icon ' + id);
  assert.match(uiIconSvg('attack', 40, { medallion: true }), /^<svg[^>]*viewBox="0 0 32 32"[^>]*width="40"/);
  assert.equal(uiIconSvg('no_such_icon'), null);
});

test('every real Thousandvale item finds its own picture (owner: "mana potion should be blue")', () => {
  const prof = json('prototypes/thousandvale/data/provinces/professions.json');
  const shops = json('prototypes/thousandvale/data/provinces/shops.json');
  const ang = json('prototypes/thousandvale/data/provinces/angling.json');
  const own = (item, want) => assert.equal(itemArtKey(item), want, `${item.id || item.name} -> ${want}`);
  for (const [id, m] of Object.entries(prof.materials)) own({ kind: 'material', id, name: m.name, icon: m.icon }, id);
  for (const id of Object.keys(prof.goods)) own({ kind: prof.goods[id].kind || 'good', id, name: prof.goods[id].name }, id);
  for (const t of prof.tools) own({ kind: 'good', tool: true, id: t.id, name: t.name }, t.id);
  for (const id of Object.keys(shops.goodsCatalog)) own({ kind: 'good', id, name: shops.goodsCatalog[id].name }, id);
  for (const f of [...ang.fish, ...ang.legends]) own({ kind: 'fish', id: f.id, name: f.name, species: f.id }, f.id);
  for (const j of ang.junk) own({ kind: 'junk', id: j.id, name: j.name }, j.id);
  for (const id of Object.keys(ang.meals)) own({ kind: 'good', id, name: ang.meals[id].name || id }, id);
  for (const id of ['healing_potion', 'greater_healing', 'mana_potion', 'group_tonic', 'antidote', 'revival_flask', 'emberheart_draught']) own({ kind: 'potion', id }, id);
  // things that are not gear and have no picture of their own fall back by what they are
  own({ kind: 'crate', id: 'crate', name: 'Sunken Crate' }, 'sunken_crate');
  own({ kind: 'crate', id: 'crate', name: 'Armourer’s Crate' }, 'crate');
  own({ kind: 'gift', id: 'gift_box' }, 'gift_box');
  own({ kind: 'trophy', id: 'trophy_legend_copperjaw' }, 'trophy');
  own({ kind: 'fish', id: 'unknown_fish' }, 'fish');
  own({ kind: 'material', id: 'new_ore', icon: 'ore' }, 'mat_ore');
  own({ kind: 'potion', id: 'mystery_potion' }, 'potion');
  own({ kind: 'junk', id: 'odd_rock' }, 'junk');
  assert.equal(itemArtKey({ id: 'longsword', slot: 'weapon', type: 'weapon' }), null, 'gear keeps its 3D icon');
  // mana is blue, healing red, antidote green — by the dominant fill of the liquid
  const hue = key => { const cols = [...ITEM_ART[key].art.matchAll(/#([0-9a-f]{6})\b/gi)].map(m => m[1]); return cols; };
  const blueish = h => { const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); return b > r + 40 && b > g; };
  const redish = h => { const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); return r > g + 60 && r > b + 60; };
  assert.ok(hue('mana_potion').some(blueish), 'the mana potion has blue in it');
  assert.ok(!hue('mana_potion').some(redish), 'and no red');
  assert.ok(hue('healing_potion').some(redish), 'the healing potion is red');
  assert.match(itemIconUrl('mana_potion'), /^data:image\/svg\+xml/);
  assert.match(itemIconSvg('mana_potion', 48), /viewBox="0 0 64 64"/);
});

test('spell-effect motifs: three white shapes and three colours for each of 30 classes, no two classes alike', () => {
  const classes = Object.keys(json('prototypes/farhold/data/skills.json').classes);
  assert.equal(classes.length, 30);
  const pairs = new Set();
  for (const c of classes) {
    assert.deepEqual(CLASS_MOTIFS[c], [`${c}.a`, `${c}.b`, `${c}.c`], c + ' has head, shard and glyph');
    const p = classPalette(c); assert.ok(p && /^#[0-9a-f]{6}$/i.test(p.core) && /^#[0-9a-f]{6}$/i.test(p.glow) && /^#[0-9a-f]{6}$/i.test(p.accent), c + ' palette');
    pairs.add(`${p.glow}|${p.accent}`.toLowerCase());
    for (const k of CLASS_MOTIFS[c]) { assert.match(motifSvg(k), /^<svg/); assert.doesNotMatch(MOTIFS[k].art, /fill="#(?!fff\b|ffffff\b)[0-9a-f]{3,6}"/i, k + ' is white only'); }
  }
  assert.equal(pairs.size, 30, 'every class has its own colours');
  assert.ok(PALETTES);
});
