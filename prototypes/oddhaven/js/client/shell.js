// The game shell: title screen, ☰ menu, ! report button, settings, the speed readout, What's new, Credits, account pill.
// Works on every screen, on touch, keyboard and controller (Tumblefair's padnav walks the top `.modal`).
import { createWhatsNew } from '../../../../shared/whats-new.js';
import { createCredits } from '../../../../shared/credits.js';
import { accountButton } from '../../../../shared/rgs-signin.js';
import { createPadNav } from '../../../tumblefair/js/client/padnav.js';

export const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'on') for (const [e, f] of Object.entries(v)) n.addEventListener(e, f); else n.setAttribute(k, v); }
  n.append(...kids.filter(Boolean)); return n;
};
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };

export const BUILD = '2026-10-31-m8';
const REPORT_LAN = /^(localhost|127\.|192\.168\.|10\.|100\.)/.test(location.hostname);
const REPORT_URL = REPORT_LAN ? new URL('../../../../api/inbox/oddhaven-report', import.meta.url) : 'https://games.radgh.com/api/report/oddhaven';
export const SOAK_URL = new URL('../../../../api/inbox/oddhaven-soak', import.meta.url);

export function loadSettings() {
  let s = {}; try { s = JSON.parse(ls.get('oddhaven.settings') || '{}'); } catch { /* start fresh */ }
  return { sound: 0.8, voices: 'on', tier: 'auto', speed: false, ...s };
}
export const saveSettings = s => ls.set('oddhaven.settings', JSON.stringify(s));

export function createShell({ game }) {
  const S = game.settings;
  const news = createWhatsNew({ url: new URL('../../data/changelog.json', import.meta.url), key: 'oddhaven', title: "What's new" });
  const credits = createCredits({ game: 'oddhaven', made: 'Oddhaven, by Radley Sustaire.', sounds: true });
  const root = el('div', { class: 'od-shell' });
  document.body.append(root);
  const toast = (text) => { const t = el('div', { class: 'od-toast', text }); root.append(t); setTimeout(() => t.remove(), 2600); };

  function modal({ title, body = [], buttons = [], onClose }) {
    const close = () => { box.remove(); onClose?.(); game.modalChanged(); };
    const panel = el('div', { class: 'od-panel' }, el('header', {}, el('h2', { text: title }), el('button', { class: 'od-x', 'aria-label': 'Close', text: '×', on: { click: close } })), ...body,
      ...buttons.map(b => el('button', { class: 'od-big' + (b.quiet ? ' quiet' : ''), text: b.label, on: { click: () => { if (!b.keep) close(); b.onClick?.(); } } })));
    const box = el('div', { class: 'modal od-modal', role: 'dialog', 'aria-label': title }, panel);
    box.close = close;
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.body.append(box); game.modalChanged();
    return box;
  }
  const topModal = () => [...document.querySelectorAll('.od-modal')].pop();
  const seg = (label, options, value, set) => {
    const row = el('div', { class: 'od-seg' });
    for (const [v, text] of options) row.append(el('button', { class: v === value ? 'on' : '', text, on: { click: e => { for (const b of row.children) b.classList.remove('on'); e.currentTarget.classList.add('on'); set(v); } } }));
    return el('div', { class: 'od-row' }, el('span', { text: label }), row);
  };
  function settings() {
    const tierNote = el('small', { text: `Now: ${game.tier === 'low' ? 'Low' : 'High'}` });
    modal({ title: 'Settings', body: [
      seg('Sound', [[0, 'Off'], [0.4, 'Low'], [0.8, 'On']], S.sound, v => { S.sound = v; saveSettings(S); game.setVolume(v); }),
      seg('Voices', [['on', 'On'], ['off', 'Off']], S.voices, v => { S.voices = v; saveSettings(S); }),
      seg('Graphics', [['auto', 'Auto'], ['low', 'Low'], ['high', 'High']], S.tier, v => { S.tier = v; saveSettings(S); game.setTierSetting(v); tierNote.textContent = `Now: ${game.tier === 'low' ? 'Low' : 'High'}`; }), tierNote,
      seg('Speed numbers', [[false, 'Hide'], [true, 'Show']], S.speed, v => { S.speed = v; saveSettings(S); readout(v); }),
      el('p', { class: 'od-tip', text: 'Town view: drag to move, pinch or wheel to zoom, tap a person or a place. W A S D or arrows move, Q E zoom, 1 2 3 speed, Space pause, Esc menu. Controller: left stick moves, right stick zooms, A taps the middle of the screen, B lets go, X gives an order, Y changes speed.' }),
      el('p', { class: 'od-tip', text: 'Driving: W A S D or arrows, Space handbrake, H horn, M view, R back on the road. Controller: stick, right trigger gas, left trigger brake, A handbrake, Back view, Start menu.' }),
      el('p', { class: 'od-tip', text: 'Playing someone: T takes over whoever you have picked. W is always the top of the screen, Shift walks, E gets in and out of cars, F opens Hand back, Party and Car. Click or tap the ground to walk there. Controller: stick moves, X gets in and out, Y opens the list. In any list: arrows and Enter, or d-pad and A.' }),
      el('p', { class: 'od-tip', text: 'On a fire: walk to the engine and press E to take the hose, E at a hydrant to connect it. Hold E, X on a controller, or the big button to spray, and steer with the stick or W A S D. E breaks a jammed door with the needle in the middle, lifts someone, and sets them down outside. When a Moment pops up, press J or Y on a controller to jump in.' }),
      el('p', { class: 'od-tip', text: 'With friends: Friends on the ☰ menu has the code, the players and the party. When someone asks something, the bar at the top takes Yes and No: J on keys, Y on a controller says yes.' }),
      el('p', { class: 'od-tip', text: 'At work: E, X on a controller, or the big button does the job it names. Swing and pull with the needle in the middle. A log on your shoulder slows you down. P opens the Phone; a controller has it on the Y list, and Back in town view. To Stir, drag one person onto another, or tap someone with a person picked.' }),
    ], buttons: [{ label: 'Done' }] });
  }
  function report() {
    const shot = game.capture(), perf = game.perfReport();
    const text = el('textarea', { placeholder: 'What went wrong, or what would you like? Plain words are perfect.', rows: 5 });
    modal({ title: 'Report a problem', body: [text, el('p', { class: 'od-tip', text: 'Your note, a picture of the screen and a few details (speed, build, device) are sent to the developer.' })],
      buttons: [{ label: 'Send', onClick: () => {
        const rep = { at: new Date().toISOString(), kind: 'report', text: text.value, screen: game.screen, state: game.state(), perf, ua: navigator.userAgent, size: [innerWidth, innerHeight], build: BUILD, shot: shot && shot.length < 180000 ? shot : null };
        let list = []; try { list = JSON.parse(ls.get('oddhaven.reports') || '[]'); } catch { /* start fresh */ }
        list.push(rep); while (JSON.stringify(list).length > 600000) list.shift();
        ls.set('oddhaven.reports', JSON.stringify(list));
        sendReports(); toast('Thank you. Report sent.');
      } }, { label: 'Cancel', quiet: true }] });
  }
  async function sendReports() {
    let list = []; try { list = JSON.parse(ls.get('oddhaven.reports') || '[]'); } catch { return; }
    let changed = false;
    for (const rep of list) {
      if (rep.sent) continue;
      try { const r = await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rep) }); if (r.ok) { rep.sent = true; rep.shot = null; changed = true; } else break; } catch { break; }
    }
    if (changed) ls.set('oddhaven.reports', JSON.stringify(list));
  }
  setTimeout(sendReports, 4000);

  function menu() {
    const hands = game.screen === 'hands', driving = game.driving && !hands;
    modal({ title: 'Menu', body: [], buttons: [
      { label: hands ? 'Keep going' : driving ? 'Back to the road' : 'Back to town' },
      ...(game.screen === 'title' ? [] : [{ label: game.inRoom() ? 'Friends' : 'Bring a friend', onClick: () => game.friends() }]),
      { label: 'Phone', onClick: () => game.phoneOpen() },
      ...(hands ? [{ label: 'Hand back', onClick: () => game.handBack() }, { label: 'Party', onClick: () => game.partyMenu() }, { label: 'Summon a car', onClick: () => game.carMenu() }, { label: 'Change clothes', onClick: () => game.clothesMenu() }, ...(game.driving ? [{ label: 'Put the car back on the road', onClick: () => game.rescue() }] : [])] : []),
      ...(driving ? [{ label: 'View: ' + (game.view === 'top' ? 'top-down' : 'behind the car'), onClick: () => game.toggleView() },
        { label: 'Put the car back on the road', onClick: () => game.rescue() }, { label: 'Back to town view', onClick: () => game.toGod() }] : []),
      ...(game.screen === 'god' ? [{ label: 'Make a person', onClick: () => game.makePerson() }] : []),
      { label: 'Settings', onClick: settings }, { label: "What's new", onClick: () => news.open() }, { label: 'Credits', onClick: () => credits.open() },
      { label: 'Report a problem', onClick: report }, { label: 'Title screen', quiet: true, onClick: () => game.toTitle() },
    ] });
  }
  // corner buttons, on every screen
  const burger = el('button', { class: 'od-corner od-burger', 'aria-label': 'Menu', text: '☰', on: { click: () => (topModal() ? topModal().close() : menu()) } });
  const bang = el('button', { class: 'od-corner od-bang', 'aria-label': 'Report a problem', text: '!', on: { click: report } });
  root.append(burger, bang);

  // ---- HUD
  const hud = el('div', { class: 'od-hud', hidden: '' }), speed = el('b', { text: '0' }), place = el('div', { class: 'od-place' });
  hud.append(el('div', { class: 'od-speedo' }, speed, el('small', { text: 'km/h' })));
  root.append(hud, place);
  let placeTimer = 0;
  const showPlace = name => { place.textContent = name; place.classList.add('on'); clearTimeout(placeTimer); placeTimer = setTimeout(() => place.classList.remove('on'), 2600); };

  // ---- speed readout
  let box = null, timer = 0;
  function readout(on) {
    clearInterval(timer); box?.remove(); box = null;
    if (!on) return;
    box = el('pre', { class: 'od-numbers' }); root.append(box);
    timer = setInterval(() => {
      const r = game.perfReport(), g = game.state();
      box.textContent = `${r.fps ?? '-'} fps  p95 ${r.p95 ?? '-'} ms\nrules ${r.ms.rules}  picture ${r.ms.picture}  draw ${r.ms.draw}\n${r.draws} draws  ${Math.round(r.tris / 1000)}k tris\ncars ${g.carsDrawn}  bodies ${g.bodies}  stand-ins ${g.standIns}\n${g.tier}  x${g.dpr}\nsim ${g.sim.tickMs} ms a tick  day ${g.sim.day + 1}  ${g.sim.rows} near`;
    }, 500);
  }
  readout(S.speed);

  // ---- title
  const title = el('div', { class: 'od-title' }), cont = el('div', { class: 'od-cont' }), gallerySlot = el('div', { class: 'od-gslot' });
  title.append(
    el('h1', { text: 'Oddhaven' }), el('p', { text: 'A town that keeps going without you. Pick a household and watch.' }),
    cont, el('button', { class: 'od-big od-make', type: 'button', text: 'Make your own person', on: { click: () => game.makePerson() } }), el('button', { class: 'od-big od-together quiet', type: 'button', text: 'Play together', on: { click: () => game.playTogether() } }), el('h2', { class: 'od-pick', text: 'Or choose a household' }), gallerySlot,
    el('div', { class: 'od-small' }, news.button({ label: "What's new" }), credits.button({ label: 'Credits', className: 'od-link' }), el('button', { class: 'od-link', text: 'Settings', on: { click: settings } })));
  root.append(title);
  try { root.append(el('div', { class: 'od-account' }, accountButton({ game: 'oddhaven', gameName: 'Oddhaven' }))); } catch (e) { console.warn('[oddhaven] account', e); }
  news.ensure?.();

  const nav = createPadNav({ busy: () => game.screen !== 'title' && !document.querySelector('.modal'), back: () => { const m = topModal(); if (m) { m.close(); return true; } return !!document.querySelector('.modal')?.querySelector('[data-close]')?.click(); } });
  nav.start?.();

  const fadeBox = el('div', { class: 'od-fade' });
  root.append(fadeBox);
  return {
    fade() { fadeBox.classList.remove('on'); void fadeBox.offsetWidth; fadeBox.classList.add('on'); },
    toast, showPlace, menu, toggleMenu: () => (topModal() ? topModal().close() : menu()), report, settings, modal, closeAll() { for (const m of document.querySelectorAll('.od-modal')) m.close(); },
    root, gallerySlot, burger,
    /** The Continue button; `meta` null hides it. */
    continueWith(meta, onClick) { cont.textContent = ''; if (meta) cont.append(el('button', { class: 'od-big od-play', text: 'Continue', on: { click: onClick } }), el('small', { text: `${meta.name}, day ${meta.day + 1}` })); },
    screen(name) { title.hidden = name !== 'title'; hud.hidden = name !== 'drive'; root.dataset.screen = name; root.querySelector('.od-account').hidden = name !== 'title'; },
    speed(kmh) { speed.textContent = kmh; },
    soakBanner() { const b = el('div', { class: 'od-soak' }); root.append(b); return b; },
  };
}
