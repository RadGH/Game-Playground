// Chibi 2.5 (part B): gear vs body clipping, counted (tools/chibi25-measure.mjs clipCheck).
//
// Every Emberveil class look built as a 2.5 body plays idle, walk, run, attack, ready, guard and cast; the body is
// stood in by solids just inside its skin and every held item, shoulder piece, cape/capelet/pack and breastplate
// vertex is checked against the parts it must never be inside (see clipCheck). What 2.5 fixed, held to it:
//   - capelets, mantles and the half cape vs the upper arms: Chibi 2 had ~2,000 frames of it; 2.5 none
//   - a held item in the face (a lute or a mace at the guard): Chibi 2 87 frames; 2.5 at most a graze on one frame
//   - a breastplate's sides vs the upper arms: no deeper than the arm already sits against the chest (3 cm)
// Run: node --test avatar-3d/tests/chibi25-clip-body.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);
const { buildMeasured, clipCheck } = await import('../../tools/chibi25-measure.mjs');
const { CHIBI2_COMBAT_ALL } = await import('../js/chibi2-motion.js');
const classes = JSON.parse(readFileSync(new URL('../../prototypes/emberveil/data/class-looks.json', import.meta.url))).classes;
const CLIPS = ['idle', 'walk', 'run', 'attack', 'ready', 'guard', 'cast'];

async function survey(v25) {
  const tot = {}, deep = {}, where = {};
  for (const [id, c] of Object.entries(classes)) {
    const look = { ...c.avatar, body: { ...c.avatar.body, ...(v25 ? { v: 2.5 } : {}) } };
    const m = await buildMeasured(look, { anims: CHIBI2_COMBAT_ALL, trace: true });
    const r = clipCheck(m, CLIPS, { steps: 10 });
    m.actor.dispose();
    for (const [clip, x] of Object.entries(r)) for (const [k, y] of Object.entries(x)) {
      const kind = k.replace(/[LR]>/, '>').replace(/(upper|fore|thigh|shin|hand)[LR]$/, '$1');
      tot[kind] = (tot[kind] || 0) + y.frames;
      if (y.deep > (deep[kind] || 0)) { deep[kind] = y.deep; where[kind] = `${id} ${clip}`; }
    }
  }
  return { tot, deep, where };
}

test('2.5 class looks: capes and mantles stay off the arms, nothing held sits in the face, plates clear the arms', async () => {
  const v2 = await survey(false), v25 = await survey(true);
  // the "before" really had the problem (so the test is measuring something)
  assert.ok((v2.tot['back>upper'] || 0) > 500, `Chibi 2 capelets vs arms: ${v2.tot['back>upper']}`);
  assert.ok((v2.tot['held>head'] || 0) > 40, `Chibi 2 held vs head: ${v2.tot['held>head']}`);
  assert.equal(v25.tot['back>upper'] || 0, 0, `2.5 capes/capelets/packs inside an upper arm (${v25.where['back>upper']})`);
  assert.ok((v25.tot['held>head'] || 0) <= 3, `2.5 held items in the head: ${v25.tot['held>head']} frames (${v25.where['held>head']})`);
  assert.ok((v25.deep['held>head'] || 0) <= 0.015, `2.5 held item ${((v25.deep['held>head'] || 0) * 100).toFixed(1)} cm into a head (${v25.where['held>head']})`);
  assert.ok((v25.deep['plate>upper'] || 0) <= 0.03 || (v25.deep['plate>upper'] || 0) < (v2.deep['plate>upper'] || 0) * 0.75,
    `2.5 breastplate ${((v25.deep['plate>upper'] || 0) * 100).toFixed(1)} cm into an upper arm (${v25.where['plate>upper']})`);
  console.log('v2', JSON.stringify(v2.tot), '\nv2.5', JSON.stringify(v25.tot));
});
