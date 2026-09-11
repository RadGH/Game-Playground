import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Loot } from '../js/loot.js'; import { makeRng } from '../js/rng.js'; import { createHero, derive, mergeSkill, gainXp, makeEnemy, levelFromXp, classSkills, passiveTree, equip } from '../js/rules.js'; import { Combat } from '../js/combat.js';
const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const items = J('items.json'), classes = J('classes.json').classes, skills = J('skills.json').skills, enemies = J('enemies.json').entities, spells = J('enemy-spells.json').spells, encounters = J('encounters.json').encounters, builds = J('build-presets.json');
const loot = new Loot(items); const cls = id => classes.find(c => c.id === id); const buildFor = id => (builds.presets || builds.builds || builds).find?.(b => b.class === id) || null;
test('hero creation: attrs from the build, starting kit equipped, derived stats sane', () => {
  const h = createHero({ name: 'Test', classId: 'warrior', classDef: cls('warrior'), build: buildFor('warrior'), loot, skills });
  assert.equal(h.attrs.STR + h.attrs.DEX + h.attrs.INT + h.attrs.CON, 32 + 8); assert.ok(h.equipment.weapon && h.equipment.chest); const d = derive(h, loot);
  assert.equal(d.maxHp, 50 + d.CON * 10); assert.ok(d.hit >= 70 && d.hit <= 95); assert.ok(d.dmgMax > d.dmgMin); assert.deepEqual(h.skills, ['cleave']);
});
test('every class creates a hero with its kit and at least one skill', () => { for (const c of classes) { const h = createHero({ name: c.name, classId: c.id, classDef: c, build: buildFor(c.id), loot, skills }); assert.ok(h.maxHp > 50, c.id); assert.ok(h.skills.length >= 1, c.id + ' has no level-1 skill'); } });
test('xp table + level-up points; skill merge applies talents and level upgrades', () => {
  const h = createHero({ name: 'X', classId: 'mage', classDef: cls('mage'), build: buildFor('mage'), loot, skills }); assert.equal(levelFromXp(0), 1); assert.equal(levelFromXp(320), 3); const gained = gainXp(h, 1400); assert.equal(h.level, 6); assert.equal(gained, 5); assert.equal(h.pendingAttr, 10); assert.equal(h.pendingTalent, 1); assert.equal(h.pendingPassive, 1);
  const fb = { id: 'fireball', ...skills.fireball }; const m0 = mergeSkill(fb, { level: 1, talents: {} }); assert.equal(m0.damageMult, 1.4); const m10 = mergeSkill(fb, { level: 10, talents: { fb_wider: true } }); assert.equal(m10.damageMult, 1.9); assert.equal(m10.aoe, 'group2'); assert.equal(passiveTree('mage').length, 5); assert.equal(classSkills(skills, 'mage', 15).length, 4);
});
test('a fight between four level-1 heroes and a goblin patrol ends with events and usually a win', () => {
  let wins = 0; for (let seed = 1; seed <= 12; seed++) { const rng = makeRng(seed); const party = ['warrior', 'ranger', 'mage', 'cleric'].map(id => createHero({ name: id, classId: id, classDef: cls(id), build: buildFor(id), loot, skills }));
    const enc = encounters.goblin_patrol; const foes = []; let i = 0; for (const g of enc.enemies) for (let k = 0; k < g.count; k++) foes.push(Object.assign(makeEnemy(enemies[g.ref], { act: 1, heroes: 4, overrides: g.overrides || {}, index: i++ }), { group: foes.length }));
    const c = new Combat(party, foes, { skills, spells, loot, rng, act: 1 }); const r = c.runAll(); assert.ok(['win', 'lose', 'timeout'].includes(r.result)); assert.ok(r.events.some(e => e.type === 'damage')); assert.ok(r.events.some(e => e.type === 'skill'), 'someone used a skill'); if (r.result === 'win') wins++; }
  assert.ok(wins >= 6, 'wins ' + wins);
});
test('equipping a two-hander clears the off-hand; unique legendary effect is listed', () => {
  const h = createHero({ name: 'K', classId: 'knight', classDef: cls('knight'), build: buildFor('knight'), loot, skills }); assert.ok(h.equipment.offhand); const gs = loot.generate('sword2h', 'magic', 'medium', { rng: makeRng(1) }); const displaced = equip(h, gs, loot); assert.ok(!h.equipment.offhand); assert.equal(displaced.length, 2);
  const u = loot.generateUnique('sentinels_gaze', makeRng(2)); equip(h, u, loot); assert.ok(derive(h, loot).legendary.includes('cheat_death_once'));
});
