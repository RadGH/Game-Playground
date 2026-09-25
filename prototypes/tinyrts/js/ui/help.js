// F1 / ? hotkey cheat sheet overlay.

const GROUPS = [
  ['Camera', [['Arrow keys', 'Pan (Shift = fast)'], ['Mouse at edge', 'Edge pan'], ['Middle-drag', 'Drag camera'], ['Mouse wheel', 'Zoom'], ['Home', 'Jump to Core'], ['Space', 'Jump to latest alert'], ['Minimap', 'Click/drag to look · right-click to order']]],
  ['Selecting', [['Click / drag', 'Select / box select'], ['Shift+click', 'Add or remove'], ['Double-click', 'All of that type on screen'], ['Shift+1…0', 'Save control group'], ['1…0', 'Select group (twice = look)'], ['Tab', 'Cycle type in a mixed group'], ['`', 'Next idle drone'], ['Shift+`', 'All army units'], ['Esc', 'Cancel → back → deselect → menu']]],
  ['Orders (units selected)', [['Right-click', 'Move / attack'], ['A + click', 'Attack-move'], ['S', 'Stop'], ['D', 'Hold position'], ['F + click', 'Patrol'], ['Q', 'Siege: deploy · Commander: Overcharge'], ['W + click', 'Commander: Blink'], ['E + click', 'Commander: Orbital Lance'], ['Shift + order', 'Queue it']]],
  ['Building (B or nothing selected)', [['Q', 'Walls → Q Panel W Plate E Prism R Foam'], ['W', 'Turrets → Q Pulse W Lance E Mortar R Railgun A Flak S Arc'], ['E', 'Economy → Q Drill W Solar E Reactor R Battery A Relay S Refinery'], ['R', 'Base → Q Fabricator W Lab E Gate'], ['Z', 'Dig area'], ['X', 'Salvage area'], ['V', 'Repeat last build']]],
  ['While placing', [['Left-click / drag', 'Place / paint'], ['Shift', 'Straight line (walls) · keep placing (buildings)'], ['[ and ]', 'Brush size'], ['Right-click / Esc', 'Cancel'], ['Ctrl+Z', 'Undo last placement (if not started)']]],
  ['Buildings selected', [['Q W E R', 'Train units / research / targeting mode'], ['V', 'Rally point'], ['X X', 'Salvage']]],
  ['Game', [['P', 'Pause'], ['Shift+N', 'Call next wave early'], ['L', 'Link network overlay'], ['G', 'All turret ranges'], ['Alt (hold)', 'Show all health bars'], ['+ / −', 'Game speed (Free Play)'], ['F1 or ?', 'This sheet'], ['Esc', 'Menu']]],
];

export class Help {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.id = 'help';
    this.el.innerHTML = `<h2>Controls</h2><div class="close">Esc / F1 to close</div><div class="cols">${GROUPS.map(([t, kv]) => `<div class="grp"><h4>${t}</h4>${kv.map(([k, v]) => `<div class="kv"><b>${k}</b><span>${v}</span></div>`).join('')}</div>`).join('')}</div>`;
    document.body.appendChild(this.el);
    this.el.addEventListener('mousedown', () => this.toggle(false));
    this.open = false;
  }
  toggle(v) {
    this.open = v === undefined ? !this.open : v;
    this.el.classList.toggle('open', this.open);
  }
}

export const HELP_GROUPS = GROUPS;
