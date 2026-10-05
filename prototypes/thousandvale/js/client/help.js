// The keyboard help overlay (F1 or ?): every shortcut in the game, grouped, from social-core.js SHORTCUTS so the
// list and the bindings cannot drift apart silently (tests/D/m3-social.test.js checks PANEL_KEYS against it).

import { SHORTCUTS } from './social-core.js';
import { createPanel, h } from './ui-panel.js';

export function createHelp() {
  const panel = createPanel({ id: 'help', title: 'Controls', width: 560, cls: 'help-panel centered' });
  panel.setTitle('Controls', 'F1 or ? opens this');
  panel.fill(h('div.help-grid', {}, ...SHORTCUTS.map(g => h('section', {}, h('h4', {}, g.group),
    h('dl', {}, ...g.keys.flatMap(([k, what]) => [h('dt', {}, ...k.split(' · ').flatMap((x, i) => (i ? [' · ', h('kbd', {}, x)] : [h('kbd', {}, x)]))), h('dd', {}, what)]))))),
  h('p.tiny-left', {}, 'Windows can be dragged by their title. Esc closes the top one.'));
  return panel;
}
