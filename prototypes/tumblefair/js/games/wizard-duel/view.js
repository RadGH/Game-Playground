// WIZARD DUEL, as drawn: a round floating stone platform (a slab with a carved rune ring and a glowing star in the
// middle) over a deep blue sky with little floating islands below. Each wizard has a small orb circling them in the
// colour of the spell they hold. Spells: a pale-blue Zip Spark, an orange Big Ember with a blast ring, a frosty cone
// puff, a pink Bubble Ward around its caster, a green puff where a Hop Step starts and ends, a yellow Homing Wisp.
// A tag over each wizard shows their hearts and how full their zap meter is. A phone that plays has a spell bar under
// the score bar: the six spells, the one in hand lit up, each greying out while it cools down (B picks the next).
// Solo: straw practice wizards. Halloween: a purple slab with orange runes, the Ember is a little pumpkin, the Wisp
// is a ghost and the straw wizards wear pumpkins (the arena dressing adds dusk, bats and mist).
import { scoreBar, floatText, esc } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { pumpkinGeo, ghostGeo, faceTexture, witchHatGeo } from '../../client/halloween.js';
import { createJuice } from '../../client/juice.js';

const COL = ['#8fdcff', '#ff8a1a', '#c8f6ff', '#ff9af0', '#9dff6a', '#ffe76a'];
const ICON = ['⚡', '🔥', '❄️', '🫧', '💨', '✨'];
export function createView(ctx) {
  const { THREE, group, stage, players, meta, init } = ctx, R = meta.arena.r, HW = ctx.season === 'halloween';
  const juice = createJuice(ctx), name = pid => (pid === ctx.me ? 'You' : players.find(p => p.pid === pid)?.name || '?');
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  // ---- the platform, rune ring, sky islands
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.78, 1.4, 48), mat(HW ? '#6e5c98' : '#b9b3c9', { flatShading: true })); slab.position.y = -0.7; slab.receiveShadow = true; group.add(slab);
  const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.78, 3.4, 12), mat(HW ? '#2e2448' : '#8a8299', { flatShading: true })); under.rotation.x = Math.PI; under.position.y = -3.1; group.add(under);
  const runeMat = new THREE.MeshBasicMaterial({ color: HW ? '#ff8a1a' : '#7fd8ff', transparent: true, opacity: 0.6, depthWrite: false });
  for (const [a, b] of [[R - 0.75, R - 0.5], [3.1, 3.3]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 64).rotateX(-Math.PI / 2), runeMat); ring.position.y = 0.01; group.add(ring); }
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.45 : 1.1, a = i / 10 * Math.PI * 2; i ? starShape.lineTo(Math.sin(a) * r, Math.cos(a) * r) : starShape.moveTo(Math.sin(a) * r, Math.cos(a) * r); }
  const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape).rotateX(-Math.PI / 2), runeMat); star.position.y = 0.012; group.add(star);
  const glyphs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.02, 0.12), runeMat, 24), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; m4.compose(v3.set(Math.sin(a) * (R - 1.25), 0.015, Math.cos(a) * (R - 1.25)), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + (i % 3) * 0.6), s3); glyphs.setMatrixAt(i, m4); } group.add(glyphs);
  // the sky far below: a wide blue floor with clouds drifting over it, and little islands much further down
  const skyFloor = new THREE.Mesh(new THREE.CircleGeometry(90, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: HW ? '#2a1d4a' : '#7cc4f2' })); skyFloor.position.y = -30; group.add(skyFloor);
  const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: HW ? '#4a3a72' : '#ffffff', transparent: true, opacity: 0.85 }), 28);
  for (let i = 0; i < 28; i++) { const a = i * 2.39, r = 11 + (i * 5.7) % 24; m4.compose(v3.set(Math.sin(a) * r, -16 - (i % 4) * 2, Math.cos(a) * r), q.identity(), s3.set(2.4 + (i % 3), 0.9, 1.8 + (i % 2))); clouds.setMatrixAt(i, m4); } group.add(clouds);
  const isles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(HW ? '#3a2e58' : '#7cc95a', { flatShading: true }), 7);
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, r = 17 + (i * 4.1) % 12; m4.compose(v3.set(Math.sin(a) * r, -11 - (i % 3) * 3, Math.cos(a) * r), q.identity(), s3.set(1.4 + (i % 3) * 0.6, 0.7, 1.3 + (i % 2) * 0.5)); isles.setMatrixAt(i, m4); } group.add(isles);
  // ---- spells
  const sphere = new THREE.SphereGeometry(1, 14, 10), glow = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, toneMapped: false });
  const shotMat = COL.map(glow), pumpkin = HW ? pumpkinGeo(THREE, 0.42) : null, ghost = HW ? ghostGeo(THREE, 0.4) : null;
  const shotSize = [0.22, 0.42, 0.3, 0.3, 0.3, 0.3];
  const shots = new Map(), fx = [];
  function makeShot(k) {
    if (HW && k === 1) { const m = new THREE.Mesh(pumpkin, new THREE.MeshStandardMaterial({ color: '#ff7a14', emissive: '#ff5a00', emissiveIntensity: 0.8 })); return m; }
    if (HW && k === 5) return new THREE.Mesh(ghost, new THREE.MeshBasicMaterial({ color: '#f4f6ff', transparent: true, opacity: 0.9 }));
    const m = new THREE.Mesh(sphere, shotMat[k]); m.scale.setScalar(shotSize[k]); return m;
  }
  function ring(x, z, color, r0, r1, life = 0.5, y = 0.08) { const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, y, z); group.add(m); fx.push({ m, t: 0, life, r0, r1 }); }
  function puff(x, z, color, y = 0.9) { const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false })); m.position.set(x, y, z); group.add(m); fx.push({ m, t: 0, life: 0.4, r0: 0.2, r1: 0.9 }); }
  function cone(x, z, ax, az) { const m = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.4, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 1.7), new THREE.MeshBasicMaterial({ color: COL[2], transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })); m.position.set(x, 0.9, z); m.rotation.y = Math.atan2(ax, az); group.add(m); fx.push({ m, t: 0, life: 0.35, r0: 0.6, r1: 1 }); }
  // ---- per wizard: an orb in the spell's colour, a ward bubble
  const orbs = new Map(), bubbles = new Map();
  for (const p of players) {
    const o = new THREE.Mesh(sphere, shotMat[0].clone()); o.scale.setScalar(0.13); group.add(o); orbs.set(p.pid, o);
    const bub = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), new THREE.MeshBasicMaterial({ color: COL[3], transparent: true, opacity: 0.32, depthWrite: false })); bub.visible = false; group.add(bub); bubbles.set(p.pid, bub);
  }
  // ---- straw wizards (solo)
  const dummies = new Map(), straw = mat('#e8c25a'), robe = mat(HW ? '#6a32b8' : '#5d6fd8'), faceMat = HW ? new THREE.MeshBasicMaterial({ map: faceTexture(THREE), transparent: true, depthWrite: false, toneMapped: false }) : null;
  function dummy() {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 10), robe); body.position.y = 0.65; g.add(body);
    const head = HW ? new THREE.Mesh(pumpkinGeo(THREE, 0.32), mat('#ff7a14')) : new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), straw); head.position.y = 1.5; g.add(head);
    if (HW) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), faceMat); f.position.set(0, 1.48, 0.33); g.add(f); }
    const hat = new THREE.Mesh(HW ? witchHatGeo(THREE, 0.34) : new THREE.ConeGeometry(0.32, 0.6, 10), mat(HW ? '#2a1238' : '#3d3dbb')); hat.position.y = HW ? 1.72 : 1.95; g.add(hat);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
  }
  // ---- HUD: score bar, my spell bar, tags
  const bar = scoreBar(ctx, { unit: 'points' });
  const spellBar = document.createElement('div'); spellBar.className = 'wd-spells' + (ctx.me == null ? ' hidden' : '');
  spellBar.innerHTML = init.spells.map((s, i) => `<span class="wd-sp" data-i="${i}" style="--c:${COL[i]}"><b>${ICON[i]}</b><em>${esc(s.name)}</em><i></i></span>`).join('');
  ctx.ui.append(spellBar);
  const tags = new Map();
  let last = null; const flagsOf = new Map();
  return {
    halloween: { spots: [[-R - 2.5, -1.5, -2], [R + 2.5, -1.5, -2], [0, -1.5, -R - 3]], ghosts: [[-R - 3, 4, -R * 0.4], [R + 3, 4.4, -R * 0.5]], y: -1.4 },
    state(g) {
      last = g; bar.set(g.sc, g.left);
      const seen = new Set();
      for (const [id, k, x, z] of g.s) { seen.add(id); let m = shots.get(id); if (!m) { m = makeShot(k); m.position.set(x, 0.95, z); m.userData.to = new THREE.Vector3(x, 0.95, z); m.userData.k = k; group.add(m); shots.set(id, m); } m.userData.to.set(x, 0.95, z); }
      for (const [id, m] of shots) if (!seen.has(id)) { puff(m.position.x, m.position.z, COL[m.userData.k]); group.remove(m); shots.delete(id); }
      if (g.dm) { const s2 = new Set(); for (const [id, x, z, y] of g.dm) { s2.add(id); let d = dummies.get(id); if (!d) { d = dummy(); d.position.set(x, y, z); d.userData.pop = 0; group.add(d); dummies.set(id, d); } d.userData.to = [x, y, z]; } for (const [id, d] of dummies) if (!s2.has(id)) { group.remove(d); dummies.delete(id); } }
      for (const p of players) {
        let t = tags.get(p.pid); const a = ctx.actor(p.pid);
        if (!t && a) { t = stage.tag(a.group, { text: '', height: (a.height || 1.6) + 0.95, cls: 'wd-tag' }); tags.set(p.pid, t); }
        const h = g.lv[p.pid] ?? 0, z = g.zp?.[p.pid] ?? 0, txt = h <= 0 ? 'OUT' : `${'♥'.repeat(h)}${'♡'.repeat(Math.max(0, init.hearts - h))} ${z}%`;
        if (t && t.text !== txt) { t.set(txt); t.text = txt; t.el.classList.toggle('hot', z >= 60); t.el.classList.toggle('out', h <= 0); }
        bar.mark(p.pid, 'out', h <= 0);
        orbs.get(p.pid).material.color.set(COL[g.sp[p.pid] ?? 0]);
        bubbles.get(p.pid).visible = !!g.wd?.[p.pid];
      }
      if (ctx.me != null) { const mine = g.sp[ctx.me], cd = g.cd[ctx.me] || []; for (const el of spellBar.children) { const i = +el.dataset.i; el.classList.toggle('on', i === mine); el.classList.toggle('cool', cd[i] > 0); el.querySelector('i').style.width = cd[i] > 0 ? `${Math.min(100, cd[i] / init.spells[i].cool * 100)}%` : '0'; } }
    },
    event(ev) {
      const a = ev.pid != null ? ctx.actor(ev.pid) : null;
      if (ev.e === 'cast') { a?.play(ev.k === 'hop' ? 'jump' : 'throw', 380); if (ev.pid === ctx.me) ctx.sfx('throw'); }
      else if (ev.e === 'frost') cone(ev.x, ev.z, ev.ax, ev.az);
      else if (ev.e === 'ward') { ctx.sfx('pick'); }
      else if (ev.e === 'hop') { puff(ev.x0, ev.z0, COL[4], 0.5); puff(ev.x, ev.z, COL[4], 0.5); }
      else if (ev.e === 'boom') { ring(ev.x, ev.z, COL[1], 0.3, 2, 0.45); puff(ev.x, ev.z, '#ffd23f', 0.8); juice.shake(0.12, 0.25); ctx.sfx('hit'); }
      else if (ev.e === 'zap') { ctx.sfx('hit'); if (ev.pid === ctx.me) { juice.flash('rgba(143,220,255,.85)', 180); navigator.vibrate?.(30); } else if (ev.by === ctx.me) floatText(stage, ev.x, 1.6, ev.z, 'Zap!', 'good'); }
      else if (ev.e === 'bounce') { ring(ev.x, ev.z, COL[3], 0.3, 1.1, 0.3, 0.9); ctx.sfx('tap'); if (ev.pid === ctx.me) floatText(stage, ev.x, 1.8, ev.z, 'Bounced!', 'good'); }
      else if (ev.e === 'heart') {
        ctx.sfx(ev.how === 'fall' ? 'out' : 'bad');
        const x = Math.max(-R, Math.min(R, ev.x)), z = Math.max(-R, Math.min(R, ev.z));
        floatText(stage, x, 1.2, z, ev.by >= 0 ? `${name(ev.by)} +1${ev.hearts <= 0 ? ' KO!' : ''}` : ev.how === 'fall' ? 'Whoops!' : 'Pop!', ev.by === ctx.me ? 'good' : ev.pid === ctx.me ? 'bad' : '');
        if (ev.pid === ctx.me) { juice.flash('rgba(232,57,74,.8)', 260); juice.say(ev.hearts > 0 ? `${ev.hearts} ${ev.hearts === 1 ? 'heart' : 'hearts'} left` : 'Out of hearts!', 1400, 'small'); }
        else if (ev.hearts <= 0) juice.say(`${name(ev.pid)} is out!`, 1200, 'small');
      }
      else if (ev.e === 'thwack') { ctx.sfx('hit'); floatText(stage, ev.x, 1.6, ev.z, '+1', 'good'); }
      else if (ev.e === 'pop') { ctx.sfx('good'); floatText(stage, Math.max(-R, Math.min(R, ev.x)), 1.2, Math.max(-R, Math.min(R, ev.z)), '+2', 'good'); }
      else if (ev.e === 'pick' && ev.pid === ctx.me) ctx.sfx('tap');
    },
    pose(pid, flags, b) { flagsOf.set(pid, flags); if (flags & F.STUN || b.y < -0.05) return 'hit'; return undefined; },
    frame(dt, t) {
      const k = 1 - Math.exp(-dt * 18);
      for (const m of shots.values()) { m.position.lerp(m.userData.to, k); m.rotation.y += dt * 6; }
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const u = f.t / f.life; if (u >= 1) { group.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); continue; } f.m.scale.setScalar(f.r0 + (f.r1 - f.r0) * u); f.m.material.opacity = 0.9 * (1 - u); }
      for (const d of dummies.values()) { const [x, y, z] = d.userData.to; d.position.x += (x - d.position.x) * k; d.position.y += (y - d.position.y) * k; d.position.z += (z - d.position.z) * k; d.userData.pop = Math.min(1, d.userData.pop + dt * 3); d.scale.setScalar(Math.sin(d.userData.pop * Math.PI / 2)); d.rotation.y = Math.sin(t * 2 + x) * 0.3; }
      for (const p of players) {
        const pos = ctx.pos(p.pid), o = orbs.get(p.pid), bub = bubbles.get(p.pid), f = flagsOf.get(p.pid) || 0;
        if (!pos) continue;
        const a = t * 3 + p.seat * 1.6; o.position.set(pos.x + Math.sin(a) * 0.7, (pos.y || 0) + 1.25 + Math.sin(t * 5 + p.seat) * 0.1, pos.z + Math.cos(a) * 0.7); o.visible = !(f & F.OUT);
        bub.position.set(pos.x, (pos.y || 0) + 0.85, pos.z); bub.scale.setScalar(1 + Math.sin(t * 9) * 0.04);
        const act = ctx.actor(p.pid); if (act) act.body.group.visible = !(f & F.GHOST) || Math.floor(t * 10) % 2 === 0;
      }
      juice.frame(dt, t);
    },
    dispose() { bar.el.remove(); spellBar.remove(); for (const t of tags.values()) t.remove(); juice.dispose(); },
  };
}
