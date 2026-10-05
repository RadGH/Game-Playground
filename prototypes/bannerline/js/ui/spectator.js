// Spectator mode, the screen side (shared by Line War in main.js and Hunters vs Farmers in
// js/ui/hvf/game.js). Nobody holds a seat: every side is AI and the camera belongs to the watcher.
//
//   const spec = createSpectator({ root, mode: 'linewar' | 'hvf', fog: true, onSpeed, onPause, onFog });
//   spec.input(frames, { isDown, rect })   -> { pan, drag, zoom, next, pick, centre }   (call once a frame)
//   spec.update({ teams, chars, followId, speed, paused, fog })   repaints only what changed
//   spec.alert(text, kind)   spec.destroy()
//
// Keys (keyboard): WASD / arrows / screen edge / left- or middle-drag pan, wheel or + - zoom,
//   F next character (alternates sides), Shift+F previous, 1-9 that character, Space follow again,
//   [ ] or , . slower / faster, P or Esc pause, V next fog view (HvF), Tab hide the side panels.
// Gamepad: left stick pans, RB / R3 next character, LB previous, A follow again, LT / RT zoom,
//   X faster (wraps 1x 2x 4x), Y next fog view, Menu pause, View hides the panels.
// The module never touches the sim; main.js / hvf game.js own the clock and pass the numbers in.

import { FOG_MODES } from './spectate-model.js';

export const SPEEDS = [1, 2, 4];
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createSpectator({ root, mode = 'linewar', fog = false, teamColours = ['#5aa8ff', '#ff6a5a'], onSpeed = () => {}, onPause = () => {}, onFog = () => {}, onPick = () => {} }) {
  const el = document.createElement('div');
  el.className = 'spec-hud spec-' + mode;
  el.innerHTML = `
    <div class="spec-top" data-ui>
      <span class="spec-tag">Watching</span>
      <span class="spec-follow" data-k="follow">Free camera</span>
      <span class="spec-speed" data-k="speed">${SPEEDS.map((v) => `<button class="spec-chip" data-speed="${v}" data-tip="Match speed ${v}x">${v}x</button>`).join('')}<button class="spec-chip" data-act="pause" data-tip="Pause (P / Esc)">⏸</button></span>
      ${fog ? `<span class="spec-fog" data-k="fog">${FOG_MODES.map((f) => `<button class="spec-chip" data-fog="${f.id}" data-tip="${esc(f.label)} (V)">${esc(f.short)}</button>`).join('')}</span>` : ''}
    </div>
    <div class="spec-side l" data-k="side0" data-ui></div>
    <div class="spec-side r" data-k="side1" data-ui></div>
    <div class="spec-help" data-k="help"></div>
    <div class="spec-alerts" data-k="alerts"></div>
    <div class="spec-paused" data-k="paused" hidden>Paused</div>`;
  root.append(el);
  const K = {};
  for (const n of el.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  const setH = (n, v) => { if (n._h !== v) { n._h = v; n.innerHTML = v; } };
  const setT = (n, v) => { const s = String(v); if (n._t !== s) { n._t = s; n.textContent = s; } };
  K.help.innerHTML = `<b>F</b> next character · <b>Shift+F</b> back · <b>1-9</b> pick · <b>WASD</b> / drag pan · <b>wheel</b> zoom · <b>Space</b> follow · <b>[ ]</b> speed · <b>P</b> pause${fog ? ' · <b>V</b> fog' : ''} · <b>Tab</b> panels
    <span class="pad-only"><kbd class="pad">RB</kbd>/<kbd class="pad">LB</kbd> character · <kbd class="pad">LS</kbd> pan · <kbd class="pad">LT</kbd>/<kbd class="pad">RT</kbd> zoom · <kbd class="pad">A</kbd> follow · <kbd class="pad">X</kbd> speed${fog ? ' · <kbd class="pad">Y</kbd> fog' : ''} · <kbd class="pad">Menu</kbd> pause</span>`;

  let last = { speed: 1, paused: false, fog: fog ? FOG_MODES[0].id : 'off', chars: [] };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.speed) onSpeed(Number(b.dataset.speed));
    else if (b.dataset.act === 'pause') onPause(!last.paused);
    else if (b.dataset.fog) onFog(b.dataset.fog);
    else if (b.dataset.follow != null) onPick(Number(b.dataset.follow));
  });

  const cycleSpeed = (d) => { const i = SPEEDS.indexOf(last.speed); onSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 0 : i) + d))]); };
  const cycleFog = () => { const i = FOG_MODES.findIndex((f) => f.id === last.fog); onFog(FOG_MODES[(i + 1) % FOG_MODES.length].id); };
  let padZoomT = 0, lastPtr = null;

  /** One frame of input from every device (nobody owns a seat, so any device may drive the camera). */
  function input(frames, { isDown = () => false, rect = null } = {}) {
    const out = { pan: { x: 0, y: 0 }, drag: { dx: 0, dy: 0 }, zoom: 0, next: 0, pick: -1, centre: false };
    for (const [id, f] of frames || []) {
      const raw = new Set(f.rawPressed || []);
      if (id === 'kbm') {
        const shift = isDown('ShiftLeft') || isDown('ShiftRight');
        if (raw.has('KeyF')) out.next = shift ? -1 : 1;
        DIGITS.forEach((d, i) => { if (raw.has(d)) out.pick = i; });
        if (raw.has('Space')) out.centre = true;
        if (raw.has('BracketLeft') || raw.has('Comma')) cycleSpeed(-1);
        if (raw.has('BracketRight') || raw.has('Period')) cycleSpeed(1);
        if (raw.has('KeyP') || raw.has('Escape') || raw.has('F10')) onPause(!last.paused);
        if (fog && raw.has('KeyV')) cycleFog();
        if (raw.has('Tab')) el.classList.toggle('panels-off');
        if (raw.has('WheelUp') || raw.has('Equal') || raw.has('NumpadAdd')) out.zoom -= 1;
        if (raw.has('WheelDown') || raw.has('Minus') || raw.has('NumpadSubtract')) out.zoom += 1;
        if (isDown('KeyA') || isDown('ArrowLeft')) out.pan.x -= 1;
        if (isDown('KeyD') || isDown('ArrowRight')) out.pan.x += 1;
        if (isDown('KeyW') || isDown('ArrowUp')) out.pan.y += 1;
        if (isDown('KeyS') || isDown('ArrowDown')) out.pan.y -= 1;
        const p = f.pointer;
        if (rect && p?.inside && document.hasFocus?.()) {
          const e2 = 6;
          if (p.x < rect.x + e2) out.pan.x -= 1; else if (p.x > rect.x + rect.w - e2) out.pan.x += 1;
          if (p.y < rect.y + e2) out.pan.y += 1; else if (p.y > rect.y + rect.h - e2) out.pan.y -= 1;
        }
        // left- or middle-drag pans (there is nothing to select or order)
        // (the device's own drag counts the middle button; the left button is tracked here)
        if (isDown('Mouse0') && p && lastPtr) { out.drag.dx += p.x - lastPtr.x; out.drag.dy += p.y - lastPtr.y; }
        lastPtr = p ? { x: p.x, y: p.y } : null;
        if (f.drag) { out.drag.dx += f.drag.dx || 0; out.drag.dy += f.drag.dy || 0; }
      } else {
        const L = f.stickL || { x: 0, y: 0 };
        if (Math.abs(L.x) > 0.15) out.pan.x += L.x;
        if (Math.abs(L.y) > 0.15) out.pan.y -= L.y;
        if (raw.has('RB') || raw.has('R3') || raw.has('DRight')) out.next = 1;
        if (raw.has('LB') || raw.has('DLeft')) out.next = -1;
        if (raw.has('A') || raw.has('L3')) out.centre = true;
        if (raw.has('X')) { const i = SPEEDS.indexOf(last.speed); onSpeed(SPEEDS[(i + 1) % SPEEDS.length]); }
        if (fog && raw.has('Y')) cycleFog();
        if (raw.has('Menu')) onPause(!last.paused);
        if (raw.has('View')) el.classList.toggle('panels-off');
        const held = f.rawHeld || new Set();
        padZoomT -= 1;
        if ((held.has('LT') || held.has('RT')) && padZoomT <= 0) { out.zoom += held.has('LT') ? 1 : -1; padZoomT = 14; }
        if (!held.has('LT') && !held.has('RT')) padZoomT = 0;
      }
    }
    return out;
  }

  function sideHtml(t, i, followId, base) {
    return `<h3 style="--team:${teamColours[t.team] || '#ccc'}">${esc(t.name)}</h3>
      <dl>${t.stats.map(([k, v, tip]) => `<dt${tip ? ` data-tip="${esc(tip)}"` : ''}>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="spec-chars">${t.chars.map((c) => {
        const n = base.indexOf(c.id);
        return `<button class="spec-char${c.id === followId ? ' on' : ''}${c.alive ? '' : ' down'}" data-follow="${c.id}" data-tip="Follow ${esc(c.name)}">${n >= 0 && n < 9 ? `<kbd>${n + 1}</kbd>` : ''}<b>${esc(c.name)}</b><small>${esc(c.sub || '')}</small></button>`;
      }).join('')}</div>`;
  }

  function update({ teams = [], chars = [], followId = null, speed = 1, paused = false, fog: fogId = last.fog }) {
    last = { speed, paused, fog: fogId, chars };
    const ids = chars.map((c) => c.id);
    teams.forEach((t, i) => { if (K['side' + i]) setH(K['side' + i], sideHtml(t, i, followId, ids)); });
    const f = chars.find((c) => c.id === followId);
    setT(K.follow, f ? `Following ${f.name}${f.alive ? '' : ' (down)'}` : 'Free camera — F to follow someone');
    for (const b of K.speed.querySelectorAll('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === speed && !paused);
    K.speed.querySelector('[data-act="pause"]').classList.toggle('on', paused);
    if (K.fog) for (const b of K.fog.querySelectorAll('[data-fog]')) b.classList.toggle('on', b.dataset.fog === fogId);
    K.paused.hidden = !paused;
  }

  function alert(text, kind = 'info', ms = 3200) {
    const a = document.createElement('div');
    a.className = 'spec-alert ' + kind; a.textContent = text;
    K.alerts.prepend(a);
    while (K.alerts.children.length > 4) K.alerts.lastChild.remove();
    setTimeout(() => { a.classList.add('out'); setTimeout(() => a.remove(), 400); }, ms);
  }

  return { el, input, update, alert, get fog() { return last.fog; }, destroy() { el.remove(); } };
}
