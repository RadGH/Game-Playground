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
//   · the "Key bindings" settings tab     input/bindings-ui.js (settings.js asks for it when present)
// window.tvinput = test hooks.
import { ACTION_BY_ID } from './bindings.js';
import { B, setRunner, saveBindings, onBindings } from './keyboard.js';
import { device } from './device.js';
import { actionKey, keyTap } from './emit.js';
import { installHints, hintFor } from './hints.js';
import { createRadial } from './radial.js';
import { createFocus } from './focus.js';
import { createOsk } from './osk.js';
import { createGamepad } from './gamepad.js';
import { applyLayout, onLayout } from './layout.js';
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
    pause: () => api.pause?.(),
    radial: () => radial.open({ hold: false }),
    chat: () => { api.chat?.(); if (device.current === 'pad') setTimeout(() => { const i = document.getElementById('chat-input'); if (i) osk.open(i); }, 30); },
  };
  const run = (name, id) => { const fn = RUN[name]; if (fn) fn(); else if (id) actionKey(id); };
  setRunner(run, () => api.inWorld?.() !== false);

  const radial = createRadial({ run, parent: hudEl.parentElement || document.body });
  const osk = createOsk({ parent: document.body });
  const focus = createFocus({ parent: document.body, onText: el => osk.open(el) });
  const pad = createGamepad({ api, focus, radial, osk, run });
  const hints = installHints();
  device.on(d => { if (d !== 'pad') { focus.enable(false); osk.close(); if (radial.isOpen && d === 'keyboard') radial.close(); } });

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
  const out = { device, bindings: B, radial, osk, focus, pad, hints, run, layout, touch: null, hintFor, activity, partyArrows,
    tick(dt) { activity.tick(); pad.tick(dt); touch?.tick?.(dt); autoLamp(); partyArrows.tick(dt); },
    act: (id, down) => { const a = ACTION_BY_ID[id]; if (!a) return false; if (a.run) { if (down !== false) run(a.run, id); return true; } return actionKey(id, down); },
  };
  const loadTouch = () => { if (touch || loadTouch.busy) return; loadTouch.busy = true; import('./touch.js').then(m => { touch = out.touch = m.createTouch({ api, input: out, run, radial }); html.dataset.touchReady = '1'; device.seen('touch'); }).catch(e => console.error('[input] touch layer not loaded:', e)); };
  if (layout === 'phone') loadTouch();
  onLayout(l => { out.layout = l; if (l === 'phone') loadTouch(); else api.controls?.setAnalog?.(null); });   // rotate, resize, or the Settings switch
  installBindingsUi({ api, input: out, save: saveBindings, onBindings });

  window.tvinput = { state: () => ({ device: device.current, glyphs: device.glyphs, pad: { ...pad.stats }, layout, radial: radial.isOpen ? radial.at || true : false, osk: osk.isOpen, focus: focus.current ? (focus.current.id || focus.current.className || focus.current.tagName) : null, steering: focus.steering, keys: B.overrides }), device, B, radial, osk, focus, pad, act: out.act, keyTap, get touch() { return touch; } };
  installed = out;
  return out;
}
