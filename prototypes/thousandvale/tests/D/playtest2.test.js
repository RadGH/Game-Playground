// Stream D-world — play-test 2 (docs: /home/radgh/claude/agent/mmo/round-playtest2.md), the pure parts:
//   Q7  no glass floats: every lit pane the town draws is a window the building kit put ON a wall (the old code stamped
//       two panes on the footprint's front edge whatever the shape: 18 of Torborhold's 90 hung in the air)
//   Q10 every office trade has its own look; only shops/services carry lanterns and real lights; ordinary homes none
//   Q8  auras follow info.st: a dead body shows none, a stale snapshot never undoes a fresh event
// Run: node --test prototypes/thousandvale/tests/D/playtest2.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { describeBuilding } from '../../../../proctown/js/buildkit.js';
import { officeDressing, officeKindFor, OFFICE_KINDS } from '../../../../proctown/js/offices.js';
import { wantedAuras, auraDiff } from '../../js/client/status-sync.js';
import { STATUS_LOOK } from '../../js/client/spell-looks.js';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const G = new URL('../../', import.meta.url);
const zones = readdirSync(new URL('data/zones/', G)).filter(z => existsSync(new URL(`data/zones/${z}/placements.json`, G)));
const placementsOf = z => { const d = JSON.parse(readFileSync(new URL(`data/zones/${z}/placements.json`, G))); return d.placements || d; };
const strHash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Distance from a point to the surface of a kit wall part (box or cylinder, local frame, yaw 0). */
function toWall(px, py, pz, w) {
  if (py < w.y - 0.05 || py > w.y + w.h + 0.05) return Infinity;
  if (w.mesh === 'cyl') return Math.abs(Math.hypot(px - w.x, pz - w.z) - w.w / 2);
  const dx = Math.abs(px - w.x) - w.w / 2, dz = Math.abs(pz - w.z) - w.d / 2;
  if (dx > 0.05 && dz > 0.05) return Math.hypot(dx, dz);
  return Math.abs(Math.max(dx, dz)) <= 0.2 ? Math.abs(Math.max(dx, dz)) : Math.max(dx, dz) > 0 ? Math.max(dx, dz) : Infinity;
}

test('Q7: every pane of glass in every town sits on a wall of its own building', async () => {
  const { buildingLook } = await import('../../js/client/town-view.js');
  let panes = 0, floating = 0, buildings = 0;
  for (const z of zones) {
    const list = placementsOf(z);
    const cult = {}; for (const p of list) if (p.kind === 'town_square') cult[p.data?.town] = p.data?.culture;
    for (const raw of list) {
      if (raw.kind !== 'building') continue;
      buildings++;
      const look = buildingLook(raw, { culture: cult[raw.data?.town] || 'human', townSeed: strHash(raw.data?.town) });
      const walls = look.parts.filter(q => q.tag === 'wall');
      for (const w of look.parts.filter(q => q.tag === 'window')) {
        panes++;
        const d = Math.min(...walls.map(m => toWall(w.x, w.y + w.h / 2, w.z, m)));
        if (!(d < 0.2)) floating++;
      }
    }
  }
  assert.ok(buildings > 100 && panes > 200, `${buildings} buildings, ${panes} panes`);
  assert.equal(floating, 0, `${floating} of ${panes} panes are not on a wall`);
  // and the town draws ONLY those panes (plus lantern glass on lit offices): no footprint-stamped boxes left
  const src = readFileSync(new URL('js/client/town-view.js', G), 'utf8');
  assert.ok(!/side \* fw \* 0\.28/.test(src), 'the old footprint-stamped windows are gone');
  assert.ok(/part\.tag === 'window'/.test(src), 'glass comes from the kit\'s own window parts');
});

test('Q10: Torborhold dresses its offices, lights only the shops, and homes carry no light', async () => {
  const { buildingLook } = await import('../../js/client/town-view.js');
  const list = placementsOf('z12_02');
  const seen = new Map();
  for (const raw of list) {
    if (raw.kind !== 'building') continue;
    const look = buildingLook(raw, { townSeed: strHash(raw.data?.town) });
    if (!look.kind) { assert.equal(look.lit, false); assert.equal(look.dressing, null); continue; }
    assert.ok(look.dressing.parts.length >= 5, `${look.kind} has a look`);
    if (look.lit) assert.ok(look.dressing.lights.length > 0, `lit ${look.kind} has a lantern`);
    else assert.equal(look.dressing.lights.length, 0, `${look.kind} is not lit, so no street light`);
    seen.set(look.kind, look);
  }
  for (const k of ['forge', 'inn', 'shop', 'hall', 'stable']) assert.ok(seen.has(k), `Torborhold has a ${k} (offices: ${[...seen.keys()].join(', ')})`);
});

test('Q10: every office trade is its own shape; shops are lit and offices you visit on purpose are not', () => {
  const sig = d => d.parts.map(p => `${p.mesh}:${p.w.toFixed(2)}x${p.h.toFixed(2)}x${p.d.toFixed(2)}`).sort().join('|');
  const plot = { cx: 0, cz: 0, w: 10, d: 9, angle: 0, facing: Math.PI / 2 };
  const sigs = new Map();
  for (const [kind, K] of Object.entries(OFFICE_KINDS)) {
    const desc = describeBuilding({ plot, culture: 'human', seed: 11, want: 'house' });   // the SAME body for every trade
    const d = officeDressing(kind, desc, { seed: 3 });
    for (const p of [...d.parts, ...d.spin.flatMap(s => s.parts)]) {
      assert.ok(p.w > 0 && p.h > 0 && p.d > 0 && [p.x, p.y, p.z, p.rx, p.rz].every(Number.isFinite), `${kind}: a bad part`);
      assert.match(p.colour, /^#[0-9a-f]{6}$/i);
      assert.ok(Math.abs(p.x) < 14 && Math.abs(p.z) < 14 && (p.y > -0.5 || !d.parts.includes(p)), `${kind}: a part strays ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);   // spin parts are relative to their hub
    }
    assert.equal(d.lights.length > 0, K.lit && d.lights.length > 0, `${kind}: lights only when lit`);
    if (!K.lit) assert.equal(d.lights.length, 0, `${kind} is unlit`);
    if (['forge', 'shop', 'inn', 'stable', 'barber', 'apothecary'].includes(kind)) assert.ok(d.lights.length > 0, `${kind} draws the eye`);
    sigs.set(kind, sig(d));
  }
  // twins allowed only where the trade is the same thing under another name
  const same = new Set(['shop/provisioner', 'temple/chapel', 'temple/shrine', 'chapel/shrine', 'granary/warehouse']);
  const kinds = [...sigs.keys()];
  for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
    if (same.has(`${kinds[i]}/${kinds[j]}`)) continue;
    assert.notEqual(sigs.get(kinds[i]), sigs.get(kinds[j]), `${kinds[i]} and ${kinds[j]} look the same`);
  }
  // an explicit unlit flag wins over the trade's default (B's data.lit / A's office.lit)
  const desc = describeBuilding({ plot, culture: 'human', seed: 11, want: 'shop' });
  assert.equal(officeDressing('shop', desc, { lit: false }).lights.length, 0);
  // roles and wants both find their trade
  for (const [n, k] of [['smith', 'forge'], ['merchant', 'shop'], ['innkeeper', 'inn'], ['elder', 'hall'], ['barber', 'barber'], ['unbinder', 'study'], ['broker', 'counting_house'], ['stablehand', 'stable'], ['house', null], ['hut', null]]) assert.equal(officeKindFor(n), k, n);
});

test('Q8: auras follow info.st — none on the dead, unknown ids still drawn, fresh events survive a stale snapshot', () => {
  assert.deepEqual([...wantedAuras(['burn', 'chill'], false)].sort(), ['burn', 'slow']);
  assert.equal(wantedAuras(['burn'], true).size, 0, 'a corpse does not burn');
  assert.equal(wantedAuras(undefined, false).size, 0);
  assert.ok(wantedAuras(['some_new_status'], false).has('some_new_status'), 'an unknown status still shows a mote');
  // every status Farhold's skills apply has a real aura
  const skills = JSON.parse(readFileSync(new URL('../farhold/data/skills.json', G)));
  const ids = new Set();
  const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'status' && typeof v === 'string') ids.add(v); else walk(v); } };
  walk(skills);
  for (const s of ids) assert.ok(STATUS_LOOK[s], `status ${s} has no aura`);
  // sync
  const drawn = new Set(['burn']);
  assert.deepEqual(auraDiff(drawn, new Set(), new Map(), 0), { on: [], off: ['burn'] }, 'gone from info -> off');
  assert.deepEqual(auraDiff(new Set(), new Set(['burn']), new Map(), 0), { on: ['burn'], off: [] }, 'late arrival sees it');
  const grace = new Map([['burn', 1000]]);
  assert.deepEqual(auraDiff(drawn, new Set(), grace, 500), { on: [], off: [] }, 'an event a moment ago beats a stale snapshot');
  assert.deepEqual(auraDiff(drawn, new Set(), grace, 1500), { on: [], off: ['burn'] }, '…but not for long');
  const offGrace = new Map([['burn', 1000], ['-burn', 1]]);
  assert.deepEqual(auraDiff(new Set(), new Set(['burn']), offGrace, 500), { on: [], off: [] }, 'a fresh "off" is not undone by a stale "on"');
});
