// Raw keyboard + mouse state. Uses KeyboardEvent.code (physical key position), so the command
// grid stays in the same place on AZERTY/QWERTZ keyboards. Higher-level meaning (what a key does)
// lives in bindings.js and the controller.

export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();         // codes currently held
    this.pressed = [];             // key events since last poll: {code, shift, ctrl, alt, repeat}
    this.mouse = { x: 0, y: 0, inside: false, buttons: 0 };
    this.mouseEvents = [];         // {type:'down'|'up'|'dbl', button, x, y, shift, ctrl, alt}
    this.wheel = 0;
    this.ordered = [];             // keys and mouse events together, in the order they happened
    this.enabled = true;
    this.layoutMap = null;
    this._bind();
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then((m) => { this.layoutMap = m; }).catch(() => {});
    }
  }

  // Label to show for a key code, respecting the user's keyboard layout when the browser tells us.
  label(code) {
    if (!code) return '';
    if (this.layoutMap && this.layoutMap.get(code)) return this.layoutMap.get(code).toUpperCase();
    return codeLabel(code);
  }

  _bind() {
    const t = this.target;
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (shouldBlock(e)) e.preventDefault();
      this.down.add(e.code);
      const k = { code: e.code, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, repeat: e.repeat };
      this.pressed.push(k);
      this.ordered.push({ key: k });
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault(); // stop menu-bar focus on Windows
    });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.buttons = 0; });
    t.addEventListener('contextmenu', (e) => e.preventDefault());
    t.addEventListener('mousemove', (e) => { this._pos(e); });
    t.addEventListener('mouseenter', () => { this.mouse.inside = true; });
    t.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    t.addEventListener('mousedown', (e) => {
      this._pos(e);
      if (e.button === 1) e.preventDefault(); // middle-click autoscroll
      this.mouse.buttons = e.buttons;
      const me = { type: 'down', button: e.button, x: this.mouse.x, y: this.mouse.y, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, detail: e.detail };
      this.mouseEvents.push(me);
      this.ordered.push({ mouse: me });
    });
    window.addEventListener('mouseup', (e) => {
      this._pos(e);
      this.mouse.buttons = e.buttons;
      const me = { type: 'up', button: e.button, x: this.mouse.x, y: this.mouse.y, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
      this.mouseEvents.push(me);
      this.ordered.push({ mouse: me });
    });
    t.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }

  _pos(e) {
    const r = this.target.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.inside = this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x < r.width && this.mouse.y < r.height;
  }

  isDown(code) { return this.down.has(code); }
  get shift() { return this.down.has('ShiftLeft') || this.down.has('ShiftRight'); }
  get ctrl() { return this.down.has('ControlLeft') || this.down.has('ControlRight') || this.down.has('MetaLeft'); }
  get alt() { return this.down.has('AltLeft') || this.down.has('AltRight'); }

  // Take all queued events (called once per frame by the controller).
  drain() {
    const keys = this.pressed; const mouse = this.mouseEvents; const wheel = this.wheel; const ordered = this.ordered;
    this.pressed = []; this.mouseEvents = []; this.wheel = 0; this.ordered = [];
    return { keys, mouse, wheel, ordered };
  }
}

function isTyping(e) {
  const el = e.target;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) && el.type !== 'range';
}

// Keys the browser would otherwise act on (scrolling, find, help, alt menu, tab focus).
function shouldBlock(e) {
  if (['Space', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F10', 'AltLeft', 'AltRight', 'Quote', 'Slash'].includes(e.code)) return true;
  if ((e.ctrlKey || e.metaKey) && ['KeyZ', 'KeyS', 'KeyF', 'KeyG', 'KeyD', 'KeyP', 'KeyA'].includes(e.code)) return true;
  if (e.altKey) return true;
  return false;
}

export function codeLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  const map = {
    Space: 'Space', Escape: 'Esc', Backspace: 'Bksp', Backquote: '`', Tab: 'Tab', Enter: 'Enter',
    BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/',
    Semicolon: ';', Quote: "'", Backslash: '\\', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Pause: 'Pause', Home: 'Home', End: 'End',
    Delete: 'Del', Insert: 'Ins', PageUp: 'PgUp', PageDown: 'PgDn',
  };
  return map[code] || code;
}
