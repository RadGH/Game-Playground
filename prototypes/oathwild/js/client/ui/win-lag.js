// Send a lag report (☰ menu; owner 2026-11-26: "severe stalls/lag on desktop … How can we capture that info to
// investigate?"). Shows what the lag recorder (js/client/lagmeter.js) saw over the last two minutes — a frame-time
// graph, the frame rate, how many stalls and the worst — and sends the whole record (every stall with what was going
// on in it) to the same report box as Report a bug, marked kind 'lag'. Claude reads them from the admin feed.
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { fmt } from '../../../../../shared/format.js';
import { sendReport, context } from './win-report.js';

export function open(app) {
  const lag = app.lag;
  return openWin({
    id: 'lag', title: 'Send a lag report', size: 'narrow', cls: 'ow-lag',
    render(body) {
      if (!lag) { body.innerHTML = '<p class="ow-dim">The lag recorder runs once you are in a world. Play for a minute, then open this again.</p>'; return; }
      const S = lag.summary(), st = S.stalls, fm = S.frameMs;
      const tile = (n, label, warn) => `<div class="ow-lag-tile${warn ? ' is-warn' : ''}"><b>${esc(n)}</b><span>${esc(label)}</span></div>`;
      body.innerHTML = `
        <p class="ow-lag-lead">Last ${esc(fmt(S.seconds))} s of play</p>
        <canvas class="ow-lag-graph" width="640" height="120" aria-label="Frame times over the last two minutes"></canvas>
        <p class="ow-dim ow-lag-legend"><span class="ow-lag-key is-ok"></span>smooth (under 33 ms) <span class="ow-lag-key is-slow"></span>slow <span class="ow-lag-key is-stall"></span>stall (100 ms and more)</p>
        <div class="ow-lag-tiles">
          ${tile(S.fps != null ? fmt(S.fps) : '–', 'frames a second (typical)')}
          ${tile(fm.p99 != null ? `${fmt(fm.p99)} ms` : '–', 'slowest 1 in 100 frames', fm.p99 > 50)}
          ${tile(fmt(st.total), 'stalls (50 ms and more)', st.total > 0)}
          ${tile(fm.worst != null ? `${fmt(fm.worst)} ms` : '–', 'worst frame', fm.worst > 250)}
        </div>
        <label class="ow-rep-label" for="ow-lag-text">What were you doing when it stalled? (optional)</label>
        <textarea id="ow-lag-text" class="ow-input ow-rep-text" rows="3" maxlength="2000" placeholder="Walking into town, casting, turning the camera…"></textarea>
        <p class="ow-dim ow-rep-note">Sends the frame times, every stall with what the game was doing in it, your graphics settings and graphics card name. No picture.</p>
        <p class="ow-rep-msg" role="status"></p>`;
      draw(body.querySelector('canvas'), lag.frames());
    },
    foot(f, win) {
      f.innerHTML = `<button type="button" class="ow-btn ow-ghost" data-cancel>Close</button>${lag ? `<button type="button" class="ow-btn ow-primary" data-send>${glyph('next', 18)}<span>Send</span></button>` : ''}`;
      f.querySelector('[data-cancel]').onclick = () => win.close();
      const send = f.querySelector('[data-send]');
      if (send) send.onclick = async e => {
        const msg = win.body.querySelector('.ow-rep-msg'), text = win.body.querySelector('textarea').value.trim();
        e.currentTarget.disabled = true; msg.textContent = 'Sending…';
        const ok = await sendReport({ kind: 'lag', text: text || '(lag report)', ...context(app), ...lag.report() });
        msg.textContent = ok ? 'Thank you, your lag report was sent.' : 'Saved on this device. It will be sent when the game can reach the server.';
        setTimeout(() => win.close(), 1500);
      };
    },
  });
}

/** Bars, newest on the right: one per frame (or the worst of a few when there are more frames than pixels). */
function draw(cv, frames) {
  const g = cv.getContext('2d'); if (!g) return;
  const W = cv.width, H = cv.height, n = frames.length, per = Math.max(1, Math.ceil(n / W));
  g.clearRect(0, 0, W, H);
  const css = getComputedStyle(cv);
  const ok = css.getPropertyValue('--lag-ok').trim() || '#6fae6a', slow = css.getPropertyValue('--lag-slow').trim() || '#d8b04a', bad = css.getPropertyValue('--lag-stall').trim() || '#d0503c';
  const y = ms => H - Math.min(1, ms / 200) * (H - 4);
  g.globalAlpha = 0.35; g.fillStyle = slow; g.fillRect(0, y(33), W, 1); g.fillStyle = bad; g.fillRect(0, y(100), W, 1); g.globalAlpha = 1;
  const cols = Math.ceil(n / per), x0 = W - cols;
  for (let c = 0; c < cols; c++) {
    let m = 0; for (let i = c * per; i < Math.min(n, (c + 1) * per); i++) m = Math.max(m, frames[i]);
    g.fillStyle = m >= 100 ? bad : m > 33 ? slow : ok;
    g.fillRect(x0 + c, y(m), 1, H - y(m));
  }
}
