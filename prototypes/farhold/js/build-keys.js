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
  moving: 'click put it down · Q or scroll turn · F free · Esc put it back where it was',
  run: 'click each corner · click a corner twice for a gate · Enter lay it · Esc drop the run · Ctrl+Z undo',
  brush: 'click to use · [ ] or scroll size the brush · Ctrl+Z undo · right-click menu · B leave',
  point: 'click the highlighted piece · C build another of it · Ctrl+Z undo · right-click menu · B leave',
  stamp: 'click to stamp the layout · Q or scroll turn it · Ctrl+Z undo · right-click menu · B leave',
};

/** Which strip a tool shows. Pure, so the test can check every tool has one. */
export function keysForTool(tool, { moving = false } = {}) {
  if (tool === 'build') return moving ? BUILD_KEYS.moving : BUILD_KEYS.place;
  if (tool === 'road' || tool === 'wall') return BUILD_KEYS.run;
  if (tool === 'stamp') return BUILD_KEYS.stamp;
  if (['remove', 'move', 'upgrade', 'repair', 'route', 'pick'].includes(tool)) return BUILD_KEYS.point;
  return BUILD_KEYS.brush;
}

/**
 * R28 — THE CARD'S LIVE LINE for whatever tool is up: the green/amber/red verdict while placing,
 * the run's bill while one is being clicked out, what the click will do to the piece under the
 * cursor, a layout's fit and bill. `{ text, tone }` with tone '' | 'bad' | 'level'. Pure over the
 * build controller's getters, so the panel and the ring's card cannot disagree.
 */
export function liveLine(build, tool = null) {
  if (!build) return { text: '', tone: '' };
  const t = build.tool;
  if (t === 'road' || t === 'wall') {
    const ri = build.runInfo;
    if (!ri) return { text: t === 'wall' ? 'Click the first corner. Fences and hedges are runs too.' : 'Click the first corner of the road.', tone: '' };
    return { text: runText(ri), tone: ri.ok ? '' : 'bad' };
  }
  if (t === 'stamp') {
    const si = build.stampInfo;
    if (!si) return { text: tool?.hint || '', tone: '' };
    return si.ok ? { text: `${si.name}: ${si.fits} of ${si.total} fit here · ${si.text || 'free'} · click to stamp`, tone: '' } : { text: si.why || '', tone: 'bad' };
  }
  if (['remove', 'move', 'upgrade', 'repair', 'pick', 'copy'].includes(t)) {
    const pt = build.lastPoint;
    return pt?.text ? { text: pt.text, tone: pt.ok ? '' : 'bad' } : { text: tool?.hint || '', tone: '' };
  }
  if (t !== 'build') return { text: tool?.hint || '', tone: '' };
  const li = build.lineInfo;
  if (li) {
    return li.count
      ? { text: `Shift+click: ${li.count} in a line for ${li.text}${li.blocked ? ` · ${li.blocked} will not fit` : ''}${li.ok ? '' : ` · ${li.why}`}`, tone: li.ok ? '' : 'bad' }
      : { text: li.why || '', tone: 'bad' };
  }
  const why = build.lastCheck;
  if (!build.selected) return { text: 'Pick something from the ring (right-click).', tone: '' };
  if (!why || why.x == null) return { text: 'Aim at the ground.', tone: '' };
  if (!why.ok) return { text: why.why || '', tone: 'bad' };
  const carry = build.moving ? `Carrying the ${build.moving.name}. ` : '';
  return { text: carry + verdictText(why) + (build.free ? ' (free placement — F to snap)' : ''), tone: why.levels ? 'level' : '' };
}

export function verdictText(check) {
  if (!check?.ok) return check?.why || '';
  if (check.levels) return 'Clear — it levels the ground under it first. Click to build.';
  if (check.mount) return 'Clear — hung on the wall. Click to build.';
  return 'Clear. Click to build.';
}

/** R28 — a run being clicked out: "24 m · 12 sections, 1 gate · 72 timber, 10 steel". */
export function runText(ri) {
  if (!ri) return '';
  const parts = [`${Math.round(ri.metres)} m`];
  if (ri.count) parts.push(`${ri.count} section${ri.count === 1 ? '' : 's'}${ri.gates ? `, ${ri.gates} gate${ri.gates === 1 ? '' : 's'}` : ''}`);
  parts.push(ri.text || 'free');
  // the leg out to the cursor is not in the bill until it is clicked (Enter lays the corners only)
  const tail = !ri.preview && ri.next >= 1.5 ? ` · click to add ${Math.round(ri.next)} m more, Enter to lay` : ri.preview ? ' · click the next corner' : '';
  return parts.join(' · ') + (ri.ok ? '' : ` — ${ri.why}`) + tail;
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
    } else if (e.code === 'Escape' && build.moving) {
      // with a piece in hand, Esc puts it back before anything else gets the key
      build.cancelMove?.();
      onLog?.('Put back where it was.', '');
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
