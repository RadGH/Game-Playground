// WITCH'S TOWER, as drawn: the round flagstone top of a crooked stone tower (the tower drops away below into purple
// mist), battlements round the rim (one instanced mesh) with jack-o'-lanterns on a few of them, and a big moon. The
// witch is a Chibi character in the Hedge Witch outfit sitting on a broom (a stick + straw cone), looping overhead.
// A falling potion: a round bottle (purple, or gold for a big one) dropping from her height while its SHADOW on the
// floor grows; in the last moment the shadow's ring turns bright green and pulses — that is the catch window ("NOW").
// A held potion floats over the holder's head; a throw arcs up to her (a hit = sparkles + she spins dizzy). Missed
// potions burst into gloopy green puddles that fade out.
import { RULES } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { glowTexture } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const R = meta.arena.r;
  const K = bossKit(ctx, { name: 'Witch', color: 'linear-gradient(#c58cff, #7a3cc8)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();

  // ---- the tower
  const stone = std('#8d86a3', { roughness: 0.95 });
  mesh(keep(new THREE.CylinderGeometry(R + 0.6, R + 1.1, 16, 36)), stone, 0, -8, 0).receiveShadow = true;
  mesh(keep(new THREE.CircleGeometry(R + 0.6, 40).rotateX(-Math.PI / 2)), std('#b8b1c9', { roughness: 0.9 }), 0, 0.005, 0).receiveShadow = true;
  const flagN = 26, flags = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.9, 0.9, 0.02, 6)), std('#a59ebb', { roughness: 0.9 }), flagN);
  for (let i = 0; i < flagN; i++) { const a = i * 2.39996, rr = Math.sqrt((i + 0.5) / flagN) * (R - 0.8); m4.compose(v.set(Math.sin(a) * rr, 0.012, Math.cos(a) * rr), q.setFromEuler(e.set(0, i, 0)), sc.set(1, 1, 1)); flags.setMatrixAt(i, m4); }
  flags.receiveShadow = true; group.add(flags);
  const merN = 22, mers = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1.0, 0.9, 0.55)), stone, merN);
  for (let i = 0; i < merN; i++) { const a = (i + 0.5) * Math.PI * 2 / merN; m4.compose(v.set(Math.sin(a) * (R + 0.35), 0.45, Math.cos(a) * (R + 0.35)), q.setFromEuler(e.set(0, a, 0)), sc.set(1, 1, 1)); mers.setMatrixAt(i, m4); }
  mers.castShadow = true; group.add(mers);
  mesh(keep(new THREE.TorusGeometry(R + 0.35, 0.2, 6, 48).rotateX(Math.PI / 2)), stone, 0, 0.12, 0);
  const moon = mesh(keep(new THREE.SphereGeometry(3, 24, 16)), std('#fff6d8', { emissive: new THREE.Color('#fff1b8'), emissiveIntensity: 0.8 }), -12, 9, -20);

  // ---- the witch on her broom
  const witch = new THREE.Group(); group.add(witch);
  const broom = new THREE.Group(); witch.add(broom);
  mesh(keep(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8).rotateX(Math.PI / 2)), std('#8a5a32'), 0, 0.45, 0, broom);
  mesh(keep(new THREE.ConeGeometry(0.32, 0.8, 10).rotateX(-Math.PI / 2)), std('#e8c56a'), 0, 0.45, -1.5, broom);
  mesh(keep(new THREE.SphereGeometry(0.16, 10, 8)), std('#fff3a0', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 1 }), 0, 0.62, 1.15, broom);
  const glowTex = glowTexture(THREE); keep({ dispose: () => glowTex.dispose() });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf6a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(3.2); halo.position.set(0, 0.9, 0.3); witch.add(halo); keep({ dispose: () => halo.material.dispose() });
  let wActor = null;
  ctx.createActor({ look: { race: 'halfling', seed: 3131 }, costume: 'cos_witch' }, { scale: 1.1 }).then(a => { if (!a) return; wActor = a; group.remove(a.group); witch.add(a.group); a.place(0, 0.15, 0, 0); a.setPose('sitGround'); });
  const stars = new THREE.Group(); stars.position.y = 2.3; witch.add(stars); stars.visible = false;
  const starM = std('#ffd23f', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0.7 });
  for (let k = 0; k < 4; k++) mesh(keep(new THREE.OctahedronGeometry(0.17, 0)), starM, Math.sin(k * Math.PI / 2) * 0.7, 0, Math.cos(k * Math.PI / 2) * 0.7, stars);
  const wShadow = mesh(keep(new THREE.CircleGeometry(0.9, 24).rotateX(-Math.PI / 2)), basic('#1a0f26', { opacity: 0.22 }), 0, 0.03, 0);

  // ---- potions, shadows, puddles
  const potGeo = keep(new THREE.SphereGeometry(0.26, 14, 10)), neckGeo = keep(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8)), corkGeo = keep(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8));
  const purpleM = std('#b46cff', { emissive: new THREE.Color('#7a3cc8'), emissiveIntensity: 0.6, roughness: 0.2 }), goldM = std('#ffd23f', { emissive: new THREE.Color('#ffb000'), emissiveIntensity: 0.6, roughness: 0.2 }), corkM = std('#8a5a32');
  const bottle = gold => { const g = new THREE.Group(); mesh(potGeo, gold ? goldM : purpleM, 0, 0, 0, g); mesh(neckGeo, gold ? goldM : purpleM, 0, 0.3, 0, g); mesh(corkGeo, corkM, 0, 0.44, 0, g); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; };
  const discGeo = keep(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2)), ringGeo = keep(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2));
  const falls = new Map(), held = new Map(), throws = new Map(), puddles = new Map();

  const bar = scoreBar(ctx, { unit: 'pts' });
  const frameCam = () => ctx.camera({ cx: 0, cz: -0.4, hw: R + 0.9, hd: R + 1.3, tall: 5.6 }, { instant: true });
  frameCam(); addEventListener('resize', frameCam);
  let G = null, wx = 0, wz = 0, wyaw = 0, spin = 0, goneT = 0;

  const drop = (map, id) => { const o = map.get(id); if (!o) return; for (const m of o.own || []) { group.remove(m); m.material?.dispose?.(); } if (o.g) o.g.removeFromParent(); map.delete(id); };

  return {
    halloween: { spots: [0.4, 1.5, 2.6, 3.7, 4.8, 5.8].map(a => [Math.sin(a) * (R + 0.35), 0.9, Math.cos(a) * (R + 0.35)]), ghosts: [[-R - 3, 2.5, -R - 1], [R + 3, 3, -R], [R + 2, 1.5, R + 1]] },
    start() { frameCam(); K.banner('Catch her potions!'); },
    state(g) {
      G = g;
      K.hp(g.hp, init.hpMax);
      const mine = g.ho.find(h => h[0] === me);
      K.row(mine ? '<span class="bk-tag hot">Face her + A = THROW!</span>' : g.wt[2] ? '<span class="bk-tag hot">She’s dizzy!</span>' : '<span class="bk-tag">Stand in a shadow, A when it glows</span>');
      // falling potions
      const fset = new Set(g.bt.map(b => b[0]));
      for (const id of [...falls.keys()]) if (!fset.has(id)) drop(falls, id);
      for (const [id, x, z, left, total, gold] of g.bt) {
        let f = falls.get(id);
        if (!f) {
          const sh = mesh(discGeo, basic('#1a0f26', { opacity: 0.35 }), x, 0.04, z), ring = mesh(ringGeo, basic('#c58cff', { opacity: 0.9 }), x, 0.05, z);
          ring.scale.setScalar(RULES.catchR); ring.renderOrder = 3; const g2 = bottle(gold); group.add(g2);
          f = { id, x, z, left, total, sh, ring, g: g2, own: [sh, ring] }; falls.set(id, f);
        }
        f.left = Math.min(f.left, left);
      }
      // held potions over heads
      const hset = new Set(g.ho.map(h => h[0]));
      for (const pid of [...held.keys()]) if (!hset.has(pid)) drop(held, pid);
      for (const [pid, kind] of g.ho) if (!held.has(pid)) { const a = ctx.actor(pid); if (!a) continue; const b = bottle(kind === 2); b.position.set(0, (a.height || 1.6) + 0.35, 0); a.group.add(b); held.set(pid, { g: b }); }
      // thrown potions
      const tset = new Set(g.fl.map(f => f[0]));
      for (const id of [...throws.keys()]) if (!tset.has(id)) drop(throws, id);
      for (const row of g.fl) { let t = throws.get(row[0]); if (!t) { const b = bottle(row[7]); group.add(b); t = { g: b }; throws.set(row[0], t); } t.row = row; t.k = row[5]; }
      // puddles
      const pset = new Set(g.pd.map(p => p[0]));
      for (const id of [...puddles.keys()]) if (!pset.has(id)) drop(puddles, id);
      for (const [id, x, z, left] of g.pd) { let p = puddles.get(id); if (!p) { const m = mesh(discGeo, basic('#7dff5a', { opacity: 0.5 }), x, 0.02 + (id % 7) * 0.002, z); m.scale.setScalar(RULES.puddleR); p = { m, own: [m] }; puddles.set(id, p); } p.m.material.opacity = Math.min(0.5, left / 2); }
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'drop') ctx.sfx(ev.k > 1 ? 'trap' : 'tap');
      else if (ev.e === 'catch') { ctx.sfx(ev.pid === me ? 'pick' : 'tap'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2.4, p.z, ev.gold ? 'GOLD!' : 'Caught!', 'good'); }
      else if (ev.e === 'early') { if (ev.pid === me) { ctx.sfx('tap'); const p = ctx.pos(me); if (p) floatText(stage, p.x, 2.2, p.z, 'Wait for it…', ''); } }
      else if (ev.e === 'throw') { ctx.sfx('throw'); if (ev.pid !== me) ctx.actor(ev.pid)?.play('throw', 400); }
      else if (ev.e === 'hit') { K.puff(ev.x, RULES.high + 0.5, ev.z, '#ffd23f', 1.4); K.puff(ev.x, RULES.high + 0.8, ev.z, '#c58cff', 1); floatText(stage, ev.x, RULES.high + 1.4, ev.z, ev.dmg > 1 ? '-2!' : '-1', 'good'); ctx.sfx(ev.pid === me ? 'coins' : 'hit'); spin = 1; }
      else if (ev.e === 'smash') { K.puff(ev.x, 0.3, ev.z, ev.gold ? '#ffd23f' : '#9be36a', 1.2); ctx.sfx('splat'); }
      else if (ev.e === 'splashed') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'SPLOSH!', 'bad'); }
      else if (ev.e === 'swing') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { K.banner(ev.ok ? 'The witch flies home!' : 'The witch cackles on!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if ((inp.b & IN.A) && G?.ho.some(h => h[0] === me)) ctx.actor(me)?.play('throw', 400); },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.end) return G.end === 1 ? 'cheer' : 'sitGround'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t);
      if (G) { const k = Math.min(1, dt * 8), ox = wx, oz = wz; wx += (G.wt[0] - wx) * k; wz += (G.wt[1] - wz) * k; if (Math.hypot(wx - ox, wz - oz) > 0.002) wyaw = Math.atan2(wx - ox, wz - oz); }
      spin = Math.max(0, spin - dt);
      const dizzy = !!G?.wt[2], gone = G?.end === 1;
      if (gone) goneT += dt;
      witch.position.set(wx + goneT * 3, RULES.high + Math.sin(t * 2.2) * 0.25 + goneT * 3, wz - goneT * 2);
      witch.rotation.y = wyaw + (dizzy ? t * 8 : 0); witch.rotation.z = Math.sin(t * 1.7) * 0.12;
      stars.visible = dizzy; stars.rotation.y = t * 4;
      wShadow.position.set(wx, 0.03, wz);
      if (wActor) wActor.update(dt);
      // falling potions: drop from her height, shadow grows, ring turns green in the catch window
      for (const f of falls.values()) {
        f.left = Math.max(0, f.left - dt); const k = 1 - f.left / Math.max(0.01, f.total), win = f.left <= RULES.catchWin;
        f.g.position.set(f.x, 0.4 + (RULES.high - 0.4) * (1 - k), f.z); f.g.rotation.z = t * 5;
        f.sh.scale.setScalar(0.3 + 0.7 * k); f.sh.material.opacity = 0.2 + 0.3 * k;
        f.ring.material.color.set(win ? '#5fff6a' : '#c58cff'); f.ring.material.opacity = win ? 0.6 + 0.4 * Math.abs(Math.sin(t * 16)) : 0.7;
      }
      for (const h of held.values()) { h.g.rotation.y = t * 2; }
      // thrown potions arc up to her (or down to the floor on a miss)
      for (const tw of throws.values()) {
        const [, x0, z0, x1, z1, , aimed] = tw.row; tw.k = Math.min(1, tw.k + dt / RULES.flight);
        const k = tw.k, ex = aimed ? wx : x1, ez = aimed ? wz : z1, ey = aimed ? RULES.high : 0.3;
        tw.g.position.set(x0 + (ex - x0) * k, 1.6 + (ey - 1.6) * k + 2.2 * k * (1 - k), z0 + (ez - z0) * k); tw.g.rotation.x = t * 10;
      }
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); for (const m of [falls, held, throws, puddles]) for (const id of [...m.keys()]) drop(m, id); K.dispose(); },
  };
}
