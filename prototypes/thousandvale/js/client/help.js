// The keyboard help overlay (F1 or ?): every shortcut in the game, grouped, from the ONE binding table
// (js/client/input/bindings.js — social-core.js SHORTCUTS is built from it too), so the list and the bindings cannot drift.

import { referenceTable } from './input/bindings-ui.js';   // T27 (stream G): the live table — your own keys, or the controller's buttons
import { device } from './input/device.js';
import { createPanel, h } from './ui-panel.js';

export function createHelp() {
  const panel = createPanel({ id: 'help', title: 'Controls', width: 560, cls: 'help-panel centered' });
  panel.setTitle('Controls', 'F1 or ? opens this');
  const draw = () => panel.fill(h('div.help-grid.live', { dataset: { device: device.current } }, ...referenceTable(device.current === 'pad' ? 'pad' : device.current === 'touch' ? 'touch' : 'keyboard').children),
    h('p.tiny-left', {}, device.current === 'pad' ? 'Hold the wheel button for every window. Settings has the keyboard list too.' : 'Windows can be dragged by their title. Esc closes the top one. Keys can be changed in Settings.'));
  const open0 = panel.open.bind(panel);
  panel.open = () => { draw(); open0(); };
  panel.toggle = force => { const want = force ?? !panel.isOpen; if (want) panel.open(); else panel.close(); return want; };
  device.on(() => { if (panel.isOpen) draw(); });
  draw();
  return panel;
}
