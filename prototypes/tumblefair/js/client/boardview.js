// The board, drawn: the fairground picture as the ground, a round pad per space (coloured AND labelled by what it
// does), cream paths between them, and the players' characters hopping from pad to pad. The server sends what
// happened (`bd` events); this file only animates it, in order, never deciding anything.
// Round 12 (2026-10-24): the camera fills a tall phone (a portrait follow view instead of a landscape one with a band of
// nothing under it), frames BOTH players in a two-player event, several pieces can move at once (the tomato toss, the
// parade), the cannon flies you through the air, a Whoopee Cushion sits on its pad, and results pop up over the space
// ("+3", "-4") instead of in a box over the middle of the board.
import * as THREE from 'three';
import { createActor } from './avatars.js';
import { canvasTexture, loadTexture } from './stage.js';

export const SPACE_LOOK = {
  start: { color: '#3ecf5a', label: 'GO' }, ticket: { color: '#ffd23f', label: '+3' }, join: { color: '#ffd23f', label: '+3' },
  pit: { color: '#8a5a3a', label: '-3' }, chance: { color: '#a45cff', label: '?' }, booth: { color: '#ff5f8f', label: '★' },
  mirror: { color: '#39d0e0', label: '⇄' }, jackpot: { color: '#ff9f1c', label: '+8' }, fork: { color: '#ffffff', label: '⑂' },
  duck: { color: '#7fd8ff', label: '', draw: 'duck' }, duel: { color: '#ff6a3d', label: '', draw: 'die' }, bumper: { color: '#8cf06a', label: '»' }, ghost: { color: '#c9b8ff', label: '', draw: 'ghost' },
  // round 12
  striker: { color: '#ff3d5a', label: '', draw: 'striker' }, shell: { color: '#f2c38b', label: '', draw: 'cups' }, pact: { color: '#b6f0a0', label: '', draw: 'pact' },
  crowd: { color: '#ffb0a0', label: '', draw: 'tomato' }, fortune: { color: '#6b4bd6', label: '', draw: 'card' }, cannon: { color: '#5a6a78', label: '', draw: 'cannon' },
};
const OFFS = [[-0.5, -0.38], [0.5, -0.38], [-0.5, 0.48], [0.5, 0.48]];
const INK = '#12222a';

/** The pictures on the round-12 pads, drawn (not emoji: phones and the TV lack the same emoji fonts). */
function drawPad(g, L) {
  g.lineWidth = 5; g.strokeStyle = INK;
  const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke(); };
  if (L.draw === 'duck') {
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.ellipse(58, 76, 34, 20, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(80, 48, 17, 0, 7); g.fill(); g.stroke();
    poly([[95, 46], [112, 52], [95, 58]], '#ff8a1a');
    g.fillStyle = INK; g.beginPath(); g.arc(84, 44, 3.5, 0, 7); g.fill();
  } else if (L.draw === 'ghost') {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(36, 100); g.lineTo(36, 58); g.arc(64, 58, 28, Math.PI, 0); g.lineTo(92, 100); for (let k = 0; k < 4; k++) g.quadraticCurveTo(85 - k * 14, 88, 78 - k * 14, 100); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; for (const x of [54, 74]) { g.beginPath(); g.ellipse(x, 60, 5, 7, 0, 0, 7); g.fill(); } g.beginPath(); g.ellipse(64, 78, 6, 5, 0, 0, 7); g.fill();
  } else if (L.draw === 'die') {
    g.lineWidth = 6; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(30, 30, 68, 68, 12); g.fill(); g.stroke();
    g.fillStyle = INK; for (const [x, y] of [[46, 46], [82, 46], [64, 64], [46, 82], [82, 82]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  } else if (L.draw === 'striker') {                     // the tower, the bell on top, the puck halfway up
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(56, 30, 16, 76, 6); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(64, 26, 13, Math.PI, 0); g.lineTo(77, 30); g.lineTo(51, 30); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff3d5a'; g.beginPath(); g.roundRect(50, 66, 28, 12, 4); g.fill(); g.stroke();
    g.fillStyle = INK; g.fillRect(40, 104, 48, 8);
  } else if (L.draw === 'cups') {
    for (const x of [36, 64, 92]) poly([[x - 13, 92], [x - 8, 52], [x + 8, 52], [x + 13, 92]], x === 64 ? '#ff6a3d' : '#ffffff');
    g.fillStyle = '#3ecf5a'; g.beginPath(); g.arc(64, 102, 6, 0, 7); g.fill(); g.stroke();
  } else if (L.draw === 'pact') {                       // a coin split in two: share (green) / steal (red)
    g.fillStyle = '#3ecf5a'; g.beginPath(); g.arc(64, 64, 34, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff3d5a'; g.beginPath(); g.arc(64, 64, 34, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '900 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 66);
  } else if (L.draw === 'tomato') {
    g.fillStyle = '#e8322a'; g.beginPath(); g.ellipse(64, 70, 32, 28, 0, 0, 7); g.fill(); g.stroke();
    poly([[64, 44], [50, 36], [60, 46], [54, 52], [66, 48], [78, 40], [70, 50]], '#3ecf5a');
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(52, 62, 7, 10, -0.5, 0, 7); g.fill();
  } else if (L.draw === 'card') {
    g.save(); g.translate(64, 64); g.rotate(-0.18); g.fillStyle = '#fff3d6'; g.beginPath(); g.roundRect(-24, -34, 48, 68, 8); g.fill(); g.stroke();
    g.fillStyle = '#6b4bd6'; g.font = '900 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 3); g.restore();
  } else if (L.draw === 'cannon') {
    g.fillStyle = '#2a2f36'; g.save(); g.translate(64, 70); g.rotate(-0.6); g.beginPath(); g.roundRect(-14, -40, 28, 56, 10); g.fill(); g.stroke(); g.restore();
    g.fillStyle = '#8a5a3a'; g.beginPath(); g.arc(64, 86, 18, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(88, 34, 8, 0, 7); g.fill(); g.stroke();
  }
}

export async function createBoardView({ stage, def, members, me, assetBase, season = null, onPlay = () => {} }) {
  const group = new THREE.Group(); group.name = 'board'; stage.root.add(group);
  const byId = new Map(def.spaces.map(s => [s.id, s]));
  // a holiday repaint of the same board (same paths, round 6) when there is one, else the usual picture
  const tex = (season && def.seasonBackdrops?.[season] && await loadTexture(`${assetBase}${def.seasonBackdrops[season]}.webp`).catch(() => null)) || await loadTexture(`${assetBase}${def.backdrop}.webp`);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(def.size, def.size).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, color: tex ? '#ffffff' : '#3f8f5a', roughness: 1 }));
  ground.receiveShadow = true; group.add(ground);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#12323a' })); skirt.position.y = -0.05; group.add(skirt);
  // paths
  const pathMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 1 });
  for (const s of def.spaces) for (const n of s.next) {
    const t = byId.get(n), dx = t.x - s.x, dz = t.z - s.z, len = Math.hypot(dx, dz);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, len), pathMat); seg.position.set((s.x + t.x) / 2, 0.05, (s.z + t.z) / 2); seg.rotation.y = Math.atan2(dx, dz); seg.receiveShadow = true; group.add(seg);
  }
  // a cannon's flight: a dashed arc to its landing pad (round 12)
  const arcMat = new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.8 });
  for (const s of def.spaces) if (s.type === 'cannon' && s.to && byId.has(s.to)) {
    const t = byId.get(s.to), pts = [];
    for (let k = 0; k <= 32; k++) { const u = k / 32; pts.push(new THREE.Vector3(s.x + (t.x - s.x) * u, 0.4 + Math.sin(u * Math.PI) * 5, s.z + (t.z - s.z) * u)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat); line.computeLineDistances(); group.add(line);
  }
  // pads
  const padGeo = new THREE.CylinderGeometry(1.05, 1.15, 0.3, 28), topGeo = new THREE.CircleGeometry(0.98, 28).rotateX(-Math.PI / 2);
  const topTex = new Map(), tops = new Map();
  for (const s of def.spaces) {
    const L = SPACE_LOOK[s.type] || SPACE_LOOK.ticket;
    const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ color: '#12222a', roughness: 0.7 })); pad.position.set(s.x, 0.15, s.z); pad.castShadow = pad.receiveShadow = true; group.add(pad);
    if (!topTex.has(s.type)) topTex.set(s.type, canvasTexture(128, 128, (g, w) => {
      g.fillStyle = L.color; g.fillRect(0, 0, w, w);
      g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.42, 0, 7); g.fill();
      g.fillStyle = INK; g.font = `900 ${L.label.length > 1 ? 62 : 78}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.label, w / 2, w / 2 + 4);
      drawPad(g, L);
    }));
    const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: topTex.get(s.type), roughness: 0.6 })); top.material.userData.shared = false; top.position.set(s.x, 0.31, s.z); top.receiveShadow = true; group.add(top); tops.set(s.id, top);
  }
  // a ring that shows where the event is (the space being played)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23f' })); ring.visible = false; group.add(ring);
  // Whoopee Cushions waiting on their pads
  const cushions = new Map();
  const cushionGeo = new THREE.SphereGeometry(0.42, 16, 10).scale(1, 0.38, 1), cushionMat = new THREE.MeshStandardMaterial({ color: '#ff5fa8', roughness: 0.5 });
  function setTraps(traps = {}) {
    for (const [id, m] of cushions) if (!(id in traps)) { group.remove(m); cushions.delete(id); }
    for (const id of Object.keys(traps)) if (!cushions.has(id) && byId.has(id)) { const s = byId.get(id), m = new THREE.Mesh(cushionGeo, cushionMat); m.position.set(s.x + 0.55, 0.42, s.z - 0.5); m.castShadow = true; group.add(m); cushions.set(id, m); }
  }
  // tokens
  const actors = new Map(), tags = new Map(), at = new Map(), queue = [];
  let cur = null, focus = null, disposed = false, pair = null;
  const spot = (pid, id) => { const s = byId.get(id), m = members().find(x => x.pid === pid), o = OFFS[m?.seat ?? 0]; return { x: s.x + o[0], z: s.z + o[1] }; };
  async function ensure(pid, id) {
    if (actors.has(pid) || disposed) return;
    const m = members().find(x => x.pid === pid); if (!m) return;
    actors.set(pid, null);
    const a = await createActor(m, { scale: 1.15 });
    if (disposed) return a.dispose();
    a.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const p = spot(pid, at.get(pid) || id); a.place(p.x, 0.31, p.z, 0); group.add(a.group); actors.set(pid, a);
    tags.set(pid, stage.tag(a.group, { text: pid === me ? 'YOU' : m.name, seat: m.seat, height: a.height + 0.3, cls: pid === me ? 'me' : '' }));
  }
  /** Put everyone where the server says (a fresh page, or after a swap). */
  function sync(view) {
    for (const pid of view.order) { if (!queue.length && !cur) at.set(pid, view.pos[pid]); else if (!at.has(pid)) at.set(pid, view.pos[pid]); ensure(pid, view.pos[pid]); const a = actors.get(pid); if (a && !queue.length && !cur) { const p = spot(pid, view.pos[pid]); a.place(p.x, 0.31, p.z); } }
    for (const [pid, a] of actors) if (!view.order.includes(pid) && a) { a.dispose(); actors.delete(pid); tags.get(pid)?.remove(); tags.delete(pid); }
    if (view.traps) setTraps(view.traps);
    if (view.pid != null && !cur && !queue.length) look(view.pid);
  }
  const tall = () => innerHeight > innerWidth * 1.1;
  /** Frame the ground round one piece (or two, or the whole board). A tall phone gets a tall view so the board fills
   *  the screen; the camera never turns (a turned camera put every pad label sideways — owner, iPhone 17 Pro). */
  function look(pid, wide = false) {
    focus = pid;
    // wide on a tall phone = everyone's pieces, not the whole (landscape-shaped) board: the board then fills the screen
    const everyone = [...at.keys()].filter(p => actors.has(p));
    const pts = (wide ? (tall() ? everyone : []) : pair || [pid]).map(p => byId.get(at.get(p))).filter(Boolean);
    if (!pts.length) {
      if (tall()) stage.setView({ cx: 0, cz: 0.5, hw: 11, hd: 13.5, pitch: 60, tall: 2, yaw: 0 });
      else stage.setView({ cx: 0, cz: 0, hw: def.size * 0.44, hd: def.size * 0.34, pitch: 58, tall: 2, yaw: 0 });
      return;
    }
    let xs = pts.map(s => s.x), zs = pts.map(s => s.z);
    let sx = (Math.max(...xs) - Math.min(...xs)) / 2 + 3, sz = (Math.max(...zs) - Math.min(...zs)) / 2 + 3;
    let cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    // a tall phone can't hold two pieces at opposite ends of a wide board without a band of nothing above and below:
    // then follow the lander (two players) or the middle of the crowd, at a size that fills the screen
    if (tall() && (sx > 9.5 || sz > 14)) {
      if (!wide && pts.length > 1) { const s0 = byId.get(at.get(pair ? pair[0] : pid)); if (s0) { cx = s0.x; cz = s0.z; } }
      else { cx = xs.reduce((a, b) => a + b, 0) / xs.length; cz = zs.reduce((a, b) => a + b, 0) / zs.length; }
      sx = 7.5; sz = 10;
    }
    const [hw, hd] = tall() ? [Math.max(6, sx), Math.max(8.5, sz)] : [Math.max(9.5, sx, sz * 1.36), Math.max(7, sz, sx * 0.74)];
    // keep a tall phone's view on the board: near the far edge the picture would otherwise show the empty dark past it
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), lim = def.size / 2;
    const fx2 = tall() ? clamp(cx * 0.85, -(lim - hw - 1), lim - hw - 1) : cx * 0.8, fz = tall() ? clamp(cz * 0.85, -(lim - hd * 1.6), lim - hd * 1.5) : cz * 0.8;
    stage.setView({ cx: fx2, cz: fz, hw, hd, pitch: 54, tall: 3, yaw: 0 });
  }
  /** A number or word floating up from a space (or over a player). */
  function pop(text, { id = null, pid = null, cls = '' } = {}) {
    if (!text) return;
    const o = new THREE.Object3D(); let y = 1.2;
    if (pid != null && actors.get(pid)) { const a = actors.get(pid); a.group.add(o); y = a.height + 1.1; }
    else { const s = byId.get(id); if (!s) return; o.position.set(s.x, 0, s.z); group.add(o); }
    const T = stage.tag(o, { text, height: y, cls: 'pop ' + cls });
    setTimeout(() => { T.remove(); o.removeFromParent(); }, 1600);
  }
  /** Focus the camera on the players of an event (two of them: both in the picture; everyone: the whole board). */
  function setPair(pids) { pair = pids && pids.length === 2 ? pids.slice() : null; if (pids && pids.length > 2) look(null, true); else if (focus != null || pair) look(focus ?? pids?.[0]); }
  function showRing(id) { const s = id && byId.get(id); ring.visible = !!s; if (s) ring.position.set(s.x, 0.36, s.z); }
  function event(ev) {
    if (ev.ev === 'turn') { pair = null; showRing(null); queue.push({ kind: 'look', pid: ev.pid }); }
    if (ev.ev === 'step') queue.push({ kind: 'walk', movers: [{ pid: ev.pid, path: ev.path }], ms: ev.ms });
    if (ev.ev === 'item') { if (ev.path?.length) queue.push({ kind: 'walk', movers: [{ pid: ev.pid, path: ev.path }], ms: ev.path.length * 200 }); queue.push({ kind: 'fx', ev }); }
    if (ev.ev === 'event') queue.push({ kind: 'event', ev });
    if (ev.ev === 'fx') {
      if (ev.fly) queue.push({ kind: 'fly', pid: ev.pid, from: ev.fly[0], to: ev.fly[1], ms: 1100 });
      const movers = [];
      if (ev.path?.length) movers.push({ pid: ev.pid, path: ev.path });
      for (const [k, path] of Object.entries(ev.moved || {})) if (path?.length) movers.push({ pid: +k, path });
      if (movers.length) queue.push({ kind: 'walk', movers, ms: Math.max(...movers.map(m => m.path.length)) * 230, hold: 600 });
      queue.push({ kind: 'fx', ev });
    }
    if (ev.ev === 'roundEnd') queue.push({ kind: 'wide' });
    if (ev.ev === 'bulletin') {
      queue.push({ kind: 'wide' });
      const movers = Object.entries(ev.moved || {}).filter(([, p]) => p?.length).map(([k, path]) => ({ pid: +k, path }));
      if (movers.length) queue.push({ kind: 'walk', movers, ms: Math.max(...movers.map(m => m.path.length)) * 260 });
      queue.push({ kind: 'fx', ev: { ...ev, pid: null } });
    }
  }
  function frame(dt) {
    for (const a of actors.values()) a?.update(dt);
    ring.rotation.y += dt * 1.5; ring.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.05);
    // a long queue (a phone that slept, a slow one) catches up by playing faster
    const speed = queue.length > 4 ? 3 : queue.length > 2 ? 1.6 : 1;
    if (!cur && queue.length) {
      cur = queue.shift(); cur.t = 0;
      if (cur.kind === 'look') { look(cur.pid); cur = null; }
      else if (cur.kind === 'wide') { pair = null; look(null, true); cur = null; }
      else if (cur.kind === 'event') {
        const ev = cur.ev; showRing(ev.at);
        if (ev.stage !== 'shuffle' && ev.stage !== 'guess') setPair(ev.kind === 'crowd' ? ev.pids : ev.with != null ? [ev.pid, ev.with] : null);
        cur = null;
      }
      else if (cur.kind === 'fx') {
        const ev = cur.ev, a = actors.get(ev.pid);
        if (ev.pos) for (const [k, id] of Object.entries(ev.pos)) { const pid = +k; if (at.get(pid) !== id) { at.set(pid, id); const b = actors.get(pid), p = spot(pid, id); b?.place(p.x, 0.31, p.z); } }
        if (ev.traps) setTraps(ev.traps);
        reacts(ev, a);
        try { onPlay(ev); } catch (e) { console.error(e); }
        if (ev.pid === focus || pair) look(focus);
        cur = null;
      } else if (cur.kind === 'walk') { for (const m of cur.movers) { m.from = spot(m.pid, at.get(m.pid)); m.i = 0; m.t = 0; m.per = cur.ms / Math.max(...cur.movers.map(x => x.path.length)) / 1000; } if (cur.movers.length === 1) look(cur.movers[0].pid); }
      else if (cur.kind === 'fly') { cur.a = spot(cur.pid, cur.from); cur.b = spot(cur.pid, cur.to); look(cur.pid); }
    }
    if (cur?.kind === 'walk') {
      let busy = false;
      for (const m of cur.movers) {
        if (m.i >= m.path.length) continue; busy = true;
        const a = actors.get(m.pid);
        m.t += dt * speed;
        const to = spot(m.pid, m.path[m.i]), k = Math.min(1, m.t / m.per);
        if (a) { const x = m.from.x + (to.x - m.from.x) * k, z = m.from.z + (to.z - m.from.z) * k; a.place(x, 0.31 + Math.sin(k * Math.PI) * 0.7, z, Math.atan2(to.x - m.from.x, to.z - m.from.z)); a.setPose('jump'); }
        if (k >= 1) {
          at.set(m.pid, m.path[m.i]); m.from = to; m.t = 0; m.i++;
          if (cur.movers.length === 1) look(m.pid);
          if (m.i >= m.path.length) { a?.place(to.x, 0.31, to.z, 0); a?.setPose('idle'); }
        }
      }
      if (!busy) { if (cur.movers.length > 1 && focus != null) look(focus); cur = null; }
    } else if (cur?.kind === 'fly') {
      const a = actors.get(cur.pid); cur.t += dt * speed; const k = Math.min(1, cur.t / (cur.ms / 1000));
      if (a) { a.place(cur.a.x + (cur.b.x - cur.a.x) * k, 0.31 + Math.sin(k * Math.PI) * 5, cur.a.z + (cur.b.z - cur.a.z) * k, Math.atan2(cur.b.x - cur.a.x, cur.b.z - cur.a.z)); a.setPose('jump'); }
      if (k >= 1) { at.set(cur.pid, cur.to); a?.place(cur.b.x, 0.31, cur.b.z, 0); a?.setPose('idle'); look(cur.pid); cur = null; }
    }
  }
  /** The characters react to a result, and the numbers pop up over them. */
  function reacts(ev, a) {
    const sign = n => (n > 0 ? `+${n}` : `${n}`);
    if (ev.ev === 'bulletin') { for (const b of actors.values()) b?.play('cheer', 1200); return; }
    if (ev.kind === 'duel' && ev.winner != null) {
      for (const p of [ev.pid, ev.with]) { actors.get(p)?.play(ev.winner === p ? 'cheer' : 'hit', 1400); pop(sign(ev.winner === p ? Math.abs(ev.d) : -Math.abs(ev.d)), { pid: p, cls: ev.winner === p ? 'good' : 'bad' }); }
      return;
    }
    if ((ev.kind === 'shell' || ev.kind === 'trap') && ev.with != null && ev.d) { a?.play(ev.d > 0 ? 'cheer' : 'hit', 1300); actors.get(ev.with)?.play(ev.d > 0 ? 'hit' : 'cheer', 1300); pop(sign(ev.d), { pid: ev.pid, cls: ev.d > 0 ? 'good' : 'bad' }); pop(sign(-ev.d), { pid: ev.with, cls: ev.d > 0 ? 'bad' : 'good' }); return; }
    if (ev.kind === 'crowd') { for (const p of ev.hit || []) { actors.get(p)?.play('hit', 1400); pop('SPLAT', { pid: p, cls: 'bad' }); } a?.play('cheer', 1200); return; }
    if (ev.kind === 'pact') { a?.play((ev.d ?? 0) > 0 ? 'cheer' : 'hit', 1300); actors.get(ev.with)?.play(ev.thief === ev.with || (!ev.picks?.[0] && !ev.picks?.[1]) ? 'cheer' : 'hit', 1300); return; }
    if (ev.kind === 'cannon') { pop('BOOM', { pid: ev.pid, cls: 'good' }); a?.play('cheer', 1000); return; }
    if (ev.kind === 'ribbon') { pop('+1 ribbon', { pid: ev.pid, cls: 'good' }); a?.play('cheer', 1200); return; }
    if (a) a.play((ev.d ?? 0) < 0 || ev.kind === 'pit' ? 'hit' : ev.kind === 'none' || ev.kind === 'duckpond' || ev.kind === 'item' ? 'idle' : 'cheer', 1200);
    if (ev.d) pop(sign(ev.d), { pid: ev.pid, cls: ev.d > 0 ? 'good' : 'bad' });
    else if (ev.item && ev.ev === 'fx') pop('+card', { pid: ev.pid, cls: 'good' });
  }
  function dispose() { disposed = true; for (const t of tags.values()) t.remove(); for (const a of actors.values()) a?.dispose(); stage.clear(group); group.removeFromParent(); }
  look(null, true);
  return { sync, event, frame, dispose, look, setTraps, get busy() { return !!cur || queue.length > 0; } };
}
