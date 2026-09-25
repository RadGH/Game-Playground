// Farhold — the debug menu, on the tilde key (`).
//
// A place to put tools while the game is being built. Nothing in here is meant to survive into a
// finished game; it is meant to save you from reloading the page to see a thunderstorm.
//
//   const debug = createDebugMenu({ hooks });
//   debug.toggle();     // or press ` at any time
//
// `hooks` is how it reaches the game — it never imports the game itself, so a tool that is not
// wired up simply does not appear.

import { WEATHER, WEATHER_BY_KEY } from '../../../worldgen/js/weather.js';

/**
 * D2: THE ONE LINE A BUG REPORT NEEDS.
 *
 * The user pastes "seed 1, Hes-Subud IV, biome Lake, x 22844, z 10308, altitude -13" into chat and
 * that is enough for anyone to stand exactly where the bug was. It was being typed out by hand off
 * the State box, so it lives here as one function and the map screen imports it — the debug menu
 * and the map must never disagree about what a location looks like.
 */
export function locationLine({ seed, planet, biome, x, z, altitude } = {}) {
  const n = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : v);
  return `seed ${seed}, ${planet}, biome ${biome}, x ${n(x)}, z ${n(z)}, altitude ${n(altitude)}`;
}

/**
 * D1: COPYING, ON A PAGE THAT CANNOT USE THE CLIPBOARD API.
 *
 * "It claims it copied to the clipboard but the clipboard copy does not work at all." It never
 * could: the game is served over plain http on a LAN address, which is not a secure context, so
 * `navigator.clipboard` is simply not there — and the old code's `catch` then quietly redrew the
 * State box, which the 400ms refresh timer wiped a moment later. So there was nothing to copy from
 * and nothing to read.
 *
 * The fallback is the old one that works anywhere: put the text in a real textarea, select it, and
 * ask the document to copy the selection. `execCommand` is deprecated and still the only thing that
 * works off https. If even that is refused the text is selected and on screen, so ctrl-C does it.
 *
 * Returns 'clipboard' | 'selection' | 'shown' — what actually happened, for the status line.
 */
export async function copyTextVia(area, text) {
  area.value = text;
  // a hidden textarea cannot be selected, so the caller must have shown it first
  area.focus();
  area.select();
  area.setSelectionRange(0, text.length);
  // selecting to the end scrolls a long report to the bottom; the first line is the useful one
  area.scrollTop = 0;
  area.scrollLeft = 0;
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return 'clipboard'; } catch { /* fall through */ }
  }
  try { if (document.execCommand?.('copy')) return 'selection'; } catch { /* fall through */ }
  return 'shown';
}

/** What to tell the user, given what `copyTextVia` managed. */
export const COPY_WORDS = {
  clipboard: 'Copied.',
  selection: 'Copied.',
  shown: 'Could not reach the clipboard — the text is selected below, press Ctrl+C.',
};

const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...kids.filter(Boolean));
  return node;
};

/**
 * hooks: {
 *   getState(),                       // anything to show in the readout
 *   setWeather(key | null),           // null means "back to automatic"
 *   getWeather(),                     // { key, locked, odds: [{key, name, share}] }
 *   setTime(fraction 0..1), getTime(),
 *   setDensity(n), getDensity(),
 *   toggleProps(on), toggleGrass(on), toggleFeatures(on),
 *   teleport(kind),                   // 'settlement' | 'river' | 'road' | 'peak' | 'random'
 *   spawn(id), heal(), levelUp(), give(rarity),
 * }
 */
export function createDebugMenu(hooks = {}) {
  const panel = el('section', { class: 'debug hidden', id: 'debug' });
  const readout = el('pre', { class: 'debug-readout' });
  let open = false;
  let sections = [];

  function group(title, ...kids) {
    return el('div', { class: 'debug-group' }, el('h4', { text: title }), el('div', { class: 'debug-row' }, ...kids));
  }
  const button = (label, onclick, cls = '') => el('button', { class: 'debug-btn ' + cls, text: label, onclick });

  // ---------------------------------------------------------------- weather
  const weatherButtons = new Map();
  if (hooks.setWeather) {
    const autoBtn = button('Auto', () => { hooks.setWeather(null); refresh(); }, 'wide');
    weatherButtons.set(null, autoBtn);
    const buttons = [autoBtn];
    for (const w of WEATHER) {
      const b = button(w.name, () => { hooks.setWeather(w.key); refresh(); });
      weatherButtons.set(w.key, b);
      buttons.push(b);
    }
    sections.push(group('Weather', ...buttons));
    const skyKids = [];
    if (hooks.strike) skyKids.push(button('Lightning strike', () => hooks.strike()));
    if (hooks.eclipse) {
      skyKids.push(button('Solar eclipse', () => { hooks.eclipse('solar'); refresh(); }));
      skyKids.push(button('Lunar eclipse', () => { hooks.eclipse('lunar'); refresh(); }));
    }
    if (skyKids.length) sections.push(group('Sky', ...skyKids));
  }

  // ---------------------------------------------------------------- time of day
  let timeSlider = null;
  if (hooks.setTime) {
    timeSlider = el('input', { type: 'range', min: '0', max: '1', step: '0.005', class: 'debug-slider' });
    timeSlider.addEventListener('input', () => { hooks.setTime(Number(timeSlider.value)); refresh(); });
    sections.push(group('Time of day',
      button('Dawn', () => { hooks.setTime(0.25); refresh(); }),
      button('Noon', () => { hooks.setTime(0.5); refresh(); }),
      button('Dusk', () => { hooks.setTime(0.75); refresh(); }),
      button('Midnight', () => { hooks.setTime(0); refresh(); }),
      timeSlider,
    ));
  }

  // ---------------------------------------------------------------- world
  if (hooks.setDensity || hooks.toggleProps || hooks.teleport) {
    const kids = [];
    if (hooks.setDensity) {
      for (const [label, value] of [['Bare', 0], ['Sparse', 0.5], ['Normal', 1], ['Thick', 2]]) {
        kids.push(button(label, () => { hooks.setDensity(value); refresh(); }));
      }
    }
    if (hooks.toggleProps) kids.push(button('Props on/off', () => { hooks.toggleProps(); refresh(); }));
    if (hooks.toggleGrass) kids.push(button('Grass on/off', () => { hooks.toggleGrass(); refresh(); }));
    if (hooks.toggleFeatures) kids.push(button('Roads/rivers on/off', () => { hooks.toggleFeatures(); refresh(); }));
    sections.push(group('World', ...kids));
  }

  if (hooks.teleport) {
    sections.push(group('Go to',
      button('Nearest town', () => { hooks.teleport('settlement'); refresh(); }),
      button('A city', () => { hooks.teleport('city'); refresh(); }),
      button('A river', () => { hooks.teleport('river'); refresh(); }),
      button('A road', () => { hooks.teleport('road'); refresh(); }),
      button('A peak', () => { hooks.teleport('peak'); refresh(); }),
      button('Anywhere', () => { hooks.teleport('random'); refresh(); }),
    ));
  }

  // ---------------------------------------------------------------- character
  if (hooks.levelUp || hooks.spawn) {
    const kids = [];
    if (hooks.levelUp) kids.push(button('Level up', () => { hooks.levelUp(); refresh(); }));
    if (hooks.heal) kids.push(button('Heal', () => { hooks.heal(); refresh(); }));
    if (hooks.give) {
      kids.push(button('Give rare', () => { hooks.give('rare'); refresh(); }));
      kids.push(button('Give legendary', () => { hooks.give('legendary'); refresh(); }));
    }
    if (hooks.spawn) {
      kids.push(button('Spawn enemy', () => { hooks.spawn(); refresh(); }));
      kids.push(button('Clear enemies', () => { hooks.clearEnemies?.(); refresh(); }));
    }
    sections.push(group('Character', ...kids));
  }

  /**
   * D1: the copy drawer — the text, a status line, and a Close button.
   *
   * It stays up until you dismiss it. The old version wrote the report into the State box, which is
   * redrawn from the game five times a second, so it was gone before you could drag over it. This
   * has its own box that nothing else touches, and it holds the selection.
   */
  const copyArea = el('textarea', { class: 'debug-copy-text', readonly: 'readonly', spellcheck: 'false' });
  const copyNote = el('span', { class: 'debug-copy-note' });
  const copyBox = el('div', { class: 'debug-copy hidden' },
    el('div', { class: 'debug-copy-head' },
      copyNote,
      button('Copy again', () => { copyArea.select(); copyTextVia(copyArea, copyArea.value).then(say); }),
      button('Close', () => copyBox.classList.add('hidden')),
    ),
    copyArea,
  );
  const say = how => {
    copyNote.textContent = COPY_WORDS[how] || '';
    // "copied" in green, "I could not, here it is" in amber — the two outcomes must not look alike
    copyNote.classList.toggle('bad', how === 'shown');
  };

  async function offerCopy(text) {
    copyBox.classList.remove('hidden');
    copyNote.textContent = 'Copying…';
    say(await copyTextVia(copyArea, text));
  }

  // A block of everything worth knowing, on the clipboard, ready to paste into a chat.
  const copyBtn = button('Copy debug report', () => {
    offerCopy(hooks.report ? hooks.report() : JSON.stringify(hooks.getState?.() || {}, null, 1));
  }, 'wide');

  /**
   * D2: just the location, which is what most bug reports actually quote.
   *
   * Everything it needs is already in `getState()` — seed, planet, biome, x, z and altitude are the
   * first six rows of it — so no new hook had to be threaded through main.js for this.
   */
  const locBtn = button('Copy location', () => {
    const s = hooks.location?.() || hooks.getState?.() || {};
    offerCopy(locationLine(s));
  });
  if (hooks.sound || hooks.voice) {
    const kids = [];
    if (hooks.sound) kids.push(button('Sound on/off', () => { hooks.sound(); refresh(); }));
    if (hooks.voice) kids.push(button('Voices on/off', () => { hooks.voice(); refresh(); }));
    sections.push(group('Audio', ...kids));
  }

  const reportKids = [copyBtn, locBtn];
  if (hooks.save) reportKids.push(button('Save now', () => hooks.save()));
  sections.push(group('Report', ...reportKids, copyBox));

  panel.append(
    el('div', { class: 'debug-head' },
      el('h3', { text: 'Debug' }),
      el('span', { class: 'debug-hint', text: 'press ` to close' }),
    ),
    ...sections,
    el('div', { class: 'debug-group' }, el('h4', { text: 'State' }), readout),
  );
  document.body.append(panel);

  /** Redraw the bits that reflect game state. */
  function refresh() {
    if (!open) return;
    if (hooks.getWeather) {
      const w = hooks.getWeather();
      for (const [key, btn] of weatherButtons) {
        const active = key === null ? !w.locked : (w.locked && w.key === key);
        btn.classList.toggle('on', active);
      }
    }
    if (timeSlider && hooks.getTime) timeSlider.value = String(hooks.getTime());
    const lines = [];
    if (hooks.getState) {
      for (const [k, v] of Object.entries(hooks.getState())) {
        lines.push(`${k.padEnd(14)} ${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`);
      }
    }
    if (hooks.getWeather) {
      const w = hooks.getWeather();
      lines.push('');
      lines.push(`weather       ${WEATHER_BY_KEY[w.key]?.name || w.key}${w.locked ? ' (held)' : ''}`);
      for (const o of (w.odds || []).slice(0, 5)) {
        lines.push(`  ${o.name.padEnd(13)} ${(o.share * 100).toFixed(0).padStart(3)}%`);
      }
    }
    readout.textContent = lines.join('\n');
  }

  let timer = null;
  function setOpen(v) {
    open = v;
    panel.classList.toggle('hidden', !open);
    if (open) {
      document.exitPointerLock?.();
      refresh();
      timer = setInterval(refresh, 400);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'Backquote') { e.preventDefault(); setOpen(!open); }
    else if (e.code === 'Escape' && open) setOpen(false);
  });

  return {
    panel,
    get isOpen() { return open; },
    toggle(v = !open) { setOpen(v); },
    refresh,
  };
}
