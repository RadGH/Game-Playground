// Every input device as a "reader": read() → { mx, mz, block, spell1Held, spell2Held, attack, heavy, jump, dash, grab,
// spell1, spell2, breaker, pause } where the edges are true when the action was pressed since the last read (never
// dropped: the session carries them to the next sim step) and block / spell1Held / spell2Held are held buttons (a held
// spell button keeps a channelled spell going). Keyboard schemes share one key listener; the keyboard-and-mouse layout
// also takes left / right clicks on the street (never on a button or a window) and keeps the browser's right-click menu
// shut while it plays. Controllers are polled. Double-tapping a direction also dashes. Keys come only from bindings.js.
import { SCHEMES, EDGE_ACTIONS, schemeFor } from './bindings.js';

/** A click that belongs to the page, not the fight: buttons, fields, windows, the shared panels. */
const UI_TARGET = 'button, a, input, select, textarea, label, [data-act], .wr-sheet, .wr-bscene, .modal, .rgs-signin, .wn-root, .cr-root, .tune-panel, .tipbox, #wr-note';
export const isUiTarget = t => !!t?.closest?.(UI_TARGET);

const DOUBLE_TAP = 0.26;            // seconds between two taps of a direction that make a dash
const DEAD = 0.28;                  // stick dead zone

export function createInput({ target = window } = {}) {
  const held = new Set();
  const readers = new Set();
  const anyKey = new Set();         // listeners for the join screen: (code) => void
  let last = 'keyboard';            // the device used most recently (hints follow it — rule 18)
  const lastSubs = new Set();
  const setLast = d => { if (d !== last) { last = d; for (const f of lastSubs) f(d); } };

  const isTyping = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  target.addEventListener('keydown', e => {
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    setLast('keyboard');
    if (e.repeat) return;
    held.add(e.code);
    for (const r of readers) r._key?.(e.code, true);
    for (const f of anyKey) f(e.code, e);
  });
  target.addEventListener('keyup', e => { held.delete(e.code); for (const r of readers) r._key?.(e.code, false); });
  target.addEventListener('blur', () => held.clear());
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') setLast('touch'); else if (e.pointerType === 'mouse') setLast(last === 'pad' ? 'keyboard' : last); }, { capture: true });

  /** A keyboard reader for one scheme ('kb' = the whole keyboard in the layout picked in Settings | 'kbL' | 'kbR'). */
  function keyboard(scheme) {
    const edges = {}, tap = { dir: 0, t: -9 };
    let S = null, actOf = null, dirOf = null;
    // the picked layout is read on every use, so a change in Settings (even from the pause menu) applies at once
    const cur = () => {
      const want = SCHEMES[schemeFor(scheme)];
      if (want !== S) {
        S = want; actOf = new Map(); dirOf = new Map();
        for (const [a, codes] of Object.entries(S.keys)) for (const c of codes) actOf.set(c, a);
        for (const [d, codes] of Object.entries(S.move)) for (const c of codes) dirOf.set(c, d);
      }
      return S;
    };
    cur();
    const onDown = e => {
      if (e.pointerType !== 'mouse' || !cur().mouse || isUiTarget(e.target)) return;
      const a = Object.entries(S.buttons).find(([, b]) => b === e.button)?.[0];
      if (a) { edges[a] = true; e.preventDefault(); }
    };
    const onMenu = e => { if (cur().mouse && !isUiTarget(e.target)) e.preventDefault(); };   // right click = heavy, never the browser menu
    addEventListener('pointerdown', onDown);
    addEventListener('contextmenu', onMenu);
    const r = {
      get scheme() { return cur() && schemeFor(scheme); }, kind: 'keyboard',
      _key(code, down) {
        if (!down) return;
        cur();
        const a = actOf.get(code); if (a) edges[a] = true;
        const d = dirOf.get(code);
        if (d === 'left' || d === 'right') {
          const now = performance.now() / 1000, dir = d === 'left' ? -1 : 1;
          if (tap.dir === dir && now - tap.t < DOUBLE_TAP) { edges.dash = true; tap.t = -9; } else { tap.dir = dir; tap.t = now; }
        }
      },
      read() {
        const K = cur();
        const on = d => K.move[d].some(c => held.has(c)), hold = a => (K.keys[a] || []).some(c => held.has(c));
        const out = { mx: (on('right') ? 1 : 0) - (on('left') ? 1 : 0), mz: (on('down') ? 1 : 0) - (on('up') ? 1 : 0),
          block: hold('block'), spell1Held: hold('spell1'), spell2Held: hold('spell2') };
        for (const a of [...EDGE_ACTIONS, 'pause']) { out[a] = !!edges[a]; edges[a] = false; }
        return out;
      },
      release() { readers.delete(r); removeEventListener('pointerdown', onDown); removeEventListener('contextmenu', onMenu); },
    };
    readers.add(r);
    return r;
  }

  /** A controller reader for the pad at this index (navigator.getGamepads()[index]). */
  function pad(index) {
    const S = SCHEMES.pad;
    let prev = [], tap = { dir: 0, t: -9 }, stickWas = 0;
    const r = {
      scheme: 'pad', kind: 'pad', index,
      read() {
        const p = navigator.getGamepads?.()[index];
        const out = { mx: 0, mz: 0, block: false, spell1Held: false, spell2Held: false };
        for (const a of [...EDGE_ACTIONS, 'pause']) out[a] = false;
        if (!p || !p.connected) return out;
        const B = i => { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
        const now = [];
        for (let i = 0; i < p.buttons.length; i++) now[i] = B(i);
        const rose = i => now[i] && !prev[i];
        let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if (Math.hypot(ax, ay) < DEAD) { ax = 0; ay = 0; }
        if (now[S.dpad.left]) ax = -1; if (now[S.dpad.right]) ax = 1; if (now[S.dpad.up]) ay = -1; if (now[S.dpad.down]) ay = 1;
        out.mx = Math.max(-1, Math.min(1, ax)); out.mz = Math.max(-1, Math.min(1, ay));
        out.block = S.buttons.block.some(i => now[i]);
        out.spell1Held = S.buttons.spell1.some(i => now[i]); out.spell2Held = S.buttons.spell2.some(i => now[i]);
        for (const [a, list] of Object.entries(S.buttons)) if (a !== 'block' && list.some(rose)) out[a] = true;
        if (S.chord.breaker.every(i => now[i]) && S.chord.breaker.some(rose)) out.breaker = true;
        // a flick of the stick (or d-pad) twice in one direction dashes
        const dir = out.mx > 0.7 ? 1 : out.mx < -0.7 ? -1 : 0;
        if (dir && dir !== stickWas) {
          const t = performance.now() / 1000;
          if (tap.dir === dir && t - tap.t < DOUBLE_TAP) { out.dash = true; tap.t = -9; } else { tap.dir = dir; tap.t = t; }
        }
        stickWas = dir;
        if (now.some(Boolean) || Math.abs(ax) + Math.abs(ay) > 0.5) setLast('pad');
        prev = now;
        return out;
      },
      release() { readers.delete(r); },
    };
    readers.add(r);
    return r;
  }

  /** A touch reader fed by the on-screen controls (js/input/touch.js sets state / presses). */
  function touch() {
    const st = { mx: 0, mz: 0, block: false, spell1Held: false, spell2Held: false }, edges = {};
    const r = {
      scheme: 'touch', kind: 'touch', state: st,
      press(a) { edges[a] = true; setLast('touch'); },
      read() {
        const out = { mx: st.mx, mz: st.mz, block: st.block, spell1Held: st.spell1Held, spell2Held: st.spell2Held };
        for (const a of [...EDGE_ACTIONS, 'pause']) { out[a] = !!edges[a]; edges[a] = false; }
        return out;
      },
      release() { readers.delete(r); },
    };
    readers.add(r);
    return r;
  }

  /** Make a reader from a device id: 'kb' | 'kbL' | 'kbR' | 'touch' | 'pad:0'. */
  function reader(device) {
    if (device.startsWith('pad:')) return pad(+device.slice(4));
    if (device === 'touch') return touch();
    return keyboard(device);
  }

  /** Pads that pressed one of these buttons since the last call (the join screen). */
  const padPrev = new Map();
  function padPresses(buttons) {
    const out = [];
    for (const p of navigator.getGamepads?.() || []) {
      if (!p || !p.connected) continue;
      const before = padPrev.get(p.index) || [];
      const now = p.buttons.map(b => !!b && (b.pressed || b.value > 0.5));
      for (const b of buttons) if (now[b] && !before[b]) out.push({ index: p.index, button: b });
      // a stick flick counts as a direction press for the join cards
      const ax = p.axes[0] || 0, was = before.ax || 0;
      if (Math.abs(ax) > 0.7 && Math.abs(was) <= 0.7) out.push({ index: p.index, axis: Math.sign(ax) });
      now.ax = ax;
      padPrev.set(p.index, now);
    }
    return out;
  }

  return {
    held, reader, keyboard, pad, touch, padPresses,
    onKey(f) { anyKey.add(f); return () => anyKey.delete(f); },
    get last() { return last; },
    onDevice(f) { lastSubs.add(f); return () => lastSubs.delete(f); },
    usePad() { setLast('pad'); },
    pads() { return [...(navigator.getGamepads?.() || [])].filter(p => p && p.connected); },
  };
}
