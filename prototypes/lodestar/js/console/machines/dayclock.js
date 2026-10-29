// Day clock: the planet's 24-hour day. A sun-and-moon disc turns behind a half-moon window, a nixie readout gives the
// day and the hour. M11 adds the barometer to this dial.
import { machinePanel } from './panel.js';

export function mountDayClock(C) {
  const { el, body } = machinePanel({ id: 'dayclock', title: 'DAY', cls: 'machine-strip', plate: false });
  body.innerHTML = `
    <div class="dc-window" aria-hidden="true"><div class="dc-disc"><i class="dc-sun"></i><i class="dc-moon"></i></div></div>
    <div class="dc-read"><span class="dc-day">DAY 1</span><span class="dc-time">--:--</span></div>`;
  const disc = body.querySelector('.dc-disc'), day = body.querySelector('.dc-day'), time = body.querySelector('.dc-time');
  let last = '';
  return {
    el,
    set(d, hour) {
      // the sun sits at the top of the window at noon, the moon at midnight
      disc.style.setProperty('--turn', `${(hour / 24) * 360 + 180}deg`);
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (s + d !== last) { last = s + d; time.textContent = s; day.textContent = `DAY ${d}`; }
      el.dataset.night = String(hour < 6 || hour >= 19);
    },
  };
}
