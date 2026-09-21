// Farhold R16 — the appearance editor on the new-game screen.
//
// "Have an optional 'Customize' button that lets you customize your character appearance similar to
//  the character editor experiment we built."
//
// It IS the character editor experiment — this file is a panel, not a second catalogue. Every part,
// every colour and every slider comes out of `avatar-2d/js/parts` and `avatar-2d/data/presets.json`,
// and the thing it hands back is a plain `avatar` object in the shared character schema. That
// matters more than it sounds: `avatar-3d/js/chibi2.js` normalises the SAME shape (see
// `normalizeForChibi2`), so what you build here walks around the world with no translation step in
// between — `makeActor({ avatar })` takes it exactly as it comes out.
//
//   import { openAppearance } from './appearance.js';
//   const avatar = await openAppearance({ avatar: current, classAvatar: fromTheClass, race: 'human',
//                                         onChange: a => drawTheFigureBehind(a) });
//   // → the chosen avatar, or null if they backed out
//
// WHAT IS DELIBERATELY NOT IN HERE: `held`, `offhand` and `decor`. Farhold's gear system owns all
// three — `applyGearLook()` in main.js writes the weapon into `held`, the shield or torch into
// `offhand` and a belt lantern into `decor` on every equip, so anything you picked here would be
// overwritten within a second of the game starting and the editor would look broken. The armour
// slots (`hat`/`top`/`bottom`/`shoes`) ARE here, because they show through until you find armour
// that replaces them, and they come back when you take it off.

import { PARTS, SLOTS, SLOT_LABELS, partIds } from '../../../avatar-2d/js/parts/index.js';
import { renderSVG, normalizeAvatar, DEFAULT_AVATAR } from '../../../avatar-2d/js/render.js';
import { randomAvatar } from '../../../avatar-2d/js/random.js';

const PRESETS_URL = new URL('../../../avatar-2d/data/presets.json', import.meta.url).href;

let presets = null;
/** Load the palettes and race rules once. Never throws: a failure just means fewer swatches. */
async function loadPresets() {
  if (presets) return presets;
  try {
    const res = await fetch(PRESETS_URL);
    presets = res.ok ? await res.json() : null;
  } catch { presets = null; }
  presets = presets || { palettes: { skin: [], hair: [], eye: [], cloth: [] }, raceRules: {}, presets: [] };
  return presets;
}

/** The tabs, and which controls sit under each. */
const TABS = [
  { id: 'body', label: 'Body' },
  { id: 'face', label: 'Face' },
  { id: 'hair', label: 'Hair' },
  { id: 'outfit', label: 'Outfit' },
];

/** slot → which tab it belongs on, and which palette its colour comes from. */
const SLOT_TAB = {
  headShape: 'face', eyes: 'face', brows: 'face', nose: 'face', mouth: 'face',
  ears: 'face', facialHair: 'face', extras: 'face',
  hair: 'hair',
  top: 'outfit', bottom: 'outfit', shoes: 'outfit', accessory: 'outfit', hat: 'outfit', cape: 'outfit',
};
const SLOT_PALETTE = {
  hair: 'hair', eyes: 'eye',
  top: 'cloth', bottom: 'cloth', shoes: 'cloth', accessory: 'cloth', hat: 'cloth',
  extras: 'cloth', cape: 'cloth', mouth: 'cloth',
};
/** The face sliders, Mii style: which numbers each face part lets you nudge. */
const FACE_NUDGES = {
  eyes: [['x', 'Spacing', -0.4, 0.4, 0.02], ['y', 'Height', -0.3, 0.3, 0.02], ['scale', 'Size', 0.8, 1.25, 0.01], ['rot', 'Tilt', -10, 10, 1]],
  brows: [['y', 'Height', -0.3, 0.3, 0.02], ['rot', 'Tilt', -10, 10, 1]],
  nose: [['y', 'Height', -0.2, 0.3, 0.02], ['scale', 'Size', 0.8, 1.3, 0.01]],
  mouth: [['y', 'Height', -0.2, 0.3, 0.02], ['scale', 'Size', 0.8, 1.3, 0.01]],
};

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : String(v));
  }
  n.append(...kids.filter(Boolean));
  return n;
}

function partName(slot, id) {
  return PARTS[slot]?.[id]?.name || id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** `headShape` is a bare string in the schema; every other slot is `{ id, color, … }`. */
function slotId(avatar, slot) {
  return slot === 'headShape' ? (avatar.headShape || 'round') : (avatar[slot]?.id ?? 'none');
}
function setSlotId(avatar, slot, id) {
  if (slot === 'headShape') avatar.headShape = id;
  else avatar[slot] = { ...(avatar[slot] || {}), id };
}

let panel = null;   // built once, reused — a second one would double every listener

/**
 * Open the editor over whatever is on screen. Resolves with the finished avatar, or null if the
 * player backed out. Escape and the Cancel button both mean "back out".
 */
export function openAppearance({ avatar, classAvatar = null, race = 'human', onChange = () => {} } = {}) {
  return loadPresets().then(data => new Promise(resolve => {
    const start = normalizeAvatar(avatar || classAvatar || DEFAULT_AVATAR);
    let current = JSON.parse(JSON.stringify(start));
    let tab = 'body';
    let done = false;

    if (!panel) {
      panel = el('section', { id: 'appearance', class: 'appearance hidden', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Customize appearance' });
      document.body.append(panel);
    }

    const figure = el('div', { class: 'ap-figure', id: 'ap-figure' });
    const controls = el('div', { class: 'ap-controls', id: 'ap-controls' });
    const tabRail = el('div', { class: 'ap-tabs', role: 'tablist' });

    function touch() {
      figure.innerHTML = renderSVG(current, { width: 240, height: 320 });
      try { onChange(JSON.parse(JSON.stringify(current))); } catch { /* the caller's problem, not ours */ }
    }

    // ------------------------------------------------------------------ one control per thing
    function slider(label, get, set, min, max, step) {
      const out = el('span', { class: 'ap-num' });
      const input = el('input', { type: 'range', min, max, step, class: 'ap-range', 'aria-label': label });
      input.value = String(get());
      const show = () => { out.textContent = Number(input.value).toFixed(step < 1 ? 2 : 0); };
      show();
      input.addEventListener('input', () => { set(Number(input.value)); show(); touch(); });
      return el('div', { class: 'ap-row' }, el('span', { class: 'ap-label', text: label }), input, out);
    }

    function swatches(label, key, get, set) {
      const list = data.palettes?.[key] || [];
      const wrap = el('div', { class: 'ap-swatches' });
      const redraw = () => {
        wrap.replaceChildren(...list.map(hex => el('button', {
          class: 'ap-swatch' + (get().toLowerCase() === hex.toLowerCase() ? ' on' : ''),
          style: `background:${hex}`, title: hex, 'aria-label': `${label} ${hex}`,
          onclick: () => { set(hex); redraw(); touch(); },
        })));
        const pick = el('input', { type: 'color', class: 'ap-colour', 'aria-label': `${label}, any colour` });
        pick.value = get();
        pick.addEventListener('input', () => { set(pick.value); touch(); });
        wrap.append(pick);
      };
      redraw();
      return el('div', { class: 'ap-row ap-row-wide' }, el('span', { class: 'ap-label', text: label }), wrap);
    }

    function picker(slot) {
      const ids = partIds(slot);
      const sel = el('select', { class: 'ap-select', 'aria-label': SLOT_LABELS[slot] || slot });
      sel.replaceChildren(...ids.map(id => el('option', { value: id, text: partName(slot, id) })));
      sel.value = slotId(current, slot);
      sel.addEventListener('change', () => { setSlotId(current, slot, sel.value); touch(); });
      const row = el('div', { class: 'ap-row' }, el('span', { class: 'ap-label', text: SLOT_LABELS[slot] || slot }), sel);
      const rows = [row];
      const pal = SLOT_PALETTE[slot];
      if (pal && slot !== 'headShape') {
        rows.push(swatches(`${SLOT_LABELS[slot]} colour`, pal,
          () => current[slot]?.color || '#888888',
          v => { current[slot] = { ...(current[slot] || {}), color: v }; }));
      }
      // the tunic's trim is a second colour, and it is the one that makes two tunics look different
      if (slot === 'top') {
        rows.push(swatches('Trim colour', 'cloth',
          () => current.top?.color2 || '#ffffff',
          v => { current.top = { ...(current.top || {}), color2: v }; }));
      }
      for (const [key, label, min, max, step] of FACE_NUDGES[slot] || []) {
        rows.push(slider(label, () => current[slot]?.[key] ?? (key === 'scale' ? 1 : 0),
          v => { current[slot] = { ...(current[slot] || {}), [key]: v }; }, min, max, step));
      }
      return rows;
    }

    function drawControls() {
      const rows = [];
      if (tab === 'body') {
        rows.push(slider('Height', () => current.body.height ?? 0.5, v => { current.body.height = v; }, 0, 1, 0.01));
        rows.push(slider('Build', () => current.body.width ?? 0.5, v => { current.body.width = v; }, 0, 1, 0.01));
        rows.push(slider('Head size', () => current.body.headSize ?? 0.5, v => { current.body.headSize = v; }, 0, 1, 0.01));
        rows.push(swatches('Skin', 'skin', () => current.body.skin || '#f1c27d', v => { current.body.skin = v; }));
      } else {
        for (const slot of SLOTS) {
          if (SLOT_TAB[slot] !== tab) continue;
          rows.push(...picker(slot));
        }
      }
      controls.replaceChildren(...rows);
    }

    tabRail.replaceChildren(...TABS.map(t => el('button', {
      class: 'ap-tab' + (t.id === tab ? ' on' : ''), text: t.label, role: 'tab',
      'data-tab': t.id,
      onclick: () => {
        tab = t.id;
        for (const b of tabRail.children) b.classList.toggle('on', b.dataset.tab === tab);
        drawControls();
      },
    })));

    // ------------------------------------------------------------------ the buttons at the bottom
    function finish(value) {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      panel.classList.add('hidden');
      panel.replaceChildren();
      resolve(value);
    }
    function onKey(e) {
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(null); }
    }

    const actions = el('div', { class: 'ap-actions' },
      el('button', {
        class: 'ghost', id: 'ap-random', text: 'Randomise',
        onclick: () => {
          // a fresh seed every click, and the race rules keep an elf looking like an elf
          current = randomAvatar(data, { race, seed: (Math.random() * 1e9) | 0, base: current });
          drawControls(); touch();
        },
      }),
      el('button', {
        class: 'ghost', id: 'ap-reset', text: 'Back to the class look',
        onclick: () => {
          current = normalizeAvatar(classAvatar || DEFAULT_AVATAR);
          drawControls(); touch();
        },
      }),
      el('span', { class: 'ap-spacer' }),
      el('button', { class: 'ghost', id: 'ap-cancel', text: 'Cancel', onclick: () => finish(null) }),
      el('button', { id: 'ap-done', text: 'Done', onclick: () => finish(JSON.parse(JSON.stringify(current))) }),
    );

    panel.replaceChildren(el('div', { class: 'ap-inner' },
      el('div', { class: 'ap-head' },
        el('h2', { text: 'Customize appearance' }),
        el('p', { class: 'small muted', text: 'Armour you find replaces the hat, top, legs and boots while you are wearing it. Your weapon and your light fill the hands.' }),
      ),
      el('div', { class: 'ap-body' },
        el('div', { class: 'ap-left' }, figure),
        el('div', { class: 'ap-right' }, tabRail, controls),
      ),
      actions,
    ));
    panel.classList.remove('hidden');
    drawControls();
    touch();
    window.addEventListener('keydown', onKey, true);
    panel.querySelector('#ap-done')?.focus();
  }));
}

/** Exposed for the tests and for anything that wants the catalogue without opening the panel. */
export const APPEARANCE_SLOTS = SLOTS.filter(s => SLOT_TAB[s]);
