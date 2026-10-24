// ROPE RUMBLE, as drawn: a village green ringed with hay bales under strings of bright bunting, a big round mud puddle
// in the middle. Thick braided ropes run from the knot to each side; a red ribbon on the knot flutters. Each side has
// a chalk line across its rope with two little flags in its colour: drag the ribbon over YOUR line. Players lean back
// against the rope and jerk backwards on every heave. Solo: Big Barnaby, a huge dwarf strongman, pulls the other end.
// On the phone: a drum at the bottom with a ring that closes on it every beat (tap as the ring meets the drum), the
// verdict of each tap (PERFECT / GOOD / Too fast!), the count-in, and a tug bar at the top showing where the ribbon is.
import { RULES, CPU } from './sim.js';
import { SEATS } from '../../shared/protocol.js';
import { scoreBar, h, esc } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';

const ROPE_Y = 0.78;
// Round 12: five places to pull (sim.js GROUND_COUNT), picked from the seed.
export const GROUNDS = [
  { name: 'Village Green', grass: '#6cc95a', green: '#86da6c', pit: '#7a5230', blob: '#5e3c20', bale: '#e9c45c', bunt: ['#ff4d4d', '#ffd23f', '#3d8bff', '#3ecf5a', '#f04fd8'] },
  { name: 'Sandy Beach', grass: '#e8d49a', green: '#f2e2b0', pit: '#4fb6e8', blob: '#2f8fd0', bale: '#b08a5a', bunt: ['#ff7a3d', '#ffffff', '#39d0e0', '#ffd23f', '#3d8bff'] },
  { name: 'Snowy Field', grass: '#dfeefc', green: '#f6fbff', pit: '#9fd8ff', blob: '#7fc0ee', bale: '#ffffff', bunt: ['#e8394a', '#ffffff', '#3d8bff', '#3ecf5a', '#ffd23f'] },
  { name: 'Foam Pit Fair', grass: '#5ab84a', green: '#c8955a', pit: '#ff8fb8', blob: '#ffd0e4', bale: '#ff6b6b', bunt: ['#ffd23f', '#ff7ab8', '#39d0e0', '#b07cff', '#ffffff'] },
  { name: 'Autumn Orchard', grass: '#8fa84a', green: '#b8b85a', pit: '#7a5230', blob: '#5e3c20', bale: '#e9b04c', bunt: ['#ff7a14', '#ffd23f', '#c8324a', '#8a5a32', '#ffb02e'] },
];
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const init = ctx.init, sides = init.sides, bps = init.bpm / 60, L = init.line, count = init.count;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const player = pid => ctx.players.find(p => p.pid === pid);
  const sideColor = s => (s.pids[0] === CPU ? '#b5743a' : player(s.pids[0])?.color || '#888');
  const sideName = s => s.pids.map(pid => (pid === CPU ? 'Big Barnaby' : pid === ctx.me ? 'You' : player(pid)?.name || '?')).join(' + ');
  const mySide = sides.findIndex(s => s.pids.includes(ctx.me));
  const G = GROUNDS[(init.ground | 0) % GROUNDS.length], juice = createJuice(ctx);
  // ---- the green
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std(G.grass)); grass.position.y = -0.02; grass.receiveShadow = true; group.add(grass);
  const green = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), std(G.green)); green.position.y = -0.01; green.scale.set(ctx.arena.hw + 1.9, 1, ctx.arena.hd + 1.8); green.receiveShadow = true; group.add(green);
  const mud = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28).rotateX(-Math.PI / 2), std(G.pit, { roughness: 0.4 })); mud.position.y = 0.005; mud.scale.set(1.25, 1, 0.9); mud.receiveShadow = true; group.add(mud);
  const blobs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.4, 14).rotateX(-Math.PI / 2), std(G.blob, { roughness: 0.3 }), 6);
  for (let i = 0; i < 6; i++) { m4.compose(v.set(Math.sin(i * 1.9) * 1.1, 0.01, Math.cos(i * 1.9) * 0.7), q.identity(), sc.setScalar(0.6 + (i % 3) * 0.3)); blobs.setMatrixAt(i, m4); }
  group.add(blobs);
  // hay bales round the edge (gaps where the ropes run out), bunting along the back
  const AR = ctx.arena, RX = AR.hw + 1.5, RZ = AR.hd + 1.4, HB = 22, bales = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.7, 0.75), std(G.bale), HB); let bi = 0;
  for (let i = 0; i < HB; i++) {
    const a = i / HB * Math.PI * 2, x = Math.sin(a) * RX, z = Math.cos(a) * RZ, d = Math.hypot(x, z);
    if (sides.some(s => (x * s.dir[0] + z * s.dir[1]) / d > 0.9)) continue;
    m4.compose(v.set(x, 0.35, z), q.setFromEuler(e3.set(0, Math.atan2(x / RX, z / RZ), 0)), sc.setScalar(1)); bales.setMatrixAt(bi++, m4);
  }
  bales.count = bi; bales.castShadow = true; group.add(bales);
  const NP = 5, poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), std('#ffffff'), NP);
  const FLAGS = 48, pennants = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.42, 3).rotateX(Math.PI), std('#ffffff', { side: THREE.DoubleSide }), FLAGS);
  const BUNT = G.bunt.map(c => new THREE.Color(c));
  const polePos = []; for (let i = 0; i < NP; i++) { const x = -RX - 1 + i * (RX + 1) * 2 / (NP - 1), z = -RZ - 1.6; polePos.push([x, z]); m4.makeTranslation(x, 2, z); poles.setMatrixAt(i, m4); }
  for (let i = 0; i < FLAGS; i++) {
    const per = FLAGS / (NP - 1), seg = Math.floor(i / per), t = (i % per + 0.5) / per, [ax, az] = polePos[seg], [bx, bz] = polePos[seg + 1];
    m4.compose(v.set(ax + (bx - ax) * t, 3.8 - Math.sin(t * Math.PI) * 0.7, az + (bz - az) * t), q.identity(), sc.setScalar(1)); pennants.setMatrixAt(i, m4); pennants.setColorAt(i, BUNT[i % 5]);
  }
  poles.castShadow = true; group.add(poles, pennants);
  // ---- chalk lines + side flags
  for (const s of sides) {
    const px = -s.dir[1], pz = s.dir[0], cx = s.dir[0] * L, cz = s.dir[1] * L, color = sideColor(s);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); line.position.set(cx, 0.02, cz); line.rotation.y = Math.atan2(s.dir[0], s.dir[1]) + Math.PI / 2; group.add(line);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })); band.position.set(cx + s.dir[0] * 0.36, 0.018, cz + s.dir[1] * 0.36); band.rotation.y = line.rotation.y; group.add(band);
    for (const sd of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), std('#ffffff')); pole.position.set(cx + px * sd * 1.45, 0.65, cz + pz * sd * 1.45); group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })); flag.position.set(pole.position.x + 0.25, 1.15, pole.position.z); group.add(flag);
    }
  }
  // ---- ropes, knot, ribbon
  const ropeGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 8).translate(0, 0.5, 0), ropeMat = std('#d9b47a', { roughness: 0.95 });
  const ropes = sides.map(() => { const r = new THREE.Mesh(ropeGeo, ropeMat); r.castShadow = true; group.add(r); return r; });
  const knot = new THREE.Group(); group.add(knot);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), std('#c99a5c')); knot.add(ball);
  const ribMat = new THREE.MeshStandardMaterial({ color: '#ff2a3a', side: THREE.DoubleSide, roughness: 0.5 });
  const ribA = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.7).translate(0, -0.35, 0), ribMat), ribB = ribA.clone(); knot.add(ribA, ribB);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 12), ribMat); bow.position.y = 0.12; knot.add(bow);
  const knotShadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.2, depthWrite: false })); group.add(knotShadow);
  // ---- the strongman (solo)
  let barnaby = null;
  const cpuSide = sides.findIndex(s => s.pids[0] === CPU);
  if (cpuSide >= 0) ctx.createActor({ look: { race: 'dwarf', seed: 4242 } }, { scale: 1.35 }).then(a => { if (!a) return; barnaby = a; a.setPose('ready'); barnaby.tag = stage.tag(a.group, { text: 'Big Barnaby', height: a.height + 0.35, cls: 'rr-cpu' }); });
  // ---- DOM: tug bar, drum, count-in, verdicts
  const bar = scoreBar(ctx, { unit: 'pulls' });
  const top = h('div', 'rr-top'); ctx.ui.append(top);
  const title = h('div', 'rr-round'); top.append(title);
  let tug = null; const minis = [];
  if (sides.length === 2) {
    tug = h('div', 'rr-tug', `<span class="rr-l" style="--c:${sideColor(sides[0])}">${esc(sideName(sides[0]))}</span><div class="rr-track" style="--a:${sideColor(sides[0])};--b:${sideColor(sides[1])}"><i class="rr-mid"></i><b class="rr-rib"></b></div><span class="rr-r" style="--c:${sideColor(sides[1])}">${esc(sideName(sides[1]))}</span>`);
    top.append(tug);
  } else for (const s of sides) { const e = h('div', 'rr-mini', `<span style="--c:${sideColor(s)}">${esc(sideName(s))}</span><div class="rr-mtrack" style="--c:${sideColor(s)}"><b></b></div>`); top.append(e); minis.push(e.querySelector('b')); }
  const drum = h('div', 'rr-drum' + (ctx.me == null ? ' watch' : ''), '<i class="rr-ring"></i><b class="rr-skin">TAP<br><small>on the beat</small></b><em class="rr-say"></em>'); ctx.ui.append(drum);
  const ring = drum.querySelector('.rr-ring'), skin = drum.querySelector('.rr-skin'), say = drum.querySelector('.rr-say');
  const shout = h('div', 'rr-shout'); ctx.ui.append(shout);
  let lb = 0, ph = 'ready', round = 0, lastBeat = -1, lastN = -99, prevS = -9, flash = 0, sayT = 0, k = [0, 0], kv = [0, 0], win = -2, shoutKey = '';
  const jolt = new Map();         // pid -> 0..1 heave kick
  function verdict(text, cls) { say.textContent = text; say.className = 'rr-say on ' + cls; sayT = 0.6; }
  function setShout(text, cls = '') { const key = text + cls; if (key === shoutKey) return; shoutKey = key; shout.textContent = text; shout.className = 'rr-shout' + (text ? ' on ' + cls : ''); }
  /** One tap of PULL (the A button, Space, a gamepad, or the drum itself): judged here against the drum we show. */
  let streak = 0;
  function tap() {
    if (ctx.me == null) return;
    if (ph !== 'pull') { if (ph === 'ready') verdict('Wait for PULL!', 'meh'); return; }
    const nb = Math.round(lb), off = (lb - nb) / bps;
    if (nb === lastN || nb < count) { verdict('Too fast!', 'bad'); streak = 0; return; }
    lastN = nb;
    const qv = off >= -RULES.perfect && off <= RULES.perfect + 0.06 ? 2 : 1;
    ctx.send('pull', { n: nb, q: qv });
    streak = qv === 2 ? streak + 1 : 0;
    verdict(qv === 2 ? (streak >= 3 ? `PERFECT ×${streak}!` : 'PERFECT!') : 'Good', qv === 2 ? 'good' : 'ok');
    if (qv === 2 && streak >= 3) navigator.vibrate?.(25);
    jolt.set(ctx.me, qv === 2 ? 1 : 0.6); ctx.sfx(qv === 2 ? 'good' : 'tap');
  }
  if (ctx.me != null) drum.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  return {
    state(g) {
      if (g.ph !== ph || g.r !== round || Math.abs(g.bt - lb) > 0.6) lb = g.bt; else lb += (g.bt - lb) * 0.2;
      if (g.r !== round) lastN = -99;
      ph = g.ph; round = g.r; kv = g.k; win = g.win;
      title.innerHTML = `Pull <b>${Math.min(init.pulls, g.r + 1)}</b> of ${init.pulls}` + sides.map((s, i) => ` <span class="rr-wins" style="--c:${sideColor(s)}">${'●'.repeat(g.w[i])}${'○'.repeat(Math.max(0, 2 - g.w[i]))}</span>`).join('');
      bar.set(g.sc, g.left);
    },
    input(inp) {
      const press = (inp.b & 1) && !(prevS === inp.s - 1); if (inp.b & 1) prevS = inp.s;
      if (press) tap();
    },
    event(ev) {
      if (ev.e === 'pull') { if (ev.pid !== ctx.me) jolt.set(ev.pid, ev.q === 2 ? 1 : 0.6); }
      else if (ev.e === 'go') { ctx.sfx('go'); }
      else if (ev.e === 'win') {
        const s = sides[ev.side], mine = s && s.pids.includes(ctx.me);
        ctx.sfx(ev.side < 0 ? 'bad' : mine ? 'win' : ctx.me == null ? 'good' : 'bad');
        if (ev.side >= 0 && ctx.me != null && mySide >= 0) juice.flash(mine ? 'rgba(255,210,63,.8)' : 'rgba(232,57,74,.7)', 360);
        juice.shake(0.1, 0.35); streak = 0;
        for (const [i, sd] of sides.entries()) for (const pid of sd.pids) { if (pid === CPU) { barnaby?.play(i === ev.side ? 'cheer' : 'hit', 2400); continue; } ctx.actor(pid)?.play(i === ev.side ? 'cheer' : 'hit', 2400); }
      }
    },
    pose() { return ph === 'pull' || ph === 'ready' ? 'ready' : undefined; },
    frame(dt, t) {
      juice.frame(dt, t);
      lb += dt * bps;
      const nb = Math.floor(lb);
      if (nb !== lastBeat) { if (lastBeat >= 0 && (ph === 'pull' || ph === 'ready') && nb >= 1) { ctx.sfx(nb < count ? 'tap' : 'dice'); flash = 1; } lastBeat = nb; }
      // the drum: a ring closing onto the skin each beat
      const frac = lb - Math.floor(lb), active = ph === 'pull' || (ph === 'ready' && lb > count - 1.5);
      ring.style.transform = `translate(-50%, -50%) scale(${(1 + (1 - frac) * 1.3).toFixed(3)})`; ring.style.opacity = active ? (0.35 + frac * 0.65).toFixed(2) : '0';
      flash = Math.max(0, flash - dt * 5); skin.style.transform = `scale(${(1 + flash * 0.12).toFixed(3)})`;
      drum.classList.toggle('live', ph === 'pull');
      if (sayT > 0) { sayT -= dt; if (sayT <= 0) say.classList.remove('on'); }
      // count-in / result shout
      if (ph === 'ready') { const c = count - Math.floor(lb); setShout(c >= 1 && c <= 3 ? String(c) : lb < 1 ? (round === 0 ? G.name + '!' : 'Ready…') : '', c >= 1 && c <= 3 ? 'count' : ''); }
      else if (ph === 'pull') setShout(lb < count + 1 ? 'PULL!' : '', 'go');
      else if (ph === 'done') { const s = sides[win]; setShout(s ? (s.pids.includes(ctx.me) ? 'You win the pull!' : `${sideName(s)} ${s.pids.length > 1 ? 'win' : s.pids[0] === ctx.me ? 'win' : 'wins'} the pull!`) : 'Nobody got it!', s && s.pids.includes(ctx.me) ? 'go' : ''); }
      // knot, ropes
      const kk = 1 - Math.exp(-dt * 14); k[0] += (kv[0] - k[0]) * kk; k[1] += (kv[1] - k[1]) * kk;
      const sway = Math.sin(t * 7) * 0.03;
      knot.position.set(k[0], ROPE_Y + sway, k[1]); knotShadow.position.set(k[0], 0.02, k[1]);
      ribA.rotation.set(Math.sin(t * 6) * 0.3, 0, 0.35 + Math.sin(t * 9) * 0.15); ribB.rotation.set(Math.sin(t * 6 + 1) * 0.3, 0, -0.35 + Math.sin(t * 8) * 0.15);
      sides.forEach((s, i) => {
        const len = RULES.gap + (s.pids.length - 1) * RULES.step + 1.1, ex = k[0] + s.dir[0] * len, ez = k[1] + s.dir[1] * len;
        const r = ropes[i]; r.position.set(k[0], ROPE_Y + sway, k[1]);
        v.set(ex - k[0], ROPE_Y - 0.12 - (ROPE_Y + sway), ez - k[1]); const d = v.length(); r.scale.set(1, d, 1); r.quaternion.setFromUnitVectors(up, v.normalize());
      });
      // people lean back against the rope and kick back on a heave
      sides.forEach(s => s.pids.forEach((pid, j) => {
        const a = pid === CPU ? barnaby : ctx.actor(pid); if (!a) return;
        let jv = jolt.get(pid) || 0; jv = Math.max(0, jv - dt * 4); jolt.set(pid, jv);
        const lean = ph === 'done' ? 0.05 : 0.32 + jv * 0.18, back = jv * 0.22;
        if (pid === CPU) { const dd = RULES.gap + 0.3; a.place(k[0] + s.dir[0] * (dd + back), 0, k[1] + s.dir[1] * (dd + back), Math.atan2(-s.dir[0], -s.dir[1])); a.update(dt); }
        else { a.group.position.x += s.dir[0] * back; a.group.position.z += s.dir[1] * back; }
        a.group.rotation.set(lean * s.dir[1], 0, -lean * s.dir[0]);
      }));
      // the tug bar / mini bars
      if (tug) { const p = (k[0] * sides[1].dir[0] + k[1] * sides[1].dir[1]) / L; tug.querySelector('.rr-rib').style.left = `${(50 + Math.max(-1.08, Math.min(1.08, p)) * 46).toFixed(1)}%`; }
      minis.forEach((b, i) => { const p = (k[0] * sides[i].dir[0] + k[1] * sides[i].dir[1]) / L; b.style.width = `${Math.max(0, Math.min(100, 50 + p * 50)).toFixed(1)}%`; });
    },
    dispose() { juice.dispose(); bar.el.remove(); barnaby?.tag?.remove(); },
  };
}
