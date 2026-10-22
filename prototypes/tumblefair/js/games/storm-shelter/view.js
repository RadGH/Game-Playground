// STORM SHELTER on a screen. In 3D (top on a phone, left on a wide screen): the shelter cut open like a doll's house
// in a dark rainy night — a stove whose fire glows with HEAT (emissive turned up/down, never a light switched on), a
// plank roof whose planks go missing as ROOF falls, a pantry shelf holding as many sacks and jars as FOOD, rain
// streaks (one instanced mesh) and everyone's character inside, shivering when it is cold.
// Below / right: the three meters (picture + name + number, never colour alone), the beat clock, the event card
// (picture, what it does, the wind, 2-3 choice buttons with their effects and live vote counts), and your private
// hand of action cards — tap to play (tap again to take it back). After each beat the meters show what changed.
import { RULES, EVENTS, CARDS, METERS } from './sim.js';
import { METER_NAMES } from './deck.js';
import { scoreBar, h, esc } from '../../client/gamehud.js';

const ICON = { heat: '🔥', roof: '🏠', food: '🍞' };
const fxChips = fx => Object.entries(fx).map(([k, v]) => k === 'low' ? `<i class="ss-fx up">+${v} lowest</i>` : `<i class="ss-fx ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : '−'}${Math.abs(v)} ${ICON[k]} ${METER_NAMES[k]}</i>`).join('') || '<i class="ss-fx">no change</i>';

export function createView(ctx) {
  const { THREE, group, stage, ui, me, init, players } = ctx, watching = me == null;
  // ---------------------------------------------------------------- 3D: the shelter
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }); mats.push(m); return m; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  mesh(new THREE.PlaneGeometry(60, 40).rotateX(-Math.PI / 2), std('#23303a'), 0, -0.02, 0).receiveShadow = true;
  mesh(new THREE.BoxGeometry(7, 0.2, 4.4), std('#8a5a3a'), 0, 0.1, -0.4).receiveShadow = true;           // floor
  mesh(new THREE.BoxGeometry(7, 3.6, 0.25), std('#b5835a'), 0, 1.9, -2.5);                              // back wall
  for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.25, 3.6, 4.4), std('#a8764e'), sx * 3.5, 1.9, -0.4);
  mesh(new THREE.BoxGeometry(1.1, 0.8, 0.12), std('#1b2a44'), -1.6, 2.4, -2.36);                         // a window onto the storm
  // the stove: iron box, a fire window that glows with heat, a chimney
  const stove = new THREE.Group(); stove.position.set(2.3, 0.2, -1.7); group.add(stove);
  mesh(new THREE.BoxGeometry(1.1, 1.1, 0.9), std('#33333f', { metalness: 0.4, roughness: 0.4 }), 0, 0.55, 0, stove);
  const fireMat = std('#ff8a2a', { emissive: new THREE.Color('#ff6a00'), emissiveIntensity: 0.8 });
  const fire = mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), fireMat, 0, 0.5, 0.46, stove);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 10), std('#33333f'), 0.3, 2.5, -0.2, stove);
  // pantry shelf with food (instanced: up to 10 sacks/jars)
  mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), std('#6b4428'), -2.4, 1.0, -2.1); mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), std('#6b4428'), -2.4, 1.7, -2.1);
  const food = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.15, 0.36, 8), std('#e8c38a'), 10); group.add(food);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // the roof: 10 planks, one for each point of ROOF
  const roofPivot = new THREE.Group(); roofPivot.position.set(0, 3.7, -0.4); group.add(roofPivot);
  const planks = [];
  for (let i = 0; i < 10; i++) { const side = i < 5 ? -1 : 1, k = i % 5; const p = mesh(new THREE.BoxGeometry(0.82, 0.12, 4.8), std(k % 2 ? '#7a4d2e' : '#8f5c36'), side * (0.45 + k * 0.78), -k * 0.42, 0, roofPivot); p.rotation.z = side * -0.5; planks.push(p); }
  // rain: streaks falling over the whole scene (instanced)
  const RAIN = 140, rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), new THREE.MeshBasicMaterial({ color: '#9fc4e8', transparent: true, opacity: 0.55 }), RAIN); mats.push(rain.material); group.add(rain);
  const drops = Array.from({ length: RAIN }, (_, i) => ({ x: ((i * 37) % 100) / 100 * 12 - 6, z: ((i * 61) % 100) / 100 * 6 - 3.5, y: (i * 13 % 60) / 10 }));
  // the players, inside
  const actors = [];
  players.forEach((p, i) => {
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }, { scale: 0.8 }).then(a => {
      if (!a) return; const x = players.length === 1 ? 0.3 : -1.8 + i * 3.6 / (players.length - 1);
      a.place(x, 0.2, 0.4, 0); actors.push({ a, pid: p.pid, x });
    });
  });
  const wide = () => innerWidth > innerHeight * 1.15;
  const frame = () => {
    stage.setSafe?.(wide() ? { top: 0.12, bottom: 0.04, left: 0.02, right: 0.52 } : { top: 0.08, bottom: 0.62, left: 0.02, right: 0.02 });
    ctx.camera({ cx: 0, cz: -0.4, hw: 4, hd: 2.6, pitch: 24, tall: 4.2 }, { instant: true });
  };
  frame(); addEventListener('resize', frame);

  // ---------------------------------------------------------------- the panel
  const bar = scoreBar(ctx, { unit: 'points' });
  ui.dataset.ph = 'ready'; ui.classList.toggle('watching', watching);
  const panel = h('div', 'ss-panel');
  panel.innerHTML = `
    <div class="ss-meters">${METERS.map(k => `<div class="ss-meter" data-k="${k}"><span class="ss-ic">${ICON[k]}</span><b>${METER_NAMES[k]}</b><span class="ss-bar"><i></i></span><em>${RULES.begin}</em><u class="ss-d"></u></div>`).join('')}</div>
    <div class="ss-beat"><b>Beat <span class="ss-n">1</span> of ${init.beats}</b><span class="ss-tbar"><i></i></span></div>
    <div class="ss-event"></div>
    <div class="ss-handh"></div>
    <div class="ss-hand"></div>
    <div class="ss-last"></div>`;
  ui.append(panel);
  const $ = s => panel.querySelector(s);
  const meterEls = Object.fromEntries(METERS.map(k => [k, panel.querySelector(`.ss-meter[data-k=${k}]`)]));
  let G = null, mine = { hand: [], play: [], vote: null }, evKey = '', handKey = '', beatStart = 0, curBeat = -1;
  const per = init.per;
  function drawMeters(m) {
    METERS.forEach((k, i) => { const el = meterEls[k]; el.querySelector('i').style.width = (m[i] * 10) + '%'; el.querySelector('em').textContent = m[i]; el.classList.toggle('low', m[i] <= 2); });
  }
  function drawEvent() {
    if (!G || G.ph !== 'beat') { $('.ss-event').innerHTML = G?.ph === 'end' ? `<div class="ss-final ${G.ok ? 'good' : 'bad'}">${G.ok ? '🌈 The storm has passed — you made it!' : '💥 The shelter gave in…'}</div>` : '<div class="ss-final">Batten down the hatches…</div>'; evKey = ''; return; }
    const ev = EVENTS[G.ev], key = G.ev + '|' + G.votes.join() + '|' + mine.vote + '|' + G.wind.join();
    if (key === evKey) return; evKey = key;
    const wind = METERS.map((k, i) => G.wind[i] ? `<i class="ss-fx down">−${-G.wind[i]} ${ICON[k]} ${METER_NAMES[k]}</i>` : '').join('');
    $('.ss-event').innerHTML = `<div class="ss-card"><span class="ss-art">${ev.a}</span><div><b>${esc(ev.t)}</b><p>${esc(ev.d)}</p></div></div>
      <div class="ss-hits"><span>Storm:</span>${fxChips(ev.hit)}${wind ? `<span>Wind:</span>${wind}` : ''}</div>
      <div class="ss-choices">${ev.ch.map((c, i) => `<button class="ss-ch${mine.vote === i ? ' on' : ''}" data-i="${i}"><b>${esc(c.l)}</b><span>${fxChips(c.fx)}</span><em>${G.votes[i] ? `${G.votes[i]} vote${G.votes[i] > 1 ? 's' : ''}` : ''}${mine.vote === i ? ' · yours' : ''}</em></button>`).join('')}</div>`;
  }
  function drawHand() {
    if (watching) return;
    const key = JSON.stringify(mine) + (G?.ph || '');
    if (key === handKey) return; handKey = key;
    const open = G?.ph === 'beat';
    $('.ss-handh').textContent = open ? `Your hand — play ${per === 2 ? 'TWO cards' : 'ONE card'} (${mine.play.length}/${per})` : 'Your hand';
    $('.ss-hand').innerHTML = mine.hand.map((id, i) => { const c = CARDS[id], on = mine.play.includes(i); return `<button class="ss-cardbtn${on ? ' on' : ''}" data-i="${i}" ${open ? '' : 'disabled'}><span class="ss-art">${c.a}</span><b>${esc(c.n)}</b><span>${fxChips(c.fx)}</span>${on ? '<em>PLAYED ✓</em>' : ''}</button>`; }).join('');
  }
  panel.addEventListener('click', e => {
    const ch = e.target.closest('.ss-ch'), cd = e.target.closest('.ss-cardbtn');
    if (watching || G?.ph !== 'beat') return;
    if (ch) { const i = +ch.dataset.i; mine.vote = i; ctx.send('vote', i); ctx.sfx('tap'); evKey = ''; drawEvent(); }
    if (cd && !cd.disabled) { const i = +cd.dataset.i; const at = mine.play.indexOf(i); if (at >= 0) mine.play.splice(at, 1); else { mine.play.push(i); if (mine.play.length > per) mine.play.shift(); } ctx.send('play', i); ctx.sfx('pick'); drawHand(); }
  });
  drawMeters([RULES.begin, RULES.begin, RULES.begin]); drawEvent();

  let heat = RULES.begin, roof = RULES.begin, foodN = RULES.begin;
  function setScene(m) {
    [heat, roof, foodN] = m;
    planks.forEach((p, i) => { p.visible = (i % 5) * 2 + (i < 5 ? 0 : 1) < roof; });      // planks go from both sides; the ridge ones are the last to go
    for (let i = 0; i < 10; i++) { const show = i < foodN; m4.compose(v.set(-3.0 + (i % 5) * 0.3, i < 5 ? 1.22 : 1.92, -2.05), q.identity(), sc.setScalar(show ? 1 : 0.0001)); food.setMatrixAt(i, m4); }
    food.instanceMatrix.needsUpdate = true;
  }
  setScene([RULES.begin, RULES.begin, RULES.begin]);

  return {
    state(g) {
      G = g; ui.dataset.ph = g.ph;
      if (g.beat !== curBeat) { curBeat = g.beat; beatStart = performance.now(); if (g.ph === 'beat') ctx.sfx('trap'); }
      $('.ss-n').textContent = Math.max(1, g.beat + 1);
      drawMeters(g.m); setScene(g.m); drawEvent(); drawHand();
      for (const p of players) bar.mark(p.pid, 'ss-in', !!g.done?.includes(p.pid) && !!g.voted?.includes(p.pid));
      bar.set(g.sc, g.left);
    },
    priv(d) { mine = { hand: d.hand || [], play: d.play || [], vote: d.vote ?? null }; evKey = ''; drawEvent(); drawHand(); },
    event(ev) {
      if (ev.e === 'resolve') {
        METERS.forEach((k, i) => { const el = meterEls[k].querySelector('.ss-d'), d = ev.d[i]; el.textContent = d ? (d > 0 ? '+' : '−') + Math.abs(d) : '±0'; el.className = 'ss-d show ' + (d > 0 ? 'up' : d < 0 ? 'down' : ''); clearTimeout(el.t); el.t = setTimeout(() => { el.className = 'ss-d'; }, 1600); });
        const who = pid => pid === me ? 'You' : (players.find(p => p.pid === pid)?.name || '?');
        $('.ss-last').innerHTML = ev.played.length ? 'Last beat: ' + ev.played.map(([pid, id, got]) => `${esc(who(pid))} ${CARDS[id].a} ${esc(CARDS[id].n)}${got ? ` (+${got})` : ' (wasted)'}`).join(' · ') : 'Last beat: nobody played a card!';
        ctx.sfx(ev.d.reduce((a, b) => a + b, 0) >= 0 ? 'good' : 'bad');
      } else if (ev.e === 'end') ctx.sfx(ev.ok ? 'win' : 'bad');
    },
    frame(dt, t) {
      fireMat.emissiveIntensity = 0.15 + heat * 0.09 + Math.sin(t * 9) * 0.05; fire.scale.y = 0.4 + heat * 0.07;
      for (let i = 0; i < RAIN; i++) { const d = drops[i]; d.y -= dt * 9; if (d.y < 0) d.y += 6; m4.compose(v.set(d.x + d.y * 0.15, d.y, d.z), q.identity(), sc.setScalar(1)); rain.setMatrixAt(i, m4); }
      rain.instanceMatrix.needsUpdate = true;
      for (const { a } of actors) { a.update?.(dt); }
      // the clock bar for this beat
      if (G?.ph === 'beat') { const k = Math.max(0, 1 - (performance.now() - beatStart) / (RULES.beat * 1000)); const el = $('.ss-tbar i'); el.style.width = (k * 100).toFixed(1) + '%'; }
      for (const [i, { a, x }] of actors.entries()) { a.setPose?.(G?.ph === 'end' ? (G.ok ? 'cheer' : 'sitGround') : heat <= 3 ? 'hit' : 'idle'); a.group.position.x = x + (heat <= 3 ? Math.sin(t * 40 + i) * 0.03 : 0); }
    },
    dispose() { bar.el.remove(); removeEventListener('resize', frame); for (const m of mats) m.dispose(); },
  };
}
