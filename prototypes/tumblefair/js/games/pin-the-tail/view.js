// PIN THE TAIL on a screen. One SVG paddock (160 x 100 units, the sim's own coordinates, so a tap is converted to
// paddock units with the SVG's own matrix and is the same on every screen size). The paddock (grass, fence, flowers,
// rocks, the animals) is one group that can turn (the spin trick); pins and the answer are drawn on top, unturned.
// Show: the animal, its tail spot as a pulsing star. Trick: the animal trots to its new spot / the paddock turns / two
// animals swap, by CSS transitions. Guess: the animals are gone (blurred in round 1); tap to put your pin, tap again to
// move it, DONE to lock. Reveal: the animal is back WITH its tail, and every pin in its seat colour with its name.
import { esc, chip } from '../../client/gamehud.js';
import { ANIMALS, BW, BH } from './sim.js';

const INK = '#0d2228';
const O = (w = 1.4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const leg = (x, y0, y1, c, hoof = '#4a3a30') => `<rect x="${x}" y="${y0}" width="5" height="${y1 - y0}" rx="2" fill="${c}" ${O()}/><rect x="${x}" y="${y1 - 3}" width="5" height="3" rx="1" fill="${hoof}" ${O(1)}/>`;
/** Each animal facing right, in its own box (ANIMALS[k].w x .h), without its tail. */
const BODY = {
  donkey: () => { const c = '#a3a9b3'; return `${leg(12, 26, 44, c)}${leg(18, 27, 44, c)}${leg(34, 27, 44, c)}${leg(40, 26, 44, c)}
    <ellipse cx="26" cy="22" rx="21" ry="12" fill="${c}" ${O()}/><ellipse cx="27" cy="27" rx="13" ry="5" fill="#d4d8de"/>
    <path d="M37 17 L43 5 L51 9 L46 24 Z" fill="${c}" ${O()}/><path d="M38 15 L44 4" stroke="#5b6170" stroke-width="3" stroke-linecap="round"/>
    <path d="M43 6 L40 0.5 L46.5 4 Z M46 6 L46 0.5 L50 5 Z" fill="${c}" ${O(1.1)}/>
    <ellipse cx="48" cy="12" rx="8" ry="6" transform="rotate(22 48 12)" fill="${c}" ${O()}/><ellipse cx="53" cy="15" rx="3.6" ry="3" fill="#d4d8de" ${O(1)}/>
    <circle cx="47.5" cy="9.5" r="1.3" fill="${INK}"/>`; },
  pony: () => { const c = '#c07a3e'; return `${leg(12, 26, 44, c)}${leg(18, 27, 44, c)}${leg(34, 27, 44, c)}${leg(40, 26, 44, c)}
    <ellipse cx="26" cy="21" rx="21" ry="11.5" fill="${c}" ${O()}/>
    <path d="M37 16 L44 4 L52 8 L46 23 Z" fill="${c}" ${O()}/><path d="M36 18 Q38 8 44 3 Q42 10 40 18 Z" fill="#5a3418" ${O(1)}/>
    <path d="M45 5 L44 0.5 L48.5 4 Z" fill="${c}" ${O(1.1)}/>
    <ellipse cx="49" cy="11" rx="7.5" ry="5.6" transform="rotate(25 49 11)" fill="${c}" ${O()}/><ellipse cx="53.5" cy="14" rx="2.8" ry="2.6" fill="#e3a46c" ${O(1)}/>
    <circle cx="48.5" cy="8.6" r="1.3" fill="${INK}"/><path d="M44 4 Q41 1 39 4" fill="#5a3418" ${O(1)}/>`; },
  goat: () => { const c = '#efe6d2'; return `<rect x="11" y="27" width="4" height="17" rx="1.6" fill="${c}" ${O()}/><rect x="17" y="28" width="4" height="16" rx="1.6" fill="${c}" ${O()}/><rect x="30" y="28" width="4" height="16" rx="1.6" fill="${c}" ${O()}/><rect x="36" y="27" width="4" height="17" rx="1.6" fill="${c}" ${O()}/>
    <ellipse cx="23" cy="22" rx="18" ry="10.5" fill="${c}" ${O()}/><path d="M34 18 L39 8 L45 10 L41 24 Z" fill="${c}" ${O()}/>
    <path d="M40 7 Q36 1 31 3 Q36 3 38 9 Z" fill="#8a7a66" ${O(1.1)}/><path d="M37 9 L32 10 L37 12 Z" fill="${c}" ${O(1)}/>
    <ellipse cx="43" cy="12" rx="6.6" ry="5" transform="rotate(28 43 12)" fill="${c}" ${O()}/><path d="M45 17 L45 23 L48 17 Z" fill="#c9bba0" ${O(1)}/>
    <circle cx="43" cy="10" r="1.2" fill="${INK}"/>`; },
  pig: () => { const c = '#ffaec4'; return `<rect x="12" y="27" width="5" height="9" rx="2" fill="${c}" ${O()}/><rect x="18" y="28" width="5" height="8" rx="2" fill="${c}" ${O()}/><rect x="31" y="28" width="5" height="8" rx="2" fill="${c}" ${O()}/><rect x="37" y="27" width="5" height="9" rx="2" fill="${c}" ${O()}/>
    <ellipse cx="25" cy="19" rx="21" ry="12.5" fill="${c}" ${O()}/><circle cx="41" cy="15" r="9" fill="${c}" ${O()}/>
    <path d="M36 8 L37 1.5 L42 7 Z M41 7 L44 1 L46 8 Z" fill="#ff8fae" ${O(1.1)}/><ellipse cx="48.5" cy="17" rx="3.4" ry="4.4" fill="#ff8fae" ${O()}/>
    <circle cx="48" cy="15.6" r=".8" fill="${INK}"/><circle cx="49" cy="18.4" r=".8" fill="${INK}"/><circle cx="42" cy="12.5" r="1.3" fill="${INK}"/>`; },
  cow: () => { const c = '#fbfbf7'; return `${leg(9, 25, 44, c, '#555')}${leg(15, 26, 44, c, '#555')}${leg(33, 26, 44, c, '#555')}${leg(39, 25, 44, c, '#555')}
    <rect x="5" y="9" width="40" height="20" rx="9" fill="${c}" ${O()}/><path d="M12 11 q6 -2 8 4 q-2 6 -8 4 Z M28 18 q6 -3 9 2 q-3 6 -9 3 Z" fill="${INK}"/>
    <ellipse cx="24" cy="29" rx="4" ry="2.6" fill="#ffb3c8" ${O(1)}/>
    <path d="M45 7 Q44 2 47 3 M55 7 Q56 2 53 3" fill="none" ${O(1.4)}/>
    <ellipse cx="50" cy="13" rx="7" ry="8" fill="${c}" ${O()}/><path d="M50 5 q5 1 6 7 q-6 0 -6 -7 Z" fill="${INK}"/><ellipse cx="52.5" cy="20" rx="6" ry="4" fill="#ffb3c8" ${O()}/>
    <circle cx="47.5" cy="11.5" r="1.3" fill="${INK}"/><circle cx="51" cy="20" r=".8" fill="${INK}"/><circle cx="55" cy="20" r=".8" fill="${INK}"/>`; },
  sheep: () => { const c = '#f7f3ea'; return `<rect x="12" y="27" width="4" height="13" rx="1.6" fill="#3c3a40" ${O(1)}/><rect x="18" y="28" width="4" height="12" rx="1.6" fill="#3c3a40" ${O(1)}/><rect x="30" y="28" width="4" height="12" rx="1.6" fill="#3c3a40" ${O(1)}/><rect x="36" y="27" width="4" height="13" rx="1.6" fill="#3c3a40" ${O(1)}/>
    <path d="M8 20 a6 6 0 0 1 6 -9 a7 7 0 0 1 11 -4 a7 7 0 0 1 12 1 a6 6 0 0 1 6 9 a6 6 0 0 1 -3 10 a7 7 0 0 1 -11 2 a7 7 0 0 1 -12 0 a6 6 0 0 1 -9 -9 Z" fill="${c}" ${O()}/>
    <ellipse cx="44" cy="14" rx="5.6" ry="7.2" transform="rotate(-15 44 14)" fill="#3c3a40" ${O()}/><path d="M39 9 L34 11 L39 13 Z" fill="#3c3a40" ${O(1)}/>
    <circle cx="45.5" cy="12" r="1.3" fill="#fff"/><path d="M40 7 q4 -4 8 0" fill="${c}" ${O(1)}/>`; },
};
/** Each animal's tail, starting at its tail point (ANIMALS[k].tail). */
const TAIL = {
  donkey: ([x, y]) => `<path d="M${x} ${y} q-5 3 -5 13" fill="none" ${O(2)}/><path d="M${x - 5} ${y + 11} q-3 4 0 7 q3 -3 0 -7 Z" fill="#4a4f5a" ${O(1)}/>`,
  pony: ([x, y]) => `<path d="M${x + 1} ${y - 1} Q${x - 9} ${y} ${x - 8} ${y + 18} Q${x - 4} ${y + 8} ${x + 1} ${y + 3} Z" fill="#5a3418" ${O(1.1)}/>`,
  goat: ([x, y]) => `<path d="M${x + 1} ${y + 1} q-6 -3 -6 -10 q3 3 7 6 Z" fill="#efe6d2" ${O(1.2)}/>`,
  pig: ([x, y]) => `<path d="M${x} ${y} q-4 -1 -4 2 q0 3 3 2 q2 -1 0 -3 q-3 -2 -5 1" fill="none" stroke="#e66f93" stroke-width="1.6" stroke-linecap="round"/>`,
  cow: ([x, y]) => `<path d="M${x} ${y} q-4 3 -4 15" fill="none" ${O(1.8)}/><path d="M${x - 4} ${y + 14} q-3 4 0 7 q3 -3 0 -7 Z" fill="${INK}"/>`,
  sheep: ([x, y]) => `<circle cx="${x - 1.5}" cy="${y}" r="3.4" fill="#f7f3ea" ${O(1.1)}/>`,
};
const DECO = {
  flower: (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 0 v-4" stroke="#2f7a2f" stroke-width="1"/><circle cy="-5" r="2.2" fill="#ffd23f" stroke="#e8434f" stroke-width="1.6" stroke-dasharray="1.2 .6"/></g>`,
  rock: (x, y) => `<path d="M${x - 5} ${y} q1 -5 5 -5 q5 0 5 5 Z" fill="#b8b4ad" ${O(1)}/>`,
  bush: (x, y) => `<path d="M${x - 6} ${y} a3.5 3.5 0 0 1 3 -5 a4 4 0 0 1 6 -1 a3.5 3.5 0 0 1 3 6 Z" fill="#4caf50" ${O(1)}/>`,
  mushroom: (x, y) => `<g transform="translate(${x} ${y})"><rect x="-1" y="-3.5" width="2" height="3.5" fill="#fff" ${O(.8)}/><path d="M-3.4 -3.4 a3.4 3 0 0 1 6.8 0 Z" fill="#e8434f" ${O(.8)}/></g>`,
};
const TRICK_TEXT = { blur: 'Round 1: it goes blurry', hide: 'Round 2: it hides', slide: 'Round 3: it trots away!', spin: 'Round 4: the paddock spins!', swap: 'Round 5: they swap places!' };

function animalSvg(a, i, withTail = false, starred = false) {
  const A = ANIMALS[a.k], flip = a.f ? `transform="translate(${A.w} 0) scale(-1 1)"` : '';
  return `<g class="pt-an${starred ? ' starred' : ''}" data-i="${i}" style="transform: translate(${a.x}px, ${a.y}px) scale(${a.s})"><g ${flip}>${withTail ? TAIL[a.k](A.tail) : ''}${BODY[a.k]()}${starred ? `<circle cx="${A.w / 2}" cy="-2" r="3" fill="#ffd23f" ${O(1)}/>` : ''}</g></g>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="pt-top"><span class="pt-title">Pin the Tail</span><span class="pt-round"></span><span class="clock"><b>--</b></span></div>
    <div class="pt-banner"></div>
    <div class="pt-boardwrap">
      <svg class="pt-board" viewBox="0 0 ${BW} ${BH}" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:${BW} / ${BH}">
        <defs><filter id="pt-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.4"/></filter>
          <radialGradient id="pt-glow"><stop offset="0" stop-color="#fff7b0"/><stop offset=".6" stop-color="#ffd23f" stop-opacity=".7"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient></defs>
        <g class="pt-world" style="transform-origin:${BW / 2}px ${BH / 2}px">
          <rect width="${BW}" height="${BH}" fill="#8fd27a"/><rect width="${BW}" height="10" fill="#a9dcf2"/>
          <path d="M0 10 H${BW}" stroke="#6aa857" stroke-width="2"/>
          <g class="pt-fence">${Array.from({ length: 17 }, (_, i) => `<rect x="${i * 10 + 1}" y="3" width="3" height="10" rx="1" fill="#e9c48a" ${O(.8)}/>`).join('')}<rect x="0" y="6" width="${BW}" height="2" fill="#d9a865" ${O(.6)}/></g>
          <g class="pt-deco"></g><g class="pt-animals"></g><g class="pt-star"></g>
        </g>
        <g class="pt-marks"></g>
      </svg>
      <div class="pt-hint"></div>
    </div>
    <div class="pt-actions"><button class="pt-done big-btn" disabled>Done</button></div>
    <div class="pt-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="pt-st"></strong>')).join('')}</div>
    <p class="pt-note"></p>`;
  const $ = s => ui.querySelector(s);
  const svg = $('.pt-board'), world = $('.pt-world');
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.pt-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, myPin = null, done = false, timers = [];

  const pinSvg = (p, [x, y], cls = '', label = '') => `<g class="pt-pin ${cls}" style="--seat:${p.color}" transform="translate(${x} ${y})">
      <path d="M0 0 L1.3 -6 h-2.6 Z" fill="#666"/><circle cy="-7.4" r="3.4" fill="${p.color}" ${O(1)}/><circle cx="-1" cy="-8.4" r="1" fill="#fff" opacity=".8"/><circle r=".9" fill="${INK}"/>
      ${label ? `<text y="5.6" text-anchor="middle" class="pt-lbl">${esc(label)}</text>` : ''}</g>`;
  function paintMine() {
    if (phase !== 'guess') return;
    $('.pt-marks').innerHTML = myPin && me != null ? pinSvg(byPid.get(me), myPin, 'mine', 'YOU') : '';
    const d = $('.pt-done'); d.disabled = !myPin || done; d.textContent = done ? 'Pinned!' : myPin ? 'Done' : 'Tap the field';
  }
  svg.addEventListener('pointerdown', e => {
    if (watching || phase !== 'guess' || done) return;
    const m = svg.getScreenCTM(); if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    if (pt.x < 0 || pt.x > BW || pt.y < 0 || pt.y > BH) return;
    myPin = [Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10];
    ctx.send('pin', myPin); ctx.sfx('pick'); paintMine();
  });
  $('.pt-done').addEventListener('click', () => { if (watching || phase !== 'guess' || !myPin || done) return; done = true; ctx.send('done'); ctx.sfx('good'); paintMine(); });

  function setRot(deg, ms) { world.style.transition = ms ? `transform ${ms}ms cubic-bezier(.5,0,.3,1)` : 'none'; world.style.transform = `rotate(${deg}deg)`; }
  function drawAnimals(list, { tail = false, starIndex = -1, blur = false } = {}) {
    const g = $('.pt-animals');
    g.innerHTML = (list || []).map((a, i) => animalSvg(a, i, tail, i === starIndex)).join('');
    g.classList.toggle('blurred', blur);
  }
  function drawDeco(deco) { $('.pt-deco').innerHTML = (deco || []).map(d => DECO[d.k](d.x, d.y)).join(''); }

  function enter(g) {
    timers.forEach(clearTimeout); timers = [];
    $('.pt-star').innerHTML = ''; $('.pt-marks').innerHTML = '';
    if (g.phase === 'show') {
      setRot(0, 0); drawDeco(g.deco);
      drawAnimals(g.animals, { starIndex: g.trick === 'swap' ? 0 : -1 });
      const [x, y] = g.star;
      $('.pt-star').innerHTML = `<g class="pt-target" transform="translate(${x} ${y})"><circle r="9" fill="url(#pt-glow)"/><path d="M0 -5 L1.5 -1.6 L5 -1.5 L2.3 .8 L3.1 4.4 L0 2.4 L-3.1 4.4 L-2.3 .8 L-5 -1.5 L-1.5 -1.6 Z" fill="#ffd23f" ${O(.9)}/></g>`;
      myPin = null; done = false;
      ctx.sfx('open');
    }
    if (g.phase === 'trick') {
      drawAnimals(g.animals, { starIndex: g.trick === 'swap' ? 0 : -1 });
      const ms = 1300;
      if (g.trick === 'spin') { requestAnimationFrame(() => requestAnimationFrame(() => setRot(g.rot, ms))); ctx.sfx('throw'); }
      else {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          ui.querySelectorAll('.pt-an').forEach((el, i) => { const a = g.to[i]; el.style.transition = `transform ${ms}ms cubic-bezier(.5,0,.3,1)`; el.style.transform = `translate(${a.x}px, ${a.y}px) scale(${a.s})`; });
        }));
        ctx.sfx('throw');
      }
    }
    if (g.phase === 'guess') {
      setRot(g.rot, 0); drawDeco(g.deco);
      if (g.trick === 'blur') drawAnimals(g.animals, { blur: true });
      else { ui.querySelectorAll('.pt-an').forEach(el => el.classList.add('gone')); timers.push(setTimeout(() => drawAnimals([]), 400)); }
      ctx.sfx('tap'); paintMine();
    }
    if (g.phase === 'reveal') {
      const r = g.reveal;
      setRot(g.rot, 0); drawDeco(g.deco);
      drawAnimals(g.animals, { tail: true, starIndex: g.trick === 'swap' ? 0 : -1 });
      const [tx, ty] = r.target;
      const order = players.filter(p => r.pins[p.pid]).sort((a, b) => r.dist[b.pid] - r.dist[a.pid]);   // closest drawn last (on top)
      $('.pt-marks').innerHTML = order.map(p => `<line x1="${r.pins[p.pid][0]}" y1="${r.pins[p.pid][1]}" x2="${tx}" y2="${ty}" stroke="${p.color}" stroke-width="1" stroke-dasharray="2 1.4"/>`).join('')
        + `<g class="pt-answer" transform="translate(${tx} ${ty})"><circle r="4.4" fill="none" stroke="#fff" stroke-width="1.6"/><circle r="4.4" fill="none" stroke="${INK}" stroke-width=".8"/></g>`
        + order.map(p => pinSvg(p, r.pins[p.pid], r.closest.includes(p.pid) ? 'best' : '', `${p.pid === me ? 'YOU' : p.name} +${r.gain[p.pid]}`)).join('');
      if (me != null) ctx.sfx(r.closest.includes(me) || (init.solo && r.gain[me] >= 7) ? 'win' : r.gain[me] > 0 ? 'good' : 'bad');
    }
    if (g.phase === 'end') ctx.sfx('win');
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.pt-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.pt-st'); let t = '', cls = '';
      if (g.phase === 'guess') { if (g.done.includes(p.pid)) { t = 'pinned'; cls = 'in'; } else if (g.pinned.includes(p.pid)) t = 'placing…'; else t = 'thinking…'; }
      if (g.phase === 'reveal') { const r = g.reveal; t = r.pins[p.pid] ? `+${r.gain[p.pid]}` : 'no pin'; cls = r.closest.includes(p.pid) ? 'best' : ''; }
      st.textContent = t; st.className = 'pt-st ' + cls; el.classList.toggle('in', cls === 'in');
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Watch for the star: that is where the tail goes!';
    if (g.phase === 'show') return g.trick === 'swap' ? 'Remember the one with the gold dot!' : 'Remember the star!';
    if (g.phase === 'trick') return g.trick === 'spin' ? 'Round and round…' : 'Keep your eye on it!';
    if (g.phase === 'guess') return watching ? `${g.pinned.length} of ${players.length} pinned` : done ? 'Pinned! Waiting for the others…' : 'Tap where the tail goes!';
    if (g.phase === 'reveal') { const w = g.reveal.closest.map(p => byPid.get(p)?.name); return w.length ? `${w.join(' and ')} pinned it closest!` : init.solo ? `+${g.reveal.gain[me ?? players[0].pid]} points` : 'Nobody got close!'; }
    return 'What a tail! Most points wins.';
  }

  return {
    priv(d) { if (phase === 'guess' && d.pin && !myPin) { myPin = d.pin; done = d.done; paintMine(); } },
    state(g) {
      if (g.phase !== phase || g.round !== round) { phase = g.phase; round = g.round; enter(g); }
      ui.dataset.phase = g.phase; ui.dataset.trick = g.trick || '';
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'guess' && g.left <= 3);
      $('.pt-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      $('.pt-banner').textContent = g.trick && g.phase !== 'end' ? TRICK_TEXT[g.trick] : '';
      $('.pt-hint').textContent = g.phase === 'show' ? 'The tail goes here!' : g.phase === 'guess' && !watching && !myPin ? 'Tap!' : '';
      paintChips(g);
      $('.pt-note').textContent = note(g);
    },
    dispose() { timers.forEach(clearTimeout); },
  };
}
