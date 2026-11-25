// THE binding table (lessons rule 34: every key has one owner). Every action the game reads from a keyboard, mouse
// button or controller button is here, with its name for the controls screen and its default keys / pad buttons.
// Players can rebind both (settings → Controls); overrides are kept per device in localStorage.
//
// Pad buttons use the standard mapping: 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 Back · 9 Start ·
// 10 L3 · 11 R3 · 12-15 d-pad up/down/left/right. Spells on the pad: hold LB (slots 1-4) or RB (slots 5-8) and press
// A/B/X/Y (`chord`).
export const ACTIONS = [
  // group, id, name, keys (KeyboardEvent.code / 'Mouse0..2'), pad buttons, hold (read every step) or press (one shot)
  ['Move', 'forward', 'Move forward', ['KeyW', 'ArrowUp'], [], 'hold'],
  ['Move', 'back', 'Move back', ['KeyS', 'ArrowDown'], [], 'hold'],
  ['Move', 'left', 'Move left', ['KeyA', 'ArrowLeft'], [], 'hold'],
  ['Move', 'right', 'Move right', ['KeyD', 'ArrowRight'], [], 'hold'],
  ['Move', 'dodge', 'Dodge roll (uses stamina)', ['Space'], [0], 'press'],
  ['Move', 'sneak', 'Sneak (on / off)', ['KeyX'], [1], 'press'],
  ['Move', 'mount', 'Call / leave your horse', ['KeyR'], [12], 'press'],
  ['Fight', 'attack', 'Attack', ['Mouse0'], [7], 'hold'],
  ['Fight', 'power', 'Power attack (uses stamina)', ['KeyF'], [3], 'press'],
  ['Fight', 'target', 'Target the nearest enemy', ['Tab'], [11], 'press'],
  ['Fight', 'targetNext', 'Next target', ['Backquote'], [15], 'press'],
  ['Fight', 'interact', 'Talk / loot / use / revive', ['KeyE'], [2], 'hold'],
  ['Spells', 'slot1', 'Spell 1', ['Digit1'], [], 'hold'],
  ['Spells', 'slot2', 'Spell 2', ['Digit2'], [], 'hold'],
  ['Spells', 'slot3', 'Spell 3', ['Digit3'], [], 'hold'],
  ['Spells', 'slot4', 'Spell 4', ['Digit4'], [], 'hold'],
  ['Spells', 'slot5', 'Spell 5', ['Digit5'], [], 'hold'],
  ['Spells', 'slot6', 'Spell 6', ['Digit6'], [], 'hold'],
  ['Spells', 'slot7', 'Spell 7', ['Digit7'], [], 'hold'],
  ['Spells', 'slot8', 'Spell 8', ['Digit8'], [], 'hold'],
  ['Windows', 'bag', 'Bag', ['KeyB', 'KeyI'], [13], 'press'],
  ['Windows', 'sheet', 'Character', ['KeyC'], [8], 'press'],
  ['Windows', 'levelup', 'Level up', ['KeyN'], [], 'press'],
  ['Windows', 'classes', 'Classes', ['KeyL'], [], 'press'],
  ['Windows', 'talents', 'Talents', ['KeyT'], [], 'press'],
  ['Windows', 'spellbook', 'Spellbook', ['KeyP'], [], 'press'],
  ['Windows', 'quests', 'Quests', ['KeyJ'], [], 'press'],
  ['Windows', 'trade', 'Trade skills (enchanting)', ['KeyK'], [], 'press'],
  ['Windows', 'map', 'Map', ['KeyM'], [14], 'press'],
  ['Windows', 'menu', 'Menu', ['Escape'], [9], 'press'],
  ['Camera', 'freeMouse', 'Free the mouse (hold)', ['AltLeft'], [], 'hold'],
];
export const PAD_CHORD = { 4: [0, 1, 2, 3], 5: [0, 1, 2, 3] };    // LB + A/B/X/Y = slots 1-4, RB + A/B/X/Y = slots 5-8
export const ACTION = Object.fromEntries(ACTIONS.map(([group, id, name, keys, pad, mode]) => [id, { group, id, name, keys, pad, mode }]));

const KEY = 'oathwild.bindings';
export function loadBindings() {
  let o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { o = {}; }
  const out = {};
  for (const a of ACTIONS) { const id = a[1]; out[id] = { keys: Array.isArray(o[id]?.keys) ? o[id].keys : [...a[3]], pad: Array.isArray(o[id]?.pad) ? o[id].pad : [...a[4]] }; }
  return out;
}
export function saveBindings(b) {
  const diff = {};
  for (const a of ACTIONS) { const id = a[1]; if (JSON.stringify(b[id]) !== JSON.stringify({ keys: a[3], pad: a[4] })) diff[id] = b[id]; }
  try { localStorage.setItem(KEY, JSON.stringify(diff)); } catch { /* private window */ }
}
/** Give `code` to `action` and take it away from any other action (one owner per key). */
export function rebind(b, action, code, { pad = false } = {}) {
  for (const id of Object.keys(b)) { const list = pad ? b[id].pad : b[id].keys; const i = list.indexOf(code); if (i >= 0) list.splice(i, 1); }
  const list = pad ? b[action].pad : b[action].keys;
  list.unshift(code);
  if (list.length > 2) list.length = 2;
  return b;
}
export function resetBindings() { try { localStorage.removeItem(KEY); } catch { /* */ } return loadBindings(); }

// ---- how a key or button is written on screen (hints follow the device in use: rule 18)
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];
export function keyName(code) {
  if (!code) return '';
  if (code === 'Mouse0') return 'Left click';
  if (code === 'Mouse1') return 'Middle click';
  if (code === 'Mouse2') return 'Right click';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const map = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', Tab: 'Tab', Escape: 'Esc', Backquote: '`', AltLeft: 'Alt', ControlLeft: 'Ctrl', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter' };
  return map[code] || code.replace(/^(Numpad|Key)/, '');
}
export const padName = i => PAD_NAMES[i] ?? `Button ${i}`;
/** The short label for an action on the device in use ('E', 'X', or '' on touch). */
export function hintFor(bindings, action, device = 'keys') {
  const b = bindings[action];
  if (!b) return '';
  if (device === 'pad') {
    const slot = /^slot(\d)$/.exec(action);
    if (slot) { const n = +slot[1]; return `${n <= 4 ? 'LB' : 'RB'}+${['A', 'B', 'X', 'Y'][(n - 1) % 4]}`; }
    return b.pad.length ? padName(b.pad[0]) : '';
  }
  if (device === 'touch') return '';
  return keyName(b.keys[0]);
}
