// Chibi 2 "nothing moved" baseline (2026-10-16, Chibi 2.5).
//
// Chibi 2.5 is OPT-IN: a look without `body.v >= 2.5` must build byte-for-byte the geometry it built before the
// 2.5 work started, because Thousandvale, Farhold, Emberveil and Bannerline all build Chibi 2 characters and must
// look exactly the same until they switch. This tool hashes the built geometry (positions, colours, skin
// indices/weights, index buffer) of a wide set of looks and writes it to a fixture; `avatar-3d/tests/chibi25.test.js`
// rebuilds the same looks and compares.
//
//   node --import ./avatar-3d/tests/three-register.mjs tools/chibi2-v2-baseline.mjs          # write the fixture
//   node --import ./avatar-3d/tests/three-register.mjs tools/chibi2-v2-baseline.mjs --check  # compare only
//
// Only re-write it on purpose (a deliberate change to the v2 look that every game accepts).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT)));
const { createChibi2Character } = await import('../avatar-3d/js/chibi2.js');
const { dressAs } = await import('../avatar-3d/js/class-outfits.js');
const { PARTS } = await import('../avatar-2d/js/parts/index.js');

export async function v2Looks() {
  const looks = {};
  const ember = read('prototypes/emberveil/data/class-looks.json').classes;
  for (const [id, c] of Object.entries(ember)) looks['class:' + id] = c.avatar;
  for (const [i, p] of read('avatar-3d/data/chibi2-presets.json').presets.entries()) looks['preset:' + i] = p.avatar;
  const t1 = read('avatar-3d/data/class-outfits.json').classes;
  const base = ember.warrior.avatar;
  for (const [id, o] of Object.entries(t1)) looks['outfit:' + id] = dressAs(base, o);
  // a face sweep over the ORIGINAL ids (the ones that existed before 2.5), on a plain hatless base and under three hats
  const plain = { ...ember.mage.avatar, hat: { id: 'none' }, accessory: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' }, decor: { id: 'none' }, cape: { id: 'none' } };
  const ORIGINAL = {
    hair: ['short', 'bald', 'buzz', 'side_part', 'bangs', 'bob', 'long', 'wavy', 'ponytail', 'bun', 'buns', 'mohawk', 'spiky', 'curly', 'afro', 'braids', 'pixie', 'slicked', 'hood_hair', 'tonsure', 'horns_hair'],
    eyes: ['round', 'almond', 'narrow', 'wide', 'sleepy', 'angry', 'dot', 'anime', 'happy', 'wink', 'hollow', 'slit', 'tired', 'glow', 'glow_tear'],
    brows: ['straight', 'arched', 'angry', 'worried', 'thick', 'thin', 'none', 'raised'],
    nose: ['small', 'dot', 'button', 'long', 'wide', 'hook', 'upturned', 'none', 'snout'],
    mouth: ['smile', 'neutral', 'frown', 'open', 'grin', 'smirk', 'o', 'tongue', 'fangs', 'sad_open', 'stitched', 'tusks'],
    ears: ['normal', 'pointed', 'big', 'none', 'fins'],
    facialHair: ['none', 'stubble', 'goatee', 'mustache', 'full', 'long', 'chinstrap', 'soul_patch', 'braided_beard'],
  };
  for (const [slot, ids] of Object.entries(ORIGINAL)) for (const id of ids) {
    if (!PARTS[slot]?.[id]) continue;
    looks[`face:${slot}:${id}`] = { ...plain, [slot]: { ...(plain[slot] || {}), id } };
  }
  for (const id of Object.keys(PARTS.extras)) looks['face:extras:' + id] = { ...plain, extras: { id, color: '#8a2e2e' } };
  for (const hat of ['hood', 'wizard', 'war_helm', 'cap', 'wide_brim', 'chain_coif']) for (const hair of ['short', 'long', 'bob', 'curly', 'ponytail', 'spiky']) {
    looks[`hat:${hat}:${hair}`] = { ...plain, hair: { ...plain.hair, id: hair }, hat: { id: hat, color: '#5a4a6a' } };
  }
  return looks;
}

export function hashActor(actor) {
  const h = createHash('sha1');
  actor.group.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry;
    for (const name of ['position', 'color', 'skinIndex', 'skinWeight', 'normal']) {
      const at = g.attributes[name]; if (!at) continue;
      h.update(name); h.update(Buffer.from(at.array.buffer, at.array.byteOffset, at.array.byteLength));
    }
    if (g.index) h.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
  });
  h.update('bones:' + actor.skeleton.bones.map(b => b.name).join(','));
  return h.digest('hex').slice(0, 16);
}

const FIXTURE = new URL('avatar-3d/tests/fixtures/chibi2-v2-hashes.json', ROOT);
if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const looks = await v2Looks(), out = {};
  for (const [k, look] of Object.entries(looks)) {
    const a = await createChibi2Character(look);
    out[k] = hashActor(a); a.dispose();
  }
  if (check) {
    const want = JSON.parse(readFileSync(FIXTURE));
    const bad = Object.keys(want).filter(k => want[k] !== out[k]);
    console.log(bad.length ? `CHANGED ${bad.length}: ${bad.join(', ')}` : `all ${Object.keys(want).length} v2 looks unchanged`);
    process.exit(bad.length ? 1 : 0);
  }
  if (existsSync(FIXTURE) && !process.argv.includes('--force')) { console.error('fixture exists; pass --force to rewrite it on purpose'); process.exit(1); }
  writeFileSync(FIXTURE, JSON.stringify(out, null, 0).replace(/,"/g, ',\n"'));
  console.log(`wrote ${Object.keys(out).length} hashes`);
}
