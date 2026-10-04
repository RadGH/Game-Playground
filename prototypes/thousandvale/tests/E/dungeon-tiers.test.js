// node --test prototypes/thousandvale/tests/E/dungeon-tiers.test.js
// Invariants of the multi-floor dungeon generator (stream E, PLAN §3.6, protocol §10.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDungeon, FAMILIES, familyFor, flood, tileIndex, floorPoints, ROOM_KINDS } from '../../js/rules/dungeon-tiers.js';
import { dungeonTerrain, dungeonRoomSpec, describeDungeon, unrleTiles } from '../../js/sim/dungeon.js';

const ENC_DIR = new URL('../../data/encounters/', import.meta.url);
const script = id => JSON.parse(readFileSync(new URL(id + '.json', ENC_DIR), 'utf8'));
/** arena objects of every encounter the ready families use (what the encounter engine will spawn) */
const ARENAS = {};
for (const f of Object.values(FAMILIES)) if (f.ready) for (const e of [...f.encounters.miniboss, f.encounters.boss]) ARENAS[e.id] = script(e.id).arena?.objects || [];

const READY = Object.keys(FAMILIES).filter(k => FAMILIES[k].ready);
const SEEDS = Array.from({ length: 80 }, (_, k) => (k * 2654435761 + 17) >>> 0);
const CASES = [];
for (const family of READY) for (const floors of [1, 2, 3, 4]) for (const seed of (floors === 2 ? SEEDS : SEEDS.slice(0, 12))) CASES.push({ family, floors, seed });

const walk = (f, p) => { const k = tileIndex(f, p.x, p.z); return k >= 0 && f.tiles[k] === 1; };

test('at least two families are ready and every planned family falls back to a ready one', () => {
  assert.ok(READY.length >= 2, 'M1 needs 2 families');
  assert.equal(Object.keys(FAMILIES).length, 8);
  for (const k of Object.keys(FAMILIES)) assert.ok(FAMILIES[familyFor(k)].ready, k);
  const p = planDungeon(5, { family: 'tower_climb' });
  assert.equal(p.familyFallback, 'tower_climb');
  assert.ok(FAMILIES[p.family].ready);
});

test('protocol §10.3 shape', () => {
  for (const family of READY) {
    const p = planDungeon(42, { floors: 2, level: 3, family });
    assert.equal(p.family, family); assert.equal(p.level, 3); assert.equal(p.cell, 2); assert.equal(p.seed, 42);
    assert.equal(p.floors.length, 2);
    for (const f of p.floors) {
      assert.ok(Number.isInteger(f.index) && f.origin && Number.isFinite(f.origin.x) && Number.isFinite(f.origin.z));
      assert.ok(f.tiles instanceof Uint8Array); assert.equal(f.tiles.length, f.w * f.h);
      assert.ok([...f.tiles].every(t => t === 0 || t === 1));
      for (const r of f.rooms) { assert.ok(ROOM_KINDS.includes(r.kind), r.kind); for (const k of ['i', 'j', 'w', 'h']) assert.ok(Number.isInteger(r[k])); }
      assert.ok(f.entry);
      for (const pk of f.packs) { for (const k of ['x', 'z', 'count', 'level', 'radius']) assert.ok(Number.isFinite(pk[k]), k); assert.ok(['normal', 'elite', 'boss'].includes(pk.rank)); assert.ok(typeof pk.type === 'string'); }
    }
    // floors laid side by side, never overlapping
    const [a, b] = p.floors;
    assert.ok(b.origin.x >= a.origin.x + a.w * p.cell);
  }
});

test('same seed -> identical plan; different seed -> different plan', () => {
  for (const family of READY) {
    const a = JSON.stringify(planDungeon(9, { family }), (k, v) => v instanceof Uint8Array ? [...v] : v);
    const b = JSON.stringify(planDungeon(9, { family }), (k, v) => v instanceof Uint8Array ? [...v] : v);
    const c = JSON.stringify(planDungeon(10, { family }), (k, v) => v instanceof Uint8Array ? [...v] : v);
    assert.equal(a, b); assert.notEqual(a, c);
  }
});

test(`every named point is on floor and reachable from the floor's entry (${CASES.length} dungeons)`, () => {
  const bad = [];
  for (const { family, floors, seed } of CASES) {
    const p = planDungeon(seed, { floors, level: 3, family });
    for (const f of p.floors) {
      const seen = flood(f, f.entry);
      for (const [label, pt] of floorPoints(f)) {
        const k = tileIndex(f, pt.x, pt.z);
        if (k < 0 || !f.tiles[k]) bad.push(`${family} s${seed} F${f.index}: ${label} on a wall`);
        else if (!seen[k]) bad.push(`${family} s${seed} F${f.index}: ${label} unreachable`);
      }
      // every floor tile is reachable (no orphan pockets drawn on the map)
      let orphans = 0;
      for (let k = 0; k < f.tiles.length; k++) if (f.tiles[k] && !seen[k]) orphans++;
      if (orphans) bad.push(`${family} s${seed} F${f.index}: ${orphans} orphan tiles`);
    }
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('floors are connected: stairs down -> next entry, stairs up exists, A\'s stairs-up landing is walkable', () => {
  const bad = [];
  for (const { family, floors, seed } of CASES) {
    const p = planDungeon(seed, { floors, family });
    p.floors.forEach((f, k) => {
      const last = k === p.floors.length - 1;
      if (!last && !f.stairsDown) bad.push(`${family} s${seed} F${k}: no stairs down`);
      if (k > 0 && !f.stairsUp) bad.push(`${family} s${seed} F${k}: no stairs up`);
      if (k > 0 && !f.shortcutUp) bad.push(`${family} s${seed} F${k}: no shortcut up`);
      // js/sim/dungeon.js puts you 3 m west of the previous floor's stairs down
      if (k > 0) { const prev = p.floors[k - 1]; if (!walk(prev, { x: prev.stairsDown.x - 3, z: prev.stairsDown.z })) bad.push(`${family} s${seed} F${k}: stairs-up landing on a wall`); }
      if (k === 0 && !f.exit) bad.push(`${family} s${seed}: no way out on floor 1`);
    });
    const last = p.floors[p.floors.length - 1];
    if (!last.chest || !last.exit) bad.push(`${family} s${seed}: no reward chest / loop-back exit`);
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('room programme: one start room, a key room, a mini-boss per floor, one boss + reward room on the last floor', () => {
  const bad = [];
  for (const { family, floors, seed } of CASES) {
    const p = planDungeon(seed, { floors, family });
    p.floors.forEach((f, k) => {
      const n = kind => f.rooms.filter(r => r.kind === kind).length;
      const last = k === p.floors.length - 1;
      if (n(k === 0 ? 'entry' : 'arrival') !== 1) bad.push(`${family} s${seed} F${k}: start rooms`);
      if (n('key') !== 1) bad.push(`${family} s${seed} F${k}: key rooms ${n('key')}`);
      if (n('miniboss') !== 1) bad.push(`${family} s${seed} F${k}: mini-bosses ${n('miniboss')}`);
      if (n('boss') !== (last ? 1 : 0) || n('reward') !== (last ? 1 : 0)) bad.push(`${family} s${seed} F${k}: boss/reward`);
      if (n('fight') < 3) bad.push(`${family} s${seed} F${k}: only ${n('fight')} fight rooms`);
      if (f.level !== 3 + 2 * k) bad.push(`${family} s${seed} F${k}: level ${f.level}`);
      const mbp = f.packs.filter(pk => pk.encounter && pk.rank === 'elite');
      if (mbp.length !== 1) bad.push(`${family} s${seed} F${k}: mini-boss packs ${mbp.length}`);
      if (last && f.packs.filter(pk => pk.rank === 'boss' && pk.encounter).length !== 1) bad.push(`${family} s${seed}: boss pack`);
    });
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('the gate matters: lever reachable with the gate shut, the guarded room (boss / mini-boss) is not', () => {
  const bad = [];
  for (const { family, floors, seed } of CASES) {
    const p = planDungeon(seed, { floors, family });
    p.floors.forEach((f, k) => {
      const shut = flood(f, f.entry, { gateShut: true });
      const at = pt => shut[tileIndex(f, pt.x, pt.z)];
      if (!at(f.lever)) bad.push(`${family} s${seed} F${k}: lever behind its own gate`);
      const guarded = f.rooms.find(r => r.kind === 'boss') || f.rooms.find(r => r.kind === 'miniboss');
      if (at(guarded)) bad.push(`${family} s${seed} F${k}: ${guarded.kind} reachable with the gate shut`);
      if (f.chest && at(f.chest)) bad.push(`${family} s${seed}: reward reachable with the gate shut`);
      // the gate tiles are floor (a server that ignores gates still walks through)
      for (let j = f.gate.j; j < f.gate.j + f.gate.h; j++) for (let i = f.gate.i; i < f.gate.i + f.gate.w; i++) if (!f.tiles[j * f.w + i]) bad.push(`${family} s${seed} F${k}: gate tile on a wall`);
    });
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('every encounter body is a real bestiary id and every encounter script exists', () => {
  const enemies = JSON.parse(readFileSync(new URL('../../../farhold/data/enemies.json', import.meta.url), 'utf8'));
  const ids = new Set([...enemies.enemies, ...enemies.bosses].map(e => e.id));
  for (const [k, f] of Object.entries(FAMILIES)) if (f.ready) {
    for (const t of [...f.roster.normal, f.roster.elite]) assert.ok(ids.has(t), `${k} roster ${t}`);
    for (const e of [...f.encounters.miniboss, f.encounters.boss]) { assert.ok(ids.has(e.type), `${e.id} body ${e.type}`); assert.equal(script(e.id).body, e.type, `${e.id}: script body and family body agree`); }
  }
});

test('the boss is far from the door and every arena object stands on open floor inside its own room', () => {
  const bad = [];
  for (const { family, floors, seed } of CASES) {
    const p = planDungeon(seed, { floors, family, arenas: ARENAS });
    const last = p.floors[p.floors.length - 1];
    const boss = last.rooms.find(r => r.kind === 'boss');
    if (Math.hypot(boss.x - last.entry.x, boss.z - last.entry.z) < 40) bad.push(`${family} s${seed}: boss ${Math.hypot(boss.x - last.entry.x, boss.z - last.entry.z).toFixed(0)} m from the arrival`);
    for (const f of p.floors) for (const pr of f.props) {
      const r = f.rooms[pr.room];
      const x0 = f.origin.x + r.i * p.cell, z0 = f.origin.z + r.j * p.cell;
      const m = (pr.r || 1) + 0.5;   // the whole object, plus room to walk round it
      if (pr.x - m < x0 || pr.z - m < z0 || pr.x + m > x0 + r.w * p.cell || pr.z + m > z0 + r.h * p.cell) bad.push(`${family} s${seed} F${f.index} ${pr.id} (${pr.encounter}) pokes out of its ${r.w * p.cell}x${r.h * p.cell} m room`);
      if (!walk(f, pr)) bad.push(`${family} s${seed} ${pr.id} on a wall`);
      if (!['miniboss', 'boss'].includes(r.kind)) bad.push(`${pr.id} in a ${r.kind} room`);
    }
    // every arena object of every placed encounter made it into the plan
    const want = p.floors.flatMap(f => f.packs.filter(pk => pk.encounter).map(pk => ARENAS[pk.encounter].length)).reduce((a, b) => a + b, 0);
    if (p.floors.reduce((a, f) => a + f.props.length, 0) !== want) bad.push(`${family} s${seed}: props missing`);
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('drop-in for stream A: dungeonTerrain / dungeonRoomSpec / describeDungeon accept the plan', () => {
  for (const family of READY) {
    const p = planDungeon(77, { floors: 2, level: 3, family });
    const t = dungeonTerrain(p);
    assert.ok(t.walkable(p.floors[0].entry.x, p.floors[0].entry.z));
    const spec = dungeonRoomSpec(p, { exitTo: { room: 'wilds', x: 10, z: 10 } });
    assert.ok(spec.camps.length >= 8);
    for (const o of spec.objects) if (o.portal && o.portal.to === 'here') assert.ok(t.walkable(o.portal.x, o.portal.z), `${o.name} lands on a wall`);
    for (const o of spec.objects) if (o.type !== 'gate') assert.ok(t.walkable(o.x, o.z), `${o.name} stands in a wall`);
    // the gate starts shut and the lever opens it (A's terrain honours gates)
    if (t.openGate) { const f = p.floors[0]; assert.ok(!t.walkable(f.gate.x, f.gate.z)); t.openGate(0); assert.ok(t.walkable(f.gate.x, f.gate.z)); }
    const d = JSON.parse(JSON.stringify(describeDungeon(p)));
    d.floors.forEach((f, k) => assert.deepEqual([...unrleTiles(f.tiles, f.w * f.h)], [...p.floors[k].tiles]));
  }
});

test('purity: no DOM, fetch, storage, wall clock or Math.random', () => {
  const src = readFileSync(new URL('../../js/rules/dungeon-tiers.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  for (const re of [/\bwindow\./, /\bdocument\./, /\bfetch\(/, /localStorage|indexedDB/, /Math\.random\(/, /Date\.now\(/, /performance\.now\(/, /from ['"]three['"]/, /\bimport\b/]) assert.ok(!re.test(src), String(re));
});
