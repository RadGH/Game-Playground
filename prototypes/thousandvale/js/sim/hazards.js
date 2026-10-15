// Thousandvale — VHARLEN'S HAZARDS on the server (Expansion 1 §4, items 1–3; stream S). Pure: no DOM, no Node APIs.
//
// The rules (numbers, timing, geometry) are js/rules/hazards.js; the sites are data/provinces/<province>-hazards.json
// (tools/content-hazards.mjs, read through js/sim/province-files.js as `L.hazards`). This file runs them for the players
// who are near one:
//
//   springs   once a second, per player: standing in a spring (and NOT fighting) -> rules.hazard(e, {kind:'soak'}) —
//             Steam-soaked, fast health and mana. Climbing out after SPRING.minSoakS -> {kind:'warm'}: Steam-warmed,
//             +5% maximum health for 10 minutes. A line in the chat on the way in and on the way out.
//   geysers   each site's cycle (cycleOf) on the realm clock. 2 s before an eruption: a `tele` circle (ab 'geyser') and
//             `fx {kind:'geyser', phase:'rumble'}`; at it: `teleR` + `fx {phase:'erupt'}`. A player on the mouth is thrown:
//             vy = GEYSER.launchVy, airborne, `glide` (js/sim/movement.js falls slowly while it lasts; the client predicts
//             it — the flag rides the self block). A monster on it: `fx {kind:'toss'}` + a little damage (never the last point).
//   vents     the same clock: a `tele` line (ab 'lava_vent', el fire) for VENT.warnMs — sent to everyone in view, ALWAYS —
//             then `teleR` + `fx {kind:'lavaVent', phase:'spout'}` + fire on every player and monster in the line
//             (ventDamage(zone band top)), and a second burn VENT.burnMs later on whoever is still standing in it.
//
// Only sites with a player within ACTIVE_M in the same room run at all (the events reach clients within 150 m anyway).
//
//   const hz = createHazards({ provinces: () => [{ key, L, rooms: [room…] }], online, now, rulesOf? })
//   hz.tick()           every server tick (the work is done every TICK_EVERY ticks)
//   hz.sitesFor(key)    the parsed sites of a province (tests)

import { STATE } from '../net/protocol.js';
import { SPRING, GEYSER, VENT, cycleOf, nextAt, inSpring, onGeyser, inVent, ventShape, ventDamage, ventBurn, geyserHurt } from '../rules/hazards.js';

export const ACTIVE_M = 160;          // a site runs while a player of its room is this close
export const TICK_EVERY = 2;          // 100 ms: timing to a tenth of a second is plenty for a 2 s warning
const SPRING_EVERY = 20;              // springs once a second (the soak is per second)
const BUCKET = 256;

/** The sites of one province's hazards file, ready to run (with their cycles and a bucket index). */
export function prepareSites(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const springs = (doc.springs || []).filter(s => Number.isFinite(s.x) && Number.isFinite(s.z) && s.r > 0);
  const geysers = (doc.geysers || []).filter(g => Number.isFinite(g.x) && Number.isFinite(g.z)).map(g => ({ ...g, kind: 'geyser', cycle: cycleOf(g.id, 'geyser'), cx: g.x, cz: g.z }));
  const vents = (doc.vents || []).filter(v => [v.ax, v.az, v.bx, v.bz].every(Number.isFinite)).map(v => ({ ...v, kind: 'vent', cycle: cycleOf(v.id, 'vent'), cx: (v.ax + v.bx) / 2, cz: (v.az + v.bz) / 2, shape: ventShape(v) }));
  const buckets = new Map();
  for (const s of [...geysers, ...vents]) { const k = Math.floor(s.cx / BUCKET) + ',' + Math.floor(s.cz / BUCKET); (buckets.get(k) || buckets.set(k, []).get(k)).push(s); }
  if (!springs.length && !geysers.length && !vents.length) return null;
  return { springs, geysers, vents, buckets };
}
/** Sites (geysers + vents) within `r` of (x, z). */
function sitesNear(S, x, z, r, out) {
  const c0x = Math.floor((x - r) / BUCKET), c1x = Math.floor((x + r) / BUCKET), c0z = Math.floor((z - r) / BUCKET), c1z = Math.floor((z + r) / BUCKET);
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const b = S.buckets.get(cx + ',' + cz); if (!b) continue;
    for (const s of b) if (Math.hypot(s.cx - x, s.cz - z) <= r) out.add(s);
  }
  return out;
}
/** Give an event the place it is delivered by without a serialised `x` (a `teleR`'s `x` means "cancelled"). */
const routed = (ev, x, z) => { Object.defineProperty(ev, '_at', { value: { x, z }, enumerable: false }); return ev; };

export function createHazards({ provinces, online, now, chat = null, log = () => {} }) {
  const prepared = new Map();          // province key -> prepared sites (or null)
  const live = new Map();              // `${room.id}|${site.id}` -> { site, room, warned: k, erupted: k, burnAt, seen }
  let n = 0;

  function sitesFor(key, L) {
    if (!prepared.has(key)) prepared.set(key, prepareSites(L && L.hazards));
    return prepared.get(key);
  }
  const say = (o, text) => { if (chat) chat(o, text); else if (o.conn) o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: 'Vharlen', text }); };

  /** One hazard touches a body: through the rules when they have `hazard`, else straight on the entity (the stand-in rules). */
  function touch(room, e, op) {
    const R = room.rules;
    if (R && typeof R.hazard === 'function') { try { return R.hazard(e, op); } catch (err) { log('hazard', err && err.message); return null; } }
    if (op.kind === 'hit' && !e.dead) {
      const left = Math.max(op.floor || 0, e.hp - Math.round(op.amount || 0));
      const dealt = e.hp - left; e.setHp(left);
      room.event({ type: 'hit', s: 0, d: e.id, n: dealt, kind: 'dmg', skill: op.skill || 'hazard', el: op.element });
      if (left <= 0) e.kill(null);
      return { amount: dealt, dead: left <= 0 };
    }
    if (op.kind === 'soak' && !e.dead) { e.setHp(Math.min(e.hpMax, e.hp + Math.round(e.hpMax * SPRING.healPerSecond))); return { ok: true }; }
    return null;
  }

  // ---- springs (per player, once a second) ----
  function springTick(o, S) {
    const e = o.entity;
    if (!e || e.dead || e.removed) { o.spring = null; return; }
    let here = null;
    for (const s of S.springs) if (inSpring(s, e.x, e.z)) { here = s; break; }
    const fighting = !!(e.state & STATE.combat);
    const t = now();
    if (here) {
      if (!o.spring || o.spring.id !== here.id) {
        o.spring = { id: here.id, since: t, soaked: 0, warned: false };
        if (!fighting) say(o, `You ease into ${here.name}. Steam-soaked: health and mana come back fast while you stay in.`);
      }
      if (fighting) {
        if (!o.spring.warned) { o.spring.warned = true; say(o, 'The spring cannot soothe you while you are fighting.'); }
        return;
      }
      o.spring.warned = false;
      const r = touch(o.room, e, { kind: 'soak' });
      if (r) o.spring.soaked += 1;
      return;
    }
    if (o.spring) {
      const was = o.spring; o.spring = null;
      if (was.soaked >= SPRING.minSoakS && !e.dead) {
        touch(o.room, e, { kind: 'warm' });
        o.room.emit({ type: 'fx', kind: 'spring', id: e.id, warmMs: SPRING.warmS * 1000, x: e.x, z: e.z });
        say(o, `You climb out warm through. Steam-warmed: +${Math.round(SPRING.warmHpPct * 100)}% maximum health for ${Math.round(SPRING.warmS / 60)} minutes.`);
      }
    }
  }

  // ---- geysers and vents (per active site and room) ----
  function runSite(rec, t) {
    const { site, room } = rec;
    const spec = site.kind === 'vent' ? VENT : GEYSER;
    const nx = nextAt(site.cycle, t);
    const prev = { k: nx.k - 1, at: nx.at - site.cycle.period };
    // an eruption that came due since the last look (and was warned): it goes off now
    for (const due of nx.at === t ? [nx] : [prev]) {
      if (due.at <= t && rec.erupted < due.k && rec.warned === due.k && t - due.at < 1000) { rec.erupted = due.k; erupt(rec, due.k, t); }
    }
    // the warning: from `at - warnMs`; a site that wakes mid-warning still warns if there is time to read it
    const left = nx.at - t;
    if (left > 0 && left <= spec.warnMs && rec.warned < nx.k && left >= 300) { rec.warned = nx.k; warn(rec, nx.k, left); }
    if (rec.burnAt && t >= rec.burnAt) { rec.burnAt = 0; burn(rec); }
  }
  const teleId = (site, k) => (site.kind === 'vent' ? 'lv:' : 'gy:') + site.id + ':' + k;
  function warn(rec, k, ms) {
    const { site, room } = rec;
    if (site.kind === 'geyser') {
      room.emit({ type: 'tele', id: teleId(site, k), ab: 'geyser', k: 'lift', ms, shape: 'circle', x: site.x, z: site.z, r: site.r || GEYSER.r, el: 'steam', hazard: 1 });
      room.emit({ type: 'fx', kind: 'geyser', site: site.id, phase: 'rumble', ms, x: site.x, z: site.z });
    } else {
      const sh = site.shape;
      room.emit({ type: 'tele', id: teleId(site, k), ab: 'lava_vent', k: 'harm', ms, shape: 'line', x: sh.x, z: sh.z, yaw: sh.yaw, len: sh.len, w: sh.w, el: 'fire', hazard: 1 });
      room.emit({ type: 'fx', kind: 'lavaVent', site: site.id, phase: 'warn', ms, x: site.cx, z: site.cz });
    }
  }
  /** Bodies in this room a hazard can touch near (x, z): players (alive) and monsters (alive, not a guard). */
  function bodiesNear(room, x, z, r) {
    return room.host.near(x, z, r, e => !e.dead && !e.removed && (e.kind === 'player' || e.kind === 'monster'));
  }
  function erupt(rec, k, t) {
    const { site, room } = rec;
    const hits = [];
    if (site.kind === 'geyser') {
      for (const e of bodiesNear(room, site.x, site.z, (site.r || GEYSER.r) + 2)) {
        if (!onGeyser(site, e.x, e.z)) continue;
        hits.push(e.id);
        if (e.kind === 'player') launch(room, e);
        else {
          room.emit({ type: 'fx', kind: 'toss', id: e.id, ms: GEYSER.tossMs, h: GEYSER.tossH, x: e.x, z: e.z });
          const n2 = geyserHurt(e.hp, e.hpMax);
          if (n2 > 0) touch(room, e, { kind: 'hit', amount: n2, element: 'physical', floor: 1, skill: 'geyser' });
        }
      }
      room.emit(routed({ type: 'teleR', id: teleId(site, k), hits }, site.x, site.z));
      room.emit({ type: 'fx', kind: 'geyser', site: site.id, phase: 'erupt', ms: GEYSER.eruptMs, x: site.x, z: site.z });
      return;
    }
    const dmg = ventDamage(site.level || 10);
    for (const e of bodiesNear(room, site.cx, site.cz, site.shape.len / 2 + 3)) {
      if (!inVent(site, e.x, e.z)) continue;
      hits.push(e.id);
      // a monster burns too (lure one in) — but the fire never takes its last point: the kill is yours to make
      touch(room, e, { kind: 'hit', amount: dmg, element: VENT.element, floor: e.kind === 'monster' ? 1 : 0, skill: 'lava_vent' });
    }
    room.emit(routed({ type: 'teleR', id: teleId(site, k), hits }, site.cx, site.cz));
    room.emit({ type: 'fx', kind: 'lavaVent', site: site.id, phase: 'spout', ms: VENT.spoutMs, x: site.cx, z: site.cz });
    rec.burnAt = t + VENT.burnMs;
  }
  function burn(rec) {
    const { site, room } = rec, n2 = ventBurn(site.level || 10);
    for (const e of bodiesNear(room, site.cx, site.cz, site.shape.len / 2 + 3)) if (inVent(site, e.x, e.z)) touch(room, e, { kind: 'hit', amount: n2, element: VENT.element, floor: e.kind === 'monster' ? 1 : 0, skill: 'lava_vent' });
  }
  /** Throw a player: straight up, then the slow fall (the client predicts the rest from the self block). */
  function launch(room, e) {
    if (e.state & STATE.swimming) return;
    e.vy = GEYSER.launchVy; e.airborne = true; e.glide = true;
    e.setState(STATE.airborne, true);
    e.moveTo(e.x, e.z, (Number.isFinite(e.y) ? e.y : room.groundAt(e.x, e.z)) + 0.05);
    const c = room.clients.get(e.id); if (c) c.selfDirty = true;
    e.loop('jump');
  }

  function tick() {
    n++;
    if (n % TICK_EVERY) return;
    const t = now();
    const springs = n % SPRING_EVERY === 0;
    const active = new Map();
    for (const o of online.values()) {
      const e = o.entity, room = o.room;
      if (!e || !room || e.removed || room.kind === 'instance' || !room.meta) continue;
      const key = room.meta.province;
      const S = key ? sitesFor(key, o.L || provinceOf(key)) : null;
      if (!S) { if (o.spring) o.spring = null; continue; }
      if (springs) springTick(o, S);
      const near = sitesNear(S, e.x, e.z, ACTIVE_M, new Set());
      for (const s of near) { const id = room.id + '|' + s.id; if (!active.has(id)) active.set(id, { s, room }); }
    }
    for (const [id, a] of active) {
      let rec = live.get(id);
      if (!rec) { const k0 = nextAt(a.s.cycle, t).k; rec = { site: a.s, room: a.room, warned: k0 - 1, erupted: k0 - 1, burnAt: 0, seen: t }; live.set(id, rec); }
      rec.seen = t;
      try { runSite(rec, t); } catch (err) { log('hazard site', a.s.id, err && err.message); }
    }
    if (n % 200 === 0) for (const [id, rec] of live) if (t - rec.seen > 30000 || rec.room.closed) live.delete(id);
  }
  const provinceOf = key => { for (const p of provinces()) if (p.key === key) return p.L; return null; };

  return { tick, sitesFor: key => sitesFor(key, provinceOf(key)), get live() { return live; }, launch };
}
