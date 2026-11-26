// Spell Kit: pieces drawn per cast through Oathwild's game path (render/spell-look.js on the Spell Lab kit, fake actors,
// real rows + visuals), desktop and phone quality. Pieces = particles spawned + pooled objects; lights apart.
//   node avatar-3d/spellkit/tools/count-pieces.mjs   (dev server on 8401; one browser run at a time)
import { chromium } from 'playwright';
const URL_ = 'http://localhost:8401/avatar-3d/spellkit/index.html?bare=1';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {};
for (const quality of ['high', 'low']) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(URL_ + (quality === 'low' ? '&quality=low' : ''));
  await page.waitForFunction(() => window.__lab?.ready, null, { timeout: 120000 });
  out[quality] = await page.evaluate(async () => {
    const L = window.__lab, kit = L.kit, THREE = kit.THREE; L.manual(true);
    const { createSpellLook } = await import('/prototypes/oathwild/js/client/render/spell-look.js');
    let n = { p: 0, obj: 0, lights: 0 };
    const wrap = (o, k, key) => { const f = o[k].bind(o); o[k] = (...a) => { const r = f(...a); if (r !== -1 && r != null) n[key]++; return r; }; };
    wrap(kit.pools.add, 'spawn', 'p'); wrap(kit.pools.normal, 'spawn', 'p');
    for (const pool of [kit.grounds, kit.ribbons, ...Object.values(kit.shells), ...Object.values(kit.glows)]) wrap(pool, 'get', 'obj');
    wrap(kit.lights, 'get', 'lights');
    const root = new THREE.Group(); kit.scene.add(root);
    const handR = new THREE.Object3D(); handR.position.set(0.3, 1.3, 0.3); root.add(handR); const handL = new THREE.Object3D(); handL.position.set(-0.3, 1.3, 0.3); root.add(handL);
    const units = new Map([['me', { id: 'me', x: 0, y: 0, z: 0, drawFacing: 0 }], ['foe', { id: 'foe', x: 0, y: 0, z: 6 }]]);
    const actors = { get: id => (id === 'me' ? { root, act() {}, body: null } : null) };
    const moves = { play() {}, react() {} };
    const ROWS = {
      cleave: { shape: 'melee', element: 'physical', reach: 4.2, arc: 3.6, knock: { push: 1.2 }, powerFrom: 'melee' },
      sunlance: { shape: 'beam', element: 'holy', range: 22, width: 2.2 },
      ice_spikes: { shape: 'beam', element: 'ice', range: 15, width: 2.6 },
      fireball: { shape: 'bolt', element: 'fire', range: 30, explode: { radius: 4 } },
      ground_slam: { shape: 'around', element: 'physical', radius: 7, knock: { push: 4, down: 2 } },
      meteor: { shape: 'ground', element: 'fire', radius: 8, range: 32, delay: 1.1 },
    };
    const fx = { kit, noteBurst() {} };
    const look = createSpellLook({ fx, actors, moves, heightAt: () => 0, rowOf: s => ROWS[s], unitOf: id => units.get(id), handsOf: () => [handL, handR], meId: () => 'me', shakeOn: () => true });
    const run = async f => { kit.clear(); n = { p: 0, obj: 0, lights: 0 }; await f(); for (let i = 0; i < 40; i++) { L.advance(0.1); await new Promise(r => setTimeout(r, 0)); } return { ...n, total: n.p + n.obj }; };
    const hitAt = (spell, scale) => kit.impact([0, 1.1, 6], spell, { radius: 1.2, scale });
    const cast = (spell, extra = {}) => { look.press(spell, ROWS[spell]); look.cast({ t: 'cast', who: 'me', spell, dir: [0, 1], at: null, ...extra }); };
    const r = {};
    r.cleave = await run(() => { cast('cleave'); hitAt('cleave', 0.55); });
    r.sunlance = await run(() => { cast('sunlance'); hitAt('sunlance', 1); });
    r.ice_spikes = await run(() => { cast('ice_spikes'); hitAt('ice_spikes', 1); });
    r.fireball = await run(() => {
      cast('fireball'); const b = { x: 0, z: 0.5 };
      const m = kit.missile(handR.getWorldPosition(new THREE.Vector3()), null, 'fireball', { track: o => o.set(b.x, 1.3, b.z), scale: 1.15 });
      for (let i = 0; i < 6; i++) { b.z += 1; L.advance(0.05); }
      m.stop(); look.burst({ t: 'burst', who: 'me', spell: 'fireball', at: [0, 6], radius: 4 }); hitAt('fireball', 0.55);
    });
    r.ground_slam = await run(() => { cast('ground_slam'); hitAt('ground_slam', 0.55); });
    r.meteor = await run(() => { cast('meteor', { at: [0, 8] }); hitAt('meteor', 0.55); });
    r.frost_wand_bolt = await run(() => {
      const b = { x: 0, z: 0.5 }; const m = kit.missile(handR.getWorldPosition(new THREE.Vector3()), null, 'frost_bolt', { track: o => o.set(b.x, 1.3, b.z), scale: 1.15 });
      for (let i = 0; i < 6; i++) { b.z += 1; L.advance(0.05); } m.stop(); hitAt('frost_bolt', 1);
    });
    return r;
  });
  await page.close();
}
for (const q in out) for (const k in out[q]) console.log(q, k, JSON.stringify(out[q][k]));
await browser.close();
