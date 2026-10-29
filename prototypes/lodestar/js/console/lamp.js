// Jewel lamps: a glass dome in a bezel with a stencilled plate. States: off, on, blink. A lamp is a button —
// pressing a lit lamp jumps the scope to whatever lit it (when the event gave a place).
//   const l = createLamp({ id: 'fire', label: 'FIRE', colour: 'amber', onPress }); l.set('blink', { x, y }); l.state
export function createLamp({ id, label, colour = 'amber', onPress = () => {}, small = false }) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = `lamp lamp-${colour}${small ? ' lamp-small' : ''}`; el.dataset.lamp = id;
  el.innerHTML = `<span class="lamp-bezel"><span class="lamp-jewel"></span></span><span class="lamp-label">${label}</span>`;
  el.setAttribute('aria-label', `${label} lamp`);
  let state = 'off', where = null;
  el.addEventListener('click', () => onPress(id, state, where));
  const lamp = {
    el, id, get state() { return state; }, get where() { return where; },
    set(s, at = null) { state = s; if (at) where = at; if (s === 'off') where = null; el.dataset.state = s; el.setAttribute('aria-label', `${label} lamp ${s}`); },
  };
  lamp.set('off');
  return lamp;
}
