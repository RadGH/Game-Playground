// Playing one minigame in the browser. The server runs the rules; this file is the part every game shares:
//   * builds the players' characters and hands the game's own view (js/games/<id>/view.js) a place to draw
//   * arena games: reads the stick 20 times a second, sends it, and moves YOUR character at once with the same
//     movement code the server runs (shared/arena.js), correcting to the server's answer as updates arrive;
//     everyone else is drawn a tenth of a second in the past, sliding between the last two updates
//   * passes game state, private state and one-off events to the view
import * as THREE from 'three';
import { TICK_MS, SEATS } from '../shared/protocol.js';
import { stepBody, unpackBody, F, DT } from '../shared/arena.js';
import { GAMES, loadView } from '../games/index.js';
import { createActor, portrait } from './avatars.js';

const INTERP_MS = 100;

export async function createPlay({ stage, net, controls, intro, members, me, uiRoot, sfx = () => {} }) {
  const def = GAMES[intro.game], meta = def.meta, arena = meta.kind === 'arena';
  const group = new THREE.Group(); group.name = 'game-' + meta.id; stage.root.add(group);
  const ui = document.createElement('div'); ui.className = `game game-${meta.id} kind-${meta.kind}`; uiRoot.append(ui);
  const memberOf = pid => members().find(m => m.pid === pid) || intro.players.find(p => p.pid === pid) || { pid, name: '?', seat: 0 };
  const players = intro.players.map(p => { const m = memberOf(p.pid); return { pid: p.pid, seat: p.seat, name: m.name || p.name, color: SEATS[p.seat].color, dark: SEATS[p.seat].dark, shape: SEATS[p.seat].shape, portrait: m.look ? portrait(m) : '' }; });
  const playing = me != null && players.some(p => p.pid === me);
  const actors = new Map(), tags = [], tracks = new Map();
  let live = false, disposed = false, acc = 0, seq = 0, mine = null, pending = [], rx = 0, rz = 0, lastG = null;

  if (arena) {
    await Promise.all(players.map(async p => {
      const a = await createActor({ ...memberOf(p.pid), seat: p.seat });
      if (disposed) return a.dispose();
      const b = intro.b?.[p.pid] ? unpackBody(intro.b[p.pid]) : { x: 0, z: 0, y: 0, yaw: 0, flags: 0, vx: 0, vz: 0 };
      a.place(b.x, b.y, b.z, b.yaw); group.add(a.group); actors.set(p.pid, a);
      a.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      tags.push(stage.tag(a.group, { text: p.pid === me ? 'YOU' : p.name, seat: p.seat, height: a.height + 0.35, cls: p.pid === me ? 'me' : '' }));
      tracks.set(p.pid, { a: b, b, at: performance.now(), yaw: b.yaw });
      if (p.pid === me) { mine = { ...b }; rx = b.x; rz = b.z; }
    }));
    const A = meta.arena, hw = A.shape === 'circle' ? A.r : A.hw, hd = A.shape === 'circle' ? A.r : A.hd;
    const tallScreen = innerHeight > innerWidth * 1.15;          // a phone held upright: look down more steeply so the arena uses the height
    stage.setView({ cx: 0, cz: 0, hw: hw + 0.5, hd: hd + 0.5, pitch: (meta.pitch || 54) + (tallScreen ? 12 : 0), tall: 2.2, yaw: 0 }, { instant: true });
  }
  const ctx = {
    THREE, stage, group, ui, init: intro.init, meta, players, me: playing ? me : null, watching: !playing,
    player: pid => players.find(p => p.pid === pid), actor: pid => actors.get(pid) || null,
    send: (a, d) => net.send({ t: 'act', a, ...(d !== undefined ? { d } : {}) }), sfx,
  };
  if (meta.css) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL(`../games/${meta.id}/style.css`, import.meta.url).href; l.dataset.game = meta.id; if (!document.querySelector(`link[data-game="${meta.id}"]`)) document.head.append(l); }
  const mod = await loadView(meta.id);
  const view = mod.createView(ctx) || {};
  if (disposed) { view.dispose?.(); }

  function start() { live = true; if (arena && playing) controls.set({ stick: true, ...meta.controls }); view.start?.(); }
  function snap(msg) {
    if (msg.b) for (const [k, row] of Object.entries(msg.b)) {
      const pid = +k, b = unpackBody(row), tr = tracks.get(pid); if (!tr) continue;
      if (pid === me && mine) {
        // the server's answer for the input it last used; redo the ones it has not seen yet on top of it
        pending = pending.filter(i => i.s > b.ack);
        mine = { ...b }; for (const i of pending) stepBody(mine, i, meta.move, meta.arena);
      }
      tr.a = tr.cur || tr.b; tr.b = b; tr.at = performance.now();
    }
    if (msg.g) { lastG = msg.g; view.state?.(msg.g); }
  }
  function frame(dt) {
    if (arena) {
      if (live && playing && mine) {
        acc += dt * 1000;
        let n = 0;
        while (acc >= TICK_MS && n++ < 4) { acc -= TICK_MS; const inp = { s: ++seq, ...controls.read() }; net.send({ t: 'in', ...inp }); pending.push(inp); if (pending.length > 40) pending.shift(); stepBody(mine, inp, meta.move, meta.arena); }
        if (acc > TICK_MS * 4) acc = 0;
      }
      const now = performance.now();
      for (const [pid, a] of actors) {
        const tr = tracks.get(pid); let x, z, y, yaw, flags, speed;
        if (pid === me && mine && live) {
          const k = 1 - Math.exp(-dt * 22); rx += (mine.x - rx) * k; rz += (mine.z - rz) * k;
          if (Math.hypot(mine.x - rx, mine.z - rz) > 3) { rx = mine.x; rz = mine.z; }       // moved by the game (a respawn): do not glide there
          x = rx; z = rz; y = tr.b.y; yaw = mine.yaw; flags = tr.b.flags; speed = Math.hypot(mine.vx, mine.vz);
        } else {
          const t = Math.min(1.5, Math.max(0, (now - tr.at - INTERP_MS + TICK_MS) / TICK_MS)), p = tr.a, q = tr.b;
          const jump = Math.hypot(q.x - p.x, q.z - p.z) > 3;
          x = jump ? q.x : p.x + (q.x - p.x) * t; z = jump ? q.z : p.z + (q.z - p.z) * t; y = p.y + (q.y - p.y) * Math.min(1, t);
          yaw = q.yaw; flags = q.flags; speed = Math.hypot(q.vx, q.vz);
          tr.cur = { ...q, x, z, y };
        }
        let d = yaw - tr.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); tr.yaw += d * Math.min(1, dt * 14);
        a.place(x, y, z, tr.yaw);
        a.group.visible = !(flags & F.OUT) || y > -6;
        a.setSpeed(flags & (F.STUN | F.FROZEN | F.OUT) ? 0 : speed);
        const pose = view.pose?.(pid, flags, tr.b) ?? (flags & F.STUN ? 'hit' : 'idle');
        a.setPose(pose);
        a.update(dt);
      }
    }
    view.frame?.(dt, performance.now() / 1000);
  }
  function dispose() {
    disposed = true; live = false;
    controls.set(null);
    try { view.dispose?.(); } catch (e) { console.error(e); }
    for (const t of tags) t.remove();
    for (const a of actors.values()) a.dispose();
    stage.clear(group); group.removeFromParent(); ui.remove();
  }
  return { meta, start, snap, frame, dispose, event: ev => view.event?.(ev), priv: d => view.priv?.(d), get state() { return lastG; }, players, DT };
}
