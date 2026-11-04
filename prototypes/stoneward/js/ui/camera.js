// Camera + every way of moving it: one finger / mouse drag pans, two fingers pinch, wheel and Q/E
// zoom, WASD / arrows pan (W = screen north — the map is never rotated, so screen north IS north),
// gamepad left stick pans, triggers zoom. Zoom is ppc (CSS px per cell); zooming far enough out
// turns the map into the globe (see globeAmount).
//
// The camera knows the world size so x wraps and y stays on the planet.

export function createCamera(world, el) {
  const cam = { x: world.W / 2, y: world.H / 2, ppc: 2, vx: 0, vy: 0 };
  const view = () => ({ w: el.clientWidth, h: el.clientHeight });
  // the furthest zoom shows the globe at ~38% of the short side; the nearest is 14 px a cell
  const minPpc = () => { const v = view(); return 2 * Math.PI * Math.min(v.w, v.h) * 0.38 / world.W; };
  const maxPpc = 14;

  function clamp() {
    cam.ppc = Math.max(minPpc(), Math.min(maxPpc, cam.ppc));
    cam.x = ((cam.x % world.W) + world.W) % world.W;
    cam.y = Math.max(0, Math.min(world.H, cam.y));
  }
  /** 0 = flat map, 1 = globe. Measured against the SHORT side, so a portrait phone gets a globe too:
   *  r = globe diameter / short side; it fades in from 1.5 down to 0.95. */
  // It SNAPS (play-test 1: the old cross-fade blended the lit map and the globe and the whole screen
  // went too bright), with a little gap between the two thresholds so it never flickers.
  let onGlobe = false;
  function globeAmount() {
    const v = view(); const r = world.W * cam.ppc / (Math.PI * Math.max(1, Math.min(v.w, v.h)));
    onGlobe = onGlobe ? r < 1.28 : r < 1.16;
    return onGlobe ? 1 : 0;
  }
  function zoomAt(f, sx, sy) {
    const v = view();
    const before = toWorld(sx, sy);
    cam.ppc *= f; clamp();
    if (globeAmount() > 0.3) return;            // on the globe, zoom about the centre
    const after = toWorld(sx, sy);
    cam.x += before.x - after.x; cam.y += before.y - after.y; clamp();
  }
  function toWorld(sx, sy) {
    const v = view();
    if (globeAmount() > 0.5) {
      // invert the globe shader (js/render/gl.js FS_GLOBE)
      const R = world.W * cam.ppc / (2 * Math.PI);
      const px = (sx - v.w / 2) / R, py = (sy - v.h / 2) / R, d2 = px * px + py * py;
      if (d2 >= 1) return { x: cam.x, y: cam.y, off: true };
      const n = [px, -py, Math.sqrt(1 - d2)];
      const th = (cam.y / world.H - 0.5) * Math.PI, cl = Math.cos(th), sl = Math.sin(th);
      const a = [n[0], n[1] * cl - n[2] * sl, n[1] * sl + n[2] * cl];
      const lon = Math.atan2(a[0], a[2]) + cam.x / world.W * Math.PI * 2;
      const lat = Math.asin(Math.max(-1, Math.min(1, a[1])));
      return { x: ((lon / (2 * Math.PI) * world.W) % world.W + world.W) % world.W, y: (0.5 - lat / Math.PI) * world.H, globe: true };
    }
    return { x: cam.x + (sx - v.w / 2) / cam.ppc, y: cam.y + (sy - v.h / 2) / cam.ppc };
  }
  function pan(dxPx, dyPx) {
    // on the globe a drag spins it: the same pixel moves fewer cells near the globe, so scale by globe size
    cam.x -= dxPx / cam.ppc; cam.y -= dyPx / cam.ppc; clamp();
  }
  function flyTo(x, y, ppc, ms = 700) {
    const from = { x: cam.x, y: cam.y, ppc: cam.ppc }, t0 = performance.now();
    let dx = x - from.x; if (dx > world.W / 2) dx -= world.W; if (dx < -world.W / 2) dx += world.W;
    cam.fly = now => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cam.x = from.x + dx * e; cam.y = from.y + (y - from.y) * e;
      cam.ppc = Math.exp(Math.log(from.ppc) + (Math.log(ppc ?? from.ppc) - Math.log(from.ppc)) * e);
      clamp(); if (k >= 1) cam.fly = null;
    };
  }

  // ---- input ----
  const pointers = new Map();
  let pinch = null, dragged = 0, tapHandler = null, tool = null, toolOn = false;
  const local = e => { const r = el.getBoundingClientRect(); return toWorld(e.clientX - r.left, e.clientY - r.top); };
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    dragged = 0; cam.fly = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: dist(a, b), ppc: cam.ppc }; if (toolOn) { tool.cancel?.(); toolOn = false; } }
    else if (pointers.size === 1 && tool && globeAmount() < 0.5) { toolOn = tool.down?.(local(e), e) !== false; }
  });
  el.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1 && toolOn) { tool.move?.(local(e), e); dragged += Math.abs(dx) + Math.abs(dy); }
    else if (pointers.size === 1) { pan(dx, dy); dragged += Math.abs(dx) + Math.abs(dy); }
    else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = el.getBoundingClientRect();
      const f = (pinch.ppc * dist(a, b) / pinch.d) / cam.ppc;
      zoomAt(f, mid.x - r.left, mid.y - r.top);
      pan(dx / 2, dy / 2); dragged += 99;
    }
  });
  const up = e => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (toolOn && pointers.size === 0) { toolOn = false; tool.up?.(local(e), e, dragged < 8); return; }
    if (p && dragged < 8 && pointers.size === 0 && tapHandler) tapHandler(local(e), e);
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  const keys = new Set();
  window.addEventListener('keydown', e => { if (e.target.closest?.('input,select,textarea')) return; keys.add(e.code); });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  /** Per-frame: keys, gamepad, flights. dt in seconds. */
  function update(dt, now) {
    if (cam.fly) { cam.fly(now); return; }
    const v = view();
    let ax = 0, ay = 0, z = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
    if (keys.has('KeyQ') || keys.has('Minus')) z -= 1;
    if (keys.has('KeyE') || keys.has('Equal')) z += 1;
    for (const gp of (navigator.getGamepads?.() || [])) {
      if (!gp) continue;
      const dz = a => Math.abs(a) < 0.18 ? 0 : a;
      ax += dz(gp.axes[0] || 0); ay += dz(gp.axes[1] || 0);
      z += (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
    }
    const speed = Math.min(v.w, v.h) * 1.1 * dt;
    if (ax || ay) pan(-ax * speed, -ay * speed);
    if (z) zoomAt(Math.exp(z * dt * 2.2), v.w / 2, v.h / 2);
  }

  return {
    cam, update, toWorld, flyTo, zoomAt, pan, globeAmount, clamp, minPpc, maxPpc,
    onTap(fn) { tapHandler = fn; },
    /** A tool takes single-finger drags (draw a road, place a building); two fingers still move the map. */
    setTool(t) { tool = t; toolOn = false; },
    get tool() { return tool; },
  };
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
