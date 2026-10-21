// THE binding table (play-test 5, T27 — stream G). One list of ACTIONS; every way of pressing one hangs off its row:
//   key    the default KeyboardEvent.code (what the game's own handlers listen for — see "how it drives the game")
//   pad    a standard-mapping gamepad button, optionally with the modifier held (LT / L2)
//   touch  the on-screen control of the phone layout (css/layout-phone.css + input/touch.js)
// Everything that SHOWS a key reads this file: the help window and the settings tab (social-core.js SHORTCUTS is built
// from it), the on-screen <kbd> hints (input/hints.js re-labels them for the device used last), the gallery's
// "Controls" scene (ui-gallery.html#scene=controls) and docs/UI.md.
//
// How it drives the game: the game's handlers listen for the DEFAULT key codes below (controls.js, main.js, hotbar.js,
// angling.js …). A re-bound key, a gamepad button or a touch control is turned into that default key event by the input
// layer (input/keyboard.js, gamepad.js, touch.js -> input/emit.js), so no handler had to change and none can be missed.
// Actions with `run` instead of a key (party targeting, the radial) are done by the input layer through the small API
// main.js hands it (input/index.js).
//
// Pure: no DOM, no storage. Node tests import it (tests/G/bindings.test.js).

/** Standard-mapping button order (https://w3c.github.io/gamepad/#remapping): index -> our name. */
export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME'];
export const PAD_INDEX = Object.fromEntries(PAD_BUTTONS.map((n, i) => [n, i]));
/** The button held for the second set. */
export const PAD_MOD = 'LT';
/** The button held for the radial menu. */
export const PAD_RADIAL = 'LB';

/** What is printed on each button, per controller family. `cls` colours the four face buttons. */
export const GLYPHS = {
  xbox: { name: 'Xbox', A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', BACK: 'View', START: 'Menu', L3: 'LS', R3: 'RS', UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', HOME: 'Xbox', LS: 'Left stick', RS: 'Right stick', DPAD: 'D-pad' },
  playstation: { name: 'PlayStation', A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', BACK: 'Create', START: 'Options', L3: 'L3', R3: 'R3', UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', HOME: 'PS', LS: 'Left stick', RS: 'Right stick', DPAD: 'D-pad' },
  generic: { name: 'Generic', A: '1', B: '2', X: '3', Y: '4', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', BACK: 'Select', START: 'Start', L3: 'L3', R3: 'R3', UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', HOME: 'Home', LS: 'Left stick', RS: 'Right stick', DPAD: 'D-pad' },
};
export const GLYPH_SETS = Object.keys(GLYPHS);

/** Which glyph set a pad's id string wants ("Xbox 360 Controller (XInput STANDARD GAMEPAD)", "DualSense Wireless Controller" …). */
export function glyphSetFor(padId) {
  const s = String(padId || '').toLowerCase();
  if (/dualsense|dualshock|playstation|sony|054c|ps[345]\b/.test(s)) return 'playstation';
  if (/xbox|xinput|microsoft|045e|x-box/.test(s)) return 'xbox';
  if (/steam|valve|28de/.test(s)) return 'xbox';          // 2026-10-16: the Steam Deck's own buttons read A B X Y, View, Menu
  return s ? 'generic' : 'xbox';
}

const pad = (btn, mod = false, note = '') => ({ btn, mod, note });

/**
 * Every action. `key` = default code (null = no key by default). `keys` = more codes that do the same and cannot be re-bound
 * (arrows). `row` = actions shown as ONE line in the short tables (W A S D). `ctx` = where a pad button means this:
 * 'world' (default), 'menu' (a window is open), 'radial', 'dead', 'fishing'.
 */
export const ACTIONS = [
  // ---- moving
  { id: 'moveF', group: 'Moving', label: 'Move forward', key: 'KeyW', keys: ['ArrowUp'], row: 'move', rowLabel: 'Move', pad: pad('LS'), touch: 'Left thumb stick' },
  { id: 'moveL', group: 'Moving', label: 'Move left', key: 'KeyA', keys: ['ArrowLeft'], row: 'move', pad: pad('LS'), touch: 'Left thumb stick' },
  { id: 'moveB', group: 'Moving', label: 'Move back', key: 'KeyS', keys: ['ArrowDown'], row: 'move', pad: pad('LS'), touch: 'Left thumb stick' },
  { id: 'moveR', group: 'Moving', label: 'Move right', key: 'KeyD', keys: ['ArrowRight'], row: 'move', pad: pad('LS'), touch: 'Left thumb stick' },
  // play-test 8 (W20): you run by default. Shift walks; Num Lock keeps you running forward until you steer or stop.
  { id: 'walk', group: 'Moving', label: 'Walk (you run without it)', key: 'ShiftLeft', hold: true, pad: pad('L3', false, 'click the stick: walk on / off — or just push the stick part-way'), touch: 'Push the stick part-way (a full push runs)' },
  { id: 'autorun', group: 'Moving', label: 'Auto-run: keep going forward (on / off)', key: 'NumLock', pad: pad('L3', true, 'with LT held'), touch: 'Quick wheel: Auto-run' },
  { id: 'jump', group: 'Moving', label: 'Jump', key: 'Space', pad: pad('A'), touch: 'Jump button' },
  { id: 'camL', group: 'Moving', label: 'Turn the camera left', key: 'KeyQ', hold: true, row: 'cam', rowLabel: 'Turn the camera', pad: pad('RS'), touch: 'Drag on the world' },
  { id: 'camR', group: 'Moving', label: 'Turn the camera right', key: 'KeyE', hold: true, row: 'cam', pad: pad('RS'), touch: 'Drag on the world', shares: 'interact' },
  { id: 'zoom', group: 'Moving', label: 'Zoom the camera', key: null, mouse: 'Mouse wheel', pad: pad('R3', false, 'steps: close · middle · far'), touch: 'Pinch on the world' },
  // ---- fighting
  { id: 'strike', group: 'Fighting', label: 'Strike (basic attack) — in a loot window: take everything', key: 'KeyF', mouse: 'Right-click an enemy', pad: pad('X'), touch: 'Attack button (big, right thumb): one tap keeps attacking, a second stops' },
  { id: 'skill1', group: 'Fighting', label: 'Skill 1', key: 'Digit1', row: 'skills', rowLabel: 'Skills 1 – 6', pad: pad('Y'), touch: 'Skill arc, button 1' },
  { id: 'skill2', group: 'Fighting', label: 'Skill 2', key: 'Digit2', row: 'skills', pad: pad('B'), touch: 'Skill arc, button 2' },
  { id: 'skill3', group: 'Fighting', label: 'Skill 3', key: 'Digit3', row: 'skills', pad: pad('RB'), touch: 'Skill arc, button 3' },
  { id: 'skill4', group: 'Fighting', label: 'Skill 4', key: 'Digit4', row: 'skills', pad: pad('RT'), touch: 'Skill arc, button 4' },
  { id: 'skill5', group: 'Fighting', label: 'Skill 5', key: 'Digit5', row: 'skills', pad: pad('Y', true), touch: 'Hold the arc: second row' },
  { id: 'skill6', group: 'Fighting', label: 'Skill 6', key: 'Digit6', row: 'skills', pad: pad('B', true), touch: 'Hold the arc: second row' },
  { id: 'item1', group: 'Fighting', label: 'Potion / food slot 1', key: 'Digit7', row: 'items', rowLabel: 'Potions and food 1 – 4', pad: pad('UP', true), touch: 'Belt button: potions and food' },
  { id: 'item2', group: 'Fighting', label: 'Potion / food slot 2', key: 'Digit8', row: 'items', pad: pad('RIGHT', true), touch: 'Belt button: potions and food' },
  { id: 'item3', group: 'Fighting', label: 'Potion / food slot 3', key: 'Digit9', row: 'items', pad: pad('DOWN', true), touch: 'Belt button: potions and food' },
  { id: 'item4', group: 'Fighting', label: 'Potion / food slot 4', key: 'Digit0', row: 'items', pad: pad('LEFT', true), touch: 'Belt button: potions and food' },
  { id: 'targetNext', group: 'Fighting', label: 'Next enemy', key: 'Tab', mouse: 'Click an enemy', pad: pad('RIGHT'), touch: 'Target button (or tap the enemy)' },
  { id: 'allyNext', group: 'Fighting', label: 'Next party member (heals and wards go to them)', key: 'KeyT', run: 'allyNext', mouse: 'Click a party frame', pad: pad('DOWN'), touch: 'Tap a party frame, or the Ally button' },
  { id: 'allyPrev', group: 'Fighting', label: 'Previous party member', key: null, run: 'allyPrev', pad: pad('UP'), touch: 'Tap a party frame' },
  { id: 'targetClear', group: 'Fighting', label: 'Clear target (heals go to you)', key: null, run: 'targetClear', mouse: 'Esc, or click your own frame', pad: pad('LEFT'), touch: 'Tap your own frame' },
  { id: 'back', group: 'Fighting', label: 'Close a window / clear target / the menu', key: 'Escape', fixed: true, pad: pad('B', false, 'in a window'), ctx: 'menu', touch: 'Close (×) or swipe the sheet down' },
  // 2026-10-16: in the controller layout Menu opens the CONTROLLER MENU (input/pad-layout.js, PAD_MENU_TILES below): every
  // window as a big tile. On a keyboard (and the phone) it is still the small pause menu.
  { id: 'pause', group: 'Fighting', label: 'Menu: every window, settings, log out', key: null, run: 'pause', mouse: 'Esc with nothing open', pad: pad('START'), touch: 'Menu (☰) in the quick wheel' },
  { id: 'rise', group: 'Fighting', label: 'Rise after falling', key: 'KeyR', pad: pad('A', false, 'when fallen'), ctx: 'dead', touch: 'The Rise button' },
  // ---- world
  { id: 'interact', group: 'World', label: 'Use, talk, open, loot a body — in a loot window: take the selected item', key: 'KeyE', pad: pad('A', false, 'when a prompt shows'), ctx: 'prompt', touch: 'Tap the prompt' },
  { id: 'camp', group: 'World', label: 'Make camp (wilds)', key: 'KeyC', pad: pad('RB', true), touch: 'Quick wheel: Camp' },
  { id: 'fish', group: 'World', label: 'Cast a line / reel in (at a fishing spot)', key: 'KeyX', run: 'fish', pad: pad('A', true), touch: 'The “Fish here” prompt at a fishing spot, or the quick wheel' },
  { id: 'hook', group: 'World', label: 'Hook a bite; hold to reel during the tug', key: 'Space', shares: 'jump', pad: pad('A', false, 'while fishing'), ctx: 'fishing', touch: 'The Hook / Reel button (replaces Attack)' },
  // W9 (P-client): the profession mini-games (js/client/ui/prof-minigame.js). ctx 'prof' = only while a mini-game is on screen
  { id: 'profWork', group: 'World', label: 'Mini-game: work (strike, pick, stop — hold to lift the knife)', key: 'Space', shares: 'jump', pad: pad('A', false, 'in a mini-game'), ctx: 'prof', touch: 'Tap the mini-game panel' },
  { id: 'profLeft', group: 'World', label: 'Mini-game: left (chop left, move left, back in the fire)', key: 'KeyA', shares: 'moveL', pad: pad('X', false, 'in a mini-game, or D-pad left'), ctx: 'prof', touch: 'Tap the left half of the panel' },
  { id: 'profRight', group: 'World', label: 'Mini-game: right (chop right, move right, back in the fire)', key: 'KeyD', shares: 'moveR', pad: pad('B', false, 'in a mini-game, or D-pad right'), ctx: 'prof', touch: 'Tap the right half of the panel' },
  { id: 'mount', group: 'World', label: 'Ride your mount / get down', key: 'KeyH', pad: pad('X', true, 'hold LT, press X — or the Mount button on the action bar'), touch: 'Mount button, or the quick wheel' },
  // ---- windows
  { id: 'map', group: 'Windows', label: 'Map', key: 'KeyM', panel: 'map', pad: pad('BACK'), touch: 'Tap the minimap' },
  { id: 'journal', group: 'Windows', label: 'Journal (quests)', key: 'KeyJ', panel: 'journal', radial: true, touch: 'Quick wheel, or tap the quest tracker' },
  { id: 'bag', group: 'Windows', label: 'Bag and gear', key: 'KeyB', panel: 'bag', radial: true, touch: 'Quick wheel' },
  { id: 'sheet', group: 'Windows', label: 'Character: stats and damage', key: 'KeyV', panel: 'sheet', radial: true, touch: 'Quick wheel (a tab beside the bag)' },
  { id: 'skills', group: 'Windows', label: 'Skills and talents', key: 'KeyK', panel: 'skills', radial: true, touch: 'Quick wheel' },
  { id: 'achievements', group: 'Windows', label: 'Achievements and trophies', key: 'KeyY', panel: 'achievements', radial: true, touch: 'Quick wheel, or the pause menu' },      // feedback #106
  { id: 'perks', group: 'Windows', label: 'Perk forest', key: 'KeyN', panel: 'perks', radial: true, touch: 'Quick wheel' },
  { id: 'party', group: 'Windows', label: 'Party menu: party, friends, guild, mail, Group Finder', key: 'KeyP', panel: 'party', radial: true, touch: 'Quick wheel: Social' },
  { id: 'friends', group: 'Windows', label: 'Friends tab', key: 'KeyO', panel: 'friends', touch: 'Social sheet, Friends tab' },
  { id: 'guild', group: 'Windows', label: 'Guild tab', key: 'KeyG', panel: 'guild', touch: 'Social sheet, Guild tab' },
  { id: 'help', group: 'Windows', label: 'This help', key: 'F1', keyText: 'F1 or ?', fixed: true, radial: true, touch: 'Menu (☰): Help and controls' },
  { id: 'radial', group: 'Windows', label: 'Quick wheel: every window in one hold', key: null, run: 'radial', pad: pad('LB', false, 'hold, point with a stick, let go'), touch: 'Hold the wheel button (top right)' },
  // ---- chat
  { id: 'chat', group: 'Chat', label: 'Talk (opens the chat)', key: 'Enter', fixed: true, radial: true, pad: pad('BACK', true, 'hold LT, press View — the on-screen keyboard opens'), touch: 'Tap the chat bubble' },
  // 2026-10-16 (controller layout): the quest and event trackers fold to one line; this shows them in full and folds them again
  { id: 'hudInfo', group: 'Windows', label: 'Show / fold the quest and event trackers', key: null, run: 'hudInfo', mouse: 'Click the one-line tracker', pad: pad('START', true, 'hold LT, press Menu'), touch: 'The quests bubble (top right)' },
  { id: 'command', group: 'Chat', label: 'Start a command', key: 'Slash', keyText: '/', fixed: true, touch: 'Type / in the chat box' },
];

/** In a window, the pad drives the focus ring instead (input/focus.js). Shown in the reference tables; not re-bindable. */
export const PAD_MENU = [
  { btn: 'LS', also: 'DPAD', label: 'Move the focus ring' },
  { btn: 'A', label: 'Press what is focused' },
  { btn: 'B', label: 'Back: close the window' },
  { btn: 'X', label: 'The other action (what right-click does: an item’s menu, drop, the off hand)' },
  { btn: 'Y', label: 'Details: show the card of what is focused' },
  { btn: 'LB', also: 'RB', label: 'Previous / next tab' },
  { btn: 'RS', label: 'Scroll — on the map and the perk forest: pan' },
  { btn: 'LT', also: 'RT', label: 'Map and perk forest: zoom out / in' },
  { btn: 'LS', label: 'Map and perk forest: move the pointer (a ring you steer)', cursor: true },
  { btn: 'START', label: 'Close everything' },
  { btn: 'BACK', label: 'Open / close the map' },
];

/**
 * 2026-10-16 — the CONTROLLER MENU (Menu / Start in the controller layout; input/pad-layout.js draws it). One big tile per
 * window, in three rows of meaning. `panel` = the id main.js's PANELS table toggles (the same one the menu bar and the
 * window keys use, so a tile can never open something the keyboard cannot); `act` = a button of the pause menu
 * (#panel-pause [data-act]) it presses; `run` = an input-layer action. `icon` = the icon library's picture (menubar ids).
 * tests/G/bindings.test.js checks every row names a real window or action.
 */
export const PAD_MENU_TILES = [
  { id: 'bag', group: 'You', label: 'Bag', sub: 'Gear and items', panel: 'bag', icon: 'bag', action: 'bag' },
  { id: 'sheet', group: 'You', label: 'Character', sub: 'Stats and damage', panel: 'sheet', icon: 'sheet', action: 'sheet' },
  { id: 'skills', group: 'You', label: 'Skills', sub: 'Skills and talents', panel: 'skills', icon: 'skills', action: 'skills' },
  { id: 'perks', group: 'You', label: 'Perks', sub: 'The perk forest', panel: 'perks', icon: 'perks', action: 'perks' },
  { id: 'journal', group: 'You', label: 'Journal', sub: 'Quests', panel: 'journal', icon: 'journal', action: 'journal' },
  { id: 'achievements', group: 'You', label: 'Achievements', sub: 'And trophies', panel: 'achievements', icon: 'journal', action: 'achievements' },
  { id: 'map', group: 'You', label: 'Map', sub: 'Also: View', panel: 'map', icon: 'map', action: 'map' },
  { id: 'party', group: 'People', label: 'Party', sub: 'Invite, join link', panel: 'party', icon: 'party', action: 'party' },
  { id: 'friends', group: 'People', label: 'Friends', sub: 'Who is online', panel: 'friends', icon: 'friends' },
  { id: 'guild', group: 'People', label: 'Guild', sub: 'Your guild', panel: 'guild', icon: 'guild' },
  { id: 'mail', group: 'People', label: 'Mail', sub: 'Letters and parcels', panel: 'mail', icon: 'mail' },
  { id: 'market', group: 'People', label: 'Market', sub: 'Buy and sell', panel: 'market', icon: 'travel_cart' },
  { id: 'callboard', group: 'People', label: 'Group Finder', sub: 'Find a group', panel: 'callboard', icon: 'callboard' },
  { id: 'chat', group: 'People', label: 'Chat', sub: 'Also: LT + View', run: 'chat', icon: 'chat', action: 'chat' },
  { id: 'settings', group: 'Game', label: 'Settings', sub: 'Layout, sound, graphics', act: 'settings', icon: 'wheel' },
  { id: 'help', group: 'Game', label: 'Controls', sub: 'Every button', act: 'help', icon: 'help' },
  { id: 'changelog', group: 'Game', label: "What's new", sub: 'Recent changes', act: 'changelog', icon: 'eye' },
  { id: 'feedback', group: 'Game', label: 'Feedback', sub: 'A bug or an idea', panel: 'feedback', icon: 'feedback' },
  { id: 'account', group: 'Game', label: 'Account', sub: 'Claim, password', panel: 'account', icon: 'account' },
  { id: 'meter', group: 'Game', label: 'Damage meter', sub: 'Who did what', panel: 'meter', icon: 'attack' },
  { id: 'logout', group: 'Game', label: 'Log out', sub: 'Back to the title', act: 'logout', icon: 'close', danger: true },
];

/** Things only a mouse or a finger does (no action id: nothing to re-bind). Printed in the tables next to the actions. */
export const POINTER_ROWS = [
  { group: 'Moving', mouse: 'Drag', touch: 'Drag on the world', label: 'Turn the camera' },
  { group: 'Moving', mouse: 'Click ground', touch: 'Tap the ground', label: 'Walk there' },
  { group: 'Fighting', mouse: 'Click', touch: 'Tap', label: 'Select' },
  { group: 'Fighting', mouse: 'Right-click a friend', touch: 'Hold on a friend', label: 'Their menu: follow, trade, inspect, whisper…' },
  { group: 'Fighting', mouse: 'Shift + right-click', touch: 'Hold on an enemy', label: 'The menu on an enemy' },
  { group: 'Windows', mouse: 'Hover', touch: 'Hold on anything', label: 'Its card (tooltip)' },
  { group: 'Windows', mouse: 'Shift-click an item', touch: 'Item sheet: "Other hand"', label: 'Wear it in the other hand' },
];
/** Chat commands (typed, the same on every device). */
export const CHAT_ROWS = [['/w Name', 'Whisper'], ['/r', 'Answer the last whisper'], ['/follow Name', 'Follow a friend (move to stop)'], ['/bug · /suggest', 'Send a bug report or a suggestion'], ['/tradewith Name', 'Ask a player to trade'], ['/help', 'All chat commands']];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
export const GROUPS = [...new Set(ACTIONS.map(a => a.group))];

const KEY_NAMES = { Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', Slash: '/', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Backslash: '\\', ArrowUp: '↑', ArrowDown: '↓', NumLock: 'Num Lock', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn' };
/** A KeyboardEvent.code as people say it: KeyW -> W, Digit7 -> 7, Numpad3 -> Num 3. */
export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}

/** Codes a player may not bind anything to (the browser or the chat box owns them). */
export const RESERVED_KEYS = new Set(['Escape', 'Enter', 'F1', 'F5', 'F11', 'F12', 'Slash', 'MetaLeft', 'MetaRight', 'ContextMenu']);

/**
 * The live key table: defaults + the player's overrides ({ actionId: code | null }).
 *   B.keyOf('strike') -> 'KeyF'      B.defaultOf('strike')        B.actionsFor('KeyF') -> ['strike']
 *   B.set('strike', 'KeyG') -> { ok, swapped?: actionId }   (a key already in use SWAPS with it — no key ever does two unrelated things)
 *   B.translate('KeyG') -> 'KeyF' | null   what default code the game should hear for a pressed physical code
 */
export function createBindings(overrides = {}) {
  let over = cleanOverrides(overrides);
  const rebindable = a => !a.fixed;
  const keyOf = id => { const a = ACTION_BY_ID[id]; if (!a) return null; return Object.prototype.hasOwnProperty.call(over, id) ? over[id] : a.key; };
  const defaultOf = id => ACTION_BY_ID[id]?.key ?? null;
  const actionsFor = code => ACTIONS.filter(a => keyOf(a.id) === code).map(a => a.id);
  /** Actions that may sit on one key together by design (E turns the camera AND uses; Space jumps AND hooks). */
  const partners = id => { const a = ACTION_BY_ID[id]; return new Set([a?.shares, ...ACTIONS.filter(x => x.id !== id && (x.shares === id || (a?.shares && x.shares === a.shares))).map(x => x.id)].filter(Boolean)); };   // W9 (P-client): siblings too — hook and profWork both share jump's key
  function set(id, code) {
    const a = ACTION_BY_ID[id];
    if (!a || a.fixed) return { ok: false, why: 'fixed' };
    if (code && RESERVED_KEYS.has(code)) return { ok: false, why: 'reserved' };
    const prev = keyOf(id);
    let swapped = null;
    if (code) for (const other of actionsFor(code)) {
      if (other === id || partners(id).has(other)) continue;
      if (ACTION_BY_ID[other].fixed) return { ok: false, why: 'taken', by: other };
      over[other] = prev ?? null; swapped = other;
    }
    over[id] = code || null;
    // keep the pairs that share a key together
    for (const p of partners(id)) if (!ACTION_BY_ID[p].fixed && defaultOf(p) === defaultOf(id)) over[p] = code || null;
    over = cleanOverrides(over);
    return { ok: true, swapped };
  }
  /** Physical code -> the default code the game listens for (null = this key does nothing bound; undefined = pass through untouched). */
  function translate(code) {
    if (!Object.keys(over).length) return undefined;
    const acts = actionsFor(code).filter(id => ACTION_BY_ID[id].key);
    if (acts.length) { const d = ACTION_BY_ID[acts[0]].key; return d === code ? undefined : d; }
    // a default code whose action moved elsewhere must go quiet
    const was = ACTIONS.filter(a => a.key === code && !(a.keys || []).includes(code));
    if (was.length && was.every(a => keyOf(a.id) !== code)) return null;
    return undefined;
  }
  return {
    keyOf, defaultOf, actionsFor, set, translate, rebindable,
    reset(id) { if (id) delete over[id]; else over = {}; },
    get overrides() { return { ...over }; },
    label: id => { const a = ACTION_BY_ID[id]; const k = keyOf(id); return a?.keyText && k === a.key ? a.keyText : keyLabel(k); },
    changed: id => Object.prototype.hasOwnProperty.call(over, id),
  };
}
function cleanOverrides(o) {
  const out = {};
  for (const [id, code] of Object.entries(o || {})) {
    const a = ACTION_BY_ID[id];
    if (!a || a.fixed) continue;
    if (code === a.key || (code == null && a.key == null)) continue;
    out[id] = typeof code === 'string' ? code : null;
  }
  return out;
}

/** "LT + Y" for an action on a glyph set ('' when the pad has no button for it — it lives in the quick wheel). */
export function padLabel(id, set = 'xbox') {
  const a = ACTION_BY_ID[id], G = GLYPHS[set] || GLYPHS.xbox;
  if (!a?.pad) return a?.radial ? `${G[PAD_RADIAL]} wheel` : '';
  return (a.pad.mod ? `${G[PAD_MOD]} + ` : '') + (G[a.pad.btn] || a.pad.btn);
}
/** The pad binding as parts for drawing glyph caps: [{ btn, text }] (the modifier first). */
export function padParts(id, set = 'xbox') {
  const a = ACTION_BY_ID[id], G = GLYPHS[set] || GLYPHS.xbox;
  if (!a?.pad) return a?.radial ? [{ btn: PAD_RADIAL, text: G[PAD_RADIAL] }, { btn: 'WHEEL', text: 'wheel' }] : [];
  const out = [];
  if (a.pad.mod) out.push({ btn: PAD_MOD, text: G[PAD_MOD] });
  out.push({ btn: a.pad.btn, text: G[a.pad.btn] || a.pad.btn });
  return out;
}

/** The pad's world layer as lookups: plain[btn] / mod[btn] -> action id. Built once; gamepad.js reads it. */
export function padLayers() {
  const plain = {}, mod = {}, ctx = {};
  for (const a of ACTIONS) {
    if (!a.pad || a.pad.btn === 'LS' || a.pad.btn === 'RS') continue;
    if (a.ctx) { (ctx[a.ctx] ||= {})[a.pad.btn] = a.id; continue; }
    (a.pad.mod ? mod : plain)[a.pad.btn] = a.id;
  }
  return { plain, mod, ctx };
}

/** The quick wheel's slices, in order (clockwise from the top). Shared by the pad's wheel and the phone's. */
export const WHEEL = [
  { id: 'bag', label: 'Bag', icon: 'bag' },
  { id: 'sheet', label: 'Character', icon: 'sheet' },
  { id: 'skills', label: 'Skills', icon: 'skills' },
  { id: 'perks', label: 'Perks', icon: 'perks' },
  { id: 'pause', label: 'Menu', icon: 'menu' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'party', label: 'Social', icon: 'party' },
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'achievements', label: 'Achievements', icon: 'journal' },      // feedback #106
];
/** The second ring (phone: swipe the wheel; pad: tap RB while it is open): things you do, not windows. */
export const WHEEL_ACTIONS = [
  { id: 'mount', label: 'Mount', icon: 'mount' },
  { id: 'autorun', label: 'Auto-run', icon: 'autorun' },
  { id: 'fish', label: 'Fish', icon: 'fish' },
  { id: 'camp', label: 'Camp', icon: 'camp' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'help', label: 'Help', icon: 'help' },
];

/**
 * Play-test 10 (Y34): every control the phone layout puts ON SCREEN — one row each. `action` = the row of ACTIONS it
 * presses; `sel` = the element (css/layout-phone.css places it, input/touch.js makes it work); `name` = the two words a
 * player would call it; `what` = one sentence. Read by: the label a long press shows, the pause menu's "What do these
 * buttons do?" overlay (input/touch.js), the gallery's Controls scene, and tests/G/bindings.test.js.
 * A new on-screen control = one row here.
 */
export const TOUCH_CONTROLS = [
  { id: 'stick', action: 'moveF', sel: '.ph-stickzone', name: 'Move', what: 'Put your left thumb anywhere on this side and push. A full push runs; part-way walks.', area: true },
  { id: 'attack', action: 'strike', sel: '#actionbar > .slot:nth-child(1)', name: 'Attack', what: 'One tap: you turn to your target (or the nearest enemy), walk into reach and keep attacking. Tap again to stop.' },
  { id: 'skill1', action: 'skill1', sel: '#actionbar > .slot:nth-child(2)', name: 'Skill 1', what: 'Your first skill. Hold it to read its card.', skill: 1 },
  { id: 'skill2', action: 'skill2', sel: '#actionbar > .slot:nth-child(3)', name: 'Skill 2', what: 'Your second skill. Hold it to read its card.', skill: 2 },
  { id: 'skill3', action: 'skill3', sel: '#actionbar > .slot:nth-child(4)', name: 'Skill 3', what: 'Your third skill. Hold it to read its card.', skill: 3 },
  { id: 'skill4', action: 'skill4', sel: '#actionbar > .slot:nth-child(5)', name: 'Skill 4', what: 'Your fourth skill. Hold it to read its card.', skill: 4 },
  { id: 'skill5', action: 'skill5', sel: '#actionbar > .slot:nth-child(6)', name: 'Skill 5', what: 'Your fifth skill. Hold it to read its card.', skill: 5 },
  { id: 'skill6', action: 'skill6', sel: '#actionbar > .slot:nth-child(7)', name: 'Skill 6', what: 'Your sixth skill. Hold it to read its card.', skill: 6 },
  { id: 'belt', action: 'item1', sel: '.ph-belt', name: 'Belt', what: 'Potions and food. Tap: use the first one you carry. Hold: choose from all four.' },
  { id: 'target', action: 'targetNext', sel: '.ph-target', name: 'Next enemy', what: 'Picks the nearest enemy; tap again for the next one. (You can also tap an enemy.)' },
  { id: 'ally', action: 'allyNext', sel: '.ph-ally', name: 'Next friend', what: 'Picks a party member — the most hurt first — so your heals and wards go to them.' },
  { id: 'jump', action: 'jump', sel: '.ph-jump', name: 'Jump', what: 'Jump.' },
  { id: 'mount', action: 'mount', sel: '.ph-mount', name: 'Mount', what: 'Calls your mount (stand still while the ring fills). Tap again to get down.' },
  { id: 'fish', action: 'fish', sel: '.ph-fish', name: 'Fish', what: 'Casts your line. Lit when water is in reach. Then: tap Hook when it bites, and hold / let go to keep the float in the green.' },
  { id: 'hook', action: 'hook', sel: '.ph-hook', name: 'Hook / Reel', what: 'Shows while you fish: tap when it bites, then hold to reel and let go to give line.' },
  { id: 'wheel', action: 'radial', sel: '.ph-wheel', name: 'Quick wheel', what: 'Every window: bag, character, skills, perks, journal, social, the menu. Tap its middle for more: map, camp, auto-run, emotes.' },
  { id: 'chat', action: 'chat', sel: '.ph-chat', name: 'Chat', what: 'Opens the chat. The number is how many lines you have not read.' },
  { id: 'info', action: 'journal', sel: '.ph-info', name: 'Quests and events', what: 'Shows or hides your tracked quests and the events around you.' },
  { id: 'partymin', action: 'party', sel: '.ph-partymin', name: 'Party size', what: 'Party frames as small round portraits, or full rows.' },
  { id: 'party', action: 'allyPrev', sel: '#party .pmember', name: 'Party member', what: 'Tap: target them (your heals go there). Hold: track them — an arrow leads you to them.' },
  { id: 'self', action: 'targetClear', sel: '#self-frame', name: 'You', what: 'Tap to clear your target, so heals land on you.' },
  { id: 'minimap', action: 'map', sel: '#minimap', name: 'Map', what: 'Tap the little map to open the big one.' },
  { id: 'prompt', action: 'interact', sel: '#interact, .interact', name: 'Use / talk / loot', what: 'Appears when something is in reach. Tap it.' },
];
export const TOUCH_CONTROL_BY_ID = Object.fromEntries(TOUCH_CONTROLS.map(c => [c.id, c]));

/** One short row list per group for a device: [{ group, rows: [{ keys:[…text], label, ids:[…], note }] }]. `B` = createBindings(). */
export function referenceRows(device = 'keyboard', { B = createBindings(), set = 'xbox' } = {}) {
  const G = GLYPHS[set] || GLYPHS.xbox;
  const out = [];
  for (const group of GROUPS) {
    const rows = [], seen = new Set();
    for (const a of ACTIONS.filter(x => x.group === group)) {
      const key = a.row || a.id;
      if (seen.has(key)) continue; seen.add(key);
      const mates = a.row ? ACTIONS.filter(x => x.row === a.row) : [a];
      const label = a.rowLabel || a.label;
      let keys = [], note = '';
      if (device === 'keyboard') {
        keys = mates.map(m => B.label(m.id)).filter(k => k !== '—');
        if (a.row === 'skills' || a.row === 'items') keys = keys.length > 2 && contiguous(keys) ? [`${keys[0]} – ${keys[keys.length - 1]}`] : keys;
        if (!keys.length && a.mouse) keys = [a.mouse]; else if (a.mouse) note = a.mouse;
        if (!keys.length) keys = ['—'];
      } else if (device === 'pad') {
        if (a.pad && (a.pad.btn === 'LS' || a.pad.btn === 'RS')) keys = [G[a.pad.btn]];
        else keys = [...new Set(mates.map(m => padLabel(m.id, set)).filter(Boolean))];
        note = a.pad?.note || '';
        if (!keys.length) keys = ['—'];
      } else {
        keys = [...new Set(mates.map(m => m.touch).filter(Boolean))];
        if (!keys.length) keys = ['—'];
      }
      rows.push({ keys, label, ids: mates.map(m => m.id), note, parts: device === 'pad' ? mates.map(m => padParts(m.id, set)) : null });
    }
    if (device !== 'pad') for (const p of POINTER_ROWS.filter(p => p.group === group)) rows.push({ keys: [device === 'keyboard' ? p.mouse : p.touch], label: p.label, ids: [], note: '' });
    if (group === 'Chat') for (const [k, what] of CHAT_ROWS) rows.push({ keys: [k], label: what, ids: [], note: '' });
    out.push({ group, rows });
  }
  if (device === 'pad') out.push({ group: 'In a window', rows: PAD_MENU.map(m => ({ keys: [G[m.btn] + (m.also ? ` / ${G[m.also]}` : '')], label: m.label, ids: [], note: '' })) });
  return out;
}
const contiguous = ks => ks.every((k, i) => i === 0 || +k === +ks[i - 1] + 1);

/**
 * The help window's table (the shape social-core.js has always exported): [{ group, keys: [[keyText, what], …] }].
 * Keyboard and mouse, with the player's own keys.
 */
export function shortcutsTable(B = createBindings()) {
  const rows = referenceRows('keyboard', { B });
  const out = rows.map(g => ({ group: g.group, keys: g.rows.map(r => [r.keys.join(r.ids.length > 1 && r.keys.length > 1 ? ' ' : ' · '), r.label + (r.note && !/Esc/.test(r.note) ? ` (or ${r.note.toLowerCase()})` : '')]) }));
  // every window key on its own row, as its letter (tests/D look the letters up)
  return out;
}
/** Window hotkeys: KeyboardEvent.code -> panel id (default codes: what main.js listens for). */
export function panelKeys() {
  return Object.fromEntries(ACTIONS.filter(a => a.panel && a.key && a.id !== 'help').map(a => [a.key, a.panel]));
}

/** Sanity rules the node test runs (returned as a list of problems, empty = fine). */
export function auditBindings() {
  const bad = [];
  const ids = new Set();
  for (const a of ACTIONS) {
    if (ids.has(a.id)) bad.push(`duplicate action ${a.id}`); ids.add(a.id);
    if (!a.label || !a.group) bad.push(`${a.id}: no label/group`);
    if (!a.touch) bad.push(`${a.id}: no touch control`);
    if (!a.pad && !a.radial && !['friends', 'guild', 'command'].includes(a.id)) bad.push(`${a.id}: not reachable on a pad`);
    if (a.pad && !(a.pad.btn in PAD_INDEX) && !['LS', 'RS'].includes(a.pad.btn)) bad.push(`${a.id}: unknown pad button ${a.pad.btn}`);
    if (a.key == null && !a.run && !a.mouse) bad.push(`${a.id}: no key and nothing runs it`);
  }
  // no two world-layer actions on one pad chord
  const chord = new Map();
  for (const a of ACTIONS) { if (!a.pad || a.ctx || ['LS', 'RS'].includes(a.pad.btn)) continue; const k = (a.pad.mod ? 'M+' : '') + a.pad.btn; if (chord.has(k)) bad.push(`pad ${k}: ${chord.get(k)} and ${a.id}`); chord.set(k, a.id); }
  // no two actions on one default key unless they say they share
  const byKey = new Map();
  for (const a of ACTIONS) { if (!a.key) continue; const o = byKey.get(a.key); if (o && a.shares !== o && ACTION_BY_ID[o].shares !== a.id) bad.push(`key ${a.key}: ${o} and ${a.id}`); if (!o) byKey.set(a.key, a.id); }
  for (const w of [...WHEEL, ...WHEEL_ACTIONS]) if (!ACTION_BY_ID[w.id]) bad.push(`wheel slice ${w.id} is not an action`);
  for (const a of ACTIONS) if (a.radial && ![...WHEEL, ...WHEEL_ACTIONS].some(w => w.id === a.id)) bad.push(`${a.id} says it is in the wheel and is not`);
  if (PAD_MOD === PAD_RADIAL) bad.push('modifier and wheel on one button');
  // the controller menu: unique tiles, each doing exactly one thing
  const tileIds = new Set();
  for (const t of PAD_MENU_TILES) {
    if (tileIds.has(t.id)) bad.push(`menu tile ${t.id} twice`); tileIds.add(t.id);
    if ([t.panel, t.act, t.run].filter(Boolean).length !== 1) bad.push(`menu tile ${t.id}: needs exactly one of panel / act / run`);
    if (t.action && !ACTION_BY_ID[t.action]) bad.push(`menu tile ${t.id}: ${t.action} is not an action`);
  }
  // Y34: every on-screen phone control names a real action, once, in plain words
  const seenC = new Set();
  for (const c of TOUCH_CONTROLS) {
    if (seenC.has(c.id)) bad.push(`touch control ${c.id} twice`); seenC.add(c.id);
    if (!ACTION_BY_ID[c.action]) bad.push(`touch control ${c.id}: ${c.action} is not an action`);
    if (!c.sel || !c.name || !c.what) bad.push(`touch control ${c.id}: needs sel, name and what`);
    if (c.name && c.name.length > 18) bad.push(`touch control ${c.id}: the name must fit under a 46 px button`);
  }
  for (const id of ['strike', 'mount', 'fish', 'jump', 'targetNext', 'allyNext', 'radial', 'chat']) if (!TOUCH_CONTROLS.some(c => c.action === id)) bad.push(`${id} has no on-screen phone control`);
  return bad;
}
