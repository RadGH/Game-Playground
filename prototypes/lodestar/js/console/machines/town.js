// The Town Board (PLAN M7): the morale needle and the town's few readouts, as one machine in the FRONT drawer bay.
//   * MORALE gauge — a needle over an engraved scale of work speed (×0.6 … ×1.2 from balance.town.morale), with a
//     thin ghost needle showing where it is heading (the target the homes add up to).
//   * five input lamps — FOOD · WATER · COMMONS · LIGHT · SAFETY — lit while that input is dragging morale down, with
//     the share of the people it affects; a sixth, SMOKE, when chimney smoke hangs over homes.
//   * nixie counters — PEOPLE / BEDS, JOBS FILLED / JOBS, SETTLERS ON THE ROAD, days of FOOD and WATER in the stores.
//   * the SETTLERS switch (WELCOME / CLOSED) — the only order the town takes (`setTown`), and a paper strip that says why
//     nobody is coming when nobody is.
// Nothing here assigns a worker: the town staffs itself (js/sim/town/jobs.js). Reads C.econ.hud.town only.
import { machinePanel } from './panel.js';

const LAMPS = [['food', 'FOOD'], ['water', 'WATER'], ['commons', 'COMMONS'], ['light', 'LIGHT'], ['safety', 'SAFETY'], ['smoke', 'SMOKE']];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Pure: needle angle in degrees (−80 … +80) for a work-speed factor on the gauge's scale. */
export function needleAngle(factor, low, high) {
  const t = Math.max(0, Math.min(1, (factor - low) / Math.max(1e-9, high - low)));
  return -80 + 160 * t;
}

/** Pure: days as a short nixie string. */
export const daysText = (d) => (d === null || d === undefined ? '--' : d >= 99 ? '99+' : d >= 10 ? String(Math.round(d)) : d.toFixed(1));

export function mountTown(C) {
  const { el, body } = machinePanel({ id: 'town', title: 'TOWN BOARD', cls: 'machine-town' });
  const scale = [];
  for (let i = 0; i <= 12; i++) {
    const a = (-80 + (160 * i) / 12) * Math.PI / 180, r1 = 46, r2 = i % 3 === 0 ? 37 : 41;
    scale.push(`<line x1="${60 + Math.sin(a) * r1}" y1="${62 - Math.cos(a) * r1}" x2="${60 + Math.sin(a) * r2}" y2="${62 - Math.cos(a) * r2}" />`);
  }
  body.innerHTML = `
    <div class="tw-gauge" role="img" aria-label="Morale">
      <svg viewBox="0 0 120 76" aria-hidden="true">
        <path class="tw-face" d="M6 64 A54 54 0 0 1 114 64 Z" />
        <path class="tw-red" d="M${60 - Math.sin(80 * Math.PI / 180) * 49} ${62 - Math.cos(80 * Math.PI / 180) * 49} A49 49 0 0 1 ${60 - Math.sin(27 * Math.PI / 180) * 49} ${62 - Math.cos(27 * Math.PI / 180) * 49}" />
        <g class="tw-ticks">${scale.join('')}</g>
        <text class="tw-lo" x="12" y="73"></text><text class="tw-mid" x="60" y="22">×1.0</text><text class="tw-hi" x="108" y="73"></text>
        <text class="tw-name" x="60" y="50">MORALE</text>
        <g class="tw-ghost"><line x1="60" y1="62" x2="60" y2="20" /></g>
        <g class="tw-needle"><line x1="60" y1="66" x2="60" y2="18" /><circle cx="60" cy="62" r="5" /></g>
      </svg>
      <b class="tw-factor">×1.00</b>
    </div>
    <div class="tw-nixies">
      <div class="tw-nx"><span>PEOPLE</span><b data-nx="pop">--</b></div>
      <div class="tw-nx"><span>JOBS</span><b data-nx="jobs">--</b></div>
      <div class="tw-nx"><span>ON ROAD</span><b data-nx="walking">--</b></div>
      <div class="tw-nx"><span>FOOD D</span><b data-nx="food">--</b></div>
      <div class="tw-nx"><span>WATER D</span><b data-nx="water">--</b></div>
    </div>
    <div class="tw-lamps">${LAMPS.map(([k, l]) => `<span class="tw-lamp" data-lamp="${k}" title=""><i></i><em>${l}</em><small></small></span>`).join('')}</div>
    <button type="button" class="tw-settlers" aria-pressed="true" aria-label="Settlers welcome">
      <span class="tw-bat"></span><span class="tw-sw-label"><b>SETTLERS</b><i>WELCOME</i></span>
    </button>
    <p class="tw-why"></p>`;
  const needle = body.querySelector('.tw-needle'), ghost = body.querySelector('.tw-ghost');
  const sw = body.querySelector('.tw-settlers');
  let open = true, last = '';
  sw.addEventListener('click', () => {
    open = !open; paintSwitch();
    C.room.play(open ? 'slap' : 'slapdown');
    C.send({ t: 'setTown', settlers: open });
    C.print({ who: 'Town', text: open ? 'THE ROAD IS OPEN — SETTLERS WELCOME.' : 'NO MORE SETTLERS FOR NOW — THE ROAD IS CLOSED.' });
  });
  function paintSwitch() {
    sw.classList.toggle('closed', !open);
    sw.setAttribute('aria-pressed', String(open));
    sw.setAttribute('aria-label', open ? 'Settlers welcome (press to close the road)' : 'Settlers turned away (press to open the road)');
    sw.querySelector('i').textContent = open ? 'WELCOME' : 'CLOSED';
  }

  function draw() {
    const t = C.econ?.hud?.town;
    if (!t) return;
    const key = JSON.stringify(t);
    if (key === last) return;
    last = key;
    body.querySelector('.tw-lo').textContent = `×${t.low}`;
    body.querySelector('.tw-hi').textContent = `×${t.high}`;
    needle.style.transform = `rotate(${needleAngle(t.factor, t.low, t.high)}deg)`;
    ghost.style.transform = `rotate(${needleAngle(t.low + (t.high - t.low) * t.target, t.low, t.high)}deg)`;
    body.querySelector('.tw-factor').textContent = `×${t.factor.toFixed(2)}`;
    body.querySelector('[data-nx=pop]').textContent = `${t.pop}/${t.beds}`;
    body.querySelector('[data-nx=jobs]').textContent = `${t.workers}/${t.jobs}`;
    body.querySelector('[data-nx=walking]').textContent = String(t.walking);
    body.querySelector('[data-nx=food]').textContent = daysText(t.foodDays);
    body.querySelector('[data-nx=water]').textContent = daysText(t.waterDays);
    for (const [k] of LAMPS) {
      const l = body.querySelector(`[data-lamp=${k}]`), v = t.lamps[k] || 0;
      l.classList.toggle('lit', v > 0);
      l.classList.toggle('bad', v >= 0.5);
      l.querySelector('small').textContent = v > 0 ? `${Math.round(v * 100)}%` : '';
      l.title = v > 0 ? `${Math.round(v * 100)}% of the people` : 'all right';
    }
    if (t.open !== open) { open = t.open; paintSwitch(); }
    body.querySelector('.tw-why').textContent = t.why ? `NO SETTLERS: ${t.why.toUpperCase()}` : t.walking ? `${t.walking} SETTLER${t.walking > 1 ? 'S' : ''} ON THE ROAD IN` : 'THE TOWN IS GROWING';
    el.dataset.morale = String(t.morale);
  }
  C.onEcon.push(draw);
  draw();
  return { el, draw, needleAngle };
}
