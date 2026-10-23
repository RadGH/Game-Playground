// GOLEM SMASH, as drawn: a sandy quarry yard ringed by boulders (one instanced mesh) and a big round-shouldered stone
// golem made of chunky flat-shaded rocks with moss on its shoulders and two glowing yellow eyes. It stomps toward its
// target, raises both fists high over its head while the red ring fills, and brings them down (the arms stretch a
// little so the fists land on the ring). After a slam the limb with the crack glows gold and a gold ring with a
// bobbing arrow marks where to stand; the HUD shows the crack's hits left as pips and how many cracks are broken.
import { RULES, LIMBS, limbSpot } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena;
  const K = bossKit(ctx, { name: 'Golem', color: 'linear-gradient(#c9c2b4, #8d8576)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();

  // ---- the quarry
  mesh(keep(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#b9a37f', { roughness: 1 }), 0, -0.03, 0).receiveShadow = true;
  mesh(keep(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2)), std('#e3cf9f', { roughness: 1 }), 0, 0, 0).receiveShadow = true;
  const rockN = 34, rocks = new THREE.InstancedMesh(keep(new THREE.DodecahedronGeometry(0.8, 0)), std('#9b9282', { flatShading: true }), rockN);
  for (let i = 0; i < rockN; i++) {
    const t = i / rockN, per = 2 * (hw * 2 + hd * 2), d = t * per; let x, z;
    if (d < hw * 2) { x = -hw + d; z = -hd - 1; } else if (d < hw * 2 + hd * 2) { x = hw + 1; z = -hd + (d - hw * 2); } else if (d < hw * 4 + hd * 2) { x = hw - (d - hw * 2 - hd * 2); z = hd + 1.1; } else { x = -hw - 1; z = hd - (d - hw * 4 - hd * 2); }
    const s = 0.6 + ((i * 7) % 5) * 0.18;
    m4.compose(v.set(x, 0.2 * s, z), q.setFromEuler(e.set(i, i * 2.1, i * 0.7)), sc.set(s, s * 0.8, s)); rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = true; group.add(rocks);

  // ---- the golem
  const Gm = new THREE.Group(); group.add(Gm); const GS = 1.15;
  const stone = std('#a39a8a', { flatShading: true }), dark = std('#7d7466', { flatShading: true }), moss = std('#6fae4a', { flatShading: true });
  const limbMat = LIMBS.map(() => std('#a39a8a', { flatShading: true, emissive: new THREE.Color('#ffc23a'), emissiveIntensity: 0 }));
  const torso = new THREE.Group(); torso.position.y = 1.15; Gm.add(torso);
  const chest = mesh(keep(new THREE.DodecahedronGeometry(1.35, 1)), stone, 0, 1.35, 0, torso); chest.scale.set(1.25, 1.05, 0.95);
  mesh(keep(new THREE.DodecahedronGeometry(0.75, 0)), moss, -0.95, 2.1, 0, torso).scale.set(1, 0.4, 0.9);
  mesh(keep(new THREE.DodecahedronGeometry(0.75, 0)), moss, 0.95, 2.1, 0, torso).scale.set(1, 0.4, 0.9);
  const back = mesh(keep(new THREE.BoxGeometry(1.6, 1.4, 0.4)), limbMat[4], 0, 1.4, -1.05, torso); back.rotation.x = 0.15;
  const head = new THREE.Group(); head.position.set(0, 2.55, 0.35); torso.add(head);
  mesh(keep(new THREE.DodecahedronGeometry(0.62, 0)), dark, 0, 0, 0, head).scale.set(1.1, 0.85, 1);
  const eyeM = std('#fff4a8', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0.9 });
  const eyes = [-1, 1].map(sx => mesh(keep(new THREE.SphereGeometry(0.13, 10, 8)), eyeM, sx * 0.24, 0.05, 0.55, head));
  // arms: a pivot at each shoulder, the rock arm and fist hanging down its local -y
  const ARM = 2.55, arms = [1, -1].map((sx, k) => {
    const pv = new THREE.Group(); pv.position.set(sx * 1.65, 2.95, 0.1); Gm.add(pv);
    const up = mesh(keep(new THREE.DodecahedronGeometry(0.5, 0)), stone, 0, -0.8, 0, pv); up.scale.set(0.9, 1.6, 0.9);
    const fist = mesh(keep(new THREE.DodecahedronGeometry(0.62, 0)), limbMat[k], 0, -ARM + 0.25, 0, pv);
    return { pv, fist, sx };
  });
  const legs = [1, -1].map((sx, k) => { const l = mesh(keep(new THREE.BoxGeometry(0.85, 1.3, 0.95)), limbMat[2 + k], sx * 0.75, 0.62, -0.1, Gm); return l; });
  Gm.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- the crack marker on the ground: gold ring + bobbing arrow
  const mark = new THREE.Group(); group.add(mark); mark.visible = false;
  const markRing = mesh(keep(new THREE.RingGeometry(RULES.reach - 0.18, RULES.reach, 36).rotateX(-Math.PI / 2)), basic('#ffd23f', { opacity: 0.95 }), 0, 0.08, 0, mark);
  mesh(keep(new THREE.CircleGeometry(RULES.reach - 0.18, 30).rotateX(-Math.PI / 2)), basic('#ffd23f', { opacity: 0.22 }), 0, 0.07, 0, mark);
  const arrow = mesh(keep(new THREE.ConeGeometry(0.32, 0.6, 4).rotateX(Math.PI)), std('#ffd23f', { emissive: new THREE.Color('#ffb000'), emissiveIntensity: 0.6 }), 0, 2.2, 0, mark);
  markRing.renderOrder = 3;

  // ---- falling pebbles (one per pebble ring, shown in its last half second)
  const pebGeo = keep(new THREE.DodecahedronGeometry(0.42, 0));

  const bar = scoreBar(ctx, { unit: 'hits' });
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => ctx.camera({ cx: 0, cz: -0.4, hw: hw + 0.6, hd: hd + 1.2, tall: tall() ? 3.6 : 3 }, { instant: true });
  frameCam(); addEventListener('resize', frameCam);
  let G = null, ph = 'ready', gx = 0, gz = -2.2, gy = 0, slamT = 9, walkT = 0, lastBroken = 0;

  return {
    start() { frameCam(); K.banner('Here comes the golem!'); },
    state(g) {
      G = g;
      if (g.ph !== ph) { if (g.ph === 'open') slamT = 0; ph = g.ph; }
      K.rings(g.rg, { onAdd: R => { if (R.r < 1.5) { R.peb = mesh(pebGeo, dark, R.x, 9, R.z); R.peb.castShadow = true; } }, onDrop: R => { if (R.peb) group.remove(R.peb); } });
      K.hp(g.hp, init.hpMax);
      const pips = g.ck ? Array.from({ length: init.hitsPer }, (_, i) => `<i class="bk-pip${i < init.hitsPer - g.ck[1] ? ' on' : ''}">${i < init.hitsPer - g.ck[1] ? '✓' : ''}</i>`).join('') : '';
      K.row(`<span class="bk-tag">Cracks ${g.br}/${init.cracks}</span>${g.ck ? `<span class="bk-tag hot">${LIMBS[g.ck[0]].name}!</span>${pips}` : ''}`);
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'wind') { K.banner('SLAM incoming!', 'warn', 900); ctx.sfx('trap'); }
      else if (ev.e === 'slam') { slamT = 0; K.puff(ev.x, 0.4, ev.z, '#d8c7a0', 2.4); K.puff(ev.x, 0.8, ev.z, '#bfb29a', 1.4); ctx.sfx('splat'); }
      else if (ev.e === 'pebble') { K.puff(ev.x, 0.3, ev.z, '#c9bb9a', 1.1); }
      else if (ev.e === 'crack') { K.banner(`Crack on its ${LIMBS[ev.limb].name}!`, 'good', 1200); ctx.sfx('pick'); }
      else if (ev.e === 'hit') { const p = limbSpot(gx, gz, gy, ev.limb); K.puff(p.x, 1, p.z, '#ffd23f', 0.8); floatText(stage, p.x, 2.2, p.z, ev.left > 0 ? `${ev.left} more!` : 'CRACK!', 'good'); ctx.sfx(ev.pid === me ? 'coins' : 'hit'); }
      else if (ev.e === 'broke') { K.banner('Crack broken!', 'good', 1100); ctx.sfx('good'); }
      else if (ev.e === 'close') { K.banner('It closed up!', 'bad', 900); }
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'BONK!', 'bad'); }
      else if (ev.e === 'swing') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { K.banner(ev.ok ? 'Golem crumbled!' : 'The golem stands!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('punch', 380); },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.ph === 'end') return G.br >= init.cracks ? 'cheer' : 'sitGround'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t);
      if (G) { const k = Math.min(1, dt * 8); gx += (G.gx - gx) * k; gz += (G.gz - gz) * k; let d = G.gy - gy; d = Math.atan2(Math.sin(d), Math.cos(d)); gy += d * k; }
      Gm.position.set(gx, 0, gz); Gm.rotation.y = gy; Gm.scale.setScalar(GS);
      const p = G?.ph || 'ready', dead = p === 'end' && G.br >= init.cracks;
      slamT += dt; walkT += p === 'walk' ? dt : 0;
      // arms: raised in the wind-up, down on the ring for the slam and while stuck, swinging when walking
      for (const a of arms) {
        let rx = Math.sin(walkT * 5 + (a.sx > 0 ? 0 : Math.PI)) * 0.25, stretch = 1;
        if (p === 'wind') rx = -2.7 - 0.08 * Math.sin(t * 20);
        else if (p === 'open' || (p === 'walk' && slamT < 0.4)) { rx = -0.75; stretch = 1.37; }
        a.pv.rotation.x += (rx - a.pv.rotation.x) * Math.min(1, dt * (p === 'open' ? 25 : 9));
        a.pv.scale.y += (stretch - a.pv.scale.y) * Math.min(1, dt * 12);
      }
      legs[0].position.y = 0.62 + (p === 'walk' ? Math.max(0, Math.sin(walkT * 5)) * 0.25 : 0);
      legs[1].position.y = 0.62 + (p === 'walk' ? Math.max(0, -Math.sin(walkT * 5)) * 0.25 : 0);
      torso.rotation.x = p === 'open' ? 0.18 : p === 'wind' ? -0.12 : 0;
      torso.position.y = 1.15 + (p === 'walk' ? Math.abs(Math.sin(walkT * 5)) * 0.08 : 0) - (dead ? Math.min(1.2, slamT) : 0);
      head.rotation.z = p === 'open' ? Math.sin(t * 4) * 0.15 : 0;
      eyeM.emissiveIntensity = p === 'open' ? 0.3 : 0.9;
      // the crack
      const ck = G?.ck;
      limbMat.forEach((m, i) => { m.emissiveIntensity = ck && ck[0] === i ? 0.55 + 0.4 * Math.abs(Math.sin(t * 6)) : 0; });
      mark.visible = !!ck;
      if (ck) { const s = limbSpot(gx, gz, gy, ck[0]); mark.position.set(s.x, 0, s.z); arrow.position.y = 2.1 + 0.25 * Math.sin(t * 6); arrow.rotation.y = t * 2; }
      // pebbles drop into their rings
      for (const R of K.live.values()) if (R.peb) { const f = Math.max(0, R.left / 0.5); R.peb.position.y = 0.4 + Math.min(1, f) * 9; R.peb.visible = R.left < 0.55; R.peb.rotation.x += dt * 5; }
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); K.dispose(); },
  };
}
