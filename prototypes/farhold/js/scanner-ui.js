// Farhold — the scanner's chooser: what to sweep for, and the button that forgets a survey.
//
//   "I asked for scrollwheel to reveal Weapon, Tool, Scanner, but I don't see the Scanner option.
//    I know we already have a scanner on the map and in the build menu, but I would actually
//    prefer it to be a tool. Can you add it to the scrollbar menu? It should allow you to right
//    click to select what to scan for, or to clear the scan results. In the future we can add
//    upgraded scanning tools."
//
// The reason the mode never appeared is in js/tools.js `priceRow` and it is not this file's doing:
// the Prospector's Scanner was priced in `crystal`, and `crystal` is not a material — the game
// calls it `crystal_raw`. So the Build button was permanently disabled and nothing could ever set
// `player.devices.scanner`. That is fixed at the price; this is the second half of the ask.
//
// ITS OWN FILE AND ITS OWN STYLESHEET, the same decision js/civics-ui.js made for the Holding
// screen: js/hud.js carries nine screens already and js/main.js is not ours this round. It draws
// into a <div> of its own, loads scanner.css itself, and installs its own right-click listener —
// so it costs the rest of the game one construction call and nothing else.
//
//   import { createScannerChooser } from './scanner-ui.js';
//   const chooser = createScannerChooser({
//     scanner,                                     // js/tools.js createScanner()
//     materialName: id => resourceData.materials[id]?.name || id,
//     canOpen: () => heldNow(player) === 'scanner',
//     onChange: () => {},                          // redraw the map/minimap if you want to
//   });
//   chooser.toggle();      // …or just right-click with the scanner in hand
//
// WHY IT LISTENS FOR ITSELF. Right-click is unclaimed in Farhold — `grep contextmenu` and
// `grep 'button === 2'` across js/ return nothing at all — so taking it here means the feature is
// live rather than sitting in a handoff note waiting to be wired. `canOpen()` is the guard: with
// anything but the scanner in hand the listener does not fire and the browser menu is left alone.
// No inline styles: every rule is in scanner.css.

const CSS_HREF = 'scanner.css';

/** One element with attributes and children. Small enough that a helper library would be heavier. */
function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of [].concat(kids)) if (kid) node.appendChild(kid);
  return node;
}

function ensureStyles() {
  if (document.querySelector(`link[href="${CSS_HREF}"]`)) return;
  document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
}

export function createScannerChooser({
  scanner = null,
  mount = null,
  materialName = id => String(id || '').replace(/_/g, ' '),
  canOpen = () => true,
  onChange = () => {},
  onLog = () => {},
} = {}) {
  if (typeof document === 'undefined') return null;
  ensureStyles();

  const list = el('ul', { class: 'scan-list' });
  const tierWord = el('span', { class: 'scan-tier' });
  const note = el('p', { class: 'scan-note' });
  const foot = el('div', { class: 'scan-foot' });

  const allBtn = el('button', {
    type: 'button', text: 'Everything',
    onclick: () => { scanner?.setWanted(null); redraw(); onChange(); },
  });
  const wipeBtn = el('button', {
    class: 'scan-danger', type: 'button', text: 'Forget survey',
    onclick: () => {
      const n = scanner?.clearFound() || 0;
      if (!n) onLog('There is nothing in the survey to forget.', '');
      redraw();
      onChange();
    },
  });

  const root = el('div', { class: 'scan-panel hidden' }, [
    el('div', { class: 'scan-head' }, [el('h3', { text: 'Scanner' }), tierWord]),
    note,
    list,
    el('div', { class: 'scan-actions' }, [allBtn, wipeBtn]),
    foot,
  ]);
  (mount || document.body).appendChild(root);

  let open = false;

  /**
   * The list is built out of what the survey has ALREADY FOUND, not out of the whole material
   * table. Seventy-odd rows of which four exist on this planet is a list nobody reads, and a
   * chooser that offers you a material this world does not have is the "sent to an empty field"
   * failure the job generator was rewritten to avoid. Sweep first, then narrow.
   */
  function redraw() {
    const rows = scanner?.tally() || [];
    const wanted = new Set(scanner?.wanted || []);
    const tier = scanner?.tier || null;
    tierWord.textContent = tier ? `${tier.name} · ${Math.round(tier.range)} m` : 'not swept yet';
    note.textContent = wanted.size
      ? `Listening for ${wanted.size} of ${rows.length}. Everything else is ignored.`
      : 'Listening for everything. Pick one or more to narrow the sweep.';

    list.replaceChildren();
    if (!rows.length) {
      list.appendChild(el('li', {}, [el('div', {
        class: 'scan-empty',
        text: 'Nothing surveyed yet. Turn the scanner on and walk — what it finds appears here, and then you can narrow it.',
      })]));
    } else {
      for (const row of rows) {
        const on = wanted.has(row.resource);
        list.appendChild(el('li', {}, [el('button', {
          class: 'scan-row', type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: () => { scanner?.toggleWanted(row.resource); redraw(); onChange(); },
        }, [
          // the survey already stored the word the game uses for this node; `materialName` is only
          // the fallback for a row that somehow came back without one
          el('span', { text: row.name || materialName(row.resource) }),
          el('span', { class: 'scan-count', text: String(row.count) }),
        ])]));
      }
    }

    allBtn.disabled = !wanted.size;
    wipeBtn.disabled = !(scanner?.size > 0);
    foot.textContent = `${scanner?.size || 0} marks remembered. Right-click to close.`;
  }

  /**
   * Right-click, and only with the scanner in hand.
   *
   * Capture phase, so it runs before anything that might stop the event, and `preventDefault` only
   * when we are actually taking it — a right-click anywhere else in the game still gets the
   * browser's own menu, which is what a player expects on a web page.
   */
  function onContext(e) {
    if (!canOpen() && !open) return;
    e.preventDefault();
    api.toggle();
  }
  window.addEventListener('contextmenu', onContext, true);

  /** Escape closes it, like every other panel in the game. */
  function onKey(e) {
    if (open && e.key === 'Escape') { api.setOpen(false); e.stopPropagation(); }
  }
  window.addEventListener('keydown', onKey, true);

  const api = {
    root,
    get isOpen() { return open; },
    setOpen(v) {
      open = !!v;
      root.classList.toggle('hidden', !open);
      if (open) redraw();
      return open;
    },
    toggle() { return api.setOpen(!open); },
    /** Called from the frame loop if you like; cheap, and only does work while the panel is up. */
    refresh() { if (open) redraw(); },
    dispose() {
      window.removeEventListener('contextmenu', onContext, true);
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
  return api;
}
