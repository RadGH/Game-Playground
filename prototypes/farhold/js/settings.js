// Farhold phase 10 — settings.
//
// One panel on **O**, remembered in the browser. Everything here changes something the game reads
// every frame, so nothing in it is a placeholder.
//
//   const settings = createSettings({ apply });
//   settings.toggle();
//   settings.get('shoulder')   // 'left' | 'right'
//
// `apply(values)` is called on load and on every change, and is where the game does the work.

const KEY = 'farhold.settings.v1';

export const DEFAULTS = {
  shoulder: 'left',            // which side the camera sits on
  invertY: false,
  sensitivity: 1,
  viewDistance: 'full',        // full | medium | near
  density: 1,                  // how thick the scatter is
  grass: true,
  sunfx: true,                 // god rays, lens flare and the sunset wash
  sound: true,
  voices: true,
  volume: 0.75,
};

const FIELDS = [
  { key: 'shoulder', label: 'Camera shoulder', kind: 'choice', options: [['left', 'Left'], ['right', 'Right']], group: 'Controls' },
  { key: 'invertY', label: 'Invert look', kind: 'toggle', group: 'Controls' },
  { key: 'sensitivity', label: 'Mouse sensitivity', kind: 'range', min: 0.3, max: 2.5, step: 0.1, group: 'Controls' },
  { key: 'viewDistance', label: 'View distance', kind: 'choice', options: [['near', 'Near'], ['medium', 'Medium'], ['full', 'Full']], group: 'Picture' },
  { key: 'density', label: 'Trees and rocks', kind: 'range', min: 0, max: 2, step: 0.25, group: 'Picture' },
  { key: 'grass', label: 'Grass', kind: 'toggle', group: 'Picture' },
  { key: 'sunfx', label: 'Sun rays and flare', kind: 'toggle', group: 'Picture' },
  { key: 'sound', label: 'Sound', kind: 'toggle', group: 'Audio' },
  { key: 'voices', label: 'Voices', kind: 'toggle', group: 'Audio' },
  { key: 'volume', label: 'Volume', kind: 'range', min: 0, max: 1, step: 0.05, group: 'Audio' },
];

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
function write(values) {
  try { localStorage.setItem(KEY, JSON.stringify(values)); return true; } catch { return false; }
}

const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...kids.filter(Boolean));
  return node;
};

export function createSettings({ apply = () => {} } = {}) {
  const values = read();
  let open = false;

  const body = el('div', { class: 'settings-body' });
  const root = el('section', { class: 'settings hidden', id: 'settings' },
    el('div', { class: 'settings-head' },
      el('h2', { text: 'Settings' }),
      el('button', { class: 'settings-close', text: '×', onclick: () => toggle(false) }),
    ),
    body,
    el('div', { class: 'muted small', text: 'O or Esc to close · kept in this browser' }),
  );
  document.body.append(root);

  function set(key, value) {
    values[key] = value;
    write(values);
    apply(values, key);
    render();
  }

  function render() {
    const groups = [...new Set(FIELDS.map(f => f.group))];
    body.replaceChildren(...groups.flatMap(group => [
      el('h3', { text: group }),
      ...FIELDS.filter(f => f.group === group).map(f => {
        const row = el('div', { class: 'settings-row' }, el('span', { class: 'settings-label', text: f.label }));
        if (f.kind === 'toggle') {
          row.append(el('button', {
            class: 'settings-btn' + (values[f.key] ? ' on' : ''),
            text: values[f.key] ? 'On' : 'Off',
            onclick: () => set(f.key, !values[f.key]),
          }));
        } else if (f.kind === 'choice') {
          const wrap = el('span', { class: 'settings-choice' });
          for (const [value, label] of f.options) {
            wrap.append(el('button', {
              class: 'settings-btn' + (values[f.key] === value ? ' on' : ''),
              text: label,
              onclick: () => set(f.key, value),
            }));
          }
          row.append(wrap);
        } else {
          const input = el('input', { type: 'range', min: f.min, max: f.max, step: f.step, class: 'settings-range' });
          input.value = String(values[f.key]);
          input.addEventListener('input', () => set(f.key, Number(input.value)));
          row.append(input, el('span', { class: 'settings-value muted', text: String(values[f.key]) }));
        }
        return row;
      }),
    ]),
      el('div', { class: 'settings-row' },
        el('span', { class: 'settings-label', text: 'Everything back to normal' }),
        el('button', {
          class: 'settings-btn',
          text: 'Reset',
          onclick: () => { Object.assign(values, DEFAULTS); write(values); apply(values, null); render(); },
        })));
  }

  function toggle(v = !open) {
    open = v;
    root.classList.toggle('hidden', !open);
    if (open) { document.exitPointerLock?.(); render(); }
    return open;
  }

  // apply whatever was remembered, before the first frame
  apply(values, null);

  return {
    root, values,
    get isOpen() { return open; },
    get: key => values[key],
    set, toggle, render,
    all: () => ({ ...values }),
    fields: FIELDS,
  };
}
