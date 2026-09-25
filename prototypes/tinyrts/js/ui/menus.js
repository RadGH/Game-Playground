// Menu screens (DOM overlays). Each screen is a function that fills a panel. Keyboard: arrows move
// focus between buttons, Enter activates, Esc goes back.

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Menus {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('menus');
    this.stack = [];
    this.screens = {};
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  register(name, fn) { this.screens[name] = fn; }

  get open() { return this.stack.length > 0; }
  get current() { return this.stack[this.stack.length - 1]; }

  show(name, params = {}, replace = false) {
    if (replace) this.stack.pop();
    this.stack.push({ name, params });
    this.render();
  }

  back() {
    const cur = this.current;
    if (cur && cur.params.onBack) { cur.params.onBack(); return; }
    this.stack.pop();
    this.render();
  }

  closeAll() { this.stack = []; this.render(); }

  render() {
    this.root.innerHTML = '';
    this.app.menuOpen = this.open;
    this.root.classList.toggle('active', this.open);
    const cur = this.current;
    if (!cur) { this.app.onMenusClosed?.(); return; }
    const screen = this.screens[cur.name];
    const wrap = el('div', 'menu-screen ' + cur.name + (cur.params.overlay ? ' overlay' : ''));
    this.root.appendChild(wrap);
    screen(wrap, cur.params, this);
    // Focus the first button for keyboard use.
    const first = wrap.querySelector('button:not([disabled]).primary') || wrap.querySelector('button:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }

  onKey(e) {
    if (!this.open) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox') || (t && t.tagName === 'TEXTAREA');
    if (e.code === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (this.current.params.noEsc) return;
      this.back();
      return;
    }
    if (typing) return;
    const buttons = [...this.root.querySelectorAll('button:not([disabled]), input[type=range], select')].filter((b) => b.offsetParent !== null);
    const idx = buttons.indexOf(document.activeElement);
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      if (document.activeElement && document.activeElement.type === 'range' && false) return;
      e.preventDefault(); e.stopPropagation();
      const n = buttons.length;
      if (!n) return;
      const next = e.code === 'ArrowDown' ? (idx + 1 + n) % n : (idx - 1 + n) % n;
      buttons[next].focus();
      return;
    }
    // Keep the game from seeing keys while a menu is open.
    if (!['Enter', 'Space', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.stopPropagation();
  }
}

export function button(label, onClick, cls = '') {
  const b = el('button', 'mbtn ' + cls, label);
  b.addEventListener('click', (e) => { e.currentTarget.blur(); window.app?.audio?.ui('click'); onClick(e); });
  b.addEventListener('mouseenter', () => window.app?.audio?.ui('hover'));
  return b;
}

export { el };
