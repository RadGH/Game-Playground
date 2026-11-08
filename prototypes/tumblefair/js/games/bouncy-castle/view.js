// BOUNCY CASTLE, as drawn: a raised striped bouncy floor (red and yellow) with fat puffy rolls round its edge and a
// puffy turret with a pennant at each corner, on a green lawn. A landing sends a ring rippling out across the floor
// and the floor sags for a moment; a flung player tumbles, and anyone who flies off flops onto the grass below.
// Each bouncer has a soft shadow under them, so you can see who is up in the air. Bop-bag clowns (alone or two
// players) are round red-and-white wobblers with a painted grin.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { createJuice } from '../../client/juice.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, arena: AR, init } = ctx, WN = ctx.season === 'winter', HW = ctx.season === 'halloween';
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.2 }), juice = createJuice(ctx);
  const G = RULES.ground, C1 = HW ? '#ff8a1f' : WN ? '#e8394a' : '#e8394a', C2 = HW ? '#7a3cff' : WN ? '#ffffff' : '#ffd23f';

  // ---- lawn and the castle
  mesh(geo(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2)), std(WN ? '#eef5fc' : '#6fbf5a', { roughness: 1 }), 0, G - 0.02, 0).castShadow = false;
  const W = AR.hw * 2, D = AR.hd * 2;
  const base = mesh(geo(new THREE.BoxGeometry(W + 0.3, -G - 0.45, D + 0.3)), std(C2, { roughness: 0.5 }), 0, (G - 0.45) / 2, 0)   // top 0.45 under the floor: the floor sags without poking through;
  const stripes = tex(canvasTexture(256, 256, (c, w) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? C2 : C1; c.fillRect(i * 32, 0, 32, w); } c.fillStyle = 'rgba(255,255,255,.18)'; for (let y = 0; y < w; y += 64) c.fillRect(0, y, w, 4); }));
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping; stripes.repeat.set(2, 1);
  const floor = mesh(geo(new THREE.PlaneGeometry(W, D, 24, 18).rotateX(-Math.PI / 2)), std('#ffffff', { map: stripes, roughness: 0.35 }), 0, 0.01, 0);
  floor.castShadow = false;
  const fpos = floor.geometry.attributes.position, fbase = Float32Array.from(fpos.array);
  // puffy rolls round the edge (instanced), and a turret in each corner
  const rolls = [], STEP = 0.9;
  for (const sz of [-1, 1]) for (let x = -AR.hw + STEP / 2; x < AR.hw; x += STEP) rolls.push([x, sz * (AR.hd + 0.15), 0]);
  for (const sx of [-1, 1]) for (let z = -AR.hd + STEP / 2; z < AR.hd; z += STEP) rolls.push([sx * (AR.hw + 0.15), z, Math.PI / 2]);
  const roll = new THREE.InstancedMesh(geo(new THREE.CapsuleGeometry(0.2, STEP - 0.3, 4, 10).rotateZ(Math.PI / 2)), std('#ffffff', { roughness: 0.45 }), rolls.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  rolls.forEach(([x, z, r], i) => { m4.compose(v3.set(x, 0.12, z), q.setFromEuler(e3.set(0, r, 0)), s3.set(1, 1, 1)); roll.setMatrixAt(i, m4); roll.setColorAt(i, col.set(i % 2 ? C1 : C2)); });
  roll.castShadow = true; group.add(roll);
  const flagMat = std('#3d8bff', { side: THREE.DoubleSide }), towers = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (AR.hw + 0.35), z = sz * (AR.hd + 0.35);
    mesh(geo(new THREE.CylinderGeometry(0.62, 0.7, 2.4, 14)), std(C1), x, G + 1.2 + 0.9, z);
    mesh(geo(new THREE.TorusGeometry(0.66, 0.16, 8, 18).rotateX(Math.PI / 2)), std(C2), x, 1.3, z);
    const cap = mesh(geo(new THREE.SphereGeometry(0.66, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), std(C2), x, 1.38, z);
    mesh(geo(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5)), std('#ffffff'), x, 2.4, z);
    const flag = mesh(geo(new THREE.PlaneGeometry(0.55, 0.32)), flagMat, x + 0.28, 2.75, z); flag.castShadow = false;
    towers.push({ cap, flag, ph: towers.length });
  }

  // ---- shadows under bouncers, landing ripples
  const shGeo = geo(new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2)), shMat = basic({ color: '#1a1020', transparent: true, opacity: 0.35, depthWrite: false });
  const shadows = new Map();
  const shadowFor = id => { let s = shadows.get(id); if (!s) { s = new THREE.Mesh(shGeo, shMat); s.renderOrder = 2; group.add(s); shadows.set(id, s); } return s; };
  const ringGeo = geo(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2)), ripples = [];
  const dips = [];       // floor sag: [x, z, t]

  // ---- bop-bag clowns
  const bags = new Map();
  const bagFace = tex(canvasTexture(128, 128, (c, w) => {
    c.fillStyle = '#fff6ea'; c.fillRect(0, 0, w, w);
    c.fillStyle = '#1d1f24'; for (const x of [44, 84]) { c.beginPath(); c.arc(x, 52, 8, 0, 7); c.fill(); }
    c.fillStyle = '#e8394a'; c.beginPath(); c.arc(64, 70, 11, 0, 7); c.fill();
    c.strokeStyle = '#1d1f24'; c.lineWidth = 6; c.beginPath(); c.arc(64, 78, 26, 0.2, Math.PI - 0.2); c.stroke();
  }));
  const bagBody = std('#e8394a', { roughness: 0.4 }), bagHead = std('#ffffff', { map: bagFace, roughness: 0.5 }), bagTags = [];
  for (const t of init.bags || []) {
    const g = new THREE.Group(); group.add(g);
    const wob = new THREE.Group(); g.add(wob);
    mesh(geo(new THREE.SphereGeometry(0.55, 16, 12)), bagBody, 0, 0.55, 0, wob).scale.set(1, 0.9, 1);
    mesh(geo(new THREE.CylinderGeometry(0.3, 0.48, 0.6, 14)), std('#ffffff'), 0, 1.15, 0, wob);
    const head = mesh(geo(new THREE.SphereGeometry(0.38, 16, 12)), bagHead, 0, 1.65, 0, wob); head.rotation.y = -Math.PI / 2;
    mesh(geo(new THREE.ConeGeometry(0.22, 0.5, 10)), std('#3d8bff'), 0, 2.15, 0, wob);
    bags.set(t.id, { g, wob, cur: null, to: null, hit: 0 });
    bagTags.push(stage.tag(g, { text: t.name, height: 2.7, cls: 'bc-cpu' }));
  }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' }), pill = h('div', 'bc-pill'), banner = h('div', 'bc-banner');
  pill.innerHTML = `<span><b>A</b> Bounce</span><span><b>B</b> Bump</span><span>Fling off <b>+3</b></span>`;
  ctx.ui.append(pill, banner);
  let bannerT = 0;
  const show = (text, cls = '', ms = 1000) => { banner.textContent = text; banner.className = 'bc-banner show ' + cls; bannerT = ms / 1000; };
  const nameOf = id => id < 0 ? ((init.bags || []).find(b => b.id === id)?.name || 'Bop-bag') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => { if (id < 0) return bags.get(id)?.cur; const p = ctx.pos(id); return p ? { x: p.x, z: p.z } : null; };
  let started = false;

  return {
    halloween: { y: G, spots: [[-AR.hw - 2.5, G, 0], [AR.hw + 2.5, G, 0], [0, G, -AR.hd - 2.5]] },
    winter: { y: G },
    state(g) {
      bar.set(g.sc, g.left);
      pill.classList.toggle('mega', !!g.mega);
      for (const row of g.tg || []) { const B = bags.get(row[0]); if (!B) continue; const to = { x: row[1], z: row[2], y: row[3], flags: row[4] }; if (!B.cur) B.cur = { ...to }; B.to = to; }
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start('boogie'); }
      if (g.left <= 0 && tunes.playing) tunes.stop(false);
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('BOUNCE!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'mega') { show('MEGA BOUNCE!', 'go small', 1500); ctx.sfx('trap'); juice.flash('rgba(255,210,63,.7)', 250); }
      else if (ev.e === 'jump') { tunes.fx('boing', 0.8 + Math.random() * 0.3); }
      else if (ev.e === 'land') {
        tunes.fx('boing', ev.mega ? 0.55 : 0.7); ctx.sfx('hit');
        const r = new THREE.Mesh(ringGeo, basic({ color: ev.mega ? '#ffd23f' : '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })); r.position.set(ev.x, 0.06, ev.z); r.renderOrder = 3; group.add(r);
        ripples.push({ r, t: 0, R: ev.r }); dips.push([ev.x, ev.z, 0]); juice.shake(ev.mega ? 0.14 : 0.08, 0.25);
      } else if (ev.e === 'flung') {
        if (ev.id === ctx.me) { juice.flash('rgba(232,57,74,.75)', 200); navigator.vibrate?.(50); }
        const B = bags.get(ev.id); if (B) B.hit = 1;
      } else if (ev.e === 'bump') { ctx.sfx(ev.hit != null ? 'hit' : 'throw'); if (ev.hit != null) { const B = bags.get(ev.hit); if (B) B.hit = 1; } }
      else if (ev.e === 'off') {
        ctx.sfx('splat'); tunes.fx('honk', 0.9);
        if (ev.by != null) floatText(stage, ev.x, 1.2, ev.z, `+${RULES.pts.off} ${nameOf(ev.by)}!`, ev.by === ctx.me ? 'good' : '');
        else if (ev.id > 0) floatText(stage, ev.x, 1.2, ev.z, `${RULES.pts.fall}`, ev.id === ctx.me ? 'bad' : '');
        if (ev.by === ctx.me) show(ev.id < 0 ? 'BOP!' : 'FLUNG OFF!', 'go small', 900);
        if (ev.id === ctx.me) show('Whoops!', 'small', 900);
      } else if (ev.e === 'back') { if (ev.id === ctx.me) ctx.sfx('pick'); }
      else if (ev.e === 'end') {
        show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false);
      }
    },
    pose(pid, flags, b) {
      if (flags & F.OUT) return 'sitGround';
      if (flags & F.STUN) return 'hit';
      if ((flags & F.AIR) || (b && b.y > 0.15)) return 'jump';
      return null;
    },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      // the floor: a gentle idle wobble plus a sag where someone just landed
      for (let i = 0; i < dips.length; i++) dips[i][2] += dt;
      while (dips.length && dips[0][2] > 0.7) dips.shift();
      const arr = fpos.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = fbase[i], z = fbase[i + 2];
        let y = Math.sin(t * 3 + x * 0.6 + z * 0.4) * 0.03;
        for (const [dx, dz, dt2] of dips) { const d = Math.hypot(x - dx, z - dz), k = Math.max(0, 1 - d / 3.2); y -= k * k * 0.35 * Math.max(0, 1 - dt2 / 0.7) * Math.cos(dt2 * 9); }
        arr[i + 1] = y;
      }
      fpos.needsUpdate = true;
      for (let i = ripples.length - 1; i >= 0; i--) { const R = ripples[i]; R.t += dt; R.r.scale.setScalar(0.3 + R.R * Math.min(1, R.t / 0.35)); R.r.material.opacity = Math.max(0, 0.9 - R.t * 1.8); if (R.t > 0.5) { group.remove(R.r); R.r.material.dispose(); ripples.splice(i, 1); } }
      for (const T of towers) { T.cap.scale.set(1 + Math.sin(t * 4 + T.ph) * 0.03, 1 + Math.sin(t * 4 + T.ph + 1) * 0.05, 1); T.flag.rotation.y = Math.sin(t * 6 + T.ph) * 0.4; }
      // shadows under every player and bag (hidden while flopped on the grass)
      for (const p of ctx.players) {
        const pos = ctx.pos(p.pid), sh = shadowFor(p.pid); if (!pos) { sh.visible = false; continue; }
        sh.visible = pos.y > -0.3; sh.position.set(pos.x, 0.04, pos.z); const k = 1 / (1 + Math.max(0, pos.y) * 0.5); sh.scale.setScalar(k);
      }
      for (const [id, B] of bags) {
        if (!B.to) continue; const k = 1 - Math.exp(-dt * 14), c = B.cur, to = B.to;
        c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; c.y += (to.y - c.y) * k;
        if (Math.hypot(to.x - c.x, to.z - c.z) > 3) { c.x = to.x; c.z = to.z; c.y = to.y; }
        B.g.position.set(c.x, c.y, c.z);
        B.hit = Math.max(0, B.hit - dt * 1.5);
        B.wob.rotation.z = Math.sin(t * 9) * 0.5 * B.hit + Math.sin(t * 2 + id) * 0.06; B.wob.rotation.x = Math.cos(t * 7) * 0.35 * B.hit;
        const sh = shadowFor(id); sh.visible = c.y > -0.3; sh.position.set(c.x, 0.04, c.z);
      }
      juice.frame(dt, t);
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const t2 of bagTags) t2.remove();
      for (const R of ripples) R.r.material.dispose();
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
