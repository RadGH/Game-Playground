// "Change look": the same choices Thousandvale's character creator offers (its appearance tables are imported, not
// copied) in a side panel (a bottom sheet on a phone held upright) while the camera frames your own character close up
// in the space that is left (round 6: the old sheet scrolled up over the character). Quick looks = look-tidy.js PRESETS. Every change is sent at once, so the character
// on screen IS the preview — and so is what the other players see in the lobby.
// Chibi 2.5 (2026-10-21): every slot's 2.5 ids, the per-part extras (`fields`: pupils, iris, odd eyes, brow thickness,
// ear size, a second hair colour) and the body picks (body type, posture), exactly as Thousandvale's editor offers them.
import { FACE_SLOTS, BODY_DIALS, BODY_PICKS, PALETTES, PART_NAMES, slotIds, customFrom, lookWith } from '../../../thousandvale/js/client/ui/appearance-core.js';
import { avatarOf, portrait } from './avatars.js';
import { PRESETS } from './look-tidy.js';
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
  // ‹ › still step one at a time, and the name between them is a pick-list straight to any one (report #15, 2026-10-23)
  const stepper = (attrs, label, ids, now, name) => `<button class="step" ${attrs} data-d="-1" aria-label="previous">‹</button>${ids?.length > 1
    ? `<select class="step-pick" ${attrs} aria-label="choose">${ids.map(id => `<option value="${String(id).replace(/"/g, '&quot;')}"${String(id) === String(now) ? ' selected' : ''}>${name(id)}</option>`).join('')}</select>`
    : `<b>${label}</b>`}<button class="step" ${attrs} data-d="1" aria-label="next">›</button>`;
  const fromStr = (ids, v) => ids.find(id => String(id) === v);
  function fieldRows(s) {
    const part = custom[s.slot] || {};
    return (s.fields || []).filter(f => !f.when || f.when.includes(part.id)).map(f => {
      const at = `data-slot="${s.slot}" data-field="${f.key}"`;
      if (f.type === 'pick') { const fname = id => f.names?.[id] || nice('', id); return `<div class="ed-row sub"><span>${f.label}</span>${stepper(at, fname(part[f.key] ?? f.ids[0]), f.ids, part[f.key] ?? f.ids[0], fname)}</div>`; }
      if (f.type === 'range') return `<label class="ed-row sub"><span>${f.label}</span><input type="range" min="${f.min}" max="${f.max}" step="0.01" value="${part[f.key] ?? f.def ?? 1}" ${at}></label>`;
      if (f.type === 'color') return `<div class="ed-row sub"><span>${f.label}</span><div class="sws">${f.clear ? `<button class="sw clear${part[f.key] ? '' : ' on'}" data-color="${s.slot}" data-field="${f.key}" data-c="">${f.clear}</button>` : ''}${PALETTES[f.palette].map(c => `<button class="sw${String(part[f.key] || '').toLowerCase() === c ? ' on' : ''}" style="background:${c}" data-color="${s.slot}" data-field="${f.key}" data-c="${c}" aria-label="${c}"></button>`).join('')}</div></div>`;
      return '';
    }).join('');
  }
  function draw() {
    el.innerHTML = `<div class="panel sheet">
      <div class="row head"><h2>Your look</h2><button class="btn small" data-reroll="1">Surprise me</button><button class="btn small primary" data-close="1">Done</button></div>
      <div class="row races">${races.map(r => `<button class="pill${cur.race === r ? ' on' : ''}" data-race="${r}">${raceNames[r]}</button>`).join('')}</div>
      <h3 class="ed-h">Quick looks</h3>
      <div class="presets">${PRESETS.map(p => `<button class="preset" data-preset="${p.id}"><img src="${portrait({ look: lookWith(cur, { body: custom.body, headShape: custom.headShape, ...p.custom }), costume: 'cos_none' })}" alt=""><b>${p.name}</b></button>`).join('')}</div>
      <h3 class="ed-h">Fine tune</h3>
      <div class="ed-grid">
        ${FACE_SLOTS.map(s => { const ids = slotIds(s, cur.race), v = s.slot === 'headShape' ? custom.headShape : custom[s.slot]?.id; return `<div class="ed-row"><span>${s.label}</span>${stepper(`data-slot="${s.slot}"`, nice(s.slot, v || ids[0]), ids, v || ids[0], id => nice(s.slot, id))}${s.color ? `<div class="sws">${sw(PALETTES[s.color], custom[s.slot]?.color || '', s.slot)}</div>` : ''}</div>${fieldRows(s)}`; }).join('')}
        <div class="ed-row"><span>Skin</span><div class="sws">${sw(PALETTES.skin, custom.body?.skin || '', 'skin')}</div></div>
        ${BODY_PICKS.map(p => `<div class="ed-row"><span>${p.label}</span>${stepper(`data-pick="${p.key}"`, p.names?.[custom.body?.[p.key] ?? p.ids[0]] || nice('', custom.body?.[p.key] ?? p.ids[0]), p.ids, custom.body?.[p.key] ?? p.ids[0], id => p.names?.[id] || nice('', id))}</div>`).join('')}
        ${BODY_DIALS.map(d => `<label class="ed-row"><span>${d.label}</span><input type="range" min="${d.min}" max="${d.max}" step="0.01" value="${custom.body?.[d.key] ?? (d.min + d.max) / 2}" data-dial="${d.key}"></label>`).join('')}
      </div></div>`;
  }
  el.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-close]') || t === el) return onClose();
    if (t.closest('[data-reroll]')) { cur = { race: cur.race, seed: (Math.random() * 2 ** 31) >>> 0, v: 1 }; custom = customFrom(avatarOf(cur)) || { body: {} }; push(); return draw(); }
    const pre = t.closest('[data-preset]');
    if (pre) { const p = PRESETS.find(x => x.id === pre.dataset.preset); custom = { ...custom, ...JSON.parse(JSON.stringify(p.custom)) }; return commit(); }
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
  el.addEventListener('change', e => {
    const sel = e.target.closest('select.step-pick'); if (!sel) return;
    const v = sel.value;
    if (sel.dataset.pick) { const p = BODY_PICKS.find(x => x.key === sel.dataset.pick), id = fromStr(p.ids, v); if (id === undefined) return; custom.body = { ...custom.body, [p.key]: id }; return commit(); }
    const s = FACE_SLOTS.find(x => x.slot === sel.dataset.slot); if (!s) return;
    const f = sel.dataset.field;
    if (f) { const fd = s.fields.find(x => x.key === f), id = fromStr(fd.ids, v); if (id === undefined) return; custom[s.slot] = { ...(custom[s.slot] || { id: s.ids[0] }), [f]: id }; return commit(); }
    const id = fromStr(slotIds(s, cur.race), v); if (id === undefined) return;
    if (s.slot === 'headShape') custom.headShape = id; else custom[s.slot] = { ...(custom[s.slot] || {}), id };
    commit();
  });
  el.addEventListener('input', e => {
    if (e.target.tagName === 'SELECT') return;
    const d = e.target.dataset.dial, slot = e.target.dataset.slot, f = e.target.dataset.field;
    if (d) custom.body = { ...custom.body, [d]: +e.target.value };
    else if (slot && f) custom[slot] = { ...(custom[slot] || { id: FACE_SLOTS.find(x => x.slot === slot).ids[0] }), [f]: +e.target.value };
    else return;
    cur = lookWith(cur, custom); push();
  });
  draw();
  return { el, refresh() {} };
}
