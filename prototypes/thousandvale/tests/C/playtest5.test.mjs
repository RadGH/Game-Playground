// node --test prototypes/thousandvale/tests/C/playtest5.test.mjs
//
// Owner play-test 5 (~/claude/agent/mmo/round-playtest5.md), the combat rules:
//   T2   every card says exactly who it touches, and the people it names are the people it lands on
//   T3   every healer's key 1 or 2 is a direct heal that can be aimed at an ally
//   T4   six revives, each with its own niche (mass / instant / mend / shield / weakened / long cast)
//   T7   Doubled Grasp: two two-handers go on, stay on through a save, and both swing
//   T14  the basic attack's real reach; out of reach is refused, never fired into the air
//   T15  wand / staff / focus forms: every style is a real attack that damages what its card says
//   T16  a sceptre swings in melee with its element
// (crates, conversion, the gear catalog, the sheet and the rare rate are in playtest5-loot / playtest5-sheet.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { attuneWeapon, describeSkill, applyStatus } from '../../js/rules/farhold.js';
import { cardText, whoText, whoKey, LEGACY_PHRASES, WHO_KEY, WORDING_RULES, tvSentences } from '../../js/rules/wording.js';
import { tierNodes, nodeText } from '../../js/rules/talents.js';
import { allyEffects, aimsAtAlly } from '../../js/rules/ally.js';
import { directHealSlot, reviveOf } from '../../js/rules/tv-skills.js';
import { forestView } from '../../js/rules/perk-forest.js';
import { stampCaster, attackReach, basicCard, wandText } from '../../js/rules/caster-forms.js';
import { makeRng } from '../../js/rules/rng.js';

const engine = rulesEngine();
const D = engine.skillData;
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
let roomN = 0;

/** A real room (A's js/sim/room.js) with the real rules. `opts.offers` = the room takes revive offers. */
function world({ offers = false } = {}) {
  const events = [];
  const id = `pt5-${++roomN}`;
  const room = createRoom({ id, terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push(ev); return ev0(ev); };
  const offered = [];
  if (offers) room.host.offerRevive = (caster, target, spec) => { offered.push({ caster, target, spec }); return { ok: true }; };
  let pid = 10;
  const add = (cls, dx = 0, dz = 0, { level = 30, party = 'P', name = null } = {}) => {
    const e = room.addPlayer({ id: ++pid, name: name || `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: SX + dx, z: SZ + dz }, null);
    if (party) room.rules.onParty(e, party);
    return e;
  };
  const mob = (dx, dz, { level = 30, type = 'wolf', still = true } = {}) => {
    const m = room.spawn({ kind: 'monster', type, level, x: SX + dx, z: SZ + dz, data: { noRank: true } });
    if (still) { m.r.unit.attackEvery = 99; m.r.unit.speed = 0; m.r.unit.aggroRange = 0; }
    return m;
  };
  const steps = (n = 1) => { for (let i = 0; i < n; i++) room.step(); };
  const kill = e => { const u = e.r.unit; u.hp = 0; u.dead = true; room.step(); assert.ok(e.dead, 'the room sees the body'); };
  const slotOf = (e, id2) => e.r.unit.skills.slots.findIndex(s => s.id === id2) + 1;
  return { room, events, add, mob, steps, kill, slotOf, offered };
}
const ready = (e, slot) => { const u = e.r.unit; u.skills.slots[slot - 1].ready = 0; u.mp = u.maxMp; };
const hurt = (e, f = 0.4) => { const u = e.r.unit; u.hp = Math.round(u.maxHp * f); return u.hp; };
const pet = (w, owner, dx = 1, dz = 1) => w.room.rules.room.run(() => w.room.rules.room.followers.summon('grove_wolf', owner.r.unit, { count: 1, at: { x: owner.x + dx, z: owner.z + dz }, origin: 'summon' })[0]);

// ============================================================================ T2 — wording

test('T2: no card keeps one of Farhold\'s one-player phrases; a card that uses a group word spells it out', () => {
  let cards = 0;
  const bad = [], noKey = [];
  const check = (where, text) => {
    cards++;
    for (const rx of LEGACY_PHRASES) if (rx.test(text)) bad.push(`${where}: ${rx}`);
    if (/\ball allies\b|\ballies\b/i.test(text) && !text.includes(WHO_KEY.allies)) noKey.push(`${where} (allies)`);
    if (/\byour followers?\b/i.test(text) && !text.includes(WHO_KEY.followers) && !text.includes(WHO_KEY.allies)) noKey.push(`${where} (followers)`);
  };
  for (const [id, row] of Object.entries(D.skills)) {
    const variants = [row, ...Object.values(row.forms || {}).map(f => ({ ...row, ...f, forms: null }))];
    for (const v of variants) check(id, cardText(v, describeSkill(v, D.statuses, { cost: false, skills: D.skills }), { statuses: D.statuses }));
    for (const tier of [1, 2, 3, 4]) for (const nd of tierNodes(row, tier)) check(`${id}/${nd.id}`, nodeText(nd, row, D.statuses, D.skills));
  }
  for (const n of forestView(engine.forest).nodes) check(`perk ${n.id}`, `${n.desc || ''} ${n.cost || ''}`);
  assert.ok(cards > 1500, `${cards} cards read`);
  assert.deepEqual(bad, []);
  assert.deepEqual(noKey, []);
  assert.ok(WORDING_RULES.every(r => r.reader), 'every wording rule names the code that makes it true');
});

test('T2: a card says "you (or the party member you target)" exactly when the rules aim that effect at an ally', () => {
  const wrong = [];
  for (const cls of Object.keys(D.classes)) for (const id of D.classes[cls]) {
    const row = D.skills[id];
    const text = cardText(row, describeSkill(row, D.statuses, { cost: false, skills: D.skills }), { statuses: D.statuses });
    const says = /\(or the party member you target\)|party member you target/.test(text);
    if (aimsAtAlly(row) !== says) wrong.push(`${cls}/${id}: aims=${aimsAtAlly(row)} card=${says}`);
  }
  assert.deepEqual(wrong, []);
});

test('T2: "all allies" lands on you, a party member in reach, their pet and your follower — not a far member, not a stranger', () => {
  const w = world();
  const oracle = w.add('oracle'), near = w.add('warrior', 3, 0), far = w.add('warrior', 0, 120), stranger = w.add('warrior', -3, 0, { party: null });
  const mine = pet(w, oracle), theirs = pet(w, near, 1, -1);
  const slot = w.slotOf(oracle, 'foresight');                   // "All allies get a ward"
  assert.ok(slot > 0);
  assert.match(w.room.rules.bar(oracle)[slot - 1].desc, /All allies get a ward/);
  assert.equal(w.room.rules.bar(oracle)[slot - 1].who, 'allies');
  ready(oracle, slot);
  assert.ok(w.room.intent(oracle, { t: 'cast', slot }).ok);
  const warded = u => Object.keys(u.statuses || {}).some(k => k.startsWith('ward:'));
  assert.ok(warded(oracle.r.unit) && warded(near.r.unit) && warded(mine) && warded(theirs), 'you, the member, your follower and their pet');
  assert.ok(!warded(far.r.unit) && !warded(stranger.r.unit), 'not the far member, not the stranger');
});

test('T2: "your followers" is your OWN followers only (Stoke the Familiar no longer buffs the party); a follower revive never raises a player', () => {
  const w = world();
  const pyro = w.add('pyromancer'), near = w.add('warrior', 3, 0);
  const mine = pet(w, pyro), theirs = pet(w, near, 1, -1);
  w.mob(0, 8);
  const slot = w.slotOf(pyro, 'stoke_familiar');
  assert.match(w.room.rules.bar(pyro)[slot - 1].desc, /your followers:/);
  assert.match(w.room.rules.bar(pyro)[slot - 1].desc, /Revives all your own fallen followers/);
  w.kill(near);
  ready(pyro, slot);
  assert.ok(w.room.intent(pyro, { t: 'cast', slot }).ok);
  const stoked = u => !!u.statuses?.['buff:stoke_familiar'];
  assert.ok(stoked(mine), 'your follower is Stoked');
  assert.ok(!stoked(theirs) && !stoked(near.r.unit), 'nobody else is');
  w.steps(4);
  assert.ok(near.dead, 'the fallen party member stays down: only a revive skill raises a player');
});

test('T2: "every other ally" (Mend) heals party + followers and not the stranger; a cleanse for "every ally" reaches a party member\'s pet', () => {
  const w = world();
  const cleric = w.add('cleric'), near = w.add('warrior', 3, 0), stranger = w.add('warrior', -3, 0, { party: null });
  const theirs = pet(w, near, 1, -1);
  hurt(near, 0.3); hurt(stranger, 0.3); theirs.hp = Math.round(theirs.maxHp * 0.3);
  const n0 = near.r.unit.hp, s0 = stranger.r.unit.hp, t0 = theirs.hp;
  assert.match(w.room.rules.bar(cleric)[0].desc, /Every other ally heals 20% of their maximum health/);
  ready(cleric, 1);
  assert.ok(w.room.intent(cleric, { t: 'cast', slot: 1 }).ok);
  assert.ok(near.r.unit.hp > n0 && theirs.hp > t0, 'the party member and their pet');
  assert.equal(stranger.r.unit.hp, s0, 'not the stranger');
});

test('T2: Reposition swaps with your own follower when no enemy is aimed at (the card always said so)', () => {
  const w = world();
  const tac = w.add('tactician', 0, 0, { level: 40 });
  const mine = pet(w, tac, 0, 8);
  mine.x = SX; mine.z = SZ + 8;
  const slot = w.slotOf(tac, 'reposition');
  assert.match(w.room.rules.bar(tac)[slot - 1].desc, /swaps places with the aimed enemy \(not a boss\), else your aimed follower/);
  ready(tac, slot);
  assert.ok(w.room.intent(tac, { t: 'cast', slot, aim: { x: SX, z: SZ + 8 } }).ok);
  assert.ok(Math.hypot(tac.r.unit.x - SX, tac.r.unit.z - (SZ + 8)) < 0.5, 'you stand where the follower stood');
  assert.ok(Math.hypot(mine.x - SX, mine.z - SZ) < 0.5, 'the follower stands where you stood');
  assert.ok(mine.barrier > 0, 'and got its barrier');
});

// ============================================================================ T3 — healers

test('T3: every healer\'s key 1 or 2 is a direct heal that lands on the targeted ally, else on the healer', () => {
  assert.deepEqual(D.healers, ['cleric', 'priest', 'druid', 'shaman', 'paladin', 'bard', 'oracle']);
  for (const cls of D.healers) {
    const slot = directHealSlot(D, cls);
    assert.ok(slot === 1 || slot === 2, `${cls}: a direct heal on key 1 or 2`);
    const w = world();
    const healer = w.add(cls, 0, 0, { level: 30 }), friend = w.add('warrior', 4, 2), stranger = w.add('warrior', -3, 0, { party: null });
    w.mob(0, 6);                                  // something for Prayer of Dawn to strike
    const card = w.room.rules.bar(healer)[slot - 1];
    assert.equal(card.ally, true, `${cls}: the bar says "aim it at a friend"`);
    assert.match(card.desc, /Heals you \(or the party member you target\) for \d+% of maximum health/, `${cls}: ${card.desc}`);
    const share = D.skills[card.id].heal;
    // aimed at the friend
    const f0 = hurt(friend, 0.3), h0 = hurt(healer, 0.5);
    ready(healer, slot);
    const r = w.room.intent(healer, { t: 'cast', slot, target: friend.id, aim: { x: friend.x, z: friend.z } });
    assert.ok(r.ok, `${cls}: ${JSON.stringify(r)}`);
    const gained = friend.r.unit.hp - f0;
    assert.ok(gained >= Math.round(friend.r.unit.maxHp * share) - 2, `${cls}: the friend got the direct heal (${gained} of ${Math.round(friend.r.unit.maxHp * share)})`);
    if (cls === 'cleric') assert.equal(healer.r.unit.hp, h0, 'cleric: the direct part did not land on the cleric');
    // no ally targeted -> the healer
    hurt(healer, 0.3); const h1 = healer.r.unit.hp;
    ready(healer, slot);
    assert.ok(w.room.intent(healer, { t: 'cast', slot }).ok);
    assert.ok(healer.r.unit.hp - h1 >= Math.round(healer.r.unit.maxHp * share) - 2, `${cls}: with nobody targeted it heals the healer`);
    // a stranger is never healed
    const s0 = hurt(stranger, 0.3);
    hurt(healer, 0.3);
    ready(healer, slot);
    w.room.intent(healer, { t: 'cast', slot, target: stranger.id });
    assert.equal(stranger.r.unit.hp, s0, `${cls}: a stranger is not healed`);
  }
});

test('T3: Mending Post with a party member targeted is planted at THEIR feet (inside its range)', () => {
  const w = world();
  const shaman = w.add('shaman'), friend = w.add('warrior', 6, 0);
  ready(shaman, 2);
  const from = w.events.length;
  assert.ok(w.room.intent(shaman, { t: 'cast', slot: 2, target: friend.id }).ok);
  const post = w.events.slice(from).find(e => e.type === 'fx' && e.kind === 'place');
  assert.ok(post && Math.hypot(post.x - friend.x, post.z - friend.z) < 0.6, 'the post stands beside the friend');
  assert.match(w.room.rules.bar(shaman)[1].desc, /With a party member targeted it is planted at their feet/);
});

test('T3: the three hybrid healers each heal in their own way — a touch (paladin), a verse (bard), an omen (oracle)', () => {
  // paladin: a touch — the friend must be within 6 m
  {
    const w = world();
    const pal = w.add('paladin'), near = w.add('warrior', 4, 0), far = w.add('warrior', 0, 12);
    assert.equal(w.room.rules.bar(pal)[1].id, 'mercy_touch');
    assert.match(w.room.rules.bar(pal)[1].desc, /A touch: the party member must be within 6 m of you, or it lands on you/);
    const n0 = hurt(near, 0.3), f0 = hurt(far, 0.3), p0 = hurt(pal, 0.3);
    ready(pal, 2); assert.ok(w.room.intent(pal, { t: 'cast', slot: 2, target: near.id }).ok);
    assert.ok(near.r.unit.hp > n0, 'a friend at 4 m is healed');
    ready(pal, 2); assert.ok(w.room.intent(pal, { t: 'cast', slot: 2, target: far.id }).ok);
    assert.equal(far.r.unit.hp, f0, 'a friend at 12 m is out of a touch\'s reach');
    assert.ok(pal.r.unit.hp > p0, 'so it landed on the paladin');
  }
  // bard: the heal and Mending on the target
  {
    const w = world();
    const bard = w.add('bard'), friend = w.add('warrior', 5, 0);
    assert.equal(w.room.rules.bar(bard)[1].id, 'mending_verse');
    const f0 = hurt(friend, 0.3);
    ready(bard, 2); assert.ok(w.room.intent(bard, { t: 'cast', slot: 2, target: friend.id }).ok);
    assert.ok(friend.r.unit.hp >= f0 + Math.round(friend.r.unit.maxHp * 0.18) - 2, 'the direct heal');
    assert.ok(friend.r.unit.statuses?.regen && !bard.r.unit.statuses?.regen, 'Mending on the friend, not the bard');
  }
  // oracle: a small heal and a ward on the target
  {
    const w = world();
    const ora = w.add('oracle'), friend = w.add('warrior', 5, 0);
    assert.equal(w.room.rules.bar(ora)[1].id, 'kind_omen');
    const f0 = hurt(friend, 0.3);
    ready(ora, 2); assert.ok(w.room.intent(ora, { t: 'cast', slot: 2, target: friend.id }).ok);
    assert.ok(friend.r.unit.hp > f0, 'healed');
    assert.ok(Object.keys(friend.r.unit.statuses).some(k => k.startsWith('ward:')), 'and warded');
    assert.ok(!Object.keys(ora.r.unit.statuses || {}).some(k => k.startsWith('ward:')), 'the ward went to the friend');
  }
});

// ============================================================================ T4 — revives

const REVIVES = { cleric: 'raise_the_fallen', priest: 'second_dawn', druid: 'green_return', paladin: 'oathbound_rise', necromancer: 'unquiet_return', shaman: 'call_back_the_spirit' };

test('T4: six classes have a revive on key 3-6, each a different niche, each with its own look', () => {
  const styles = new Set(), niches = new Set();
  for (const [cls, id] of Object.entries(REVIVES)) {
    const i = D.classes[cls].indexOf(id);
    assert.ok(i >= 2, `${cls}: ${id} on key ${i + 1}`);
    const rv = reviveOf(D.skills[id]);
    assert.ok(rv && rv.style, `${cls}: a revive with a style`);
    styles.add(rv.style);
    niches.add(JSON.stringify([rv.mass, rv.castTime > 0, rv.combat, rv.share, Object.keys(rv.apply || {})]));
    const text = tvSentences(D.skills[id], D.statuses).join(' ');
    assert.match(text, rv.mass ? /every fallen party member within 30 m/ : /fallen party member you target/);
    assert.match(text, rv.castTime > 0 ? new RegExp(`${rv.castTime}s cast`) : /Instant/);
    assert.match(text, rv.combat ? /Can be cast in combat/ : /Cannot be cast while a monster is attacking you/);
  }
  assert.equal(styles.size, 6, 'six looks');
  assert.equal(niches.size, 6, 'six niches');
});

test('T4: each revive raises a fallen party member the way its card says (health, rider, cast time), and nobody else', () => {
  for (const [cls, id] of Object.entries(REVIVES)) {
    const w = world();
    const healer = w.add(cls, 0, 0, { level: 30 }), friend = w.add('warrior', 4, 2), stranger = w.add('warrior', -3, 0, { party: null }), far = w.add('warrior', 0, 90);
    const slot = w.slotOf(healer, id);
    const rv = reviveOf(D.skills[id]);
    const card = w.room.rules.bar(healer)[slot - 1];
    assert.deepEqual(card.revive, { style: rv.style, castMs: Math.round(rv.castTime * 1000), combat: rv.combat, mass: rv.mass, hpPct: rv.share });
    // nobody down: refused, nothing spent
    ready(healer, slot);
    const mp0 = healer.r.unit.mp;
    const no = w.room.intent(healer, { t: 'cast', slot });
    assert.equal(no.ok, false); assert.equal(no.why, 'target', `${cls}: ${JSON.stringify(no)}`);
    assert.equal(healer.r.unit.mp, mp0, 'nothing spent');
    w.kill(friend); w.kill(stranger); w.kill(far);
    const from = w.events.length;
    const r = w.room.intent(healer, { t: 'cast', slot, target: friend.id });
    assert.ok(r.ok, `${cls}: ${JSON.stringify(r)}`);
    if (rv.castTime > 0) {
      assert.ok(friend.dead, `${cls}: still casting`);
      assert.equal(healer.r.unit.mp, mp0, `${cls}: nothing is paid until the cast completes`);
      const bar = w.events.slice(from).find(e => e.type === 'castbar' && e.ab === id);
      assert.equal(bar?.ms, Math.round(rv.castTime * 1000), `${cls}: a cast bar of the card's length`);
      const fx = w.events.slice(from).find(e => e.type === 'fx' && e.kind === 'reviveCast');
      assert.equal(fx?.style, rv.style);
      w.steps(Math.ceil(rv.castTime * 20) - 2);
      assert.ok(friend.dead, `${cls}: not before the cast time`);
      w.steps(6);
    } else w.steps(1);
    assert.ok(!friend.dead, `${cls}: the friend stands`);
    const fu = friend.r.unit;
    assert.ok(Math.abs(fu.hp - Math.round(fu.maxHp * rv.share)) <= Math.max(2, fu.maxHp * 0.06), `${cls}: at ${rv.share * 100}% health (${fu.hp}/${fu.maxHp})`);
    assert.ok(healer.r.unit.mp < mp0, `${cls}: paid on completion`);
    assert.ok(stranger.dead && far.dead, `${cls}: the stranger and the far member stay down`);
    const done = w.events.slice(from).find(e => e.type === 'fx' && e.kind === 'revive' && e.id === friend.id);
    assert.equal(done?.skill, id, `${cls}: everyone near is told which revive it was`);
    assert.equal(done?.style, rv.style);
    if (rv.apply?.status) assert.ok(fu.statuses?.[rv.apply.status.id], `${cls}: returns with ${rv.apply.status.id}`);
    if (rv.apply?.barrier) assert.equal(fu.barrier, Math.round(fu.maxHp * rv.apply.barrier.share), `${cls}: returns with the barrier`);
    if (rv.apply?.debuff) assert.equal(fu.statuses?.[rv.apply.debuff.id]?.dealLess, rv.apply.debuff.dealLess, `${cls}: returns weakened`);
    if (rv.mp) assert.equal(fu.mp, fu.maxMp, `${cls}: with full mana`);
  }
});

test('T4: the cleric raises EVERYONE who fell; a long cast is broken by walking and costs nothing; out-of-combat ones refuse in a fight', () => {
  const w = world();
  const cleric = w.add('cleric'), a = w.add('warrior', 4, 2), b = w.add('rogue', -4, 2);
  const slot = w.slotOf(cleric, 'raise_the_fallen');
  w.kill(a); w.kill(b);
  ready(cleric, slot);
  const mp0 = cleric.r.unit.mp;
  // walking breaks it
  assert.ok(w.room.intent(cleric, { t: 'cast', slot }).ok);
  w.steps(10);
  cleric.moveTo(cleric.x + 2, cleric.z);
  const from = w.events.length;
  w.steps(2);
  assert.ok(w.events.slice(from).some(e => e.type === 'castX' && e.why === 'moved'), 'the cast was broken');
  w.steps(100);
  assert.ok(a.dead && b.dead, 'nobody was raised');
  assert.equal(cleric.r.unit.mp, mp0, 'and nothing was spent');
  assert.equal(cleric.r.unit.skills.slots[slot - 1].ready, 0, 'no cooldown either');
  // in a fight it is refused
  const wolf = w.mob(0, 3);
  wolf.r.unit.targetId = cleric.id;
  const no = w.room.intent(cleric, { t: 'cast', slot });
  assert.equal(no.ok, false); assert.equal(no.why, 'combat');
  wolf.r.unit.targetId = null;
  // standing still: both rise
  assert.ok(w.room.intent(cleric, { t: 'cast', slot }).ok);
  w.steps(90);
  assert.ok(!a.dead && !b.dead, 'both rise');
  // the priest's is the one for a fight
  const w2 = world();
  const priest = w2.add('priest'), c = w2.add('warrior', 3, 0);
  const wolf2 = w2.mob(0, 3);
  wolf2.r.unit.targetId = priest.id;
  w2.kill(c);
  const ps = w2.slotOf(priest, 'second_dawn');
  ready(priest, ps);
  assert.ok(w2.room.intent(priest, { t: 'cast', slot: ps, target: c.id }).ok, 'Second Dawn works with a wolf on you');
  w2.steps(1);
  assert.ok(!c.dead);
  assert.ok(priest.r.unit.skills.slots[ps - 1].ready > 170, 'on its three-minute cooldown');
});

test('T4: when the room takes offers, the body waits for the player\'s answer; rules.revived stands it up with the rider', () => {
  const w = world({ offers: true });
  const druid = w.add('druid'), friend = w.add('warrior', 3, 0);
  const slot = w.slotOf(druid, 'green_return');
  w.kill(friend);
  ready(druid, slot);
  assert.ok(w.room.intent(druid, { t: 'cast', slot, target: friend.id }).ok);
  w.steps(60);
  assert.equal(w.offered.length, 1, 'one offer');
  const { spec, target, caster } = w.offered[0];
  assert.equal(target, friend); assert.equal(caster, druid);
  assert.equal(spec.skill, 'green_return'); assert.equal(spec.hpPct, 0.2); assert.equal(spec.style, 'bloom');
  assert.ok(spec.note && JSON.parse(JSON.stringify(spec)), 'the offer is plain JSON with a line for the prompt');
  assert.ok(friend.dead, 'not raised until accepted');
  const r = w.room.rules.revived(friend, spec);
  assert.ok(r.ok);
  w.steps(1);
  assert.ok(!friend.dead);
  assert.ok(friend.r.unit.statuses.regen, 'returns with Mending');
  const hp = friend.r.unit.hp;
  w.steps(60);
  assert.ok(friend.r.unit.hp > hp, 'and it mends');
});

// ============================================================================ T14 / T15 / T16 — caster forms

function withWeapon(w, e, baseKey, patch = {}, slot = 'weapon') {
  const item = engine.rpg.loot.generate(baseKey, 'normal', 'medium', { rng: makeRng(baseKey.length * 13 + Object.keys(patch).length) });
  Object.assign(item, patch);
  attuneWeapon(item);
  stampCaster(engine, item, {});
  const r = w.room.rules.equip(e, item, slot);
  assert.ok(r.ok, `${baseKey}: ${r.text}`);
  return item;
}

test('T15: every wand style is a real attack — it damages a target standing at its reach, and its card says what it does', () => {
  const styles = engine.casterForms.styles;
  assert.equal(Object.values(styles).filter(s => !s.tome).length, 13);      // (owner feedback 10: + the four tome forms, which a wand never rolls)
  const forms = new Set();
  for (const st of Object.values(styles)) {
    if (st.tome) continue;                     // a tome's forms are tested with the tome (tests/C/playtest10)
    forms.add(st.castForm);
    const w = world();
    const mage = w.add('mage');
    const wand = withWeapon(w, mage, 'wand', { castStyle: st.key, attune: 'fire' });
    assert.equal(wand.castStyle, st.key);
    assert.equal(wand.castForm, st.castForm);
    assert.ok(wand.attackText && /^Basic attack: /.test(wand.attackText), `${st.key}: ${wand.attackText}`);
    assert.match(wand.attackText, /fire/, 'the card names the element');
    const reach = w.room.rules.attackRange(mage);
    assert.ok(reach > 2, `${st.key}: reach ${reach}`);
    const card = w.room.rules.basic(mage);
    assert.equal(card.form, st.key); assert.equal(card.reach, Math.round(reach * 10) / 10); assert.equal(card.desc, wand.attackText);
    // a target just inside the reach is hit
    const m = w.mob(0, Math.max(1.5, reach - 1));
    const hp0 = m.hp;
    const from = w.events.length;
    const r = w.room.intent(mage, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } });
    assert.ok(r.ok, `${st.key}: ${JSON.stringify(r)}`);
    w.steps(40);
    assert.ok(m.hp < hp0 || m.dead, `${st.key}: the target at ${Math.round(reach - 1)} m was damaged`);
    const ev = w.events.slice(from).find(e => e.type === 'cast' && e.slot === 0);
    assert.equal(ev.form, st.key, 'the cast event names the form for the client');
    // T14: the same attack from beyond its reach is refused, and nothing flies
    const w2 = world();
    const mage2 = w2.add('mage');
    withWeapon(w2, mage2, 'wand', { castStyle: st.key, attune: 'fire' });
    const far = w2.mob(0, reach + 6);
    const from2 = w2.events.length;
    const no = w2.room.intent(mage2, { t: 'cast', slot: 0, target: far.id, aim: { x: far.x, z: far.z } });
    assert.equal(no.ok, false); assert.equal(no.why, 'range', `${st.key}: ${JSON.stringify(no)}`);
    w2.steps(30);
    assert.equal(far.hp, far.hpMax, 'nothing hit it');
    assert.ok(!w2.events.slice(from2).some(e => e.type === 'cast' || (e.type === 'fx' && (e.kind === 'bolt' || e.kind === 'attack'))), 'nothing was fired');
  }
  assert.deepEqual([...forms].sort(), ['area', 'beam', 'cone', 'fork', 'projectile', 'shield'], 'all six of F\'s forms are covered');
});

test('T15: the numbers on a wand card are the numbers of the attack (cone length, beam length, ring size)', () => {
  const S = engine.casterForms.styles;
  const hits = (style, dx, dz) => {
    const w = world();
    const mage = w.add('mage');
    withWeapon(w, mage, 'wand', { castStyle: style, attune: 'ice' });
    const front = w.mob(0, 3);                    // faced: the cast turns the mage to its target
    const probe = w.mob(dx, dz);
    w.room.intent(mage, { t: 'cast', slot: 0, target: front.id, aim: { x: front.x, z: front.z } });
    w.steps(30);
    return probe.hp < probe.hpMax;
  };
  assert.ok(hits('cone', 0, S.cone.range - 1), 'cone: inside its length');
  assert.ok(!hits('cone', 0, S.cone.range + 3), 'cone: not past it');
  assert.ok(!hits('cone', 6, 3), 'cone: not out to the side');
  assert.ok(hits('beam', 0, S.beam.range - 1), 'beam: everything along it');
  assert.ok(!hits('beam', 0, S.beam.range + 3), 'beam: not past its end');
  assert.ok(!hits('beam', 4, 9), 'beam: not beside it');
  assert.ok(hits('nova', -3, -2.5), 'ring: behind you too');
  assert.ok(!hits('nova', 0, S.nova.radius + 3), 'ring: not outside it');
});

test('T15: fork splits onto a second enemy; ward shields the caster up to its cap; pool leaves ground that keeps striking', () => {
  const S = engine.casterForms.styles;
  { // fork
    const w = world();
    const mage = w.add('mage');
    withWeapon(w, mage, 'wand', { castStyle: 'fork', attune: 'lightning' });
    const a = w.mob(0, 12), b = w.mob(4, 14);
    w.room.intent(mage, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } });
    w.steps(30);
    assert.ok(a.hp < a.hpMax && b.hp < b.hpMax, 'the bolt and a shard');
    const ev = w.events.find(e => e.type === 'fx' && e.kind === 'chain');
    assert.ok(ev && ev.fork === 1 && ev.first === a.id, 'a fork says where it went');
    assert.deepEqual(ev.targets, [b.id]);
  }
  { // ward
    const w = world();
    const mage = w.add('mage');
    withWeapon(w, mage, 'wand', { castStyle: 'ward', attune: 'arcane' });
    const a = w.mob(0, 10, { level: 30 });
    a.r.unit.maxHp = a.r.unit.hp = 1e6;
    const u = mage.r.unit;
    for (let i = 0; i < 12; i++) { u.swing.mainReady = 0; w.room.intent(mage, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } }); w.steps(12); }
    assert.equal(u.barrier, Math.round(u.maxHp * S.ward.ward.cap), 'the barrier built up to exactly its cap');
  }
  { // pool
    const w = world();
    const mage = w.add('mage');
    withWeapon(w, mage, 'wand', { castStyle: 'pool', attune: 'fire' });
    const a = w.mob(0, 10);
    a.r.unit.maxHp = a.r.unit.hp = 1e6;
    const from = w.events.length;
    w.room.intent(mage, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } });
    w.steps(12);
    const after = a.r.unit.hp;
    assert.ok(w.events.slice(from).some(e => e.type === 'fx' && e.kind === 'pool'), 'ground was left');
    w.steps(40);
    assert.ok(a.r.unit.hp < after, 'and it kept striking');
  }
});

test('T15: staves — Thousandvale\'s lance and aegis ring, and Arc Lash chains on a tap as its card says', () => {
  { // lance
    const w = world();
    const mage = w.add('mage');
    const staff = withWeapon(w, mage, 'staff', { castStyle: 'beam', attune: 'ice' });
    assert.match(staff.attackText, /lance of ice 16 m long/);
    assert.equal(w.room.rules.attackRange(mage), 16);
    const a = w.mob(0, 6), b = w.mob(0, 13);
    w.room.intent(mage, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } });
    w.steps(6);
    assert.ok(a.hp < a.hpMax && b.hp < b.hpMax, 'everything along the lance');
  }
  { // aegis ring shields the caster and the friend beside them
    const w = world();
    const mage = w.add('mage'), friend = w.add('warrior', 2, 0);
    const staff = withWeapon(w, mage, 'staff', { castStyle: 'ward', attune: 'arcane' });
    assert.match(staff.attackText, /every ally inside it/);
    const a = w.mob(0, 3);
    w.room.intent(mage, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } });
    w.steps(4);
    assert.ok(mage.r.unit.barrier > 0 && friend.r.unit.barrier > 0, 'both are shielded');
  }
  { // Arc Lash
    const w = world();
    const mage = w.add('mage');
    const staff = withWeapon(w, mage, 'staff', { attune: 'lightning', staffSpell: 'arc' });
    assert.match(staff.attackText, /jumps up to 3 more times, each time to the nearest other enemy within 8 m, at 65%/);
    const a = w.mob(0, 9), b = w.mob(3, 11);
    for (const x of [a, b]) x.r.unit.maxHp = x.r.unit.hp = 1e6;
    const from = w.events.length;
    w.room.intent(mage, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } });
    w.steps(40);
    assert.ok(b.r.unit.hp < 1e6, 'it jumped to the second enemy');
    const bolts = w.events.slice(from).filter(e => e.type === 'fx' && e.kind === 'bolt');
    assert.equal(bolts.length, 4, 'the bolt and three jumps');
    // D-world's ask: the chain event names the bodies it really jumped to, in order, and each hop says where it came from
    const chain = w.events.slice(from).filter(e => e.type === 'fx' && e.kind === 'chain');
    assert.equal(chain.length, 1);
    assert.equal(chain[0].first, a.id);
    assert.deepEqual(chain[0].targets, [b.id, a.id, b.id], 'a -> b -> a -> b: exactly what was struck');
    assert.deepEqual(bolts.slice(1).map(e => [e.hop, e.fromId, e.to]), [[1, a.id, b.id], [2, b.id, a.id], [3, a.id, b.id]]);
  }
});

test('T14: a short staff cone answers its real reach (not a bolt\'s), and a bow / a plain wand theirs', () => {
  const w = world();
  const mage = w.add('mage');
  withWeapon(w, mage, 'staff', { attune: 'fire', staffSpell: 'cone' });
  assert.equal(w.room.rules.attackRange(mage), 9, 'Flame Cone reaches 9 m');
  const far = w.mob(0, 20);
  assert.equal(w.room.intent(mage, { t: 'cast', slot: 0, target: far.id }).why, 'range', 'so 20 m is refused, not fired at');
  withWeapon(w, mage, 'staff', { attune: 'ice', staffSpell: 'nova' });
  assert.ok(Math.abs(w.room.rules.attackRange(mage) - 6 * engine.casterForms.novaReach) < 0.01, 'a nova: inside its own ring');
  const ranger = w.add('ranger');
  assert.ok(w.room.rules.attackRange(ranger) > 30, 'a bow');
  const warrior = w.add('warrior');
  assert.equal(w.room.rules.attackRange(warrior), null, 'melee = null (the client\'s own melee reach)');
  assert.equal(w.room.intent(warrior, { t: 'cast', slot: 0, target: far.id }).ok, true, 'a melee swing is never refused for range');
});

test('T15: off-hand focuses add their rider — Burst, Ward, Siphon, Echo — and an off-hand wand fires its own bolt', () => {
  const R = engine.casterForms.riders;
  const setup = (offBase, patch = {}) => {
    const w = world();
    const mage = w.add('sorcerer');
    withWeapon(w, mage, 'wand', { castStyle: 'bolt', attune: 'arcane' });
    const off = withWeapon(w, mage, offBase, patch, 'offhand');
    const a = w.mob(0, 10), b = w.mob(1.5, 11);
    for (const x of [a, b]) x.r.unit.maxHp = x.r.unit.hp = 1e6;
    const swing = n => { for (let i = 0; i < n; i++) { mage.r.unit.swing.mainReady = 0; w.room.intent(mage, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } }); w.steps(14); } };
    return { w, mage, off, a, b, swing };
  };
  { const s = setup('orb'); assert.equal(s.off.focusRider, 'burst'); assert.match(s.off.focusText, /bursts 2.5 m around the first enemy struck for 35%/);
    const from = s.w.events.length; s.swing(1);
    assert.ok(s.w.events.slice(from).some(e => e.type === 'fx' && e.kind === 'rider' && e.rider === 'burst'), 'burst rider fired');
    assert.match(s.w.room.rules.basic(s.mage).desc, /also bursts/); }
  { const s = setup('warded_focus'); assert.equal(s.off.focusRider, 'ward'); s.swing(1);
    assert.equal(s.mage.r.unit.barrier > 0, true, 'a ward focus shields'); }
  { const s = setup('reliquary'); assert.equal(s.off.focusRider, 'siphon');
    s.mage.r.unit.mp = 10; s.swing(1);
    assert.ok(s.mage.r.unit.mp >= 10 + R.siphon.mana, 'a siphon focus gives mana'); }
  { const s = setup('grimoire'); assert.equal(s.off.focusRider, 'echo');      // (owner feedback 10: a tome is a main-hand weapon; Echo is the grimoire's)
    const from = s.w.events.length; s.swing(R.echo.every); s.w.steps(12);      // owner feedback 8: a bolt takes longer to arrive, and the echo follows the hit
    const echoes = s.w.events.slice(from).filter(e => e.type === 'fx' && e.kind === 'rider' && e.rider === 'echo');
    assert.equal(echoes.length, 1, `every ${R.echo.every}th attack repeats (${echoes.length} echoes for ${R.echo.every} attacks)`); }
  { const s = setup('wand', { castStyle: 'bolt', attune: 'fire' });
    const from = s.w.events.length; s.swing(1); s.w.steps(10);
    const casts = s.w.events.slice(from).filter(e => e.type === 'cast' && e.slot === 0);
    assert.ok(casts.some(e => e.hand === 'off'), 'the off-hand wand fired');
    assert.equal(s.w.room.rules.basic(s.mage).hands, 2); }
});

test('T16: a sceptre swings in melee with its element, never throws a bolt, and says so', () => {
  const w = world();
  const cleric = w.add('cleric');
  const sc = withWeapon(w, cleric, 'scepter', { attune: 'fire' });
  assert.equal(sc.castForm, 'melee');
  assert.match(sc.attackText, /melee swing.*deals fire damage instead of physical.*never throws a bolt/);
  assert.equal(w.room.rules.attackRange(cleric), null, 'melee reach');
  const a = w.mob(0, 2.2);
  const from = w.events.length;
  assert.ok(w.room.intent(cleric, { t: 'cast', slot: 0, target: a.id, aim: { x: a.x, z: a.z } }).ok);
  w.steps(20);
  const evs = w.events.slice(from);
  const cast = evs.find(e => e.type === 'cast' && e.slot === 0);
  assert.equal(cast.wk, 'melee'); assert.equal(cast.wt, 'scepter'); assert.equal(cast.el, 'fire'); assert.equal(cast.imbue, 1);
  assert.ok(evs.some(e => e.type === 'fx' && e.kind === 'attack' && e.shape === 'swing' && e.imbue === 1 && e.el === 'fire'), 'the swing carries the element for the trail');
  assert.ok(!evs.some(e => e.type === 'fx' && e.kind === 'bolt'), 'no bolt');
  const hit = evs.find(e => e.type === 'hit' && e.d === a.id && e.kind === 'dmg');
  assert.equal(hit?.el, 'fire', 'the damage is fire');
  assert.ok(a.r.unit.statuses.burn, 'and it leaves Burning, as the card says');
});

// ============================================================================ T7 — two two-handers

test('T7: Doubled Grasp — a second two-hander is refused without it, goes on with it, survives a save, and both swing', () => {
  const w = world();
  const war = w.add('warrior', 0, 0, { level: 40 });
  const u = war.r.unit;
  const gs = () => attuneWeapon(engine.rpg.loot.generate('greatsword', 'normal', 'medium', { rng: makeRng(Math.round(u.x * 7 + (u.equipment.weapon ? 3 : 1))) }));
  const a = gs();
  assert.ok(w.room.rules.equip(war, a, 'weapon').ok);
  const b = gs();
  const no = w.room.rules.equip(war, b, 'offhand');
  assert.equal(no.ok, false);
  assert.match(no.text, /both hands/);
  assert.equal(w.room.rules.canEquip(war, b, 'offhand').ok, false);
  // take the cornerstone
  u.perks = []; u.bonusPerks = 60;
  const forest = engine.forest;
  const key = [...forest.byId.values()].find(n => n.flag === 'doubleGrip');
  assert.ok(key, 'the forest has Doubled Grasp');
  // walk the forest to it (cheapest: take whatever connects until it does)
  let guard = 0;
  while (!u.perks.includes(key.id) && guard++ < 400) {
    if (w.room.rules.takePerk(war, key.id).ok) break;
    const path = pathTo(forest, u.perks, key.id);
    assert.ok(path.length, 'a path to Doubled Grasp');
    assert.ok(w.room.rules.takePerk(war, path[0]).ok, `take ${path[0]}`);
  }
  assert.ok(w.room.rules.perks(war).flags.includes('doubleGrip'), 'the sheet flag A reads for you.dual2h');
  assert.equal(w.room.rules.canEquip(war, b, 'offhand').ok, true);
  const yes = w.room.rules.equip(war, b, 'offhand');
  assert.ok(yes.ok, yes.text);
  assert.equal(u.equipment.weapon, a); assert.equal(u.equipment.offhand, b);
  // a save and a fresh login keep both (the perk is restored AFTER the gear, which used to drop the off hand)
  const saved = { equipment: w.room.rules.saveGear(war), build: w.room.rules.saveBuild(war) };
  const w2 = world();
  const again = w2.room.addPlayer({ id: 77, name: 'Again', cls: 'warrior', level: 40, xp: 0, gold: 0, room: 'x', x: SX, z: SZ, equipment: saved.equipment, build: saved.build }, null);
  const u2 = again.r.unit;
  assert.ok(u2.equipment.weapon?.twoHanded && u2.equipment.offhand?.twoHanded, 'both two-handers are still worn after a login');
  assert.equal(u2.bag.length, 0, 'and nothing fell into a bag nobody reads');
  // both swing: main, then the off hand half a beat later
  const m = w2.mob(0, 2.5);
  m.r.unit.maxHp = m.r.unit.hp = 1e6;
  const from = w2.events.length;
  assert.ok(w2.room.intent(again, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } }).ok);
  w2.steps(30);
  const casts = w2.events.slice(from).filter(e => e.type === 'cast' && e.slot === 0);
  assert.ok(casts.some(e => !e.hand && e.two === 1), 'the main two-hander swung');
  assert.ok(casts.some(e => e.hand === 'off' && e.two === 1), 'and the off-hand two-hander swung');
  const offHits = w2.events.slice(from).filter(e => e.type === 'fx' && e.kind === 'attack' && e.hand === 'off');
  assert.ok(offHits.length >= 1, 'its swing landed');
  assert.equal(w2.room.rules.basic(again).hands, 2);
});

/** Breadth-first path of node ids from what is taken (or the start) to `goal`. */
function pathTo(forest, taken, goal) {
  const have = new Set(['start', ...taken]);
  const adj = new Map();
  for (const [a, b] of forest.links || []) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const prev = new Map(); const q = [...have];
  for (const s of have) prev.set(s, null);
  while (q.length) {
    const cur = q.shift();
    if (cur === goal) break;
    for (const nx of adj.get(cur) || []) if (!prev.has(nx)) { prev.set(nx, cur); q.push(nx); }
  }
  if (!prev.has(goal)) return [];
  const out = [];
  for (let c = goal; c && !have.has(c); c = prev.get(c)) out.unshift(c);
  return out;
}

test('T7: dual one-handers alternate hands — the off hand swings on its own clock for its share', () => {
  const w = world();
  const rogue = w.add('rogue');
  const u = rogue.r.unit;
  assert.ok(u.equipment.weapon && u.equipment.offhand?.type === 'weapon', 'a rogue starts with a dagger in each hand');
  const m = w.mob(0, 2);
  m.r.unit.maxHp = m.r.unit.hp = 1e6;
  const from = w.events.length;
  for (let i = 0; i < 6; i++) { w.room.intent(rogue, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } }); w.steps(8); }
  const casts = w.events.slice(from).filter(e => e.type === 'cast' && e.slot === 0);
  const main = casts.filter(e => !e.hand).length, off = casts.filter(e => e.hand === 'off').length;
  assert.ok(main >= 3 && off >= 3, `both hands swing (main ${main}, off ${off})`);
  const order = casts.map(e => (e.hand === 'off' ? 'o' : 'm')).join('');
  assert.ok(/mo/.test(order) && /om/.test(order), `they alternate (${order})`);
});
