// ONE BUTTON ORCHESTRA on a screen. Up top, the 3D band: every player's character on a bandstand behind their
// instrument (drum, chimes, gong, bongos — by seat), playing a stroke whenever they land a note. Below, the note lane
// (a 2D canvas: notes fall to the line) and, on a phone that plays, the one big button.
//
// Music is synthesized here with WebAudio, scheduled a quarter of a second ahead from the chart: a kick on every beat,
// a hi-hat on the off-beats, a bass note a bar, and a soft wooden tick on every note of the chart so you can HEAR the
// pattern. Your own taps play your instrument at once. Timing is judged on this device against the song clock — the
// audio clock when sound is running (minus the speaker's output delay), the page clock otherwise — and only the
// verdict goes to the server (`hit` { n, q } / `stray` n), which checks it for sense.
import { chip } from '../../client/gamehud.js';
import { scoreOf, stepSec, SECTIONS, mult } from './sim.js';

const LEAD = 1.7;                                          // seconds a note is visible before it reaches the line
const INST = [
  { id: 'drum', name: 'Drum', clip: 'attack' },
  { id: 'chimes', name: 'Chimes', clip: 'attack' },
  { id: 'gong', name: 'Gong', clip: 'attack' },
  { id: 'bongos', name: 'Bongos', clip: 'attack' },
];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const MELODY = [0, 2, 4, 2, 5, 4, 2, 0, 3, 4, 5, 7, 5, 4, 2, 4];
const BASS = [65.41, 98.0, 110.0, 87.31];                  // C, G, A, F — one a bar
const hz = semi => 523.25 * Math.pow(2, semi / 12);

export function createView(ctx) {
  const { ui, players, me, init, THREE } = ctx, chart = init.chart, ss = stepSec(chart.bpm), noteT = chart.steps.map(s => s * ss);
  const watching = me == null, myInst = me != null ? init.instrument[me] ?? 0 : 0;
  ui.innerHTML = `
    <div class="ob-top"><span class="ob-sec">Get ready…</span><span class="clock"><b>--</b></span></div>
    <div class="ob-board">${players.map(p => chip(p, `<em class="ob-inst">${INST[init.instrument[p.pid] ?? 0].name}</em><em class="sc">0</em><strong class="ob-cb"></strong>`)).join('')}</div>
    <div class="ob-play">
      <div class="ob-lane"><canvas></canvas><div class="ob-judge"></div><div class="ob-count"></div></div>
      <div class="ob-me"><span class="ob-score">0</span><span class="ob-combo"></span></div>
      <button class="ob-btn" aria-label="Play a note">TAP!<small>${INST[myInst].name}</small></button>
    </div>
    <p class="ob-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.ob-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), c2 = canvas.getContext('2d');

  // ---------------------------------------------------------------- sound
  let ac = null, master = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); } catch { ac = null; }
  const noiseBuf = (() => { if (!ac) return null; const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = b.getChannelData(0); let s = 7; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } return b; })();
  function env(at, peak, dur, attack = 0.004) { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); g.connect(master); return g; }
  function tone(at, type, f0, f1, peak, dur) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.8); o.connect(env(at, peak, dur)); o.start(at); o.stop(at + dur + 0.05); }
  function noise(at, type, f, q, peak, dur) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const bq = ac.createBiquadFilter(); bq.type = type; bq.frequency.value = f; bq.Q.value = q; s.connect(bq); bq.connect(env(at, peak, dur, 0.002)); s.start(at); s.stop(at + dur + 0.05); }
  const SOUND = {
    kick: at => tone(at, 'sine', 140, 45, 0.9, 0.18),
    hat: at => noise(at, 'highpass', 7000, 0.7, 0.12, 0.05),
    bass: (at, f) => tone(at, 'triangle', f, f, 0.35, ss * 7),
    tick: at => tone(at, 'sine', 1560, 1560, 0.12, 0.05),
    drum: at => { noise(at, 'bandpass', 1900, 0.8, 0.7, 0.13); tone(at, 'triangle', 210, 120, 0.5, 0.12); },
    chimes: (at, f) => { tone(at, 'sine', f, f, 0.45, 0.7); tone(at, 'sine', f * 2.01, f * 2.01, 0.12, 0.4); },
    gong: (at, f) => { tone(at, 'sine', f / 4, f / 4.1, 0.5, 1.1); tone(at, 'sine', f / 4 * 1.48, f / 4 * 1.46, 0.22, 0.9); noise(at, 'lowpass', 900, 0.5, 0.15, 0.3); },
    bongos: (at, f) => tone(at, 'sine', f / 2, f / 2.6, 0.7, 0.16),
  };
  const play = (name, at, f) => { if (!ac || ac.state !== 'running') return; try { SOUND[name](Math.max(at, ac.currentTime), f); } catch { /* never break the game for a sound */ } };
  const noteHz = n => hz(PENTA[MELODY[n % MELODY.length] % PENTA.length]);

  // ---------------------------------------------------------------- the song clock
  let mode = null, a0 = 0, p0 = 0, lat = 0, schedUpTo = 0;
  function startSong(offset = 0) {
    if (mode) return;
    if (ac && ac.state === 'running') { mode = 'audio'; a0 = ac.currentTime + 0.12 - offset; lat = Math.min(0.3, (ac.outputLatency || 0) + (ac.baseLatency || 0)); }
    else { mode = 'perf'; p0 = performance.now() / 1000 + 0.12 - offset; ac?.resume?.().catch(() => {}); }
    schedUpTo = Math.max(0, offset);
  }
  const songNow = () => mode === 'audio' ? ac.currentTime - a0 : mode === 'perf' ? performance.now() / 1000 - p0 : -LEAD;
  const heard = () => songNow() - lat;                       // what the player is hearing (and seeing) right now
  const acAt = t => mode === 'audio' ? a0 + t : (ac ? ac.currentTime + (t - songNow()) : 0);
  function schedule() {
    if (!mode || !ac || ac.state !== 'running') return;
    const until = songNow() + 0.25, total = chart.bars * 8;
    let s = Math.ceil(schedUpTo / ss - 1e-6);
    for (; s * ss < until && s <= total; s++) {
      const at = acAt(s * ss); if (at < ac.currentTime - 0.01) continue;
      if (s < total) { if (s % 2 === 0) play('kick', at); else play('hat', at); }
      if (s % 8 === 0 && s < total) play('bass', at, BASS[(s / 8) % 4]);
      if (s === total) { play('kick', at); play('chimes', at, hz(12)); }
    }
    for (let n = 0; n < noteT.length; n++) if (noteT[n] >= schedUpTo && noteT[n] < until) play('tick', acAt(noteT[n]));
    schedUpTo = until;
  }

  // ---------------------------------------------------------------- judging taps (a phone that plays)
  const judged = new Map(), strays = new Set(), missed = new Set();
  let flash = null, phase = 'count', last = null;
  function show(text, cls) { const j = $('.ob-judge'); j.textContent = text; j.className = 'ob-judge ' + cls; void j.offsetWidth; j.classList.add('pop'); }
  function tap() {
    if (watching) return;
    if (ac && ac.state !== 'running') ac.resume().catch(() => {});
    if (phase !== 'play' || !mode) return;
    const t = heard();
    let best = -1, bd = Infinity;
    for (let n = 0; n < noteT.length; n++) {
      if (judged.has(n) || missed.has(n)) continue;
      const d = t - noteT[n]; if (d > init.window.good) continue; if (d < -init.window.good) break;
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = n; }
    }
    const btn = $('.ob-btn'); btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
    if (best >= 0) {
      const d = t - noteT[best], q = Math.abs(d) <= init.window.perfect ? 0 : 1;
      judged.set(best, q); ctx.send('hit', { n: best, q });
      play(INST[myInst].id, ac ? ac.currentTime : 0, noteHz(best));
      show(q === 0 ? 'PERFECT!' : d < 0 ? 'Good (early)' : 'Good (late)', q === 0 ? 'perfect' : 'good');
      flash = { n: best, at: performance.now() };
      bandHit(me);
    } else {
      const next = noteT.findIndex((nt, i) => nt > t && !judged.has(i));
      if (next >= 0 && !strays.has(next)) { strays.add(next); ctx.send('stray', next); }
      play('drum', ac ? ac.currentTime : 0); show('Oops! No note', 'stray');
    }
    paintMe();
  }
  const btn = $('.ob-btn');
  btn.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  const onKey = e => { if (e.repeat || !['Space', 'Enter', 'KeyJ', 'KeyF', 'KeyK'].includes(e.code)) return; e.preventDefault(); tap(); };
  addEventListener('keydown', onKey);
  function paintMe() {
    if (watching) return;
    const s = scoreOf(chart, judged, strays, mode ? heard() : 0);
    $('.ob-score').textContent = s.score;
    $('.ob-combo').textContent = s.combo >= 2 ? `${s.combo} combo · x${mult(s.combo)}` : '';
  }

  // ---------------------------------------------------------------- the lane (2D canvas)
  let cw = 0, chh = 0;
  function size() { const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (!r.width) return; cw = r.width; chh = r.height; canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d); c2.setTransform(d, 0, 0, d, 0, 0); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  function drawLane() {
    if (!cw) size(); if (!cw) return;
    const t = mode ? heard() : -LEAD, hitY = chh * 0.82, cx = cw / 2, r = Math.min(24, cw * 0.08);
    c2.clearRect(0, 0, cw, chh);
    c2.fillStyle = 'rgba(13,34,40,.72)'; c2.fillRect(cx - r * 2.4, 0, r * 4.8, chh);
    // beat lines
    c2.strokeStyle = 'rgba(255,255,255,.12)'; c2.lineWidth = 2;
    for (let b = Math.floor(t / (ss * 2)); b * ss * 2 < t + LEAD; b++) { const y = hitY - (b * ss * 2 - t) / LEAD * hitY; if (y < 0 || y > chh) continue; c2.beginPath(); c2.moveTo(cx - r * 2.4, y); c2.lineTo(cx + r * 2.4, y); c2.stroke(); }
    // the line
    c2.fillStyle = '#ffd23f'; c2.fillRect(cx - r * 2.4, hitY - 3, r * 4.8, 6);
    c2.strokeStyle = '#0d2228'; c2.lineWidth = 3; c2.beginPath(); c2.arc(cx, hitY, r + 4, 0, Math.PI * 2); c2.stroke();
    for (let n = 0; n < noteT.length; n++) {
      const dt = noteT[n] - t; if (dt > LEAD) break; if (dt < -0.5) continue;
      if (!watching && !judged.has(n) && dt < -init.window.good) missed.add(n);
      if (judged.has(n)) continue;
      const y = hitY - dt / LEAD * hitY, gone = missed.has(n);
      c2.beginPath(); c2.arc(cx, y, r, 0, Math.PI * 2);
      c2.fillStyle = gone ? '#6a7a80' : n % 4 === 0 ? '#ff5f5f' : '#39d0e0'; c2.fill();
      c2.lineWidth = 3; c2.strokeStyle = '#0d2228'; c2.stroke();
      c2.fillStyle = 'rgba(255,255,255,.7)'; c2.beginPath(); c2.arc(cx - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2); c2.fill();
    }
    if (flash && performance.now() - flash.at < 220) { const k = (performance.now() - flash.at) / 220; c2.strokeStyle = `rgba(255,210,63,${1 - k})`; c2.lineWidth = 6; c2.beginPath(); c2.arc(cx, hitY, r + 6 + k * 30, 0, Math.PI * 2); c2.stroke(); }
  }

  // ---------------------------------------------------------------- the 3D band
  const G = ctx.group, mats = [];
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o }); mats.push(m); return m; };
  const stageMesh = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.36, 40), M('#8a4a2a')); stageMesh.position.set(0, 0.18, -0.4); G.add(stageMesh);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(4.62, 0.07, 6, 48).rotateX(Math.PI / 2), M('#ffd23f')); trim.position.set(0, 0.36, -0.4); G.add(trim);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 4, 32, 1, true, Math.PI * 0.5, Math.PI), M('#f3e6c8', { side: THREE.DoubleSide })); shell.position.set(0, 2.2, -0.6); G.add(shell);
  const n = players.length, xs = players.map((p, i) => (i - (n - 1) / 2) * 1.9);
  function instrument(kind) {
    const g = new THREE.Group();
    if (kind === 0) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.42, 18), M('#c8304a')); b.position.y = 0.42; const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 18), M('#f7efe0')); top.position.y = 0.65; g.add(b, top); }
    if (kind === 1) { const cols = ['#ff5f5f', '#ff9a1f', '#ffd23f', '#3ecf5a', '#39d0e0']; const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.34), M('#6a4428')); base.position.y = 0.5; g.add(base); cols.forEach((c, i) => { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.3 - i * 0.03), M(c)); bar.position.set(-0.34 + i * 0.17, 0.57, 0); g.add(bar); }); const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), M('#6a4428')); leg.position.y = 0.25; g.add(leg); }
    if (kind === 2) { const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24).rotateX(Math.PI / 2), M('#e8b828', { metalness: 0.6, roughness: 0.35 })); disc.position.y = 0.95; const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), M('#6a4428')); post1.position.set(-0.55, 0.75, 0); const post2 = post1.clone(); post2.position.x = 0.55; const bar = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.06), M('#6a4428')); bar.position.y = 1.47; g.add(disc, post1, post2, bar); }
    if (kind === 3) { for (const [x, r, h] of [[-0.2, 0.17, 0.62], [0.2, 0.21, 0.56]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, h, 14), M('#a0602a')); b.position.set(x, h / 2, 0); const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 14), M('#f7efe0')); top.position.set(x, h + 0.01, 0); g.add(b, top); } }
    return g;
  }
  const band = new Map();
  players.forEach((p, i) => {
    const kind = init.instrument[p.pid] ?? 0, inst = instrument(kind);
    inst.position.set(xs[i], 0.36, 0.55); G.add(inst);
    const slot = { inst, kind, actor: null, bounce: 0 };
    band.set(p.pid, slot);
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }).then(a => {
      if (!a) return; slot.actor = a; a.place(xs[i], 0.36, -0.15, 0);
    }).catch(() => {});
  });
  ctx.camera({ cx: 0, cz: 0.1, hw: Math.max(2.4, n * 0.95 + 0.6), hd: 1.2, pitch: 20, tall: 2.2 });
  function bandHit(pid) { const b = band.get(pid); if (!b) return; b.bounce = 1; b.actor?.play(INST[b.kind].clip, 260); }

  // ---------------------------------------------------------------- server state
  const board = new Map(players.map(p => [p.pid, ui.querySelector(`.ob-board [data-pid="${p.pid}"]`)]));
  function note(g) {
    if (g.phase === 'count') return watching ? 'Get your phones ready…' : 'Tap the big button (or Space) as each note crosses the yellow line.';
    if (g.phase === 'end') {
      const mx = init.max || 1, mine2 = me != null ? g.st[me]?.[0] ?? 0 : 0, pct = mine2 / mx;
      if (init.solo) return `Score ${mine2} of ${mx} — grade ${pct >= 0.85 ? 'S' : pct >= 0.65 ? 'A' : pct >= 0.45 ? 'B' : pct >= 0.25 ? 'C' : 'D'}.`;
      return 'Bravo! Bows all round.';
    }
    return '';
  }
  return {
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'play') { const off = Math.max(0, init.songLen + 0.6 - g.left - 1); startSong(off > 1.5 ? off : 0); }
        if (g.phase === 'end') { ctx.sfx('win'); for (const b of band.values()) b.actor?.play('bowGreet', 2400); }
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.ob-count').textContent = g.phase === 'count' ? g.left : '';
      $('.ob-sec').textContent = g.phase === 'count' ? 'Get ready…' : g.phase === 'end' ? 'Encore!' : SECTIONS[Math.max(0, g.sec ?? 0)];
      const best = Math.max(0, ...Object.values(g.st).map(s => s[0]));
      for (const [pid, s] of Object.entries(g.st)) {
        const el = board.get(+pid); if (!el) continue;
        el.querySelector('.sc').textContent = s[0];
        el.querySelector('.ob-cb').textContent = s[1] >= 4 ? `${s[1]}x` : '';
        el.classList.toggle('lead', s[0] === best && best > 0);
        const prev = last?.st?.[pid];
        if (+pid !== me && prev && s[2] + s[3] > prev[2] + prev[3]) bandHit(+pid);
        const b = band.get(+pid); if (b?.actor) b.actor.setPose(s[1] >= 16 && g.phase === 'play' ? 'dance' : 'idle');
      }
      $('.ob-note').textContent = note(g);
      last = g;
    },
    frame(dt) {
      schedule();
      if (phase === 'play' && !watching) { const before = missed.size; drawLane(); if (missed.size !== before) { show('Miss', 'miss'); paintMe(); } }
      else drawLane();
      for (const b of band.values()) {
        b.bounce = Math.max(0, b.bounce - dt * 6);
        const k = 1 + b.bounce * 0.12; b.inst.scale.set(k, 1 + b.bounce * 0.2, k);
        b.actor?.update(dt);
      }
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); try { ac?.close(); } catch { /* already closed */ } for (const m of mats) m.dispose(); },
  };
}
