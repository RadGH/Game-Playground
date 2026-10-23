// "Report a bug / suggest something": a small round button in the top-right corner of every screen. It opens a
// form; sending it posts the text, a picture of the 3D view (optional, on by default) and the debug details below to
// the server (POST /feedback), which saves them for tools/feedback-report.mjs.
// Debug details: build, room, phase history, players, the minigame and its last state, network, screen, device,
// and the last errors the page logged — so a report says what was on screen without anyone typing it.
import { h, esc } from './gamehud.js';

const errors = [];
const keep = (kind, msg) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${String(msg).slice(0, 300)}`); if (errors.length > 15) errors.shift(); };
addEventListener('error', e => keep('error', `${e.message} @ ${(e.filename || '').split('/').slice(-2).join('/')}:${e.lineno}`));
addEventListener('unhandledrejection', e => keep('promise', e.reason?.message || e.reason));
const ce = console.error.bind(console); console.error = (...a) => { keep('console', a.map(x => x?.message || x).join(' ')); ce(...a); };

export function installFeedback({ stage, getS, net }) {
  const btn = h('button', 'fb-btn', '!'); btn.title = 'Report a bug or suggest something'; btn.setAttribute('aria-label', btn.title);
  document.body.append(btn);
  function debug() {
    const S = getS(), r = S.room;
    const g = S.play?.state; let gs = null; try { gs = g ? JSON.stringify(g).slice(0, 3000) : null; } catch { /* odd state */ }
    return {
      url: location.href.replace(/token=[^&]+/, ''), phase: S.phase, log: S.log || [], room: r ? { code: r.code, you: r.you, host: r.host, opts: r.opts, members: r.members.map(m => ({ pid: m.pid, name: m.name, seat: m.seat, on: m.on, display: m.display })), match: r.match ? { mode: r.match.mode, round: r.match.round, rounds: r.match.rounds } : null } : null,
      game: S.pm?.game || null, gameState: gs, board: S.bd ? { pid: S.bd.pid, sub: S.bd.sub, ask: S.bd.ask, rolled: S.bd.rolled } : null,
      net: { status: net.status, ping: net.ping }, me: S.me ? { name: S.me.name, coins: S.me.coins, costume: S.me.costume } : null,
      screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, orient: screen.orientation?.type || null, touch: navigator.maxTouchPoints },
      quality: stage.quality, gl: (() => { try { const g2 = stage.renderer.getContext(), e = g2.getExtension('WEBGL_debug_renderer_info'); return e ? g2.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; } catch { return null; } })(),
      ua: navigator.userAgent, errors: errors.slice(),
    };
  }
  /** A small JPEG of the 3D view. Drawn and read in the same moment (the canvas is not kept between frames). */
  function shot() {
    try {
      stage.render(0);
      const src = stage.canvas, k = Math.min(1, 900 / Math.max(src.width, src.height));
      const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return null; }
  }
  /** Open the form. Round 7: "Tell us more" after rating a minigame opens it as a suggestion, already about that game. */
  function open({ kind = 'idea', text = '', about = null, noPicture = false } = {}) {
    const picture = noPicture ? null : shot(), info = { ...debug(), ...(about ? { about } : {}) };
    const el = h('div', 'modal fb-modal');
    el.innerHTML = `<div class="panel"><h2>Suggest something or report a bug</h2>
      <div class="row"><label class="pill${kind === 'idea' ? ' on' : ''}"><input type="radio" name="fbk" value="idea" ${kind === 'idea' ? 'checked' : ''}> Suggestion</label><label class="pill${kind === 'bug' ? ' on' : ''}"><input type="radio" name="fbk" value="bug" ${kind === 'bug' ? 'checked' : ''}> Bug</label></div>
      <textarea id="fb-text" rows="5" maxlength="4000" placeholder="What happened, or what would make it better?"></textarea>
      ${picture ? `<label class="check fb-shot"><input type="checkbox" id="fb-pic" checked> Include this picture of the game<img src="${picture}" alt=""></label>` : ''}
      <p class="note">Also sent: what screen you were on, the players, your device and recent errors. Nothing else.</p>
      <p class="err" id="fb-err"></p>
      <div class="row"><button class="btn" data-x="1">Cancel</button><button class="btn primary big" id="fb-send">Send</button></div></div>`;
    document.body.append(el);
    el.querySelectorAll('input[name=fbk]').forEach(r => r.addEventListener('change', () => el.querySelectorAll('.row .pill').forEach(p => p.classList.toggle('on', p.querySelector('input').checked))));
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) el.remove(); });
    const ta = el.querySelector('#fb-text'); if (text) { ta.value = text; ta.setSelectionRange(text.length, text.length); } ta.focus();
    el.querySelector('#fb-send').addEventListener('click', async e => {
      const text = el.querySelector('#fb-text').value.trim(), err = el.querySelector('#fb-err');
      if (!text) { err.textContent = 'Please write a few words first.'; return; }
      e.target.disabled = true; e.target.textContent = 'Sending…';
      const body = { kind: el.querySelector('input[name=fbk]:checked').value, text, name: getS().me?.name || '', debug: info, ...(picture && el.querySelector('#fb-pic')?.checked ? { shot: picture } : {}) };
      try {
        const res = await fetch(new URL('../../../../feedback', import.meta.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.msg || `The server said ${res.status}.`);
        el.querySelector('.panel').innerHTML = `<h2>Thank you!</h2><p>Saved as report #${esc(out.id)}.</p><button class="btn primary big" data-x="1">Close</button>`;
      } catch (x) { err.textContent = x.message || 'Could not send it. Try again in a moment.'; e.target.disabled = false; e.target.textContent = 'Send'; }
    });
  }
  btn.addEventListener('click', () => open());
  return { open };
}
