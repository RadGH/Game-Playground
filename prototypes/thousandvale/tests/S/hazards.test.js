// node --test prototypes/thousandvale/tests/S/hazards.test.js
// Expansion 1 §4 (stream S): Vharlen's hazards — the rules (js/rules/hazards.js), the server loop (js/sim/hazards.js) on
// stand-in rooms, the glide (js/sim/movement.js + the client predictor + the snapshot flag) and the placed sites
// (data/provinces/vharlen-hazards.json, tools/content-hazards.mjs) against the baked island.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPRING, GEYSER, VENT, GLIDE, cycleOf, nextAt, phaseAt, inSpring, onGeyser, inVent, ventDamage, ventBurn, geyserHurt, applyHazard, warmStatus, baseHp } from '../../js/rules/hazards.js';
import { createHazards, prepareSites } from '../../js/sim/hazards.js';
import { stepMove, MOVE } from '../../js/sim/movement.js';
import { Predictor } from '../../js/client/predict.js';
import { encodeClientSnap, decodeSnap } from '../../js/net/snapshot.js';
import { STATE } from '../../js/net/protocol.js';
import { itemBuffs, restoreItemBuffs, saveItemBuffs } from '../../js/rules/buffs.js';
import { parseTerrain, parseNav, NAV } from '../../js/rules/terrain-read.js';
import { provinceDataPath, PROVINCE_DATA } from '../../js/sim/province-files.js';

const J = p => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const HZ = J('data/provinces/vharlen-hazards.json');
const SHEET = J('data/provinces/vharlen.json');
const MAP = J('data/world/province-map.json').provinces.vharlen.map;
const BAND = Object.fromEntries(Object.entries(MAP).map(([eid, wid]) => [wid, SHEET.zones[eid].band]));

// ------------------------------------------------------------------ the rules

test('a site\'s cycle is fixed by its id: geysers every 15-25 s, vents every 9-14 s, the same answer every time', () => {
  const seen = new Set();
  for (const g of HZ.geysers) {
    const c = cycleOf(g.id, 'geyser');
    assert.deepEqual(c, cycleOf(g.id, 'geyser'), 'same id, same cycle');
    assert.ok(c.period >= 15000 && c.period <= 25000, `${g.id}: ${c.period} ms`);
    assert.ok(c.offset >= 0 && c.offset < c.period);
    seen.add(c.period + ':' + c.offset);
  }
  assert.ok(seen.size >= HZ.geysers.length - 1, 'the geysers do not all go up together');
  for (const v of HZ.vents) { const c = cycleOf(v.id, 'vent'); assert.ok(c.period >= 9000 && c.period <= 14000, `${v.id}: ${c.period}`); }
  // nextAt / phaseAt agree with each other
  const c = cycleOf('steamwood_geyser_1', 'geyser');
  for (const t of [0, 1234, 99999, 1e7 + 17]) {
    const n = nextAt(c, t);
    assert.ok(n.at >= t && n.at - t < c.period);
    assert.equal(phaseAt(c, n.at - 1000, GEYSER.warnMs, GEYSER.eruptMs).phase, 'warn');
    assert.equal(phaseAt(c, n.at + 500, GEYSER.warnMs, GEYSER.eruptMs).phase, 'erupt');
    assert.equal(phaseAt(c, n.at + GEYSER.eruptMs + 100, GEYSER.warnMs, GEYSER.eruptMs).phase, 'idle');
  }
});

test('vent damage scales with the zone band; a geyser never takes a monster\'s last point', () => {
  let last = 0;
  for (const lv of [10, 12, 14, 16, 18, 20]) { const d = ventDamage(lv); assert.ok(d > last, `level ${lv}: ${d}`); last = d; assert.ok(ventBurn(lv) < d); }
  // a quarter of a fresh character's health at the band top: real damage, never a one-shot
  assert.ok(ventDamage(20) / baseHp(20) > 0.2 && ventDamage(20) / baseHp(20) < 0.35);
  // the vents in the file: harder zone, harder fire
  const byZone = {};
  for (const v of HZ.vents) { assert.equal(v.level, BAND[v.zone][1], `${v.id}: scaled to its zone's band top`); byZone[v.zone] = ventDamage(v.level); }
  assert.ok(byZone.z11_10 < byZone.z11_11 && byZone.z11_11 < byZone.z12_10, JSON.stringify(byZone));
  assert.equal(geyserHurt(500, 500), 40);
  assert.equal(geyserHurt(3, 500), 2, 'leaves one point');
  assert.equal(geyserHurt(1, 500), 0);
});

test('geometry: spring pools, the crater lake\'s warm shallows (not its middle), geyser mouths, vent lines', () => {
  const pool = { kind: 'hot_spring', x: 0, z: 0, r: 8 };
  assert.ok(inSpring(pool, 3, 4)); assert.ok(!inSpring(pool, 9, 0));
  const lake = { kind: 'crater_lake', x: 0, z: 0, r: 128, shore: 14 };
  assert.ok(inSpring(lake, 120, 0)); assert.ok(!inSpring(lake, 60, 0), 'the deep middle is not a spring'); assert.ok(!inSpring(lake, 140, 0));
  assert.ok(onGeyser({ x: 0, z: 0, r: 2.6 }, 2.9, 0)); assert.ok(!onGeyser({ x: 0, z: 0, r: 2.6 }, 3.5, 0));
  const v = { ax: 0, az: 0, bx: 0, bz: 12, w: 2.4 };
  assert.ok(inVent(v, 0.5, 6)); assert.ok(inVent(v, 1.5, 11)); assert.ok(!inVent(v, 3, 6)); assert.ok(!inVent(v, 0, 14));
});

test('the rules\' side: soak heals and fills mana, warm is +5% max health (and survives a save as itself), a hit can kill a player', () => {
  const evs = [];
  const u = { id: 7, kind: 'player', hp: 50, maxHp: 200, mp: 10, maxMp: 100, statuses: {} };
  const r = applyHazard(u, { kind: 'soak' }, e => evs.push(e));
  assert.ok(r.ok && r.fresh);
  assert.equal(u.statuses.steam_soaked.healPerSecond, SPRING.healPerSecond);
  assert.equal(u.mp, 16);
  assert.ok(evs.some(e => e.kind === 'status' && e.status === 'steam_soaked' && e.on));
  applyHazard(u, { kind: 'warm' }, () => {});
  assert.equal(itemBuffs(u).hpPct, SPRING.warmHpPct);
  const rows = saveItemBuffs(u);
  const back = { statuses: {} }; restoreItemBuffs(back, rows);
  assert.ok(back.statuses['item:steamed'], 'restored as Steam-warmed');
  assert.ok(!back.statuses['item:well_fed'], 'not as Well fed');
  const hit = applyHazard(u, { kind: 'hit', amount: 999, element: 'fire' }, e => evs.push(e));
  assert.ok(hit.dead && u.dead, 'the fire can kill');
  assert.ok(evs.some(e => e.t === 'death' && e.id === 7));
  const m = { id: 8, kind: 'monster', hp: 30, maxHp: 300, statuses: {} };
  applyHazard(m, { kind: 'hit', amount: 999, floor: 1 }, () => {});
  assert.equal(m.hp, 1, 'a monster keeps its last point');
  const w = { statuses: {} }; warmStatus(w, 60); warmStatus(w, 600);
  assert.equal(w.statuses['item:steamed'].remaining, 600);
});

// ------------------------------------------------------------------ the server loop on stand-in rooms

/** A stand-in room + entities the loop can run on (no rules: js/sim/hazards.js's fallback touches the entity). */
function fakeWorld(sites) {
  const ents = new Map(), events = [];
  const room = {
    id: 'vharlen/copy:0', kind: 'wilds', meta: { province: 'vharlen' }, rules: null, clients: new Map(),
    groundAt: () => 10, emit: ev => events.push(ev), event: ev => events.push(ev),
    host: { near: (x, z, r, f) => [...ents.values()].filter(e => Math.hypot(e.x - x, e.z - z) <= r && (!f || f(e))) },
  };
  const ent = (id, kind, x, z, hp = 100) => {
    const e = { id, kind, x, z, y: 10, vy: 0, airborne: false, hp, hpMax: 100, state: 0, dead: false, removed: false,
      setHp(n) { this.hp = n; }, kill() { this.dead = true; }, setState(b, on) { this.state = on ? this.state | b : this.state & ~b; },
      moveTo(nx, nz, ny) { this.x = nx; this.z = nz; if (ny !== undefined) this.y = ny; }, loop() {} };
    ents.set(id, e); return e;
  };
  const online = new Map();
  const said = [];
  let t = 0;
  const hz = createHazards({ provinces: () => [{ key: 'vharlen', L: { hazards: sites } }], online, now: () => t, chat: (o, text) => said.push(text) });
  const addPlayer = (id, x, z) => { const e = ent(id, 'player', x, z); const o = { entity: e, room, char: { id } }; online.set(id, o); room.clients.set(id, { selfDirty: false }); return { e, o }; };
  const advance = ms => { for (let k = 0; k < ms / 50; k++) { t += 50; hz.tick(); } };
  return { room, ents, events, online, hz, ent, addPlayer, advance, said, get t() { return t; }, set t(v) { t = v; } };
}

test('springs soothe ONLY out of combat; climbing out after a proper soak leaves you warmed', () => {
  const W = fakeWorld({ springs: [{ id: 'hs', kind: 'hot_spring', name: 'Test Spring', x: 0, z: 0, r: 8, level: 10 }] });
  const { e, o } = W.addPlayer(1, 2, 2);
  e.hp = 40;
  W.advance(4000);
  assert.ok(e.hp > 40, 'healed while soaking: ' + e.hp);
  assert.ok(W.said.some(s => /Steam-soaked/.test(s)));
  // fighting: no healing at all, one line saying why
  e.hp = 40; e.setState(STATE.combat, true);
  W.advance(4000);
  assert.equal(e.hp, 40, 'no healing in a fight');
  assert.ok(W.said.some(s => /cannot soothe you while you are fighting/.test(s)));
  e.setState(STATE.combat, false);
  W.advance(4000);
  assert.ok(e.hp > 40);
  // out of the water
  e.moveTo(30, 0);
  W.advance(1200);
  assert.ok(W.said.some(s => /Steam-warmed/.test(s)), W.said.join(' | '));
  assert.ok(W.events.some(ev => ev.kind === 'spring' && ev.id === 1 && ev.warmMs === SPRING.warmS * 1000));
  assert.equal(o.spring, null);
  // a dip too short to count leaves nothing
  const W2 = fakeWorld({ springs: [{ id: 'hs', kind: 'hot_spring', name: 'T', x: 0, z: 0, r: 8, level: 10 }] });
  const p2 = W2.addPlayer(2, 1, 1);
  W2.advance(1100); p2.e.moveTo(40, 0); W2.advance(2000);
  assert.ok(!W2.events.some(ev => ev.kind === 'spring'), 'a one-second dip does not warm you');
});

test('a geyser warns 2 s ahead (telegraph), erupts on its own clock, throws a player into a glide and tosses a monster', () => {
  const g = { id: 'test_geyser', x: 0, z: 0, r: 2.6, level: 12 };
  const W = fakeWorld({ geysers: [g] });
  const { e } = W.addPlayer(1, 0.5, 0.5);
  const mon = W.ent(50, 'monster', -1, 0.4, 100);
  const c = cycleOf(g.id, 'geyser');
  const first = nextAt(c, 1).at;
  W.advance(first - GEYSER.warnMs + 200);
  const tele = W.events.find(ev => ev.type === 'tele');
  assert.ok(tele, 'a telegraph before the eruption');
  assert.equal(tele.shape, 'circle'); assert.equal(tele.ab, 'geyser'); assert.ok(tele.ms <= GEYSER.warnMs && tele.ms >= 1500);
  assert.ok(W.events.some(ev => ev.kind === 'geyser' && ev.phase === 'rumble'));
  assert.ok(!W.events.some(ev => ev.type === 'teleR'));
  W.advance(GEYSER.warnMs);
  const land = W.events.find(ev => ev.type === 'teleR');
  assert.ok(land && land.id === tele.id, 'the telegraph resolves');
  assert.deepEqual([...land.hits].sort(), [1, 50]);
  assert.equal(land.x, undefined, 'a landed telegraph is not a cancelled one');
  assert.ok(land._at, 'delivered by place');
  assert.ok(e.glide && e.airborne && e.vy === GEYSER.launchVy, 'the player is thrown');
  assert.ok(W.room.clients.get(1).selfDirty, 'the player hears where they are at once');
  assert.ok(W.events.some(ev => ev.kind === 'toss' && ev.id === 50));
  assert.equal(mon.hp, 100 - Math.round(100 * GEYSER.monsterHurt));
  // the SAME eruption times every run (deterministic per site), and the next one is one period later
  const at1 = W.t;
  const W2 = fakeWorld({ geysers: [g] }); W2.addPlayer(1, 0.5, 0.5); W2.advance(at1);
  assert.equal(W2.events.filter(ev => ev.type === 'teleR').length, 1);
  W.advance(c.period);
  assert.equal(W.events.filter(ev => ev.type === 'teleR').length, 2);
  // nobody near: nothing runs
  const W3 = fakeWorld({ geysers: [g] }); W3.addPlayer(1, 900, 900); W3.advance(60000);
  assert.equal(W3.events.length, 0);
});

test('a lava vent warns with a line telegraph, then burns everyone in the line by the zone band — and again if they stay', () => {
  const v = { id: 'test_vent', ax: 0, az: 0, bx: 0, bz: 12, w: 2.4, level: 18 };
  const W = fakeWorld({ vents: [v] });
  const { e } = W.addPlayer(1, 0.3, 6);
  e.hp = e.hpMax = 300;
  const out = W.addPlayer(2, 5, 6).e;
  const mon = W.ent(60, 'monster', -0.4, 3, 30);
  const c = cycleOf(v.id, 'vent'), first = nextAt(c, 1).at;
  W.advance(first + 100);
  const tele = W.events.find(ev => ev.type === 'tele');
  assert.ok(tele && tele.shape === 'line' && tele.el === 'fire' && Math.abs(tele.len - 12) < 1e-9 && tele.w === 2.4);
  assert.equal(e.hp, 300 - ventDamage(18), 'the hit');
  assert.equal(out.hp, 100, 'a step to the side is safe');
  assert.equal(mon.hp, 1, 'a monster burns but keeps its last point');
  W.advance(VENT.burnMs + 100);
  assert.equal(e.hp, 300 - ventDamage(18) - ventBurn(18), 'the second burn for standing in it');
  e.moveTo(5, 3); e.hp = 300;
  W.advance(c.period);
  assert.equal(e.hp, 300, 'out of the line: untouched');
});

// ------------------------------------------------------------------ the glide (movement, prediction, the wire)

const flat = { heightAt: () => 0, walkable: () => true };
test('the glide: thrown ~14 m, falls slowly, steers further; a jump never glides; landing ends it', () => {
  const st = { x: 0, y: 0, z: 0, vy: GEYSER.launchVy, airborne: true, glide: true };
  let top = 0, tAir = 0;
  while (st.airborne && tAir < 20) { stepMove(st, { mx: 1, mz: 0, b: 0 }, 50, flat); top = Math.max(top, st.y); tAir += 0.05; }
  assert.ok(top > 13 && top < 15, 'top ' + top);
  assert.ok(st.glide === false && !st.airborne, 'landing ends the glide');
  const fallS = tAir - GEYSER.launchVy / MOVE.gravity;
  assert.ok(fallS > 3, 'drifts down slowly: ' + fallS.toFixed(2) + ' s');
  assert.ok(st.x > MOVE.run * tAir * 1.2, 'steers faster in the air: ' + st.x.toFixed(1));
  const j = { x: 0, y: 0, z: 0, vy: GEYSER.launchVy, airborne: true };
  let jt = 0; while (j.airborne && jt < 20) { stepMove(j, { mx: 0, mz: 0, b: 0 }, 50, flat); jt += 0.05; }
  assert.ok(jt < tAir * 0.6, 'without glide the same throw falls like a stone');
  assert.equal(GLIDE.fall < MOVE.jumpV, true);
});

test('the client predicts the glide exactly: the flag rides the snapshot and the predictor replays it', () => {
  // the wire: flag 8 on the self block
  const bytes = encodeClientSnap({ tick: 5, ack: 3, self: { x: 1, y: 20, z: 2, vy: -1.5, glide: true } });
  const snap = decodeSnap(bytes, 0.125);
  assert.equal(snap.self.glide, true);
  assert.equal(decodeSnap(encodeClientSnap({ tick: 5, ack: 3, self: { x: 1, y: 2, z: 3, vy: 0 } }), 0.125).self.glide, undefined);
  // server and client step the same inputs from the same thrown state and agree to the float
  const server = { x: 0, y: 0, z: 0, vy: GEYSER.launchVy, airborne: true, glide: true };
  const pr = new Predictor({ terrain: flat });
  pr.reset({ x: 0, y: 0, z: 0 });
  const ins = [];
  for (let i = 0; i < 30; i++) ins.push(pr.apply({ mx: 0.7, mz: 0.7, yaw: 0, b: 0 }));
  // the throw arrives after input 4: the server's state then, replayed over the rest
  for (let i = 0; i < 4; i++) stepMove(server, ins[i], ins[i].dt, flat);
  const at = { ...server };
  const s4 = { x: at.x, y: at.y, z: at.z, vy: at.vy, glide: true };
  for (let i = 4; i < 30; i++) stepMove(server, ins[i], ins[i].dt, flat);
  pr.reconcile(ins[3].s, s4);
  assert.ok(Math.abs(pr.pos.y - server.y) < 1e-6 && Math.abs(pr.pos.x - server.x) < 1e-6, `client ${pr.pos.y} vs server ${server.y}`);
  assert.equal(pr.pos.glide, server.glide);
});

// ------------------------------------------------------------------ the placed sites

test('the hazards file is the province\'s placed `hazards` file and covers the zones the spec names', () => {
  assert.equal(provinceDataPath('vharlen', 'hazards'), 'data/provinces/vharlen-hazards.json');
  assert.equal(PROVINCE_DATA.hazards[1], 'placed', 'Torbor Downs is never lent hazards');
  const per = (list, k) => list.reduce((a, s) => ((a[s.zone] = (a[s.zone] || 0) + 1), a), {});
  const gz = per(HZ.geysers), vz = per(HZ.vents);
  for (const eid of ['steamwood', 'fumarole_fen', 'sulphur_bight']) assert.ok(gz[MAP[eid]] >= 4 && gz[MAP[eid]] <= 8, `${eid}: ${gz[MAP[eid]]} geysers`);
  for (const eid of ['pumice_wastes', 'kiln_ridge', 'the_caldera']) assert.ok(vz[MAP[eid]] >= 6, `${eid}: ${vz[MAP[eid]]} vents`);
  assert.deepEqual(Object.keys(gz).sort(), [MAP.steamwood, MAP.sulphur_bight, MAP.fumarole_fen].sort());
  assert.deepEqual(Object.keys(vz).sort(), [MAP.pumice_wastes, MAP.kiln_ridge, MAP.the_caldera].sort());
  assert.ok(HZ.springs.some(s => s.kind === 'crater_lake'));
  assert.ok(HZ.springs.filter(s => s.kind === 'hot_spring').length >= 5);
  for (const s of HZ.springs) assert.ok(s.name && !/ember|veil|muster/i.test(s.name), s.name);
  assert.deepEqual(HZ.ashfall.zones.sort(), [MAP.pumice_wastes, MAP.ashfall_hollow].sort());
  for (const [wid, h] of Object.entries(HZ.terrain)) assert.equal(h, parseTerrain(readFileSync(new URL(`../../data/zones/${wid}/terrain.bin`, import.meta.url))).meta.inputHash, `${wid}: made for this bake — re-run tools/content-hazards.mjs --province=vharlen`);
  assert.ok(prepareSites(HZ).geysers.length === HZ.geysers.length);
});

test('nothing is placed on a road, in a town, or on an NPC — every vent line clear of roads its whole length', () => {
  const zones = {};
  const Z = wid => {
    if (zones[wid]) return zones[wid];
    const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number);
    const t = parseTerrain(readFileSync(new URL(`../../data/zones/${wid}/terrain.bin`, import.meta.url)));
    const nav = parseNav(readFileSync(new URL(`../../data/zones/${wid}/nav.bin`, import.meta.url)));
    const vig = J(`data/vignettes/placements/${wid}.json`);
    let quest = []; try { quest = J(`data/vignettes/placements/${wid}.quest.json`).placements || []; } catch { /* none */ }
    const people = [...vig.placements, ...quest].filter(p => ['npc', 'folk', 'guard', 'waystone', 'cart'].includes(p.type));
    const bits = (x, z) => nav.bits[Math.min(nav.size - 1, Math.max(0, Math.round((z - zy * 2048) / nav.step))) * nav.size + Math.min(nav.size - 1, Math.max(0, Math.round((x - zx * 2048) / nav.step)))];
    return (zones[wid] = { ox: zx * 2048, oz: zy * 2048, t, bits, people, settlements: vig.settlements || [] });
  };
  /** the nearest ROAD / TOWN nav cell to (x, z) within r metres (Infinity when none) */
  const nearBit = (F, x, z, r, bit) => { let best = Infinity; for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) { const d = Math.hypot(dx, dz); if (d <= r && d < best && (F.bits(x + dx, z + dz) & bit)) best = d; } return best; };
  for (const g of HZ.geysers) {
    const F = Z(g.zone);
    assert.equal(nearBit(F, g.x, g.z, 24, NAV.ROAD), Infinity, `${g.id}: a road within 24 m`);
    assert.equal(nearBit(F, g.x, g.z, 50, NAV.TOWN | NAV.BUILDING), Infinity, `${g.id}: in a town`);
    for (const p of F.people) assert.ok(Math.hypot(p.x + F.ox - g.x, p.z + F.oz - g.z) >= 25, `${g.id}: on top of ${p.type} ${p.id}`);
    for (const s of F.settlements) assert.ok(Math.hypot(s.x + F.ox - g.x, s.z + F.oz - g.z) >= (s.r || 60) + 60, `${g.id}: inside ${s.name}`);
    assert.equal(F.t.moveAt(g.x - F.ox, g.z - F.oz), 'walk', `${g.id}: on dry walkable ground`);
  }
  for (const v of HZ.vents) {
    const F = Z(v.zone), L = Math.hypot(v.bx - v.ax, v.bz - v.az);
    for (let s = 0; s <= L; s += 2) {
      const x = v.ax + (v.bx - v.ax) * s / L, z = v.az + (v.bz - v.az) * s / L;
      assert.equal(nearBit(F, x, z, 30, NAV.ROAD), Infinity, `${v.id}: a road within 30 m of the line — a road must never be blocked`);
      assert.equal(nearBit(F, x, z, 60, NAV.TOWN | NAV.BUILDING), Infinity, `${v.id}: by a town`);
    }
    for (const p of F.people) assert.ok(Math.hypot(p.x + F.ox - (v.ax + v.bx) / 2, p.z + F.oz - (v.az + v.bz) / 2) >= 35, `${v.id}: by ${p.type} ${p.id}`);
  }
});

test('every geyser with a ledge really throws you onto it (the real terrain, the real movement step)', async () => {
  const { throwFrom } = await import('../../tools/content-hazards.mjs');
  let n = 0;
  for (const g of HZ.geysers.filter(q => q.ledge)) {
    const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(g.zone).map(Number), ox = zx * 2048, oz = zy * 2048;
    const t = parseTerrain(readFileSync(new URL(`../../data/zones/${g.zone}/terrain.bin`, import.meta.url)));
    const nav = parseNav(readFileSync(new URL(`../../data/zones/${g.zone}/nav.bin`, import.meta.url)));
    const T = { heightAt: (x, z) => t.heightAt(x, z), walkable: (x, z) => t.walkable(x, z), waterAt: (x, z) => t.waterAt(x, z), moveAt: (x, z) => t.moveAt(x, z), bounds: { minX: 0, minZ: 0, maxX: 2048, maxZ: 2048 },
      nav: { at: (x, z) => nav.bits[Math.min(nav.size - 1, Math.max(0, Math.round(z / nav.step))) * nav.size + Math.min(nav.size - 1, Math.max(0, Math.round(x / nav.step)))] } };
    const L = throwFrom(T, g.x - ox, g.z - oz, g.ledge.yaw);
    assert.ok(L.landed, g.id);
    assert.ok(Math.hypot(L.x + ox - g.ledge.x, L.z + oz - g.ledge.z) < 1.5, `${g.id}: lands where the file says`);
    assert.ok(L.y - t.heightAt(g.x - ox, g.z - oz) >= 3, `${g.id}: on higher ground`);
    n++;
  }
  assert.ok(n >= 6, n + ' geysers with a ledge');
});
