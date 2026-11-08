// SEESAW SHOVE, as drawn: one long waxed plank with red-and-white painted ends, balanced on a striped barrel in the
// middle of a duck pond with lily pads. The plank tips by the sim's angle (every screen the same), so whoever stands
// on the low end can SEE they are going downhill; arrows painted under the plank glow on the downhill side. Barrels
// roll along it, a fat seagull lands on one end now and then, and anyone who slips in sits in the pond up to their
// middle until they paddle back.
import { RULES, plankY } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { createJuice } from '../../client/juice.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, arena: AR } = ctx, WN = ctx.season === 'winter';
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.2 }), juice = createJuice(ctx);
  const W = RULES.water + 0.1;

  // ---- the pond, its bank, lily pads and a couple of ducks
  mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std(WN ? '#eef5fc' : '#6fbf5a', { roughness: 1 }), 0, W + 0.05, 0).castShadow = false;
  const pond = mesh(geo(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)), std(WN ? '#9fd6f2' : '#3aa7d8', { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }), 0, W + 0.08, 0);
  pond.scale.set(AR.hw + 3.2, 1, AR.hd + 4.5); pond.castShadow = false;
  const pads = new THREE.InstancedMesh(geo(new THREE.CircleGeometry(0.5, 12, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2)), std('#4fae4a'), 9);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  [[-7.6, 3.6], [-5, -4.6], [-1.5, 4.8], [2.4, -4.9], [5.6, 4.2], [8, -2.4], [-8.4, -1.6], [8.3, 2.1], [0.6, -5.6]].forEach(([x, z], i) => { m4.compose(v3.set(x, W + 0.1, z), q.setFromEuler(e3.set(0, i * 1.3, 0)), s3.setScalar(0.8 + (i % 3) * 0.2)); pads.setMatrixAt(i, m4); });
  group.add(pads);
  const ducks = [];
  for (const [x, z] of [[-6.5, -3.4], [6.8, 3.4]]) {
    const d = new THREE.Group(); d.position.set(x, W + 0.12, z); group.add(d);
    mesh(geo(new THREE.SphereGeometry(0.32, 12, 8)), std('#ffd23f'), 0, 0.12, 0, d).scale.set(1.3, 0.8, 1);
    mesh(geo(new THREE.SphereGeometry(0.2, 10, 8)), std('#ffd23f'), 0.25, 0.42, 0, d);
    mesh(geo(new THREE.ConeGeometry(0.08, 0.2, 6).rotateZ(-Math.PI / 2)), std('#ff8a1f'), 0.5, 0.4, 0, d);
    ducks.push(d);
  }
  // ---- the pivot barrel and its stand
  const pivotTex = tex(canvasTexture(128, 64, (c, w, hh) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#3d8bff'; c.fillRect(i * 16, 0, 16, hh); } }));
  mesh(geo(new THREE.CylinderGeometry(0.55, 0.55, AR.hd * 2 + 0.6, 20).rotateX(Math.PI / 2)), std('#ffffff', { map: pivotTex }), 0, -0.55, 0);
  mesh(geo(new THREE.BoxGeometry(1.4, -W - 0.6, AR.hd * 2 + 0.2)), std('#8a5a32'), 0, (W - 0.6) / 2 - 0.3, 0);
  // ---- the plank (rotates as one piece)
  const plank = new THREE.Group(); group.add(plank);
  const wood = tex(canvasTexture(512, 64, (c, w, hh) => {
    c.fillStyle = '#d9a35e'; c.fillRect(0, 0, w, hh);
    c.strokeStyle = 'rgba(110,60,20,.35)'; c.lineWidth = 2; for (let y = 8; y < hh; y += 16) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * 0.05 + y) * 2); c.stroke(); }
    for (const x0 of [0, w - 40]) for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#ffffff' : '#e8394a'; c.fillRect(x0 + k * 10, 0, 10, hh); }
  }));
  const plankMat = std('#ffffff', { map: wood, roughness: 0.3 });
  mesh(geo(new THREE.BoxGeometry(AR.hw * 2 + 0.3, 0.26, AR.hd * 2 + 0.1)), plankMat, 0, -0.13, 0, plank);
  // downhill arrows painted on the plank: they light up on the low side
  const arrowTex = tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(14, 12); c.lineTo(50, 32); c.lineTo(14, 52); c.lineTo(24, 32); c.closePath(); c.fill(); }));
  const arrows = [];
  for (const side of [-1, 1]) for (const x of [2.2, 3.8, 5.2]) {
    const m = basic({ map: arrowTex, transparent: true, opacity: 0, depthWrite: false, color: '#ffe066' });
    const a = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2)), m); a.position.set(side * x, 0.015, 0); if (side < 0) a.rotation.y = Math.PI; a.renderOrder = 2; plank.add(a); arrows.push({ a, m, side });
  }
  // ---- barrels (a small pool), the seagull
  const barrelTex = tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = '#9b5a2a'; c.fillRect(0, 0, w, w); c.fillStyle = '#5b5f66'; c.fillRect(0, 8, w, 6); c.fillRect(0, 50, w, 6); c.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < w; x += 10) c.fillRect(x, 0, 2, w); }));
  const barrelGeo = geo(new THREE.CylinderGeometry(RULES.barrel.r, RULES.barrel.r, 0.8, 14).rotateX(Math.PI / 2)), barrelMat = std('#ffffff', { map: barrelTex });
  const barrels = new Map();
  const gull = new THREE.Group(); gull.visible = false; group.add(gull);
  mesh(geo(new THREE.SphereGeometry(0.5, 14, 10)), std('#ffffff'), 0, 0.6, 0, gull).scale.set(1.3, 1, 1);
  mesh(geo(new THREE.SphereGeometry(0.3, 12, 8)), std('#ffffff'), 0.55, 1.05, 0, gull);
  mesh(geo(new THREE.ConeGeometry(0.1, 0.4, 6).rotateZ(-Math.PI / 2)), std('#ffb02e'), 0.95, 1.0, 0, gull);
  for (const z of [-0.12, 0.12]) mesh(geo(new THREE.SphereGeometry(0.05, 6, 6)), std('#1d1f24'), 0.75, 1.15, z, gull);
  const wings = [-1, 1].map(s => { const w = mesh(geo(new THREE.BoxGeometry(0.7, 0.06, 0.5)), std('#c9d0d8'), -0.1, 0.8, s * 0.5, gull); return w; });
  let gullSide = 0, gullT = 0;
  // ---- splashes
  const ringGeo = geo(new THREE.RingGeometry(0.7, 1, 32).rotateX(-Math.PI / 2)), splashes = [];
  const splash = (x, z, big = 1) => { const r = new THREE.Mesh(ringGeo, basic({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })); r.position.set(x, W + 0.12, z); group.add(r); splashes.push({ r, t: 0, big }); };

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' }), pill = h('div', 'ss-pill'), banner = h('div', 'ss-banner');
  pill.innerHTML = `<i class="ss-level" aria-label="how the seesaw tips"><s></s></i><span><b>A</b> Shove</span><span><b>B</b> Hop</span><span>Splash <b>+3</b></span>`;
  ctx.ui.append(pill, banner);
  const level = pill.querySelector('.ss-level s');
  let bannerT = 0, th = 0, thTo = 0, started = false;
  const show = (text, cls = '', ms = 1000) => { banner.textContent = text; banner.className = 'ss-banner show ' + cls; bannerT = ms / 1000; };
  const nameOf = id => id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';

  return {
    halloween: { y: W, spots: [[-AR.hw - 4, W, 3], [AR.hw + 4, W, -3]], mist: false },
    winter: { y: W },
    state(g) {
      bar.set(g.sc, g.left); thTo = g.th || 0;
      const seen = new Set();
      for (const [id, x, z, rot] of g.bl || []) {
        seen.add(id); let B = barrels.get(id);
        if (!B) { B = { m: mesh(barrelGeo, barrelMat, x, 0, z), cur: { x, rot }, to: null }; barrels.set(id, B); }
        B.to = { x, z, rot };
      }
      for (const [id, B] of barrels) if (!seen.has(id)) { group.remove(B.m); barrels.delete(id); }
      if ((g.gl || 0) !== gullSide) { gullSide = g.gl || 0; gullT = 0; if (gullSide) gull.visible = true; }
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start('jig'); }
      if (g.left <= 0 && tunes.playing) tunes.stop(false);
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('STAY DRY!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'shove') { ctx.sfx(ev.hit != null ? 'hit' : 'throw'); if (ev.hit === ctx.me) { juice.flash('rgba(232,57,74,.7)', 180); navigator.vibrate?.(40); } }
      else if (ev.e === 'hop') { tunes.fx('boing', 1.2); }
      else if (ev.e === 'launch') { tunes.fx('boing', 0.6); if (ev.pid === ctx.me) show('CATAPULT!', 'go small', 900); else { const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, p.y + 2, p.z, 'WHEEE!', ''); } }
      else if (ev.e === 'splash') {
        ctx.sfx('splat'); splash(ev.x, ev.z, 1.6); juice.shake(0.06, 0.2);
        if (ev.by != null) floatText(stage, ev.x, 0.6, ev.z, `+${RULES.pts.off} ${nameOf(ev.by)}!`, ev.by === ctx.me ? 'good' : '');
        if (ev.by === ctx.me) show('SPLASH!', 'go small', 900);
        if (ev.pid === ctx.me) show('Sploosh!', 'small', 900);
      } else if (ev.e === 'plop') { ctx.sfx('splat'); splash(ev.x, ev.z, 1.1); }
      else if (ev.e === 'bonk') { tunes.fx('knock', 1); if (ev.pid === ctx.me) show('BONK!', 'small', 700); }
      else if (ev.e === 'barrel') { tunes.fx('knock', 0.7); }
      else if (ev.e === 'gull') { tunes.fx('honk', 1.4); show('Seagull!', 'small', 1100); }
      else if (ev.e === 'end') { show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false); }
    },
    pose(pid, flags, b) {
      if (flags & F.OUT) return 'sitGround';
      if (flags & F.STUN) return 'hit';
      if (flags & F.AIR) return 'jump';
      return null;
    },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      th += (thTo - th) * (1 - Math.exp(-dt * 16));
      plank.rotation.z = -th;
      level.style.transform = `rotate(${(th * 2.4 * 180 / Math.PI).toFixed(1)}deg)`;     // the little seesaw in the pill, tipped further so it reads
      for (const A of arrows) A.m.opacity = Math.max(0, Math.min(0.9, (A.side * th - 0.03) * 8)) * (0.7 + 0.3 * Math.sin(t * 8));
      for (const B of barrels.values()) {
        if (!B.to) continue; const k = 1 - Math.exp(-dt * 16);
        B.cur.x += (B.to.x - B.cur.x) * k; B.cur.rot += (B.to.rot - B.cur.rot) * k;
        B.m.position.set(B.cur.x, plankY(B.cur.x, th) + RULES.barrel.r, B.to.z); B.m.rotation.set(0, 0, -B.cur.rot - th);
      }
      if (gullSide) {
        gullT = Math.min(1, gullT + dt * 2.5); const x = gullSide * RULES.gull.x;
        gull.position.set(x, plankY(x, th) + (1 - gullT) * 3, 0); gull.rotation.set(0, gullSide > 0 ? Math.PI : 0, -th * (gullSide > 0 ? -1 : 1));
        for (const [i, w] of wings.entries()) w.rotation.x = (i ? -1 : 1) * (gullT < 1 ? Math.sin(t * 30) * 0.8 : 0.1);
      } else if (gull.visible) { gull.position.y += dt * 4; for (const [i, w] of wings.entries()) w.rotation.x = (i ? -1 : 1) * Math.sin(t * 30) * 0.8; if (gull.position.y > 6) gull.visible = false; }
      for (const [i, d] of ducks.entries()) { d.position.x += Math.sin(t * 0.4 + i * 3) * dt * 0.3; d.rotation.y = Math.sin(t * 0.4 + i * 3) > 0 ? 0 : Math.PI; d.position.y = W + 0.12 + Math.sin(t * 2 + i) * 0.03; }
      for (let i = splashes.length - 1; i >= 0; i--) { const S = splashes[i]; S.t += dt; S.r.scale.setScalar(0.3 + S.big * S.t * 2.2); S.r.material.opacity = Math.max(0, 0.9 - S.t * 1.4); if (S.t > 0.65) { group.remove(S.r); S.r.material.dispose(); splashes.splice(i, 1); } }
      juice.frame(dt, t);
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const S of splashes) S.r.material.dispose();
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
