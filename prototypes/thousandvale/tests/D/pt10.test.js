// Stream D-UI, play-test 10 — the pure halves of Y33 Y27 Y39 Y38 Y37 Y11 Y29 Y30 Y28 Y36 Y22 Y16 Y26 Y6 Y32 Y5.
// Run: node --test prototypes/thousandvale/tests/D/pt10.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as C from '../../js/client/ui/pt10-core.js';
import { livePortraitAllowed, deviceAllowsLive, canvasMatches, squareOnCanvas, isIOS } from '../../js/client/ui/portrait-mode.js';
import { pathOf, findPath, tabsOf } from '../../js/client/ui/keep-scroll.js';
import { slotOf, altSlotOf, iconSpec } from '../../js/client/ui/inv-core.js';
import { itemFacts, basicSheet } from '../../js/client/ui/pt5-core.js';
import { stepHasPlace, locateQuest, PLACE_STEPS } from '../../js/client/ui/map-data.js';
import { hasTree, picksWaitingOn, talentPicksWaiting } from '../../js/client/ui/talent-model.js';
import { skillIconSvg, skillIconIds } from '../../js/client/ui/skill-icons.js';
import { classCardLines } from '../../js/client/ui/class-card.js';
import { resView } from '../../js/client/ui/class-res.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(GAME, f), 'utf8');
const json = f => JSON.parse(src(f));

// ------------------------------------------------------------------------------------------------------------ Y33
test('Y33: the live 3D portrait is never used on an iPhone, a phone layout, a finger-first device or a software renderer', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
  const DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
  const good = { cssW: 1920, cssH: 1080, bufW: 1920, bufH: 1080, dpr: 1 };
  assert.equal(isIOS({ ua: IPHONE }), true);
  assert.equal(isIOS({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }), true, 'an iPad says it is a Mac');
  assert.equal(isIOS({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 }), false, 'a real Mac is a desktop');
  assert.equal(livePortraitAllowed({ ua: IPHONE, ...good }), false);
  assert.equal(livePortraitAllowed({ ua: DESK, ...good }), true);
  assert.equal(livePortraitAllowed({ ua: DESK, ...good, layout: 'phone' }), false);
  assert.equal(livePortraitAllowed({ ua: DESK, ...good, coarse: true }), false);
  assert.equal(livePortraitAllowed({ ua: DESK, ...good, software: true }), false);
  assert.equal(deviceAllowsLive({ ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36' }), false);
});
test('Y33: a canvas whose box and drawing buffer disagree (the owner\'s screenshot: 86 px) switches the live portrait off', () => {
  // the screenshot: a 393 px wide phone, the canvas box 666 px tall on screen, the buffer still 752 px tall
  assert.equal(canvasMatches({ cssW: 393, cssH: 666, bufW: 393 * 3, bufH: 752 * 3, dpr: 3 }), false);
  assert.equal(canvasMatches({ cssW: 393, cssH: 666, bufW: 393 * 3, bufH: 666 * 3, dpr: 3 }), true);
  assert.equal(canvasMatches({ cssW: 1366, cssH: 768, bufW: 2049, bufH: 1152, dpr: 1.5 }), true);
  assert.equal(canvasMatches({ cssW: 0, cssH: 0, bufW: 0, bufH: 0 }), false);
  assert.equal(squareOnCanvas({ left: 10, top: 10, right: 60, bottom: 60 }, { left: 0, top: 0, right: 400, bottom: 300 }), true);
  assert.equal(squareOnCanvas({ left: 10, top: -8, right: 60, bottom: 42 }, { left: 0, top: 0, right: 400, bottom: 300 }), false, 'a clamped square would be drawn somewhere else');
  const p = src('js/client/ui/portraits.js');
  assert.match(p, /deviceAllowsLive\(/); assert.match(p, /canvasMatches\(/); assert.match(p, /squareOnCanvas\(/);
  assert.match(p, /const svg = liveSvg\(el, get\)/, 'every live slot has the 2D picture to fall back to');
  assert.doesNotMatch(p, /document\.body\.append(Child)?\(c(v|anvas)\)/, 'no portrait canvas is ever put on the page outside its frame');
});

// ------------------------------------------------------------------------------------------------------------ Y27
class El {
  constructor(tag, cls = '', kids = []) { this.tagName = tag.toUpperCase(); this.className = cls; this.children = kids; this.parentElement = null; this.dataset = {}; this.id = ''; this.textContent = ''; for (const k of kids) k.parentElement = this; }
  get previousElementSibling() { const s = this.parentElement?.children || []; return s[s.indexOf(this) - 1] || null; }
}
test('Y27: a redrawn list is found again by its place in the window, and a changed tab means "a different list"', () => {
  const build = () => { const list = new El('div', 'shop-list'); const card = new El('div', 'shop-card'); const buy = new El('div', 'shop-buy', [list, card]); const tabs = new El('div', 'chips shop-tabs'); const body = new El('div', 'tvp-body', [new El('p', 'shop-says'), tabs, buy, new El('p', 'tiny-left shop-hint')]); const root = new El('section', 'tv-panel', [new El('header', 'tvp-head'), body]); root.id = 'panel-shop'; return { root, list, body }; };
  const a = build(), b = build();
  const path = pathOf(a.list, a.root);
  assert.equal(path, 'div.tvp-body:0>div.shop-buy:0>div.shop-list:0');
  assert.equal(findPath(b.root, path), b.list, 'the NEW list element at the same place');
  assert.equal(findPath(b.root, 'div.tvp-body:0>div.nope:0'), null);
  // two lists with the same class are told apart by their index
  const l1 = new El('ul', 'cart-list'), l2 = new El('ul', 'cart-list'), r = new El('div', '', [l1, l2]);
  assert.equal(pathOf(l2, r), 'ul.cart-list:1'); assert.equal(findPath(r, 'ul.cart-list:1'), l2);
  // tabs
  const tab = (id, on) => { const e = new El('button', 'chip'); e.dataset = { tab: id }; e.on = on; return e; };
  const fake = sel => ({ querySelectorAll: () => sel });
  assert.equal(tabsOf(fake([tab('buy')])), 'buy'); assert.notEqual(tabsOf(fake([tab('buy')])), tabsOf(fake([tab('sell')])));
  const cnt = new El('button', 'chip'); cnt.textContent = 'Buy back (3)'; const cnt2 = new El('button', 'chip'); cnt2.textContent = 'Buy back (4)';
  assert.equal(tabsOf(fake([cnt])), tabsOf(fake([cnt2])), 'a count in a tab\'s label is not a different tab');
  assert.match(src('js/client/ui-panel.js'), /installKeepScroll\(\)/);
  assert.match(src('css/pt10.css'), /\.shop-list[^{]*\{[^}]*scrollbar-gutter: stable/);
  assert.match(src('css/pt10.css'), /\.shop-panel \.tvp-body \{ overflow-y: scroll; \}/);
});

// ------------------------------------------------------------------------------------------------------------ Y39
test('Y39: every confirm dialog is mounted on <body> under one stacking rule above every window', () => {
  const css = src('css/pt10.css');
  const z = +/--z-confirm: (\d+)/.exec(css)[1], ask = +/--z-ask: (\d+)/.exec(css)[1], max = +/const Z_WINDOW_MAX = (\d+)/.exec(src('js/client/ui-panel.js'))[1];
  assert.ok(max < ask && ask < z, 'windows < ask pop-ups < confirms');
  assert.ok(z > 99000, 'above the phone sheet (99000)'); assert.ok(z < 99980, 'below the controller ring and the on-screen keyboard');
  assert.match(css, /\.tv-confirm, html\[data-layout="phone"\] \.tv-confirm[^{]*\{ position: fixed; z-index: var\(--z-confirm\) !important; \}/);
  assert.match(src('index.html'), /css\/pt9\.css">\s*<link rel="stylesheet" href="css\/pt10\.css">/);
  // whoever builds a `.tv-confirm` mounts it with mountConfirm() or straight on <body> — never inside the HUD
  const dirs = ['js/client', 'js/client/ui'];
  for (const d of dirs) for (const f of readdirSync(join(GAME, d)).filter(n => n.endsWith('.js'))) {
    const s = src(`${d}/${f}`);
    if (!/['"`.]tv-confirm/.test(s) || f === 'pt10.js') continue;
    for (const m of s.matchAll(/getElementById\('hud'\) \|\| document\.body\)\.appendChild\(box\)/g)) assert.fail(`${d}/${f} mounts a confirm inside the HUD: ${m[0]}`);
    if (/className = 'tv-confirm|h\('div\.tv-confirm/.test(s)) assert.match(s, /mountConfirm\(box\)|document\.body\.appendChild\(box\)/, `${d}/${f}`);
  }
});

// ------------------------------------------------------------------------------------------------------------ Y38
test('Y38: a skill Thousandvale adds itself counts its waiting talent picks from the SERVER\'S tree', () => {
  const tree = { skillId: 'mercys_touch', offer: 'server', tiers: [{ tier: 1, level: 3, nodes: [{ id: 'a' }, { id: 'b' }] }, { tier: 2, level: 8, nodes: [{ id: 'c' }] }, { tier: 3, level: 18, nodes: [{ id: 'd' }] }] };
  const local = { skillId: 'x', tiers: [{ tier: 1, level: 3, nodes: [{ id: 'q' }] }] };
  const srcOf = t => ({ tree: () => t });
  const s = { id: 'mercys_touch', unlocked: true, hasTalents: false };        // no `talents` block on a Farhold row: the old rule said "none"
  assert.equal(hasTree(srcOf(tree), s), true);
  assert.equal(picksWaitingOn(srcOf(tree), s, {}, 8), 2, 'two tiers open at level 8, none picked');
  assert.equal(picksWaitingOn(srcOf(tree), s, { mercys_touch: { 1: 'a' } }, 8), 1);
  assert.equal(picksWaitingOn(srcOf(tree), { ...s, unlocked: false }, {}, 8), 0);
  assert.equal(hasTree(srcOf({ ...tree, tiers: [{ tier: 1, level: 3, nodes: [] }] }), s), false, 'an empty server tree has nothing to pick');
  assert.equal(hasTree(srcOf(local), s), false, 'without a server tree the local row decides, as before');
  assert.equal(hasTree(srcOf(local), { ...s, hasTalents: true }), true);
  assert.equal(talentPicksWaiting(srcOf(tree), [s, { id: 'other', unlocked: true, hasTalents: false }], {}, 8), 4, 'the K button\'s number uses the same rule');
  assert.match(src('js/client/ui/talents.js'), /picksWaitingOn\(S\.src, s, S\.talents, level\)/);
});

// ------------------------------------------------------------------------------------------------------------ Y37
test('Y37: one row per party member, and never yourself — also when "who am I" is late after a reconnect', () => {
  const party = { leader: 7, members: [{ char: 7, name: 'Aldra', online: true }, { char: 9, name: 'Brem', online: false }, { char: 9, name: 'Brem', online: true }, { char: 12, name: 'Radley', online: true }, { char: 12, name: 'Radley', online: false }] };
  const r = C.partyRows(party, { me: 12 });
  assert.deepEqual(r.all.map(m => m.char), [7, 9, 12]); assert.equal(r.all[1].online, true, 'the online row wins');
  assert.deepEqual(r.others.map(m => m.name), ['Aldra', 'Brem']); assert.equal(r.me.name, 'Radley');
  assert.deepEqual(C.partyRows({ ...party, me: 12 }, { me: null }).others.map(m => m.char), [7, 9], 'the server says which one is you');
  assert.deepEqual(C.partyRows(party, { me: null, name: 'Radley' }).others.map(m => m.char), [7, 9], 'by name as the last resort');
  assert.deepEqual(C.partyRows(party, { me: '12' }).others.map(m => m.char), [7, 9], 'ids compare as text');
  assert.deepEqual(C.partyRows(null).all, []);
  assert.match(src('js/client/social.js'), /partyRows\(party, \{ me: myChar\(\)/);
});

// ------------------------------------------------------------------------------------------------------------ Y11
test('Y11: an event the server no longer lists goes away; a countdown and a result card stay', () => {
  const now = 1_000_000;
  const mine = [
    { key: 'e1', uid: 'e1', scope: 'realm', state: 'live' }, { key: 'z4', uid: 'z4', scope: 'zone', state: 'live' }, { key: 'road9', uid: 'road9', state: 'offer' },
    { key: 's1', uid: 's1', state: 'soon', at: now + 60000 }, { key: 's2', uid: 's2', state: 'soon', at: now - 90000 }, { key: 'w1', uid: 'w1', state: 'won' },
  ];
  assert.deepEqual(C.staleEvents(mine, { live: ['z4'], realm: null }, now), ['e1', 'road9', 's2']);
  assert.deepEqual(C.staleEvents(mine, { live: ['z4', 'road9'], realm: 'e1' }, now), ['s2']);
  assert.deepEqual(C.staleEvents(mine, null, now), [], 'no list from the server: nothing is dropped');
  assert.equal(C.eventListed({ key: 'realm', realm: true }, { live: [], realm: 'e77' }), true);
  assert.equal(C.eventListed({ uid: 5 }, { live: ['5'] }), true);
  for (const f of ['js/client/ui/event-tracker.js', 'js/client/ui/atlas.js', 'js/client/world-ui.js']) assert.match(src(f), /n\.on\('eventSync'/, f);
  assert.match(src('js/client/world-ui.js'), /r\.gone \|\| r\.why === 'noEvent'/);
});

// ------------------------------------------------------------------------------------------------------------ Y29
test('Y29: the title\'s front card — loading, the list, or one "Create character" button; never straight into creation', () => {
  assert.equal(C.titleFront({ hasToken: true }).state, 'loading'); assert.equal(C.titleFront({ hasToken: true }).button, '');
  assert.deepEqual(C.titleFront({ hasToken: true, loaded: true, count: 2 }), { state: 'list', button: 'New character', note: '' });
  for (const o of [{ hasToken: false }, { hasToken: true, loaded: true, count: 0 }, { hasToken: true, failed: true }]) { const v = C.titleFront(o); assert.equal(v.state, 'empty'); assert.equal(v.button, 'Create character'); assert.ok(v.note.length > 10); }
  const html = src('index.html');
  assert.match(html, /<form id="login" class="card" autocomplete="off" hidden>/, 'the new-character form is hidden until asked for');
  assert.match(html, /<section id="front" class="card front" aria-label="Your characters">/);
  const main = src('js/client/main.js');
  assert.doesNotMatch(main, /titleStep\(account\.hasChars\?\.\(\) \? 'front' : 'new'\)/);
  assert.doesNotMatch(src('js/client/account.js'), /else tab\('new'\)/);
});
test('Y29: the title\'s figure is the listed character — its saved look and its gear — not the new-character form', () => {
  const chars = [{ id: 4, name: 'Dwalin', cls: 'mage', look: { race: 'dwarf', seed: 9 } }, { id: 8, name: 'Xanaver', cls: 'ranger', look: { race: 'elf', seed: 77, custom: { hair: { color: '#e8d27a' } } } }];
  assert.equal(C.titleFirstChar(chars, '8').name, 'Xanaver', 'the one played last');
  assert.equal(C.titleFirstChar(chars, null, 'xanaver').name, 'Xanaver'); assert.equal(C.titleFirstChar(chars).name, 'Dwalin'); assert.equal(C.titleFirstChar([]), null);
  const gear = { chest: { baseKey: 'leather_jerkin', rarity: 'magic' } };
  const L = C.titleCharLook(chars[1], { remembered: gear });
  assert.equal(L.race, 'elf'); assert.equal(L.cls, 'ranger'); assert.deepEqual(L.custom, { hair: { color: '#e8d27a' } }); assert.deepEqual(L.gear, gear);
  assert.deepEqual(C.titleCharLook({ ...chars[1], gear: { chest: { baseKey: 'x' } } }, { remembered: gear }).gear, { chest: { baseKey: 'x' } }, 'the server\'s gear wins over what this browser remembers');
  assert.equal('gear' in C.titleCharLook(chars[1]), false, 'with no gear known the key is left out (the calling\'s plain outfit, not bare skin)');
  assert.match(src('js/client/main.js'), /S\.titleStep === 'front' && S\.titleChar\) \{ const L = titleCharLook\(/);
});

// ------------------------------------------------------------------------------------------------------------ Y30
test('Y30: the changelog — newer than the marker is New, a first visit shows nothing new, the real file reads', () => {
  const E = json('data/ops/changelog.json').entries;
  assert.ok(E.length >= 2); for (const e of E) { assert.ok(e.id != null && e.title && Array.isArray(e.items) && e.items.length, `entry ${e.id}`); }
  const v = C.changelogView(E, E[E.length - 1].id);
  assert.equal(v.unseen, E.length - 1); assert.equal(v.rows[0].isNew, true); assert.equal(v.rows[E.length - 1].isNew, false); assert.equal(v.latest, String(E[0].id));
  assert.equal(C.changelogView(E, E[0].id).unseen, 0);
  const first = C.changelogView(E, null); assert.equal(first.first, true); assert.equal(first.unseen, 0, 'a new player gets no "the game was updated"');
  assert.equal(C.changelogView(E, 'not-an-id').first, true);
  assert.equal(C.changelogNewer(E, E[1].id, E[0].id), String(E[0].id)); assert.equal(C.changelogNewer(E, null, E[1].id), String(E[1].id)); assert.equal(C.changelogNewer(E, null, null), null);
  assert.equal(C.changelogDate('2026-10-08'), '8 October 2026'); assert.equal(C.changelogDate('soon'), 'soon');
  assert.equal(C.changelogPopupText(1), '1 update since you last played.'); assert.equal(C.changelogPopupText(3), '3 updates since you last played.');
  assert.match(src('index.html'), /id="title-changelog"/);
  assert.match(src('js/client/ui/changelog.js'), /net\(\)\?\.settings\?\.\(\{ changelogSeen: id \}\)/);
});

// ------------------------------------------------------------------------------------------------------ Y28 / Y36
test('Y36: the Party section lists everyone, yourself first; a member in a dungeon has no spot on the world map', () => {
  const party = { leader: 7, me: 12, members: [{ char: 7, name: 'Aldra', level: 9, cls: 'cleric', online: true }, { char: 9, name: 'Brem', online: true }, { char: 12, name: 'Radley', online: true }, { char: 15, name: 'Sella', online: false }] };
  const frames = [{ char: 7, room: 'wilds:z12_02', x: 25100, z: 5300, online: true }, { char: 9, room: 'i:barrow:3', x: 40, z: 22, online: true }, { char: 15, room: null, online: false }];
  const rows = C.partyPeople({ party, frames, self: { char: 12, name: 'Radley', x: 25000, z: 5300, level: 8, room: 'town' }, tracked: new Set(['7']) });
  assert.deepEqual(rows.map(r => r.name), ['Radley', 'Aldra', 'Brem', 'Sella']);
  assert.equal(rows[0].self, true); assert.equal(rows[0].placed, true); assert.equal(rows[0].canTrack, false);
  assert.equal(rows[1].placed, true); assert.equal(rows[1].dist, 100); assert.equal(rows[1].tracked, true); assert.equal(rows[1].leader, true);
  assert.equal(rows[2].placed, false); assert.equal(rows[2].where, 'In a dungeon');
  assert.equal(rows[3].where, 'Offline'); assert.equal(rows[3].canTrack, false);
  const w = C.whereRow([31, 'Mira', 'torbor', 'Torbor Downs', 'Torborhold', 25186.8, 5411.8, 'town', 11, 'mage']);
  assert.equal(w.name, 'Mira'); assert.equal(C.whereText(w), 'Torborhold'); assert.equal(C.whereText({ ...w, town: null }), 'Torbor Downs');
  assert.equal(C.trackRefusal({ why: 'hidden' }), C.TRACK_WHY.hidden); assert.equal(C.trackRefusal({ why: 'x', msg: 'Said by the server.' }), 'Said by the server.');
});
test('Y36 / Y28: edge arrows — only for a target off the rectangle or hard against its edge; the HUD arrow turns with the camera', () => {
  assert.equal(C.edgeArrow(200, 150, 400, 300), null);
  const right = C.edgeArrow(900, 150, 400, 300, { margin: 20 });
  assert.equal(right.outside, true); assert.equal(Math.round(right.x), 380); assert.equal(Math.round(right.y), 150); assert.ok(Math.abs(right.angle) < 1e-9, 'points right');
  const up = C.edgeArrow(200, -500, 400, 300, { margin: 20 }); assert.equal(Math.round(up.y), 20); assert.ok(Math.abs(up.angle + Math.PI / 2) < 1e-9, 'points up');
  assert.equal(C.edgeArrow(390, 150, 400, 300, { near: 0 }), null); assert.ok(C.edgeArrow(390, 150, 400, 300, { near: 30 }), 'near the edge counts when asked');
  const a = C.edgeArrow(5000, 5000, 400, 300, { margin: 26 }); assert.ok(a.x <= 374.001 && a.y <= 274.001, 'inside the margin');
  // straight ahead of the camera -> the arrow points up the screen; to the right of it -> right
  const me = { x: 0, z: 0 };
  assert.ok(Math.abs(C.trackBearing(me, { x: 0, z: 100 }, 0).angle + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(C.trackBearing(me, { x: 100, z: 0 }, 0).angle) < 1e-9);
  assert.ok(Math.abs(C.trackBearing(me, { x: 100, z: 0 }, Math.PI / 2).angle + Math.PI / 2) < 1e-9, 'turn the camera to face them and the arrow points up');
  assert.equal(C.trackBearing(me, { x: 10, z: 10 }, 0), null, 'near: no arrow');
  assert.equal(C.metresText(238), '240 m'); assert.equal(C.metresText(1240), '1.2 km'); assert.equal(C.metresText(NaN), '');
  const wm = src('js/client/ui/worldmap.js');
  assert.match(wm, /presets\.replaceChildren\(locate, /, '"Locate player" is the first thing in the top-left row');
  assert.match(wm, /Locate player/); assert.match(wm, /section\.map-party/);
});

// ------------------------------------------------------------------------------------------------------------ Y22
test('Y22: a step done anywhere (smelt, craft, cook, learn, ride) has no place on the map — no marker, no circle', () => {
  for (const k of ['craft', 'cook', 'learn', 'ride', 'catch', 'gather', 'smelt']) assert.equal(stepHasPlace({ kind: k }), false, k);
  for (const k of PLACE_STEPS) assert.equal(stepHasPlace({ kind: k }), true, k);
  assert.equal(stepHasPlace({ kind: 'craft', at: { x: 5, z: 6 } }), true, 'unless the step carries its own spot');
  assert.equal(stepHasPlace({ kind: 'kill', anywhere: true }), false);
  assert.equal(stepHasPlace({}), true, 'an unknown step keeps the old "somewhere in the region"');
  const model = { zones: new Map([['z12_02', { name: 'Torbor Downs' }]]), quests: new Map(), npcs: new Map(), sites: new Map(), vigs: new Map(), pois: [], camps: [], rares: new Map(), rareSlots: {}, sheetOf: new Map() };
  const smelt = { id: 'prof_bronze_not_copper', zone: 'z12_02', step: 0, steps: [{ text: 'Smelt 3 bronze bars', kind: 'craft', of: 3, n: 0 }] };
  assert.equal(locateQuest(smelt, model), null, 'the report: "Smelt 3 bronze bars" drew a zone-sized circle');
  const hunt = { id: 'h', zone: 'z12_02', step: 0, steps: [{ text: 'Kill 6 wolves', kind: 'kill' }] };
  const L = locateQuest(hunt, model); assert.ok(L && L.exact === false, 'a hunt with no known camp still says "somewhere in the region"');
  assert.equal(locateQuest({ ...smelt, ready: true, remote: true, steps: [{}] }, model), null, 'a hand-in the post carries has no place either');
});

// ------------------------------------------------------------------------------------------------------ Y16 / Y26
test('Y16: the hand line is the rules\' own; Main hand / Off hand items fit only that hand; One-hand fits either', () => {
  const tome = { name: 'Storm Tome', type: 'weapon', hand: 'main', handText: 'Main hand', dmg: [4, 9], aps: 0.9, apsText: '0.9 attacks per second' };
  const orb = { name: 'Seer\'s Orb', type: 'weapon', slot: 'offhand', hand: 'off', handText: 'Off hand', noAttack: true, dmg: [2, 3], focusText: 'Held with a wand, tome or sceptre: every fourth basic attack repeats.' };
  const wand = { name: 'Ash Wand', type: 'weapon', hand: 'one', handText: 'One-hand', dmg: [3, 6], offHandOk: false };
  const staff = { name: 'Oak Staff', type: 'weapon', hand: 'two', handText: 'Two-hand', twoHanded: true };
  assert.equal(C.handLine(tome), 'Main hand'); assert.equal(C.handLine({ hand: 'off' }), 'Off hand'); assert.equal(C.handLine({ hand: 'one' }), 'One-hand'); assert.equal(C.handLine({ hands: 2 }), '', 'Farhold\'s numeric `hands` is never printed');
  assert.equal(C.handRefusal(tome, 'offhand'), 'Storm Tome is a main-hand weapon — it cannot go in the off hand.');
  assert.equal(C.handRefusal(orb, 'weapon'), 'Seer\'s Orb is an off-hand item — it cannot go in the main hand.');
  assert.equal(C.handRefusal(wand, 'offhand'), null); assert.equal(C.handRefusal(wand, 'weapon'), null); assert.equal(C.handRefusal(tome, 'weapon'), null); assert.equal(C.handRefusal({ name: 'Old' }, 'offhand'), null);
  assert.equal(slotOf(orb), 'offhand', 'an orb is an off-hand item whatever its type says');
  assert.equal(altSlotOf(tome), null); assert.equal(altSlotOf(staff), null); assert.equal(altSlotOf(wand), 'offhand', 'a One-hand weapon fits either hand');
  assert.equal(C.showsDamage(orb), false); assert.equal(C.apsLine(orb), ''); assert.equal(C.apsLine(tome), '0.9 attacks per second'); assert.equal(C.apsLine({ aps: 1.6 }), '1.6 attacks per second'); assert.equal(C.apsLine({}), '');
  assert.equal(itemFacts(tome), '4–9 damage · main hand · 0.9 attacks per second'); assert.equal(itemFacts(orb), 'off hand');
  const card = src('js/client/ui/item-card.js');
  assert.match(card, /const hand = handLine\(item\)/); assert.match(card, /item\.dmg && showsDamage\(item\)/); assert.match(card, /apsLine\(item\)/);
});
test('Y26: the basic sheet carries attacks per second from the weapon, and an orb in the off hand adds no swing', () => {
  const sh = basicSheet({ level: 5, hpMax: 100 }, { weapon: { name: 'Ash Wand', dmg: [4, 8], aps: 1.6 }, offhand: { name: 'Orb', dmg: [2, 3], noAttack: true } });
  const by = Object.fromEntries(sh.core.map(r => [r.id, r]));
  assert.equal(by.aps.value, 1.6); assert.equal(by.aps.label, 'Attacks per second');
  assert.ok(Math.abs(by.weaponDps.value - 6 * 1.6) < 1e-9, 'average damage x attacks per second, nothing from the orb');
});

// ------------------------------------------------------------------------------------------------------------- Y6
test('Y6: a ring\'s icon is the ring itself — a 2D loop in the model\'s own colours — never a close-up of a hand', () => {
  const worn = () => ({ partSlot: 'accessory', part: { id: 'g5_signet', color: '#d8b040', color2: '#b03030' }, parts: { accessory: { ring: { id: 'g5_signet', color: '#d8b040', color2: '#b03030' } } } });
  const s = iconSpec({ slot: 'ring1', name: 'Gilded Band', rarity: 'rare' }, { worn });
  assert.equal(s.kind, 'glyph'); assert.equal(s.id, 'ring'); assert.equal(s.color, '#d8b040'); assert.equal(s.color2, '#b03030');
  assert.match(s.key, /^glyph\|ring\|#d8b040\|#b03030/);
  const plain = iconSpec({ slot: 'ring1', name: 'Band', rarity: 'legendary' }, { worn: () => null });
  assert.equal(plain.kind, 'glyph'); assert.equal(plain.id, 'ring');
  assert.notEqual(iconSpec({ slot: 'ring1', rarity: 'rare' }, { worn: () => null }).key, iconSpec({ slot: 'ring1', rarity: 'set' }, { worn: () => null }).key);
});

// ------------------------------------------------------------------------------------------------------------ Y32
test('Y32: the Starcaller has a card in creation and a picture for each of its six skills', () => {
  const tv = json('data/rules/classes-tv.json'), sc = tv.classes.find(c => c.id === 'starcaller');
  assert.ok(sc, 'the class row');
  const L = classCardLines(sc);
  assert.equal(L.name, 'Starcaller'); assert.equal(L.role, 'Arcane Star Caster'); assert.deepEqual(L.facts, ['Cloth', 'Magic weapons', 'Mana']);      // round 11 (C, Z2): the weapon family, not an attribute
  assert.match(L.hook, /golden stars/); assert.match(L.signature, /^Constellation:/);
  assert.equal(classCardLines({ id: 'warrior', name: 'Warrior', role: 'Frontline Tank', armorTier: 'heavy', primaryAttr: 'STR', signature: 'stronger in a crowd' }).signature, 'Signature: stronger in a crowd.');
  assert.equal(classCardLines(null), null);
  const ids = Array.isArray(sc.skills) ? sc.skills.map(s => (typeof s === 'string' ? s : s.id)) : [];
  assert.equal(ids.length, 6);
  for (const id of ids) { const svg = skillIconSvg(id); assert.ok(svg && svg.startsWith('<svg') && svg.includes('#e6c14a') && svg.includes('#1c1f4a'), `${id}: a gold-on-midnight picture`); assert.doesNotMatch(svg, /NaN|undefined/); }
  assert.ok(ids.every(id => skillIconIds().includes(id)), 'the original six remain in the shared library');
  assert.equal(skillIconSvg('unknown_future_skill'), null, 'a skill with no picture keeps its initials');
  assert.match(src('js/client/hud.js'), /skillIconSvg\(sk\.id, 40\)/);
  // feedback #98: the calling's page is the picker's (js/client/ui/calling-picker.js), drawn into #class-card, made by main.js
  assert.match(src('js/client/main.js'), /createCallingPicker\(/); assert.match(src('js/client/ui/calling-picker.js'), /id="class-card"/);
});
test('Y32: a class resource (Starlight) is five pips, glowing when full; a big pool is a bar', () => {
  assert.deepEqual(resView([{ id: 'starlight', n: 3, max: 5 }]), { id: 'starlight', name: 'Starlight', n: 3, max: 5, pips: true, full: false, tint: '#e6c14a', text: 'Starlight 3 / 5' });
  assert.equal(resView({ starlight: { n: 9, max: 5 } }).n, 5); assert.equal(resView({ starlight: { n: 5, max: 5 } }).full, true);
  assert.equal(resView([{ id: 'momentum', n: 40, max: 100 }]).pips, false);
  assert.equal(resView([]), null); assert.equal(resView(null), null); assert.equal(resView([{ id: 'x', n: 1, max: 0 }]), null);
});

// ------------------------------------------------------------------------------------------------------------- Y5
test('Y5: /wave /sit /dance (and cheer, bow, point) are emotes; anything else is not', () => {
  assert.deepEqual(C.EMOTES.map(e => e.id), ['wave', 'sit', 'dance', 'cheer', 'bow', 'point']);
  for (const e of C.EMOTES) { assert.equal(C.emoteFor(e.cmd), e.id); assert.equal(C.emoteFor(e.id.toUpperCase()), e.id); assert.ok(e.label.length > 2); }
  assert.equal(C.emoteFor('/meter'), null); assert.equal(C.emoteFor(''), null);
  assert.equal(C.emoteRefusal({ why: 'mounted' }), 'Get down from your mount first.'); assert.equal(C.emoteRefusal({ msg: 'The server said so.' }), 'The server said so.');
  assert.match(src('js/client/main.js'), /\|\| ui10\.command\(cmd, arg, rest\)/);
  assert.match(src('js/client/input/radial.js'), /function addRing\(/);
  assert.match(src('js/client/ui/angling.js'), /'aria-label': 'Cast a line'/);
});
