// Time dial: a heavy rotary — PAUSE, 1×, 2×, 4× (0 / 20 / 40 / 80 ticks a second). Space toggles pause; , and .
// step it. The worker is told the rate; it is not a saved action (PLAN §3.3).
import { machinePanel } from './panel.js';
import { createKnob } from '../knob.js';

export function mountTimeDial(C) {
  const T = C.data.time;
  const { el, body } = machinePanel({ id: 'timedial', title: 'TIME' });
  const knob = createKnob({ name: 'TIME', id: 'time', cls: 'knob-heavy', labels: T.labels, names: T.names, index: T.default, sound: (s, o) => C.room.play(s, o), onChange: i => C.state.set('rate', i) });
  const mini = createKnob({ name: 'TIME', id: 'time-mini', cls: 'knob-heavy', labels: T.labels, mini: true, bind: knob, sound: (s, o) => C.room.play(s, o) });
  body.append(knob.el);
  return { el, knob, mini };
}
