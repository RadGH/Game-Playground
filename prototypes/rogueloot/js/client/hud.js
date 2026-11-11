// The fight HUD: your frame (health, mana, level, experience), the target frame (name, level, health, its cast bar),
// your cast bar, the action bar (desktop) / skill arc (phone, ruling 21), floating numbers, the "why not" line, and the
// death panel. Pure DOM; main.js feeds it snapshots and wires the buttons.
import { xpAtLevel, xpToNext } from '../rules/progression.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = { attack: '⚔', sword: '🗡', bolt: '⚡', heal: '✚', shove: '✋', potion: '⚗' };
export const BAR = ['sure_strike', 'spark', 'field_mend', 'shove'];        // M9 makes the bar the player's own

export function createHud(root, { skills, onUse, onTargetNext, onRelease, isTouch, onBag = () => {} }) {
  root.innerHTML = `
    <div class="me-frame"><div class="lvl"></div><div class="bars"><div class="nm"></div><i class="hp"><b></b><span></span></i><i class="mp"><b></b><span></span></i></div></div>
    <div class="tg-frame" hidden><div class="nm"></div><i class="hp"><b></b><span></span></i><div class="tcast" hidden><i><b></b></i><span></span></div></div>
    <div class="cast-bar" hidden><i><b></b></i><span></span></div>
    <div class="nope"></div>
    <div class="xp-bar"><b></b></div>
    <div class="action-bar"></div>
    <div class="arc"></div>
    <button class="bag-btn" aria-label="Character and bag">🎒<i class="dot" hidden></i></button>
    <div class="dead-panel" hidden><h2>You have fallen</h2><p>A friend can bring you back, or return to the waypoint.</p><button class="primary rel">Return to the waypoint</button></div>`;
  const $ = s => root.querySelector(s);
  const bar = $('.action-bar'), arc = $('.arc');
  const slots = [{ id: 'attack', key: '' }, ...BAR.map((id, i) => ({ id, key: String(i + 1) }))];
  const btns = new Map();
  for (const s of slots) {
    const sk = skills[s.id] || { name: s.id };
    const b = document.createElement('button'); b.className = 'slot'; b.dataset.skill = s.id; b.title = `${sk.name}${sk.desc ? ' — ' + sk.desc : ''}`;
    b.innerHTML = `<span class="ic">${ICONS[sk.icon] || ICONS[s.id] || '•'}</span><span class="key">${s.key}</span><i class="cd"></i><small>${esc(sk.name)}</small>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onUse(s.id); });
    bar.append(b);
    const a = b.cloneNode(true); a.className = 'arc-btn' + (s.id === 'attack' ? ' big' : '');
    a.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onUse(s.id); });
    arc.append(a);
    btns.set(s.id, [b, a]);
  }
  const next = document.createElement('button'); next.className = 'arc-btn next'; next.innerHTML = '<span class="ic">⟳</span><small>Next</small>';
  next.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onTargetNext(); }); arc.append(next);
  $('.rel').onclick = onRelease;
  $('.bag-btn').onclick = onBag;
  root.classList.toggle('touch', !!isTouch);

  let nopeT = 0;
  function nope(msg) { const n = $('.nope'); n.textContent = msg; n.classList.add('on'); clearTimeout(nopeT); nopeT = setTimeout(() => n.classList.remove('on'), 1400); }

  /** me = my snapshot row, ch = my character, tg = { name, lvl, hp, mhp, cast, rk } | null */
  function update(me, ch, tg) {
    if (!me) return;
    $('.me-frame .nm').textContent = me.name; $('.me-frame .lvl').textContent = me.lvl;
    bars($('.me-frame .hp'), me.hp, me.mhp); bars($('.me-frame .mp'), me.mp, me.mmp);
    if (ch) { const base = xpAtLevel(ch.level), need = xpToNext(ch.level); $('.xp-bar b').style.width = (Number.isFinite(need) ? Math.min(100, (ch.xp - base) / need * 100) : 100) + '%'; }
    const tf = $('.tg-frame');
    tf.hidden = !tg;
    if (tg) {
      tf.querySelector('.nm').innerHTML = `<b>${esc(tg.name)}</b> <span class="lv">${tg.lvl ? 'Level ' + tg.lvl : ''}${tg.rk ? ' · ' + esc(rankName(tg.rk)) : ''}</span>`;
      bars(tf.querySelector('.hp'), tg.hp, tg.mhp);
      const tc = tf.querySelector('.tcast'); tc.hidden = !tg.cast;
      if (tg.cast) { tc.querySelector('b').style.width = Math.min(100, (1 - tg.cast.left / tg.cast.t) * 100) + '%'; tc.querySelector('span').textContent = tg.cast.sk + (tg.cast.int ? '' : ' (cannot be stopped)'); tc.classList.toggle('int', !!tg.cast.int); }
    }
    const cb = $('.cast-bar'); cb.hidden = !me.cast;
    if (me.cast) { cb.querySelector('b').style.width = Math.min(100, (1 - me.cast.left / me.cast.t) * 100) + '%'; cb.querySelector('span').textContent = me.cast.sk === 'revive' ? 'Reviving…' : (skills[me.cast.sk]?.name || me.cast.sk); }
    for (const [id, [b, a]] of btns) {
      const sk = skills[id] || {};
      const cd = me.cds?.[id] || 0, g = (sk.gcd ?? true) && id !== 'attack' ? (me.gcd || 0) : 0;
      const left = Math.max(cd, g), total = cd > g ? (sk.cd || 1) : 1.5;
      for (const el of [b, a]) {
        el.querySelector('.cd').style.height = left > 0 ? Math.min(100, left / total * 100) + '%' : '0';
        el.classList.toggle('poor', (sk.cost?.mana || 0) > me.mp);
      }
    }
    $('.dead-panel').hidden = !me.dead;
    $('.bag-btn .dot').hidden = !(ch?.unspent > 0);
  }
  const bars = (el, v, m) => { el.querySelector('b').style.width = Math.max(0, Math.min(100, v / m * 100)) + '%'; el.querySelector('span').textContent = `${Math.max(0, Math.round(v))} / ${m}`; };

  // floating numbers: pooled
  const pool = [];
  function float(x, y, text, cls) {
    const el = pool.pop() || document.createElement('div');
    el.className = 'float ' + cls; el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px';
    root.append(el); el.getBoundingClientRect(); el.classList.add('go');
    setTimeout(() => { el.remove(); el.classList.remove('go'); pool.push(el); }, 1100);
  }
  return { update, nope, float, el: root };
}
const rankName = r => ({ champion: 'Champion', rare: 'Rare', boss: 'Boss', elite: 'Elite' }[r] || r);
