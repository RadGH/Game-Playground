// The ☰ menu (pauses the game): resume, the ship screens, Controls, Settings, What's new, Credits, Report a bug,
// save, quit to title. Settings live per device in localStorage.

import { $, el, btn, modal, panel, toast, num } from './dom.js';
import { BINDINGS, bindingText } from '../core/input.js';
import { save, storeDamage } from '../sim/state.js';
import { news, creditsBox } from './title.js';
import { ask } from '../../../../shared/dialog.js';

export function initMenu(app) {
  app.openMenu = () => openMenu(app);
  app.openSettings = () => openSettings(app);
  app.openControls = () => openControls(app);
  app.openReport = () => openReport(app);
}

function openMenu(app) {
  if ($('#panels .menu-modal')) return;
  document.exitPointerLock?.();
  modal('Menu', (m, close) => {
    m.parentElement.classList.add('menu-modal');
    const list = el('div', { class: 'menu-list' });
    const add = (label, fn, cls = '') => list.append(btn(label, () => { close(); fn(); }, cls));
    add('Resume', () => {}, 'primary');
    if (app.mode === 'fly') {
      add('Hold — parts and ore (I)', () => app.openHold());
      add('Star map (M)', () => app.openMap());
      add('Goals (J)', () => app.openGoals());
    }
    add('Controls', () => openControls(app));
    add('Settings', () => openSettings(app));
    list.append(btn("What's new", () => { close(); news.open(); }), btn('Credits', () => { close(); creditsBox.open(); }));
    for (const it of app.menuItems) if (!it.when || it.when(app)) add(it.label, () => it.run(app));
    add('Report a bug', () => openReport(app));
    if (app.G) {
      add('Save game', () => { if (app.P && !app.P.dead && app.mode === 'fly') storeDamage(app.G, app.P.grid); toast(save(app.G) ? 'Saved.' : 'Could not save (storage full or blocked).', 'good'); });
      add('Save and quit to title', async () => {
        if (app.mode === 'fly' && app.w.t - app.w.combatT < 6 && !(await ask({ title: 'Quit mid-fight?', text: 'Your ship is saved as it is now, damage and all.', ok: 'Quit' }))) return;
        if (app.P && !app.P.dead && app.mode === 'fly') storeDamage(app.G, app.P.grid);
        save(app.G); location.reload();
      }, 'danger');
    }
    m.append(list);
  });
}

function openSettings(app) {
  const P = panel('Settings', null);
  const pr = app.prefs;
  const sec = (title, ...rows) => el('div', { class: 'section', style: 'max-width:720px' }, el('h3', {}, title), ...rows);
  const slider = (label, key, min, max, stepv, show) => {
    const val = el('span', { class: 'val' }, show(pr[key]));
    const inp = el('input', { type: 'range', min, max, step: stepv, value: pr[key] });
    inp.addEventListener('input', () => { pr[key] = +inp.value; val.textContent = show(pr[key]); app.savePrefs(); });
    return el('div', { class: 'set-row' }, el('span', {}, label), inp, val);
  };
  const seg = (label, key, opts) => {
    const row = el('div', { class: 'seg' });
    const draw = () => row.replaceChildren(...opts.map(([v, l]) => btn(l, () => { pr[key] = v; app.savePrefs(); draw(); }, pr[key] === v ? 'on' : '')));
    draw(); return el('div', { class: 'set-row' }, el('span', {}, label), row, el('span'));
  };
  P.body.append(
    sec('Sound', slider('Volume', 'volume', 0, 1, 0.05, v => `${Math.round(v * 100)}%`), seg('Sound', 'muted', [[false, 'On'], [true, 'Off']])),
    sec('Controls', slider('Mouse speed', 'sens', 0.3, 2.5, 0.05, v => `×${num(v * 100) / 100}`), seg('Mouse up/down', 'invertY', [[false, 'Normal'], [true, 'Inverted']])),
    sec('Picture', seg('Graphics', 'quality', [['high', 'High (glow)'], ['low', 'Low (faster)']]), slider('Field of view', 'fov', 55, 95, 1, v => `${Math.round(v)}°`), seg('Screen shake', 'shake', [['full', 'Full'], ['gentle', 'Gentle'], ['off', 'Off']])),
  );
}

function openControls(app) {
  const P = panel('Controls', null);
  const grid = el('div', { class: 'controls-grid section', style: 'max-width:820px' });
  grid.append(el('b', {}, 'Action'), el('b', { class: 'k' }, 'Keyboard and mouse'), el('b', { class: 'k' }, 'Controller'));
  grid.append(el('span', {}, 'Steer (the ship turns toward the crosshair)'), el('span', { class: 'k' }, 'Mouse'), el('span', { class: 'k' }, 'Right stick'));
  for (const b of BINDINGS) grid.append(el('span', {}, b.label), el('span', { class: 'k' }, bindingText(b.id) || '—'), el('span', { class: 'k' }, b.pad || '—'));
  grid.append(el('span', {}, 'Camera distance'), el('span', { class: 'k' }, 'Mouse wheel'), el('span', { class: 'k' }, '—'));
  P.body.append(grid, el('div', { class: 'section', style: 'max-width:820px' }, el('h3', {}, 'Shipyard (building)'), el('div', { class: 'controls-grid' },
    ...[['Place a block on the face you point at', 'Left click', 'A'], ['Remove a block', 'Right click', 'B'], ['Turn the camera', 'Drag (any button) / arrow keys', 'Right stick'], ['Zoom', 'Mouse wheel', 'LT / RT'], ['Move the cursor block', '—', 'Left stick + LB / RB'], ['Mirror left/right', 'X', 'Y'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y', '—'], ['Pick the block you point at', 'Middle click', '—']].flatMap(([a, k, p]) => [el('span', {}, a), el('span', { class: 'k' }, k), el('span', { class: 'k' }, p)]))));
}

// Reports: on the LAN to the dev server's inbox (tools/serve.py POST /api/inbox/<name>), anywhere else to
// games.radgh.com's report inbox.
const REPORT_LAN = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
const REPORT_URL = REPORT_LAN ? new URL('../../../../api/inbox/hullforge-report', import.meta.url) : 'https://games.radgh.com/api/report/hullforge';
function openReport(app) {
  modal('Report a bug', (m, close) => {
    const text = el('textarea', { rows: 5, placeholder: 'What went wrong, or what would you like? Plain words are perfect.' });
    m.append(text, el('p', { class: 'hint' }, 'Your note, a picture of the screen and a few game details go to the developer.'),
      el('div', { class: 'row end' }, btn('Cancel', close), btn('Send', async () => {
        if (!text.value.trim()) { toast('Write a few words first.', 'bad'); return; }
        let shot = null; try { app.renderer.render(app.scene, app.camera); shot = $('#view').toDataURL('image/jpeg', 0.5); if (shot.length > 400000) shot = null; } catch { /* */ }
        const rep = { at: new Date().toISOString(), text: text.value, state: window.gameEye.state(), ua: navigator.userAgent, size: [innerWidth, innerHeight], build: (await import('../main.js')).BUILD, shot };
        close(); send(rep);
      }, 'primary')));
    setTimeout(() => text.focus(), 30);
  });
}
async function send(rep) {
  let list = []; try { list = JSON.parse(localStorage.getItem('hullforge.reports') || '[]'); } catch { /* */ }
  list.push(rep); const left = [];
  for (const r of list) { try { const res = await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) }); if (!res.ok) left.push(r); } catch { left.push(r); } }
  try { localStorage.setItem('hullforge.reports', JSON.stringify(left.slice(-10))); } catch { /* */ }
  toast(left.length ? 'Saved your report — it will send when the connection is back.' : 'Thank you — report sent.', 'good');
}
