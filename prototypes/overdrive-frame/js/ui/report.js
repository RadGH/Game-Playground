// Report a bug (☰ menu, game-standards §4/§5): the player's words + a picture of the screen + the game's state go to
// the playground report inbox (games.radgh.com: rgs playground.reports; LAN: the dev server's inbox). Unsent reports
// wait on this device and go next time. Copied from Arcline's openReport/sendReport.
const KEY = 'overdrive-frame:reports';

export function openReport(game, play) {
  const el = document.createElement('div'); el.className = 'of-pause'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Report a bug');
  el.innerHTML = `<div class="of-pause-card of-report"><h2>Report a bug</h2>
    <textarea rows="5" placeholder="What went wrong, or what would you like? Plain words are perfect." aria-label="Your report"></textarea>
    <p class="of-dim">Your note, a picture of the screen and a few game details go to the developer.</p>
    <div class="of-row"><button type="button" class="of-btn" data-a="cancel">Cancel</button><button type="button" class="of-btn of-primary" data-a="send">Send</button></div>
    <p class="of-report-msg" role="status"></p></div>`;
  const ta = el.querySelector('textarea'), msg = el.querySelector('.of-report-msg');
  const close = () => { el.remove(); game.screens?.pad.popLayer(); };
  el.querySelector('[data-a="cancel"]').addEventListener('click', close);
  el.querySelector('[data-a="send"]').addEventListener('click', async () => {
    if (!ta.value.trim()) { msg.textContent = 'Write a few words first.'; return; }
    const rep = { at: new Date().toISOString(), text: ta.value, state: safeState(), ua: navigator.userAgent, size: [innerWidth, innerHeight], shot: screenshot() };
    msg.textContent = 'Sending…';
    const sent = await sendReport(rep);
    msg.textContent = sent ? 'Thank you — report sent.' : 'Saved — it will be sent when the game can reach the server.';
    setTimeout(close, 1400);
  });
  el.addEventListener('keydown', e => e.stopPropagation());
  document.body.append(el); game.screens?.pad.pushLayer(el);
  setTimeout(() => ta.focus(), 30);
}

function safeState() { try { return window.gameEye?.state?.() ?? null; } catch { return null; } }
function screenshot() {
  const cvs = [...document.querySelectorAll('canvas')].filter(c => c.width > 50 && c.getBoundingClientRect().width > 50).sort((a, b) => b.width * b.height - a.width * a.height);
  for (const c of cvs) { try { let s = c.toDataURL('image/jpeg', 0.5); if (s.length > 400000) s = c.toDataURL('image/jpeg', 0.3); return s.length > 400000 ? null : s; } catch { /* tainted or lost */ } }
  return null;
}
async function sendReport(rep) {
  let list = []; try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { /* blocked */ }
  list.push(rep); const out = [];
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-10))); } catch { /* blocked */ }   // kept on the device first: a hung send never loses it
  for (const r of list) {
    let ok = false;   // each try gives up after 8 s: never stuck on "Sending…" (owner report 2026-11-18)
    for (const url of ['/api/report/overdrive-frame', '/api/inbox/overdrive-frame-report']) { try { const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r), signal: AbortSignal.timeout(8000) }); if (res.ok) { ok = true; break; } } catch { /* offline */ } }
    if (!ok) out.push(r);
  }
  try { if (out.length) localStorage.setItem(KEY, JSON.stringify(out.slice(-10))); else localStorage.removeItem(KEY); } catch { /* blocked */ }
  return !out.length;
}
