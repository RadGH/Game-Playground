// MOLE MALLET, as drawn: a cottage-garden lawn in a checker of two greens behind a white picket fence, with flower
// beds and a carrot patch outside it. Each hole is a dark pit in a ring of crumbly dirt. A mole is a round brown
// fellow with a pink nose, black eyes and pale paws on the rim; a golden mole shines; a BOMB mole is a black ball with
// a lit fuse on top and angry red eyes. Every player carries a big mallet whose head is their seat colour; BONK swings
// it down in front. Your own aim spot is a white ring in front of you that turns gold when a mole is under it. Dizzy
// players have yellow stars circling their heads.
import { RULES, KIND, aimAt } from './sim.js';
import { SEATS } from '../../shared/protocol.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { witchHatGeo } from '../../client/halloween.js';

const MAXM = 24;
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const { hw, hd } = meta.arena, holes = ctx.init.holes, HW = ctx.season === 'halloween';     // Halloween: a dusk garden, moles in witch hats, the bomb is a fizzing TRICK ball
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  // ---- garden
  const out = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std(HW ? '#355e3a' : '#6cc35a')); out.position.y = -0.03; out.receiveShadow = true; group.add(out);
  const TX = 10, TZ = 8, tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(hw * 2 / TX, hd * 2 / TZ).rotateX(-Math.PI / 2), std('#ffffff', { roughness: 0.95 }), TX * TZ);
  const G2 = HW ? [new THREE.Color('#5d8a50'), new THREE.Color('#517c47')] : [new THREE.Color('#8fe07a'), new THREE.Color('#7bd168')];
  for (let i = 0; i < TX * TZ; i++) { const cx = i % TX, cz = Math.floor(i / TX); m4.makeTranslation(-hw + (cx + 0.5) * hw * 2 / TX, 0, -hd + (cz + 0.5) * hd * 2 / TZ); tiles.setMatrixAt(i, m4); tiles.setColorAt(i, G2[(cx + cz) % 2]); }
  tiles.receiveShadow = true; group.add(tiles);
  // picket fence round the lawn
  const per = Math.round(hw * 2 / 0.45) * 2 + Math.round(hd * 2 / 0.45) * 2, pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.85, 0.07), std(HW ? '#cbbde6' : '#ffffff', { roughness: 0.6 }), per);
  let pk = 0;
  for (let k = 0, N = Math.round(hw * 2 / 0.45); k < N; k++) for (const sz of [-1, 1]) { m4.compose(v.set(-hw + (k + 0.5) * hw * 2 / N, 0.42, sz * (hd + 0.25)), q.identity(), sc.set(1, 1 + (k % 2) * 0.1, 1)); pickets.setMatrixAt(pk++, m4); }
  for (let k = 0, N = Math.round(hd * 2 / 0.45); k < N; k++) for (const sx of [-1, 1]) { m4.compose(v.set(sx * (hw + 0.25), 0.42, -hd + (k + 0.5) * hd * 2 / N), q.setFromEuler(e3.set(0, Math.PI / 2, 0)), sc.set(1, 1 + (k % 2) * 0.1, 1)); pickets.setMatrixAt(pk++, m4); }
  pickets.count = pk; pickets.castShadow = true; group.add(pickets);
  const railMat = std(HW ? '#b9a8da' : '#f4efe6');
  for (const sz of [-1, 1]) for (const y of [0.25, 0.62]) { const r = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.6, 0.08, 0.05), railMat); r.position.set(0, y, sz * (hd + 0.3)); group.add(r); }
  for (const sx of [-1, 1]) for (const y of [0.25, 0.62]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, hd * 2 + 0.6), railMat); r.position.set(sx * (hw + 0.3), y, 0); group.add(r); }
  // flower beds and a carrot patch outside
  const FB = 90, blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), std('#ffffff', { flatShading: true }), FB), BC = (HW ? ['#ff7a14', '#9b5be0', '#ffd36b', '#ff9a3a', '#7dd84a'] : ['#ff5f8f', '#ffd23f', '#b48cff', '#ff8a3d', '#ffffff']).map(c => new THREE.Color(c));
  for (let i = 0; i < FB; i++) { const side = i % 4, t = ((i * 0.618) % 1) * 2 - 1; const x = side < 2 ? t * (hw + 1) : (side === 2 ? -1 : 1) * (hw + 1.1 + (i % 3) * 0.35), z = side < 2 ? (side ? 1 : -1) * (hd + 1.0 + (i % 3) * 0.35) : t * hd; m4.compose(v.set(x, 0.25, z), q.identity(), sc.setScalar(0.8 + (i % 3) * 0.25)); blooms.setMatrixAt(i, m4); blooms.setColorAt(i, BC[i % 5]); }
  group.add(blooms);
  const bed = std('#8a5a34', { roughness: 1 });
  for (const [x, z, w, d] of [[0, -hd - 1.3, hw * 2 + 2, 1.3], [0, hd + 1.3, hw * 2 + 2, 1.3], [-hw - 1.4, 0, 1.3, hd * 2], [hw + 1.4, 0, 1.3, hd * 2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), bed); b.position.set(x, 0.02, z); b.receiveShadow = true; group.add(b); }
  // ---- holes: dark pit + dirt ring
  const pits = new THREE.InstancedMesh(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2a1a10' }), holes.length);
  const rims = new THREE.InstancedMesh(new THREE.TorusGeometry(0.68, 0.17, 6, 16).rotateX(Math.PI / 2), std('#9b6a3e', { flatShading: true, roughness: 1 }), holes.length);
  holes.forEach((H, i) => { m4.makeTranslation(H.x, 0.015, H.z); pits.setMatrixAt(i, m4); m4.compose(v.set(H.x, 0.05, H.z), q.identity(), sc.set(1, 0.55, 1)); rims.setMatrixAt(i, m4); });
  rims.castShadow = true; group.add(pits, rims);
  // ---- moles (instanced by part); a clip plane would cost too much, so a mole's lower half simply sinks into the pit
  const mk = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.castShadow = true; group.add(im); return im; };
  const bodyGeo = new THREE.SphereGeometry(0.46, 16, 12);
  const bodies = [mk(bodyGeo, std('#8a5a3a', { roughness: 0.9 }), MAXM), mk(bodyGeo, std('#ffcf2a', { roughness: 0.3, metalness: 0.4, emissive: '#c08000', emissiveIntensity: 0.5 }), MAXM), mk(bodyGeo, std(HW ? '#3a2160' : '#26262e', { roughness: 0.35, metalness: 0.3 }), MAXM)];
  const bellies = mk(new THREE.SphereGeometry(0.3, 12, 8), std('#e9c9a0'), MAXM);
  const noses = mk(new THREE.SphereGeometry(0.1, 10, 8), std('#ff7aa8', { roughness: 0.4 }), MAXM);
  const eyeGeo = new THREE.SphereGeometry(0.065, 8, 6), eyes = mk(eyeGeo, new THREE.MeshBasicMaterial({ color: '#111111' }), MAXM * 2), redEyes = mk(eyeGeo, new THREE.MeshBasicMaterial({ color: HW ? '#7dff5a' : '#ff2a2a' }), MAXM * 2);
  const paws = mk(new THREE.SphereGeometry(0.11, 8, 6), std('#f2c7a5'), MAXM * 2);
  const fuses = mk(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), std('#c9a46a'), MAXM), sparks = mk(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: HW ? '#7dff5a' : '#ffb31a' }), MAXM);
  const hats = HW ? mk(witchHatGeo(THREE, 0.34), std('#ffffff', { roughness: 0.7 }), MAXM) : null, HAT = [new THREE.Color('#6a32b8'), new THREE.Color('#ff8a1a'), new THREE.Color('#2a1840')];
  const moles = new Map();     // id -> { hole, kind, h, th, bonk, squash }
  // ---- mallets on every player
  const mallets = new Map();
  const handleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8).translate(0, 0.5, 0), headGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.55, 14).rotateZ(Math.PI / 2), bandGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.07, 14).rotateZ(Math.PI / 2);
  for (const p of ctx.players) {
    const a = ctx.actor(p.pid); if (!a) continue;
    const H = a.height || 1.4, pivot = new THREE.Group(); pivot.position.set(-0.32 * H / 1.4, 0.62 * H / 1.4, 0);
    const handle = new THREE.Mesh(handleGeo, std('#c98b4a')), head = new THREE.Mesh(headGeo, std(p.color, { roughness: 0.45 }));
    head.position.y = 1.0; head.rotation.y = Math.PI / 2;
    for (const off of [-0.2, 0.2]) { const band = new THREE.Mesh(bandGeo, std('#ffffff')); band.position.set(0, 1.0, off); band.rotation.y = Math.PI / 2; pivot.add(band); }
    pivot.add(handle, head); handle.castShadow = head.castShadow = true;
    a.body.group.add(pivot); mallets.set(p.pid, { pivot, t: 9 });
  }
  const swingMallet = pid => { const m = mallets.get(pid); if (m) m.t = 0; ctx.actor(pid)?.play('attack', 320); };
  // ---- my aim ring, dizzy stars, effects
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false })); aim.position.y = 0.04; aim.visible = false; group.add(aim);
  const stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: '#ffe14d' }), 12); stars.count = 0; group.add(stars);
  const flags = new Map(), fx = [];
  const burstGeo = new THREE.IcosahedronGeometry(0.5, 0);
  function burst(x, z, color, size = 1) { const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, 0.6, z); group.add(m); fx.push({ m, t: 0, size }); }
  const bar = scoreBar(ctx, { unit: 'points' });
  let myCool = 0;
  return {
    state(g) {
      const seen = new Set();
      for (const [id, hole, kind, hgt, bonk] of g.ml) { seen.add(id); const m = moles.get(id); if (m) { m.th = hgt; if (bonk && !m.bonk) m.bonk = 1; } else moles.set(id, { hole, kind, h: 0, th: hgt, bonk, squash: bonk ? 1 : 0 }); }
      for (const id of moles.keys()) if (!seen.has(id)) moles.delete(id);
      bar.set(g.sc, g.left);
    },
    input(inp) { if (inp.b & 1 && myCool <= 0 && !(flags.get(ctx.me) & F.STUN)) { myCool = RULES.cool; swingMallet(ctx.me); } },
    event(ev) {
      if (ev.e === 'swing') { if (ev.pid !== ctx.me) swingMallet(ev.pid); }
      else if (ev.e === 'bonk') {
        const m = moles.get(ev.id); if (m) m.bonk = 1;
        burst(ev.x, ev.z, ev.k === KIND.GOLD ? '#ffd23f' : '#ffffff', ev.k === KIND.GOLD ? 1.5 : 1);
        floatText(stage, ev.x, 1.3, ev.z, ev.k === KIND.GOLD ? '+3 GOLD!' : '+' + ev.d, 'good');
        ctx.sfx(ev.pid === ctx.me ? (ev.k === KIND.GOLD ? 'coins' : 'good') : 'hit');
      } else if (ev.e === 'boom') {
        const m = moles.get(ev.id); if (m) m.bonk = 1;
        burst(ev.x, ev.z, HW ? '#7dff5a' : '#ff8a1f', 2.2); burst(ev.x, ev.z, HW ? '#9b5be0' : '#333333', 1.6);
        floatText(stage, ev.x, 1.6, ev.z, HW ? 'TRICK!' : 'BOOM!', 'bad'); ctx.sfx(ev.pid === ctx.me ? 'out' : 'trap');
      } else if (ev.e === 'bop') {
        burst(ev.x, ev.z, '#ffffff', 0.8); floatText(stage, ev.x, 2.2, ev.z, 'BONK!', 'bad'); ctx.sfx('hit');
      }
    },
    pose(pid, f) { flags.set(pid, f); if (f & F.STUN) return 'hit'; return undefined; },
    frame(dt, t) {
      if (myCool > 0) myCool -= dt;
      const k = 1 - Math.exp(-dt * 20), cnt = [0, 0, 0];
      let ni = 0, nb = 0, nr = 0, ne = 0, nh = 0;
      for (const m of moles.values()) {
        m.h += (m.th - m.h) * k; if (m.bonk) m.squash = Math.min(1, m.squash + dt * 6);
        const H = holes[m.hole], i = cnt[m.kind]++; if (i >= MAXM || ni >= MAXM) continue;
        const sq = 1 - m.squash * 0.55, y = -0.42 + m.h * 0.78 * sq, wob = m.bonk ? 0 : Math.sin(t * 9 + m.hole) * 0.06;
        q.setFromEuler(e3.set(0, wob, wob * 0.5));
        m4.compose(v.set(H.x, y, H.z), q, sc.set(1 + m.squash * 0.35, sq * 1.12, 1 + m.squash * 0.35)); bodies[m.kind].setMatrixAt(i, m4);
        const top = y + 0.46 * sq * 1.12, face = y + 0.18 * sq;
        if (m.kind !== KIND.BOMB) { m4.compose(v.set(H.x, y - 0.02, H.z + 0.22), q, sc.set(1, sq, 0.7)); bellies.setMatrixAt(nb++, m4); }
        m4.compose(v.set(H.x, face, H.z + 0.45), q, sc.setScalar(1)); noses.setMatrixAt(ni, m4);
        const eyeM = m.kind === KIND.BOMB ? redEyes : eyes, ei = m.kind === KIND.BOMB ? nr++ : ne++;
        for (const sx of [-1, 1]) { m4.compose(v.set(H.x + sx * 0.15, face + 0.15 * sq, H.z + 0.38), q, sc.set(1, m.bonk ? 0.3 : 1, 1)); eyeM.setMatrixAt(ei * 2 + (sx > 0 ? 1 : 0), m4); }
        for (const sx of [-1, 1]) { m4.compose(v.set(H.x + sx * 0.36, Math.max(0.06, y - 0.05), H.z + 0.42), q, sc.setScalar(m.h)); paws.setMatrixAt(ni * 2 + (sx > 0 ? 1 : 0), m4); }
        if (m.kind === KIND.BOMB) {
          const fi = cnt[2] - 1; m4.compose(v.set(H.x + 0.08, top + 0.1, H.z), q.setFromEuler(e3.set(0, 0, -0.4)), sc.setScalar(m.squash ? 0.001 : 1)); fuses.setMatrixAt(fi, m4);
          m4.compose(v.set(H.x + 0.17, top + 0.25, H.z), q.setFromEuler(e3.set(t * 7, t * 5, 0)), sc.setScalar(m.squash ? 0.001 : 0.8 + Math.sin(t * 40 + m.hole) * 0.35)); sparks.setMatrixAt(fi, m4);
        }
        if (hats && m.kind !== KIND.BOMB) { m4.compose(v.set(H.x, top - 0.1, H.z), q.setFromEuler(e3.set(-0.15, wob, wob * 0.5)), sc.setScalar(m.squash ? 1 - m.squash * 0.4 : 1)); hats.setMatrixAt(nh, m4); hats.setColorAt(nh++, HAT[m.kind]); }
        ni++;
      }
      if (hats) { hats.count = nh; hats.instanceMatrix.needsUpdate = true; if (hats.instanceColor) hats.instanceColor.needsUpdate = true; }
      bodies.forEach((b, i) => { b.count = Math.min(MAXM, cnt[i]); b.instanceMatrix.needsUpdate = true; });
      bellies.count = nb; noses.count = ni; eyes.count = ne * 2; redEyes.count = nr * 2; paws.count = ni * 2; fuses.count = sparks.count = Math.min(MAXM, cnt[2]);
      for (const im of [bellies, noses, eyes, redEyes, paws, fuses, sparks]) im.instanceMatrix.needsUpdate = true;
      // mallets swing: rest tilted back over the shoulder, then down in front and back up
      for (const m of mallets.values()) { m.t += dt; const u = m.t; m.pivot.rotation.x = u < 0.1 ? -0.5 + (u / 0.1) * 2.3 : u < 0.3 ? 1.8 - ((u - 0.1) / 0.2) * 2.3 : -0.5; }
      // my aim ring
      const me = ctx.me != null ? ctx.pos(ctx.me) : null;
      if (me) {
        // the ring sits where a swing now would land: gold on the mole the aim help would turn you to, red on a bomb
        // right in front of you, white (just ahead) when there is nothing to hit
        const tg = aimAt(me.x, me.z, me.yaw, [...moles.values()].filter(m => !m.bonk && m.th > 0.6));
        aim.visible = true;
        if (tg) { const H = holes[tg.m.hole]; aim.position.x = H.x; aim.position.z = H.z; }
        else { aim.position.x = me.x + Math.sin(me.yaw) * RULES.reach; aim.position.z = me.z + Math.cos(me.yaw) * RULES.reach; }
        const bomb = tg?.m.kind === KIND.BOMB;
        aim.material.color.set(bomb ? '#ff3b3b' : tg ? '#ffd23f' : '#ffffff'); aim.scale.setScalar(tg ? 1.3 + Math.sin(t * 14) * 0.1 : 1);
      }
      // dizzy stars
      let si = 0;
      for (const [pid, f] of flags) {
        const a = ctx.actor(pid); if (a) a.body.group.visible = !(f & F.GHOST) || Math.floor(t * 10) % 2 === 0;
        if (!(f & F.STUN) || si > 9) continue;
        const p = ctx.pos(pid); if (!p) continue; const top = (a?.height || 1.4) + 0.2;
        for (let s = 0; s < 3; s++) { const ang = t * 5 + s * 2.09; m4.compose(v.set(p.x + Math.sin(ang) * 0.42, top + Math.sin(ang * 2) * 0.05, p.z + Math.cos(ang) * 0.42), q.setFromEuler(e3.set(0, ang, 0)), sc.setScalar(1)); stars.setMatrixAt(si++, m4); }
      }
      stars.count = si; stars.instanceMatrix.needsUpdate = true;
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt * 3; f.m.scale.setScalar((0.4 + f.t * 1.4) * f.size); f.m.material.opacity = Math.max(0, 0.9 - f.t); if (f.t >= 1) { group.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); } }
    },
    dispose() { bar.el.remove(); },
  };
}
