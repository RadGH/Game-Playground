// WIND-UP BEAR, as drawn: the prize corner of the fair — a candy-striped floor walled in by stacked prize boxes (one
// instanced mesh), a claw machine at the back — and a huge fuzzy honey-brown teddy with a cream belly, button eyes, a
// red bow tie and a big brass WIND-UP KEY turning in its back. A gold wedge on the floor behind it marks where the key
// can be cranked (it glows when you stand in it). A red heart balloon floats over its FAVOURITE (the one it is after), with a
// pulsing heart-pink ring under their feet.
// Moves are telegraphed on the floor: a filling ring for the belly-flop (in front) and the sit-down (behind), a glowing
// wedge for the paw swipe, a big ring for the spin. Dizzy = stars round its head; floppy = it flops on its face, the
// key sticking up. HUD (boss kit): health bar + a row with the team hearts, the key meter and what to do now.
import { RULES, stompAt, sitAt } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena;
  const K = bossKit(ctx, { name: 'Wind-Up Bear', color: 'linear-gradient(#e9b26a, #b9772f)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const texs = [];

  // ---- the prize corner: striped floor, a wall of prize boxes, a claw machine
  mesh(keep(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#9fd18a', { roughness: 1 }), 0, -0.03, 0).receiveShadow = true;
  const floorTex = canvasTexture(256, 256, (c, w) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffe6ef' : '#fff6dc'; c.fillRect(i * 32, 0, 32, w); } c.fillStyle = 'rgba(255,140,180,.18)'; for (let i = 0; i < 8; i++) c.fillRect(0, i * 32, w, 3); });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 2); texs.push(floorTex);
  mesh(keep(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2)), std('#ffffff', { map: floorTex, roughness: 0.9 }), 0, 0, 0).receiveShadow = true;
  const boxes = [], BOX = ['#ff6f91', '#ffd23f', '#5aa9ff', '#8ff07a', '#b48cff', '#ff9b3d'];
  for (let x = -hw; x <= hw + 0.01; x += 1.2) { boxes.push([x, -hd - 0.8]); boxes.push([x, hd + 0.9]); }
  for (let z = -hd + 1.2; z <= hd - 0.6; z += 1.2) { boxes.push([-hw - 0.8, z]); boxes.push([hw + 0.8, z]); }
  const boxMesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 0.8, 1)), std('#ffffff', { roughness: 0.6 }), boxes.length);
  boxes.forEach(([x, z], i) => { const s = 0.75 + ((i * 7) % 4) * 0.12; m4.compose(v3.set(x, 0.4 * s, z), q.setFromEuler(e3.set(0, (i * 1.7) % 0.6 - 0.3, 0)), sc.set(s, s, s)); boxMesh.setMatrixAt(i, m4); boxMesh.setColorAt(i, col.set(BOX[i % BOX.length])); });
  boxMesh.castShadow = true; group.add(boxMesh);
  const claw = new THREE.Group(); claw.position.set(-hw + 1.2, 0, -hd - 2.2); group.add(claw);
  mesh(keep(new THREE.BoxGeometry(2, 1.2, 1.6)), std('#e8394a'), 0, 0.6, 0, claw);
  mesh(keep(new THREE.BoxGeometry(1.9, 1.6, 1.5)), basic('#bfe6ff', { opacity: 0.35 }), 0, 2.0, 0, claw);
  mesh(keep(new THREE.BoxGeometry(2.1, 0.3, 1.7)), std('#ffd23f'), 0, 2.95, 0, claw);
  mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6)), std('#888'), 0.3, 2.45, 0, claw);

  // ---- the bear (built facing +z; the group turns)
  const B = new THREE.Group(); group.add(B);
  const tilt = new THREE.Group(); B.add(tilt);                         // the whole bear leans / flops / spins round its feet
  const fur = std('#c98a44', { roughness: 0.95 }), cream = std('#f6dcae', { roughness: 0.95 }), darkFur = std('#8a5a2b', { roughness: 0.95 });
  const black = std('#1a1a1a', { roughness: 0.3 }), red = std('#e8394a', { roughness: 0.5 }), brass = std('#e6b84a', { roughness: 0.3, metalness: 0.6, emissive: new THREE.Color('#ffb000'), emissiveIntensity: 0 });
  const sph = keep(new THREE.SphereGeometry(1, 20, 14));
  const body = mesh(sph, fur, 0, 1.25, 0, tilt); body.scale.set(1.15, 1.2, 1.0);
  mesh(sph, cream, 0, 1.15, 0.55, tilt).scale.set(0.8, 0.85, 0.55);
  const head = new THREE.Group(); head.position.set(0, 2.75, 0.05); tilt.add(head);
  mesh(sph, fur, 0, 0, 0, head).scale.setScalar(0.85);
  for (const sx of [-1, 1]) { mesh(sph, fur, sx * 0.62, 0.62, -0.05, head).scale.set(0.32, 0.32, 0.2); mesh(sph, cream, sx * 0.62, 0.62, 0.05, head).scale.set(0.2, 0.2, 0.1); }
  mesh(sph, cream, 0, -0.2, 0.68, head).scale.set(0.38, 0.28, 0.3);
  mesh(sph, black, 0, -0.1, 0.95, head).scale.set(0.12, 0.09, 0.08);
  const eyeGeo = keep(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14).rotateX(Math.PI / 2));
  const eyes = [-1, 1].map(sx => mesh(eyeGeo, black, sx * 0.3, 0.15, 0.77, head));
  for (const sx of [-1, 1]) mesh(sph, std('#ffffff'), sx * 0.27, 0.19, 0.8, head).scale.setScalar(0.03);
  // bow tie
  for (const sx of [-1, 1]) { const w = mesh(keep(new THREE.ConeGeometry(0.22, 0.4, 4).rotateZ(sx * Math.PI / 2)), red, sx * 0.2, 2.15, 0.62, tilt); w.scale.z = 0.5; }
  mesh(sph, red, 0, 2.15, 0.66, tilt).scale.setScalar(0.1);
  // arms (pivot at the shoulder, paw at the end) and legs
  const arms = [-1, 1].map(sx => {
    const pv = new THREE.Group(); pv.position.set(sx * 1.05, 1.85, 0.1); tilt.add(pv);
    mesh(sph, fur, 0, -0.55, 0, pv).scale.set(0.33, 0.6, 0.33);
    mesh(sph, cream, 0, -1.08, 0.08, pv).scale.set(0.3, 0.24, 0.26);
    pv.rotation.z = sx * 0.35; return { pv, sx };
  });
  const legs = [-1, 1].map(sx => { const l = mesh(sph, fur, sx * 0.55, 0.3, 0.15, tilt); l.scale.set(0.42, 0.33, 0.5); mesh(sph, cream, sx * 0.55, 0.3, 0.58, tilt).scale.set(0.26, 0.22, 0.08); return l; });
  mesh(sph, darkFur, 0, 0.85, -0.95, tilt).scale.set(0.22, 0.22, 0.2);                // a little tail
  // the key: a shaft out of its back and a bow of two loops, turning
  const key = new THREE.Group(); key.position.set(0, 1.45, -1.05); tilt.add(key);
  mesh(keep(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 10).rotateX(Math.PI / 2)), brass, 0, 0, -0.3, key);
  const bow = new THREE.Group(); bow.position.z = -0.7; key.add(bow);
  for (const sx of [-1, 1]) mesh(keep(new THREE.TorusGeometry(0.3, 0.09, 8, 18)), brass, sx * 0.36, 0, 0, bow);
  B.traverse(o => { if (o.isMesh) o.castShadow = true; });
  B.scale.setScalar(1.15);

  // ---- dizzy stars over its head (one instanced mesh)
  const stars = new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(0.16, 0)), std('#ffd23f', { emissive: new THREE.Color('#ffb000'), emissiveIntensity: 0.6 }), 5);
  stars.count = 0; group.add(stars);

  // ---- floor marks: the key wedge behind it, the swipe wedge in front, a ring for flop / sit / spin
  const wedgeGeo = (r, half) => keep(new THREE.CircleGeometry(r, 28, -half, half * 2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2));
  const keyMark = mesh(wedgeGeo(RULES.keyReach, RULES.keyHalf), basic('#ffd23f', { opacity: 0.22 }), 0, 0.03, 0);
  const keyEdge = mesh(keep(new THREE.RingGeometry(RULES.keyReach - 0.12, RULES.keyReach, 28, 1, -RULES.keyHalf, RULES.keyHalf * 2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2)), basic('#e6a400', { opacity: 0.8 }), 0, 0.035, 0);
  const swipe = mesh(wedgeGeo(RULES.swipeR, RULES.swipeHalf), basic('#ff3b3b', { opacity: 0.3 }), 0, 0.05, 0); swipe.visible = false;
  const swipeFill = mesh(wedgeGeo(1, RULES.swipeHalf), basic('#ffb04a', { opacity: 0.5 }), 0, 0.055, 0); swipeFill.visible = false;
  swipe.renderOrder = swipeFill.renderOrder = 3;

  // ---- the favourite's heart balloon (a heart from two spheres + a cone, on a string)
  const heart = new THREE.Group(); group.add(heart);
  const hm = std('#ff3b5c', { roughness: 0.3, emissive: new THREE.Color('#ff3b5c'), emissiveIntensity: 0.25 });
  for (const sx of [-1, 1]) mesh(sph, hm, sx * 0.2, 0.12, 0, heart).scale.setScalar(0.27);
  const hc = mesh(keep(new THREE.ConeGeometry(0.4, 0.5, 16).rotateX(Math.PI)), hm, 0, -0.18, 0, heart);
  mesh(keep(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4)), std('#ffffff'), 0, -1.1, 0, heart);
  heart.visible = false; heart.scale.setScalar(1.5);
  const favRing = mesh(keep(new THREE.RingGeometry(0.62, 0.8, 28).rotateX(-Math.PI / 2)), basic('#ff3b5c', { opacity: 0.85 }), 0, 0.04, 0); favRing.visible = false;

  const bar = scoreBar(ctx, { unit: 'damage' });
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => { stage.setSafe?.(tall() ? { top: 0.2 } : { top: 0.15 }); ctx.camera({ cx: 0, cz: -0.6, hw: hw + 0.8, hd: hd + 1.4, tall: tall() ? 3.8 : 3.2 }, { instant: true }); };
  frameCam(); addEventListener('resize', frameCam);
  let G = null, ph = 'ready', bx = 0, bz = -2.4, by = 0, phT = 0, keySpin = 0, keyKick = 0, lastMv = null;

  function hint(g) {
    if (g.ph === 'floppy') return '<span class="bk-tag hot">FLOPPY! Whack it anywhere!</span>';
    if (g.ph === 'dizzy') return '<span class="bk-tag hot">Dizzy! Crank the key!</span>';
    if (g.ph === 'stuck') return '<span class="bk-tag">Getting up…</span>';
    if (g.mv) return `<span class="bk-tag hot">${{ stomp: 'Belly-flop! Out of the ring!', swipe: 'Paw swipe! Out of the wedge!', spin: 'SPIN! Get out or roll!', sit: 'Sit-down! Away from its back!' }[g.mv[1]]}</span>`;
    if (g.fv === me && !init.solo) return '<span class="bk-tag">♥ It’s after you: lead it!</span>';
    return '<span class="bk-tag">Get behind it and crank!</span>';
  }

  return {
    winter: { spots: [[-11, 0, -7], [11, 0, -7], [-11, 0, 5], [11, 0, 5]] },
    halloween: { spots: [[-11, 0, -7], [11, 0, -7], [-11, 0, 5], [11, 0, 5]], ghosts: [[-9, 3, -9], [9, 3, -9]] },
    start() { frameCam(); K.banner('Here comes Teddy!'); },
    state(g) {
      G = g;
      if (g.ph !== ph) { ph = g.ph; phT = 0; }
      K.hp(g.hp, init.hpMax);
      const full = Math.min(init.need, Math.floor(g.m)), meter = `<span class="wb-key" aria-label="key meter"><b>🔑</b><span class="wb-meter"><i style="width:${(100 * Math.min(1, g.m / init.need)).toFixed(0)}%"></i></span><small>${full}/${init.need}</small></span>`;
      K.row(`<span class="wb-hearts${g.hearts <= 1 ? ' low' : ''}" aria-label="${g.hearts} team hearts">${'♥'.repeat(g.hearts)}<small>×${g.hearts}</small></span>${meter}${hint(g)}`);
      // telegraph rings (flop in front, sit behind, spin all round) from the move in the state
      const rows = [];
      if (g.mv && g.mv[1] !== 'swipe') {
        const [id, kind, left, total] = g.mv, p = kind === 'stomp' ? stompAt(g.bx, g.bz, g.by) : kind === 'sit' ? sitAt(g.bx, g.bz, g.by) : { x: g.bx, z: g.bz };
        rows.push([id, p.x, p.z, kind === 'stomp' ? RULES.stompR : kind === 'sit' ? RULES.sitR : RULES.spinR, left, total]);
      }
      K.rings(rows);
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'wind') { K.banner({ stomp: 'BELLY-FLOP!', swipe: 'PAW SWIPE!', spin: 'SPIN!', sit: 'SIT-DOWN!' }[ev.kind], 'warn', 900); ctx.sfx('trap'); }
      else if (ev.e === 'stomp' || ev.e === 'sit') { K.puff(ev.x, 0.4, ev.z, '#f6dcae', 2.4); K.puff(ev.x, 0.8, ev.z, '#ffffff', 1.3); ctx.sfx('splat'); }
      else if (ev.e === 'swipe') { ctx.sfx('throw'); }
      else if (ev.e === 'spin') { K.puff(bx, 1, bz, '#f6dcae', 3); ctx.sfx('throw'); }
      else if (ev.e === 'crank') { keyKick = 1; if (ev.pid === me) ctx.sfx('tap'); floatText(stage, bx - Math.sin(by) * 1.4, 2.3, bz - Math.cos(by) * 1.4, `-${ev.dmg}`, 'good'); }
      else if (ev.e === 'whack') { K.puff(bx, 0.8, bz, '#ffe9a8', 0.8); floatText(stage, bx, 1.6, bz, `-${ev.dmg}!`, 'good'); ctx.sfx(ev.pid === me ? 'coins' : 'hit'); }
      else if (ev.e === 'flop') { K.banner('FLOPPY! Whack it!', 'good', 1300); ctx.sfx('good'); K.puff(bx, 0.5, bz, '#f6dcae', 2.2); }
      else if (ev.e === 'getup') { K.banner('It’s getting up!', 'warn', 800); }
      else if (ev.e === 'chase') { if (ev.fav === me && !init.solo) K.banner('It picked YOU! Lead it away!', 'warn', 1200); }
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'FLUMPH! −♥', 'bad'); }
      else if (ev.e === 'bump') { const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'Boop!', ''); }
      else if (ev.e === 'roll') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { K.banner(ev.ok ? 'Teddy wound down!' : 'Teddy wins the hug!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('punch', 320); },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.ph === 'end') return G.hp <= 0 ? 'cheer' : 'sitGround'; if (flags & F.AIR) return 'jump'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t); phT += dt;
      if (G) { const k = Math.min(1, dt * 8); bx += (G.bx - bx) * k; bz += (G.bz - bz) * k; let d = G.by - by; d = Math.atan2(Math.sin(d), Math.cos(d)); by += d * k; }
      const p = G?.ph || 'ready', kind = G?.mv?.[1], won = p === 'end' && G.hp <= 0;
      B.position.set(bx, 0, bz); B.rotation.y = by;
      // body language
      let rx = 0, ry = 0, rz = 0, y = 0, armL = 0.35, armR = -0.35, armX = 0;
      if (p === 'chase') { rz = Math.sin(t * 6) * 0.08; y = Math.abs(Math.sin(t * 6)) * 0.08; armX = Math.sin(t * 6) * 0.4; }
      else if (p === 'wind') {
        const k = 1 - (G.mv[2] / Math.max(0.01, G.mv[3]));
        if (kind === 'stomp') { rx = -0.25 * k; y = 0.4 * k; armL = 2.6; armR = -2.6; }
        else if (kind === 'swipe') { armR = -2.2; armX = -0.6; rz = 0.1; }
        else if (kind === 'spin') { armL = 1.55; armR = -1.55; ry = -0.3 * k; }
        else { rx = 0.2 * k; y = 0.5 * k; }
      } else if (p === 'stuck' && lastMv === 'stomp') { rx = Math.max(0, 1.25 - phT * 1.4); y = 0; armL = 1.4; armR = -1.4; }
      else if (p === 'stuck') { y = -0.35 * Math.max(0, 1 - phT * 0.9); rx = -0.15; }
      else if (p === 'dizzy') { rz = Math.sin(t * 3) * 0.12; rx = Math.sin(t * 2.3) * 0.05; }
      else if (p === 'floppy' || won) { rx = Math.min(1.45, phT * 6); y = 0; armL = 2.8; armR = -2.8; }
      else if (p === 'getup') { rx = Math.max(0, 1.45 - phT * 1.6); }
      if (p === 'dizzy' && lastMv === 'swipe' && phT < 0.4) armX = 0.9 - phT * 2;
      if (p === 'dizzy' && lastMv === 'spin' && phT < 0.5) ry = phT * Math.PI * 8;   // the spin, finishing
      if (G?.mv) lastMv = G.mv[1];
      const k = Math.min(1, dt * 10);
      tilt.rotation.x += (rx - tilt.rotation.x) * k; tilt.rotation.z += (rz - tilt.rotation.z) * k; tilt.rotation.y = ry; tilt.position.y += (y - tilt.position.y) * k;
      arms[0].pv.rotation.z += (armL - arms[0].pv.rotation.z) * k; arms[1].pv.rotation.z += (armR - arms[1].pv.rotation.z) * k;
      arms[0].pv.rotation.x = armX; arms[1].pv.rotation.x = -armX * (kind === 'swipe' && p === 'wind' ? -1 : 1);
      legs[0].position.y = 0.3 + (p === 'chase' ? Math.max(0, Math.sin(t * 6)) * 0.15 : 0); legs[1].position.y = 0.3 + (p === 'chase' ? Math.max(0, -Math.sin(t * 6)) * 0.15 : 0);
      for (const e of eyes) e.scale.y = p === 'dizzy' ? 0.35 : 1;
      // the key turns while it walks, spins BACKWARD when cranked, and glows when it is close to going floppy
      keyKick = Math.max(0, keyKick - dt * 4);
      keySpin += dt * (p === 'chase' || p === 'wind' ? 2.2 : 0.6) - keyKick * dt * 18; bow.rotation.z = keySpin;
      brass.emissiveIntensity = G ? Math.min(0.7, 0.7 * G.m / init.need) + keyKick * 0.3 : 0;
      // floor marks follow the bear
      const mine = me != null && ctx.pos(me);
      keyMark.position.set(bx, 0.03, bz); keyMark.rotation.y = by + Math.PI; keyEdge.position.copy(keyMark.position); keyEdge.rotation.y = by + Math.PI;
      const inKey = mine && (() => { const dx = mine.x - bx, dz = mine.z - bz, d = Math.hypot(dx, dz), a = Math.atan2(dx, dz) - by - Math.PI; return d <= RULES.keyReach && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= RULES.keyHalf; })();
      keyMark.material.opacity = p === 'floppy' || p === 'end' ? 0 : inKey ? 0.45 + 0.15 * Math.sin(t * 10) : 0.2; keyEdge.visible = keyMark.material.opacity > 0;
      const sw = p === 'wind' && kind === 'swipe';
      swipe.visible = swipeFill.visible = sw;
      if (sw) { const kk = 1 - G.mv[2] / Math.max(0.01, G.mv[3]); swipe.position.set(bx, 0.05, bz); swipe.rotation.y = by; swipeFill.position.set(bx, 0.055, bz); swipeFill.rotation.y = by; swipeFill.scale.setScalar(Math.max(0.01, kk * RULES.swipeR)); swipe.material.opacity = kk > 0.7 ? 0.3 + 0.3 * Math.abs(Math.sin(t * 18)) : 0.3; }
      // dizzy stars
      stars.count = p === 'dizzy' || p === 'floppy' ? 5 : 0;
      for (let i = 0; i < stars.count; i++) { const a = t * 3 + i * Math.PI * 2 / 5, hy = p === 'floppy' ? 1.2 : 3.9; m4.compose(v3.set(bx + Math.sin(a) * 0.9, hy + Math.sin(t * 5 + i) * 0.1, bz + Math.cos(a) * 0.9), q.setFromEuler(e3.set(t * 4, t * 3, 0)), sc.set(1, 1, 1)); stars.setMatrixAt(i, m4); }
      stars.instanceMatrix.needsUpdate = true;
      // the favourite's heart balloon
      const fp = G && G.ph !== 'end' && G.ph !== 'ready' && ctx.pos(G.fv);
      heart.visible = favRing.visible = !!fp;     // the balloon floats beside the name tag, not under it
      if (fp) { favRing.position.set(fp.x, 0.04, fp.z); favRing.scale.setScalar(1 + Math.sin(t * 6) * 0.08); heart.position.set(fp.x + 1.05 + Math.sin(t * 2) * 0.1, 3.0 + Math.sin(t * 3) * 0.12, fp.z); heart.rotation.y = Math.sin(t * 1.5) * 0.5; hc.scale.setScalar(1 + Math.sin(t * 6) * 0.05); }
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); for (const tx of texs) tx.dispose(); K.dispose(); },
  };
}
