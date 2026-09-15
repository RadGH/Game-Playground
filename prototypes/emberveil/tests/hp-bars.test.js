// E44: health bars always match the unit's real health and shield.
//
// The cause of the "empty bar, then it survives two more hits" report: Combat.round() works out a
// whole round at once and main.js replays it over a few seconds, while the floating bars read the
// live unit, which is already at the end of the round. Every event now carries a snapshot (`ev.snap`)
// and the stage draws the snapshot of the event on screen (js/bars.js). These tests:
//   1. scale enemies through every health multiplier the game has and check the bar is full and exact;
//   2. push damage down every path (attack, skill, damage over time, thorns, chain, soul link, barrier,
//      heal, regeneration, kill, temporary health) and check each event's snapshot matches the unit at
//      that moment and moves by exactly the number the event reports;
//   3. replay real rounds the way main.js does and check the bars show the start of the round before
//      the replay and the true end of the round after it.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Game } from '../js/game.js';
import { Combat } from '../js/combat.js';
import { makeEnemy, mergeSkill } from '../js/rules.js';
import { applySpawnMods } from '../js/effects.js';
import { snapUnit, snapAll, barState, shieldOf } from '../js/bars.js';
import { makeRng } from '../js/rng.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const LJ = f => JSON.parse(fs.readFileSync(new URL('../../../lingo/data/' + f, import.meta.url), 'utf8'));
const DATA = {
  items: J('items.json'), classes: J('classes.json'), skills: J('skills.json'), builds: J('build-presets.json'),
  enemies: J('enemies.json'), bosses: J('bosses.json'), encounters: J('encounters.json'), spells: J('enemy-spells.json'),
  zones: J('zones.json'), zoneTables: J('zone-tables.json'), dialogs: J('dialog-events.json'),
  randomEvents: J('random-events.json'), dungeons: J('dungeons.json'), companions: J('companions.json'),
  statuses: J('status-effects.json'), bossPhases: J('boss-phases.json'), named: J('named-enemies.json'),
  sideQuests: J('side-quests.json'), classQuests: J('class-quests.json'), balance: J('balance.json'),
  crossings: J('crossings.json'), relations: LJ('relations.json'), events: LJ('events.json'),
};
const SK = DATA.skills.skills, SP = DATA.spells.spells;

/** The fraction a bar draws for health, from a snapshot. */
const hpFrac = s => barState(s).hpFrac;
/** What the fraction must be: real health over max health, capped at a full bar. */
const trueFrac = u => Math.min(1, Math.max(0, Math.round(u.hp)) / Math.max(1, Math.round(u.maxHp)));

function newGame(act = 4) {
  const g = new Game(DATA); g.seed = 5; g.rng = makeRng(5);
  for (const c of ['warrior', 'cleric', 'mage', 'ranger']) g.addHero(g.makeHero(c, c[0].toUpperCase() + c.slice(1), 14));
  g.zoneId = 'hell_breach'; g.act = act;
  return g;
}
/** An rng that always rolls low (so every champion roll passes) but keeps the helper methods. */
function lowRng(seed) { const r = makeRng(seed); return Object.assign(() => 0.001, { pick: r.pick, int: r.int, shuffle: r.shuffle, range: r.range, chance: r.chance, weighted: r.weighted }); }

/** One enemy through each health multiplier: act, party size, boss, champion (+tough), named (+colossal), night raid, NG+. */
function scaledEnemies() {
  const g = newGame(); const out = [];
  const tpl = DATA.enemies.entities.demon_brute || Object.values(DATA.enemies.entities)[0];
  for (const act of [1, 3, 6]) for (const heroes of [1, 4]) out.push(['act ' + act + ' party ' + heroes, makeEnemy(tpl, { act, heroes, index: out.length })]);
  const bossId = Object.keys(DATA.bosses.entities)[0];
  out.push(['boss', makeEnemy(DATA.bosses.entities[bossId], { act: 6, heroes: 4, boss: true, index: 50 })]);
  out.push(['new game plus', makeEnemy(tpl, { act: 3, heroes: 4, ngPlus: 1, index: 51 })]);
  const tough = makeEnemy(tpl, { act: 4, heroes: 4, index: 52 }); applySpawnMods(tough, 'champion', ['tough']); out.push(['champion tough', tough]);
  g.rng = lowRng(8); const encId = DATA.zones.ZONE_ENCOUNTER_POOLS.hell_breach[0];
  for (const e of g.encounter(encId).enemies) out.push(['champion from an encounter', e]);
  g.rng = makeRng(9);
  const named = g.namedEnemy(tpl.id, { mods: ['colossal', 'tough'] }); out.push(['named colossal', named]);
  for (let i = 0; i < 4; i++) { const raid = g.nightEncounter(); for (const e of raid?.enemies || []) out.push(['night raid' + (e.named ? ' (named)' : ''), e]); }
  return { g, list: out };
}

test('E44: bar maths — health is exactly hp/maxHp, shield never hides, health over max shows as shield', () => {
  assert.equal(hpFrac({ hp: 1, maxHp: 1520, shield: 0 }), 1 / 1520);
  const full = barState({ hp: 100, maxHp: 100, shield: 40 });
  assert.equal(full.hpPct, 100); assert.equal(full.shPct, 40); assert.equal(full.overlap, true); assert.equal(full.shLeftPct, 60, 'the shield slides back over the end of a full bar');
  const half = barState({ hp: 50, maxHp: 100, shield: 20 });
  assert.equal(half.shLeftPct, 50); assert.equal(half.overlap, false);
  assert.deepEqual(snapUnit({ hp: 120, maxHp: 100, statuses: [{ type: 'barrier', power: 15 }] }), { hp: 100, maxHp: 100, shield: 35 });
  assert.equal(barState({ hp: 0, maxHp: 10, shield: 0 }).dead, true);
  assert.equal(shieldOf({ statuses: [{ type: 'barrier', power: 5 }, { type: 'shield', power: 7 }, { type: 'burn', power: 9 }] }), 12);
});

test('E44: an enemy scaled through every health multiplier starts on an exactly full bar', () => {
  const { list } = scaledEnemies();
  const kinds = new Set(list.map(([k]) => k.replace(/ \(named\)$/, '')));
  for (const k of ['boss', 'champion tough', 'champion from an encounter', 'named colossal', 'night raid', 'new game plus']) assert.ok(kinds.has(k), 'built a ' + k);
  for (const [kind, e] of list) {
    assert.equal(e.hp, e.maxHp, `${kind}: health and max health were scaled together`);
    const s = snapUnit(e); assert.equal(hpFrac(s), 1, kind); assert.equal(hpFrac(s), trueFrac(e), kind);
  }
});

test('E44: every damage path moves the bar by exactly what the event says, at the moment it says it', () => {
  const { g, list } = scaledEnemies();
  const heroes = g.fighters();
  const foes = list.map(([, e]) => e).filter((e, i, a) => a.indexOf(e) === i).slice(0, 8);
  foes.forEach((e, i) => { e.group = i % 2; e.alive = true; });
  const C = new Combat(heroes, foes, { skills: SK, spells: SP, loot: g.loot, rng: makeRng(21), act: g.act, bossPhases: DATA.bossPhases.phases });
  const byId = new Map([...heroes, ...foes].map(u => [String(u.id), u]));
  // the display model main.js + stage.js keep: last snapshot per unit
  const shown = new Map(Object.entries(snapAll([...heroes, ...foes])));
  const seen = new Set(); let checked = 0;
  const emit = C.emit.bind(C);
  C.emit = ev => {
    const r = emit(ev);
    for (const [id, s] of Object.entries(ev.snap || {})) {
      const u = byId.get(id); assert.ok(u, 'snapshot for a unit in the fight');
      assert.deepEqual(s, snapUnit(u), `${ev.type}: snapshot matches ${u.name} right now`);
      assert.equal(hpFrac(s), trueFrac(u), `${ev.type}: bar fraction is hp/maxHp for ${u.name}`);
      const prev = shown.get(id);
      if (u.isEnemy && (ev.type === 'damage' || ev.type === 'dot') && ev.target === u) {
        assert.equal(prev.hp - s.hp, ev.amount, `${ev.type} on ${u.name}: the bar drops by the ${ev.amount} the log shows`);
        seen.add(ev.via || ev.type); checked++;
      }
      if (u.isEnemy && ev.type === 'heal' && ev.target === u) { assert.equal(s.hp - prev.hp, ev.amount, `heal on ${u.name}`); seen.add('heal'); }
      shown.set(id, s);
    }
    if (ev.type === 'sync') for (const [id, s] of Object.entries(ev.snap)) shown.set(id, s);
    return r;
  };
  C.round_ = 1;
  const [w, cl, mg] = heroes; const [e0, e1, e2, e3] = foes;
  for (const u of heroes) { u.derived.hit = 100; }
  // 1. basic attack
  C.attack(w, e0);
  // 2. a skill aimed by a plan
  C.cast(mg, mergeSkill({ id: 'fireball', ...SK.fireball }, mg), C.enemies, C.heroes, { target: e1 });
  // 3. damage over time
  C.addStatus(e2, 'burn', 3, 25, w); C.round_ = 2; C.tickStatuses(); C.sync('upkeep');
  // 4. thorns: an enemy hits a hero who reflects half of it
  w.derived.thorns = 0.5; e3.hit = 100; C.attack(e3, w);
  // 5. chain lightning off a basic attack
  w.derived.chainOnHit = 1; C.attack(w, e0);
  // 6. soul link: damage shared between bound enemies
  C.addStatus(e1, 'soulbind', 3, 0, cl); C.addStatus(e2, 'soulbind', 3, 0, cl); C.applyDamage(w, e1, 80, { trueDmg: true, label: 'Probe' });
  // 7. a barrier soaks part of a hit: health stays put, the shield segment shrinks
  C.addStatus(e3, 'barrier', 3, 40, e3); const hpBefore = e3.hp;
  C.applyDamage(w, e3, 25, { trueDmg: true, label: 'Probe' });
  assert.equal(e3.hp, hpBefore); assert.equal(shown.get(String(e3.id)).shield, 15, 'shield shows what is left of the barrier');
  assert.equal(barState(shown.get(String(e3.id))).shPct, 100 * 15 / e3.maxHp);
  // 8. healing and champion-style regeneration
  C.healUnit(e0, 30, 'mend', e0); e1.regenPct = 0.05; C.tickStatuses(); C.sync('upkeep');
  // 9. an enemy spell on the party, then a kill
  C.resolveSpell(e2, SP.molten_shatter, C.alive(C.heroes), C.enemies);
  C.applyDamage(w, e0, 1e7, { trueDmg: true, label: 'Probe' });
  assert.equal(e0.alive, false); assert.equal(barState(shown.get(String(e0.id))).dead, true);
  // 10. temporary health above max on a hero shows as shield, not a hidden buffer
  cl.hp = cl.maxHp; C.cast(w, mergeSkill({ id: 'battle_cry', ...SK.battle_cry }, { ...w, talents: { bc_hp: true } }), C.enemies, C.heroes);
  C.sync('turn');
  assert.ok(cl.hp > cl.maxHp, 'the talent pushed health over max');
  assert.equal(shown.get(String(cl.id)).shield, cl.hp - cl.maxHp); assert.equal(hpFrac(shown.get(String(cl.id))), 1);
  // every path above reached the bar
  for (const via of ['attack', 'skill:fireball', 'dot:burn', 'thorns', 'proc:stormcharged', 'status:soulbind', 'heal']) assert.ok(seen.has(via), `path ${via} was checked`);
  assert.ok(checked >= 8);
  for (const u of [...heroes, ...foes]) assert.equal(hpFrac(shown.get(String(u.id))), trueFrac(u), `${u.name} ends on its true health`);
});

test('E44: replaying a round the way main.js does — bars start where the round started and end where it ended', () => {
  const g = newGame(3); const enc = g.encounter(DATA.zones.ZONE_ENCOUNTER_POOLS.hell_breach[1]);
  const heroes = g.fighters();
  const C = new Combat(heroes, enc.enemies, { skills: SK, spells: SP, loot: g.loot, rng: makeRng(4), act: g.act, bossPhases: DATA.bossPhases.phases });
  heroes[0].derived.hpRegen = 9; heroes[0].hp = Math.round(heroes[0].maxHp * 0.6);   // health that moves without an event
  const all = [...heroes, ...enc.enemies];
  const shown = new Map(Object.entries(snapAll(all)));
  let ranAhead = 0, rounds = 0;
  while (!C.over && rounds < 30) {
    const start = snapAll(all);
    const events = C.round(); rounds++;
    assert.equal(events[0].type, 'round'); assert.deepEqual(events[0].snap, start, 'the round event carries the bars as the round starts');
    for (const [id, s] of shown) assert.deepEqual(s, start[id], 'before the replay, the bars still show the start of the round');
    if (all.some(u => snapUnit(u).hp !== start[u.id].hp)) ranAhead++;   // the live units have already moved on
    for (const ev of events) for (const [id, s] of Object.entries(ev.snap || {})) shown.set(id, s);
    for (const u of all) assert.deepEqual(shown.get(String(u.id)), snapUnit(u), `after the replay ${u.name} shows its true health`);
  }
  assert.ok(ranAhead > 0, 'this fight has rounds where reading the live unit would have shown the end of the round too early');
});

test('E44: a party killed by damage over time at the start of a round loses that round, not at the 50-round timeout', () => {
  const g = newGame(1); const heroes = g.fighters();
  const foes = [makeEnemy(DATA.enemies.entities.goblin_scout, { act: 1, heroes: 4, index: 0 })];
  foes[0].maxHp = foes[0].hp = 1e6;   // it must still be standing when the poison ticks
  const C = new Combat(heroes, foes, { skills: SK, spells: SP, loot: g.loot, rng: makeRng(2), act: 1, bossPhases: {} });
  C.round_ = 1;                        // the next round() starts with the upkeep ticks
  for (const h of heroes) { h.hp = 1; h.derived.hpRegen = 0; C.addStatus(h, 'poison', 3, 50, foes[0]); }
  const events = C.round();
  assert.equal(C.over, true); assert.equal(C.result, 'lose'); assert.equal(C.round_, 2);
  assert.ok(!events.some(e => e.type === 'attack' || e.type === 'skill'), 'nobody acts after the upkeep wiped the party');
});
