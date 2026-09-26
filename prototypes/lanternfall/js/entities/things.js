// Room things: interactables, zones, logic and traps, joined by wires (docs/07 §5-§8, 10 §6.5-6.6).
// Things that are made of stuff own real cells (doors are metal slabs, crates are plank) so water, fire and
// physics treat them as the world. Pure: reads/writes the grid, emits bus events, never touches the DOM.
import { F } from '../world/grid.js';
import { CLS } from '../world/materials.js';
import { dealDamage } from '../rpg/damage.js';
import { applyStatus } from '../rpg/status.js';
import { explode } from '../world/elements.js';
import { hexToRgb01 } from '../core/math.js';

const DT = 1 / 60;
const ON = 1, OFF = 0;
const INTERACT = new Set(['lever', 'valve', 'door', 'lamp_post', 'rekindle', 'lamp_socket', 'lift', 'chest', 'npc', 'shopkeeper', 'sign', 'oil_barrel', 'great_lamp', 'crate', 'bell']);
const HELD = new Set(['open', 'close', 'enable', 'disable', 'fill', 'drain', 'set', 'light', 'snuff', 'stop', 'input']);

export function createThings(game) {
  const room = game.room, g = game.grid, mats = g.mats, id = k => mats.byKey[k];
  const list = [], byId = {};
  const saved = game.roomState?.[room.room.id]?.things || {};
  for (const def of room.things) {
    const T = { def, t: def.t, id: def.id, state: null, signal: OFF, prev: OFF, t0: 0, cells: [], inputs: [], held: {}, edges: {}, x: def.at?.[0] ?? (def.rect ? def.rect[0] + def.rect[2] / 2 : 0), y: def.at?.[1] ?? (def.rect ? def.rect[1] + def.rect[3] : 0) };
    init(game, T, saved[def.id]);
    list.push(T); if (def.id) byId[def.id] = T;
  }
  // wires: sorted evaluation is cheap enough to just run in list order twice for chains (depth <= 16)
  const wires = (room.wires || []).map(w => ({ ...w, lastMatch: false }));
  const S = { list, byId, wires, cut: new Set() };

  S.step = function () {
    // 1. sources update their own state
    for (const T of list) { T.prev = T.signal; updateSelf(game, T, S); }
    // 2. wires -> held actions / edges, two passes so a chain through logic resolves in one tick
    for (let pass = 0; pass < 2; pass++) {
      for (const T of list) { T.held = {}; T.inputs = []; }
      for (const w of wires) {
        if (S.cut.has(w)) continue;
        const src = byId[w.from] || basinSource(game, w.from); const tgt = byId[w.to] || basinTarget(game, w.to); if (!src || !tgt) continue;
        const sig = src.signal, m = matches(w.when, sig, src);
        if (w.do === 'input') { tgt.inputs.push({ from: w.from, sig: m ? sig : (w.when ? OFF : sig) }); continue; }
        if (HELD.has(w.do)) { if (m) tgt.held[w.do] = w.value ?? (typeof sig === 'number' ? sig : 1); }
        else if (pass === 1 && m && !w.lastMatch) act(game, tgt, w.do, w, S);
        if (pass === 1) w.lastMatch = m;
      }
      for (const T of list) if (T.t === 'logic') updateLogic(game, T);
    }
    // 3. targets apply held actions
    for (const T of list) applyHeld(game, T, S);
  };
  S.interactTarget = function (p) { // nearest interactable within 12 cells of the player's centre, facing breaks ties
    let best = null, bd = 16;
    for (const T of list) {
      if (!INTERACT.has(T.t) || T.hidden || T.used) continue;
      if (T.t === 'door' && !T.def.manual) continue;
      const d = Math.hypot(T.x - p.x, (T.y - 6) - (p.y - 6)) - (Math.sign(T.x - p.x) === p.facing ? 2 : 0);
      if (d < bd) { bd = d; best = T; }
    }
    return best;
  };
  S.interact = (T, hold) => interact(game, T, S, hold);
  S.poleHit = (box) => { for (const T of list) if ((T.t === 'lever' || T.t === 'button' || T.t === 'bell' || T.t === 'oil_barrel' || T.t === 'crate') && inBox(T, box)) poleHit(game, T, S); };
  S.spellHit = (x, y, flame, shape) => { for (const T of list) if (Math.hypot(T.x - x, (T.y - 4) - y) < 10) spellHit(game, T, flame, shape, S); };
  S.save = () => { const out = {}; for (const T of list) { const s = saveOf(T); if (s !== undefined) out[T.id] = s; } return out; };
  S.draw = (out, atlas) => drawThings(game, S, out, atlas);
  return S;
}

function inBox(T, b) { return T.x >= b.x - 3 && T.x <= b.x + b.w + 3 && T.y - 8 <= b.y + b.h && T.y >= b.y; }
function matches(when, sig, src) {
  if (!when) return true;
  if (when === 'on') return sig > 0; if (when === 'off') return !(sig > 0); if (when === 'pulse') return src.pulsed;
  if (when.levelBelow != null) return (src.level ?? 0) > when.levelBelow; // basin level is a y: "below" the line = water surface y greater
  if (when.levelAbove != null) return (src.level ?? 1e9) < when.levelAbove;
  if (when.equals != null) return sig === when.equals;
  return false;
}
function basinSource(game, id) { const b = game.room.basins.find(b => b.id === id); if (!b) return null; return { signal: b.surface ?? 0, level: b.surface }; }
function basinTarget(game, id) { const b = game.room.basins.find(b => b.id === id); if (!b) return null; return { t: 'basin', basin: b, held: {}, inputs: [] }; }

// ---------- per-type setup ----------
function writeRect(g, r, m, flags = F.PINNED) { const cells = []; for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) { if (!g.inside(x, y)) continue; g.set(x, y, m, { flags }); cells.push(y * g.W + x); } return cells; }
function init(game, T, saved) {
  const g = game.grid, d = T.def, mat = k => g.mats.byKey[k];
  switch (T.t) {
    case 'lever': T.state = saved?.state ?? (d.state ? 'on' : 'off'); T.signal = T.state === 'on' ? ON : OFF; writeRect(g, [T.x - 2, T.y - 2, 4, 2], mat('metal')); break;
    case 'button': case 'target': T.state = 'up'; T.timer = 0; break;
    case 'plate': T.state = 'up'; T.needs = d.needs ?? d.weight ?? 1; break;
    case 'valve': T.level = saved?.level ?? 0; T.signal = T.level; break;
    case 'door': case 'timed_door': case 'sluice_gate': case 'sluice': case 'portcullis': {
      T.rect = d.rect; T.mat = mat(d.mat || (T.t === 'portcullis' ? 'metal' : T.t.startsWith('sluice') ? 'metal' : 'wood'));
      T.openF = saved?.open ? 1 : (d.state === 'open' ? 1 : 0); T.target = T.openF; T.timer = 0; T.latched = saved?.open ?? d.state === 'open';
      syncDoorCells(game, T, true); T.signal = T.openF >= 1 ? ON : OFF; break; }
    case 'light_door': T.rect = d.rect; T.mat = mat('metal'); T.openF = 0; T.target = 0; syncDoorCells(game, T, true); T.lightT = 0; break;
    case 'lamp_post': T.lit = saved?.lit ?? !!d.lit; break;
    case 'lamp_socket': T.lit = saved?.lit ?? !!d.lit; T.timer = 0; break;
    case 'great_lamp': T.lit = !!game.flags[`lamp_${d.act}`]; break;
    case 'chest': T.open = !!saved?.open; break;
    case 'breakable_wall': case 'breakable': { T.rect = d.rect; T.total = 0; for (let y = d.rect[1]; y < d.rect[1] + d.rect[3]; y++) for (let x = d.rect[0]; x < d.rect[0] + d.rect[2]; x++) { const i = y * g.W + x; if (g.mat[i]) { T.total++; if (saved?.broken) g.set(x, y, 0); else g.life[i] = Math.max(1, g.life[i] >> 1); } } T.broken = !!saved?.broken; T.signal = T.broken ? ON : OFF; break; }
    case 'crate': case 'oil_barrel': { T.w = d.size?.[0] ?? (T.t === 'crate' ? (d.big ? 20 : 10) : 8); T.h = d.size?.[1] ?? (T.t === 'crate' ? (d.big ? 20 : 10) : 10); T.bx = Math.round(T.x - T.w / 2); T.by = Math.round(T.y - T.h); T.vy = 0; T.vx = 0; T.mat = mat(T.t === 'crate' ? 'plank' : 'metal'); T.hp = T.w * T.h; T.oil = T.t === 'oil_barrel' ? 120 : 0; writeBody(game, T); break; }
    case 'spark_coil': T.charge = 0; T.drainT = 0; break;
    case 'lift': T.stops = d.stops || [T.y, T.y - (d.travel || 80)]; T.at = saved?.at ?? 0; T.py = T.stops[T.at]; T.w = d.w || 24; T.mat = mat('plank'); T.cells = writeRect(g, [Math.round(T.x - T.w / 2), Math.round(T.py), T.w, 4], T.mat); break;
    case 'bell': T.ring = 0; break;
    case 'logic': T.state = d.state ? 1 : 0; T.count = 0; T.seq = []; T.timerT = 0; T.prevIn = 0; T.signal = T.state; break;
    case 'trap_spikes': T.rect = d.rect; writeRect(g, [d.rect[0], d.rect[1] + d.rect[3] - 1, d.rect[2], 1], mat('metal')); break;
    case 'trap_icicle': T.state = 'hanging'; T.regrow = 0; break;
    case 'trap_flamejet': case 'trap_crusher': case 'trap_waxdrip': case 'trap_darts': T.cycleT = 0; T.enabled = d.enabled !== false; break;
    case 'zone': T.inside = false; T.fired = !!saved?.fired; break;
    case 'timer': T.acc = 0; break;
  }
}
function saveOf(T) {
  switch (T.t) {
    case 'lever': return T.def.spring ? undefined : { state: T.state };
    case 'valve': return { level: T.level };
    case 'door': case 'sluice_gate': case 'sluice': case 'portcullis': return T.latched ? { open: true } : undefined;
    case 'lamp_post': case 'lamp_socket': return T.lit ? { lit: true } : undefined;
    case 'chest': return T.open ? { open: true } : undefined;
    case 'breakable_wall': case 'breakable': return T.broken ? { broken: true } : undefined;
    case 'lift': return { at: T.at };
    case 'zone': return T.def.once && T.fired ? { fired: true } : undefined;
  }
  return undefined;
}

// ---------- doors (cells that slide up) ----------
function syncDoorCells(game, T, full) {
  const g = game.grid, [x0, y0, w, h] = T.rect, openRows = Math.round(T.openF * h);
  // rows [y0, y0 + h - openRows) are closed (the slab retracts upward into the frame)
  for (let r = 0; r < h; r++) {
    const y = y0 + r, closed = r < h - openRows;
    for (let x = x0; x < x0 + w; x++) {
      if (!g.inside(x, y)) continue; const i = y * g.W + x, m = g.mat[i];
      if (closed && m !== T.mat) { const c = g.mats.cls[m]; if (c === CLS.LIQUID || c === CLS.POWDER) { let ty = y - 1; while (ty > 0 && g.mat[ty * g.W + x] !== 0) ty--; if (ty > 0) g.set(x, ty, m); } g.set(x, y, T.mat, { flags: F.PINNED, shade: 64 + ((x + y) & 7) }); }
      else if (!closed && m === T.mat && (g.flags[i] & F.PINNED)) g.set(x, y, 0);
    }
  }
}
function stepDoor(game, T) {
  const speed = T.t === 'portcullis' ? (T.target > T.openF ? 30 : 200) : T.t.startsWith('sluice') ? 20 : 60;
  const h = T.rect[3], step = speed * DT / h;
  if (T.openF !== T.target) {
    const before = T.openF; T.openF = T.target > T.openF ? Math.min(T.target, T.openF + step) : Math.max(T.target, T.openF - step);
    if (Math.round(before * h) !== Math.round(T.openF * h)) syncDoorCells(game, T);
    if (before === 0 || T.openF === 0 || T.openF === 1) game.bus?.emit(T.openF > before ? 'door.open' : 'door.close', { id: T.id, x: T.x, y: T.y });
    // crush what stands under a closing slab
    if (T.openF < before) for (const e of [game.player, ...game.entities]) { if (!e || e.dead) continue; const [x0, y0, w, hh] = T.rect; if (e.x + e.w / 2 > x0 && e.x - e.w / 2 < x0 + w && e.y > y0 && e.y - e.h < y0 + hh * (1 - T.openF)) { if (!T.crushT || game.tick - T.crushT > 30) { T.crushT = game.tick; dealDamage(game, { source: { id: 'hollow', name: 'The Hollow' }, target: e, amount: T.t === 'portcullis' ? 60 : 40, via: 'trap:' + T.t, viaName: 'The Hollow — ' + T.t.replace('_', ' ') }); e.x += (e.x < x0 + w / 2 ? -6 : 6); } } }
  }
  T.signal = T.openF >= 0.99 ? ON : OFF;
}

// ---------- cell bodies (crates, barrels) ----------
function writeBody(game, T) { const g = game.grid; T.cells = []; for (let y = T.by; y < T.by + T.h; y++) for (let x = T.bx; x < T.bx + T.w; x++) { if (!g.inside(x, y)) continue; const m = g.mat[y * g.W + x]; if (m !== 0 && g.mats.cls[m] !== CLS.LIQUID && g.mats.cls[m] !== CLS.GAS) continue; g.set(x, y, T.mat, { flags: F.PINNED | F.BUILT, shade: T.t === 'crate' ? ((x - T.bx) % 5 === 0 || (y - T.by) % 5 === 0 ? 0 : 2) : ((y - T.by) % 3 === 0 ? 3 : 1) }); T.cells.push(y * g.W + x); } }
function eraseBody(game, T) { const g = game.grid; let alive = 0; for (const i of T.cells) { if (g.mat[i] === T.mat) { alive++; g.set(i % g.W, (i / g.W) | 0, 0); } } return alive; }
function bodyFree(game, T, dx, dy) { const g = game.grid; for (let y = T.by + dy; y < T.by + dy + T.h; y++) for (let x = T.bx + dx; x < T.bx + dx + T.w; x++) { if (!g.inside(x, y)) return false; const m = g.mat[y * g.W + x]; const c = g.mats.cls[m]; if ((c === CLS.STATIC || c === CLS.POWDER) && !(m === T.mat && T.cells.includes(y * g.W + x))) return false; } return true; }
function stepBody(game, T) {
  const g = game.grid;
  // lost cells (burned, dissolved): the body breaks under half
  let alive = 0; for (const i of T.cells) if (g.mat[i] === T.mat) alive++;
  if (alive < T.cells.length * 0.5) { eraseBody(game, T); T.hidden = true; T.t0 = -1; if (T.t === 'oil_barrel') spill(game, T, 60); game.bus?.emit('thing.break', { id: T.id, x: T.x, y: T.y }); return; }
  // fire on a barrel: explode after 0.8 s
  if (T.t === 'oil_barrel') { let hot = false; for (const i of T.cells) if (g.temp[i] > 150 || (g.flags[i] & F.BURNING)) hot = true; if (hot && !T.fuse) T.fuse = 0.8; if (T.fuse) { T.fuse -= DT; if (T.fuse <= 0) { eraseBody(game, T); T.hidden = true; explode(game, Math.round(T.x), Math.round(T.y - T.h / 2), 20, 60, { heat: 4, source: { id: 'hollow', name: 'The Hollow' } }); for (const e of [game.player, ...game.entities]) if (e && !e.dead && Math.hypot(e.x - T.x, e.y - T.y) < 26) dealDamage(game, { source: { id: 'hollow', name: 'The Hollow' }, target: e, amount: 40, flame: 'ember', via: 'trap:oil_barrel', viaName: 'The Hollow — oil barrel', knock: { x: Math.sign(e.x - T.x) * 260, y: -160 } }); spill(game, T, 80, true); game.bus?.emit('explode', { x: T.x, y: T.y, r: 20, power: 60 }); return; } } if (T.leak > 0) { T.leak -= DT; if (game.tick % 3 === 0) { const x = Math.round(T.x + T.leakDir * (T.w / 2 + 1)), y = Math.round(T.by + T.h - 3); if (g.get(x, y) === 0 && T.oil > 0) { g.set(x, y, 23); T.oil--; } } } }
  // gravity, pushing
  let dy = 0; T.vy = Math.min(300, T.vy + 900 * DT); const want = Math.floor(T.vy * DT + (T.fy || 0)); T.fy = (T.vy * DT + (T.fy || 0)) - want;
  for (let k = 0; k < want; k++) { if (bodyFree(game, T, 0, dy + 1)) dy++; else { T.vy = 0; T.fy = 0; break; } }
  let dx = 0; if (T.push) { const d = Math.sign(T.push); if (bodyFree(game, T, d, dy)) dx = d; T.push = 0; }
  if (dx || dy) { eraseBody(game, T); T.bx += dx; T.by += dy; T.x = T.bx + T.w / 2; T.y = T.by + T.h; writeBody(game, T); }
}
function spill(game, T, n, burning) { const g = game.grid; for (let k = 0; k < n; k++) { const x = Math.round(T.x - 6 + (k % 12)), y = Math.round(T.y - 2 - Math.floor(k / 12)); if (g.get(x, y) === 0) { g.set(x, y, 23); if (burning) { const i = y * g.W + x; g.flags[i] |= F.BURNING; g.life[i] = 24; g.markHot(x, y); } } } }

// ---------- per-tick self update ----------
function updateSelf(game, T, S) {
  const g = game.grid, p = game.player, d = T.def; T.pulsed = false;
  switch (T.t) {
    case 'lever': if (T.springT > 0) { T.springT -= DT; if (T.springT <= 0) setLever(game, T, 'off'); } T.signal = T.state === 'on' ? ON : OFF; break;
    case 'button': case 'target': if (T.timer > 0) { T.timer -= DT; T.signal = ON; T.state = 'down'; } else { T.signal = OFF; T.state = 'up'; } break;
    case 'plate': { const [x0, y0, w, h] = d.rect; let wgt = 0;
      for (const e of [p, ...game.entities]) if (e && !e.dead && e.x + e.w / 2 > x0 && e.x - e.w / 2 < x0 + w && Math.abs(e.y - y0) < 4) wgt += e === p ? 1 : (e.weight ?? (e.w * e.h > 120 ? 2 : 1));
      for (const o of S.list) if ((o.t === 'crate' || o.t === 'oil_barrel') && !o.hidden && o.x > x0 && o.x < x0 + w && Math.abs(o.y - y0) < 4) wgt += o.t === 'crate' ? (o.w >= 20 ? 3 : 1) : 2;
      let liquid = 0; for (let y = y0 - 16; y < y0; y++) for (let x = x0; x < x0 + w; x++) { const c = g.mats.cls[g.get(x, y)]; if (c === CLS.LIQUID || c === CLS.POWDER) liquid++; } wgt += liquid / 80;
      T.weight = wgt; T.signal = wgt >= T.needs ? ON : OFF; T.state = T.signal ? 'down' : 'up'; break; }
    case 'valve': if (T.turning) { T.level = Math.max(0, Math.min(1, T.level + T.turning * DT / 2)); if (T.level === 0 || T.level === 1) T.turning = 0; } T.turning = T.holding ? T.turning : 0; T.holding = false; T.signal = T.level; break;
    case 'door': case 'sluice_gate': case 'sluice': case 'portcullis': stepDoor(game, T); break;
    case 'timed_door': if (T.timer > 0) { T.timer -= DT; T.target = 1; if (T.timer <= 0) T.target = 0; } stepDoor(game, T); break;
    case 'light_door': { const tier = game.lightGrid?.tier(T.x, T.rect[1] + 4) || 'dark'; const need = { dim: 1, lit: 2, bright: 3 }[d.tier || 'lit']; const have = { dark: 0, dim: 1, lit: 2, bright: 3 }[tier]; const ok = d.invert ? tier === 'dark' : have >= need; T.lightT = ok ? T.lightT + DT : 0; T.target = T.lightT >= 0.3 || T.held.open ? 1 : 0; stepDoor(game, T); break; }
    case 'lamp_socket': if (T.lit && d.gutter) { T.timer += DT; if (T.timer >= d.gutter) { T.lit = false; T.timer = 0; } } T.signal = T.lit ? ON : OFF; break;
    case 'lamp_post': case 'great_lamp': T.signal = T.lit ? ON : OFF; break;
    case 'breakable_wall': case 'breakable': if (!T.broken) { let left = 0; const [x0, y0, w, h] = T.rect; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g.mat[y * g.W + x]) left++; if (T.total && left <= T.total * 0.2) { T.broken = true; game.bus?.emit('wall.break', { id: T.id }); } } T.signal = T.broken ? ON : OFF; break;
    case 'crate': case 'oil_barrel': if (!T.hidden) stepBody(game, T); break;
    case 'spark_coil': T.drainT += DT; if (T.drainT >= 3) { T.drainT = 0; T.charge = Math.max(0, T.charge - 1); } T.signal = T.charge > 0 || T.held.fill ? ON : OFF; break;
    case 'lift': stepLift(game, T); break;
    case 'bell': if (T.ring > 0) T.ring -= DT; T.signal = T.ring > 0 ? ON : OFF; break;
    case 'zone': { const [x0, y0, w, h] = d.rect; const inside = p && p.x > x0 && p.x < x0 + w && p.y > y0 && p.y - p.h < y0 + h; const on = d.on || 'enter';
      if (T.fired && d.once) { T.signal = OFF; T.inside = inside; break; }
      T.signal = (on === 'inside' && inside) || (on === 'enter' && inside && !T.inside) || (on === 'leave' && !inside && T.inside) ? ON : (on === 'inside' ? OFF : T.signal && T.holdT > 0 ? ON : OFF);
      if (T.signal && on !== 'inside') { T.fired = true; T.holdT = 0.1; } if (T.holdT > 0) T.holdT -= DT; T.inside = inside; break; }
    case 'timer': T.acc += DT; T.pulsed = false; if (d.every && T.acc >= d.every) { T.acc = 0; T.pulsed = true; } T.signal = T.pulsed ? ON : OFF; break;
    case 'trap_spikes': { const [x0, y0, w, h] = d.rect; for (const e of [p, ...game.entities]) { if (!e || e.dead || e.flying) continue; if (e.x + e.w / 2 > x0 && e.x - e.w / 2 < x0 + w && e.y >= y0 && e.y - 2 <= y0 + h) { if (e === p && p.melee?.move === 'plunge') continue; if (!e.spikeT || game.tick - e.spikeT > 30) { e.spikeT = game.tick; trapHit(game, e, 15 * actMult(game), 'trap_spikes', 'spike bed', { x: 0, y: -180 }); } } } break; }
    case 'trap_icicle': { if (T.state === 'hanging') { for (const e of [p, ...game.entities]) if (e && !e.dead && Math.abs(e.x - T.x) < 6 && e.y > T.y && e.y - T.y < 200) { T.state = 'shaking'; T.st = 0.4; game.bus?.emit('trap.telegraph', { id: T.id }); } } else if (T.state === 'shaking') { T.st -= DT; if (T.st <= 0) { T.state = 'falling'; T.fy = T.y; T.vy = 0; } } else if (T.state === 'falling') { T.vy += 900 * DT; T.fy += T.vy * DT; for (const e of [p, ...game.entities]) if (e && !e.dead && Math.abs(e.x - T.x) < 5 && Math.abs((e.y - e.h / 2) - T.fy) < 8) { trapHit(game, e, 20 * actMult(game), 'trap_icicle', 'icicle'); T.state = 'gone'; } if (g.solidAt(Math.round(T.x), Math.round(T.fy + 8))) { for (let k = 0; k < 10; k++) { const x = Math.round(T.x - 2 + (k % 4)), y = Math.round(T.fy + 6 - Math.floor(k / 4)); if (g.get(x, y) === 0) g.set(x, y, d.mat === 'stone' ? 20 : 9); } T.state = 'gone'; T.regrow = d.mat === 'stone' ? Infinity : 12; } } else if (T.state === 'gone') { T.regrow -= DT; if (T.regrow <= 0) T.state = 'hanging'; } break; }
    case 'trap_flamejet': { if (!T.enabled) break; T.cycleT += DT; const on = (d.cycle || [1.5, 2.0]), period = on[0] + on[1], t = T.cycleT % period; T.firing = t < on[0]; T.warn = !T.firing && t > period - 0.4; if (T.firing) { const dir = d.dir === 'l' ? -1 : d.dir === 'u' ? 0 : 1, len = d.len || 48; for (let k = 2; k < len; k += 2) { const x = Math.round(T.x + dir * k), y = Math.round(T.y - 4 - (d.dir === 'u' ? k : 0)); if (g.get(x, y) === 0 && game.tick % 2 === 0) g.set(x, y, 32); } for (const e of [p, ...game.entities]) if (e && !e.dead && (dir ? (Math.sign(e.x - T.x) === dir && Math.abs(e.x - T.x) < len && Math.abs(e.y - 4 - T.y) < 8) : (Math.abs(e.x - T.x) < 5 && e.y < T.y && T.y - e.y < len))) { if (game.tick % 15 === 0) { trapHit(game, e, 18 * 0.25 * actMult(game), 'trap_flamejet', 'flame jet'); applyStatus(game, e, 'burn', { source: { id: 'hollow', name: 'The Hollow' }, hitDamage: 6 }); } } } break; }
    case 'trap_crusher': { if (!T.enabled) break; T.cycleT += DT; const cyc = [0.3, 0.6, 1.2, 1.0], per = cyc.reduce((a, b) => a + b); const t = T.cycleT % per; T.warn = t > per - 0.5; T.down = t < cyc[0] + cyc[1]; if (t < DT * 1.5) { const [x0, y0, w, h] = d.rect; for (const e of [p, ...game.entities]) if (e && !e.dead && e.x > x0 && e.x < x0 + w && e.y > y0 && e.y - e.h < y0 + h) trapHit(game, e, 50 * actMult(game), 'trap_crusher', 'crusher'); game.shake?.(0.15); game.bus?.emit('trap.crush', { id: T.id }); } break; }
    case 'trap_waxdrip': { T.cycleT += DT; T.warn = (T.cycleT % 1.2) > 0.8; if (T.cycleT % 1.2 < DT) { game.particles.spawn(3, T.x, T.y + 1, 0, 20, 3, 0xb39f6d, 24, 900); } break; }
    case 'trap_darts': if (T.fireT > 0) { T.fireT -= DT; if (Math.round(T.fireT / 0.2) !== Math.round((T.fireT + DT) / 0.2)) fireDart(game, T); } break;
  }
}
function actMult(game) { const a = +String(game.room?.room?.act || 'act1').slice(3) || 1; return Math.pow(1.15, a - 1); }
function trapHit(game, e, amount, id, name, knock) { dealDamage(game, { source: { id: 'hollow', name: 'The Hollow' }, target: e, amount, flame: 'physical', via: 'trap:' + id, viaName: 'The Hollow — ' + name, knock, tags: ['trap'] }); if (e.dead && e.kind === 'enemy') e.trapKill = true; }
function fireDart(game, T) { const dir = T.def.dir === 'l' ? -1 : 1; const plan = { flame: T.def.flame || 'physical', shape: 'bolt', charms: [], color: '#d0c8b0', damage: 8 * actMult(game), speed: 400, size: 1, lifetime: 1.5, count: 1, spread: 0, bounces: 0, pierce: 0, seek: 0, dig: 0, knock: 1, light: { r: 8, i: 0.3 }, status: T.def.flame === 'bile' ? 'corrode' : null, oil: 0 }; game.castPlan?.({ id: 'hollow', name: 'The Hollow', x: T.x, y: T.y, team: 'trap', crit: 0 }, plan, { ox: T.x + dir * 4, oy: T.y - 4, x: T.x + dir * 100, y: T.y - 4 }, { wickId: 'trap:trap_darts', wickName: 'The Hollow — darts' }); }
function stepLift(game, T) {
  const target = T.stops[T.at], dy = Math.sign(target - T.py); if (!dy) { T.signal = OFF; return; }
  T.signal = ON; const speed = T.cranking ? 25 : 50; T.acc = (T.acc || 0) + speed * DT; T.cranking = false;
  while (T.acc >= 1 && T.py !== target) {
    T.acc -= 1; const g = game.grid; for (const i of T.cells) if (g.mat[i] === T.mat) g.set(i % g.W, (i / g.W) | 0, 0);
    T.py += dy; T.cells = writeRect(g, [Math.round(T.x - T.w / 2), Math.round(T.py), T.w, 4], T.mat);
    for (const e of [game.player, ...game.entities]) if (e && Math.abs(e.x - T.x) < T.w / 2 + 2 && Math.abs(e.y - (T.py - dy)) < 3) e.y += dy;
  }
}

// ---------- logic kinds ----------
function updateLogic(game, T) {
  const d = T.def, inOn = T.inputs.filter(i => i.sig > 0).length, anyIn = inOn > 0, rising = anyIn && !T.prevIn;
  switch (d.kind) {
    case 'timer': { const mode = d.mode || 'delay', sec = d.sec ?? 1;
      if (mode === 'delay') { T.q = T.q || []; T.q.push(anyIn); if (T.q.length > Math.round(sec * 60)) T.state = T.q.shift() ? 1 : 0; }
      else if (mode === 'pulse') { if (rising) T.timerT = sec; T.timerT -= DT / 2; T.state = T.timerT > 0 ? 1 : 0; }
      else if (mode === 'hold') { if (anyIn) T.timerT = sec; else T.timerT -= DT / 2; T.state = anyIn || T.timerT > 0 ? 1 : 0; }
      else if (mode === 'blink') { if (anyIn || !T.inputs.length) { T.timerT += DT / 2; if (T.timerT >= sec) { T.timerT = 0; T.state = 1 - T.state; } } else T.state = 0; }
      break; }
    case 'latch': if (T.held.set_latch || T.edges.set) T.state = 1; else if (T.edges.reset) T.state = 0; break;
    case 'toggle': if (rising) T.state = 1 - T.state; break;
    case 'counter': if (rising) T.count++; if (T.edges.reset) T.count = 0; T.state = T.count >= (d.n || 3) ? 1 : 0; break;
    case 'sequence': { for (const i of T.inputs) { const was = T.lastIns?.[i.from] || 0; if (i.sig > 0 && !was) { T.seq.push({ id: i.from, t: game.time }); const order = d.order || []; const k = T.seq.length - 1; if (order[k] !== i.from || game.time - T.seq[0].t > (d.window || 6)) { T.seq = order[0] === i.from ? [{ id: i.from, t: game.time }] : []; T.pulsed = true; } else if (T.seq.length === order.length) T.state = 1; } } T.lastIns = Object.fromEntries(T.inputs.map(i => [i.from, i.sig])); break; }
    case 'compare': { const v = T.inputs[0]?.sig ?? 0; T.state = d.op === '<=' ? (v <= d.value ? 1 : 0) : d.op === 'between' ? (v >= d.min && v <= d.max ? 1 : 0) : (v >= d.value ? 1 : 0); break; }
    case 'any_of': T.state = inOn >= (d.k || 1) ? 1 : 0; break;
  }
  T.prevIn = anyIn; T.edges = {}; T.signal = T.state;
}

// ---------- actions ----------
function act(game, T, action, w, S) {
  if (T.t === 'basin') { if (action === 'stop') T.basin.mode = 'idle'; return; }
  switch (action) {
    case 'toggle': if ('latched' in T) T.latched = !T.latched; if (T.t === 'lever') setLever(game, T, T.state === 'on' ? 'off' : 'on'); if (T.t === 'lift') T.at = T.at ? 0 : 1; break;
    case 'pulse': if (T.t === 'bell') ringBell(game, T, S); else if (T.t === 'button' || T.t === 'target') T.timer = T.def.hold || 0.5; else if (T.t === 'trap_darts') T.fireT = 0.6; else if (T.t === 'trap_crusher') T.cycleT = 0; else if (T.t === 'timed_door') T.timer = T.def.open ?? 4; T.pulsed = true; break;
    case 'spawn': game.spawnAt?.(T); break;
    case 'say': game.say?.(T.def.npc || T.id, w.line); break;
    case 'shake': game.shake?.(0.3); break;
    case 'set_latch': T.edges.set = true; break; case 'reset': T.edges.reset = true; break;
  }
}
function applyHeld(game, T, S) {
  const h = T.held;
  if (T.t === 'basin') { if (h.drain) T.basin.mode = 'drain'; else if (h.fill) T.basin.mode = 'fill'; return; }
  if (T.t === 'door' || T.t === 'sluice_gate' || T.t === 'sluice' || T.t === 'portcullis') {
    let want = T.latched ? 1 : 0; if (h.open) want = 1; if (h.close) want = 0; if (h.set != null && T.t !== 'door') want = Math.max(0, Math.min(1, h.set)); T.target = want;
    if (T.def.basin) { const b = game.room.basins.find(b => b.id === T.def.basin); if (b) b.mode = want > 0.5 ? 'drain' : (b.mode === 'drain' ? 'idle' : b.mode); }
  }
  if (T.t === 'timed_door' && h.open && T.timer <= 0) { T.timer = T.def.open ?? 4; game.bus?.emit('door.open', { id: T.id }); }
  if (T.t === 'lever') { if (h.open && T.state !== 'on') setLever(game, T, 'on'); if (h.close && T.state !== 'off') setLever(game, T, 'off'); if (h.disable) T.locked = true; if (h.enable) T.locked = false; }
  if (T.t === 'valve' && h.set != null) T.level += Math.sign(h.set - T.level) * Math.min(Math.abs(h.set - T.level), DT / 2);
  if (T.t === 'lamp_socket' || T.t === 'lamp_post') { if (h.light) T.lit = true; if (h.snuff) T.lit = false; }
  if (T.t === 'spark_coil' && h.fill) T.charge = 5;
  if (T.t.startsWith('trap_')) { if (h.disable) T.enabled = false; if (h.enable) T.enabled = true; }
  if (T.t === 'lift' && (h.open || h.close)) T.at = h.open ? 1 : 0;
}
function setLever(game, T, state) { if (T.locked) return; T.state = state; T.signal = state === 'on' ? ON : OFF; if (state === 'on' && T.def.spring) T.springT = T.def.spring; game.bus?.emit('lever', { id: T.id, state, x: T.x, y: T.y }); }
function ringBell(game, T, S) { T.ring = 1.5; T.pulsed = true; (game.noises ||= []).push({ x: T.x, y: T.y, r: T.def.radius || 200, loud: true }); game.bus?.emit('bell', { id: T.id, x: T.x, y: T.y }); for (const o of S.list) if (o.t === 'timed_door' && o.def.hears && Math.hypot(o.x - T.x, o.y - T.y) < (T.def.radius || 200)) o.timer = o.def.open ?? 5; }

function interact(game, T, S, hold) {
  const p = game.player;
  switch (T.t) {
    case 'lever': if (!hold) { if (T.locked) return { refused: 'Locked' }; setLever(game, T, T.state === 'on' ? 'off' : 'on'); } break;
    case 'valve': T.holding = true; T.turning = T.level >= 1 ? -1 : T.turning || 1; break;
    case 'door': if (!hold) { T.latched = !T.latched; } break;
    case 'lift': if (T.def.crank) { T.cranking = true; if (!hold) T.at = T.at ? 0 : 1; } else if (!hold) T.at = T.at ? 0 : 1; break;
    case 'crate': if (!hold) { T.push = p.facing; } break;
    case 'oil_barrel': if (!hold && T.leak > 0 && !T.refueled) { T.refueled = true; p.oil = Math.min(p.maxOil, p.oil + 20); game.bus?.emit('refuel', { amount: 20 }); } break;
    case 'bell': if (!hold) ringBell(game, T, S); break;
    default: if (!hold) game.onInteract?.(T); // lamp posts, chests, npcs, shops, signs, rekindle posts: game-level handlers
  }
  return null;
}
function poleHit(game, T, S) {
  if (T.t === 'lever') { if (!T.locked) setLever(game, T, T.state === 'on' ? 'off' : 'on'); }
  else if (T.t === 'button') T.timer = T.def.hold || 0.5;
  else if (T.t === 'bell') ringBell(game, T, S);
  else if (T.t === 'crate') T.push = game.player.facing;
  else if (T.t === 'oil_barrel' && game.player.melee?.move === 'heavy' && !T.leak) { T.leak = 6; T.leakDir = game.player.x < T.x ? 1 : -1; game.bus?.emit('barrel.leak', { id: T.id }); }
}
function spellHit(game, T, flame, shape, S) {
  if (T.t === 'button') T.timer = T.def.hold || 0.5;
  if (T.t === 'target' && (shape === 'bolt' || shape === 'lob' || shape === 'wave')) T.timer = 0.5;
  if (T.t === 'spark_coil' && flame === 'spark') T.charge = Math.min(5, T.charge + 1);
  if ((T.t === 'lamp_socket' || T.t === 'lamp_post') && (flame === 'ember' || flame === 'gleam')) { if (!T.lit) game.bus?.emit('lamp.light', { id: T.id, x: T.x, y: T.y }); T.lit = true; T.timer = 0; }
  if (T.t === 'lamp_socket' && (flame === 'rime' || flame === 'tide')) T.lit = false;
  if (T.t === 'bell' && flame === 'spark') ringBell(game, T, S);
}

// ---------- drawing (sprites + indicator lights) ----------
function drawThings(game, S, out, atlas) {
  const { sprites, additive, lights } = out, red = [0.48, 0.16, 0.13], green = [0.31, 0.82, 0.42], amber = [1, 0.7, 0.2];
  const ind = (x, y, on, timing) => { const c = timing ? ((game.tick >> 3) & 1 ? amber : [0.3, 0.2, 0.05]) : on ? green : red; additive.push({ x: x - 0.5, y: y - 0.5, w: 1, h: 1, tint: [...c, 1], emit: 1.5 }); lights.push({ x, y, r: 6, color: c, i: 0.6, shadow: false }); };
  for (const T of S.list) {
    if (T.hidden) continue; const x = T.x, y = T.y, d = T.def;
    switch (T.t) {
      case 'lever': { const a = T.state === 'on' ? 0.6 : -0.6; for (let k = 0; k < 7; k++) sprites.push({ x: x + Math.sin(a) * k, y: y - 2 - Math.cos(a) * k, w: 1, h: 1, tint: [0.5, 0.42, 0.3, 1] }); sprites.push({ x: x + Math.sin(a) * 7 - 1, y: y - 2 - Math.cos(a) * 7 - 1, w: 2, h: 2, tint: [0.7, 0.2, 0.15, 1] }); ind(x + 3, y - 4, T.state === 'on', T.springT > 0); break; }
      case 'button': sprites.push({ x: x - 3, y: y - (T.state === 'down' ? 1 : 2), w: 6, h: T.state === 'down' ? 1 : 2, tint: [0.6, 0.5, 0.3, 1] }); ind(x, y - 4, T.signal > 0); break;
      case 'target': for (let k = 0; k < 3; k++) sprites.push({ x: x - 3 + k, y: y - 6 + k, w: 6 - 2 * k, h: 6 - 2 * k, tint: k & 1 ? [0.9, 0.85, 0.75, 1] : [0.7, 0.2, 0.15, 1] }); ind(x, y - 8, T.signal > 0); break;
      case 'plate': sprites.push({ x: d.rect[0], y: d.rect[1] - (T.state === 'down' ? 0 : 2), w: d.rect[2], h: 2, tint: [0.55, 0.45, 0.3, 1] }); ind(d.rect[0] + d.rect[2] / 2, d.rect[1] - 4, T.signal > 0); break;
      case 'valve': { const a = T.level * Math.PI * 4; for (let k = 0; k < 4; k++) { const aa = a + k * Math.PI / 2; for (let r = 0; r < 4; r++) sprites.push({ x: x + Math.cos(aa) * r, y: y - 4 + Math.sin(aa) * r, w: 1, h: 1, tint: [0.6, 0.5, 0.35, 1] }); } ind(x + 5, y - 8, T.level > 0.5, T.turning); break; }
      case 'timed_door': ind(d.rect[0] + d.rect[2] / 2, d.rect[1] - 3, T.signal > 0, T.timer > 0); break;
      case 'door': case 'sluice_gate': case 'sluice': case 'portcullis': ind(d.rect[0] + d.rect[2] / 2, d.rect[1] - 3, T.signal > 0); break;
      case 'light_door': { const c = T.lightT > 0 ? [1, 0.9, 0.5] : [0.3, 0.35, 0.5]; additive.push({ x: d.rect[0] + d.rect[2] / 2 - 1, y: d.rect[1] + 3, w: 3, h: 2, tint: [...c, 1], emit: 1.2 }); break; }
      case 'lamp_post': { sprites.push({ x: x - 1, y: y - 20, w: 2, h: 20, tint: [0.18, 0.16, 0.14, 1] }); sprites.push({ x: x - 3, y: y - 24, w: 6, h: 5, tint: [0.15, 0.13, 0.1, 1] }); if (T.lit) { additive.push({ x: x - 2, y: y - 23, w: 4, h: 3, tint: [1, 0.78, 0.42, 1], emit: 2 }); } else additive.push({ x: x - 1, y: y - 22, w: 2, h: 1, tint: [0.4, 0.25, 0.1, 1], emit: 0.4 }); break; }
      case 'rekindle': { sprites.push({ x: x - 1, y: y - 12, w: 1, h: 4, tint: [0.2, 0.2, 0.2, 1] }); sprites.push({ x: x - 2, y: y - 8, w: 4, h: 4, tint: [0.35, 0.28, 0.14, 1] }); additive.push({ x: x - 1, y: y - 7, w: 2, h: 2, tint: [0.9, 0.7, 0.35, 1], emit: 1.5 }); lights.push({ x, y: y - 6, r: 20, color: [0.9, 0.7, 0.35], i: 0.5, shadow: false }); break; }
      case 'lamp_socket': sprites.push({ x: x - 2, y: y - 4, w: 4, h: 4, tint: [0.2, 0.18, 0.15, 1] }); if (T.lit) { additive.push({ x: x - 1, y: y - 4, w: 2, h: 2, tint: [1, 0.75, 0.35, 1], emit: 2 }); lights.push({ x, y: y - 4, r: d.r || 40, color: [1, 0.75, 0.4], i: 0.9, shadow: true, flicker: 0.1 }); } break;
      case 'great_lamp': { sprites.push({ x: x - 6, y: y - 48, w: 12, h: 48, tint: [0.14, 0.12, 0.1, 1] }); sprites.push({ x: x - 10, y: y - 60, w: 20, h: 14, tint: [0.2, 0.17, 0.12, 1] }); if (T.lit) { additive.push({ x: x - 8, y: y - 58, w: 16, h: 10, tint: [1, 0.85, 0.55, 1], emit: 3 }); lights.push({ x, y: y - 52, r: 360 * Math.min(1, (game.time - (T.litT || 0)) / 3 + (T.litT ? 0 : 1)), color: [1, 0.8, 0.5], i: 2.2, shadow: true, flicker: 0.02 }); } else additive.push({ x: x - 2, y: y - 54, w: 4, h: 3, tint: [0.5, 0.25, 0.1, 1], emit: 0.5 }); break; }
      case 'chest': sprites.push({ x: x - 5, y: y - 7, w: 10, h: 7, tint: T.open ? [0.3, 0.22, 0.14, 1] : [0.45, 0.32, 0.18, 1] }); sprites.push({ x: x - 5, y: y - 5, w: 10, h: 1, tint: [0.7, 0.55, 0.25, 1] }); if (!T.open) { additive.push({ x: x - 1, y: y - 5, w: 2, h: 2, tint: [1, 0.85, 0.4, 1], emit: 1 }); } break;
      case 'npc': case 'shopkeeper': { // a small hooded figure with a hand lamp; shopkeepers stand behind a counter
        const hue = (d.npc || d.shop || T.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0), coat = [0.25 + (hue % 7) * 0.04, 0.2 + (hue % 5) * 0.03, 0.18 + (hue % 3) * 0.05, 1], bob = Math.sin(game.time * 2 + hue) * 0.4;
        sprites.push({ x: x - 3, y: y - 11 + bob, w: 6, h: 11 - bob, tint: coat }); sprites.push({ x: x - 2, y: y - 14 + bob, w: 4, h: 4, tint: [0.78, 0.66, 0.54, 1] }); sprites.push({ x: x - 3, y: y - 15 + bob, w: 6, h: 2, tint: [coat[0] * 0.7, coat[1] * 0.7, coat[2] * 0.7, 1] });
        additive.push({ x: x + 3, y: y - 8, w: 2, h: 2, tint: [1, 0.78, 0.42, 1], emit: 1.8 }); lights.push({ x: x + 4, y: y - 8, r: 34, color: [1, 0.75, 0.42], i: 0.8, shadow: false, flicker: 0.08 });
        if (T.t === 'shopkeeper') { sprites.push({ x: x - 9, y: y - 6, w: 18, h: 6, tint: [0.36, 0.26, 0.16, 1] }); sprites.push({ x: x - 9, y: y - 7, w: 18, h: 1, tint: [0.55, 0.42, 0.25, 1] }); }
        break; }
      case 'sign': sprites.push({ x: x - 5, y: y - 12, w: 10, h: 6, tint: [0.35, 0.26, 0.18, 1] }); sprites.push({ x: x - 1, y: y - 6, w: 2, h: 6, tint: [0.3, 0.22, 0.15, 1] }); break;
      case 'spark_coil': { sprites.push({ x: x - 3, y: y - 12, w: 2, h: 12, tint: [0.4, 0.42, 0.48, 1] }); sprites.push({ x: x + 1, y: y - 12, w: 2, h: 12, tint: [0.4, 0.42, 0.48, 1] }); if (T.charge > 0) for (let k = 0; k < 3; k++) additive.push({ x: x - 1 + Math.random() * 2, y: y - 11 + Math.random() * 10, w: 1, h: 1, tint: [1, 0.95, 0.5, 1], emit: 2 }); for (let k = 0; k < 5; k++) sprites.push({ x: x - 3 + k * 1.4, y: y - 14, w: 1, h: 1, tint: k < T.charge ? [1, 0.95, 0.5, 1] : [0.2, 0.2, 0.2, 1] }); break; }
      case 'bell': { const sw = T.ring > 0 ? Math.sin(game.time * 20) * 2 * T.ring : 0; const r = (d.size || 16) / 2; for (let k = 0; k < r * 2; k++) sprites.push({ x: x - r + k * 0.5 + sw, y: y - r * 2 + k, w: r * 2 - k, h: 1, tint: [0.62, 0.48, 0.24, 1] }); break; }
      case 'trap_spikes': for (let k = 0; k < d.rect[2]; k += 3) { sprites.push({ x: d.rect[0] + k + 1, y: d.rect[1] + d.rect[3] - 5, w: 1, h: 4, tint: [0.8, 0.8, 0.75, 1] }); additive.push({ x: d.rect[0] + k + 1, y: d.rect[1] + d.rect[3] - 6, w: 1, h: 1, tint: [1, 0.95, 0.85, 0.8], emit: 1 }); } break;
      case 'trap_icicle': if (T.state === 'hanging' || T.state === 'shaking' || T.state === 'falling') { const yy = T.state === 'falling' ? T.fy : y, sh = T.state === 'shaking' ? Math.sin(game.time * 60) : 0; for (let k = 0; k < 10; k++) sprites.push({ x: x - 2 + k * 0.2 + sh, y: yy + k, w: Math.max(1, 4 - k * 0.4), h: 1, tint: d.mat === 'stone' ? [0.4, 0.42, 0.48, 1] : [0.65, 0.8, 0.92, 1] }); if (T.state === 'shaking') additive.push({ x: x - 2, y: y - 1, w: 4, h: 1, tint: [1, 1, 1, 0.8], emit: 1 }); } break;
      case 'trap_flamejet': sprites.push({ x: x - 3, y: y - 6, w: 6, h: 6, tint: [0.3, 0.3, 0.32, 1] }); additive.push({ x: x - 1, y: y - 8, w: 2, h: 2, tint: T.warn ? [1, 1, 0.6, 1] : [1, 0.6, 0.2, 1], emit: 2 }); lights.push({ x, y: y - 7, r: T.firing ? 60 : 12, color: [1, 0.55, 0.2], i: T.firing ? 1.4 : 0.5, shadow: false, flicker: 0.2 }); break;
      case 'trap_crusher': { const [x0, y0, w, hh] = d.rect; const f = T.down ? 1 : 0.2; sprites.push({ x: x0, y: y0, w, h: hh * f, tint: [0.35, 0.33, 0.33, 1] }); if (T.warn) additive.push({ x: x0 + w / 2 - 1, y: y0 - 3, w: 2, h: 2, tint: [1, 0.2, 0.15, 1], emit: 2 }); break; }
      case 'trap_darts': case 'trap_waxdrip': additive.push({ x: x - 1, y: y - 1, w: 2, h: 2, tint: T.warn ? [1, 0.9, 0.5, 1] : [0.6, 0.5, 0.35, 1], emit: 0.8 }); break;
    }
  }
}
