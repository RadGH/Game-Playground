// The weather picker for the map editor (world-tools round 2026-11-26: "The editor gets a weather picker to preview").
// A compact Weather menu that fits the editor's top bar (a select, like its Quality one — no new pills on a phone bar):
//   * "Server's weather"     draw whatever the world server says (the default)
//   * Preview: Clear … Fog   draw that weather here only (render/weather.js preview), rolling in over 3 s
//   * Dev world: hold …      ask the dev world server to hold that weather for everyone in the world (devWeather), or
//                            let it change again
//
//   const pick = mountWeatherPicker(slot, { weather, onForce })   slot = the editor's [data-slot="weather"] element
//      weather   the weather view (createWeatherView)            onForce(key | null)  send { t:'devWeather', key } / release
//   pick.value    'server' | 'p:<key>' | …      pick.set(value)    pick.destroy()
import { WEATHER_CHOICES } from '../world/weather.js';

export function mountWeatherPicker(slot, { weather = null, onForce = null, label = 'Weather', className = 'ed-sel' } = {}) {
  if (!slot) return null;
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  slot.innerHTML = `<label class="${className} ow-wx-pick" data-tip="Preview a weather here, or (dev world) hold one for everyone"><span>${label}</span>
    <select data-wx>
      ${opt('server', "Server's weather")}
      <optgroup label="Preview here">${WEATHER_CHOICES.map(c => opt('p:' + c.key, c.name)).join('')}${opt('p:strike', 'Lightning strike now')}</optgroup>
      ${onForce ? `<optgroup label="Dev world: everyone">${WEATHER_CHOICES.map(c => opt('w:' + c.key, 'Hold ' + c.name)).join('')}${opt('w:release', 'Let it change again')}</optgroup>` : ''}
    </select></label>`;
  slot.hidden = false;
  const sel = slot.querySelector('select');
  let value = 'server';
  function set(v) {
    if (v === 'p:strike') { weather?.strike(); sel.value = value; return; }
    if (v.startsWith('w:')) {
      const key = v.slice(2);
      onForce?.(key === 'release' ? null : key);
      weather?.preview(null);                 // show the server's (which is now the held one)
      value = 'server'; sel.value = value; return;
    }
    value = v; sel.value = v;
    weather?.preview(v === 'server' ? null : v.slice(2));
  }
  const onChange = () => set(sel.value);
  sel.addEventListener('change', onChange);
  return {
    el: slot, set,
    get value() { return value; },
    destroy() { sel.removeEventListener('change', onChange); slot.innerHTML = ''; slot.hidden = true; },
  };
}
