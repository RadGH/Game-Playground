// The "Layers" panel, shared by World Forge and Star Forge: one chip per map layer (biomes, elevation,
// temperature …) and a checkbox per overlay (hillshade, rivers, roads …).
//
//   import { layersPanel, LAYER_NAMES, LAYER_TOGGLES } from '../../worldgen/js/layers-panel.js';
//   right.append(layersPanel({
//     layer: state.layer, layers: state.layers,
//     onLayer: name => { state.layer = name; redraw(); },
//     onToggle: (key, on) => { state.layers[key] = on; redraw(); },
//     unavailable: key => null,          // or a sentence saying why this layer does not apply
//   }));
//
// The panel only builds DOM and reports clicks; the caller owns the state and does the drawing with
// render.js. `unavailable(key)` lets a caller switch off what does not apply to one map — the chip or
// checkbox stays in the panel, greyed out, with the reason as its tooltip and in a note underneath,
// so nobody is left clicking an empty toggle. Without it every layer is live, which is World Forge.

import { el, checkbox, panel } from '../../shared/ui.js';

/** The whole-map layers, one at a time (render.js worldPixels `layer`). */
export const LAYER_NAMES = ['biomes', 'elevation', 'temperature', 'moisture', 'drainage', 'aura', 'magic', 'weather', 'regions'];

/** The overlays drawn on top, any number at once (render.js `layers`). */
export const LAYER_TOGGLES = ['hillshade', 'rivers', 'roads', 'nodes', 'labels', 'borders', 'aura'];

/** What a toggle is called in the panel. */
export const TOGGLE_LABELS = { aura: 'aura wash' };

/**
 * Build the panel.
 * opts: { layer, layers, onLayer(name), onToggle(key, on), unavailable(key, kind) -> string|null,
 *         title = 'Layers' }
 * `kind` is 'layer' for a chip and 'toggle' for a checkbox, since `aura` is both.
 */
export function layersPanel({ layer, layers, onLayer, onToggle, unavailable = null, title = 'Layers' } = {}) {
  const why = (key, kind) => (unavailable ? unavailable(key, kind) : null) || null;
  const notes = [];

  const layerChips = el('div', { class: 'chips layers' });
  for (const name of LAYER_NAMES) {
    const reason = why(name, 'layer');
    if (reason) {
      layerChips.append(el('span', { class: 'chip off', text: name, title: reason, 'aria-disabled': 'true', dataset: { layer: name } }));
      notes.push(`${name}: ${reason}`);
      continue;
    }
    layerChips.append(el('span', {
      class: 'chip' + (layer === name ? ' on' : ''), text: name, dataset: { layer: name },
      onclick: () => onLayer?.(name),
    }));
  }

  const toggles = el('div', { class: 'grid c2' });
  for (const key of LAYER_TOGGLES) {
    const label = TOGGLE_LABELS[key] || key;
    const reason = why(key, 'toggle');
    const box = checkbox(label, reason ? false : layers?.[key], v => onToggle?.(key, v));
    box.dataset.toggle = key;
    if (reason) {
      box.input.disabled = true;
      box.classList.add('off');
      box.title = reason;
      box.style.cursor = 'not-allowed';
      box.style.opacity = '0.45';
      if (!notes.some(n => n.startsWith(label + ':'))) notes.push(`${label}: ${reason}`);
    }
    toggles.append(box);
  }

  const children = [layerChips, toggles];
  if (notes.length) children.push(el('p', { class: 'layer-notes muted small', text: 'Not on this map — ' + notes.join('; ') + '.' }));
  return panel(title, ...children);
}
