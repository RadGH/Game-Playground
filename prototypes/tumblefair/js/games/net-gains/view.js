// NET GAINS, as drawn: a shallow turquoise lagoon over a sandy bottom (the water surface is a see-through sheet at
// knee height, so everyone wades), palm trees and sand round the edge, and a wooden dock on each side flying its
// team's colours (left = red + green, right = blue + pink) with its banking zone marked on the water. Each team's net
// is a see-through mesh panel strung between its two holders on floats: team-coloured while it works, red and slack
// when it is bunched or pulled tight, gold when it is full; a tag over it counts the fish and points inside. Fish are
// two instanced meshes (bodies + tails, coloured per species), so a lagoon full of them is two draws. A CPU deckhand
// is a non-player Chibi character. Splashes throw a ring of spray.
import { NET, DOCK, SPECIES_LIST } from './sim.js';
import { BY_ID } from '../fish-species.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';

const TEAM = [{ name: 'Red & Green', color: '#ff5f5f', alt: '#3ecf5a' }, { name: 'Blue & Pink', color: '#3d8bff', alt: '#ff6ad5' }];

export function createView(ctx) {
  const { THREE, group, stage, players, me, init } = ctx, HW = ctx.season === 'halloween';
  const { hw, hd } = ctx.arena, mats = [], geos = [], tags = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }); mats.push(m); return m; };
  const g_ = geo => { geos.push(geo); return geo; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const WATER_Y = 0.3;
  // ---- sand, lagoon bottom, water sheet
  const sand = new THREE.Mesh(g_(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std(HW ? '#5a4a5a' : '#f2d9a0', { roughness: 1 })); sand.position.y = -0.02; sand.receiveShadow = true; group.add(sand);
  const bottom = new THREE.Mesh(g_(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2)), std(HW ? '#3a3a5a' : '#e8c890', { roughness: 1 })); bottom.position.y = 0; bottom.receiveShadow = true; group.add(bottom);
  const waterTex = canvasTexture(256, 256, (c, w) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(160,220,255,.7)'; c.lineWidth = 3; let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * w; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 14, y - 6, x + 28, y); c.stroke(); } });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(hw / 3, hd / 3);
  const water = new THREE.Mesh(g_(new THREE.PlaneGeometry(hw * 2 + 1.4, hd * 2 + 1.4).rotateX(-Math.PI / 2)), std(HW ? '#8a70e0' : '#22b4e8', { map: waterTex, transparent: true, opacity: 0.5, roughness: 0.2, depthWrite: false }));
  water.position.y = WATER_Y; group.add(water);
  // the rim: a low sandbank all round
  const rimM = std(HW ? '#4a3a4a' : '#e0c080');
  for (const [x, z, w, d] of [[0, -hd - 0.7, hw * 2 + 2.8, 1.4], [0, hd + 0.7, hw * 2 + 2.8, 1.4], [-hw - 0.7, 0, 1.4, hd * 2], [hw + 0.7, 0, 1.4, hd * 2]]) { const m = new THREE.Mesh(g_(new THREE.BoxGeometry(w, 0.5, d)), rimM); m.position.set(x, 0.2, z); m.receiveShadow = true; group.add(m); }
  // palms
  const PT = 8, trunk = new THREE.InstancedMesh(g_(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6)), std('#9a6a3a'), PT), leaves = new THREE.InstancedMesh(g_(new THREE.ConeGeometry(1.3, 0.5, 7)), std(HW ? '#2c4a35' : '#3fae55', { flatShading: true }), PT);
  for (let i = 0; i < PT; i++) { const x = (i % 4 - 1.5) * 6.2, z = i < 4 ? -hd - 2.6 : hd + 2.4; m4.compose(v.set(x, 1.3, z), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (i % 2 ? 1 : -1) * 0.12), sc.setScalar(1)); trunk.setMatrixAt(i, m4); m4.compose(v.set(x + (i % 2 ? -0.3 : 0.3), 2.7, z), q.setFromAxisAngle(up, i), sc.setScalar(1)); leaves.setMatrixAt(i, m4); }
  trunk.castShadow = leaves.castShadow = true; group.add(trunk, leaves);
  // ---- docks + banking zones
  for (const t of [0, 1]) {
    if (!init.teams.find(T => T.t === t)?.pids.length) continue;
    const sx = t ? 1 : -1, T = TEAM[t];
    const deck = new THREE.Mesh(g_(new THREE.BoxGeometry(2.2, 0.18, DOCK.hd * 2 + 0.6)), std(HW ? '#6a4a3a' : '#b07a4a')); deck.position.set(sx * (hw + 0.6), WATER_Y + 0.12, 0); deck.castShadow = deck.receiveShadow = true; group.add(deck);
    const pole = new THREE.Mesh(g_(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6)), std('#ffffff')); pole.position.set(sx * (hw + 1.2), 1.4, -DOCK.hd); group.add(pole);
    const flag = new THREE.Mesh(g_(new THREE.PlaneGeometry(0.9, 0.55)), std(T.color, { side: THREE.DoubleSide })); flag.position.set(sx * (hw + 1.2) - sx * 0.46, 2.35, -DOCK.hd); flag.rotation.y = Math.PI / 2; group.add(flag);
    const flag2 = new THREE.Mesh(g_(new THREE.PlaneGeometry(0.9, 0.4)), std(T.alt, { side: THREE.DoubleSide })); flag2.position.set(sx * (hw + 1.2) - sx * 0.46, 1.9, -DOCK.hd); flag2.rotation.y = Math.PI / 2; group.add(flag2);
    const zone = new THREE.Mesh(g_(new THREE.PlaneGeometry(hw - DOCK.x + 0.4, DOCK.hd * 2).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: T.color, transparent: true, opacity: 0.28, depthWrite: false })); mats.push(zone.material);
    zone.position.set(sx * (DOCK.x + (hw - DOCK.x) / 2 - 0.2), WATER_Y + 0.01, 0); group.add(zone);
    tags.push(stage.tag(flag, { text: 'BANK', height: 0.5, cls: 'ng-bank' }));
  }
  // ---- fish: instanced bodies + tails
  const MAXF = 40, bodyGeo = g_(new THREE.SphereGeometry(0.5, 10, 8)), tailGeo = g_(new THREE.ConeGeometry(0.3, 0.42, 4).rotateX(-Math.PI / 2));
  const fishBodies = new THREE.InstancedMesh(bodyGeo, std('#ffffff', { roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.12 }), MAXF), fishTails = new THREE.InstancedMesh(tailGeo, std('#ffffff', { roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.12 }), MAXF);
  fishBodies.count = fishTails.count = 0; group.add(fishBodies, fishTails);
  const fish = new Map();
  // ---- nets
  const netTex = canvasTexture(128, 64, (c, w, hh) => { c.clearRect(0, 0, w, hh); c.strokeStyle = '#ffffff'; c.lineWidth = 3; for (let x = 0; x <= w; x += 12) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, hh); c.stroke(); } for (let y = 0; y <= hh; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.lineWidth = 6; c.beginPath(); c.moveTo(0, 2); c.lineTo(w, 2); c.stroke(); });
  netTex.wrapS = THREE.RepeatWrapping;
  const nets = [0, 1].map(t => {
    const m = new THREE.MeshBasicMaterial({ map: netTex.clone(), color: TEAM[t].color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }); m.map.wrapS = THREE.RepeatWrapping; m.map.needsUpdate = true; mats.push(m);
    const mesh = new THREE.Mesh(g_(new THREE.PlaneGeometry(1, 0.7, 8, 1)), m); mesh.visible = false; group.add(mesh);
    const floats = new THREE.InstancedMesh(g_(new THREE.SphereGeometry(0.08, 8, 6)), std(HW ? '#ff8a1a' : '#ffd23f'), 7); floats.visible = false; group.add(floats);
    const tagEl = stage.tag(mesh, { text: '', height: 0.6, cls: 'ng-net empty' }); tags.push(tagEl);
    return { mesh, floats, tagEl, len: 0, active: 0, count: 0, load: 0 };
  });
  // ---- deckhands (non-player characters)
  const decks = new Map();
  for (const T of init.teams) if (T.deck) {
    const D = { a: null, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, ty: 0, sp: 0 }; decks.set(T.t, D);
    ctx.createActor({ look: { race: 'human', seed: 40 + T.t * 7 }, seat: null }, {}).then(a => { if (a) { D.a = a; tags.push(stage.tag(a.group, { text: T.deck, height: a.height + 0.35, cls: 'ng-deck' })); } });
  }
  // ---- splash rings
  const rings = [], ringGeo = g_(new THREE.RingGeometry(0.4, 0.55, 28).rotateX(-Math.PI / 2));
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })); mats.push(r.material); r.position.y = WATER_Y + 0.02; group.add(r); rings.push({ r, t: 1 }); }
  let ri = 0;
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'gp-pill'), banner = h('div', 'gp-banner'); ctx.ui.append(pill, banner);
  const medals = init.medals ? h('div', 'fk-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const showBanner = (html, cls = '', ms = 1500) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  const myTeam = me != null ? init.teams.find(T => T.pids.includes(me))?.t ?? null : null;
  const teamWord = t => (t === myTeam ? 'Your team' : TEAM[t].name);
  let last = null;
  const portrait = () => innerHeight > innerWidth * 1.15;
  const FULL = { cx: 0, cz: 0, hw: hw + 1.6, hd: hd + 0.8 };
  let camX = 0;
  return {
    halloween: { spots: [[-hw - 2, 0, -hd - 1.6], [hw + 2, 0, -hd - 1.6], [-hw - 2, 0, hd + 1.6], [hw + 2, 0, hd + 1.6], [0, 0, -hd - 2.2]], ghosts: [[-4, 2.6, -hd - 1], [4, 2.8, -hd - 1.5]], y: 0.3, mist: false },
    state(g) {
      last = g; bar.set(g.sc, g.left);
      const seen = new Set();
      for (const [id, x, z, hh, si] of g.f) { seen.add(id); let f = fish.get(id); if (!f) { f = { x, z, h: hh, sp: SPECIES_LIST[si] }; fish.set(id, f); } f.tx = x; f.tz = z; f.th = hh; }
      for (const id of [...fish.keys()]) if (!seen.has(id)) fish.delete(id);
      g.t.forEach(([score, load, count, active, len], t) => Object.assign(nets[t], { score, load, count, active, len }));
      for (const [t, x, z, yaw, sp] of g.d) { const D = decks.get(t); if (D) { if (!D.seen) { D.x = x; D.z = z; D.seen = 1; } D.tx = x; D.tz = z; D.ty = yaw; D.sp = sp; } }
      if (myTeam != null) { const N = nets[myTeam]; pill.innerHTML = `<b>Your net</b> ${N.count}/${NET.cap} fish · ${N.load} pts <em>${N.count >= NET.cap ? 'FULL — go bank it!' : N.count >= NET.heavy ? 'heavy — bank it!' : N.active ? 'catching' : N.len < NET.min ? 'spread out!' : 'too far apart!'}</em>`; }
      else pill.innerHTML = init.teams.filter(T => T.pids.length).map(T => `<b style="color:${TEAM[T.t].color}">${TEAM[T.t].name}</b> ${nets[T.t].score}`).join(' · ');
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[players[0].pid] || 0) >= init.medals[i]));
    },
    event(ev) {
      if (ev.e === 'scoop') { const sp = BY_ID[ev.sp]; floatText(stage, ev.x, 1.2, ev.z, `+${ev.pts}${sp.pts >= 8 ? ' ★' : ''}`, ev.team === myTeam ? 'good' : ''); if (ev.team === myTeam) { ctx.sfx(sp.pts >= 8 ? 'coins' : 'pick'); if (ev.full) showBanner('Net full!<small>bring it home to your dock</small>', '', 1600); } if (ev.sp === 'old-gilbert') showBanner(`${teamWord(ev.team)} caught<small>Old Gilbert! +20</small>`, 'good', 2000); }
      else if (ev.e === 'bank') { const D = TEAM[ev.team]; floatText(stage, (ev.team ? 1 : -1) * (hw - 0.4), 1.6, 0, `+${ev.pts} banked`, 'good'); if (ev.team === myTeam) { showBanner(`+${ev.pts}<small>${ev.n} fish banked</small>`, 'good', 1300); ctx.sfx('coins'); } void D; }
      else if (ev.e === 'splash') { const R = rings[ri = (ri + 1) % rings.length]; R.r.position.x = ev.x; R.r.position.z = ev.z; R.t = 0; if (ev.pid === me) ctx.sfx('splat'); else ctx.actor(ev.pid)?.play('cast', 360); }
      else if (ev.e === 'big') { showBanner('Old Gilbert!<small>stretch your net WIDE to catch him</small>', '', 2400); ctx.sfx('trap'); }
      else if (ev.e === 'tooSmall') { if (ev.team === myTeam) showBanner('Too narrow!<small>spread out for Old Gilbert</small>', 'bad', 1400); }
      else if (ev.e === 'end') { const p0 = last?.sc?.[players[0].pid] ?? 0; showBanner(init.solo ? `${p0} pts<small>${p0 >= init.medals[2] ? '🥇 Gold!' : p0 >= init.medals[1] ? '🥈 Silver' : p0 >= init.medals[0] ? '🥉 Bronze' : 'Keep netting!'}</small>` : 'Nets up!', 'good', 4000); ctx.sfx('win'); }
    },
    pose(pid, flags) { if (flags & 8) return 'cheer'; return undefined; },
    frame(dt, t) {
      // camera: the whole lagoon, or on an upright phone a slice that follows you
      if (me != null && portrait()) { const at = ctx.pos(me), lim = FULL.hw - 6.5, want = Math.max(-lim, Math.min(lim, at ? at.x : 0)); camX += (want - camX) * Math.min(1, dt * 4); ctx.camera({ cx: camX, cz: 0, hw: 6.5, hd: FULL.hd }); }
      else ctx.camera(FULL);
      waterTex.offset.set(t * 0.02, t * 0.013);
      // fish
      let i = 0; const k = 1 - Math.exp(-dt * 10);
      for (const f of fish.values()) {
        if (i >= MAXF) break;
        f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k; let dh = f.th - f.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); f.h += dh * k;
        const sp = BY_ID[f.sp], L = sp.size * (f.sp === 'old-gilbert' ? 1.5 : 1.5);
        q.setFromAxisAngle(up, f.h); m4.compose(v.set(f.x, 0.2 + 0.03 * Math.sin(t * 3 + f.x), f.z), q, sc.set(L * 0.55, L * 0.45, L)); fishBodies.setMatrixAt(i, m4); fishBodies.setColorAt(i, col.set(sp.color));
        const wig = Math.sin(t * 12 + f.z * 3) * 0.4, tq = new THREE.Quaternion().setFromAxisAngle(up, f.h + wig);
        m4.compose(v.set(f.x - Math.sin(f.h) * L * 0.55, 0.2, f.z - Math.cos(f.h) * L * 0.55), tq, sc.set(L * 0.35, L, L)); fishTails.setMatrixAt(i, m4); fishTails.setColorAt(i, col.set(sp.color));
        i++;
      }
      fishBodies.count = fishTails.count = i; fishBodies.instanceMatrix.needsUpdate = fishTails.instanceMatrix.needsUpdate = true;
      if (fishBodies.instanceColor) fishBodies.instanceColor.needsUpdate = true; if (fishTails.instanceColor) fishTails.instanceColor.needsUpdate = true;
      // deckhands
      for (const [tt, D] of decks) {
        if (!D.a) continue; const kk = 1 - Math.exp(-dt * 12); D.x += (D.tx - D.x) * kk; D.z += (D.tz - D.z) * kk; let dy = D.ty - D.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); D.yaw += dy * kk;
        D.a.place(D.x, 0, D.z, D.yaw); D.a.setSpeed?.(D.sp); D.a.setPose?.(last && last.left <= 0 ? 'cheer' : 'idle'); D.a.update(dt); void tt;
      }
      // nets: a panel between the two holders
      for (const T of init.teams) {
        const N = nets[T.t]; if (!T.pids.length) continue;
        const A = ctx.pos(T.pids[0]), B = T.deck ? (decks.get(T.t)?.a ? { x: decks.get(T.t).x, z: decks.get(T.t).z } : null) : ctx.pos(T.pids[1]);
        if (!A || !B) { N.mesh.visible = false; N.floats.visible = false; continue; }
        const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
        N.mesh.visible = N.floats.visible = L > 0.3;
        const slack = !N.active, sag = slack ? 0.25 : 0;
        N.mesh.position.set((A.x + B.x) / 2, WATER_Y + 0.12 - sag, (A.z + B.z) / 2); N.mesh.rotation.set(0, Math.atan2(-dz, dx), slack ? 0.25 : 0); N.mesh.scale.set(L, slack ? 0.6 : 1, 1);
        N.mesh.material.map.repeat.set(Math.max(1, L / 1.2), 1);
        N.mesh.material.color.set(N.count >= NET.cap ? '#ffd23f' : slack ? '#ff8a8a' : TEAM[T.t].color); N.mesh.material.opacity = slack ? 0.55 : 0.85;
        for (let j = 0; j < 7; j++) { const u = j / 6; m4.compose(v.set(A.x + dx * u, WATER_Y + 0.46 - sag * 1.5 + Math.sin(t * 3 + j) * 0.02, A.z + dz * u), q.identity(), sc.setScalar(1)); N.floats.setMatrixAt(j, m4); }
        N.floats.instanceMatrix.needsUpdate = true;
        const txt = N.count ? `${N.count}/${NET.cap} · ${N.load} pts` : ''; if (N.txt !== txt) { N.txt = txt; N.tagEl.set(txt); N.tagEl.el.classList.toggle('empty', !txt); }
        N.tagEl.el.classList.toggle('full', N.count >= NET.cap);
      }
      for (const R of rings) { if (R.t >= 1) { R.r.material.opacity = 0; continue; } R.t = Math.min(1, R.t + dt * 1.6); R.r.scale.setScalar(1 + R.t * 5); R.r.material.opacity = 0.8 * (1 - R.t); }
    },
    dispose() { bar.el.remove(); for (const tg of tags) tg.remove(); clearTimeout(showBanner.t); for (const m of mats) { m.map?.dispose?.(); m.dispose(); } for (const g of geos) g.dispose(); waterTex.dispose(); netTex.dispose(); },
  };
}
