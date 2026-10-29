// The ☰ menu (on every screen) and the Settings panel. Both are enamel plates with lit push-buttons, knobs and
// toggles — the same parts as the desk, so a controller walks them the same way (d-pad, A, B backs out).
// "!" report and the account pill arrive with M8.
import { createKnob } from '../knob.js';
import { SETTINGS_SPEC } from '../settings.js';

export function modal({ cls = '', title, sub = '' }) {
  const root = document.createElement('div');
  root.className = `modal lodestar-modal ${cls}`.trim();
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', title);
  root.innerHTML = `<div class="plate-panel"><i class="rivet tl"></i><i class="rivet tr"></i><i class="rivet bl"></i><i class="rivet br"></i>
    <header class="plate-head"><h2>${title}</h2>${sub ? `<span>${sub}</span>` : ''}<button type="button" class="plate-x" data-close aria-label="Close">✕</button></header>
    <div class="plate-body"></div></div>`;
  const body = root.querySelector('.plate-body');
  return { root, body };
}

export function pushButton(label, { cls = '', lamp = 'amber', act = '' } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `push ${cls}`.trim(); if (act) b.dataset.act = act;
  b.innerHTML = `<span class="push-lamp lamp-${lamp}"></span><span class="push-label">${label}</span>`;
  return b;
}

/** A single on/off toggle switch (bat lever) for settings. */
export function toggleSwitch(label, value, onChange, sound) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'toggle single'; b.setAttribute('aria-pressed', String(value)); b.setAttribute('aria-label', label);
  b.innerHTML = `<span class="toggle-plate"><span class="toggle-nut"></span><span class="toggle-bat"></span></span><span class="toggle-label">${label}</span><span class="toggle-state">${value ? 'ON' : 'OFF'}</span>`;
  b.classList.toggle('up', value);
  b.addEventListener('click', () => { value = !value; b.classList.toggle('up', value); b.setAttribute('aria-pressed', String(value)); b.querySelector('.toggle-state').textContent = value ? 'ON' : 'OFF'; sound(value ? 'slap' : 'slapdown'); onChange(value); });
  return b;
}

export function openModal(C, m, { onClose } = {}) {
  const close = () => { m.root.remove(); onClose?.(); C.modalClosed?.(); };
  m.root.addEventListener('click', e => { if (e.target === m.root || e.target.closest('[data-close]')) { C.room.play('press'); close(); } });
  m.root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  document.body.append(m.root);
  m.root.querySelector('button:not([data-close])')?.focus({ preventScroll: true });
  m.close = close;
  return m;
}

export function openSettings(C) {
  const m = modal({ cls: 'settings-modal', title: 'SETTINGS', sub: 'Kept on this device' });
  const S = C.settings, snd = (s, o) => C.room.play(s, o);
  const knobs = document.createElement('div'); knobs.className = 'settings-knobs';
  const mk = (key, name) => {
    const spec = SETTINGS_SPEC[key];
    const k = createKnob({ name, id: `set-${key}`, labels: spec.labels, names: spec.names || spec.labels, index: S[key], sound: snd, onChange: i => C.setSetting(key, i) });
    knobs.append(k.el);
  };
  mk('volume', 'SOUND'); mk('quality', 'QUALITY'); mk('padSpeed', 'PAD PEN');
  const toggles = document.createElement('div'); toggles.className = 'settings-toggles';
  const tg = (key, label) => toggles.append(toggleSwitch(label, S[key], v => C.setSetting(key, v), snd));
  tg('hum', 'ROOM HUM'); tg('voice', 'RADIO VOICE'); tg('crt', 'CRT GLASS'); tg('penOffset', 'TOUCH PEN ABOVE FINGER');
  m.body.append(knobs, toggles);
  m.body.insertAdjacentHTML('beforeend', '<p class="plate-note">Controls: WASD / arrows pan (W is north) · Q E or − = range · F filter · 1–6 tools · Space pause · , . time · G degauss · Esc menu. Controller: left stick pen, right stick pan, LT RT range, A press, B back, LB RB machines, Start menu.</p>');
  return openModal(C, m);
}

export function mountMenu(C) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'menu-btn'; btn.setAttribute('aria-label', 'Menu');
  btn.innerHTML = '<span class="menu-icon">☰</span>';
  btn.addEventListener('click', () => open());
  let m = null;
  function open() {
    if (m?.root.isConnected) return m.close();
    C.room.play('press');
    m = modal({ cls: 'menu-modal', title: 'COMMAND MENU' });
    const items = [
      ['RETURN TO DESK', 'back', 'green', () => m.close()],
      ["WHAT'S NEW", 'news', 'amber', () => { m.close(); C.news.open(); }],
      ['SETTINGS', 'settings', 'amber', () => { m.close(); openSettings(C); }],
      ['QUIT TO TITLE', 'quit', 'red', () => { m.close(); C.quit(); }],
    ];
    for (const [label, act, lamp, fn] of items) { const b = pushButton(label, { lamp, act }); b.addEventListener('click', () => { C.room.play('press'); fn(); }); m.body.append(b); }
    const dot = m.body.querySelector('[data-act=news]');
    if (C.news.unread) dot.classList.add('wn-has-new');
    openModal(C, m);
  }
  return { el: btn, open, get isOpen() { return !!m?.root.isConnected; } };
}
