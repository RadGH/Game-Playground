// BAT SWARM, as drawn (Halloween only, under the shared dusk dressing): a moonlit courtyard of lavender cobbles inside
// a low stone wall with glowing lanterns on its corner posts. In the middle a fat jack-o'-lantern PIÑATA hangs from a
// striped party arch on a rope; it sways, and jiggles and pops when it bursts candy. Sweets are little wrapped
// candies in bright colours (one instanced mesh) and big swirly lollipops (another); a new one arcs out from the
// piñata (or from a bumped player) and lands. A coming flock is shown on the ground FIRST: glowing purple stripes
// with arrows sliding the way the bats will fly, pulsing faster as they get close. Bats are the cute sprite bats
// (camera-facing, flapping, one instanced mesh). A bumped player spins dizzy with little stars and blinks while safe.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { pumpkinGeo, stemGeo, faceTexture, spriteTexture } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init, meta } = ctx;
  const { hw, hd } = meta.arena;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const texs = [];
  const tex = t => { texs.push(t); return t; };
  // ---- courtyard: cobbles, wall, corner lanterns
  const cob = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#7d6c9c'; c.fillRect(0, 0, w, w); let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let y = 0; y < w; y += 28) for (let x = (y / 28) % 2 ? -14 : 0; x < w; x += 28) { c.fillStyle = ['#b9aad6', '#c6b8e0', '#ad9dcc', '#cfc3e6'][Math.floor(r() * 4)]; c.beginPath(); c.roundRect(x + 2, y + 2, 24, 24, 7); c.fill(); } }));
  cob.wrapS = cob.wrapT = THREE.RepeatWrapping; cob.repeat.set(hw / 2.5, hd / 2.5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), std('#ffffff', { map: cob })); ground.receiveShadow = true; group.add(ground);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std('#2d3a35')); outside.position.y = -0.03; group.add(outside);
  const stoneM = std('#7d7396', { flatShading: true });
  for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 0.7, 0.5), stoneM); w.position.set(0, 0.35, sz * (hd + 0.35)); w.castShadow = w.receiveShadow = true; group.add(w); }
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, hd * 2 + 0.2), stoneM); w.position.set(sx * (hw + 0.35), 0.35, 0); w.castShadow = w.receiveShadow = true; group.add(w); }
  const lampM = new THREE.MeshStandardMaterial({ color: '#fff2c4', emissive: '#ffb84a', emissiveIntensity: 1.6 });
  for (const [x, z] of [[-hw - 0.35, -hd - 0.35], [hw + 0.35, -hd - 0.35], [-hw - 0.35, hd + 0.35], [hw + 0.35, hd + 0.35]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.7), stoneM); p.position.set(x, 0.65, z); p.castShadow = true; group.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34), lampM); l.position.set(x, 1.55, z); group.add(l);
  }
  // ---- the party arch and the piñata
  const pole = std('#ffffff'), stripeM = std('#ff8a1a');
  for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), k % 2 ? pole : stripeM); seg.position.set(sx * 2.4, 0.25 + k * 0.5, -0.9); seg.castShadow = true; group.add(seg); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.0, 8).rotateZ(Math.PI / 2), std('#7a3cc8')); bar.position.set(0, 4.1, -0.9); group.add(bar);
  const pin = new THREE.Group(); pin.position.set(0, 4.1, -0.9); group.add(pin);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4).translate(0, -0.6, 0), std('#d9c79a')); pin.add(rope);
  const pumpkin = new THREE.Group(); pumpkin.position.y = -1.9; pin.add(pumpkin);
  const pb = new THREE.Mesh(pumpkinGeo(THREE, 0.75), std('#ff7a14', { emissive: '#a83a00', emissiveIntensity: 0.25, roughness: 0.55 })); pb.castShadow = true; pumpkin.add(pb);
  pumpkin.add(new THREE.Mesh(stemGeo(THREE, 0.75), std('#4a7a2a')));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), new THREE.MeshBasicMaterial({ map: tex(faceTexture(THREE)), transparent: true, depthWrite: false, toneMapped: false })); face.position.set(0, -0.02, 0.62); face.rotation.x = -0.35; pumpkin.add(face);
  const tassels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), std('#ffffff'), 8);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; m4.compose(v.set(Math.sin(a) * 0.5, -0.7, Math.cos(a) * 0.5), q.identity(), sc.setScalar(1)); tassels.setMatrixAt(i, m4); tassels.setColorAt(i, col.set(['#ff5a8a', '#7dff5a', '#ffd23f', '#8a5aff'][i % 4])); }
  pumpkin.add(tassels);
  let jiggle = 0;
  // ---- candy: wrapped sweets + lollipops
  const MC = 64;
  const sweetGeo = new THREE.SphereGeometry(0.22, 10, 8); sweetGeo.scale(1.4, 0.8, 0.8);
  const sweets = new THREE.InstancedMesh(sweetGeo, std('#ffffff', { roughness: 0.3 }), MC), wraps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 0.22, 6).rotateZ(Math.PI / 2), std('#ffffff', { roughness: 0.5 }), MC * 2);
  const lolly = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, w); c.strokeStyle = '#ff3b7a'; c.lineWidth = 6; c.beginPath(); for (let a = 0; a < 18; a += 0.2) { const r = a * 1.7; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } c.stroke(); })), roughness: 0.3 }), 16);
  const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5), std('#ffffff'), 16);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const m of [sweets, wraps, lolly, sticks]) { for (let i = 0; i < m.count; i++) m.setMatrixAt(i, zero); m.castShadow = true; m.frustumCulled = false; group.add(m); }
  const CANDY_COLS = ['#ff5a8a', '#7dff5a', '#ffd23f', '#5ac8ff', '#c78aff', '#ff9a3a'];
  const candy = new Map();   // id -> { x, z, kind, fx, fz, born, landT }
  // ---- warning stripes: one plane per rect, arrows scroll the way the bats will fly
  const arrowTex = tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = 'rgba(190,120,255,.55)'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 7; c.lineJoin = 'round'; c.beginPath(); c.moveTo(18, 12); c.lineTo(42, 32); c.lineTo(18, 52); c.stroke(); }));
  arrowTex.wrapS = arrowTex.wrapT = THREE.RepeatWrapping;
  const stripes = new Map();   // wave id -> [{ mesh, dx, dz }]
  function stripe(id, rects) {
    if (stripes.has(id)) return stripes.get(id);
    const list = rects.map(([x, z, rw, rd, dx, dz]) => {
      const t = arrowTex.clone(); t.needsUpdate = true; texs.push(t);
      const along = dx !== 0, len = along ? rw * 2 : rd * 2, wid = along ? rd * 2 : rw * 2;
      t.repeat.set(len / 1.4, Math.max(1, wid / 1.4)); t.rotation = 0; t.center.set(0.5, 0.5);
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, wid).rotateX(-Math.PI / 2), mat);
      mesh.position.set(x, 0.03, z); mesh.rotation.y = along ? (dx > 0 ? 0 : Math.PI) : (dz > 0 ? -Math.PI / 2 : Math.PI / 2);
      mesh.renderOrder = 2; group.add(mesh);
      return { mesh, t };
    });
    stripes.set(id, list); return list;
  }
  function dropStripe(id) { for (const s of stripes.get(id) || []) { s.mesh.removeFromParent(); s.mesh.geometry.dispose(); s.mesh.material.dispose(); } stripes.delete(id); }
  const warnLeft = new Map();
  // ---- bats
  const MB = 90, batMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.35, 1.35), new THREE.MeshBasicMaterial({ map: tex(spriteTexture(THREE, 'bat')), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), MB);
  batMesh.frustumCulled = false; group.add(batMesh); for (let i = 0; i < MB; i++) batMesh.setMatrixAt(i, zero);
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a0f26', transparent: true, opacity: 0.35, depthWrite: false }), MB);
  shadows.frustumCulled = false; shadows.renderOrder = 1; group.add(shadows); for (let i = 0; i < MB; i++) shadows.setMatrixAt(i, zero);
  let batBase = [], batAt = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // ---- dizzy stars over bumped players
  const starTex = tex(canvasTexture(32, 32, (c, w) => { c.fillStyle = '#ffe96b'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 6 : 15; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } c.fill(); }));
  const stars = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false }), 4 * 3); stars.frustumCulled = false; group.add(stars);
  for (let i = 0; i < stars.count; i++) stars.setMatrixAt(i, zero);
  const flags = new Map();
  // a portrait phone sees a slice that follows its own character
  const FULL = { cx: 0, cz: -0.3, hw: hw + 0.9, hd: hd + 1 }, SLICE = 6.2;
  const portrait = () => ctx.me != null && innerHeight > innerWidth * 1.15;
  let camX = 0;
  const frameCam = (dt, instant = false) => {
    if (!portrait()) { ctx.camera(FULL, { instant }); return; }
    const at = ctx.pos(ctx.me), lim = FULL.hw - SLICE, want = Math.max(-lim, Math.min(lim, at ? at.x : 0));
    camX = instant ? want : camX + (want - camX) * Math.min(1, dt * 4);
    ctx.camera({ cx: camX, cz: FULL.cz, hw: SLICE, hd: FULL.hd }, { instant });
  };
  frameCam(0, true);
  // ---- sound + HUD
  const tunes = createTunes({ volume: 0.22 });
  const sbar = scoreBar(ctx, { unit: 'candy' });
  const medals = init.solo ? h('div', 'bs-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const tip = h('div', 'bs-tip', '🦇 Purple stripes = bats coming. Get out!'); ctx.ui.append(tip); setTimeout(() => tip.classList.add('gone'), 5500);
  const banner = h('div', 'bs-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.1) => { banner.textContent = text; banner.className = 'bs-banner show ' + cls; bannerT = s; };
  const WAVE_WORDS = { lane: 'Bats!', column: 'Bats!', double: 'Two flocks!', cross: 'Criss-cross!', wall: 'Bat wall — find the gap!', wall2: 'Wall + flock!' };
  let prevB = 0, prevS = -9;
  const cq = new THREE.Quaternion();
  return {
    start() { tunes.start('spooky'); },
    state(g) {
      const now = performance.now();
      // candy
      const seen = new Set();
      for (const [id, x, z, kind, falling, fx, fz] of g.c) {
        seen.add(id);
        if (!candy.has(id)) candy.set(id, { x, z, kind, fx: falling ? fx : x, fz: falling ? fz : z, born: now, fromPin: falling && fx === 0 && fz === 0 });
      }
      for (const id of [...candy.keys()]) if (!seen.has(id)) candy.delete(id);
      // warnings
      const live = new Set();
      for (const [id, left, rects] of g.w) { live.add(id); stripe(id, rects); warnLeft.set(id, left); }
      for (const id of [...stripes.keys()]) if (!live.has(id)) { dropStripe(id); warnLeft.delete(id); }
      // bats: positions now; frame() carries them on until the next update
      batBase = g.b; batAt = now;
      sbar.set(g.sc, g.left);
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
    },
    input(inp) {
      const fresh = (inp.b & IN.A) && (!(prevB & IN.A) || inp.s !== prevS + 1); prevB = inp.b; prevS = inp.s;
      if (fresh && !(flags.get(ctx.me) & F.STUN)) ctx.actor(ctx.me)?.play('jump', 260);
    },
    event(ev) {
      if (ev.e === 'grab') { ctx.sfx(ev.add > 1 ? 'coins' : 'pick'); floatText(stage, ev.x, 1.4, ev.z, `+${ev.add}`, ev.pid === ctx.me ? 'good' : ''); }
      else if (ev.e === 'burst') { jiggle = 0.6; tunes.fx('pop', 1.3); }
      else if (ev.e === 'warn') { tunes.fx('boo', 1.4); if (WAVE_WORDS[ev.kind] && ev.kind.startsWith('wall')) show(WAVE_WORDS[ev.kind], 'warn', 1.3); }
      else if (ev.e === 'swoop') tunes.fx('whistle');
      else if (ev.e === 'bump') { ctx.sfx('hit'); ctx.actor(ev.pid)?.play('hit', 500); floatText(stage, ev.x, 2.1, ev.z, ev.lose ? `−${ev.lose}` : 'Bonk!', 'bad'); if (ev.pid === ctx.me) show(ev.lose ? `Bat bump! −${ev.lose}` : 'Bat bump!', 'bad', 0.9); }
      else if (ev.e === 'dash') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 260); }
    },
    pose(pid, fl) { flags.set(pid, fl); if (fl & F.FROZEN) return 'cheer'; if ((fl & F.STUN) && (fl & F.GHOST)) return 'hit'; return undefined; },
    frame(dt, t) {
      frameCam(dt);
      const now = performance.now();
      cq.copy(stage.camera.quaternion);
      // piñata sway + jiggle
      if (jiggle > 0) jiggle -= dt;
      pin.rotation.z = Math.sin(t * 1.3) * 0.12 + (jiggle > 0 ? Math.sin(t * 40) * 0.08 * jiggle : 0); pin.rotation.x = Math.sin(t * 0.9) * 0.06;
      pumpkin.scale.setScalar(1 + (jiggle > 0 ? Math.sin(t * 30) * 0.06 * jiggle : 0));
      // candy (falling ones arc out of the piñata or off a bumped player)
      let si = 0, wi = 0, li = 0;
      for (const [id, c] of candy) {
        const k = Math.min(1, (now - c.born) / (RULES.land * 1000 + 50));
        const x = c.fx + (c.x - c.fx) * k, z = c.fz + (c.z - c.fz) * k, y0 = c.fromPin ? 2.2 : 0.8, y = (1 - k) * y0 + Math.sin(k * Math.PI) * 1.2 + 0.18;
        if (c.kind) {
          if (li >= 16) continue;
          m4.compose(v.set(x, y + 0.42, z), q.setFromEuler(e3.set(-0.6, Math.sin(t * 2 + id) * 0.4, 0)), sc.setScalar(1)); lolly.setMatrixAt(li, m4);
          m4.compose(v.set(x, y + 0.1, z), q.identity(), sc.setScalar(1)); sticks.setMatrixAt(li, m4); li++;
        } else {
          if (si >= MC) continue;
          const spin = id * 1.3 + (k < 1 ? t * 8 : 0);
          m4.compose(v.set(x, y, z), q.setFromEuler(e3.set(0, spin, 0)), sc.setScalar(1)); sweets.setMatrixAt(si, m4); sweets.setColorAt(si, col.set(CANDY_COLS[id % CANDY_COLS.length]));
          for (const sx of [-1, 1]) { m4.compose(v.set(x + Math.cos(spin) * sx * 0.38, y, z - Math.sin(spin) * sx * 0.38), q.setFromEuler(e3.set(0, spin + (sx < 0 ? Math.PI : 0), 0)), sc.setScalar(1)); wraps.setMatrixAt(wi, m4); wraps.setColorAt(wi, col.set(CANDY_COLS[(id + 2) % CANDY_COLS.length])); wi++; }
          si++;
        }
      }
      for (let i = si; i < MC; i++) sweets.setMatrixAt(i, zero);
      for (let i = wi; i < MC * 2; i++) wraps.setMatrixAt(i, zero);
      for (let i = li; i < 16; i++) { lolly.setMatrixAt(i, zero); sticks.setMatrixAt(i, zero); }
      for (const m of [sweets, wraps, lolly, sticks]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      // warning stripes: arrows slide the way the flock flies, pulsing faster as it nears
      for (const [id, list] of stripes) {
        const left = warnLeft.get(id) ?? 0, pulse = 0.45 + 0.35 * Math.abs(Math.sin(t * (4 + 10 / Math.max(0.3, left))));
        for (const s of list) { s.t.offset.x = -t * 1.6; s.mesh.material.opacity = pulse; }
      }
      // bats carried on from the last update, flapping, facing the camera
      const age = Math.min(0.12, (now - batAt) / 1000); let bi = 0;
      for (let i = 0; i + 2 < batBase.length && bi < MB; i += 3) {
        const code = batBase[i + 2], [dx, dz] = DIRS[code & 3], sp = init.batSpeed * (code & 4 ? 0.85 : 1);
        const x = batBase[i] + dx * sp * age, z = batBase[i + 1] + dz * sp * age, flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 14 + i));
        m4.compose(v.set(x, 1.15 + Math.sin(t * 6 + i) * 0.12, z), cq, sc.set(flap * 1.05, 0.9, 1)); batMesh.setMatrixAt(bi, m4);
        m4.compose(v.set(x, 0.04, z), q.identity(), sc.set(1.3, 1, 0.8)); shadows.setMatrixAt(bi++, m4);
      }
      for (let i = bi; i < MB; i++) { batMesh.setMatrixAt(i, zero); shadows.setMatrixAt(i, zero); }
      batMesh.instanceMatrix.needsUpdate = true; shadows.instanceMatrix.needsUpdate = true;
      // dizzy stars + blink while safe
      let st = 0;
      for (const p of ctx.players) {
        const fl = flags.get(p.pid) || 0, a = ctx.actor(p.pid), pos = ctx.pos(p.pid);
        if (a) a.body.group.visible = !(fl & F.GHOST) || (fl & F.STUN) || Math.floor(t * 10) % 2 === 0;
        if (pos && (fl & F.STUN) && (fl & F.GHOST)) for (let k = 0; k < 3 && st < stars.count; k++) { const an = t * 5 + k * 2.1; m4.compose(v.set(pos.x + Math.cos(an) * 0.45, (a?.height || 1.6) + 0.25, pos.z + Math.sin(an) * 0.45), cq, sc.setScalar(1)); stars.setMatrixAt(st++, m4); }
      }
      for (let i = st; i < stars.count; i++) stars.setMatrixAt(i, zero);
      stars.instanceMatrix.needsUpdate = true;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'bs-banner'; }
    },
    dispose() { sbar.el.remove(); tunes.dispose(); for (const id of [...stripes.keys()]) dropStripe(id); for (const t of texs) t.dispose(); },
  };
}
