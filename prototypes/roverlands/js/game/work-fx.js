// What the M7 jobs draw (js/game/work-play.js uses it): flames + smoke for every fire (two Points draws for ALL fires
// together, refilled on the CPU — a few hundred particles), tall coloured beacons over the places that matter to you
// (one pooled cylinder each), text signs (sprites), the hurt people waiting for an ambulance, stinger strips, hydrants
// (one instanced draw), the tow winch's cable and crates that fall off a truck. No lights (a light switched on and off
// recompiles every material — docs: three.js shader-recompile stutter), no textures from files.
//
//   const fx = createWorkFx({ THREE, scene, world, enhance });
//   fx.fires(list, dt)              list = [{ id, x, y, z, r, heat, kind }] (the room's fires) -> flames and smoke
//   fx.beacons([{ x, z, y?, color }])   up to 16 columns of light
//   fx.sign(text, color, x, z, h, w) -> sprite (kept until dispose)
//   fx.people([{ id, x, z, y? }])   lying patients on stretchers
//   fx.spikes([{ id, p }])          stinger strips
//   fx.hydrants(list)               once: red posts at { x, z }
//   fx.cable(a, b) / fx.cable(null) the winch line between two { x, y, z }
//   fx.spill(x, y, z)               a crate tumbling off a load
//   fx.update(camera, dt)           animate; signs hide when the camera is right on them or far away
//   fx.draws() / fx.dispose()

const MAX_FLAME = 520, MAX_SMOKE = 300;

function dotTexture(THREE, inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createWorkFx({ THREE, scene, world, enhance = m => m }) {
  const root = new THREE.Group(); root.name = 'work-fx'; scene.add(root);
  const ground = (x, z) => world.heightAt(x, z);
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  // ---- flames + smoke: one Points each, every fire's particles packed in
  function cloud(max, tex, size, blending, opacity) {
    const geo = keep(new THREE.BufferGeometry());
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = keep(new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, opacity, depthWrite: false, blending, sizeAttenuation: true }));
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
    root.add(pts);
    return { pts, geo, pos, col, max, parts: [] };
  }
  const flame = cloud(MAX_FLAME, keep(dotTexture(THREE, 'rgba(255,240,190,1)', 'rgba(255,120,30,0.7)')), 2.6, THREE.AdditiveBlending, 0.95);
  const smoke = cloud(MAX_SMOKE, keep(dotTexture(THREE, 'rgba(70,70,74,0.9)', 'rgba(60,60,64,0.45)')), 7, THREE.NormalBlending, 0.42);
  const seeds = new Map();          // fire id -> { flames: [particles], smoke: [particles] }
  const rnd = Math.random;
  function spawn(f, kind) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * f.r * (f.kind === 'grass' ? 0.95 : 0.7);
    const gx = f.x + Math.cos(a) * d, gz = f.z + Math.sin(a) * d, gy = ground(gx, gz);
    const tall = f.kind === 'house' || f.kind === 'barn' || f.kind === 'warehouse' ? 6 : f.kind === 'hay' ? 2.5 : 0.6;
    return kind === 'flame'
      ? { x: gx, y: gy + rnd() * tall, z: gz, vy: 1.6 + rnd() * 2.2, life: 0.5 + rnd() * 0.7, age: 0 }
      : { x: gx, y: gy + tall + 1 + rnd() * 2, z: gz, vy: 1.4 + rnd() * 1.5, life: 3 + rnd() * 3, age: 0, dx: (rnd() - 0.5) * 0.8 };
  }
  function fires(list, dt) {
    const live = new Set(list.map(f => f.id));
    for (const id of [...seeds.keys()]) if (!live.has(id)) seeds.delete(id);
    let nf = 0, ns = 0;
    const wantF = f => Math.round(Math.max(10, Math.min(130, f.heat / 2.5))), wantS = f => Math.round(Math.max(6, Math.min(70, f.heat / 5)));
    for (const f of list) {
      let s = seeds.get(f.id); if (!s) { s = { flames: [], smoke: [] }; seeds.set(f.id, s); }
      const nF = Math.min(wantF(f), MAX_FLAME - nf), nS = Math.min(wantS(f), MAX_SMOKE - ns);
      while (s.flames.length < nF) s.flames.push(spawn(f, 'flame'));
      while (s.smoke.length < nS) s.smoke.push(spawn(f, 'smoke'));
      if (s.flames.length > nF) s.flames.length = nF;
      if (s.smoke.length > nS) s.smoke.length = nS;
      for (let i = 0; i < s.flames.length; i++) {
        const p = s.flames[i]; p.age += dt; p.y += p.vy * dt;
        if (p.age > p.life) { s.flames[i] = spawn(f, 'flame'); continue; }
        const k = 1 - p.age / p.life;
        flame.pos.set([p.x, p.y, p.z], nf * 3); flame.col.set([1, 0.45 + 0.5 * k, 0.12 * k], nf * 3); nf++;
      }
      for (let i = 0; i < s.smoke.length; i++) {
        const p = s.smoke[i]; p.age += dt; p.y += p.vy * dt; p.x += p.dx * dt;
        if (p.age > p.life) { s.smoke[i] = spawn(f, 'smoke'); continue; }
        const k = 1 - p.age / p.life, g = 0.25 + 0.35 * (1 - k);
        smoke.pos.set([p.x, p.y, p.z], ns * 3); smoke.col.set([g, g, g * 1.04], ns * 3); ns++;
      }
    }
    for (const [c, n] of [[flame, nf], [smoke, ns]]) { c.geo.setDrawRange(0, n); c.geo.attributes.position.needsUpdate = true; c.geo.attributes.color.needsUpdate = true; c.pts.visible = n > 0; }
  }

  // ---- beacons: tall soft columns over the places that matter (a pool)
  const beamGeo = keep(new THREE.CylinderGeometry(0.9, 0.9, 90, 10, 1, true));
  const beams = [];
  function beacons(list) {
    for (let i = 0; i < Math.max(list.length, beams.length) && i < 16; i++) {
      let b = beams[i];
      if (!b && list[i]) { b = new THREE.Mesh(beamGeo, keep(new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))); b.renderOrder = 4; root.add(b); beams.push(b); }
      if (!b) continue;
      const it = list[i];
      b.visible = !!it;
      if (!it) continue;
      b.material.color.set(it.color || '#ffd84a');
      b.position.set(it.x, (it.y ?? ground(it.x, it.z)) + 45, it.z);
    }
  }

  // ---- signs (sprites with text)
  const signs = [];
  function sign(text, color, x, z, h = 6, w = 6.4) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.font = '800 46px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = Math.min(500, g.measureText(text).width + 70);
    g.fillStyle = 'rgba(14,19,22,0.84)'; g.beginPath(); g.roundRect((512 - tw) / 2, 14, tw, 92, 46); g.fill();
    g.lineWidth = 6; g.strokeStyle = color; g.stroke(); g.fillStyle = '#f2ead8'; g.fillText(text, 256, 62);
    const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })));
    sp.scale.set(w, w / 4, 1); sp.renderOrder = 9; sp.position.set(x, ground(x, z) + h, z);
    root.add(sp); signs.push(sp); return sp;
  }
  // a post under each sign so it stands somewhere
  const postGeo = keep(new THREE.CylinderGeometry(0.08, 0.08, 1, 6)), postMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#5a5f66' })));
  function post(x, z, h) { const m = new THREE.Mesh(postGeo, postMat); m.scale.y = h; m.position.set(x, ground(x, z) + h / 2, z); root.add(m); return m; }

  // ---- people waiting on stretchers
  const bodyMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#e06a2a' }))), skinMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#e8c39e' })));
  const boardMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#d8dde2' }))), legMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#33415a' })));
  const boardGeo = keep(new THREE.BoxGeometry(0.62, 0.08, 2.0)), torsoGeo = keep(new THREE.BoxGeometry(0.46, 0.24, 0.72)), legGeo = keep(new THREE.BoxGeometry(0.38, 0.18, 0.86)), headGeo = keep(new THREE.SphereGeometry(0.16, 10, 8));
  const pool = [];
  function person() {
    const g = new THREE.Group();
    const board = new THREE.Mesh(boardGeo, boardMat); board.position.y = 0.12;
    const torso = new THREE.Mesh(torsoGeo, bodyMat); torso.position.set(0, 0.28, 0.32);
    const legs = new THREE.Mesh(legGeo, legMat); legs.position.set(0, 0.25, -0.5);
    const head = new THREE.Mesh(headGeo, skinMat); head.position.set(0, 0.3, 0.86);
    g.add(board, torso, legs, head); root.add(g); return g;
  }
  function people(list) {
    while (pool.length < list.length) pool.push(person());
    pool.forEach((g, i) => { const p = list[i]; g.visible = !!p; if (p) { g.position.set(p.x, (p.y ?? ground(p.x, p.z)) + 0.02, p.z); g.rotation.y = (p.id * 1.7) % (Math.PI * 2); } });
  }

  // ---- stinger strips
  const spikeGeo = keep(new THREE.BoxGeometry(3.6, 0.08, 0.45)), spikeMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#2a2d31' })));
  const tipGeo = keep(new THREE.BoxGeometry(0.3, 0.12, 0.5)), tipMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#f2c94c' })));
  const strips = [];
  function spikes(list) {
    while (strips.length < list.length) {
      const g = new THREE.Group(); g.add(new THREE.Mesh(spikeGeo, spikeMat));
      for (const s of [-1, 1]) { const t = new THREE.Mesh(tipGeo, tipMat); t.position.x = s * 1.8; g.add(t); }
      root.add(g); strips.push(g);
    }
    strips.forEach((g, i) => { const s = list[i]; g.visible = !!s; if (s) { g.position.set(s.p[0], ground(s.p[0], s.p[2]) + 0.05, s.p[2]); g.rotation.y = s.yaw || 0; } });
  }

  // ---- hydrants (one instanced draw)
  let hyd = null;
  function hydrants(list) {
    if (hyd || !list.length) return;
    const geo = keep(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8)); const mat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#c8322a' })));
    hyd = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((h, i) => { const x = h.x + 6, z = h.z + 6; m.makeTranslation(x, ground(x, z) + 0.45, z); hyd.setMatrixAt(i, m); });
    hyd.instanceMatrix.needsUpdate = true; hyd.computeBoundingSphere(); root.add(hyd);
  }

  // ---- the winch's cable
  const cableGeo = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const cableLine = new THREE.Line(cableGeo, keep(new THREE.LineBasicMaterial({ color: '#202326' }))); cableLine.visible = false; cableLine.frustumCulled = false; root.add(cableLine);
  function cable(a, b) {
    cableLine.visible = !!(a && b); if (!a || !b) return;
    const p = cableGeo.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
  }

  // ---- crates that fall off a load
  const crateGeo = keep(new THREE.BoxGeometry(0.7, 0.6, 0.7)), crateMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#a77a46' })));
  const falling = [];
  function spill(x, y, z) {
    const m = new THREE.Mesh(crateGeo, crateMat); m.position.set(x, y, z); root.add(m);
    falling.push({ m, vx: (Math.random() - 0.5) * 3, vy: 2.5, vz: (Math.random() - 0.5) * 3, age: 0 });
  }

  function update(camera, dt) {
    for (const s of signs) { const d = s.position.distanceTo(camera.position); s.visible = d > 8 && d < 300; }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i]; f.age += dt; f.vy -= 9.8 * dt;
      f.m.position.x += f.vx * dt; f.m.position.z += f.vz * dt; f.m.position.y = Math.max(ground(f.m.position.x, f.m.position.z) + 0.3, f.m.position.y + f.vy * dt);
      f.m.rotation.x += dt * 3; f.m.rotation.z += dt * 2;
      if (f.age > 6) { f.m.removeFromParent(); falling.splice(i, 1); }
    }
  }
  const draws = () => { let n = 0; root.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) n++; }); return n; };
  function dispose() { root.removeFromParent(); for (const d of disposables) d.dispose?.(); }
  return { fires, beacons, sign, post, people, spikes, hydrants, cable, spill, update, draws, dispose, root };
}
