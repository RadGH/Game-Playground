// Round 11 (owner feedback 2026-10-15) — interface pieces that need the DOM. The pure rules are in pt11-core.js.
//
//   #29  a Mount button on the action bar, where the fishing (x) button was (fishing is "E at a fishing spot" now —
//        stream P). One click / tap calls your mount (the one in the Mount slot), again gets down; while the call runs
//        the ring fills and a click calls it off. Keyboard H, controller LT + X (the key cap follows the device).
//
//   const ui11 = createUi11({ net, hud, me, mount, inWorld })   ui11.wire(net)   ui11.tick()
import { h } from '../ui-panel.js';
import { uiIconSvg } from '../../../../../icons/js/game-icons.js';
import { slotMount, speedText } from './pt11-core.js';

export function createUi11({ net, hud, me, mount, mounted = () => false, calling = () => null }) {
  const S = { mounts: [], pick: null };
  // ---- #29: the Mount button
  const btn = h('button.slot.mount-btn', { type: 'button', 'aria-label': 'Call your mount', dataset: { tip: 'Call your mount (H)' } },
    h('kbd.key', { dataset: { action: 'mount' } }, 'H'), h('span.mount-glyph', { 'aria-hidden': 'true' }), h('small.mount-cap', {}, 'Mount'), h('i.mount-prog', { 'aria-hidden': 'true' }));
  btn.querySelector('.mount-glyph').innerHTML = uiIconSvg('mount', 30, { medallion: true }) || '♞';
  btn.addEventListener('click', () => {
    if (!S.mounts.length) { hud.toast('You have no mount yet. A stablehand sells them — the Trail Horse is cheap.', 'warn'); return; }
    mount();
  });
  const bar = document.getElementById('actionbar');
  // where the fishing button used to sit: after the skills, before the potion keys' group
  const group = bar?.querySelector('.hb-group');
  if (bar) { if (group) bar.insertBefore(btn, group); else bar.append(btn); }

  let last = '';
  function paint() {
    const riding = mounted(), call = calling();
    const cur = slotMount(S.mounts, S.pick);
    const text = !S.mounts.length ? 'Mount' : riding ? 'Get down' : call ? 'Calling…' : 'Mount';
    const tip = !S.mounts.length ? 'No mount yet — a stablehand sells them (the Trail Horse is cheap).'
      : riding ? 'Get down from your mount (H).' : call ? 'Calling your mount — press again to call it off.'
      : `Call ${cur ? cur.name : 'your mount'} (H) — ${cur ? speedText(cur.speed) : ''}. Change which one in the Mount slot of your bag.`;
    const key = text + '|' + tip;
    if (key !== last) {
      last = key;
      btn.querySelector('.mount-cap').textContent = text;
      btn.dataset.tip = tip; btn.setAttribute('aria-label', text === 'Mount' ? 'Call your mount' : text);
      btn.classList.toggle('on', riding); btn.classList.toggle('calling', !!call && !riding); btn.classList.toggle('none', !S.mounts.length);
    }
    if (call && !riding) btn.style.setProperty('--p', Math.max(0, Math.min(1, (performance.now() - call.at) / Math.max(1, (call.until || call.at + 1500) - call.at))).toFixed(3));
  }
  function wire(n) {
    n.on('joined', j => { S.mounts = j.you?.mounts || []; S.pick = j.you?.mountPick || null; last = ''; paint(); });
    n.on('you', p => { if (p.mounts) S.mounts = p.mounts; if ('mountPick' in p) S.pick = p.mountPick || null; if (p.mounts || 'mountPick' in p || 'mount' in p) { last = ''; paint(); } });
  }
  function tick() { paint(); }
  return { wire, tick, btn, get state() { return { mounts: S.mounts.map(m => m.id), pick: S.pick, label: btn.querySelector('.mount-cap').textContent, hidden: btn.hidden }; } };
}
