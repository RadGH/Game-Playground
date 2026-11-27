// The Look setting applied (world-tools round 2026-11-26; data in render/look-presets.js, panel in ui/look-panel.js).
//   * colour and light — a preset's factors ride on top of the Look tuning numbers (data/tuning.json) through a stand-in
//     tuning object, so view.applyLook, the map editor's region looks (render/zones.js, which blends from the numbers
//     after that step) and the weather all keep working, and Classic is today's picture bit for bit (factors null)
//   * effects — view.setLookFx: sky, shadows' reach and softness, water shine and the wet look are numbers; light shafts,
//     contact shading and distance blur are passes, built ONCE the first time a preset turns one on (behind a short
//     fade so the frame the browser spends building it is not a visible hitch), then only their strength moves (rule 29).
//     Effects marked `low: false` are off on Low graphics.
//
//   const look = createLook(app)          app.settings.look = { id, custom } (per device, rule 43)
//   view.tuning = look.tuning(app.tuning) the stand-in the view reads every frame
//   look.set(setting)                     a new pick        look.applyFx()   again after a quality change
//   look.resolved                         the full set of numbers in use (tests, the panel)
import { resolveLook, LOOK_KNOBS, LOOK_EFFECTS } from './look-presets.js';

/** The effects a view should draw for a resolved look at a quality (null = that quality's own default). */
export function fxFor(resolved, quality) {
  const fx = {};
  for (const [k, E] of Object.entries(LOOK_EFFECTS)) {
    const v = resolved.fx?.[k];
    fx[k] = quality === 'low' && !E.low ? (v == null ? null : 0) : v ?? null;
  }
  for (const k of ['shadows', 'depth', 'water', 'sky', 'wet']) if (fx[k] == null) fx[k] = 0;
  return fx;
}

export function createLook(app) {
  let resolved = resolveLook(app.settings?.look);
  const factorOf = new Map();                         // tuning key (lookExposure …) → factor
  const rebuild = () => { factorOf.clear(); for (const [k, K] of Object.entries(LOOK_KNOBS)) if (resolved[k] != null && resolved[k] !== 1) factorOf.set(K.of, resolved[k]); };
  rebuild();
  let fadeEl = null;
  function fade() {
    if (typeof document === 'undefined') return;
    if (!fadeEl) {
      fadeEl = document.createElement('div');
      fadeEl.className = 'ow-look-fade';
      fadeEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fadeEl);
    }
    fadeEl.classList.add('ow-look-fade-on');
    // two frames: the one that builds the new pass, then one drawn with it — then the picture fades back in
    requestAnimationFrame(() => requestAnimationFrame(() => fadeEl.classList.remove('ow-look-fade-on')));
  }
  const look = {
    get resolved() { return resolved; },
    set(setting) { resolved = resolveLook(setting); rebuild(); look.applyFx(); look.onChange?.(resolved); return resolved; },
    /** Push the effects to the view (after a pick, or a quality change). → true when a pass was built (it faded). */
    applyFx() {
      const view = app.view;
      if (!view?.setLookFx) return false;
      const built = view.setLookFx(fxFor(resolved, view.quality));
      if (built) fade();
      return built;
    },
    /** A tuning object that reads like `base` but with this look's factors on the Look numbers. */
    tuning(base) {
      if (!base) return base;
      return new Proxy(base, {
        get(t, key) {
          const v = t[key];
          const f = typeof key === 'string' ? factorOf.get(key) : undefined;
          return f === undefined || typeof v !== 'number' ? v : v * f;
        },
      });
    },
    onChange: null,
  };
  return look;
}
