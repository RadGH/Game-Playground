// Play-test 5 T12 (stream E): "no indication of what the event was, what to do, how long it lasts or what the reward
// is". EVERY event — realm, zone, road chest, road quest, and the kinds the server starts from code — carries an
// `info` block the tracker can show: a name, one sentence of what is happening, an objective the server can count,
// a duration, both result lines and a reward preview that promises nothing the reward does not hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, stagesOf } from '../../tools/content-events.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const events = read('data/quests/events.json');
const road = read('data/provinces/road-events.json');
const wanderers = read('data/provinces/wanderers.json');

/** Every event in the game: [where it is from, the record, its own reward block, its kind]. */
function everyEvent() {
  const out = [];
  for (const e of events.realm) out.push(['realm ' + e.id, e, e.reward, 'runner']);
  for (const e of events.zone) out.push(['zone ' + e.id, e, e.reward, 'runner']);
  for (const c of road.chests) out.push(['road chest ' + c.id, c, { item: { tier: c.tier } }, 'chest']);
  for (const k of ['deliver', 'escort', 'rescue']) for (const s of road[k]) out.push([`road ${k} ${s.id}`, s, { xp: s.xp, gold: s.gold, item: typeof s.item === 'object' ? s.item : null }, k]);
  for (const [k, v] of Object.entries(road.coded || {})) out.push(['coded ' + k, v, {}, 'coded']);
  return out;
}
const ALL = everyEvent();
const RANK = { common: 0, normal: 0, uncommon: 1, magic: 1, rare: 2, epic: 3, legendary: 4 };
const BANNED = /muster|ember|veil/i;   // even inside a word ("remembers"), as tests/E/living.test.js
const oneSentence = s => typeof s === 'string' && /^[A-Z{].*[.!]$/.test(s) && !/[.!?]\s+\S/.test(s);

test('there are events of every kind to check', () => {
  assert.equal(events.realm.length, 4 + 1, 'Torbor Downs 4 + Vharlen\'s Ossathra (Expansion 1)');
  assert.equal(events.zone.length, 16 + 9, 'one per zone: Torbor Downs 16 + Vharlen 9');
  assert.ok(road.chests.length >= 7 && road.deliver.length && road.escort.length && road.rescue.length);
  assert.ok(road.coded && road.coded.ambush, 'the escort ambush (started from code) has a record');
});

test('every event says its name, what is happening, what to do, how long, and what it pays', () => {
  for (const [where, rec] of ALL) {
    const i = rec.info;
    assert.ok(i && typeof i === 'object', `${where}: no info block`);
    assert.ok(i.name && typeof i.name === 'string', `${where}: no name`);
    assert.ok(oneSentence(i.what), `${where}: "what" must be exactly one sentence — ${JSON.stringify(i.what)}`);
    assert.ok(i.objective && typeof i.objective.text === 'string' && i.objective.text.length > 8, `${where}: no objective text`);
    assert.ok(/^[A-Z]/.test(i.objective.text) && !/[.]$/.test(i.objective.text), `${where}: objective is an instruction, verb first, no full stop`);
    assert.ok(Number.isInteger(i.objective.count) && i.objective.count >= 1, `${where}: objective.count the server can count`);
    assert.ok(i.objective.kind && i.objective.unit, `${where}: objective kind + unit`);
    assert.ok(Number.isFinite(i.durationSec) && i.durationSec > 0, `${where}: durationSec`);
    assert.ok(oneSentence(i.onSuccess), `${where}: onSuccess result line`);
    assert.ok(oneSentence(i.onFail), `${where}: onFail result line`);
    assert.notEqual(i.onSuccess, i.onFail, `${where}: the two result lines differ`);
    assert.ok(i.rewardText && i.rewardText.length > 8, `${where}: rewardText`);
  }
});

test('the numbers come from the record: stages = waves + the boss, seconds = minutes x 60', () => {
  for (const e of [...events.realm, ...events.zone]) {
    const waves = (e.waves || []).length;
    assert.equal(e.info.objective.count, waves ? waves + 1 : 1, `${e.id}: objective.count`);
    assert.equal(e.info.objective.count, waves ? stagesOf(e) : 1);
    assert.equal(e.info.objective.kind, waves ? 'waves_boss' : 'boss', e.id);
    assert.equal(e.info.durationSec, e.durationMinutes * 60, `${e.id}: durationSec`);
    assert.equal(e.info.name, e.name, `${e.id}: info.name is the event's name`);
  }
  for (const e of events.zone) assert.equal(e.info.objective.count, e.waves.length + (e.boss ? 1 : 0), e.id);
  for (const c of road.chests) assert.equal(c.info.durationSec, road.rules.lifeSec, `${c.id}: a chest lasts rules.lifeSec`);
  for (const k of ['deliver', 'escort', 'rescue']) for (const s of road[k]) assert.ok(s.info.durationSec > road.rules.lifeSec, `${s.id}: a walk gets longer than a chest`);
});

test('a chest with guards says to deal with them first', () => {
  for (const c of road.chests) {
    const guarded = (c.guards || [0, 0])[1] > 0;
    assert.equal(/then|guard/i.test(c.info.objective.text), guarded, `${c.id}: guards ${JSON.stringify(c.guards)} vs "${c.info.objective.text}"`);
  }
});

test('slots in the text are ones the server fills', () => {
  const ok = { chest: [], deliver: ['npc', 'town', 'role', 'name'], escort: ['name', 'town'], rescue: ['name', 'town', 'guards'], coded: ['name', 'town'], runner: [] };
  for (const [where, rec, , kind] of ALL) {
    const i = rec.info;
    for (const s of [i.name, i.what, i.objective.text, i.onSuccess, i.onFail, i.rewardText]) for (const m of s.matchAll(/\{(\w+)\}/g)) assert.ok(ok[kind].includes(m[1]), `${where}: {${m[1]}} is not a slot of a ${kind} event`);
  }
});

test('the reward preview promises no rarity the reward does not hold, and nothing it does not pay', () => {
  for (const [where, rec, rw, kind] of ALL) {
    const t = rec.info.rewardText.toLowerCase();
    // a runner event guarantees a rare (js/sim/events.js eventReward); otherwise only what the block names
    let top = kind === 'runner' ? RANK.rare : -1;
    const see = it => { if (it && it.tier) top = Math.max(top, RANK[it.tier]); };
    see(rw && rw.item); see(rw && rw.firstKillDaily && rw.firstKillDaily.item);
    for (const [word, rank] of Object.entries(RANK)) if (new RegExp(`\\b${word}\\b`).test(t)) assert.ok(rank <= top, `${where}: rewardText says "${word}" but the reward tops out at rank ${top}`);
    if (/\bgold\b/.test(t)) assert.ok(rw && rw.gold > 0, `${where}: promises gold`);
    if (/experience/.test(t)) assert.ok(rw && rw.xp > 0, `${where}: promises experience`);
    if (rw && rw.gold > 0) assert.ok(/\bgold\b/.test(t), `${where}: pays gold and does not say so`);
    if (rw && rw.xp > 0) assert.ok(/experience/.test(t), `${where}: pays experience and does not say so`);
  }
});

test('a wanderer that offers something offers an event that has info', () => {
  for (const [id, k] of Object.entries(wanderers.kinds)) {
    if (!k.offers) continue;
    // W5 (owner feedback 8): a cart for hire offers a ride — its rules are data/provinces/carts.json `roaming`, not a road event
    if (k.offers === 'cart') { const C = JSON.parse(readFileSync(new URL('../../data/provinces/carts.json', import.meta.url), 'utf8')); assert.equal(C.roaming.kind, id); assert.ok(k.vehicle === 'ox_cart' && k.stopNear >= C.rules.flagDownM); continue; }
    assert.ok(Array.isArray(road[k.offers]) && road[k.offers].length, `${id}: offers "${k.offers}", which road-events.json does not have`);
    for (const s of road[k.offers]) assert.ok(s.info, `${id} -> ${k.offers} ${s.id}`);
  }
});

test('no banned words, and no two events share their sentence', () => {
  const seen = new Map();
  for (const [where, rec] of ALL) {
    const i = rec.info;
    for (const s of [i.name, i.what, i.objective.text, i.onSuccess, i.onFail, i.rewardText]) assert.ok(!BANNED.test(s), `${where}: banned word in ${JSON.stringify(s)}`);
    assert.ok(!seen.has(i.what), `${where} repeats the sentence of ${seen.get(i.what)}`);
    seen.set(i.what, where);
  }
});

test('the files are what tools/content-events.mjs writes (run it after adding an event)', () => {
  const out = build();
  assert.equal(readFileSync(new URL('data/quests/events.json', ROOT), 'utf8'), out.events, 'data/quests/events.json is stale: node tools/content-events.mjs');
  assert.equal(readFileSync(new URL('data/provinces/road-events.json', ROOT), 'utf8'), out.road, 'data/provinces/road-events.json is stale: node tools/content-events.mjs');
});
