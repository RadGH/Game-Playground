// TIP THE SCALES on a screen. A big fairground balance (SVG): the mystery thing on the left pan, an empty right pan,
// the beam tipped down on the thing's side. The hint card under it ("a horse = 400 ducks"). A phone that plays gets a
// big number, a log-scale slider (1 to 9,999 ducks: every step is the same SHARE, so small and huge numbers are equally
// easy to reach with a thumb), − / + nudges (5% each) and OK. Every change is sent as a draft, so a number never OK'd
// still counts. The reveal rains ducks onto the right pan with a counter, the beam levels out as the count reaches the
// answer, and every guess waits on a meter and pops when the counter passes it.
import { esc, chip } from '../../client/gamehud.js';
import { THINGS, HINTS, DUCK_KG, MAX_GUESS, ducksOf } from './sim.js';
import { ICONS } from './icons.js';

const COUNT_MS = 3400, TILT = 15, PILE = 35, LOGMAX = Math.log(MAX_GUESS);
const byId = Object.fromEntries([...THINGS, ...HINTS].map(t => [t.id, t]));

/** An icon as an SVG <g> scaled into a size x size box centred on (cx, cy). */
function icon(name, cx, cy, size, pri = '#6a4a2a', sec = '#d8a060') {
  const ic = ICONS[name]; if (!ic) return '';
  const [w, h, s2, p1] = ic, k = size / Math.max(w, h);
  return `<g transform="translate(${(cx - w * k / 2).toFixed(1)} ${(cy - h * k / 2).toFixed(1)}) scale(${k.toFixed(4)})"><path d="${s2}" fill="${sec}"/><path d="${p1}" fill="${pri}"/></g>`;
}
const iconSvg = (name, size = 36) => { const ic = ICONS[name]; return ic ? `<svg viewBox="0 0 ${ic[0]} ${ic[1]}" width="${size}" height="${size}" aria-hidden="true"><path d="${ic[2]}" fill="#d8a060"/><path d="${ic[3]}" fill="#6a4a2a"/></svg>` : ''; };
/** The duck pile: slot i -> [x, y] around (0, 0), a little pyramid, bottom row first. */
const PILE_AT = (() => { const out = []; let row = 0; while (out.length < PILE) { const n = 9 - row; for (let i = 0; i < n && out.length < PILE; i++) out.push([(i - (n - 1) / 2) * 9, -row * 8]); row++; } return out; })();
const posOf = n => Math.round(Math.log(Math.max(1, n)) / LOGMAX * 1000);
const nOf = pos => Math.max(1, Math.min(MAX_GUESS, Math.round(Math.exp(pos / 1000 * LOGMAX))));
const fmt = n => n.toLocaleString('en-US');

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  ui.innerHTML = `
    <div class="ts-top"><span class="ts-title">Tip the Scales</span><span class="ts-round"></span><span class="clock"><b>--</b></span></div>
    <p class="ts-ask"></p>
    <div class="ts-stage"><svg class="ts-svg" viewBox="0 0 300 190" aria-hidden="true">
      <defs><linearGradient id="ts-wood" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e8b060"/><stop offset="1" stop-color="#a86a28"/></linearGradient></defs>
      <path d="M128 186 L150 52 L172 186 Z" fill="url(#ts-wood)" stroke="#0d2228" stroke-width="3"/>
      <rect x="104" y="178" width="92" height="10" rx="4" fill="#a86a28" stroke="#0d2228" stroke-width="3"/>
      <g class="ts-beam"><rect x="28" y="40" width="244" height="10" rx="5" fill="#ffd23f" stroke="#0d2228" stroke-width="3"/>
        <path d="M150 34 l6 8 h-12 z" fill="#ff5f5f" stroke="#0d2228" stroke-width="2"/></g>
      <circle cx="150" cy="45" r="7" fill="#ff5f5f" stroke="#0d2228" stroke-width="3"/>
      <g class="ts-panL"><path d="M0 0 L-30 54 M0 0 L30 54" stroke="#0d2228" stroke-width="2"/><path d="M-42 54 H42 Q36 70 0 70 Q-36 70 -42 54 Z" fill="#c8d4dc" stroke="#0d2228" stroke-width="3"/><g class="ts-thing"></g></g>
      <g class="ts-panR"><path d="M0 0 L-30 54 M0 0 L30 54" stroke="#0d2228" stroke-width="2"/><path d="M-42 54 H42 Q36 70 0 70 Q-36 70 -42 54 Z" fill="#c8d4dc" stroke="#0d2228" stroke-width="3"/>
        <g class="ts-pile">${PILE_AT.map(([x, y], i) => `<g class="ts-duck" data-i="${i}">${icon('duck', x, 48 + y, 11, '#e8a920', '#ffd23f')}</g>`).join('')}</g>
        <text class="ts-q" x="0" y="40" text-anchor="middle">?</text></g>
    </svg><div class="ts-count"><b>0</b><span>ducks</span></div></div>
    <p class="ts-hint"></p>
    <div class="ts-guess">
      <div class="ts-entry"><span class="ts-disp">?</span><small>ducks</small><em class="ts-sent"></em></div>
      <input class="ts-slide" type="range" min="0" max="1000" step="1" value="${posOf(50)}" aria-label="Your guess, in ducks">
      <div class="ts-btns"><button class="ts-nudge" data-k="-1" aria-label="A few less">−</button><button class="ts-ok">OK</button><button class="ts-nudge" data-k="1" aria-label="A few more">+</button></div>
    </div>
    <div class="ts-meter"><div class="ts-track"><i class="ts-needle"></i></div><div class="ts-pins"></div></div>
    <div class="ts-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="ts-st"></strong>')).join('')}</div>
    <p class="ts-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.ts-players [data-pid="${me}"]`)?.classList.add('me');
  const beam = $('.ts-beam'), panL = $('.ts-panL'), panR = $('.ts-panR'), ducks = [...ui.querySelectorAll('.ts-duck')];
  let phase = '', round = -2, val = null, ok = false, counting = null, lastG = null, lastSend = 0, sendTimer = 0, tilt = TILT, tiltWant = TILT;

  function setTilt(a) {          // a > 0: the left (thing) side is down
    tilt = a; const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    beam.setAttribute('transform', `rotate(${-a} 150 45)`);
    panL.setAttribute('transform', `translate(${(150 - 118 * c).toFixed(1)} ${(45 + 118 * s).toFixed(1)})`);
    panR.setAttribute('transform', `translate(${(150 + 118 * c).toFixed(1)} ${(45 - 118 * s).toFixed(1)})`);
  }
  setTilt(TILT);
  const showDucks = k => ducks.forEach((d, i) => d.classList.toggle('on', i < k));

  function paintEntry() {
    $('.ts-disp').textContent = val == null ? '?' : fmt(val);
    $('.ts-disp').classList.toggle('empty', val == null);
    $('.ts-sent').textContent = ok ? 'Locked in!' : val != null ? 'Press OK' : '';
    $('.ts-ok').disabled = val == null; $('.ts-ok').classList.toggle('on', ok);
    ui.classList.toggle('is-ok', ok);
  }
  function send(lock, now = false) {
    ok = !!lock && val != null; paintEntry();
    clearTimeout(sendTimer);
    const go = () => { lastSend = performance.now(); ctx.send('guess', { n: val, ok }); };
    if (now || ok || performance.now() - lastSend > 160) go(); else sendTimer = setTimeout(go, 170);
  }
  $('.ts-slide').addEventListener('input', e => { if (watching || phase !== 'guess') return; val = nOf(+e.target.value); send(false); });
  ui.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || watching || phase !== 'guess') return;
    if (b.dataset.k) {
      const base = val ?? nOf(+$('.ts-slide').value), step = Math.max(1, Math.round(base * 0.05));
      val = Math.max(1, Math.min(MAX_GUESS, base + step * +b.dataset.k)); $('.ts-slide').value = posOf(val); ctx.sfx('tap'); send(false, true);
    } else if (b.classList.contains('ts-ok') && val != null) { ctx.sfx('good'); send(true, true); }
  });

  function drawRound(g) {
    const t = byId[g.thing], h = byId[g.hint];
    $('.ts-thing').innerHTML = icon(t.icon, 0, 30, 56);
    $('.ts-ask').innerHTML = `How many ducks weigh the same as <b>${esc(t.name)}</b>?<small>1 duck = ${DUCK_KG} kg</small>`;
    $('.ts-hint').innerHTML = `${iconSvg(h.icon, 30)}<span>Hint: ${esc(h.name)} = <b>${fmt(ducksOf(h.kg))} ducks</b></span>`;
  }
  function startReveal(r) {
    const n = r.n, given = players.filter(p => r.guesses[p.pid] != null), vals = [n, ...given.map(p => r.guesses[p.pid])];
    const lo = Math.log(Math.min(...vals) / 1.6), hi = Math.log(Math.max(...vals) * 1.6), at = v => Math.min(95, Math.max(5, (Math.log(v) - lo) / (hi - lo) * 100));
    const lastX = [], rowOf = x => { let k = lastX.findIndex(v => x - v >= 30); if (k < 0) k = lastX.length < 4 ? lastX.length : lastX.indexOf(Math.min(...lastX)); lastX[k] = x; return k; };
    const placed = given.sort((a, b) => r.guesses[a.pid] - r.guesses[b.pid]).map(p => { const x = at(r.guesses[p.pid]); return { p, x, row: rowOf(x) }; });
    $('.ts-pins').style.height = (Math.max(1, lastX.length) * 42 + 8) + 'px';
    $('.ts-pins').innerHTML = placed.map(({ p, x, row }) => `
      <span class="ts-pin" data-pid="${p.pid}" style="--x:${x}%;--seat:${p.color};--row:${row}">
        <i class="ts-face">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : ''}</i><b>${fmt(r.guesses[p.pid])}</b><small>${esc(p.name)}</small></span>`).join('') || '<em class="ts-none">Nobody guessed!</em>';
    ui.classList.add('counting');
    counting = { n, at, r, t0: performance.now(), shown: -1, lastTick: 0, done: false };
  }
  function finishReveal() {
    const c = counting; c.done = true; ui.classList.remove('counting');
    $('.ts-count b').textContent = fmt(c.n); $('.ts-needle').style.left = c.at(c.n) + '%'; showDucks(PILE); tiltWant = 0;
    for (const p of players) {
      const pin = ui.querySelector(`.ts-pin[data-pid="${p.pid}"]`);
      if (pin) { pin.classList.toggle('best', c.r.closest.includes(p.pid)); pin.classList.toggle('exact', c.r.spot.includes(p.pid)); pin.classList.add('passed'); }
    }
    ui.classList.add('counted'); ctx.sfx(c.r.spot.length ? 'win' : 'coins');
    paintChips(lastG);
  }
  function paintChips(g) {
    if (!g) return;
    for (const p of players) {
      const el = ui.querySelector(`.ts-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.ts-st'); let t = '', cls = '';
      if (g.phase === 'guess') { if (g.in.includes(p.pid)) { t = 'locked in'; cls = 'in'; } else if (g.typing.includes(p.pid)) t = 'weighing…'; else t = 'thinking…'; }
      if (g.phase === 'reveal' && counting?.done) { const r = g.reveal, gu = r.guesses[p.pid]; t = gu == null ? 'no guess' : `${fmt(gu)} (+${r.gain[p.pid]})`; cls = r.spot.includes(p.pid) ? 'exact' : r.closest.includes(p.pid) ? 'best' : ''; }
      st.textContent = t; st.className = 'ts-st ' + cls; el.classList.toggle('in', cls === 'in');
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Roll up, roll up! Bring your ducks…';
    if (g.phase === 'end') return 'All weighed! Most points wins.';
    if (g.phase === 'reveal') {
      if (!counting?.done) return 'Here come the ducks…';
      const r = g.reveal, nm = pid => players.find(p => p.pid === pid)?.name || '?', t = byId[g.thing];
      if (r.spot.length) return `Spot on! ${r.spot.map(nm).join(' and ')} nailed it: ${fmt(r.n)} ducks!`;
      if (r.closest.length) return `${r.closest.map(nm).join(' and ')} ${r.closest.length > 1 ? 'were' : 'was'} closest! ${t.name[0].toUpperCase() + t.name.slice(1)} = ${fmt(r.n)} ducks.`;
      return `${t.name[0].toUpperCase() + t.name.slice(1)} = ${fmt(r.n)} ducks (${fmt(t.kg)} kg).`;
    }
    if (watching) return `${g.in.length} of ${players.length} locked in`;
    return ok ? 'Locked in. You can still change it.' : 'Slide to guess, nudge with − / +, then press OK.';
  }

  return {
    priv(d) { if (phase === 'guess' && d.guess != null && val == null) { val = d.guess; ok = d.ok; $('.ts-slide').value = posOf(val); paintEntry(); } },
    state(g) {
      lastG = g;
      if (g.thing && g.round !== round) { round = g.round; drawRound(g); }
      if (g.phase !== phase) {
        if (g.phase === 'guess') { val = null; ok = false; $('.ts-slide').value = posOf(ducksOf(byId[g.hint].kg)); paintEntry(); counting = null; ui.classList.remove('counting', 'counted'); showDucks(0); tiltWant = TILT; $('.ts-count b').textContent = '0'; ctx.sfx('open'); }
        if (g.phase === 'reveal') startReveal(g.reveal);
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'guess' && g.left <= 5);
      $('.ts-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1}/${init.rounds}`;
      $('.ts-entry').classList.toggle('nudge', g.phase === 'guess' && g.left <= 5 && g.left > 0 && !ok && !watching);
      paintChips(g);
      $('.ts-note').textContent = note(g);
    },
    frame(dt) {
      const c = counting;
      if (c && !c.done) {
        const t = Math.min(1, (performance.now() - c.t0) / COUNT_MS), e = 1 - Math.pow(1 - t, 2.2), v = Math.max(1, Math.round(c.n * e));
        if (v !== c.shown) {
          c.shown = v; $('.ts-count b').textContent = fmt(v);
          showDucks(c.n <= PILE ? v : Math.ceil(PILE * e));
          $('.ts-needle').style.left = c.at(v) + '%';
          for (const pin of ui.querySelectorAll('.ts-pin:not(.passed)')) if (+pin.querySelector('b').textContent.replace(/,/g, '') <= v) pin.classList.add('passed');
          const now = performance.now(); if (now - c.lastTick > 110) { c.lastTick = now; ctx.sfx('tap'); }
        }
        tiltWant = TILT * (1 - e);
        if (t >= 1) finishReveal();
        if (lastG) $('.ts-note').textContent = note(lastG);
      }
      if (Math.abs(tilt - tiltWant) > 0.05) setTilt(tilt + (tiltWant - tilt) * Math.min(1, (dt || 0.016) * 8));
    },
    dispose() { clearTimeout(sendTimer); },
  };
}
