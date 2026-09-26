// Settings (docs/02 §19) and the rebind screen (02 §5.2). Changes apply live through ctx.applySettings(settings);
// [Revert] restores the values from when the screen opened. Saved to the profile store: shared/store.js
// makeStore('lanternfall', 1), key 'settings'. Rebinds are stored as a DIFF from data/bindings.json (02 §5.1),
// settings.bindings = { context: { action: [code, code] } }, so a later default change reaches everyone who never
// touched that action. effectiveBindings(defaults, settings) gives back the bindings.json shape for js/core/input.js.
import { makeStore } from '../../../../shared/store.js';
import { el, btn, tabStrip, toast, confirmBox, fmt, pct, cycle } from './menukit.js';

const store = makeStore('lanternfall', 1);
const O = (...xs) => xs.map(x => (Array.isArray(x) ? { v: x[0], t: x[1] } : { v: x, t: String(x) }));
/** Every settings row: [category, key, label, kind, options|range, default, tip]. */
export const SCHEMA = [
  ['video', 'scale', 'Scale', 'select', O(['auto', 'Auto (largest whole number)'], [1, '×1'], [2, '×2'], [3, '×3'], [4, '×4'], [5, '×5'], [6, '×6']), 'auto', 'Whole-number scaling only, so pixels stay square. Free.'],
  ['video', 'fullscreen', 'Fullscreen', 'toggle', null, false, 'Fills the screen. Free.'],
  ['video', 'vsync_cap', 'Frame cap', 'select', O([30, '30'], [60, '60'], [0, 'Uncapped']), 60, 'Caps drawing only; the world always steps 60 times a second. Lower saves battery.'],
  ['video', 'rain_density', 'Rain', 'select', O(['off', 'Off'], ['light', 'Light (25%)'], ['medium', 'Medium (50%)'], ['heavy', 'Heavy (100%)']), 'heavy', 'Both rain layers. Off keeps puddles and wet sheen. Rain costs a little on slow machines.'],
  ['video', 'reflection_quality', 'Reflections', 'select', O(['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']), 'medium', 'Water and wet-ground reflections. High costs the most.'],
  ['video', 'bloom', 'Bloom', 'select', O(['off', 'Off'], ['low', 'Low'], ['high', 'High']), 'low', 'Glow around bright lights. Small cost.'],
  ['video', 'light_quality', 'Light quality', 'select', O(['low', 'Low'], ['medium', 'Medium'], ['high', 'High']), 'medium', 'Drawn light resolution and soft shadows. Gameplay light (what the dark rules read) never changes.'],
  ['video', 'particles', 'Particles', 'select', O(['low', 'Low'], ['medium', 'Medium'], ['high', 'High']), 'medium', 'Sparks, embers and spray. Medium cost.'],
  ['video', 'screen_shake', 'Screen shake', 'range', [0, 1, 0.1, 'pct'], 0.7, '0 also removes camera kicks on casts.'],
  ['video', 'flash_reduction', 'Reduce flashing', 'toggle', null, false, 'Caps brightness change per frame and turns strobes into soft fades. No lantern flicker.'],
  ['video', 'camera_lookahead', 'Camera lookahead', 'select', O([0, '0 cells'], [40, '40 cells'], [80, '80 cells']), 40, 'How far the camera leads where you face.'],
  ['video', 'perf_auto', 'Automatic quality', 'toggle', null, true, 'If frames get slow for 3 s, steps rain, reflections, light and physics detail down one notch each, with a note.'],
  ['video', 'show_fps', 'Show frame rate', 'toggle', null, false, 'Same as F3\'s first line.'],
  ['video', 'physics_detail', 'Physics detail', 'select', O(['full', 'Full'], ['reduced', 'Reduced']), 'full', 'Reduced draws fewer loose particles. Never changes a puzzle cell or anything the rules read.'],
  ['video', 'brightness_floor', 'Brightness floor', 'select', O([0.08, 'Default'], [0.12, 'Brighter'], [0.16, 'Brightest']), 0.08, 'For dim screens: lifts how dark the picture gets. Gameplay darkness is unchanged.'],
  ['audio', 'master', 'Master', 'range', [0, 1, 0.05, 'pct'], 0.8, 'Everything.'],
  ['audio', 'music', 'Music', 'range', [0, 1, 0.05, 'pct'], 0.6, 'The procedural score.'],
  ['audio', 'sfx', 'Effects', 'range', [0, 1, 0.05, 'pct'], 0.8, 'Spells, hits, the world.'],
  ['audio', 'ui', 'Interface', 'range', [0, 1, 0.05, 'pct'], 0.6, 'Menu clicks and chimes.'],
  ['audio', 'ambience', 'Ambience', 'range', [0, 1, 0.05, 'pct'], 0.7, 'Rain and rooms. Still capped under the effects.'],
  ['audio', 'voice', 'Voices', 'range', [0, 1, 0.05, 'pct'], 0.9, 'Speech and the Narrator.'],
  ['audio', 'method', 'Sound method', 'select', O(['synth', 'Synth'], ['library', 'Library'], ['hybrid', 'Hybrid'], ['retro', 'Retro']), 'hybrid', 'Which set of sound effects plays.'],
  ['audio', 'mute_hidden', 'Mute when the tab is hidden', 'toggle', null, true, 'Silence while you are in another tab.'],
  ['audio', 'mono', 'Mono audio', 'toggle', null, false, 'Both ears hear everything.'],
  ['audio', 'range', 'Dynamic range', 'select', O(['full', 'Full'], ['night', 'Night (quieter loud sounds)']), 'full', 'Night squeezes loud sounds down.'],
  ['audio', 'cd_ping', 'Cooldown ready ping', 'toggle', null, true, 'A soft click when a wick comes off cooldown.'],
  ['voices', 'engine', 'Voice engine', 'select', O(['formant', 'Formant (built in)'], ['espeak', 'espeak'], ['piper', 'Piper (download)'], ['browser', 'Browser speech'], ['babble', 'Babble only'], ['off', 'Off (text only)']), 'formant', 'How characters speak. Formant is ours and needs no download.'],
  ['voices', 'babble', 'Babble for creatures', 'toggle', null, true, 'Rats and moths speak in babble.'],
  ['voices', 'narrator', 'Narrator', 'toggle', null, true, 'The dry voice that remarks on what you do.'],
  ['voices', 'speed', 'Speech speed', 'range', [0.75, 1.5, 0.05, 'x'], 1, 'How fast voices talk.'],
  ['text', 'subtitles', 'Subtitles', 'toggle', null, true, 'Spoken lines as text.'],
  ['text', 'captions', 'Sound captions', 'toggle', null, false, 'Important sounds as text, like [bell tolls].'],
  ['text', 'sub_size', 'Subtitle size', 'select', O(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Huge']), 'medium', ''],
  ['text', 'sub_bg', 'Subtitle background', 'range', [0, 1, 0.1, 'pct'], 0.7, 'How dark the box behind subtitles is.'],
  ['text', 'speaker_names', 'Speaker names', 'toggle', null, true, ''],
  ['text', 'menu_scale', 'Menu text size', 'select', O([0.9, '90%'], [1, '100%'], [1.25, '125%'], [1.5, '150%'], [2, '200%']), 1, 'Scales every menu.'],
  ['text', 'hud_scale', 'HUD text size', 'select', O([1, '1×'], [2, '2×']), 1, 'Doubles the pixel font on the HUD.'],
  ['text', 'damage_numbers', 'Damage numbers', 'select', O(['off', 'Off'], ['merged', 'Merged'], ['every', 'Every hit']), 'merged', ''],
  ['text', 'combo_counter', 'Combo counter', 'toggle', null, true, ''],
  ['text', 'lesson_hints', 'Lesson hints', 'toggle', null, true, 'One-line hints the first time each thing appears.'],
  ['controls', 'sensitivity', 'Mouse sensitivity', 'range', [0.25, 3, 0.05, 'x'], 1, 'Only with "Keep mouse in game window".'],
  ['controls', 'wheel_invert', 'Invert wheel', 'toggle', null, false, 'Wheel direction for next/previous wick.'],
  ['controls', 'deadzone_left', 'Left stick dead zone', 'range', [0.05, 0.4, 0.01, 'n'], 0.18, ''],
  ['controls', 'deadzone_right', 'Right stick dead zone', 'range', [0.05, 0.4, 0.01, 'n'], 0.2, ''],
  ['controls', 'rumble', 'Rumble', 'range', [0, 1, 0.1, 'pct'], 0.6, ''],
  ['controls', 'glyphs', 'Button glyphs', 'select', O(['auto', 'Auto'], ['letters', 'Letters'], ['shapes', 'Shapes'], ['numbers', 'Numbers']), 'auto', ''],
  ['controls', 'run_by_stick', 'Run by stick push', 'toggle', null, true, 'Pushing the stick far runs.'],
  ['controls', 'always_run', 'Always run', 'toggle', null, false, 'Shift walks instead.'],
  ['controls', 'aim_with_keys', 'Aim with keys', 'toggle', null, false, 'The arrow keys aim instead of moving (WASD still moves).'],
  ['access', 'flame_patterns', 'Flame patterns', 'toggle', null, false, 'Each flame also gets a shape: triangles, snowflakes, zigzags, dots, rings, waves, stripes.'],
  ['access', 'colour_filter', 'Colour filter', 'select', O(['none', 'None'], ['red', 'Red-weak'], ['green', 'Green-weak'], ['blue', 'Blue-weak']), 'none', 'Moves the seven flame colours to a set that stays distinct.'],
  ['access', 'overcharge_needs_key', 'Overcharge needs a key', 'toggle', null, false, 'Holding cast alone never overcharges; hold Shift + cast instead.'],
  ['access', 'slow_build', 'Slow time while building', 'toggle', null, false, 'Build mode runs the game at 35%.'],
  ['access', 'aim_assist_pad', 'Aim assist (gamepad)', 'range', [0, 3, 1, 'n'], 1, ''],
  ['access', 'aim_assist_mouse', 'Aim assist (mouse)', 'range', [0, 3, 1, 'n'], 0, ''],
  ['access', 'slow_mode', 'Game speed', 'select', O([1, '100%'], [0.85, '85%'], [0.7, '70%'], [0.5, '50%']), 1, 'Slows the whole game. Nothing is locked; Trials and the Daily note it on the score.'],
  ['access', 'telegraph_boost', 'Louder telegraphs', 'toggle', null, false, 'Thicker attack outlines and a white rim on every void zone.'],
  ['access', 'high_contrast_hud', 'High-contrast HUD', 'toggle', null, false, 'A black outline round every HUD element.'],
  ['access', 'reduce_motion', 'Reduce motion', 'toggle', null, false, 'No menu slides, no braid animation, shorter rain streaks.'],
  ['access', 'keep_mouse_in_window', 'Keep mouse in game window', 'toggle', null, false, 'Locks the pointer to the game.'],
  ['access', 'low_health_vignette', 'Low health vignette', 'toggle', null, true, ''],
  ['access', 'auto_hide_hud', 'Auto-hide HUD', 'toggle', null, false, ''],
  ['access', 'dyslexia_font', 'Easier-to-read font', 'toggle', null, false, 'Menus use Atkinson Hyperlegible.'],
  ['access', 'pause_on_focus_loss', 'Pause when the window loses focus', 'toggle', null, true, ''],
  ['access', 'hold_run', 'Run: toggle instead of hold', 'toggle', null, false, 'Hold-to-toggle for run.'],
  ['access', 'hold_grapple', 'Grapple: toggle instead of hold', 'toggle', null, false, ''],
  ['access', 'hold_overcharge', 'Overcharge: toggle instead of hold', 'toggle', null, false, ''],
  ['gameplay', 'aim_guides', 'Aim guides', 'toggle', null, false, 'Lob arcs and bolt lines always shown.'],
  ['gameplay', 'minimap_size', 'Minimap size', 'select', O(['S', 'Small'], ['M', 'Medium'], ['L', 'Large'], ['hidden', 'Hidden']), 'M', ''],
  ['gameplay', 'objective_line', 'Objective line', 'toggle', null, true, ''],
  ['gameplay', 'auto_pennies', 'Auto-pickup pennies', 'toggle', null, true, ''],
  ['gameplay', 'auto_items', 'Auto-pickup items', 'select', O(['off', 'Off'], ['common', 'Common only'], ['all', 'All']), 'off', ''],
];
export const CATS = [['video', 'Video'], ['audio', 'Audio'], ['voices', 'Voices'], ['text', 'Subtitles & text'], ['controls', 'Controls'], ['access', 'Accessibility'], ['gameplay', 'Gameplay'], ['data', 'Data']];

export function defaultSettings() {
  const s = { version: 1, bindings: {}, firstRunDone: false };
  for (const [cat, key, , , , def] of SCHEMA) (s[cat] ||= {})[key] = def;
  return s;
}
/** Stored settings merged over the defaults (new keys appear with their default). */
export function loadSettings(raw = undefined) {
  const saved = raw === undefined ? store.get('settings', null) : raw;
  const s = defaultSettings(); if (!saved) return s;
  for (const [k, v] of Object.entries(saved)) s[k] = v && typeof v === 'object' && !Array.isArray(v) && s[k] && typeof s[k] === 'object' ? { ...s[k], ...v } : v;
  return s;
}
export function saveSettings(s) { return store.set('settings', s); }

// ---------- bindings (pure) ----------
export const FIXED_ACTIONS = ['pause', 'help'];
/** The bindings.json shape with the player's diff applied. */
export function effectiveBindings(defaults, settings) {
  const out = structuredClone(defaults);
  for (const [ctx, acts] of Object.entries(settings?.bindings || {})) for (const [a, codes] of Object.entries(acts)) if (out.keys?.[ctx]) out.keys[ctx][a] = [...codes];
  return out;
}
/** The contexts a context's keys can clash in (a child inherits its parent, 02 §5). */
function relatives(defaults, ctx) { const inh = defaults.meta?.contexts?.[ctx]?.inherits; const kids = Object.entries(defaults.meta?.contexts || {}).filter(([, v]) => v.inherits === ctx).map(([k]) => k); return [ctx, ...(inh ? [inh] : []), ...kids]; }
/** Which other action in the same context (or its parent/child) already uses this code; null if free. */
export function findConflict(bindings, ctx, action, code) {
  const own = bindings.keys[ctx] || {};
  for (const [a, codes] of Object.entries(own)) if (a !== action && codes.includes(code)) return { ctx, action: a };
  // a child that binds the same code hides the parent action, which is allowed (build mode's Digit1 = a part)
  return null;
}
/** Why a code can never be bound (browser-reserved or a lone modifier), or null. */
export function refuseCode(code, defaults, e = null) {
  const res = defaults.reserved || [];
  if (res.includes(code)) return code.startsWith('Control') || code.startsWith('Alt') ? 'Ctrl and Alt alone are kept for the browser (a slip can close the tab).' : `${code} belongs to the browser.`;
  if (e) { const chord = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', code].filter(Boolean).join('+'); if (res.includes(chord) || (e.metaKey && res.includes('Meta+*'))) return `${chord.replace('Control', 'Ctrl')} belongs to the browser.`; }
  if (code === 'Escape' || code === 'F1') return 'Esc and F1 are fixed so you can never lock yourself out.';
  return null;
}
/**
 * Bind code to (ctx, action, which = 0 primary / 1 secondary). swap: give the other action this action's old code.
 * Returns the new diff (settings.bindings) — never mutates.
 */
export function rebind(diff, defaults, ctx, action, which, code, { swap = false } = {}) {
  const eff = effectiveBindings(defaults, { bindings: diff }).keys[ctx];
  const next = structuredClone(diff || {}); next[ctx] ||= {};
  const cur = [...(eff[action] || [])]; const old = cur[which];
  cur[which] = code; next[ctx][action] = cur.filter((c, i, a) => c && a.indexOf(c) === i);
  const clash = findConflict({ keys: { [ctx]: eff } }, ctx, action, code);
  if (clash && swap) { const o = [...eff[clash.action]].map(c => (c === code ? old : c)).filter(Boolean); next[ctx][clash.action] = o; }
  else if (clash) { next[ctx][clash.action] = eff[clash.action].filter(c => c !== code); }
  // drop entries equal to the defaults so the diff stays small
  for (const a of Object.keys(next[ctx])) if (JSON.stringify(next[ctx][a]) === JSON.stringify(defaults.keys[ctx][a])) delete next[ctx][a];
  if (!Object.keys(next[ctx]).length) delete next[ctx];
  return next;
}
const KEY_NAMES = { Mouse0: 'Mouse left', Mouse1: 'Mouse middle', Mouse2: 'Mouse right', WheelUp: 'Wheel up', WheelDown: 'Wheel down', Space: 'Space', Escape: 'Esc', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', BracketLeft: '[', BracketRight: ']', Backquote: '`', Equal: '=', Minus: '-', Semicolon: ';', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', Enter: 'Enter' };
export function keyName(code) { if (!code) return '—'; return KEY_NAMES[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num '); }
export function actionName(a) { return a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()); }

// ---------- the screen ----------
let snapshot = null, cat = 'video', waiting = null;
export const settingsScreen = {
  id: 'settings', title: 'Settings',
  render(root, ctx, args, router) {
    ctx.settings ||= loadSettings(); const s = ctx.settings;
    if (!snapshot) snapshot = structuredClone(s);
    cat = args.cat || cat;
    const apply = () => { saveSettings(s); ctx.applySettings?.(s); document.querySelector('.lf-menus')?.style.setProperty('--m-scale', s.text.menu_scale); document.querySelector('.lf-menus')?.classList.toggle('reduce-motion', !!s.access.reduce_motion); };
    const body = el('div', { class: 'col grow' });
    const cats = el('div', { class: 'lf-cats', role: 'tablist' }, CATS.map(([id, name]) => el('button', { type: 'button', role: 'tab', class: 'lf-tab' + (id === cat ? ' on' : ''), text: name, onclick: () => { cat = id; draw(); } })));
    const draw = () => {
      cats.querySelectorAll('.lf-tab').forEach((b, i) => b.classList.toggle('on', CATS[i][0] === cat));
      body.replaceChildren(el('h3', { class: 'lf-h', text: CATS.find(c => c[0] === cat)[1] }));
      if (cat === 'data') return dataRows(body, ctx);
      for (const row of SCHEMA.filter(r => r[0] === cat)) body.append(settingRow(row, s, apply));
      if (cat === 'controls') bindRows(body, ctx, s, apply, router);
      if (cat === 'gameplay') {
        body.append(el('div', { class: 'lf-setrow' }, el('label', { text: 'Difficulty', 'data-tip': 'Changed only at a lamp-post, from the lamp-post menu.' }), el('div', { class: 'ctl dim', text: ctx.difficulty || ctx.game?.difficultyId || 'lamplighter' })));
        body.append(el('div', { class: 'lf-setrow' }, el('label', { text: 'Builder guide' }), el('div', { class: 'ctl' }, btn('Show the builder guide again', () => { const h = ctx.hero?.() ?? ctx.hero ?? ctx.game?.hero; if (h) { h.flags ||= {}; h.flags.builderGuideSeen = false; } toast('The guide will show next time you open the Wicks tab.'); }, { cls: 'small' }))));
      }
    };
    root.append(el('div', { class: 'lf-frame medium' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: 'Settings' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body lf-settings' }, cats, body),
      el('div', { class: 'lf-frame-head' }, el('span', { class: 'dim small grow', text: 'Changes apply at once and are saved to your profile.' }),
        btn('Revert', () => { Object.assign(s, structuredClone(snapshot)); apply(); draw(); toast('Settings reverted.'); }), btn('Done', () => router.back(), { cls: 'primary' }))));
    draw();
  },
  onKey(code) {
    const ids = CATS.map(c => c[0]);
    if (code === 'BracketLeft' || code === 'BracketRight' || code === 'KeyQ' || code === 'KeyE') { cat = cycle(ids, cat, code === 'BracketLeft' || code === 'KeyQ' ? -1 : 1); document.querySelector('.scr-settings .lf-cats .lf-tab:nth-child(' + (ids.indexOf(cat) + 1) + ')')?.click(); return true; }
    return false;
  },
  destroy() { snapshot = null; waiting = null; },
};
function settingRow([catId, key, label, kind, opts, def, tip], s, apply) {
  const v = s[catId]?.[key] ?? def; let ctl;
  const set = val => { s[catId][key] = val; apply(); };
  if (kind === 'toggle') ctl = el('input', { type: 'checkbox', checked: !!v, 'aria-label': label, onchange: e => set(e.target.checked) });
  else if (kind === 'select') ctl = el('select', { 'aria-label': label, onchange: e => set(opts[e.target.selectedIndex].v) }, opts.map(o => el('option', { text: o.t, selected: o.v === v })));
  else {
    const [min, max, step, unit] = opts; const out = el('output', { text: show(v, unit) });
    const r = el('input', { type: 'range', min, max, step, value: v, 'aria-label': label, oninput: e => { out.textContent = show(+e.target.value, unit); set(+e.target.value); } });
    ctl = el('span', { class: 'row' }, r, out);
  }
  return el('div', { class: 'lf-setrow' }, el('label', { text: label, 'data-tip': tip || label }), el('div', { class: 'ctl' }, ctl));
}
const show = (v, unit) => unit === 'pct' ? pct(v) : unit === 'x' ? fmt(v) + '×' : fmt(v);

function bindRows(body, ctx, s, apply, router) {
  const defaults = ctx.data?.bindings; if (!defaults?.keys) { body.append(el('p', { class: 'dim', text: 'Key bindings load with the game data.' })); return; }
  body.append(el('h3', { class: 'lf-h', text: 'Keys' }), el('p', { class: 'dim small', text: 'Click a key to change it, then press the new key or mouse button. Esc cancels. Esc and F1 are fixed.' }));
  for (const ctxName of ['play', 'build']) {
    const eff = effectiveBindings(defaults, s).keys[ctxName];
    body.append(el('h4', { class: 'gold small', text: ctxName === 'play' ? 'Playing' : 'Build mode' }),
      el('div', { class: 'lf-bindrow dim small' }, el('span', { text: 'Action' }), el('span', { text: 'Primary' }), el('span', { text: 'Secondary' })));
    for (const [action, codes] of Object.entries(eff)) {
      const fixed = FIXED_ACTIONS.includes(action);
      const keyBtn = which => {
        const b = el('button', { type: 'button', class: 'lf-key' + (fixed ? ' fixed' : ''), text: keyName(codes[which]), 'aria-label': `${actionName(action)} ${which ? 'secondary' : 'primary'}: ${keyName(codes[which])}` });
        if (fixed) { b.dataset.tip = 'Fixed so you can never lock yourself out.'; return b; }
        b.addEventListener('click', () => startCapture(b, ctxName, action, which));
        return b;
      };
      body.append(el('div', { class: 'lf-bindrow' }, el('span', { text: actionName(action) }), keyBtn(0), keyBtn(1)));
    }
    body.append(el('div', { class: 'row' }, btn('Reset this context', async () => { if (await confirmBox(body.closest('.scr'), { title: 'Reset these keys?', yes: 'Reset' })) { delete s.bindings[ctxName]; apply(); router.refresh(); } }, { cls: 'small' })));
  }
  body.append(el('div', { class: 'row' }, btn('Reset all keys', async () => { if (await confirmBox(body.closest('.scr'), { title: 'Reset every key?', yes: 'Reset all' })) { s.bindings = {}; apply(); router.refresh(); } }, { cls: 'small danger' })));

  function startCapture(b, ctxName, action, which) {
    b.classList.add('waiting'); b.textContent = 'Press a key…'; waiting = b;
    const finish = () => { router.capture(null); removeEventListener('mousedown', onMouse, true); removeEventListener('wheel', onWheel, true); waiting = null; };
    const take = async (code, e) => {
      finish();
      if (code === 'Escape') { router.refresh(); return; }
      const why = refuseCode(code, defaults, e); if (why) { toast(why, 'bad'); ctx.sound?.('ui.error'); router.refresh(); return; }
      const eff = effectiveBindings(defaults, s);
      const clash = findConflict(eff, ctxName, action, code);
      let swap = false;
      if (clash) { swap = await confirmBox(body.closest('.scr'), { title: 'Key in use', text: `${keyName(code)} is ${actionName(clash.action)}. Swap them?`, yes: 'Swap', no: 'Cancel' }); if (!swap) { router.refresh(); return; } }
      s.bindings = rebind(s.bindings, defaults, ctxName, action, which, code, { swap }); apply(); ctx.onBindingsChanged?.(effectiveBindings(defaults, s)); router.refresh();
    };
    const onMouse = e => { if (e.target === b) return; e.preventDefault(); e.stopPropagation(); take('Mouse' + e.button, e); };
    const onWheel = e => { e.preventDefault(); take(e.deltaY > 0 ? 'WheelDown' : 'WheelUp', e); };
    router.capture(e => take(e.code, e));
    setTimeout(() => { addEventListener('mousedown', onMouse, true); addEventListener('wheel', onWheel, { capture: true, passive: false }); }, 0);
  }
}
function dataRows(body, ctx) {
  let used = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.includes('lanternfall')) used += (localStorage.getItem(k) || '').length + k.length; } } catch {}
  body.append(el('p', {}, 'Storage used: ', el('b', { class: 'num', text: fmt(used / 1024, { decimals: 1 }) + ' KB' }), el('span', { class: 'dim', text: ' of about 420 KB (each slot ≤ 64 KB, profile ≤ 16 KB).' })),
    el('div', { class: 'row' }, ctx.saves?.exportProfile ? btn('Export profile', () => ctx.saves.exportProfile()) : null, ctx.saves?.importProfile ? btn('Import profile', () => ctx.saves.importProfile()) : null, ctx.saves?.exportAll ? btn('Export all slots', () => ctx.saves.exportAll()) : null),
    el('div', { class: 'row' }, btn('Delete everything', async () => {
      if (await confirmBox(body.closest('.scr'), { title: 'Delete everything?', text: 'Every save, the profile and these settings. This cannot be undone.', yes: 'Delete everything', input: { label: 'LANTERNFALL', match: 'LANTERNFALL' } })) {
        if (ctx.saves?.deleteAll) await ctx.saves.deleteAll(); else { try { for (const k of Object.keys(localStorage)) if (k.includes('lanternfall')) localStorage.removeItem(k); } catch {} }
        toast('Everything deleted.');
      }
    }, { cls: 'danger' })));
}
export const screens = [settingsScreen];
