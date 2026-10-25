// A roof light bar for the siren vehicles (fire truck, ambulance, patrol car). The base goes into the caller's kit
// (merged with the body); the two lamp clusters are their own meshes with their OWN emissive materials, so one
// vehicle flashing never lights up another. Flashing only changes emissive colour/intensity (uniforms) — no THREE
// lights are ever made or toggled, so nothing recompiles a shader mid-game.
//
//   const bar = lightBar(THREE, k, opts, { at: [x, y, z], width: 1.1 });
//   group.add(bar.group);   // after k.finish(group)
//   lights = bar.lights;    // { left, right } meshes (+x = left)
//   bar.update(st);         // reads st.acts.siren and st.t
export function lightBar(THREE, k, { enhance = m => m } = {}, { at, width = 1.1, depth = 0.26, height = 0.14, left = '#ff2a1a', right = '#2a5cff', mid = true } = {}) {
  const [x, y, z] = at;
  const group = new THREE.Group();
  // base + end caps (static, merged into the body)
  k.box('trim', [width, 0.07, depth + 0.04], [x, y + 0.035, z], { bevel: 0.02 });
  for (const sx of [1, -1]) k.box('trim', [0.05, 0.1, 0.08], [x + sx * width * 0.3, y - 0.03, z], { bevel: 0 });   // feet
  const seg = mid ? width * 0.36 : width * 0.48;
  if (mid) k.box('lamp', [width - 2 * seg - 0.04, height * 0.8, depth * 0.8], [x, y + 0.07 + height * 0.4, z], { bevel: 0.02 });
  const lens = (col, sx) => {
    // a lens: a box whose top face is pulled in a little (the domed toy look)
    const g = new THREE.BoxGeometry(seg, height, depth, 1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.86); p.setZ(i, p.getZ(i) * 0.8); }
    g.computeVertexNormals();
    const c = new THREE.Color(col);
    const m = enhance(new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.55), roughness: 0.25, metalness: 0, emissive: c, emissiveIntensity: 0.12 }));
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x + sx * (width / 2 - seg / 2 - 0.01), y + 0.07 + height / 2, z);
    mesh.castShadow = true;
    mesh.name = sx > 0 ? 'light:left' : 'light:right';
    group.add(mesh);
    return mesh;
  };
  const lights = { left: lens(left, 1), right: lens(right, -1) };
  const set = (mesh, v) => { mesh.material.emissiveIntensity = v; };
  let was = null;
  return {
    group, lights,
    update(st) {
      const on = !!st?.acts?.siren;
      if (!on) { if (was !== false) { set(lights.left, 0.12); set(lights.right, 0.12); was = false; } return; }
      was = true;
      const t = st.t ?? performance.now() / 1000;
      // each side double-flashes, the two sides alternate (~1.6 cycles a second)
      const ph = (t * 1.6) % 1;
      const flash = (p) => (p < 0.12 || (p > 0.2 && p < 0.32)) ? 3.2 : 0.15;
      set(lights.left, flash(ph));
      set(lights.right, flash((ph + 0.5) % 1));
    },
  };
}
