// "Change look": the same choices Thousandvale's character creator offers (its appearance tables are imported, not
// copied) in a sheet that leaves the 3D character visible above it. Every change is sent at once, so the character
// on screen IS the preview — and so is what the other players see in the lobby.
// Chibi 2.5 (2026-10-21): every slot's 2.5 ids, the per-part extras (`fields`: pupils, iris, odd eyes, brow thickness,
// ear size, a second hair colour) and the body picks (body type, posture), exactly as Thousandvale's editor offers them.
import { FACE_SLOTS, BODY_DIALS, BODY_PICKS, PALETTES, PART_NAMES, slotIds, customFrom, lookWith } from '../../../thousandvale/js/client/ui/appearance-core.js';
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
  const nice = (slot, id) => PART_NAMES[slot]?.[id] || String(id || '').replace(/_/g, ' ');
  const stepper = (attrs, label) => `<button class="step" ${attrs} data-d="-1" aria-label="previous">‹</button><b>${label}</b><button class="step" ${attrs} data-d="1" aria-label="next">›</button>`;
  function fieldRows(s) {
    const part = custom[s.slot] || {};
    return (s.fields || []).filter(f => !f.when || f.when.includes(part.id)).map(f => {
      const at = `data-slot="${s.slot}" data-field="${f.key}"`;
      if (f.type === 'pick') return `<div class="ed-row sub"><span>${f.label}</span>${stepper(at, f.names?.[part[f.key] ?? f.ids[0]] || nice('', part[f.key] ?? f.ids[0]))}</div>`;
      if (f.type === 'range') return `<label class="ed-row sub"><span>${f.label}</span><input type="range" min="${f.min}" max="${f.max}" step="0.01" value="${part[f.key] ?? f.def ?? 1}" ${at}></label>`;
      if (f.type === 'color') return `<div class="ed-row sub"><span>${f.label}</span><div class="sws">${f.clear ? `<button class="sw clear${part[f.key] ? '' : ' on'}" data-color="${s.slot}" data-field="${f.key}" data-c="">${f.clear}</button>` : ''}${PALETTES[f.palette].map(c => `<button class="sw${String(part[f.key] || '').toLowerCase() === c ? ' on' : ''}" style="background:${c}" data-color="${s.slot}" data-field="${f.key}" data-c="${c}" aria-label="${c}"></button>`).join('')}</div></div>`;
      return '';
    }).join('');
  }
  function draw() {
    el.innerHTML = `<div class="panel sheet">
      <div class="row head"><h2>Your look</h2><button class="btn small" data-reroll="1">Surprise me</button><button class="btn small primary" data-close="1">Done</button></div>
      <div class="row races">${races.map(r => `<button class="pill${cur.race === r ? ' on' : ''}" data-race="${r}">${raceNames[r]}</button>`).join('')}</div>
      <div class="ed-grid">
        ${FACE_SLOTS.map(s => { const ids = slotIds(s, cur.race), v = s.slot === 'headShape' ? custom.headShape : custom[s.slot]?.id; return `<div class="ed-row"><span>${s.label}</span>${stepper(`data-slot="${s.slot}"`, nice(s.slot, v || ids[0]))}${s.color ? `<div class="sws">${sw(PALETTES[s.color], custom[s.slot]?.color || '', s.slot)}</div>` : ''}</div>${fieldRows(s)}`; }).join('')}
        <div class="ed-row"><span>Skin</span><div class="sws">${sw(PALETTES.skin, custom.body?.skin || '', 'skin')}</div></div>
        ${BODY_PICKS.map(p => `<div class="ed-row"><span>${p.label}</span>${stepper(`data-pick="${p.key}"`, p.names?.[custom.body?.[p.key] ?? p.ids[0]] || nice('', custom.body?.[p.key] ?? p.ids[0]))}</div>`).join('')}
        ${BODY_DIALS.map(d => `<label class="ed-row"><span>${d.label}</span><input type="range" min="${d.min}" max="${d.max}" step="0.01" value="${custom.body?.[d.key] ?? (d.min + d.max) / 2}" data-dial="${d.key}"></label>`).join('')}
      </div></div>`;
  }
  el.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-close]') || t === el) return onClose();
    if (t.closest('[data-reroll]')) { cur = { race: cur.race, seed: (Math.random() * 2 ** 31) >>> 0, v: 1 }; custom = customFrom(avatarOf(cur)) || { body: {} }; push(); return draw(); }
    const race = t.closest('[data-race]');
    if (race) { cur = { race: race.dataset.race, seed: cur.seed, v: 1 }; custom = customFrom(avatarOf(cur)) || { body: {} }; push(); return draw(); }
    const pick = t.closest('[data-pick]');
    if (pick) { const p = BODY_PICKS.find(x => x.key === pick.dataset.pick), now = custom.body?.[p.key] ?? p.ids[0]; custom.body = { ...custom.body, [p.key]: p.ids[(p.ids.indexOf(now) + +pick.dataset.d + p.ids.length) % p.ids.length] }; return commit(); }
    const col = t.closest('[data-color]');
    if (col) {
      const k = col.dataset.color, f = col.dataset.field;
      if (k === 'skin') custom.body = { ...custom.body, skin: col.dataset.c };
      else { const part = { ...(custom[k] || { id: FACE_SLOTS.find(x => x.slot === k).ids[0] }) }; if (f) { if (col.dataset.c) part[f] = col.dataset.c; else delete part[f]; } else part.color = col.dataset.c; custom[k] = part; }
      return commit();
    }
    const step = t.closest('.step[data-slot]');
    if (step) {
      const s = FACE_SLOTS.find(x => x.slot === step.dataset.slot), f = step.dataset.field;
      if (f) { const fd = s.fields.find(x => x.key === f), part = { ...(custom[s.slot] || { id: s.ids[0] }) }, now = part[f] ?? fd.ids[0]; part[f] = fd.ids[(fd.ids.indexOf(now) + +step.dataset.d + fd.ids.length) % fd.ids.length]; custom[s.slot] = part; return commit(); }
      const ids = slotIds(s, cur.race), now = s.slot === 'headShape' ? custom.headShape : custom[s.slot]?.id;
      const id = ids[(ids.indexOf(now) + +step.dataset.d + ids.length) % ids.length];
      if (s.slot === 'headShape') custom.headShape = id; else custom[s.slot] = { ...(custom[s.slot] || {}), id };
      return commit();
    }
  });
  el.addEventListener('input', e => {
    const d = e.target.dataset.dial, slot = e.target.dataset.slot, f = e.target.dataset.field;
    if (d) custom.body = { ...custom.body, [d]: +e.target.value };
    else if (slot && f) custom[slot] = { ...(custom[slot] || { id: FACE_SLOTS.find(x => x.slot === slot).ids[0] }), [f]: +e.target.value };
    else return;
    cur = lookWith(cur, custom); push();
  });
  draw();
  return { el, refresh() {} };
}
