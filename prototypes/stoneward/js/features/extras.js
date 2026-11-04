// The game-standard extras (M12):
//   * the "!" report button: a note + a picture of the screen + a few details, sent at once — on
//     the LAN to the dev server's inbox (tools/serve.py POST /api/inbox/stoneward-report), anywhere
//     else to games.radgh.com's report inbox; kept in the browser and retried when unsent;
//   * cloud saves while signed in to games.radgh.com (shared/rgs-cloudsave.js): achievements,
//     settings and small world saves travel between devices (big ones stay on the device);
//   * gamepad menus: the d-pad walks the buttons of whatever is open, A presses, B goes back,
//     Start opens the menu;
//   * the account button on the title screen (sign-in is always optional).

import { hooks, ui } from '../ui/hooks.js';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const $ = s => document.querySelector(s);

// ---------------------------------------------------------------- reports
const LAN = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
const URL_ = LAN ? new URL('../../../../api/inbox/stoneward-report', import.meta.url) : 'https://games.radgh.com/api/report/stoneward';
async function sendReports() {
  const list = JSON.parse(ls.get('stoneward.reports') || '[]');
  let changed = false;
  for (const rep of list) {
    if (rep.sent) continue;
    try {
      const r = await fetch(URL_, { method: 'POST', credentials: LAN ? 'same-origin' : 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(LAN ? rep : { ...rep, kind: 'report', page: rep.screen }) });
      if (r.ok) { rep.sent = true; changed = true; } else break;
    } catch { break; }
  }
  if (changed) ls.set('stoneward.reports', JSON.stringify(list));
}
setTimeout(sendReports, 5000);

// The report box opens from the ☰ menu (play-test 1: on an iPhone the top-bar "!" was pushed off
// the screen). The top-bar button stays hidden.
$('#btn-report')?.classList.add('hidden');
ui.report = async () => {
  $('#menu').classList.add('hidden');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // a picture without the menu on it
  const shot = await ui.capture?.();
  const state = window.gameEye?.state?.() || null;
  const box = $('#menu-buttons'); box.innerHTML = '<h3 style="margin:0;color:var(--gold)">Report a problem</h3>';
  const text = document.createElement('textarea');
  text.placeholder = 'What went wrong, or what would you like? (Plain words are perfect.)';
  text.rows = 5; text.style.cssText = 'width:100%;font:inherit;color:var(--ink);background:#120f0b;border:1px solid var(--line);border-radius:8px;padding:8px';
  const tip = document.createElement('p'); tip.className = 'hint'; tip.textContent = 'Your note, a picture of the screen and a few details about the game are sent to the developer.';
  const send = ui.btn('Send', () => {
    if (!text.value.trim()) { ui.toast('Write a few words first.', 'bad'); return; }
    const rep = { at: new Date().toISOString(), text: text.value, screen: state?.screen, state, ua: navigator.userAgent, size: [innerWidth, innerHeight], shot: shot && shot.length < 180000 ? shot : null, build: '2026-11-03' };
    const list = JSON.parse(ls.get('stoneward.reports') || '[]'); list.push(rep);
    while (JSON.stringify(list).length > 600000) list.shift();
    ls.set('stoneward.reports', JSON.stringify(list));
    sendReports(); ui.closeMenu(); ui.toast('Thank you — report sent.', 'good');
  });
  send.classList.add('big');
  box.append(text, tip, send, ui.btn('Cancel', () => ui.closeMenu()));
  $('#menu').classList.remove('hidden');
  setTimeout(() => text.focus(), 50);
};

// ---------------------------------------------------------------- cloud saves + account
(async () => {
  try {
    const { cloudSave } = await import('../../../../shared/rgs-cloudsave.js');
    ui.cloud = cloudSave({
      game: 'stoneward',
      keys: { achievements: 'stoneward.achievements', prefs: 'stoneward.prefs' },
      prefixes: { worlds: 'stoneward.slot.' },
      canRestore: () => ui.app.state === 'title',
      // a world copy that came from another device goes into this device's world slots
      onRestore: async () => { await ui.importCloudSlots?.(); location.reload(); },
    });
  } catch (e) { console.info('[stoneward] cloud saves unavailable', e?.message); }
  try {
    const { accountButton } = await import('../../../../shared/rgs-signin.js');
    const b = accountButton({ game: 'stoneward', gameName: 'Stoneward' });
    if (b) $('#title-extra').append(b);
  } catch (e) { console.info('[stoneward] sign-in unavailable', e?.message); }
})();

// ---------------------------------------------------------------- gamepad menus
const prev = new Map();
function pressed(gp, i) { const now = !!gp.buttons[i]?.pressed; const key = gp.index + ':' + i; const was = prev.get(key); prev.set(key, now); return now && !was; }
function visibleButtons() {
  const root = !$('#menu').classList.contains('hidden') ? $('#menu') : ['#title', '#newworld', '#landing'].map(s => $(s)).find(e => e && !e.classList.contains('hidden')) || $('#hud');
  return [...root.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled);
}
function moveFocus(dx, dy) {
  const list = visibleButtons(); if (!list.length) return;
  const cur = document.activeElement?.closest?.('button');
  if (!cur || !list.includes(cur)) { list[0].focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  let best = null, bd = Infinity;
  for (const b of list) {
    if (b === cur) continue;
    const r = b.getBoundingClientRect(), x = r.x + r.width / 2 - ax, y = r.y + r.height / 2 - ay;
    if ((dx && Math.sign(x) !== dx) || (dy && Math.sign(y) !== dy)) continue;
    const d = Math.abs(dx ? x : y) + Math.abs(dx ? y : x) * 2.5;
    if (d < bd) { bd = d; best = b; }
  }
  best?.focus();
}
function padLoop() {
  for (const gp of navigator.getGamepads?.() || []) {
    if (!gp) continue;
    if (pressed(gp, 12)) moveFocus(0, -1);
    if (pressed(gp, 13)) moveFocus(0, 1);
    if (pressed(gp, 14)) moveFocus(-1, 0);
    if (pressed(gp, 15)) moveFocus(1, 0);
    if (pressed(gp, 0)) { const b = document.activeElement?.closest?.('button'); if (b) b.click(); }
    if (pressed(gp, 1)) { if (!$('#menu').classList.contains('hidden')) ui.closeMenu(); else document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); }
    if (pressed(gp, 9)) $('#btn-menu').click();
  }
  requestAnimationFrame(padLoop);
}
requestAnimationFrame(padLoop);
