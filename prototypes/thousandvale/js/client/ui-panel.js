// Small window manager for the M3 panels (friends, guild, mail, Callboard, account, help): a framed window with a
// title bar you can drag, a close button, a body, and one registry so Esc closes the top one and a hotkey toggles
// its own window. Positions are remembered per window (localStorage, wrapped — private windows may throw). DOM only.

const OPEN = [];                 // open panels, last = on top
const ALL = new Map();           // id -> panel
let zTop = 30;
const posKey = id => 'tv.panel.' + id;

export function createPanel({ id, title, cls = '', width = 340, parent = null, onOpen = null, onClose = null, closable = true }) {
  const root = document.createElement('section');
  root.className = `tv-panel ${cls}`;
  root.id = 'panel-' + id;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', title);
  root.style.width = width + 'px';
  root.hidden = true;
  root.innerHTML = `<header class="tvp-head"><h3></h3><span class="tvp-sub"></span>${closable ? '<button class="ghost tvp-x" aria-label="Close" data-tip="Close (Esc)">×</button>' : ''}</header><div class="tvp-body"></div>`;
  root.querySelector('h3').textContent = title;
  (parent || document.getElementById('hud') || document.body).appendChild(root);
  const head = root.querySelector('.tvp-head'), body = root.querySelector('.tvp-body');

  // remembered position (clamped back on screen)
  try { const p = JSON.parse(localStorage.getItem(posKey(id)) || 'null'); if (p) { root.style.left = p.x + 'px'; root.style.top = p.y + 'px'; root.classList.add('placed'); } } catch {}
  // drag by the title bar
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button,input,select')) return;
    const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = ev => {
      const x = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx)), y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
      root.style.left = x + 'px'; root.style.top = y + 'px'; root.classList.add('placed');
    };
    const up = () => {
      head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up);
      try { localStorage.setItem(posKey(id), JSON.stringify({ x: parseInt(root.style.left, 10), y: parseInt(root.style.top, 10) })); } catch {}
    };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    raise();
  });
  root.addEventListener('pointerdown', () => raise());
  // typing in a panel never moves the character
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { panel.close(); e.preventDefault(); } e.stopPropagation(); });
  root.querySelector('.tvp-x')?.addEventListener('click', () => panel.close());

  function raise() { root.style.zIndex = String(++zTop); const i = OPEN.indexOf(panel); if (i >= 0) { OPEN.splice(i, 1); OPEN.push(panel); } }
  function clampOnScreen() {
    if (!root.classList.contains('placed')) return;
    const r = root.getBoundingClientRect();
    if (r.right > window.innerWidth) root.style.left = Math.max(0, window.innerWidth - r.width - 8) + 'px';
    if (r.bottom > window.innerHeight) root.style.top = Math.max(0, window.innerHeight - r.height - 8) + 'px';
  }

  const panel = {
    id, root, body, head,
    get isOpen() { return !root.hidden; },
    /** Replace the body's content (null/false children are skipped — replaceChildren would print "null"). */
    fill(...kids) { body.replaceChildren(...kids.flat().filter(k => k != null && k !== false)); },
    setTitle(t, sub = '') { root.querySelector('h3').textContent = t; root.querySelector('.tvp-sub').textContent = sub; },
    open() {
      if (!root.hidden) { raise(); return; }
      // cascade windows that sit at the default spot so a second one does not hide the first
      if (!root.classList.contains('placed') && !root.classList.contains('centered')) {
        const stack = OPEN.filter(p => !p.root.classList.contains('placed') && !p.root.classList.contains('centered')).length;
        root.style.top = (90 + stack * 28) + 'px'; root.style.right = (70 + stack * 22) + 'px';
      }
      root.hidden = false; OPEN.push(panel); raise(); clampOnScreen();
      document.getElementById('menu-' + id)?.classList.add('on');
      onOpen?.(panel);
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      const i = OPEN.indexOf(panel); if (i >= 0) OPEN.splice(i, 1);
      document.getElementById('menu-' + id)?.classList.remove('on');
      onClose?.(panel);
      if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    },
    toggle(force) { const want = force ?? root.hidden; if (want) panel.open(); else panel.close(); return want; },
  };
  ALL.set(id, panel);
  return panel;
}

/** Close the top-most open panel. Returns true when one was closed (Esc handling). */
export function closeTop() { const p = OPEN[OPEN.length - 1]; if (!p) return false; p.close(); return true; }
export const getPanel = id => ALL.get(id);
export const openPanels = () => OPEN.map(p => p.id);

/** Tiny element helper: h('button.ghost', { onclick }, 'Text', child…). Text is always set as text, never HTML. */
export function h(tag, props = {}, ...kids) {
  const [t, ...classes] = tag.split('.');
  const e = document.createElement(t || 'div');
  if (classes.length) e.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'title') e.dataset.tip = v;            // P5: the shared tooltip, never a native title bubble
    else if (k === 'style') e.style.cssText = v;
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

/** A modal-ish confirm drawn in the HUD (no browser confirm(): it freezes the frame loop and the socket pings). */
export function confirmBox(text, { yes = 'Yes', no = 'Cancel', danger = false } = {}) {
  return new Promise(res => {
    const box = h('div.tv-confirm', { role: 'alertdialog' },
      h('p', {}, text),
      h('div.row', {},
        h('button.ghost', { onclick: () => done(false) }, no),
        h('button.' + (danger ? 'danger' : 'primary'), { onclick: () => done(true) }, yes)));
    const done = v => { box.remove(); res(v); };
    box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); });
    (document.getElementById('hud') || document.body).appendChild(box);
    box.querySelector('button:last-child').focus();
  });
}
