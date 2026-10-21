// node --test prototypes/thousandvale/tests/W/anim-rest.test.js
// Play-test 12, stream W-anim — the owner's live reports #88 #76 #87 #86 #84 #77 #72:
//   #88  a swimmer moving forward lies FACE DOWN and crawls (the shared `swim` lay face-up, feet first: a backstroke); a
//        flag that flickers off for a frame (the predictor's reconcile, the cause of the "restarting over and over") no
//        longer drops the body out of the stroke
//   #76  a seated body sits down ONCE and then holds the seat (the shared `sitGround` stood up again every 3.4 s)
//   #87  an angler turns to face the float
//   #86  the voyage's arrival turn is never more than a quarter turn, eased over longer the bigger it is
//   #84  Mistfall's carter is in the town's room too, and the wilds see talk-only folk just inside a ring
//   #77  a blindfold is drawn as no accessory, wherever it comes from
//   #72  ring walls (fort fences, ruined walls, pen rails, goat walls) lie ALONG their ring, at every angle
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { latchSwim, restClip, swimClip, SWIM_OFF_MS, SIT_DOWN_MS, CRAWL_ON, CRAWL_OFF } from '../../js/client/rest-clip.js';
import { Predictor } from '../../js/client/predict.js';
import { dropRetired, RETIRED_PARTS } from '../../js/client/retired-parts.js';
import { edgeShared, EDGE_OUT } from '../../js/sim/edge-share.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { createWorld } from '../../js/sim/world.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createVirtualClock } from '../../js/net/clock.js';

const root = new URL('../../', import.meta.url);
const at = p => fileURLToPath(new URL(p, root));
const REG = at('../../avatar-3d/tests/three-register.mjs');
const three = (code) => JSON.parse(execFileSync(process.execPath, ['--import', REG, '--input-type=module', '-e', code], { encoding: 'utf8', cwd: at('.') }).trim().split('\n').pop());
const noThree = !existsSync(REG) && 'the playground three loader is not here';

// ------------------------------------------------------------------------------------------------ #88 / #76 the clips
test('#88/#76: the crawl lies face down with the head ahead, the old swim lay face up; the held seat never stands up', { skip: noThree }, () => {
  const out = JSON.parse(execFileSync(process.execPath, ['--import', REG, at('tests/W/anim-rest-probe.mjs')], { encoding: 'utf8' }));
  assert.equal(out.SIT_DOWN_MS, SIT_DOWN_MS, 'rest-clip.js and chibi2-motion-rest.js agree on how long sitting down takes');
  const mean = (f, part, k) => f.reduce((s, x) => s + x[part][k], 0) / f.length;
  // the body faces +z: "forward" is +z
  assert.ok(mean(out.swim, 'head', 2) < mean(out.swim, 'hips', 2) - 0.3, 'the shared swim: head BEHIND the hips (face up, feet first — the backstroke)');
  const C = out.swimCrawl;
  assert.ok(mean(C, 'head', 2) > mean(C, 'hips', 2) + 0.3, 'the crawl: head AHEAD of the hips (face down, head first)');
  assert.ok(Math.abs(mean(C, 'head', 1) - mean(C, 'hips', 1)) < 0.35, 'lying flat, not standing');
  // floated with the feet 1.1 m down (MOVE.swimSink): the head just out of the water, the back awash
  assert.ok(mean(C, 'head', 1) > 1.1 && mean(C, 'head', 1) < 1.35, `head at the surface: ${mean(C, 'head', 1).toFixed(2)} m over the feet`);
  // the arms go round: each hand both reaches past the head (the entry) and comes up out of the water (the recovery)
  for (const h of ['handL', 'handR']) {
    assert.ok(Math.max(...C.map(f => f[h][2])) > mean(C, 'head', 2) + 0.15, `${h} reaches out ahead of the head`);
    assert.ok(Math.max(...C.map(f => f[h][1])) > 1.3 && Math.min(...C.map(f => f[h][1])) < 0.8, `${h} goes over the water and under it`);
  }
  const T = out.swimTread;
  assert.ok(mean(T, 'head', 1) > mean(T, 'hips', 1) + 0.4 && mean(T, 'head', 1) > 1.25, 'treading water: upright, head and shoulders out');
  // #76: sitGround stands back up at its loop point (the bug); sitHold never does
  assert.ok(Math.max(...out.sitGround.slice(20).map(f => f.hips[1])) > 0.25, 'the shared sitGround stands up again mid-sit');
  assert.ok(Math.max(...out.sitHold.map(f => f.hips[1])) < 0.15, 'sitHold stays down for all 8 s');
  assert.ok(Math.abs(out.sitHold[0].hips[1] - out.sitGround[30].hips[1]) < 0.02, 'and is the pose sitGround reaches (no jump at the hand-over)');
});

test('#88: a one-frame flicker of the swim flag does not drop the body out of the stroke; leaving the water does', () => {
  const a = {}; let t = 0; const seen = new Set();
  for (let i = 1; i < 300; i++) { t += 16; const raw = i % 6 !== 0; seen.add(latchSwim(a, raw, t)); }      // off one frame in six (a snapshot that acked every step)
  assert.deepEqual([...seen], [true], 'never stopped swimming');
  let off = null; for (let i = 0; i < 60; i++) { t += 16; if (!latchSwim(a, false, t) && off == null) off = i * 16; }
  assert.ok(off != null && off >= SWIM_OFF_MS - 32 && off <= SWIM_OFF_MS + 32, 'out of the water after ~SWIM_OFF_MS: ' + off);
  // crawl / tread with a gap between the thresholds: speed noise around one threshold never flips it every frame
  const b = {}; const clips = [];
  for (let i = 0; i < 50; i++) clips.push(swimClip(b, CRAWL_ON + (i % 2 ? 0.05 : -0.05)));
  assert.equal(new Set(clips.slice(2)).size, 1, 'no flip-flop around CRAWL_ON');
  assert.equal(swimClip({}, 2.7), 'swimCrawl'); assert.equal(swimClip({}, 0), 'swimTread');
  assert.equal(swimClip({ crawling: true }, (CRAWL_ON + CRAWL_OFF) / 2), 'swimCrawl', 'keeps crawling while slowing');
  assert.equal(restClip({}, 'swim', 0, 2.7), 'swimCrawl');
});

test('#88: the predictor keeps `swim` when a snapshot acks every step (the cause of the stroke restarting)', () => {
  const water = { heightAt: () => -3, waterAt: () => ({ kind: 'sea', surface: 0, depth: 3 }), moveAt: () => 'swim', bounds: { minX: -1e4, minZ: -1e4, maxX: 1e4, maxZ: 1e4 } };
  const p = new Predictor({ stepMs: 50 }); p.terrain = water; p.reset({ x: 0, y: -1.1, z: 0 });
  const inp = p.apply({ mx: 0, mz: 1, yaw: 0, b: 0 });
  assert.equal(p.pos.swim, true);
  p.reconcile(inp.s, { x: p.pos.x, y: -1.1, z: p.pos.z, vy: 0 });      // nothing left to replay
  assert.equal(p.pos.swim, true, 'still swimming after the reconcile (it used to come back undefined: "not swimming" until the next step)');
  const dry = { ...water, waterAt: () => ({ kind: 'none', surface: NaN, depth: 0 }), moveAt: () => 'walk', heightAt: () => 0 };
  const q = new Predictor({ stepMs: 50 }); q.terrain = dry; q.reset({ x: 0, y: 0, z: 0 });
  const i2 = q.apply({ mx: 0, mz: 1, yaw: 0, b: 0 }); q.reconcile(i2.s, { x: q.pos.x, y: 0, z: q.pos.z, vy: 0 });
  assert.equal(q.pos.swim, false, 'and on dry land it is false');
});

test('#76: a sit goes down once (sitGround for SIT_DOWN_MS) and then holds (sitHold) for as long as it lasts', () => {
  const a = {}; const seq = [];
  for (let t = 0; t <= 20000; t += 100) seq.push(restClip(a, 'sitGround', t));
  const firstHold = seq.indexOf('sitHold');
  assert.ok(firstHold > 0 && firstHold * 100 >= SIT_DOWN_MS && firstHold * 100 < SIT_DOWN_MS + 200, 'hand-over at SIT_DOWN_MS');
  assert.ok(seq.slice(firstHold).every(c => c === 'sitHold'), 'never sits down again (a cart ride, /sit, eating)');
  restClip(a, 'idle', 20100);                                          // stood up
  assert.equal(restClip(a, 'sitGround', 20200), 'sitGround', 'the next sit goes down again');
});

// ------------------------------------------------------------------------------------------------ #87 facing the float
test('#87: an angler standing still turns to the float; walking, riding or dead it does not', { skip: noThree }, () => {
  const r = three(`const { faceYaw } = await import('./js/client/actors.js');
    const a = { pos: { x: 10, z: 10 }, faceAt: { x: 10, z: 20 }, speed: 0 };
    const out = { ahead: faceYaw(a), east: faceYaw({ ...a, faceAt: { x: 20, z: 10 } }), moving: faceYaw({ ...a, speed: 3 }), riding: faceYaw({ ...a, mount: {} }), none: faceYaw({ ...a, faceAt: null }) };
    console.log(JSON.stringify(out));`);
  assert.ok(Math.abs(r.ahead) < 1e-9, 'float due +z: yaw 0');
  assert.ok(Math.abs(r.east - Math.PI / 2) < 1e-9, 'float due +x: yaw pi/2 (yaw = atan2(dx, dz), the game\'s heading)');
  assert.equal(r.moving, null); assert.equal(r.riding, null); assert.equal(r.none, null);
});

// ------------------------------------------------------------------------------------------------ #86 the arrival
test('#86: the arrival turn is at most a quarter turn and is eased over longer the bigger it is', { skip: noThree }, () => {
  const r = three(`const { arrivalYaw, turnSec } = await import('./js/client/ship-view.js');
    const PI = Math.PI, d = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    const cases = []; for (let berth = -3; berth <= 3; berth += 0.37) for (let route = -3; route <= 3; route += 0.41) { const y = arrivalYaw({ yaw: berth }, route); cases.push({ turn: d(route, y), moored: Math.min(d(y, berth), d(y, berth + PI)) }); }
    console.log(JSON.stringify({ worst: Math.max(...cases.map(c => c.turn)), moored: Math.max(...cases.map(c => c.moored)), none: arrivalYaw(null, 1.2), small: turnSec(0, 0.1), big: turnSec(0, PI / 2) }));`);
  assert.ok(r.worst <= Math.PI / 2 + 1e-9, 'never more than a quarter turn: ' + r.worst);
  assert.ok(r.moored < 1e-9, 'and she still lies along the berth (bow out or bow in)');
  assert.equal(r.none, 1.2, 'no berth: the route\'s own heading');
  assert.ok(r.big > r.small + 3, `a quarter turn is eased over ${r.big.toFixed(1)} s, a nudge over ${r.small.toFixed(1)} s`);
});

test('#86: the local sea never dips under the world\'s water (the dark seams), and its offset is the distance sailed', () => {
  const src = readFileSync(new URL('js/client/ship-view.js', root), 'utf8');
  // the wave sum, as the shader writes it, against the floor: the six amplitudes total more than the lift (why there were seams) …
  const amps = [...src.matchAll(/amp\[\d\] = ([\d.]+);/g)].map(m => +m[1]);
  const lift = +src.match(/seaLift: ([\d.]+)/)[1];
  assert.equal(amps.length, 6);
  assert.ok(amps.reduce((s, v) => s + v, 0) > lift, 'the waves can reach deeper than the lift (the seams were real)');
  // … so the trough is eased onto a floor: the knee y' = floor + 0.3 e^((y - floor - 0.3) / 0.3) is never below the floor
  const floorY = lift - lift + 0.12, knee = y => (y < floorY + 0.3 ? floorY + 0.3 * Math.exp((y - floorY - 0.3) / 0.3) : y);
  for (let h = -2; h <= 2; h += 0.01) { const y = knee(h + lift); assert.ok(y > floorY - 1e-12, 'never below the floor at h ' + h.toFixed(2)); if (h + lift > floorY + 0.3) assert.equal(y, h + lift, 'and untouched above the knee'); }
  assert.match(src, /if \(y < floorY \+ 0\.3\) y = floorY \+ 0\.3 \* exp\(\(y - floorY - 0\.3\) \/ 0\.3\);/, 'the shader eases the trough the same way');
  assert.match(src, /U\.uOff\.value\.set\(v\.offX, v\.offZ\)/, 'the sea is offset by the distance sailed, not by heading x total run');
  assert.doesNotMatch(src, /uOff\.value\.set\(Math\.sin\(v\.yaw\) \* v\.run/, 'the old whip is gone');
});

// ------------------------------------------------------------------------------------------------ #84 edge folk
const readJson = async f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readBytes = async f => readFileSync(new URL(f, root));
test('#84: Mistfall\'s carter stands in the town\'s room as well as the wilds; the copy is the same NPC (same key)', async () => {
  const C = await loadProvinceContent(readJson, readBytes, 'vharlen', { parseTerrain, parseNav, createProvinceTerrain });
  const L = buildLayout({ key: 'vharlen', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter, horizon: C.horizon, extra: C.extra });
  const ti = L.towns.findIndex(t => t.name === 'Mistfall');
  assert.ok(ti >= 0, 'Mistfall is a hub town');
  const t = L.towns[ti];
  const carter = L.objects.find(o => o.type === 'npc' && o.cart && Math.hypot(o.x - t.x, o.z - t.z) < t.r + EDGE_OUT) || L.objects.find(o => o.type === 'npc' && /carter/i.test(JSON.stringify(o.npc || {})) && Math.hypot(o.x - t.x, o.z - t.z) < t.r + EDGE_OUT);
  assert.ok(carter, 'the carter stands just outside the ring (in the wilds list)');
  assert.ok(Math.hypot(carter.x - t.x, carter.z - t.z) > t.r, 'outside the circle — which is why the town never showed him');
  const shared = edgeShared(L, ti);
  const copy = shared.find(o => o.key === carter.key);
  assert.ok(copy && copy.edgeCopy && copy.x === carter.x && copy.z === carter.z, 'a copy for the town room, same key and place');
  assert.ok(shared.some(o => o.type === 'cart'), 'and his cart with him');
  assert.ok(!shared.some(o => o.guard || (o.npc && o.npc.role === 'guard') || o.fighter || o.schedule), 'never a guard, a fighter or a walker (they would act in two rooms)');
  for (const o of shared) { const d = Math.hypot(o.x - t.x, o.z - t.z); assert.ok(d >= t.r - 2 && d <= t.r + EDGE_OUT, 'only things at the edge'); }
  // the other way: talk-only folk just inside a ring are in the wilds too
  const back = edgeShared(L, null);
  for (const o of back) { const tt = L.towns.find(q => Math.abs(Math.hypot(o.x - q.x, o.z - q.z) - q.r) <= 12.01 && Math.hypot(o.x - q.x, o.z - q.z) < q.r); assert.ok(tt, 'a wilds copy stands just inside some ring: ' + o.name); }
  // and through the real world: the town room has the carter
  const clock = createVirtualClock(), store = createMemoryStore({ now: clock.now });
  const world = createWorld({ store, layouts: [L], now: clock.now, lingerMs: 0, log: () => {}, roadEvents: false, travellers: false, events: [], encounterInfo: C.encounterInfo, warm: false });
  const room = world.P.get('vharlen').towns[ti];
  const names = [...room.entities.values()].filter(e => e.kind === 'npc').map(e => e.name);
  assert.ok(names.includes(carter.name), `${carter.name} is in Mistfall's own room (has: ${names.slice(0, 12).join(', ')}…)`);
  world.stop?.();
});

// ------------------------------------------------------------------------------------------------ #77 no blindfold
test('#77: a blindfold is drawn as no accessory, wherever the look came from; other accessories are untouched', () => {
  assert.deepEqual(RETIRED_PARTS.accessory, ['blindfold']);
  const av = { body: { v: 2.5 }, accessory: { id: 'blindfold', color: '#223' }, eyes: { id: 'round' } };
  const out = dropRetired(av);
  assert.equal(out.accessory.id, 'none'); assert.equal(out.accessory.color, '#223'); assert.equal(av.accessory.id, 'blindfold', 'the saved look is not changed');
  const ok = { accessory: { id: 'glasses' } }; assert.equal(dropRetired(ok), ok, 'nothing to drop: the same object (the caches key on it)');
  assert.equal(dropRetired(null), null);
  const appearance = readFileSync(new URL('js/client/ui/appearance-core.js', root), 'utf8');
  assert.doesNotMatch(appearance, /'blindfold'/, 'never offered at creation or the barber');
  for (const f of ['js/client/looks.js', 'js/client/chibi-version.js']) assert.match(readFileSync(new URL(f, root), 'utf8'), /dropRetired\(/, f + ' goes through dropRetired');
});

// ------------------------------------------------------------------------------------------------ #72 ring walls
test('#72: every ring wall piece lies along its ring (watchtower fence, ruined walls, pen rails, Vharlen goat walls), at any yaw', { skip: noThree }, () => {
  const r = three(`const { sitePlan, ringYaw } = await import('./js/client/site-view.js');
    const sites = { forts: { watchtower_garrison: { radius: 16 }, ruined_fort: { radius: 16 } }, farms: { sheep: { radius: 20 }, pig: { radius: 20 } }, caves: {} };
    const out = [];
    for (const culture of [null, 'vharl']) for (const yaw of [0, -1.96, 0.7, 2.5]) for (const [type, template] of [['fort', 'watchtower_garrison'], ['fort', 'ruined_fort'], ['farm', 'sheep'], ['farm', 'pig']]) {
      const pl = { type, template, x: 100, z: 200, yaw, radius: template.includes('fort') ? 16 : 20 };
      const plan = sitePlan([pl], [], { sites, hooks: new Map(), culture });
      // the ring's centre in world metres: the fort's own, a pen's is R * 0.2 along local +z
      const R = 20 * 0.7, c = type === 'farm' ? { x: 100 + R * 0.2 * Math.sin(yaw), z: 200 + R * 0.2 * Math.cos(yaw) } : { x: 100, z: 200 };
      for (const p of plan.parts) {
        if (p.mesh !== 'box') continue;
        const long = p.w > p.d * 1.6 ? 'x' : p.d > p.w * 1.6 ? 'z' : null; if (!long) continue;
        const ax = long === 'x' ? [Math.cos(p.yaw), -Math.sin(p.yaw)] : [Math.sin(p.yaw), Math.cos(p.yaw)];
        const rx = p.x - c.x, rz = p.z - c.z, rl = Math.hypot(rx, rz); if (rl < 3) continue;
        out.push({ culture, yaw, template, cos: Math.abs(ax[0] * rx + ax[1] * rz) / rl, len: Math.max(p.w, p.d) });
      }
    }
    console.log(JSON.stringify({ n: out.length, worst: out.reduce((m, o) => (o.cos > m.cos ? o : m), { cos: 0 }), byT: [...new Set(out.map(o => o.template + ':' + (o.culture || 'torbor')))] , z: ringYaw(0.3, 'z'), x: ringYaw(0.3, 'x') }));`);
  assert.ok(r.n > 100, 'measured a lot of pieces: ' + r.n);
  for (const k of ['watchtower_garrison:torbor', 'ruined_fort:torbor', 'sheep:torbor', 'pig:torbor', 'watchtower_garrison:vharl', 'ruined_fort:vharl', 'sheep:vharl']) assert.ok(r.byT.includes(k), 'checked ' + k);
  // a long piece on a ring points across the radius (along the tangent): its long axis has no radial part
  assert.ok(r.worst.cos < 0.2, `a ring piece sticks out across its ring: ${JSON.stringify(r.worst)}`);
  assert.ok(Math.abs(r.x - 0.3) < 1e-12 && Math.abs(r.z - (0.3 + Math.PI / 2)) < 1e-12);
});
