// Wrap-up, 3D client (2026-10-13) — the round 10 things the rules and the server already sent and the client ignored:
// Y5 emotes, Y8 corpses and targeting, Y12 a wind-up that moves, Y25 carried zones, Y20 the held beam, Y4 fish pools,
// Y3 stars over a corpse, Y2 farm plots on a slope.
// Run: node --test prototypes/thousandvale/tests/D/wrap-3d.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const R = p => new URL('../../' + p, import.meta.url);
const src = p => readFileSync(R(p), 'utf8');

const { choosePick, emptyCorpse, pickable, tabPick, NEAR } = await import('../../js/client/pick-rule.js');
const { createActors, EMOTE_CLIP, EMOTE_HOLD, emoteMs } = await import('../../js/client/actors.js');
const { createTelegraphs } = await import('../../js/client/telegraphs.js');
const { carriedBy, zoneDrawMs, carryOffset } = await import('../../js/client/zone-follow.js');
const { createBeamBook, beamColours } = await import('../../js/client/beam-fx.js');
const { poolMarker, POOL_TINT } = await import('../../js/client/angling-view.js');
const { createStatusSync } = await import('../../js/client/status-sync.js');
const { planSetPieces, drapeLong, drapeJoin, drapePose, DRAPE_SEG } = await import('../../js/client/setpiece-view.js');
const MOTION = await import('../../../../avatar-3d/js/chibi2-motion.js');
const { EVENT_TYPES, EVENT_FIELDS } = await import('../../js/net/protocol.js');

const camera = () => { const c = new THREE.PerspectiveCamera(50, 1, 0.1, 500); c.position.set(0, 1, 10); c.lookAt(0, 1, 0); c.updateMatrixWorld(true); c.updateProjectionMatrix(); return c; };
const body = (id, o = {}) => ({ id, kind: 'monster', name: 'Wolf', level: 1, hp: 10, hpMax: 10, hostile: true, x: 0, y: 0, z: 0, ...o });

// ---------------------------------------------------------------------------------------------------- Y5
test('Y5: every emote the server sends has a clip the body really has; sit and dance hold, the rest play once', () => {
  for (const e of ['wave', 'sit', 'dance', 'cheer', 'bow', 'point']) {
    assert.ok(EMOTE_CLIP[e], `${e} has a clip`);
    assert.ok([...MOTION.CHIBI2_ANIMS, ...MOTION.CHIBI2_EMOTE_ANIMS].includes(EMOTE_CLIP[e]), `${EMOTE_CLIP[e]} is a Chibi 2 clip`);
    assert.ok(MOTION.CHIBI2_CLIP_SECONDS[EMOTE_CLIP[e]] > 0, `${EMOTE_CLIP[e]} has a length`);
    assert.match(src('js/sim/province.js'), new RegExp(`\\b${e}\\b`), `the server knows ${e}`);
  }
  assert.deepEqual([...EMOTE_HOLD].sort(), ['dance', 'sit']);
  for (const e of EMOTE_HOLD) assert.ok(!MOTION.ONE_SHOTS.has(EMOTE_CLIP[e]), `${e} loops`);
  assert.equal(emoteMs('wave', 3000), 3000, 'the wave while a mount is called lasts as long as the call');
  assert.equal(emoteMs('cheer'), Math.round(MOTION.CHIBI2_CLIP_SECONDS.cheer * 1000), 'otherwise the clip\'s own length');
  assert.equal(emoteMs('nonsense'), 0);
  // the clips are asked for when a body is built (a clip that is not in the list does not exist on the body)
  const list = /const CHIBI_ANIMS = \[([^\]]+)\]/.exec(src('js/client/actors.js'))[1];
  for (const c of new Set(Object.values(EMOTE_CLIP))) assert.match(list, new RegExp(`'${c}'`), `${c} is built into every body`);
  // and the event reaches the actors
  assert.ok(EVENT_TYPES.includes?.('emote') ?? EVENT_TYPES.has('emote'));
  assert.deepEqual(EVENT_FIELDS.emote, ['id', 'e', 'ms?', 'end?']);
  assert.match(src('js/client/main.js'), /case 'emote': actors\.playEmote\(ev\.id, ev\.e, \{ ms: ev\.ms, end: !!ev\.end \}\)/);
});

test('Y5: a dance holds until it is ended, a step or a swing; a wave is a one-off; a corpse and a beast do nothing', () => {
  const A = createActors(new THREE.Scene(), { plateLayer: null, camera: camera() });
  A.add(body(1, { kind: 'player', hostile: false })); A.add(body(2)); A.add(body(3, { kind: 'player', hostile: false, hp: 0 }));
  assert.equal(A.playEmote(1, 'dance'), true);
  assert.equal(A.get(1).emote, 'dance');
  assert.equal(A.playEmote(1, 'dance', { end: true }), true);
  assert.equal(A.get(1).emote, null, '`end: 1` stops it');
  A.playEmote(1, 'sit'); assert.equal(A.get(1).emote, 'sitGround');
  A.playAttack(1, 2); assert.equal(A.get(1).emote, null, 'a swing ends it');
  A.playEmote(1, 'dance'); A.setDead(1, true); assert.equal(A.get(1).emote, null, 'dying ends it'); A.setDead(1, false);
  assert.equal(A.playEmote(1, 'wave', { ms: 2500 }), true);
  const a = A.get(1);
  assert.equal(a.oneShot, 'wave'); assert.equal(a.emote, null);
  assert.ok(a.oneShotUntil - performance.now() > 2300 && a.oneShotUntil - performance.now() <= 2500);
  A.playEmote(1, 'wave', { end: true }); assert.equal(a.oneShot, null, 'an early end stops the one-off too');
  assert.equal(A.playEmote(1, 'bow'), true); assert.equal(a.oneShot, 'bowGreet');
  assert.equal(A.playEmote(2, 'dance'), false, 'a wolf has no dance');
  assert.equal(A.playEmote(3, 'dance'), false, 'nor has a corpse');
  assert.equal(A.playEmote(1, 'moonwalk'), false);
  assert.equal(A.playEmote(99, 'wave'), false);
});

// ---------------------------------------------------------------------------------------------------- Y8
test('Y8: an emptied corpse cannot be picked; a live body beats a corpse; a live enemy beside the cursor beats the corpse under it', () => {
  const live = { id: 1, kind: 'monster', hostile: true, dead: false }, corpse = { id: 2, kind: 'monster', hostile: true, dead: true, lootMark: 'magic' };
  const empty = { id: 3, kind: 'monster', hostile: true, dead: true, lootMark: null }, fallen = { id: 4, kind: 'player', dead: true }, friend = { id: 5, kind: 'npc', hostile: false, dead: false };
  assert.equal(emptyCorpse(empty), true); assert.equal(emptyCorpse(corpse), false); assert.equal(emptyCorpse(fallen), false, 'a fallen player is a revive target'); assert.equal(emptyCorpse(live), false);
  assert.equal(pickable(empty), false);
  // the corpse is nearer the camera, the live one behind it: the live one wins
  assert.equal(choosePick([{ a: corpse, t: 5, miss: 0.2 }, { a: live, t: 9, miss: 0.6 }]), live);
  assert.equal(choosePick([{ a: live, t: 9, miss: 0.6 }, { a: corpse, t: 5, miss: 0.2 }]), live, 'in either order');
  // an emptied corpse in front of a lootable one: the click goes through it
  assert.equal(choosePick([{ a: empty, t: 3, miss: 0.1 }, { a: corpse, t: 8, miss: 0.5 }]), corpse);
  assert.equal(choosePick([{ a: empty, t: 3, miss: 0.1 }]), null, 'and to the ground when nothing is behind it');
  // on a corpse, with a live enemy just beside the cursor
  assert.equal(choosePick([{ a: corpse, t: 5, miss: 0.3 }, { a: live, t: 6, miss: 1.3 }]), live);
  assert.equal(choosePick([{ a: corpse, t: 5, miss: 0.3 }, { a: friend, t: 6, miss: 1.3 }]), corpse, 'a friend beside it does not steal the click');
  assert.equal(choosePick([{ a: corpse, t: 5, miss: 0.3 }, { a: live, t: 6, miss: NEAR + 0.1 }]), corpse, 'nor an enemy further off than "beside"');
  assert.equal(choosePick([{ a: live, t: 6, miss: 1.3 }]), null, 'a near miss alone is a miss, as it always was');
  // two live bodies: the nearer one, as before
  const other = { id: 6, kind: 'monster', hostile: true, dead: false };
  assert.equal(choosePick([{ a: live, t: 9, miss: 0.5 }, { a: other, t: 4, miss: 0.9 }]), other);
  assert.equal(choosePick([{ a: fallen, t: 4, miss: 0.5 }]), fallen);
  assert.equal(choosePick([]), null);
});

test('Y8: the real pick ray — a corpse lying in front of a live wolf, then emptied', () => {
  const cam = camera();
  const A = createActors(new THREE.Scene(), { plateLayer: null, camera: cam });
  A.add(body(1, { z: 0 })); A.add(body(2, { z: 4 })); A.setDead(2, true);      // 2 is the corpse, nearer the camera, same line of sight
  const centre = new THREE.Vector2(0, -0.05);
  assert.equal(A.pickAt(centre), A.get(1), 'no loot on the corpse: the click goes through it to the wolf');
  A.get(2).lootMark = 'rare';
  assert.equal(A.pickAt(centre), A.get(1), 'loot on the corpse, a live wolf on the same line: the wolf');
  A.setDead(1, true); A.get(1).lootMark = null;
  assert.equal(A.pickAt(centre), A.get(2), 'the wolf dead and empty: the corpse with loot');
  A.get(2).lootMark = null;
  assert.equal(A.pickAt(centre), null, 'both emptied: nothing — the click reaches the ground');
  // beside the cursor: the corpse dead centre, a live wolf 1.2 m to the side (its click radius is 0.9 m)
  A.add(body(7, { x: 1.2, z: 4 })); A.get(2).lootMark = 'magic';
  const onCorpse = new THREE.Vector3(0, 0.5, 4).project(cam);
  assert.equal(A.pickAt(new THREE.Vector2(onCorpse.x, onCorpse.y)), A.get(7), 'the live one beside the corpse');
  assert.equal(A.pickAt(new THREE.Vector2(onCorpse.x, onCorpse.y), { exclude: 7 }), A.get(2));
});

test('Y8: Tab steps over corpses, and a looted corpse you had targeted is let go', () => {
  const dead = new Set([11]);
  assert.equal(tabPick([10, 11, 12], 10, id => dead.has(id)), 12, 'the corpse between two wolves is skipped');
  assert.equal(tabPick([10, 11, 12], 12, id => dead.has(id)), 10, 'and it wraps');
  assert.equal(tabPick([11], 0, id => dead.has(id)), 0, 'only corpses in range: nothing');
  assert.equal(tabPick([10, 12], 11, () => false), 10, 'a target that is not in the list starts from the front');
  const main = src('js/client/main.js');
  assert.match(main, /tabPick\(order, S\.target \|\| 0, i => !!actors\.get\(i\)\?\.dead\)/);
  assert.match(main, /net\.on\('lootable', m => \{[^\n]*m\.on === false && S\.target === m\.id[^\n]*setTarget\(null\)/);
});

// ---------------------------------------------------------------------------------------------------- Y12
test('Y12: `teleM` moves a live wind-up to where the knock put its caster; an interrupt takes it away at once', () => {
  let now = 0;
  const scene = new THREE.Scene();
  const tele = createTelegraphs(scene, { heightAt: () => 0, serverNow: () => now, posOf: () => null, selfPos: () => ({ x: 0, z: 0 }), selfId: () => 1 });
  tele.add({ id: 5, s: 40, ab: 'breath', k: 'cone', shape: 'cone', x: 0, z: 0, yaw: 0, r: 8, arc: 1.2, ms: 2000 }, 0);
  const t = tele.live.get(5), firstX = () => t.mesh.geometry.attributes.position.getX(0);
  tele.update(0.016);
  assert.equal(tele.standingInDanger, true, 'standing at its mouth');
  const x0 = firstX();
  assert.equal(tele.move({ id: 5, x: 6, z: -30 }), true);
  tele.update(0.016);
  assert.equal(tele.standingInDanger, false, 'the danger test moves the moment the message arrives');
  assert.ok(t.x > 0 && t.x < 6, 'the drawing is on its way');
  for (let i = 0; i < 40; i++) tele.update(0.016);
  assert.ok(Math.abs(t.x - 6) < 1e-6 && Math.abs(t.z + 30) < 1e-6, 'and arrives exactly');
  assert.ok(Math.abs((firstX() - x0) - 6) < 1e-3, 'the mesh itself moved 6 m, not just the record');
  assert.equal(t.goal, null);
  // a move for a shape that is not there, or with junk in it, is ignored
  assert.equal(tele.move({ id: 99, x: 1, z: 1 }), false);
  assert.equal(tele.move({ id: 5, x: NaN, z: 1 }), false);
  // a landing with a move still gliding lands where the rules had it
  tele.move({ id: 5, x: 10, z: -30 });
  tele.resolve({ id: 5, hits: [] });
  assert.equal(t.x, 10);
  assert.equal(tele.move({ id: 5, x: 0, z: 0 }), false, 'a landed shape does not move again');
  // interrupted: the server's `teleR {x:1, why:'interrupted'}` removes it with no fade…
  tele.add({ id: 6, s: 40, k: 'circle', shape: 'circle', x: 0, z: 0, r: 4, ms: 2000 }, 0);
  tele.add({ id: 7, s: 40, k: 'circle', shape: 'circle', x: 3, z: 0, r: 4, ms: 2000 }, 0);
  tele.resolve({ id: 6, x: 1, why: 'interrupted' });
  assert.equal(tele.live.has(6), false);
  // …and `fx interrupt {id}` drops every other wind-up of that monster without waiting for theirs
  assert.equal(tele.dropSource(40), 1);
  assert.equal(tele.live.has(7), false);
  assert.equal(scene.getObjectByName('telegraphs').children.length, 1, 'only the landed shape (still flashing) is left in the scene');
  const main = src('js/client/main.js');
  assert.match(main, /case 'teleM': tele\.move\(ev\)/);
  assert.match(main, /ev\.kind === 'interrupt' && ev\.id != null\) \{ tele\.dropSource\(ev\.id\)/);
  assert.ok(EVENT_FIELDS.teleM.join() === 'id,x,z');
});

// ---------------------------------------------------------------------------------------------------- Y25
test('Y25: a zone with `follow` is shifted by how far its owner has moved since it was cast', () => {
  assert.equal(carriedBy({ kind: 'place', follow: 41 }), 41);
  assert.equal(carriedBy({ kind: 'place', follow: 0 }), 0, 'entity 0 is a real id');
  assert.equal(carriedBy({ kind: 'place' }), null);
  assert.equal(carriedBy({ kind: 'place', follow: null }), null);
  assert.equal(carriedBy(null), null);
  const hill = (x, z) => x * 0.1;
  const base = { x: 100, y: hill(100, 50), z: 50 };
  assert.deepEqual(carryOffset(base, { x: 100, z: 50 }, hill), { x: 0, y: 0, z: 0 }, 'nobody moved: nothing shifts');
  const o = carryOffset(base, { x: 112, z: 45 }, hill);
  assert.equal(o.x, 12); assert.equal(o.z, -5); assert.ok(Math.abs(o.y - 1.2) < 1e-9, 'and it climbs the hill with them');
  assert.deepEqual(carryOffset(base, null, hill), { x: 0, y: 0, z: 0 });
  assert.equal(zoneDrawMs({ seconds: 6 }), 6000);
  assert.equal(zoneDrawMs({ seconds: 10 }), 6000, 'a zone left on the ground keeps the old cap');
  assert.equal(zoneDrawMs({ seconds: 10, follow: 3 }), 10000, 'a carried one is drawn for its whole life (Blessed Earth + Cathedral)');
  assert.equal(zoneDrawMs({ seconds: null, follow: 3 }), 2000, 'an aura with no end (sent as null) is a short flourish, as before');
  // the rules really send it, and the drawing really reads it
  assert.match(src('js/rules/cast-skills.js'), /kind: 'place'[^\n]*\{ follow: rides \}/);
  const sp = src('js/client/spells.js');
  assert.match(sp, /const rides = carriedBy\(ev\), ms = zoneDrawMs\(ev\)/);
  assert.match(sp, /if \(rides != null\) carry\(rec, rides, c\)/);
  assert.match(sp, /moveCarried\(\); beams\.update\(dt\)/);
});

// ---------------------------------------------------------------------------------------------------- Y20
test('Y20: one held beam per caster — it starts, flares on each pulse, takes each pulse\'s real line, and ends', () => {
  const B = createBeamBook();
  const b = B.start({ kind: 'beam', id: 9, skill: 'storm_beam', el: 'lightning', x: 0, z: 0, yaw: 0.5, len: 30, w: 2.4, ms: 2200, pulses: 6, every: 400 }, 1000);
  assert.equal(B.live.size, 1); assert.equal(b.len, 30); assert.equal(b.yaw, 0.5); assert.equal(b.pulses, 6);
  assert.equal(B.flare(b, 1000), 0, 'no flare before the first pulse');
  for (let n = 1; n <= 6; n++) {
    const at = 1000 + (n - 1) * 400;
    assert.ok(B.pulse({ kind: 'beamPulse', id: 9, skill: 'storm_beam', n, of: 6 }, at));
    assert.equal(b.n, n);
    assert.equal(B.flare(b, at), 1, 'full on the frame it lands');
    assert.ok(B.flare(b, at + 150) > 0.3 && B.flare(b, at + 150) < 0.7);
    assert.equal(B.flare(b, at + 350), 0, 'gone before the next one');
    assert.deepEqual(B.tick(at + 399), [], 'still burning between pulses');
  }
  // a pulse's own line: turned, and cut short by a dungeon wall
  assert.ok(B.aim({ kind: 'spell', id: 9, ab: 'storm_beam', shape: 'beam', x: 0, z: 0, to: { x: 12, z: 0 }, w: 2.4, len: 12 }));
  assert.ok(Math.abs(b.yaw - Math.PI / 2) < 1e-9); assert.equal(b.len, 12);
  assert.equal(B.aim({ kind: 'spell', id: 9, ab: 'chain_spark', shape: 'beam', x: 0, z: 0, to: { x: 0, z: 5 } }), null, 'another skill\'s beam is not this one');
  assert.equal(B.aim({ kind: 'spell', id: 9, ab: 'storm_beam', shape: 'ground', x: 0, z: 0 }), null);
  assert.equal(B.aim({ kind: 'spell', id: 77, ab: 'storm_beam', shape: 'beam', x: 0, z: 0, to: { x: 0, z: 5 } }), null, 'nor somebody else\'s');
  // the end: it fades for a moment, then it is gone
  B.end({ kind: 'beamEnd', id: 9, skill: 'storm_beam', why: 'done' }, 3200);
  assert.equal(B.fade(b, 3200), 1); assert.ok(B.fade(b, 3280) < 1 && B.fade(b, 3280) > 0);
  assert.equal(B.pulse({ id: 9, n: 7 }, 3210), null, 'no pulse after the end');
  assert.deepEqual(B.tick(3250), []);
  assert.deepEqual(B.tick(3400), [9]);
  assert.equal(B.live.size, 0);
});

test('Y20: a beam cannot outlive its caster, its own time, or a lost `beamEnd`', () => {
  const B = createBeamBook();
  B.start({ id: 1, skill: 'storm_beam', len: 30, w: 2.4, ms: 2200 }, 0);
  B.start({ id: 2, skill: 'storm_beam', len: 30, w: 2.4, ms: 2200 }, 0);
  B.start({ id: 3, skill: 'storm_beam', len: 30, w: 2.4, ms: 2200 }, 0);
  assert.deepEqual(B.tick(100, id => id !== 1), [1], 'the caster died or left the screen: gone the same frame');
  assert.equal(B.drop(2), true, 'spells.ownerGone -> beams.drop');
  assert.deepEqual(B.tick(2800), [], 'inside the grace after its 2.2 s');
  B.tick(3000); assert.ok(B.live.get(3).endAt > 0, 'no `beamEnd` ever came: it ends itself');
  assert.deepEqual(B.tick(3300), [3]);
  // a new cast on the same caster replaces the old beam
  B.start({ id: 4, len: 10, ms: 1000 }, 0); B.start({ id: 4, len: 20, ms: 1000 }, 500);
  assert.equal(B.live.size, 1); assert.equal(B.live.get(4).len, 20);
  assert.equal(beamColours('lightning').length, 3); assert.deepEqual(beamColours('no such element'), beamColours('arcane'));
  // wiring: the three events reach it, a pulse's flash is not drawn twice, a dead caster's beam goes with their zones
  const sp = src('js/client/spells.js');
  assert.match(sp, /case 'beam': case 'beamPulse': case 'beamEnd': beams\.onFx\(ev\)/);
  assert.match(sp, /if \(ev\.shape === 'beam' && beams\.aim\(ev\)\) break;/);
  assert.match(sp, /function ownerGone\(src\) \{[^\n]*beams\.drop\(src\)/);
  assert.match(src('js/client/main.js'), /spells\.beams\.sample\(\)/, 'its two programs are compiled in the boot warm-up');
  // nothing is created per pulse: the only `new THREE.` after the rig is built are in makeRig / sample / the factory itself
  const bf = src('js/client/beam-fx.js'), draw = bf.slice(bf.indexOf('  function redraw('), bf.indexOf('  return {\n    book, stats, group,'));
  assert.ok(!/new THREE\./.test(draw), 'redraw() and draw() allocate no three.js objects');
  // and the rules send what this reads
  const cs = src('js/rules/cast-skills.js');
  for (const k of ["kind: 'beam'", "kind: 'beamPulse'", "kind: 'beamEnd'"]) assert.ok(cs.includes(k), k);
});

// ---------------------------------------------------------------------------------------------------- Y4
test('Y4: an ordinary fish pool has ripples only; the top tier keeps a marker in its own colour', () => {
  assert.equal(poolMarker(1), null, 'Fish pool');
  assert.equal(poolMarker(2), null, 'Busy fish pool');
  assert.deepEqual(poolMarker(3), { colour: POOL_TINT[3] }, 'Deep fish pool');
  assert.equal(poolMarker(undefined), null); assert.equal(poolMarker(0), null);
  assert.deepEqual(poolMarker(4), { colour: POOL_TINT[3] });
  // the server's tiers are 1..3 and that is the field the client reads
  assert.match(src('js/sim/angling.js'), /const tier = Math\.max\(1, Math\.min\(3, s\.tier \| 0 \|\| 1\)\)/);
  const av = src('js/client/angling-view.js');
  assert.match(av, /setMarker\(p\);\s+\/\/ Y4/);
  assert.ok(!/p\.glint = new THREE\.Mesh\(glintGeo, ringMat\(\)\); p\.glint\.material\.color\.set\(tint\)/.test(av), 'the shaft is no longer made for every pool');
});

// ---------------------------------------------------------------------------------------------------- Y3
test('Y3: an aura drawn on a corpse by a late event (the killing blow\'s own stun) is cleared — nothing floats over the dead', () => {
  const on = new Map();                       // group -> Set of auras really drawn
  const fx = {
    status(g, s, o) { if (!on.has(g)) on.set(g, new Set()); if (o) on.get(g).add(s); else on.get(g).delete(s); },
    clearStatus(g) { on.get(g)?.clear(); }, statusesOn(g) { return [...(on.get(g) || [])]; },
  };
  const wolf = { id: 5, dead: true, group: {}, pos: { x: 0, y: 0, z: 0 } }, live = { id: 6, dead: false, group: {}, pos: { x: 0, y: 0, z: 0 } };
  const actors = { actors: new Map([[5, wolf], [6, live]]), get: id => actors.actors.get(id) };
  const st = createStatusSync({ actors, fx, infoOf: id => (id === 6 ? { st: ['stun'] } : { st: [] }) });
  // the bug: spells.js drew the stars on the corpse; status-sync refused to BOOK an aura on a corpse, so it never cleared it
  fx.status(wolf.group, 'stun', true);
  st.onEvent({ type: 'fx', kind: 'status', id: 5, status: 'stun', on: true });
  assert.equal(wolf.auras?.drawn.size || 0, 0, 'not in the book');
  st.update(1000);
  assert.deepEqual(fx.statusesOn(wolf.group), [], 'cleared anyway: the effects are asked what is really there');
  assert.deepEqual(fx.statusesOn(live.group), ['stun'], 'a live body keeps its stars');
  // and they are no longer drawn in the first place
  assert.match(src('js/client/spells.js'), /if \(!a \|\| \(a\.dead && ev\.on !== false\)\) break;/);
  // a corpse that has finished sinking away takes everything on its group with it
  assert.match(src('js/client/actors.js'), /a\.group\.visible = !far && !\(a\.dead && a\.kind === 'monster' && a\.fade <= 0\.02\)/);
});

// ---------------------------------------------------------------------------------------------------- Y2
test('Y2: a crop field is planned in short pieces, and every piece lies on the slope under it', () => {
  const plan = planSetPieces({ placements: [{ id: 'f1', kind: 'field', x: 100, z: 200, data: { w: 20, d: 30, grows: 'cabbages', angle: 0.4 } }, { id: 'f2', kind: 'field', x: 300, z: 200, data: { w: 18, d: 24, grows: 'wheat', angle: 1.1 } }] });
  const soil = plan.parts.filter(q => q.mesh === 'box' && q.drape);
  assert.ok(soil.length > 100, `soil strips are cut up (${soil.length} pieces)`);
  assert.ok(soil.every(q => q.d <= DRAPE_SEG * 1.3 + 1e-9), 'no piece is longer than about two metres');
  assert.equal(plan.parts.filter(q => q.mesh === 'box' && !q.rx && !q.rz && q.h <= 0.6 && Math.max(q.w, q.d) > DRAPE_SEG * 1.3).length, 0, 'no long level strip is left whole');
  assert.ok(plan.parts.filter(q => q.mesh === 'sheaf').every(q => q.drape), 'stands of stalks lean with the hill too');
  assert.ok(plan.parts.length < 6000, `still a few hundred instances a field (${plan.parts.length})`);
  // cutting keeps the strip: same total length, same line, same width and colour
  const strip = { mesh: 'box', x: 3, y: -0.04, z: 0, w: 0.36, h: 0.16, d: 29.7, yaw: 0, rx: 0, rz: 0, colour: '#5f5040' };
  const cut = drapeLong([strip, { mesh: 'dome', x: 0, y: 0, z: 0, w: 0.5, h: 0.3, d: 0.5 }, { mesh: 'box', x: 0, y: 0, z: 0, w: 0.1, h: 1.9, d: 0.1 }]);
  const pieces = cut.filter(q => q.drape);
  assert.equal(pieces.length, 15);
  assert.ok(Math.abs(pieces.reduce((s, q) => s + q.d, 0) - 29.7) < 1e-9);
  assert.ok(pieces.every(q => q.x === 3 && q.w === 0.36 && q.colour === '#5f5040'));
  assert.ok(Math.abs(pieces[0].z + 29.7 / 2 - pieces[0].d / 2) < 1e-9 && Math.abs(pieces.at(-1).z - 29.7 / 2 + pieces[0].d / 2) < 1e-9, 'end to end');
  assert.equal(cut.length, 17, 'a cabbage and a post are left alone');
  // a strip that runs along x is cut along x
  const across = drapeLong([{ mesh: 'box', x: 0, y: 0, z: 5, w: 12, h: 0.1, d: 0.4, yaw: 0 }]);
  assert.equal(across.length, 6); assert.ok(across.every(q => Math.abs(q.z - 5) < 1e-9 && Math.abs(q.d - 2) < 1e-9 && q.w === 0.4));
  assert.ok(Math.abs(across[0].x + 5) < 1e-9 && Math.abs(across[5].x - 5) < 1e-9);

  // laid on a hillside (a 25% slope one way, 5% the other — the rows run mostly up it): no corner of any piece is more than 3 cm off the ground
  const hill = (x, z) => 40 + 0.05 * (x - 100) + 0.25 * (z - 200);
  let worst = 0, flatWorst = 0;
  for (const q of soil.filter(p => p.x < 200)) {
    const p = drapePose(q, hill), e = new THREE.Euler(p.rx, q.yaw, p.rz, 'YXZ'), m = new THREE.Matrix4().makeRotationFromEuler(e);
    for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const v = new THREE.Vector3(lx * q.w, 0, lz * p.d).applyMatrix4(m);            // a corner of the piece's underside (before the extra sink)
      const wx = q.x + v.x, wz = q.z + v.z, wy = p.g + v.y;
      worst = Math.max(worst, Math.abs(wy - hill(wx, wz)));
      // what it was before: the whole strip level at the height of its own middle
      flatWorst = Math.max(flatWorst, Math.abs(hill(q.x, q.z) - hill(wx, wz)));
    }
  }
  assert.ok(worst < 0.03, `corners within 3 cm of the slope (worst ${worst.toFixed(3)} m)`);
  assert.ok(flatWorst > 0.15, `and the test would see a level piece (even a 2 m one is ${flatWorst.toFixed(2)} m off)`);
  // the report's own fault, in numbers: one 30 m strip level across this slope is metres off at its ends
  const whole = { ...strip, x: 100, z: 200, yaw: 0.4 };
  assert.ok(Math.abs(hill(whole.x + Math.sin(0.4) * 14.85, whole.z + Math.cos(0.4) * 14.85) - hill(whole.x, whole.z)) > 2);
  // level ground changes nothing
  const flat = drapePose({ ...strip, d: 2 }, () => 12);
  assert.deepEqual({ g: flat.g, rx: Math.abs(flat.rx), rz: Math.abs(flat.rz) }, { g: 12, rx: 0, rz: 0 });
  // ground with a hole in it (no data) does not put NaN in a matrix
  const bad = drapePose({ ...strip, d: 2 }, (x, z) => (z > 0.5 ? NaN : 7));
  assert.deepEqual({ g: bad.g, rx: bad.rx, rz: bad.rz }, { g: 7, rx: 0, rz: 0 });
});

test('Y2 (cost): pieces of a strip on even ground are joined back into one box; over a hump they stay in pieces', () => {
  const strip = { mesh: 'box', x: 3, y: -0.04, z: 0, w: 0.36, h: 0.16, d: 29.7, yaw: 0, rx: 0, rz: 0, colour: '#5f5040' };
  const post = { mesh: 'box', x: 0, y: 0, z: 0, w: 0.1, h: 1.9, d: 0.1 };
  const cut = drapeLong([strip, post, { ...strip, x: 4 }]);
  const flat = drapeJoin(cut, () => 12);
  assert.equal(flat.length, 3, 'level ground: each strip is one box again');
  assert.ok(Math.abs(flat[0].d - 29.7) < 1e-9 && Math.abs(flat[0].z) < 1e-9 && flat[0].drape === 1, 'the same strip, still laid on the ground');
  const slope = drapeJoin(cut, (x, z) => 12 + z * 0.3);
  assert.equal(slope.length, 3, 'an even slope: one tipped box does it');
  const hump = (x, z) => 12 + 2 * Math.exp(-z * z / 18);
  const bent = drapeJoin(cut, hump).filter(q => q.drape && q.x === 3);
  assert.ok(bent.length > 3 && bent.length <= 15, `over a hump it stays in pieces (${bent.length})`);
  assert.ok(Math.abs(bent.reduce((s, q) => s + q.d, 0) - 29.7) < 1e-9, 'nothing lost, nothing doubled');
  for (const q of bent) {                                       // every piece still lies within a hand of the ground along its length
    const g0 = hump(3, q.z - q.d / 2), g1 = hump(3, q.z + q.d / 2);
    for (let t = 0; t <= 1; t += 0.125) assert.ok(Math.abs(hump(3, q.z - q.d / 2 + q.d * t) - (g0 + (g1 - g0) * t)) < 0.12, 'a joined piece never floats or digs in');
  }
  assert.equal(drapeJoin(cut, () => NaN).length, cut.length, 'unknown ground: left as cut');
});
