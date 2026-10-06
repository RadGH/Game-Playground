// Play-test 2 Q20 (a Barber who changes your appearance) and Q21 ("Customize Appearance" on the title screen): one
// character editor. People (title only — a barber cuts hair, he does not change your people), skin, height, build, head
// size, roundness, and every face part with its colour, over the avatar-2d part catalog that Chibi 2 draws
// (appearance-core.js FACE_SLOTS). Every change shows at once on the 3D figure (the title preview, or you in the world
// at the barber's chair); Save keeps it, Cancel puts the old face back.
//
//   const ed = createAppearanceEditor({ parent, races, raceNames, onChange(look), onSave(look), onCancel(look) });
//   ed.open({ look, avatar, mode: 'title'|'barber', price })    // avatar = the Chibi 2 avatar you look like now

import { h, createPanel } from '../ui-panel.js';
import { FACE_SLOTS, BODY_DIALS, PALETTES, cleanCustom, customFrom, lookWith, lookCustom } from './appearance-core.js';

const PRETTY = id => String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createAppearanceEditor({ parent = null, races = [], raceNames = {}, onChange, onSave, onCancel, avatarFor }) {
  const E = { look: null, custom: null, start: null, mode: 'title', price: 0, saved: false };
  const panel = createPanel({ id: 'appearance', title: 'Appearance', width: 380, cls: 'appearance-panel', parent,
    onClose: () => { if (!E.saved && E.start) onCancel?.(E.start); E.saved = false; } });

  async function open({ look, avatar = null, mode = 'title', price = 0 } = {}) {
    E.mode = mode; E.price = price; E.saved = false;
    panel.root.classList.toggle('title-mode', mode === 'title');      // on the title it stands over the form, clear of the figure
    E.start = JSON.parse(JSON.stringify(look || { race: 'human', seed: 1 }));
    E.look = JSON.parse(JSON.stringify(E.start));
    const av = avatar || (avatarFor ? await avatarFor({ ...E.look, gear: undefined }) : null);
    E.custom = cleanCustom(lookCustom(E.look)) || customFrom(av) || {};
    E.custom.body ||= {};
    draw();
    panel.open();
  }
  const current = () => lookWith(E.look, E.custom);
  function changed() { E.look = current(); onChange?.(E.look); }
  function setSlot(slot, id) { if (slot === 'headShape') E.custom.headShape = id; else E.custom[slot] = { ...(E.custom[slot] || {}), id }; changed(); draw(); }
  function setColor(slot, color) { if (slot === 'skin') E.custom.body = { ...(E.custom.body || {}), skin: color }; else E.custom[slot] = { ...(E.custom[slot] || { id: FACE_SLOTS.find(s => s.slot === slot).ids[0] }), color }; changed(); draw(); }
  function setDial(k, v) { E.custom.body = { ...(E.custom.body || {}), [k]: v }; changed(); }

  function draw() {
    const rows = [];
    if (E.mode === 'title' && races.length) {
      rows.push(h('div.ap-row', {}, h('span.ap-label', {}, 'People'), h('div.chips', { role: 'radiogroup' }, ...races.map(r =>
        h('button.chip', { type: 'button', role: 'radio', 'aria-checked': String(E.look.race === r), dataset: { race: r }, onclick: async () => {
          E.look.race = r;
          // a new people starts from that people's own face and build (then your choices on top)
          const av = avatarFor ? await avatarFor({ race: r, seed: E.look.seed }) : null;
          E.custom = customFrom(av) || {}; changed(); draw();
        } }, raceNames[r] || r)))));
    }
    rows.push(swatches('Skin', 'skin', PALETTES.skin, E.custom.body?.skin));
    for (const d of BODY_DIALS) {
      const v = E.custom.body?.[d.key] ?? (d.min + d.max) / 2;
      rows.push(h('label.ap-row.dial', {}, h('span.ap-label', {}, d.label), h('input', { type: 'range', min: d.min, max: d.max, step: 0.01, value: String(v), dataset: { dial: d.key }, onchange: e => setDial(d.key, +e.target.value) })));
    }
    for (const s of FACE_SLOTS) {
      const cur = s.slot === 'headShape' ? E.custom.headShape : E.custom[s.slot]?.id;
      const idx = Math.max(0, s.ids.indexOf(cur));
      const step = k => setSlot(s.slot, s.ids[(idx + k + s.ids.length) % s.ids.length]);
      rows.push(h('div.ap-row.part', { dataset: { slot: s.slot } }, h('span.ap-label', {}, s.label),
        h('button.ghost.small.ap-step', { type: 'button', 'aria-label': `Previous ${s.label}`, onclick: () => step(-1) }, '‹'),
        h('select', { 'aria-label': s.label, onchange: e => setSlot(s.slot, e.target.value) }, ...s.ids.map(id => h('option', { value: id, selected: id === cur }, PRETTY(id)))),
        h('button.ghost.small.ap-step', { type: 'button', 'aria-label': `Next ${s.label}`, onclick: () => step(1) }, '›')));
      if (s.color && !(s.slot === 'facialHair' && (cur || 'none') === 'none') && !(s.slot === 'hair' && cur === 'bald')) rows.push(swatches(`${s.label} colour`, s.slot, PALETTES[s.color], E.custom[s.slot]?.color));
    }
    const cost = E.mode === 'barber' && E.price ? ` (${E.price} gold)` : '';
    panel.setTitle(E.mode === 'barber' ? 'The Barber' : 'Customize Appearance', E.mode === 'barber' ? 'A new look, if you can sit still' : 'Overrides your calling\'s default face');
    panel.fill(h('div.ap-body', {}, ...rows),
      h('div.row.ap-foot', {},
        h('button.ghost.small', { type: 'button', title: 'A new random face for your people', onclick: async () => { E.look.seed = (Math.random() * 1e9) >>> 0; const av = avatarFor ? await avatarFor({ race: E.look.race, seed: E.look.seed }) : null; E.custom = customFrom(av) || {}; changed(); draw(); } }, 'Random'),
        h('button.ghost.small', { type: 'button', title: 'Back to how you looked when you opened this', onclick: async () => { E.look = JSON.parse(JSON.stringify(E.start)); const av = avatarFor ? await avatarFor({ ...E.look }) : null; E.custom = cleanCustom(lookCustom(E.look)) || customFrom(av) || {}; changed(); draw(); } }, 'Undo all'),
        h('span.grow'),
        h('button.ghost.small', { type: 'button', onclick: () => panel.close() }, 'Cancel'),
        h('button.primary.small', { type: 'button', dataset: { act: 'save' }, onclick: () => { E.saved = true; const look = current(); panel.close(); onSave?.(look, E.mode); } }, `Save${cost}`)));
  }
  function swatches(label, slot, list, cur) {
    return h('div.ap-row.sw', { dataset: { swatch: slot } }, h('span.ap-label', {}, label), h('div.ap-swatches', {}, ...list.map(c =>
      h('button.ap-sw', { type: 'button', 'aria-label': `${label} ${c}`, 'aria-pressed': String((cur || '').toLowerCase() === c), style: `background:${c}`, onclick: () => setColor(slot, c) }))));
  }
  return { open, panel, get look() { return E.look ? current() : null; }, get isOpen() { return panel.isOpen; } };
}
