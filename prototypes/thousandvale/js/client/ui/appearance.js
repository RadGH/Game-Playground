// Play-test 2 Q20 (a Barber who changes your appearance) and Q21 ("Customize Appearance" on the title screen): one
// character editor. People (title only — a barber cuts hair, he does not change your people), skin, height, build, head
// size, roundness, and every face part with its colour, over the avatar-2d part catalog that Chibi 2 draws
// (appearance-core.js FACE_SLOTS). Every change shows at once on the 3D figure (the title preview, or you in the world
// at the barber's chair); Save keeps it, Cancel puts the old face back.
//
//   const ed = createAppearanceEditor({ parent, races, raceNames, onChange(look), onSave(look), onCancel(look) });
//   ed.open({ look, avatar, mode: 'title'|'barber', price })    // avatar = the Chibi 2 avatar you look like now

import { h, createPanel } from '../ui-panel.js';
import { FACE_SLOTS, BODY_DIALS, PALETTES, cleanCustom, customFrom, lookWith, lookCustom, diffCustom, mergeCustom, barberCost, freshCustom } from './appearance-core.js';
import { barberSaveText, barberFree } from './pt9-core.js';

const PRETTY = id => String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createAppearanceEditor({ parent = null, races = [], raceNames = {}, onChange, onSave, onCancel, avatarFor }) {
  const E = { look: null, custom: null, start: null, mode: 'title', price: 0, saved: false, base: null, stored: null, bill: null };
  const panel = createPanel({ id: 'appearance', title: 'Appearance', width: 380, cls: 'appearance-panel', parent,
    onClose: () => { if (!E.saved && E.start) { onCancel?.(E.start); E.onDismiss?.(); } E.saved = false; } });

  async function open({ look, avatar = null, mode = 'title', price = 0, bill = null, saveLabel = null, gearToggle = null, onDismiss = null } = {}) {
    E.saveLabel = saveLabel; E.gearToggle = gearToggle; E.onDismiss = onDismiss;   // R1: the new-character flow's step 2
    E.mode = mode; E.price = price; E.saved = false; E.bill = bill;   // bill = { prices, perLevel, level, free } (the barber's list)
    panel.root.classList.toggle('title-mode', mode === 'title');      // on the title it stands over the form, clear of the figure
    E.start = JSON.parse(JSON.stringify(look || { race: 'human', seed: 1 }));
    E.look = JSON.parse(JSON.stringify(E.start));
    const av = avatar || (avatarFor ? await avatarFor({ ...E.look, gear: undefined }) : null);
    E.stored = cleanCustom(lookCustom(E.look)) || {};
    E.custom = { ...(customFrom(av) || {}), ...E.stored };
    E.custom.body = { ...(customFrom(av)?.body || {}), ...(E.stored.body || {}) };
    const fresh = E.mode === 'title' && !lookCustom(E.look);
    if (fresh) E.custom = freshCustom(E.custom);   // a new character starts with no accessory (lead: the grey visor)
    E.base = JSON.parse(JSON.stringify(E.custom));           // what you looked like when you sat down: the bill is the difference
    draw();
    panel.open();
    if (fresh) changed();                           // the figure drops the rolled accessory at once
  }
  /** The look to send. At the barber only what you CHANGED goes over your stored look (he charges per part changed). */
  const current = () => (E.mode === 'barber' ? lookWith(E.look, mergeCustom(E.stored, diffCustom(E.base, E.custom))) : lookWith(E.look, E.custom));
  function cost() {
    if (E.mode !== 'barber') return 0;
    if (!E.bill) return E.price || 0;
    const after = lookCustom(current()) || {};
    return barberCost(E.stored, after, { ...E.bill, raceChanged: E.look.race !== E.start.race, seedChanged: E.look.seed !== E.start.seed });
  }
  function paintCost() {
    const b = panel.root.querySelector('[data-act="save"]'); if (!b || E.mode !== 'barber') return;
    const c = cost();
    b.textContent = barberSaveText(c, E.bill);      // play-test 9 (X4): "Save (Free)" / "Save (N gold)" — the long label scrolled the window sideways
    const note = panel.root.querySelector('.ap-bill'); if (note) note.textContent = billText();
  }
  function billText() {
    if (!E.bill) return '';
    const P = E.bill.prices || {}, k = 1 + (E.bill.perLevel ?? 0.05) * ((E.bill.level || 1) - 1);
    const p = n => Math.round((P[n] ?? 0) * k);
    if (barberFree({ prices: P })) return 'The barber charges nothing: change whatever you like.';      // (a list of zeroes is not a price list)
    return `Prices: hair ${p('hair')} · colour ${p('hairColour')} · beard ${p('beard')} · eyes ${p('eyes')} · face ${p('face')} · skin ${p('skin')} · build ${p('body')} · everything ${p('everything')} gold${E.bill.free ? ' — your first change is free' : ''}.`;
  }
  function changed() { E.look = { ...E.look }; onChange?.(lookWith(E.look, E.custom)); paintCost(); }
  function setSlot(slot, id) { if (slot === 'headShape') E.custom.headShape = id; else E.custom[slot] = { ...(E.custom[slot] || {}), id }; changed(); draw(); }
  function setColor(slot, color) { if (slot === 'skin') E.custom.body = { ...(E.custom.body || {}), skin: color }; else E.custom[slot] = { ...(E.custom[slot] || { id: FACE_SLOTS.find(s => s.slot === slot).ids[0] }), color }; changed(); draw(); }
  function setDial(k, v) { E.custom.body = { ...(E.custom.body || {}), [k]: v }; changed(); }

  function draw() {
    // play-test 7 V5: a change (Beard, a colour…) rebuilds the rows — keep where the player had scrolled to, in the list and in the window
    const keep = [panel.root.querySelector('.ap-body')?.scrollTop || 0, panel.body.scrollTop || 0];
    const rows = [];
    // R1: preview your calling's gear on or off (the figure stands in starting clothes by default)
    if (E.gearToggle) rows.push(h('label.ap-row.ap-gear', { title: 'Your figure wears plain starting clothes; tick to see your calling\'s gear on it.' }, h('input', { type: 'checkbox', checked: !!E.gearToggle.on, dataset: { k: 'classGear' }, onchange: e => { E.gearToggle.on = e.target.checked; E.gearToggle.onChange?.(e.target.checked); } }), h('span', {}, 'Show class gear')));
    if (E.mode === 'title' && races.length) {
      rows.push(h('div.ap-row', {}, h('span.ap-label', {}, 'People'), h('div.chips', { role: 'radiogroup' }, ...races.map(r =>
        h('button.chip', { type: 'button', role: 'radio', 'aria-checked': String(E.look.race === r), dataset: { race: r }, onclick: async () => {
          E.look.race = r;
          // a new people starts from that people's own face and build (then your choices on top)
          const av = avatarFor ? await avatarFor({ race: r, seed: E.look.seed }) : null;
          E.custom = freshCustom(customFrom(av) || {}); changed(); draw();
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
      if (s.color && !(s.slot === 'facialHair' && (cur || 'none') === 'none') && !(s.slot === 'hair' && cur === 'bald') && !(s.slot === 'accessory' && (cur || 'none') === 'none')) rows.push(swatches(`${s.label} colour`, s.slot, PALETTES[s.color], E.custom[s.slot]?.color));
    }
    const costTxt = '';
    panel.setTitle(E.mode === 'barber' ? 'The Barber' : 'Customize Appearance', E.mode === 'barber' ? 'A new look, if you can sit still' : 'Overrides your calling\'s default face');
    panel.fill(h('div.ap-body', {}, ...rows), E.mode === 'barber' && E.bill ? h('p.tiny-left.ap-bill', {}, billText()) : null,
      h('div.row.ap-foot', {},
        h('button.ghost.small', { type: 'button', title: 'A new random face for your people', onclick: async () => { E.look.seed = (Math.random() * 1e9) >>> 0; const av = avatarFor ? await avatarFor({ race: E.look.race, seed: E.look.seed }) : null; E.custom = E.mode === 'title' ? freshCustom(customFrom(av) || {}) : (customFrom(av) || {}); changed(); draw(); } }, 'Random'),
        h('button.ghost.small', { type: 'button', title: 'Back to how you looked when you opened this', onclick: () => { E.look = JSON.parse(JSON.stringify(E.start)); E.custom = JSON.parse(JSON.stringify(E.base)); changed(); draw(); } }, 'Undo all'),
        h('span.grow'),
        h('button.ghost.small', { type: 'button', onclick: () => panel.close() }, 'Cancel'),
        h('button.primary.small', { type: 'button', dataset: { act: 'save' }, onclick: () => { E.saved = true; const look = current(); panel.close(); onSave?.(look, E.mode, cost()); } }, `${E.saveLabel || 'Save'}${costTxt}`)));
    paintCost();
    const list = panel.root.querySelector('.ap-body');
    if (list) list.scrollTop = keep[0];
    panel.body.scrollTop = keep[1];
    // (a layout that has not settled yet clamps scrollTop to 0: set it again once it has)
    requestAnimationFrame(() => { const l = panel.root.querySelector('.ap-body'); if (l && l.scrollTop !== keep[0]) l.scrollTop = keep[0]; if (panel.body.scrollTop !== keep[1]) panel.body.scrollTop = keep[1]; });
  }
  function swatches(label, slot, list, cur) {
    return h('div.ap-row.sw', { dataset: { swatch: slot } }, h('span.ap-label', {}, label), h('div.ap-swatches', {}, ...list.map(c =>
      h('button.ap-sw', { type: 'button', 'aria-label': `${label} ${c}`, 'aria-pressed': String((cur || '').toLowerCase() === c), style: `background:${c}`, onclick: () => setColor(slot, c) }))));
  }
  return { open, panel, get look() { return E.look ? current() : null; }, get isOpen() { return panel.isOpen; } };
}
