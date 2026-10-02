// node --test prototypes/farhold/tests/round28-skills.test.js
//
// Farhold round 28 — the skill rework's audits (research/round28-skills-plan.md §11).
//
// A class is CONVERTED once all six of its skills carry a `talents` block; the per-class rules
// (one owner per skill, four tiers of two bespoke nodes, banned names, stand-alone casts, the
// balance band) are enforced on every converted class, so each content batch is held to them the
// moment it lands, and the whole game is held to them when all thirty are done.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  VOCAB, VOCAB_KEYS, PENDING, keysOf, applyMod, hitFactor, afterHit, onHurt, setMechEnv,
  toggleForm, formIds, resolveForm, addStacks, placeObject, tickPlaced, resetWorld, world,
  gainResource, resourceOf, statusStats, controlFor,
} from '../js/skillmech.js';
import {
  TALENT_LIBRARY, TIER_LEVELS, treeFor, talentsOn, pickTalent, migrateTalents, inertTalents,
  registerSkillRows, PLAN_FIELDS, describeNode,
} from '../js/skilltalents.js';
import { createSkillBar, describeSkill, applyStatus } from '../js/skills.js';
import { Rpg } from '../js/rpg.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = f => JSON.parse(readFileSync(join(root, f), 'utf8'));
const src = f => readFileSync(join(root, f), 'utf8');
const DATA = read('data/skills.json');
const RAW = read('data/skills.json');   // untouched by registerSkillRows (which writes node text)
const CLASSES = read('data/classes.json').classes;
const items = JSON.parse(readFileSync(join(root, '../emberveil/data/items.json'), 'utf8'));
const balance = read('data/balance.json');
registerSkillRows(DATA.skills, DATA.statuses);

/** The 47 skill ids that existed before round 28 — every one must still be a row (saves name them). */
const LEGACY = ['power_strike', 'cleave', 'warcry', 'shield_bash', 'whirlwind', 'execute', 'sunder', 'guard_stance', 'charge',
  'consecrate', 'renew', 'rally', 'aimed_shot', 'poison_dart', 'multi_shot', 'mend', 'pinning_shot', 'rain_of_arrows',
  'eviscerate', 'shadowstep', 'smoke', 'judgement', 'shadow_lance', 'curse', 'quicken', 'firebolt', 'frost_nova',
  'arcane_burst', 'ice_lance', 'fire_wall', 'meteor', 'raise_thrall', 'drain', 'toxic_cloud', 'bind_imp', 'void_rift',
  'flamethrower', 'ember_stride', 'chain_bolt', 'storm_beam', 'storm_orbs', 'call_wolf', 'stoneskin', 'blizzard',
  'call_spirit', 'thunderclap', 'deploy_sentry'];

const converted = Object.entries(DATA.classes)
  .filter(([id, list]) => id !== 'custom' && list.every(s => DATA.skills[s]?.talents))
  .map(([id]) => id);
const convertedSkills = [...new Set(converted.flatMap(c => DATA.classes[c]))];

const bar = (classId, level = 30) => {
  const rpg = new Rpg(items, balance);
  const player = rpg.createPlayer({ classId, level });
  player.mp = player.maxMp;
  return { rpg, player, skills: createSkillBar({ data: DATA, player, rpg }) };
};

// ─────────────────────────────────────────────────────────────── 1, 2 — who owns what

test('the Warrior (the reference class) is converted, and conversion is counted', () => {
  assert.ok(converted.includes('warrior'), 'the Warrior is the reference class and must carry talents on all six');
  // the progress line, for whoever runs this between batches
  console.log(`# R28 converted classes: ${converted.length}/30 — ${converted.join(', ')}`);
});

test('every class has six skills; every legacy id is still a row; no skill is on two converted classes', () => {
  for (const [id, list] of Object.entries(DATA.classes)) {
    if (id === 'custom') continue;
    assert.equal(list.length, 6, `${id} has ${list.length}`);
    for (const s of list) assert.ok(DATA.skills[s], `${id} names ${s}, which is not a row`);
  }
  for (const id of LEGACY) assert.ok(DATA.skills[id], `legacy skill ${id} was deleted — saves still name it`);
  const owner = {};
  for (const c of converted) {
    for (const s of DATA.classes[c]) {
      assert.ok(!owner[s], `${s} is on both ${owner[s]} and ${c}`);
      owner[s] = c;
    }
  }
  // …and once every class is converted, on exactly one class, full stop
  if (converted.length === 30) {
    const all = Object.entries(DATA.classes).filter(([id]) => id !== 'custom').flatMap(([, l]) => l);
    assert.equal(new Set(all).size, all.length, 'a skill is on two classes');
  }
});

test('data/classes.json `skills` is the same list as data/skills.json `classes`, for every class', () => {
  for (const c of CLASSES) {
    assert.deepEqual(c.skills, DATA.classes[c.id], `${c.id}: classes.json and skills.json disagree (the title-screen preview reads one, the bar the other)`);
  }
});

// ─────────────────────────────────────────────────────────────── 3 — the talent format

test('every row with talents has four tiers of two bespoke nodes and at most one library node of that tier', () => {
  const libIds = new Set(Object.keys(TALENT_LIBRARY));
  for (const [id, row] of Object.entries(DATA.skills)) {
    if (!row.talents) continue;
    const seen = new Set();
    for (let t = 1; t <= TIER_LEVELS.length; t++) {
      const tier = row.talents[t] || row.talents[String(t)];
      assert.ok(tier, `${id} has no tier ${t}`);
      assert.equal(tier.nodes?.length, 2, `${id} tier ${t} has ${tier.nodes?.length} bespoke nodes (exactly 2)`);
      if (tier.lib != null) {
        assert.ok(TALENT_LIBRARY[tier.lib], `${id} tier ${t} names library node ${tier.lib}, which does not exist`);
        assert.equal(TALENT_LIBRARY[tier.lib].tier, t, `${id} tier ${t} lib ${tier.lib} is a tier-${TALENT_LIBRARY[tier.lib].tier} node`);
      }
      for (const n of tier.nodes) {
        assert.match(n.id, /^[a-z][a-z0-9_]*$/, `${id}: node id ${n.id} is not snake_case`);
        assert.ok(!libIds.has(n.id), `${id}: node ${n.id} collides with a library id`);
        assert.ok(!seen.has(n.id), `${id}: node ${n.id} twice`);
        seen.add(n.id);
        assert.ok(n.name && n.name.split(/\s+/).length <= 3, `${id}: node ${n.id} needs a name of three words or fewer`);
        assert.ok(n.mod && typeof n.mod === 'object', `${id}: node ${n.id} has no mod`);
        const raw = (RAW.skills[id].talents[t] || RAW.skills[id].talents[String(t)]).nodes.find(x => x.id === n.id);
        assert.ok(!('desc' in raw), `${id}: node ${n.id} carries a hand-written desc — the text is generated`);
        if (n.requires) assert.ok(DATA.skills[n.requires], `${id}: node ${n.id} requires ${n.requires}, which is not a skill`);
      }
    }
    // the tree the game builds is that tree
    const tree = treeFor(id, row.shape);
    assert.equal(tree.offer, 'bespoke');
    for (const tier of tree.tiers) assert.ok(tier.nodes.length >= 2 && tier.nodes.length <= 3, `${id} tier ${tier.tier}`);
  }
});

test('G3 — charges: at most one node per skill, three per class, and only on tiers 3 and 4', () => {
  for (const c of converted) {
    let perClass = 0;
    for (const s of DATA.classes[c]) {
      let perSkill = 0;
      for (const [t, tier] of Object.entries(DATA.skills[s].talents || {})) {
        for (const n of tier.nodes || []) {
          if (!keysOf(n.mod).has('charges')) continue;
          perSkill++; perClass++;
          assert.ok(+t >= 3, `${s}:${n.id} gives charges on tier ${t}`);
        }
      }
      assert.ok(perSkill <= 1, `${s} has ${perSkill} charge nodes`);
    }
    assert.ok(perClass <= 3, `${c} has ${perClass} charge nodes`);
  }
});

// ─────────────────────────────────────────────────────────────── 4 — every key has a reader

const ROW_FIELDS = new Set([...PLAN_FIELDS, 'desc', 'descShort', 'talents', 'forms', 'form', 'statusSeconds', 'baseName', 'formId']);

test('every key on every row, override and node is a vocabulary key (with a reader) or a plan field', () => {
  const bad = [];
  const check = (where, obj) => {
    for (const k of keysOf(obj)) {
      if (k === 'when' || k === 'talents') continue;
      if (!(k in VOCAB) && !ROW_FIELDS.has(k) && !(k in PENDING)) bad.push(`${where}: ${k}`);
    }
  };
  for (const [id, row] of Object.entries(DATA.skills)) {
    const { talents, form, forms, ...rest } = row;
    check(id, rest);
    for (const [f, o] of Object.entries(forms || {})) check(`${id}.forms.${f}`, o);
    for (const [t, tier] of Object.entries(talents || {})) for (const n of tier.nodes || []) check(`${id} T${t} ${n.id}`, n.mod || {});
  }
  assert.deepEqual(bad, [], `keys nothing reads:\n  ${bad.join('\n  ')}`);
});

test('every vocabulary key has a describe() and its named reader file really mentions it', () => {
  const missing = [];
  for (const key of VOCAB_KEYS) {
    const v = VOCAB[key];
    assert.equal(typeof v.describe, 'function', `${key} has no describe`);
    assert.ok(['plan', 'hit', 'kill', 'self', 'enemy', 'pet', 'bar'].includes(v.phase), `${key} phase ${v.phase}`);
    const file = src(v.reader);
    if (!new RegExp(`\\b${key}\\b`).test(file)) missing.push(`${key} (${v.reader})`);
  }
  assert.deepEqual(missing, [], `vocabulary keys whose reader never names them:\n  ${missing.join('\n  ')}`);
});

test('no talent anywhere is inert: bespoke nodes included, P2 keys only while they are on PENDING', () => {
  const inert = inertTalents();
  const notPending = inert.filter(t => t.missing.some(k => !(k in PENDING)));
  assert.deepEqual(notPending.map(t => `${t.id}: ${t.missing.join(', ')}`), []);
  // what is waiting on a P2 mechanic is listed, so it can never ship as a silent sentence
  for (const t of inert) for (const k of t.pending) assert.ok(PENDING[k], `${t.id} waits on ${k}`);
});

// ─────────────────────────────────────────────────────────────── 5, 6 — wording and names

const BAD_TEXT = [/undefined/, /NaN/, /\{/, /\[object/, /\bnull\b/];
function wordingFaults(text) {
  const out = [];
  for (const re of BAD_TEXT) if (re.test(text)) out.push(String(re));
  if (/^It\b|\. It\b/.test(text)) out.push('a bare "It" as a subject');
  return out;
}

test('every generated skill card and every node line reads cleanly and carries a number', () => {
  const bad = [];
  const ctx = { skills: DATA.skills };
  for (const [id, row] of Object.entries(DATA.skills)) {
    const cards = [describeSkill(row, DATA.statuses, ctx)];
    for (const [f, o] of Object.entries(row.forms || {})) cards.push(describeSkill({ ...row, ...o, forms: undefined }, DATA.statuses, ctx));
    for (const c of cards) {
      const f = wordingFaults(c);
      if (f.length) bad.push(`${id}: ${f.join(', ')} — "${c}"`);
      if (!/\d/.test(c)) bad.push(`${id}: no number — "${c}"`);
    }
    for (const [t, tier] of Object.entries(row.talents || {})) {
      for (const n of tier.nodes || []) {
        const text = describeNode(n, { statuses: DATA.statuses, skills: DATA.skills });
        const f = wordingFaults(text);
        if (f.length) bad.push(`${id} T${t} ${n.id}: ${f.join(', ')} — "${text}"`);
        if (/^No change/.test(text)) bad.push(`${id} T${t} ${n.id}: describes as "No change"`);
        // a rule with no quantity in it is allowed when it names what it does (a status, a certain
        // critical hit, an immunity) — WORDING.md asks for numbers where there IS a magnitude
        if (!/\d/.test(text) && !/^(Becomes|Your followers get|Only you)|Works with|critical|cannot|appl(y|ies)/.test(text)) bad.push(`${id} T${t} ${n.id}: no number — "${text}"`);
      }
    }
  }
  assert.deepEqual(bad, [], `\n  ${bad.join('\n  ')}`);
});

/** CLAUDE.md convention 9, wildmarch §12.5 and the plan's G7 WoW echoes. */
const BANNED = ['heroic', 'mythic', 'keystone', 'war mode', 'horde', 'alliance', 'hearthstone', 'delve', 'renown',
  'rested', 'honored', 'revered', 'exalted', 'fury', 'focus', 'rage', 'combo point', 'garrote', 'cheap shot', 'prowl',
  'maul', 'rake', 'barkskin', 'totemic recall', 'soul shard', 'arcane charge', 'blink', 'counterspell', 'lay on hands',
  'consecration', 'mass resurrection', 'healing wave', 'last stand', 'mirror image', 'leap of faith', 'hellfire',
  'starfall', 'soulbound', 'flight path', 'attunement', 'chi', 'cataclysm', 'aspect', 'dance of blades', 'blade dance',
  'condemn', 'arcane surge', 'hallowed ground', 'final verdict', 'rebuke', 'purge the wicked', 'cold blood',
  'rallying cry', 'retribution', 'ironbark', 'rebirth', 'flare', 'frost armour', 'frost armor', 'ambush', 'shiv',
  'vengeance', 'vengeful', 'sigil', 'infernal', 'halo', 'beacon', 'overload', 'kill order', 'feral', 'death coil',
  'bear form', 'cat form', 'moonkin', 'travel form', 'tree of life', 'swipe', 'heartseeker', 'pack tactics'];
const BANNED_NEW = ['ember', 'veil'];

test('no banned or borrowed name on a converted skill, a form, a node or a new status', () => {
  const bad = [];
  const scan = (where, name, fresh = true) => {
    const lower = String(name || '').toLowerCase();
    for (const b of BANNED) if (new RegExp(`\\b${b}\\b`).test(lower)) bad.push(`${where}: "${name}" (${b})`);
    if (fresh) for (const b of BANNED_NEW) if (lower.includes(b)) bad.push(`${where}: "${name}" (${b})`);
  };
  const rows = Object.entries(DATA.skills).filter(([, r]) => r.talents || r.form || r.forms);
  for (const [id, row] of rows) {
    scan(id, row.name);
    for (const o of row.form?.options || [row.form].filter(Boolean)) scan(`${id}.form`, o.name);
    for (const [f, o] of Object.entries(row.forms || {})) scan(`${id}.forms.${f}`, o.name);
    for (const tier of Object.values(row.talents || {})) for (const n of tier.nodes || []) scan(`${id}:${n.id}`, n.name);
  }
  for (const id of ['root', 'disarm', 'sleep', 'fear', 'silence', 'strip', 'frostbite', 'rune', 'gnawed', 'off_balance']) scan(`status ${id}`, DATA.statuses[id]?.name);
  assert.deepEqual(bad, [], `\n  ${bad.join('\n  ')}`);
});

// ─────────────────────────────────────────────────────────────── 7 — stand alone

test('every converted skill does something with nothing else on the bar and no followers', () => {
  const EFFECT = ['mult', 'heal', 'status', 'statuses', 'summon', 'pet', 'place', 'selfBuff', 'form', 'barrier', 'counter',
    'ward', 'taunt', 'imbue', 'burst', 'pool', 'stack', 'tag', 'link', 'command', 'revive', 'cleanse', 'healPets', 'empowerNext', 'rewind', 'trail', 'orbs'];
  for (const id of convertedSkills) {
    const row = DATA.skills[id];
    const { player, rpg } = bar('warrior');
    const data = { ...DATA, classes: { ...DATA.classes, solo: [id, null, null, null, null, null] } };
    player.classId = 'solo';
    const skills = createSkillBar({ data, player, rpg });
    const plan = skills.use(0);
    assert.equal(plan.ok, true, `${id} could not be cast alone: ${plan.why}`);
    assert.ok(EFFECT.some(k => plan[k] != null && plan[k] !== false && plan[k] !== 0) || plan.kind === 'form',
      `${id} cast alone does nothing measurable (${Object.keys(row).join(', ')})`);
  }
});

// ─────────────────────────────────────────────────────────────── 8 — forms

test('forms: Briarback swaps Thornlash to Bramble Gore, leaving restores it, Sporecap runs out, a mount blocks it', () => {
  const { player, skills } = bar('druid');
  assert.equal(skills.rowFor(0).name, 'Thornlash');
  const into = skills.use(2);
  assert.equal(into.kind, 'form');
  assert.deepEqual(formIds(player), ['briarback']);
  assert.equal(skills.rowFor(0).name, 'Bramble Gore');
  assert.equal(skills.rowFor(0).shape, 'melee');
  assert.equal(skills.state()[0].name, 'Bramble Gore');
  assert.ok(statusStats(player).armorPct >= 0.6, 'the shape put no armour on the sheet');
  // pressing it again is free and immediate
  skills.slots[2].ready = 5;
  const mp = player.mp;
  const out = skills.use(2);
  assert.equal(out.ok, true, out.why);
  assert.equal(player.mp, mp, 'leaving a shape cost mana');
  assert.deepEqual(formIds(player), []);
  assert.equal(skills.rowFor(0).name, 'Thornlash');

  // Sporecap is timed and locks the toggles while it runs
  skills.use(5);
  assert.deepEqual(formIds(player), ['sporecap']);
  skills.slots[2].ready = 0;
  assert.equal(skills.check(2).ok, false);
  skills.update(15.2);
  assert.deepEqual(formIds(player), [], 'Sporecap did not run out at 15s');
  assert.ok(player.mechEvents.some(e => e.kind === 'formExpired'), 'its end was not handed to the runtime (onExit)');

  player.shapeBlocked = 'Not while riding.';
  skills.slots[2].ready = 0;
  assert.equal(skills.use(2).why, 'Not while riding.');
});

test('forms are never saved: a load starts in your own body', () => {
  const save = src('js/save.js');
  assert.ok(!/\bforms\s*:/.test(save), 'js/save.js writes the forms — a load would start shaped');
  assert.ok(!/\bmech\s*:/.test(save), 'js/save.js writes the runtime skill state');
});

test('a cycling form (a temper) steps through its options and lends its element', () => {
  const { player, rpg } = bar('warrior');
  const data = { ...DATA, classes: { ...DATA.classes, t: ['wyrm_temper', 'cleave', null, null, null, null] } };
  data.skills = { ...DATA.skills, cleave: { ...DATA.skills.cleave, elementFrom: 'temper' } };
  player.classId = 't';
  const skills = createSkillBar({ data, player, rpg });
  skills.use(0);
  assert.equal(player.forms.temper.id, 'fire');
  skills.slots[0].ready = 0;
  const swap = skills.use(0);
  assert.equal(player.forms.temper.id, 'frost');
  assert.equal(swap.form.left.id, 'fire', 'the old temper was not handed back for its exit pulse');
  const cast = skills.use(1);
  assert.equal(cast.element, 'ice');
  assert.equal(cast.status, 'chill');
  registerSkillRows(DATA.skills, DATA.statuses);
});

// ─────────────────────────────────────────────────────────────── 9 — save migration

test('migration keeps what the new trees still offer, drops the rest, and is safe to run twice', () => {
  const player = { level: 30, skillTalents: { firebolt: { 1: 'fan', 2: 'burst' }, execute: { 1: 'wide' }, cleave: { 1: 'wide', 2: 'linger', 3: 'hunger' } } };
  const six = DATA.classes.warrior;
  const first = migrateTalents(player, six);
  // firebolt and execute are not the warrior's any more; cleave keeps `wide` (its T1 lib) and
  // `hunger` (its T3 lib) and drops `linger` (not on its new tree)
  assert.deepEqual(player.skillTalents, { cleave: { 1: 'wide', 3: 'hunger' } });
  assert.equal(first.dropped, 4);
  assert.equal(first.kept, 2);
  const again = migrateTalents(player, six);
  assert.equal(again.dropped, 0);
  assert.deepEqual(player.skillTalents, { cleave: { 1: 'wide', 3: 'hunger' } });
  assert.match(src('js/save.js'), /talentsVersion: 2/);
  assert.match(src('js/main.js'), /migrateTalents\(player/);
});

// ─────────────────────────────────────────────────────────────── 10 — followers

test('a temporary summon takes no slot and blocks no hire', () => {
  const f = src('js/followers.js');
  assert.match(f, /p\.dying == null && !p\.temporary/, 'the follower count still sees temporary summons');
  assert.match(f, /!s\.summon\?\.temporary/, 'a temporary summon still sets a per-type cap');
  const pets = src('js/pets.js');
  assert.match(pets, /if \(temporary\) \{/, 'pets.summon does not skip the follower gate for a temporary summon');
  assert.match(pets, /function order\(kind, target/, 'there is no command order for followers');
});

// ─────────────────────────────────────────────────────────────── 11 — the pure rules

test('hit rules: a crowd bonus, a stun consumed, a tag, a stack that freezes at its maximum', () => {
  setMechEnv({ statusSpec: id => DATA.statuses[id], rng: () => 0.5 });
  const me = { x: 0, z: 0, equipment: {}, hp: 100, maxHp: 100 };
  const foe = { x: 0, z: 2, facing: Math.PI, hp: 500, maxHp: 500, statuses: {} };
  assert.ok(Math.abs(hitFactor({ bonusIf: [{ when: 'crowd:0.12:0.48' }] }, me, foe, { crowd: 3 }).mult - 1.24) < 1e-9);
  assert.ok(Math.abs(hitFactor({ bonusIf: [{ when: 'crowd:0.12:0.48' }] }, me, foe, { crowd: 9 }).mult - 1.48) < 1e-9, 'the crowd bonus is not capped');
  foe.stagger = 1;
  assert.equal(hitFactor({ consumes: { status: 'stagger', mult: 0.5 } }, me, foe).mult, 1.5);
  afterHit({ skill: 'x', tag: { id: 'off_balance' } }, me, foe, { amount: 10 });
  assert.equal(foe.statuses.off_balance.kind, 'tag');
  assert.ok(Math.abs(hitFactor({ skill: 'y' }, me, foe).mult - 1.2) < 1e-9, 'Off Balance did not make the target take more from you');
  for (let i = 0; i < 4; i++) addStacks(foe, 'frostbite', DATA.statuses.frostbite, { max: 5 });
  assert.equal(foe.statuses.frostbite.stacks, 4);
  foe.stagger = 0;
  const maxed = addStacks(foe, 'frostbite', DATA.statuses.frostbite, { max: 5 });
  assert.equal(maxed.maxed, true);
  assert.equal(foe.stagger, 2, 'Frozen is a 2s stun');
});

test('hits taken: a ward negates, a counter answers, per-foe resistance scales, a once-only save fires', () => {
  setMechEnv({ near: () => [{}, {}, {}], rng: () => 0.9 });
  const me = { x: 0, z: 0, yaw: 0, hp: 100, maxHp: 100, statuses: {} };
  applyStatus(me, 'ward:x', { seconds: 5, ward: { charges: 1, threshold: 0.1 } });
  assert.equal(onHurt(me, { x: 0, z: 2 }, 5).amount, 5, 'a small hit passed a Foresight ward');
  assert.equal(onHurt(me, { x: 0, z: 2 }, 20).amount, 0, 'the ward did not negate the big hit');
  assert.equal(onHurt(me, { x: 0, z: 2 }, 20).amount, 20, 'the ward negated twice on one charge');
  applyStatus(me, 'counter:x', { seconds: 1.2, counter: { hits: 1, hitsLeft: 1, negate: 1, answer: { mult: 2.5 } } });
  const c = onHurt(me, { x: 0, z: 2 }, 30);
  assert.equal(c.amount, 0);
  assert.equal(c.events[0].kind, 'counter');
  me.statuses = {};
  applyStatus(me, 'buff:r', { seconds: 10, resistPerFoe: { per: 0.06, cap: 0.36, radius: 6 } });
  assert.equal(onHurt(me, { x: 0, z: 2 }, 100).amount, 82, 'three foes should take 18% off');
  me.statuses = {};
  applyStatus(me, 'buff:u', { seconds: 10, deathPreventOnce: { burst: { radius: 6, mult: 3 } } });
  me.hp = 10;
  const save = onHurt(me, { x: 0, z: 2 }, 50);
  assert.equal(save.amount, 9);
  assert.ok(save.events.some(e => e.kind === 'burst'));
  assert.ok(!me.statuses['buff:u'], 'Unkillable stayed on after firing');
});

test('a boss is never slept, feared or rooted; a champion holds it half as long', () => {
  assert.equal(controlFor({ boss: true }, 'sleep', 6).id, 'chill');
  assert.equal(controlFor({ boss: true }, 'root', 2).id, 'chill');
  assert.equal(controlFor({ rank: 'champion' }, 'fear', 4).seconds, 2);
  assert.equal(controlFor({ rank: 'normal' }, 'fear', 4).seconds, 4);
});

test('a placed trap arms, fires on the first enemy in reach, and is gone', () => {
  resetWorld();
  placeObject({ kind: 'trap', arm: 1, triggerRadius: 2, radius: 2.5, seconds: 30, strike: { mult: 1 } }, { x: 0, z: 0, owner: 'snare' });
  const enemies = [{ x: 1, z: 0 }];
  assert.deepEqual(tickPlaced(0.5, { enemies: () => enemies }), [], 'it fired before it armed');
  tickPlaced(0.6, { enemies: () => [] });
  const fired = tickPlaced(0.1, { enemies: () => enemies });
  assert.equal(fired[0].kind, 'trap');
  assert.equal(world.placed.length, 0);
});

test('applyMod: set / add / mul, a dotted path, a scalar repeats grown into a rider, per-form riders', () => {
  const p = applyMod({ shape: 'bolt', range: 30, splash: 2, mult: 1, repeats: 5, knock: { push: 4, stagger: 0.6 } }, {
    set: { shape: 'melee', arc: 2 }, mul: { mult: 1.5 }, knock: { push: 0 }, repeats: { grow: 0.6 },
  });
  assert.equal(p.kind, 'melee');
  assert.equal(p.splash, undefined, 'a bolt turned melee kept its splash');
  assert.equal(p.mult, 1.5);
  assert.deepEqual(p.knock, { push: 0, stagger: 0.6 });
  assert.equal(p.repeats.count, 5);
  assert.equal(p.repeats.grow, 0.6);
  const f = applyMod({ form: { stats: { armorPct: 0.6 } } }, { set: { 'form.stats.armorPct': 1 } });
  assert.equal(f.form.stats.armorPct, 1);
  const only = applyMod({ mult: 1 }, { forms: { briarback: { mul: { mult: 2 } } } }, { forms: [] });
  assert.equal(only.mult, 1);
  assert.equal(applyMod({ mult: 1 }, { forms: { briarback: { mul: { mult: 2 } } } }, { forms: ['briarback'] }).mult, 2);
});

// ─────────────────────────────────────────────────────────────── the Warrior, end to end

test('the Warrior: every talent changes the plan it casts', () => {
  for (const id of DATA.classes.warrior) {
    const row = DATA.skills[id];
    for (const [t, tier] of Object.entries(row.talents)) {
      for (const n of tier.nodes) {
        const { player, skills } = bar('warrior', 30);
        const slot = skills.slots.findIndex(s => s.id === id);
        const plain = skills.rowFor(slot);
        const picked = pickTalent(player, id, +t, n.id, { shape: row.shape });
        assert.equal(picked.ok, true, `${id}:${n.id} ${picked.why}`);
        assert.equal(talentsOn(player, id).length, 1);
        const with_ = skills.rowFor(slot);
        assert.notDeepEqual(JSON.stringify(with_), JSON.stringify(plain), `${id}:${n.id} changed nothing on the plan`);
      }
    }
  }
});

test('the bar state carries what the HUD draws: charges, recast, next roll, form, resource', () => {
  const { player, skills } = bar('druid');
  const st = skills.state();
  for (const k of ['charges', 'recastLeft', 'next', 'form', 'resource']) assert.ok(k in st[0], `state() has no ${k}`);
  assert.equal(st[2].form.group, 'shape');
  gainResource(player, 'flair', 3);
  assert.equal(resourceOf(player, 'flair'), 3);
});

// ─────────────────────────────────────────────────────────────── a TDZ guard (node --check cannot see one)

test('the round-28 names are declared before they are read (a TDZ throws every frame)', () => {
  // comments mention the names in prose; only code counts
  const code = f => src(f).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const actors = code('js/actors.js');
  for (const name of ['asleep', 'rooted']) {
    const decl = actors.indexOf(`const ${name} =`);
    const firstUse = actors.search(new RegExp(`\\b${name}\\b`));
    assert.ok(decl >= 0 && firstUse === decl + 6, `js/actors.js reads \`${name}\` before declaring it`);
  }
  const main = code('js/main.js');
  const decl = main.indexOf('const mech = createSkillRuntime(');
  assert.ok(decl > 0);
  // every `mech.` before the declaration would be in a function body called later; the only one
  // allowed above it is none at all
  assert.ok(main.search(/\bmech\.[a-zA-Z]/) > decl, 'js/main.js names `mech.` above `const mech`');
});
