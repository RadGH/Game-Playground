// node --test prototypes/thousandvale/tests/E/dungeon-tiers.test.js
// Invariants of the multi-floor dungeon generator (stream E, PLAN §3.6, protocol §10.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDungeon, FAMILIES, familyFor, encounterSetsFor, flood, tileIndex, floorPoints, ROOM_KINDS } from '../../js/rules/dungeon-tiers.js';
import { dungeonTerrain, dungeonRoomSpec, describeDungeon, unrleTiles } from '../../js/sim/dungeon.js';

const ENC_DIR = new URL('../../data/encounters/', import.meta.url);
const script = id => JSON.parse(readFileSync(new URL(id + '.json', ENC_DIR), 'utf8'));
/** arena objects of every encounter the ready families use (what the encounter engine will spawn) */
const ARENAS = {};
const SETS = k => encounterSetsFor(k);
for (const k of Object.keys(FAMILIES)) if (FAMILIES[k].ready) for (const set of SETS(k)) for (const e of [...set.miniboss, set.boss]) ARENAS[e.id] = script(e.id).arena?.objects || [];

const READY = Object.keys(FAMILIES).filter(k => FAMILIES[k].ready);
const SEEDS = Array.from({ length: 80 }, (_, k) => (k * 2654435761 + 17) >>> 0);
const CASES = [];
for (const family of READY) for (const floors of [1, 2, 3, 4]) for (const seed of (floors === 2 ? SEEDS : SEEDS.slice(0, 12))) CASES.push({ family, floors, seed });

const walk = (f, p) => { const k = tileIndex(f, p.x, p.z); return k >= 0 && f.tiles[k] === 1; };

test('all 8 families are ready; an unknown family falls back; at least 4 families have 2 encounter sets of their own', () => {
  assert.equal(Object.keys(FAMILIES).length, 8);
  assert.equal(READY.length, 8, 'M2: every layout family');
  for (const k of Object.keys(FAMILIES)) { assert.ok(FAMILIES[familyFor(k)].ready, k); assert.ok(SETS(k).length >= 1, k); }
  const p = planDungeon(5, { family: 'no_such_family' });
  assert.equal(p.familyFallback, 'no_such_family');
  assert.ok(FAMILIES[p.family].ready);
  assert.ok(Object.values(FAMILIES).filter(f => (f.encounterSets || []).length >= 2).length >= 4);
});

test('every family x every encounter set plans, places its bosses, and fits their arenas', () => {
  const bad = [];
  for (const fam of READY) SETS(fam).forEach((set, si) => {
    for (const seed of [1, 2, 3]) {
      const p = planDungeon(seed, { family: fam, floors: 3, set: si, arenas: ARENAS });
      if (p.encounters.boss !== set.boss.id) bad.push(`${fam} set ${si}: boss ${p.encounters.boss}`);
      if (p.encounters.miniboss[0] !== set.miniboss[0].id) bad.push(`${fam} set ${si}: mini-boss`);
      for (const f of p.floors) for (const pr of f.props) { const k = tileIndex(f, pr.x, pr.z); if (k < 0 || !f.tiles[k]) bad.push(`${fam} set ${si} s${seed}: ${pr.id} on a wall`); }
    }
  });
  assert.deepEqual(bad, []);
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
      if (k > 0 && !(f.lift && f.lift.to.length === k)) bad.push(`${family} s${seed} F${k}: no lift to every floor above`);
      if (f.shortcutUp) bad.push(`${family} s${seed} F${k}: the old shortcut is back`);
      // js/sim/dungeon.js puts you 3 m west of the previous floor's stairs down
      if (k > 0) { const prev = p.floors[k - 1]; if (!walk(prev, { x: prev.stairsDown.x - 3, z: prev.stairsDown.z })) bad.push(`${family} s${seed} F${k}: stairs-up landing on a wall`); }
      if (k === 0 && !f.door) bad.push(`${family} s${seed}: no door back out on floor 1`);
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
    for (const e of SETS(k).flatMap(set => [...set.miniboss, set.boss])) { assert.ok(ids.has(e.type), `${e.id} body ${e.type}`); assert.equal(script(e.id).body, e.type, `${e.id}: script body and family body agree`); }
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

// ------------------------------------------------------------------------------------------- play-test 6: U10, U12
import { FLOOR_NAMES } from '../../js/rules/dungeon-tiers.js';

/** Tiles reachable from a point with every tile of the given rooms treated as wall. */
function floodWithout(f, from, rooms) {
  const blocked = new Uint8Array(f.w * f.h);
  for (const r of rooms) for (let j = r.j; j < r.j + r.h; j++) for (let i = r.i; i < r.i + r.w; i++) blocked[j * f.w + i] = 1;
  const seen = new Uint8Array(f.w * f.h), s = tileIndex(f, from.x, from.z), q = [s];
  if (!f.tiles[s] || blocked[s]) return seen;
  seen[s] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % f.w;
    for (const n of [i > 0 ? k - 1 : -1, i < f.w - 1 ? k + 1 : -1, k - f.w, k + f.w]) if (n >= 0 && n < seen.length && f.tiles[n] && !blocked[n] && !seen[n]) { seen[n] = 1; q.push(n); }
  }
  return seen;
}
const inRoom = (f, r, pt) => { const c = f.cell || 2, i = Math.floor((pt.x - f.origin.x) / c), j = Math.floor((pt.z - f.origin.z) / c); return i >= r.i && i < r.i + r.w && j >= r.j && j < r.j + r.h; };
const U_CASES = Object.keys(FAMILIES).flatMap(family => [1, 2, 3, 4].flatMap(floors => [3, 17, 404, 2026, 77777, 919191].map(seed => ({ family, floors, seed }))));

test('U10: in EVERY family the way out stands only behind the last boss — one exit, on the last floor, cut off from that floor\'s start by the boss room', () => {
  const bad = [];
  for (const { family, floors, seed } of U_CASES) {
    const p = planDungeon(seed, { floors, family }), w = `${family} x${floors} s${seed}`;
    const exits = p.floors.filter(f => f.exit);
    if (exits.length !== 1 || exits[0] !== p.floors[p.floors.length - 1]) { bad.push(`${w}: exits on floors ${exits.map(f => f.index)}`); continue; }
    const f = exits[0], boss = f.rooms.find(r => r.kind === 'boss'), reward = f.rooms.find(r => r.kind === 'reward');
    if (!inRoom(f, reward, f.exit)) bad.push(`${w}: the exit is not in the reward room`);
    if (!flood(f, f.landing)[tileIndex(f, f.exit.x, f.exit.z)]) bad.push(`${w}: the exit cannot be reached at all`);
    if (floodWithout(f, f.landing, [boss])[tileIndex(f, f.exit.x, f.exit.z)]) bad.push(`${w}: the exit can be reached without crossing the boss room`);
    // nothing that takes you out or up stands in a boss or mini-boss room, on any floor; the door back out is floor 1's only
    p.floors.forEach((g, k) => {
      if (!!g.door !== (k === 0)) bad.push(`${w} F${k}: door`);
      if (g.door && !(g.door.name && !/way out|exit|portal/i.test(g.door.name))) bad.push(`${w}: the door is named like the exit`);
      for (const key of ['door', 'lift', 'stairsUp', 'landing']) if (g[key]) for (const r of g.rooms.filter(r2 => r2.kind === 'boss' || r2.kind === 'miniboss')) if (inRoom(g, r, g[key])) bad.push(`${w} F${k}: ${key} stands in the ${r.kind} room`);
      if (g.door && !walk(g, g.door)) bad.push(`${w}: the door is in a wall`);
    });
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('U12: every floor has a name and a landing you can stand on, clear of monsters; the lift on each lower floor offers every floor above, nearest first', () => {
  const bad = [];
  for (const { family, floors, seed } of U_CASES) {
    const p = planDungeon(seed, { floors, family }), w = `${family} x${floors} s${seed}`;
    if (new Set(p.floors.map(f => f.name)).size !== floors) bad.push(`${w}: floor names repeat (${p.floors.map(f => f.name).join(', ')})`);
    p.floors.forEach((f, k) => {
      if (f.label !== 'Floor ' + (k + 1) || !f.name) bad.push(`${w} F${k}: label / name`);
      if (!f.landing || !walk(f, f.landing)) { bad.push(`${w} F${k}: landing in a wall`); return; }
      const start = f.rooms.find(r => r.kind === (k === 0 ? 'entry' : 'arrival'));
      if (!inRoom(f, start, f.landing)) bad.push(`${w} F${k}: the landing is not in the ${start.kind} room`);
      for (const pk of f.packs) if (Math.hypot(pk.x - f.landing.x, pk.z - f.landing.z) < (pk.radius || 4) + 6) bad.push(`${w} F${k}: you would get up inside a ${pk.rank} pack`);
      if (!flood(f, f.landing)[tileIndex(f, f.entry.x, f.entry.z)]) bad.push(`${w} F${k}: the landing is cut off from the floor`);
      if (k === 0) { if (f.lift) bad.push(`${w}: a lift on the top floor`); return; }
      if (!walk(f, f.lift)) bad.push(`${w} F${k}: lift in a wall`);
      if (f.lift.to.map(t => t.floor).join() !== Array.from({ length: k }, (_, i) => k - 1 - i).join()) bad.push(`${w} F${k}: lift goes to ${f.lift.to.map(t => t.floor)}`);
      for (const t of f.lift.to) { const g = p.floors[t.floor]; if (t.x !== g.landing.x || t.z !== g.landing.z || t.name !== g.name || t.label !== g.label) bad.push(`${w} F${k}: lift row for floor ${t.floor} is not that floor's landing`); }
    });
  }
  assert.deepEqual(bad.slice(0, 20), []);
  for (const fam of Object.keys(FAMILIES)) assert.ok(FLOOR_NAMES[fam] && FLOOR_NAMES[fam].length === 4, fam + ': floor names');
});
