// Play-test 12 (#71): a screenshot for a bug report.
//
//   const shot = await takeScreenshot({ hideUi: true })   // -> { dataUrl, w, h, bytes, ui: false } | { error }
//
// hideUi: true  — the game world only: the 3D view is drawn once more and copied in the same moment (the WebGL canvas
//                 keeps no picture between frames, so it must be copied right after a draw). No permission needed.
// hideUi: false — the screen as you see it, interface included. A web page cannot photograph its own HTML, so this asks
//                 the browser to share this tab (getDisplayMedia; one "Share" click) with the Feedback window hidden
//                 for the moment of the picture. Where the browser cannot do that (phones, a refusal), it falls back to
//                 the world-only picture and says so (`fellBack`).
// Either way the picture is scaled to at most 1280 px wide and saved as JPEG small enough for the server's cap
// (js/sim/feedback.js SHOT.chars).

export const SHOT_MAX_CHARS = 270000;      // a little under SHOT.chars (280 000) so a part never tips it over
const MAX_W = 1280;

/** Scale `src` (canvas / video / image, natural size w x h) into a JPEG data URL under the cap. */
export function encodeShot(src, w, h, { maxW = MAX_W, maxChars = SHOT_MAX_CHARS, doc = document } = {}) {
  let scale = Math.min(1, maxW / Math.max(1, w));
  for (let tries = 0; tries < 6; tries++) {
    const cw = Math.max(2, Math.round(w * scale)), ch = Math.max(2, Math.round(h * scale));
    const c = doc.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch);
    for (const q of [0.78, 0.62, 0.48]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= maxChars && url.startsWith('data:image/jpeg')) return { dataUrl: url, w: cw, h: ch, bytes: Math.floor((url.length - 23) * 3 / 4) };
    }
    scale *= 0.75;
  }
  return null;
}

/** The world, drawn and copied in one go (no interface). */
function worldShot() {
  const v = window.thousandvale?.view, cv = v?.renderer?.domElement;
  if (!cv || !cv.width) return { error: 'The game view is not ready.' };
  try { v.render?.(); } catch { /* a draw that fails still leaves the last frame on some browsers */ }
  const out = encodeShot(cv, cv.width, cv.height);
  return out ? { ...out, ui: false } : { error: 'The picture could not be made small enough.' };
}

/** The tab as you see it, through the browser's screen sharing (asks once). */
async function tabShot(hide = []) {
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== 'function') return null;
  let stream = null;
  const was = hide.map(el => [el, el.style.visibility]);
  try {
    stream = await md.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
    for (const [el] of was) el.style.visibility = 'hidden';
    const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    await new Promise(r => setTimeout(r, 350));                 // two or three frames: the hidden window has left the picture
    const out = encodeShot(video, video.videoWidth, video.videoHeight);
    return out ? { ...out, ui: true } : null;
  } catch { return null; }
  finally { for (const [el, v] of was) el.style.visibility = v; try { stream?.getTracks().forEach(t => t.stop()); } catch { /* gone */ } }
}

export async function takeScreenshot({ hideUi = true, hide = [] } = {}) {
  if (!hideUi) {
    const t = await tabShot(hide);
    if (t) return t;
    const w = worldShot();
    return w.error ? w : { ...w, fellBack: true };
  }
  return worldShot();
}
