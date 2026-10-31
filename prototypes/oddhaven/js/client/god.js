// God view: a camera over the town you can push about with one finger, pinch, mouse, keyboard or controller. Up on the stick
// and W are always the top of the screen (game-standards), and it starts with north at the top; right-drag, Q/E, a two-finger
// twist or the right stick turn it. Tap anywhere and the caller gets the screen point.
//
//   const god = createGod({ THREE, camera, canvas, onTap, limit });
//   god.update(dt, input, active)     god.target  god.dist    god.goTo(x, z)
const PITCH = 1.2, MIN = 11, MAX = 330;   // steep: a five-storey block must not hide the street behind it

export function createGod({ THREE, camera, canvas, onTap, onGrab = null, limit = 1500, groundY = () => 8 }) {
  const self = { target: { x: 0, z: 0 }, dist: 26, yaw: 0, follow: null, active: false, moved: 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const place = () => {
    const y = groundY(self.target.x, self.target.z);
    camera.up.set(0, 1, 0);
    camera.position.set(self.target.x + Math.sin(self.yaw) * Math.cos(PITCH) * self.dist, y + Math.sin(PITCH) * self.dist, self.target.z + Math.cos(self.yaw) * Math.cos(PITCH) * self.dist);
    camera.lookAt(self.target.x, y, self.target.z);
    camera.updateMatrixWorld();
  };
  const groundUnder = (sx, sy) => {
    const r = canvas.getBoundingClientRect();
    ndc.set((sx - r.left) / r.width * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -groundY(self.target.x, self.target.z);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  };
  self.groundUnder = groundUnder;
  self.ray = (sx, sy) => { const r = canvas.getBoundingClientRect(); ndc.set((sx - r.left) / r.width * 2 - 1, -((sy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; };
  const clamp = () => { self.target.x = Math.max(-limit, Math.min(limit, self.target.x)); self.target.z = Math.max(-limit, Math.min(limit, self.target.z)); };
  const zoomBy = k => { self.want = null; self.dist = Math.max(MIN, Math.min(MAX, self.dist * k)); };
  /** A smooth move in, never out. Any zoom of your own takes over. */
  self.zoomTo = d => { if (self.dist > d) self.want = d; };

  // ---- fingers and the mouse: the ground under the finger stays under the finger
  const fingers = new Map();
  let down = null, pinch = null, tapOK = false, grabbed = null;
  const pointerDown = e => {
    if (!self.active || e.button === 2) return;    // the right button turns the camera (main.js)
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
    // a finger that lands on a person is dragging that person (Stir), not the town
    if (fingers.size === 1 && onGrab?.down(e.clientX, e.clientY)) { grabbed = e.pointerId; down = null; return; }
    if (fingers.size === 1) down = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0, ground: groundUnder(e.clientX, e.clientY) };
    else { down = null; pinch = null; }
  };
  const pointerMove = e => {
    if (grabbed === e.pointerId) { onGrab.move(e.clientX, e.clientY); return; }
    const f = fingers.get(e.pointerId); if (!f || !self.active) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    if (fingers.size === 1 && down) {
      down.moved += Math.hypot(dx, dy);
      if (down.moved > 9) {
        self.follow = null;
        place();
        const g = groundUnder(e.clientX, e.clientY);
        if (g && down.ground) { self.target.x += down.ground.x - g.x; self.target.z += down.ground.z - g.z; clamp(); self.moved++; }
      }
    } else if (fingers.size >= 2) {
      const [a, b] = [...fingers.values()], gap = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const twist = Math.atan2(b.y - a.y, b.x - a.x);
      if (pinch) {
        let turn = twist - pinch.twist; if (turn > Math.PI) turn -= Math.PI * 2; if (turn < -Math.PI) turn += Math.PI * 2;
        self.yaw += turn;
        zoomBy(pinch.gap / Math.max(20, gap));
        place();
        const g = groundUnder(mx, my), g0 = pinch.ground;
        if (g && g0) { self.target.x += g0.x - g.x; self.target.z += g0.z - g.z; clamp(); }
      }
      pinch = { gap, twist, ground: pinch?.ground || groundUnder(mx, my) };
      self.follow = null;
    }
  };
  const pointerUp = e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.delete(e.pointerId);
    if (grabbed === e.pointerId) { grabbed = null; tapOK = !onGrab.up(e.clientX, e.clientY, e.type === 'pointerup'); return; }
    if (fingers.size < 2) pinch = null;
    tapOK = !!(down && e.type === 'pointerup' && down.moved <= 9 && e.timeStamp - down.t < 500);
    if (!fingers.size) down = null;
  };
  // the tap is answered on `click`: answered on finger-up, a list opened under the finger took the click that follows
  canvas.addEventListener('click', e => { if (tapOK) { tapOK = false; onTap?.(e.clientX, e.clientY); } });
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', e => { if (self.active) { zoomBy(e.deltaY > 0 ? 1.12 : 0.89); e.preventDefault(); } }, { passive: false });

  const keys = new Set();
  addEventListener('keydown', e => { if (!/INPUT|TEXTAREA/.test(e.target?.tagName || '')) keys.add(e.code); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  self.goTo = (x, z, dist = null) => { self.target.x = x; self.target.z = z; if (dist) self.dist = dist; clamp(); };
  self.update = (dt, s, active) => {
    self.active = active;
    if (self.want != null) { self.dist += (self.want - self.dist) * Math.min(1, dt * 4); if (Math.abs(self.dist - self.want) < 0.2) { self.dist = self.want; self.want = null; } }
    if (active) {
      // keyboard and stick: my +1 is W is north is -z; speed grows with height, so high up you cross town in a moment
      const pan = self.dist * 1.1 * dt, mx = s?.mx || 0, my = s?.my || 0;
      if (mx || my) { const c = Math.cos(self.yaw), sn = Math.sin(self.yaw); self.target.x += (mx * c - my * sn) * pan; self.target.z += (-mx * sn - my * c) * pan; self.follow = null; clamp(); self.moved++; }
      if (keys.has('KeyQ')) self.yaw -= dt * 1.5;
      if (keys.has('KeyE')) self.yaw += dt * 1.5;
      if (s?.lookX) self.yaw += s.lookX * 1.6;
      if (keys.has('Minus') || keys.has('NumpadSubtract')) zoomBy(1 + dt * 1.6);
      if (keys.has('Equal') || keys.has('NumpadAdd')) zoomBy(1 - dt * 1.6);
      if (s?.lookY) zoomBy(1 + s.lookY * 0.9);
      if (s?.camNear) zoomBy(0.8);
      if (s?.camFar) zoomBy(1.25);
      if (self.follow) { const p = self.follow(); if (p) { self.target.x += (p.x - self.target.x) * Math.min(1, dt * 5); self.target.z += (p.z - self.target.z) * Math.min(1, dt * 5); } }
    }
    place();
  };
  return self;
}
