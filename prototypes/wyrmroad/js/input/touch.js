// On-screen controls for touch (one player): a stick and named buttons — Attack, Heavy, Jump, Dash, Block (hold),
// the two spells (by name), Breaker, and Grab when a road weapon lies within reach. Phone portrait: the controls sit
// in their own band BELOW the street (nothing over the fight); landscape: in the bottom corners. 44 px+ targets.
// iPhone: a fresh touch (no other fingers down) clears any pointer iOS forgot to end (lessons rule 30).
import { icon } from '../ui/icons.js';
import { esc } from '../ui/text.js';

const BTNS = [
  ['attack', 'Attack', 'attack', 'wr-tb-big'], ['heavy', 'Heavy', 'heavy', ''], ['jump', 'Jump', 'jump', ''], ['dash', 'Dash', 'dash', ''],
  ['block', 'Block', 'block', ''], ['spell1', 'Spell 1', 'spell', 'wr-tb-spell'], ['spell2', 'Spell 2', 'spell', 'wr-tb-spell'], ['breaker', 'Breaker', 'breaker', 'wr-tb-brk'],
  ['grab', 'Grab', 'grab', 'wr-tb-grab'],
];

export function createTouchControls(host, reader) {
  const el = document.createElement('div');
  el.className = 'wr-touch';
  el.innerHTML = `<div class="wr-stick" aria-label="Move"><i class="wr-stick-ring"></i><i class="wr-stick-knob"></i></div>
    <div class="wr-tbtns">${BTNS.map(([a, label, ic, cls]) => `<button type="button" class="wr-tb wr-tb-${a} ${cls}" data-a="${a}" aria-label="${label}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;
  host.append(el);
  const stick = el.querySelector('.wr-stick'), knob = el.querySelector('.wr-stick-knob');
  const st = reader.state;
  let stickId = null, cx = 0, cy = 0;
  const blockIds = new Set();
  const R = () => Math.max(36, stick.clientWidth * 0.36);

  function resetAll() { stickId = null; st.mx = 0; st.mz = 0; knob.style.transform = ''; blockIds.clear(); st.block = false; el.querySelectorAll('.wr-tb.on').forEach(b => b.classList.remove('on')); }
  // a fresh touch (the first finger of a new gesture) clears what iOS forgot — on pointerdown in the capture phase, so it
  // runs BEFORE the stick takes this pointer (touchstart fires after pointerdown and wiped the stick's own finger)
  el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && e.isPrimary) resetAll(); }, { capture: true });

  stick.addEventListener('pointerdown', e => {
    e.preventDefault(); try { stick.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    stickId = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e);
  });
  const move = e => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), r = R();
    if (d > r) { dx *= r / d; dy *= r / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mx = dx / r, mz = dy / r;
    st.mx = Math.abs(mx) < 0.18 ? 0 : mx; st.mz = Math.abs(mz) < 0.22 ? 0 : mz;       // up the screen = up the street
  };
  stick.addEventListener('pointermove', move);
  const endStick = e => { if (e.pointerId === stickId) { stickId = null; st.mx = 0; st.mz = 0; knob.style.transform = ''; } };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick); stick.addEventListener('lostpointercapture', endStick);

  el.querySelector('.wr-tbtns').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    const a = b.dataset.a; b.classList.add('on');
    if (a === 'block') { blockIds.add(e.pointerId); st.block = true; } else reader.press(a);
  });
  const up = e => {
    const b = e.target.closest?.('[data-a]');
    if (blockIds.delete(e.pointerId)) st.block = blockIds.size > 0;
    b?.classList.remove('on');
    if (!blockIds.size) el.querySelector('.wr-tb-block')?.classList.remove('on');
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.querySelector('.wr-tbtns').addEventListener(ev, up);
  el.addEventListener('contextmenu', e => e.preventDefault());

  return {
    el,
    /** Spell names on their buttons, Grab only when there is something to pick up. */
    sync(G, hero) {
      if (!hero) return;
      for (const k of [0, 1]) {
        const S = G.data.classes.spells[hero.spells[k]], b = el.querySelector(`[data-a="spell${k + 1}"]`);
        // the spell's own name when it fits the button, else "Spell 1" — never cut short (owner review 2026-11-20)
        const locked = !S || S.level > hero.level, key = `${S?.name}|${locked}`;
        if (b.dataset.k !== key) {
          b.dataset.k = key;
          b.innerHTML = `${icon(S && !locked ? hero.spells[k] : 'lock')}<span>${esc(S && !locked ? S.name : `Spell ${k + 1}`)}</span>`;
          const sp = b.querySelector('span');
          if (sp.scrollWidth > b.clientWidth - 4) sp.textContent = `Spell ${k + 1}`;
        }
        b.classList.toggle('wr-tb-off', locked || hero.mp < (S?.mp || 0) || (hero.cds?.[hero.spells[k]] || 0) > 0);
      }
      const near = G.props.some(p => p.type === 'weapon' && !p.taken && Math.abs(p.x - hero.x) < 1.1 && Math.abs(p.z - hero.z) < 0.8);
      el.classList.toggle('wr-touch-grab', near);
    },
    destroy() { resetAll(); el.remove(); },
  };
}
