// LANTERN LEAP, as drawn: a bright teal lily pond. The near side is a plank dock with posts and a striped awning; the
// far side is a grassy bank thick with reeds and cattails and a row of lantern posts. Each lily pad is a big round
// green leaf with a notch cut in it and a little red paper lantern glowing on its rim; a pad someone has stood on turns
// lighter, then yellow-brown while it WOBBLES, then slides under. Coins are fat spinning gold discs; fireflies are
// glowing lime orbs with a soft halo that bob above their pad. A splash throws up a white ring and droplets.
import { RULES, bonusFor } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';

const MAXP = 48, MAXC = 12, WY = -0.16;      // water surface height
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const { hw, hd } = meta.arena, { dock, bank } = ctx.init;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  // ---- water and surroundings
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std('#62c25a')); grass.position.y = -0.45; grass.receiveShadow = true; group.add(grass);      // below the water, so the pond shows
  const water = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 6, dock - bank).rotateX(-Math.PI / 2), std('#2fb5c8', { roughness: 0.12, metalness: 0.2 })); water.position.set(0, WY, (dock + bank) / 2); water.receiveShadow = true; group.add(water);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 6, (dock - bank) * 0.55).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1d8fb0', transparent: true, opacity: 0.35, depthWrite: false })); deep.position.set(0, WY + 0.005, (dock + bank) / 2); group.add(deep);
  // sparkles on the water
  const SP = 40, sparkle = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.35, 0.06).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: 0.7, depthWrite: false }), SP);
  group.add(sparkle);
  // the dock: planks across, posts along its edge, an awning at the back
  const DP = 14, planks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, (hd + 0.6 - dock) ), std('#c48a52', { roughness: 0.9 }), DP), PC = ['#c48a52', '#b97f48', '#cf9660'].map(c => new THREE.Color(c));
  for (let i = 0; i < DP; i++) { const w = (hw * 2 + 1.4) / DP; m4.compose(v.set(-hw - 0.7 + (i + 0.5) * w, -0.11, (dock + hd + 0.6) / 2), q.identity(), sc.set(w - 0.05, 1, 1)); planks.setMatrixAt(i, m4); planks.setColorAt(i, PC[i % 3]); }
  planks.receiveShadow = true; planks.castShadow = true; group.add(planks);
  const NPOST = 10, dposts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.15, 1.0, 8), std('#8a5a30'), NPOST);
  for (let i = 0; i < NPOST; i++) { m4.makeTranslation(-hw + i * hw * 2 / (NPOST - 1), -0.2, dock + 0.05); dposts.setMatrixAt(i, m4); }
  dposts.castShadow = true; group.add(dposts);
  // the far bank: grass, reeds, cattails, lantern posts
  const bankM = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 6, 0.3, -bank + 3), std('#7fd06a')); bankM.position.set(0, -0.15, bank - (-bank + 3) / 2); bankM.receiveShadow = true; group.add(bankM);
  const RE = 60, reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.05, 1.2, 4).translate(0, 0.6, 0), std('#3f9a3a'), RE), tails = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.07, 0.22, 2, 6), std('#7a4a26'), RE / 3);
  for (let i = 0; i < RE; i++) { const x = -hw - 2 + ((i * 0.618) % 1) * (hw * 2 + 4), z = bank - 0.35 - (i % 4) * 0.5, s = 0.7 + (i % 5) * 0.15; m4.compose(v.set(x, 0, z), q.setFromEuler(e3.set((i % 3 - 1) * 0.12, 0, (i % 4 - 1.5) * 0.08)), sc.set(1, s, 1)); reeds.setMatrixAt(i, m4); if (i % 3 === 0) { m4.compose(v.set(x, 1.2 * s, z), q.identity(), sc.setScalar(1)); tails.setMatrixAt(i / 3, m4); } }
  group.add(reeds, tails);
  const LP = 5, lposts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), std('#5b3a22'), LP), lheads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 10), std('#ffb347', { emissive: '#ff8a1f', emissiveIntensity: 0.9 }), LP);
  for (let i = 0; i < LP; i++) { const x = -hw + 1 + i * (hw * 2 - 2) / (LP - 1); m4.makeTranslation(x, 1.1, bank - 1.6); lposts.setMatrixAt(i, m4); m4.makeTranslation(x, 2.3, bank - 1.6); lheads.setMatrixAt(i, m4); }
  lposts.castShadow = true; group.add(lposts, lheads);
  // side banks so the pond reads as a pond
  for (const sx of [-1, 1]) { const sb = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, dock - bank + 0.1), std("#74c862")); sb.position.set(sx * (hw + 2.75 + 0.3), -0.1, (dock + bank) / 2); sb.receiveShadow = true; sb.castShadow = true; group.add(sb); }      // raised a little: pads float in and out from under them
  // ---- pads, lanterns, coins, fireflies
  const padGeo = new THREE.CylinderGeometry(1, 1, 0.1, 28, 1, false, 0.35, Math.PI * 2 - 0.7).translate(0, -0.05, 0);
  const pads = new THREE.InstancedMesh(padGeo, std('#ffffff', { roughness: 0.55 }), MAXP); pads.setColorAt(0, new THREE.Color('#3fbf4f')); pads.count = 0; pads.receiveShadow = true; pads.castShadow = true; group.add(pads);
  const veins = new THREE.InstancedMesh(new THREE.RingGeometry(0.42, 0.47, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2f8f3a', transparent: true, opacity: 0.5, depthWrite: false }), MAXP); veins.count = 0; group.add(veins);
  const lanterns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.19, 0.19, 0.36, 10), std('#ff8a3a', { emissive: '#ff7a1a', emissiveIntensity: 0.8, roughness: 0.6 }), MAXP); lanterns.count = 0; group.add(lanterns);
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.2, 0.12, 10), std('#ffcf4a', { roughness: 0.4 }), MAXP); caps.count = 0; group.add(caps);
  const coinM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.11, 20).rotateX(Math.PI / 2), std('#ffd23f', { roughness: 0.25, metalness: 0.6, emissive: '#b07a00', emissiveIntensity: 0.35 }), MAXC); coinM.count = 0; coinM.castShadow = true; group.add(coinM);
  const flyM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#d9ff4d' }), MAXC); flyM.count = 0; group.add(flyM);
  const haloM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: '#eaff7a', transparent: true, opacity: 0.28, depthWrite: false }), MAXC); haloM.count = 0; group.add(haloM);
  const padMap = new Map(), coinMap = new Map();
  const C_FRESH = new THREE.Color('#3fbf4f'), C_STEP = new THREE.Color('#79d24a'), C_WOB = new THREE.Color('#d6b23a');
  // ---- splashes
  const ringGeo = new THREE.RingGeometry(0.4, 0.55, 24).rotateX(-Math.PI / 2), dropGeo = new THREE.SphereGeometry(0.09, 6, 4), fx = [];
  function splash(x, z) {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), ring = new THREE.Mesh(ringGeo, mat); ring.position.set(x, WY + 0.02, z); group.add(ring);
    const drops = []; for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(dropGeo, mat); d.position.set(x, WY, z); const a = i * 0.7; d.userData.v = [Math.sin(a) * 1.8, 3 + (i % 3), Math.cos(a) * 1.8]; group.add(d); drops.push(d); }
    fx.push({ ring, drops, mat, t: 0 });
  }
  // ---- HUD: score chips with the streak
  const bar = scoreBar(ctx, { unit: 'points' });
  const streakEl = new Map();
  for (const p of ctx.players) { const c = bar.el.querySelector(`[data-pid="${p.pid}"]`); const e = h('i', 'll-streak'); c?.querySelector('.sc')?.after(e); streakEl.set(p.pid, e); }
  const tip = h('div', 'll-tip', 'Pads <b>wobble</b> then <b>sink</b> — keep hopping!'); ctx.ui.append(tip); setTimeout(() => tip.classList.add('gone'), 6000);
  const flags = new Map(), ys = new Map();
  return {
    state(g) {
      let seen = new Set();
      for (const [id, x, z, r, w, y] of g.pd) { seen.add(id); const p = padMap.get(id); if (p) { p.tx = x; p.z = z; p.w = w; p.ty = y; } else padMap.set(id, { x, tx: x, z, r, w, y, ty: y, ph: id * 1.7 }); }
      for (const id of padMap.keys()) if (!seen.has(id)) padMap.delete(id);
      seen = new Set();
      for (const [id, x, z, k] of g.cn) { seen.add(id); const c = coinMap.get(id); if (c) { c.tx = x; c.tz = z; } else coinMap.set(id, { x, z, tx: x, tz: z, k, born: 0 }); }
      for (const id of coinMap.keys()) if (!seen.has(id)) coinMap.delete(id);
      for (const [pid, n] of Object.entries(g.st)) { const e = streakEl.get(+pid); if (!e) continue; const b = bonusFor(n), txt = n >= 2 ? `streak ${n}${b ? ' +' + b : ''}` : ''; if (e.textContent !== txt) { e.textContent = txt; e.classList.toggle('hot', b > 0); } }
      bar.set(g.sc, g.left);
    },
    input(inp) { if (inp.b & 1) { const f = flags.get(ctx.me) || 0; if (!(f & (F.AIR | F.STUN))) ctx.actor(ctx.me)?.play('jump', 500); } },
    event(ev) {
      if (ev.e === 'leap') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 500); else ctx.sfx('tap'); }
      else if (ev.e === 'splash') { splash(ev.x, ev.z); ctx.sfx(ev.pid === ctx.me ? 'out' : 'splat'); floatText(stage, ev.x, 1.2, ev.z, ev.lost >= 2 ? `Splash! streak ${ev.lost} lost` : 'Splash!', 'bad'); }
      else if (ev.e === 'get') { ctx.sfx(ev.pid === ctx.me ? (ev.k ? 'coins' : 'good') : 'pick'); floatText(stage, ev.x, 1.6, ev.z, '+' + ev.d, 'good'); coinMap.delete(ev.id); }
      else if (ev.e === 'lost') { splash(ev.x, ev.z); }
      else if (ev.e === 'step') { const p = padMap.get(ev.id); if (p && p.w === 0) p.w = 0.05; }
    },
    pose(pid, f, b) {
      flags.set(pid, f); ys.set(pid, b?.y || 0);
      if (f & F.STUN || (b && b.y < -0.05)) return 'hit';
      if (f & F.AIR) return 'jump';
      return undefined;
    },
    frame(dt, t) {
      const k = 1 - Math.exp(-dt * 12);
      let i = 0;
      for (const p of padMap.values()) {
        if (i >= MAXP) break;
        p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
        const wob = p.w > 0.05 ? p.w : 0, tilt = wob * 0.16 * Math.sin(t * (10 + wob * 10) + p.ph), bob = Math.sin(t * 1.6 + p.ph) * 0.025;
        q.setFromEuler(e3.set(tilt, p.ph, tilt * 0.6));
        m4.compose(v.set(p.x, p.y + bob, p.z), q, sc.set(p.r, 1, p.r)); pads.setMatrixAt(i, m4);
        col.copy(p.w > 0.05 ? C_STEP : p.w > 0 ? C_STEP : C_FRESH); if (wob) col.lerp(C_WOB, Math.min(1, wob * 1.2)); pads.setColorAt(i, col);
        m4.compose(v.set(p.x, p.y + bob + 0.006, p.z), q, sc.set(p.r, 1, p.r)); veins.setMatrixAt(i, m4);
        const la = p.ph * 2.3, lx = p.x + Math.sin(la) * p.r * 0.72, lz = p.z + Math.cos(la) * p.r * 0.72 * 0.6 - p.r * 0.25;
        m4.compose(v.set(lx, p.y + bob + 0.16, lz), q, sc.setScalar(1)); lanterns.setMatrixAt(i, m4);
        m4.compose(v.set(lx, p.y + bob + 0.39, lz), q, sc.setScalar(1.15)); caps.setMatrixAt(i, m4);
        i++;
      }
      pads.count = veins.count = lanterns.count = caps.count = i;
      for (const im of [pads, veins, lanterns, caps]) im.instanceMatrix.needsUpdate = true;
      if (pads.instanceColor) pads.instanceColor.needsUpdate = true;
      let ci = 0, fi = 0;
      for (const [id, c] of coinMap) {
        c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.born = Math.min(1, c.born + dt * 3);
        const s = c.born < 1 ? Math.sin(c.born * Math.PI / 2) * 1.2 : 1;
        if (c.k) { if (fi >= MAXC) continue; const y = 0.75 + Math.sin(t * 3 + id) * 0.15, wx = Math.sin(t * 2.3 + id) * 0.12; m4.compose(v.set(c.x + wx, y, c.z), q.identity(), sc.setScalar(s)); flyM.setMatrixAt(fi, m4); m4.compose(v.set(c.x + wx, y, c.z), q.identity(), sc.setScalar(s * (1 + Math.sin(t * 8 + id) * 0.15))); haloM.setMatrixAt(fi++, m4); }
        else { if (ci >= MAXC) continue; m4.compose(v.set(c.x, 0.6 + Math.sin(t * 3 + id) * 0.06, c.z), q.setFromEuler(e3.set(-0.5, t * 2.5 + id, 0, 'YXZ')), sc.setScalar(s)); coinM.setMatrixAt(ci++, m4); }
      }
      coinM.count = ci; flyM.count = haloM.count = fi;
      coinM.instanceMatrix.needsUpdate = flyM.instanceMatrix.needsUpdate = haloM.instanceMatrix.needsUpdate = true;
      for (let s = 0; s < SP; s++) { const x = ((s * 3.71 + t * 0.4 * (s % 2 ? 1 : -1)) % (hw * 2 + 4) + hw * 2 + 4) % (hw * 2 + 4) - hw - 2, z = bank + 0.3 + ((s * 1.93) % (dock - bank - 0.6)); const a = (Math.sin(t * 2 + s) + 1) / 2; m4.compose(v.set(x, WY + 0.01, z), q.identity(), sc.set(0.4 + a, 1, 1)); sparkle.setMatrixAt(s, m4); }
      sparkle.instanceMatrix.needsUpdate = true;
      for (const [pid, f] of flags) { const a = ctx.actor(pid); if (a) a.body.group.visible = !(f & F.GHOST) || Math.floor(t * 10) % 2 === 0; }
      for (let j = fx.length - 1; j >= 0; j--) {
        const f = fx[j]; f.t += dt;
        f.ring.scale.setScalar(1 + f.t * 4); f.mat.opacity = Math.max(0, 0.9 - f.t * 0.9);
        for (const d of f.drops) { const u = d.userData.v; u[1] -= 12 * dt; d.position.x += u[0] * dt; d.position.y = Math.max(WY, d.position.y + u[1] * dt); d.position.z += u[2] * dt; }
        if (f.t > 1) { group.remove(f.ring); for (const d of f.drops) group.remove(d); f.mat.dispose(); fx.splice(j, 1); }
      }
    },
    dispose() { bar.el.remove(); },
  };
}
