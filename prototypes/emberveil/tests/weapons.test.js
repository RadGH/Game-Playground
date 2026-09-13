// The road weapons (round 14): one row per new weapon, proving its property actually does something.
//
// Every weapon here has at least one property that touches a system Emberveil 2 added on top of the
// original game — travel legs, rations and exhaustion, the night-attack roll, rest, the damage meter's
// per-item kill counts, memories and feelings, named enemies and nemeses, companions or vehicles.
//
// Combat rows run the same seeded fight with and without the weapon and compare what came out.
// World rows run a real Game (travel / rest / victory) with and without it.
// The last test proves every new base can actually drop in the act it belongs to.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Game } from '../js/game.js';
import { Combat } from '../js/combat.js';
import { Loot } from '../js/loot.js';
import { makeEnemy, equip, refresh } from '../js/rules.js';
import { makeRng } from '../js/rng.js';
import { EFFECTS, worldSum } from '../js/effects.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const LJ = f => JSON.parse(fs.readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
const items = J('items.json'), skillData = J('skills.json'), enemyData = J('enemies.json');
const loot = new Loot(items);
const TPL = enemyData.entities.goblin_scout || Object.values(enemyData.entities)[0];

const DATA = { items, classes: J('classes.json'), skills: skillData, builds: J('build-presets.json'), enemies: enemyData,
  bosses: J('bosses.json'), encounters: J('encounters.json'), spells: J('enemy-spells.json'), zones: J('zones.json'),
  zoneTables: J('zone-tables.json'), dialogs: J('dialog-events.json'), randomEvents: J('random-events.json'),
  dungeons: J('dungeons.json'), companions: J('companions.json'), statuses: J('status-effects.json'),
  named: J('named-enemies.json'), sideQuests: J('side-quests.json'), classQuests: J('class-quests.json'), balance: J('balance.json'),
  relations: LJ('relations.json'), events: LJ('events.json') };

// ── the weapons under test ─────────────────────────────────────────────────────────────────
/** base key (or unique id) → the registry id it is being tested for. */
export const NEW_BASES = ['forager_blade', 'lantern_mace', 'pathfinder_javelin', 'tithe_dagger', 'roadwarden_bow',
  'pilgrims_staff', 'houndmasters_lash', 'emberbrand_wand', 'rimecut_sabre', 'bramble_staff', 'warhorn_maul',
  'axle_club', 'breakers_pick', 'hunters_edge', 'stormpin_crossbow', 'gravebound_scepter', 'dawnwarden_hammer',
  'bloodledger_blade', 'covenant_hammer', 'grudgebrand', 'starwake_bow', 'watchfire_glaive'];
export const NEW_UNIQUES = ['emberwatch', 'thistlewarden', 'the_namesake', 'roadsong', 'kennelbreaker',
  'champions_bane', 'the_ingrate', 'ledger_of_ash', 'veilspiller', 'wayfarers_pike', 'grudge_crown', 'the_long_watch'];

const weapon = (key, seed = 4) => (items.uniques.some(u => u.id === key)
  ? loot.generateUnique(key, makeRng(seed))
  : loot.generate(key, 'normal', 'medium', { rng: makeRng(seed) }));

// ── combat harness ─────────────────────────────────────────────────────────────────────────
function mkHero(w, o = {}) {
  return { id: 'h1', name: 'Probe', short: 'Probe', isHero: true, class: 'warrior', level: 8, hp: 600, maxHp: 600,
    mp: 120, maxMp: 120, attrs: { STR: 16, DEX: 14, INT: 14, CON: 14 }, equipment: w ? { weapon: w } : {},
    skills: [], talents: {}, passiveRanks: {}, alive: true, statuses: [], cooldowns: {}, buffs: [], ...o };
}
function mkCompanion() {
  return { id: 'c1', name: 'Hound', short: 'Hound', isCompanion: true, level: 6, hp: 200, maxHp: 200, mp: 10, maxMp: 10,
    attrs: { STR: 10, DEX: 10, INT: 4, CON: 10 }, equipment: {}, skills: [], talents: {}, passiveRanks: {},
    alive: true, statuses: [], cooldowns: {}, buffs: [], dmg: [8, 14] };
}
/** Run one seeded fight with (or without) the weapon. Returns everything a row might want to look at. */
function fight(key, { withWeapon = true, seed = 7, nEnemies = 2, rounds = 4, enemyHp = 400, companion = false, ctx = {}, enemy = null } = {}) {
  const w = withWeapon ? weapon(key) : loot.generate('sword', 'normal', 'medium', { rng: makeRng(4) });
  const h = mkHero(w); const party = [h]; if (companion) party.push(mkCompanion());
  const foes = [];
  for (let i = 0; i < nEnemies; i++) {
    const e = makeEnemy(TPL, { act: 1, heroes: 1, index: i });
    e.maxHp = enemyHp; e.hp = enemyHp; e.armor = 4; e.dmg = [6, 10]; e.hit = 75; e.dodge = 0; e.group = 0;
    e.spellList = []; e.spellChance = 0; if (enemy) enemy(e, i); foes.push(e);
  }
  const C = new Combat(party, foes, { skills: skillData.skills, spells: {}, loot, rng: makeRng(seed), act: 1, bossPhases: {}, ...ctx });
  for (let r = 0; r < rounds && !C.over; r++) C.round();
  const dmgBy = id => C.log.filter(e => e.type === 'damage' && e.source?.id === id).reduce((s, e) => s + (e.amount || 0), 0);
  return { C, hero: h, companion: party[1], foes, log: C.log, dmg: dmgBy('h1'), companionDmg: dmgBy('c1'),
    dtypes: new Set(C.log.filter(e => e.type === 'damage').map(e => e.dtype)),
    statuses: new Set(C.log.filter(e => e.type === 'status').map(e => e.status)),
    vias: new Set(C.log.filter(e => e.type === 'damage').map(e => e.via)) };
}

// ── world harness ──────────────────────────────────────────────────────────────────────────
function newGame(key, { seed = 3 } = {}) {
  const g = new Game(DATA); g.rng = makeRng(seed); g.seed = seed;
  for (const [c, n] of [['warrior', 'Ash'], ['ranger', 'Bryn'], ['mage', 'Cael'], ['cleric', 'Dell']]) g.addHero(g.makeHero(c, n));
  g.zoneId = 'border_roads'; g.unlockedZones.push('border_roads'); g.act = 1;
  const road = g.zone().nodes.find(n => n.type !== 'town'); g.nodeId = road.id; g.visited.border_roads = ['start', road.id];
  g.startQuests();
  if (key) { const w = weapon(key); equip(g.party[0], w, g.loot); g.party[0].heldWeapon = w; }
  for (const h of g.party) refresh(h, g.loot);
  return g;
}
/** Pretend a fight was won at the current node: what the party would get from game.victory(). */
function winAFight(g, { kills = 2 } = {}) {
  const node = g.zone().nodes.find(n => n.type === 'combat'); g.nodeId = node.id;
  const res = g.enter(node); const enc = res.encounter || g.encounter('goblin_patrol');
  enc.killsBy = { [g.party[0].id]: kills };
  for (const e of enc.enemies) { e.alive = false; e.hp = 0; }
  return g.victory(node, enc);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// One row per weapon. `fx` is the registry id the row proves.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const ROWS = [
  // ── travel, supplies and the night watch ────────────────────────────────────────────────
  { key: 'forager_blade', fx: 'affix:cond_forageRation', what: 'forages a ration after a won fight', run() {
      const g = newGame('forager_blade'); const before = g.supplies.ration; let found = 0;
      for (let i = 0; i < 30; i++) { g.supplies.ration = before; winAFight(g); found += g.supplies.ration - before; g.cleared = []; }
      assert.ok(found > 0, 'never foraged in 30 fights');
      const c = newGame(null); const cb = c.supplies.ration; for (let i = 0; i < 30; i++) { c.supplies.ration = cb; winAFight(c); assert.equal(c.supplies.ration, cb); c.cleared = []; }
    } },
  { key: 'lantern_mace', fx: 'affix:cond_nightWard', what: 'makes night raids less likely', run() {
      const g = newGame('lantern_mace'), c = newGame(null);
      assert.ok(g.nightAttack().chance < c.nightAttack().chance, 'night chance not reduced');
      assert.ok(Math.abs(g.nightAttack().gear + 0.12) < 1e-6); assert.equal(c.nightAttack().gear, 0);
    } },
  { key: 'pathfinder_javelin', fx: 'affix:cond_extraLeg', what: 'finds a shortcut every other day', run() {
      const g = newGame('pathfinder_javelin'), c = newGame(null);
      g.day = c.day = 2; assert.equal(g.legsPerDay(), c.legsPerDay() + 1, 'no extra move on the shortcut day');
      g.day = c.day = 3; assert.equal(g.legsPerDay(), c.legsPerDay(), 'extra move on a day it should not apply');
    } },
  { key: 'tithe_dagger', fx: 'affix:cond_killMemory', what: 'a killing blow is remembered by name', run() {
      const g = newGame('tithe_dagger'); winAFight(g, { kills: 3 });
      const mems = g.banks[g.party[0].id].memories.filter(m => m.type === 'deed' && m.details?.weapon);
      assert.ok(mems.length >= 1, 'no memory naming the weapon');
      assert.ok(String(mems[0].details.weapon).includes('Tithe'), mems[0].details.weapon);
      assert.equal(mems[0].details.kills, 3);
      const c = newGame(null); winAFight(c, { kills: 3 });
      assert.equal(c.banks[c.party[0].id].memories.filter(m => m.type === 'deed' && m.details?.weapon).length, 0);
    } },
  { key: 'roadwarden_bow', fx: 'affix:cond_roadFind', what: 'turns up loot on the road', run() {
      const g = newGame('roadwarden_bow'); let found = 0;
      for (let i = 0; i < 60; i++) { g.legsUsed = 0; const r = g.reachable(); if (!r.length) break; g.travel(r[i % r.length]); found += (g.legGear || []).length; }
      assert.ok(found > 0, 'never found anything on the road');
      assert.ok(g.inventory.length > 0);
    } },
  { key: 'pilgrims_staff', fx: 'affix:cond_easeExhaustion', what: 'halves the price of going hungry', run() {
      const g = newGame('pilgrims_staff'), c = newGame(null); g.exhaustion = c.exhaustion = 3;
      assert.ok(g.exhaustionMult() > c.exhaustionMult(), 'exhaustion not eased');
      // the exact numbers come from data/balance.json world.exhaustion, so derive them rather than hard-code
      const per = (JSON.parse(fs.readFileSync(new URL('../data/balance.json', import.meta.url))).world?.exhaustion?.perStack) ?? 0.1;
      assert.equal(c.exhaustionMult().toFixed(3), (1 - per * 3).toFixed(3));
      assert.equal(g.exhaustionMult().toFixed(3), (1 - per * 3 * 0.5).toFixed(3));
    } },
  { key: 'watchfire_glaive', fx: 'affix:cond_watch', what: 'stands a watch: no ambush, one more ration', run() {
      const g = newGame('watchfire_glaive'); assert.equal(g.nightAttack().chance, 0, 'the watch did not stop the raid');
      const before = g.supplies.ration; const out = g.rest(); assert.equal(out.watch, 1);
      assert.equal(g.supplies.ration, before - 2, 'the watch should eat one ration on top of the meal');
      g.supplies.ration = 0; assert.ok(g.nightAttack().chance > 0, 'with no food there is no watch');
    } },

  // ── the damage meter ────────────────────────────────────────────────────────────────────
  { key: 'bloodledger_blade', fx: 'affix:cond_killGrowth', what: 'grows with the kills recorded on it', run() {
      const w = weapon('bloodledger_blade'); const meter = { itemStats: { [w.id]: { kills: 250 } } };
      const cold = fight('bloodledger_blade', { ctx: { meter: { itemStats: {} } } });
      const hot = fight('bloodledger_blade', { ctx: { meter } });
      assert.ok(hot.dmg > cold.dmg, `${hot.dmg} not above ${cold.dmg}`);
    } },
  { key: 'starwake_bow', fx: 'affix:cond_critFromWounds', what: 'crits harder the more blood it has cost you', run() {
      const crits = (wounded, seed) => fight('starwake_bow', { seed, enemyHp: 6000, rounds: 8, enemy: e => { e.dmg = wounded ? [55, 70] : [1, 1]; e.hit = 100; } })
        .log.filter(e => e.type === 'attack' && e.crit).length;
      let hurt = 0, fresh = 0; for (let s = 1; s <= 12; s++) { hurt += crits(true, s); fresh += crits(false, s); }
      assert.ok(hurt > fresh, `${hurt} crits while wounded vs ${fresh} while fresh`);
      const bonus = EFFECTS['affix:cond_critFromWounds'].critBonus;
      assert.equal(bonus(2, null, { hp: 100, maxHp: 100 }), 0); assert.equal(bonus(2, null, { hp: 30, maxHp: 100 }), 14);
    } },

  // ── elemental brands (each shows its own projectile and impact on the stage) ─────────────
  { key: 'emberbrand_wand', fx: 'affix:cond_brandFire', what: 'hits burn as well as cut', run() {
      const f = fight('emberbrand_wand', { rounds: 6 });
      assert.ok(f.dtypes.has('fire'), [...f.dtypes].join()); assert.ok(f.vias.has('affix:cond_brandFire'));
      assert.ok(f.statuses.has('burn'));
    } },
  { key: 'rimecut_sabre', fx: 'affix:cond_brandIce', what: 'hits bite with cold', run() {
      const f = fight('rimecut_sabre', { rounds: 6 }); assert.ok(f.dtypes.has('ice')); assert.ok(f.statuses.has('slow'));
    } },
  { key: 'bramble_staff', fx: 'affix:cond_brandNature', what: 'hits carry a green poison', run() {
      const f = fight('bramble_staff', { rounds: 6 }); assert.ok(f.dtypes.has('nature')); assert.ok(f.statuses.has('poison'));
    } },
  { key: 'stormpin_crossbow', fx: 'affix:cond_brandLightning', what: 'bolts crack with lightning', run() {
      const f = fight('stormpin_crossbow', { rounds: 6 }); assert.ok(f.dtypes.has('lightning')); assert.ok(f.statuses.has('dazed'));
    } },
  { key: 'gravebound_scepter', fx: 'affix:cond_brandShadow', what: 'hits leave the Veil behind them', run() {
      const f = fight('gravebound_scepter', { rounds: 6 }); assert.ok(f.dtypes.has('shadow')); assert.ok(f.statuses.has('curse'));
    } },
  { key: 'dawnwarden_hammer', fx: 'affix:cond_brandHoly', what: 'hits burn the unclean', run() {
      const f = fight('dawnwarden_hammer', { rounds: 6 }); assert.ok(f.dtypes.has('holy')); assert.ok(f.statuses.has('holy_burn'));
    } },

  // ── statuses the party did not used to see ──────────────────────────────────────────────
  { key: 'breakers_pick', fx: 'affix:cond_sunderOnHit', what: 'breaks armour open', run() {
      const f = fight('breakers_pick', { rounds: 6, enemyHp: 900 });
      assert.ok(f.statuses.has('sunder'), [...f.statuses].join());
      assert.equal(fight('breakers_pick', { withWeapon: false, rounds: 6, enemyHp: 900 }).statuses.has('sunder'), false);
    } },

  // ── named enemies and nemeses ───────────────────────────────────────────────────────────
  { key: 'hunters_edge', fx: 'affix:cond_dmgVsNamed', what: 'cuts champions and named enemies down', run() {
      const named = fight('hunters_edge', { enemyHp: 3000, rounds: 5, enemy: e => { e.named = true; } });
      const plain = fight('hunters_edge', { enemyHp: 3000, rounds: 5 });
      assert.ok(named.dmg > plain.dmg * 1.1, `${named.dmg} vs ${plain.dmg}`);
    } },
  { key: 'grudgebrand', fx: 'affix:cond_nemesisMark', what: 'hits harder, and the survivors come back for you', run() {
      const a = fight('grudgebrand', { enemyHp: 3000, rounds: 5 }), b = fight('grudgebrand', { withWeapon: false, enemyHp: 3000, rounds: 5 });
      assert.ok(a.dmg > b.dmg, `${a.dmg} vs ${b.dmg}`);
      const g = newGame('grudgebrand'); assert.ok(worldSum('nemesisChance', g, g.bearers()) > 0, 'no extra grudge');
      assert.equal(worldSum('nemesisChance', newGame(null), newGame(null).bearers()), 0);
    } },

  // ── companions and vehicles ─────────────────────────────────────────────────────────────
  { key: 'houndmasters_lash', fx: 'affix:cond_companionExtra', what: 'the companion gets a second go', run() {
      const turns = f => f.log.filter(e => (e.type === 'attack' || e.type === 'miss') && e.source?.id === 'c1').length;
      let withLash = 0, without = 0;
      for (let s = 1; s <= 6; s++) {
        const f = fight('houndmasters_lash', { seed: s, companion: true, rounds: 4, enemyHp: 4000 });
        const c = fight('houndmasters_lash', { seed: s, withWeapon: false, companion: true, rounds: 4, enemyHp: 4000 });
        assert.equal(f.companion.extraActionsEachRound, 1); assert.equal(c.companion.extraActionsEachRound, 0);
        withLash += turns(f); without += turns(c);
      }
      assert.ok(withLash > without * 1.5, `${withLash} companion turns vs ${without}`);
    } },
  { key: 'warhorn_maul', fx: 'affix:cond_companionFury', what: 'the companion starts every fight furious', run() {
      let horn = 0, plain = 0;
      for (let s = 1; s <= 8; s++) {
        const f = fight('warhorn_maul', { seed: s, companion: true, rounds: 4, enemyHp: 4000 });
        const c = fight('warhorn_maul', { seed: s, withWeapon: false, companion: true, rounds: 4, enemyHp: 4000 });
        assert.ok(f.companion.statuses.some(x => x.type === 'fury'), 'no fury on the companion');
        assert.equal(c.companion.statuses.some(x => x.type === 'fury'), false);
        horn += f.companionDmg; plain += c.companionDmg;
      }
      assert.ok(horn > plain, `${horn} companion damage with the horn vs ${plain} without`);
    } },
  { key: 'axle_club', fx: 'affix:cond_vehicleDmg', what: 'hits harder while the party has a wagon', run() {
      const withWagon = fight('axle_club', { enemyHp: 3000, rounds: 5, ctx: { vehicle: 'wagon' } });
      const onFoot = fight('axle_club', { enemyHp: 3000, rounds: 5, ctx: { vehicle: 'none' } });
      assert.ok(withWagon.dmg > onFoot.dmg, `${withWagon.dmg} vs ${onFoot.dmg}`);
    } },

  // ── memories and feelings ───────────────────────────────────────────────────────────────
  { key: 'covenant_hammer', fx: 'affix:cond_guardBond', what: 'the party thinks better of whoever carries it', run() {
      const g = newGame('covenant_hammer'); const [a, b] = g.party; const before = g.relations.get(b.id, a.id).opinion();
      winAFight(g); const after = g.relations.get(b.id, a.id).opinion();
      assert.ok(after > before, `${after} not above ${before}`);
      const f = fight('covenant_hammer', { rounds: 4, enemy: e => { e.dmg = [40, 60]; e.hit = 100; } });
      const c = fight('covenant_hammer', { withWeapon: false, rounds: 4, enemy: e => { e.dmg = [40, 60]; e.hit = 100; } });
      assert.ok(f.hero.hp < c.hero.hp, 'standing in front should cost something');
    } },

  // ── uniques ─────────────────────────────────────────────────────────────────────────────
  { key: 'emberwatch', fx: 'legendary:camp_mend', what: 'a night beside it mends the party', run() {
      const g = newGame('emberwatch'); for (const h of g.party) h.hp = 10; const out = g.rest();
      assert.ok(out.healed > 0 && g.party[1].hp > 10, 'the camp did not mend anyone');
      const c = newGame(null); for (const h of c.party) h.hp = 10; c.rest(); assert.equal(c.party[1].hp, 10);
    } },
  { key: 'thistlewarden', fx: 'legendary:forage_feast', what: 'a won fight feeds the party for two days', run() {
      const g = newGame('thistlewarden'); const before = g.supplies.ration; winAFight(g);
      assert.equal(g.supplies.ration, before + 2);
      assert.ok(g.banks[g.party[1].id].memories.some(m => m.type === 'meal' && m.details?.quality === 'good'), 'nobody remembered the meal');
    } },
  { key: 'the_namesake', fx: 'legendary:naming_kills', what: 'earns a name at fifty kills', run() {
      const g = newGame('the_namesake'); const w = g.party[0].equipment.weapon;
      g.meter.itemStats[w.id] = { itemId: w.id, damage: 0, hits: 0, kills: 49, crits: 0 };
      winAFight(g, { kills: 1 }); assert.equal(w.earnedName, undefined, 'named too early');
      g.meter.itemStats[w.id].kills = 50; g.cleared = []; winAFight(g, { kills: 1 });
      assert.ok(w.earnedName, 'the blade never took a name'); assert.ok(w.name.includes(w.earnedName));
      assert.ok(g.banks[g.party[0].id].memories.some(m => m.type === 'deed'), 'the naming was not remembered');
    } },
  { key: 'roadsong', fx: 'legendary:road_cache', what: 'turns up coin on every move', run() {
      const g = newGame('roadsong'); const before = g.gold; g.travel(g.reachable()[0]);
      assert.ok(g.gold > before, 'no cache on the road');
      const c = newGame(null); const cb = c.gold; c.travel(c.reachable()[0]); assert.equal(c.gold, cb);
    } },
  { key: 'kennelbreaker', fx: 'legendary:companion_might', what: 'makes the companion a real fighter', run() {
      let might = 0, plain = 0; let sawFury = false;
      for (let s = 1; s <= 8; s++) {
        const f = fight('kennelbreaker', { seed: s, companion: true, rounds: 4, enemyHp: 4000 });
        const c = fight('kennelbreaker', { seed: s, withWeapon: false, companion: true, rounds: 4, enemyHp: 4000 });
        sawFury = sawFury || f.companion.statuses.some(x => x.type === 'fury');
        might += f.companionDmg; plain += c.companionDmg;
      }
      assert.ok(sawFury, 'the companion never got furious');
      assert.ok(might > plain * 1.2, `${might} companion damage vs ${plain}`);
    } },
  { key: 'champions_bane', fx: 'legendary:strip_modifier', what: 'strips a trick off the biggest thing in the room', run() {
      const seed = { enemy: (e, i) => { if (i === 0) { e.named = true; e.mods = ['tough', 'fast']; } } };
      const f = fight('champions_bane', { rounds: 1, enemyHp: 2000, ...seed });
      assert.equal(f.foes[0].mods.length, 1, 'nothing was stripped');
      assert.ok(f.foes[0].statuses.some(s => s.type === 'weaken'));
      const c = fight('champions_bane', { withWeapon: false, rounds: 1, enemyHp: 2000, ...seed });
      assert.equal(c.foes[0].mods.length, 2);
    } },
  { key: 'the_ingrate', fx: 'legendary:hated_blade', what: 'hits a quarter harder and costs you the party', run() {
      const a = fight('the_ingrate', { enemyHp: 4000, rounds: 5 }), b = fight('greatsword', { enemyHp: 4000, rounds: 5 });
      assert.ok(a.dmg > b.dmg, `${a.dmg} vs ${b.dmg}`);
      const g = newGame('the_ingrate'); const [x, y] = g.party; const before = g.relations.get(y.id, x.id).opinion();
      winAFight(g); assert.ok(g.relations.get(y.id, x.id).opinion() < before, 'nobody minded');
    } },
  { key: 'ledger_of_ash', fx: 'legendary:kill_ledger', what: 'keeps its own count and grows on it', run() {
      const w = weapon('ledger_of_ash');
      const hot = fight('ledger_of_ash', { ctx: { meter: { itemStats: { [w.id]: { kills: 300 } } } }, enemyHp: 4000, rounds: 5 });
      const cold = fight('ledger_of_ash', { ctx: { meter: { itemStats: {} } }, enemyHp: 4000, rounds: 5 });
      assert.ok(hot.dmg > cold.dmg * 1.2, `${hot.dmg} vs ${cold.dmg}`);
    } },
  { key: 'veilspiller', fx: 'legendary:curse_spreads', what: 'a kill spills the curse over the rest', run() {
      const f = fight('veilspiller', { nEnemies: 3, enemyHp: 20, rounds: 6 });
      assert.ok(f.statuses.has('curse'), [...f.statuses].join()); assert.ok(f.vias.has('legendary:curse_spreads'));
    } },
  { key: 'wayfarers_pike', fx: 'legendary:free_move', what: 'adds a move to every day', run() {
      const g = newGame('wayfarers_pike'), c = newGame(null);
      assert.equal(g.legsPerDay(), c.legsPerDay() + 1);
    } },
  { key: 'grudge_crown', fx: 'legendary:nemesis_hunter', what: 'doubles up on anything with a grudge', run() {
      const named = fight('grudge_crown', { enemyHp: 4000, rounds: 5, enemy: e => { e.named = true; } });
      const plain = fight('grudge_crown', { enemyHp: 4000, rounds: 5 });
      assert.ok(named.dmg > plain.dmg * 1.5, `${named.dmg} vs ${plain.dmg}`);
      const heal = fight('grudge_crown', { enemyHp: 40, nEnemies: 2, rounds: 6, enemy: e => { e.named = true; } });
      assert.ok(heal.log.some(e => e.type === 'heal' && e.via === 'legendary:nemesis_hunter'), 'killing a grudge did not mend anyone');
    } },
  { key: 'the_long_watch', fx: 'legendary:no_night_raids', what: 'nothing comes near the camp', run() {
      const g = newGame('the_long_watch'); assert.equal(g.nightAttack().chance, 0);
      g.supplies.ration = 0; assert.equal(g.nightAttack().chance, 0, 'the long watch should hold on an empty larder');
      const plain = newGame('watchfire_glaive'); plain.supplies.ration = 0;
      assert.ok(plain.nightAttack().chance > 0, 'the plain glaive needs food to stand a watch');
    } },
];

for (const row of ROWS) test(`${row.key}: ${row.what} (${row.fx})`, () => { assert.ok(EFFECTS[row.fx], `${row.fx} is not registered`); row.run(); });

test('every new weapon is covered by a row, and every row names a registered effect', () => {
  const covered = new Set(ROWS.map(r => r.key));
  const uncovered = [...NEW_BASES, ...NEW_UNIQUES].filter(k => !covered.has(k));
  // the three plain brand bases share their proof with the brand row for the same element
  assert.deepEqual(uncovered.sort(), []);
  assert.equal(ROWS.length, NEW_BASES.length + NEW_UNIQUES.length);
});

test('every new base can drop in the act it belongs to, and not before', () => {
  const zones = JSON.parse(fs.readFileSync(new URL('../data/zones.json', import.meta.url)));
  const zoneAct = {}; for (const v of Object.values(zones)) if (Array.isArray(v)) for (const z of v) if (z?.id) zoneAct[z.id] = z.act;
  for (const key of NEW_BASES) {
    const base = items.weaponBases[key]; assert.ok(base, key); assert.ok(base.minAct >= 1, `${key} has no act gate`);
    assert.ok(base.intrinsic?.length, `${key} has no property`);
    assert.ok(base.look?.held && base.look?.color, `${key} has no look`);
    for (const f of base.intrinsic) assert.ok(EFFECTS['affix:' + f.stat], `${key} wants ${f.stat}`);
    const zonesWithIt = Object.entries(items.zoneDrops).filter(([, z]) => z.bases.includes(key));
    assert.ok(zonesWithIt.length, `${key} is in no zone drop table`);
    for (const [zid] of zonesWithIt) assert.ok((zoneAct[zid] ?? 9) >= base.minAct, `${key} (act ${base.minAct}) drops in ${zid} (act ${zoneAct[zid]})`);
    assert.ok(items.merchant.bases.includes(key), `${key} is never sold`);
    assert.ok(!loot.basesForAct(items.merchant.bases, base.minAct - 1).includes(key), `${key} is sold before act ${base.minAct}`);
    assert.ok(loot.basesForAct(items.merchant.bases, base.minAct).includes(key), `${key} is never sold in act ${base.minAct}`);
  }
  // and they really come out of the roller
  const rng = makeRng(11); const seen = new Set();
  for (const [zid, z] of Object.entries(items.zoneDrops)) for (let i = 0; i < 4000; i++) { const it = loot.zoneDrop(zid, rng, { act: zoneAct[zid] || 1 }); if (it) seen.add(it.baseKey); }
  for (const key of NEW_BASES) assert.ok(seen.has(key), `${key} never actually dropped`);
});

test('every new unique is reachable, carries a new power and reads well', () => {
  for (const id of NEW_UNIQUES) {
    const u = items.uniques.find(x => x.id === id); assert.ok(u, id);
    assert.ok(EFFECTS['legendary:' + u.legendaryEffect], `${id} wants ${u.legendaryEffect}`);
    assert.ok(items.legendaryEffects[u.legendaryEffect], `${id}'s power has no blurb`);
    assert.ok(u.act >= 1 && u.lore && u.look?.held, id);
    const it = loot.generateUnique(id, makeRng(2));
    assert.equal(it.rarity, 'legendary'); assert.ok(it.dmg[1] > it.dmg[0]);
    const line = loot.describe(it.affixes.find(a => a.id === 'legendary_effect'));
    assert.ok(line && line.length > 10 && !/undefined|NaN/.test(line), `${id}: ${line}`);
    if (u.bossSource) assert.ok(items.bossLoot[u.bossSource]?.uniques?.includes(id), `${id} is not in ${u.bossSource}'s table`);
  }
  const rng = makeRng(5); const seen = new Set();
  for (const [bid, t] of Object.entries(items.bossLoot)) for (let i = 0; i < 2000; i++) for (const it of loot.bossLoot(bid, rng)) if (it.uniqueId) seen.add(it.uniqueId);
  for (const id of NEW_UNIQUES) { const u = items.uniques.find(x => x.id === id); if (u.bossSource) assert.ok(seen.has(id), `${id} never dropped from ${u.bossSource}`); }
});

test('the road weapons give the party something new to talk about at camp', async () => {
  const { Lingo, Speaker } = await import('../../../lingo/js/lingo.js');
  const { Conversations, factsFrom } = await import('../../../conversations/js/conversations.js');
  const { Meter } = await import('../../../meters/js/meter.js');
  const { RelationGraph } = await import('../../../lingo/js/relations.js');
  const LD = f => JSON.parse(fs.readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
  const lingo = new Lingo({ lexicon: LD('lexicon.json'), grammar: LD('grammar.json'), traits: LD('traits.json') });
  for (const e of LD('packs/emberveil.json').entries) lingo.lexicon.add(e);
  const topics = JSON.parse(fs.readFileSync(new URL('../../../conversations/data/topics.json', import.meta.url)));
  const conv = new Conversations({ lingo, topics });
  const sp = [['a', 'Brannoc', ['gruff', 'brave']], ['b', 'Wren', ['shy', 'kind']], ['c', 'Edric', ['scholar', 'pompous']]]
    .map(([id, name, traits]) => new Speaker({ id, name, lexicon: lingo.lexicon, speech: { traits } }));

  const want = { road_weapon_forager: 'forager_blade', road_weapon_watch: 'watchfire_glaive', road_weapon_named_blade: 'tithe_dagger', road_weapon_hated: 'the_ingrate' };
  for (const [topicId, key] of Object.entries(want)) {
    const w = weapon(key); const meter = new Meter(); meter.startFight('x');
    for (let i = 0; i < 9; i++) meter.record({ t: i, source: 'a', sourceName: 'Brannoc', target: 'g', targetName: 'Goblin', kind: 'damage', amount: 12, via: 'attack', viaName: w.name, itemId: w.id, killingBlow: true });
    meter.endFight();
    const heroes = [{ id: 'a', equipment: { weapon: w } }, { id: 'b', equipment: {} }, { id: 'c', equipment: {} }];
    const relations = new RelationGraph(LD('relations.json'));
    const facts = factsFrom({ now: 40, day: 3, heroes, meter, relations, lootLog: [{ itemId: w.id, item: w, holder: 'a', day: 2, equipped: true, delta: 5, replaced: 'an old blade' }], party: { rations: 2, day: 3 } });
    const hit = conv.eligible(sp, facts).find(e => e.topic.id === topicId);
    assert.ok(hit, `${topicId} never became eligible with ${key}`);
    assert.equal(hit.answerer.id, 'a');
    const lines = conv.perform(hit, { rng: () => 0.3 });
    assert.ok(lines.length >= 3, topicId);
    for (const l of lines) assert.ok(l.text && !/\{|\}|undefined|NaN/.test(l.text), `${topicId}: ${l.text}`);
    // and they stay quiet for a party carrying nothing special
    const plain = factsFrom({ now: 40, day: 3, relations, heroes: [{ id: 'a', equipment: { weapon: loot.generate('sword', 'normal', 'medium', { rng: makeRng(1) }) } }, { id: 'b', equipment: {} }, { id: 'c', equipment: {} }], party: { rations: 2, day: 3 } });
    assert.equal(conv.eligible(sp, plain).find(e => e.topic.id === topicId), undefined, `${topicId} fires without the weapon`);
  }
});
