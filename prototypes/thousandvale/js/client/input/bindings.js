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
  { id: 'sprint', group: 'Moving', label: 'Sprint', key: 'ShiftLeft', hold: true, pad: pad('L3', false, 'click the stick: on / off'), touch: 'Push the stick to its outer ring' },
  { id: 'jump', group: 'Moving', label: 'Jump', key: 'Space', pad: pad('A'), touch: 'Jump button' },
  { id: 'camL', group: 'Moving', label: 'Turn the camera left', key: 'KeyQ', hold: true, row: 'cam', rowLabel: 'Turn the camera', pad: pad('RS'), touch: 'Drag on the world' },
  { id: 'camR', group: 'Moving', label: 'Turn the camera right', key: 'KeyE', hold: true, row: 'cam', pad: pad('RS'), touch: 'Drag on the world', shares: 'interact' },
  { id: 'zoom', group: 'Moving', label: 'Zoom the camera', key: null, mouse: 'Mouse wheel', pad: pad('R3', false, 'steps: close · middle · far'), touch: 'Pinch on the world' },
  // ---- fighting
  { id: 'strike', group: 'Fighting', label: 'Strike (basic attack)', key: 'KeyF', mouse: 'Right-click an enemy', pad: pad('X'), touch: 'Attack button (big, right thumb)' },
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
  { id: 'pause', group: 'Fighting', label: 'Menu: settings, help, log out', key: null, run: 'pause', mouse: 'Esc with nothing open', pad: pad('START'), touch: 'Menu (☰) in the quick wheel' },
  { id: 'rise', group: 'Fighting', label: 'Rise after falling', key: 'KeyR', pad: pad('A', false, 'when fallen'), ctx: 'dead', touch: 'The Rise button' },
  // ---- world
  { id: 'interact', group: 'World', label: 'Use, talk, open, loot a body', key: 'KeyE', pad: pad('A', false, 'when a prompt shows'), ctx: 'prompt', touch: 'Tap the prompt' },
  { id: 'camp', group: 'World', label: 'Make camp (wilds)', key: 'KeyC', pad: pad('RB', true), touch: 'Quick wheel: Camp' },
  { id: 'fish', group: 'World', label: 'Cast your fishing line / reel in', key: 'KeyX', pad: pad('A', true), touch: 'Quick wheel: Fish (or the rod in your bag)' },
  { id: 'hook', group: 'World', label: 'Hook a bite; hold to reel during the tug', key: 'Space', shares: 'jump', pad: pad('A', false, 'while fishing'), ctx: 'fishing', touch: 'The Hook / Reel button (replaces Attack)' },
  { id: 'mount', group: 'World', label: 'Ride your mount / get down', key: 'KeyH', pad: pad('X', true), touch: 'Quick wheel: Mount' },
  // ---- windows
  { id: 'map', group: 'Windows', label: 'Map', key: 'KeyM', panel: 'map', pad: pad('BACK'), touch: 'Tap the minimap' },
  { id: 'journal', group: 'Windows', label: 'Journal (quests)', key: 'KeyJ', panel: 'journal', radial: true, touch: 'Quick wheel, or tap the quest tracker' },
  { id: 'bag', group: 'Windows', label: 'Bag and gear', key: 'KeyB', panel: 'bag', radial: true, touch: 'Quick wheel' },
  { id: 'sheet', group: 'Windows', label: 'Character: stats and damage', key: 'KeyV', panel: 'sheet', radial: true, touch: 'Quick wheel (a tab beside the bag)' },
  { id: 'skills', group: 'Windows', label: 'Skills and talents', key: 'KeyK', panel: 'skills', radial: true, touch: 'Quick wheel' },
  { id: 'perks', group: 'Windows', label: 'Perk forest', key: 'KeyN', panel: 'perks', radial: true, touch: 'Quick wheel' },
  { id: 'party', group: 'Windows', label: 'Party menu: party, friends, guild, mail, Group Finder', key: 'KeyP', panel: 'party', radial: true, touch: 'Quick wheel: Social' },
  { id: 'friends', group: 'Windows', label: 'Friends tab', key: 'KeyO', panel: 'friends', touch: 'Social sheet, Friends tab' },
  { id: 'guild', group: 'Windows', label: 'Guild tab', key: 'KeyG', panel: 'guild', touch: 'Social sheet, Guild tab' },
  { id: 'help', group: 'Windows', label: 'This help', key: 'F1', keyText: 'F1 or ?', fixed: true, radial: true, touch: 'Menu (☰): Help and controls' },
  { id: 'radial', group: 'Windows', label: 'Quick wheel: every window in one hold', key: null, run: 'radial', pad: pad('LB', false, 'hold, point with a stick, let go'), touch: 'Hold the wheel button (top right)' },
  // ---- chat
  { id: 'chat', group: 'Chat', label: 'Talk', key: 'Enter', fixed: true, radial: true, touch: 'Tap the chat bubble' },
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

const KEY_NAMES = { Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', Slash: '/', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Backslash: '\\', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn' };
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
  const partners = id => { const a = ACTION_BY_ID[id]; return new Set([a?.shares, ...ACTIONS.filter(x => x.shares === id).map(x => x.id)].filter(Boolean)); };
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
];
/** The second ring (phone: swipe the wheel; pad: tap RB while it is open): things you do, not windows. */
export const WHEEL_ACTIONS = [
  { id: 'mount', label: 'Mount', icon: 'mount' },
  { id: 'fish', label: 'Fish', icon: 'fish' },
  { id: 'camp', label: 'Camp', icon: 'camp' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'help', label: 'Help', icon: 'help' },
];

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
  return bad;
}
