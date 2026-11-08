// BALLOON BARON, as drawn: a fair lawn with a big painted target on it, bunting on posts round the edge (instanced),
// and two red-and-white striped DART BUCKETS at the front corners, darts poking out, each with a "DARTS" tag and a
// ring on the grass. The Baron is a tall striped purple-and-gold balloon man with a red top hat, goggly eyes, a curly
// black moustache and little waving arms; a ring of bright crown balloons on strings circles his middle (one
// instanced mesh). He squats before a bounce (the landing ring fills up), sails through the air and lands with a
// thump; for a PUFF he swells up while a pale-blue wedge glows in front of him. Popped: he sags into a flat puddle with
// a dazed face and you can bounce on him. Darts fly as small instanced cones. HUD (boss kit): health bar, a row with
// the team hearts, YOUR darts (dots + a number) and the balloons left, and what to do now.
import { RULES } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const BALLOON = ['#ff3b5c', '#ffd23f', '#3db4ff', '#58d26b', '#ff8a3d', '#b48cff', '#ff6fb5', '#2ee6c8'];
export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena;
  const K = bossKit(ctx, { name: 'Balloon Baron', color: 'linear-gradient(#c58cff, #7a3fd1)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const texs = [], tags = [];
  const tex = t => { texs.push(t); return t; };

  // ---- the lawn, a painted target, bunting round the edge
  mesh(keep(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#7cc35f', { roughness: 1 }), 0, -0.03, 0).receiveShadow = true;
  mesh(keep(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2)), std('#9bd979', { roughness: 1 }), 0, 0, 0).receiveShadow = true;
  for (const [r, c] of [[4.2, '#ffffff'], [3.2, '#ff6f91'], [2.2, '#ffffff'], [1.2, '#ff6f91']]) mesh(keep(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2)), basic(c, { opacity: 0.35 }), 0, 0.01, -0.5);
  const posts = []; for (let x = -hw; x <= hw + 0.01; x += hw / 3) { posts.push([x, -hd - 0.4]); posts.push([x, hd + 0.5]); } for (const z of [-hd / 3, hd / 3]) { posts.push([-hw - 0.4, z]); posts.push([hw + 0.4, z]); }
  const postMesh = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6)), std('#ffffff'), posts.length);
  posts.forEach(([x, z], i) => { m4.compose(v3.set(x, 1.1, z), q.identity(), sc.set(1, 1, 1)); postMesh.setMatrixAt(i, m4); }); group.add(postMesh);
  const flags = []; const addRun = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), k = Math.max(2, Math.round(L / 0.55)); for (let i = 1; i < k; i++) { const t = i / k; flags.push([ax + (bx - ax) * t, 2.0 - Math.sin(t * Math.PI) * 0.35, az + (bz - az) * t, Math.atan2(bx - ax, bz - az)]); } };
  for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) { const [ax, az] = posts[i], [bx, bz] = posts[j]; if (Math.hypot(ax - bx, az - bz) < hw / 3 + 0.1 && (Math.abs(az - bz) < 0.01 || Math.abs(ax - bx) < 0.01)) addRun(ax, az, bx, bz); }
  const flagMesh = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(0.2, 0.36, 3).rotateX(Math.PI)), std('#ffffff', { side: THREE.DoubleSide }), flags.length);
  flags.forEach(([x, y, z, a], i) => { m4.compose(v3.set(x, y, z), q.setFromEuler(e3.set(0, a + Math.PI / 2, 0)), sc.set(1, 1, 0.15)); flagMesh.setMatrixAt(i, m4); flagMesh.setColorAt(i, col.set(BALLOON[i % BALLOON.length])); });
  group.add(flagMesh);

  // ---- dart buckets
  const stripeTex = tex(canvasTexture(128, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8394a'; c.fillRect(i * 16, 0, 16, h); } }));
  const dartGeo = keep(new THREE.ConeGeometry(0.06, 0.5, 6)), finGeo = keep(new THREE.BoxGeometry(0.18, 0.12, 0.02));
  for (const k of RULES.buckets) {
    const g = new THREE.Group(); g.position.set(k.x, 0, k.z); group.add(g);
    mesh(keep(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 16, 1, true)), std('#ffffff', { map: stripeTex, side: THREE.DoubleSide }), 0, 0.35, 0, g).castShadow = true;
    for (let i = 0; i < 5; i++) { const a = i * 1.3; const d = mesh(dartGeo, std('#555'), Math.sin(a) * 0.2, 0.85, Math.cos(a) * 0.2, g); d.rotation.set(0.25 * Math.cos(a), 0, -0.25 * Math.sin(a)); mesh(finGeo, std(BALLOON[i]), d.position.x, 0.62, d.position.z, g); }
    mesh(keep(new THREE.RingGeometry(RULES.bucketR - 0.12, RULES.bucketR, 32).rotateX(-Math.PI / 2)), basic('#ffd23f', { opacity: 0.8 }), 0, 0.02, 0, g);
    tags.push(stage.tag(g, { text: '🎯 DARTS', height: 1.3, cls: 'bb-bucket' }));
  }

  // ---- the Baron (built facing +z)
  const Bg = new THREE.Group(); group.add(Bg);
  const puffy = new THREE.Group(); Bg.add(puffy);                  // squash and stretch lives here
  const bodyTex = tex(canvasTexture(256, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffd23f' : '#8a4fe0'; c.fillRect(i * 32, 0, 32, h); } }));
  const sph = keep(new THREE.SphereGeometry(1, 24, 16));
  const body = mesh(sph, std('#ffffff', { map: bodyTex, roughness: 0.35 }), 0, 1.75, 0, puffy); body.scale.set(1.35, 1.7, 1.25);
  mesh(keep(new THREE.ConeGeometry(0.25, 0.35, 10).rotateX(Math.PI)), std('#8a4fe0', { roughness: 0.4 }), 0, 0.12, 0, puffy);
  const eyeW = std('#ffffff', { roughness: 0.3 }), eyeB = std('#1a1a1a');
  const pupils = [-1, 1].map(sx => { mesh(sph, eyeW, sx * 0.38, 2.6, 1.02, puffy).scale.set(0.28, 0.32, 0.18); const p = mesh(sph, eyeB, sx * 0.38, 2.58, 1.17, puffy); p.scale.setScalar(0.12); return p; });
  const tash = std('#1a1a1a', { roughness: 0.5 });
  for (const sx of [-1, 1]) { const t = mesh(keep(new THREE.TorusGeometry(0.22, 0.07, 8, 16, Math.PI * 1.4)), tash, sx * 0.25, 2.15, 1.2, puffy); t.rotation.set(0, 0, sx > 0 ? -0.4 : Math.PI + 0.4); }
  const hat = new THREE.Group(); hat.position.set(0, 3.4, 0); puffy.add(hat);
  mesh(keep(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 20)), std('#c8202f'), 0, 0, 0, hat);
  mesh(keep(new THREE.CylinderGeometry(0.48, 0.5, 0.85, 20)), std('#c8202f'), 0, 0.45, 0, hat);
  mesh(keep(new THREE.CylinderGeometry(0.51, 0.51, 0.16, 20)), std('#ffd23f'), 0, 0.18, 0, hat);
  const arms = [-1, 1].map(sx => { const pv = new THREE.Group(); pv.position.set(sx * 1.25, 2.0, 0.1); puffy.add(pv); mesh(sph, std('#8a4fe0'), sx * 0.45, 0, 0, pv).scale.set(0.5, 0.18, 0.18); mesh(sph, std('#ffffff'), sx * 0.95, 0, 0, pv).scale.setScalar(0.2); return pv; });
  Bg.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const shadow = mesh(keep(new THREE.CircleGeometry(1.4, 24).rotateX(-Math.PI / 2)), basic('#000000', { opacity: 0.22 }), 0, 0.02, 0);

  // ---- crown balloons (instanced) on strings (one line set)
  const MAXB = 10, balloons = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.42, 14, 10)), std('#ffffff', { roughness: 0.25 }), MAXB);
  balloons.count = 0; balloons.castShadow = true; group.add(balloons);
  const knots = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(0.09, 0.14, 6).rotateX(Math.PI)), std('#ffffff'), MAXB); knots.count = 0; group.add(knots);
  const strGeo = keep(new THREE.BufferGeometry()); strGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXB * 6), 3));
  const strings = new THREE.LineSegments(strGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 })); group.add(strings);
  const live = new Map();          // id -> { x, z, tx, tz, c }

  // ---- darts in flight
  const flying = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(0.08, 0.6, 6).rotateX(Math.PI / 2)), std('#ffd23f', { emissive: new THREE.Color('#ff9b3d'), emissiveIntensity: 0.4 }), 16);
  flying.count = 0; group.add(flying);

  // ---- the puff wedge
  const wedge = (r, half) => keep(new THREE.CircleGeometry(r, 24, -half, half * 2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2));
  const puffMark = mesh(wedge(RULES.puffR, RULES.puffHalf), basic('#9fe3ff', { opacity: 0.3 }), 0, 0.05, 0); puffMark.visible = false;
  const puffFill = mesh(wedge(1, RULES.puffHalf), basic('#3db4ff', { opacity: 0.45 }), 0, 0.055, 0); puffFill.visible = false;
  puffMark.renderOrder = puffFill.renderOrder = 3;

  const bar = scoreBar(ctx, { unit: 'damage' });
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => { stage.setSafe?.(tall() ? { top: 0.2 } : { top: 0.15 }); ctx.camera({ cx: 0, cz: -0.6, hw: hw + 0.8, hd: hd + 1.4, tall: tall() ? 4.2 : 3.6 }, { instant: true }); };
  frameCam(); addEventListener('resize', frameCam);
  let G = null, ph = 'ready', phT = 0, lastSub = '', subT = 0, bx = 0, bz = -2.2, by = 0, popT = 0;

  function hint(g, darts) {
    if (g.ph === 'flat') return '<span class="bk-tag hot">He’s FLAT! Jump on him (B)!</span>';
    if (g.pf) return '<span class="bk-tag hot">PUFF! Out of the blue wedge!</span>';
    if (me != null && !darts) return '<span class="bk-tag hot">No darts: go to a bucket!</span>';
    if (g.ph === 'inflate') return '<span class="bk-tag">He’s puffing back up…</span>';
    return '<span class="bk-tag">Pop his balloons (A)!</span>';
  }

  return {
    winter: { spots: [[-11, 0, -7], [11, 0, -7], [-11, 0, 5], [11, 0, 5]] },
    halloween: { spots: [[-11, 0, -7], [11, 0, -7], [-11, 0, 5], [11, 0, 5]], ghosts: [[-9, 3, -9], [9, 3, -9]] },
    start() { frameCam(); K.banner('The Balloon Baron!'); },
    state(g) {
      G = g;
      if (g.ph !== ph) { ph = g.ph; phT = 0; }
      if (g.sub !== lastSub) { lastSub = g.sub; subT = 0; }
      K.hp(g.hp, init.hpMax);
      const darts = me != null ? (g.am?.[me] ?? 0) : null;
      const dots = darts == null ? '' : `<span class="bb-darts${darts ? '' : ' empty'}" aria-label="${darts} darts">${[0, 1, 2].map(i => `<i class="${i < darts ? 'on' : ''}"></i>`).join('')}<small>${darts} dart${darts === 1 ? '' : 's'}</small></span>`;
      K.row(`<span class="bb-hearts${g.hearts <= 1 ? ' low' : ''}" aria-label="${g.hearts} team hearts">${'♥'.repeat(g.hearts)}<small>×${g.hearts}</small></span>${dots}<span class="bb-left">🎈<small>${g.cr.length}</small></span>${hint(g, darts)}`);
      K.rings(g.rg, { color: '#ff3b3b', fillColor: '#ffb04a' });
      // crown balloons: keep each by id and ease it toward the server's spot
      const seen = new Set();
      for (const [id, x, z] of g.cr) { seen.add(id); let L = live.get(id); if (!L) { L = { x, z, c: BALLOON[id % BALLOON.length], born: 0 }; live.set(id, L); } L.tx = x; L.tz = z; }
      for (const id of live.keys()) if (!seen.has(id)) live.delete(id);
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'squat') { ctx.sfx('trap'); }
      else if (ev.e === 'land') { K.puff(ev.x, 0.3, ev.z, '#ffffff', 2.6); ctx.sfx('splat'); }
      else if (ev.e === 'puffWarn') { K.banner('BIG PUFF!', 'warn', 900); ctx.sfx('trap'); }
      else if (ev.e === 'puff') { for (let i = 1; i < 6; i++) K.puff(bx + Math.sin(ev.yaw) * i * 1.3, 0.8, bz + Math.cos(ev.yaw) * i * 1.3, '#d9f4ff', 0.5 + i * 0.2); ctx.sfx('throw'); }
      else if (ev.e === 'confetti') { K.banner('Confetti cannons!', 'warn', 800); }
      else if (ev.e === 'bang') { for (let i = 0; i < 3; i++) K.puff(ev.x + (i - 1) * 0.4, 0.4 + i * 0.2, ev.z, BALLOON[i * 3 % 8], 0.6); ctx.sfx('splat'); }
      else if (ev.e === 'throw') { if (ev.pid === me) ctx.sfx('throw'); ctx.actor(ev.pid)?.play('throw', 380); }
      else if (ev.e === 'pop') { K.puff(ev.x, 2.1, ev.z, BALLOON[ev.id % BALLOON.length], 0.9); floatText(stage, ev.x, 2.6, ev.z, ev.left ? 'POP!' : 'LAST ONE!', 'good'); ctx.sfx(ev.pid === me ? 'coins' : 'hit'); popT = 0.3; }
      else if (ev.e === 'boing') { K.puff(ev.x, 1.6, ev.z, '#ffffff', 0.4); }
      else if (ev.e === 'flat') { K.banner('PFFFT! He’s flat — jump on him!', 'good', 1500); ctx.sfx('good'); K.puff(ev.x, 0.4, ev.z, '#c58cff', 2.6); }
      else if (ev.e === 'stomp') { K.puff(ev.x, 0.3, ev.z, '#ffd23f', 0.7); floatText(stage, ev.x, 1.8, ev.z, `BOING −${ev.dmg}`, 'good'); ctx.sfx(ev.pid === me ? 'coins' : 'hit'); }
      else if (ev.e === 'inflate') { K.banner(`He’s back — ${ev.k} balloons!`, 'warn', 1100); }
      else if (ev.e === 'grab') { if (ev.pid === me) ctx.sfx('pick'); }
      else if (ev.e === 'empty') { if (ev.pid === me) { K.banner('No darts! Go to a bucket', 'bad', 900); ctx.sfx('bad'); } }
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, ev.why === 'puff' ? 'WHOOSH! −♥' : ev.why === 'confetti' ? 'Confetti’d! −♥' : 'SQUASH! −♥', 'bad'); }
      else if (ev.e === 'jump') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { K.banner(ev.ok ? 'The Baron is deflated!' : 'The Baron floats off!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('throw', 380); },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.ph === 'end') return G.hp <= 0 ? 'cheer' : 'sitGround'; if (flags & F.AIR) return 'jump'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t); phT += dt; subT += dt; popT = Math.max(0, popT - dt);
      if (G) { const k = Math.min(1, dt * 10); bx += (G.bx - bx) * k; bz += (G.bz - bz) * k; by += (G.by - by) * k; }
      const p = G?.ph || 'ready', sub = G?.sub, won = p === 'end' && G.hp <= 0, flat = p === 'flat' || won;
      Bg.position.set(bx, by, bz); shadow.position.set(bx, 0.02, bz); shadow.scale.setScalar(Math.max(0.4, 1 - by * 0.12) * (flat ? 1.8 : 1));
      // face the nearest player (or the puff's aim)
      let face = 0;
      if (G?.pf) face = G.pf[1];
      else { let bd = 1e9; for (const pl of ctx.players) { const q2 = ctx.pos(pl.pid); if (!q2) continue; const d = Math.hypot(q2.x - bx, q2.z - bz); if (d < bd) { bd = d; face = Math.atan2(q2.x - bx, q2.z - bz); } } }
      let dy = face - Bg.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); Bg.rotation.y += dy * Math.min(1, dt * 4);
      // squash and stretch
      let sx = 1, sy = 1;
      if (flat) { const k = Math.min(1, phT * 4); sx = 1 + 0.8 * k; sy = 1 - 0.88 * k; }
      else if (p === 'inflate') { const k = Math.min(1, phT / RULES.inflate); sx = 1.8 - 0.8 * k; sy = 0.12 + 0.88 * k + Math.sin(k * 12) * 0.05 * (1 - k); }
      else if (sub === 'squat') { const k = Math.min(1, subT * 2); sx = 1 + 0.15 * k; sy = 1 - 0.22 * k; }
      else if (sub === 'air') { sx = 0.9; sy = 1.12; }
      else if (sub === 'puff') { const k = 1 - G.pf[2] / Math.max(0.01, G.pf[3]); sx = 1 + 0.25 * k; sy = 1 + 0.12 * k; }
      else { sx = 1 + Math.sin(t * 3) * 0.03; sy = 1 - Math.sin(t * 3) * 0.03; }
      if (popT > 0) { sx += popT * 0.3; sy -= popT * 0.2; }
      puffy.scale.set(sx, sy, sx);
      arms.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * (flat ? 0 : 0.4 + Math.sin(t * 5 + i) * 0.4); });
      for (const pp of pupils) { pp.scale.setScalar(flat ? 0.05 : 0.12); }
      hat.rotation.z = flat ? 0.6 : Math.sin(t * 2) * 0.05; hat.position.y = flat ? 3.6 : 3.4;
      // balloons on strings, bobbing over his middle (they rise with him in a bounce)
      const pos = strGeo.attributes.position.array; let i = 0;
      for (const L of live.values()) {
        if (i >= MAXB) break;
        const k = Math.min(1, dt * 10); L.x += (L.tx - L.x) * k; L.z += (L.tz - L.z) * k; L.born = Math.min(1, L.born + dt * 2.5);
        const y = by + 2.4 + Math.sin(t * 2.4 + i) * 0.15;
        m4.compose(v3.set(L.x, y, L.z), q.identity(), sc.set(L.born, L.born * 1.18, L.born)); balloons.setMatrixAt(i, m4); balloons.setColorAt(i, col.set(L.c));
        m4.compose(v3.set(L.x, y - 0.52, L.z), q.identity(), sc.set(L.born, L.born, L.born)); knots.setMatrixAt(i, m4); knots.setColorAt(i, col.set(L.c));
        pos.set([L.x, y - 0.55, L.z, bx + (L.x - bx) * 0.5, by + 1.5, bz + (L.z - bz) * 0.5], i * 6); i++;
      }
      balloons.count = knots.count = i; strGeo.setDrawRange(0, i * 2); strGeo.attributes.position.needsUpdate = true;
      balloons.instanceMatrix.needsUpdate = knots.instanceMatrix.needsUpdate = true; if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true; if (knots.instanceColor) knots.instanceColor.needsUpdate = true;
      // darts in flight
      const ds = G?.dt || []; flying.count = Math.min(16, ds.length);
      for (let j = 0; j < flying.count; j++) { const [, x, z, yaw] = ds[j]; m4.compose(v3.set(x, 1.5, z), q.setFromEuler(e3.set(0, yaw, 0)), sc.set(1, 1, 1)); flying.setMatrixAt(j, m4); }
      flying.instanceMatrix.needsUpdate = true;
      // the puff wedge
      const pf = G?.pf; puffMark.visible = puffFill.visible = !!pf;
      if (pf) { const kk = 1 - pf[2] / Math.max(0.01, pf[3]); puffMark.position.set(bx, 0.05, bz); puffMark.rotation.y = pf[1]; puffFill.position.set(bx, 0.055, bz); puffFill.rotation.y = pf[1]; puffFill.scale.setScalar(Math.max(0.01, kk * RULES.puffR)); puffMark.material.opacity = kk > 0.7 ? 0.3 + 0.3 * Math.abs(Math.sin(t * 18)) : 0.3; }
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); for (const tg of tags) tg.remove(); for (const tx of texs) tx.dispose(); strings.material.dispose(); K.dispose(); },
  };
}
