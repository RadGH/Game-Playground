// SNOW KIT — the browser-only winter dressing the Winter Fair games share (Sled Bash, Sleigh Loading, Frosty Freeze
// Tag), like ghost-tag/spooky-kit.js is for Halloween. Low-poly, instanced where things repeat, and everything it makes
// is freed by dispose(). Nothing here has rules in it.
//   const kit = snowKit(ctx);
//   kit.sky()                          a pale winter sky (the scene background only; lights are left alone), restored on dispose
//   kit.ground(size)                   a big soft-white snowfield at y = 0
//   kit.pines([[x, z, scale], …])      snow-capped pine trees (3 instanced meshes for any number)
//   kit.lumps([[x, z, sx, sy, sz], …]) snowdrift lumps (one instanced mesh); returns it, so a game can move them
//   kit.snowman(scale)                 a snowman group (three balls, coal eyes, carrot nose, a scarf)
//   kit.gift(color, ribbon, size)      a wrapped present group (box + ribbon cross + bow)
//   kit.snowfall({ hw, hd, count })    falling flakes over a box (one Points), animated by kit.frame
//   kit.puff(x, y, z, color?)          a little burst of snow
//   kit.frame(dt, t) / kit.dispose()
export const WINTER = { snow: '#f4f8ff', shade: '#d9e6f5', ice: '#bfe3f7', deep: '#7fb8de', pine: '#2f7a55', pineDark: '#235f43', trunk: '#6b4a35', red: '#e8394a', gold: '#ffd23f', sky: '#cfe4f7', ink: '#17324a' };

export function snowKit(ctx) {
  const { THREE, group, stage } = ctx;
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const snowMat = std(WINTER.snow, { roughness: 1 });
  let restore = null;
  const flakes = [], puffs = [];

  function sky(color = WINTER.sky) {
    const scene = stage?.scene; if (!scene || restore) return;
    const was = scene.background?.clone?.() ?? scene.background;
    scene.background = new THREE.Color(color);
    restore = () => { scene.background = was; };
  }
  function ground(size = 90) {
    const g = new THREE.Mesh(geo(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)), snowMat); g.position.y = -0.02; g.receiveShadow = true; group.add(g); return g;
  }
  function pines(spots) {
    const n = spots.length;
    const lower = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(1.1, 1.8, 7)), std(WINTER.pine, { flatShading: true }), n * 2);
    const caps = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(0.62, 0.8, 7)), snowMat, n);
    const trunks = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.15, 0.2, 0.9, 6)), std(WINTER.trunk), n);
    spots.forEach(([x, z, s = 1], i) => {
      m4.compose(v.set(x, 1.3 * s, z), q.identity(), sc.setScalar(s)); lower.setMatrixAt(i * 2, m4);
      m4.compose(v.set(x, 2.3 * s, z), q.setFromEuler(e3.set(0, 0.4, 0)), sc.setScalar(s * 0.72)); lower.setMatrixAt(i * 2 + 1, m4);
      m4.compose(v.set(x, 2.95 * s, z), q.identity(), sc.setScalar(s)); caps.setMatrixAt(i, m4);
      m4.compose(v.set(x, 0.45 * s, z), q.identity(), sc.setScalar(s)); trunks.setMatrixAt(i, m4);
    });
    lower.castShadow = true; caps.castShadow = true; group.add(lower, caps, trunks);
    return { lower, caps, trunks };
  }
  function lumps(list) {
    const L = new THREE.InstancedMesh(geo(new THREE.IcosahedronGeometry(1, 1)), snowMat, Math.max(1, list.length));
    list.forEach(([x, z, sx = 1, sy = 0.5, sz = 1], i) => { m4.compose(v.set(x, 0, z), q.identity(), sc.set(sx, sy, sz)); L.setMatrixAt(i, m4); });
    L.receiveShadow = true; L.castShadow = true; group.add(L); return L;
  }
  const ballGeo = geo(new THREE.IcosahedronGeometry(1, 2)), coalGeo = geo(new THREE.SphereGeometry(1, 6, 4)), noseGeo = geo(new THREE.ConeGeometry(0.06, 0.32, 6).rotateX(Math.PI / 2));
  const coal = std('#22262b'), carrot = std('#ff8a1f'), scarfMat = std(WINTER.red);
  function snowman(scale = 1, scarf = WINTER.red) {
    const g = new THREE.Group();
    for (const [y, r] of [[0.42, 0.48], [1.05, 0.36], [1.55, 0.26]]) { const b = new THREE.Mesh(ballGeo, snowMat); b.position.y = y; b.scale.setScalar(r); b.castShadow = true; g.add(b); }
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(coalGeo, coal); e.position.set(sx * 0.09, 1.62, 0.22); e.scale.setScalar(0.035); g.add(e); }
    for (const y of [0.98, 1.12]) { const b = new THREE.Mesh(coalGeo, coal); b.position.set(0, y, 0.35); b.scale.setScalar(0.04); g.add(b); }
    const nose = new THREE.Mesh(noseGeo, carrot); nose.position.set(0, 1.55, 0.36); g.add(nose);
    const sm = scarf === WINTER.red ? scarfMat : std(scarf);
    const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.27, 0.07, 6, 16).rotateX(Math.PI / 2)), sm); ring.position.y = 1.33; g.add(ring);
    const tail = new THREE.Mesh(geo(new THREE.BoxGeometry(0.12, 0.34, 0.05)), sm); tail.position.set(0.16, 1.18, 0.24); tail.rotation.z = 0.25; g.add(tail);
    g.scale.setScalar(scale); return g;
  }
  const boxGeo = geo(new THREE.BoxGeometry(1, 1, 1)), bowGeo = geo(new THREE.TorusGeometry(0.16, 0.06, 6, 12));
  const giftMats = new Map();
  const giftMat = c => { if (!giftMats.has(c)) giftMats.set(c, std(c, { roughness: 0.55 })); return giftMats.get(c); };
  function gift(color = WINTER.red, ribbon = WINTER.gold, size = 0.6) {
    const g = new THREE.Group(), body = new THREE.Mesh(boxGeo, giftMat(color)); body.scale.setScalar(size); body.position.y = size / 2; body.castShadow = true; g.add(body);
    const rm = giftMat(ribbon);
    const r1 = new THREE.Mesh(boxGeo, rm); r1.scale.set(size * 1.02, size * 1.02, size * 0.18); r1.position.y = size / 2; g.add(r1);
    const r2 = new THREE.Mesh(boxGeo, rm); r2.scale.set(size * 0.18, size * 1.02, size * 1.02); r2.position.y = size / 2; g.add(r2);
    for (const s of [-1, 1]) { const b = new THREE.Mesh(bowGeo, rm); b.position.set(s * size * 0.14, size + 0.06, 0); b.rotation.set(0, Math.PI / 2, s * 0.5); b.scale.setScalar(size / 0.6); g.add(b); }
    return g;
  }
  function snowfall({ hw = 10, hd = 10, count = 160, top = 9 } = {}) {
    const pos = new Float32Array(count * 3), spd = new Float32Array(count);
    let s = 12345; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) { pos[i * 3] = (r() * 2 - 1) * hw; pos[i * 3 + 1] = r() * top; pos[i * 3 + 2] = (r() * 2 - 1) * hd; spd[i] = 0.6 + r() * 0.8; }
    const g = geo(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.9, depthWrite: false }); mats.push(m);
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; group.add(pts);
    flakes.push({ pos, spd, count, top, hw, hd, g }); return pts;
  }
  const puffGeo = geo(new THREE.IcosahedronGeometry(0.22, 0));
  function puff(x, y, z, color = '#ffffff', n = 8, power = 1) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });      // its own material, freed when the puff ends
    const list = [];
    for (let i = 0; i < n; i++) { const p = new THREE.Mesh(puffGeo, m), a = i / n * Math.PI * 2; p.position.set(x, y, z); p.userData.v = [Math.sin(a) * 2.6 * power, (2.2 + (i % 3) * 0.9) * power, Math.cos(a) * 2.6 * power]; group.add(p); list.push(p); }
    puffs.push({ list, m, t: 0 });
  }
  return {
    sky, ground, pines, lumps, snowman, gift, snowfall, puff, std, basic, geo, snowMat,
    frame(dt, t) {
      for (const f of flakes) {
        for (let i = 0; i < f.count; i++) {
          const k = i * 3; f.pos[k + 1] -= f.spd[i] * dt; f.pos[k] += Math.sin(t * 0.8 + i) * dt * 0.25;
          if (f.pos[k + 1] < 0) { f.pos[k + 1] += f.top; }
        }
        f.g.attributes.position.needsUpdate = true;
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const P = puffs[i]; P.t += dt;
        for (const p of P.list) { const u = p.userData.v; u[1] -= 9 * dt; p.position.x += u[0] * dt; p.position.y = Math.max(0.05, p.position.y + u[1] * dt); p.position.z += u[2] * dt; p.scale.setScalar(1 + P.t * 1.5); }
        P.m.opacity = Math.max(0, 0.95 - P.t * 1.4);
        if (P.t > 0.7) { for (const p of P.list) p.removeFromParent(); P.m.dispose(); puffs.splice(i, 1); }
      }
    },
    dispose() {
      restore?.(); restore = null;
      for (const P of puffs) { for (const p of P.list) p.removeFromParent(); P.m.dispose(); }
      for (const x of texs) x.dispose(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose();
    },
  };
}
