// The console's side of the defence (PLAN M4). Main thread only — it never changes game state: it sends `drawWall` /
// `addGate` (§3.3) and draws what the frames say.
//
//   installDefence(C) → C.defence      (main.js calls it once the desk is up; safe to call again for a new game)
//
// * The WALL switch: drag a line and the pen shows the wall the sim will build — the same planWall() the sim runs —
//   smoothed, its joins (rings where it runs on to another wall), its snaps (where it runs on to a cliff or deep water),
//   its length and its (small) price; Shift = a ruler-straight line. A TAP with WALL up on a wall puts a gate there.
// * On the glass: wall blueprints (dashed until laid), broken sections (red, rebuilt after the raid), gates, the RING
//   CLOSED sweep; every raid's PREDICTED PATH as a red arrow from its nest to its target with how long until it leaves;
//   the THREAT filter: Noise as amber contours, Glow as violet, nests with their stage, tower ranges, enemy blips.
// * Events → the radio story (data/radio.json), the teletype, and the RAID / HQ / CONVOY lamps + klaxon (M4 owns
//   those lamps; js/console/machines/alarms.js is the panel). The HQ falling ends the game: the bunker's last screen.

import { planWall } from '../world/vectors.js';
import { compileMaterials } from '../world/materials.js';
import { gridRef } from './view.js';
import { drawRing, drawLabel, drawDashed, PHOSPHOR } from '../render/sprites.js';

export async function installDefence(C) {
  C.defenceUi?.dispose?.();
  const base = new URL('../../data/', import.meta.url);
  const [radio, towers, buildings, upgrades] = await Promise.all(['radio.json', 'towers.json', 'buildings.json', 'upgrades.json'].map((f) => fetch(new URL(f, base)).then((r) => r.json())));
  C.penTools ||= {}; C.overlays ||= []; C.eventHooks ||= []; C.frameHooks ||= [];
  const off = [];
  const M = compileMaterials(C.game.link.materials);
  const wallCfg = buildings.vectors.wall;
  const towerRow = Object.fromEntries(towers.list.map((t) => [t.id, t]));
  const S = { nests: [], raids: [], towers: [], threat: null, sweeps: [], over: null, live: 0, enemies: 0, pending: null };
  const D = {
    S, radio,
    /** Anything for the THREAT filter to show? */
    /** The BUILD ghost's twin of the sim's rule: a tower may stand on a wall from Wall III. */
    mayStandOn: (def, c) => !!def?.tower && (upgrades.wall.levels[(C.econ?.hud?.levels?.wall || 1) - 1]?.towersOn) && !!M.list[c & 255]?.wallPart,
    contacts: () => S.raids.length > 0 || S.nests.length > 0 || S.live > 0,
    state: () => ({ walls: [...(C.econ?.walls?.values() || [])].map((v) => ({ id: v.id, len: Math.round(v.len), level: v.level, closed: v.closed, sections: v.sections.map((q) => ['plan', 'up', 'broken', 'gone'][q[2]]), gates: v.sections.filter((q) => q[4]).length })), nests: S.nests, raids: S.raids.map((r) => ({ ...r, path: r.path ? r.path.length : 0 })), towers: S.towers, live: S.live, enemies: S.enemies, over: S.over, threat: !!S.threat, lamps: C.game?.desk.M.alarms.states() }),
    dispose() { for (const f of off) f(); },
  };
  C.defence = D;
  C.defenceUi = D;
  const E = () => C.econ;
  const M_ = () => C.game.desk.M;
  const where = (ev) => (ev.x == null ? '' : gridRef(ev.x, ev.y));

  // ---- the frames ------------------------------------------------------------------------------------------------------
  const onFrame = (fr) => {
    if (fr.defence) {
      S.nests = fr.defence.nests; S.raids = fr.defence.raids; S.towers = fr.defence.towers;
      S.live = fr.defence.live; S.enemies = fr.defence.enemies;
      if (fr.defence.over && !S.over) S.over = fr.defence.over;
      lampsFromState();
    }
    if (fr.threat) S.threat = fr.threat;
  };
  C.frameHooks.push(onFrame);
  off.push(() => { const i = C.frameHooks.indexOf(onFrame); if (i >= 0) C.frameHooks.splice(i, 1); });

  // ---- the WALL switch ------------------------------------------------------------------------------------------------
  const wallsList = () => [...(E()?.walls?.values() || [])];
  function plan(pts, straight) {
    const link = C.game.link, r = C.game.scope.renderer;
    return planWall({ cellAt: (x, y) => r.cellAt(x, y), W: link.size[0], H: link.size[1], M, cfg: wallCfg, walls: wallsList(), straight }, pts);
  }
  C.penTools.wall = {
    stroke(pts) {
      const straight = !!C.keyDown?.('shift');
      S.pending = { pts: plan(pts, straight).pts, at: performance.now() };
      C.send({ t: 'drawWall', pts, straight, closed: false });
      C.room.play('press');
    },
  };
  C.penTools['tap:wall'] = { click([x, y]) { C.send({ t: 'addGate', x, y }); C.room.play('slap'); } };
  off.push(() => { delete C.penTools.wall; delete C.penTools['tap:wall']; });

  // ---- events → radio, teletype, lamps ------------------------------------------------------------------------------
  function radioLine(pool, ev, fill = {}) {
    const list = radio.pools[pool];
    if (!list?.length) return;
    const pick = list[Math.abs((ev.raid ?? ev.id ?? ev.tick ?? 0) | 0) % list.length];
    const text = pick.text.replace(/\{(\w+)\}/g, (_, k) => String(fill[k] ?? (k === 'where' ? where(ev) : ev[k] ?? '')));
    M_().radio.say({ who: radio.who[pick.who] || 'Signals', text });
  }
  const tele = (text, red = false, who = 'Watch') => M_().teletype.print({ who, text: text.toUpperCase(), red });
  const lamp = (id, st, at) => M_().alarms.set(id, st, at);
  const name = (type) => E()?.data.B[type]?.name || type;
  let hqQuietAt = 0, convoyQuietAt = 0;
  function lampsFromState() {
    const active = S.raids.filter((r) => !r.guards);
    if (!active.length && !S.over) lamp('raid', 'off');
    const now = performance.now();
    if (hqQuietAt && now > hqQuietAt) { lamp('hq', 'off'); hqQuietAt = 0; }
    if (convoyQuietAt && now > convoyQuietAt) { lamp('convoy', 'off'); convoyQuietAt = 0; }
  }
  const at = (ev) => (ev.x != null ? { x: ev.x, y: ev.y } : null);

  const onEvent = (ev) => {
    switch (ev.e) {
      case 'raidForming':
        if (ev.guards) break;
        radioLine('raidForming', ev, { what: (ev.what || 'base').toLowerCase() });
        tele(`RAID FORMING AT ${where(ev)} — ABOUT ${ev.n} — HEADING FOR THE ${ev.what || 'BASE'} — LEAVES IN ${fmtTime(ev.eta)}.`, true);
        lamp('raid', 'blink', at(ev));
        break;
      case 'raidSpotted': radioLine('raidSpotted', ev); lamp('raid', 'blink', at(ev)); break;
      case 'raidAtWall': radioLine('raidAtWall', ev); lamp('raid', 'blink', at(ev)); break;
      case 'wallBreached': radioLine('wallBreached', ev); lamp('raid', 'blink', at(ev)); C.room.play('crate'); break;
      case 'raidBeaten': radioLine('raidBeaten', ev); break;
      case 'raidWithdrew': radioLine('raidWithdrew', ev); break;
      case 'destroyed':
        if (ev.type === 'wall' || ev.type === 'gate') tele(ev.type === 'gate' ? `GATE SEALED AT ${where(ev)}.` : `WALL SECTION TAKEN DOWN AT ${where(ev)}.`, false, 'Works');
        else if (ev.by && ev.by !== 'demolish' && ev.by !== 'clear') { radioLine('buildingLost', ev, { what: (ev.name || name(ev.type)).toLowerCase() }); tele(`${ev.name || name(ev.type)} LOST AT ${where(ev)}${ev.by === 'raid' ? '' : ' (' + ev.by + ')'}.`, true, 'Works'); }
        break;
      case 'hqHit': radioLine('hqHit', ev); lamp('hq', 'blink', at(ev)); hqQuietAt = performance.now() + 30000; break;
      case 'damaged': if (ev.type === 'hq' && ev.frac < 0.5) { lamp('hq', 'blink', at(ev)); hqQuietAt = performance.now() + 30000; } break;
      case 'convoyHit': radioLine('convoyHit', ev); lamp('convoy', 'blink', at(ev)); convoyQuietAt = performance.now() + 20000; break;
      case 'vehicleLost': tele(`${ev.type === 'cart' ? 'MULE CART' : 'PORTERS'} LOST AT ${where(ev)} — THEIR LOAD IS ON THE GROUND. A REPLACEMENT IS ON ITS WAY.`, true, 'Signals'); lamp('convoy', 'on', at(ev)); convoyQuietAt = performance.now() + 20000; break;
      case 'nestSeen': tele(`NEST SIGHTED AT ${where(ev)} (STAGE ${roman(ev.stage)}).`, true); break;
      case 'nestGrew': if (ev.seen) radioLine('nestGrew', ev, { stage: roman(ev.stage) }); break;
      case 'nestBudded': if (ev.seen) radioLine('nestBudded', ev); break;
      case 'nestCleared': radioLine('nestCleared', ev); tele(`CORE SAMPLE LIFTED FROM THE NEST AT ${where(ev)} (STAGE ${roman(ev.stage)}).`, true, 'Survey'); break;
      case 'ringClosed': radioLine('ringClosed', ev); S.sweeps.push({ x: ev.x, y: ev.y, r: Math.sqrt(ev.cells / Math.PI), at: performance.now() }); C.room.play('bell'); break;
      case 'wallPlanned': {
        const c = Object.entries(ev.cost || {}).map(([r, n]) => `${n} ${E()?.data.R[r]?.name || r}`).join(', ');
        tele(`WALL STAKED OUT: ${Math.round(ev.len / 2)} M, ${ev.sections} SECTIONS${c ? ' (' + c + ')' : ''}${ev.joins ? ', JOINED ON' : ''}${ev.snaps?.length ? ', RUN ON TO THE ' + ev.snaps.map((k) => k === 'deep' ? 'WATER' : k.toUpperCase()).join(' AND ') : ''}${ev.gates ? `, ${ev.gates} GATE${ev.gates > 1 ? 'S' : ''} WHERE ROADS CROSS` : ''}. CREWS ON THEIR WAY.`, false, 'Works');
        S.pending = null;
        break;
      }
      case 'gateSet': tele(ev.why === 'road' ? `GATE SET WHERE THE ROAD CROSSES THE WALL AT ${where(ev)} (CLEAR IT TO SEAL IT).` : `GATE SET AT ${where(ev)}.`, false, 'Works'); break;
      case 'wallRepair': tele(`QUIET AGAIN — CREWS REBUILDING ${ev.n} WALL SECTION${ev.n > 1 ? 'S' : ''} AT ${where(ev)}.`, false, 'Works'); break;
      case 'levelUp': tele(ev.kind === 'wall' ? `WALL LEVEL ${roman(ev.level)} (${String(ev.name).toUpperCase()}): EVERY WALL ON THE PLANET IS REINFORCED.` : `${String(ev.name).toUpperCase()}: EVERY ONE OF THEM IS UPGRADED.`, true, 'Quartermaster'); break;
      case 'built': if (ev.type === 'wall') { /* main prints WALL RAISED */ } break;
      case 'refused': if (ev.cmd === 'drawWall') { S.pending = null; S.refused = { at: performance.now() }; } break;
      case 'crippled': radioLine('crippled', ev); lamp('hq', 'on', at(ev)); break;
      case 'hqPatched': lamp('hq', 'off'); tele('THE HEADQUARTERS IS PATCHED UP. FULL SPEED AGAIN.', false, 'Works'); break;
      case 'gameOver': radioLine('gameOver', ev); lamp('hq', 'on', at(ev)); lamp('raid', 'off'); S.over = ev; setTimeout(() => ending(ev), 2200); break;
      default: break;
    }
  };
  C.eventHooks.push(onEvent);
  off.push(() => { const i = C.eventHooks.indexOf(onEvent); if (i >= 0) C.eventHooks.splice(i, 1); });

  /** The last screen: the HQ fell. */
  function ending(ev) {
    if (document.querySelector('.gameover-modal') || !C.game) return;
    const m = document.createElement('div');
    m.className = 'modal lodestar-modal gameover-modal'; m.setAttribute('aria-label', 'The headquarters has fallen');
    m.innerHTML = `<div class="plate-panel gameover-panel">
      <div class="go-tape">TELETYPE — HIGH COMMAND — PRIORITY</div>
      <h2 class="go-title">THE HEADQUARTERS HAS FALLEN</h2>
      <p class="go-line">DAY ${ev.day ?? '—'} · ${ev.kills ?? 0} ENEMIES KILLED · THE LINE ENDS HERE.</p>
      <div class="go-buttons"><button type="button" class="push" data-act="title">RETURN TO TITLE</button><button type="button" class="push" data-close>LOOK AROUND</button></div></div>`;
    m.querySelector('[data-act=title]').addEventListener('click', () => { m.remove(); C.quit(); });
    m.querySelector('[data-close]').addEventListener('click', () => m.remove());
    document.body.append(m);
    C.room.play('crate');
  }

  // ---- the glass ------------------------------------------------------------------------------------------------------
  const overlay = (ctx, o) => {
    const { toS, ppc, view, pen, renderer, W, H } = o;
    const now = performance.now();
    const filter = C.state.get('filter');
    const [vx0, vy0, vx1, vy1] = view.rect();
    const onView = (x, y, m = 40) => x > vx0 - m && y > vy0 - m && x < vx1 + m && y < vy1 + m;
    const threat = filter === 'threat';
    // THREAT: Noise (amber) and Glow (violet) as soft contours, quarter-res
    if (threat && S.threat) drawFields(ctx, S.threat, toS, ppc, view, W, H);
    // walls: what is not standing yet (blueprint), broken (red), patched, and gates
    for (const v of wallsList()) {
      if (!v.pts?.length) continue;
      const pts = v.closed ? [...v.pts, v.pts[0]] : v.pts;
      for (const s of v.sections) {
        const [a, b, state, hp, gate, patch] = s;
        if (state === 1 && !patch && !(threat && hp < 0.999)) continue;
        if (state === 3) continue;
        const seg = cut(pts, a, b).map((p) => toS(p[0] + 0.5, p[1] + 0.5));
        if (state === 0) drawDashed(ctx, seg, PHOSPHOR.amber, Math.max(1.5, Math.min(4, ppc * 1.2)), [5, 4]);
        else if (state === 2) drawDashed(ctx, seg, PHOSPHOR.red, Math.max(1.5, Math.min(4, ppc * 1.2)), [3, 3]);
        else if (patch) { ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 200); drawDashed(ctx, seg, PHOSPHOR.amber, 2, [2, 4]); ctx.restore(); }
        else if (threat) { ctx.save(); ctx.globalAlpha = 0.85; drawDashed(ctx, seg, hp < 0.35 ? PHOSPHOR.red : PHOSPHOR.amber, 2, []); ctx.restore(); }
        if (gate && ppc >= 2 && state === 1) { const m = cut(pts, (a + b) / 2, (a + b) / 2 + 0.01)[0]; const [sx, sy] = toS(m[0] + 0.5, m[1] + 0.5); drawLabel(ctx, sx, sy - 10, 'GATE', { colour: PHOSPHOR.amber, size: 8 }); }
      }
    }
    // the RING CLOSED sweep
    for (let i = S.sweeps.length - 1; i >= 0; i--) {
      const s = S.sweeps[i], k = (now - s.at) / 1600;
      if (k >= 1) { S.sweeps.splice(i, 1); continue; }
      const [sx, sy] = toS(s.x, s.y);
      ctx.save(); ctx.globalAlpha = 1 - k; drawRing(ctx, sx, sy, Math.max(10, s.r * ppc * (0.3 + k)), PHOSPHOR.green, []); drawLabel(ctx, sx, sy, 'RING CLOSED', { colour: PHOSPHOR.green, size: 12 }); ctx.restore();
    }
    // raids: predicted path as an arrow, the countdown at the nest
    for (const r of S.raids) {
      if (r.guards || !r.path || r.path.length < 2) continue;
      const blink = r.state === 'forming' ? 0.75 + 0.25 * Math.sin(now / 180) : 1;
      const sp = r.path.map(([x, y]) => toS(x + 0.5, y + 0.5));
      ctx.save(); ctx.globalAlpha = blink;
      drawDashed(ctx, sp, 'rgba(20,4,2,0.7)', threat ? 6 : 5, []);
      drawDashed(ctx, sp, PHOSPHOR.red, threat ? 3 : 2.5, r.state === 'forming' ? [10, 6] : [14, 4]);
      arrowHead(ctx, sp[sp.length - 2], sp[sp.length - 1], PHOSPHOR.red);
      const [nx, ny] = sp[0];
      drawLabel(ctx, nx, ny - 14, r.state === 'forming' ? `RAID · ${r.n} · ${fmtTime(r.leaveIn)}` : `RAID · ${r.n}${r.what ? ' → ' + r.what.toUpperCase() : ''}`, { colour: PHOSPHOR.red, size: 10 });
      ctx.restore();
    }
    // nests (seen ones) and tower ranges on THREAT; nests always as a small mark
    for (const n of S.nests) {
      if (!onView(n.x, n.y, 60)) continue;
      const [sx, sy] = toS(n.x, n.y);
      drawRing(ctx, sx, sy, Math.max(6, (n.r + 2) * ppc), threat ? PHOSPHOR.red : 'rgba(255,90,70,0.55)', threat ? [] : [3, 3]);
      if (threat || ppc >= 1) drawLabel(ctx, sx, sy + Math.max(8, (n.r + 2) * ppc) + 10, `NEST ${roman(n.stage)}`, { colour: PHOSPHOR.red, size: 9 });
    }
    if (threat) {
      for (const t of S.towers) { if (!onView(t.x, t.y, t.range + 10)) continue; const [sx, sy] = toS(t.x, t.y); drawRing(ctx, sx, sy, t.range * ppc, 'rgba(127,216,255,0.45)', [4, 5]); }
      for (const [x, y] of renderer.foesNow?.() || []) { if (!onView(x, y, 4)) continue; const [sx, sy] = toS(x, y); ctx.fillStyle = PHOSPHOR.red; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) - 2, 4, 4); }
    }
    // the BUILD ghost of a tower: its range
    const bt = C.state.get('buildType');
    if (C.state.get('tool') === 'build' && bt && towerRow[bt] && pen?.pen) {
      const [sx, sy] = toS(pen.pen.x, pen.pen.y);
      drawRing(ctx, sx, sy, towerRow[bt].range * ppc, 'rgba(127,216,255,0.7)', [6, 4]);
      if (towerRow[bt].minRange) drawRing(ctx, sx, sy, towerRow[bt].minRange * ppc, 'rgba(255,90,70,0.5)', [2, 4]);
    }
    // the WALL the pen is drawing, planned the way the sim will plan it
    const st = pen?.stroke;
    if (st && st.tool === 'wall') {
      const p = plan([...st.pts, [Math.round(pen.pen.x), Math.round(pen.pen.y)]], !!C.keyDown?.('shift'));
      if (p.pts.length >= 2) {
        const sp = (p.closed ? [...p.pts, p.pts[0]] : p.pts).map(([x, y]) => toS(x + 0.5, y + 0.5));
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, wallCfg.width * 2 * ppc); ctx.strokeStyle = p.ok ? 'rgba(255,195,90,0.38)' : 'rgba(255,90,70,0.4)';
        ctx.beginPath(); sp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
        drawDashed(ctx, sp, p.ok ? PHOSPHOR.amber : PHOSPHOR.red, 1.5, [6, 4]);
      }
      for (const j of p.joins) drawRing(ctx, ...toS(j.at[0] + 0.5, j.at[1] + 0.5), 8, PHOSPHOR.amber, []);
      for (const s of p.snaps) { const [sx, sy] = toS(s.at[0] + 0.5, s.at[1] + 0.5); drawRing(ctx, sx, sy, 6, PHOSPHOR.blue, []); }
      const cost = Object.entries(p.cost).map(([r, n]) => `${n} ${(E()?.data.R[r]?.short || r).toUpperCase()}`).join(' · ');
      const [lx, ly] = toS(pen.pen.x, pen.pen.y);
      drawLabel(ctx, lx + 16, ly - 16, p.ok ? `WALL ${Math.round(p.len / 2)} M · ${p.sections} SECTIONS · ${cost || 'FREE'}${p.closed ? ' · RING' : ''}${C.keyDown?.('shift') ? ' · STRAIGHT' : ''}` : p.why.toUpperCase(), { colour: p.ok ? PHOSPHOR.amber : PHOSPHOR.red, align: 'left', size: 10 });
    } else if (S.pending && now - S.pending.at < 1500) {
      const sp = S.pending.pts.map(([x, y]) => toS(x + 0.5, y + 0.5));
      drawDashed(ctx, sp, PHOSPHOR.amber, 2, [5, 4]);
    }
  };
  C.overlays.push(overlay);
  off.push(() => { const i = C.overlays.indexOf(overlay); if (i >= 0) C.overlays.splice(i, 1); });

  if (window.gameEye) {
    window.gameEye.defence = () => D.state();
    window.gameEye.wallPlan = (pts, straight = false) => { const p = plan(pts, straight); return { ok: p.ok, why: p.why, pts: p.pts, len: p.len, joins: p.joins, snaps: p.snaps, sections: p.sections, cost: p.cost, closed: p.closed }; };
    window.gameEye.wallAt = (x, y) => C.game.scope.renderer.wallAt?.(x, y);
    window.gameEye._scope = () => C.game.scope.renderer;        // the specs' drawn == measured reads
    window.gameEye._mats = C.game.link.materials.list;
  }
  return D;
}

/** The part of a polyline between distances a and b. */
function cut(pts, a, b) {
  const out = [];
  let acc = 0;
  const at = (d) => { let s = 0; for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= s + l || i === pts.length - 1) { const t = l ? Math.max(0, Math.min(1, (d - s) / l)) : 0; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; } s += l; } return pts[0]; };
  out.push(at(a));
  for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; acc += Math.hypot(q[0] - p[0], q[1] - p[1]); if (acc > a && acc < b) out.push(q); }
  out.push(at(b));
  return out;
}
function arrowHead(ctx, a, b, colour) {
  if (!a || !b) return;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.save(); ctx.fillStyle = colour; ctx.beginPath();
  ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - Math.cos(ang - 0.45) * 12, b[1] - Math.sin(ang - 0.45) * 12); ctx.lineTo(b[0] - Math.cos(ang + 0.45) * 12, b[1] - Math.sin(ang + 0.45) * 12);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
/** Noise (amber) and Glow (violet) as filled bands with an edge line at each threshold. */
function drawFields(ctx, T, toS, ppc, view, W, H) {
  const [x0, y0, x1, y1] = view.rect();
  const step = Math.max(1, Math.ceil(3 / (ppc * 4)));   // quarter-cells per drawn square: never smaller than ~3 px
  const qx0 = Math.max(0, Math.floor(x0 / 4)), qy0 = Math.max(0, Math.floor(y0 / 4));
  const qx1 = Math.min(T.qw - 1, Math.ceil(x1 / 4)), qy1 = Math.min(T.qh - 1, Math.ceil(y1 / 4));
  const size = 4 * step * ppc;
  const bands = [14, 50, 110];
  for (const [field, rgb] of [[T.noise, '255,175,60'], [T.glow, '170,120,255']]) {
    for (let qy = qy0; qy <= qy1; qy += step) for (let qx = qx0; qx <= qx1; qx += step) {
      const v = field[qy * T.qw + qx];
      if (v < bands[0]) continue;
      const band = v >= bands[2] ? 3 : v >= bands[1] ? 2 : 1;
      const [sx, sy] = toS(qx * 4, qy * 4);
      ctx.fillStyle = `rgba(${rgb},${0.06 + band * 0.07})`;
      ctx.fillRect(sx, sy, size + 0.5, size + 0.5);
      // an edge where the next square is in a lower band: the contour line
      const r = qx + step <= qx1 ? field[qy * T.qw + qx + step] : v, d = qy + step <= qy1 ? field[(qy + step) * T.qw + qx] : v;
      const bandOf = (u) => (u >= bands[2] ? 3 : u >= bands[1] ? 2 : u >= bands[0] ? 1 : 0);
      ctx.fillStyle = `rgba(${rgb},0.75)`;
      if (bandOf(r) !== band) ctx.fillRect(sx + size - 1, sy, 1.5, size);
      if (bandOf(d) !== band) ctx.fillRect(sx, sy + size - 1, size, 1.5);
    }
  }
  void W; void H;
}
const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V'][n] || String(n);
function fmtTime(ticks) { const s = Math.max(0, Math.round((ticks || 0) / 20)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
