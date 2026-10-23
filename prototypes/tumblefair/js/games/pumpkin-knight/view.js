// PUMPKIN KNIGHT, as drawn: a moonlit pumpkin patch (dark grass, rows of little pumpkins outside the yard as ONE
// instanced mesh, a crooked fence), a big black cauldron at the back with glowing green brew and rising bubbles, and
// the knight: a round tin-can suit of armour with a purple plume of smoke puffing where its head should be, holding a
// wooden practice sword. Its head is a grinning jack-o'-lantern (the shared Halloween pumpkin + carved face) that
// bounces about. Sword swing: an orange wedge on the ground that fills, then the sword sweeps. Head in the pot: the
// knight kneels, stars spin over its neck, a gold ring under it says BONK, the brew bubbles harder.
import { RULES, POT } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { pumpkinGeo, stemGeo, faceTexture } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena;
  const K = bossKit(ctx, { name: 'Pumpkin Knight', color: 'linear-gradient(#ffb04a, #ff7a14)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();

  // ---- the patch
  mesh(keep(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#2f4a33', { roughness: 1 }), 0, -0.03, 0).receiveShadow = true;
  mesh(keep(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2)), std('#6f8f52', { roughness: 1 }), 0, 0, 0).receiveShadow = true;
  const pGeo = keep(pumpkinGeo(THREE, 0.38)), pumpM = std('#ff7a14', { roughness: 0.6 });
  const patchN = 30, patch = new THREE.InstancedMesh(pGeo, pumpM, patchN);
  for (let i = 0; i < patchN; i++) { const side = i % 3, t = (i * 0.618) % 1; let x, z; if (side === 0) { x = -hw - 1.1; z = -hd + t * hd * 2; } else if (side === 1) { x = hw + 1.1; z = -hd + t * hd * 2; } else { x = -hw + t * hw * 2; z = hd + 1.2; } const s = 0.7 + (i % 4) * 0.15; m4.compose(v.set(x, 0.25 * s, z), q.setFromEuler(e.set(0, i, 0)), sc.setScalar(s)); patch.setMatrixAt(i, m4); }
  patch.castShadow = true; group.add(patch);
  const fenceN = 22, fence = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.16, 0.9, 0.16)), std('#6b5240'), fenceN);
  for (let i = 0; i < fenceN; i++) { const x = -hw - 0.3 + i * (hw * 2 + 0.6) / (fenceN - 1); m4.compose(v.set(x, 0.45, -hd - 0.4), q.setFromEuler(e.set(0, 0, (i % 3 - 1) * 0.08)), sc.set(1, 1, 1)); fence.setMatrixAt(i, m4); }
  group.add(fence);
  mesh(keep(new THREE.BoxGeometry(hw * 2 + 0.6, 0.1, 0.08)), std('#6b5240'), 0, 0.65, -hd - 0.4);

  // ---- the cauldron
  const pot = new THREE.Group(); pot.position.set(POT.x, 0, POT.z); group.add(pot);
  const potPts = [[0, 0.1], [0.55, 0.12], [0.95, 0.45], [1.05, 0.85], [0.95, 1.15], [0.86, 1.22], [0.92, 1.3]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(keep(new THREE.LatheGeometry(potPts, 24)), std('#22202a', { roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }), 0, 0, 0, pot).castShadow = true;
  const brewM = std('#7dff5a', { emissive: new THREE.Color('#3bdc2a'), emissiveIntensity: 0.6 });
  const brew = mesh(keep(new THREE.CircleGeometry(0.88, 24).rotateX(-Math.PI / 2)), brewM, 0, 1.1, 0, pot);
  for (const a of [0.4, 2.5, 4.4]) mesh(keep(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 6)), std('#22202a'), Math.sin(a) * 0.75, 0.05, Math.cos(a) * 0.75, pot);
  const bubN = 10, bubbles = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.12, 8, 6)), brewM, bubN); bubbles.frustumCulled = false; pot.add(bubbles);
  const potRing = mesh(keep(new THREE.RingGeometry(RULES.potR + 0.25, RULES.potR + 0.42, 32).rotateX(-Math.PI / 2)), basic('#7dff5a', { opacity: 0.55 }), 0, 0.04, 0, pot);

  // ---- the knight
  const Kn = new THREE.Group(); group.add(Kn); Kn.scale.setScalar(1.2);
  const tin = std('#dfe6f0', { metalness: 0.35, roughness: 0.35, emissive: new THREE.Color('#5a6680'), emissiveIntensity: 0.35 }), tinDark = std('#a9b2c2', { metalness: 0.3, roughness: 0.4, emissive: new THREE.Color('#3a4258'), emissiveIntensity: 0.3 }), plumeM = std('#a86ae0', { emissive: new THREE.Color('#6a2ab8'), emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
  const glowM = std('#ffd23f', { emissive: new THREE.Color('#ffb000'), emissiveIntensity: 0 });
  const torso = new THREE.Group(); Kn.add(torso);
  mesh(keep(new THREE.CylinderGeometry(0.62, 0.72, 1.15, 18)), tin, 0, 1.55, 0, torso);
  mesh(keep(new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), tin, 0, 2.12, 0, torso);
  mesh(keep(new THREE.TorusGeometry(0.66, 0.08, 6, 20).rotateX(Math.PI / 2)), glowM, 0, 1.0, 0, torso);
  mesh(keep(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 12)), tinDark, 0, 2.4, 0, torso);
  const plume = [0, 1, 2].map(i => mesh(keep(new THREE.SphereGeometry(0.22 - i * 0.04, 10, 8)), plumeM, 0, 2.6 + i * 0.28, 0, torso));
  const legs = [-1, 1].map(sx => mesh(keep(new THREE.CylinderGeometry(0.2, 0.24, 1.0, 10)), tinDark, sx * 0.3, 0.5, 0, Kn));
  for (const sx of [-1, 1]) mesh(keep(new THREE.SphereGeometry(0.3, 12, 8)), tinDark, sx * 0.78, 1.95, 0, torso);
  const armL = new THREE.Group(); armL.position.set(-0.8, 1.9, 0); torso.add(armL);
  mesh(keep(new THREE.CylinderGeometry(0.15, 0.17, 0.9, 10)), tin, 0, -0.45, 0, armL);
  const armR = new THREE.Group(); armR.position.set(0.8, 1.9, 0); torso.add(armR);
  mesh(keep(new THREE.CylinderGeometry(0.15, 0.17, 0.9, 10)), tin, 0, -0.45, 0, armR);
  const sword = new THREE.Group(); sword.position.set(0, -0.9, 0.1); armR.add(sword);
  mesh(keep(new THREE.BoxGeometry(0.16, 0.14, 2.0)), std('#c79a5a'), 0, 0, 1.0, sword);
  mesh(keep(new THREE.BoxGeometry(0.6, 0.12, 0.12)), std('#8a5a32'), 0, 0, 0.05, sword);
  Kn.traverse(o => { if (o.isMesh && o.material !== plumeM) o.castShadow = true; });
  const stars = new THREE.Group(); stars.position.y = 2.9; Kn.add(stars); stars.visible = false;
  const starM = std('#ffd23f', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0.6 });
  for (let k = 0; k < 4; k++) mesh(keep(new THREE.OctahedronGeometry(0.17, 0)), starM, Math.sin(k * Math.PI / 2) * 0.7, 0, Math.cos(k * Math.PI / 2) * 0.7, stars);
  const bonkRing = mesh(keep(new THREE.RingGeometry(RULES.reach - 0.15, RULES.reach, 36).rotateX(-Math.PI / 2)), basic('#ffd23f', { opacity: 0.9 }), 0, 0.05, 0); bonkRing.visible = false;

  // ---- the head
  const head = new THREE.Group(); group.add(head);
  const headBall = new THREE.Group(); head.add(headBall); headBall.scale.setScalar(1.3);
  mesh(keep(pumpkinGeo(THREE, RULES.headR + 0.06)), std('#ff7a14', { roughness: 0.55, emissive: new THREE.Color('#b33a00'), emissiveIntensity: 0.35 }), 0, 0, 0, headBall).castShadow = true;
  mesh(keep(stemGeo(THREE, RULES.headR + 0.06)), std('#4c7a2a'), 0, 0, 0, headBall);
  const faceTex = faceTexture(THREE); keep({ dispose: () => faceTex.dispose() });
  const face = mesh(keep(new THREE.PlaneGeometry(0.62, 0.62)), basic('#ffffff', { map: faceTex, opacity: 1, toneMapped: false }), 0, 0.02, RULES.headR + 0.05, headBall);
  const headShadow = mesh(keep(new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2)), basic('#000000', { opacity: 0.3 }), 0, 0.03, 0);
  const lobMark = mesh(keep(new THREE.RingGeometry(0.55, 0.7, 28).rotateX(-Math.PI / 2)), basic('#ffb04a', { opacity: 0.9 }), 0, 0.05, 0); lobMark.visible = false;

  // ---- the sword wedge
  const wedgeOut = mesh(keep(new THREE.CircleGeometry(RULES.swingR, 28, Math.PI / 2 - RULES.swingArc, RULES.swingArc * 2).rotateX(-Math.PI / 2)), basic('#ff9b3d', { opacity: 0.3 }), 0, 0.05, 0);
  const wedgeIn = mesh(keep(new THREE.CircleGeometry(RULES.swingR, 28, Math.PI / 2 - RULES.swingArc, RULES.swingArc * 2).rotateX(-Math.PI / 2)), basic('#ff6a1a', { opacity: 0.55 }), 0, 0.06, 0);
  wedgeOut.visible = wedgeIn.visible = false;

  const bar = scoreBar(ctx, { unit: 'pts' });
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => ctx.camera({ cx: 0, cz: -0.5, hw: hw + 0.8, hd: hd + 1.3, tall: tall() ? 3.4 : 2.8 }, { instant: true });
  frameCam(); addEventListener('resize', frameCam);
  let G = null, kx = 0, kz = 0, kyaw = Math.PI, hx = 3, hz = 0.5, hy = 0, slashT = 9, walkT = 0, spin = 0, lastX = 3, lastZ = 0.5;

  return {
    // the shared Halloween dressing (dusk, bats, ghosts) — pumpkins left to our own patch rows
    halloween: { spots: [[-hw - 2.2, 0, -hd - 1.6], [hw + 2.2, 0, -hd - 1.4], [-hw - 2.4, 0, hd + 1.6], [hw + 2.3, 0, hd + 1.7]] },
    start() { frameCam(); K.banner('Kick its head in the pot!'); },
    state(g) {
      G = g;
      K.hp(g.hp, init.hpMax);
      K.row(g.kn[3] === 'kneel' ? `<span class="bk-tag hot">BONK IT! ${Math.ceil(g.kl ?? 0)} s</span>` : g.kn[3] === 'grab' ? '<span class="bk-tag">It grabbed its head!</span>' : '<span class="bk-tag">Kick the head into the pot</span>');
      lobMark.visible = !!g.lob; if (g.lob) lobMark.position.set(g.lob[0], 0.05, g.lob[1]);
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'kick') { ctx.sfx(ev.pid === me ? 'throw' : 'tap'); if (ev.pid !== me) ctx.actor(ev.pid)?.play('kick', 380); }
      else if (ev.e === 'goal') { K.banner('In the pot!', 'good', 1300); ctx.sfx('good'); K.puff(POT.x, 1.4, POT.z, '#7dff5a', 1.8); if (ev.pid >= 0) floatText(stage, POT.x, 2.4, POT.z, `+${RULES.goalPts}`, 'good'); }
      else if (ev.e === 'bonk') { ctx.sfx(ev.pid === me ? 'coins' : 'hit'); floatText(stage, kx, 2.6, kz, '+1', 'good'); K.puff(kx, 1.6, kz, '#ffffff', 0.6); }
      else if (ev.e === 'clang') { if (ev.pid === me) { ctx.sfx('tap'); floatText(stage, kx, 2.6, kz, 'CLANG! Head first!', ''); } }
      else if (ev.e === 'raise') ctx.sfx('trap');
      else if (ev.e === 'slash') { slashT = 0; ctx.sfx('throw'); }
      else if (ev.e === 'grab') { K.banner('It grabbed its head!', 'warn', 900); }
      else if (ev.e === 'lob' || ev.e === 'popout') ctx.sfx('throw');
      else if (ev.e === 'thud') K.puff(ev.x, 0.3, ev.z, '#c9b38a', 0.9);
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'WHAP!', 'bad'); }
      else if (ev.e === 'swing') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { K.banner(ev.ok ? 'The knight is beaten!' : 'The knight clanks on!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) {
      if (!(inp.b & IN.A)) return;
      const p = ctx.pos(me); const near = p && Math.hypot(p.x - hx, p.z - hz) <= RULES.kickR + 0.2;
      ctx.actor(me)?.play(near ? 'kick' : 'punch', 380);
    },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.end) return G.end === 1 ? 'cheer' : 'sitGround'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t);
      const ph = G?.kn[3] || 'walk', kneel = ph === 'kneel', dead = G?.end === 1;
      if (G) {
        const k = Math.min(1, dt * 10); const ox = kx, oz = kz;
        kx += (G.kn[0] - kx) * k; kz += (G.kn[1] - kz) * k; let d = G.kn[2] - kyaw; d = Math.atan2(Math.sin(d), Math.cos(d)); kyaw += d * k;
        walkT += Math.hypot(kx - ox, kz - oz) * 3;
        const kh = Math.min(1, dt * 14); hx += (G.hd[0] - hx) * kh; hz += (G.hd[1] - hz) * kh; hy += (G.hd[2] - hy) * kh;
      }
      Kn.position.set(kx, 0, kz); Kn.rotation.y = kyaw;
      torso.position.y = kneel || dead ? -0.55 : Math.abs(Math.sin(walkT)) * 0.06;
      torso.rotation.x = kneel ? 0.25 : dead ? 0.9 : 0;
      legs[0].rotation.x = kneel ? -1.2 : Math.sin(walkT) * 0.4; legs[1].rotation.x = kneel ? -1.2 : -Math.sin(walkT) * 0.4;
      stars.visible = kneel; stars.rotation.y = t * 4;
      bonkRing.visible = kneel; bonkRing.position.set(kx, 0.05, kz); bonkRing.material.opacity = 0.6 + 0.35 * Math.abs(Math.sin(t * 7));
      glowM.emissiveIntensity = kneel ? 0.6 + 0.3 * Math.sin(t * 8) : 0;
      plume.forEach((p, i) => { p.visible = !dead; p.position.y = 2.6 + i * 0.28 + Math.sin(t * 3 + i) * 0.06; p.scale.setScalar(1 + 0.15 * Math.sin(t * 4 + i * 2)); });
      // the sword: raised while winding up, sweeping on the slash, resting otherwise
      slashT += dt;
      if (G?.sw) { armR.rotation.set(-2.4, 0, 0.3); const k = 1 - G.sw[1] / Math.max(0.01, G.sw[2]); wedgeOut.visible = wedgeIn.visible = true; wedgeOut.position.set(kx, 0.05, kz); wedgeIn.position.set(kx, 0.06, kz); wedgeOut.rotation.y = wedgeIn.rotation.y = G.sw[0]; wedgeIn.scale.setScalar(Math.max(0.02, k)); wedgeOut.material.opacity = k > 0.7 ? 0.25 + 0.25 * Math.abs(Math.sin(t * 18)) : 0.3; G.sw[1] = Math.max(0, G.sw[1] - dt); }
      else { wedgeOut.visible = wedgeIn.visible = false; armR.rotation.set(slashT < 0.25 ? -0.6 + slashT * 4 : kneel ? 0.4 : -0.5, slashT < 0.25 ? 1.2 - slashT * 6 : 0, 0.15); }
      armL.rotation.set(ph === 'grab' ? -2.6 : -0.2 + Math.sin(walkT) * 0.2, 0, -0.15);
      // the head: in the pot, held up high, flying, or rolling about
      let x = hx, z = hz, y = hy + RULES.headR * 1.25;
      if (G?.hd[4]) { x = POT.x; z = POT.z; y = 1.15 + Math.sin(t * 5) * 0.08; }
      else if (G?.hd[3]) { x = kx + Math.sin(kyaw) * 0.2; z = kz + Math.cos(kyaw) * 0.2; y = 3.1 + Math.sin(t * 8) * 0.05; }
      head.position.set(x, y, z);
      const mv = Math.hypot(x - lastX, z - lastZ); lastX = x; lastZ = z; spin += mv / (RULES.headR + 0.06);
      headBall.rotation.set(G?.hd[4] ? 0 : Math.sin(spin) * 0.45, 0, G?.hd[4] ? 0 : Math.cos(spin * 0.7) * 0.25); head.rotation.y = Math.atan2(-x * 0.1, 8 - z);   // keep the grin turned to the camera
      headShadow.position.set(x, 0.03, z); headShadow.visible = !G?.hd[4];
      // the brew
      brewM.emissiveIntensity = kneel ? 0.9 + 0.3 * Math.sin(t * 10) : 0.55;
      for (let i = 0; i < bubN; i++) { const p = ((t * (kneel ? 1.4 : 0.6) + i / bubN) % 1), a = i * 2.4; m4.compose(v.set(Math.sin(a) * 0.5 * (1 - p), 1.1 + p * 1.2, Math.cos(a) * 0.5 * (1 - p)), q.identity(), sc.setScalar(1 - p * 0.7)); bubbles.setMatrixAt(i, m4); }
      bubbles.instanceMatrix.needsUpdate = true;
      potRing.material.opacity = 0.35 + 0.25 * Math.abs(Math.sin(t * 3));
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); K.dispose(); },
  };
}
