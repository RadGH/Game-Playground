// E42: the combat AI (js/ai.js + data/ai.json). Each test sets up one concrete situation and checks
// the choice and its reason. Heroes are level 10 with their class kit; `skills` is overridden where a
// test needs a specific pair of options.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Loot } from '../js/loot.js'; import { makeRng } from '../js/rng.js';
import { createHero, makeEnemy } from '../js/rules.js'; import { Combat } from '../js/combat.js';
import { decideHero, decideEnemy, DEFAULT_AI, stripDocs, AI_SOURCE } from '../js/ai.js';
const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const items = J('items.json'), classes = J('classes.json').classes, skills = J('skills.json').skills, enemies = J('enemies.json').entities, spells = J('enemy-spells.json').spells, builds = J('build-presets.json');
const loot = new Loot(items); const cls = id => classes.find(c => c.id === id); const buildFor = id => (builds.presets || builds.builds || builds).find?.(b => b.class === id) || null;

function hero(classId, { name = classId, level = 10, kit = null } = {}) {
  const h = createHero({ name, classId, classDef: cls(classId), build: buildFor(classId), loot, skills, level, rng: makeRng(7) });
  h.short = name; if (kit) h.skills = kit; return h;
}
function foe(id = 'goblin_scout', { index = 0, group = 0, hp = null } = {}) {
  const e = makeEnemy(enemies[id], { act: 1, heroes: 4, index }); e.group = group;
  if (hp != null) { e.maxHp = hp; e.hp = hp; } return e;
}
/** A fight already in its second round, so "last round" means something. */
function fight(party, foes, seed = 1) { const C = new Combat(party, foes, { skills, spells, loot, rng: makeRng(seed), act: 1, bossPhases: {} }); C.round_ = 2; return C; }
const setHp = (u, frac) => { u.hp = Math.max(1, Math.round(u.maxHp * frac)); };

test('E42: data/ai.json is loaded and matches the fallback copy in js/ai.js', () => {
  assert.equal(AI_SOURCE.loaded, true, AI_SOURCE.error || 'not loaded');
  assert.deepEqual(stripDocs(J('ai.json')), DEFAULT_AI);
});

test('E42: a cleric heals an ally on 25% health instead of attacking, and says so', () => {
  const tank = hero('warrior', { name: 'Corvin' }), cleric = hero('cleric', { name: 'Mirelle', kit: ['heal', 'smite'] });
  const C = fight([tank, cleric], [foe(), foe('goblin_scout', { index: 1 })]);
  setHp(tank, 0.25);
  const d = decideHero(C, cleric);
  assert.equal(d.kind, 'skill'); assert.equal(d.skill.id, 'heal'); assert.equal(d.ally, tank);
  assert.equal(d.reason, 'heals Corvin (25% health)');
  const before = tank.hp; C.heroAI(cleric);
  const ev = C.log.find(e => e.type === 'skill' && e.source === cleric);
  assert.equal(ev.why, 'heals Corvin (25% health)'); assert.equal(ev.whyRule, 'heal');
  assert.ok(tank.hp > before, 'Corvin got the heal');
  assert.equal(C.decisions.at(-1).reason, 'heals Corvin (25% health)');
});

test('E42: the lowest ally is healed first, and a tank outranks a companion on the same health', () => {
  const tank = hero('warrior', { name: 'Corvin' }), mage = hero('mage', { name: 'Ione' }), cleric = hero('cleric', { name: 'Mirelle', kit: ['heal'] });
  const C = fight([tank, mage, cleric], [foe('goblin_scout', { hp: 3000 })]);
  setHp(tank, 0.5); setHp(mage, 0.3);
  assert.equal(decideHero(C, cleric).ally, mage, 'the mage is lower');
  const pet = hero('ranger', { name: 'Hound' }); pet.isCompanion = true; const C2 = fight([pet, tank, cleric], [foe('goblin_scout', { hp: 3000 })]);
  setHp(pet, 0.45); setHp(tank, 0.45);
  assert.equal(decideHero(C2, cleric).ally, tank, 'same share of health: the tank comes before a companion');
});

test('E42: a party heal is chosen when three allies are under 60%', () => {
  const a = hero('warrior', { name: 'Corvin' }), b = hero('ranger', { name: 'Ash' }), c = hero('mage', { name: 'Ione' });
  const healer = hero('cleric', { name: 'Mirelle', kit: ['heal', 'healing_totem'] });
  const C = fight([a, b, c, healer], [foe('goblin_scout', { hp: 3000 })]);
  for (const u of [a, b, c]) setHp(u, 0.5);
  const d = decideHero(C, healer);
  assert.equal(d.skill?.id, 'healing_totem'); assert.equal(d.rule, 'group-heal'); assert.equal(d.reason, 'heals the party (3 hurt)');
  // one hurt ally: the single heal is the better spend
  setHp(b, 1); setHp(c, 1);
  assert.equal(decideHero(C, healer).skill?.id, 'heal');
});

test('E42: nobody casts a heal on a party at full (or nearly full) health', () => {
  const a = hero('warrior'), c = hero('cleric', { kit: ['heal'] });
  const C = fight([a, c], [foe('goblin_scout', { hp: 3000 })]);
  assert.equal(decideHero(C, c).kind, 'attack');
  setHp(a, 0.9); assert.equal(decideHero(C, c).kind, 'attack', '90% is not worth a heal');
  setHp(a, 0.2); assert.equal(decideHero(C, c).skill?.id, 'heal');
});

test('E42: an area skill is used on four clumped enemies but not on a lone one', () => {
  const pack = [0, 1, 2, 3].map(i => foe('goblin_scout', { index: i, group: 0, hp: 5000 }));
  const mage4 = hero('mage', { name: 'Ione', kit: ['smite', 'fireball'] });
  const d4 = decideHero(fight([mage4], pack), mage4);
  assert.equal(d4.skill?.id, 'fireball'); assert.equal(d4.rule, 'area'); assert.equal(d4.reason, 'hits 4 enemies');
  const mage1 = hero('mage', { name: 'Ione', kit: ['smite', 'fireball'] });
  const d1 = decideHero(fight([mage1], [foe('goblin_scout', { hp: 5000 })]), mage1);
  assert.notEqual(d1.skill?.id, 'fireball');
  assert.ok(d1.skipped.some(s => s.skill === 'fireball'), 'the skipped list says why fireball was left alone');
});

test('E42: mana is not spent finishing one enemy that is about to die', () => {
  const m = hero('mage', { name: 'Ione', kit: ['smite', 'fireball'] });
  const last = foe('goblin_scout', { hp: 400 }); last.hp = 3;
  const d = decideHero(fight([m], [last]), m);
  assert.equal(d.kind, 'attack', 'a basic attack finishes it just as well'); assert.equal(d.rule, 'finish');
});

test('E42: heroes finish a nearly dead enemy, focus a healer, and interrupt a channelled spell', () => {
  const w = hero('warrior', { name: 'Corvin', kit: [] });
  const full = foe('goblin_scout', { index: 0, hp: 400 }), low = foe('goblin_scout', { index: 1, hp: 400 }); low.hp = 5;
  const d = decideHero(fight([w], [full, low]), w);
  assert.equal(d.target, low); assert.equal(d.rule, 'finish'); assert.match(d.reason, /^finishes /);
  const w2 = hero('warrior', { name: 'Corvin', kit: [] });
  const brute = foe('goblin_scout', { index: 0, hp: 3000 }), mender = foe('goblin_shaman', { index: 1, hp: 3000 }); mender.role = 'healer';
  const d2 = decideHero(fight([w2], [brute, mender]), w2);
  assert.equal(d2.target, mender); assert.match(d2.reason, /the healer/);
  const w3 = hero('warrior', { name: 'Corvin', kit: [] });
  const a = foe('goblin_scout', { index: 0, hp: 3000 }), caster = foe('goblin_scout', { index: 1, hp: 3000 });
  caster._windUp = { spell: spells.lich_soul_shatter, rounds: 1, interruptThreshold: 35, taken: 33 };
  const d3 = decideHero(fight([w3], [a, caster]), w3);
  assert.equal(d3.target, caster); assert.equal(d3.rule, 'interrupt'); assert.match(d3.reason, /interrupts .*Soul Shatter/);
});

test('E42: attacks stay off a sleeping enemy while another is awake', () => {
  const w = hero('warrior', { kit: [] }); const asleep = foe('goblin_scout', { index: 0, hp: 400 }), awake = foe('goblin_scout', { index: 1, hp: 400 });
  const C = fight([w], [asleep, awake]); C.addStatus(asleep, 'sleep', 2, 0); asleep.hp = 50;
  assert.equal(decideHero(C, w).target, awake);
});

test('E42: a tank taunts when the healer is being attacked, and the enemy then goes for the tank', () => {
  const k = hero('knight', { name: 'Brand', kit: ['knight_shield_bash', 'knight_taunt'] }), c = hero('cleric', { name: 'Mirelle', kit: ['heal'] });
  const brute = foe('goblin_scout', { hp: 3000 }); brute.dmg = [30, 40];
  const C = fight([k, c], [brute]);
  assert.notEqual(decideHero(C, k).skill?.id, 'knight_taunt', 'nobody is threatened yet');
  C.markHit(brute, c, 35);   // the brute went for the cleric last round
  const d = decideHero(C, k);
  assert.equal(d.skill?.id, 'knight_taunt'); assert.equal(d.rule, 'taunt'); assert.equal(d.reason, 'taunts to protect Mirelle');
  C.heroAI(k); assert.ok(k.taunting > 0);
  assert.equal(decideEnemy(C, brute).target, k);
  k.cooldowns = {}; assert.notEqual(decideHero(C, k).skill?.id, 'knight_taunt', 'already taunting');
});

test('E42: a healer does not spend the mana it needs for a heal', () => {
  const a = hero('warrior'), c = hero('cleric', { kit: ['heal', 'smite'] });
  const C = fight([a, c], [foe('goblin_scout', { hp: 5000 })]);
  const kit = C.usableSkills(c); const smite = kit.find(s => s.id === 'smite'), heal = kit.find(s => s.id === 'heal');
  c.mp = C.skillCost(c, smite) + C.skillCost(c, heal) - 1;
  const d = decideHero(C, c);
  assert.notEqual(d.skill?.id, 'smite'); assert.ok(d.skipped.some(s => s.skill === 'smite' && /mana/.test(s.why)));
  c.mp = c.maxMp; assert.ok(!decideHero(C, c).skipped.some(s => s.skill === 'smite'), 'with mana to spare, Smite is weighed normally');
});

test('E42: a priest raises a fallen ally before anything else', () => {
  const a = hero('warrior', { name: 'Corvin' }), p = hero('priest', { name: 'Isla', kit: ['priest_mend', 'priest_call_back'] });
  const C = fight([a, p], [foe('goblin_scout', { hp: 3000 })]);
  a.hp = 0; a.alive = false;
  const d = decideHero(C, p); assert.equal(d.skill?.id, 'priest_call_back'); assert.equal(d.reason, 'raises Corvin');
  C.heroAI(p); assert.ok(a.alive && a.hp > 0);
});

test('E42: a cleanse goes to the stunned ally', () => {
  const a = hero('warrior', { name: 'Corvin' }), b = hero('mage', { name: 'Ione' }), ch = hero('chronomancer', { name: 'Vey', kit: ['rewind'] });
  const C = fight([a, b, ch], [foe('goblin_scout', { hp: 3000 })]);
  setHp(a, 0.5); setHp(b, 0.5); C.addStatus(b, 'stun', 2, 0); C.addStatus(b, 'burn', 3, 12);
  const d = decideHero(C, ch); assert.equal(d.skill?.id, 'rewind'); assert.equal(d.ally, b);
});

test('E42: a party buff goes out early and is not recast while it runs', () => {
  const w = hero('warrior', { name: 'Corvin', kit: ['battle_cry'] }), r = hero('ranger'), m = hero('mage');
  const C = fight([w, r, m], [foe('goblin_scout', { hp: 3000 })]); C.round_ = 1;
  const d = decideHero(C, w); assert.equal(d.skill?.id, 'battle_cry'); assert.equal(d.reason, 'readies the party before the fight turns');
  C.heroAI(w); assert.ok(w.dmgBuff > 0);
  w.cooldowns = {}; assert.notEqual(decideHero(C, w).skill?.id, 'battle_cry', 'still running on everyone');
});

test('E42: enemies use the same rules: no second curse, heal only the hurt, respect a taunt', () => {
  const a = hero('warrior', { name: 'Corvin' }), b = hero('mage', { name: 'Ione' });
  const cultist = foe('veil_cultist', { hp: 3000 }); const C = fight([a, b], [cultist]);
  C.addStatus(a, 'curse', 3, 25, cultist);
  const d = decideEnemy(C, cultist, { spells: [spells.acolyte_curse] });
  assert.equal(d.kind, 'spell'); assert.equal(d.target, b); assert.match(d.reason, /^curses Ione/);
  C.addStatus(b, 'curse', 3, 25, cultist);
  assert.equal(decideEnemy(C, cultist, { spells: [spells.acolyte_curse] }).kind, 'attack', 'both cursed: the spell is worth nothing, so it swings');

  const mender = foe('goblin_shaman', { index: 0 }), hurt = foe('goblin_scout', { index: 1 });
  const C2 = fight([hero('warrior')], [mender, hurt]);
  assert.equal(decideEnemy(C2, mender, { spells: [spells.priest_heal] }).kind, 'attack', 'nobody hurt: no heal');
  setHp(hurt, 0.3);
  const h = decideEnemy(C2, mender, { spells: [spells.priest_heal] }); assert.equal(h.kind, 'spell'); assert.equal(h.ally, hurt);

  const q = hero('cleric', { name: 'Mirelle' }), t = hero('knight', { name: 'Brand' }); const imp = foe('imp', { hp: 3000 });
  const C3 = fight([q, t], [imp]); t.taunting = 2;
  assert.equal(decideEnemy(C3, imp, { spells: [spells.imp_fireball] }).target, t);
  assert.equal(decideEnemy(C3, imp).target, t);
});

test('E42: an enemy silence goes to the caster, not the fighter in front', () => {
  const w = hero('warrior', { name: 'Corvin' }), c = hero('cleric', { name: 'Mirelle' });
  const shade = foe('void_shade', { hp: 3000 }); const C = fight([w, c], [shade]);
  const d = decideEnemy(C, shade, { spells: [spells.void_silence] });
  assert.equal(d.target, c); assert.match(d.reason, /silences Mirelle/);
});

test('E42: in a real fight every hero skill event says why, and nobody stands idle', () => {
  const party = ['warrior', 'ranger', 'mage', 'cleric'].map(id => hero(id, { level: 3 }));
  const enc = J('encounters.json').encounters.goblin_patrol; const foes = []; let i = 0;
  for (const g of enc.enemies) for (let k = 0; k < g.count; k++) foes.push(Object.assign(makeEnemy(enemies[g.ref], { act: 1, heroes: 4, overrides: g.overrides || {}, index: i++ }), { group: 0 }));
  const C = new Combat(party, foes, { skills, spells, loot, rng: makeRng(11), act: 1, bossPhases: {} });
  const r = C.runAll(); assert.ok(['win', 'lose', 'timeout'].includes(r.result));
  const heroSkills = r.events.filter(e => e.type === 'skill' && !e.source.isEnemy);
  assert.ok(heroSkills.length > 0, 'somebody used a skill');
  for (const e of heroSkills) assert.ok(typeof e.why === 'string' && e.why.length > 3, `${e.name} has a reason`);
  assert.ok(C.decisions.length > 0);
  assert.ok(C.decisions.every(d => d.reason && d.rule), 'every decision carries a rule and a reason');
});

test('E42: the AI remembers who hit whom without making the party unsaveable', () => {
  const party = ['warrior', 'cleric'].map(id => hero(id, { level: 3 }));
  const foes = [foe('goblin_scout', { index: 0 }), foe('goblin_scout', { index: 1 })];
  const C = new Combat(party, foes, { skills, spells, loot, rng: makeRng(3), act: 1, bossPhases: {} });
  for (let i = 0; i < 3 && !C.over; i++) C.round();
  assert.ok(party.some(h => h._lastHit) || foes.some(e => e._lastTarget), 'the fight left hit memory behind');
  assert.doesNotThrow(() => JSON.stringify({ party, foes }), 'Game.save() stringifies the party; a circle here broke save and reload');
});
