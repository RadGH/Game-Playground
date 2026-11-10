// The survey bits of the HUD (Expansion 1 M10): the live readout for the kit you are carrying / driving / standing by
// (green "Good spot" or red with the reason in plain words), the set-up progress bar while E is held, a HOLD TO SET UP
// button for touch screens, and a result card ("Weather Mast set up — excellent spot"). Its own DOM and stylesheet
// (css/survey.css), made and removed with a session.
//
//   const sh = createSurveyHud();
//   sh.update({ read: { name, colour, ok, line, sub } | null, hold: 0..1 | null, button: bool })   every frame
//   sh.card(text)      a result card        sh.held   true while the HOLD TO SET UP button is held down
//   sh.dispose()

export function createSurveyHud({ root = document.body } = {}) {
  if (!document.querySelector('link[data-rl-survey]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/survey.css'; l.dataset.rlSurvey = '1'; document.head.append(l);
  }
  const el = document.createElement('div'); el.className = 'rl-svhud';
  el.innerHTML = `<div class="rl-sv-read" hidden><i class="rl-sv-dot"></i><span><b></b><em></em><small></small></span><div class="rl-sv-bar" hidden><i></i></div></div>
    <button type="button" class="rl-sv-btn" hidden data-nonav="1" title="Hold to set up the kit (hold E / X)">HOLD TO<br>SET UP</button>
    <div class="rl-sv-card" hidden></div>`;
  root.append(el);
  const $ = s => el.querySelector(s);
  const read = $('.rl-sv-read'), bar = $('.rl-sv-bar'), btn = $('.rl-sv-btn'), card = $('.rl-sv-card');
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  let held = false, cardUntil = 0;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); held = true; btn.classList.add('down'); try { btn.setPointerCapture(e.pointerId); } catch { /* old browsers */ } });
  const up = () => { held = false; btn.classList.remove('down'); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  return {
    el,
    update({ read: r = null, hold = null, button = false } = {}) {
      if (r) {
        read.hidden = false;
        read.classList.toggle('ok', !!r.ok); read.classList.toggle('bad', !r.ok);
        read.style.setProperty('--kit', r.colour || '#8fd05a');
        set(read.querySelector('b'), r.name || 'Survey kit'); set(read.querySelector('em'), r.line || ''); set(read.querySelector('small'), r.sub || '');
      } else read.hidden = true;
      if (hold != null && r) { bar.hidden = false; bar.querySelector('i').style.width = (Math.max(0, Math.min(1, hold)) * 100).toFixed(1) + '%'; } else bar.hidden = true;
      btn.hidden = !button; if (!button) up();
      if (!card.hidden && performance.now() > cardUntil) card.hidden = true;
    },
    card(text) { set(card, text); card.hidden = false; cardUntil = performance.now() + 6000; },
    get held() { return held; },
    get readText() { return read.hidden ? null : `${read.querySelector('b').textContent} ${read.querySelector('em').textContent}`; },
    dispose() { el.remove(); },
  };
}
