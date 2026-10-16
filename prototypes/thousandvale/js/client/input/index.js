// Input layer (play-test 5, T26/T27 — stream G) — one call from main.js:
//
//   const input = installInput({ controls, hud, setTarget, targetId, pause, inWorld, dead, settings, panels, chat });
//   input.tick(dt)            // once a frame (the gamepad is polled, the focus ring follows its element)
//
// It adds, without changing a handler anywhere else:
//   · re-bound keys            input/keyboard.js (the table is input/bindings.js; saved in this browser)
//   · gamepads                 input/gamepad.js + focus.js (windows) + radial.js (the quick wheel) + osk.js (text)
//   · key hints that follow the device   input/hints.js
//   · the phone layout's touch controls  input/touch.js — only when <html data-layout="phone"> (input/layout.js is the switch)
//   · the controller layout (2026-10-16)  input/pad-layout.js + css/layout-pad.css — <html data-layout="pad">, switched on
//                                         while a controller is the device in use; Menu opens the controller menu
//   · the "Key bindings" settings tab     input/bindings-ui.js (settings.js asks for it when present)
// window.tvinput = test hooks.
import { ACTION_BY_ID, GLYPHS } from './bindings.js';
import { B, setRunner, saveBindings, onBindings } from './keyboard.js';
import { device } from './device.js';
import { actionKey, keyTap } from './emit.js';
import { installHints, hintFor } from './hints.js';
import { createRadial } from './radial.js';
import { createFocus } from './focus.js';
import { createOsk } from './osk.js';
import { createGamepad } from './gamepad.js';
import { applyLayout, onLayout, notePadDevice } from './layout.js';
import { createPadLayout } from './pad-layout.js';
import { installBindingsUi } from './bindings-ui.js';
import { createActivity } from './activity.js';
import { createPartyArrows } from './party-arrows.js';

let installed = null;
export function installInput(api = {}) {
  if (installed) return installed;
  const html = document.documentElement;
  const hudEl = document.getElementById('hud') || document.body;
  if (!document.querySelector('link[href$="css/input.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../../css/input.css', import.meta.url).href; document.head.appendChild(l); }
  try { const g = localStorage.getItem('tv.glyphs'); if (g) device.setGlyphs(g); } catch { /* private window */ }

  // ---- actions with no key event of their own
  const members = () => [...document.querySelectorAll('#party .pmember')].filter(e => !e.classList.contains('offline'));
  let allyAt = -1;
  function ally(dir) {
    const list = members();
    if (!list.length) { api.hud?.toast?.('You are not in a party.', 'warn'); return; }
    const sel = list.findIndex(e => e.classList.contains('targeted'));
    if (sel < 0 && allyAt < 0 && dir > 0) {
      // the first press goes to whoever is hurt the most (a healer's first question)
      const hp = e => parseFloat(e.querySelector('.bar.hp i')?.style.width || '100');
      allyAt = list.indexOf([...list].sort((a, b) => hp(a) - hp(b))[0]);
    } else allyAt = ((sel >= 0 ? sel : allyAt) + dir + list.length) % list.length;
    list[allyAt].click();
    for (const [i, e] of list.entries()) e.classList.toggle('targeted', i === allyAt);
  }
  const RUN = {
    allyNext: () => ally(1), allyPrev: () => ally(-1),
    targetClear: () => { allyAt = -1; for (const e of members()) e.classList.remove('targeted'); api.setTarget?.(null); },
    // 2026-10-16: the controller layout's Menu is the controller menu (every window as a tile); elsewhere the pause menu
    pause: () => (out.layout === 'pad' ? padLayout.toggle() : api.pause?.()),
    hudInfo: () => (out.layout === 'phone' ? document.querySelector('.ph-info')?.click() : padLayout.toggleInfo()),
    radial: () => radial.open({ hold: false }),
    chat: () => { if (out.layout === 'pad') padLayout.chatOpen(true);      // the folded chat's box is display:none — unfold it first or it cannot take the focus
      api.chat?.(); if (device.current === 'pad') setTimeout(() => { const i = document.getElementById('chat-input'); if (i) osk.open(i); }, 30); },
  };
  const run = (name, id) => { const fn = RUN[name]; if (fn) fn(); else if (id) actionKey(id); };
  setRunner(run, () => api.inWorld?.() !== false);

  const radial = createRadial({ run, parent: hudEl.parentElement || document.body });
  const osk = createOsk({ parent: document.body, glyphs: () => GLYPHS[device.glyphs] || GLYPHS.xbox });
  const focus = createFocus({ parent: document.body, onText: el => osk.open(el) });
  const pad = createGamepad({ api, focus, radial, osk, run });
  const hints = installHints();
  device.on(d => { notePadDevice(d === 'pad'); if (d !== 'pad') { focus.enable(false); osk.close(); if (radial.isOpen && d === 'keyboard') radial.close(); } });
  // the mouse taking over counts as soon as it really MOVES (a trackpad brushed by a palm does not: 60 px of travel with no pause longer than a second)
  let mv = { x: 0, y: 0, t: 0, d: 0 };
  addEventListener('mousemove', e => { if (!e.isTrusted || device.current !== 'pad') return; const now = performance.now(); if (now - mv.t > 1000) mv.d = 0; else mv.d += Math.hypot(e.clientX - mv.x, e.clientY - mv.y); mv.x = e.clientX; mv.y = e.clientY; mv.t = now; if (mv.d > 60) device.seen('keyboard'); }, { passive: true, capture: true });

  // ---- the phone layout (off in the game until the owner approves it: input/layout.js)
  let touch = null;
  const layout = applyLayout();
  // Y1 (G2): an activity starting (a mini-game, a cast, a talk, a shop) lets go of whatever was moving you, on every device
  const activity = createActivity({ release: [() => api.controls?.release?.(), () => pad.release?.(), () => touch?.release?.()] });
  // Y36 (G2): a small arrow on the screen's edge for every party member who is off the screen
  const partyArrows = createPartyArrows({ api, parent: hudEl });
  // Y35 (G2): the Attack slot wears a lit ring for as long as auto-attack is on (every layout; css/input.css)
  let slot0 = null, autoWas = null;
  function autoLamp() {
    const on = api.controls?.auto != null;
    if (on === autoWas) return; autoWas = on;
    slot0 = slot0 || document.querySelector('#actionbar > .slot');
    if (slot0) { slot0.classList.toggle('auto', on); slot0.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  }
  const padLayout = createPadLayout({ api: { ...api, glyphs: () => pad.glyphs() }, focus, osk, run });
  const out = { device, bindings: B, radial, osk, focus, pad, hints, run, layout, touch: null, hintFor, activity, partyArrows, padLayout,
    tick(dt) { activity.tick(); pad.tick(dt); touch?.tick?.(dt); autoLamp(); partyArrows.tick(dt); padLayout.tick(dt); },
    act: (id, down) => { const a = ACTION_BY_ID[id]; if (!a) return false; if (a.run) { if (down !== false) run(a.run, id); return true; } return actionKey(id, down); },
  };
  const loadTouch = () => { if (touch || loadTouch.busy) return; loadTouch.busy = true; import('./touch.js').then(m => { touch = out.touch = m.createTouch({ api, input: out, run, radial }); html.dataset.touchReady = '1'; device.seen('touch'); }).catch(e => console.error('[input] touch layer not loaded:', e)); };
  if (layout === 'phone') loadTouch();
  onLayout(l => { out.layout = l; padLayout.onLayout(l); if (l === 'phone') loadTouch(); else if (device.current !== 'pad') api.controls?.setAnalog?.(null); });   // rotate, resize, or the Settings switch
  installBindingsUi({ api, input: out, save: saveBindings, onBindings });

  window.tvinput = { state: () => ({ device: device.current, glyphs: device.glyphs, pad: { ...pad.stats }, layout: out.layout, padMenu: padLayout.isOpen, hudInfo: padLayout.infoOpen, radial: radial.isOpen ? radial.at || true : false, osk: osk.isOpen, focus: focus.current ? (focus.current.id || focus.current.className || focus.current.tagName) : null, steering: focus.steering, keys: B.overrides }), device, B, radial, osk, focus, pad, padLayout, act: out.act, keyTap, get touch() { return touch; } };
  installed = out;
  return out;
}
