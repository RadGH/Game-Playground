// Input layer (T27) — gamepads. Standard-mapping pads (Xbox, PlayStation, most others) through navigator.getGamepads(),
// polled once a frame. What a button does comes from input/bindings.js:
//   in the world   left stick moves · right stick turns the camera · X strikes · Y B RB RT = skills 1–4 · hold LT for the
//                  second set (skills 5–6, mount, cast a line, camp, potions on the D-pad) · D-pad right = next enemy,
//                  down / up = party members, left = clear · A jumps — or uses, hooks, rises when that is what the
//                  screen is asking for · hold LB = the quick wheel · View = map · Menu = the pause menu
//   in a window    the focus ring (input/focus.js): D-pad / stick moves, A presses, B backs out, X = the other click,
//                  Y = its card, LB / RB = tabs, right stick scrolls — a steered pointer on the map and the perk forest
// Browsers only hand a page its gamepads on a SECURE page (https, or localhost): on the LAN use the https dev port
// (tools/README-servers.md — 8441 dev, 8442 stable).
import { PAD_BUTTONS, PAD_MOD, PAD_RADIAL, padLayers, glyphSetFor, ACTION_BY_ID, GLYPHS } from './bindings.js';
import { keyDown, keyUp, keyTap, releaseAll } from './emit.js';
import { device } from './device.js';

const DEAD = 0.22, REPEAT_FIRST = 320, REPEAT = 110;
const ZOOMS = [5.5, 9, 15];

export function createGamepad({ api, focus, radial, osk, run }) {
  const L = padLayers();
  const prev = new Array(17).fill(false);
  const heldAct = new Map();            // button name -> key code held down for it
  const rep = { dir: null, at: 0 };
  let sprint = false, padId = '', zoomI = 1, lastMode = 'world', seen = false;
  const stats = { polls: 0, presses: 0, mode: 'none', id: '' };

  const pick = () => { let pads = []; try { pads = [...(navigator.getGamepads?.() || [])].filter(Boolean); } catch { return null; } return pads.find(p => p.connected !== false && p.mapping === 'standard') || pads.find(p => p.connected !== false) || null; };
  const visible = sel => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; };
  /** What A means in the world right now: the screen decides. */
  function aAction() {
    if (api.dead?.()) return 'rise';
    const fs = document.querySelector('.tv-fish:not([hidden])')?.dataset.state; if (fs === 'bite' || fs === 'tug') return 'hook';
    if (visible('#interact:not([hidden])') || visible('.loot-prompt:not([hidden])')) return 'interact';
    return 'jump';
  }
  function stopHolds() { for (const [, code] of heldAct) keyUp(code); heldAct.clear(); if (sprint) { keyUp('ShiftLeft'); sprint = false; } api.controls?.setAnalog?.(null); }

  function world(btn, down, mod) {
    if (btn === PAD_RADIAL) { if (down) radial.open({ hold: true }); return; }
    if (btn === PAD_MOD) return;
    if (!down) { const code = heldAct.get(btn); if (code) { keyUp(code); heldAct.delete(btn); } return; }
    if (btn === 'L3') { sprint = !sprint; if (sprint) keyDown('ShiftLeft'); else keyUp('ShiftLeft'); return; }
    if (btn === 'R3') { zoomI = (zoomI + 1) % ZOOMS.length; if (api.controls?.cam) api.controls.cam.distWant = ZOOMS[zoomI]; return; }
    let id = btn === 'A' && !mod ? aAction() : (mod ? L.mod : L.plain)[btn];
    if (!id) return;
    const a = ACTION_BY_ID[id];
    if (a.run) { run(a.run, id); return; }
    if (!a.key) return;
    keyDown(a.key); heldAct.set(btn, a.key);
  }
  function menu(btn, down, pad) {
    if (!down) return;
    const title = !api.inWorld?.();
    switch (btn) {
      case 'A': focus.press(); break;
      case 'B': if (!title) keyTap('Escape'); else document.querySelector('#back-front:not([hidden]), .tv-panel:not([hidden]) [data-act="back"]')?.click(); break;
      case 'X': focus.alt(); break;
      case 'Y': focus.details(); break;
      case 'LB': focus.tab(-1); break;
      case 'RB': focus.tab(1); break;
      case 'LT': focus.zoom(-1); break;
      case 'RT': focus.zoom(1); break;
      case 'START': for (let i = 0; i < 6 && focus.container() && !title; i++) keyTap('Escape', 10); break;
      case 'BACK': if (!title) keyTap('KeyM'); break;
      case 'UP': focus.move(0, -1); break; case 'DOWN': focus.move(0, 1); break; case 'LEFT': focus.move(-1, 0); break; case 'RIGHT': focus.move(1, 0); break;
    }
  }
  function oskBtn(btn, down) {
    if (!down) return;
    switch (btn) {
      case 'A': osk.type(); break; case 'B': osk.close(); break; case 'X': osk.back(); break; case 'Y': osk.space(); break; case 'L3': osk.shift(); break; case 'START': osk.done(); break;
      case 'UP': osk.move(0, -1); break; case 'DOWN': osk.move(0, 1); break; case 'LEFT': osk.move(-1, 0); break; case 'RIGHT': osk.move(1, 0); break;
    }
  }
  function stickDir(x, y) { if (Math.hypot(x, y) < 0.55) return null; return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'RIGHT' : 'LEFT') : (y > 0 ? 'DOWN' : 'UP'); }

  function tick(dt = 0.016) {
    const pad = pick();
    stats.polls++;
    if (!pad) { if (seen) { seen = false; stopHolds(); } stats.mode = 'none'; return; }
    const B = PAD_BUTTONS.map((n, i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > 0.5); });
    const ax = i => { const v = pad.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : v; };
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    const active = B.some(Boolean) || lx || ly || rx || ry;
    if (active) { if (pad.id !== padId) { padId = pad.id; stats.id = padId; } device.seen('pad', glyphSetFor(pad.id)); seen = true; focus.enable(true); }
    if (device.current !== 'pad') { for (let i = 0; i < prev.length; i++) prev[i] = B[i]; return; }
    const now = performance.now();
    const container = focus.sync();
    const mode = osk.isOpen ? 'osk' : radial.isOpen ? 'radial' : container ? 'menu' : 'world';
    if (mode !== lastMode) { stopHolds(); releaseAll(); lastMode = mode; rep.dir = null; }
    stats.mode = mode;
    const mod = B[PAD_BUTTONS.indexOf(PAD_MOD)];
    document.documentElement.dataset.padMod = mod && mode === 'world' ? '1' : '';

    // edges
    for (let i = 0; i < PAD_BUTTONS.length; i++) {
      if (B[i] === prev[i]) continue;
      const name = PAD_BUTTONS[i], down = B[i];
      if (down) stats.presses++;
      if (mode === 'osk') oskBtn(name, down);
      else if (mode === 'radial') { if (name === PAD_RADIAL && !down) radial.select(); else if (down && name === 'B') radial.close(); else if (down && name === 'RB') radial.swap(); else if (down && name === 'A') radial.select(); }
      else if (mode === 'menu') menu(name, down, pad);
      else world(name, down, mod);
      prev[i] = B[i];
    }
    // sticks
    if (mode === 'world') {
      api.controls?.setAnalog?.({ mx: lx, mz: -ly, camX: rx, camY: ry });
      if (sprint && !lx && !ly) { sprint = false; keyUp('ShiftLeft'); }
    } else {
      api.controls?.setAnalog?.(null);
      if (mode === 'radial') { if (Math.hypot(lx, ly) > Math.hypot(rx, ry)) radial.aim(lx, ly); else radial.aim(rx, ry); }
      else if (mode === 'menu' && focus.steering) { focus.steer(lx * dt * 620, ly * dt * 620); focus.pan(rx * dt * 700, ry * dt * 700); const d = B[12] ? 'UP' : B[13] ? 'DOWN' : B[14] ? 'LEFT' : B[15] ? 'RIGHT' : null; if (!d) rep.dir = null; }
      else {
        const d = stickDir(lx, ly);
        if (d !== rep.dir) { rep.dir = d; rep.at = now + REPEAT_FIRST; if (d) (mode === 'osk' ? oskBtn : menu)(d, true, pad); }
        else if (d && now >= rep.at) { rep.at = now + REPEAT; (mode === 'osk' ? oskBtn : menu)(d, true, pad); }
        if (mode === 'menu' && ry) focus.scroll(ry * dt * 900);
      }
    }
  }
  window.addEventListener('gamepaddisconnected', () => stopHolds());
  window.addEventListener('blur', () => stopHolds());
  return { tick, stats, get padId() { return padId; }, glyphs: () => GLYPHS[device.glyphs], aAction };
}
