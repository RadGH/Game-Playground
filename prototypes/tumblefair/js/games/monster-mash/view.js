// MONSTER MASH on a screen. Up top, a spooky-cute graveyard stage at night (the shared Halloween dressing for the
// lights, sky, pumpkins, bats and ghosts, plus our own stage, moon, tombstones and a bouncing backup ghost) with every
// player's character in a row, dancing the move they just landed. Below, the arrow highway (a 2D canvas: four lanes,
// arrows slide down to the line) and, on a phone that plays, four big buttons: Wave, Hop, Zombie, Clap.
//
// The tune is synthesized here with WebAudio and scheduled a quarter of a second ahead from the chart: a minor-key
// "graveyard doo-wop" (Am F Dm E) with kick, snare, hats, a walking bass, organ stabs on the off-beats, a wobbly
// theremin tune and a soft pluck on every arrow (so you can HEAR the pattern). Timing is judged on this device against
// the song clock — the audio clock when sound runs (minus the speaker's output delay), the page clock otherwise — and
// only the verdict goes to the server (`hit` { n, q } / `stray` n), which checks it for sense.
import { chip } from '../../client/gamehud.js';
import { dressArena, ghostGeo, PALETTE } from '../../client/halloween.js';
import { scoreOf, stepSec, SECTIONS, mult } from './sim.js';

const LEAD = 1.8;                                          // seconds an arrow is visible before it reaches the line
const LANE_COL = ['#b06cff', '#3ecf5a', '#ff8a1a', '#39b8f0'];
const LANE_HZ = [523.25, 659.25, 392.0, 783.99];
const ROT = { left: Math.PI, up: -Math.PI / 2, down: Math.PI / 2, right: 0 };
const ARROW_SVG = d => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 20 L22 6 L22 14 L34 14 L34 26 L22 26 L22 34 Z" transform="rotate(${{ left: 0, up: 90, right: 180, down: 270 }[d]} 20 20)" fill="currentColor" stroke="#0d2228" stroke-width="3" stroke-linejoin="round"/></svg>`;
// chords a bar: Am, F, Dm, E (triads in Hz) and their bass roots
const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [146.83, 174.61, 220], [164.81, 207.65, 246.94]];
const ROOTS = [110, 87.31, 73.42, 82.41];
// the theremin: 32 eighth steps (4 bars) of semitones from A4; null = rest
const THEREMIN = [0, null, 3, null, 7, 6, 5, null, 3, null, 0, null, -1, null, 0, null, 0, null, 3, null, 7, null, 10, 8, 7, null, 5, null, 4, null, null, null];

export function createView(ctx) {
  const { ui, players, me, init, THREE } = ctx, chart = init.chart, moves = init.moves, ss = stepSec(chart.bpm), noteT = chart.steps.map(s => s * ss);
  const watching = me == null;
  ui.innerHTML = `
    <i class="mm-moon" aria-hidden="true"></i>
    <div class="mm-top"><span class="mm-sec">Get ready…</span><span class="clock"><b>--</b></span></div>
    <div class="mm-board">${players.map(p => chip(p, '<em class="sc">0</em><strong class="mm-cb"></strong>')).join('')}</div>
    <div class="mm-play">
      <div class="mm-lane"><canvas></canvas><div class="mm-judge"></div><div class="mm-count"></div></div>
      <div class="mm-me"><span class="mm-score">0</span><span class="mm-combo"></span></div>
      <div class="mm-pads">${moves.map((m, i) => `<button class="mm-pad" data-l="${i}" style="--c:${LANE_COL[i]}" aria-label="${m.name}">${ARROW_SVG(m.arrow)}<b>${m.name}</b></button>`).join('')}</div>
    </div>
    <p class="mm-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.mm-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), c2 = canvas.getContext('2d');

  // ---------------------------------------------------------------- sound
  let ac = null, master = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } catch { ac = null; }
  const noiseBuf = (() => { if (!ac) return null; const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = b.getChannelData(0); let s = 11; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } return b; })();
  function env(at, peak, dur, attack = 0.004) { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); g.connect(master); return g; }
  function tone(at, type, f0, f1, peak, dur, { cut = 0, vib = 0, attack = 0.004 } = {}) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.8);
    let out = o; if (cut) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); out = f; }
    if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.025; l.connect(lg); lg.connect(o.frequency); l.start(at); l.stop(at + dur + 0.05); }
    out.connect(env(at, peak, dur, attack)); o.start(at); o.stop(at + dur + 0.05);
  }
  function noise(at, type, f, q, peak, dur) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const bq = ac.createBiquadFilter(); bq.type = type; bq.frequency.value = f; bq.Q.value = q; s.connect(bq); bq.connect(env(at, peak, dur, 0.002)); s.start(at); s.stop(at + dur + 0.05); }
  const SOUND = {
    kick: at => tone(at, 'sine', 130, 45, 0.85, 0.18),
    snare: at => { noise(at, 'bandpass', 1800, 0.7, 0.4, 0.14); tone(at, 'triangle', 220, 160, 0.2, 0.08); },
    hat: at => noise(at, 'highpass', 7500, 0.7, 0.09, 0.04),
    bass: (at, f) => tone(at, 'triangle', f, f, 0.4, ss * 1.8),
    stab: (at, ch) => { for (const f of ch) tone(at, 'square', f, f, 0.045, ss * 0.8, { cut: 1500 }); },
    theremin: (at, f) => tone(at, 'sine', f, f, 0.13, ss * 1.7, { vib: 6.5, attack: 0.05 }),
    pluck: (at, f) => tone(at, 'triangle', f, f, 0.1, 0.09),
    move: (at, f) => { tone(at, 'square', f, f * 1.5, 0.12, 0.12, { cut: 2400 }); tone(at, 'sine', f * 2, f * 2, 0.1, 0.18); },
    oops: at => tone(at, 'sawtooth', 200, 110, 0.18, 0.22, { cut: 900 }),
    finale: at => { for (const f of [220, 261.63, 329.63, 440]) tone(at, 'triangle', f, f, 0.2, 1.4); noise(at, 'highpass', 5000, 0.5, 0.15, 0.8); },
  };
  const play = (name, at, f) => { if (!ac || ac.state !== 'running') return; try { SOUND[name](Math.max(at, ac.currentTime), f); } catch { /* never break the game for a sound */ } };

  // ---------------------------------------------------------------- the song clock (as in One Button Orchestra)
  let mode = null, a0 = 0, p0 = 0, lat = 0, schedUpTo = 0;
  function startSong(offset = 0) {
    if (mode) return;
    if (ac && ac.state === 'running') { mode = 'audio'; a0 = ac.currentTime + 0.12 - offset; lat = Math.min(0.3, (ac.outputLatency || 0) + (ac.baseLatency || 0)); }
    else { mode = 'perf'; p0 = performance.now() / 1000 + 0.12 - offset; ac?.resume?.().catch(() => {}); }
    schedUpTo = Math.max(0, offset);
  }
  const songNow = () => mode === 'audio' ? ac.currentTime - a0 : mode === 'perf' ? performance.now() / 1000 - p0 : -LEAD;
  const heard = () => songNow() - lat;
  const acAt = t => mode === 'audio' ? a0 + t : (ac ? ac.currentTime + (t - songNow()) : 0);
  function schedule() {
    if (!mode || !ac || ac.state !== 'running') return;
    const until = songNow() + 0.25, total = chart.bars * 8;
    let s = Math.ceil(schedUpTo / ss - 1e-6);
    for (; s * ss < until && s <= total; s++) {
      const at = acAt(s * ss); if (at < ac.currentTime - 0.01) continue;
      if (s === total) { play('kick', at); play('finale', at); continue; }
      const bar = Math.floor(s / 8), i = s % 8, ch = bar % 4;
      if (i === 0 || i === 4) play('kick', at);
      if (i === 2 || i === 6) play('snare', at);
      if (i % 2) { play('hat', at); if (bar >= 1) play('stab', at, CHORDS[ch]); }
      if (i % 2 === 0) { const r = ROOTS[ch], walk = [1, 1.5, 2, 1.5][i / 2]; play('bass', at, r * walk); }
      const m = THEREMIN[s % THEREMIN.length]; if (bar >= 1 && m != null) play('theremin', at, 440 * Math.pow(2, m / 12));
    }
    for (let n = 0; n < noteT.length; n++) if (noteT[n] >= schedUpTo && noteT[n] < until) play('pluck', acAt(noteT[n]), LANE_HZ[chart.lanes[n]]);
    schedUpTo = until;
  }

  // ---------------------------------------------------------------- judging taps (a phone that plays)
  const judged = new Map(), strays = new Set(), missed = new Set();
  const flash = [0, 0, 0, 0];
  let phase = 'count', last = null;
  function show(text, cls) { const j = $('.mm-judge'); j.textContent = text; j.className = 'mm-judge ' + cls; void j.offsetWidth; j.classList.add('pop'); }
  function tap(l) {
    if (watching) return;
    if (ac && ac.state !== 'running') ac.resume().catch(() => {});
    const pad = ui.querySelector(`.mm-pad[data-l="${l}"]`); pad?.classList.remove('hit'); void pad?.offsetWidth; pad?.classList.add('hit');
    if (phase !== 'play' || !mode) return;
    const t = heard(), win = init.window.good;
    let best = -1, bd = Infinity, other = false;
    for (let n = 0; n < noteT.length; n++) {
      if (judged.has(n) || missed.has(n)) continue;
      const d = t - noteT[n]; if (d > win) continue; if (d < -win) break;
      if (chart.lanes[n] !== l) { other = true; continue; }
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = n; }
    }
    if (best >= 0) {
      const d = t - noteT[best], q = Math.abs(d) <= init.window.perfect ? 0 : 1;
      judged.set(best, q); ctx.send('hit', { n: best, q });
      play('move', ac ? ac.currentTime : 0, LANE_HZ[l]);
      show(q === 0 ? 'PERFECT!' : d < 0 ? 'Good (early)' : 'Good (late)', q === 0 ? 'perfect' : 'good');
      flash[l] = performance.now();
      dance(me, l);
    } else {
      const next = noteT.findIndex((nt, i) => nt > t - win && !judged.has(i) && !missed.has(i));
      if (next >= 0 && !strays.has(next)) { strays.add(next); ctx.send('stray', next); }
      play('oops', ac ? ac.currentTime : 0); show(other ? 'Wrong move!' : 'Oops! No arrow', 'stray');
      oops(me);
    }
    paintMe();
  }
  ui.querySelectorAll('.mm-pad').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); tap(+b.dataset.l); }));
  const KEYS = { ArrowLeft: 0, KeyD: 0, ArrowUp: 1, KeyF: 1, ArrowDown: 2, KeyJ: 2, ArrowRight: 3, KeyK: 3 };
  const onKey = e => { if (e.repeat || !(e.code in KEYS)) return; e.preventDefault(); tap(KEYS[e.code]); };
  addEventListener('keydown', onKey);
  function paintMe() {
    if (watching) return;
    const s = scoreOf(chart, judged, strays, mode ? heard() : 0);
    $('.mm-score').textContent = s.score;
    $('.mm-combo').textContent = s.combo >= 2 ? `${s.combo} combo · x${mult(s.combo)}` : '';
  }

  // ---------------------------------------------------------------- the arrow highway (2D canvas)
  let cw = 0, chh = 0;
  function size() { const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (!r.width) return; cw = r.width; chh = r.height; canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d); c2.setTransform(d, 0, 0, d, 0, 0); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  function arrow(x, y, r, dir, fill, alpha = 1) {
    c2.save(); c2.translate(x, y); c2.rotate(ROT[dir]); c2.globalAlpha = alpha;
    c2.beginPath(); c2.moveTo(r, 0); c2.lineTo(r * 0.05, -r * 0.85); c2.lineTo(r * 0.05, -r * 0.38); c2.lineTo(-r * 0.85, -r * 0.38); c2.lineTo(-r * 0.85, r * 0.38); c2.lineTo(r * 0.05, r * 0.38); c2.lineTo(r * 0.05, r * 0.85); c2.closePath();
    c2.fillStyle = fill; c2.fill(); c2.lineJoin = 'round'; c2.lineWidth = Math.max(2.5, r * 0.16); c2.strokeStyle = '#0d2228'; c2.stroke();
    c2.restore();
  }
  function drawLane() {
    if (!cw) size(); if (!cw) return;
    const t = mode ? heard() : -LEAD, hitY = chh * 0.84, lw = Math.min(cw / 4, 120), x0 = (cw - lw * 4) / 2, r = Math.min(lw * 0.36, 26);
    c2.clearRect(0, 0, cw, chh);
    c2.fillStyle = 'rgba(20,12,36,.78)'; c2.fillRect(x0, 0, lw * 4, chh);
    for (let l = 0; l < 4; l++) { c2.fillStyle = l % 2 ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,0)'; c2.fillRect(x0 + l * lw, 0, lw, chh); }
    // beat lines
    c2.strokeStyle = 'rgba(255,255,255,.12)'; c2.lineWidth = 2;
    for (let b = Math.floor(t / (ss * 2)); b * ss * 2 < t + LEAD; b++) { const y = hitY - (b * ss * 2 - t) / LEAD * hitY; if (y < 0 || y > chh) continue; c2.beginPath(); c2.moveTo(x0, y); c2.lineTo(x0 + lw * 4, y); c2.stroke(); }
    // the line with ghost receptors
    c2.fillStyle = '#ffd23f'; c2.fillRect(x0, hitY - 2, lw * 4, 4);
    const nowMs = performance.now();
    for (let l = 0; l < 4; l++) {
      const k = Math.max(0, 1 - (nowMs - flash[l]) / 220);
      arrow(x0 + (l + 0.5) * lw, hitY, r * (1 + k * 0.25), moves[l].arrow, k ? '#fff6c8' : 'rgba(255,255,255,.14)');
      if (k) { c2.strokeStyle = `rgba(255,210,63,${k})`; c2.lineWidth = 5; c2.beginPath(); c2.arc(x0 + (l + 0.5) * lw, hitY, r * 1.2 + (1 - k) * 24, 0, Math.PI * 2); c2.stroke(); }
    }
    for (let n = 0; n < noteT.length; n++) {
      const dt = noteT[n] - t; if (dt > LEAD) break; if (dt < -0.5) continue;
      if (!watching && !judged.has(n) && dt < -init.window.good) missed.add(n);
      if (judged.has(n)) continue;
      const l = chart.lanes[n], y = hitY - dt / LEAD * hitY, gone = missed.has(n);
      arrow(x0 + (l + 0.5) * lw, y, r, moves[l].arrow, gone ? '#5a5466' : LANE_COL[l], gone ? 0.6 : 1);
    }
  }

  // ---------------------------------------------------------------- the 3D stage
  const G = ctx.group, mats = [], geos = [];
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }); mats.push(m); return m; };
  const n = players.length, gap = 1.7, xs = players.map((p, i) => (i - (n - 1) / 2) * gap), half = Math.max(2.6, n * gap / 2 + 0.9);
  let dress = null;
  try { dress = dressArena({ ...ctx, arena: { shape: 'rect', hw: half, hd: 1.6 } }, { mist: false, spots: [[-half - 0.6, 0.36, 1.3], [half + 0.6, 0.36, 1.2], [-half * 0.45, 0, 2.9], [half * 0.5, 0, 3.0]], ghosts: [[-half - 1.8, 1.6, -2.6], [half + 1.9, 1.9, -2.9]] }); } catch (e) { console.error(e); dress = null; }
  // stage: a round purple platform with an orange trim, and the ground around it
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 32).rotateX(-Math.PI / 2), M('#2a2140', { roughness: 1 })); ground.position.y = -0.01; ground.receiveShadow = true; G.add(ground);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(half + 0.4, half + 0.6, 0.36, 40, 1, false), M('#5b3a8c')); plat.scale.z = 0.55; plat.position.set(0, 0.18, 0); plat.receiveShadow = true; G.add(plat);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(half + 0.42, 0.06, 6, 56).rotateX(Math.PI / 2), M(PALETTE.orange, { emissive: '#ff6a00', emissiveIntensity: 0.6 })); trim.scale.z = 0.55; trim.position.y = 0.36; G.add(trim);
  // tombstones behind the stage (the big friendly moon is a DOM circle in the sky: a 3D one far back sat in the title)
  const stoneGeo = new THREE.CapsuleGeometry(0.32, 0.5, 4, 10); geos.push(stoneGeo);
  const stones = new THREE.InstancedMesh(stoneGeo, M('#8a86a0', { roughness: 0.9 }), 7), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < 7; i++) { const x = (i - 3) * (half * 0.62) + Math.sin(i * 3.1) * 0.4, z = -2.6 - (i % 2) * 0.9; m4.compose(v.set(x, 0.32, z), q.setFromEuler(e.set(0, 0, Math.sin(i * 1.7) * 0.18)), sc.set(1, 1 + (i % 3) * 0.15, 0.35)); stones.setMatrixAt(i, m4); }
  stones.castShadow = true; G.add(stones);
  // the backup dancer: a big round ghost with a smile, floating behind the dancers and bobbing on the beat
  const ghost = new THREE.Group(); ghost.position.set(0, 1.2, -2.4); G.add(ghost);
  const gbody = new THREE.Mesh(ghostGeo(THREE, 0.45), M('#ffffff', { roughness: 0.5, emissive: '#d8ccff', emissiveIntensity: 0.45 })); ghost.add(gbody);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#2a1840' }); mats.push(eyeM);
  for (const sx of [-0.17, 0.17]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), eyeM); eye.scale.y = 1.4; eye.position.set(sx * 0.82, 0.64, 0.385); ghost.add(eye); }
  const cheekM = new THREE.MeshBasicMaterial({ color: '#ff9ec8' }); mats.push(cheekM);
  for (const sx of [-0.3, 0.3]) { const ck = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), cheekM); ck.scale.z = 0.3; ck.position.set(sx * 0.82, 0.52, 0.395); ghost.add(ck); }
  // dancers
  const band = new Map(), tags = [];
  players.forEach((p, i) => {
    const slot = { actor: null, x: xs[i], bounce: 0 };
    band.set(p.pid, slot);
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }).then(a => {
      if (!a) return; slot.actor = a; a.place(xs[i], 0.36, 0.25, 0);
      tags.push(ctx.stage.tag(a.group, { text: p.pid === me ? 'YOU' : p.name, seat: p.seat, height: a.height + 0.3, cls: p.pid === me ? 'me' : '' }));
    }).catch(() => {});
  });
  ctx.camera({ cx: 0, cz: 0.2, hw: half + 0.4, hd: 1.4, pitch: 16, tall: 2.4 });
  function dance(pid, l) { const b = band.get(pid); if (!b) return; b.bounce = 1; b.actor?.play(moves[l].clip, 520); }
  function oops(pid) { band.get(pid)?.actor?.play('shrug', 600); }

  // ---------------------------------------------------------------- server state
  const board = new Map(players.map(p => [p.pid, ui.querySelector(`.mm-board [data-pid="${p.pid}"]`)]));
  const grade = pct => pct >= 0.85 ? 'S' : pct >= 0.65 ? 'A' : pct >= 0.45 ? 'B' : pct >= 0.25 ? 'C' : 'D';
  function note(g) {
    if (g.phase === 'count') return watching ? 'Get your phones ready to dance…' : 'Tap the matching button (or the arrow keys) as each arrow reaches the yellow line.';
    if (g.phase === 'end') {
      const mx = init.max || 1, my = me != null ? g.st[me]?.[0] ?? 0 : 0;
      if (init.solo) return `Score ${my} of ${mx}: grade ${grade(my / mx)}!`;
      return 'What a monster mash! Take a bow.';
    }
    return '';
  }
  return {
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'play') { const off = Math.max(0, init.songLen + 0.6 - g.left - 1); startSong(off > 1.5 ? off : 0); }
        if (g.phase === 'end') {
          ctx.sfx('win');
          const top = Math.max(...Object.values(g.st).map(s => s[0]));
          for (const [pid, b] of band) b.actor?.setPose(g.st[pid]?.[0] === top && top > 0 ? 'cheer' : 'bowGreet');
        }
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.mm-count').textContent = g.phase === 'count' ? g.left : '';
      $('.mm-sec').textContent = g.phase === 'count' ? 'Get ready…' : g.phase === 'end' ? 'Encore!' : SECTIONS[Math.max(0, g.sec ?? 0)];
      const best = Math.max(0, ...Object.values(g.st).map(s => s[0]));
      for (const [pid, s] of Object.entries(g.st)) {
        const el = board.get(+pid); if (!el) continue;
        el.querySelector('.sc').textContent = s[0];
        el.querySelector('.mm-cb').textContent = s[1] >= 4 ? `${s[1]}x` : '';
        el.classList.toggle('lead', s[0] === best && best > 0);
        if (+pid !== me && last) {
          const mv = g.mv?.[pid], was = last.mv?.[pid];
          if (mv && mv[0] >= 0 && (!was || mv[0] !== was[0])) dance(+pid, mv[1]);
          else if (last.st[pid] && s[4] > last.st[pid][4]) oops(+pid);
        }
        const b = band.get(+pid); if (b?.actor && g.phase === 'play') b.actor.setPose(s[1] >= 12 ? 'dance' : 'idle');
      }
      $('.mm-note').textContent = note(g);
      last = g;
    },
    frame(dt) {
      schedule();
      if (phase === 'play' && !watching) { const before = missed.size; drawLane(); if (missed.size !== before) { show('Miss', 'miss'); paintMe(); oops(me); } }
      else drawLane();
      const t = performance.now() / 1000, beat = mode ? Math.max(0, songNow()) / (ss * 2) : t * 1.6, ph = beat % 1;
      dress?.frame(dt, t);
      const hop = Math.pow(1 - ph, 3);
      ghost.position.y = 1.2 + hop * 0.25; ghost.position.x = Math.sin(beat * Math.PI / 4) * half * 0.8; ghost.rotation.z = Math.sin(beat * Math.PI) * 0.12; gbody.scale.set(1 + hop * 0.06, 1 - hop * 0.05, 1 + hop * 0.06);
      trim.material.emissiveIntensity = 0.4 + hop * 0.5;
      for (const b of band.values()) {
        b.bounce = Math.max(0, b.bounce - dt * 4);
        if (b.actor) { b.actor.group.position.y = 0.36 + (phase === 'play' ? hop * 0.04 : 0); b.actor.update(dt); }
      }
    },
    dispose() {
      removeEventListener('keydown', onKey); ro?.disconnect(); try { ac?.close(); } catch { /* already closed */ }
      for (const tg of tags) tg.remove();
      try { dress?.dispose(); } catch (e2) { console.error(e2); }
      for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
