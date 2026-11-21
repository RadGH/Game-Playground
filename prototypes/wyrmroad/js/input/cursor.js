// The mouse pointer gets out of the way (owner #94): it hides as soon as keys or a controller are used, and comes back
// the moment the mouse moves. In a chapter it also hides again after a moment of a still mouse (clicks attack with the
// keyboard-and-mouse layout, so nothing needs pointing at) — but never while a window (pause menu, bag…) is open, and
// never on a menu screen while the mouse is the thing being used.
//   installCursor(app) → { hidden, show(), hide() }        styles: css/wyrmroad.css `html.wr-nocursor`
const IDLE_IN_PLAY = 1.6;           // seconds of a still mouse in a chapter before the pointer hides again
const MOVE_PX = 3;                  // a jiggle of the desk smaller than this does not bring it back

export function installCursor(app) {
  const root = document.documentElement;
  let hidden = false, still = 0, lastMoveAt = 0, mouseUsed = false;
  const windowOpen = () => !!document.querySelector('.wr-sheet, .modal, .rgs-signin, .wn-root, .cr-root');
  const set = h => { if (h === hidden) return; hidden = h; root.classList.toggle('wr-nocursor', h); };
  const show = () => { still = 0; set(false); };
  const hide = () => { if (windowOpen() && mouseUsed) return; set(true); };

  addEventListener('mousemove', e => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) < MOVE_PX && hidden) return;
    mouseUsed = true; lastMoveAt = performance.now(); show();
  }, { passive: true });
  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    mouseUsed = false; hide();
  }, { capture: true });
  addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { mouseUsed = false; set(true); } }, { capture: true });

  let padWas = false;
  function tick(dt) {
    // a controller in use (any button or a pushed stick) hides it, like a key
    let pad = false;
    for (const p of navigator.getGamepads?.() || []) {
      if (!p?.connected) continue;
      if (p.buttons.some(b => b?.pressed) || p.axes.some(a => Math.abs(a) > 0.5)) { pad = true; break; }
    }
    if (pad && !padWas) { mouseUsed = false; hide(); }
    padWas = pad;
    // in a chapter a still mouse hides after a moment, unless a window wants the pointer
    if (app.screen === 'play' && !hidden && !windowOpen()) {
      still = (performance.now() - lastMoveAt) / 1000;
      if (still > IDLE_IN_PLAY) set(true);
    }
    if (hidden && windowOpen() && mouseUsed) set(false);
  }
  (function loop() { requestAnimationFrame(loop); try { tick(); } catch { /* never let the pointer break the page */ } })();
  return { get hidden() { return hidden; }, show, hide };
}
