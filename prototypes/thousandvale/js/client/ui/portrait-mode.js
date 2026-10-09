// Play-test 10 Y33 — WHERE the live 3D portrait may be used. Pure (no DOM, no three.js): node tests read it.
//
// The live portrait (ui/portraits.js) draws the body a second time INTO THE GAME'S OWN CANVAS, in the square the unit
// frame covers, and copies that square into the frame with a GPU read-back. Two things have to be true for that to be
// invisible: the square must really be under the frame, and the read-back must work. On the owner's iPhone neither
// held: Safari's toolbar slid, the canvas box changed height without the drawing buffer following, so "frame rectangle
// -> GL viewport" pointed ~86 px too low — the face was drawn in the open below the frame, and because it is drawn six
// times a second on a canvas that repaints sixty times, it flickered.
//
// So the rule is: the live path only where it is PROVEN good — a desktop pointer device, the desktop layout, and a
// canvas whose box matches its drawing buffer this very frame. Everything else gets the 2D picture (svg-portrait.js),
// which is an <img> inside the frame: it cannot be anywhere else and it does not change from frame to frame.

/** iPhone / iPad / iPod — an iPad says "Macintosh" but has touch points. */
export function isIOS({ ua = '', platform = '', maxTouchPoints = 0 } = {}) {
  return /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(platform || ua) && maxTouchPoints > 1 && !/Windows|Android|Linux/.test(ua));
}

/** Decided once per device: may this device use the live path at all? */
export function deviceAllowsLive({ ua = '', platform = '', maxTouchPoints = 0, coarse = false, software = false } = {}) {
  if (software) return false;                              // a software renderer: every read-back blocks
  if (isIOS({ ua, platform, maxTouchPoints })) return false;
  if (/Android|Mobile/.test(ua)) return false;
  if (coarse) return false;                                // a finger is the main pointer: a phone or tablet
  return true;
}

/** Decided every pass: is the canvas box the size its drawing buffer thinks it is? (CSS px; `tol` px of slack) */
export function canvasMatches({ cssW, cssH, bufW, bufH, dpr = 1, tol = 1.5 } = {}) {
  if (!(cssW > 0 && cssH > 0 && bufW > 0 && bufH > 0 && dpr > 0)) return false;
  return Math.abs(bufW / dpr - cssW) <= tol && Math.abs(bufH / dpr - cssH) <= tol;
}

/** Is the frame's square wholly on the canvas? (a square that had to be clamped is drawn somewhere else) */
export function squareOnCanvas(rect, canvas) {
  if (!rect || !canvas) return false;
  return rect.left >= canvas.left - 0.5 && rect.top >= canvas.top - 0.5 && rect.right <= canvas.right + 0.5 && rect.bottom <= canvas.bottom + 0.5;
}

/** The whole rule. `env` = device facts + layout ('phone' | 'desktop' | …) + this pass's canvas numbers. */
export function livePortraitAllowed(env = {}) {
  if (!deviceAllowsLive(env)) return false;
  if (env.layout === 'phone') return false;
  return canvasMatches(env);
}
