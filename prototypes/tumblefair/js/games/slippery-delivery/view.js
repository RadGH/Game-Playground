// SLIPPERY DELIVERY, as drawn: a rain-wet cobbled market square seen from above. At the bottom, a bakery with a
// striped awning and a counter, its loading spot marked with yellow dashes ("PIES"). At the top, a row of three
// little houses with coloured doors; the RUSH door has a glowing "RUSH x2" sign that hops to another door now and
// then. Wooden barrels roll back and forth across the square in lanes, shop signs spin on posts, crates and lamp posts
// stand about. Each player pushes a little red-and-cream cart with a wobbling stack of pies on it; a bump flings pies
// off to splat on the cobbles, and a delivery pops the score off the door.
import { barrelX, armAngle } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const A = ctx.arena, { hw, hd } = A, R = init.R;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  // ---- the square: wet cobbles, a wall round it, grass beyond
  const cobble = canvasTexture(256, 256, (g, w, H) => {
    g.fillStyle = '#5d6b7a'; g.fillRect(0, 0, w, H);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const ox = (y % 2) * 16; g.fillStyle = ['#8796a6', '#7a8a9b', '#90a0ae', '#808f9f'][(x * 3 + y) % 4]; g.beginPath(); g.roundRect(x * 32 + ox - 14, y * 32 + 3, 28, 26, 7); g.fill(); }
    g.fillStyle = 'rgba(190,225,255,.18)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse((i * 71) % w, (i * 113) % H, 26, 12, 0.3, 0, 7); g.fill(); }
  });
  cobble.wrapS = cobble.wrapT = THREE.RepeatWrapping; cobble.repeat.set(hw / 2, hd / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), std('#ffffff', { map: cobble, roughness: 0.28, metalness: 0.15 })); floor.receiveShadow = true; group.add(floor);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 70).rotateX(-Math.PI / 2), std('#5aa84a')); grass.position.y = -0.03; group.add(grass);
  const wallMat = std('#b9a58a', { flatShading: true });
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, hd * 2 + 1), wallMat); w.position.set(sx * (hw + 0.25), 0.35, 0); w.castShadow = true; group.add(w); }
  // ---- the bakery (bottom) and its loading spot
  const bakery = new THREE.Group(); bakery.position.set(0, 0, hd + 3.4); group.add(bakery);         // set back, so it never hides a cart at the counter
  const shop = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1, 2.0, 3), std('#f4e1c1')); shop.position.y = 1.0; shop.castShadow = true; bakery.add(shop);
  const awnTex = canvasTexture(256, 32, (g, w, H) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff5f7a'; g.fillRect(i * w / 16, 0, w / 16, H); } });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(R.counterW * 2 + 1.2, 0.12, 1.4), std('#ffffff', { map: awnTex })); awning.position.set(0, 1.55, -2.2); awning.rotation.x = -0.45; bakery.add(awning);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(R.counterW * 2, 0.9, 0.5), std('#8a5a34')); counter.position.set(0, 0.45, -2.95); counter.castShadow = true; bakery.add(counter);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.4, 0.3, 3.2), std('#c2533a')); roof.position.y = 2.1; bakery.add(roof);
  const dashTex = canvasTexture(128, 64, (g, w, H) => { g.strokeStyle = '#ffd23f'; g.lineWidth = 6; g.setLineDash([14, 10]); g.strokeRect(4, 4, w - 8, H - 8); });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(R.counterW * 2, R.counterD).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false }));
  pad.position.set(0, 0.015, hd - R.counterD / 2); group.add(pad);
  const padTag = stage.tag(counter, { text: 'PIES', height: 0.7, cls: 'sd-pies' });
  // ---- three houses (top) with doors; the RUSH sign
  const DOOR = ['#3d8bff', '#3ecf5a', '#ff8a1f'], houses = [];
  R.doors.forEach((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 0, -hd - 1.3); group.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.8, 2.4), std(['#f7e3c4', '#e9d5f5', '#d6f0e0'][i])); body.position.y = 1.4; body.castShadow = true; g.add(body);
    const rf = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.6, 4).rotateY(Math.PI / 4), std('#a8483a')); rf.scale.set(1, 1, 0.6); rf.position.y = 3.6; g.add(rf);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, 0.12), std(DOOR[i])); door.position.set(0, 0.95, 1.22); g.add(door);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(R.doorW * 2, R.doorD).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: DOOR[i], transparent: true, opacity: 0.28, depthWrite: false }));
    mat.position.set(x, 0.012, -hd + R.doorD / 2); group.add(mat);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.15), new THREE.MeshBasicMaterial({ color: '#ffe066' })); glow.position.set(0, 2.25, 1.25); g.add(glow);
    houses.push({ g, door, mat, glow, x });
  });
  const rushSpot = new THREE.Object3D(); group.add(rushSpot);
  const rushTag = stage.tag(rushSpot, { text: 'RUSH x2', height: 0.3, cls: 'sd-rush' });
  // ---- crates, lamp posts
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std('#b07a4a', { flatShading: true }), Math.max(1, A.blocks.length));
  A.blocks.forEach((b, i) => { m4.compose(v.set(b.x, 0.5, b.z), q.setFromEuler(e3.set(0, 0, 0)), sc.set(b.hw * 2, 1, b.hd * 2)); crates.setMatrixAt(i, m4); });
  crates.count = A.blocks.length; crates.castShadow = true; group.add(crates);
  for (const p of A.posts) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.6, p.r, 2.6, 8), std('#2d3640')); pole.position.set(p.x, 1.3, p.z); pole.castShadow = true; group.add(pole); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3b0' })); lamp.position.set(p.x, 2.7, p.z); group.add(lamp); }
  // ---- barrels and spinning signs
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.0, 14).rotateX(Math.PI / 2), barrelMat = std('#9a6236');
  const hoopGeo = new THREE.TorusGeometry(0.56, 0.05, 6, 16), hoopMat = std('#3a3a44', { metalness: 0.5 });
  const barrels = init.barrels.map(b => { const g = new THREE.Group(); const m = new THREE.Mesh(barrelGeo, barrelMat); m.castShadow = true; g.add(m); for (const z of [-0.3, 0.3]) { const hp = new THREE.Mesh(hoopGeo, hoopMat); hp.position.z = z; g.add(hp); } g.position.set(0, 0.55, b.z); group.add(g); return { b, g }; });
  const arms = init.arms.map(a => {
    const g = new THREE.Group(); g.position.set(a.x, 0, a.z); group.add(g);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.3, 8), std('#4a3a2a')); post.position.y = 0.65; g.add(post);
    const spin = new THREE.Group(); spin.position.y = 0.75; g.add(spin);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(a.L * 2, 0.16, 0.22), std('#e9d38a')); bar.castShadow = true; spin.add(bar);
    for (const sx of [-1, 1]) { const sign = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.1), std(sx > 0 ? '#ff5f7a' : '#39d0e0')); sign.position.set(sx * (a.L - 0.4), 0.3, 0); sign.castShadow = true; spin.add(sign); }
    return { a, spin };
  });
  // ---- a cart in front of every player, with its pie stack
  const trimMat = std('#fff1d6'), wheelMat = std('#2d2d33'), crust = std('#e8a656'), filling = std('#9b2d5a');
  const pieGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.12, 14), topGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12);
  const carts = new Map();
  function makeCart(color, dark) {
    const g = new THREE.Group(); g.position.set(0, 0, 1.0); g.scale.setScalar(1.35);                // a touch big, so it reads from the far camera
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 0.7), std(color)); box.position.y = 0.42; box.castShadow = true; g.add(box);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.76), std(dark)); lip.position.y = 0.6; g.add(lip);
    for (const [x, z] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.24], [0.42, 0.24]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10).rotateZ(Math.PI / 2), wheelMat); w.position.set(x, 0.16, z); g.add(w); }
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6).rotateZ(Math.PI / 2), trimMat); handle.position.set(0, 0.85, -0.42); g.add(handle);
    const pies = [];
    for (let i = 0; i < R.maxPies; i++) { const p = new THREE.Group(); const c = new THREE.Mesh(pieGeo, crust); const f = new THREE.Mesh(topGeo, filling); f.position.y = 0.065; p.add(c, f); p.position.set(0, 0.69 + i * 0.13, 0); p.visible = false; g.add(p); pies.push(p); }
    return { g, pies, n: 0 };
  }
  const flying = [], splats = [];
  const splatGeo = new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2);
  function flingPies(pid, n, x, z) {
    const c = carts.get(pid);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Group(); p.add(new THREE.Mesh(pieGeo, crust)); p.position.set(x, 1 + i * 0.13, z); group.add(p);
      const a = (pid * 1.7 + i * 2.3) % 6.28; flying.push({ p, vx: Math.sin(a) * 2.6, vz: Math.cos(a) * 2.6, vy: 3 + i, t: 0 });
    }
    if (c) c.wob = 1;
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pies' }), hud = h('div', 'sd-hud'), banner = h('div', 'sd-banner');
  const solo = ctx.players.length === 1;
  hud.innerHTML = `<span class="sd-cart"><b>Cart</b> <em>0</em>/${R.maxPies}</span>` + (solo ? `<span class="sd-medals">${R.medals.map((m, i) => `<i data-m="${i}">${['Bronze', 'Silver', 'Gold'][i]} ${m}</i>`).join('')}</span>` : '');
  ctx.ui.append(hud, banner);
  const cartEl = hud.querySelector('.sd-cart em'), medals = [...hud.querySelectorAll('.sd-medals i')];
  if (ctx.me == null) hud.querySelector('.sd-cart').style.display = 'none';
  const showBanner = (text, cls = '') => { banner.textContent = text; banner.className = 'sd-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'sd-banner'; }, 1500); };
  let tSim = 0, rush = -1;
  const stunned = new Map();
  return {
    start() { showBanner('Deliver!'); },
    state(g) {
      const e = g.t - tSim; if (Math.abs(e) > 0.5) tSim = g.t; else tSim += e * 0.2;
      if (g.rush !== rush) { rush = g.rush; houses.forEach((H, i) => { H.glow.material.color.set(i === rush ? '#ffe066' : '#555a60'); H.mat.material.opacity = i === rush ? 0.5 : 0.22; }); rushSpot.position.set(houses[rush].x, 0, -hd + R.doorD / 2); }
      for (const [pid, n] of Object.entries(g.pies)) {
        let c = carts.get(+pid);
        if (!c) { const a = ctx.actor(+pid); if (!a) continue; const pl = ctx.player(+pid); c = makeCart(pl?.color || '#d9483b', pl?.dark || '#7a1f1a'); a.body.group.add(c.g); carts.set(+pid, c); }
        if (c.n !== n) { c.n = n; c.pies.forEach((p, i) => { p.visible = i < n; }); }
        if (+pid === ctx.me && cartEl.textContent !== String(n)) { cartEl.textContent = n; cartEl.parentElement.classList.toggle('full', n === R.maxPies); }
      }
      if (solo && ctx.me != null) { const s = g.sc[ctx.me] || 0; medals.forEach((m, i) => m.classList.toggle('got', s >= R.medals[i])); }
      { const y = bar.el.offsetTop + bar.el.offsetHeight + 6; if (y > 20 && hud.dataset.y !== String(y)) { hud.dataset.y = y; hud.style.top = y + 'px'; } }   // under the score bar, however many rows it wraps to
      bar.set(g.sc, g.left);
    },
    event(ev) {
      const mine = ev.pid === ctx.me, a = ev.pid != null ? ctx.actor(ev.pid) : null;
      if (ev.e === 'load') { if (mine) ctx.sfx('pick'); }
      else if (ev.e === 'drop') { flingPies(ev.pid, ev.n, ev.x, ev.z); floatText(stage, ev.x, 1.8, ev.z, ev.n > 1 ? `-${ev.n} pies` : '-1 pie', 'bad'); if (mine) ctx.sfx('splat'); }
      else if (ev.e === 'bump') { if (mine) ctx.sfx('hit'); }
      else if (ev.e === 'hit') { stunned.set(ev.pid, performance.now() + 500); a?.play('hit', 500); ctx.sfx(mine ? 'bad' : 'hit'); }
      else if (ev.e === 'crash') { ctx.sfx('hit'); floatText(stage, ev.x, 1.6, ev.z, 'CRASH!', 'bad'); }
      else if (ev.e === 'deliver') {
        const H = houses[ev.door]; floatText(stage, H.x, 2.6, -hd + 0.5, `+${ev.pts}${ev.rush ? ' RUSH!' : ''}${ev.full ? ' FULL!' : ''}`, 'good');
        a?.play('cheer', 500); ctx.sfx(mine ? 'coins' : 'good');
      } else if (ev.e === 'rush') { ctx.sfx('pick'); }
      else if (ev.e === 'end') { showBanner('Closing time!'); ctx.sfx('win'); }
    },
    pose(pid, flags) { if (flags & F.STUN || (stunned.get(pid) || 0) > performance.now()) return 'hit'; return undefined; },
    frame(dt, t) {
      tSim += dt;
      for (const B of barrels) { const x = barrelX(B.b, tSim); B.g.position.x = x; B.g.rotation.z = -x / 0.55; }
      for (const S of arms) S.spin.rotation.y = -armAngle(S.a, tSim);
      for (const c of carts.values()) { c.wob = Math.max(0, (c.wob || 0) - dt * 2); c.pies.forEach((p, i) => { p.position.x = Math.sin(t * 9 + i) * 0.03 * i * (0.3 + c.wob); }); }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]; f.t += dt; f.vy -= 14 * dt; f.p.position.x += f.vx * dt; f.p.position.z += f.vz * dt; f.p.position.y += f.vy * dt; f.p.rotation.x += 6 * dt;
        if (f.p.position.y <= 0.05) {
          f.p.removeFromParent(); flying.splice(i, 1);
          const s = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({ color: '#9b2d5a', transparent: true, opacity: 0.85, depthWrite: false })); s.position.set(f.p.position.x, 0.02, f.p.position.z); s.scale.setScalar(0.8 + (i % 3) * 0.3); group.add(s); splats.push({ s, t: 0 });
        }
      }
      for (let i = splats.length - 1; i >= 0; i--) { const S = splats[i]; S.t += dt; if (S.t > 4) { S.s.material.opacity = Math.max(0, 0.85 - (S.t - 4) * 0.8); if (S.t > 5.1) { S.s.removeFromParent(); S.s.material.dispose(); splats.splice(i, 1); } } }
    },
    dispose() { bar.el.remove(); hud.remove(); banner.remove(); padTag.remove(); rushTag.remove(); clearTimeout(showBanner.t); cobble.dispose(); awnTex.dispose(); dashTex.dispose(); },
  };
}
