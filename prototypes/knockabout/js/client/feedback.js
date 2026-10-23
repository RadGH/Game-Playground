// "Report a bug / suggest something": the round ! button in the top-right corner of every screen (Tumblefair's form).
// Sending posts the text, a picture of the 3D view (optional, on by default) and debug details (screen, players,
// arena, the sim in use, device, the last errors the page logged) through report.js postFeedback(). With no server it
// says so and keeps the form open — nothing is lost silently.
import { postFeedback } from './report.js';

const errors = [];
const keep = (kind, msg) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${String(msg).slice(0, 300)}`); if (errors.length > 15) errors.shift(); };
addEventListener('error', e => keep('error', `${e.message} @ ${(e.filename || '').split('/').slice(-2).join('/')}:${e.lineno}`));
addEventListener('unhandledrejection', e => keep('promise', e.reason?.message || e.reason));
const ce = console.error.bind(console); console.error = (...a) => { keep('console', a.map(x => x?.message || x).join(' ')); ce(...a); };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function installFeedback({ view, debug, nav }) {
  const btn = document.createElement('button'); btn.className = 'fb-btn'; btn.textContent = '!';
  btn.title = 'Report a bug or suggest something'; btn.setAttribute('aria-label', btn.title); btn.dataset.nonav = '1';
  document.body.append(btn);
  function shot() {
    try {
      view.render(0);
      const src = view.canvas, k = Math.min(1, 900 / Math.max(src.width, src.height));
      const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return null; }
  }
  let openEl = null;
  function open({ kind = 'idea', text = '', about = null } = {}) {
    if (openEl) return;
    const picture = shot(), info = { ...debug(), errors: errors.slice(), ...(about ? { about } : {}),
      screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, orient: screen.orientation?.type || null, touch: navigator.maxTouchPoints },
      gl: (() => { try { const g = view.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; } catch { return null; } })(), ua: navigator.userAgent, url: location.href };
    const el = document.createElement('div'); el.className = 'modal fb-modal'; openEl = el;
    el.innerHTML = `<div class="panel"><h2>Suggest something or report a bug</h2>
      <div class="row"><button class="pill${kind === 'idea' ? ' on' : ''}" data-k="idea">Suggestion</button><button class="pill${kind === 'bug' ? ' on' : ''}" data-k="bug">Bug</button></div>
      <textarea id="fb-text" rows="5" maxlength="4000" placeholder="What happened, or what would make it better?"></textarea>
      ${picture ? `<label class="check fb-shot"><input type="checkbox" id="fb-pic" checked> Include this picture of the game<img src="${picture}" alt=""></label>` : ''}
      <p class="note">Also sent: what screen you were on, the players, your device and recent errors. Nothing else.</p>
      <p class="err" id="fb-err"></p>
      <div class="row end"><button class="btn" data-back="1" data-x="1">Cancel</button><button class="btn primary big" id="fb-send">Send</button></div></div>`;
    document.body.append(el);
    let k = kind;
    const close = () => { el.remove(); openEl = null; prevRoot && nav?.attach(prevRoot); };
    const prevRoot = nav?.root;
    el.addEventListener('click', e => {
      const p = e.target.closest('[data-k]'); if (p) { k = p.dataset.k; el.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b === p)); return; }
      if (e.target === el || e.target.closest('[data-x]')) close();
    });
    const ta = el.querySelector('#fb-text'); if (text) ta.value = text;
    setTimeout(() => ta.focus(), 30);
    nav?.attach(el.querySelector('.panel'), { keep: false });
    el.querySelector('#fb-send').addEventListener('click', async e => {
      const t = ta.value.trim(), err = el.querySelector('#fb-err');
      if (!t) { err.textContent = 'Please write a few words first.'; return; }
      e.target.disabled = true; e.target.textContent = 'Sending…';
      const body = { kind: k, text: t, name: info.players?.[0]?.name || '', debug: info, ...(picture && el.querySelector('#fb-pic')?.checked ? { shot: picture } : {}) };
      try {
        const out = await postFeedback(body);
        el.querySelector('.panel').innerHTML = `<h2>Thank you!</h2><p>Saved as report #${esc(out.id)}.</p><button class="btn primary big" data-x="1" data-back="1">Close</button>`;
        nav?.attach(el.querySelector('.panel'), { keep: false });
      } catch (x) { err.textContent = x.message || 'Could not send it. Try again in a moment.'; e.target.disabled = false; e.target.textContent = 'Send'; }
    });
  }
  btn.addEventListener('click', () => open());
  return { open, get isOpen() { return !!openEl; } };
}
