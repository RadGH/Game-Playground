// THE one binding table (lessons rule 34: every key has one owner). Every scheme a player can join with, every action
// it has, the keys/buttons for it and the short label shown on buttons and hints (rule 18: hints follow the device).
//
//   SCHEMES.kb   whole keyboard (one player)       SCHEMES.kbL / kbR   left / right half (two people, one keyboard)
//   SCHEMES.pad  a game controller (standard mapping button numbers)   SCHEMES.touch  on-screen buttons (one player)
//
// Moves: `up` is UP the screen (into the street, mz −), `down` toward the camera (mz +). W = up (rule 26).
export const ACTIONS = ['attack', 'heavy', 'jump', 'dash', 'block', 'grab', 'spell1', 'spell2', 'breaker'];
export const EDGE_ACTIONS = ['attack', 'heavy', 'jump', 'dash', 'grab', 'spell1', 'spell2', 'breaker'];
export const ACTION_NAMES = {
  attack: 'Attack', heavy: 'Heavy', jump: 'Jump', dash: 'Dash', block: 'Block', grab: 'Grab', spell1: 'Spell 1', spell2: 'Spell 2',
  breaker: 'Breaker', pause: 'Pause', left: 'Left', right: 'Right', up: 'Up the street', down: 'Down the street',
};
export const ACTION_HELP = {
  attack: 'Three hits in a row; the third knocks down',
  heavy: 'Slow, breaks a guard, launches. Throws a held weapon',
  jump: 'Jump; attack in the air for a jump attack',
  dash: 'Dash forward (or tap a direction twice); attack while dashing',
  block: 'Hold to block; block just as a hit lands to stagger the attacker',
  grab: 'Pick up a weapon from the ground. Walk into a dazed enemy to grab them',
  spell1: 'Cast the spell in slot 1', spell2: 'Cast the spell in slot 2',
  breaker: 'Knock back everyone around you for a share of your health',
  pause: 'Open the menu',
};

// Keyboard codes (KeyboardEvent.code). Each scheme: move keys + one list of codes per action.
export const SCHEMES = {
  kb: {
    name: 'Keyboard', short: 'Keyboard', kind: 'keyboard',
    move: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'] },
    keys: { attack: ['KeyJ'], heavy: ['KeyK'], jump: ['Space'], dash: ['KeyL'], block: ['ShiftLeft', 'ShiftRight'], grab: ['KeyH'],
      spell1: ['KeyU'], spell2: ['KeyI'], breaker: ['KeyO'], pause: ['Escape'] },
    join: ['Enter', 'KeyJ'],
  },
  kbL: {
    name: 'Keyboard, left half', short: 'Left keys', kind: 'keyboard',
    move: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'] },
    keys: { attack: ['KeyF'], heavy: ['KeyG'], jump: ['KeyV'], dash: ['KeyB'], block: ['KeyC'], grab: ['KeyE'],
      spell1: ['KeyR'], spell2: ['KeyT'], breaker: ['KeyQ'], pause: ['Escape'] },
    join: ['KeyF'],
  },
  kbR: {
    name: 'Keyboard, right half', short: 'Right keys', kind: 'keyboard',
    move: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'] },
    keys: { attack: ['KeyK'], heavy: ['KeyL'], jump: ['KeyM'], dash: ['Comma'], block: ['Period'], grab: ['KeyJ'],
      spell1: ['KeyI'], spell2: ['KeyO'], breaker: ['KeyP'], pause: ['Escape'] },
    join: ['KeyK'],
  },
  pad: {
    name: 'Controller', short: 'Controller', kind: 'pad',
    // standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10 L3, 11 R3, 12-15 d-pad
    buttons: { attack: [0], heavy: [2], jump: [1], dash: [5], block: [4], grab: [3], spell1: [6], spell2: [7], breaker: [8], pause: [9] },
    chord: { breaker: [10, 11] },          // L3 + R3 together also break
    dpad: { up: 12, down: 13, left: 14, right: 15 },
    join: [0, 9],
  },
  touch: { name: 'Touch', short: 'Touch', kind: 'touch' },
};

const PAD_LABELS = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3' };
const KEY_LABELS = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', Escape: 'Esc', Enter: 'Enter', Comma: ',', Period: '.',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Slash: '/', Semicolon: ';' };
export const keyName = code => KEY_LABELS[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
export const padName = b => PAD_LABELS[b] ?? `Button ${b}`;

/** The label to print on a button / hint for this action on this scheme ('' on touch: the button IS the control). */
export function keyLabel(scheme, action) {
  const S = SCHEMES[scheme]; if (!S) return '';
  if (S.kind === 'pad') return (S.buttons[action] || []).map(padName)[0] || '';
  if (S.kind === 'keyboard') {
    if (S.move[action]) return S.move[action].map(keyName)[0];
    return (S.keys[action] || []).map(keyName)[0] || '';
  }
  return '';
}

/** Every keyboard code → [scheme, action] (for the Controls screen and the one-owner test). */
export function keyOwners(schemes = ['kb']) {
  const out = new Map();
  for (const id of schemes) {
    const S = SCHEMES[id];
    for (const [a, codes] of [...Object.entries(S.move || {}), ...Object.entries(S.keys || {})]) for (const c of codes) {
      if (!out.has(c)) out.set(c, []);
      out.get(c).push([id, a]);
    }
  }
  return out;
}
