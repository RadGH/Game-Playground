// Stream D-UI — play-test 2 logic (no browser): tests/D/pt2.spec.js drives the windows themselves.
//   Q2 menu entries + follow rules · Q4 thresholds + roll lines · Q6 the banner hierarchy · Q11 prices · Q12 ring slot
//   Q14 trade states · Q15 settings cleaning · Q20/21 custom looks · Q22 gear shown · Q23 forest search · Q24 XP text
//   Q26 every perk node inside its own arm's area (on the REAL forest data)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  contextItems, followRefusal, followStep, findByName, needsRoll, rollLines, rollLeft, LOOT_TIERS, DEFAULT_THRESHOLD,
  bannerState, bannerPush, bannerTick, sellPrice, buyRefusal, wearSlot, tradeView, cleanSettings, SETTINGS_DEFAULTS, xpText, className, gearShown,
} from '../../js/client/ui/pt2-core.js';
import { cleanCustom, applyCustom, customFrom, customKey, lookWith, lookCustom } from '../../js/client/ui/appearance-core.js';
import { armSectors, inSector, searchForest } from '../../js/client/ui/talent-model.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('Q2: the menu offers the right things for each kind of body', () => {
  const ids = a => contextItems(a, { selfId: 1 }).map(x => x.id);
  assert.deepEqual(ids({ id: 2, kind: 'player', hostile: false, name: 'Aldra' }), ['target', 'follow', 'inspect', 'whisper', 'invite', 'trade', 'friend']);
  assert.deepEqual(ids({ id: 3, kind: 'npc', role: 'smith', name: 'Smith' }), ['target', 'talk', 'follow', 'inspect']);
  assert.deepEqual(ids({ id: 4, kind: 'monster', hostile: true, name: 'Wolf' }), ['target', 'attack', 'inspect']);
  assert.deepEqual(ids({ id: 5, kind: 'monster', hostile: true, dead: true, loot: true, name: 'Wolf' }), ['target', 'loot', 'inspect']);
  // a friend: Remove friend; in a party but not leading: no invite
  const f = contextItems({ id: 2, kind: 'player', name: 'Aldra' }, { selfId: 1, isFriend: true, inParty: true, leader: false }).map(x => x.id);
  assert.ok(f.includes('unfriend') && !f.includes('friend') && !f.includes('invite'));
  assert.ok(contextItems({ id: 2, kind: 'player', dead: true, name: 'A' }, { selfId: 1 }).find(x => x.id === 'trade').disabled);
});

test('Q2: /follow only allies and neutrals; the step stops inside the gap and gives up when far', () => {
  assert.equal(followRefusal({ id: 2, hostile: false, name: 'A' }, 1), null);
  assert.match(followRefusal({ id: 2, hostile: true, name: 'Wolf' }, 1), /enemy/);
  assert.match(followRefusal({ id: 1, hostile: false }, 1), /yourself/);
  assert.match(followRefusal({ id: 2, dead: true, name: 'A' }, 1), /cannot be followed/);
  assert.match(followRefusal(null, 1), /Nobody/);
  const s = followStep({ x: 0, z: 0 }, { x: 10, z: 0 });
  assert.equal(s.mx, 1); assert.equal(s.far, false);
  assert.deepEqual(followStep({ x: 0, z: 0 }, { x: 1, z: 1 }), { mx: 0, mz: 0, far: false });
  assert.equal(followStep({ x: 0, z: 0 }, { x: 100, z: 0 }).far, true);
  const list = [{ name: 'Aldra' }, { name: 'Brem' }];
  assert.equal(findByName(list, 'brem').name, 'Brem');
  assert.equal(findByName(list, 'ald').name, 'Aldra');
  assert.equal(findByName(list, 'zed'), null);
});

test('Q4: the threshold — default rare, can be lowered to magic; rolls read plainly in chat', () => {
  assert.equal(DEFAULT_THRESHOLD, 'rare');
  assert.equal(LOOT_TIERS[0].id, 'magic');
  assert.equal(needsRoll({ rarity: 'magic' }), false);
  assert.equal(needsRoll({ rarity: 'rare' }), true);
  assert.equal(needsRoll({ rarity: 'legendary' }), true);
  assert.equal(needsRoll({ rarity: 'magic' }, 'magic'), true);
  assert.equal(needsRoll({ rarity: 'normal' }, 'magic'), false);
  assert.equal(needsRoll({ setId: 'x', rarity: 'rare' }, 'legendary'), false);
  const lines = rollLines({ item: { name: 'Gilded Ring' }, results: [{ name: 'Aldra', choice: 'need', n: 87 }, { name: 'Brem', choice: 'skip' }], winner: { name: 'Aldra' } });
  assert.deepEqual(lines, ['Need: Aldra rolled 87 for Gilded Ring.', 'Brem skipped Gilded Ring.', 'Aldra won Gilded Ring.']);
  assert.match(rollLines({ item: { name: 'X' }, results: [], winner: null }).at(-1), /stays on the body/);
  assert.equal(rollLeft({ at: 0, ms: 30000 }, 10000), 20);
  assert.equal(rollLeft({ at: 0, ms: 30000 }, 40000), 0);
});

test('Q6: province > zone > place — a bigger area replaces, a smaller one waits, nothing is drawn twice', () => {
  const st = bannerState();
  bannerPush(st, { level: 'place', name: 'The Hanging Oak' }, 0);
  assert.equal(st.cur.name, 'The Hanging Oak');
  bannerPush(st, { level: 'zone', name: 'Torbor Fields' }, 100);            // bigger: replaces at once
  assert.equal(st.cur.name, 'Torbor Fields'); assert.equal(st.queue.length, 0);
  bannerPush(st, { level: 'place', name: 'Old Mill' }, 200);                  // smaller: queued
  assert.equal(st.cur.name, 'Torbor Fields'); assert.deepEqual(st.queue.map(q => q.name), ['Old Mill']);
  bannerPush(st, { level: 'zone', name: 'Torbor Fields' }, 300);              // the same again: ignored
  assert.equal(st.queue.length, 1);
  bannerPush(st, { level: 'province', name: 'Torbor Downs' }, 400);           // bigger: replaces, drops the smaller queued
  assert.equal(st.cur.name, 'Torbor Downs'); assert.equal(st.queue.length, 0);
  bannerPush(st, { level: 'place', name: 'A' }, 500); bannerPush(st, { level: 'place', name: 'B' }, 501); bannerPush(st, { level: 'place', name: 'C' }, 502);
  assert.deepEqual(st.queue.map(q => q.name), ['B', 'C'], 'a short queue: the oldest small one is dropped');
  assert.equal(bannerTick(st, 400 + 3399), false);
  assert.equal(bannerTick(st, 400 + 3401), true); assert.equal(st.cur.name, 'B');
  bannerTick(st, 99999); assert.equal(st.cur.name, 'C');
  bannerTick(st, 999999); assert.equal(st.cur, null);
});

test('Q11: sell prices and buy refusals', () => {
  assert.equal(sellPrice({ value: 7 }), 7);
  assert.equal(sellPrice({ sell: 3, value: 9 }), 3);
  assert.equal(sellPrice({ price: 100 }, 0.25), 25);
  assert.equal(sellPrice({ kind: 'junk' }), 1);
  assert.equal(buyRefusal({ price: 10 }, 20), null);
  assert.match(buyRefusal({ price: 30 }, 20), /10 more gold/);
  assert.match(buyRefusal({ price: 1, stock: 0 }, 20), /Sold out/);
  assert.match(buyRefusal({ price: 1 }, 20, 0), /bag is full/);
});

test('Q12: a second ring goes on the empty hand', () => {
  const ring = { slot: 'ring1', name: 'Ring' };
  assert.equal(wearSlot(ring, {}), 'ring');
  assert.equal(wearSlot(ring, { ring: { name: 'A' } }), 'ring2');
  assert.equal(wearSlot(ring, { ring2: { name: 'B' } }), 'ring');
  assert.equal(wearSlot(ring, { ring: {}, ring2: {} }), 'ring');
  assert.equal(wearSlot({ slot: 'head' }, {}), null);
});

test('Q14: the trade button walks lock -> wait -> accept -> wait', () => {
  const t = (yl, tl, yc = false, tc = false) => ({ you: { locked: yl, confirmed: yc }, them: { locked: tl, confirmed: tc } });
  assert.equal(tradeView(t(false, false)).button.op, 'lock');
  assert.equal(tradeView(t(false, false)).canEdit, true);
  assert.equal(tradeView(t(true, false)).button.op, null);
  assert.equal(tradeView(t(true, true)).button.op, 'confirm');
  assert.equal(tradeView(t(true, true, true)).button.op, null);
  assert.equal(tradeView(t(true, true, false, true)).themSay, 'Accepted');
  assert.equal(tradeView(null), null);
});

test('Q15: settings — defaults, junk dropped, numbers clamped; trade-from-friends is OFF by default', () => {
  assert.equal(SETTINGS_DEFAULTS.tradeFriends, false);
  assert.equal(SETTINGS_DEFAULTS.showGear, true);
  const s = cleanSettings({ quality: 'ultra', master: 3, ui: 9, tradeFriends: 'yes', showGear: false, evil: 1 });
  assert.equal(s.quality, 'auto'); assert.equal(s.master, 1); assert.equal(s.ui, 1.4); assert.equal(s.tradeFriends, false); assert.equal(s.showGear, false);
  assert.equal('evil' in s, false);
  assert.deepEqual(cleanSettings(null), SETTINGS_DEFAULTS);
});

test('Q22: hiding equipment keeps weapons; hiding the helm alone keeps the rest', () => {
  const g = { head: 1, chest: 2, weapon: 3, offhand: 4, ring: 5 };
  assert.deepEqual(gearShown(g, { showGear: false }), { weapon: 3, offhand: 4 });
  assert.deepEqual(gearShown(g, { showHelm: false }), { chest: 2, weapon: 3, offhand: 4, ring: 5 });
  assert.equal(gearShown(g, {}), g);
});

test('Q20/Q21: a custom look is small, cleaned, laid over the seeded face, and keyed', () => {
  const base = { body: { height: 0.5, width: 0.4, skin: '#ffdbb4', race: 'elf' }, headShape: 'round', hair: { id: 'short', color: '#111111' }, eyes: { id: 'round', color: '#4a6b8a' }, top: { id: 'tunic' } };
  const c = cleanCustom({ hair: 'long', eyes: { id: 'nope' }, body: { height: 4, skin: 'red', evil: 1 }, headShape: 'oval', top: { id: 'plate' } });
  assert.deepEqual(c, { body: { height: 1 }, headShape: 'oval', hair: { id: 'long' } });
  const a = applyCustom(base, { hair: { id: 'long', color: '#a86a3a' }, body: { height: 0.9 } });
  assert.equal(a.hair.id, 'long'); assert.equal(a.hair.color, '#a86a3a');
  assert.equal(a.body.height, 0.9); assert.equal(a.body.race, 'elf', 'the race stays');
  assert.equal(a.top.id, 'tunic', 'clothes are never touched (the class / gear decide them)');
  assert.notEqual(a, base); assert.equal(base.hair.id, 'short', 'the input is not changed');
  const back = customFrom(base);
  assert.equal(back.hair.id, 'short'); assert.equal(back.body.skin, '#ffdbb4');
  const look = lookWith({ race: 'elf', seed: 9 }, { hair: { id: 'long' } });
  assert.deepEqual(look, { race: 'elf', seed: 9, v: 1, custom: { hair: { id: 'long' } } });
  assert.ok(JSON.stringify(lookWith({ race: 'elf', seed: 9 }, customFrom(base))).length < 1536);
  assert.equal(lookCustom({ custom: { a: 1 } }).a, 1);
  assert.equal(customKey({ hair: { id: 'long' } }), customKey({ hair: { id: 'long' } }));
  assert.notEqual(customKey({ hair: { id: 'long' } }), customKey({ hair: { id: 'bob' } }));
  assert.equal(customKey(null), '');
});

test('Q24: the XP text says how far to the next level', () => {
  const x = xpText(250, 1000, 4);
  assert.equal(x.frac, 0.25);
  assert.match(x.text, /250 \/ 1,000 XP \(25%\)/);
  assert.match(x.tip, /750 to level 5/);
  assert.equal(className('ranger'), 'Ranger');
  assert.equal(className('dragon_knight'), 'Dragon Knight');
  assert.equal(className(''), 'Adventurer');
});

test('Q26 + Q23: on the real forest, every node sits inside its own arm\'s area; search finds by name and by card text', async () => {
  const perks = JSON.parse(readFileSync(join(HERE, '../../data/rules/perks.json'), 'utf8'));
  const { buildTvForest } = await import('../../js/rules/perk-forest.js');
  const F = buildTvForest(perks);
  const S = armSectors(F);
  const byKey = new Map(S.map(s => [s.key, s]));
  let checked = 0;
  for (const n of F.nodes) {
    if (!n.arm) continue;
    const s = byKey.get(n.arm);
    assert.ok(s, `arm ${n.arm} has an area`);
    assert.ok(inSector(s, n.x, n.y), `${n.id} (${n.name}) sits outside ${n.arm}'s area`);
    checked++;
  }
  assert.ok(checked > 50, `checked ${checked} nodes`);
  // the areas tile the circle: no arm's area reaches into its neighbour's (that overlap hid The Long Odds' nodes)
  const sorted = S.slice().sort((a, b) => a.mid - b.mid);
  const span = sorted.reduce((t, x) => t + (x.a1 - x.a0), 0);
  assert.ok(span <= Math.PI * 2 + 0.05 * S.length, `the areas add up to ${span.toFixed(2)} rad — they overlap`);
  const fortune = F.nodes.filter(n => n.arm === 'fortune');
  assert.ok(fortune.length > 0 && fortune.every(n => inSector(byKey.get('fortune'), n.x, n.y)), 'The Long Odds holds its Collector and Fortune\'s Tithe');
  const one = F.nodes.find(n => n.arm && n.name && n.name.split(' ').length > 1);
  const hit = searchForest(F, one.name.toLowerCase());
  assert.ok(hit.includes(one.id), `"${one.name}" finds itself`);
  assert.deepEqual(searchForest(F, ''), []);
  assert.ok(searchForest(F, 'zzzqqq').length === 0);
  const byText = searchForest(F, 'secret-word', n => (n.id === one.id ? 'a SECRET-WORD in the card' : ''));
  assert.deepEqual(byText, [one.id]);
});

test('R3: an event says when — seconds, minutes, or "when someone comes near"; every state has a line', async () => {
  const { soonText, eventStateText } = await import('../../js/client/ui/pt2-core.js');
  assert.equal(soonText(14000, 0), 'Starts in 14 s');
  assert.equal(soonText(83000, 0), 'Starts in 1:23');
  assert.equal(soonText(0, 5), 'Starting now');
  assert.equal(soonText(undefined), 'Starts when someone comes near');
  assert.equal(eventStateText({ state: 'ready' }), 'Comes alive when you come near');
  assert.equal(eventStateText({ state: 'cooldown', at: 220000 }, 0), 'Ready again in 3:40');
  assert.equal(eventStateText({ state: 'live' }), 'Happening now');
  assert.equal(eventStateText({ state: 'soon', at: 9000 }, 0), 'Starts in 9 s');
});

test('Q20: the barber charges only for what changed (same sums as the server), first visit free', async () => {
  const { diffCustom, mergeCustom, barberCost } = await import('../../js/client/ui/appearance-core.js');
  const base = { hair: { id: 'short', color: '#111111' }, eyes: { id: 'round' }, body: { height: 0.5, skin: '#ffdbb4' } };
  const now = { hair: { id: 'long', color: '#111111' }, eyes: { id: 'round' }, body: { height: 0.5, skin: '#ffdbb4' } };
  assert.deepEqual(diffCustom(base, now), { hair: { id: 'long', color: '#111111' } });
  const stored = { eyes: { id: 'wide' } };
  const send = mergeCustom(stored, diffCustom(base, now));
  assert.deepEqual(send, { eyes: { id: 'wide' }, hair: { id: 'long', color: '#111111' } });
  const P = { prices: { hair: 5, hairColour: 4, beard: 4, eyes: 6, face: 10, skin: 12, body: 20, everything: 40 }, perLevel: 0.05 };
  assert.equal(barberCost(stored, send, { ...P, level: 1 }), 9, 'hair 5 + a colour it never had 4');
  assert.equal(barberCost(stored, send, { ...P, level: 1, free: true }), 0);
  assert.equal(barberCost({}, { body: { skin: '#5c3a1e' } }, { ...P, level: 11 }), 18, 'skin 12 x 1.5');
  assert.equal(barberCost({}, {}, { ...P, raceChanged: true }), 40);
});

test('S25: with Names off the world map draws no text at all — provinces, zones, bands, settlements, places', async () => {
  const { drawMap } = await import('../../js/client/ui/map-render.js');
  const { makeView } = await import('../../js/client/ui/map-data.js');
  const texts = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === 'fillText' || k === 'strokeText' ? (s => texts.push(s)) : k === 'measureText' ? (s => ({ width: String(s).length * 6 })) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const model = { provinces: [{ name: 'Torbor Downs', zones: [1], cx: 1024, cz: 1024, playable: true }], playable: { band: [1, 8] },
    zones: new Map([['z12_02', { key: 'z12_02', playable: true, name: 'The Torbor Fields', band: [1, 4], bounds: { minX: 0, minZ: 0, maxX: 2048, maxZ: 2048 } }]]),
    settlements: [{ name: 'Torborhold', x: 1000, z: 1000, size: 3, hub: true }], rivers: [], roads: [] };
  const markers = [{ kind: 'landmark', name: 'The Hanging Oak', x: 1010, z: 1010, priority: 3, size: 5 }];
  for (const scale of [0.01, 0.1, 0.5]) {
    const view = makeView({ cx: 1024, cz: 1024, scale, w: 800, h: 600 });
    texts.length = 0; drawMap(ctx, view, { model, markers, opts: { names: true, zones: false } });
    assert.ok(texts.length > 0, `names on draws text at scale ${scale}`);
    texts.length = 0; drawMap(ctx, view, { model, markers, opts: { names: false, zones: false } });
    assert.deepEqual(texts, [], `names off draws nothing at scale ${scale}`);
  }
});

test('S3: categories are never for sale — only named items and mounts', async () => {
  const { saleRows } = await import('../../js/client/ui/pt2-core.js');
  const rows = saleRows([{ id: 'a', label: 'Wands & rods', item: { name: 'Wands & rods' } }, { id: 'b', label: 'Wands & rods', item: { name: 'Ashwood Wand' } }, { id: 'c', label: 'Mounts', mount: { id: 'pony', name: 'Pony' } }, { id: 'd', label: 'Goods', item: {} }]);
  assert.deepEqual(rows.map(r => r.id), ['b', 'c']);
});

test('Q13 fallback: the 2D face portrait is strict XML (an <img> refuses anything else) and framed on the head', async () => {
  const { svgPortrait } = await import('../../js/client/ui/svg-portrait.js');
  const url = svgPortrait({ body: { height: 0.5, width: 0.4, headSize: 0.5, skin: '#f1c27d' }, headShape: 'round', hair: { id: 'long', color: '#8a1a1a' }, eyes: { id: 'round', color: '#4a6b8a' } });
  const svg = decodeURIComponent(url.split(',')[1]);
  assert.match(url, /^data:image\/svg\+xml/);
  assert.doesNotMatch(svg, /\sdata-avatar[\s>]/, 'no bare attributes');
  assert.doesNotMatch(svg, /viewBox="0 0 300 400"/, 'cropped to the head');
  assert.equal((svg.match(/&(?![a-z#0-9]+;)/gi) || []).length, 0);
});
