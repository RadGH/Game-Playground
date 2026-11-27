// Report a bug (☰ menu, game-standards §4/§5): the player's words + a picture of the screen + where they are in the
// game (screen, world, position, build, device) go to the playground report box — games.radgh.com's rgs-api
// `/api/report/oathwild`, or the LAN dev server's inbox. Saved on this device BEFORE sending; every try gives up after
// 8 s so it never hangs on "Sending…" (lessons rule 66); reports that could not go are sent next time.
// Same pattern as Wyrmroad's js/ui/report.js. (No "Rate the game": owner 2026-11-25, ratings are for party minigames only.)
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';

const KEY = 'oathwild.reports';
const ROUTES = ['/api/report/oathwild', '/api/inbox/oathwild-report'];

export function open(app, opts = {}) {
  const shot = screenshot();                 // taken as the box opens: the picture is of the game, not of this box
  const w = openWin({
    id: 'report', title: 'Report a bug', size: 'narrow', cls: 'ow-rep',
    render(body) {
      body.innerHTML = `<label class="ow-rep-label" for="ow-rep-text">What went wrong, or what would you like?</label>
        <textarea id="ow-rep-text" class="ow-input ow-rep-text" rows="6" maxlength="4000" placeholder="Plain words are perfect."></textarea>
        <p class="ow-dim ow-rep-note">${shot ? 'A picture of your screen and where you are in the game go with it.' : 'Where you are in the game goes with it.'}</p>
        <p class="ow-rep-msg" role="status"></p>`;
      setTimeout(() => body.querySelector('textarea')?.focus(), 40);
    },
    foot(f, win) {
      f.innerHTML = `<button type="button" class="ow-btn ow-ghost" data-cancel>Cancel</button><button type="button" class="ow-btn ow-primary" data-send>${glyph('next', 18)}<span>Send</span></button>`;
      f.querySelector('[data-cancel]').onclick = () => win.close();
      f.querySelector('[data-send]').onclick = async e => {
        const ta = win.body.querySelector('textarea'), msg = win.body.querySelector('.ow-rep-msg');
        if (!ta.value.trim()) { msg.textContent = 'Write a few words first.'; ta.focus(); return; }
        e.currentTarget.disabled = true; msg.textContent = 'Sending…';
        const ok = await sendReport({ kind: 'bug', text: ta.value.trim(), shot, ...context(app) });
        msg.textContent = ok ? 'Thank you, your report was sent.' : 'Saved on this device. It will be sent when the game can reach the server.';
        setTimeout(() => win.close(), 1500);
      };
    },
  });
  return w;
}

export function context(app) {
  let state = null; try { state = window.gameEye?.state?.() ?? null; } catch { state = null; }
  return { page: 'oathwild', build: app.build, server: app.net?.build || null, world: app.world?.code || null, at: new Date().toISOString(), state, ua: navigator.userAgent, size: [innerWidth, innerHeight], device: app.device, who: app.me?.char?.name || null, lag: app.lag?.summary?.() ?? null };   // every bug report carries the lag summary (lagmeter.js)
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
    for (const route of ROUTES) {
      try { const res = await fetch(new URL(route, location.origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r), signal: AbortSignal.timeout(8000) }); if (res.ok) { ok = true; break; } } catch { /* offline */ }
    }
    if (!ok) left.push(r);
  }
  try { if (left.length) localStorage.setItem(KEY, JSON.stringify(left.slice(-10))); else localStorage.removeItem(KEY); } catch { /* blocked */ }
  return !left.length;
}
