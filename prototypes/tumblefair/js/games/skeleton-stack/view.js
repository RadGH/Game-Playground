// SKELETON STACK, as drawn (Halloween only, under the shared dusk dressing): a friendly moonlit graveyard — mossy
// grass, a dirt cross-path, a low iron fence, a crooked tree and little rounded headstones outside the play area.
// Each player's PLOT is a soft mound in their seat colour with a headstone; above it floats the piece it needs next,
// spinning, with a tag ("Next: Legs"). The skeleton grows on the mound piece by piece (feet, legs, rib cage, arms,
// then a round cartoon skull with big eye holes and a smile — no teeth); finished ones hop off to the side and keep
// dancing (up to three per plot). Bones on the grass are five different SHAPES (one instanced mesh each): little feet,
// long leg bones, a curved rib cage, thinner arm bones and skulls; the kind YOU need next sits on a glowing ring.
// A carried bone is held up over the carrier's head. A bonk throws stars.
import { RULES, PIECES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const NAMES = ['Feet', 'Legs', 'Ribs', 'Arms', 'Skull'];
export function createView(ctx) {
  const { THREE, group, stage, init, meta } = ctx;
  const { hw, hd } = meta.arena;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const texs = [], tex = t => { texs.push(t); return t; };
  // ---- graveyard
  const grass = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#4d7a5a'; c.fillRect(0, 0, w, w); let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 260; i++) { c.fillStyle = r() < 0.5 ? 'rgba(30,60,45,.45)' : 'rgba(120,170,120,.3)'; c.beginPath(); c.ellipse(r() * w, r() * w, 2 + r() * 8, 1 + r() * 3, r() * 3, 0, 7); c.fill(); } }));
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(hw / 3, hd / 3);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), std('#ffffff', { map: grass })); yard.receiveShadow = true; group.add(yard);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std('#2f4a3c')); outside.position.y = -0.03; group.add(outside);
  for (const [w, d] of [[hw * 2, 1.1], [1.1, hd * 2]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), std('#7a6450')); p.position.y = 0.005; p.receiveShadow = true; group.add(p); }
  const fp = []; for (let x = -hw; x <= hw + 0.01; x += 1.2) fp.push([x, -hd - 0.3], [x, hd + 0.3]); for (let z = -hd + 1.2; z < hd; z += 1.2) fp.push([-hw - 0.3, z], [hw + 0.3, z]);
  const fence = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), std('#2a2438', { metalness: 0.4, roughness: 0.5 }), fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 0.5, z), q.identity(), sc.setScalar(1)); fence.setMatrixAt(i, m4); }); group.add(fence);
  const tipGeo = new THREE.ConeGeometry(0.08, 0.2, 4), tips = new THREE.InstancedMesh(tipGeo, std('#2a2438'), fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 1.08, z), q.identity(), sc.setScalar(1)); tips.setMatrixAt(i, m4); }); group.add(tips);
  const stoneTex = tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = '#b5aed0'; c.fillRect(0, 0, w, w); c.strokeStyle = '#7f77a3'; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, w * 0.4, 11, Math.PI * 0.3, Math.PI * 1.7); c.stroke(); }));
  const deco = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 1.0, 0.25), std('#ffffff', { map: stoneTex }), 10);
  for (let i = 0; i < 10; i++) { const side = i % 2 ? 1 : -1, x = side * (hw + 1.6 + (i % 3) * 0.9), z = -hd + (i * 1.7) % (hd * 2); m4.compose(v.set(x, 0.5, z), q.setFromEuler(e3.set(0, side * 0.3 + i * 0.2, (i % 3 - 1) * 0.08)), sc.setScalar(0.9 + (i % 3) * 0.15)); deco.setMatrixAt(i, m4); }
  deco.castShadow = true; group.add(deco);
  const bark = std('#3e2c22', { flatShading: true }), tree = new THREE.Group(); tree.position.set(-hw - 2.6, 0, -hd - 1.4); group.add(tree);
  const seg = (len, r0, r1, parent, rx, rz, y) => { const g = new THREE.Group(); g.position.y = y; g.rotation.set(rx, 0, rz); parent.add(g); const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6).translate(0, len / 2, 0), bark); m.castShadow = true; g.add(m); return g; };
  const t1 = seg(2.0, 0.4, 0.28, tree, 0, 0.15, 0), t2 = seg(1.5, 0.28, 0.16, t1, 0, -0.4, 1.9); seg(1.3, 0.14, 0.05, t2, 0.2, 0.9, 1.3); seg(1.1, 0.12, 0.05, t2, -0.3, -0.9, 1.4); seg(1.0, 0.12, 0.05, t1, 0.4, -1.1, 1.5);

  // ---- bone shapes (shared by the ground bones, carried bones and the skeletons)
  const boneMat = std('#f4ecd8', { roughness: 0.6, emissive: '#6a6050', emissiveIntensity: 0.55 });
  const stick = (len, r) => { const parts = [new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2)]; for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.SphereGeometry(r * 1.55, 8, 6).translate(sx * len / 2, 0, sz * r * 1.1)); return mergeGeometries(parts.map(g => g.toNonIndexed())); };
  const footGeo = mergeGeometries([new THREE.SphereGeometry(0.16, 10, 6).scale(1.5, 0.5, 1).translate(-0.17, 0, 0), new THREE.SphereGeometry(0.16, 10, 6).scale(1.5, 0.5, 1).translate(0.17, 0, 0)].map(g => g.toNonIndexed()));
  const ribGeo = (() => { const parts = []; for (let k = 0; k < 3; k++) parts.push(new THREE.TorusGeometry(0.26 - k * 0.04, 0.035, 5, 14, Math.PI * 1.3).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.15).translate(0, k * 0.11, 0)); parts.push(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 5).translate(-0.27, 0.11, 0)); return mergeGeometries(parts.map(g => g.toNonIndexed())); })();
  const skullTex = tex(canvasTexture(128, 64, (c, w, hh) => { c.fillStyle = '#f4ecd8'; c.fillRect(0, 0, w, hh); c.fillStyle = '#3a2c4a'; const cx = w * 0.25; c.beginPath(); c.ellipse(cx - 11, 30, 8, 10, 0, 0, 7); c.ellipse(cx + 11, 30, 8, 10, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(cx, 38); c.lineTo(cx - 3, 44); c.lineTo(cx + 3, 44); c.fill(); c.strokeStyle = '#3a2c4a'; c.lineWidth = 2.5; c.beginPath(); c.arc(cx, 44, 9, 0.3, Math.PI - 0.3); c.stroke(); }));
  const skullGeo = new THREE.SphereGeometry(0.24, 16, 12); skullGeo.scale(1, 0.95, 0.95);
  const skullMat = std('#ffffff', { map: skullTex, roughness: 0.6, emissive: '#6a6050', emissiveIntensity: 0.45 });
  const GEOS = [footGeo, stick(0.62, 0.06), ribGeo, stick(0.5, 0.045), skullGeo], MATS = [boneMat, boneMat, boneMat, boneMat, skullMat];
  // ground bones: one instanced mesh per kind
  const MAXB = 24, zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const ground = GEOS.map((g, k) => { const m = new THREE.InstancedMesh(g, MATS[k], MAXB); m.castShadow = true; m.frustumCulled = false; for (let i = 0; i < MAXB; i++) m.setMatrixAt(i, zero); group.add(m); return m; });
  const glowGeo = new THREE.RingGeometry(0.52, 0.68, 24).rotateX(-Math.PI / 2), glows = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ color: '#ffe96b', transparent: true, opacity: 0.8, depthWrite: false }), MAXB);
  glows.frustumCulled = false; for (let i = 0; i < MAXB; i++) glows.setMatrixAt(i, zero); group.add(glows);
  let boneList = [];

  // ---- plots: mound, headstone, the skeleton being built, finished dancers, the next-piece sign
  const plots = new Map();   // pid -> plot view
  function skeleton(scale = 1) {
    const g = new THREE.Group(); g.scale.setScalar(scale);
    const parts = [];
    const add = (k, x, y, z, rx = 0, rz = 0, ry = 0) => { const m = new THREE.Mesh(GEOS[k], MATS[k]); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); (parts[k] ||= []).push(m); return m; };
    add(0, 0, 0.05, 0.05, 0, 0, Math.PI / 2);                       // feet (the pair)
    add(1, -0.12, 0.42, 0, 0, Math.PI / 2); add(1, 0.12, 0.42, 0, 0, Math.PI / 2);   // legs
    add(2, 0, 0.8, 0, 0, 0, -Math.PI / 2);                           // ribs
    add(3, -0.36, 0.95, 0, 0, Math.PI / 2 - 0.5); add(3, 0.36, 0.95, 0, 0, -Math.PI / 2 + 0.5);   // arms
    add(4, 0, 1.38, 0, 0, 0, -Math.PI / 2);                          // skull (its face texture's middle faces +z after this turn)
    g.userData.parts = parts; return g;
  }
  const showUpTo = (sk, stage) => sk.userData.parts.forEach((list, k) => list.forEach(m => { m.visible = k < stage; }));
  const signGeos = GEOS.map(g => g);
  ctx.players.forEach(p => {
    const i = init.owners[p.pid]; const [px, pz] = init.plots[i];
    const g = new THREE.Group(); g.position.set(px, 0, pz); group.add(g);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(init.plotR, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(new THREE.Color(p.color).lerp(new THREE.Color('#5a4a3a'), 0.55))); mound.scale.y = 0.18; mound.receiveShadow = true; g.add(mound);
    const ring = new THREE.Mesh(new THREE.RingGeometry(init.plotR - 0.12, init.plotR, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.color })); ring.position.y = 0.02; g.add(ring);
    const back = -1, stone = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.3), std('#ffffff', { map: stoneTex })); stone.position.set(0, 0.6, back * (init.plotR + 0.1)); stone.castShadow = true; g.add(stone);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 0.32), std(p.color)); band.position.set(0, 0.95, back * (init.plotR + 0.1)); g.add(band);
    const sk = skeleton(1); sk.position.set(0, 0.18, 0); sk.rotation.y = 0; showUpTo(sk, 0); g.add(sk);
    const sign = new THREE.Mesh(signGeos[0], MATS[0]); sign.position.set(0, 2.55, back * (init.plotR + 0.1)); sign.scale.setScalar(1.3); g.add(sign);
    const tag = stage.tag(sign, { text: 'Next: Feet', seat: p.seat, height: 0.45, cls: 'ss-next' });
    plots.set(p.pid, { g, sk, sign, tag, stage: -1, skels: 0, dancers: [], back, dance: 0 });
  });

  // ---- carried bones (held over the head), bonk stars
  const held = new Map();
  function setHeld(pid, kind) {
    const a = ctx.actor(pid); if (!a) return false;
    let H = held.get(pid);
    if (!H) { H = { mesh: new THREE.Mesh(GEOS[0], MATS[0]), kind: -2 }; H.mesh.castShadow = true; a.group.add(H.mesh); held.set(pid, H); }
    if (H.kind !== kind) { H.kind = kind; H.mesh.visible = kind >= 0; if (kind >= 0) { H.mesh.geometry = GEOS[kind]; H.mesh.material = MATS[kind]; } H.mesh.position.set(0, (a.height || 1.6) + 0.35, 0); H.mesh.scale.setScalar(1.15); }
    return true;
  }
  const starTex = tex(canvasTexture(32, 32, (c, w) => { c.fillStyle = '#ffe96b'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 6 : 15; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } c.fill(); }));
  const stars = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false }), 12); stars.frustumCulled = false; group.add(stars);
  for (let i = 0; i < 12; i++) stars.setMatrixAt(i, zero);
  const flags = new Map(), cq = new THREE.Quaternion();

  // ---- HUD
  const tunes = createTunes({ volume: 0.22 });
  const sbar = scoreBar(ctx, { unit: 'pts' });
  const pill = ctx.me != null ? h('div', 'ss-pill') : null; if (pill) ctx.ui.append(pill);
  const medals = init.solo ? h('div', 'ss-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const banner = h('div', 'ss-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.2) => { banner.textContent = text; banner.className = 'ss-banner show ' + cls; bannerT = s; };
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  let myStage = 0, myCarry = -1, lastPill = '';
  function setPill() {
    if (!pill) return;
    const steps = PIECES.map((_, k) => `<i class="${k < myStage ? 'done' : k === myStage ? 'now' : ''}">${NAMES[k]}</i>`).join('');
    const carry = myCarry < 0 ? '' : myCarry === myStage ? `<b class="ok">✓ Carrying ${NAMES[myCarry]} — take it home!</b>` : `<b class="no">✗ ${NAMES[myCarry]} isn't next — A to drop</b>`;
    const html = `<span class="steps">${steps}</span>${carry}`;
    if (html !== lastPill) { lastPill = html; pill.innerHTML = html; }
  }
  let prevB = 0, prevS = -9;
  // a portrait phone follows its own character
  const FULL = { cx: 0, cz: -0.3, hw: hw + 0.9, hd: hd + 1.2 }, SLICE = 6.5;
  const portrait = () => ctx.me != null && innerHeight > innerWidth * 1.15;
  let camX = 0;
  const frameCam = (dt, instant = false) => {
    if (!portrait()) { ctx.camera(FULL, { instant }); return; }
    const at = ctx.pos(ctx.me), lim = FULL.hw - SLICE, want = Math.max(-lim, Math.min(lim, at ? at.x : 0));
    camX = instant ? want : camX + (want - camX) * Math.min(1, dt * 4);
    ctx.camera({ cx: camX, cz: FULL.cz, hw: SLICE, hd: FULL.hd }, { instant });
  };
  frameCam(0, true);
  return {
    start() { tunes.start('spooky'); },
    state(g) {
      boneList = g.b;
      for (const p of ctx.players) {
        const P = plots.get(p.pid), [stg, skels] = g.st[p.pid];
        if (P.stage !== stg) { P.stage = stg; showUpTo(P.sk, stg); P.sign.geometry = signGeos[stg]; P.sign.material = MATS[stg]; P.tag.set(`Next: ${NAMES[stg]}`); }
        while (P.dancers.length < Math.min(3, skels)) { const d = skeleton(0.6); showUpTo(d, 5); const k = P.dancers.length, side = init.plots[init.owners[p.pid]][0] < 0 ? 1 : -1; d.position.set(side * (1.9 + k * 0.75), 0, P.back * (0.2 - k * 0.5)); P.g.add(d); P.dancers.push(d); }
        setHeld(p.pid, g.ca[p.pid]);
      }
      if (ctx.me != null && g.st[ctx.me]) { myStage = g.st[ctx.me][0]; myCarry = g.ca[ctx.me]; }
      setPill();
      sbar.set(g.sc, g.left);
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
    },
    input(inp) {
      const fresh = bit => (inp.b & bit) && (!(prevB & bit) || inp.s !== prevS + 1);
      if (!(flags.get(ctx.me) & F.STUN)) { if (fresh(IN.B)) ctx.actor(ctx.me)?.play('punch', 340); else if (fresh(IN.A)) ctx.actor(ctx.me)?.play('kneel', 300); }
      prevB = inp.b; prevS = inp.s;
    },
    event(ev) {
      const p = ev.x != null ? ev : ctx.pos(ev.pid);
      if (ev.e === 'grab') { ctx.sfx('pick'); if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('kneel', 300); }
      else if (ev.e === 'place') { ctx.sfx('good'); floatText(stage, ev.x, 2.2, ev.z, `${NAMES[ev.kind]} +1`, ev.pid === ctx.me ? 'good' : ''); tunes.fx('knock', 1.4); }
      else if (ev.e === 'done') {
        const P = plots.get(ev.pid); if (P) { showUpTo(P.sk, 5); P.dance = 1.6; }
        ctx.sfx('win'); tunes.fx('chime'); floatText(stage, ev.x, 2.8, ev.z, 'Skeleton! +3', 'good');
        ctx.actor(ev.pid)?.play('cheer', 900); if (ev.pid === ctx.me) show('It dances! +3', 'good', 1.4);
      } else if (ev.e === 'wrong') { if (ev.to === ctx.me) show(`Needs ${NAMES[ev.need]} first!`, 'bad', 1.1); ctx.sfx('bad'); }
      else if (ev.e === 'bonk') { ctx.sfx('hit'); if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('punch', 340); floatText(stage, ev.x, 2.0, ev.z, 'Bonk!', ev.to === ctx.me ? 'bad' : ''); tunes.fx('knock', 0.8); }
      else if (ev.e === 'swing') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('punch', 340); }
      else if (ev.e === 'drop') { if (ev.why === 'bonk') tunes.fx('boing', 1.2); }
      else if (ev.e === 'rise') { tunes.fx('boo', 1.6); }
      else if (ev.e === 'nothing') { if (ev.to === ctx.me) ctx.sfx('tap'); }
      void p; void nameOf;
    },
    pose(pid, fl) { flags.set(pid, fl); if (fl & F.FROZEN) return 'dance'; return undefined; },
    frame(dt, t) {
      frameCam(dt);
      cq.copy(stage.camera.quaternion);
      // ground bones, with a glow ring under the kind I need
      const counts = [0, 0, 0, 0, 0]; let gi = 0;
      for (const [id, kind, x, z, yaw] of boneList) {
        const i = counts[kind]++; if (i >= MAXB) continue;
        m4.compose(v.set(x, kind === 4 ? 0.3 : kind === 2 ? 0.05 : 0.11, z), q.setFromEuler(e3.set(0, yaw, 0)), sc.setScalar(1.35)); ground[kind].setMatrixAt(i, m4);
        if (kind === myStage && myCarry < 0 && ctx.me != null && gi < MAXB) { m4.compose(v.set(x, 0.03, z), q.identity(), sc.setScalar(1 + 0.12 * Math.sin(t * 5 + id))); glows.setMatrixAt(gi++, m4); }
      }
      ground.forEach((m, k) => { for (let i = counts[k]; i < MAXB; i++) m.setMatrixAt(i, zero); m.instanceMatrix.needsUpdate = true; });
      for (let i = gi; i < MAXB; i++) glows.setMatrixAt(i, zero); glows.instanceMatrix.needsUpdate = true;
      // signs spin; a just-finished skeleton dances; finished ones bob
      for (const P of plots.values()) {
        P.sign.rotation.y = t * 1.5; P.sign.position.y = 2.55 + Math.sin(t * 2) * 0.08;
        if (P.dance > 0) { P.dance -= dt; P.sk.position.y = 0.18 + Math.abs(Math.sin(t * 9)) * 0.25; P.sk.rotation.z = Math.sin(t * 9) * 0.2; if (P.dance <= 0) { P.sk.position.y = 0.18; P.sk.rotation.z = 0; showUpTo(P.sk, P.stage); } }
        P.dancers.forEach((d, k) => { d.position.y = Math.abs(Math.sin(t * 4 + k)) * 0.15; d.rotation.y = Math.sin(t * 2 + k) * 0.6; d.userData.parts[3].forEach((m, j) => { m.rotation.z = (j ? -1 : 1) * (Math.PI / 2 - 0.5) + Math.sin(t * 6 + k + j) * 0.5; }); });
      }
      // held bones bob; bonked players see stars
      for (const H of held.values()) if (H.mesh.visible) H.mesh.rotation.y = t * 2;
      let st = 0;
      for (const p of ctx.players) {
        if (!held.has(p.pid)) setHeld(p.pid, -1);
        const fl = flags.get(p.pid) || 0, pos = ctx.pos(p.pid), a = ctx.actor(p.pid);
        if (pos && (fl & F.STUN)) for (let k = 0; k < 3 && st < 12; k++) { const an = t * 5 + k * 2.1; m4.compose(v.set(pos.x + Math.cos(an) * 0.45, (a?.height || 1.6) + 0.2, pos.z + Math.sin(an) * 0.45), cq, sc.setScalar(1)); stars.setMatrixAt(st++, m4); }
      }
      for (let i = st; i < 12; i++) stars.setMatrixAt(i, zero); stars.instanceMatrix.needsUpdate = true;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'ss-banner'; }
    },
    dispose() { sbar.el.remove(); tunes.dispose(); for (const P of plots.values()) P.tag.remove(); for (const t of texs) t.dispose(); },
  };
}
