// Filter selector: what the scope paints. SIGHT is the true picture. ORE and FLOW are drawn by the scope overlay
// (M3, js/console/machines/scope-bezel.js); THREAT — Noise / Glow contours, nests, raid arrows, tower ranges, enemy
// blips — by js/console/defence.js (M4). An empty layer stamps its plate ("NO CONTACTS"). Key F / Select steps it.
import { machinePanel } from './panel.js';
import { createKnob } from '../knob.js';

export function mountFilter(C) {
  const F = C.data.filters;
  const { el, body } = machinePanel({ id: 'filter', title: 'FILTER' });
  const knob = createKnob({ name: 'FILTER', id: 'filter', cls: 'knob-selector', labels: F.map(f => f.label), index: 0, sound: (s, o) => C.room.play(s, o), onChange: i => C.state.set('filter', F[i].id) });
  const mini = createKnob({ name: 'FLT', id: 'filter-mini', cls: 'knob-selector', labels: F.map(f => f.label.slice(0, 3)), mini: true, bind: knob, sound: (s, o) => C.room.play(s, o) });
  body.append(knob.el);
  return { el, knob, mini };
}
