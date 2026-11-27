// The Look panel (world-tools round 2026-11-26): the preset cards, the Custom sliders and the effect switches with their
// phone cost. One copy, used by ☰ Settings → Graphics AND the map editor (lessons rule 31: the same control everywhere).
//
//   body.innerHTML = lookPanelHtml(setting, { quality })      setting = app.settings.look ({ id, custom })
//   bindLookPanel(body, { get, set, rerender })               set(nextSetting) saves + applies; rerender() redraws
import { esc } from './kit.js';
import { fmt } from '../../../../../shared/format.js';
import { LOOK_PRESETS, LOOK_IDS, LOOK_KNOBS, LOOK_EFFECTS, COST_WORDS, resolveLook, customFrom } from '../render/look-presets.js';

export function lookPanelHtml(setting = {}, { quality = 'medium' } = {}) {
  const L = resolveLook(setting);
  const low = quality === 'low';
  const cards = LOOK_IDS.map(id => {
    const P = LOOK_PRESETS[id], on = L.id === id;
    return `<button type="button" class="ow-set-choice ow-look-card${on ? ' ow-set-on' : ''}" data-look="${id}" ${on ? 'data-primary' : ''} aria-pressed="${on}"><b>${esc(P.name)}</b><small>${esc(P.blurb)}</small></button>`;
  }).join('');
  let custom = '';
  if (L.id === 'custom') {
    const knob = (k, K) => {
      const v = L[k] ?? 1;
      return `<label class="ow-set-row ow-set-slide"><span><b>${esc(K.label)}</b><small data-look-out="${k}">${fmt(Math.round(v * 100))}%</small></span><input type="range" class="ow-range" data-look-knob="${k}" min="${K.min}" max="${K.max}" step="${K.step}" value="${v}"></label>`;
    };
    custom = `<section class="ow-section"><h3>Colour and light</h3>${Object.entries(LOOK_KNOBS).map(([k, K]) => knob(k, K)).join('')}</section>`;
  }
  const effects = Object.entries(LOOK_EFFECTS).map(([k, E]) => {
    const v = L.fx[k] ?? (k === 'rays' || k === 'contact' ? (quality === 'high' ? 1 : 0) : 0);
    const off = low && !E.low;
    const edit = L.id === 'custom' && !off;
    return `<div class="ow-set-row ow-look-fx${off ? ' ow-look-off' : ''}"><span><b>${esc(E.label)}</b><small>${esc(E.help)}</small>
        <small class="ow-look-cost ow-look-cost-${E.cost}">${esc(off ? 'Off on Low graphics' : COST_WORDS[E.cost])}</small></span>
      ${edit ? `<input type="range" class="ow-range ow-look-fxr" data-look-fx="${k}" min="0" max="1" step="0.05" value="${v}" aria-label="${esc(E.label)}">`
        : `<span class="ow-look-val">${off ? 'Off' : v > 0 ? fmt(Math.round(v * 100)) + '%' : 'Off'}</span>`}</div>`;
  }).join('');
  return `<section class="ow-section"><h3>Look</h3><div class="ow-set-choices ow-look-cards">${cards}</div></section>${custom}
    <section class="ow-section"><h3>Effects${L.id === 'custom' ? '' : ` in ${esc(LOOK_PRESETS[L.id].name)}`}</h3>${effects}
    ${L.id !== 'custom' ? '<p class="ow-look-note">Pick Custom to change each one.</p>' : ''}</section>`;
}

export function bindLookPanel(body, { get, set, rerender }) {
  body.querySelectorAll('[data-look]').forEach(b => {
    b.onclick = () => {
      const cur = get() || {}, id = b.dataset.look;
      // Custom starts from the look you had, so moving one slider never jumps the whole picture
      const next = id === 'custom' ? { id, custom: cur.custom && cur.id === 'custom' ? cur.custom : customFrom(cur.id || 'classic') } : { ...cur, id };
      set(next); rerender();
    };
  });
  body.querySelectorAll('[data-look-knob]').forEach(i => {
    i.oninput = () => {
      const cur = get(), k = i.dataset.lookKnob; const c = { ...(cur.custom || customFrom('classic')) }; c[k] = +i.value;
      set({ id: 'custom', custom: c });
      const o = body.querySelector(`[data-look-out="${k}"]`); if (o) o.textContent = `${fmt(Math.round(+i.value * 100))}%`;
    };
  });
  body.querySelectorAll('[data-look-fx]').forEach(i => {
    i.oninput = () => { const cur = get(), k = i.dataset.lookFx; const c = { ...(cur.custom || customFrom('classic')) }; c.fx = { ...(c.fx || {}), [k]: +i.value }; set({ id: 'custom', custom: c }); };
  });
}

/**
 * A compact Look menu (the map editor's top bar, next to Quality): the five presets; Custom uses this device's saved
 * Custom sliders from the game's Settings. → { el, set(id), destroy() }
 */
export function mountLookPicker(slot, { get, set, className = 'ed-sel' } = {}) {
  if (!slot) return null;
  const cur = (get?.() || {}).id || 'classic';
  slot.innerHTML = `<label class="${className} ow-look-pick" data-tip="The Look: the same presets as the game's Settings → Graphics"><span>Look</span>
    <select data-look-pick>${LOOK_IDS.map(id => `<option value="${id}"${id === cur ? ' selected' : ''}>${esc(LOOK_PRESETS[id].name)}</option>`).join('')}</select></label>`;
  slot.hidden = false;
  const sel = slot.querySelector('select');
  const onChange = () => { const prev = get?.() || {}; set?.(sel.value === 'custom' ? { id: 'custom', custom: prev.custom || customFrom(prev.id || 'classic') } : { ...prev, id: sel.value }); };
  sel.addEventListener('change', onChange);
  return { el: slot, set(id) { sel.value = id; onChange(); }, destroy() { sel.removeEventListener('change', onChange); slot.innerHTML = ''; } };
}
