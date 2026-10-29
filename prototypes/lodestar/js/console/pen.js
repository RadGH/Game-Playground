// The light pen: the cursor on the scope. Mouse (the tip sits under the pointer), touch (the reticle is drawn 40 px
// ABOVE the finger so the finger never hides what it draws, with a dotted cord back to it), and the left stick (with
// gentle snapping to things worth pointing at). It also owns the scope's hands-on gestures: drag to pan when no tool
// is up, two fingers to pan + pinch (pinch steps the Range knob a detent at a time), wheel on the glass = Range.
//
// Line tools (WALL, ROAD, RAIL, ORDER) draw a blueprint while held; a click tool (BUILD, CLEAR) acts on release.
// The pen never moves a unit (PLAN §0.3): it only aims, draws and places.

export const LINE_TOOLS = new Set(['wall', 'road', 'rail', 'order']);

export function createPen({ glass, view, data, getTool, getSettings, onStroke, onClick, onZoom, onTap = () => {}, onMove = () => {}, snapTargets = () => [], sound = () => {} }) {
  const P = data.pen;
  const pen = { x: view.cx, y: view.cy, sx: 0, sy: 0, finger: null, over: false, src: 'none' };
  let stroke = null, drag = null, touches = new Map(), pinch = null, padHeld = false;

  const rect = () => glass.getBoundingClientRect();
  function placeAt(sx, sy, src) {
    const [W, H] = view.screen;
    pen.sx = Math.max(0, Math.min(W, sx)); pen.sy = Math.max(0, Math.min(H, sy));
    const [x, y] = view.toCell(pen.sx, pen.sy); pen.x = x; pen.y = y; pen.src = src;
    if (stroke) extend();
    onMove(pen);
  }
  /** Keep the pen on the same cell after the view moved under it (pan / zoom). */
  function follow() { const [sx, sy] = view.toScreen(pen.x, pen.y); pen.sx = sx; pen.sy = sy; }
  function cellNow() { return [Math.round(pen.x), Math.round(pen.y)]; }
  function begin() {
    const tool = getTool();
    if (LINE_TOOLS.has(tool)) { stroke = { tool, pts: [cellNow()] }; sound('press'); return true; }
    return false;
  }
  function extend() {
    const p = cellNow(), last = stroke.pts[stroke.pts.length - 1];
    const minStep = Math.max(2, Math.round(10 / view.ppc));
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) stroke.pts.push(p);
  }
  function finish() {
    if (!stroke) return;
    const s = stroke; stroke = null;
    const p = cellNow(), last = s.pts[s.pts.length - 1];
    if (p[0] !== last[0] || p[1] !== last[1]) s.pts.push(p);
    if (s.pts.length >= 2) onStroke(s.tool, s.pts);
    else onClick('tap:' + s.tool, s.pts[0]); // a tap with a line tool (M4: WALL tap on a wall = a gate)
  }
  function clickHere() { const tool = getTool(); if (tool && !LINE_TOOLS.has(tool)) onClick(tool, cellNow()); }

  // ---- pointer (mouse / pen / touch) ----
  const local = e => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  glass.addEventListener('contextmenu', e => e.preventDefault());
  glass.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { glass.setPointerCapture(e.pointerId); } catch { /* */ }
    const [lx, ly] = local(e);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [lx, ly]);
      if (touches.size === 2) { stroke = null; drag = null; startPinch(); return; }
      if (touches.size > 2) return;
      const off = getSettings().penOffset ? P.touchOffsetPx : 0;
      pen.finger = [lx, ly]; placeAt(lx, ly - off, 'touch');
      if (!begin()) drag = { x: lx, y: ly, moved: 0, kind: getTool() ? 'click' : 'pan' };
      return;
    }
    placeAt(lx, ly, 'mouse');
    if (e.button === 1 || e.button === 2 || (e.button === 0 && !getTool())) { drag = { x: lx, y: ly, moved: 0, kind: 'pan' }; glass.classList.add('panning'); return; }
    if (e.button === 0 && !begin()) drag = { x: lx, y: ly, moved: 0, kind: 'click' };
  });
  glass.addEventListener('pointermove', e => {
    const [lx, ly] = local(e);
    pen.over = true;
    if (e.pointerType === 'touch') {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, [lx, ly]);
      if (pinch) return movePinch();
      const off = getSettings().penOffset ? P.touchOffsetPx : 0;
      if (drag?.kind === 'pan') { view.panPx(drag.x - lx, drag.y - ly); drag.moved += Math.abs(drag.x - lx) + Math.abs(drag.y - ly); drag.x = lx; drag.y = ly; pen.finger = [lx, ly]; placeAt(lx, ly - off, 'touch'); return; }
      pen.finger = [lx, ly]; placeAt(lx, ly - off, 'touch');
      if (drag) drag.moved += 1;
      return;
    }
    if (drag?.kind === 'pan') { view.panPx(drag.x - lx, drag.y - ly); drag.moved += Math.abs(drag.x - lx) + Math.abs(drag.y - ly); drag.x = lx; drag.y = ly; follow(); placeAt(lx, ly, 'mouse'); return; }
    placeAt(lx, ly, 'mouse');
  });
  const up = e => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (pinch) { if (touches.size < 2) pinch = null; return; }
      pen.finger = null;
    }
    glass.classList.remove('panning');
    if (stroke) finish();
    else if (drag?.kind === 'click' && drag.moved < 12) clickHere();
    else if (drag?.kind === 'pan' && drag.moved < 6 && !getTool() && (e.pointerType !== 'mouse' || e.button === 0)) onTap(cellNow());
    drag = null;
  };
  glass.addEventListener('pointerup', up);
  glass.addEventListener('pointercancel', e => { touches.delete(e.pointerId); stroke = null; drag = null; pinch = null; pen.finger = null; });
  glass.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') pen.over = false; });
  glass.addEventListener('wheel', e => {
    e.preventDefault();
    const [lx, ly] = local(e);
    acc += e.deltaMode ? Math.sign(e.deltaY) * 100 : e.deltaY;
    if (Math.abs(acc) >= 50) { onZoom(acc < 0 ? 1 : -1, lx, ly); acc = 0; follow(); }
  }, { passive: false });
  let acc = 0;

  function startPinch() {
    const [a, b] = [...touches.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
    pen.finger = null;
  }
  function movePinch() {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    view.panPx(pinch.mx - mx, pinch.my - my); pinch.mx = mx; pinch.my = my;
    // pinch snaps to the Range knob's detents (the knob turns on the desk too, so the metaphor holds)
    if (d / pinch.d > 1.35) { onZoom(1, mx, my); pinch.d = d; }
    else if (d / pinch.d < 0.74) { onZoom(-1, mx, my); pinch.d = d; }
    follow();
  }

  // ---- gamepad ----
  function padMove(lx, ly, dt) {
    const speed = P.padSpeedPx * [0.55, 1, 1.6][getSettings().padSpeed ?? 1];
    const [W, H] = view.screen;
    if (lx || ly) {
      if (pen.src !== 'pad') { if (!pen.over || pen.src === 'none') { pen.sx = W / 2; pen.sy = H / 2; } }
      let sx = pen.sx + lx * speed * dt, sy = pen.sy + ly * speed * dt;
      // push past the glass edge = pan the scope that way
      const m = 14;
      if (sx < m || sx > W - m || sy < m || sy > H - m) { view.panPx(sx < m ? sx - m : sx > W - m ? sx - (W - m) : 0, sy < m ? sy - m : sy > H - m ? sy - (H - m) : 0); }
      placeAt(Math.max(m, Math.min(W - m, sx)), Math.max(m, Math.min(H - m, sy)), 'pad');
      pen.moving = true;
    } else if (pen.moving) {
      pen.moving = false;
      // snap: when the stick lets go near something worth pointing at, the pen settles on it
      let best = null, bd = P.snapPx;
      for (const t of snapTargets()) { const [tx, ty] = view.toScreen(t.x, t.y); const d = Math.hypot(tx - pen.sx, ty - pen.sy); if (d < bd) { bd = d; best = [tx, ty]; } }
      if (best && !stroke) placeAt(best[0], best[1], 'pad');
    }
  }
  return {
    pen, follow,
    get stroke() { return stroke; },
    get busy() { return !!stroke || !!pinch || !!drag; },
    padDown() { padHeld = true; if (pen.src === 'none') { const [W, H] = view.screen; placeAt(W / 2, H / 2, 'pad'); } if (!begin()) { if (getTool()) clickHere(); else onTap(cellNow()); } },
    padUp() { if (!padHeld) return; padHeld = false; finish(); },
    /** B while drawing: take back the last point (true if it did something). */
    back() { if (!stroke) return false; if (stroke.pts.length > 1) stroke.pts.pop(); else stroke = null; sound('stop'); return true; },
    cancel() { stroke = null; drag = null; pinch = null; },
    padMove, placeAt,
  };
}
