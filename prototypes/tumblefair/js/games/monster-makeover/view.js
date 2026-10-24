// MONSTER MAKEOVER on a screen: a cosy monster salon at night. While dressing, a phone shows the client's request
// card on top (each wish ticks green when your monster meets it, and the style counter says how many pieces fit),
// the monster itself big in the middle (drawn by monster-svg.js, redrawn on every tap), six slot tabs and the parts
// of the chosen slot as big buttons (a ♥ / 👻 / ✨ badge says which style each piece is), and DONE. Then the mirror:
// every makeover in turn with the stars the client gives it; then the vote (tap the look you like best, not your own);
// then the results with names, stars, votes and the client's favourite.
import { esc, chip } from '../../client/gamehud.js';
import { monsterSvg, FURS, FUR_NAMES } from '../monster-svg.js';
import { SLOTS, PARTS, NONE_OK, meets, starsFor, lookOf } from './sim.js';
const HAT_COL = { witch: '#3a2160', top: '#1d1f24', bow: '#ff5f8f', crown: '#ffd23f', pumpkin: '#ff7a14', cap: '#3d8bff' };
const EXTRA_COL = { cape: '#b3263f', bowtie: '#ff5f8f', scarf: '#ffd23f', wings: '#4a2f78' };
const SLOT_NAME = { fur: 'Fur', eyes: 'Eyes', horns: 'Horns', hat: 'Hat', mouth: 'Mouth', extra: 'Wear' };
const BADGE = { cute: '♥', spooky: '👻', fancy: '✨' };
const STYLE_WORD = { cute: 'CUTE', spooky: 'SPOOKY', fancy: 'FANCY' };
const PART_NAME = { little: 'little horns', big: 'big horns', curly: 'curly horns', witch: 'witch hat', top: 'top hat', bow: 'big bow', crown: 'crown', pumpkin: 'pumpkin cap', cap: 'bobble cap',
  smile: 'smile', tongue: 'tongue out', grin: 'big grin', oh: 'little "oh"', cape: 'cape', bowtie: 'bow tie', scarf: 'scarf', wings: 'bat wings', none: 'none' };
const partName = (s, v) => s === 'fur' ? `${v} fur` : s === 'eyes' ? `${v} eye${v === '1' ? '' : 's'}` : PART_NAME[v] || v;
export function wishText(w) {
  if (w.none) return `NO ${w.s === 'extra' ? 'clothes' : w.s === 'horns' ? 'horns' : 'hat'}`;
  if (w.any) return 'a HAT';
  if (w.s === 'fur') return `${String(w.v).toUpperCase()} fur`;
  if (w.s === 'eyes') return `${w.v} EYE${w.v === '1' ? '' : 'S'}`;
  return (PART_NAME[w.v] || w.v).toUpperCase();
}
export function descOf(look, req) {
  return { body: req.body, fur: FURS[Math.max(0, FUR_NAMES.indexOf(look.fur))], eyes: +look.eyes, legs: req.legs, spots: req.spots, horns: look.horns === 'none' ? 0 : 2, hornKind: look.horns,
    hat: look.hat === 'none' ? null : look.hat, hatCol: HAT_COL[look.hat], mouth: look.mouth, extra: look.extra === 'none' ? null : look.extra, extraCol: EXTRA_COL[look.extra], size: 0.72 };
}
const starRow = (n, max) => '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, req = init.req;
  ui.innerHTML = `
    <div class="mm-top"><span class="mm-title">Monster Makeover</span><span class="clock"><b>--</b></span></div>
    <div class="mm-card"><b class="mm-client">${esc(req.name)} wants:</b><span class="mm-wishes">${req.wishes.map((w, i) => `<i class="mm-wish" data-w="${i}">${esc(wishText(w))}</i>`).join('')}</span>
      <span class="mm-style">Make me <b>${STYLE_WORD[req.style]} ${BADGE[req.style]}</b> <em class="mm-styled"></em></span></div>
    <div class="mm-stage"><div class="mm-mirror"></div><div class="mm-stars"></div><div class="mm-say"></div></div>
    <div class="mm-dress">
      <div class="mm-tabs">${SLOTS.map(s => `<button class="mm-tab" data-s="${s}">${SLOT_NAME[s]}</button>`).join('')}</div>
      <div class="mm-parts"></div>
      <button class="mm-done big-btn">DONE!</button>
    </div>
    <div class="mm-grid"></div>
    <div class="mm-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="mm-st"></strong>')).join('')}</div>
    <p class="mm-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'dress';
  const client = { ...req.base };
  let tray = null, outfit = Object.fromEntries(SLOTS.map(s => [s, -1])), done = false, mine = null, myVote = null, tab = 'fur', phase = 'dress', last = null, shownWalk = -1;
  const myLook = () => tray ? lookOf(req, tray, outfit) : { look: { ...client }, chosen: {} };

  const tick = look => ui.querySelectorAll('.mm-wish').forEach((el, i) => el.classList.toggle('met', !!look && meets(look, req.wishes[i])));
  function paintMonster() {
    const { look, chosen } = myLook(), s = starsFor(look, chosen, req);
    $('.mm-mirror').innerHTML = monsterSvg(descOf(look, req));
    tick(look);
    $('.mm-styled').textContent = `${s.styled} piece${s.styled === 1 ? '' : 's'}${s.styled >= 5 ? ' ★★' : s.styled >= 3 ? ' ★' : ` (3 = ★)`}`;
    $('.mm-stars').textContent = starRow(s.stars, init.max);
  }
  function paintParts() {
    ui.querySelectorAll('.mm-tab').forEach(b => { b.classList.toggle('on', b.dataset.s === tab); b.classList.toggle('set', outfit[b.dataset.s] >= 0); });
    if (!tray) { $('.mm-parts').innerHTML = ''; return; }
    $('.mm-parts').innerHTML = tray[tab].map((v, i) => {
      const tags = v === 'none' ? [] : PARTS[tab][v] || [], sw = tab === 'fur' ? `<i class="mm-sw" style="background:${FURS[FUR_NAMES.indexOf(v)]}"></i>` : '';
      return `<button class="mm-part${outfit[tab] === i ? ' on' : ''}" data-i="${i}">${sw}<span>${esc(partName(tab, v))}</span><em>${tags.map(t => BADGE[t]).join('')}</em></button>`;
    }).join('') + `<button class="mm-part mm-undo${outfit[tab] === -1 ? ' on' : ''}" data-i="-1"><span>as it came in</span><em></em></button>`;
  }
  function wear(i) {
    if (watching || phase !== 'dress' || !tray) return;
    outfit[tab] = i; done = false; ctx.send('wear', { s: tab, i }); ctx.sfx('pick');
    // hop to the next slot that has not been set yet, so a quick dresser just keeps tapping
    if (i >= 0) { const nx = SLOTS.find(s => outfit[s] < 0 && s !== tab); if (nx) setTimeout(() => { tab = nx; paintParts(); }, 220); }
    paintParts(); paintMonster(); paintDone();
  }
  function paintDone() { const b = $('.mm-done'); b.textContent = done ? 'Ready! (tap to keep dressing)' : 'DONE!'; b.classList.toggle('on', done); }
  ui.addEventListener('click', e => {
    const t = e.target.closest('.mm-tab'); if (t) { tab = t.dataset.s; paintParts(); ctx.sfx('tap'); return; }
    const p = e.target.closest('.mm-part'); if (p) { wear(+p.dataset.i); return; }
    if (e.target.closest('.mm-done')) { if (watching || phase !== 'dress') return; done = !done; ctx.send('done', done); ctx.sfx(done ? 'good' : 'tap'); paintDone(); return; }
    const v = e.target.closest('.mm-look'); if (v && phase === 'vote' && !watching && myVote == null && +v.dataset.i !== mine) { myVote = +v.dataset.i; ctx.send('vote', myVote); ctx.sfx('pick'); paintGrid(last); }
  });
  function paintGrid(g) {
    if (!g?.show) { $('.mm-grid').innerHTML = ''; return; }
    const rev = g.reveal;
    $('.mm-grid').innerHTML = g.show.map((s, i) => {
      const pid = rev ? rev.who[i] : null, p = players.find(x => x.pid === pid);
      const cls = ['mm-look', i === mine ? 'mine' : '', i === myVote ? 'voted' : '', rev && rev.fav === pid ? 'fav' : ''].join(' ');
      const tag = rev ? `<b class="mm-who" style="--seat:${p?.color}">${esc(p?.name || '')}</b><span class="mm-pts">${starRow(rev.stars[pid], init.max)}${init.vote ? ` · ${rev.got[pid]} vote${rev.got[pid] === 1 ? '' : 's'}` : ''}${rev.fav === pid ? ' · 🎀' : ''}</span>`
        : i === mine ? '<b class="mm-who">Yours</b>' : `<b class="mm-who">Look ${i + 1}</b>`;
      return `<button class="${cls}" data-i="${i}"${phase !== 'vote' || i === mine || watching || myVote != null ? ' disabled' : ''}>${monsterSvg(descOf(s.look, req))}${tag}</button>`;
    }).join('');
    $('.mm-grid').dataset.n = g.show.length;
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.mm-players [data-pid="${p.pid}"]`); if (!el) continue;
      el.querySelector('.sc').textContent = g.scores?.[p.pid] ?? 0;
      const st = el.querySelector('.mm-st');
      st.textContent = g.phase === 'dress' && g.done?.includes(p.pid) ? 'ready' : g.phase === 'vote' && g.voted?.includes(p.pid) ? 'voted' : '';
    }
  }
  function note(g) {
    if (g.phase === 'dress') return watching ? `${g.done.length} of ${players.length} ready` : done ? 'Ready! Waiting for the others…' : 'TAP parts to meet every wish, then DONE!';
    if (g.phase === 'show') return `In the mirror: makeover ${g.walk + 1} of ${g.show.length}`;
    if (g.phase === 'vote') return watching ? `${g.voted.length} voted` : myVote != null ? 'Voted!' : 'TAP your favourite look (not your own!)';
    if (g.phase === 'reveal') {
      if (init.solo && me != null) { const s = g.reveal.stars[me], m = init.max; return `${s} of ${m} stars — ${s >= m ? 'GOLD medal!' : s >= m - 1 ? 'SILVER medal!' : s >= m - 2 ? 'BRONZE medal!' : 'keep practising!'}`; }
      const best = Math.max(...players.map(p => g.scores[p.pid])), tops = players.filter(p => g.scores[p.pid] === best);
      return tops.length === 1 ? `${req.name} loves it! Top stylist: ${tops[0].name}!` : `${req.name} loves them all!`;
    }
    return '';
  }
  paintMonster(); paintParts();
  return {
    priv(d) {
      if (d.tray && !tray) { tray = d.tray; outfit = { ...d.outfit }; done = d.done; paintParts(); paintMonster(); paintDone(); }
      if (d.mine != null) mine = d.mine;
      if (d.vote != null) myVote = d.vote;
    },
    state(g) {
      last = g;
      if (g.phase !== phase) {
        if (g.phase === 'show') ctx.sfx('open');
        if (g.phase === 'vote') { paintGrid(g); tick(null); ctx.sfx('tap'); }
        if (g.phase === 'reveal') { paintGrid(g); ctx.sfx('win'); }
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'dress' && g.left <= 5);
      if (g.phase === 'show' && g.walk !== shownWalk) {
        shownWalk = g.walk; const s = g.show[g.walk];
        $('.mm-mirror').innerHTML = monsterSvg(descOf(s.look, req));
        $('.mm-stars').textContent = starRow(s.stars, init.max); tick(s.look);
        $('.mm-say').textContent = g.walk === mine ? 'Your makeover!' : s.stars >= init.max ? 'I LOVE it!' : s.stars >= init.max - 1 ? 'Ooh, lovely!' : s.stars >= 2 ? 'Hmm, not bad!' : 'Oh dear…';
        const m = $('.mm-mirror'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
        ctx.sfx(s.stars >= init.max - 1 ? 'good' : 'tap');
      }
      if (g.phase === 'vote' || g.phase === 'reveal') paintGrid(g);
      paintChips(g);
      $('.mm-note').textContent = note(g);
    },
    dispose() {},
  };
}
