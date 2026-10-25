// "Report a bug / suggest something" (game-standards §5): the round ! button in the top-right corner of every
// screen. Sends the text, a picture of the game (optional, on by default) and debug details (screen, room, network,
// what the game says through getDebug(), device, the last errors the page logged) to POST <root>/feedback (Tumblefair's
// server/feedback.mjs on the Roverlands server). With no server it says so and keeps the form open — nothing is lost.
// Also: tally(name, props) — cookie-free counts to POST <root>/tally (batched; automated tests do not count).
import { apiRoot } from '../../net/client.js';
import { el, esc } from './dom.js';

const errors = [];
const keep = (kind, msg) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${String(msg).slice(0, 300)}`); if (errors.length > 15) errors.shift(); };
addEventListener('error', e => keep('error', `${e.message} @ ${(e.filename || '').split('/').slice(-2).join('/')}:${e.lineno}`));
addEventListener('unhandledrejection', e => keep('promise', e.reason?.message || e.reason));
export const recentErrors = () => errors.slice();

export async function postFeedback(body) {
  let res;
  try { res = await fetch(apiRoot() + 'feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: 'roverlands', ...body }) }); }
  catch { throw new Error('Could not reach the server. Your report was not sent.'); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(res.status === 404 || res.status === 405 || res.status === 501 ? 'Reports need the game server — this copy of the game has none.' : out.msg || `The server said ${res.status}.`);
  return out;
}

const queue = []; let timer = 0;
function flush() {
  timer = 0; if (!queue.length) return;
  const body = JSON.stringify(queue.splice(0, 20));
  fetch(apiRoot() + 'tally', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}
export function tally(name, props) {
  if (navigator.webdriver && !/[?&]tally=1/.test(location.search)) return;
  queue.push({ e: name, ...(props ? { p: props } : {}) });
  if (queue.length >= 20) flush(); else if (!timer) timer = setTimeout(flush, 4000);
}
addEventListener('pagehide', flush);

/** The ! button + its form. `shot()` -> a JPEG data URL or null; `debug()` -> a plain object. */
export function installReport({ layers, shot, debug, nameOf = () => '' }) {
  const btn = el('button', 'rl-corner rl-report-btn', '!'); btn.type = 'button';
  btn.title = 'Report a bug or suggest something'; btn.setAttribute('aria-label', btn.title);
  let open = null;
  function show({ kind = 'bug', text = '' } = {}) {
    if (open) return;
    let picture = null; try { picture = shot(); } catch { picture = null; }
    const info = { ...(debug() || {}), errors: recentErrors(), screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, orient: screen.orientation?.type || null, touch: navigator.maxTouchPoints }, ua: navigator.userAgent, url: location.href };
    const node = el('div', 'rl-modal', `<div class="rl-panel rl-report"><h2>Report a bug or suggest something</h2>
      <div class="rl-row"><button class="rl-pill${kind === 'bug' ? ' on' : ''}" data-k="bug">Bug</button><button class="rl-pill${kind === 'idea' ? ' on' : ''}" data-k="idea">Suggestion</button></div>
      <textarea rows="5" maxlength="4000" placeholder="What happened, or what would make it better?"></textarea>
      ${picture ? `<label class="rl-check rl-shot"><input type="checkbox" checked> Include this picture of the game<img src="${picture}" alt=""></label>` : ''}
      <p class="rl-note">Also sent: which screen you were on, the room, where you were, your device and recent errors. Nothing else.</p>
      <p class="rl-err"></p>
      <div class="rl-row end"><button class="rl-btn" data-back>Cancel</button><button class="rl-btn primary" data-send>Send</button></div></div>`);
    let k = kind;
    const rec = layers.push(node, { kind: 'report', onBack: () => close() });
    open = rec;
    const close = () => { rec.close(); open = null; };
    const ta = node.querySelector('textarea'); if (text) ta.value = text;
    setTimeout(() => ta.focus({ preventScroll: true }), 30);
    node.addEventListener('click', async e => {
      const p = e.target.closest('[data-k]'); if (p) { k = p.dataset.k; node.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b === p)); return; }
      if (e.target === node || e.target.closest('[data-back]')) return close();
      const send = e.target.closest('[data-send]'); if (!send) return;
      const t = ta.value.trim(), err = node.querySelector('.rl-err');
      if (!t) { err.textContent = 'Please write a few words first.'; return; }
      send.disabled = true; send.textContent = 'Sending…';
      try {
        const out = await postFeedback({ kind: k, text: t, name: nameOf(), debug: info, ...(picture && node.querySelector('.rl-shot input')?.checked ? { shot: picture } : {}) });
        node.querySelector('.rl-panel').innerHTML = `<h2>Thank you!</h2><p>Saved as report #${esc(out.id)}.</p><div class="rl-row end"><button class="rl-btn primary" data-back>Close</button></div>`;
      } catch (x) { err.textContent = x.message || 'Could not send it. Try again in a moment.'; send.disabled = false; send.textContent = 'Send'; }
    });
  }
  btn.addEventListener('click', () => show());
  return { button: btn, open: show, get isOpen() { return !!open; } };
}
