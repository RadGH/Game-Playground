// Radio speaker: field calls from Signals, always subtitled (the voice arrives in M11 through js/audio/radio.js).
// A grille, a signal lamp that lights while someone is talking, and a two-line subtitle window. Every call is also
// printed on the teletype. M4 adds the raid story lines (data/radio.json) through this machine.
import { machinePanel } from './panel.js';

export function mountRadio(C) {
  const { el, body } = machinePanel({ id: 'radio', title: 'RADIO' });
  body.innerHTML = `
    <div class="radio-grille" aria-hidden="true"><span class="radio-lamp"></span></div>
    <div class="radio-sub" role="status" aria-live="polite"><span class="radio-who">SIGNALS</span><span class="radio-text">— CARRIER ONLY —</span></div>`;
  const lamp = body.querySelector('.radio-lamp'), who = body.querySelector('.radio-who'), txt = body.querySelector('.radio-text');
  let clear = 0;
  return {
    el,
    say({ who: w = 'Signals', text }) {
      C.room.play('squelch');
      el.classList.add('talking'); lamp.classList.add('on');
      who.textContent = w.toUpperCase(); txt.textContent = text;
      C.print({ who: `radio · ${w}`, text });
      clearTimeout(clear);
      clear = setTimeout(() => { el.classList.remove('talking'); lamp.classList.remove('on'); C.room.play('squelch'); }, Math.min(9000, 1800 + text.length * 55));
    },
  };
}
