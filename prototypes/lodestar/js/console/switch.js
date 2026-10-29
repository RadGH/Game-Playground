// Toggle switches. A bank is a row of bat-handle switches with paper labels where only one can be up: raising one
// drops the others with a mechanical slap. Pressing the switch that is up drops it (no tool = look / pan).
// A switch with `locked` wears a red safety cap: pressing it says why instead of moving.
//
//   const bank = createSwitchBank({ items: [{ id, label, key, locked }], value: null, onChange: (id, how) => ... , onLocked })
//   bank.set('wall'); bank.value

/** Pure: the bank's next value when switch `id` is pressed. */
export function pressSwitch(current, id, items) {
  const it = items.find(i => i.id === id);
  if (!it || it.locked) return current;
  return current === id ? null : id;
}

export function createSwitchBank({ items, value = null, onChange = () => {}, onLocked = () => {}, sound = () => {}, name = 'TOOL BANK' }) {
  let cur = value;
  const el = document.createElement('div');
  el.className = 'switchbank';
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', name);
  const btns = new Map();
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toggle'; b.dataset.tool = it.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="toggle-plate"><span class="toggle-nut"></span><span class="toggle-bat"></span><span class="toggle-cap"></span></span>` +
      `<span class="toggle-label">${it.label}</span>${it.key ? `<span class="toggle-key">${it.key}</span>` : ''}`;
    b.addEventListener('click', () => press(it.id, 'tap'));
    el.append(b); btns.set(it.id, b);
  }
  function paint() {
    for (const it of items) {
      const b = btns.get(it.id);
      b.classList.toggle('up', cur === it.id);
      b.classList.toggle('locked', !!it.locked);
      b.setAttribute('aria-pressed', String(cur === it.id));
    }
    el.dataset.value = cur || '';
  }
  function press(id, how = 'code') {
    const it = items.find(i => i.id === id);
    if (!it) return;
    if (it.locked) { sound('locked'); onLocked(it); btns.get(id).classList.add('rattle'); setTimeout(() => btns.get(id)?.classList.remove('rattle'), 260); return; }
    const was = cur;
    cur = pressSwitch(cur, id, items);
    sound(cur ? 'slap' : 'slapdown', { dropped: was && was !== cur ? 1 : 0 });
    paint(); onChange(cur, how);
  }
  paint();
  return {
    el, get value() { return cur; },
    set(id, how) { if (id === cur) return; if (id == null) { if (cur) press(cur, how); return; } press(id, how); },
    press, unlock(id) { const it = items.find(i => i.id === id); if (it) { it.locked = false; paint(); } },
  };
}
