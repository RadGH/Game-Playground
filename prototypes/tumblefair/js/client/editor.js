// "Change look": the same choices Thousandvale's character creator offers (its appearance tables are imported, not
// copied) in a sheet that leaves the 3D character visible above it. Every change is sent at once, so the character
// on screen IS the preview — and so is what the other players see in the lobby.
import { FACE_SLOTS, BODY_DIALS, PALETTES, customFrom, lookWith } from '../../../thousandvale/js/client/ui/appearance-core.js';
import { avatarOf } from './avatars.js';
import { h } from './gamehud.js';

export function createEditor({ look, races, raceNames, onChange, onClose }) {
  const el = h('div', 'modal editor');
  let cur = { race: look.race, seed: look.seed, v: 1, ...(look.custom ? { custom: look.custom } : {}) };
  let custom = customFrom(avatarOf(cur)) || { body: {} };
  let timer = null;
  const push = () => { clearTimeout(timer); timer = setTimeout(() => onChange(cur), 120); };
  const commit = () => { cur = lookWith(cur, custom); push(); draw(); };
  const sw = (list, val, key) => list.map(c => `<button class="sw${String(val).toLowerCase() === c ? ' on' : ''}" style="background:${c}" data-color="${key}" data-c="${c}" aria-label="${c}"></button>`).join('');
  function draw() {
    el.innerHTML = `<div class="panel sheet">
      <div class="row head"><h2>Your look</h2><button class="btn small" data-reroll="1">Surprise me</button><button class="btn small primary" data-close="1">Done</button></div>
      <div class="row races">${races.map(r => `<button class="pill${cur.race === r ? ' on' : ''}" data-race="${r}">${raceNames[r]}</button>`).join('')}</div>
      <div class="ed-grid">
        ${FACE_SLOTS.map(s => { const v = s.slot === 'headShape' ? custom.headShape : custom[s.slot]?.id; return `<div class="ed-row"><span>${s.label}</span><button class="step" data-slot="${s.slot}" data-d="-1">‹</button><b>${String(v || s.ids[0]).replace(/_/g, ' ')}</b><button class="step" data-slot="${s.slot}" data-d="1">›</button>${s.color ? `<div class="sws">${sw(PALETTES[s.color], custom[s.slot]?.color || '', s.slot)}</div>` : ''}</div>`; }).join('')}
        <div class="ed-row"><span>Skin</span><div class="sws">${sw(PALETTES.skin, custom.body?.skin || '', 'skin')}</div></div>
        ${BODY_DIALS.map(d => `<label class="ed-row"><span>${d.label}</span><input type="range" min="${d.min}" max="${d.max}" step="0.01" value="${custom.body?.[d.key] ?? (d.min + d.max) / 2}" data-dial="${d.key}"></label>`).join('')}
      </div></div>`;
  }
  el.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-close]') || t === el) return onClose();
    if (t.closest('[data-reroll]')) { cur = { race: cur.race, seed: (Math.random() * 2 ** 31) >>> 0, v: 1 }; custom = customFrom(avatarOf(cur)) || { body: {} }; push(); return draw(); }
    const race = t.closest('[data-race]');
    if (race) { cur = { race: race.dataset.race, seed: cur.seed, v: 1 }; custom = customFrom(avatarOf(cur)) || { body: {} }; push(); return draw(); }
    const step = t.closest('[data-slot]');
    if (step) {
      const s = FACE_SLOTS.find(x => x.slot === step.dataset.slot), now = s.slot === 'headShape' ? custom.headShape : custom[s.slot]?.id;
      const id = s.ids[(s.ids.indexOf(now) + +step.dataset.d + s.ids.length) % s.ids.length];
      if (s.slot === 'headShape') custom.headShape = id; else custom[s.slot] = { ...(custom[s.slot] || {}), id };
      return commit();
    }
    const col = t.closest('[data-color]');
    if (col) { const k = col.dataset.color; if (k === 'skin') custom.body = { ...custom.body, skin: col.dataset.c }; else custom[k] = { ...(custom[k] || { id: FACE_SLOTS.find(x => x.slot === k).ids[0] }), color: col.dataset.c }; return commit(); }
  });
  el.addEventListener('input', e => { const d = e.target.dataset.dial; if (!d) return; custom.body = { ...custom.body, [d]: +e.target.value }; cur = lookWith(cur, custom); push(); });
  draw();
  return { el, refresh() {} };
}
