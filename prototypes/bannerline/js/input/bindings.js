// Bindings: data/bindings.json per device type, plus per-type overrides from localStorage.
//
// A device asks `actionsFor(type, inputName)` ("which actions does Mouse2 trigger on a keyboard?")
// and `inputsFor(type, action)` (for on-screen key hints: "send1" -> "Z").

let TABLE = null;
const OVERRIDE_KEY = 'bannerline.bindings.';

/** Load data/bindings.json once. Safe to call more than once. */
export async function loadBindings(url = new URL('../../data/bindings.json', import.meta.url)) {
  if (TABLE) return TABLE;
  const raw = await (await fetch(url)).json();
  TABLE = {};
  for (const [type, map] of Object.entries(raw)) {
    if (type.startsWith('_')) continue;
    const merged = {};
    for (const [action, inputs] of Object.entries(map)) if (!action.startsWith('_')) merged[action] = inputs.slice();
    let over = null;
    try { over = JSON.parse(localStorage.getItem(OVERRIDE_KEY + type) || 'null'); } catch { over = null; }
    if (over) for (const [action, inputs] of Object.entries(over)) merged[action] = inputs.slice();
    TABLE[type] = merged;
  }
  return TABLE;
}

/** Set a table directly (node tests, or before fetch is possible). */
export function setBindings(table) { TABLE = table; }

/** All actions bound to one physical input on a device type. */
export function actionsFor(type, input) {
  const map = TABLE?.[type]; if (!map) return [];
  const out = [];
  for (const action in map) if (map[action].includes(input)) out.push(action);
  return out;
}

export function inputsFor(type, action) { return TABLE?.[type]?.[action] || []; }

/** A short label for the first input bound to an action, e.g. "KeyZ" -> "Z", "Mouse2" -> "RMB". */
export function hintFor(type, action) {
  const inp = inputsFor(type, action)[0];
  if (!inp) return '';
  return prettyInput(inp);
}

export function prettyInput(inp) {
  if (inp.startsWith('Key')) return inp.slice(3);
  if (inp.startsWith('Digit')) return inp.slice(5);
  const names = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'Space', Escape: 'Esc', Enter: 'Enter',
    ShiftLeft: 'Shift', ShiftRight: 'Shift', WheelUp: 'Wheel', WheelDown: 'Wheel', Tab: 'Tab' };
  return names[inp] || inp;
}

/** Save an override for one action on one device type. */
export function rebind(type, action, inputs) {
  if (!TABLE?.[type]) return;
  TABLE[type][action] = inputs.slice();
  let over = {};
  try { over = JSON.parse(localStorage.getItem(OVERRIDE_KEY + type) || '{}') || {}; } catch { over = {}; }
  over[action] = inputs.slice();
  try { localStorage.setItem(OVERRIDE_KEY + type, JSON.stringify(over)); } catch { /* private window */ }
}
