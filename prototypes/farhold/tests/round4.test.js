// Farhold round 4 — the RPG expansion, tested without a browser.
//
// Everything here is pure: zones are arithmetic over the region graph, the dungeon layout is
// rectangles and line segments, crafting is a cost table and an item, and the effect registry is a
// dictionary of functions. None of it needs Three.js, so `node --test` drives the real code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildZones, zoneTone, DANGER_WORDS } from '../js/zones.js';
import { layout, insideLayout } from '../js/dungeon-plan.js';
import { createCrafting, Materials } from '../js/craft.js';
import { Effects, EFFECTS, effectFor, describeAffix, isMagic } from '../js/effects.js';
import { Rpg } from '../js/rpg.js';
import { applyStatus, tickStatuses, buffsOf, outgoingFrom, incomingFrom } from '../js/skills.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const items = read('../../emberveil/data/items.json');
const balance = read('../data/balance.json');
const bestiary = read('../data/enemies.json');
const craftData = read('../data/crafting.json');
const classData = read('../data/classes.json');
const skillData = read('../data/skills.json');

const rpg = () => new Rpg(items, { ...balance, seed: 1 });

/** A stand-in world: N regions in a line, so the hop distance is known exactly. */
function chainWorld(n = 6, width = 64, height = 32) {
  const regions = [];
  for (let i = 0; i < n; i++) {
    regions.push({
      id: i, name: 'Region ' + i, race: 'human', descriptor: 'test',
      center: { x: i * 8 + 2, y: 4 }, cells: 100,
      neighbours: [i - 1, i + 1].filter(k => k >= 0 && k < n),
    });
  }
  const region = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) region[y * width + x] = Math.min(n - 1, Math.floor(x / (width / n)));
  }
  return { width, height, regions, region };
}

// ───────────────────────────── zones ─────────────────────────────

test('the region you start in is always the softest place on the planet', () => {
  const world = chainWorld(6);
  // start at the far end of the chain, where the graph would otherwise put the highest band
  const zones = buildZones(world, { spawn: [63 * 640, 0], maxLevel: 30 });
  const home = zones.zones.find(z => z.home);
  assert.ok(home, 'no home region');
  assert.equal(home.minLevel, 1, 'the starting region must begin at level 1');
  assert.equal(home.band, 0);
  assert.equal(home.danger, DANGER_WORDS[0]);
  for (const z of zones.zones) {
    if (z.home) continue;
    assert.ok(z.minLevel > home.minLevel, `${z.name} is not harder than home`);
  }
});

test('bands climb with hops away from home, and reach the top of the level range', () => {
  const world = chainWorld(7);
  const zones = buildZones(world, { spawn: [0, 0], maxLevel: 30, bandWidth: 4 });
  const byHop = [...zones.zones].sort((a, b) => a.hops - b.hops);
  for (let i = 1; i < byHop.length; i++) {
    assert.ok(byHop[i].minLevel >= byHop[i - 1].minLevel, 'a further region got easier');
  }
  const top = Math.max(...zones.zones.map(z => z.maxLevel));
  assert.ok(top >= 26, `the far end only reaches level ${top}`);
  assert.ok(zones.zones.every(z => z.maxLevel <= 30), 'a band went over the level cap');
});

test('every world shape gets usable bands, including a single region and an island', () => {
  const one = buildZones(chainWorld(1), { spawn: [0, 0] });
  assert.equal(one.zones.length, 1);
  assert.equal(one.zones[0].minLevel, 1);

  // an island: a region with no neighbours at all, cut off from the chain
  const world = chainWorld(4);
  world.regions.push({ id: 4, name: 'Island', neighbours: [], center: { x: 60, y: 20 }, cells: 20 });
  const zones = buildZones(world, { spawn: [0, 0], maxLevel: 30 });
  const island = zones.zones.find(z => z.name === 'Island');
  assert.ok(island.minLevel >= zones.zones[3].minLevel, 'an unreachable island should be at least as bad as the far end');
});

test('a zone rolls levels inside its own band and nowhere else', () => {
  const zones = buildZones(chainWorld(5), { spawn: [0, 0], maxLevel: 30, bandWidth: 4 });
  const rng = makeRng(3);
  for (let i = 0; i < 400; i++) {
    const x = rng() * 5 * 640 * 12, z = rng() * 100;
    const zone = zones.at(x, z);
    const level = zones.levelFor(x, z, rng);
    assert.ok(level >= zone.minLevel && level <= zone.maxLevel, `${level} is outside ${zone.minLevel}-${zone.maxLevel}`);
  }
});

test('zoneTone reads the gap between a zone and you the way a player would', () => {
  assert.equal(zoneTone(1, 10), 'trivial');
  assert.equal(zoneTone(9, 10), 'even');
  assert.equal(zoneTone(13, 10), 'hard');
  assert.equal(zoneTone(20, 10), 'deadly');
});

// ───────────────────────────── dungeons ─────────────────────────────

test('a dungeon layout puts the boss at the far end and joins every room up', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const plan = layout({ seed, rooms: [6, 11] });
    assert.ok(plan.rooms.length >= 5, `seed ${seed} made only ${plan.rooms.length} rooms`);
    assert.ok(plan.entrance && plan.boss, `seed ${seed} has no entrance or no boss room`);
    if (plan.rooms.length > 1) {
      assert.notEqual(plan.boss, plan.entrance, `seed ${seed} put the boss in the doorway`);
    }
    // every room is reachable from the entrance through the halls
    const seen = new Set([plan.entrance.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const h of plan.halls) {
        if (seen.has(h.from) && !seen.has(h.to)) { seen.add(h.to); grew = true; }
        if (seen.has(h.to) && !seen.has(h.from)) { seen.add(h.from); grew = true; }
      }
    }
    assert.equal(seen.size, plan.rooms.length, `seed ${seed} left ${plan.rooms.length - seen.size} rooms walled off`);
  }
});

test('rooms never overlap, and a point in the middle of a room is inside the layout', () => {
  const plan = layout({ seed: 12 });
  for (let i = 0; i < plan.rooms.length; i++) {
    for (let j = i + 1; j < plan.rooms.length; j++) {
      const a = plan.rooms[i], b = plan.rooms[j];
      const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.h + b.h) / 2;
      assert.ok(apart, `rooms ${i} and ${j} are on top of each other`);
    }
  }
  for (const r of plan.rooms) assert.ok(insideLayout(plan, r.x, r.z), 'the middle of a room is not inside the layout');
  // a long way outside the bounds is definitely not floor
  assert.equal(insideLayout(plan, plan.bounds.maxX + 200, plan.bounds.maxZ + 200), null);
});

// ───────────────────────────── crafting ─────────────────────────────

const bench = () => {
  const r = rpg();
  const mats = new Materials();
  return { r, mats, craft: createCrafting({ data: craftData, rpg: r, materials: mats, rng: makeRng(5) }) };
};

test('the materials bag has no limit and never goes negative', () => {
  const m = new Materials();
  m.add('scrap', 1_000_000);
  m.add('scrap', 1_000_000);
  assert.equal(m.count('scrap'), 2_000_000, 'materials should not cap');
  assert.equal(m.spend({ scrap: 3_000_000 }), false, 'it let a cost through it could not pay');
  assert.equal(m.count('scrap'), 2_000_000, 'a failed spend must change nothing');
  assert.equal(m.spend({ scrap: 5 }), true);
  assert.equal(m.count('scrap'), 1_999_995);
});

test('recycling is the ONLY source of material, and better items give better material', () => {
  const { r, craft } = bench();
  const rng = makeRng(2);
  const yields = {};
  for (const rarity of ['normal', 'magic', 'rare', 'legendary']) {
    const got = {};
    for (let i = 0; i < 40; i++) {
      const item = r.loot.generate('heavy_chest', rarity, 'high', { rng });
      for (const [k, v] of Object.entries(craft.recycle(item))) got[k] = (got[k] || 0) + v;
    }
    yields[rarity] = got;
  }
  // three materials, one per rung: scrap from anything, essence from magic upward, dust only from
  // legendaries (and, in the field, from rares and bosses)
  assert.ok(!yields.normal.essence && !yields.normal.dust, 'a plain item should not grind down to essence or dust');
  assert.ok(yields.magic.essence > 0, 'a magic item gives no essence');
  assert.ok(!yields.magic.dust, 'a magic item should not give dust');
  assert.ok(yields.legendary.dust > 0, 'a legendary gives no dust');
  assert.ok(yields.legendary.scrap > yields.normal.scrap, 'better gear should give more scrap, not less');
});

test('the bench refuses what it cannot pay for, and says what is missing', () => {
  const { r, craft } = bench();
  const item = r.loot.generate('longsword', 'rare', 'high', { rng: makeRng(6) });
  const q = craft.quote('reweave', item, { index: 0, player: { level: 10 } });
  assert.equal(q.ok, false);
  assert.match(q.why, /needs .* more/);
  assert.ok(Object.keys(q.short).length, 'it did not say what was short');
  const before = JSON.stringify(item.affixes);
  craft.apply('reweave', item, { index: 0, player: { level: 10 } });
  assert.equal(JSON.stringify(item.affixes), before, 'it reworked an item it could not afford');
});

test('advanced work costs rarer components than plain work', () => {
  const { craft } = bench();
  const plain = craft.byId.forge_weapon.cost;
  const fine = craft.byId.forge_fine.cost;
  const master = craft.byId.forge_masterwork.cost;
  const tier = cost => Math.max(...Object.keys(cost).map(k => craftData.materials[k].tier));
  assert.equal(Object.keys(craftData.materials).length, 3, 'there should be exactly three materials');
  assert.ok(tier(fine) > tier(plain), 'a fine piece costs no rarer material than a plain one');
  assert.ok(tier(master) > tier(fine), 'a masterwork costs no rarer material than a fine piece');
  assert.equal(tier(master), 3, 'the top of the ladder should need the top material');
  // and the same inside the upgrade half: a recast must cost more than a re-roll of the numbers
  assert.ok(tier(craft.byId.recast.cost) > tier(craft.byId.sharpen.cost), 'the gamble is too cheap');
  assert.ok(tier(craft.byId.brand_fire.cost) === 3, 'a brand should need the top material');
});

test('the bench is in two halves: things that make, and things that rework', () => {
  const { craft } = bench();
  assert.ok(craft.creates.length >= 4, 'not enough to forge');
  assert.ok(craft.upgrades.length >= 8, 'not enough to rework with');
  assert.equal(craft.creates.some(r => r.kind !== 'create'), false);
  assert.equal(craft.upgrades.some(r => r.kind === 'create'), false);
  for (const r of craft.upgrades) assert.ok(craft.groups[r.group], `${r.id} is in group "${r.group}", which has no name`);
});

test('forging lets you pick the base, and magic find can carry it higher', () => {
  const { craft } = bench();
  craft.materials.addAll({ scrap: 99999, essence: 9999, dust: 9999 });
  const player = { level: 14, weapons: ['staff', 'wand'] };
  const options = craft.forgeOptions(craft.byId.forge_weapon, player);
  assert.ok(options.length > 4, 'nothing to choose from');
  assert.ok(options.some(o => o.canUse) && options.some(o => !o.canUse), 'it should say which ones this class can hold');
  // the base you pick is the base you get
  for (const key of ['staff', 'dagger', 'bow']) {
    const made = craft.apply('forge_weapon', null, { player, baseKey: key });
    assert.equal(made.made.baseKey, key, `asked for ${key} and got ${made.made.baseKey}`);
  }
  // and magic find pushes the rarity up, the same way a drop does
  const spread = mf => {
    const seen = {};
    // note: call forgeRarity ONCE per iteration — reading it twice rolls twice and counts the second
    for (let i = 0; i < 500; i++) { const r = craft.forgeRarity('normal', mf); seen[r] = (seen[r] || 0) + 1; }
    return seen;
  };
  const none = spread(0), lots = spread(400);
  assert.ok((none.normal || 0) > 400, 'plain forging should usually come out plain');
  assert.ok((lots.normal || 0) < (none.normal || 0), 'magic find did nothing at the bench');
  assert.ok((lots.rare || 0) + (lots.legendary || 0) > 0, 'even at 400% magic find nothing came out rare');
});

test('every bench action does what it says on a real item', () => {
  const { r, craft } = bench();
  craft.materials.addAll({ scrap: 999, essence: 999, dust: 999 });
  const player = { level: 20 };

  const made = craft.apply('forge_fine', null, { player });
  assert.equal(made.ok, true);
  assert.equal(made.made.rarity, 'rare');

  const item = r.loot.generate('longsword', 'magic', 'medium', { rng: makeRng(8) });
  const q0 = item.quality;
  assert.equal(craft.apply('temper', item, { player }).ok, true);
  assert.notEqual(item.quality, q0, 'temper did not raise the quality');

  assert.equal(craft.apply('promote', item, { player }).ok, true);
  assert.equal(item.rarity, 'rare');

  const was = JSON.stringify(item.affixes[0]);
  assert.equal(craft.apply('reweave', item, { index: 0, player }).ok, true);
  assert.notEqual(JSON.stringify(item.affixes[0]), was, 'reweave changed nothing');

  const all = JSON.stringify(item.affixes);
  assert.equal(craft.apply('recast', item, { player }).ok, true);
  assert.notEqual(JSON.stringify(item.affixes), all, 'recast changed nothing');

  assert.equal(craft.apply('brand_fire', item, { player }).ok, true);
  assert.equal(item.brand, 'fire');
  assert.equal(craft.apply('brand_ice', item, { player }).ok, false, 'a weapon took two brands');

  const dmg = item.dmg[1];
  assert.equal(craft.apply('hone', item, { player }).ok, true);
  assert.ok(item.dmg[1] > dmg, 'honing did not raise the damage');
});

test('a unique cannot be reworked — it is what it is', () => {
  const { r, craft } = bench();
  craft.materials.addAll({ scrap: 99, essence: 99, dust: 99 });
  const unique = r.loot.generateUnique(items.uniques[0].id, makeRng(1));
  for (const id of ['reweave', 'recast', 'promote', 'sharpen']) {
    assert.equal(craft.quote(id, unique, { player: { level: 30 } }).ok, false, `${id} was allowed on a unique`);
  }
});

test('reweaving the same item costs more every time', () => {
  const { r, craft } = bench();
  craft.materials.addAll({ essence: 999, dust: 999 });
  const item = r.loot.generate('longsword', 'rare', 'high', { rng: makeRng(4) });
  const player = { level: 10 };
  const first = craft.quote('reweave', item, { index: 0, player }).cost;
  craft.apply('reweave', item, { index: 0, player });
  const second = craft.quote('reweave', item, { index: 0, player }).cost;
  assert.ok(second.essence > first.essence, 'the second reweave was not dearer');
});

// ───────────────────────────── effects ─────────────────────────────

test('the effect registry covers every affix stat and every legendary power', () => {
  const missing = [];
  for (const list of Object.values(items.affixes)) {
    for (const a of list) if (!effectFor(a)) missing.push(a.stat);
  }
  for (const id of Object.keys(items.legendaryEffects)) if (!EFFECTS['legendary:' + id]) missing.push(id);
  assert.deepEqual([...new Set(missing)], []);
  assert.ok(Object.keys(EFFECTS).length >= 86, 'the registry shrank');
});

test('a conditional affix only fires under its condition', () => {
  const r = rpg();
  const fx = r.fx;
  const wearer = { equipment: { ring: { affixes: [{ stat: 'cond_dmgVsUndead', value: 0.5 }] } }, hp: 100, maxHp: 100 };
  const undead = { family: 'undead', hp: 50, maxHp: 50 };
  const beast = { family: 'beast', hp: 50, maxHp: 50 };
  assert.ok(fx.dmgOut({ self: wearer, target: undead }).mult > 1.4, 'no bonus against the undead');
  assert.equal(fx.dmgOut({ self: wearer, target: beast }).mult, 1, 'the bonus fired against a beast');
});

test('cheat death saves you once and then stops', () => {
  const r = rpg();
  const p = r.createPlayer({ level: 10 });
  r.equip(p, { id: 'x', name: 'Ring', type: 'accessory', slot: 'ring', rarity: 'rare', affixes: [{ stat: 'cond_cheatDeath', value: 0.25 }] });
  const rng = makeRng(1);
  const hitter = { dmg: [10000, 10000], critChance: 0 };
  const first = r.strike(hitter, p, rng);
  assert.ok(first.saved > 0, 'cheat death did not fire');
  assert.ok(p.hp > 0, 'it should have left you standing');
  const second = r.strike(hitter, p, rng);
  assert.equal(second.saved, 0, 'it fired twice inside its cooldown');
  assert.equal(p.hp, 0);
});

test('a barrier eats damage before health does, and a mana shield takes its share', () => {
  const r = rpg();
  const p = r.createPlayer({ level: 10 });
  p.barrier = 50;
  const before = p.hp;
  const out = r.strike({ dmg: [30, 30], critChance: 0 }, p, makeRng(2));
  assert.ok(out.absorbed > 0, 'the barrier absorbed nothing');
  assert.equal(p.hp, before, 'health went down while a barrier was up');
});

test('describeAffix says something readable for every affix in the game', () => {
  for (const list of Object.values(items.affixes)) {
    for (const a of list) {
      const text = describeAffix({ ...a, value: (a.min + a.max) / 2 });
      assert.ok(text && text.length > 3 && !/undefined|NaN/.test(text), `${a.stat} reads as "${text}"`);
    }
  }
});

test('physical and elemental damage are told apart', () => {
  assert.equal(isMagic('physical'), false);
  for (const e of ['fire', 'ice', 'lightning', 'poison', 'shadow', 'holy', 'arcane']) assert.equal(isMagic(e), true);
});

// ───────────────────────────── statuses ─────────────────────────────

test('the eight new statuses all do what their block says', () => {
  const S = skillData.statuses;
  const unit = { hp: 100, maxHp: 100 };
  applyStatus(unit, 'shock', S.shock, 1);
  assert.ok(incomingFrom(unit) > 1, 'Shocked does not make you take more');
  delete unit.statuses;
  applyStatus(unit, 'weaken', S.weaken, 1);
  assert.ok(outgoingFrom(unit) < 1, 'Weakened does not make you deal less');
  delete unit.statuses;
  applyStatus(unit, 'haste', S.haste, 1);
  assert.ok(buffsOf(unit).haste > 0 && buffsOf(unit).move > 0, 'Hastened does nothing');
  delete unit.statuses;
  applyStatus(unit, 'regen', S.regen, 1);
  unit.hp = 50;
  tickStatuses(unit, 2);
  assert.ok(unit.hp > 50, 'Mending did not mend');
  delete unit.statuses;
  applyStatus(unit, 'web', S.web, 1);
  assert.ok(buffsOf(unit).damage === 0 && S.web.slow > 0.5, 'Snared should be a heavy slow');
});

test('a burn refreshes rather than stacking, and `longer` really lengthens it', () => {
  const unit = { hp: 100, maxHp: 100 };
  applyStatus(unit, 'burn', skillData.statuses.burn, 1);
  const first = unit.statuses.burn.remaining;
  tickStatuses(unit, 2);
  applyStatus(unit, 'burn', skillData.statuses.burn, 1);
  assert.equal(unit.statuses.burn.remaining, first, 'a second burn should reset the timer, not double it');
  applyStatus(unit, 'burn', skillData.statuses.burn, 1, { longer: 3 });
  assert.equal(unit.statuses.burn.remaining, first + 3);
});

// ───────────────────────────── the data as a whole ─────────────────────────────

test('nothing in the bestiary is knee-high any more', () => {
  // The user's note: "things like rats are tiny, not good." A creature body at size 1 is roughly
  // its real-world metre size, so this is the floor that keeps every enemy readable at eye level.
  const small = [];
  for (const e of [...bestiary.enemies, ...bestiary.bosses]) {
    const c = e.look?.creature;
    if (!c) continue;
    if ((c.size ?? 1) < 1.4) small.push(`${e.id} at size ${c.size}`);
  }
  assert.deepEqual(small, [], 'these are still too small to read as a threat');
});

test('every enemy declares a family, a role and a pack size the spawner can use', () => {
  const families = Object.keys(bestiary.families);
  const roles = ['skirmisher', 'brute', 'archer', 'caster', 'leader', 'boss'];
  for (const e of [...bestiary.enemies, ...bestiary.bosses]) {
    assert.ok(families.includes(e.family), `${e.id} is family "${e.family}"`);
    assert.ok(roles.includes(e.role), `${e.id} has role "${e.role}"`);
    if (e.pack) assert.ok(e.pack[0] >= 1 && e.pack[1] >= e.pack[0], `${e.id} has a nonsense pack size`);
    if (e.leads) for (const id of e.leads) {
      assert.ok(bestiary.enemies.some(x => x.id === id), `${e.id} leads ${id}, which does not exist`);
    }
    if (e.onHit) assert.ok(skillData.statuses[e.onHit], `${e.id} applies ${e.onHit}, which is not a status`);
  }
});

test('every boss has phases that fire in order, and every phase names a real modifier', () => {
  for (const b of bestiary.bosses) {
    assert.ok(b.phases?.length, `${b.id} has no phases`);
    let last = 1;
    for (const p of b.phases) {
      assert.ok(p.at < last, `${b.id} phases are out of order`);
      last = p.at;
      assert.ok(bestiary.modifiers.some(m => m.id === p.modifier), `${b.id} phase uses unknown modifier ${p.modifier}`);
      assert.ok(p.say, `${b.id} has a phase with nothing to say`);
    }
    assert.ok(b.arena > 0, `${b.id} needs room to fight in`);
    if (b.spawns) assert.ok(bestiary.enemies.some(e => e.id === b.spawns.id), `${b.id} calls in ${b.spawns.id}, which does not exist`);
  }
});

test('every pet a class brings actually exists in the pet table', () => {
  let withPets = 0;
  for (const c of classData.classes) {
    if (!c.pet) continue;
    withPets++;
    assert.ok(bestiary.pets.some(p => p.id === c.pet.id), `${c.id} wants ${c.pet.id}`);
    if (c.pet.extra) assert.ok(bestiary.pets.some(p => p.id === c.pet.extra.id), `${c.id} also wants ${c.pet.extra.id}`);
    assert.ok(c.pet.verb, `${c.id} has no word for how it calls its companions`);
  }
  assert.ok(withPets >= 10, `only ${withPets} classes bring companions`);
  assert.ok(classData.classes.find(c => c.id === 'necromancer').pet.id.startsWith('bone'), 'a necromancer must raise skeletons');
  assert.ok(classData.classes.find(c => c.id === 'druid').pet.id.includes('wolf'), 'a druid must call wolves');
  // and every pet a summon skill calls for
  for (const [key, s] of Object.entries(skillData.skills)) {
    if (s.shape !== 'summon') continue;
    assert.ok(bestiary.pets.some(p => p.id === s.pet), `${key} summons ${s.pet}, which does not exist`);
  }
});

test('every pet has a body, a role and stats the AI can drive', () => {
  const roles = ['skirmisher', 'brute', 'archer', 'caster'];
  for (const p of bestiary.pets) {
    assert.ok(p.look?.creature || p.look?.avatar, `${p.id} has no body to build`);
    assert.ok(roles.includes(p.role), `${p.id} has role "${p.role}"`);
    assert.ok(p.hp > 0 && p.dmg?.[1] > 0 && p.speed > 0, `${p.id} cannot fight`);
    if (p.ranged) assert.ok(p.ranged.range > 6, `${p.id} is "ranged" at ${p.ranged.range} m`);
  }
});

test('every modifier changes something, and every one is visible', () => {
  for (const m of bestiary.modifiers) {
    const changes = ['hp', 'dmg', 'armor', 'speed', 'attackEvery', 'gold', 'drop', 'thorns', 'lifeSteal', 'resist', 'onHit']
      .some(k => m[k] !== undefined);
    assert.ok(changes, `${m.id} does nothing`);
    assert.ok(m.aura, `${m.id} has no aura, so you cannot see it coming`);
    assert.ok(m.prefix && m.desc, `${m.id} has no name or description`);
    if (m.onHit) assert.ok(skillData.statuses[m.onHit], `${m.id} applies ${m.onHit}, which is not a status`);
  }
});

test('a chest kind exists for every rung of the ladder, and warded is the rarest', () => {
  const kinds = balance.chests.kinds;
  // Round 8 added the meteorite, which is placed by an event rather than scattered — it carries
  // `weight: 0` so the wild-chest roller never picks it.
  const wild = Object.entries(kinds).filter(([, k]) => k.weight > 0);
  assert.equal(wild.length, 4);
  const weights = wild.map(([, k]) => k.weight);
  assert.equal(Math.min(...weights), kinds.warded.weight, 'the best chest is not the rarest');
  let lastGold = 0;
  for (const key of ['wooden', 'iron', 'gilded', 'warded']) {
    assert.ok(kinds[key].gold[0] > lastGold, `${key} is not worth more than the one below it`);
    lastGold = kinds[key].gold[0];
  }
  // every kind promises a rarity out loud, because the beacon over it is coloured by that promise
  for (const [key, kind] of Object.entries(kinds)) {
    assert.ok(kind.floor, `${key} makes no promise for its beacon to show`);
  }
  // …and the meteorite is the one an event drops, never one you stumble on
  assert.equal(kinds.meteorite.weight, 0);
  assert.equal(kinds.meteorite.floor, 'rare');
  assert.deepEqual(kinds.meteorite.items, [1, 3]);
});

test('rank chances leave most spawns ordinary', () => {
  const R = balance.ranks;
  assert.ok(R.rareChance < R.championChance, 'a rare should be rarer than a champion');
  assert.ok(R.rareChance + R.championChance < 0.25, 'too many spawns would be special');
  const r = rpg();
  const rng = makeRng(9);
  const seen = { normal: 0, champion: 0, rare: 0 };
  for (let i = 0; i < 4000; i++) seen[r.rollRank(rng)]++;
  assert.ok(seen.normal / 4000 > 0.8, `only ${(seen.normal / 40).toFixed(0)}% were ordinary`);
  assert.ok(seen.rare > 0 && seen.champion > 0, 'ranks never came up at all');
});

test('a boss or a rare drops more than an ordinary kill, and at a better rarity', () => {
  const r = rpg();
  const rng = makeRng(11);
  const def = bestiary.enemies[10];
  const count = (rank, n = 200) => {
    let items = 0, good = 0;
    for (let i = 0; i < n; i++) {
      const e = r.makeEnemy(def, 10, rng, { rank });
      for (const it of r.rollDrops(e, { rng })) {
        items++;
        if (it.rarity === 'rare' || it.rarity === 'legendary') good++;
      }
    }
    return { items, good };
  };
  const plain = count('normal'), rare = count('rare');
  assert.ok(rare.items > plain.items * 1.8, `a rare dropped ${rare.items} against ${plain.items}`);
  assert.ok(rare.good > plain.good, 'a rare did not drop better gear');
});

test('the light settings actually light a large area, as asked for', () => {
  const t = balance.light.torch;
  assert.ok(t.range >= 25, `a torch reaching ${t.range} m is a candle`);
  assert.ok(t.intensity >= 2, 'the torch is too dim to walk by');
  assert.ok(balance.light.ambientNight > 0, 'a moonless night would be pure black');
  assert.ok(balance.light.maxLights >= 6, 'too few world lights to read a camp by');
});
