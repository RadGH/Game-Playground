// The Rustwild bits of the HUD (Expansion 1 M8): the "Entering the Rustwild" notice, the vehicle's hit points (only
// in the zone), the camp you are fighting (what is left, or when it comes back), a camp-cleared card, and the REPAIR
// button (the Field repair kit; G / d-pad right too). Its own DOM and stylesheet (css/combat.css), made and removed
// with a session — the rest of the HUD (js/client/ui) does not need to know any of it.
//
//   const ch = createCombatHud();
//   ch.update({ vhp: { name, hp, max, wreck } | null, camp: string | null, repair: 'ready' | null })   every frame
//   ch.notice(title, sub)        the big zone notice (fades by itself)
//   ch.card(text)                a result card ("Redcut Camp cleared! +170 gold")
//   ch.pressed('repair')         true once after the REPAIR button was tapped
//   ch.dispose()

export function createCombatHud({ root = document.body } = {}) {
  if (!document.querySelector('link[data-rl-combat]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/combat.css'; l.dataset.rlCombat = '1'; document.head.append(l);
  }
  const el = document.createElement('div'); el.className = 'rl-cbhud';
  el.innerHTML = `<div class="rl-cb-notice" hidden><b></b><span></span></div>
    <div class="rl-cb-left">
      <div class="rl-cb-vhp" hidden><div class="rl-cb-row"><em></em><span></span></div><div class="rl-cb-bar"><i></i></div></div>
      <div class="rl-cb-camp" hidden></div>
    </div>
    <button type="button" class="rl-cb-repair" hidden data-nonav="1" title="Use the Field repair kit (G / d-pad right)">REPAIR</button>
    <div class="rl-cb-card" hidden></div>`;
  root.append(el);
  const $ = s => el.querySelector(s);
  const notice = $('.rl-cb-notice'), vhp = $('.rl-cb-vhp'), camp = $('.rl-cb-camp'), btn = $('.rl-cb-repair'), card = $('.rl-cb-card');
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  let noticeUntil = 0, cardUntil = 0, tapped = false;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); tapped = true; btn.classList.add('down'); });
  const up = () => btn.classList.remove('down');
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  return {
    el,
    update({ vhp: v = null, camp: c = null, repair = null } = {}) {
      const t = performance.now();
      if (v) {
        vhp.hidden = false;
        const k = v.max ? Math.max(0, Math.min(1, v.hp / v.max)) : 0;
        vhp.querySelector('i').style.width = (k * 100).toFixed(1) + '%';
        vhp.classList.toggle('low', k < 0.35); vhp.classList.toggle('wreck', !!v.wreck);
        set(vhp.querySelector('em'), v.name || 'Vehicle');
        set(vhp.querySelector('span'), v.wreck ? 'WRECKED' : `${Math.round(v.hp)} / ${v.max}`);
      } else vhp.hidden = true;
      if (c) { camp.hidden = false; set(camp, c); } else camp.hidden = true;
      btn.hidden = repair !== 'ready';
      if (!notice.hidden && t > noticeUntil) notice.hidden = true;
      if (!card.hidden && t > cardUntil) card.hidden = true;
    },
    notice(title, sub = '') {
      set(notice.querySelector('b'), title); set(notice.querySelector('span'), sub);
      notice.hidden = false; notice.classList.remove('go'); void notice.offsetWidth; notice.classList.add('go');
      noticeUntil = performance.now() + 4200;
    },
    card(text) { set(card, text); card.hidden = false; cardUntil = performance.now() + 6000; },
    get noticeText() { return notice.hidden ? null : notice.querySelector('b').textContent; },
    pressed(k) { if (k !== 'repair') return false; const v = tapped; tapped = false; return v; },
    dispose() { el.remove(); },
  };
}
