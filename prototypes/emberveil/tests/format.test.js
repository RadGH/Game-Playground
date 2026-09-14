// E5 / E7: nothing the player reads carries a number with more than two decimals, health is always
// whole, and every "recovers …" line says what came back and why.
//
// The check is deliberately blunt: build the strings the game builds (item descriptions, combat log
// lines, meter rows) and run one regular expression over the lot.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { fmt, hp as fmtHp, pct, sign, hasLongDecimal, TOO_MANY_DECIMALS } from '../../../shared/format.js';
import { Loot } from '../js/loot.js';
import { Combat } from '../js/combat.js';
import { makeEnemy, derive, describeEffect } from '../js/rules.js';
import { makeRng } from '../js/rng.js';
import { Meter } from '../../../meters/js/meter.js';
import { recordEvent } from '../js/combat.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const items = J('items.json'), skillData = J('skills.json').skills, enemyData = J('enemies.json').entities, spellData = J('enemy-spells.json').spells;
const loot = new Loot(items);

test('fmt: at most two decimals, trailing zeros trimmed, health whole', () => {
  assert.equal(fmt(25.02000000000001), '25.02');
  assert.equal(fmt(5.84999999964), '5.85');
  assert.equal(fmt(14), '14');
  assert.equal(fmt(14.0), '14');
  assert.equal(fmt(0.1 + 0.2), '0.3');
  assert.equal(fmt(1234.5678), '1,234.57');
  assert.equal(fmt(-0.001), '0');
  assert.equal(fmt(null), '');
  assert.equal(fmt(undefined), '');
  assert.equal(fmt(NaN), '');
  assert.equal(fmtHp(14.68), '15');
  assert.equal(fmtHp(0.4), '0');
  assert.equal(pct(0.1234), '12%');
  assert.equal(sign(-3.5), '−3.5');
  assert.equal(sign(9), '+9');
  assert.ok(hasLongDecimal('overkill 5.84999999964'));
  assert.ok(!hasLongDecimal('overkill 5.85'));
});

test('item descriptions never show a long decimal', () => {
  const rng = makeRng(17);
  for (const key of Object.keys(loot.bases)) {
    for (const rarity of ['magic', 'rare', 'legendary']) {
      const it = loot.generate(key, rarity, 'exotic', { rng });
      for (const a of it.affixes) {
        const line = loot.describe(a);
        assert.ok(!hasLongDecimal(line), `${key} ${rarity}: ${line}`);
      }
    }
  }
  for (const u of items.uniques) {
    const it = loot.generateUnique(u.id, rng);
    for (const a of it.affixes) assert.ok(!hasLongDecimal(loot.describe(a)), `${u.id}: ${loot.describe(a)}`);
  }
});

test('talent and upgrade wording never shows a long decimal', () => {
  for (const s of Object.values(skillData)) {
    for (const t of s.talents || []) assert.ok(!hasLongDecimal(describeEffect(t.effect || {})), `${s.name}/${t.name}`);
    for (const u of s.upgrades || []) assert.ok(!hasLongDecimal(describeEffect(u.bonus || {}, { replace: true })), `${s.name}/${u.name}`);
  }
});

/** A hero whose gear rolls fractional affix values — the source of the old "recovers 14.68". */
function messyHero() {
  const h = {
    id: 'h1', name: 'Corvin', short: 'Corvin', isHero: true, class: 'warrior', level: 9,
    attrs: { STR: 16, DEX: 12, INT: 13, CON: 15 }, skills: [], talents: {}, passiveRanks: { killing_blow: 2, regrowth: 2, vampirism: 2 },
    alive: true, statuses: [], cooldowns: {}, buffs: [],
    equipment: {
      weapon: { id: 'w1', name: 'Blade', type: 'weapon', slot: 'weapon', subtype: 'sword', dmg: [11, 16], affixes: [{ id: 'a', name: 'Vital', stat: 'hp', value: 24.37 }, { id: 'b', name: 'Leeching', stat: 'lifeSteal', value: 7.31 }] },
      ring1: { id: 'r1', name: 'Band', type: 'accessory', slot: 'ring1', affixes: [{ id: 'c', name: 'Mending', stat: 'hpRegen', value: 2.37 }, { id: 'd', name: 'Warded', stat: 'magicResist', value: 6.53 }, { id: 'e', name: 'Strong', stat: 'str', value: 3.4 }] },
    },
  };
  const d = derive(h, loot); h.derived = d; h.maxHp = d.maxHp; h.hp = d.maxHp; h.maxMp = d.maxMp; h.mp = d.maxMp;
  return h;
}

test('derived health, mana, armour and attributes are whole numbers', () => {
  const d = derive(messyHero(), loot);
  for (const k of ['maxHp', 'maxMp', 'armor', 'magicResist', 'STR', 'DEX', 'INT', 'CON', 'dmgMin', 'dmgMax']) {
    assert.equal(d[k], Math.round(d[k]), `${k} = ${d[k]}`);
  }
});

/** Run a fight with messy gear and render every event the way js/main.js renders it. */
function fightLines() {
  const h = messyHero(); h.hp = Math.round(h.maxHp * 0.4);
  const foes = [];
  const tpl = enemyData.goblin_scout || Object.values(enemyData)[0];
  for (let i = 0; i < 3; i++) { const e = makeEnemy(tpl, { act: 1, heroes: 1, index: i }); e.maxHp = 90; e.hp = 90; foes.push(e); }
  const C = new Combat([h], foes, { skills: skillData, spells: spellData, loot, rng: makeRng(4), act: 1, bossPhases: {} });
  const meter = new Meter(); meter.startFight('test');
  const lines = []; let t = 0;
  while (!C.over) for (const ev of C.round()) {
    t += 0.5; recordEvent(meter, ev, t);
    const who = ev.target?.short || ev.target?.name || '';
    if (ev.type === 'damage') lines.push(`hits ${who} for ${fmtHp(ev.amount)} damage`);
    if (ev.type === 'dot') lines.push(`${who} takes ${fmtHp(ev.amount)} damage from ${ev.status}`);
    if (ev.type === 'heal') lines.push(`${who} recovers ${fmtHp(ev.amount)} health (${ev.label})`);
    if (ev.type === 'mana') lines.push(`${who} recovers ${fmtHp(ev.amount)} mana (${ev.label})`);
    if (ev.type === 'status' && ev.status === 'barrier') lines.push(`${who} gains a ${fmtHp(ev.power)} shield`);
  }
  meter.endFight();
  return { lines, meter, hero: h, foes };
}

test('no combat log line carries a long decimal, and health stays whole all fight', () => {
  const { lines, hero, foes } = fightLines();
  assert.ok(lines.length > 5, 'the fight produced lines');
  for (const l of lines) assert.ok(!hasLongDecimal(l), l);
  for (const u of [hero, ...foes]) {
    assert.equal(u.hp, Math.round(u.hp), `${u.name} hp ${u.hp}`);
    if (u.mp != null) assert.equal(u.mp, Math.round(u.mp), `${u.name} mp ${u.mp}`);
  }
});

test('every recover line says what came back and why', () => {
  const { lines } = fightLines();
  const recovers = lines.filter(l => l.includes('recovers'));
  assert.ok(recovers.length > 0, 'something was healed');
  for (const l of recovers) {
    assert.match(l, /recovers \d+ (health|mana) \(.+\)/, l);
    assert.ok(!/recovers \d+ \(/.test(l), `bare "recovers N": ${l}`);
  }
});

test('meter numbers are clean: no long decimal anywhere in a report', () => {
  const { meter } = fightLines();
  for (const mode of ['damage', 'heal', 'taken', 'absorb', 'status', 'deaths']) {
    const rows = meter.report(mode, 'all');
    const seen = [];
    const walk = (o, path = '') => {
      if (o == null) return;
      if (typeof o === 'number') { seen.push([path, o]); return; }
      if (Array.isArray(o)) { o.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
      if (typeof o === 'object') { for (const [k, v] of Object.entries(o)) if (k !== 'records' && k !== 'hitsList') walk(v, `${path}.${k}`); }
    };
    rows.forEach((r, i) => walk(r, `${mode}[${i}]`));
    walk({ duration: rows.duration, grand: rows.grand }, mode);
    for (const [path, n] of seen) {
      // whatever the raw value is, the UI formatter has to render it with at most two decimals
      assert.ok(!TOO_MANY_DECIMALS.test(fmt(n)), `${path} → ${fmt(n)}`);
      assert.ok(!TOO_MANY_DECIMALS.test(fmtHp(n)), `${path} → ${fmtHp(n)}`);
    }
  }
});
