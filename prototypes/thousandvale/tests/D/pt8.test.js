// Stream D-UI, play-test 8 — the pure half of the round (js/client/ui/pt8-core.js) and the rules the windows must keep.
// Run: node --test prototypes/thousandvale/tests/D/pt8.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as C from '../../js/client/ui/pt8-core.js';
import { badgePlan, createUnseen } from '../../js/client/ui/unseen.js';
import { iconSpec, DOLL_SLOTS, slotOf } from '../../js/client/ui/inv-core.js';
import { gearLook, wornPart } from '../../js/client/gear-look.js';
import { createGearCatalog } from '../../../../avatar-3d/js/gear-catalog.js';
import { ACTION_BY_ID, auditBindings } from '../../js/client/input/bindings.js';
import { cleanSettings, SETTINGS_DEFAULTS } from '../../js/client/ui/pt2-core.js';
import { accountLevel, channelGate } from '../../js/client/social-core.js';
import { Meter } from '../../../../meters/js/meter.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(GAME, f), 'utf8');
const json = f => JSON.parse(src(f));

// ------------------------------------------------------------------------------------------------------------ W8
test('W8: the loot rows are in drawn order (gold, yours, the party pile) and the arrows stop at the ends', () => {
  const d = { gold: 12, items: [{ uid: 'a' }, { uid: 'b', corpse: 7 }], free: [{ uid: 'c' }] };
  assert.deepEqual(C.lootRows(d).map(r => r.uid), ['gold', 'a', 'b', 'c']);
  assert.equal(C.lootRows(d)[2].corpse, 7, 'a row from another body keeps which body it lies on');
  assert.deepEqual(C.lootRows({ items: [] }), []);
  assert.equal(C.lootStep(0, 4, -1), 0); assert.equal(C.lootStep(3, 4, 1), 3); assert.equal(C.lootStep(1, 4, 1), 2); assert.equal(C.lootStep(5, 0, 1), 0);
});
test('W8: the two hints come from the binding table (interact = E takes the selected row, strike = F takes all) and the window listens for those default keys', () => {
  const loot = src('js/client/ui/loot.js');
  assert.match(loot, /dataset: \{ action: 'interact' \}/); assert.match(loot, /dataset: \{ action: 'strike' \}/);
  assert.equal(ACTION_BY_ID.interact.key, 'KeyE'); assert.equal(ACTION_BY_ID.strike.key, 'KeyF');
  assert.match(loot, /e\.code === 'KeyE'/); assert.match(loot, /e\.code === 'KeyF'/);
  assert.match(ACTION_BY_ID.interact.label, /loot window/); assert.match(ACTION_BY_ID.strike.label, /loot window/);
  assert.ok(ACTION_BY_ID.interact.pad && ACTION_BY_ID.strike.pad && ACTION_BY_ID.interact.touch, 'a pad button and a touch control each');
  assert.deepEqual(auditBindings(), []);
});

// ----------------------------------------------------------------------------------------------------------- W10
test('W10: one indicator per thing — unread mail is the yellow dot on the Party button and never a number there', () => {
  const p = badgePlan({ mail: 1 });
  assert.deepEqual(p['party-btn'], { n: 0, dot: true });
  assert.deepEqual(p['menu-mail'], { n: 1, dot: false }, 'inside the window the Mail tab says how many — a number, no second mark');
  const q = badgePlan({ mail: 2, friends: 1, guild: 1, bag: 3 });
  assert.deepEqual(q['party-btn'], { n: 2, dot: true }, 'friends + guild news is the number; mail stays the dot');
  assert.deepEqual(q['bag-btn'], { n: 3, dot: false });
  for (const [id, v] of Object.entries(badgePlan({}))) assert.deepEqual(v, { n: 0, dot: false }, id);
  // no button shows a number AND a dot for the SAME thing
  for (const k of ['mail', 'friends', 'guild', 'bag']) for (const v of Object.values(badgePlan({ [k]: 4 }))) assert.ok(!(v.n && v.dot));
  assert.doesNotMatch(src('js/client/ui/party-hub.js'), /classList\.toggle\('alert'/, 'only ui/unseen.js paints the dot');
  const u = createUnseen(); u.set('mail', 2); assert.equal(u.count('mail'), 2);
});

// ----------------------------------------------------------------------------------------------------------- W16
test('W16: the minimap canvas carries no tooltip of its own (it covered the pins\' cards)', () => {
  const mm = src('js/client/ui/minimap.js');
  assert.doesNotMatch(mm, /click for the map \(M\), wheel to zoom/);
  assert.doesNotMatch(mm, /h\('canvas\.mm-canvas', \{[^}]*title/);
});

// ------------------------------------------------------------------------------------------------------ W28 / W29
test('W29: my reports — states read plainly, the note is the completion text when completed, newest first', () => {
  const list = C.tidyMine([
    { id: 3, at: 100, kind: 'bug', text: 'a', state: 'completed', note: 'Fixed: the chest waits for you.', done: 'Fixed: the chest waits for you.', doneAt: 500, adminNote: 'dup of 2' },
    { id: 5, at: 300, kind: 'suggestion', text: 'b', state: 'approved', note: 'Good idea.' },
    { id: 4, at: 200, kind: 'weird', text: 'c', state: 'trashed' },
    { id: 6, at: 300, kind: 'bug', text: 'd', state: 'closed' }, null, { text: 'no id' },
  ]);
  assert.deepEqual(list.map(r => r.id), [6, 5, 4, 3]);
  assert.equal(list[3].note, 'Fixed: the chest waits for you.'); assert.equal(list[3].noteAt, 500);
  assert.equal(list[2].state, 'closed'); assert.equal(list[2].kind, 'suggestion');
  assert.equal(C.reportState('completed'), 'Completed'); assert.equal(C.reportState('closed'), 'Closed'); assert.equal(C.reportState('nonsense'), 'New');
  assert.match(C.noteHeading('completed'), /how it was fixed/);
  for (const s of ['new', 'approved', 'declined', 'completed', 'closed']) assert.ok(C.REPORT_STATES[s], s);
});
test('W29: Reply starts a NEW report whose text begins "#<id> " (once), and names the report it answers only when it is yours', () => {
  assert.equal(C.replyText(41), '#41 ');
  assert.equal(C.replyText(41, 'still broken'), '#41 still broken');
  assert.equal(C.replyText(41, '#12 still broken'), '#41 still broken', 'never two references');
  assert.equal(C.replyRef('#41 it happened again', [{ id: 41 }, { id: 7 }]), 41);
  assert.equal(C.replyRef('#99 not mine', [{ id: 41 }]), null);
  assert.equal(C.replyRef('no reference', [{ id: 41 }]), null);
  const fb = src('js/client/ui/feedback.js');
  assert.match(fb, /n\.myReports\(\)/); assert.match(fb, /n\.feedback\(o\.kind, o\.text, o\.ctx, o\.ref\)/);
  assert.match(fb, /n\.on\('feedbackMine'/);
});
test('W28: the admin sets Completed only with a note the player can read', () => {
  assert.equal(C.completeCheck('').ok, false); assert.equal(C.completeCheck('ok').ok, false);
  assert.equal(C.completeCheck('The chest now stays for two minutes.').ok, true);
  assert.equal(C.completeCheck('x'.repeat(C.NOTE_MAX + 1)).ok, false);
  const fb = src('js/client/ui/feedback.js');
  assert.match(fb, /act\('completed', 'Completed', 'primary'\)/); assert.match(fb, /\['completed', 'Completed'\]/, 'the filter offers Completed');
});

// ----------------------------------------------------------------------------------------------------------- W13
test('W13: hiding an event — any name it is known by matches, it comes back, and you cannot hide the one you stand in', () => {
  let saved = [];
  const H = C.createHidden({ load: () => saved, save: l => { saved = l; } });
  let fired = 0; H.onChange(() => fired++);
  assert.equal(H.has({ uid: 'e9', id: 'smugglers_stash', name: 'Smugglers\' Stash' }), false);
  H.hide({ uid: 'e9', id: 'smugglers_stash', name: 'Smugglers\' Stash' });
  assert.equal(H.has({ uid: 'e9' }), true, 'the tracker knows it by uid');
  assert.equal(H.has({ id: 'smugglers_stash' }), true, 'the map by id');
  assert.equal(H.has({ name: 'Smugglers\' Stash — wave 2/3' }), true, 'a progress frame only by name');
  assert.equal(H.has({ uid: 'e10', id: 'wolf_night', name: 'Night of Wolves' }), false);
  assert.ok(saved.length >= 3 && fired === 1);
  // a new store over the same storage: still hidden (the session)
  assert.equal(C.createHidden({ load: () => saved }).has({ id: 'smugglers_stash' }), true);
  assert.equal(H.show({ id: 'smugglers_stash' }), true);
  H.hide({ uid: 'x' }); assert.equal(H.showAll(), true); assert.equal(H.size, 0);
  assert.equal(C.canHideEvent({ state: 'live' }, true), false, 'not while you are in it');
  assert.equal(C.canHideEvent({ state: 'live' }, false), true);
  assert.equal(C.canHideEvent({ state: 'won' }, false), false);
  assert.match(src('js/client/ui/minimap.js'), /filter\(m => !m\.hiddenEv\)/);
  assert.match(src('js/client/ui/hidden-events.js'), /sessionStorage/);
});

// ----------------------------------------------------------------------------------------------------------- W15
const offices = json('data/provinces/offices.json'), townServices = json('data/provinces/town-services.json');
const towns = Object.entries(townServices.towns).map(([name], i) => ({ name, x: 1000 + i * 3000, z: 2000, r: 90 }));
const officeTowns = Object.values(offices.towns).map(t => { const m = /^z(\d+)_(\d+)$/.exec(t.zone); return { name: t.name, x: t.x + m[1] * 2048, z: t.z + m[2] * 2048, r: t.r }; });
const allTowns = [...officeTowns, ...towns.filter(t => !officeTowns.some(o => o.name === t.name))];
const services = C.buildServices({ offices, townServices, towns: allTowns, npcs: [{ id: 'angler_torborhold', role: 'angler', name: 'Tam Sedgeley', at: 'Torborhold', x: 25190, z: 5420 }, { id: 'shep', role: 'shepherd', name: 'Nobody', x: 1, z: 1 }] });
test('profession searches find teachers in every major town, including Bram at Torborhold\'s gate', () => {
  const professions = json('data/rules/professions.json');
  const trainers = json('data/provinces/professions.json').trainers;
  const list = C.buildServices({ offices, townServices, towns: allTowns, npcs: trainers, professions });
  for (const p of professions.professions.filter(p => !p.start)) {
    const matches = C.findServices(list, { query: `${p.name} trainer` });
    for (const town of officeTowns) assert.ok(matches.some(s => s.town === town.name && !s.approx), `${town.name}: ${p.name} has a precise map pin`);
    for (const s of matches) assert.ok(professions.roles[s.role].trains.includes(p.id), `${s.name} really teaches ${p.id}`);
  }
  const bram = trainers.find(t => t.id === 'prospector_torborhold');
  const matches = C.findServices(list, { query: 'mining trainer Torborhold' });
  const pin = matches.find(s => s.id === 'npc:' + bram.id);
  assert.ok(pin, 'Bram is visible in the mining search');
  assert.equal(pin.x, bram.x); assert.equal(pin.z, bram.z);
  assert.equal(pin.town, 'Torborhold'); assert.equal(pin.label, 'Mining trainer');
  assert.equal(matches.filter(s => s.id === pin.id).length, 1);
  assert.ok(C.findServices(list, { role: 'prospector' }).some(s => s.id === pin.id));
  for (const role of ['prospector', 'logger', 'forager', 'skinner']) assert.ok(C.serviceRoles(list).includes(role));
});
test('W15: the service list is built from the game\'s own data — every town\'s offices in world metres, placed NPCs, and E\'s town-services for the rest', () => {
  assert.ok(services.length > 200, `${services.length} services`);
  const stable = services.filter(s => s.role === 'stablehand');
  assert.ok(stable.length >= Object.keys(offices.towns).length, 'a stable in every office town');
  for (const s of services) { assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z), s.id); assert.ok(s.label && s.role, s.id); assert.doesNotMatch(s.label, /undefined|_/); }
  const ht = offices.towns.hollin_toll, door = ht.offices.find(o => o.role === 'stablehand').door;
  const mine = stable.find(s => s.town === 'Hollin Toll');
  assert.equal(Math.round(mine.x), Math.round(door.x + 11 * 2048)); assert.equal(Math.round(mine.z), Math.round(door.z + 1 * 2048));
  assert.ok(services.some(s => s.role === 'angler' && s.name === 'Tam Sedgeley' && s.town === 'Torborhold'));
  assert.ok(!services.some(s => s.role === 'shepherd'), 'a shepherd is not a service');
  // every settlement E lists has its services findable, also the ones with no office on record
  for (const [name, list] of Object.entries(townServices.towns)) if (list.includes('carter')) assert.ok(services.some(s => s.town === name && s.role === 'carter'), `${name}: carter`);
  assert.deepEqual(C.serviceRoles(services).slice(0, 2), ['stablehand', 'angler'], 'the filter leads with what the owner asked for');
});
test('W15: filter and search — plain words find things, and the towns that have them are listed nearest first', () => {
  assert.deepEqual(C.findServices(services, {}), [], 'nothing asked = nothing highlighted');
  const st = C.findServices(services, { role: 'stablehand' });
  assert.ok(st.length && st.every(s => s.role === 'stablehand'));
  for (const q of ['stable', 'horse', 'Stables', 'angler', 'fishing', 'potions', 'trainer', 'inn', 'smith', 'cart']) assert.ok(C.findServices(services, { query: q }).length, `"${q}" finds something`);
  assert.equal(C.findServices(services, { query: 'zzzz' }).length, 0);
  assert.ok(C.findServices(services, { query: 'stable hollin' }).every(s => s.town === 'Hollin Toll'), 'every word must match');
  const me = { x: officeTowns[0].x, z: officeTowns[0].z };
  const tw = C.townsWith(st, me);
  assert.equal(tw[0].town, officeTowns[0].name, 'the town you stand in comes first');
  for (let i = 1; i < tw.length; i++) assert.ok(tw[i].dist >= tw[i - 1].dist);
  assert.ok(tw.every(t => t.n >= 1 && t.labels.length));
  assert.ok(C.SERVICE_PIN_SCALE > 0.05 && C.SERVICE_PIN_SCALE < 0.6);
  for (const r of C.SERVICE_FILTERS) assert.ok(C.SERVICES[r]?.label, r);
});
test('W15: the map remembers its view for the session and only fits afresh for a different map', () => {
  const wm = src('js/client/ui/worldmap.js'), mt = src('js/client/ui/map-tools.js');
  assert.match(wm, /onOpen: \(\) => \{ openView\(\)/); assert.doesNotMatch(wm, /onOpen: \(\) => \{ fitPreset\(/);
  assert.match(wm, /onClose: \(\) => \{ hideCard\(\); remember\(\); \}/);
  assert.match(mt, /sessionStorage\.setItem\(VIEW_KEY/);
});

// ----------------------------------------------------------------------------------------------------------- W17
test('W17: a quest zone answers anywhere inside its ring — the smallest ring wins — and its card says the objective', () => {
  const ms = [{ id: 'q:a', kind: 'quest', area: true, x: 0, z: 0, r: 500, name: 'Big', quest: 'a' }, { id: 'qa:b:0', kind: 'quest', area: true, x: 50, z: 0, r: 60, name: 'Where they live', sub: '~6 cairn rats · level 1–2', quest: 'b' },
    { id: 'q:c', kind: 'quest', area: false, x: 0, z: 0, r: 30 }, { id: 'ev', kind: 'liveevent', x: 0, z: 0, r: 900 }];
  assert.equal(C.areaAt(ms, 40, 10).id, 'qa:b:0'); assert.equal(C.areaAt(ms, -300, 0).id, 'q:a'); assert.equal(C.areaAt(ms, 900, 900), null);
  const c = C.areaCard(ms[1], { name: 'Two Good Legs', goal: 'Kill cairn rats — 2/6' });
  assert.equal(c.title, 'Two Good Legs'); assert.deepEqual(c.lines[0], { label: 'Objective', text: 'Kill cairn rats — 2/6' }); assert.equal(c.lines[1].text, '~6 cairn rats · level 1–2');
  assert.match(C.areaCard({ ...ms[0], tracked: true }, { name: 'X', goal: 'Find it' }).foot, /Tracked/);
  assert.match(src('js/client/ui/map-render.js'), /m\.hot \?/, 'the renderer lights the hovered ring');
  assert.match(src('js/client/ui/minimap.js'), /questZoneAt\(/); assert.match(src('js/client/ui/worldmap.js'), /questZoneAt\(/);
});

// ----------------------------------------------------------------------------------------------------------- W12
test('W12: ! and ? on the map — gold for now, grey for not yet, nothing for board work, and never on top of the journal\'s own pin', () => {
  const bodies = [{ id: 9, name: 'Tam', x: 10, z: 10 }, { id: 11, name: 'Reeve', x: 50, z: 50 }, { id: 12, name: 'Board', x: 70, z: 70 }, { id: 13, name: 'Elder', x: 90, z: 90 }, { id: 14, name: 'Smith', x: 0, z: 0 }];
  const marks = new Map([[9, 'offer'], [11, 'turnin'], [12, 'job'], [13, 'later'], [14, 'active']]);
  const out = C.questMarkMarkers(bodies, marks, [{ kind: 'questdone', x: 51, z: 51 }]);
  assert.deepEqual(out.map(m => [m.id, m.glyph, m.grey]), [['qm:9', '!', false], ['qm:13', '!', true], ['qm:14', '?', true]]);
  assert.ok(out.every(m => m.kind === 'npcmark' && m.sub));
  assert.equal(C.questMarkMarkers(bodies, { 11: 'turnin' }, []).length, 1, 'a plain object of marks works too');
  assert.match(src('js/client/ui/pt8.js'), /n\.on\('questMarks', onMarks\)/);
  assert.match(src('js/client/ui/map-render.js'), /case 'npcmark'/);
});

// ----------------------------------------------------------------------------------------------------------- W27
test('W27: a title only over somebody placed for you to find — filler folk, guards and the old "Local" get no title line', () => {
  assert.equal(C.npcTitle({ title: 'Stable master', role: 'stablehand' }, 'Corwin Coombe'), 'Stable master');
  assert.equal(C.npcTitle({ filler: 1, role: 'woodcutter' }, 'Hob'), '');
  assert.equal(C.npcTitle({ filler: 1, title: 'Woodcutter' }, 'Hob'), '', 'filler wins even if a title slipped through');
  assert.equal(C.npcTitle({ guard: 1, role: 'guard' }, 'Torborhold Guard'), '');
  assert.equal(C.npcTitle({ role: 'woodcutter' }, 'Hob'), '', 'no role fallback any more');
  assert.equal(C.npcTitle({ title: 'Local' }, 'Hob'), ''); assert.equal(C.npcTitle({ title: 'Hob' }, 'Hob'), '');
  assert.equal(C.npcTitle({ role: 'smith', office: { kind: 'forge' } }, 'Bryn'), 'Smith', 'an older server: only someone who keeps a counter');
  assert.equal(C.npcTitle(null), '');
  assert.doesNotMatch(src('js/client/ui/pt2.js'), /ROLE_TITLE\[/);
});

// ----------------------------------------------------------------------------------------------------------- W21
test('W21: A\'s hits rows become meter records — heals, crits, misses, ticks, overkill — and feed the playground\'s Meter as it is', () => {
  const names = { 1: 'Xanaver', 4396: 'Road Brigand' };
  const o = { t: 3, nameOf: id => names[id] || '', skillName: id => (id === 'firebolt' ? 'Firebolt' : '') };
  const hit = C.meterRecord([1, 4396, 42, 2 | 8, 'firebolt', 'fire', 5, 0], o);
  assert.deepEqual([hit.kind, hit.amount, hit.crit, hit.killingBlow, hit.overkill, hit.dtype, hit.via, hit.viaName, hit.sourceName, hit.targetName], ['damage', 42, true, true, 5, 'fire', 'skill:firebolt', 'Firebolt', 'Xanaver', 'Road Brigand']);
  assert.equal(C.meterRecord([1, 4396, 7, 0, 'basic', null, 0, 0], o).viaName, 'Weapon attack');
  const heal = C.meterRecord([1, 1, 30, 1, 'mend', null, 12, 0], o); assert.deepEqual([heal.kind, heal.overheal, heal.viaName], ['heal', 12, 'Mend']);
  const miss = C.meterRecord([4396, 1, 0, 4 | 64, 'basic'], o); assert.deepEqual([miss.kind, miss.amount, miss.tags], ['miss', 0, ['dodged']]);
  const tick = C.meterRecord([1, 4396, 4, 32, 'dot', 'fire', 0, 0], o); assert.deepEqual([tick.via, tick.viaName], ['dot:fire', 'Burning']);
  assert.equal(C.meterRecord([1], o), null);
  assert.deepEqual(C.hitRowFromEvent({ type: 'hit', s: 1, d: 2, n: 9, crit: true, el: 'ice', skill: 'frost' }), [1, 2, 9, 2, 'frost', 'ice', 0, 0]);
  assert.equal(C.hitRowFromEvent({ type: 'hit', kind: 'heal', s: 1, d: 1, n: 5 })[3], 1);
  assert.equal(C.hitRowFromEvent({ type: 'miss', s: 2, d: 1, why: 'block' })[3], 4 | 16);
  assert.equal(C.hitRowFromEvent({ type: 'cast' }), null);
  const m = new Meter(); m.startFight('Road Brigand');
  for (const r of [hit, heal, miss, tick]) m.record(r);
  const rows = m.report('damage');
  assert.equal(rows[0].name, 'Xanaver'); assert.equal(rows[0].total, 46); assert.equal(rows[0].sources.length, 2);
  for (const v of Object.values(C.HIT_FLAGS)) assert.equal(v & (v - 1), 0, 'flags are single bits');
});
test('W21: fights are cut by 8 quiet seconds and named after the first enemy; ours = you, the party, their pets', () => {
  const k = C.createFightClock();
  assert.equal(k.feed(1, 'Road Brigand'), 'start'); assert.equal(k.feed(2, 'Brigand Archer'), 'same'); assert.equal(k.label(), 'Road Brigand +1');
  assert.equal(k.feed(2 + C.FIGHT_GAP_S + 0.1, 'Cairn Rat'), 'start'); assert.equal(k.label(), 'Cairn Rat'); assert.equal(k.count, 2);
  assert.equal(k.idle(100), true);
  const ours = C.meterOurs({ selfId: 1, partyIds: [2], actors: [{ id: 30, owner: 2 }, { id: 31, owner: 99 }] });
  assert.deepEqual([...ours].sort(), ['1', '2', '30']);
});
test('W21: Settings -> "Damage meter", default OFF, and the window asks the server for the feed only when it is on', () => {
  assert.equal(SETTINGS_DEFAULTS.meter, false); assert.equal(cleanSettings({ meter: true }).meter, true); assert.equal(cleanSettings({ meter: 'yes' }).meter, false);
  assert.match(src('js/client/ui/settings.js'), /check\('meter', 'Damage meter'/);
  const mw = src('js/client/ui/meter-window.js');
  assert.match(mw, /meters\/js\/meter\.js/); assert.match(mw, /meters\/js\/meter-ui\.js/); assert.match(mw, /n\.meter\(on\)/); assert.match(mw, /n\.on\('hits'/);
  assert.match(mw, /n\.on\('joined', \(\) => \{[^\n]*meter\(true\)/, 're-asked after every join (A: the flag does not survive a reconnect)');
});

// ------------------------------------------------------------------------------------------------------------ W5
test('W5: the cart window\'s rows — nearest first, fare / road / time, and a reason in words when you may not go', () => {
  const rows = C.cartRows({ gold: 12, tokens: 0, stops: [{ id: 'cart_far', name: 'Copperdell', fare: 20, m: 9000, s: 14 }, { id: 'cart_near', name: 'Mawehaven', fare: 7, m: 1800, s: 5 }, { id: 'cart_x', name: 'Gorsehold', fare: 9, m: 4000, s: 8, locked: true, why: 'level', msg: 'The carter will not take you there until you are level 12.' }] });
  assert.deepEqual(rows.map(r => r.name), ['Mawehaven', 'Gorsehold', 'Copperdell']);
  assert.equal(rows[0].locked, false);
  assert.equal(rows[1].why, 'The carter will not take you there until you are level 12.');
  assert.equal(rows[2].locked, true); assert.equal(rows[2].why, 'You need 8 more gold.');
  const tok = C.cartRows({ gold: 0, tokens: 1, stops: [{ id: 'a', name: 'A', fare: 54, m: 1 }] })[0];
  assert.equal(tok.locked, false); assert.equal(tok.token, true, 'a cart token pays any fare');
  assert.equal(C.rideText(5), 'about 5 seconds'); assert.equal(C.rideText(42), 'about 40 seconds'); assert.equal(C.rideText(130), 'about 2 minutes'); assert.equal(C.rideText(0), '');
  assert.equal(C.cartRefusal({ why: 'fight' }), 'Not while you are fighting.'); assert.equal(C.cartRefusal({ why: 'gold', msg: 'Short by 3 gold.' }), 'Short by 3 gold.');
  const ct = src('js/client/ui/cart-travel.js');
  assert.match(ct, /n\.cart\('go', id, to\)/); assert.match(ct, /n\.on\('cartList', open\)/);
  // E's real table reads cleanly
  const carts = json('data/provinces/carts.json'), from = Object.keys(carts.fares)[0];
  const real = C.cartRows({ gold: 9999, stops: carts.fares[from].slice(0, 12).map(f => ({ id: f.to, name: carts.stops.find(s => s.id === f.to)?.town, fare: f.gold, m: f.metres, s: 6 })) });
  assert.ok(real.length >= 5 && real.every(r => r.name && r.fare >= 0 && !/undefined|NaN/.test(JSON.stringify(r))));
});

// ---------------------------------------------------------------------------------------------------- W19 / W22
test('W19: a backpack says "+N bag slots", and will not come off while its extra room is holding things', () => {
  const pack = { name: 'Trail Rucksack', slot: 'back', bagSlots: 6, bagText: '+6 bag slots' };
  assert.equal(C.bagSlotsText(pack), '+6 bag slots'); assert.equal(C.bagSlotsText({ bagSlots: 1 }), '+1 bag slot'); assert.equal(C.bagSlotsText({ name: 'Cloak' }), '');
  assert.equal(C.packRefusal(pack, { bagCount: 30, bagMax: 46 }), '', '30 things + the pack itself fit in 40');
  assert.equal(C.packRefusal(pack, { bagCount: 39, bagMax: 46 }), '', '39 + the pack = 40');
  assert.match(C.packRefusal(pack, { bagCount: 40, bagMax: 46 }), /^Empty 1 more bag slot first/);
  assert.match(C.packRefusal(pack, { bagCount: 46, bagMax: 46 }), /^Empty 7 more bag slots first/);
  // a swap: the new piece leaves the bag as the old one enters it
  assert.equal(C.packRefusal(pack, { bagCount: 40, bagMax: 46, next: { name: 'Cloak' } }), '');
  assert.equal(C.packRefusal(pack, { bagCount: 44, bagMax: 46, next: { bagSlots: 4 } }), '', '44 things fit the 44 squares a smaller pack leaves');
  assert.match(C.packRefusal(pack, { bagCount: 45, bagMax: 46, next: { bagSlots: 4 } }), /^Empty 1 more/);
  assert.equal(C.packRefusal(pack, { bagCount: 46, bagMax: 46, next: { bagSlots: 8 } }), '', 'a bigger pack always fits');
  assert.equal(C.packRefusal({ name: 'Cloak', slot: 'back' }, { bagCount: 40, bagMax: 40 }), '');
  const bag = src('js/client/bag.js');
  assert.match(bag, /p\.bagMax != null/); assert.match(bag, /why === 'bagSlots'/); assert.match(src('js/client/ui/item-card.js'), /bagSlotsText\(item\)/);
});
test('W22: the paper doll has no Light slot', () => {
  assert.ok(!DOLL_SLOTS.includes('light'));
  assert.ok(DOLL_SLOTS.includes('back') && DOLL_SLOTS.includes('waist'));
});

// ----------------------------------------------------------------------------------------------------------- W25
test('W25: an item\'s icon is THE model it draws when worn — for every base in the rules and every row of the gear catalog', () => {
  const catalog = createGearCatalog(JSON.parse(readFileSync(join(GAME, '..', '..', 'avatar-3d', 'data', 'gear-catalog.json'), 'utf8')));
  const gear = json('data/rules/gear-tv.json'), pool = json('data/rules/loot-pool.json');
  const opts = { catalog, baseOf: () => null };
  const worn = (it, slot) => wornPart(it, slot, opts);
  const items = [];
  const walk = (o, path = '') => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { for (const v of o) walk(v, path); return; }
    if ((o.slot || o.type === 'weapon') && (o.id || o.key || o.base)) items.push({ ...o, baseKey: o.baseKey || o.key || o.id || o.base, name: o.name || o.id || o.key });
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') { if (!Array.isArray(v) && (v.slot || v.type === 'weapon') && !v.id && !v.key) items.push({ ...v, baseKey: k, name: v.name || k }); walk(v, path + '/' + k); } };
  walk(gear); walk(pool);
  for (const row of catalog.rows || catalog.list?.() || []) items.push({ baseKey: row.id, g5: row.id, name: row.name || row.id, slot: row.game || row.gameSlot || null, type: row.kind === 'weapon' ? 'weapon' : undefined, _row: row });
  const SLOTMAP = { cape: 'back', belt: 'waist', neck: 'necklace', cloak: 'back' };
  let checked = 0;
  for (const raw of items) {
    const it = { ...raw, slot: SLOTMAP[raw.slot] || raw.slot };
    const slot = slotOf(it); if (!slot || ['mount', 'tool', 'light'].includes(slot)) continue;
    const spec = iconSpec(it, { worn });
    const look = gearLook({ [slot === 'ring2' ? 'ring' : slot]: it }, opts);
    if (spec.kind === 'held') assert.deepEqual(spec.part, look.held, `${it.name}: the icon's weapon is the one in the hand`);
    else if (spec.kind === 'offhand') assert.deepEqual(spec.part, look.offhand, `${it.name}: the icon's off-hand piece is the one on the arm`);
    else if (spec.kind === 'worn') for (const [k, v] of Object.entries(spec.parts)) assert.deepEqual(v, look[k], `${it.name}: the icon's ${k} is what the body wears`);
    else assert.ok(['ring', 'ring2', 'necklace', 'offhand'].includes(slot) || !wornPart(it, slot, opts).part?.id || wornPart(it, slot, opts).part.id === 'none', `${it.name} (${slot}): a glyph only where the body draws nothing`);
    assert.ok(spec.key && !/undefined/.test(spec.key));
    checked++;
  }
  assert.ok(checked > 60, `${checked} items checked`);
  // two different models never share a picture
  const a = iconSpec({ name: 'War Helm', baseKey: 'war_helm', slot: 'head', tier: 'heavy' }, { worn }), b = iconSpec({ name: 'Leather Cap', baseKey: 'leather_cap', slot: 'head', tier: 'light' }, { worn });
  assert.notEqual(a.key, b.key);
  assert.deepEqual(a.parts.hat, gearLook({ head: { name: 'War Helm', baseKey: 'war_helm', slot: 'head', tier: 'heavy' } }, opts).hat);
});
test('W25: the icon files keep no look table of their own and wait for the look data', () => {
  const core = src('js/client/ui/inv-core.js'), icons = src('js/client/ui/item-icons.js');
  assert.doesNotMatch(core, /ARMOUR_PARTS|PLAIN_HELD/); assert.doesNotMatch(icons, /heldLookFor|offhandLookFor|farhold\/js\/rpg/);
  assert.match(icons, /wornPart\(item, slot, gearOpts\(/); assert.match(icons, /if \(!lookDataReady\(\)\) \{ loadLooks\(\); return null; \}/);
  assert.match(icons, /const VERSION = 'v4'/, 'the old pictures are not served from the cache');
});

// ---------------------------------------------------------------------------------------------------- W11 / W23
test('W11: the level-5 gates ask the account (its highest character), not the character you are on', () => {
  assert.equal(accountLevel({ joined: { you: { acct: { level: 12 } } } }, 1), 12);
  assert.equal(accountLevel({ chars: [{ level: 3 }, { level: 8 }] }, 1), 8);
  assert.equal(accountLevel(null, 4), 4);
  assert.equal(channelGate('zone', { claimed: true, level: accountLevel({ joined: { you: { acct: { level: 9 } } } }, 1) }), null);
  assert.match(channelGate('zone', { claimed: true, level: 2 }), /one of your characters reaches level 5/);
});
test('W23: the kit screen shows what sets each choice apart (C\'s `role` tag and `diff` sentence)', () => {
  const ks = src('js/client/ui/kit-step.js');
  assert.match(ks, /k\.role \? h\('span\.kit-role'/); assert.match(ks, /k\.diff \? h\('p\.kit-diff'/);
});

// -------------------------------------------------------------------------------------------- the round as a whole
test('every new interface file is in the gallery (a scene, or a reason), the hub is created in main.js AND on the gallery stage, and pt8.css is listed', () => {
  const main = src('js/client/main.js'), stage = src('js/client/gallery/stage.js');
  for (const s of [main, stage]) { assert.match(s, /createUi8\(\{/); assert.match(s, /ui8\.wire\(net\)/); assert.match(s, /ui8\.tick\(dt\)/); }
  assert.match(src('index.html'), /css\/pt8\.css/);
  for (const f of readdirSync(join(GAME, 'js/client/ui')).filter(n => /^(pt8|map-tools|meter-window|cart-travel|hidden-events)/.test(n))) assert.match(src('js/client/gallery/scenes.js'), new RegExp(f.replace('.', '\\.')), `${f} has a scene`);
  // P-client's two doors
  assert.match(src('js/client/ui/char-sheet.js'), /addSection\(id, title, drawFn/); assert.match(src('js/client/ui/journal.js'), /addTab\(id, label, drawFn\)/);
});
test('no player-facing text in the new files uses a word the owner banned, and nothing prints a raw number', () => {
  for (const f of ['pt8.js', 'pt8-core.js', 'map-tools.js', 'meter-window.js', 'cart-travel.js', 'hidden-events.js']) {
    const text = src('js/client/ui/' + f).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(text, /\bmuster/i, f);
    assert.doesNotMatch(text, /'[^'\n]*\b(ember|veil)\w*[^'\n]*'/i, f);
  }
});
