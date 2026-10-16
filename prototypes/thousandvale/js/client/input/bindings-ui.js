// Input layer (T27) — the binding table on screen: the "Key bindings" tab of Settings (re-bind a key, pick the gamepad's
// glyphs, read the touch controls) and the three-way reference the gallery's "Controls" scene and the help window show.
// Everything is generated from input/bindings.js; nothing here names a key.
import { h } from '../ui-panel.js';
import { ACTIONS, GROUPS, GLYPHS, GLYPH_SETS, referenceRows, padParts, PAD_MENU, keyLabel, TOUCH_CONTROLS } from './bindings.js';
import { B, captureNextKey } from './keyboard.js';
import { device } from './device.js';
import { LAYOUTS, layoutChoice, setLayoutChoice } from './layout.js';

let ctx = null, sub = 'keyboard';
export function installBindingsUi(c) { ctx = c; }

/** A button cap: <kbd class="pad-glyph" data-btn="A">A</kbd>. */
export function glyph(btn, set = device.glyphs) { const G = GLYPHS[set] || GLYPHS.xbox; return h('kbd.pad-glyph', { dataset: { btn, set, hinted: '1', key0: '' } }, G[btn] || btn); }
const padCell = (id, set) => { const parts = padParts(id, set); if (!parts.length) return h('span.dim', {}, '—'); return h('span.pad-chord', {}, ...parts.flatMap((p, i) => [i ? h('i', {}, '+') : null, p.btn === 'WHEEL' ? h('em', {}, 'wheel') : glyph(p.btn, set)])); };

/** The reference for one device as a table (the Controls scene, the settings tab, docs). */
export function referenceTable(dev, { set = device.glyphs } = {}) {
  const rows = referenceRows(dev, { B, set });
  return h('div.ctl-ref', { dataset: { device: dev } }, ...rows.map(g => h('section', {}, h('h4', {}, g.group),
    h('dl', {}, ...g.rows.flatMap(r => [
      h('dt', {}, ...(dev === 'pad' && r.parts ? [...new Map(r.parts.map(p => [p.map(x => x.btn).join('+'), p])).values()].flatMap((p, i) => [i ? ' ' : null, p.length ? h('span.pad-chord', {}, ...p.flatMap((x, j) => [j ? h('i', {}, '+') : null, x.btn === 'WHEEL' ? h('em', {}, 'wheel') : x.btn === 'LS' || x.btn === 'RS' ? h('kbd.pad-glyph.stick', { dataset: { btn: x.btn, hinted: '1', key0: '' } }, GLYPHS[set][x.btn]) : glyph(x.btn, set)])) : null])
        : dev === 'pad' ? r.keys.map(k => h('kbd.pad-glyph.stick', { dataset: { hinted: '1', key0: '' } }, k))
          : dev === 'touch' ? r.keys.map(k => h('span.touch-ctl', {}, k)) : r.keys.flatMap((k, i) => [i ? ' ' : null, h('kbd', { dataset: { hinted: '1', key0: '' } }, k)]))),
      h('dd', {}, r.label, r.note ? h('small', {}, ' — ' + r.note) : null)])))));
}
/** Y34 (G2): every control the phone puts on screen, by the name a long press shows (TOUCH_CONTROLS). */
export function touchControlsTable() {
  return h('div.ctl-ref.ctl-onscreen', { dataset: { device: 'touch' } }, h('section', {}, h('h4', {}, 'The buttons on screen'),
    h('dl', {}, ...TOUCH_CONTROLS.flatMap(c => [h('dt', {}, h('span.touch-ctl', {}, c.name)), h('dd', {}, c.what)]))));
}
/** All three, side by side (ui-gallery.html#scene=controls). */
export function controlsReference({ set = device.glyphs } = {}) {
  return h('div.ctl-three', {},
    h('article', {}, h('h3', {}, 'Keyboard and mouse'), referenceTable('keyboard')),
    h('article', {}, h('h3', {}, `Controller — ${GLYPHS[set].name} glyphs`), referenceTable('pad', { set })),
    h('article', {}, h('h3', {}, 'Touch (the phone layout)'), touchControlsTable(), referenceTable('touch')));
}

/** The body of Settings > Key bindings. `redraw` = draw the settings window again. */
export function bindingsTab({ redraw }) {
  const save = () => { ctx?.save?.(); redraw(); };
  const tabs = h('div.chips.bind-tabs', { role: 'tablist' }, ...[['keyboard', 'Keyboard'], ['pad', 'Controller'], ['touch', 'Touch']].map(([id, label]) =>
    h('button.chip', { type: 'button', role: 'tab', 'aria-checked': String(sub === id), dataset: { bind: id }, onclick: () => { sub = id; redraw(); } }, label)));
  // 2026-10-16: the layout choice sits on the Controller tab too (Automatic switches to the controller layout on its own)
  const layoutRow = () => h('label.set-row', {}, h('span', {}, 'Layout'), h('select', { dataset: { k: 'layout' }, onchange: e => { setLayoutChoice(e.target.value); redraw(); } }, ...LAYOUTS.map(([id, label]) => h('option', { value: id, selected: layoutChoice() === id }, label))));
  if (sub === 'pad') {
    const set = device.glyphs;
    return [tabs, layoutRow(),
      h('p.tiny-left', {}, 'Automatic switches to the controller layout while you play with a controller — Menu opens every window, the chat and the quest list fold away — and back as soon as you use the mouse, the keyboard or the screen. Pick Controller or Desktop to keep one.'),
      h('label.set-row', {}, h('span', {}, 'Button names'), h('select', { dataset: { k: 'glyphs' }, onchange: e => { device.setGlyphs(e.target.value); try { localStorage.setItem('tv.glyphs', e.target.value); } catch { /* private window */ } redraw(); } },
        h('option', { value: 'auto', selected: device.userGlyphs === 'auto' }, 'Automatic (from the controller)'), ...GLYPH_SETS.map(s => h('option', { value: s, selected: device.userGlyphs === s }, GLYPHS[s].name)))),
      h('p.tiny-left', {}, ctx?.input?.pad?.padId ? `Connected: ${ctx.input.pad.padId}` : 'No controller seen yet — press any button on it. Browsers only show a page its controllers on a secure address (https).'),
      referenceTable('pad', { set }),
      h('p.tiny-left', {}, 'Controller buttons cannot be moved yet; the keyboard ones can.')];
  }
  if (sub === 'touch') return [tabs, layoutRow(),
    h('p.tiny-left', {}, 'Automatic uses the phone layout on a touch screen whose short side is under 500 px, the controller layout while a controller is in use, and the desktop one everywhere else. Pick one here to force it on this device.'),
    h('button.ghost.wide', { type: 'button', dataset: { act: 'explain' }, hidden: !ctx?.input?.touch, onclick: () => { document.querySelector('#panel-settings .tvp-x')?.click(); setTimeout(() => ctx?.input?.touch?.explain?.(), 80); } }, 'Show me what the buttons do'),
    touchControlsTable(), referenceTable('touch')];
  const row = a => {
    const fixed = !!a.fixed;
    const btn = h('button.ghost.small.bind-key' + (B.changed(a.id) ? '.changed' : ''), { type: 'button', disabled: fixed, dataset: { bindAction: a.id }, title: fixed ? 'This key cannot be moved.' : 'Click, then press the new key. Esc cancels.' }, a.keyText && B.keyOf(a.id) === a.key ? a.keyText : keyLabel(B.keyOf(a.id)));
    btn.onclick = () => {
      btn.textContent = 'Press a key…'; btn.classList.add('waiting');
      captureNextKey(code => {
        if (code) { const r = B.set(a.id, code); if (!r.ok) ctx?.api?.hud?.toast?.(r.why === 'reserved' ? 'That key is kept for the browser or the chat box.' : r.why === 'taken' ? 'That key is already doing something that cannot move.' : 'That key cannot be used.', 'warn'); else if (r.swapped) ctx?.api?.hud?.toast?.(`Swapped with "${ACTIONS.find(x => x.id === r.swapped).label}".`, 'info'); }
        save();
      });
    };
    return h('div.bind-row', {}, h('span', {}, a.label), btn, B.changed(a.id) ? h('button.ghost.small.bind-reset', { type: 'button', 'aria-label': `Put ${a.label} back`, title: 'Back to the usual key', onclick: () => { B.reset(a.id); save(); } }, '↺') : h('span.bind-reset'));
  };
  return [tabs,
    h('div.bind-list', {}, ...GROUPS.map(g => h('section', {}, h('h4', {}, g), ...ACTIONS.filter(a => a.group === g && (a.key || a.run) && a.id !== 'command').map(row)))),
    h('div.row.end', {}, h('button.ghost.small', { type: 'button', dataset: { act: 'keys-default' }, onclick: () => { B.reset(); save(); } }, 'All keys back to the usual')),
    h('p.tiny-left', {}, 'A key that is already in use swaps places with the one you move. Mouse buttons and the chat keys (Enter, /) stay where they are.')];
}
export { PAD_MENU };
