// Playing one minigame in the browser. The server runs the rules; this file is the part every game shares:
//   * builds the players' characters and hands the game's own view (js/games/<id>/view.js) a place to draw
//   * arena games: reads the stick 20 times a second, sends it, and moves YOUR character at once with the same
//     movement code the server runs (shared/arena.js), correcting to the server's answer as updates arrive;
//     everyone else is drawn a little in the past on the server's own clock (js/client/interp.js: one tick plus the
//     line's measured jitter, ~100 ms on a good line), sliding between the two updates either side of that moment
//   * passes game state, private state and one-off events to the view
import * as THREE from 'three';
import { TICK_MS, SEATS } from '../shared/protocol.js';
import { stepBody, unpackBody, F, DT } from '../shared/arena.js';
import { GAMES, loadView } from '../games/metas.js';
import { createActor, portrait } from './avatars.js';
import { createServerClock, createTrack } from './interp.js';
import { dressArena } from './halloween.js';
import { btnText } from './buttons.js';


// Spectator view (owner 2026-10-24): a screen that only watches (a TV) may follow one player in an arena game, or see
// "All" (the game's own camera). Remembered for the next game while that player is still in it. A game opts out with
// `meta.spectate: false` (a fixed view where following adds nothing); screen (ui) games never show it.
let FOCUS = 'all';
export async function createPlay({ stage, net, controls, intro, members, me, uiRoot, sfx = () => {} }) {
  const def = GAMES[intro.game], meta = def.meta, arena = meta.kind === 'arena';
  const AR = intro.init?.arena || meta.arena;          // a game whose layout comes from the seed sends its arena in init()
  const group = new THREE.Group(); group.name = 'game-' + meta.id; stage.root.add(group);
  const ui = document.createElement('div'); ui.className = `game game-${meta.id} kind-${meta.kind}${intro.season ? ' season-' + intro.season : ''}`; uiRoot.append(ui);
  const memberOf = pid => members().find(m => m.pid === pid) || intro.players.find(p => p.pid === pid) || { pid, name: '?', seat: 0 };
  const players = intro.players.map(p => { const m = memberOf(p.pid); return { pid: p.pid, seat: p.seat, name: m.name || p.name, color: SEATS[p.seat].color, dark: SEATS[p.seat].dark, shape: SEATS[p.seat].shape, portrait: m.look ? portrait(m) : '', look: m.look || null, costume: m.costume }; });
  const playing = me != null && players.some(p => p.pid === me);
  const actors = new Map(), tags = [], tracks = new Map(), npcs = new Set(), clock = createServerClock({ tickMs: TICK_MS });
  let live = false, disposed = false, acc = 0, seq = 0, mine = null, pending = [], rx = 0, rz = 0, lastG = null;

  if (arena) {
    await Promise.all(players.map(async p => {
      const a = await createActor({ ...memberOf(p.pid), seat: p.seat });
      if (disposed) return a.dispose();
      const b = intro.b?.[p.pid] ? unpackBody(intro.b[p.pid]) : { x: 0, z: 0, y: 0, yaw: 0, flags: 0, vx: 0, vz: 0 };
      a.place(b.x, b.y, b.z, b.yaw); group.add(a.group); actors.set(p.pid, a);
      a.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      tags.push(stage.tag(a.group, { text: p.pid === me ? 'YOU' : p.name, seat: p.seat, height: a.height + 0.35, cls: p.pid === me ? 'me' : '' }));
      const tr = { buf: createTrack({ tickMs: TICK_MS }), b, yaw: b.yaw }; tr.buf.push(-1e9, b); tracks.set(p.pid, tr);
      if (p.pid === me) { mine = { ...b }; rx = b.x; rz = b.z; }
    }));
    const A = AR, hw = A.shape === 'circle' ? A.r : A.hw, hd = A.shape === 'circle' ? A.r : A.hd;
    const tallScreen = innerHeight > innerWidth * 1.15;          // a phone held upright: look down more steeply so the arena uses the height
    stage.setView({ cx: 0, cz: 0, hw: hw + 0.5, hd: hd + 0.5, pitch: (meta.pitch || 54) + (tallScreen ? 12 : 0), tall: 2.2, yaw: 0 }, { instant: true });
  }
  const spectate = arena && !playing && meta.spectate !== false && players.length > 1;
  if (!players.some(p => p.pid === FOCUS)) FOCUS = 'all';
  const following = () => spectate && FOCUS !== 'all' && actors.has(FOCUS);
  let lastCam = null, homeView = null;
  if (arena) { const A = AR, hw = A.shape === 'circle' ? A.r : A.hw, hd = A.shape === 'circle' ? A.r : A.hd; homeView = { cx: 0, cz: 0, hw: hw + 0.5, hd: hd + 0.5, pitch: (meta.pitch || 54) + (innerHeight > innerWidth * 1.15 ? 12 : 0), tall: 2.2, yaw: 0 }; }
  const ctx = {
    btn: s => btnText(s, meta.controls),          // "press A" -> Space / E on a keyboard, the button's label on a phone (buttons.js)
    THREE, stage, group, ui, init: intro.init, season: intro.season || null, meta, players, me: playing ? me : null, watching: !playing,
    player: pid => players.find(p => p.pid === pid), actor: pid => actors.get(pid) || null,
    send: (a, d) => net.send({ t: 'act', a, ...(d !== undefined ? { d } : {}) }), sfx, arena: AR,
    /** A character that is not a player (an enemy, a judge, a model on the runway): { look: { race, seed, custom? }, costume?, seat? }.
     *  Added to `group`; freed with the game. No seat = no colour ring. */
    createActor: async (m, opts) => { const a = await createActor({ pid: 'npc', seat: null, ...m }, opts); if (disposed) { a.dispose(); return null; } if (m.seat == null) a.setRing(false); a.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(a.group); npcs.add(a); const d = a.dispose; a.dispose = () => { npcs.delete(a); d(); }; return a; },
    /** Move the camera: { cx, cz, hw, hd, pitch?, yaw?, tall? } (the rectangle of ground to frame). Call it every frame to follow. */
    camera: (v, o) => { lastCam = [v, o]; if (following()) return; stage.setView({ tall: 2.2, yaw: 0, ...v, pitch: (v.pitch ?? meta.pitch ?? 54) + (innerHeight > innerWidth * 1.15 ? 12 : 0) }, o); },
    /** Where a player's character is drawn right now (yours: predicted; others: interpolated) -> { x, y, z, yaw } or null. */
    pos: pid => { const a = actors.get(pid); return a ? { x: a.group.position.x, y: a.group.position.y, z: a.group.position.z, yaw: a.body.group.rotation.y } : null; },
  };
  if (meta.css) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL(`../games/${meta.id}/style.css`, import.meta.url).href; l.dataset.game = meta.id; if (!document.querySelector(`link[data-game="${meta.id}"]`)) document.head.append(l); }
  const mod = await loadView(meta.id);
  const view = mod.createView(ctx) || {};
  if (disposed) { view.dispose?.(); }
  // a season's shared arena dressing (js/client/halloween.js); a view may steer it with `halloween: {…}` or opt out with `false`
  const dress = arena && ctx.season === 'halloween' && view.halloween !== false && !disposed ? dressArena(ctx, view.halloween || {}) : null;

  function start() { live = true; if (arena && playing) controls.set({ stick: true, ...meta.controls }); view.start?.(); }
  function snap(msg) {
    if (msg.b && msg.k != null) clock.sample(msg.k, performance.now());
    if (msg.b) for (const [k, row] of Object.entries(msg.b)) {
      const pid = +k, b = unpackBody(row), tr = tracks.get(pid); if (!tr) continue;
      if (pid === me && mine) {
        // the server's answer for the input it last used; redo the ones it has not seen yet on top of it
        pending = pending.filter(i => i.s > b.ack);
        mine = { ...b }; for (const i of pending) stepBody(mine, i, meta.move, AR);
      }
      tr.b = b; if (msg.k != null) tr.buf.push(msg.k, b);
    }
    if (msg.g) { lastG = msg.g; view.state?.(msg.g); }
  }
  function frame(dt) {
    if (arena) {
      if (live && playing && mine) {
        acc += dt * 1000;
        let n = 0;
        while (acc >= TICK_MS && n++ < 4) { acc -= TICK_MS; const inp = { s: ++seq, ...controls.read() }; net.send({ t: 'in', ...inp }); pending.push(inp); if (pending.length > 40) pending.shift(); stepBody(mine, inp, meta.move, AR); if (inp.b) view.input?.(inp); }
        if (acc > TICK_MS * 4) acc = 0;
      }
      const now = performance.now(), rt = clock.renderTick(now, dt * 1000);
      for (const [pid, a] of actors) {
        const tr = tracks.get(pid); let x, z, y, yaw, flags, speed;
        if (pid === me && mine && live) {
          const k = 1 - Math.exp(-dt * 22); rx += (mine.x - rx) * k; rz += (mine.z - rz) * k;
          if (Math.hypot(mine.x - rx, mine.z - rz) > 3) { rx = mine.x; rz = mine.z; }       // moved by the game (a respawn): do not glide there
          x = rx; z = rz; y = tr.b.y; yaw = mine.yaw; flags = tr.b.flags; speed = Math.hypot(mine.vx, mine.vz);
        } else {
          const q = tr.buf.at(rt) || tr.b; tr.cur = q;
          x = q.x; z = q.z; y = q.y; yaw = q.yaw; flags = q.flags; speed = Math.hypot(q.vx, q.vz);
        }
        let d = yaw - tr.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); tr.yaw += d * Math.min(1, dt * 14);
        a.place(x, y, z, tr.yaw);
        a.group.visible = !(flags & F.OUT) || y > -6;
        a.setSpeed(flags & (F.STUN | F.FROZEN | F.OUT) ? 0 : speed);
        const pose = view.pose?.(pid, flags, pid === me ? tr.b : tr.cur || tr.b) ?? (flags & F.STUN ? 'hit' : 'idle');
        a.setPose(pose);
        a.update(dt);
      }
    }
    view.frame?.(dt, performance.now() / 1000);
    dress?.frame(dt, performance.now() / 1000);
    if (following()) { const a = actors.get(FOCUS); stage.setView({ cx: a.group.position.x, cz: a.group.position.z, hw: 5.5, hd: 5.5, pitch: (meta.pitch || 54) + (innerHeight > innerWidth * 1.15 ? 12 : 0), tall: 2.2, yaw: 0 }); }
  }
  // the spectator bar: All + one button per player
  let specOff = null;
  if (spectate) {
    const bar = document.createElement('div'); bar.className = 'spec-bar';
    const draw = () => { bar.innerHTML = `<span>Watch</span><button type="button" data-f="all" class="${FOCUS === 'all' ? 'on' : ''}">All</button>${players.map(p => `<button type="button" data-f="${p.pid}" class="${FOCUS === p.pid ? 'on' : ''}" style="--seat:${p.color}">${p.name.replace(/[<>&"]/g, '')}</button>`).join('')}`; };
    const pick = f => {
      FOCUS = f === 'all' ? 'all' : +f; draw();
      if (FOCUS === 'all') { const [v, o] = lastCam || [homeView, null]; if (lastCam) stage.setView({ tall: 2.2, yaw: 0, ...v, pitch: (v.pitch ?? meta.pitch ?? 54) + (innerHeight > innerWidth * 1.15 ? 12 : 0) }, o); else stage.setView(homeView); }
    };
    bar.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) pick(b.dataset.f); });
    const keys = e => { if (e.key !== '[' && e.key !== ']' && e.key !== 'PageUp' && e.key !== 'PageDown') return; const list = ['all', ...players.map(p => p.pid)], i = list.indexOf(FOCUS); pick(String(list[(i + (e.key === ']' || e.key === 'PageDown' ? 1 : list.length - 1)) % list.length])); };
    addEventListener('keydown', keys);
    draw(); ui.append(bar);
    specOff = () => removeEventListener('keydown', keys);
  }
  function dispose() {
    disposed = true; live = false; specOff?.();
    controls.set(null);
    try { view.dispose?.(); } catch (e) { console.error(e); }
    for (const t of tags) t.remove();
    for (const a of actors.values()) a.dispose();
    for (const a of [...npcs]) a.dispose();
    try { dress?.dispose(); } catch (e) { console.error(e); }
    stage.clear(group); group.removeFromParent(); ui.remove();
  }
  return { meta, start, snap, frame, dispose, net: () => ({ jitter: Math.round(clock.jitter), behind: Math.round(clock.delay(0)), pending: pending.length }), actor: pid => actors.get(pid) || null, event: ev => view.event?.(ev), priv: d => view.priv?.(d), get state() { return lastG; }, players, DT };
}
