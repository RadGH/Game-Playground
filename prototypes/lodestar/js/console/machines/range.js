// Range knob: zoom, 6 detents ¼ ½ 1 2 4 8 screen pixels per cell. ¼ and ½ draw the downsampled chart.
// Keys: Q / - zoom out, E / = zoom in. Triggers LT / RT. Wheel on the glass or the knob. Pinch on a phone.
import { machinePanel } from './panel.js';
import { createKnob } from '../knob.js';

export function mountRange(C) {
  const R = C.data.range;
  const { el, body } = machinePanel({ id: 'range', title: 'RANGE' });
  const knob = createKnob({ name: 'RANGE', id: 'range', labels: R.labels, names: R.labels.map(l => `${l} px per cell`), index: R.default, sound: (s, o) => C.room.play(s, o), onChange: i => C.state.set('range', i) });
  const mini = createKnob({ name: 'RNG', id: 'range-mini', labels: R.labels, mini: true, bind: knob, sound: (s, o) => C.room.play(s, o) });
  body.append(knob.el);
  return { el, knob, mini };
}
