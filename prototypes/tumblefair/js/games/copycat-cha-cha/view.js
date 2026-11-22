// COPYCAT CHA-CHA on a screen. Up top, the 3D show: a round light-up stage at night with a striped back curtain and a
// raised podium where the DANCE CAPTAIN (a Chibi character in a gold sash) dances each routine; every player's own
// character stands on the floor in front and does each move its player presses (others' moves arrive as events).
// Below: the ROUTINE STRIP (one card per move — lit one by one while the Captain dances, then hidden behind "?" while
// you copy, each turning green/gold/red as you land it), a big word for every step (Perfect! / Wrong move!), and on a
// phone that plays, four big move buttons: Clap ←  Jump ↑  Wave →  Spin ↓ (keys: arrows or WASD; gamepad: d-pad or
// X / Y / B / A in the same diamond). The buttons are not <button>s, so the menu highlight (padnav) leaves them alone.
// The tune is the fair organ's 'boogie', started on a beat so music, Captain and judging agree; the song clock is this
// device's own, synced from the state (as in Spotlight Dance).
import { MOVES, phaseAt, LEAD, BEAT, copyBeat } from './sim.js';
import { chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { ICONS } from './icons.js';

const ICON = ['hands-clapping', 'person-arrow-up-from-line', 'hand-wave', 'arrows-spin'];
const TINT = ['#e8485a', '#2f7de1', '#1f9d55', '#8a4fd8'];
const ARROW = ['←', '↑', '→', '↓'];
const CLIP = [['clap', 520], ['jump', 520], ['wave', 560], ['dance', 560]];
const KEYS = { ArrowLeft: 0, KeyA: 0, ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 };
const PAD = [[14, 0], [2, 0], [12, 1], [3, 1], [15, 2], [1, 2], [13, 3], [0, 3]];      // [gamepad button, move]
const WORD = { P: ['Perfect!', 'perfect'], G: ['Good!', 'good'], O: ['Off the beat', 'off'], X: ['Wrong move!', 'bad'], wait: ['Watch first!', 'off'], double: ['One move a beat!', 'off'] };
export function icon(m, cls = '') {
  const [w, hh, d, d2] = ICONS['duotone/' + ICON[m]];
  return `<svg class="${cls}" viewBox="0 0 ${w} ${hh}" aria-hidden="true"><path d="${d2}" fill="${TINT[m]}" opacity=".45"/><path d="${d}" fill="${TINT[m]}"/></svg>`;
}

export function createView(ctx) {
  const { ui, players, me, init, THREE } = ctx, lens = init.lens, watching = me == null, n = players.length;
  ui.classList.toggle('watching', watching);
  ui.innerHTML = `
    <div class="cc-board">${players.map(p => chip(p, `<em class="sc">0</em><span class="cc-marks"></span>`)).join('')}<span class="clock"><b>--</b></span></div>
    ${init.solo ? `<div class="cc-medals">${init.medals.map((m, i) => `<span><i class="cc-medal m${i}"></i>${m}</span>`).join('')}</div>` : ''}
    <div class="cc-mid">
      <div class="cc-call"><span class="cc-round"></span><b class="cc-say">Get ready…</b><i class="cc-dot"></i></div>
      <div class="cc-strip"></div>
      <div class="cc-word"></div>
    </div>
    <div class="cc-pad">${MOVES.map((name, m) => `<div class="cc-mv m${m}" role="button" data-mv="${m}" aria-label="${name}">${icon(m)}<b>${name}</b><kbd>${ARROW[m]}</kbd></div>`).join('')}</div>`;
  const $ = s => ui.querySelector(s);
  const strip = $('.cc-strip'), say = $('.cc-say'), roundEl = $('.cc-round'), word = $('.cc-word'), dot = $('.cc-dot');
  const board = new Map(players.map(p => [p.pid, ui.querySelector(`.cc-board [data-pid="${p.pid}"]`)]));
  const pads = [...ui.querySelectorAll('.cc-mv')];

  // ---------------------------------------------------------------- the 3D stage
  const G = ctx.group, mats = [], geos = [];
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o }); mats.push(m); return m; };
  const add = (geo, mat, x, y, z) => { geos.push(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; G.add(m); return m; };
  const scene = ctx.stage.scene, wasBg = scene.background?.clone?.() ?? scene.background;
  scene.background = new THREE.Color('#1d1540');
  add(new THREE.PlaneGeometry(60, 40).rotateX(-Math.PI / 2), M('#2a1f52'), 0, -0.01, 0);
  // light-up floor: six rows of hexagon tiles in front of the round stage, down toward the camera
  const FL = 14 * 6, tiles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.25 }), FL);
  mats.push(tiles.material); geos.push(tiles.geometry);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  const tileCols = ['#ff6ec7', '#5ee7ff', '#ffe066', '#7dff8a'].map(c => new THREE.Color(c)), tileXZ = [];
  for (let i = 0; i < FL; i++) { const x = -6.2 + (i % 14) * 0.95 + (Math.floor(i / 14) % 2) * 0.47, z = 0.7 + Math.floor(i / 14) * 0.82; tileXZ.push([x, z]); m4.compose(v.set(x, 0.04, z), q.identity(), s1); tiles.setMatrixAt(i, m4); tiles.setColorAt(i, tileCols[i % 4]); }
  G.add(tiles);
  add(new THREE.CylinderGeometry(2.1, 2.3, 0.7, 36), M('#6b2fa0'), 0, 0.35, -2.2);                 // the Captain's podium
  add(new THREE.TorusGeometry(2.12, 0.07, 6, 40).rotateX(Math.PI / 2), M('#ffd23f', { metalness: 0.4 }), 0, 0.71, -2.2);
  for (let i = 0; i < 9; i++) {                                                                       // striped curtain
    const c = add(new THREE.BoxGeometry(1.3, 6, 0.2), M(i % 2 ? '#c0285a' : '#ff5f8a'), -5.2 + i * 1.3, 3, -4.3); c.castShadow = false;
  }
  add(new THREE.BoxGeometry(12.4, 0.5, 0.4), M('#ffd23f'), 0, 6.1, -4.1);
  const bulbs = [];
  for (let i = 0; i < 13; i++) bulbs.push(add(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3b0' }), -6 + i, 5.75, -3.9));
  mats.push(...bulbs.map(b => b.material));

  // the Dance Captain, and each player's dancer in a row in front
  let captain = null, capSpin = 0;
  // the Captain's badge: a gold star turning over their head
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.16 : 0.36, a = i / 10 * Math.PI * 2; starShape[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04); geos.push(starGeo);
  const star = new THREE.Mesh(starGeo, M('#ffd23f', { metalness: 0.5, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.6 })); star.visible = false; G.add(star);
  ctx.createActor({ look: { race: 'human', seed: 7351 }, costume: 'cos_none' }, { scale: 1.25 }).then(a => {
    if (!a) return; captain = a; a.place(0, 0.7, -2.2, 0);
    star.userData.y = 0.7 + a.height + 0.45; star.position.set(0, star.userData.y, -2.2); star.visible = true;
  }).catch(() => {});
  const xs = players.map((p, i) => (i - (n - 1) / 2) * 1.9), dancers = new Map();
  players.forEach((p, i) => {
    const d = { actor: null, spin: 0, x: xs[i] }; dancers.set(p.pid, d);
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }).then(a => { if (!a) return; d.actor = a; a.place(xs[i], 0.08, 1.2, 0); }).catch(() => {});
  });
  // frame the stage; an upright phone crops the floor's sides and drops the stage lower so it meets the move buttons
  const frameStage = () => { const tallScreen = innerHeight > innerWidth * 1.15; ctx.camera(tallScreen ? { cx: 0, cz: 1.1, hw: Math.max(2.5, n * 0.95 + 0.4), hd: 3.3, pitch: 8, tall: 3.4 } : { cx: 0, cz: -1.1, hw: Math.max(3.4, n * 0.95 + 1.2), hd: 2.9, pitch: 16, tall: 3.6 }, { instant: true }); };
  frameStage(); addEventListener('resize', frameStage);
  function dance(pid, m) {
    const d = pid === 'cap' ? null : dancers.get(pid), a = pid === 'cap' ? captain : d?.actor; if (!a) return;
    a.play(CLIP[m][0], CLIP[m][1]);
    if (m === 3) { if (d) d.spin = 1; else capSpin = 1; }
  }

  // ---------------------------------------------------------------- song clock + music
  let t0 = null; const nowS = () => performance.now() / 1000;
  const myEl = () => (t0 == null ? -1 : nowS() - t0);
  const sync = el => { if (t0 == null) { t0 = nowS() - el; return; } const d = el - myEl(); if (d > 0.35 || d < -0.6) t0 = nowS() - el; };
  const tunes = createTunes({ volume: 0.24 });
  let tuneOn = false;

  // ---------------------------------------------------------------- routine strip + words
  let last = null, stripR = -1, seq = null, lastBeat = -99, lastCapJ = -1, wordT = 0;
  const myMarks = () => (me != null && last?.mk?.[me]) || '';
  function drawStrip(r) {
    stripR = r; const L = lens[r];
    strip.innerHTML = Array.from({ length: L }, (_, j) => `<div class="cc-card" data-j="${j}"><span class="cc-ico"></span><i>${j + 1}</i></div>`).join('');
    strip.style.setProperty('--n', L);
  }
  function paintStrip(at) {
    if (!seq) return;
    if (stripR !== at.r) drawStrip(at.r);
    const marks = myMarks(), cards = strip.children;
    for (let j = 0; j < cards.length; j++) {
      const c = cards[j], mk = marks[j] || '';
      // watch: shown once the Captain has danced it; copy: hidden until you land it (Family: faint) ; review: all shown
      const shown = at.ph === 'review' || at.ph === 'end' || (at.ph === 'watch' && at.j >= j) || at.ph === 'cue' || (at.ph === 'copy' && (!!mk || (watching && at.j > j)));
      const state = (shown ? 'shown ' : init.hints && at.ph === 'copy' ? 'hint ' : '') + (mk ? 'mk-' + mk : '') + ((at.ph === 'watch' || at.ph === 'copy') && at.j === j ? ' now' : '');
      if (c.dataset.s !== state) {
        c.dataset.s = state; c.className = 'cc-card ' + state;
        c.querySelector('.cc-ico').innerHTML = shown || state.startsWith('hint') ? icon(seq[j]) : '<b>?</b>';
      }
    }
  }
  function show(text, cls) { word.textContent = text; word.className = 'cc-word show ' + cls; wordT = 0.6; }
  function callFor(at) {
    if (at.ph === 'lead') return 'Get ready…';
    if (at.ph === 'watch') return at.j < 0 ? 'Watch the Captain!' : 'Watch…';
    if (at.ph === 'cue') return watching ? 'Their turn!' : 'Your turn!';
    if (at.ph === 'copy') return watching ? 'Copy it!' : 'Dance it back!';
    if (at.ph === 'review') return 'Bravo!';
    return 'Take a bow!';
  }

  // ---------------------------------------------------------------- input: buttons, keys, gamepad
  function press(m) {
    if (watching || t0 == null) return;
    const el = myEl();
    ctx.send('move', { t: Math.round(el * 1000) / 1000, m });
    dance(me, m); ctx.sfx('tap');
    const p = pads[m]; p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit');
  }
  for (const p of pads) p.addEventListener('pointerdown', e => { e.preventDefault(); press(+p.dataset.mv); });
  const onKey = e => { if (e.repeat || KEYS[e.code] == null || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return; e.preventDefault(); press(KEYS[e.code]); };
  addEventListener('keydown', onKey);
  const padWas = new Set();
  function pollPad() {
    for (const gp of navigator.getGamepads?.() || []) {
      if (!gp) continue;
      for (const [b, m] of PAD) { const k = gp.index + ':' + b, on = !!gp.buttons[b]?.pressed; if (on && !padWas.has(k)) press(m); if (on) padWas.add(k); else padWas.delete(k); }
    }
  }

  return {
    state(g) {
      sync(g.el); last = g; seq = g.seq;
      ui.dataset.phase = g.ph;
      $('.clock b').textContent = g.left;
      const best = Math.max(0, ...Object.values(g.sc));
      for (const p of players) {
        const el = board.get(p.pid); if (!el) continue;
        el.querySelector('.sc').textContent = g.sc[p.pid] ?? 0;
        el.classList.toggle('lead', best > 0 && g.sc[p.pid] === best);
        const mk = g.mk[p.pid] || '';
        el.querySelector('.cc-marks').innerHTML = [...mk].map(c => `<i class="mk-${c}"></i>`).join('');
      }
      if (init.solo) ui.querySelectorAll('.cc-medals span').forEach((s, i) => s.classList.toggle('won', (g.sc[players[0].pid] || 0) >= init.medals[i]));
    },
    event(ev) {
      if (ev.e === 'move') {
        if (ev.pid !== me) { if (ev.q !== 'double') dance(ev.pid, ev.m); return; }
        const w = WORD[ev.q]; if (!w) return;
        show(ev.add ? `${w[0]} +${ev.add}` : w[0], w[1]);
        if (ev.q === 'X') { ctx.sfx('bad'); }
        else if (ev.q === 'P') ctx.sfx('good');
      } else if (ev.e === 'round') {
        const mine = me != null ? ev.res[me] : null;
        if (mine) {
          if (mine[2]) { show(`FLAWLESS! +3`, 'perfect'); ctx.sfx('coins'); }
          else show(`${mine[0]} of ${mine[1]} right`, mine[0] === mine[1] ? 'good' : 'off');
        }
        for (const [pid, r] of Object.entries(ev.res)) dancers.get(+pid)?.actor?.play(r[2] ? 'cheer' : r[0] === 0 ? 'shrug' : 'clap', 900);
      } else if (ev.e === 'end') {
        ctx.sfx('win');
        captain?.play('bowGreet', 2400); for (const d of dancers.values()) d.actor?.play('bowGreet', 2400);
      }
    },
    frame(dt) {
      pollPad();
      const el = myEl(), at = phaseAt(Math.max(0, el), lens), bpos = (el - LEAD) / BEAT, k = Math.floor(bpos + 0.5), ph = bpos - Math.floor(bpos);
      // the tune starts on a beat, so music and Captain agree
      if (!tuneOn && el > 0 && at.ph !== 'end') { const next = LEAD + Math.max(0, Math.ceil(bpos)) * BEAT; if (next - el < 0.06) { tunes.start('boogie'); tuneOn = true; } }
      if (at.ph === 'end' && tuneOn) { tunes.stop(); tuneOn = false; }
      if (el >= 0) {
        // the Captain dances move j of the routine on its beat
        if (at.ph === 'watch' && at.j >= 0 && seq && (at.r * 100 + at.j) !== lastCapJ && Math.abs(el - (LEAD + at.k * BEAT)) < 0.12) { lastCapJ = at.r * 100 + at.j; dance('cap', seq[at.j]); ctx.sfx('pick'); }
        if (k !== lastBeat && el > LEAD - 0.1) { lastBeat = k; dot.classList.remove('beat'); void dot.offsetWidth; dot.classList.add('beat'); }
        roundEl.textContent = at.ph === 'lead' ? '' : `Round ${at.r + 1} of ${lens.length}`;
        const call = callFor(at); if (say.textContent !== call) { say.textContent = call; say.className = 'cc-say ' + at.ph; }
        paintStrip(at);
        ui.classList.toggle('your-turn', at.ph === 'copy' || at.ph === 'cue');
        // a copy slot that went by with no press from me: say so once
        if (!watching && at.ph === 'copy' && at.j > 0) { const j = at.j - 1, mk = myMarks(); if (!mk[j] && el - (LEAD + copyBeat(at.r, j, lens) * BEAT) > BEAT * 0.55 && strip.children[j] && !strip.children[j].dataset.missed) { strip.children[j].dataset.missed = 1; show('Missed one!', 'bad'); } }
      }
      // floor pulse on the beat, Captain + dancers
      const flash = el >= LEAD - 0.05 ? Math.max(0, 1 - ph * 4) : 0;
      for (let i = 0; i < FL; i++) { col.copy(tileCols[(i + Math.max(0, k)) % 4]).multiplyScalar(0.45 + flash * 0.8 * ((i + k) % 3 === 0 ? 1 : 0.4)); tiles.setColorAt(i, col); }
      tiles.instanceColor.needsUpdate = true;
      bulbs.forEach((b, i) => b.material.color.set((i + Math.max(0, k)) % 2 ? '#fff3b0' : '#ff9ad5'));
      star.rotation.y += dt * 2.2; if (star.visible) star.position.y = star.userData.y + Math.sin(performance.now() / 300) * 0.06;
      if (captain) { capSpin = Math.max(0, capSpin - dt * 2.2); captain.body.group.rotation.y = (1 - capSpin) * Math.PI * 2 * (capSpin > 0 ? 1 : 0); captain.update(dt); }
      for (const d of dancers.values()) if (d.actor) { d.spin = Math.max(0, d.spin - dt * 2.2); d.actor.body.group.rotation.y = d.spin > 0 ? (1 - d.spin) * Math.PI * 2 : 0; d.actor.update(dt); }
      if (wordT > 0) { wordT -= dt; if (wordT <= 0) word.className = 'cc-word'; }
    },
    dispose() { removeEventListener('keydown', onKey); removeEventListener('resize', frameStage); tunes.dispose(); scene.background = wasBg; for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); },
  };
}
