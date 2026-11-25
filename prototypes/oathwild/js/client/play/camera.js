// The over-the-shoulder camera and the crosshair aim (Farhold's aim() idea: the ray through the middle of the screen
// decides what you aim at; the hero turns to it). The camera follows the DRAWN hero (after smoothing — lessons rule 51)
// and never dips under the ground.
//
//   const C = createCamera(view, { heightAt, tuning, settings })
//   C.look(dx, dy) (mouse px or pad units)  C.zoom(steps)  C.update(dt, hero{x,y,z})
//   C.forward() → {x, z} ground direction the camera faces    C.right() → {x, z}
//   C.aim({ units, range, exclude, assistDeg }) → { point:{x,y,z}, unit|null, dir:{x,z}, dist }
import * as THREE from 'three';

export function createCamera(view, { heightAt, tuning = {}, settings, solidsNear = null }) {
  const cam = view.camera;
  const T = k => tuning[k];
  const st = { yaw: Math.PI, pitch: 0.18, dist: settings.cameraDist || 4.6, wantDist: settings.cameraDist || 4.6, at: new THREE.Vector3(), ready: false };
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  function clearDist(f, cp, sp) {
    const want = st.wantDist, step = 0.25, margin = 0.35;
    const near = solidsNear(st.at.x - f.x * cp * want / 2, st.at.z - f.z * cp * want / 2, want / 2 + 2);
    if (!near.length) return want;
    for (let t = 0.6; t <= want; t += step) {
      const x = st.at.x - f.x * cp * t, z = st.at.z - f.z * cp * t, y = st.at.y + sp * t;
      for (const o of near) {
        if (y - heightAt(o.x, o.z) > (o.r > 2 ? 9 : 4.5)) continue;     // well above a roof / a trunk's top
        if (Math.hypot(x - o.x, z - o.z) < o.r + margin) return Math.max(0.6, t - step);
      }
    }
    return want;
  }

  const C = {
    state: st,
    look(dx, dy, { pad = false } = {}) {
      const k = (pad ? T('padSpeed') || 0.0028 : T('mouseSpeed') || 0.0024) * (settings.sens || 1);
      st.yaw -= dx * k;
      st.pitch = Math.max(-0.55, Math.min(1.1, st.pitch + dy * k * (settings.invertY ? -1 : 1)));
    },
    zoom(steps) { st.wantDist = Math.max(2.2, Math.min(9, st.wantDist + steps * 0.6)); },
    setYaw(y) { st.yaw = y; },
    setPitch(p) { st.pitch = Math.max(-0.55, Math.min(1.1, p)); },   // tests and look checks (radians; 0 = level, + looks down)
    forward() { return { x: Math.sin(st.yaw), z: Math.cos(st.yaw) }; },
    right() { return { x: -Math.cos(st.yaw), z: Math.sin(st.yaw) }; },
    update(dt, hero, { snap = false } = {}) {
      st.dist += (st.wantDist - st.dist) * Math.min(1, dt * (st.dist < st.wantDist - 0.05 && solidsNear ? 3 : 8));   // back out slowly after a wall
      const f = C.forward(), r = C.right();
      const side = (settings.hand === 'left' ? -1 : 1) * (T('cameraSide') ?? 0.75);
      // the point the camera looks past: above the hero's shoulder
      const tx = hero.x + r.x * side, tz = hero.z + r.z * side, ty = hero.y + (T('cameraHeight') ?? 1.65);
      const k = snap || !st.ready ? 1 : 1 - Math.exp(-dt * (T('cameraLag') || 14));
      st.at.x += (tx - st.at.x) * k; st.at.y += (ty - st.at.y) * k; st.at.z += (tz - st.at.z) * k;
      st.ready = true;
      const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      // a wall, a solid prop or a tree trunk between the shoulder and the camera: come in in front of it at once
      // (never film the inside of a house), then ease back out as the view clears
      if (solidsNear) {
        const free = clearDist(f, cp, sp);
        if (free < st.dist) st.dist = free;
      }
      let px = st.at.x - f.x * cp * st.dist, py = st.at.y + sp * st.dist, pz = st.at.z - f.z * cp * st.dist;
      const g = heightAt(px, pz) + 0.45;
      if (py < g) py = g;                                   // never under the ground: rise instead
      cam.position.set(px, py, pz);
      w.set(st.at.x + f.x * cp * 30, st.at.y - sp * 30 * 0.35, st.at.z + f.z * cp * 30);
      cam.lookAt(w);
      if (settings.fov && Math.abs(cam.fov - settings.fov) > 0.5 && innerWidth >= innerHeight) { cam.fov = settings.fov; cam.updateProjectionMatrix(); }
    },
    /** How far back the camera can sit before something solid is in the way (0.25 m steps, 0.35 m margin). */
    clearDist,
    /** What the crosshair points at: the first unit or ground along the ray through the screen's middle. */
    aim({ units = [], range = 80, from = null, assistDeg = 0, screen = null } = {}) {
      ray.setFromCamera(screen || { x: 0, y: 0 }, cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      // units: a sphere at the body's middle
      let best = null, bestT = Infinity;
      for (const u of units) {
        const r = (u.radius || 0.6);
        v.set(u.x - o.x, (u.y + (u.height || 1.8) * 0.55) - o.y, u.z - o.z);
        const t = v.dot(d);
        if (t < 0.5 || t > range + st.dist) continue;
        const miss = Math.sqrt(Math.max(0, v.lengthSq() - t * t));
        if (miss < r + (u.height || 1.8) * 0.25 && t < bestT) { best = u; bestT = t; }
      }
      // ground: march along the ray
      let gt = null;
      let prev = 0;
      for (let t = 1; t < range + st.dist; t += t < 20 ? 0.5 : 1.5) {
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
        if (y < heightAt(x, z)) { let a = prev, b = t; for (let i = 0; i < 8; i++) { const m = (a + b) / 2; const yy = o.y + d.y * m; if (yy < heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } gt = (a + b) / 2; break; }
        prev = t;
      }
      let point;
      if (best && (gt == null || bestT < gt)) point = { x: best.x, y: best.y + 0.1, z: best.z };
      else if (gt != null) point = { x: o.x + d.x * gt, y: o.y + d.y * gt, z: o.z + d.z * gt };
      else { const t = range; point = { x: o.x + d.x * t, y: heightAt(o.x + d.x * t, o.z + d.z * t), z: o.z + d.z * t }; }
      const hx = from ? from.x : o.x, hz = from ? from.z : o.z;
      let dx = point.x - hx, dz = point.z - hz;
      let len = Math.hypot(dx, dz);
      if (len < 0.5) { const f = C.forward(); dx = f.x; dz = f.z; len = 1; }
      let dir = { x: dx / len, z: dz / len };
      // aim assist (controller / touch): the nearest enemy within a few degrees of the aim
      if (assistDeg > 0 && !best && from) {
        const lim = Math.cos(assistDeg * Math.PI / 180);
        let pick = null, pd = Infinity;
        for (const u of units) {
          if (!u.hostile) continue;
          const ux = u.x - from.x, uz = u.z - from.z, ud = Math.hypot(ux, uz);
          if (ud < 0.5 || ud > 30) continue;
          if ((ux * dir.x + uz * dir.z) / ud < lim) continue;
          if (ud < pd) { pd = ud; pick = u; }
        }
        if (pick) { best = pick; dir = { x: (pick.x - from.x) / pd, z: (pick.z - from.z) / pd }; point = { x: pick.x, y: pick.y, z: pick.z }; len = pd; }
      }
      return { point, unit: best, dir, dist: len };
    },
  };
  return C;
}
