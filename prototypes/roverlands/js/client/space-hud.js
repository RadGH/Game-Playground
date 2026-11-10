// The space bits of the HUD (Expansion 1 M11): the rocket's altitude / speed / throttle readout and countdown, the
// reentry glow over the whole screen, the one big round button a phone thumb needs (LAUNCH, STAGE, CHUTE, PUSH) and a
// smaller GRAB beside it on the station, a banner for news ("Touchdown!"), and the little travel menu (the station's
// docking hatch, the Moon's landing pad). Its own DOM and stylesheet (css/space.css), made and removed with a session.
//
//   const h = createSpaceHud();
//   h.update(state | null)     state = { alt, kmh, label, lever (0..1 | null), count (s | null), heat 0..1, button, button2, banner }
//   h.pressed(kind)            true once after that button was pressed (kind = 'launch' | 'stage' | 'chute' | 'push' | 'grab' | 'spin')
//   h.menu({ title, text, choices: [{ id, label, note }], onPick(id | null) });  h.menuOpen;  h.closeMenu()
//   h.dispose()
const LABEL = { launch: 'LAUNCH', stage: 'STAGE', chute: 'CHUTE', push: 'PUSH', grab: 'GRAB', let: 'LET GO', spin: 'SPIN' };
const TITLE = { launch: 'Start the countdown (W / Space / A)', stage: 'Separate the booster (fire)', chute: 'Open the parachute (fire / Space)', push: 'Push off the nearest wall or rail (Space / A)', grab: 'Grab the nearest rail (E / X)', let: 'Let go of the rail (E / X)', spin: 'Somersault (R / d-pad right)' };

export function createSpaceHud({ root = document.body } = {}) {
  if (!document.querySelector('link[data-rl-space]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/space.css'; l.dataset.rlSpace = '1'; document.head.append(l);
  }
  const el = document.createElement('div'); el.className = 'rl-spacehud';
  el.innerHTML = `<div class="rl-space-heat" hidden></div>
    <div class="rl-space-read" hidden><div class="rl-space-alt"><b>0</b><span>m</span></div><div class="rl-space-sub"><span class="kmh">0 km/h</span><em></em></div>
      <div class="rl-space-lever" hidden><i></i></div></div>
    <div class="rl-space-count" hidden></div>
    <div class="rl-space-banner" hidden></div>
    <button type="button" class="rl-space-btn" hidden data-nonav="1"></button>
    <button type="button" class="rl-space-btn2" hidden data-nonav="1"></button>
    <div class="rl-spacemenu" hidden role="dialog"><h3></h3><p></p><div class="rl-spacemenu-list"></div>
      <button type="button" class="rl-btn small ghost" data-pick="">Not now</button></div>`;
  root.append(el);
  const $ = s => el.querySelector(s);
  const heatEl = $('.rl-space-heat'), read = $('.rl-space-read'), count = $('.rl-space-count'), banner = $('.rl-space-banner'), btn = $('.rl-space-btn'), btn2 = $('.rl-space-btn2'), menuEl = $('.rl-spacemenu');
  const hit = new Set();
  let kind1 = null, kind2 = null, onPick = null, bannerText = '', bannerUntil = 0;
  for (const [b, which] of [[btn, 1], [btn2, 2]]) {
    b.addEventListener('pointerdown', e => { e.preventDefault(); const k = which === 1 ? kind1 : kind2; if (k) hit.add(k === 'let' ? 'grab' : k); b.classList.add('down'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('down'));
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  menuEl.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; pick(b.dataset.pick || null); });
  function pick(id) { const f = onPick; onPick = null; menuEl.hidden = true; f?.(id); }
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const setBtn = (b, k) => { b.hidden = !k; if (k) { set(b, LABEL[k] || k.toUpperCase()); b.title = TITLE[k] || ''; b.dataset.kind = k; } };
  return {
    el,
    update(st) {
      if (st && st.alt != null) {
        read.hidden = false;
        set(read.querySelector('b'), Math.max(0, Math.round(st.alt)).toLocaleString());
        set(read.querySelector('.kmh'), `${Math.round(st.kmh || 0)} km/h`);
        set(read.querySelector('em'), st.label || '');
        const lv = read.querySelector('.rl-space-lever');
        lv.hidden = st.lever == null; if (st.lever != null) lv.firstChild.style.width = Math.round(st.lever * 100) + '%';
      } else read.hidden = true;
      if (st && st.count != null) { count.hidden = false; set(count, String(Math.ceil(st.count))); } else count.hidden = true;
      const h = st?.heat || 0;
      heatEl.hidden = h < 0.02; if (!heatEl.hidden) heatEl.style.opacity = String(Math.min(0.85, h * 0.85));
      const k1 = st?.button || null, k2 = st?.button2 || null;
      if (k1 !== kind1) { kind1 = k1; setBtn(btn, k1); }
      if (k2 !== kind2) { kind2 = k2; setBtn(btn2, k2); }
      if (st?.banner && st.banner !== bannerText) { bannerText = st.banner; set(banner, st.banner); banner.hidden = false; bannerUntil = performance.now() + 6000; }
      if (!banner.hidden && performance.now() > bannerUntil) { banner.hidden = true; bannerText = ''; }
    },
    pressed(k) { if (!hit.has(k)) return false; hit.delete(k); return true; },
    menu({ title = '', text = '', choices = [], onPick: f }) {
      onPick = f;
      set(menuEl.querySelector('h3'), title); set(menuEl.querySelector('p'), text);
      menuEl.setAttribute('aria-label', title);
      menuEl.querySelector('.rl-spacemenu-list').innerHTML = choices.map((c, i) => `<button type="button" class="rl-btn${i === 0 ? ' primary' : ''}" data-pick="${c.id}"><b>${c.label}</b><small>${c.note || ''}</small></button>`).join('');
      menuEl.hidden = false;
      try { document.exitPointerLock?.(); } catch { /* fine */ }
    },
    get menuOpen() { return !menuEl.hidden; },
    pick,
    closeMenu() { if (!menuEl.hidden) pick(null); },
    dispose() { el.remove(); },
  };
}
