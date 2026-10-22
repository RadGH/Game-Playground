// Chibi 2.5 fixes from the resume site's bug report (2026-10-22, ~/claude/resume/assets/chibi/BUG-REPORT-PROMPT.md).
//   1. plate / mail / scale arms and the plate shoulder caps follow the top's colour (they were a fixed dark steel)
//   2. capelets (fur mantle, shoulder cape, feather mantle) cover the shoulder at any shoulders / arms / shape mix
//   3. giant proportions: the head comes up with the frame, long arms, shins and feet thicken (RACE25_TUNE, LIMB_BULK)
//   4. halfling head a touch smaller; headSize reaches 0.72x..1.28x on a 2.5 body
// v2 looks are untouched by all four (chibi25.test.js holds every v2 look to its hash).
// Run: node --test avatar-3d/tests/chibi25-site-report.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);
const { createChibi2Character } = await import('../js/chibi2.js');
const { buildMeasured, clipCheck } = await import('../../tools/chibi25-measure.mjs');
const { race25, applyBody25, HEAD25_RANGE } = await import('../js/chibi25-body.js');
const { raceOf } = await import('../js/chibi2-races.js');
const { createRig } = await import('../js/chibi2-geometry.js');

const PALADIN = { body: { race: 'human', skin: '#8d5a3b', height: 0.6, width: 0.65, shape: 'broad', posture: 'proud', v: 2.5 }, headShape: 'square', hair: { id: 'short', color: '#1a1210' }, eyes: { id: 'sharp', color: '#4a3020' }, top: { id: 'plate', color: '#dfe3ea', color2: '#d4af37' }, bottom: { id: 'greaves', color: '#c8ccd4' }, shoes: { id: 'heavy', color: '#b0b4bc' }, hat: { id: 'plate_helm', color: '#e6e9ef' }, cape: { id: 'long_cloak', color: '#f4f0e0' }, decor: { id: 'tabard', color: '#f6f2e6' }, held: { id: 'fh_longsword' }, offhand: { id: 'kite_shield', color: '#f4f0e0' } };
const ORC = { body: { race: 'orc', skin: '#7e9a6a', width: 0.75, shape: 'broad', arms: 0.85, shoulders: 0.8, posture: 'hunched', v: 2.5 }, headShape: 'wide', hair: { id: 'warrior_braids', color: '#3a2418' }, eyes: { id: 'angry', color: '#c84a2a' }, mouth: { id: 'tusks' }, ears: { id: 'notched' }, top: { id: 'harness', color: '#5a3a22' }, bottom: { id: 'kilt', color: '#6a4a2a' }, shoes: { id: 'wraps', color: '#8a7a5a' }, hat: { id: 'horned_helm', color: '#8a8a92' }, cape: { id: 'fur_mantle', color: '#7a5a3a' }, decor: { id: 'trophy_belt', color: '#6a5030' }, held: { id: 'fh_greataxe' } };

/** Vertex colours of everything skinned mostly to `bones`, as one flat list (bind order, so two builds line up). */
async function boneColours(look, bones) {
  const actor = await createChibi2Character(look), out = [];
  actor.group.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const names = o.skeleton.bones.map(b => b.name), g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, col = g.attributes.color;
    for (let i = 0; i < si.count; i++) if (sw.getX(i) > 0.5 && bones.includes(names[si.getX(i)])) out.push(col.getX(i), col.getY(i), col.getZ(i));
  });
  actor.dispose();
  return out;
}
const changed = (p, q) => { let n = 0; for (let i = 0; i < Math.min(p.length, q.length); i += 3) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 0.05) n++; return n; };

test('1. armour arms + plate shoulder caps follow top.color on 2.5 (and stay steel on v2)', async () => {
  for (const id of ['plate', 'chainmail', 'scale_plate']) {
    const white = { ...PALADIN, top: { ...PALADIN.top, id, color: '#f0f0f0' } }, red = { ...white, top: { ...white.top, color: '#a02020' } };
    const n25 = changed(await boneColours(white, ['armL', 'armR']), await boneColours(red, ['armL', 'armR']));
    assert.ok(n25 > (id === 'chainmail' ? 100 : 200), `${id} 2.5: only ${n25} upper-arm vertices follow the top's colour`);
    const v2w = { ...white, body: { ...white.body, v: 2 } }, v2r = { ...red, body: { ...red.body, v: 2 } };
    // (v2: the scale top's own shoulder piece already used top.color — only plate / mail are held to "no change")
    if (id !== 'scale_plate') assert.equal(changed(await boneColours(v2w, ['armL', 'armR']), await boneColours(v2r, ['armL', 'armR'])), 0, `${id} v2 arms moved`);
  }
});

test('2. the orc from the report in motion: the mantle stays off the arms (a no-slider orc had it inside them on every frame)', async () => {
  const m = await buildMeasured(ORC, { trace: true });
  const r = clipCheck(m, ['idle', 'walk', 'run', 'attack'], { steps: 10 });
  m.actor.dispose();
  const of = clip => Object.entries(r[clip] || {}).filter(([k]) => k.startsWith('back>upper'));
  for (const clip of ['idle', 'walk', 'run']) assert.deepEqual(of(clip).map(([k, y]) => `${k} ${y.frames}`), [], clip);
  // the overhead greataxe swing lifts the arm straight up through any capelet for a moment (a no-slider orc too)
  for (const [k, y] of of('attack')) assert.ok(y.frames <= 2 && y.deep <= 0.03, `attack ${k}: ${y.frames} frames, ${y.deep} m`);
});

/** Bind pose: half-width of the capelet (gear pieces on the chest bone) against the outside of the shoulder ball. */
async function mantleVsShoulder(look) {
  const m = await buildMeasured(look, { trace: true });
  const bones = m.actor.skeleton.bones, armR = bones.find(b => b.name === 'armR'), elbow = bones.find(b => b.name === 'elbowR');
  let half = 0;
  for (const p of m.pieces) {
    if (p.stage !== 'gear') continue;
    const g = p.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
    if (!['chest', 'armR', 'armL'].includes(bones[si.getX(0)].name) || pos.count < 60) continue;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) half = Math.max(half, Math.abs(pos.getX(i)));
  }
  // the upper arm at its widest, in world x (bind pose: arms hang straight, so its top sits at the arm bone)
  const LW = Math.pow(Math.abs(bones.find(b => b.name === 'legR').position.x) / 0.115, 0.65);
  const a = new (await import('three')).Vector3(); armR.getWorldPosition(a);
  m.actor.dispose();
  return { half, shoulder: a.x + 0.07 * LW * (look._armThick || 1) };
}

test('2a. bind pose: the fur mantle reaches past the outside of the shoulder (orc from the report + no-slider orc)', async () => {
  for (const look of [ORC, { ...ORC, body: { race: 'orc', skin: '#7e9a6a', v: 2.5 } }]) {
    const { half, shoulder } = await mantleVsShoulder(look);
    assert.ok(half >= shoulder, `${JSON.stringify(look.body)}: mantle ${half.toFixed(3)} m wide vs shoulder out at ${shoulder.toFixed(3)} m`);
  }
});

test('2b. any slider mix: capelets clear the shoulders on every race at shoulders/arms 1 and the widest shapes', async () => {
  const bad = [];
  for (const race of ['human', 'orc', 'dwarf', 'giant', 'elf', 'goblin', 'halfling']) for (const shape of ['broad', 'heavy']) for (const cape of ['fur_mantle', 'shoulder_cape', 'feather_mantle']) {
    const look = { ...ORC, body: { race, skin: '#b08a6a', width: 1, shape, arms: 1, shoulders: 1, v: 2.5 }, cape: { id: cape, color: '#7a5a3a' } };
    const m = await buildMeasured(look, { trace: true });
    const r = clipCheck(m, ['idle'], { steps: 4 });
    m.actor.dispose();
    const f = Object.entries(r.idle || {}).filter(([k]) => k.startsWith('back>upper')).reduce((t, [, y]) => t + y.frames, 0);
    if (f) bad.push(`${race}/${shape}/${cape}: ${f}`);
    const { half, shoulder } = await mantleVsShoulder(look);
    if (half < shoulder) bad.push(`${race}/${shape}/${cape}: ${half.toFixed(3)} < ${shoulder.toFixed(3)}`);
  }
  assert.deepEqual(bad, []);
});

test('3 + 4. giant head grows with its frame, long limbs thicken; halfling head smaller; headSize range widened', () => {
  const rig = (body) => { const a = { body: { v: 2.5, ...body } }; const r = createRig(a.body, race25(a, raceOf(a))); r.v25 = true; return applyBody25(r, a); };
  const giant = rig({ race: 'giant', shape: 'heavy' }), human = rig({ race: 'human' }), half = rig({ race: 'halfling', shape: 'petite' });
  const v2giant = createRig({ race: 'giant' }, raceOf({ body: { race: 'giant' } }));
  assert.ok(giant.headScale > v2giant.headScale * 1.15, `giant head ${giant.headScale} vs v2 ${v2giant.headScale}`);
  assert.ok(giant.shinThick > 1.15 * giant.legThick && giant.armThick > 1.3 && giant.footK > 1.1, `giant shins ${giant.shinThick} / arms ${giant.armThick} / feet ${giant.footK}`);
  assert.equal(human.shinThick, 1); assert.equal(human.footK, 1); assert.equal(rig({ race: 'orc', shape: 'broad' }).footK, 1);
  const v2half = createRig({ race: 'halfling' }, raceOf({ body: { race: 'halfling' } }));
  assert.ok(half.headScale < v2half.headScale * 0.92, `halfling head ${half.headScale} vs v2 ${v2half.headScale}`);
  const lo = rig({ race: 'human', headSize: 0 }), hi = rig({ race: 'human', headSize: 1 });
  assert.ok(Math.abs(lo.headScale - HEAD25_RANGE[0]) < 1e-9 && Math.abs(hi.headScale - HEAD25_RANGE[1]) < 1e-9, `${lo.headScale}..${hi.headScale}`);
  assert.ok(Math.abs(human.headScale - 1) < 1e-9);
});

test('the paladin, orc and giant from the report all build finite geometry', async () => {
  for (const look of [PALADIN, ORC, { body: { race: 'giant', shape: 'heavy', v: 2.5 }, top: { id: 'sash_robe', color: '#5a7a3a' }, bottom: { id: 'long_skirt', color: '#4a5a2a' }, cape: { id: 'feather_mantle', color: '#6a4a2a' } }]) {
    const a = await createChibi2Character(look);
    a.group.traverse(o => { if (o.isSkinnedMesh) for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v)); });
    a.dispose();
  }
});
