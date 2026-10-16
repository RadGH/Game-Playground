// node --test avatar-3d/tests/chibi25-hair.test.js
// Chibi 2.5 HAIR PASS 2 (2026-10-16, owner: "fix floating parts, see-through edges, and add more original hair styles —
// stop reusing the same top front decorations"). Measured on every style's real pieces (tools/chibi25-hair-audit.mjs):
//
//   1. FLOATING: every hair piece touches the scalp, or a hair piece that does, within 5 mm (a chain back to the skull).
//   2. SEE-THROUGH: no piece is partly inside out (an edge walked twice the same way), and no open edge is out in the
//      air (an open edge must be under the skin or flush on another piece). The browser half — every back face that
//      can actually be SEEN, from eight angles — is avatar-3d/tests/chibi25-hair.spec.js.
//   3. Z-FIGHTING: no piece has more than 3% of its surface coincident with another (within 0.2 mm, same facing).
//   4. ORIGINALITY: every style has its own front (`hair:front` pieces) and no front piece is shared by two styles.
//   5. MORE STYLES: at least 12 new ones in hair pass 2, each registered `bespoke` with its OWN 2D picture (not an alias).
//   6. BUDGET: every style on the heaviest class look stays under 8,500 triangles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);

const { createChibi2Character } = await import('../js/chibi2.js');
const { CHIBI25_OPTIONS, asV25 } = await import('../js/chibi25-options.js');
const { HAIR25_STYLES } = await import('../js/chibi25-hair.js');
const { PARTS } = await import('../../avatar-2d/js/parts/index.js');
const { hairAudit, AUDIT_BASE } = await import('../../tools/chibi25-hair-audit.mjs');

const HAIRS = CHIBI25_OPTIONS.face.hair.ids.filter(h => h !== 'bald');
// hair pass 2's thirteen (part A's ten come before them in `added`)
const PASS2 = ['crown_braid', 'side_shave', 'wolf_cut', 'half_up', 'ribbon_loops', 'cornrows', 'warrior_braids', 'feathered', 'curly_bob', 'puff', 'rolled_tail', 'bowl', 'court_cut'];

const audits = new Map();
const audit = async (id) => { if (!audits.has(id)) audits.set(id, await hairAudit({ ...AUDIT_BASE, hair: { id, color: '#6b4a2a' } })); return audits.get(id); };

test('every hair id is built by its own style function (nothing falls back to another style)', () => {
  for (const id of CHIBI25_OPTIONS.face.hair.ids) assert.ok(HAIR25_STYLES.includes(id), `${id} has no style in chibi25-hair.js`);
});

test('FLOATING / SEE-THROUGH / Z-FIGHTING: every piece of every style is attached, closed, and never coincident', async () => {
  const bad = [];
  for (const id of HAIRS) {
    const r = await audit(id);
    for (const p of r.floating) bad.push(`${id}: ${p.tag}#${p.i} floats ${(p.gap * 1000).toFixed(1)} mm from anything`);
    for (const f of r.flipped) bad.push(`${id}: ${f.tag}#${f.i} is partly inside out (${f.edges} edges)`);
    for (const o of r.open) bad.push(`${id}: ${o.tag}#${o.i} has ${o.edges} open edges in the air (${(o.worst * 1000).toFixed(0)} mm out)`);
    for (const z of r.zfight) bad.push(`${id}: ${z.tag}#${z.i} ${(z.zfight * 100).toFixed(0)}% coincident with another surface`);
  }
  assert.deepEqual(bad, []);
});

test('ORIGINALITY: every style has its own front, and no two styles share a front piece', async () => {
  const owners = new Map();
  for (const id of HAIRS) {
    const r = await audit(id);
    assert.ok(r.front.length >= 1, `${id} has no front piece`);
    for (const f of new Set(r.front)) { if (!owners.has(f)) owners.set(f, []); owners.get(f).push(id); }
  }
  const shared = [...owners.values()].filter(l => l.length > 1).map(l => l.join(' + '));
  assert.deepEqual(shared, [], 'front pieces built identically for more than one style');
});

test('MORE STYLES: hair pass 2 adds at least 12, each bespoke with its own 2D picture; every 2.5 style draws its own', () => {
  for (const id of PASS2) assert.ok(CHIBI25_OPTIONS.face.hair.added.includes(id), `${id} is not listed`);
  assert.ok(PASS2.length >= 12);
  const pictures = new Map();
  for (const id of CHIBI25_OPTIONS.face.hair.added) {
    const p = PARTS.hair[id];
    assert.ok(p && p.bespoke, `${id}: not registered bespoke`);
    assert.ok(!p.alias, `${id}: its 2D picture is an alias of ${p.alias}`);
    assert.ok(CHIBI25_OPTIONS.face.hair.names[id], `${id}: no menu name`);
    const svg = (p.pieces || []).map(x => x.svg).join('');
    assert.ok(svg.length > 40, `${id}: empty picture`);
    assert.ok(!pictures.has(svg), `${id} draws the same picture as ${pictures.get(svg)}`); pictures.set(svg, id);
  }
});

test('BUDGET: every style on the heaviest Emberveil class look (no hat) stays under 8,500 triangles', async () => {
  const L = JSON.parse(readFileSync(new URL('../../prototypes/emberveil/data/class-looks.json', import.meta.url))).classes;
  let heavy = null, most = 0;
  for (const c of Object.values(L)) { const a = await createChibi2Character(asV25(c.avatar)); const t = a.stats().triangles; a.dispose(); if (t > most) { most = t; heavy = c.avatar; } }
  const over = [];
  for (const id of HAIRS) {
    const a = await createChibi2Character(asV25({ ...heavy, hat: { id: 'none' }, hair: { ...heavy.hair, id } }));
    const s = a.stats(); a.dispose();
    if (s.triangles >= 8500 || s.meshes > 2) over.push(`${id}: ${s.triangles} triangles, ${s.meshes} meshes`);
  }
  assert.deepEqual(over, []);
});
