// Ruler powers, faith and world disasters (M9). PURE, a sim system: { id, step, order, view }.
//
// Owner (2026-11-03): ruler powers — Call Rain, Lightning Strike, Frost Nova, Meteor, Tornado,
// Black Hole, Earthquake, Firestorm — each small / medium / large, the cost growing with the size.
// Play-test 2 (2026-11-04): Smite became Lightning Strike (bolts that chain between enemies) and
// Frost Nova was added; there are NO cooldowns any more (a power only costs faith); the meteor is a
// Kindlewild-sized one with a fall you can watch, a warning ring and sound; world disasters no
// longer start fires on their own (no lightning or forest fires). They are
// disasters in the cell sim, so they work on anything: a fire, a forest, an enemy camp, your own
// town. Paid in FAITH: churches x the content people living within their reach, up to a cap that
// churches (most of all cathedrals) raise. World disasters also come on their own: Off / Rare /
// Normal / Frequent (the new-world setting `disasters`; Off means none, ever).
//
// Every number is in data/buildings-faith.json (`powers`, `disasters`, `faith`, and `faith` on the
// chapel / church / cathedral kinds). The physics is the shared blast + debris modules
// (js/sim/blast.js, js/sim/particles.js), which later milestones reuse.
//
// State (sim.state.powers, plain JSON, saved): faith, `cool` (unused since play-test 2, kept for old saves), the effects still
// running (`active`: rain clouds, tornadoes, black holes, quakes, firestorms, meteors on their way),
// and counts. Orders:
//   { t: 'power', id, size: 'small'|'medium'|'large', x, y }  → { ok, id } or { error }
//   { t: 'power.faith', n }                                    → set faith (test and dev tool)
//   { t: 'disaster', kind, x, y }                              → start a world disaster now (tests, dev)
//
// Same seed + same orders = same world: every random number comes from sim.rng.

import { debrisOf, P } from './particles.js';
import { blastOf } from './blast.js';
import { BURN, WET, STILL } from './cells.js';

export const SIZES = ['small', 'medium', 'large'];
const TAU = Math.PI * 2;

export function createPowers(sim, data) {
  const { M } = sim;
  const ID = M.id;
  const PW = data.powers || {};
  const DIS = data.disasters || { perDay: {}, kinds: {} };
  const FC = data.faith || { baseCap: 50, startFaith: 0 };
  const KINDS = data.kinds;
  const S = sim.state.powers ??= { faith: FC.startFaith ?? 0, cool: {}, active: [], nextId: 1, cast: 0, natural: 0, byKind: {}, devCap: 0 };
  const D = debrisOf(sim), B = blastOf(sim);
  const W = sim.W, H = sim.H;
  const rng = () => sim.rng();
  const SEC = 20;
  const fx = [];                 // short-lived drawings for the page (bolts, flashes): not saved
  let fxId = 1, faithView = { cap: FC.baseCap, rate: 0, churches: 0 };

  const on = () => sim.settings?.powers !== false;
  const wrapX = x => ((x % W) + W) % W;
  const dist = (ax, ay, bx, by) => { let dx = Math.abs(ax - bx); if (dx > W / 2) dx = W - dx; return Math.hypot(dx, ay - by); };
  const say = (text, x, y, kind = 'bad') => sim.events.push({ t: 'say', text, kind, x, y });
  const addFx = (k, x, y, extra = {}) => fx.push({ id: fxId++, k, x, y, at: sim.tick, ...extra });
  const mark = D.mark;
  const isRoad = (c, i) => M.flag.road[c.ground[i]] || (c.mat[i] && M.flag.road[c.mat[i]]);
  /** A random point in a circle (uniform). */
  const inCircle = (x, y, r) => { const a = rng() * TAU, d = Math.sqrt(rng()) * r; return [x + Math.cos(a) * d, y + Math.sin(a) * d, d]; };
  const town = () => sim.state.town;

  // ------------------------------------------------------------------ faith
  /** Faith per minute and the cap, from churches and the content people in their reach. */
  function faithTick() {
    const T = town();
    const churches = (T?.buildings || []).filter(b => b.state === 'up' && KINDS[b.kind]?.faith);
    let cap = (FC.baseCap ?? 50) + (S.devCap || 0), rate = 0;
    for (const b of churches) cap += KINDS[b.kind].faith.cap || 0;
    if (churches.length) {
      for (const p of T.people) {
        // a person counts once, for the best church that reaches them; mood 0..1 weighs them
        let best = 0;
        for (const b of churches) {
          const f = KINDS[b.kind].faith;
          if (f.rate > best && dist(p.x, p.y, b.x + b.w / 2, b.y + b.h / 2) <= f.reach) best = f.rate;
        }
        if (best) rate += best * (typeof p.mood === 'number' ? Math.max(0, Math.min(1, p.mood)) : 1);
      }
    }
    rate *= sim.settings?.faithRate ?? 1;
    faithView = { cap, rate, churches: churches.length };
    if (S.faith < cap) S.faith = Math.min(cap, S.faith + rate / 60);
    else if (S.faith > cap && !S.devCap) S.faith = cap;       // a church was lost: the cap came down
  }

  // ------------------------------------------------------------------ casting
  function cast(o) {
    if (!on()) return { error: 'Ruler powers are off in this world.' };
    if (o.id === 'smite') o = { ...o, id: 'lightning' };        // the old name (play-test 1 saves, old buttons)
    const p = PW[o.id]; if (!p) return { error: 'No such power.' };
    if (sim.unlocked?.('power:' + o.id) === false) return { error: 'Your kingdom does not know how to make that yet.' };
    const s = Math.max(0, SIZES.indexOf(o.size ?? 'small'));
    const y = Math.floor(o.y), x = wrapX(Math.floor(o.x));
    if (!(y >= 0 && y < H)) return { error: 'That is off the edge of the world.' };
    const cost = p.cost[s];
    if (S.faith < cost) return { error: `Not enough faith: ${p.name} (${SIZES[s]}) needs ${cost}.` };
    S.faith -= cost;
    S.cast++;
    const a = start(o.id, s, x + 0.5, y + 0.5, false);
    return { ok: true, id: a?.id ?? 0, x, y };
  }

  /** Start one power (or a natural disaster) at a point. Returns its running effect, if it has one. */
  function start(k, s, x, y, natural) {
    const p = PW[k];
    const base = { id: S.nextId++, k, s, x, y, born: sim.tick, natural };
    let a = null;
    if (k === 'rain') {
      a = { ...base, r: p.r[s], until: sim.tick + p.secs[s] * SEC, dry: sim.tick + (p.secs[s] + (p.wetSecs ?? 60)) * SEC };
    } else if (k === 'lightning' || k === 'smite') {
      // bolts one after another (the first on the spot), then the shock jumps from enemy to enemy
      const L = PW.lightning;
      a = { ...base, k: 'lightning', r: L.r[s], left: L.bolts[s], next: sim.tick, hit: false };
    } else if (k === 'frost') {
      a = { ...base, r: p.r[s], until: sim.tick + (p.thaw ?? 90) * SEC, cells: [] };
      frostNova(a, p);
    } else if (k === 'meteor') {
      // it comes in from high up and off to the east, at an angle, over `fall` ticks (Kindlewild's
      // meteor: a warning ring on the ground, a fireball with a spark trail, then the blast)
      const fall = p.fall ?? 50, z0 = 80;
      a = { ...base, r: p.r[s], hit: sim.tick + fall, fall, fx: x + z0 * 0.55, fy: y - z0 * 0.18, z0 };
      sim.events.push({ t: 'sfx', id: 'meteor.fall', x, y });
    } else if (k === 'tornado') {
      a = { ...base, r: p.r[s], h: rng() * TAU, until: sim.tick + p.secs[s] * SEC, picked: 0 };
    } else if (k === 'blackhole') {
      a = { ...base, r: p.r[s], core: p.core[s], until: sim.tick + p.secs[s] * SEC, ate: 0 };
    } else if (k === 'earthquake') {
      a = { ...base, r: p.r[s], until: sim.tick + p.secs[s] * SEC };
      for (let n = 0; n < p.cracks[s]; n++) crack(a, p);
    } else if (k === 'firestorm') {
      a = { ...base, r: p.r[s], until: sim.tick + p.secs[s] * SEC };
    }
    if (a) S.active.push(a);
    return a;
  }

  // ------------------------------------------------------------------ the effects, tick by tick
  function stepRain(a) {
    const t = sim.tick;
    if (t >= a.until) {
      if (t < a.dry) return true;
      // the ground has dried: clear the soaking
      const R = Math.ceil(a.r);
      for (let yy = Math.floor(a.y) - R; yy <= Math.floor(a.y) + R; yy++) for (let xx = Math.floor(a.x) - R; xx <= Math.floor(a.x) + R; xx++) {
        if ((xx + 0.5 - a.x) ** 2 + (yy + 0.5 - a.y) ** 2 > a.r * a.r) continue;
        const at = sim.cell(xx, yy); if (at && at.c.flag[at.i] & WET) { at.c.flag[at.i] &= ~WET; sim.store.markEdited(at.c); }
      }
      return false;
    }
    const n = Math.ceil(a.r * a.r * 0.1);
    for (let k = 0; k < n; k++) {
      const [px, py] = inCircle(a.x, a.y, a.r);
      const at = sim.cell(px, py); if (!at) continue;
      const { c, i } = at;
      const m = c.mat[i];
      let seen = false;
      if (c.flag[i] & BURN) { c.flag[i] &= ~BURN; if (m === ID.fire) { c.mat[i] = 0; c.tall[i] = 0; } seen = true; }
      if (m === ID.fire && !(c.flag[i] & BURN)) { c.mat[i] = 0; c.tall[i] = 0; seen = true; }
      if (m === ID.lava && rng() < 0.03) { sim.rules.setCell(c, i, ID.crust); seen = true; }
      if (c.temp[i] > M.ambient + 10) c.temp[i] = Math.max(M.ambient, c.temp[i] - 40);
      c.flag[i] |= WET;
      // soaking the ground changes nothing the page draws, so only a put-out fire marks it for redraw
      if (seen) mark(c); else { sim.store.markEdited(c); if (c.temp[i] > M.ambient) sim.wake(c); }
    }
    return true;
  }

  /** Where a falling meteor is now: ground point + height. Old saves lack fx/fy: same path. */
  function meteorAt(a, tick = sim.tick) {
    const fall = a.fall ?? 30, z0 = a.z0 ?? 110;
    const fx = a.fx ?? a.x + z0 * 0.55, fy = a.fy ?? a.y - z0 * 0.18;
    const t = Math.max(0, Math.min(1, 1 - (a.hit - tick) / fall));
    const e = t * t * 0.35 + t * 0.65;                       // it speeds up as it falls
    return { x: fx + (a.x - fx) * e, y: fy + (a.y - fy) * e, z: z0 * (1 - e), t };
  }
  function stepMeteor(a) {
    const p = PW.meteor, s = a.s;
    if (sim.tick < a.hit) {
      // the trail: glowing sparks and cinders shed along the path, so it streaks in for real
      const m = meteorAt(a), size = 1 + s;
      for (let k = 0; k < 3 + size * 2; k++) D.spawn({ kind: P.spark, x: m.x + (rng() - 0.5) * size, y: m.y + (rng() - 0.5) * size * 0.6, z: m.z + (rng() - 0.5) * size, vx: (rng() - 0.5) * 0.05, vy: (rng() - 0.5) * 0.05, vz: 0, grav: 0, life: 14 + size * 4 + ((rng() * 8) | 0), rgb: rng() < 0.5 ? [255, 210, 110] : [255, 120, 40], glow: 1.2 });
      if (rng() < 0.5 + s * 0.2) D.spawn({ kind: P.dust, x: m.x, y: m.y, z: m.z + 1, vx: (rng() - 0.5) * 0.04, vy: (rng() - 0.5) * 0.04, vz: 0.01, grav: -0.002, life: 40, rgb: [70, 60, 55] });
      return true;
    }
    B.blast(a.x, a.y, a.r, p.power[s], { crater: p.crater[s], fire: true, debris: 0.4, throwScale: 1.5, heat: 1.3, by: 'meteor' });
    lavaPool(a.x, a.y, Math.max(1.5, a.r * (p.lava ?? 0.3)));
    // a glowing core of molten rock in the middle
    for (let k = 0; k < a.r * 2; k++) {
      const [px, py] = inCircle(a.x, a.y, a.r * 0.3);
      const at = sim.cell(px, py); if (!at || at.c.mat[at.i]) continue;
      sim.rules.setCell(at.c, at.i, rng() < 0.6 ? ID.crust : ID.lava, 6); at.c.temp[at.i] = 240; mark(at.c);
    }
    // burning chunks of the rock itself, thrown far
    for (let k = 0; k < 10 + s * 14; k++) {
      const ang = rng() * TAU, sp = 0.4 + rng() * (0.6 + s * 0.3);
      D.spawn({ kind: P.debris, mat: ID.rubble, x: a.x, y: a.y, z: 1, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 0.9 + rng() * (0.9 + s * 0.3), grav: 0.05, life: 300, rgb: [255, 120, 40], glow: 1 });
    }
    // a fountain of embers
    D.burst(rng, a.x, a.y, Math.min(160, Math.round(a.r * 4)), { kind: P.cinder, speed: 0.9 + s * 0.3, up: 1.6, grav: 0.04, life: 90, palette: [[255, 200, 80], [255, 120, 30], [255, 80, 20]], glow: 1.2, spread: 2 });
    D.burst(rng, a.x, a.y, Math.min(120, Math.round(a.r * 3)), { kind: P.dust, speed: 0.5 + s * 0.15, up: 0.5, grav: 0.008, life: 140, palette: [[110, 100, 92], [80, 74, 70]], spread: a.r * 0.6 });
    addFx('flash', a.x, a.y, { r: a.r * 3, rgb: [255, 170, 80] });
    addFx('shake', a.x, a.y, { mag: 1 + s, r: a.r });
    addFx('sky', a.x, a.y, { mag: 0.35 + s * 0.15 });
    sim.events.push({ t: 'sfx', id: 'explosion.large', x: a.x, y: a.y, big: true });
    return false;
  }

  // ------------------------------------------------------------------ lightning + frost (play-test 2)
  const enemies = () => (sim.state.military?.units || []).filter(u => u.side === 'enemy' && u.hp > 0);
  function hitUnit(u, dmg, kind, freeze) {
    const hits = sim.military?.strike?.(u.x, u.y, 1.2, dmg, { kind, freeze });
    if (!hits) { u.hp -= dmg; if (freeze) u.frozen = Math.max(u.frozen || 0, freeze); }
  }
  function stepLightning(a) {
    if (sim.tick < a.next) return true;
    const L = PW.lightning, s = a.s;
    let x = a.x, y = a.y;
    if (a.hit) { const [px, py] = inCircle(a.x, a.y, L.spread[s] || 0); x = px; y = py; }
    B.lightning(x, y, L.power[s], L.r[s]);
    addFx('bolt', x, y, { r: L.r[s] });
    sim.events.push({ t: 'sfx', id: 'thunder', x, y });
    if (!a.hit) {
      // the shock jumps between enemies near the spot: each hop a jagged arc and a hit
      a.hit = true;
      const hit = new Set(); let from = { x, y };
      for (let k = 0; k < L.chain[s]; k++) {
        let best = null, bd = k ? L.reach[s] * 0.6 : L.reach[s];
        for (const u of enemies()) { if (hit.has(u)) continue; const d = dist(from.x, from.y, u.x, u.y); if (d < bd) { bd = d; best = u; } }
        if (!best) break;
        hit.add(best);
        addFx('arc', from.x, from.y - (k ? 1 : 0), { x2: best.x, y2: best.y - 1 });
        hitUnit(best, L.dmg[s] * (1 - k * 0.06), 'lightning');
        from = { x: best.x, y: best.y };
      }
      a.chained = hit.size;
    }
    a.left--; a.next = sim.tick + 4 + ((rng() * 4) | 0);
    return a.left > 0;
  }
  /** Freeze everything in a circle. What changed is listed on the effect so it thaws back later. */
  function frostNova(a, p) {
    const s = a.s, R = Math.ceil(a.r);
    const snowable = new Set([ID.grass, ID.meadow, ID.dirt, ID.moorgrass, ID.farmland, ID.scorched].filter(v => v != null));
    for (let yy = Math.floor(a.y) - R; yy <= Math.floor(a.y) + R; yy++) for (let xx = Math.floor(a.x) - R; xx <= Math.floor(a.x) + R; xx++) {
      const d2 = (xx + 0.5 - a.x) ** 2 + (yy + 0.5 - a.y) ** 2; if (d2 > a.r * a.r) continue;
      const at = sim.cell(xx, yy); if (!at) continue;
      const { c, i } = at, m = c.mat[i];
      let changed = false;
      if (c.flag[i] & BURN) { c.flag[i] &= ~BURN; changed = true; }
      if (m === ID.fire) { c.mat[i] = 0; c.tall[i] = 0; changed = true; }
      else if (m === ID.water) { c.mat[i] = ID.ice; a.cells.push(xx, yy, 1); changed = true; }
      else if (m === ID.lava) { const to = rng() < 0.5 ? ID.obsidian : ID.crust; c.mat[i] = to; c.tall[i] = to === ID.obsidian ? Math.min(1, M.tall[to] || 0) : 0; c.life[i] = 0; changed = true; }
      if (!c.mat[i] && snowable.has(c.ground[i]) && !c.part[i] && !isRoad(c, i) && rng() < 0.75 && a.cells.length < 9000) { a.cells.push(xx, yy, 100 + c.ground[i]); c.ground[i] = ID.snow; changed = true; }
      c.temp[i] = Math.min(c.temp[i], 4);
      c.flag[i] |= WET;
      if (changed) mark(c); else sim.store.markEdited(c);
      sim.wake(c);
    }
    // the cold bites: enemies inside freeze in place for a few seconds; fiery ones take more
    for (const u of enemies()) {
      if (dist(a.x, a.y, u.x, u.y) > a.r) continue;
      const fiery = sim.data.monsters?.[u.kind]?.fire || u.kind === 'drake';
      hitUnit(u, p.dmg[s] * (fiery ? 3 : 1), 'frost', Math.round(p.freeze[s] * SEC));
    }
    D.burst(rng, a.x, a.y, Math.min(140, Math.round(a.r * 5)), { kind: P.spark, speed: 0.35 + a.r * 0.04, life: 26, palette: [[200, 245, 255], [140, 220, 255], [255, 255, 255]], glow: 0.9, spread: 1 });
    addFx('nova', a.x, a.y, { r: a.r });
    sim.events.push({ t: 'sfx', id: 'spell.ice.impact', x: a.x, y: a.y });
  }
  function stepFrost(a) {
    if (sim.tick < a.until) return true;
    // the thaw: ice back to water, snow back to the ground it was (one pass; a few may stay if built over)
    const L = a.cells || [];
    for (let k = 0; k < L.length; k += 3) {
      const at = sim.cell(L[k], L[k + 1]); if (!at) continue;
      const { c, i } = at;
      if (L[k + 2] === 1) { if (c.mat[i] === ID.ice) c.mat[i] = ID.water; }
      else if (c.ground[i] === ID.snow) c.ground[i] = L[k + 2] - 100;
      mark(c);
    }
    return false;
  }

  /** Lava in a circle (not on roads or in water): what a meteor or a falling fire stone leaves. */
  function lavaPool(x, y, r) {
    const R = Math.ceil(r);
    for (let yy = Math.floor(y) - R; yy <= Math.floor(y) + R; yy++) for (let xx = Math.floor(x) - R; xx <= Math.floor(x) + R; xx++) {
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > r * r) continue;
      const at = sim.cell(xx, yy); if (!at) continue;
      const { c, i } = at;
      if (isRoad(c, i) || M.liquid[c.mat[i]] || c.part[i]) continue;
      if (c.mat[i] && M.hard[c.mat[i]] >= 200) continue;
      sim.rules.setCell(c, i, ID.lava, 5 + Math.floor(rng() * 4));
      c.temp[i] = 240; mark(c);
    }
  }

  function stepTornado(a) {
    if (sim.tick >= a.until) return false;
    const p = PW.tornado, s = a.s;
    // it wanders, leaning with the wind
    const wa = Math.atan2(sim.wind.y, sim.wind.x);
    let dh = Math.atan2(Math.sin(wa - a.h), Math.cos(wa - a.h));
    a.h += (rng() - 0.5) * 0.2 + dh * 0.01;
    a.x = wrapX(a.x + Math.cos(a.h) * p.speed[s]);
    a.y += Math.sin(a.h) * p.speed[s];
    if (a.y < 12 || a.y > H - 12) { a.h = -a.h; a.y = Math.max(12, Math.min(H - 12, a.y)); }
    // tear up what it passes over and fling the pieces round
    const n = Math.ceil(a.r * a.r * 0.5);
    for (let k = 0; k < n; k++) {
      const [px, py, d] = inCircle(a.x, a.y, a.r);
      if (rng() > 0.3) continue;
      const f = 1 - d / a.r, push = p.power[s] * f * 70 + 10;
      let dx = px - a.x, dy = py - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const m = B.breakCell(Math.floor(px), Math.floor(py), { push, fling: { vx: -dy * 0.45 + dx * 0.05, vy: dx * 0.45 + dy * 0.05, vz: 0.5 + rng() * 0.5, grav: 0.03, z: 1 } });
      if (m) a.picked++;
      else if (rng() < 0.04) {
        const at = sim.cell(px, py);
        if (at && !at.c.mat[at.i] && (at.c.ground[at.i] === ID.grass || at.c.ground[at.i] === ID.meadow)) { at.c.ground[at.i] = ID.dirt; mark(at.c); }   // a scoured track
      }
    }
    D.pull(a.x, a.y, a.r * 3.5, 0.05, { swirl: 1.6, lift: 0.045 });
    if (rng() < 0.4) D.burst(rng, a.x, a.y, 2, { kind: P.dust, speed: 0.3, up: 0.6, grav: 0.01, life: 50, palette: [[150, 140, 125], [120, 112, 100]], spread: a.r });
    return true;
  }

  function stepBlackHole(a) {
    const p = PW.blackhole, s = a.s;
    if (sim.tick >= a.until) {
      // it collapses with a bang
      B.blast(a.x, a.y, a.core * 2.6, p.power[s] * 0.8, { debris: 0.15, fire: false, scorch: false, by: 'blackhole' });
      addFx('flash', a.x, a.y, { r: a.r * 2, rgb: [170, 110, 255] });
      return false;
    }
    const grow = Math.min(2, (sim.tick - a.born) / 60);     // it pulls harder the longer it lasts
    const n = Math.ceil(a.r * a.r * 0.15);
    for (let k = 0; k < n; k++) {
      const [px, py, d] = inCircle(a.x, a.y, a.r);
      const xx = Math.floor(px), yy = Math.floor(py);
      const at = sim.cell(xx, yy); if (!at) continue;
      const { c, i } = at;
      const m = c.mat[i];
      if (d < a.core) {
        // the middle: everything is gone, the ground scarred
        if (m && M.liquid[m]) { if (!(c.flag[i] & STILL)) { c.mat[i] = 0; c.life[i] = 0; mark(c); a.ate++; } continue; }
        else if (m && B.breakCell(xx, yy, { push: 999 })) a.ate++;
        if (!isRoad(c, i) && c.ground[i] !== ID.fissure) { c.ground[i] = ID.fissure; c.height[i] = Math.max(1, c.height[i] - 2); mark(c); }
        continue;
      }
      const f = 1 - d / a.r;
      if (!m || rng() > f * Math.min(1, grow) * 0.6) continue;
      const rgb = [M.r[m], M.g[m], M.b[m]];
      if (M.liquid[m]) {
        // a sea or river is too big to drink: spray lifts off it; a pool or lava is drained
        if (!(c.flag[i] & STILL)) { c.life[i] = Math.max(0, c.life[i] - 2); if (!c.life[i]) c.mat[i] = 0; mark(c); }
      } else if (!B.breakCell(xx, yy, { push: p.power[s] * f * 100 * grow + 20 })) continue;
      a.ate++;
      D.spawn({ kind: P.sucked, x: px, y: py, z: 1, tx: a.x, ty: a.y, life: 200, rgb, glow: m === ID.lava ? 1 : 0 });
    }
    a.ate += D.pull(a.x, a.y, a.r * 1.6, 0.09, { swirl: 0.9, eat: a.core });
    return true;
  }

  /** One crack from near the middle of a quake outwards: the ground splits, what stood there falls. */
  function crack(a, p) {
    let [x, y] = inCircle(a.x, a.y, a.r * 0.25);
    let h = rng() * TAU;
    const len = a.r * (0.5 + rng() * 0.5), wide = a.s === 2 ? 2 : 1;
    for (let k = 0; k < len; k++) {
      x += Math.cos(h); y += Math.sin(h); h += (rng() - 0.5) * 0.6;
      for (let w = 0; w < wide; w++) {
        const xx = Math.floor(x - Math.sin(h) * w), yy = Math.floor(y + Math.cos(h) * w);
        const at = sim.cell(xx, yy); if (!at) continue;
        const { c, i } = at;
        if (isRoad(c, i) || M.liquid[c.mat[i]] || !M.walk[c.ground[i]]) continue;
        B.breakCell(xx, yy, { push: 999, fling: { vx: (rng() - 0.5) * 0.2, vy: (rng() - 0.5) * 0.2, vz: 0.4 } });
        c.ground[i] = ID.fissure; c.height[i] = Math.max(1, c.height[i] - 3);
        mark(c);
      }
      if (k % 4 === 0) D.burst(rng, x, y, 2, { kind: P.dust, speed: 0.2, up: 0.5, grav: 0.01, life: 60, palette: [[130, 118, 100]] });
    }
  }

  function stepQuake(a) {
    if (sim.tick >= a.until) return false;
    const p = PW.earthquake, s = a.s;
    const n = Math.ceil(a.r * a.r * 0.06);
    for (let k = 0; k < n; k++) {
      const [px, py, d] = inCircle(a.x, a.y, a.r);
      const xx = Math.floor(px), yy = Math.floor(py);
      const at = sim.cell(xx, yy); if (!at) continue;
      const { c, i } = at;
      const m = c.mat[i];
      if (!m || c.tall[i] < 2 || M.liquid[m] || isRoad(c, i)) continue;
      // tall things shake apart: the nearer the middle, the harder
      const hit = Math.round(p.hit[s] * (1.5 - d / a.r) * (0.5 + rng()));
      c.hp[i] = Math.max(0, c.hp[i] - hit);
      if (c.hp[i] === 0) { B.breakCell(xx, yy, { push: 999 }); continue; }
      if (c.tall[i] >= 3 && rng() < 0.3) {
        // the top cracks off and falls straight down
        const drop = 1 + Math.floor(rng() * 2);
        c.tall[i] = Math.max(1, c.tall[i] - drop);
        D.spawn({ kind: P.debris, mat: ID.rubble, x: xx + 0.5 + (rng() - 0.5) * 2, y: yy + 0.5 + (rng() - 0.5) * 1.5, z: c.tall[i] + drop, vz: 0, grav: 0.04, life: 400, rgb: [M.r[m], M.g[m], M.b[m]] });
        mark(c);
      }
    }
    if (rng() < 0.5) { const [px, py] = inCircle(a.x, a.y, a.r); D.burst(rng, px, py, 3, { kind: P.dust, speed: 0.2, up: 0.4, grav: 0.01, life: 50, palette: [[140, 128, 110], [110, 100, 88]] }); }
    return true;
  }

  function stepFirestorm(a) {
    if (sim.tick >= a.until) return false;
    const p = PW.firestorm, s = a.s;
    if (rng() < p.rate[s]) {
      const [tx, ty] = inCircle(a.x, a.y, a.r);
      const z = 18 + rng() * 6, fall = 26;
      const vx = sim.wind.x * 0.12, vy = sim.wind.y * 0.06;
      D.spawn({ kind: P.fireball, x: tx - vx * fall, y: ty - vy * fall, z, vx, vy, vz: -z / fall + 0.01 * fall / 2, grav: 0.01, life: 200, rgb: [255, 150, 50], glow: 1, tag: a.id });
    }
    // the air over it is hot
    for (let k = 0; k < 3; k++) { const [px, py] = inCircle(a.x, a.y, a.r); const at = sim.cell(px, py); if (at) { at.c.temp[at.i] = Math.min(255, at.c.temp[at.i] + 25); sim.wake(at.c); } }
    return true;
  }

  // fire balls from a firestorm burst where they land, sometimes leaving lava
  D.landers.push((i, x, y) => {
    B.blast(x + 0.5, y + 0.5, 1.8, 1.3, { fire: true, debris: 0.12, heat: 1.3, quiet: true, by: 'firestorm' });
    D.burst(rng, x + 0.5, y + 0.5, 8, { kind: P.cinder, speed: 0.35, up: 0.6, grav: 0.035, life: 40, palette: [[255, 170, 50], [255, 100, 20]], glow: 1 });
    if (rng() < (PW.firestorm?.lava ?? 0.25)) lavaPool(x + 0.5, y + 0.5, 1.3);
    return true;
  });

  const STEP = { rain: stepRain, lightning: stepLightning, smite: stepLightning, frost: stepFrost, meteor: stepMeteor, tornado: stepTornado, blackhole: stepBlackHole, earthquake: stepQuake, firestorm: stepFirestorm };

  // ------------------------------------------------------------------ world disasters
  function disasters() {
    const level = sim.settings?.disasters ?? 'off';
    const per = DIS.perDay?.[level] || 0;
    if (!per) return;
    if (sim.tick < (DIS.graceDays ?? 0) * sim.dayTicks) return;
    const towns = town()?.towns || [];
    if (!towns.length) return;
    // checked once a second: per-day rate → chance this second
    if (rng() >= per / (sim.dayTicks / SEC)) return;
    const list = Object.entries(DIS.kinds).filter(([k]) => !k.startsWith('_'));
    let w = rng() * list.reduce((n, [, d]) => n + d.weight, 0), kind = list[0][0];
    for (const [k, d] of list) { w -= d.weight; if (w <= 0) { kind = k; break; } }
    const t = towns[Math.floor(rng() * towns.length)];
    const [lo, hi] = DIS.near || [50, 260];
    const ang = rng() * TAU, d = lo + rng() * (hi - lo);
    natural(kind, wrapX(t.x + Math.cos(ang) * d), Math.max(16, Math.min(H - 16, t.y + Math.sin(ang) * d)), t);
  }

  /** A world disaster of `kind` near (x, y). Returns true if it happened. */
  function natural(kind, x, y, t) {
    const d = DIS.kinds[kind]; if (!d) return false;
    let at = [x, y];
    if (kind === 'lightning' || kind === 'forestfire') {
      // lightning finds something dry that will burn: forest first, then grass
      at = null;
      for (let k = 0; k < 40 && !at; k++) {
        const [px, py] = inCircle(x, y, 40);
        const c = sim.cell(px, py); if (!c) continue;
        const m = c.c.mat[c.i], g = c.c.ground[c.i];
        if (c.c.flag[c.i] & WET || c.c.part[c.i]) continue;
        if ((m && M.tree[m]) || (k > 25 && ((m && M.ignite[m]) || (!m && M.ignite[g])))) at = [Math.floor(px) + 0.5, Math.floor(py) + 0.5];
      }
      if (!at) return false;
      if (kind === 'lightning') { B.lightning(at[0], at[1], 1.2, 2); addFx('bolt', at[0], at[1], { r: 2 }); }
      else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = sim.cell(at[0] + dx, at[1] + dy); if (c) { c.c.temp[c.i] = 255; sim.rules.ignite(c.c, c.i); mark(c.c); } }
    } else start(kind, d.size ?? 1, x, y, true);
    S.natural++;
    S.byKind[kind] = (S.byKind[kind] || 0) + 1;
    say(d.say.replace('{town}', t?.name || 'your land'), Math.round(at[0]), Math.round(at[1]));
    return true;
  }

  // ------------------------------------------------------------------ the system
  function step() {
    D.step();
    if (sim.tick % SEC === 0) { faithTick(); disasters(); }
    if (S.active.length) S.active = S.active.filter(a => STEP[a.k](a));
    if (fx.length && sim.tick - fx[0].at > 40) { while (fx.length && sim.tick - fx[0].at > 40) fx.shift(); }
  }

  function order(o) {
    if (o.t === 'power') {
      const r = cast(o);
      // using a power on a rival's land sours them (owner); rain is harmless
      if (r && !r.error && o.id !== 'rain') { const rv = sim.rivals?.ownerAt(o.x, o.y); if (rv) sim.rivals.shift(rv.id, -25, 'you struck their land'); }
      return r;
    }
    if (o.t === 'power.faith') { S.faith = o.n; S.devCap = Math.max(0, o.n - (faithView.cap - (S.devCap || 0))); return { ok: true }; }
    if (o.t === 'disaster') return natural(o.kind, o.x, o.y, { name: o.near || 'your land' }) ? { ok: true } : { error: 'Nothing happened.' };
    return null;
  }

  function view(rect) {
    const near = x => { if (!rect) return x; while (x < rect.x0 - 80) x += W; while (x > rect.x1 + 80) x -= W; return x; };
    return {
      on: on(), faith: Math.floor(S.faith), cap: faithView.cap, rate: +faithView.rate.toFixed(1), churches: faithView.churches,
      act: S.active.map(a => ({ id: a.id, k: a.k, x: +near(a.x).toFixed(1), y: +a.y.toFixed(1), r: a.r, core: a.core, s: a.s, age: sim.tick - a.born,
        left: Math.max(0, Math.ceil(((a.until ?? a.hit ?? sim.tick) - sim.tick) / SEC)), wet: a.k === 'rain' && sim.tick >= a.until ? 1 : 0,
        ...(a.k === 'meteor' ? { fall: a.fall ?? 30, z0: a.z0 ?? 110 } : {}) })),
      fx: fx.map(f => ({ ...f, x: near(f.x), ...(f.x2 != null ? { x2: near(f.x2) } : {}) })),
      ps: D.view(rect),
    };
  }

  return { id: 'powers', step, order, view, cast, start, natural, get state() { return S; }, faith: () => ({ faith: S.faith, ...faithView }) };
}
