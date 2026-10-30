// Game controllers. In menus the d-pad / left stick walks a highlight over the buttons, A presses,
// B goes back. In the game the left stick moves a cursor over the world (A uses the tool, hold to
// paint), the right stick moves the view, LB/RB change tab, d-pad left/right picks a tile,
// up/down sizes the brush, triggers zoom, X pauses, Y shows the tile's card, Start opens the menu.
// Browsers only expose controllers on secure pages (https).

export function createPad(app, play) {
  let prev = [];
  let focus = null;
  let cursor = null;      // world point
  let down = false;
  let repeatT = 0;
  const pressed = (b, i) => b[i] && !prev[i];

  function focusables() {
    const top = [...document.querySelectorAll('.modal-back')].pop()
      || document.querySelector('.rgs-signin-back, .whatsnew-back')
      || [...document.querySelectorAll('.screen')].find(s => !s.classList.contains('hidden'))
      || null;
    if (!top) return [];
    return [...top.querySelectorAll('button:not([disabled]), input, [tabindex="0"]')].filter(e => e.offsetParent !== null);
  }
  function setFocus(e) {
    focus?.classList.remove('pad-focus');
    focus = e;
    if (e) { e.classList.add('pad-focus'); e.scrollIntoView?.({ block: 'nearest' }); }
  }
  function move(dx, dy) {
    const list = focusables();
    if (!list.length) return;
    if (!focus || !list.includes(focus)) return setFocus(list[0]);
    const r = focus.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e === focus) continue;
      const q = e.getBoundingClientRect();
      const ex = q.left + q.width / 2 - cx, ey = q.top + q.height / 2 - cy;
      const along = ex * dx + ey * dy;
      if (along <= 4) continue;
      const side = Math.abs(ex * dy - ey * dx);
      const s = along + side * 2.5;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) setFocus(best);
  }
  function back() {
    const close = document.querySelector('.modal-back [data-close], .modal-back .small-btn');
    const m = document.querySelector('.modal-back');
    if (m) { m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); if (close) close.click(); return; }
    const b = [...document.querySelectorAll('.screen:not(.hidden) [data-back]')][0];
    if (b) b.click();
  }

  function poll() {
    requestAnimationFrame(poll);
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const g = pads[0];
    if (!g) return;
    const b = g.buttons.map(x => x.pressed);
    const ax = g.axes;
    const inMenu = !play.s || !!document.querySelector('.modal-back, .rgs-signin-back, .whatsnew-back');
    const now = performance.now();
    if (inMenu) {
      const dx = (b[15] ? 1 : 0) - (b[14] ? 1 : 0) || (Math.abs(ax[0]) > 0.6 ? Math.sign(ax[0]) : 0);
      const dy = (b[13] ? 1 : 0) - (b[12] ? 1 : 0) || (Math.abs(ax[1]) > 0.6 ? Math.sign(ax[1]) : 0);
      if ((dx || dy) && now > repeatT) { move(dx, dy); repeatT = now + (repeatT ? 180 : 320); }
      if (!dx && !dy) repeatT = 0;
      if (pressed(b, 0)) { if (!focus || !document.contains(focus)) move(0, 1); else focus.click(); }
      if (pressed(b, 1)) back();
      if (pressed(b, 9) && play.s && document.querySelector('.modal-back')) back();
    } else {
      const st = app.stage;
      if (!cursor) cursor = st.toWorld(innerWidth / 2, innerHeight / 2);
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      const sp = 1.6 / Math.max(0.6, st.cam.zoom / 3);
      // choosing a base: the cursor starts on the chosen spot and only takes over once the stick moves
      if (play.s.placing && play.pick && !dz(ax[0]) && !dz(ax[1])) cursor = [play.pick[0], play.pick[1]];
      cursor[0] += dz(ax[0]) * sp; cursor[1] += dz(ax[1]) * sp;
      const w = play.s.sim.world;
      cursor[0] = Math.max(0, Math.min(w.W - 1, cursor[0])); cursor[1] = Math.max(0, Math.min(w.H - 1, cursor[1]));
      // keep the cursor on screen by moving the view with it
      const [sx, sy] = st.toScreen(cursor[0], cursor[1]);
      if (sx < 40 || sx > innerWidth - 40) st.cam.x += (sx < 40 ? -1 : 1) * sp;
      if (sy < 80 || sy > innerHeight - 240) st.cam.y += (sy < 80 ? -1 : 1) * sp;
      st.cam.x += dz(ax[2] || 0) * 3 / st.cam.zoom * 3; st.cam.y += dz(ax[3] || 0) * 3 / st.cam.zoom * 3;
      if (g.buttons[6]?.value > 0.3) st.zoomAt(innerWidth / 2, innerHeight / 2, 1 - 0.03 * g.buttons[6].value);
      if (g.buttons[7]?.value > 0.3) st.zoomAt(innerWidth / 2, innerHeight / 2, 1 + 0.03 * g.buttons[7].value);
      st.clamp();
      play.setCursor([cursor[0], cursor[1]]);
      if (b[0] && !down) { down = true; play.padDown(cursor[0], cursor[1]); }
      else if (b[0] && down) play.padMove(cursor[0], cursor[1]);
      else if (!b[0] && down) { down = false; play.padUp(); }
      if (pressed(b, 4)) play.nextTab(-1);
      if (pressed(b, 5)) play.nextTab(1);
      if (pressed(b, 14)) play.nextTile(-1);
      if (pressed(b, 15)) play.nextTile(1);
      if (pressed(b, 12)) play.brushBy(1);
      if (pressed(b, 13)) play.brushBy(-1);
      if (pressed(b, 2)) play.togglePause();
      if (pressed(b, 9)) play.openMenu();
      if (pressed(b, 3) && play.page) play.select(play.page);
    }
    prev = b;
  }
  requestAnimationFrame(poll);
  return {
    refocus() { setFocus(null); cursor = null; },
  };
}
