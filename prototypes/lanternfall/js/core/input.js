// Keyboard/mouse -> per-tick Intent (docs/10 §3.1). The module is pure: main.js attaches DOM listeners
// and calls onKey/onMouse. Bindings: action -> [event.code...]. "Pressed" flags last exactly one tick.
export const DEFAULT_BINDINGS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  jump: ['Space'], run: ['ShiftLeft', 'ShiftRight'], attack: ['Mouse0', 'KeyJ'], cast: ['Mouse2', 'KeyK'],
  interact: ['KeyE'], grapple: ['KeyF'], build: ['KeyB'], wick1: ['Digit1'], wick2: ['Digit2'], wick3: ['Digit3'], wick4: ['Digit4'],
  nextWick: ['KeyT'], dodge: ['KeyQ', 'ControlLeft'], ability: ['KeyR'], map: ['KeyM'], inventory: ['KeyI', 'Tab'], builder: ['KeyO'], skills: ['KeyP'], ledger: ['KeyL'],
  journal: ['KeyN'], pause: ['Escape'], belt1: ['KeyZ'], belt2: ['KeyX'], belt3: ['KeyC'], belt4: ['KeyV'], quick: ['KeyH'],
};
// data/bindings.json (02 owns the keys) uses canonical action names; the sim reads short intent names.
export const ALIASES = { move_left: 'left', move_right: 'right', look_up: 'up', look_down: 'down', pole: 'attack', wick_1: 'wick1', wick_2: 'wick2', wick_3: 'wick3', wick_4: 'wick4', wick_next: 'nextWick', wick_prev: 'prevWick', class_ability: 'ability', build_mode: 'build', belt_1: 'belt1', belt_2: 'belt2', belt_3: 'belt3', belt_4: 'belt4', quick_heal: 'quick', wick_builder: 'builder', character: 'character' };
/** Build the play-context binding table from data/bindings.json (falls back to DEFAULT_BINDINGS). */
export function bindingsFrom(json, context = 'play') {
  const src = json?.keys?.[context]; if (!src) return DEFAULT_BINDINGS;
  const out = {}; for (const [a, codes] of Object.entries(src)) out[ALIASES[a] || a] = codes; return out;
}
export function createInput(bindings = DEFAULT_BINDINGS) {
  let binds = structuredClone(bindings); const down = new Set(); const pressed = new Set(); const released = new Set();
  const codeToActions = () => { const m = new Map(); for (const [a, codes] of Object.entries(binds)) for (const c of codes) { if (!m.has(c)) m.set(c, []); m.get(c).push(a); } return m; };
  let map = codeToActions(); let script = null; let recording = null;
  const mouse = { x: 0, y: 0, wx: 0, wy: 0 };
  const api = {
    mouse, bindings: () => binds,
    bind(action, codes) { binds[action] = codes; map = codeToActions(); },
    onKey(code, isDown) {
      const acts = map.get(code); if (!acts) return false;
      for (const a of acts) { if (isDown) { if (!down.has(a)) pressed.add(a); down.add(a); } else { if (down.has(a)) released.add(a); down.delete(a); } }
      return true;
    },
    clear() { down.clear(); pressed.clear(); released.clear(); },
    /** test driver: [{ ticks, right: true, jump: true, ... }] */
    script(steps) { script = steps.map(s => ({ ...s })); },
    poll() {
      let I;
      if (script && script.length) {
        const s = script[0]; I = { ...s, pressed: {} };
        for (const k of Object.keys(s)) if (k !== 'ticks' && s[k] && s._started !== true) I.pressed[k] = true;
        s._started = true; if (--s.ticks <= 0) script.shift();
      } else {
        I = { pressed: {}, released: {} };
        for (const a of Object.keys(binds)) I[a] = down.has(a);
        for (const a of pressed) I.pressed[a] = true; for (const a of released) I.released[a] = true;
      }
      I.jumpPressed = !!I.pressed.jump; I.aimX = mouse.wx; I.aimY = mouse.wy;
      pressed.clear(); released.clear();
      if (recording) recording.push(I);
      return I;
    },
    record(on) { recording = on ? [] : null; return recording; },
    isDown: a => down.has(a),
  };
  return api;
}
