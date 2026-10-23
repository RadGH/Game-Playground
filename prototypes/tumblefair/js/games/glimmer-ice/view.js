// GLIMMER ICE, as drawn: a round frozen pond at night (the stage's lights dimmed to a blue night and put back after;
// on Halloween the shared dusk dressing does it instead) under curtains of green and violet northern lights, a snowy
// bank with pines, snowdrifts and warm lanterns round it. The ice is a pale see-through sheet over dark water, so the
// fish's glimmers show THROUGH it as soft coloured glows (one THREE.Points cloud, additive) that fade in and out —
// and only the fish that are glimmering are sent, so what you see is all anyone knows. Each hole is a black circle of
// open water with a frosty lid that grows over it as it freezes (white and cracked when it is too icy to fish; your
// nearest hole gets a ring: green = drop your line, blue = chip it first). A dropped line runs from your rod into the
// hole; a nibble ripples it, a bite splashes and shows "!" over it. A catch is held up over your head.
import { HOLE, SPECIES_LIST } from './sim.js';
import { BY_ID, fishName } from '../fish-species.js';
import { fishViewKit } from '../fish-view.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { btnText } from '../../client/buttons.js';
import { canvasTexture } from '../../client/stage.js';

export function createView(ctx) {
  const { THREE, group, stage, players, me, init } = ctx, HW = ctx.season === 'halloween', R = ctx.arena.r;
  const K = fishViewKit(THREE, group), mats = [], geos = [], tags = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...extra }); mats.push(m); return m; };
  const G = geo => { geos.push(geo); return geo; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  // ---- night (restored on dispose)
  let restore = null;
  if (!HW) {
    const scene = stage.scene, hemi = scene.children.find(o => o.isHemisphereLight), sun = stage.sun;
    const was = { bg: scene.background?.clone?.() ?? scene.background, h: hemi && { c: hemi.color.clone(), g: hemi.groundColor.clone(), i: hemi.intensity }, s: sun && { c: sun.color.clone(), i: sun.intensity } };
    scene.background = new THREE.Color('#141a3a');
    if (hemi) { hemi.color.set('#b8c8ff'); hemi.groundColor.set('#2a3460'); hemi.intensity = was.h.i * 0.6; }
    if (sun) { sun.color.set('#9fb4ff'); sun.intensity = was.s.i * 0.4; }
    restore = () => { scene.background = was.bg; if (hemi) { hemi.color.copy(was.h.c); hemi.groundColor.copy(was.h.g); hemi.intensity = was.h.i; } if (sun) { sun.color.copy(was.s.c); sun.intensity = was.s.i; } };
  }
  // ---- snow, dark water, the ice sheet
  const snow = new THREE.Mesh(G(new THREE.RingGeometry(R + 0.1, 48, 64, 1).rotateX(-Math.PI / 2)),   // a ring, so nothing covers the water under the ice
    std(HW ? '#8a7aa8' : '#8a9ac8', { roughness: 1 })); snow.position.y = -0.04; snow.receiveShadow = true; group.add(snow);
  const deep = new THREE.Mesh(G(new THREE.CircleGeometry(R + 0.2, 48).rotateX(-Math.PI / 2)), basic(HW ? '#0d0618' : '#040c1e')); deep.position.y = -0.3; group.add(deep);
  const frost = canvasTexture(512, 512, (c, w) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(120,170,220,.55)'; c.lineWidth = 2; let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 40; i++) { let x = r() * w, y = r() * w; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 80; y += (r() - 0.5) * 80; c.lineTo(x, y); } c.stroke(); } });
  const ice = new THREE.Mesh(G(new THREE.CircleGeometry(R + 0.2, 64).rotateX(-Math.PI / 2)), std(HW ? '#6a5aa8' : '#4a78b8', { map: frost, transparent: true, opacity: 0.45, roughness: 0.15, metalness: 0.1, depthWrite: false })); ice.position.y = 0; group.add(ice);
  const bank = new THREE.Mesh(G(new THREE.TorusGeometry(R + 0.55, 0.45, 8, 64).rotateX(Math.PI / 2)), std(HW ? '#b8acd0' : '#c8d4f0', { roughness: 1 })); bank.position.y = 0.05; bank.receiveShadow = true; group.add(bank);
  // drifts, pines, lanterns
  const DR = 14, drifts = new THREE.InstancedMesh(G(new THREE.SphereGeometry(0.7, 10, 6)), std('#c8d4f0', { roughness: 1 }), DR);
  for (let i = 0; i < DR; i++) { const a = i / DR * Math.PI * 2 + 0.2, d = R + 1.6 + (i % 3) * 0.6; m4.compose(v.set(Math.sin(a) * d, 0, Math.cos(a) * d), q.identity(), sc.set(1 + (i % 2) * 0.6, 0.45, 1)); drifts.setMatrixAt(i, m4); }
  group.add(drifts);
  const PN = 14, pines = new THREE.InstancedMesh(G(new THREE.ConeGeometry(0.9, 2.6, 7)), std(HW ? '#2c3a4a' : '#2a5a4a', { flatShading: true }), PN);
  for (let i = 0; i < PN; i++) { const a = Math.PI + (i / (PN - 1) - 0.5) * 2.6, d = R + 3.4 + (i % 2) * 1.2; m4.compose(v.set(Math.sin(a) * d * 1.25, 1.3, Math.cos(a) * d * 0.85), q.identity(), sc.setScalar(0.9 + (i % 3) * 0.2)); pines.setMatrixAt(i, m4); }
  pines.castShadow = true; group.add(pines);
  const glow = canvasTexture(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.8)'); gr.addColorStop(0.5, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
  const lampGeo = G(new THREE.BoxGeometry(0.28, 0.4, 0.28)), postGeo = G(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5)), lampM = std('#ffd36b', { emissive: '#ffb02e', emissiveIntensity: 1.2 }), postM = std('#3a2a22');
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5, d = R + 1.1; const p = new THREE.Mesh(postGeo, postM); p.position.set(Math.sin(a) * d, 0.55, Math.cos(a) * d); const l = new THREE.Mesh(lampGeo, lampM); l.position.set(p.position.x, 1.2, p.position.z); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffc870', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); mats.push(s.material); s.scale.setScalar(1.6); s.position.copy(l.position); group.add(p, l, s); }
  // northern lights: a few tall soft ribbons far behind the pond
  const auroraTex = canvasTexture(256, 128, (c, w, hh) => { const gr = c.createLinearGradient(0, hh, 0, 0); gr.addColorStop(0, 'rgba(120,255,180,.9)'); gr.addColorStop(0.45, 'rgba(110,220,255,.45)'); gr.addColorStop(1, 'rgba(190,120,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, hh); });
  const auroras = [];
  for (let i = 0; i < 3; i++) { const g = G(new THREE.PlaneGeometry(26, 7, 24, 1)), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, opacity: HW ? 0.35 : 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: i === 1 ? '#c8a0ff' : '#ffffff' })); mats.push(m.material); m.position.set((i - 1) * 7, 3.5 + i, -R - 4 - i * 1.5); group.add(m); auroras.push({ m, base: Float32Array.from(g.attributes.position.array), i }); }
  // ---- holes
  const holeGeo = G(new THREE.CircleGeometry(HOLE.r, 28).rotateX(-Math.PI / 2)), lidGeo = G(new THREE.CircleGeometry(HOLE.r + 0.04, 28).rotateX(-Math.PI / 2)), rimGeo = G(new THREE.TorusGeometry(HOLE.r + 0.06, 0.07, 6, 28).rotateX(Math.PI / 2));
  const holeM = basic(HW ? '#0d0618' : '#04101e'), rimM = std('#ffffff', { roughness: 1 });
  const holes = init.holes.map((p, i) => {
    const g = new THREE.Group(); g.position.set(p.x, 0.012, p.z); group.add(g);
    const w = new THREE.Mesh(holeGeo, holeM); g.add(w);
    const lid = new THREE.Mesh(lidGeo, new THREE.MeshStandardMaterial({ color: '#f4faff', map: frost, transparent: true, opacity: 0, roughness: 0.4, depthWrite: false })); mats.push(lid.material); lid.position.y = 0.01; g.add(lid);
    const rim = new THREE.Mesh(rimGeo, rimM); rim.position.y = 0.02; g.add(rim);
    const bang = stage.tag(rim, { text: '!', height: 0.9, cls: 'gi-bang' }); tags.push(bang); bang.el.classList.add('off');
    return { g, lid, ice: 0, bang, rip: 0, i };
  });
  const pick = new THREE.Mesh(G(new THREE.RingGeometry(HOLE.r + 0.12, HOLE.r + 0.24, 32).rotateX(-Math.PI / 2)), basic('#7dff9a', { transparent: true, opacity: 0.85, depthWrite: false })); pick.visible = false; group.add(pick);
  // ---- glimmers under the ice
  const MAXF = 24, pts = new THREE.BufferGeometry(); geos.push(pts);
  pts.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXF * 3), 3)); pts.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXF * 3), 3));
  const cloud = new THREE.Points(pts, new THREE.PointsMaterial({ map: glow, size: 7.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })); mats.push(cloud.material); cloud.frustumCulled = false; cloud.renderOrder = 5; ice.renderOrder = 1; group.add(cloud);   // drawn after the see-through ice, so a glimmer shows through it
  const fishes = new Map();
  // ---- per player: rod, line, held catch
  const S = new Map(players.map(p => [p.pid, { st: 0, hole: -1, rod: null, line: K.line(), show: null, showT: 0 }]));
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'gp-pill'), banner = h('div', 'gp-banner'), card = h('div', 'fk-catch'); ctx.ui.append(h('div', 'gi-sky'), pill, banner, card);
  const medals = init.medals ? h('div', 'fk-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const showBanner = (html, cls = '', ms = 1200) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  const showCard = (html, ms = 1700) => { card.innerHTML = html; card.classList.add('show'); clearTimeout(showCard.t); showCard.t = setTimeout(() => card.classList.remove('show'), ms); };
  const HINT = { 0: 'At a hole: press A to drop your line, press B to chip ice', 1: 'Line in… press A to pull it up, press B to chip', 2: '<b>BITE!</b> Press A!', 3: '' };
  let last = null, prevB = 0, prevS = -9, camX = 0;
  const tip = new THREE.Vector3(), bp = new THREE.Vector3();
  return {
    halloween: { spots: [[-R - 2, 0, -2], [R + 2, 0, -2], [-R - 1.5, 0, 3], [R + 1.5, 0, 3], [0, 0, -R - 2.2]], ghosts: [[-4, 2.6, -R - 1], [4, 2.8, -R - 1.5]], mist: false },
    input(inp) { const fresh = bit => (inp.b & bit) && (!(prevB & bit) || inp.s !== prevS + 1); if (fresh(2)) ctx.actor(me)?.play('attack', 300); prevB = inp.b; prevS = inp.s; },
    state(g) {
      last = g; bar.set(g.sc, g.left);
      g.h.forEach((ice, i) => { if (holes[i]) holes[i].ice = ice / 100; });
      for (const [pid, st, hole] of g.p) { const s = S.get(pid); if (s) { s.st = st; s.hole = hole; } }
      const seen = new Set();
      for (const [id, x, z, hh, si, bite] of g.f) { seen.add(id); let f = fishes.get(id); if (!f) { f = { x, z, a: 0, sp: SPECIES_LIST[si] }; fishes.set(id, f); } f.tx = x; f.tz = z; f.on = true; f.bite = bite; }
      for (const [id, f] of fishes) if (!seen.has(id)) f.on = false;
      const mine = me != null ? S.get(me) : null;
      pill.innerHTML = mine ? btnText(HINT[mine.st] || '', ctx.meta.controls, { html: true }) : '<b>Glimmer Ice</b> <em>watch for the glimmers</em>'; pill.style.display = pill.innerHTML ? '' : 'none';
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[players[0].pid] || 0) >= init.medals[i]));
    },
    event(ev) {
      const H = holes[ev.hole];
      if (ev.e === 'drop') { ctx.actor(ev.pid)?.play('attack', 360); if (ev.pid === me) ctx.sfx('throw'); }
      else if (ev.e === 'chip') { if (H) H.rip = 0.6; if (ev.pid !== me) ctx.actor(ev.pid)?.play('attack', 300); if (ev.pid === me) ctx.sfx(ev.ice <= 0 ? 'good' : 'hit'); }
      else if (ev.e === 'nib') { if (H) H.rip = 0.5; }
      else if (ev.e === 'bite') { if (H) { H.rip = 1; H.bang.el.classList.remove('off'); } if (ev.pid === me) { showBanner('BITE!', 'good', 700); ctx.sfx('pick'); } }
      else if (ev.e === 'miss') { for (const x of holes) x.bang.el.classList.add('off'); if (ev.pid === me) { showBanner('Too slow!', 'bad', 800); ctx.sfx('bad'); } }
      else if (ev.e === 'catch') {
        if (H) H.bang.el.classList.add('off');
        const s = S.get(ev.pid); if (s) { if (s.show) group.remove(s.show); s.show = K.fish(ev.sp, { glow: true }); s.show.rotation.set(0, Math.PI / 2, 0.3); s.showT = 1.4; group.add(s.show); }
        const at = ctx.pos(ev.pid); if (at) floatText(stage, at.x, 2.9, at.z, `+${ev.pts}`, 'good'); ctx.actor(ev.pid)?.play('cheer', 1000);
        if (ev.pid === me) { showCard(`${fishName(ev.sp, ctx.season)} · +${ev.pts}<small>${ev.kg} kg</small>`); ctx.sfx(ev.pts >= 6 ? 'win' : 'coins'); }
      }
      else if (ev.e === 'frozenIn') { if (H) H.bang.el.classList.add('off'); if (ev.pid === me) { showBanner('Frozen in!', 'bad', 1300); ctx.sfx('bad'); } ctx.actor(ev.pid)?.play('hit', 500); }
      else if (ev.e === 'seal') { if (H) H.rip = 0.3; }
      else if (ev.e === 'nope') { if (ev.pid === me) { const p = ctx.pos(me); if (p) floatText(stage, p.x, 2.4, p.z, ev.why === 'taken' ? 'Taken!' : btnText('Too icy: press B to chip it', ctx.meta.controls), 'bad'); ctx.sfx('bad'); } }
      else if (ev.e === 'end') { const p0 = last?.sc?.[players[0].pid] ?? 0; showBanner(init.medals ? `${p0} pts<small>${p0 >= init.medals[2] ? '🥇 Gold!' : p0 >= init.medals[1] ? '🥈 Silver' : p0 >= init.medals[0] ? '🥉 Bronze' : 'Keep fishing!'}</small>` : 'Lines up!', 'good', 4000); ctx.sfx('win'); }
    },
    pose(pid, flags) { const s = S.get(pid); if (flags & 8 && last?.left <= 0) return 'cheer'; if (s && (s.st === 1 || s.st === 2)) return 'sitGround'; return undefined; },
    frame(dt, t) {
      // the whole pond; an upright phone sees a slice that follows its own angler (the whole pond makes holes specks)
      if (me != null && innerHeight > innerWidth * 1.15) { const at = ctx.pos(me), lim = R + 1.2 - 5.4, want = Math.max(-lim, Math.min(lim, at ? at.x : 0)); camX += (want - camX) * Math.min(1, dt * 4); ctx.camera({ cx: camX, cz: 0.2, hw: 5.4, hd: R + 0.6 }); }
      else ctx.camera({ cx: 0, cz: 0.2, hw: R + 1.2, hd: R + 0.6 });
      // aurora sway
      for (const A of auroras) { const p = A.m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const bx = A.base[i * 3], by = A.base[i * 3 + 1]; p.setXYZ(i, bx, by, Math.sin(bx * 0.35 + t * 0.6 + A.i) * 1.6 + (by > 0 ? Math.sin(t * 0.9 + bx * 0.2) * 0.8 : 0)); } p.needsUpdate = true; }
      // holes: frost lids, ripples
      for (const H of holes) {
        H.lid.material.opacity = Math.min(0.97, H.ice * 1.1); H.lid.scale.setScalar(0.35 + 0.65 * Math.min(1, H.ice / 0.7));
        H.lid.material.color.set(H.ice >= HOLE.fishable ? '#ffffff' : '#dff2ff');
        if (H.rip > 0) { H.rip -= dt; H.g.scale.setScalar(1 + Math.max(0, H.rip) * 0.15 * Math.sin(t * 30)); } else H.g.scale.setScalar(1);
      }
      // glimmers fade in and out
      let n = 0; const P = pts.attributes.position, C = pts.attributes.color, k = 1 - Math.exp(-dt * 8);
      for (const [id, f] of fishes) {
        f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k;
        f.a = Math.max(0, Math.min(1, f.a + (f.on ? dt * 4 : -dt * 3)));
        if (!f.on && f.a <= 0) { fishes.delete(id); continue; }
        if (n >= MAXF) continue;
        const sp = BY_ID[f.sp]; P.setXYZ(n, f.x, -0.12, f.z); col.set(sp.glow || sp.color).multiplyScalar(f.a * (f.bite ? 1 + 0.3 * Math.sin(t * 20) : 0.85 + 0.15 * Math.sin(t * 6 + id))); C.setXYZ(n, col.r, col.g, col.b); n++;
      }
      pts.setDrawRange(0, n); P.needsUpdate = C.needsUpdate = true;
      // rods, lines, held catches
      for (const p of players) {
        const s = S.get(p.pid), a = ctx.actor(p.pid);
        if (!s.rod && a) { s.rod = K.rod(a, p.color); if (s.rod) s.rod.g.scale.setScalar(0.6); }
        const H = s.hole >= 0 ? holes[s.hole] : null, tp = K.tipPos(s.rod, tip);
        if (H && (s.st === 1 || s.st === 2) && tp) s.line.set(tp, bp.set(H.g.position.x, -0.05 + (s.st === 2 ? Math.sin(t * 30) * 0.05 : 0), H.g.position.z), 0.1); else s.line.show(false);
        if (s.show) { s.showT -= dt; const at = ctx.pos(p.pid); if (at) s.show.position.set(at.x, 2.2 + Math.sin(t * 8) * 0.05, at.z); K.swim(s.show, t, 14); if (s.showT <= 0) { group.remove(s.show); s.show = null; } }
      }
      // my nearest hole: green ring = drop your line here, blue = chip it first
      const mine = me != null ? S.get(me) : null, at = me != null ? ctx.pos(me) : null;
      if (mine && at && mine.st === 0) {
        let best = null, bd = HOLE.near; for (const H of holes) { const d = Math.hypot(H.g.position.x - at.x, H.g.position.z - at.z); if (d <= bd) { bd = d; best = H; } }
        pick.visible = !!best; if (best) { pick.position.set(best.g.position.x, 0.03, best.g.position.z); pick.material.color.set(best.ice >= HOLE.fishable ? '#7fc8ff' : '#7dff9a'); }
      } else pick.visible = false;
    },
    dispose() { bar.el.remove(); clearTimeout(showBanner.t); clearTimeout(showCard.t); for (const tg of tags) tg.remove(); restore?.(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); K.dispose(); frost.dispose(); glow.dispose(); auroraTex.dispose(); },
  };
}
