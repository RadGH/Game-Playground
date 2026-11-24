// Rate the game (game-standards §5): thumbs up or down, then reasons that say WHAT KIND of good or bad, and a
// "Tell us more" box. In a world it goes to the world server (act 'rate', logged for the admin dashboard); on the
// title it goes through the report road (kind 'rating') so nothing is lost.
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { sendReport, context } from './win-report.js';

const GOOD = [['fights', 'Fights feel good'], ['levelling', 'Levelling choices'], ['world', 'The world to explore'], ['quests', 'Quests and story'], ['looks', 'How it looks'], ['together', 'Playing together']];
const BAD = [['hard', 'Too hard'], ['confusing', 'Confusing'], ['slow', 'Slow or boring'], ['bugs', 'Something broke'], ['controls', 'Controls feel wrong'], ['looks', 'Hard to see or read']];

export function open(app, opts = {}) {
  const st = { up: opts.up ?? null, why: new Set() };
  const w = openWin({
    id: 'rate', title: 'Rate Oathwild', size: 'narrow', cls: 'ow-rate',
    render(body) {
      const list = st.up === true ? GOOD : st.up === false ? BAD : [];
      body.innerHTML = `<div class="ow-rate-thumbs">
          <button type="button" class="ow-rate-thumb${st.up === true ? ' ow-rate-on' : ''}" data-up="1" ${st.up == null ? 'data-primary' : ''}>${glyph('thumbUp', 34)}<span>I like it</span></button>
          <button type="button" class="ow-rate-thumb${st.up === false ? ' ow-rate-on' : ''}" data-up="0">${glyph('thumbDown', 34)}<span>Not for me</span></button>
        </div>
        ${list.length ? `<h3 class="ow-rate-h">${st.up ? 'What do you like?' : 'What is wrong?'}</h3><div class="ow-rate-why">${list.map(([id, label]) => `<button type="button" class="ow-rate-chip${st.why.has(id) ? ' ow-rate-on' : ''}" data-why="${id}" aria-pressed="${st.why.has(id)}">${esc(label)}</button>`).join('')}</div>` : ''}
        ${st.up != null ? '<label class="ow-rate-h" for="ow-rate-more">Tell us more</label><textarea id="ow-rate-more" class="ow-input ow-rate-text" rows="3" maxlength="600"></textarea>' : ''}
        <p class="ow-rate-msg" role="status"></p>`;
      const ta = body.querySelector('textarea'); if (ta) ta.value = st.text || '';
      ta?.addEventListener('input', () => { st.text = ta.value; });
      body.querySelectorAll('[data-up]').forEach(b => { b.onclick = () => { const up = b.dataset.up === '1'; if (st.up !== up) st.why.clear(); st.up = up; w.render(); }; });
      body.querySelectorAll('[data-why]').forEach(b => { b.onclick = () => { const id = b.dataset.why; if (st.why.has(id)) st.why.delete(id); else st.why.add(id); w.render(); }; });
    },
    foot(f, win) {
      f.innerHTML = `<button type="button" class="ow-btn ow-ghost" data-cancel>Not now</button><button type="button" class="ow-btn ow-primary" data-send ${st.up == null ? 'disabled' : ''}>${glyph('next', 18)}<span>Send</span></button>`;
      f.querySelector('[data-cancel]').onclick = () => win.close();
      f.querySelector('[data-send]').onclick = async e => {
        if (st.up == null) return;
        e.currentTarget.disabled = true;
        const why = [...st.why], text = (st.text || '').trim();
        if (app.world && app.net?.state === 'open') app.act('rate', { up: st.up, why, text });
        else await sendReport({ kind: 'rating', up: st.up, why, text, ...context(app) });
        const msg = win.body.querySelector('.ow-rate-msg'); if (msg) msg.textContent = 'Thank you!';
        setTimeout(() => win.close(), 900);
      };
    },
  });
  return w;
}
