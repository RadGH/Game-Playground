// Round 22 (E48): one rarity table. data/items.json, style.css's :root colours, js/ui.js's defaults and the loot
// popup's gem table (shared/rewards.js) all agree, and every item maps to one key: set > unique > rarity.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { RARITY_STYLE, rarityKey, rarityLabel, gemFor, compareItem, setInfoHtml, compareTipHtml } from '../js/ui.js';
import { rarityClass } from '../../../shared/rewards.js';
import { Loot } from '../js/loot.js';
import { makeRng } from '../js/rng.js';

const items = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url)));
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const rewardsSrc = fs.readFileSync(new URL('../../../shared/rewards.js', import.meta.url), 'utf8');
const loot = new Loot(items);
const KEYS = ['normal', 'magic', 'rare', 'legendary', 'unique', 'set'];

test('items.json, style.css and ui.js hold the same colour and gem for every key', () => {
  for (const k of KEYS) {
    const data = items.rarityColors[k]; assert.ok(data, `items.json rarityColors.${k}`);
    const m = css.match(new RegExp(`--${k}:\\s*(#[0-9a-fA-F]{6})`)); assert.ok(m, `style.css --${k}`);
    assert.equal(m[1].toLowerCase(), data.toLowerCase(), `style.css --${k} matches items.json`);
    assert.equal(RARITY_STYLE[k].color.toLowerCase(), data.toLowerCase(), `ui.js ${k} matches items.json`);
    assert.equal(RARITY_STYLE[k].gem, items.rarityGems[k], `gem for ${k}`);
    assert.ok(fs.existsSync(new URL(`../../../assets/data/ui/rarity_${items.rarityGems[k]}.svg`, import.meta.url)), `gem art for ${k}`);
  }
  // the loot popup's own gem table says the same
  const gemTable = JSON.parse(rewardsSrc.match(/const GEM = (\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  for (const k of KEYS) assert.equal(gemTable[k], 'rarity_' + items.rarityGems[k], `shared/rewards.js GEM.${k}`);
});

test('the set colour matches the teal set gem, not the old green', () => {
  const svg = fs.readFileSync(new URL('../../../assets/data/ui/rarity_set.svg', import.meta.url), 'utf8');
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hue = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  const gem = svg.match(/#[0-9a-fA-F]{6}/g).map(hex).map(hue);
  const setHue = hue(hex(items.rarityColors.set));
  assert.ok(gem.some(h => Math.abs(h - setHue) < 15), `set name hue ${setHue.toFixed(0)} is within 15° of the gem (${gem.map(h => h.toFixed(0)).join(', ')})`);
});

test('one key per item: a set piece is "set" everywhere, a unique is "unique", the rest their rarity', () => {
  const rng = makeRng(1);
  const setPiece = loot.generateSetItem('iron_brigade', 0, 'high', rng);
  const unique = loot.generateUnique(items.uniques[0].id, rng);
  const rare = loot.generate('sword', 'rare', 'medium', { rng });
  assert.equal(setPiece.rarity, 'legendary', 'underneath, a set piece is legendary');
  for (const [it, key] of [[setPiece, 'set'], [unique, 'unique'], [rare, 'rare']]) {
    assert.equal(rarityKey(it), key); assert.equal(rarityClass(it), key, 'the loot popup agrees');
    assert.equal(gemFor(it), items.rarityGems[key]);
  }
  assert.equal(rarityLabel(setPiece), 'set piece · legendary');
  assert.equal(rarityLabel(rare), 'rare');
});

test('compareItem: both rings, stat deltas, usability and set progress', () => {
  const rng = makeRng(2);
  const hero = { id: 'h', short: 'Ada', className: 'Ranger', weapons: ['bow', 'crossbow', 'javelin'], primaryAttr: 'DEX', equipment: {
    ring1: loot.generate('ring', 'magic', 'medium', { rng }), ring2: loot.generate('ring', 'rare', 'medium', { rng }),
    head: loot.generateSetItem('longwatch_stalker', 1, 'high', rng),
  } };
  const ring = loot.generate('ring', 'legendary', 'high', { rng });
  const c = compareItem(ring, hero, { loot });
  assert.deepEqual(c.targets.map(t => t.slot), ['ring1', 'ring2']);
  assert.ok(c.targets.every(t => t.rows.some(r => r.key.startsWith('stat:'))));
  const dagger = loot.generate('dagger', 'magic', 'medium', { rng });
  const cd = compareItem(dagger, hero, { loot, canUse: (h, it) => h.weapons.includes(it.subtype) });
  assert.equal(cd.usable, false); assert.match(cd.why, /cannot use daggers/);
  const chest = loot.generateSetItem('longwatch_stalker', 2, 'high', rng);
  const cs = compareItem(chest, hero, { loot });
  assert.equal(cs.set.worn, 1); assert.equal(cs.set.withItem, 2);
  assert.ok(cs.set.steps.find(s => s.at === 2).onWith && !cs.set.steps.find(s => s.at === 2).on, 'the 2-piece bonus switches on with it');
  const html = compareTipHtml(cs, { it: chest, describe: a => loot.describe(a), legendaryText: id => id, className: id => id });
  assert.match(html, /Longwatch Stalker/); assert.match(html, /with this/); assert.match(html, /tipcmp-diff/);
  assert.match(setInfoHtml(cs.set), /1\/4/);
});
