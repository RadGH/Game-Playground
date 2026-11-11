// The fight HUD: your frame (health, mana, level, experience), the target frame (name, level, health, its cast bar),
// your cast bar, the action bar (desktop) / skill arc (phone, ruling 21), floating numbers, the "why not" line, and the
// death panel. Pure DOM; main.js feeds it snapshots and wires the buttons.
import { xpAtLevel, xpToNext } from '../rules/progression.js';
import { skillIcon, RES_NAME } from './skills-ui.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = { attack: '⚔', sword: '🗡', bolt: '⚡', heal: '✚', shove: '✋', potion: '⚗' };
export const BAR = ['sure_strike', 'spark', 'field_mend', 'shove', null, null];        // a hero with no bar yet

export function createHud(root, { skills, onUse, onTargetNext, onRelease, isTouch, onBag = () => {}, onDrink = () => {}, quest = null }) {
  root.innerHTML = `
    <div class="me-frame"><div class="lvl"></div><div class="bars"><div class="nm"></div><i class="hp"><b></b><span></span></i><i class="mp"><b></b><span></span></i><i class="rp" hidden><b></b><span></span></i></div></div>
    <div class="tg-frame" hidden><div class="nm"></div><i class="hp"><b></b><span></span></i><div class="tcast" hidden><i><b></b></i><span></span></div></div>
    <div class="cast-bar" hidden><i><b></b></i><span></span></div>
    <div class="nope"></div>
    <div class="xp-bar"><b></b></div>
    <div class="action-bar"></div>
    <div class="arc"></div>
    <button class="bag-btn" aria-label="Character and bag">🎒<i class="dot" hidden></i></button>
    <div class="quest-track" hidden><b class="qn"></b><p class="qt"></p><p class="qg"></p></div>
    <div class="dead-panel" hidden><h2>You have fallen</h2><p>A friend can bring you back, or return to the waypoint.</p><button class="primary rel">Return to the waypoint</button></div>`;
  const $ = s => root.querySelector(s);
  const bar = $('.action-bar'), arc = $('.arc');
  // slot 0 = Attack; slots 1-6 = the hero's own bar (ch.bar), refilled whenever it changes
  const btns = [];
  for (let i = 0; i < 7; i++) {
    const b = document.createElement('button'); b.className = 'slot'; b.dataset.i = i;
    b.innerHTML = `<span class="ic"></span><span class="key">${i ? i : 'F'}</span><i class="cd"></i><small></small>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onUse(i ? curBar[i - 1] : 'attack'); });
    bar.append(b);
    const a = b.cloneNode(true); a.className = 'arc-btn arc-' + i + (i === 0 ? ' big' : '');
    a.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onUse(i ? curBar[i - 1] : 'attack'); });
    arc.append(a);
    btns.push([b, a]);
  }
  let curBar = [], barKey = '';
  function fillBar(list) {
    curBar = list; barKey = JSON.stringify(list);
    btns.forEach(([b, a], i) => {
      const id = i ? list[i - 1] : 'attack', sk = id ? skills[id] : null;
      for (const el of [b, a]) { el.querySelector('.ic').textContent = id === 'attack' ? '⚔' : sk ? skillIcon(sk) : ''; el.querySelector('small').textContent = sk?.name || ''; el.classList.toggle('empty', !sk); el.title = sk ? `${sk.name}${sk.desc ? ' — ' + sk.desc.replace(/\{\w+\}/g, '…') : ''}` : ''; el.dataset.skill = id || ''; }
    });
  }
  fillBar([]);
  // potions (ruling 21's potion button; health and mana)
  const pots = {};
  for (const [kind, key, ic] of [['health', 'Q', '❤'], ['mana', 'E', '💧']]) {
    const mk = cls => { const b = document.createElement('button'); b.className = cls + ' pot pot-' + kind; b.innerHTML = `<span class="ic">${ic}</span><span class="key">${key}</span><b class="n">0</b><small>${kind === 'mana' ? 'Mana' : 'Healing'}</small>`; b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onDrink(kind); }); return b; };
    const a = mk('slot'), c = mk('arc-btn'); bar.append(a); arc.append(c); pots[kind] = [a, c];
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
    bars($('.me-frame .hp'), me.hp, me.mhp);
    // Fighters and Rogues have no mana bar (their Wanderer skills are re-priced): their own resource instead
    const rp = $('.me-frame .rp'), mp = $('.me-frame .mp'), other = me.res && me.res !== 'mana';
    mp.hidden = !!other; rp.hidden = !other;
    if (other) { bars(rp, me.rv, 100); rp.className = 'rp res-' + me.res; rp.querySelector('span').textContent = `${RES_NAME[me.res]} ${me.rv}`; } else bars(mp, me.mp, me.mmp);
    if (ch) { const want = JSON.stringify((me.sb || (ch.bar && ch.bar.length ? ch.bar : BAR)).slice(0, 6)); if (want !== barKey) fillBar(JSON.parse(want)); }
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
    for (const [b, a] of btns) {
      const id = b.dataset.skill; if (!id) continue;
      const sk = skills[id] || {};
      const cd = me.cds?.[id] || 0, g = (sk.gcd ?? true) && id !== 'attack' ? (me.gcd || 0) : 0;
      const left = Math.max(cd, g), total = cd > g ? (sk.cd || 1) : 1.5;
      for (const el of [b, a]) {
        el.querySelector('.cd').style.height = left > 0 ? Math.min(100, left / total * 100) + '%' : '0';
        const c = sk.cost ? Object.entries(sk.cost)[0] : null;
        el.classList.toggle('poor', !!c && (me.res && me.res !== 'mana' ? c[1] > (me.rv ?? 0) && c[0] !== 'mana' : c[0] === 'mana' && c[1] > me.mp));
      }
    }
    $('.dead-panel').hidden = !me.dead;
    if (ch && quest) { const q = quest(ch); const el = $('.quest-track'); el.hidden = !q; if (q) { el.querySelector('.qn').textContent = q.name; el.querySelector('.qt').textContent = q.progress || q.short || ''; const g = el.querySelector('.qg'); g.textContent = q.hint ? '➜ ' + q.hint : ''; g.hidden = !q.hint; } }
    $('.bag-btn .dot').hidden = !(ch?.unspent > 0 || ch?.skillPoints > 0 || (ch && !ch.path && ch.level >= 3));
    if (ch) for (const kind of ['health', 'mana']) { const n = (ch.belt || []).filter(x => x?.kind === kind).reduce((s, x) => s + x.n, 0) + (ch.bag || []).filter(x => x.base === 'potion' && x.kind === kind).reduce((s, x) => s + x.n, 0); for (const b of pots[kind]) { b.querySelector('.n').textContent = n; b.classList.toggle('poor', !n); } }
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
