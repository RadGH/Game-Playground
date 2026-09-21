// A DOM small enough to fit in one file, so `node --test` can render a screen.
//
// WHY THIS EXISTS. This project's signature fault is a finished module nothing calls, and the
// second-commonest is a finished module that is called and throws on the first frame — a typo in a
// property name, a `const` read above its declaration, a helper that was renamed in one of two
// places. `node --check` cannot see any of those and the browser suite is a separate run that takes
// minutes. Sixty lines of `document` catches them in milliseconds.
//
// It is DELIBERATELY not a DOM. There is no layout, no CSS, no event bubbling and no real selector
// engine — only enough of one that `shared/ui.js`'s `el()` works, that a screen can be drawn, that
// `querySelector('.thing')` finds what was drawn, and that `.click()` runs an onclick. Anything that
// needs more than that belongs in a Playwright spec, where there is a real browser.
//
//   import { installTinyDom } from './tiny-dom.mjs';
//   const dom = installTinyDom();          // sets globalThis.document
//   ...
//   dom.restore();

class TinyNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.listeners = Object.create(null);
    this.style = {};
    this.className = '';
    this._text = '';
    this.hidden = false;
    this.disabled = false;
  }

  get classList() {
    const self = this;
    const list = () => (self.className ? self.className.split(/\s+/).filter(Boolean) : []);
    return {
      add(...c) { self.className = [...new Set([...list(), ...c])].join(' '); },
      remove(...c) { self.className = list().filter(x => !c.includes(x)).join(' '); },
      toggle(c, on) { if (on === undefined ? list().includes(c) : !on) this.remove(c); else this.add(c); },
      contains: c => list().includes(c),
    };
  }

  get textContent() {
    if (!this.children.length) return this._text;
    return this.children.map(c => (c.nodeType === 3 ? c.data : c.textContent)).join('');
  }
  set textContent(v) { this.children = []; this._text = String(v ?? ''); }

  append(...kids) {
    for (const k of kids) {
      if (k == null) continue;
      const node = k.nodeType ? k : { nodeType: 3, data: String(k), textContent: String(k) };
      node.parentNode = this;
      this.children.push(node);
      // anything written straight into `textContent` is replaced by real children, as in a browser
      this._text = '';
    }
    return kids[kids.length - 1];
  }
  appendChild(k) { return this.append(k); }
  replaceChildren(...kids) { this.children = []; this._text = ''; this.append(...kids); }
  remove() {
    const p = this.parentNode;
    if (!p) return;
    p.children = p.children.filter(c => c !== this);
    this.parentNode = null;
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'hidden') this.hidden = true;
    if (k === 'class') this.className = String(v);
  }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
  dispatch(type, ev = {}) { for (const fn of this.listeners[type] || []) fn(ev); }
  click() { if (!this.disabled) this.dispatch('click', { type: 'click' }); }

  /** Every element under this one, depth first. */
  *walk() {
    for (const c of this.children) {
      if (c.nodeType !== 1) continue;
      yield c;
      yield* c.walk();
    }
  }

  /**
   * `.class`, `tag`, `#id` and `a b` (descendant), and nothing else. Anything richer would be a
   * selector engine, which is the point at which this file should have been a browser.
   */
  matches(sel) {
    for (const part of sel.trim().split(/(?=[.#])/)) {
      const s = part.trim();
      if (!s) continue;
      if (s.startsWith('.')) { if (!this.classList.contains(s.slice(1))) return false; }
      else if (s.startsWith('#')) { if (this.attributes.id !== s.slice(1)) return false; }
      else if (s.includes('[')) { return false; }
      else if (this.tagName !== s.toUpperCase()) return false;
    }
    return true;
  }

  querySelectorAll(sel) {
    const steps = sel.trim().split(/\s+(?![^[]*\])/);
    let pool = [...this.walk()];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const hit = pool.filter(n => n.matches(step));
      if (i === steps.length - 1) return hit;
      pool = hit.flatMap(n => [...n.walk()]);
    }
    return [];
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

export function installTinyDom() {
  const had = { document: globalThis.document, window: globalThis.window };
  const root = new TinyNode('html');
  const head = new TinyNode('head');
  const body = new TinyNode('body');
  root.append(head, body);

  const document = {
    documentElement: root,
    head, body,
    createElement: tag => new TinyNode(tag),
    createTextNode: t => ({ nodeType: 3, data: String(t), textContent: String(t) }),
    querySelector: sel => (sel.includes('[') ? null : root.querySelector(sel)),
    querySelectorAll: sel => (sel.includes('[') ? [] : root.querySelectorAll(sel)),
    getElementById: id => root.querySelectorAll('*').find(n => n.attributes.id === id) || null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.document = document;
  globalThis.window = globalThis.window || { addEventListener: () => {}, removeEventListener: () => {} };

  return {
    document, body, head, root,
    restore() { globalThis.document = had.document; globalThis.window = had.window; },
  };
}
