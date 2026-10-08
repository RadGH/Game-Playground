// Play-test 2 Q15 (a pause menu with a settings screen), Q22 (show equipment) — stream D-UI.
//
// Esc with no window open (and nothing targeted) opens the pause menu: Resume · Settings · Help · Log out.
// Settings (saved in this browser; the two that other players feel are also sent to the server):
//   Graphics quality (applies after a reload) · Master / music / effects volume · Interface size
//   Only allow trade requests from friends (default off)  -> gw settings {op:'set', data:{tradeFriendsOnly}}
//   Show equipment / Show helm (default on)                -> pref {k:'showGear'|'showHelm', v} (others see it too)
//   Damage meter (play-test 8 W21, default OFF)            -> ui/meter-window.js listens (settings.on)
//   Key bindings (the list the help window shows)
//
//   const settings = createSettings({ net, hud, help, onLogout, onGear });
//   settings.get('showGear'); settings.on(fn); settings.pause.toggle();

import { h, createPanel } from '../ui-panel.js';
import { SETTINGS_DEFAULTS, QUALITIES, cleanSettings } from './pt2-core.js';
import { SHORTCUTS } from '../social-core.js';
import { send2 } from './net2.js';
import { bindingsTab } from '../input/bindings-ui.js';   // T27 (stream G): the one binding table — re-bind keys, controller glyphs, touch

const KEY = 'tv.settings';
const load = () => { try { return cleanSettings(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return { ...SETTINGS_DEFAULTS }; } };

/** The saved quality for main.js's boot (null = automatic). */
export function savedQuality() { const q = load().quality; return q && q !== 'auto' ? q : null; }

export function createSettings({ net, hud, help, onLogout, onGear }) {
  let S = load();
  const subs = new Set();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private window */ } }
  function set(k, v, { send = true } = {}) {
    S = cleanSettings({ ...S, [k]: v }); save(); apply();
    if (send) {
      if (k === 'tradeFriends') send2.settings(net(), 'set', { tradeFriendsOnly: !!S.tradeFriends });
      if (k === 'showGear' || k === 'showHelm') { send2.pref(net(), k, S[k]); onGear?.(); }
    }
    for (const fn of subs) { try { fn(k, S[k]); } catch {} }
  }
  function apply() {
    const hud = document.getElementById('hud');
    if (hud) hud.style.setProperty('--ui-scale', String(S.ui));
    document.documentElement.style.setProperty('--ui-scale', String(S.ui));
    document.documentElement.classList.toggle('ui-scaled', S.ui !== 1);
  }
  apply();

  // ---- the pause menu ----
  const pause = createPanel({ id: 'pause', title: 'Paused', width: 280, cls: 'pause-panel centered' });
  pause.setTitle('Menu', 'Esc to go back');
  pause.fill(h('div.pause-list', {},
    h('button.primary', { type: 'button', dataset: { act: 'resume' }, onclick: () => pause.close() }, 'Resume'),
    h('button.ghost.wide', { type: 'button', dataset: { act: 'settings' }, onclick: () => { pause.close(); panel.open(); } }, 'Settings'),
    h('button.ghost.wide', { type: 'button', dataset: { act: 'help' }, onclick: () => { pause.close(); help.toggle(true); } }, 'Help and controls'),
    h('button.ghost.wide.danger-ish', { type: 'button', dataset: { act: 'logout' }, onclick: () => { pause.close(); onLogout?.(); } }, 'Log out')),
  h('p.tiny-left.pause-note', {}, 'The world keeps going while this menu is open — it is a shared world.'));

  // ---- the settings window ----
  const panel = createPanel({ id: 'settings', title: 'Settings', width: 420, cls: 'settings-panel centered', onOpen: () => draw() });
  let tab = 'game';
  function draw() {
    const tabs = h('div.chips.set-tabs', { role: 'tablist' }, ...[['game', 'Game'], ['graphics', 'Graphics'], ['audio', 'Sound'], ['keys', 'Key bindings']].map(([id, label]) =>
      h('button.chip', { type: 'button', role: 'tab', 'aria-checked': String(tab === id), dataset: { tab: id }, onclick: () => { tab = id; draw(); } }, label)));
    const check = (k, label, tip) => h('label.set-row.check', { title: tip }, h('input', { type: 'checkbox', checked: !!S[k], dataset: { k }, onchange: e => set(k, e.target.checked) }), h('span', {}, label));
    const slider = (k, label, min, max, step, fmt) => {
      const out = h('em', {}, fmt(S[k]));
      return h('label.set-row', {}, h('span', {}, label), h('input', { type: 'range', min, max, step, value: String(S[k]), dataset: { k }, oninput: e => { out.textContent = fmt(+e.target.value); }, onchange: e => set(k, +e.target.value) }), out);
    };
    let body;
    if (tab === 'game') body = [
      h('h4', {}, 'Trading'),
      check('tradeFriends', 'Only allow trade requests from friends', 'Strangers who ask to trade are turned away without asking you.'),
      h('h4', {}, 'Your character'),
      check('showGear', 'Show equipment', 'Off: you are drawn in plain clothes (weapons stay in your hands). Everyone sees the choice.'),
      check('showHelm', 'Show helm', 'Off: your helm or hat is hidden, so your face shows. Everyone sees the choice.'),
      h('h4', {}, 'Interface'),
      slider('ui', 'Interface size', 0.8, 1.4, 0.05, v => `${Math.round(v * 100)}%`),
      check('meter', 'Damage meter', 'A window that counts the damage and healing of you, your pets and party members near you, fight by fight. Off by default. /meter in chat switches it too.'),
    ];
    else if (tab === 'graphics') body = [
      h('label.set-row', {}, h('span', {}, 'Graphics quality'), h('select', { dataset: { k: 'quality' }, onchange: e => { set('quality', e.target.value); hud.toast('Quality applies after a reload.', 'info'); } }, ...QUALITIES.map(q => h('option', { value: q.id, selected: S.quality === q.id }, q.label)))),
      h('p.tiny-left', {}, 'Automatic picks Low on computers without a graphics card and High otherwise. A change takes effect the next time the page loads.'),
      h('button.ghost.wide', { type: 'button', onclick: () => location.reload() }, 'Reload now'),
    ];
    else if (tab === 'audio') body = [
      slider('master', 'Master volume', 0, 1, 0.05, v => `${Math.round(v * 100)}%`),
      slider('music', 'Music', 0, 1, 0.05, v => `${Math.round(v * 100)}%`),
      slider('sfx', 'Sound effects', 0, 1, 0.05, v => `${Math.round(v * 100)}%`),
      h('p.tiny-left', {}, 'Saved now; the valley has no sound yet, so these take effect when it does.'),
    ];
    else body = bindingsTab({ redraw: draw });   // T27: generated from js/client/input/bindings.js (SHORTCUTS is built from the same table)
    panel.setTitle('Settings', 'Saved as you change them');
    panel.fill(tabs, h('div.set-body', {}, ...body), h('div.row.end', {}, h('button.ghost.small', { type: 'button', onclick: () => { S = { ...SETTINGS_DEFAULTS }; save(); apply(); draw(); for (const k of ['tradeFriends', 'showGear', 'showHelm']) set(k, S[k]); } }, 'Defaults'), h('button.primary.small', { type: 'button', onclick: () => panel.close() }, 'Done')));
  }

  function wire(n) {
    // the server's copy wins for the account-wide one; the per-character prefs come in `joined.you.prefs`
    n.on('settings', m => { if (m?.data && typeof m.data.tradeFriendsOnly === 'boolean' && m.data.tradeFriendsOnly !== S.tradeFriends) { S.tradeFriends = m.data.tradeFriendsOnly; save(); if (panel.isOpen) draw(); } });
    n.on('joined', j => {
      const p = j.you?.prefs;
      // this browser's choice is what the player last set: tell the server if it differs
      if (p) for (const k of ['showGear', 'showHelm']) if (typeof p[k] === 'boolean' && p[k] !== S[k]) send2.pref(n, k, S[k]);
      if (!p && (!S.showGear || !S.showHelm)) for (const k of ['showGear', 'showHelm']) send2.pref(n, k, S[k]);
    });
  }
  return {
    get: k => S[k], all: () => ({ ...S }), set, on: fn => { subs.add(fn); return () => subs.delete(fn); }, wire, pause, panel,
    /** Esc with nothing else to close: open the pause menu (true = handled). */
    escape() { if (pause.isOpen) { pause.close(); return true; } pause.open(); return true; },
  };
}
