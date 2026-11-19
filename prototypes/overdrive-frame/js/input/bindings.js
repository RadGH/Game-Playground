// THE binding table (lessons rule 34: every key has one owner). Every way of doing an action hangs off its row, and
// everything that SHOWS a key or button reads this file (HUD hints, the controls screen), so they can never disagree.
// Pure: node tests import it. Pattern copied from thousandvale/js/client/input/bindings.js.

/** Standard-mapping gamepad buttons, index → name. */
export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME'];
export const PAD_INDEX = Object.fromEntries(PAD_BUTTONS.map((n, i) => [n, i]));

/** What each button is called on each controller family. */
export const GLYPHS = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', BACK: 'View', START: 'Menu', L3: 'LS', R3: 'RS', UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right', LS: 'Left stick', RS: 'Right stick' },
  playstation: { A: 'Cross', B: 'Circle', X: 'Square', Y: 'Triangle', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', BACK: 'Create', START: 'Options', L3: 'L3', R3: 'R3', UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right', LS: 'Left stick', RS: 'Right stick' },
};
export function glyphSetFor(padId) {
  const s = String(padId || '').toLowerCase();
  return /dualsense|dualshock|playstation|sony|054c/.test(s) ? 'playstation' : 'xbox';
}

/**
 * Every action. key: KeyboardEvent.code (keys: extra fixed codes). mouse: 0 left, 2 right, 1 middle. pad: button name.
 * hold: true for actions read every frame while held; otherwise a press. weapon: index of the weapon slot it fires
 * (0 left arm, 1 right arm, 2 left shoulder, 3 right shoulder). touch: label on the phone button.
 */
export const ACTIONS = [
  { id: 'up', label: 'Move up', key: 'KeyW', keys: ['ArrowUp'], hold: true, pad: 'LS', row: 'move' },
  { id: 'left', label: 'Move left', key: 'KeyA', keys: ['ArrowLeft'], hold: true, pad: 'LS', row: 'move' },
  { id: 'down', label: 'Move down', key: 'KeyS', keys: ['ArrowDown'], hold: true, pad: 'LS', row: 'move' },
  { id: 'right', label: 'Move right', key: 'KeyD', keys: ['ArrowRight'], hold: true, pad: 'LS', row: 'move' },
  { id: 'aim', label: 'Aim', mouseMove: true, pad: 'RS' },
  { id: 'fireL', label: 'Fire left arm', mouse: 0, hold: true, pad: 'LT', weapon: 0, touch: 'L' },
  { id: 'fireR', label: 'Fire right arm', mouse: 2, hold: true, pad: 'RT', weapon: 1, touch: 'R' },
  { id: 'fireSL', label: 'Fire left shoulder', key: 'KeyQ', hold: true, pad: 'LB', weapon: 2, touch: 'SL' },
  { id: 'fireSR', label: 'Fire right shoulder', key: 'KeyE', hold: true, pad: 'RB', weapon: 3, touch: 'SR' },
  { id: 'boost', label: 'Boost', key: 'ShiftLeft', keys: ['ShiftRight'], hold: true, pad: 'L3', touch: 'Boost', note: 'Hold while moving' },
  { id: 'quick', label: 'Quick boost', key: 'Space', pad: 'B', touch: 'Dash', note: 'A burst the way you move' },
  { id: 'jump', label: 'Jump / hover', key: 'KeyF', keys: [], hold: true, pad: 'A', touch: 'Jump', note: 'Hold in the air to hover' },
  { id: 'lock', label: 'Lock on', key: 'KeyR', mouse: 1, pad: 'R3', touch: 'Lock', note: 'Sticks to one target until pressed again' },
  { id: 'swap', label: 'Swap hangar weapon', key: 'KeyX', pad: 'Y', touch: 'Swap' },
  { id: 'interact', label: 'Use', key: 'KeyG', pad: 'X', touch: 'Use', note: 'Stations, revive, pick up' },
  { id: 'ping', label: 'Ping', key: 'KeyC', pad: 'UP', note: 'Mark a spot for your team' },
  { id: 'kit', label: 'Repair kit', key: 'Digit1', keys: ['Numpad1'], pad: 'LEFT', touch: 'Fix', note: 'Restores armour; a few charges a mission' },
  { id: 'skill', label: 'Skill', key: 'Digit2', keys: ['Numpad2'], pad: 'RIGHT', touch: 'Skill', note: 'Your build\'s skill (picked at the Tuning rig), then it recharges' },
  { id: 'overload', label: 'Overload', key: 'KeyV', pad: 'DOWN', touch: 'Overload', note: 'An Overload core\'s ultimate, once its bar is full' },
  { id: 'menu', label: 'Menu', key: 'Escape', pad: 'START', touch: '☰' },
  { id: 'map', label: 'Mission map', key: 'Tab', keys: ['KeyM'], pad: 'BACK' },
];
export const BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

/** Which action a key code belongs to (null if none). */
export function actionOfKey(code) {
  for (const a of ACTIONS) if (a.key === code || a.keys?.includes(code)) return a.id;
  return null;
}

const KEY_NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', Escape: 'Esc', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const MOUSE_NAMES = ['Left click', 'Middle click', 'Right click'];
export const keyName = code => KEY_NAMES[code] || (code?.startsWith('Key') ? code.slice(3) : code?.startsWith('Digit') ? code.slice(5) : code || '');

/** The hint printed on a button for the device in use: 'keys' | 'pad' | 'touch'. */
export function hintFor(id, device = 'keys', glyphs = 'xbox') {
  const a = BY_ID[id]; if (!a) return '';
  if (device === 'pad') return a.pad ? GLYPHS[glyphs][a.pad] || a.pad : '';
  if (device === 'touch') return '';
  if (a.key) return keyName(a.key);
  if (a.mouse != null) return MOUSE_NAMES[a.mouse];
  return '';
}
