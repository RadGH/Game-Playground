// GOLF VIEW KIT — what Putt Party and Haunted Hole share on screen (Chip-In borrows the ball, club and meter):
//   * a hole drawn from the same course data the rules use: felt, low rails for walls, mushroom bumpers, blocks, ramps
//     (a wedge you can see the ball climb), chevrons on a sloping patch, windmill paddles turning on the course clock,
//     the cup with a flag, a tee mat. A game's `theme` picks the colours; `decorate(hole, g)` adds its own pieces.
//   * one ball per player in its seat colour (with a seat-colour ring, and the player's character standing behind it),
//     drawn where the server says, eased between updates, snapped on a teleport or a new hole, sunk into the cup
//   * YOUR aim: a dotted line from your ball the way you face (with the same aim help the rules use — the line snaps on
//     when it helps), only a few metres long, longer as you charge; a power meter by your ball that fills while you
//     hold A (counted on this phone from the button, so it never waits for the server)
//   * a putter in every character's hands that draws back as they charge and swings through on the putt
//   * HUD: score bar (strokes, lowest leads), a hole pill (Hole 1/3 · Par 2 · clock), a banner, a scorecard between holes
import { STANCE, ST, levelOf, scoreName } from './golf-putt.js';
import { heightAt, spinnerArms, assistYaw, charge, BALL_R } from './golf-kit.js';
import { scoreBar, floatText, h, esc } from '../client/gamehud.js';

export function createPuttView(ctx, { theme = {}, decorate = null, onState = null, onFrame = null, onEvent = null, around = null } = {}) {
  const { THREE, group, stage, players, me, init } = ctx;
  const T = { field: '#6cc95c', felt: '#3fae4f', rail: '#fff3e0', railTop: '#e8434f', bumper: '#ff5a7a', bumperTop: '#fff3e0', block: '#c9b48a', ramp: '#58c26a', tee: '#2c7a3a', flag: '#ffd23f', ...theme };
  const L = init.level || levelOf('normal'), holes = init.holes;
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...extra }); mats.push(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();

  const field = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std(T.field, { roughness: 1 })); field.position.y = -0.03; field.receiveShadow = true; group.add(field);

  // ---------------------------------------------------------------- the hole
  let holeG = null, holeIdx = -1, spinG = [], course = null, cup = null, flagParts = [];
  function buildHole(k) {
    if (holeG) { stage.clear(holeG); holeG.removeFromParent(); }
    holeIdx = k; const H = holes[k]; course = H.course; cup = H.cup; spinG = [];
    holeG = new THREE.Group(); group.add(holeG);
    const walls = course.walls || [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const w of walls) { x0 = Math.min(x0, w.ax, w.bx); x1 = Math.max(x1, w.ax, w.bx); z0 = Math.min(z0, w.az, w.bz); z1 = Math.max(z1, w.az, w.bz); }
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: T.felt, roughness: 0.95 }));
    felt.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2); felt.receiveShadow = true; holeG.add(felt);
    // rails: one instanced box per wall
    const railGeo = new THREE.BoxGeometry(1, 0.26, 0.18), rails = new THREE.InstancedMesh(railGeo, new THREE.MeshStandardMaterial({ color: T.rail, roughness: 0.6 }), Math.max(1, walls.length));
    const tops = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.22), new THREE.MeshStandardMaterial({ color: T.railTop, roughness: 0.5 }), Math.max(1, walls.length));
    walls.forEach((w, i) => {
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az) + 0.18, a = -Math.atan2(w.bz - w.az, w.bx - w.ax);
      m4.compose(v.set((w.ax + w.bx) / 2, 0.13, (w.az + w.bz) / 2), q.setFromEuler(e3.set(0, a, 0)), sc.set(len, 1, 1)); rails.setMatrixAt(i, m4);
      m4.compose(v.set((w.ax + w.bx) / 2, 0.29, (w.az + w.bz) / 2), q, sc.set(len, 1, 1)); tops.setMatrixAt(i, m4);
    });
    rails.count = tops.count = walls.length; rails.castShadow = true; holeG.add(rails, tops);
    // bumpers: a fat cylinder with a cap (springy ones pink, plain ones the block colour)
    const posts = course.posts || [];
    if (posts.length) {
      const pb = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.34, 20), new THREE.MeshStandardMaterial({ color: T.bumper, roughness: 0.45 }), posts.length);
      const pt = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: T.bumperTop, roughness: 0.4 }), posts.length);
      posts.forEach((p, i) => { m4.compose(v.set(p.x, 0.17, p.z), q.identity(), sc.set(p.r, 1, p.r)); pb.setMatrixAt(i, m4); m4.compose(v.set(p.x, 0.34, p.z), q.identity(), sc.set(p.r * 1.05, p.r * 0.55, p.r * 1.05)); pt.setMatrixAt(i, m4); });
      pb.castShadow = true; holeG.add(pb, pt);
      if (decorate?.posts === false) { pb.visible = pt.visible = false; }
    }
    const boxes = course.boxes || [];
    if (boxes.length && !decorate?.ownBoxes) {
      const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 1), new THREE.MeshStandardMaterial({ color: T.block, roughness: 0.8 }), boxes.length);
      boxes.forEach((b, i) => { m4.compose(v.set(b.x, 0.2, b.z), q.identity(), sc.set(b.hw * 2, 1, b.hd * 2)); bm.setMatrixAt(i, m4); });
      bm.castShadow = true; holeG.add(bm);
    }
    for (const R of course.ramps || []) {
      const half = R.axis === 'x' ? R.hw : R.hd, depth = R.axis === 'x' ? R.hd * 2 : R.hw * 2;
      const S = new THREE.Shape(); S.moveTo(-half, 0); S.lineTo(0, R.rise); S.lineTo(half, 0); S.closePath();
      const geo = new THREE.ExtrudeGeometry(S, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
      if (R.axis === 'z') geo.rotateY(-Math.PI / 2);
      const ramp = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: T.ramp, roughness: 0.9, flatShading: true })); ramp.position.set(R.x, 0.004, R.z); ramp.receiveShadow = ramp.castShadow = true; holeG.add(ramp);
      // stripes on the ramp so you can read it is a hump
      const sg = new THREE.BoxGeometry(R.axis === 'x' ? 0.08 : depth, 0.02, R.axis === 'x' ? depth : 0.08);
      for (const f of [-0.5, 0.5]) { const st = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: '#ffffff' })); const off = f * half; st.position.set(R.x + (R.axis === 'x' ? off : 0), R.rise * 0.5 + 0.02, R.z + (R.axis === 'x' ? 0 : off)); st.rotation[R.axis === 'x' ? 'z' : 'x'] = (R.axis === 'x' ? -1 : 1) * Math.sign(off) * Math.atan(R.rise / half); holeG.add(st); }
    }
    for (const S of course.slopes || []) {               // chevrons pointing downhill
      const tex = chevronTexture(THREE), a = Math.atan2(S.gx, S.gz);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(S.hw * 2, S.hd * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false }));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, Math.round(S.hw)), Math.max(1, Math.round(S.hd)));
      tex.rotation = -a + Math.PI; tex.center.set(0.5, 0.5);
      m.position.set(S.x, 0.012, S.z); holeG.add(m);
    }
    for (const S of course.spinners || []) {
      const g = new THREE.Group(); g.position.set(S.x, 0, S.z); holeG.add(g);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.9, 12), new THREE.MeshStandardMaterial({ color: '#fff3e0' })); hub.position.y = 0.45; hub.castShadow = true; holeG.add(hub); hub.position.x = S.x; hub.position.z = S.z;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#e8434f' })); roof.position.set(S.x, 1.2, S.z); roof.castShadow = true; holeG.add(roof);
      const armGeo = new THREE.BoxGeometry(S.len - (S.hub ?? 0.3), 0.3, 0.12).translate((S.len + (S.hub ?? 0.3)) / 2, 0.2, 0);
      for (let k = 0; k < S.arms; k++) { const arm = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({ color: k % 2 ? '#ffd23f' : '#3d8bff' })); arm.rotation.y = -k * Math.PI * 2 / S.arms; arm.castShadow = true; g.add(arm); }
      spinG.push({ g, S });
    }
    // cup, flag, tee mat
    const hole = new THREE.Mesh(new THREE.CircleGeometry(L.cupR, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0d1a12' })); hole.position.set(cup.x, 0.014, cup.z); holeG.add(hole);
    const lip = new THREE.Mesh(new THREE.RingGeometry(L.cupR, L.cupR + 0.05, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); lip.position.set(cup.x, 0.015, cup.z); holeG.add(lip);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), new THREE.MeshStandardMaterial({ color: '#ffffff' })); pole.position.set(cup.x, 1.05, cup.z); holeG.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.52), new THREE.MeshStandardMaterial({ color: T.flag, side: THREE.DoubleSide })); flag.position.set(cup.x + 0.44, 1.85, cup.z); holeG.add(flag); flagParts = [pole, flag];
    const tee = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: T.tee, roughness: 1 })); tee.position.set(H.tee.x, 0.01, H.tee.z); tee.rotation.y = Math.atan2(cup.x - H.tee.x, cup.z - H.tee.z); holeG.add(tee);      // long side across the line, under every ball
    decorate?.(H, holeG, k);
  }
  function chevronTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(14, 22); g.lineTo(32, 42); g.lineTo(50, 22); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---------------------------------------------------------------- balls, clubs, aim
  const DRAW_R = BALL_R * 1.4;                                   // drawn a little bigger than the rules' ball, so a phone can see it
  const ballGeo = new THREE.SphereGeometry(DRAW_R, 16, 10), ringGeo = new THREE.RingGeometry(DRAW_R * 1.45, DRAW_R * 2.05, 24).rotateX(-Math.PI / 2);
  const B = new Map();
  for (const p of players) {
    const ball = new THREE.Mesh(ballGeo, std(p.color, { roughness: 0.3 })); ball.castShadow = true;
    const ring = new THREE.Mesh(ringGeo, basic(p.color, { transparent: true, opacity: 0.85, depthWrite: false }));
    group.add(ball, ring);
    B.set(p.pid, { ball, ring, x: 0, z: 0, tx: 0, tz: 0, st: ST.aim, sink: 0, club: null, swing: 0, ch: 0, seen: false, p });
  }
  const clubGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.78, 6).translate(0, -0.39, 0), headGeo = new THREE.BoxGeometry(0.2, 0.06, 0.07).translate(0.02, -0.78, 0);
  const clubMat = std('#c8ccd6', { metalness: 0.5, roughness: 0.3 }), headMat = std('#33333f', { metalness: 0.4, roughness: 0.4 });
  function clubOf(pid) {
    const R = B.get(pid); if (R.club) return R.club;
    const a = ctx.actor(pid); if (!a) return null;
    const pivot = new THREE.Group(); pivot.position.set(0.06, 0.62, STANCE * 0.42);
    const shaft = new THREE.Mesh(clubGeo, clubMat), head = new THREE.Mesh(headGeo, headMat); pivot.add(shaft, head);
    pivot.rotation.x = 0.62; a.group.add(pivot); R.club = pivot; return pivot;
  }
  const NDOT = 14, dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), basic('#ffffff', { transparent: true, opacity: 0.95, depthWrite: false }), NDOT);
  dots.count = 0; dots.renderOrder = 3; group.add(dots);

  // ---------------------------------------------------------------- HUD
  const bar = scoreBar(ctx, { unit: 'strokes' });
  const pill = h('div', 'gp-pill'), banner = h('div', 'gp-banner'), card = h('div', 'gp-card'), meter = h('div', 'gp-meter', '<i></i><b>POWER</b>');
  ctx.ui.append(pill, banner, card, meter);
  const meterFill = meter.querySelector('i');
  const showBanner = (html, cls = '', ms = 1700) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  const parAll = holes.reduce((a, H) => a + H.par, 0);
  function drawCard(g, final = false) {
    const cards = g.cards || null, tot = pid => cards?.[pid]?.length ? cards[pid].reduce((a, b) => a + b, 0) : (g.sc[pid] ?? 0);
    card.innerHTML = `<b class="gp-title">${final ? 'Final card' : 'Scorecard'}</b><table><tr><th></th>${holes.map((H, i) => `<th>${i + 1}<small>par ${H.par}</small></th>`).join('')}<th>Total</th></tr>${players.map(p => `<tr${p.pid === me ? ' class="me"' : ''}><td><i class="gp-dot" data-shape="${p.shape}" style="--seat:${p.color}"></i>${esc(p.name)}</td>${holes.map((H, i) => { const v = cards?.[p.pid]?.[i]; return `<td class="${v == null ? '' : v < H.par ? 'under' : v > H.par ? 'over' : 'par'}">${v ?? '–'}</td>`; }).join('')}<td><b>${tot(p.pid)}</b></td></tr>`).join('')}</table>${players.length === 1 && final ? `<p class="gp-medal">${medal(tot(players[0].pid))}</p>` : ''}`;
    card.classList.add('show');
  }
  const medal = s => s <= parAll ? '🥇 Gold — par or better!' : s <= parAll + 3 ? '🥈 Silver' : s <= parAll + 6 ? '🥉 Bronze' : 'Keep practising!';
  const cards = Object.fromEntries(players.map(p => [p.pid, []]));

  // ---------------------------------------------------------------- local state
  let last = null, tLocal = 0, held = 0, lastIn = 0, cam = null;
  const tall = () => innerHeight > innerWidth * 1.15;
  function ballYaw(pid) { const a = ctx.actor(pid); return a ? a.body.group.rotation.y : 0; }
  /** The live hole's rails as [x0, x1, z0, z1]. */
  function holeBounds() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const w of course.walls || []) { x0 = Math.min(x0, w.ax, w.bx); x1 = Math.max(x1, w.ax, w.bx); z0 = Math.min(z0, w.az, w.bz); z1 = Math.max(z1, w.az, w.bz); }
    return x0 < x1 ? [x0, x1, z0, z1] : [-6, 6, -4, 4];
  }

  const view = {
    halloween: { spots: [[-10.4, 0, 5.6], [-3.5, 0, 6.4], [3.5, 0, 6.4], [10.4, 0, 5.6], [-10.6, 0, -5.4], [10.6, 0, -5.4]], ghosts: [[-11.5, 1.4, -6.5], [11.5, 1.6, -6.8], [0, 2.4, -8.2]] },
    input(inp) { if (inp.b & 1) { held += 0.05; lastIn = performance.now(); } },
    state(g) {
      if (g.h !== holeIdx && (g.ph === 'play' || holeIdx < 0)) { buildHole(g.h); for (const R of B.values()) R.snap = true; }
      if (g.ph === 'play') card.classList.remove('show');
      last = g; tLocal = g.t;
      for (const row of g.b) {
        const R = B.get(row[0]); if (!R) continue;
        const [, x, z, st, strokes, ch] = row;
        if (R.snap || Math.hypot(x - R.tx, z - R.tz) > 2.4) { R.x = x; R.z = z; R.snap = false; }
        R.tx = x; R.tz = z; R.ch = ch / 100;
        if (st !== R.st) { if (st === ST.in) R.sink = 0.001; if (st === ST.aim) R.sink = 0; R.st = st; }
        R.strokes = strokes;
      }
      bar.set(g.sc, g.left);
      const best = Math.min(...Object.values(g.sc)); for (const p of players) bar.mark(p.pid, 'lead', g.sc[p.pid] === best && Object.values(g.sc).some(s => s !== best));
      const H = holes[g.h];
      pill.innerHTML = g.ph === 'end' ? '<b>Finished!</b>' : `<b>Hole ${g.h + 1}/${holes.length}</b> <span>${esc(H.name)}</span> <em>Par ${H.par}</em> <span class="gp-hl${g.hl <= 8 && g.ph === 'play' ? ' hurry' : ''}">${g.ph === 'play' ? g.hl + 's' : '…'}</span>`;
      onState?.(g);
    },
    event(ev) {
      const R = B.get(ev.pid);
      if (ev.e === 'hole') { showBanner(`Hole ${ev.h + 1}<small>${esc(ev.name)} · Par ${ev.par}</small>`, '', 2200); ctx.sfx('pick'); }
      else if (ev.e === 'putt') { if (R) { R.swing = 1; } ctx.actor(ev.pid)?.play('attack', 420); if (ev.pid === ctx.me) held = 0; ctx.sfx('tap'); }
      else if (ev.e === 'in') {
        const name = scoreName(ev.strokes, ev.par), p = players.find(q => q.pid === ev.pid);
        if (cards[ev.pid]) cards[ev.pid].push(ev.strokes);
        floatText(stage, cup?.x ?? 0, 1.4, cup?.z ?? 0, `${p?.name || ''}: ${name}`, ev.strokes <= ev.par ? 'good' : '');
        ctx.actor(ev.pid)?.play('cheer', 1400); ctx.sfx(ev.pid === ctx.me ? 'win' : 'good');
        if (ev.pid === ctx.me) showBanner(name, ev.strokes <= ev.par ? 'good' : '', 1500);
      }
      else if (ev.e === 'ball' || ev.e === 'post') { if (ev.pid === ctx.me || ev.e === 'ball') ctx.sfx('hit'); }
      else if (ev.e === 'lip') { if (ev.pid === ctx.me) { ctx.sfx('bad'); floatText(stage, ev.x, 0.9, ev.z, 'Lipped out!', 'bad'); } }
      else if (ev.e === 'pickup' || ev.e === 'timeout') { if (ev.pid === ctx.me) { ctx.sfx('bad'); showBanner('Picked up', 'bad', 1200); } }
      else if (ev.e === 'holeEnd') { for (const [pid, v] of Object.entries(ev.cards)) { const c = cards[pid]; if (c && c.length <= ev.h) c.push(v); } drawCard({ sc: last?.sc || {}, cards }, ev.h + 1 >= holes.length); }
      else if (ev.e === 'end') { drawCard({ sc: last?.sc || {}, cards }, true); ctx.sfx('win'); }
      onEvent?.(ev);
    },
    pose(pid) {
      const R = B.get(pid);
      if (R?.st === ST.aim && last?.ph === 'play' && (pid === me ? held > 0 : R.ch > 0)) return 'ready';
      return undefined;
    },
    frame(dt, t) {
      tLocal += dt;
      if (me != null && held > 0 && performance.now() - lastIn > 160) held = 0;     // let go (the putt event resets it too)
      for (const s of spinG) s.g.rotation.y = -(s.S.phase + s.S.w * Math.min(tLocal, (last?.t ?? 0) + 0.2));
      for (const [pid, R] of B) {
        const k = 1 - Math.exp(-dt * 16); R.x += (R.tx - R.x) * k; R.z += (R.tz - R.z) * k;
        const y = course ? heightAt(course, R.x, R.z) : 0, hidden = R.st === ST.out || holeIdx < 0;
        if (R.sink > 0) R.sink = Math.min(1, R.sink + dt * 3);
        R.ball.visible = !hidden && R.sink < 1; R.ring.visible = !hidden && R.st !== ST.in;
        R.ball.position.set(R.x, y + DRAW_R - R.sink * DRAW_R * 2.2, R.z); R.ring.position.set(R.x, y + 0.02, R.z);
        R.ball.rotation.x += Math.hypot(R.tx - R.x, R.tz - R.z) * dt * 20;
        // the character: behind its ball facing its aim (yours from your own stick, at once)
        const a = ctx.actor(pid);
        if (a && R.st === ST.aim && !hidden && last?.ph === 'play') { const yaw = ballYaw(pid); a.group.position.set(R.x - Math.sin(yaw) * STANCE, y, R.z - Math.cos(yaw) * STANCE); }
        const club = clubOf(pid);
        if (club) {
          const ch = pid === me ? charge(held, L.period) : R.ch;
          R.swing = Math.max(0, R.swing - dt * 3.2);
          club.rotation.x = 0.62 - (R.swing > 0 ? -0.9 * Math.sin(R.swing * Math.PI) : ch * 1.1);
          club.visible = R.st !== ST.out;
        }
      }
      // your aim line + power meter
      const mine = me != null ? B.get(me) : null;
      if (mine && mine.st === ST.aim && last?.ph === 'play' && course) {
        const yaw0 = ballYaw(me), aim = assistYaw({ ...course, cup: undefined }, mine.x, mine.z, yaw0, [cup], L.help);
        const ch = charge(held, L.period), len = L.line * (0.45 + 0.55 * ch), n = Math.min(NDOT, Math.round(len / 0.25));
        for (let i = 0; i < n; i++) { const d = 0.3 + i * (len - 0.3) / Math.max(1, n - 1), x = mine.x + Math.sin(aim) * d, z = mine.z + Math.cos(aim) * d; m4.compose(v.set(x, heightAt(course, x, z) + 0.06, z), q.identity(), sc.setScalar(1 - i / (n * 1.6))); dots.setMatrixAt(i, m4); }
        dots.count = n; dots.instanceMatrix.needsUpdate = true;
        dots.material.color.set(Math.abs(aim - yaw0) > 1e-4 ? '#ffe36b' : '#ffffff');    // gold = the aim help has you on the cup's line
        const p = stage.toScreen(mine.x, 0.2, mine.z);
        meter.style.transform = `translate(${(p.x + 34).toFixed(0)}px, ${(p.y - 70).toFixed(0)}px)`; meter.classList.toggle('on', held > 0);
        meterFill.style.height = Math.round(ch * 100) + '%'; meter.classList.toggle('hot', ch > 0.8);
      } else { dots.count = 0; meter.classList.remove('on'); }
      // a phone held upright follows its own ball (and the cup); everyone else sees the whole hole.
      // Round 12 (report #30, "after game should allow me to see the whole map in haunted golf"): once your ball is in
      // (or picked up), between holes, and at the end — through the results card — the camera pulls back to the WHOLE
      // course, so the part the close-up and the dark kept from you can be seen. view.overview() says when.
      if (tall() && course && holeIdx >= 0 && view.overview()) {
        const [x0, x1, z0, z1] = holeBounds(), want = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2 + 1, hd: (z1 - z0) / 2 + 1 };
        if (!cam || !cam.all || Math.hypot(cam.cx - want.cx, cam.cz - want.cz) > 0.4) { cam = { ...want, all: true }; ctx.camera({ ...want, pitch: 66 }); }
      } else if (tall() && mine && course && holeIdx >= 0) {
        const cx = (mine.x + cup.x) / 2, cz = (mine.z + cup.z) / 2, hw = Math.max(3.6, Math.abs(mine.x - cup.x) / 2 + 1.6), hd = Math.max(3.6, Math.abs(mine.z - cup.z) / 2 + 1.6);
        const want = { cx, cz, hw, hd };
        if (!cam || cam.all || Math.hypot(cam.cx - cx, cam.cz - cz) > 0.4 || Math.abs(cam.hw - hw) > 0.4 || Math.abs(cam.hd - hd) > 0.4) { cam = want; ctx.camera({ ...want, pitch: 62 }); }
      }
      around?.frame?.(dt, t);
      onFrame?.(dt, t, tLocal);
    },
    dispose() { bar.el.remove(); clearTimeout(showBanner.t); for (const m of mats) m.dispose(); },
    /** For a game's own pieces: the live hole index, its course, the local course clock. */
    hole: () => holeIdx, course: () => course, clock: () => tLocal, holeGroup: () => holeG, flag: () => flagParts,
    /** True when the whole course should be on show: between holes, at the end, or once YOUR ball is in / picked up. */
    overview: () => !!last && (last.ph !== 'play' || (me != null && [ST.in, ST.out].includes(B.get(me)?.st))),
  };
  return view;
}
