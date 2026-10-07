// Stream D-UI — play-test 5 logic (no browser): tests/D/pt5.spec.js drives the windows themselves.
//   T5 kits · T7 the off-hand rule · T9 crate cards · T11 inside an event · T12 the tracker's lines and the result line
//   T18 sheet numbers, the up/down change · T19 the log ring and what a bug report sends · T20 bag room · T25 tug, Catch tab, cooking
// Plus two source checks: nothing new prints a raw float, and every new stylesheet rule lives in a .css file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  crateLines, crateRewardText, crateRewards, isCrate, isGift, rarityWord, normaliseKits, kitGear, kitTotals, itemFacts, hasDual2h, offhandRefusal,
  inEvent, mergeEvent, eventLines, eventResult, mmss, rowText, sheetDiff, basicSheet, createLogRing, feedbackCheck, feedbackCtx, feedbackPreview, FEEDBACK_MAX,
  bagRoom, tugParams, tugStart, tugStep, tugHeld, tugTension, catchRows, anglingText, cookRows,
} from '../../js/client/ui/pt5-core.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const src = p => readFileSync(join(ROOT, p), 'utf8');
const BAD_NUMBER = /\d\.\d{3,}|NaN|undefined|\[object/;

test('T9: a crate card says what it opens into and the lowest rarity, in the item card\'s own words', () => {
  const boots = crateLines({ kind: 'crate', crate: { slot: 'feet', min: 'uncommon' } });
  assert.equal(boots.kind, 'Crate');
  assert.equal(boots.opens, 'Opens into boots.');
  assert.match(boots.rarity, /^Magic at the least/);                       // quests say uncommon, items say Magic
  const w = crateLines({ id: 'crate', type: 'crate', crate: { type: 'weapon', minRarity: 'rare', forClass: true } });
  assert.match(w.opens, /a weapon your calling can use/);
  assert.match(w.rarity, /^Rare at the least/);
  const gift = crateLines({ kind: 'gift', gift: { minRarity: 'rare' } });
  assert.equal(gift.kind, 'Gift');
  assert.match(gift.how, /unwrap/);
  assert.match(crateLines({ kind: 'crate', crate: { slot: 'any', min: 'common' } }).rarity, /Any rarity/);
  assert.ok(isCrate({ crate: {} }) && isCrate({ kind: 'gift' }) && isGift({ gift: {} }) && !isCrate({ kind: 'potion' }));
  assert.equal(crateRewardText({ slot: 'feet', min: 'uncommon' }), 'Crate: boots (Magic or better)');
  assert.deepEqual(crateRewards({ crates: [{ slot: 'weapon', min: 'common' }, { slot: 'ring', min: 'rare' }] }), ['Crate: weapon (Common or better)', 'Crate: ring (Rare or better)']);
  assert.deepEqual(crateRewards({ gold: 5 }), []);
  assert.equal(rarityWord('uncommon'), 'Magic');
});

test('T5: kits are tidied whatever shape they arrive in, and a choice becomes the gear on the figure', () => {
  const raw = { cls: 'warrior',
    armour: [{ id: 'mail', name: 'Chain', blurb: 'Heavy.', items: [{ name: 'Coif', slot: 'head', armor: 3 }, { name: 'Hauberk', slot: 'chest', armor: 6 }] }, { id: 'hide', name: 'Hide', items: [] }, { id: 'pad', name: 'Padded', items: [] }],
    weapons: [{ id: 'sb', name: 'Sword and shield', items: [{ name: 'Short Sword', type: 'weapon', dmg: [3, 6] }, { name: 'Buckler', slot: 'offhand', armor: 2 }] },
      { id: 'dual', name: 'Two blades', items: [{ name: 'Hatchet', type: 'weapon', dmg: [2, 5] }, { name: 'Dirk', type: 'weapon', dmg: [2, 4] }] },
      { id: '2h', name: 'Greatsword', items: [{ name: 'Old Greatsword', type: 'weapon', twoHanded: true, dmg: [6, 11], attackSpeed: 'slow' }] }] };
  const k = normaliseKits(raw);
  assert.equal(k.armour.length, 3); assert.equal(k.weapons.length, 3);
  const g = kitGear(k.armour[0], k.weapons[0]);
  assert.deepEqual(Object.keys(g).sort(), ['chest', 'head', 'offhand', 'weapon']);
  assert.equal(kitGear(null, k.weapons[1]).offhand.name, 'Dirk', 'a pack\'s second weapon goes in the off hand');
  assert.equal(kitGear(null, k.weapons[2]).offhand, undefined);
  assert.deepEqual(kitTotals(g), { armour: 11, dmg: [3, 6] });
  assert.equal(itemFacts(k.weapons[2].items[0]), '6–11 damage · two-handed · slow attacks');
  assert.equal(itemFacts({ armor: 3.0000001 }), '3 armour');
  // an object map instead of lists, `desc` instead of `blurb`
  const k2 = normaliseKits({ armor: { a: { name: 'A', desc: 'x', items: { head: { slot: 'head' } } } }, packs: [{ key: 'p', items: [] }] });
  assert.equal(k2.armour[0].id, 'a'); assert.equal(k2.armour[0].blurb, 'x'); assert.equal(k2.armour[0].items.length, 1); assert.equal(k2.weapons[0].id, 'p');
  assert.deepEqual(normaliseKits(null), { armour: [], weapons: [] });
});

test('T7: a second two-hander goes in the off hand only with Doubled Grasp, and the refusal says why', () => {
  const maul = { type: 'weapon', twoHanded: true, name: 'Maul' }, gs = { type: 'weapon', twoHanded: true, name: 'Greatsword' }, sword = { type: 'weapon', name: 'Sword', offHandOk: true };
  assert.match(offhandRefusal(maul, { weapon: gs }, { dual2h: false }), /Doubled Grasp/);
  assert.equal(offhandRefusal(maul, { weapon: gs }, { dual2h: true }), null);
  assert.match(offhandRefusal(maul, { weapon: sword }, { dual2h: true }), /EACH hand/);
  assert.match(offhandRefusal(maul, {}, { dual2h: true }), /main hand first/);
  assert.equal(offhandRefusal(sword, { weapon: sword }), null);
  assert.match(offhandRefusal(sword, { weapon: gs }), /needs both hands/);
  assert.match(offhandRefusal({ type: 'weapon', name: 'Bow', ranged: true }, {}), /main hand/);
  assert.equal(offhandRefusal({ slot: 'offhand', name: 'Shield' }, { weapon: sword }), null);
  assert.match(offhandRefusal({ slot: 'offhand', name: 'Shield' }, { weapon: gs }), /both hands/);
  assert.equal(offhandRefusal({ slot: 'offhand', name: 'Quiver', baseKey: 'quiver' }, { weapon: { twoHanded: true, name: 'Bow' } }), null);
  assert.ok(hasDual2h({ dual2h: true }));
  assert.ok(hasDual2h({ perks: ['might:key:doubled_grasp'] }));
  assert.ok(hasDual2h({ perks: { taken: ['a:1:0', 'might:key:doubled_grasp'] } }));
  assert.ok(!hasDual2h({ perks: ['might:key:flurry'] }) && !hasDual2h(null));
});

test('T11: you are inside an event by the server\'s flag, else by the distance to its ring', () => {
  assert.equal(inEvent({ inRange: true, x: 0, z: 0, r: 10 }, { x: 900, z: 0 }), true);
  assert.equal(inEvent({ inside: false, x: 0, z: 0, r: 10 }, { x: 1, z: 0 }), false);
  assert.equal(inEvent({ x: 0, z: 0, r: 40 }, { x: 30, z: 20 }), true);
  assert.equal(inEvent({ x: 0, z: 0, r: 40 }, { x: 300, z: 0 }), false);
  assert.equal(inEvent({ name: 'x' }, { x: 0, z: 0 }), false);
});

test('T12: a tracker card carries name, what, objective + progress, time left and reward — and a bare frame never wipes them', () => {
  const now = 1_000_000;
  let e = mergeEvent(null, { uid: 'u1', id: 'wolves', name: 'Wolves at the Ford', info: { what: 'A pack is crossing the ford.', objective: { kind: 'waves_boss', text: 'Defeat the waves, then the pack leader', count: 4, unit: 'stages' }, durationSec: 600, rewardText: 'Event cache: a rare item or better' }, x: 0, z: 0, r: 40 }, { state: 'live', now, scope: 'zone' });
  let L = eventLines(e, { now, me: { x: 5, z: 5 } });
  assert.equal(L.name, 'Wolves at the Ford');
  assert.equal(L.what, 'A pack is crossing the ford.');
  assert.equal(L.objective.text, 'Defeat the waves, then the pack leader');
  assert.equal(L.objective.count, '0 / 4 stages');
  assert.equal(L.time, '10:00 left');
  assert.equal(L.reward, 'Event cache: a rare item or better');
  assert.equal(L.head, 'You are in it'); assert.equal(L.inside, true);
  // progress frames: only what they carry changes
  e = mergeEvent(e, { uid: 'u1', n: 2, of: 4, players: 3 }, { state: 'live', now: now + 5000 });
  L = eventLines(e, { now: now + 5000, me: { x: 5, z: 5 } });
  assert.equal(L.objective.count, '2 / 4 stages'); assert.equal(L.objective.frac, 0.5);
  assert.equal(L.what, 'A pack is crossing the ford.'); assert.equal(L.reward, 'Event cache: a rare item or better');
  assert.equal(L.time, '9:55 left'); assert.equal(L.players, '3 taking part');
  // A's eventTrack names
  const t = mergeEvent(null, { uid: 'u2', name: 'The Stone in the Snow', realm: true, state: 'live', what: 'Something wakes.', objective: { text: 'Break the stone', n: 1, of: 3, kind: 'kill' }, stage: { n: 2, of: 4, name: 'The second wave' }, leftMs: 29000, reward: { xp: 120, gold: 14, items: ['a rare item'] }, inside: false, x: 500, z: 0, r: 40 }, { now });
  const T = eventLines(t, { now, me: { x: 0, z: 0 } });
  assert.equal(T.scope, 'realm'); assert.equal(T.head, 'Nearby'); assert.equal(T.inside, false);
  assert.equal(T.stage, 'Stage 2 of 4 — The second wave');
  assert.equal(T.time, '0:29 left'); assert.equal(T.urgent, true);
  assert.equal(T.reward, '120 experience · 14 gold · a rare item');
  // waves only (an old server): still an objective
  const w = eventLines(mergeEvent(null, { uid: 'w', name: 'Raid', wave: 2, waves: 3 }, { state: 'live', now }), { now });
  assert.equal(w.objective.count, 'wave 2 of 3');
  // a countdown
  const s = eventLines(mergeEvent(null, { uid: 's', name: 'Raid', at: now + 42000 }, { state: 'soon', now }), { now });
  assert.equal(s.time, 'Starts in 0:42'); assert.equal(s.head, 'Coming');
  // what is DRAWN (the text fields — `frac` only sets a bar's width)
  for (const c of [L, T, w, s]) { const shown = [c.name, c.head, c.what, c.stage, c.objective?.text, c.objective?.count, c.time, c.reward, c.players, c.where].join(' | '); assert.ok(!BAD_NUMBER.test(shown), shown); }
  assert.equal(mmss(61000), '1:01'); assert.equal(mmss(-5), '0:00');
});

test('T12: every event ends with one result line — won or failed, and what you got', () => {
  const a = eventResult({ kind: 'end', won: true, ev: { name: 'Wolves at the Ford', info: { onSuccess: 'The ford is quiet again.' } }, result: { xp: 120.4, gold: 14, items: [{ name: 'Ashwood Bow', rarity: 'rare' }] } });
  assert.equal(a.won, true);
  assert.equal(a.text, 'Won: Wolves at the Ford. The ford is quiet again.');
  assert.equal(a.got, 'You got 120 experience, 14 gold, Ashwood Bow.');
  const b = eventResult({ kind: 'end', won: false, why: 'time', ev: { name: 'Wolves at the Ford' } });
  assert.equal(b.text, 'Failed: Wolves at the Ford. Time ran out.'); assert.equal(b.got, 'No reward this time.');
  const c = eventResult({ result: 'fail', name: 'Raid', xp: 10 });
  assert.equal(c.won, false); assert.match(c.got, /still got 10 experience/);
  const d = eventResult({ result: 'success', name: 'Raid', credited: false });
  assert.equal(d.won, true); assert.match(d.got, /did not take part/);
  assert.match(eventResult({ called: 'off', ev: { name: 'Raid' } }).text, /called off/);
  assert.match(eventResult({ result: 'success', name: 'Raid', onBody: 12 }).got, /on the body/);
});

test('T18: sheet numbers are rounded for people, and a change of gear shows up or down per row', () => {
  assert.equal(rowText({ value: 25.02000000000001 }), '25');
  assert.equal(rowText({ value: 6.4705882352 , unit: '/s' }), '6.47 / s');
  assert.equal(rowText({ value: 12.3456, unit: '%' }), '12.3%');
  assert.equal(rowText({ value: 3.25, unit: '%' }), '3.25%');
  assert.equal(rowText({ value: [4.2, 7.9] }), '4–8');
  assert.equal(rowText({ value: 1234.5 }), '1,235');
  assert.equal(rowText({ value: NaN }), '—');
  assert.equal(rowText({ text: 'Bare hands' }), 'Bare hands');
  const you = { level: 3, hpMax: 140.6, mpMax: 50 };
  const a = basicSheet(you, { weapon: { name: 'Sword', dmg: [4, 7], attackSpeed: 'fast' }, chest: { armor: 6, affixes: [{ stat: 'critChance', value: 0.02 }, { stat: 'cond_x', value: 3 }] } });
  const b = basicSheet(you, { weapon: { name: 'Axe', dmg: [6, 11], attackSpeed: 'slow' }, chest: { armor: 4 } });
  assert.deepEqual(a.core.map(r => r.id), ['level', 'hpMax', 'mpMax', 'armour', 'weapon', 'weaponDps']);
  assert.ok(a.core.every(r => r.tip && r.tip.length > 20), 'every number says how it is worked out');
  assert.equal(a.advanced.length, 1); assert.equal(rowText(a.advanced[0]), '2%');
  for (const r of [...a.core, ...a.advanced, ...b.core]) assert.ok(!BAD_NUMBER.test(rowText(r)), rowText(r));
  const d = sheetDiff(a, b);
  assert.equal(d.armour.dir, 'down'); assert.equal(d.armour.text, '−2');
  assert.equal(d.weapon.dir, 'up'); assert.equal(d.weapon.text, '+3');
  assert.ok(!d.level && !d.hpMax);
  // lower is better (a cooldown), and abilities by dps
  const s1 = { core: [{ id: 'gcd', value: 1.5, unit: 's', lowerIsBetter: true }], abilities: [{ id: 'cleave', slot: 1, dps: 12.5 }, { id: 'shout', slot: 2, dps: null, why: 'It deals no damage.' }] };
  const s2 = { core: [{ id: 'gcd', value: 1.2, unit: 's', lowerIsBetter: true }], abilities: [{ id: 'cleave', slot: 1, dps: 10 }, { id: 'shout', slot: 2, dps: null }] };
  const d2 = sheetDiff(s1, s2);
  assert.equal(d2.gcd.dir, 'up'); assert.equal(d2['ab:cleave'].dir, 'down'); assert.equal(d2['ab:cleave'].text, '−2.5'); assert.ok(!d2['ab:shout']);
  assert.deepEqual(sheetDiff(null, s2), {});
  assert.equal(basicSheet({ level: 1, hpMax: 60 }, {}).core.find(r => r.id === 'weapon').text, 'Bare hands');
});

test('T19: the log ring keeps the last lines, folds repeats, and a bug report sends only what the preview shows', () => {
  const ring = createLogRing(5, 20);
  for (let i = 0; i < 8; i++) ring.push('warn', 'line ' + i);
  assert.equal(ring.size, 5); assert.equal(ring.list()[0], '[warn] line 3');
  ring.push('error', 'boom'); ring.push('error', 'boom'); ring.push('error', 'boom');
  assert.equal(ring.list().at(-1), '[error] boom (x3)');
  ring.push('warn', 'x'.repeat(100)); assert.equal(ring.list().at(-1).length, '[warn] '.length + 20);
  ring.push('warn', '   '); assert.equal(ring.size, 5);
  assert.equal(feedbackCheck('bug', 'short').ok, false);
  assert.equal(feedbackCheck('other', 'long enough text here').ok, false);
  assert.equal(feedbackCheck('suggestion', 'More fish in the lakes please').ok, true);
  assert.equal(feedbackCheck('bug', 'x'.repeat(FEEDBACK_MAX + 1)).ok, false);
  const ctx = feedbackCtx({ char: 7, name: 'Wren', cls: 'ranger', level: 4, province: 'torbor_downs', zone: 'The Torbor Fields', room: 'wilds:1', x: 1024.6, z: 987.2, build: 'dev', quality: 'low', fps: 58.7, rtt: 31.4, screen: '1180x720', ua: 'UA ' + 'x'.repeat(300), token: 'secret', email: 'a@b.c' }, ring.list());
  assert.equal(ctx.x, 1025); assert.equal(ctx.fps, 59); assert.ok(ctx.ua.length <= 160);
  assert.ok(!('token' in ctx) && !('email' in ctx), 'nothing private is attached');
  assert.equal(ctx.log.length, 5);
  const p = feedbackPreview(ctx);
  assert.equal(p.lines[0], 'Character: Wren, level 4 Ranger');
  assert.match(p.lines[1], /The Torbor Fields · Torbor Downs · wilds:1 at 1025, 987/);
  assert.match(p.lines[2], /build dev · graphics low · 59 frames a second · 31 ms to the server · 1180x720/);
  assert.ok(!BAD_NUMBER.test(p.lines.join('\n')));
  assert.equal(Object.keys(feedbackCtx({}, [])).join(), 'log');
});

test('T20: taking a letter needs room in the bag, and the refusal has the numbers', () => {
  assert.equal(bagRoom(118, 2).ok, true);
  const r = bagRoom(119, [{}, {}, {}]);
  assert.equal(r.ok, false); assert.match(r.why, /room for 1 more, and this letter holds 3/);
  assert.match(bagRoom(120, 1).why, /Your bag is full. Make room for 1 item first/);
  assert.equal(bagRoom(10, 0).ok, true);
  assert.equal(bagRoom(40, 2, 40).ok, false);
});

test('T25: the tug — holding reels the float up, letting go sinks it; a steady hand lands it, a dropped line does not', () => {
  const seq = () => { let r = 7; return () => ((r = (r * 9301 + 49297) % 233280) / 233280); };
  const p = tugParams({ ms: 4000, band: 0.3, pull: 0.4, jitter: 0.4, need: 0.6 });
  // a player who steers toward the band
  let s = tugStart(p), rnd = seq();
  while (!s.done) tugStep(s, 1 / 60, s.pos < s.centre, rnd);
  assert.ok(tugHeld(s) > 0.75, 'steering keeps the float in the band: ' + tugHeld(s));
  assert.ok(Math.abs(s.t - 4) < 0.05);
  // a player who lets go
  s = tugStart(p); rnd = seq();
  while (!s.done) tugStep(s, 1 / 60, false, rnd);
  assert.ok(tugHeld(s) < 0.4, 'letting go loses it: ' + tugHeld(s));
  assert.equal(s.pos, 0);
  // a player who never lets go
  s = tugStart(p); rnd = seq();
  while (!s.done) tugStep(s, 1 / 60, true, rnd);
  assert.ok(tugHeld(s) < 0.5); assert.equal(s.pos, 1);
  // bounds and tension
  s = tugStart(p); for (let i = 0; i < 2000 && !s.done; i++) { tugStep(s, 0.016, i % 7 < 3, rnd); assert.ok(s.pos >= 0 && s.pos <= 1 && s.centre >= p.band / 2 - 1e-9 && s.centre <= 1 - p.band / 2 + 1e-9); assert.ok(tugTension(s) >= 0 && tugTension(s) <= 1); }
  // a harder fish (narrow band, more jitter) is harder for the same hands
  const hard = tugParams({ ms: 4000, band: 0.15, pull: 0.9, jitter: 1 });
  let e = 0, h = 0;
  for (let k = 0; k < 8; k++) { const r1 = seq(), r2 = seq(); let a = tugStart(p), b = tugStart(hard); while (!a.done) tugStep(a, 1 / 30, a.pos < a.centre - 0.02 * k, r1); while (!b.done) tugStep(b, 1 / 30, b.pos < b.centre - 0.02 * k, r2); e += tugHeld(a); h += tugHeld(b); }
  assert.ok(h < e, `the hard fish is harder (${h.toFixed(2)} < ${e.toFixed(2)})`);
  assert.deepEqual(tugParams({ ms: 99999, band: 5, need: 9 }), { ms: 12000, band: 0.6, pull: 0.4, jitter: 0.4, need: 1 });
});

test('T25: the Catch tab lists species by water or zone, hides what you have not caught, and counts legends', () => {
  const data = { fish: [
    { id: 'silver_perch', name: 'Silver Perch', desc: 'Common and quick.', water: ['river', 'lake'], bands: [1, 8], rarity: 'common' },
    { id: 'moon_eel', name: 'Moon Eel', water: ['marsh'], time: 'night', bands: [5, 12], rarity: 'rare', pool: true },
  ], legends: [{ id: 'old_grey', name: 'Old Grey', zone: 'z12_02', water: 'lake', skill: 20, title: 'the Patient' }] };
  const none = catchRows(data, {}, z => (z === 'z12_02' ? 'The Torbor Fields' : z));
  assert.equal(none.found, 0); assert.equal(none.total, 2);
  assert.deepEqual(none.groups.map(g => g.name), ['Rivers', 'Lakes', 'Marshes']);
  assert.equal(none.groups[0].rows[0].name, '???');
  assert.match(none.groups[2].rows[0].hint, /marshes · at night · level 5–12 lands · fish pools only/);
  assert.equal(none.legends[0].name, 'An unknown legend'); assert.match(none.legends[0].hint, /Somewhere in The Torbor Fields · lakes · angling 20/);
  const some = catchRows(data, { catches: { silver_perch: { n: 7, best: 31.449999, zone: 'z12_02' }, old_grey: { n: 1, best: 140 } }, legends: ['old_grey'] }, z => 'The Torbor Fields');
  assert.equal(some.found, 1); assert.equal(some.legendsFound, 1);
  const perch = some.groups[0].rows[0];
  assert.equal(perch.name, 'Silver Perch'); assert.equal(perch.n, 7); assert.equal(perch.bestText, '31.4 cm'); assert.equal(perch.where, 'The Torbor Fields');
  assert.equal(some.legends[0].name, 'Old Grey'); assert.equal(some.legends[0].title, 'the Patient');
  assert.equal(some.biggest.text, 'Old Grey, 140 cm');
  const shown = [...some.groups.flatMap(g => g.rows.flatMap(r => [r.name, r.bestText, r.hint, r.where])), ...some.legends.flatMap(l => [l.name, l.bestText, l.hint]), some.biggest.text].join(' | ');
  assert.ok(!BAD_NUMBER.test(shown), shown);
  const a = anglingText({ level: 12, xp: 30, next: 80 });
  assert.equal(a.text, 'Angling 12 / 100'); assert.equal(a.sub, '30 of 80 to the next point'); assert.equal(a.frac, 0.375);
  assert.equal(anglingText({ level: 100 }).frac, 1);
});

test('T25: a recipe says what it needs against what you carry, and why you cannot cook it', () => {
  const have = { silver_perch: 5, moon_eel: 0 };
  const rows = cookRows([
    { id: 'perch_skewer', name: 'Perch Skewer', needs: [{ fish: 'silver_perch', count: 2 }], makes: { name: 'Perch Skewer', text: 'Restores health over 20 s.' } },
    { id: 'eel_pie', name: 'Eel Pie', needs: [{ id: 'moon_eel', n: 1 }, { id: 'silver_perch', n: 1 }], skill: 1 },
    { id: 'feast', name: 'Feast', needs: [{ fish: 'silver_perch', count: 1 }], skill: 40 },
    { id: 'server', name: 'From A', needs: [{ id: 'silver_perch', name: 'Silver Perch', n: 3, have: 1 }], can: false },
  ], id => have[id] || 0, 10, { silver_perch: 'Silver Perch', moon_eel: 'Moon Eel' });
  assert.equal(rows[0].can, true); assert.equal(rows[0].times, 2); assert.equal(rows[0].needs[0].name, 'Silver Perch'); assert.equal(rows[0].text, 'Restores health over 20 s.');
  assert.equal(rows[1].can, false); assert.equal(rows[1].why, 'You lack 1 Moon Eel.');
  assert.equal(rows[2].can, false); assert.equal(rows[2].why, 'Needs angling 40.');
  assert.equal(rows[3].can, false); assert.equal(rows[3].needs[0].have, 1); assert.equal(rows[3].why, 'You lack 2 Silver Perch.');
});

test('source: the new screens keep their styles in css/pt5.css and never use a native title or inline <style>', () => {
  assert.ok(existsSync(join(ROOT, 'css/pt5.css')));
  assert.match(src('index.html'), /css\/pt5\.css/);
  for (const f of ['pt5.js', 'reveal.js', 'event-tracker.js', 'char-sheet.js', 'feedback.js', 'kit-step.js', 'angling.js']) {
    const s = src('js/client/ui/' + f);
    assert.ok(!/createElement\('style'\)|\.title\s*=|setAttribute\('title'/.test(s), f + ' sets a native title or a <style>');
    assert.ok(!/\bmuster\b|\bember|\bveil\b/i.test(s.replace(/travel-veil/g, '')), f + ' uses a banned word');
  }
  const main = src('js/client/main.js');
  assert.match(main, /createUi5\(/); assert.match(main, /ui5\.wire\(net\)/); assert.match(main, /ui5\.tick\(dt\)/);
  // the menu bar carries the two new buttons, and the help overlay lists their keys
  const mb = src('js/client/menubar.js');
  assert.match(mb, /id: 'sheet', key: 'V'/); assert.match(mb, /id: 'feedback'/);
});
