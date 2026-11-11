// The ☰ menu (every screen), What's new, Credits and Report a bug (game standards §4/§5).
import { createWhatsNew } from '../../../../shared/whats-new.js';
import { createCredits } from '../../../../shared/credits.js';

const errors = [];
const keep = (k, m) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${k}: ${String(m).slice(0, 300)}`); if (errors.length > 15) errors.shift(); };
addEventListener('error', e => keep('error', `${e.message} @ ${(e.filename || '').split('/').slice(-2).join('/')}:${e.lineno}`));
addEventListener('unhandledrejection', e => keep('promise', e.reason?.message || e.reason));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const news = createWhatsNew({ url: new URL('../../data/changelog.json', import.meta.url).href, key: 'rogueloot', title: "What's new in Rogueloot" });
export const credits = createCredits({ game: 'rogueloot', made: 'Rogueloot — made by Radley Sustaire with Claude.' });

function modal(html, cls = '') {
  const root = document.createElement('div'); root.className = 'modal ' + cls;
  root.innerHTML = `<div class="panel">${html}</div>`;
  root.addEventListener('click', e => { if (e.target === root || e.target.closest('[data-close]')) root.remove(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); root.remove(); } });
  document.body.append(root);
  return root;
}

export function openReport({ debug, shot }) {
  const picture = shot?.();
  const root = modal(`<h2>Report a bug or idea</h2>
    <label class="row"><input type="radio" name="k" value="bug" checked> Bug</label> <label class="row"><input type="radio" name="k" value="idea"> Idea</label>
    <textarea maxlength="4000" placeholder="What happened? What did you expect?"></textarea>
    ${picture ? '<label class="row"><input type="checkbox" class="pic" checked> Include a picture of the screen</label>' : ''}
    <p class="msg"></p><div class="btns"><button data-close>Cancel</button><button class="primary send">Send</button></div>`, 'report');
  const ta = root.querySelector('textarea'); ta.focus();
  root.querySelector('.send').onclick = async () => {
    const msg = root.querySelector('.msg'); const text = ta.value.trim();
    if (!text) { msg.textContent = 'Please write what happened.'; return; }
    const body = { game: 'rogueloot', kind: root.querySelector('input[name=k]:checked').value, text, debug: { ...debug(), errors: errors.slice(), ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}` } };
    if (picture && root.querySelector('.pic')?.checked) body.shot = picture;
    msg.textContent = 'Sending…';
    try {
      const res = await fetch(new URL('../../../../feedback', import.meta.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.msg || (res.status === 404 ? 'Reports need the game server — this copy has none.' : `The server said ${res.status}.`));
      root.querySelector('.panel').innerHTML = `<h2>Thanks!</h2><p>Your report was sent (#${esc(out.id)}).</p><div class="btns"><button data-close class="primary">Close</button></div>`;
    } catch (e) { msg.textContent = e.message || 'Could not send. Nothing was lost — try again.'; }
  };
}

/** The ☰ button + its list. items: [{ label, act, when?() }] (when() false hides an item). */
export function createMenu(items) {
  const btn = document.createElement('button'); btn.className = 'menu-btn'; btn.textContent = '☰'; btn.setAttribute('aria-label', 'Menu');
  document.body.append(btn);
  const dot = document.createElement('i'); dot.className = 'dot'; btn.append(dot);
  dot.hidden = true; news.onUnread(n => { dot.hidden = n === 0; }); news.ensure?.();
  function open() {
    const vis = items.filter(i => !i.when || i.when());
    const root = modal(`<h2>Menu</h2><div class="menu-list">${vis.map((i, n) => `<button data-n="${n}">${esc(i.label)}</button>`).join('')}</div>`, 'menu');
    root.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { root.remove(); vis[+b.dataset.n].act(); });
    root.querySelector('button')?.focus();
  }
  btn.onclick = open;
  return { open, btn };
}

/** First steps for a new hero (owner 2026-11-11: a first-time player could not tell where to go). Shown once per hero. */
export function openWelcome(ch, { touch }) {
  const key = 'rogueloot.welcomed.' + (ch.id || ch.name);
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* private window: show it anyway */ }
  const how = touch
    ? '<li>Move with the stick on the left. Tap a monster to fight it; the buttons on the right are your skills.</li><li>Tap the glowing prompt that appears beside portals and people.</li>'
    : '<li><b>Click the ground</b> to walk there (hold to keep walking). <b>Click a monster</b> to walk up and fight it.</li><li><b>1-6</b> use your skills, <b>right-click</b> uses the first one at the pointer. <b>Space</b> uses a portal or talks to someone when the prompt shows.</li>';
  modal(`<h2>Welcome to Brightwater</h2>
    <p>The road out of town is through the <b>portals north of the square</b>. Only the one that glows is open to you: <b>Saltgrass Shore</b>. The others open as you travel.</p>
    <p>Follow the <b style="color:#ffd040">gold arrow</b> at your feet and the beam of light. It always points to your next step, and the box at the top right says what that step is.</p>
    <ul>${how}<li><b>M</b> opens the map, <b>I</b> your bag and character, <b>K</b> your skills. At level 3 you choose a Path.</li></ul>
    <div class="btns"><button class="primary" data-close>Let's go</button></div>`, 'welcome');
}
