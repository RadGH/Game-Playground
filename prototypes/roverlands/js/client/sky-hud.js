// The skydiving + health bits of the HUD (Expansion 1 M9): the altitude readout, the jump light, the big OPEN /
// FLARE button (reachable with a thumb on a phone), the health bar (shown only after a hard landing), and the Jump
// Point's little menu (parachute or glider). Its own DOM and stylesheet (css/sky.css), made and removed with a
// session, so the rest of the HUD (js/client/ui) does not need to know any of it.
//
//   const sh = createSkyHud();
//   sh.update({ sky: sky.hud() | null, hp: 0..100 | null, down: 'ok' | 'down' | 'out', wait })   every frame
//   sh.pressed('open' | 'flare')   true while that button is held (cleared on read for 'open')
//   sh.menu({ gliderWhy, onPick(choice: 'jump' | 'glider' | null) })   the Jump Point menu; sh.menuOpen; sh.closeMenu()
//   sh.dispose()

export function createSkyHud({ root = document.body } = {}) {
  if (!document.querySelector('link[data-rl-sky]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/sky.css'; l.dataset.rlSky = '1'; document.head.append(l);
  }
  const el = document.createElement('div'); el.className = 'rl-skyhud';
  el.innerHTML = `<div class="rl-sky-top">
      <div class="rl-sky-alt" hidden><b>0</b><span>m</span><em></em></div>
      <div class="rl-sky-light" hidden><i></i><span></span></div>
      <div class="rl-hp" hidden><div class="rl-hp-bar"><i></i></div><span></span></div>
    </div>
    <button type="button" class="rl-sky-btn" hidden data-nonav="1">OPEN</button>
    <div class="rl-sky-done" hidden></div>
    <div class="rl-skymenu" hidden role="dialog" aria-label="Jump Point">
      <h3>Jump Point</h3><p>The Big Sky Lifter takes off now. Friends who board in the next few seconds fly with you.</p>
      <button type="button" class="rl-btn" data-pick="jump">Parachute jump <small>E / X</small></button>
      <button type="button" class="rl-btn" data-pick="glider">Glider <small>F / Y</small></button>
      <div class="rl-skymenu-why"></div>
      <button type="button" class="rl-btn small ghost" data-pick="">Not now</button>
    </div>`;
  root.append(el);
  const $ = s => el.querySelector(s);
  const alt = $('.rl-sky-alt'), light = $('.rl-sky-light'), hp = $('.rl-hp'), btn = $('.rl-sky-btn'), done = $('.rl-sky-done'), menuEl = $('.rl-skymenu');
  const held = { open: false, flare: false };
  let btnKind = null, onPick = null, doneUntil = 0;
  const down = e => { e.preventDefault(); try { btn.setPointerCapture?.(e.pointerId); } catch { /* not live */ } if (btnKind) held[btnKind] = true; btn.classList.add('down'); };
  const up = () => { held.flare = false; btn.classList.remove('down'); };
  btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  menuEl.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b || b.disabled) return; pick(b.dataset.pick || null); });
  function pick(choice) { const f = onPick; onPick = null; menuEl.hidden = true; f?.(choice); }
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  return {
    el,
    update({ sky = null, hp: h = null, down: d = 'ok', wait = 0 } = {}) {
      // altitude + what is happening
      if (sky && sky.alt != null) { alt.hidden = false; set(alt.querySelector('b'), String(Math.max(0, Math.round(sky.alt)))); set(alt.querySelector('em'), sky.label || ''); alt.classList.toggle('low', sky.mode === 'fall' && sky.alt < 300); }
      else alt.hidden = true;
      if (sky && sky.light) { light.hidden = false; light.className = 'rl-sky-light ' + sky.light; set(light.querySelector('span'), sky.lightText || ''); } else light.hidden = true;
      // the one big button: OPEN in free fall, FLARE (hold) under the canopy
      const kind = sky?.button || null;
      if (kind !== btnKind) { btnKind = kind; held.open = false; held.flare = false; btn.hidden = !kind; if (kind) set(btn, kind === 'open' ? 'OPEN' : 'FLARE'); btn.classList.toggle('flare', kind === 'flare'); btn.title = kind === 'open' ? 'Open the parachute (Space / A)' : 'Flare: hold to brake before landing (Space / S / LT)'; }
      // health: only after damage
      if (h != null) {
        hp.hidden = false;
        hp.querySelector('i').style.width = Math.max(0, Math.min(100, h)) + '%';
        hp.classList.toggle('hurt', h < 40);
        set(hp.querySelector('span'), d === 'out' ? `Knocked out — up in ${Math.ceil(wait)}` : d === 'down' ? `Knocked down — up in ${Math.ceil(wait)}` : `${Math.round(h)} / 100`);
      } else hp.hidden = true;
      // a landing's result, for a few seconds
      if (sky?.landed && sky.landed.at !== done.dataset.at) { done.dataset.at = sky.landed.at; set(done, sky.landed.text); done.hidden = false; doneUntil = performance.now() + 6000; }
      if (!done.hidden && performance.now() > doneUntil) done.hidden = true;
    },
    pressed(k) { const v = held[k]; if (k === 'open') held.open = false; return v; },
    menu({ gliderWhy = null, onPick: f }) {
      onPick = f;
      const g = menuEl.querySelector('[data-pick="glider"]');
      g.disabled = !!gliderWhy;
      set(menuEl.querySelector('.rl-skymenu-why'), gliderWhy || '');
      menuEl.hidden = false;
      try { document.exitPointerLock?.(); } catch { /* fine */ }
    },
    get menuOpen() { return !menuEl.hidden; },
    pick,
    closeMenu() { if (!menuEl.hidden) pick(null); },
    dispose() { el.remove(); },
  };
}
