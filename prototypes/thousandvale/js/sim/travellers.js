// THE LIVING ROADS (stream A, play-test 1 P19 "massive empty areas… people walking and talking about the day and
// recent events"). Runs stream E's data: data/provinces/travellers.json (kinds of travelling groups + `folk` who work
// one spot), data/provinces/<province>-routes.json (town-to-town routes along B's roads, world metres) and
// data/names/chatter.json (what they say). Pure: no DOM, no Node APIs; one runner per wilds copy.
//
//   const tr = createTravellers({ room, travel: { routes, kinds, rules, chatter, names }, folk, rng, context, isNight, phase })
//   tr.step(dtMs)          ~5 Hz from the province (npcTick)
//   tr.groups              [{ id, kind, route, dir, s, crew: [...] }]   tr.stats()
//
// HOW IT RUNS. A group is a point on a route (distance `s` along the polyline, direction `dir`) that always advances —
// cheap arithmetic for every group in the province. Its crew only EXISTS as room entities (kind npc, team 1,
// friendly, talkable) while a player is within MATERIAL_R; it is put away again when nobody has been near for
// PARK_MS. So a copy holds a road full of travellers but the room only ever carries the few someone can see, and
// monsters never see them at all (stream C only fights entities it holds a unit for — nobody dies on the road).
// A group that reaches its destination waits at the gate (rules.waitAtTownMinutes), then leaves; a new group of a
// kind that fits a route takes its place at a route end. Fewer at night, only kinds with `night: true`.
// Simplified from E's rules (said so in docs/protocol.md §17.4): travellers do not fight (fights: never/defend/hunts
// is not run yet — monsters ignore them, they walk on), and the wayside stop is a random pause.
//
// CHATTER. A bark when a player comes within BARK_R (one per speaker per 60 s, one per player per 20 s, never the
// same line twice in a row, last 6 skipped). The pool is picked by E's weights: recent (what happened in this zone
// lately — the province's deeds, a live zone event, the world boss), phase of day, the speaker's role pools (incl.
// road.leaving / onroute / arriving / danger), the zone's archetype; `greet` the first time a speaker meets a player.
// A line whose {tokens} cannot all be filled is skipped. Two of a crew may trade a line and a `reply`.

export const MATERIAL_R = 260;       // a group's crew exists while a player is this close
export const PARK_MS = 30000;        // ...and is put away when nobody has been within MATERIAL_R for this long
export const BARK_R = 8, PAIR_R = 12;
export const SLICES = 4;             // step() moves a quarter of the groups per call (call it every tick)
const TAU = Math.PI * 2;

/** A polyline with cumulative lengths: at(s) -> { x, z, yaw } (yaw faces along +s). */
export function polyline(pts) {
  const P = pts.map(p => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  const length = cum[cum.length - 1];
  function at(s) {
    s = Math.max(0, Math.min(length, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = P[lo], b = P[hi] || a, L = (cum[hi] - cum[lo]) || 1, f = (s - cum[lo]) / L;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  return { pts: P, length, at };
}

export function createTravellers({ room, travel, folk = [], rng = Math.random, context = () => ({}), isNight = () => false, phase = () => 'day', now = () => room.now(), log = () => {}, fighterLevel = () => null }) {
  const T = travel || {};
  // report #18 (Y21): who fights what comes near while a player watches — travellers.json `fighters` (an armed crew
  // member; a wayside worker whose role is listed). The rules (js/rules/guards.js, a 'wanderer') own a fighter's feet
  // while its fight lasts: `fightingNow(e)` is asked before anybody is walked on.
  const FIGHT = T.fighters || null;
  const fightRoles = new Set((FIGHT && FIGHT.roles) || []);
  const fighterData = (x, z) => { const lv = fighterLevel(x, z); return { fighter: lv ? { level: lv } : true }; };
  const fightingNow = e => !!(e && !e.removed && e.data && e.data.fighter && room.rules && room.rules.npcFighting && room.rules.npcFighting(e));
  const R = T.rules || {};
  const kinds = T.kinds || {};
  const chatter = T.chatter || { pools: {}, rules: {} };
  const names = T.names || {};
  const routes = (T.routes || []).filter(r => Array.isArray(r.pts) && r.pts.length >= 2).map(r => ({ ...r, line: polyline(r.pts) }));
  const groups = [];
  const lastBarkByPlayer = new Map();       // player entity id -> ms
  let nextId = 1, t = 0;
  const counters = { spawned: 0, materialised: 0, parked: 0, barks: 0, pairs: 0, arrived: 0 };
  const pick = a => a[Math.floor(rng() * a.length)];
  const range = (r, d = 1) => (Array.isArray(r) ? r[0] + Math.floor(rng() * (r[1] - r[0] + 1)) : (r ?? d));

  // ---- how many groups: E's perRouteKm per route, capped by maxPerZone (counted on the route's first zone) ----
  function wanted(route, night) {
    const n = Math.max(1, Math.round((route.line.length / 1000) * (R.perRouteKm ?? 0.6)));
    return night ? Math.max(0, Math.round(n * 0.4)) : n;
  }
  function kindFor(route, night) {
    const list = (route.kinds || Object.keys(kinds)).map(k => [k, kinds[k]]).filter(([, k]) => k && (night ? k.night : k.day !== false) && (!k.minRouteM || route.line.length >= k.minRouteM));
    if (!list.length) return null;
    const total = list.reduce((a, [, k]) => a + (k.weight || 1), 0);
    let r = rng() * total;
    for (const [id, k] of list) { r -= k.weight || 1; if (r <= 0) return id; }
    return list[list.length - 1][0];
  }
  function nameFor(spec) {
    const g = names.given || {}, fam = names.family || [];
    const sex = rng() < 0.5 ? 'f' : 'm';
    return String(spec.name || 'Traveller').replace('{first}', pick(g[sex] || g.f || ['Wat'])).replace('{family}', fam.length ? pick(fam) : 'Reed');
  }
  function crewFor(kindId) {
    const k = kinds[kindId] || {};
    const crew = [];
    for (const spec of k.crew || []) { const n = range(spec.count, 1); for (let i = 0; i < n; i++) crew.push({ role: spec.role, name: nameFor(spec), armed: !!spec.armed, ...(typeof spec.titled === 'boolean' ? { titled: spec.titled } : {}), e: null, recent: [] }); }
    if (!crew.length) crew.push({ role: 'traveller', name: 'Traveller', e: null, recent: [] });
    return crew;
  }
  function spawnGroup(route, { s = null, dir = null } = {}) {
    const night = isNight();
    const kindId = kindFor(route, night);
    if (!kindId) return null;
    const k = kinds[kindId];
    const d = dir ?? (rng() < 0.5 ? 1 : -1);
    const g = { id: nextId++, kind: kindId, route, dir: d, s: s ?? rng() * route.line.length, speed: k.speedMps || R.speedMps || 1.4, crew: crewFor(kindId),
      waitUntil: 0, pauseUntil: 0, lastNear: -Infinity, live: false, lastPair: -Infinity, nextStopAt: 0 };
    g.nextStopAt = g.s + d * (200 + rng() * 400);
    groups.push(g); counters.spawned++;
    return g;
  }
  // the first fill: spread along every route (the roads are already walked when the first player arrives)
  for (const r of routes) { const n = wanted(r, isNight()); for (let i = 0; i < n; i++) spawnGroup(r); }

  // ---- crew as entities ----
  function slot(g, i) {
    const p = g.route.line.at(g.s - g.dir * i * 2.6);
    const side = (i % 2 ? 1 : -1) * 0.9;
    const yaw = g.dir > 0 ? p.yaw : p.yaw + Math.PI;
    return { x: p.x + Math.cos(yaw) * side, z: p.z - Math.sin(yaw) * side, yaw };
  }
  function materialise(g) {
    if (g.live) return;
    const k = kinds[g.kind] || {};
    g.crew.forEach((c, i) => {
      const p = slot(g, i);
      // play-test 4 S9: a wanderer's FIRST crew member carries what the kind offers — a shop (`shop`, shops.js kindOf
      // reads npc.shop), a delivery to the town the group walks to (`offers`), or lore and a tip (`curious`)
      const lead = i === 0;
      const wand = lead && (k.shop || k.offers || k.curious) ? { kind: g.kind, ...(k.offers ? { offers: k.offers } : {}), ...(k.curious ? { curious: true } : {}), ...(k.shop ? { shop: k.shop } : {}) } : null;
      c.e = room.spawn({ kind: 'npc', type: 'npc', name: c.name, x: p.x, z: p.z, yaw: p.yaw, team: 1, state: 128,
        data: { key: 'trav:' + g.id + ':' + i, npc: { role: c.role, ...(typeof c.titled === 'boolean' ? { titled: c.titled || !!wand } : {}), says: k.blurb ? [k.blurb] : [], traveller: g.kind, ...(wand && k.shop ? { shop: k.shop } : {}), ...(wand ? { title: k.name || null } : {}) },
          traveller: { kind: g.kind, group: g.id, name: k.name || g.kind, from: endName(g, -1), to: endName(g, 1), beast: k.beast || null, cart: !!k.cart, ...(k.vehicle ? { vehicle: k.vehicle } : {}), armed: c.armed || undefined }, ...(wand ? { wanderer: wand } : {}),
          ...(FIGHT && ((FIGHT.crew === 'armed' && c.armed) || fightRoles.has(c.role)) ? fighterData(p.x, p.z) : {}) } });
    });
    g.live = true; counters.materialised++;
  }
  function park(g) {
    if (!g.live) return;
    for (const c of g.crew) { if (c.e && !c.e.removed) room.remove(c.e); c.e = null; }
    g.live = false; counters.parked++;
  }
  const endName = (g, which) => { const e = (which > 0) === (g.dir > 0) ? g.route.to : g.route.from; return (e && e.name) || null; };
  // the players of the room: its clients' entities (a copy holds ~1,000 monsters; walking room.entities would cost more)
  const players = () => { const out = []; if (room.clients && room.clients.size) { for (const c of room.clients.values()) if (c.entity && !c.entity.dead) out.push(c.entity); } else for (const e of room.entities.values()) if (e.kind === 'player' && !e.dead) out.push(e); return out; };

  // ---- one step: call every tick; each call moves one SLICE of the groups (1/SLICES of them, by id) by SLICES x dt,
  // so a road full of travellers costs the same small amount every tick instead of a spike every few ---- 
  let phaseN = 0;
  function step(dtMs) {
    t = now();
    const slice = phaseN++ % SLICES;
    const night = isNight();
    const dt = dtMs * SLICES / 1000;
    const all = players();
    let ps = null;
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      if (g.id % SLICES !== slice) continue;
      const head = g.route.line.at(g.s);
      let near = Infinity;
      for (let k = 0; k < all.length; k++) { const p = all[k], dx = p.x - head.x, dz = p.z - head.z; if (dx > MATERIAL_R || dx < -MATERIAL_R || dz > MATERIAL_R || dz < -MATERIAL_R) continue; const d = Math.hypot(dx, dz); if (d < near) near = d; }
      if (near <= PAIR_R) ps = all;
      if (near <= MATERIAL_R) g.lastNear = t;
      // arrived: wait at the gate, then go (never under a player's nose)
      const end = g.dir > 0 ? g.route.line.length : 0;
      if (Math.abs(g.s - end) < 0.5) {
        if (!g.waitUntil) { g.waitUntil = t + (range((R.waitAtTownMinutes || [2, 6]).map(m => m * 60), 180)) * 1000; counters.arrived++; }
        if (t >= g.waitUntil && near > 80) { park(g); groups.splice(gi, 1); replace(g.route); continue; }
      } else if (g.live && g.crew.some(c => fightingNow(c.e))) {
        g.pauseUntil = t + 1500;             // Y21: the group waits for its fighters (a caravan does not walk off from its guards)
      } else if (kinds[g.kind] && kinds[g.kind].stopNear && g.live && crewNear(g, all, kinds[g.kind].stopNear)) {
        g.pauseUntil = t + 2500;             // S9: a wanderer stands still while someone is at their elbow (shop / talk range holds)
      } else if (t >= g.pauseUntil) {
        // a wayside pause now and then (look about, drink): the road feels walked, not conveyed
        if ((g.dir > 0 ? g.s >= g.nextStopAt : g.s <= g.nextStopAt)) { g.pauseUntil = t + (5 + rng() * 15) * 1000; g.nextStopAt = g.s + g.dir * (300 + rng() * 500); }
        else g.s = Math.max(0, Math.min(g.route.line.length, g.s + g.dir * g.speed * dt));
      }
      if (near <= MATERIAL_R) materialise(g);
      else if (g.live && t - g.lastNear > PARK_MS) park(g);
      if (!g.live) continue;
      const walking = t >= g.pauseUntil && !(Math.abs(g.s - end) < 0.5);
      g.crew.forEach((c, i) => {
        if (!c.e || c.e.removed || fightingNow(c.e)) return;
        const p = slot(g, i);
        c.e.moveTo(p.x, p.z);
        c.e.face(p.yaw);
        c.e.loop(walking ? 'walk' : 'idle');
      });
      if (near <= PAIR_R) talk(g, ps);
    }
    if (slice !== 0) return;
    // night thins the road: groups of day-only kinds far from everyone go home
    if (night) for (let gi = groups.length - 1; gi >= 0; gi--) { const g = groups[gi], k = kinds[g.kind] || {}; if (!k.night && !g.live && rng() < 0.002) groups.splice(gi, 1); }
    else for (const r of routes) if (rng() < 0.002 && groups.filter(g => g.route === r).length < wanted(r, false)) replace(r);
  }
  /** S9: is any player within `m` metres of any of this group's crew? */
  function crewNear(g, ps, m) {
    for (const c of g.crew) { if (!c.e || c.e.removed) continue; for (const p of ps) if (Math.abs(p.x - c.e.x) <= m && Math.abs(p.z - c.e.z) <= m && Math.hypot(p.x - c.e.x, p.z - c.e.z) <= m) return true; }
    return false;
  }
  function replace(route) {
    // a fresh group at one end of a route that fits (the same route, or another one at random)
    const r = rng() < 0.6 ? route : pick(routes);
    const dir = rng() < 0.5 ? 1 : -1;
    const s = dir > 0 ? 0 : r.line.length;
    const head = r.line.at(s);
    for (const p of players()) if (Math.hypot(p.x - head.x, p.z - head.z) < 80) return;   // nobody pops in under a player's nose
    if (groups.filter(g => g.route === r).length < wanted(r, isNight()) + 1) spawnGroup(r, { s, dir });
  }

  // ---- chatter ----
  function talk(g, ps) {
    for (const c of g.crew) {
      if (!c.e || c.e.removed) continue;
      if (t - (c.lastBark ?? -1e9) < 60000) continue;
      let who = null;
      for (const p of ps) if (Math.hypot(p.x - c.e.x, p.z - c.e.z) <= BARK_R && t - (lastBarkByPlayer.get(p.id) ?? -1e9) >= 20000) { who = p; break; }
      if (!who) continue;
      const line = lineFor(g, c, who);
      if (!line) continue;
      c.lastBark = t; lastBarkByPlayer.set(who.id, t);
      (c.met ||= new Set()).add(who.id);
      room.emit({ type: 'say', id: c.e.id, text: line, style: 'bark' });
      counters.barks++;
      // a crewmate answers now and then (once a minute per group)
      const mate = g.crew.find(m => m !== c && m.e && !m.e.removed && Math.hypot(m.e.x - c.e.x, m.e.z - c.e.z) < 4);
      if (mate && t - g.lastPair > 60000 && rng() < 0.5) {
        g.lastPair = t;
        const reply = fill(pickLine(chatter.pools.reply || [], mate), tokensFor(g, mate, who));
        if (reply) { g.pendingReply = { at: t + 1500 + rng() * 1500, id: mate.e.id, text: reply }; counters.pairs++; }
      }
      return;
    }
    if (g.pendingReply && t >= g.pendingReply.at) { const r = g.pendingReply; g.pendingReply = null; if (room.entities.has(r.id)) room.emit({ type: 'say', id: r.id, text: r.text, style: 'bark' }); }
  }
  function tokensFor(g, c, who) {
    const ctx = context(c.e ? c.e.x : 0, c.e ? c.e.z : 0) || {};
    return { name: c.name, from: endName(g, -1), dest: endName(g, 1), town: ctx.town || endName(g, 1), zone: ctx.zone || null, weather: ctx.weather || null,
      rare: ctx.rare || null, player: ctx.player || (who && who.name) || null, party: ctx.party || null, boss: ctx.boss || null, place: ctx.place || null,
      event: ctx.event || null, worldboss: ctx.worldboss || null, minutes: ctx.minutes ?? null, count: ctx.count ?? null };
  }
  const TOKEN = /\{(\w+)\}/g;
  function fill(line, tok) {
    if (!line) return null;
    let ok = true;
    const out = line.replace(TOKEN, (m, k) => { const v = tok[k]; if (v === null || v === undefined || v === '') { ok = false; return m; } return String(v); });
    return ok ? out : null;
  }
  function pickLine(pool, c, tok = null) {
    const cands = pool.filter(l => !c.recent.includes(l) && (!tok || fill(l, tok)));
    if (!cands.length) return null;
    const l = pick(cands);
    c.recent.push(l); if (c.recent.length > 6) c.recent.shift();
    return l;
  }
  /** E's rules: greet first; else a weighted pool family (recent / phase / role / archetype; weather when known). */
  function lineFor(g, c, who) {
    const P = chatter.pools || {};
    const tok = tokensFor(g, c, who);
    const ctx = context(c.e.x, c.e.z) || {};
    if (!(c.met && c.met.has(who.id)) && P.greet) { const l = pickLine(P.greet, c, tok); if (l) return fill(l, tok); }
    const k = kinds[g.kind] || {};
    const rolePools = (k.chatter || ['role.' + c.role]).filter(id => !id.startsWith('road.'));
    // the road pool by where on the route the group is
    const fromEnd = g.dir > 0 ? g.s : g.route.line.length - g.s, toEnd = g.route.line.length - fromEnd;
    const roadPool = ctx.danger && (k.chatter || []).includes('road.danger') ? 'road.danger' : fromEnd < 150 ? 'road.leaving' : toEnd < 250 ? 'road.arriving' : 'road.onroute';
    const recent = (ctx.recent || []).filter(id => P[id] && P[id].length);
    const W = { ...(chatter.rules && chatter.rules.weights) || { recent: 0.4, weather: 0.15, phase: 0.15, role: 0.2, archetype: 0.1 } };
    if (!recent.length) { W.role += W.recent; W.recent = 0; }
    if (!ctx.weather || !P['weather.' + ctx.weather]) { W.role += W.weather || 0; W.weather = 0; }
    if (!ctx.archetype || !P['archetype.' + ctx.archetype]) { W.role += W.archetype || 0; W.archetype = 0; }
    const order = [];
    const fam = () => { let r = rng() * Object.values(W).reduce((a, b) => a + b, 0); for (const [f, w] of Object.entries(W)) { r -= w; if (r <= 0) return f; } return 'role'; };
    const f = fam();
    if (f === 'recent') { const pr = (chatter.rules && chatter.rules.recentPriority) || recent; const top = pr.find(id => recent.includes(id)); order.push(rng() < 0.6 && top ? top : pick(recent)); }
    else if (f === 'weather') order.push('weather.' + ctx.weather);
    else if (f === 'phase') order.push('phase.' + (phase() === 'late' ? 'night' : phase()));
    else if (f === 'archetype') order.push('archetype.' + ctx.archetype);
    order.push(rng() < 0.4 ? roadPool : pick(rolePools.length ? rolePools : ['role.' + c.role]), 'role.' + c.role, 'phase.' + (phase() === 'late' ? 'night' : phase()));
    for (const id of order) { const pool = P[id]; if (!pool || !pool.length) continue; const l = pickLine(pool, c, tok); if (l) return fill(l, tok); }
    return null;
  }

  // ---- folk: E's `folk` placements, people who work one spot (walk a small loop, work at each stop, bark) ----
  const folkers = (folk || []).filter(f => Array.isArray(f.path) && f.path.length >= 2).map(f => ({ ...f, line: polyline([...f.path, f.path[0]]), s: 0, e: null, recent: [], workUntil: 0 }));
  function stepFolk(dtMs, slice) {
    const ps = players();
    const R = MATERIAL_R + 60;
    for (let fi = slice; fi < folkers.length; fi += SLICES) {
      const f = folkers[fi];
      let near = Infinity;
      for (let k = 0; k < ps.length; k++) { const p = ps[k], dx = p.x - f.x, dz = p.z - f.z; if (dx > R || dx < -R || dz > R || dz < -R) continue; const d = Math.hypot(dx, dz); if (d < near) near = d; }
      if (near === Infinity && !f.e) continue;
      if (near <= MATERIAL_R && !f.e) f.e = room.spawn({ kind: 'npc', type: 'npc', name: f.name || 'Villager', x: f.path[0][0] ?? f.x, z: f.path[0][1] ?? f.z, team: 1, state: 128, data: { npc: { role: f.role, says: [] }, folk: { role: f.role, work: f.work || null }, ...(fightRoles.has(f.role) ? fighterData(f.x, f.z) : {}) } });
      else if (near > MATERIAL_R + 60 && f.e) { room.remove(f.e); f.e = null; }
      if (!f.e) continue;
      if (fightingNow(f.e)) continue;      // Y21: the rules walk a fighter until its fight is over
      if (t < f.workUntil) { f.e.loop('interact'); }
      else {
        f.s = (f.s + 1.0 * dtMs / 1000) % f.line.length;
        const p = f.line.at(f.s);
        f.e.moveTo(p.x, p.z); f.e.face(p.yaw); f.e.loop('walk');
        if (rng() < dtMs / 12000) f.workUntil = t + 4000 + rng() * 6000;
      }
      if (near <= BARK_R && t - (f.lastBark ?? -1e9) > 60000) {
        const who = ps.find(p => Math.hypot(p.x - f.e.x, p.z - f.e.z) <= BARK_R);
        if (who && t - (lastBarkByPlayer.get(who.id) ?? -1e9) >= 20000) {
          const pools = (f.chatter || ['role.' + f.role]).map(id => (chatter.pools || {})[id]).filter(Boolean).flat();
          const tok = { name: f.name, town: (context(f.x, f.z) || {}).town || null, zone: (context(f.x, f.z) || {}).zone || null, player: who.name };
          const l = pickLine(pools.length ? pools : (chatter.pools.greet || []), f, tok);
          if (l) { f.lastBark = t; lastBarkByPlayer.set(who.id, t); room.emit({ type: 'say', id: f.e.id, text: fill(l, tok), style: 'bark' }); counters.barks++; }
        }
      }
    }
  }

  return {
    groups, folk: folkers, counters,
    step(dtMs) { const slice = phaseN % SLICES; step(dtMs); if (folkers.length) stepFolk(dtMs * SLICES, slice); },
    stats: () => ({ groups: groups.length, live: groups.filter(g => g.live).length, entities: groups.reduce((a, g) => a + (g.live ? g.crew.length : 0), 0) + folkers.filter(f => f.e).length, ...counters }),
    dispose() { for (const g of groups) park(g); for (const f of folkers) if (f.e) { room.remove(f.e); f.e = null; } },
  };
}
