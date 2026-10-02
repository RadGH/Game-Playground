// Farhold R28 — the keys build mode answers to, beyond the mouse.
//
//   Q / Shift+Q   turn the ghost one step (the wheel does the same)
//   F             free placement on / off: no grid, no snapping, any angle
//   C             build another of whatever is under the cursor (the eyedropper)
//   Shift (held)  the next click lays a LINE of the piece from the last one to the cursor
//
// Why its own file and its own listener, rather than lines in js/main.js's keydown handler: every
// key main.js listens for has to be a row in js/settings.js BINDINGS (tests/round17-ui.test.js
// fails otherwise, which is the rule that stopped one key having two owners). These keys mean
// something ONLY while build mode is up — the same arrangement js/build-radial.js already uses for
// its number keys — and outside build mode this listener does nothing at all, so Q, F and C keep
// whatever they mean elsewhere. F is the Followers screen on foot; main.js already ignores it in
// build mode, which is why it is free here.
//
// The listener is on `window` in the capture phase so it runs before the game's own handler and
// can swallow a key it used. Shift is never swallowed: it is still the run key.

/** The key strip, as data, so the card and the panel print the same words. */
export const BUILD_KEYS = {
  place: 'click place · Shift+click a line · Q or scroll turn · F free · C copy a piece · Ctrl+Z undo · right-click menu · B leave',
  run: 'click each corner · click a corner twice for a gate · Enter lay it · Esc drop the run · Ctrl+Z undo',
  brush: 'click to use · [ ] or scroll size the brush · Ctrl+Z undo · right-click menu · B leave',
  point: 'click the highlighted piece · C copy it · Ctrl+Z undo · right-click menu · B leave',
  stamp: 'click to stamp the layout · Q or scroll turn it · Ctrl+Z undo · right-click menu · B leave',
};

/** Which strip a tool shows. Pure, so the test can check every tool has one. */
export function keysForTool(tool) {
  if (tool === 'build') return BUILD_KEYS.place;
  if (tool === 'road' || tool === 'wall') return BUILD_KEYS.run;
  if (tool === 'stamp') return BUILD_KEYS.stamp;
  if (['remove', 'move', 'upgrade', 'route', 'pick'].includes(tool)) return BUILD_KEYS.point;
  return BUILD_KEYS.brush;
}

export function installBuildKeys({ build, onLog = null, onChange = null, isTyping = null } = {}) {
  if (typeof window === 'undefined') return { dispose() {} };
  const typing = e => {
    if (isTyping?.(e)) return true;
    const t = e.target;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };

  function onDown(e) {
    if (!build?.mode || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Shift') { build.setLine?.(true); return; }
    let used = true;
    if (e.code === 'KeyQ') {
      const step = build.plan?.rules?.rotateStep || Math.PI / 4;
      build.rotate(e.shiftKey ? -step : step);
    } else if (e.code === 'KeyF') {
      const on = build.setFree(!build.free);
      onLog?.(on ? 'Free placement: no grid, no snapping, any angle. F again to snap.' : 'Snapping again: grid, neighbours and walls.', '');
    } else if (e.code === 'KeyC') {
      const at = build.aimAt;
      const res = build.pickAt?.(at.x, at.z);
      if (res && !res.ok && res.why) onLog?.(res.why, 'warn');
    } else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); onChange?.(); }
  }
  function onUp(e) {
    if (e.key === 'Shift') build?.setLine?.(false);
  }
  function onBlur() { build?.setLine?.(false); }

  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  window.addEventListener('blur', onBlur);
  return {
    dispose() {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    },
  };
}
