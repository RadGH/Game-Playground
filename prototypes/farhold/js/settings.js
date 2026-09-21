// Farhold phase 10 — settings.
//
// One panel on **O**, remembered in the browser. Everything here changes something the game reads
// every frame, so nothing in it is a placeholder.
//
//   const settings = createSettings({ apply });
//   settings.toggle();
//   settings.get('shoulder')   // 'left' | 'right'
//   settings.keyFor('map')     // 'KeyM' — or whatever the player rebound it to
//
// `apply(values)` is called on load and on every change, and is where the game does the work.

import { fmt, pct } from '../../../shared/format.js';

const KEY = 'farhold.settings.v1';

export const DEFAULTS = {
  shoulder: 'left',            // which side the camera sits on
  invertY: false,
  // Flight is NOT inverted by default. It used to be — pushing the mouse forward pitched the nose
  // up, which is the aircraft convention and the opposite of what the rest of the game does.
  invertFlight: false,
  sensitivity: 1,
  // D15: how wide the view is, in degrees. 62 is what `main.js` builds the camera with, so the
  // default here changes nothing until the slider is moved.
  fov: 62,
  viewDistance: 1,             // a multiplier on how far the ground is drawn, 0.5x to 6x
  density: 1,                  // how thick the scatter is, up to 6x on a strong card
  grass: true,
  sunfx: true,                 // god rays, lens flare and the sunset wash
  sound: true,
  voices: true,
  volume: 0.75,
  // C7: the HUD's bottom-right line used to read "seed 11 · x 29120 z 7191 · cell 130,32 · …" all
  // the time. The biome and the altitude are player information; the rest is a debug readout.
  coords: false,
  damageNumbers: true,
  /**
   * WHAT A HIT FEELS LIKE. Round 14 gave a connecting blow weight: the world holds still for 35 to
   * 150 milliseconds and the camera takes a knock of a few millimetres. Both read as force and
   * both are a matter of taste, so both are a switch — on by default, off in one click for anyone
   * who finds them distracting. Nothing about the damage changes either way. See js/combat-feel.js.
   */
  hitStop: true,
  screenShake: true,
  /** Draw the flat white ring on the grass again — it IS the hit box, which is worth seeing. */
  showHitboxes: false,
  /**
   * "Go here" — click any cell on the map and be standing on it.
   *
   * The user's own words: "Make the current teleport feature a debug option, but keep it enabled by
   * default for now so I can keep using it." So it defaults ON and sits in its own Debug group,
   * where turning it off is an explicit choice rather than something to be discovered. The waypoint
   * network is NOT behind this switch — travelling between lit sigils is a game rule, not a cheat.
   */
  debugTeleport: true,
  // D15: only the keys the player actually MOVED live in here — `{ map: 'KeyN' }`. Everything else
  // falls through to `BINDINGS`, so changing a default later reaches anyone who never touched it.
  keys: {},
};

/**
 * D15: THE KEYS, AND WHY THEY WORK THE WAY THEY DO.
 *
 * "There is no way to remap a key in a game with fifteen of them — which locks out AZERTY and
 * left-handed players entirely."
 *
 * The game does not read a binding table: `js/player.js` asks `keys.has('KeyW')` and `js/main.js`
 * asks `e.code === 'KeyM'`, both straight off the keyboard event. Rather than thread a table
 * through every caller, this panel sits in FRONT of all of them: it listens for keydown and keyup
 * in the capture phase — which at `window` runs before any of the game's own listeners — and, when
 * you have moved a key, swallows the real event and sends the game the one it is looking for.
 *
 * So `KeyZ` bound to "walk forward" arrives at `player.js` as `KeyW`, and every consumer, present
 * and future, keeps working with no change at all. Three rules keep it honest:
 *
 *   * a synthetic event is never remapped again (`isTrusted` is false on ours);
 *   * nothing is touched while you are typing in a text box, or the rename field eats your letters;
 *   * a default key that you moved away from and did not reuse stops doing anything, or the old key
 *     and the new one would both work and the rebinding would look broken.
 *
 * The number row (skills 1-6) and the debug backtick are deliberately not in the table: the skills
 * are positional and the debug menu is not a player-facing key.
 */
export const BINDINGS = [
  { action: 'forward', label: 'Walk forward', code: 'KeyW' },
  { action: 'back', label: 'Walk back', code: 'KeyS' },
  { action: 'left', label: 'Step left', code: 'KeyA' },
  { action: 'right', label: 'Step right', code: 'KeyD' },
  { action: 'run', label: 'Run', code: 'ShiftLeft' },
  { action: 'jump', label: 'Jump', code: 'Space' },
  { action: 'interact', label: 'Talk, open, enter', code: 'KeyE' },
  { action: 'firstPerson', label: 'First person (hold to look around)', code: 'KeyV' },
  { action: 'torch', label: 'Light on and off', code: 'KeyL' },
  /**
   * R17 — THE KEY THAT HAD TWO OWNERS.
   *
   *   "Pressing 'K' opens a new civilization menu… This also opens the combat log though it shows
   *    up behind the window… Also the 'L' hotkey no longer closes the combat log but K does. I
   *    assume we re-worked the hotkeys. Can you clean that up?"
   *
   * `log` was on KeyK in this table while js/main.js had the Holding hard-coded on KeyK and never
   * put it in the table at all — so K ran both, and the Holding was the one that got the cursor.
   * The Holding is a real row now, which is what stops a second owner of a key appearing again.
   *
   * The log has **no default key**: it is the eighth tab of the character sheet, which is what the
   * user asked for ("the combat log could simply be added to the inventory screen as the 8th tab"),
   * so `I` then `8` opens it. The row stays so it is still on the rebinding panel for anyone who
   * wants it back on a key of its own — `keyFor` already returns null for an action nobody has
   * bound, and `drawKeyHint` already prints that as "unbound" rather than inventing a keycap.
   * L stays the light, on foot and in the ship, because that is what was asked for in round 15.
   */
  { action: 'log', label: 'What has happened (also sheet tab 8)', code: null },
  { action: 'holding', label: 'The Holding', code: 'KeyK' },
  /**
   * Build mode had the same gap the Holding did — hard-coded on KeyB in js/main.js and missing
   * from this table, so it could not be rebound and nothing stopped a later round handing KeyB to
   * something else as well. tests/round17-ui.test.js now fails if any key listened for in
   * js/main.js is absent from here, which is the rule rather than the instance.
   */
  { action: 'build', label: 'Build mode', code: 'KeyB' },
  // R17 — your company: who follows you, the mercenary board, and the spell respec.
  { action: 'company', label: 'Followers', code: 'KeyF' },
  { action: 'mount', label: 'Whistle for the horse', code: 'KeyH' },
  { action: 'ship', label: 'Call the ship', code: 'KeyJ' },
  { action: 'map', label: 'Map or star chart', code: 'KeyM' },
  { action: 'sheet', label: 'Character sheet', code: 'KeyI' },
  { action: 'settings', label: 'These settings', code: 'KeyO' },
];

/** What a key is called on a keycap, rather than what the browser calls it. */
const NAMED_KEYS = {
  Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/',
  Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps Lock',
};

export function keyLabel(code) {
  if (!code) return 'none';
  if (NAMED_KEYS[code]) return NAMED_KEYS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

/** The `key` a real keyboard would have sent with this `code` — hud.js tests `e.key === 'Shift'`. */
function keyTextFor(code) {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return ' ';
  if (code.startsWith('Shift')) return 'Shift';
  if (code.startsWith('Control')) return 'Control';
  if (code.startsWith('Alt')) return 'Alt';
  if (code.startsWith('Arrow')) return code;
  return NAMED_KEYS[code] || code;
}

/** Keys we must never swallow, whatever anyone binds. Escape has to close what is open. */
const NEVER_TAKE = new Set(['Escape', 'F5', 'F11', 'F12', 'Tab']);

const FIELDS = [
  { key: 'shoulder', label: 'Camera shoulder', kind: 'choice', options: [['left', 'Left'], ['right', 'Right']], group: 'Controls' },
  { key: 'invertY', label: 'Invert look', kind: 'toggle', group: 'Controls' },
  { key: 'invertFlight', label: 'Invert flight pitch', kind: 'toggle', group: 'Controls' },
  { key: 'sensitivity', label: 'Mouse sensitivity', kind: 'range', min: 0.3, max: 2.5, step: 0.1, unit: '×', group: 'Controls' },
  { key: 'fov', label: 'Field of view', kind: 'range', min: 55, max: 100, step: 1, unit: '°', group: 'Picture' },
  /**
   * VIEW DISTANCE IS A REAL NUMBER NOW, AND IT GOES TO 6x.
   *
   * "I play the game using a target strong graphics card. Can you add 2x and 4x and 6x maximums to
   * view distance, foliage density, etc."
   *
   * Worth saying plainly: the old control was three words — Near, Medium, Full — and **nothing read
   * it**. It was declared here, drawn in the panel, and its only effect was to force a redraw at the
   * distance it was already drawing. So the View distance setting has never done anything. It is a
   * multiplier on the clipmap's own view scale now, which is the same knob flight already stretches
   * when you climb, so the two compose: a 6x setting in the air reaches a very long way indeed.
   *
   * It starts at 1x rather than going lower because a clipmap ring cannot shrink below its own base
   * grid — `setViewScale` clamps there — so a "0.5x" would have been another control that did
   * nothing, which is the bug this is fixing. Measured on a mid card: 1x reaches 1,818 m and 6x
   * reaches 10,905 m, for the SAME 99,918 triangles. That is the whole point of a clipmap.
   */
  { key: 'viewDistance', label: 'View distance', kind: 'range', min: 1, max: 6, step: 0.5, unit: '×', group: 'Picture' },
  { key: 'density', label: 'Trees and rocks', kind: 'range', min: 0, max: 6, step: 0.25, unit: '×', group: 'Picture' },
  { key: 'grass', label: 'Grass', kind: 'toggle', group: 'Picture' },
  { key: 'sunfx', label: 'Sun rays and flare', kind: 'toggle', group: 'Picture' },
  { key: 'damageNumbers', label: 'Damage numbers', kind: 'toggle', group: 'Picture' },
  { key: 'hitStop', label: 'Impact freeze', kind: 'toggle', group: 'Picture' },
  { key: 'screenShake', label: 'Screen shake', kind: 'toggle', group: 'Picture' },
  { key: 'coords', label: 'Show coordinates', kind: 'toggle', group: 'Picture' },
  { key: 'sound', label: 'Sound', kind: 'toggle', group: 'Audio' },
  { key: 'voices', label: 'Voices', kind: 'toggle', group: 'Audio' },
  { key: 'volume', label: 'Volume', kind: 'range', min: 0, max: 1, step: 0.05, percent: true, group: 'Audio' },
  { key: 'debugTeleport', label: 'Map "Go here" teleport', kind: 'toggle', group: 'Debug' },
  { key: 'showHitboxes', label: 'Show swing hit boxes', kind: 'toggle', group: 'Debug' },
];

/** What a slider's number means. D15: "1" and "0.75" told you nothing about what they measured. */
function valueText(field, value) {
  if (field.percent) return pct(value);
  return fmt(value) + (field.unit || '');
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved ? { ...DEFAULTS, ...saved, keys: { ...(saved.keys || {}) } } : { ...DEFAULTS, keys: {} };
  } catch {
    return { ...DEFAULTS, keys: {} };
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

/**
 * D15: the label column used to be `flex: 1` against a 150px slider, and "Trees and rocks" came out
 * three lines tall in a narrow panel. These two want to be `.settings-label { flex: 1 1 200px }` in
 * `style.css`; they are inline here because that file belongs to another pass this round.
 */
const LABEL_STYLE = 'flex:1 1 200px;min-width:150px';
const VALUE_STYLE = 'min-width:52px';

export function createSettings({ apply = () => {} } = {}) {
  const values = read();
  let open = false;
  // which binding is listening for a keypress right now, or null
  let arming = null;
  // the reset button, once it has been clicked once and is waiting to be meant
  let resetArmed = false;

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

  // ---------------------------------------------------------------- the keys
  const keyFor = action => values.keys?.[action] || BINDINGS.find(b => b.action === action)?.code || null;
  /** Every default that nobody is using any more — these stop doing anything at all. */
  const inUse = () => new Set(BINDINGS.map(b => keyFor(b.action)));

  /** The code the GAME is listening for when this physical key is pressed, or null to swallow it. */
  function translate(code) {
    for (const b of BINDINGS) if (keyFor(b.action) === code) return b.code;
    // a default you moved away from and did not give to anything else
    if (BINDINGS.some(b => b.code === code) && !inUse().has(code)) return null;
    return code;
  }

  function bind(action, code) {
    if (!code || NEVER_TAKE.has(code)) return false;
    const taken = BINDINGS.find(b => b.action !== action && keyFor(b.action) === code);
    const had = keyFor(action);
    const next = { ...values.keys, [action]: code };
    // Two actions cannot share a key, so the one that had it takes the one being replaced. A swap
    // rather than a clear: every action stays bound to something, which is what a player expects.
    if (taken) next[taken.action] = had;
    for (const b of BINDINGS) if (next[b.action] === b.code) delete next[b.action];
    set('keys', next);
    return true;
  }

  /**
   * In front of every other key listener in the game (see the note on BINDINGS). It has three jobs:
   * take the keypress the rebinding row is waiting for, translate a moved key into the one the game
   * knows, and stay out of the way of everything else.
   */
  function onKey(e) {
    if (!e.isTrusted) return;                       // one of ours, already translated
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (arming) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type !== 'keydown') return;
      if (e.code === 'Escape') { arming = null; render(); return; }
      const action = arming;
      arming = null;
      bind(action, e.code);                         // set() re-renders
      render();
      return;
    }

    const want = translate(e.code);
    if (want === e.code) return;                    // the usual case: nothing to do
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!want) return;                              // an orphaned default: it does nothing now
    window.dispatchEvent(new KeyboardEvent(e.type, {
      code: want, key: keyTextFor(want), bubbles: true, cancelable: true, repeat: e.repeat,
      shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey,
    }));
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);

  /**
   * The field of view is applied by js/main.js, which owns the camera.
   *
   * This used to poll `window.farhold.camera` on a timer because the settings panel was built in a
   * round where main.js belonged to another agent. `apply()` gets the key like every other setting
   * now, so there is no global and no interval.
   */

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
        const row = el('div', { class: 'settings-row' }, el('span', { class: 'settings-label', style: LABEL_STYLE, text: f.label }));
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
          row.append(input, el('span', { class: 'settings-value muted', style: VALUE_STYLE, text: valueText(f, values[f.key]) }));
        }
        return row;
      }),
    ]),
      // ---- the keys
      el('h3', { text: 'Keys' }),
      el('p', { class: 'muted small', text: arming
        ? 'Press the key you want. Escape leaves it as it was.'
        : 'Click a key to change it. Skills stay on 1-6.' }),
      ...BINDINGS.map(b => {
        const code = keyFor(b.action);
        const moved = code !== b.code;
        return el('div', { class: 'settings-row' },
          el('span', { class: 'settings-label', style: LABEL_STYLE, text: b.label }),
          el('button', {
            class: 'settings-btn' + (arming === b.action ? ' on' : ''),
            text: arming === b.action ? 'press a key…' : keyLabel(code),
            title: moved ? `Normally ${keyLabel(b.code)}` : 'Click, then press the key you want',
            onclick: () => { arming = arming === b.action ? null : b.action; render(); },
          }),
        );
      }),
      el('div', { class: 'settings-row' },
        el('span', { class: 'settings-label', style: LABEL_STYLE, text: 'Keys back to normal' }),
        el('button', {
          class: 'settings-btn',
          text: 'Reset keys',
          onclick: () => { arming = null; set('keys', {}); },
        })),
      // ---- and the big one, which now takes two clicks
      el('div', { class: 'settings-row' },
        el('span', { class: 'settings-label', style: LABEL_STYLE, text: 'Everything back to normal' }),
        el('button', {
          class: 'settings-btn',
          // D15: this used to wipe every setting on one click with nothing asked. The first click
          // now only says what it is about to do; clicking away or closing the panel forgets it.
          style: resetArmed ? 'background:#4a2418;border-color:#a04a2a;color:#ffd0b8;font-weight:600' : '',
          text: resetArmed ? 'Sure? Click again' : 'Reset',
          onclick: () => {
            if (!resetArmed) { resetArmed = true; render(); return; }
            resetArmed = false;
            arming = null;
            Object.assign(values, DEFAULTS, { keys: {} });
            write(values);
            apply(values, null);
            render();
          },
        })));
  }

  function toggle(v = !open) {
    open = v;
    root.classList.toggle('hidden', !open);
    // nothing half-done survives the panel closing
    if (!open) { arming = null; resetArmed = false; }
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
    // D15: the keys, for the pause menu's control list, the tests and anything that wants to print
    // what a player actually has to press.
    bindings: BINDINGS,
    keyFor,
    keyLabel,
    bind,
    resetKeys: () => set('keys', {}),
  };
}
