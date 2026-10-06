// node --test prototypes/thousandvale/tests/E/playtest4-gear.test.js
// Owner play-test 4 (~/claude/agent/mmo/round-playtest4.md), streams C/E item data:
//   S17 "only swords seen — make sure axes, polearms, javelins, shields etc. exist and drop/sell". Measured before the
//       fix at L1-8: swords 34.8% of weapon drops; axes, maces, spears, polearms, crossbows, javelins, shields, orbs,
//       tomes 0% (Farhold's lootTiers give levels 1-4 just dagger/sword/wand/shortbow). data/rules/loot-pool.json +
//       js/rules/loot-pool.js now pick group -> family -> base.
//   S18 a second armour tier per class with iconography (data/rules/armour-tiers.json): themed from level 15, never
//       at level 1, every class has a theme its armour weight can roll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engineFor, parityEngineFor } from '../C/setup.mjs';
import { makeRng } from '../../js/rules/rng.js';
import { familyOf, weightOf, themePools, pickBase } from '../../js/rules/loot-pool.js';
import { realServer, joinReal, rec } from '../A/pt1-helpers.js';
import { createShops } from '../../js/sim/shops.js';

const FAMILIES = ['sword', 'greatsword', 'axe', 'mace', 'dagger', 'spear', 'polearm', 'javelin', 'bow', 'crossbow', 'staff', 'wand', 'scepter', 'orb', 'tome', 'shield', 'focus', 'quiver'];
const TIERS = JSON.parse(readFileSync(new URL('../../data/rules/armour-tiers.json', import.meta.url), 'utf8'));
const CLASSES = JSON.parse(readFileSync(new URL('../../../farhold/data/classes.json', import.meta.url), 'utf8')).classes;

test('S17: random drops at levels 1-8 cover every weapon family, shields and off-hands; swords are no longer most of it', async () => {
  const eng = await engineFor(7);
  const rng = makeRng(4242);
  const fam = {}; let weapons = 0, n = 0;
  for (let lv = 1; lv <= 8; lv++) for (let i = 0; i < 2500; i++) {
    const it = eng.rpg.rollDrops({ level: lv }, { rng })[0];
    if (!it || it.isUnique || it.setId) continue;
    n++;
    const f = familyOf(eng.items, it.baseKey);
    assert.ok(f, 'every drop is a known base: ' + it.baseKey);
    fam[f] = (fam[f] || 0) + 1;
    if (eng.items.weaponBases[it.baseKey]) weapons++;
  }
  for (const f of FAMILIES) assert.ok((fam[f] || 0) / n > 0.004, f + ' drops (' + (fam[f] || 0) + ' of ' + n + ')');
  const swords = (fam.sword || 0) + (fam.greatsword || 0);
  assert.ok(swords / weapons < 0.25, 'swords ' + (100 * swords / weapons).toFixed(1) + '% of weapon drops');
  // every family is open from level 1
  const pool = eng.lootPool;
  for (const f of FAMILIES) assert.ok(pool.families[f].bases.some(b => b.from <= 1), f + ' open at level 1');
  // high-level Farhold bases still drop (merged from lootTiers)
  assert.ok(pool.families.sword.bases.some(b => b.key === 'dragonfang_sword' && b.from >= 20));
  const keys = new Set(); for (let i = 0; i < 3000; i++) keys.add(pickBase(pool, 30, rng));
  assert.ok(keys.has('dragonfang_sword') || keys.has('dragonfang_greatsword'), 'level 30 can roll the dragon bases');
});

test('S17: the parity engine keeps Farhold\'s own base picking (no pool, no themes)', async () => {
  const eng = await parityEngineFor(3);
  assert.equal(eng.lootPool, null); assert.equal(eng.armourTiers, null);
  const rng = makeRng(9);
  for (let i = 0; i < 400; i++) { const it = eng.rpg.rollDrop({ level: 2, rng, chance: 1 }); if (it && !it.isUnique && !it.setId) assert.ok(['dagger', 'sword', 'wand', 'shortbow', 'cloth_helm', 'light_helm', 'cloth_chest', 'light_chest', 'light_legs', 'light_gauntlets', 'light_boots', 'ring', 'necklace', 'grimoire', 'psalter', 'seer_orb', 'reliquary', 'effigy'].includes(it.baseKey), it.baseKey); }
});

test('S17: at level 1 in Torborhold every family can be bought (smith, bowyer, apothecary, tailor, armourer)', async () => {
  const { srv, clock, world } = await realServer();
  const P = world.P.values().next().value;
  const a = await joinReal(srv, clock, 'Shopper', 'warrior');
  const o = rec(world, a), rules = o.room.rules;
  o.char.level = 1;
  const S = createShops({ data: P.L.shops, rng: makeRng(5) });
  const town = P.L.shops.towns.Torborhold;
  const seen = new Set();
  for (const kid of town.shops) {
    const k = S.kinds[kid];
    for (const r of S.stock({ id: 1, data: { key: 't' + kid, npc: { role: k.role, shop: kid } } }, o.entity, rules, 'Torborhold')) {
      if (!r.item || !r.item.baseKey) continue;
      const f = familyOf(rules.room.engine.items, r.item.baseKey); if (f) seen.add(f);
    }
  }
  for (const f of FAMILIES) assert.ok(seen.has(f), f + ' for sale in Torborhold at level 1 (have ' + [...seen].join(',') + ')');
  a.close(); await srv.stop();
});

test('S18: every class has a second-tier theme its armour weight can roll; themes have the iconography D-world needs', () => {
  const pools = themePools(TIERS);
  for (const c of CLASSES) {
    const t = TIERS.classes[c.id];
    assert.ok(t, c.id + ' has a tier-2 entry');
    assert.equal(t.weight, c.armorTier, c.id + ' weight matches Farhold classes.json armorTier');
    assert.ok(TIERS.themes[t.theme], c.id + ' theme exists');
    assert.ok(pools[t.weight].includes(t.theme));
    assert.ok(t.set && !/ember|veil|muster/i.test(t.set), c.id + ' set name');
  }
  for (const [id, th] of Object.entries(TIERS.themes)) {
    for (const k of ['prefix', 'emblem', 'trim', 'glow', 'element', 'desc']) assert.ok(th[k], id + '.' + k);
    assert.ok(!/ember|veil|muster/i.test(th.prefix + th.name), id + ' name');
  }
  const icons = new Set(Object.values(TIERS.themes).map(t => t.emblem));
  for (const want of ['flame', 'bolt', 'drop', 'snowflake', 'sunburst', 'eye']) assert.ok(icons.has(want), 'iconography ' + want);
});

test('S18: themed pieces drop from level 15 for every weight, never at level 1, never on uniques', async () => {
  const eng = await engineFor(11);
  const rng = makeRng(77);
  const byWeight = {};
  for (const base of ['cloth_chest', 'light_chest', 'medium_chest', 'heavy_chest', 'cloth_helm', 'heavy_boots', 'buckler', 'tower_shield', 'grimoire']) {
    for (let i = 0; i < 200; i++) {
      const lo = eng.rpg.rollDrop({ level: 1, rng, chance: 1, bases: [base] });
      assert.ok(!lo || !lo.theme, 'no theme at level 1');
      const hi = eng.rpg.rollDrop({ level: 18, rng, chance: 1, bases: [base] });
      if (hi && hi.theme) {
        const w = weightOf(eng.items, base);
        (byWeight[w] ||= new Set()).add(hi.theme);
        assert.equal(hi.tier, 2);
        assert.ok(hi.name.startsWith(TIERS.themes[hi.theme].prefix + ' '), hi.name);
        assert.equal(hi.themeLook.emblem, TIERS.themes[hi.theme].emblem);
        assert.ok(!hi.isUnique && !hi.setId && hi.rarity !== 'legendary');
      }
    }
  }
  const pools = themePools(TIERS);
  for (const w of ['cloth', 'light', 'medium', 'heavy']) {
    assert.ok(byWeight[w] && byWeight[w].size >= 2, w + ' themed pieces drop at 18: ' + [...(byWeight[w] || [])]);
    for (const t of byWeight[w]) assert.ok(pools[w].includes(t), w + ' rolls only its classes\' themes');
  }
  // a focus keeps its string model id in `look`
  for (let i = 0; i < 100; i++) { const f = eng.rpg.rollDrop({ level: 20, rng, chance: 1, bases: ['grimoire'] }); if (f && f.theme) { assert.equal(typeof f.look === 'object' ? 'obj' : typeof f.look, typeof eng.rpg.rollDrop({ level: 1, rng, chance: 1, bases: ['grimoire'] }).look === 'object' ? 'obj' : 'string'); break; } }
});
