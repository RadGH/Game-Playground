// Report a bug (☰ menu, game-standards §4/§5): the player's words + a picture of the screen + the game's state (screen,
// chapter, fight, build, device) go to the playground report inbox — games.radgh.com's rgs-api `/api/report/wyrmroad`,
// or the LAN dev server's inbox. Saved on this device BEFORE sending and every try gives up after 8 s, so it never
// hangs on "Sending…" (lessons rule 66); unsent reports go next time. Ratings from the results screen use the same road.
import { icon } from './icons.js';
import { openSheet } from './kit.js';

const KEY = 'wyrmroad.reports';
// site-root addresses (games.radgh.com/api…, or the LAN dev server's inbox), same as Overdrive Frame's report.js
const ROUTES = ['/api/report/wyrmroad', '/api/inbox/wyrmroad-report'];

export function openReport(app) {
  const sh = openSheet({ title: 'Report a bug', cls: 'wr-report', body: `
    <textarea rows="5" maxlength="4000" placeholder="What went wrong, or what would you like? Plain words are perfect." aria-label="Your report"></textarea>
    <p class="wr-dim">Your note, a picture of the screen and where you are in the game go to the developer.</p>
    <div class="wr-row-btns"><button type="button" class="wr-btn wr-ghost" data-close>Cancel</button><button type="button" class="wr-btn wr-primary" data-act="send">${icon('next')}<span>Send</span></button></div>
    <p class="wr-report-msg" role="status"></p>` });
  const ta = sh.body.querySelector('textarea'), msg = sh.body.querySelector('.wr-report-msg');
  const shot = screenshot();                     // taken as the box opens: the picture is of the game, not of this box
  sh.body.querySelector('[data-act="send"]').addEventListener('click', async e => {
    if (!ta.value.trim()) { msg.textContent = 'Write a few words first.'; ta.focus(); return; }
    e.currentTarget.disabled = true; msg.textContent = 'Sending…';
    const ok = await sendReport({ kind: 'bug', text: ta.value.trim(), shot, ...context(app) });
    msg.textContent = ok ? 'Thank you, your report was sent.' : 'Saved on this device. It will be sent when the game can reach the server.';
    setTimeout(() => sh.close(), 1500);
  });
  setTimeout(() => ta.focus(), 40);
  return sh;
}

export function context(app) {
  let state = null; try { state = window.gameEye?.state?.() ?? null; } catch { state = null; }
  return { page: 'wyrmroad', build: app.build, at: new Date().toISOString(), state, ua: navigator.userAgent, size: [innerWidth, innerHeight], device: app.input?.last, who: app.user?.username || null };
}

function screenshot() {
  const cvs = [...document.querySelectorAll('canvas')].filter(c => c.width > 50 && c.getBoundingClientRect().width > 50).sort((a, b) => b.width * b.height - a.width * a.height);
  for (const c of cvs) { try { let s = c.toDataURL('image/jpeg', 0.5); if (s.length > 400000) s = c.toDataURL('image/jpeg', 0.3); if (s.length <= 400000) return s; } catch { /* tainted or lost */ } }
  return null;
}

/** Keep it on the device, then try to send it and anything older that is still waiting. True when all went. */
export async function sendReport(rep) {
  let list = []; try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { list = []; }
  list.push(rep);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-10))); } catch { /* blocked */ }
  const left = [];
  for (const r of list) {
    let ok = false;
    for (const url of ROUTES) {
      try { const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r), signal: AbortSignal.timeout(8000) }); if (res.ok) { ok = true; break; } } catch { /* offline */ }
    }
    if (!ok) left.push(r);
  }
  try { if (left.length) localStorage.setItem(KEY, JSON.stringify(left.slice(-10))); else localStorage.removeItem(KEY); } catch { /* blocked */ }
  return !left.length;
}
