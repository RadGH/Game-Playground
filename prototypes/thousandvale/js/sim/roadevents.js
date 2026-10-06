// ROAD EVENTS (stream A, play-test 4: S5 "more random events: some give treasure chests (loot window like corpses);
// others give quests (deliver items to town, etc.)" + S9's wanderers who hand out deliveries and tell stories). Pure.
//
// Stream E's data/provinces/road-events.json says what can happen; this runs it. Every online player alone in a
// wilds copy gets a small event dropped `spawnM` metres away every `gapSec` (first after `firstSec`), unless another
// one is already within `quietM`. Kinds:
//   chest   — a lootable object (kind 'object', type 'chest', info.look = E's look). Opening it uses the CORPSE loot
//             window (js/sim/corpses.js holdFor: a personal share per player, rolled when they first open it or when
//             the box opens up while they stand near). Guards (the nearest camp's type, at the event's level) keep it
//             shut until they are down. Packs itself up once everyone who opened it has emptied their share.
//   deliver — a stranded NPC offers a job-shaped quest: carry a parcel (a bag item) to a named NPC in the nearest town.
//             Talking to that NPC with the parcel completes it. S9's errand runners offer the same, to their destination.
//   escort  — an NPC follows whoever accepted to the nearest town; `maxAmbush` ambushes on the way. Done when they
//             reach the town's edge; given up if the escort is left behind for `escortGiveUpSec`.
//   rescue  — a captive held by guards: down the guards, free them (talk), then escort them home.
// Quest events are ordinary quests in the log (generated defs carried on the active record, like radiant jobs) with
// `autoComplete`, so they pay the moment they are done — no walk back. Step progress goes through the province's
// questEvent as `use` events on the vignette key 'road:<event id>'.
//
//   const R = createRoadEvents({ data, online, corpses, grant, questEvent, bookOf, provOf, newUid, now, wallNow, rng, log, counters, journal, questSaved, sendQuests })
//   R.tick()                      1 Hz (spawns, guards, expiry, arrivals)
//   R.move(dtMs)                  ~5 Hz (escorts follow)
//   R.use(o, obj) -> bool         a road-event object/NPC was used (chest open, captive freed); true = handled
//   R.offers(o, obj) -> [views]   what a road-event NPC or a wanderer offers (stored as job offers so accept works)
//   R.accepted(o, id, obj)        after a road quest is accepted (parcel into the bag, escort starts)
//   R.talk(o, obj) -> extra|null  any NPC talked to: completes deliveries; wanderers' lore + tips
//   R.events                      Map id -> event   R.spawnFor(o, kind) (tests)

export const ROAD_DEFAULTS = Object.freeze({ firstSec: [45, 90], gapSec: [150, 300], spawnM: [70, 140], quietM: 220, lifeSec: 600, maxPerRoom: 6, ambushEveryM: 170, maxAmbush: 2, escortGiveUpSec: 90 });
const KILL_GOLD = level => 3 + level;

export function createRoadEvents({ data = null, wanderers = null, online, corpses, grant, questEvent, bookOf, provOf, now, wallNow, rng = Math.random, log = () => {}, counters = {}, journal = () => {}, questSaved = () => {}, sendQuests = () => {}, partyOf = () => null, enabled = true }) {
  const D = data || {};
  const R = { ...ROAD_DEFAULTS, ...(D.rules || {}) };
  const W = wanderers || {};
  const events = new Map();
  let nextId = 1;
  const pick = a => a[Math.floor(rng() * a.length)];
  const range = (r, d) => (Array.isArray(r) ? r[0] + rng() * (r[1] - r[0]) : (r ?? d));
  const irange = r => (Array.isArray(r) ? r[0] + Math.floor(rng() * (r[1] - r[0] + 1)) : (r | 0));
  const tell = (o, text) => { if (o && o.conn) o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: 'The Vale', text }); };
  const fill = (str, tok) => String(str || '').replace(/\{(\w+)\}/g, (m, k) => (tok[k] != null ? String(tok[k]) : m));

  // ---- names ----
  function personName(pv, spec) {
    const n = (pv.L.travel && pv.L.travel.names) || {};
    const g = n.given || {}, fam = n.family || [];
    const sex = rng() < 0.5 ? 'f' : 'm';
    return String(spec || '{first}').replace('{first}', pick(g[sex] || g.f || ['Wat'])).replace('{family}', fam.length ? pick(fam) : 'Reed');
  }

  // ---- where ----
  const inTown = (L, x, z, pad = 40) => (L.towns || []).some(t => Math.hypot(t.x - x, t.z - z) < (t.r || 40) + pad);
  function spotNear(room, L, from) {
    const [a0, a1] = Array.isArray(R.spawnM) ? R.spawnM : [70, 140];
    for (let k = 0; k < 24; k++) {
      const a = rng() * Math.PI * 2, d = a0 + rng() * (a1 - a0);
      const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
      const b = room.terrain && room.terrain.bounds;
      if (b && (x < b.minX + 20 || z < b.minZ + 20 || x > b.maxX - 20 || z > b.maxZ - 20)) continue;
      if (room.walkable && !room.walkable(x, z)) continue;
      if (inTown(L, x, z)) continue;
      return { x, z };
    }
    return null;
  }
  /** The nearest camp (monster type + level) to a spot: what guards / ambushes there look like. */
  function campNear(L, x, z) {
    let best = null, bd = Infinity;
    for (const c of L.camps || []) { if (c.encounter || !c.type || c.rank && c.rank !== 'normal') continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function nearestTown(L, x, z, not = null) {
    let best = null, bd = Infinity;
    (L.towns || []).forEach((t, i) => { if (t.name === not) return; const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = { ...t, i }; } });
    return best;
  }
  /** A delivery target: a working NPC (E's `deliverTargets` roles) in that town's room. */
  function deliveryTarget(pv, town) {
    const roles = D.deliverTargets || ['merchant', 'innkeeper', 'elder'];
    const room = (pv.towns || [])[town.i] || (pv.towns || []).find(r => r.name === town.name);
    if (!room) return null;
    const folk = [...room.objects.values()].filter(n => n.kind === 'npc' && n.data && n.data.npc && roles.includes(n.data.npc.role));
    if (!folk.length) return null;
    const n = pick(folk);
    return { name: n.name, role: n.data.npc.role, town: town.name, x: n.x, z: n.z, key: n.data.key || null };
  }

  // ---- spawning ----
  function levelFor(o, L, x, z) {
    const c = campNear(L, x, z);
    const pl = o.entity.level || 1;
    return Math.max(1, Math.min(pl + 1, Math.max(pl - 1, c ? c.level || pl : pl)));
  }
  function spawnGuards(room, L, ev, n) {
    const c = campNear(L, ev.x, ev.z);
    if (!c || n <= 0) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng(), r = 4 + rng() * 3;
      let x = ev.x + Math.cos(a) * r, z = ev.z + Math.sin(a) * r;
      if (room.walkable && !room.walkable(x, z)) { x = ev.x; z = ev.z; }
      const m = room.spawn({ kind: 'monster', type: c.type, level: ev.level, x, z, yaw: rng() * 6.283, rank: 'normal', data: { roadEvent: ev.id } });
      ev.guards.push(m);
      ev.guardType = c.type;
    }
  }
  const guardsDown = ev => ev.guards.every(m => m.removed || m.dead);
  const guardWord = ev => (ev.guardType ? plural(ev.guardType) : 'brutes');

  function spawnFor(o, kind = null) {
    const room = o.room, pv = provOf(room);
    if (!pv || room.kind !== 'wilds') return null;
    const L = pv.L;
    const at = spotNear(room, L, o.entity);
    if (!at) return null;
    const w = D.weights || { chest: 45, deliver: 20, escort: 15, rescue: 20 };
    if (!kind) { let r = rng() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) { kind = k; break; } } kind ||= 'chest'; }
    const ev = { id: nextId++, kind, room, pv, x: at.x, z: at.z, level: levelFor(o, L, at.x, at.z), born: now(), touched: false, guards: [], ents: [], rolled: new Set(), opened: false, for: o.char.id };
    const town = nearestTown(L, at.x, at.z);
    ev.town = town;
    const key = 'road:' + room.id + ':' + ev.id;
    if (kind === 'chest') {
      const spec = pick(D.chests || [{ id: 'cache', name: 'Cache', look: 'chest_small', guards: [0, 0], tier: 'magic' }]);
      ev.spec = spec;
      ev.chest = room.spawn({ kind: 'object', type: 'chest', name: spec.name, x: at.x, z: at.z, yaw: rng() * 6.283, team: 0, state: 0,
        data: { key, road: { ev: ev.id, kind: 'chest' }, look: spec.look || 'chest_small', lore: spec.blurb || null, state: 'shut' } });
      ev.ents.push(ev.chest);
      spawnGuards(room, L, ev, irange(spec.guards || [0, 0]));
    } else {
      const list = D[kind] || [];
      if (!list.length || !town) return null;
      const spec = pick(list);
      ev.spec = spec;
      ev.name = personName(pv, spec.name);
      if (kind === 'deliver') { ev.target = deliveryTarget(pv, town); if (!ev.target) return null; }
      const tok = { name: ev.name, town: town.name, npc: ev.target ? ev.target.name : '', role: ev.target ? roleWord(ev.target.role) : '', guards: '' };
      if (kind === 'rescue') spawnGuards(room, L, ev, irange(spec.guards || [2, 2]));
      tok.guards = guardWord(ev);
      ev.npc = room.spawn({ kind: 'npc', type: 'npc', name: ev.name, x: at.x, z: at.z, yaw: rng() * 6.283, team: 1, state: 128,
        data: { key, road: { ev: ev.id, kind, captive: kind === 'rescue' || undefined }, npc: { role: spec.role || 'traveller', says: [fill(spec.say, tok)], title: kind === 'rescue' ? 'Captive' : kind === 'escort' ? 'Needs an escort' : 'Needs a hand' } } });
      ev.tok = tok;
      ev.ents.push(ev.npc);
      if (kind === 'rescue') ev.npc.loop('sit');
    }
    events.set(ev.id, ev);
    counters.roadEvents = (counters.roadEvents || 0) + 1;
    counters['road_' + kind] = (counters['road_' + kind] || 0) + 1;
    return ev;
  }
  function end(ev) {
    if (!events.has(ev.id)) return;
    events.delete(ev.id);
    if (ev.chest) corpses.forgetBody && corpses.forgetBody(ev.room, ev.chest);
    for (const e of ev.ents) if (!e.removed) ev.room.remove(e);
    for (const m of ev.guards) if (!m.removed && !m.dead) ev.room.remove(m);
  }

  // ---- chests ----
  function rollShare(ev, o) {
    if (ev.rolled.has(o.char.id)) return;
    ev.rolled.add(o.char.id);
    const rules = ev.room.rules, e = o.entity;
    let items = [];
    try { items = (rules.rollLoot ? rules.rollLoot(e, { level: ev.level, tier: ev.spec.tier || 'magic' }) : []) || []; } catch (err) { log('road chest loot', err && err.message); }
    const gold = Math.round(ev.level * 5 + 6 + rng() * ev.level * 3);
    corpses.holdFor(ev.room, ev.chest, o.char.id, { gold, items });
  }
  function openUp(ev) {
    if (ev.opened) return;
    ev.opened = true;
    ev.room.objState(ev.chest, 'unlocked');
    for (const o of online.values()) if (o.room === ev.room && o.entity && !o.entity.dead && Math.hypot(o.entity.x - ev.x, o.entity.z - ev.z) <= 80) rollShare(ev, o);
  }

  // ---- quests ----
  function defFor(ev, o, giverKey, giverAt) {
    const spec = ev.spec, tok = ev.tok || {}, k = ev.kind;
    const vig = 'road:' + ev.room.id + ':' + ev.id;
    const town = ev.town;
    const townAt = town ? { x: Math.round(town.x), z: Math.round(town.z), r: Math.round(town.r || 40), name: town.name } : null;
    let steps;
    if (k === 'deliver') steps = [{ kind: 'use', vignette: vig, object: 'delivered', count: 1, text: fill('Take the ' + (spec.item || 'parcel').toLowerCase() + ' to {npc} in {town}', tok), at: { x: Math.round(ev.target.x), z: Math.round(ev.target.z), r: 4, name: ev.target.name } }];
    else if (k === 'escort') steps = [{ kind: 'use', vignette: vig, object: 'arrived', count: 1, text: fill('See {name} safely to {town}', tok), at: townAt }];
    else steps = [{ kind: 'use', vignette: vig, object: 'freed', count: 1, text: fill('Deal with the {guards} and free {name}', tok), at: { x: Math.round(ev.x), z: Math.round(ev.z), r: 10, name: ev.name } },
      { kind: 'use', vignette: vig, object: 'arrived', count: 1, text: fill('Bring {name} home to {town}', tok), at: townAt }];
    const zone = ev.pv.L.zoneOf ? ev.pv.L.zoneOf(ev.x, ev.z) : null;
    return { id: 'road:' + k + ':' + ev.room.id + ':' + ev.id, name: fill(spec.title || 'A Favour', tok), text: fill(spec.text || spec.say || '', tok), level: ev.level, job: true, frame: 'road:' + k, giverKey, giver: null,
      zone, steps, reward: { xp: spec.xp || 0.3, gold: spec.gold || 4, ...(spec.item ? (typeof spec.item === 'object' ? { item: spec.item } : {}) : {}) }, autoComplete: true, giverAt,
      road: { ev: ev.id, room: ev.room.id, kind: k, ...(ev.target ? { target: ev.target } : {}), item: spec.item && typeof spec.item === 'string' ? spec.item : null } };
  }
  function offerList(o, giverKey, list) {
    const s = o.char.quests ||= { active: {}, done: {}, jobs: {} };
    s.jobs ||= {}; s.jobs.offered ||= {};
    const fresh = list.filter(d => !(s.active || {})[d.id]);
    s.jobs.offered[giverKey] = { at: wallNow(), list: fresh };
    o.dirty = true;
    const b = bookOf(o);
    return fresh.map(d => b.viewDef(o.char, d));
  }
  function offers(o, obj) {
    const d = obj.data || {};
    if (d.road && events.has(d.road.ev)) {
      const ev = events.get(d.road.ev);
      if (ev.kind === 'chest') return [];
      if ((ev.kind === 'escort' || ev.kind === 'rescue') && ev.follow && ev.follow !== o.char.id && !partyWith(ev.follow, o)) return [];
      if (ev.done) return [];
      const key = d.key;
      ev.defs ||= new Map();
      let def = ev.defs.get(o.char.id);
      if (!def) { def = defFor(ev, o, key, { x: Math.round(obj.x), z: Math.round(obj.z), r: 4, name: obj.name }); ev.defs.set(o.char.id, def); }
      return offerList(o, key, [def]);
    }
    if (d.wanderer && d.wanderer.offers === 'deliver' && d.traveller) {
      // an errand runner: a letter for someone in the town they are walking to (else the nearest other town)
      const pv = provOf(o.room); if (!pv) return [];
      const L = pv.L;
      const town = (L.towns || []).map((t, i) => ({ ...t, i })).find(t => t.name === d.traveller.to) || nearestTown(L, obj.x, obj.z);
      if (!town) return [];
      const wk = 'w:' + d.key;
      let ev = [...events.values()].find(x => x.wkey === wk);
      if (!ev) {
        const target = deliveryTarget(pv, town);
        if (!target) return [];
        const spec = pick(D.deliver || [{ item: 'Letter', title: 'A Letter for {town}', text: 'Carry the letter to {npc} in {town}.', xp: 0.3, gold: 4 }]);
        ev = { id: nextId++, kind: 'deliver', wkey: wk, room: o.room, pv, x: obj.x, z: obj.z, level: Math.max(1, o.entity.level || 1), born: now(), guards: [], ents: [], rolled: new Set(), town, target, spec,
          name: obj.name, tok: { name: obj.name, town: town.name, npc: target.name, role: roleWord(target.role) }, virtual: true };
        events.set(ev.id, ev);
      }
      ev.defs ||= new Map();
      let def = ev.defs.get(o.char.id);
      if (!def) { def = defFor(ev, o, d.key, { x: Math.round(obj.x), z: Math.round(obj.z), r: 4, name: obj.name }); ev.defs.set(o.char.id, def); }
      return offerList(o, d.key, [def]);
    }
    return [];
  }
  const partyWith = (charId, o) => { const p = partyOf(o.char.id); return !!(p && p.members && p.members.includes(charId)); };
  function accepted(o, id, obj) {
    const def = activeDef(o, id);
    if (!def || !def.road) return;
    const ev = events.get(def.road.ev);
    if (!ev) return;
    ev.touched = true;
    if (def.road.kind === 'deliver') {
      const item = { kind: 'good', id: 'road_parcel', name: def.road.item || (ev.spec && ev.spec.item) || 'Sealed parcel', desc: 'For ' + def.road.target.name + ' in ' + def.road.target.town + '.', rarity: 'normal', stack: 1, quest: def.id, noSell: true };
      grant(o, { items: [item], gold: 0, reason: 'quest', from: obj });
      if (ev.npc && !ev.npc.removed) { ev.room.emit({ type: 'say', id: ev.npc.id, text: 'Thank you. Mind it doesn\'t get wet.', style: 'bark' }); ev.leaveAt = now() + 15000; }
      return;
    }
    if (def.road.kind === 'escort') { if (!ev.follow) { ev.follow = o.char.id; ev.lastWith = now(); ev.walked = 0; ev.ambushes = 0; ev.last = { x: ev.npc.x, z: ev.npc.z }; } return; }
    if (def.road.kind === 'rescue' && guardsDown(ev)) free(ev, o);
  }
  function activeDef(o, id) { const a = o.char.quests && o.char.quests.active && o.char.quests.active[id]; return a && a.def ? a.def : null; }
  /** Every online player on this event's quest (an escort's arrival counts for all of them). */
  function onQuest(ev) {
    const out = [];
    for (const o of online.values()) {
      const act = o.char.quests && o.char.quests.active;
      if (!act) continue;
      for (const a of Object.values(act)) if (a.def && a.def.road && a.def.road.ev === ev.id && a.def.road.room === ev.room.id) { out.push(o); break; }
    }
    return out;
  }
  const progress = (o, ev, what) => questEvent(o, { kind: 'use', vignette: 'road:' + ev.room.id + ':' + ev.id, name: what });
  function free(ev, by) {
    if (ev.freed) return;
    ev.freed = true;
    ev.follow = by.char.id; ev.lastWith = now(); ev.walked = 0; ev.ambushes = R.maxAmbush; ev.last = { x: ev.npc.x, z: ev.npc.z };
    ev.npc.loop('idle');
    ev.room.emit({ type: 'say', id: ev.npc.id, text: 'Free! Get me out of here — ' + (ev.town ? ev.town.name : 'home') + ', quick.', style: 'bark' });
    for (const o of onQuest(ev)) progress(o, ev, 'freed');
  }

  // ---- using / talking ----
  function use(o, obj) {
    const d = obj.data || {};
    if (!d.road) return false;
    const ev = events.get(d.road.ev);
    const s = o.conn;
    if (!ev) { if (s) s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'gone', msg: 'There is nothing here any more.' }); return true; }
    ev.touched = true;
    if (ev.kind === 'chest') {
      if (!guardsDown(ev)) { if (s) s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'guarded', msg: 'Not with its keepers still standing over it.' }); return true; }
      openUp(ev);
      if (!ev.rolled.has(o.char.id)) rollShare(ev, o);
      if (s) s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'chest', loot: true, name: obj.name });
      corpses.op(o, { op: 'open', id: obj.id });
      return true;
    }
    if (ev.kind === 'rescue' && !ev.freed && guardsDown(ev) && activeDef(o, 'road:rescue:' + ev.room.id + ':' + ev.id)) {
      free(ev, o);
      if (s) s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'npc', name: obj.name, says: ['Free at last!'], role: d.npc && d.npc.role });
      return true;
    }
    return false;             // the normal NPC answer (with our offers merged in by the province)
  }
  function talk(o, obj) {
    const d = obj.data || {};
    // deliveries: any NPC who is the named recipient, while the parcel is in the bag
    const act = (o.char.quests && o.char.quests.active) || {};
    for (const [id, a] of Object.entries(act)) {
      const def = a.def;
      if (!def || !def.road || def.road.kind !== 'deliver' || a.step >= def.steps.length) continue;
      const tg = def.road.target;
      if (!tg || obj.name !== tg.name || !(d.npc && d.npc.role === tg.role) || (o.room.kind === 'town' && o.room.name && o.room.name !== tg.town)) continue;
      const bag = o.char.bag || [];
      const i = bag.findIndex(it => it && it.quest === id);
      if (i < 0) { tell(o, 'You no longer have the ' + (def.road.item || 'parcel').toLowerCase() + '.'); continue; }
      const [it] = bag.splice(i, 1);
      journal(o, 'bagDel', { uid: it.uid }); o.dirty = true;
      if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [it.uid], gold: o.char.gold });
      o.room.emit({ type: 'say', id: obj.id, text: 'For me? About time. Here, for your legs.', style: 'bark' });
      const ev = events.get(def.road.ev) || { id: def.road.ev, room: { id: def.road.room } };
      questEvent(o, { kind: 'use', vignette: 'road:' + def.road.room + ':' + ev.id, name: 'delivered' });
      counters.roadDelivered = (counters.roadDelivered || 0) + 1;
      return { delivered: id };
    }
    // a curious wanderer: a lore line, and once a small tip
    if (d.wanderer && d.wanderer.curious) {
      const lore = W.lore || [];
      if (lore.length) o.room.emit({ type: 'say', id: obj.id, text: pick(lore), style: 'bark' });
      const fl = o.char.flags || {};
      const seen = fl.tips || {};
      if (!seen[d.key] && (W.tips || []).length) {
        const tip = pick(W.tips);
        const out = tipGive(o, obj, tip);
        if (out) {
          const keys = Object.entries({ ...seen, [d.key]: wallNow() }).sort((a, b) => b[1] - a[1]).slice(0, 60);
          o.char.flags = { ...fl, tips: Object.fromEntries(keys) };
          journal(o, 'set', { k: 'flags', v: o.char.flags }); o.dirty = true;
          counters.roadTips = (counters.roadTips || 0) + 1;
          return { tip: out };
        }
      }
      return { lore: true };
    }
    return null;
  }
  function tipGive(o, obj, tip) {
    if (tip.kind === 'gold') { const g = Math.round(range(tip.amount, 4)); grant(o, { items: [], gold: g, reason: 'tip', from: obj }); o.room.emit({ type: 'say', id: obj.id, text: tip.say, style: 'bark' }); return { kind: 'gold', gold: g }; }
    if (tip.kind === 'good') {
      const pv = provOf(o.room), c = pv && pv.L.shops && pv.L.shops.goodsCatalog && pv.L.shops.goodsCatalog[tip.id];
      if (!c) return null;
      grant(o, { items: [{ kind: 'good', id: tip.id, name: c.name, desc: c.desc || '', rarity: 'normal', stack: 1, ...(c.use ? { use: c.use } : {}) }], gold: 0, reason: 'tip', from: obj });
      o.room.emit({ type: 'say', id: obj.id, text: tip.say, style: 'bark' });
      return { kind: 'good', id: tip.id };
    }
    if (tip.kind === 'rumour') {
      const pv = provOf(o.room); if (!pv) return null;
      let best = null, bd = Infinity;
      for (const c of pv.L.camps || []) { if (!c.rank || c.rank === 'normal') continue; const dd = Math.hypot(c.x - obj.x, c.z - obj.z); if (dd < bd && dd > 60) { bd = dd; best = c; } }
      if (!best) return null;
      const place = best.name || ('the ' + compass(obj, best) + ', about ' + Math.round(bd / 50) * 50 + ' paces off');
      o.room.emit({ type: 'say', id: obj.id, text: fill(tip.say, { place }), style: 'bark' });
      return { kind: 'rumour', at: { x: Math.round(best.x), z: Math.round(best.z), r: 30 } };
    }
    return null;
  }

  // ---- per-second upkeep ----
  function tick() {
    const t = now();
    // new events near lone players in the wilds
    if (enabled) for (const o of online.values()) {
      if (!o.conn || !o.entity || o.entity.dead || !o.room || o.room.kind !== 'wilds') continue;
      if (!o.roadNextAt) { o.roadNextAt = t + range(R.firstSec, 60) * 1000; continue; }
      if (t < o.roadNextAt) continue;
      o.roadNextAt = t + range(R.gapSec, 200) * 1000;
      let inRoom = 0, close = false;
      for (const ev of events.values()) { if (ev.room !== o.room || ev.virtual) continue; inRoom++; if (Math.hypot(ev.x - o.entity.x, ev.z - o.entity.z) < R.quietM) close = true; }
      if (close || inRoom >= R.maxPerRoom) continue;
      try { spawnFor(o); } catch (err) { log('road event spawn', err && err.stack); }
    }
    for (const ev of [...events.values()]) {
      if (ev.room.removed || ev.room.closed) { events.delete(ev.id); continue; }
      if (ev.virtual) { if (t - ev.born > 3 * 3600000) events.delete(ev.id); continue; }
      const anyone = nearestPlayer(ev);
      if (ev.kind === 'chest') {
        if (!ev.opened && guardsDown(ev) && anyone && anyone.d <= 80) openUp(ev);
        if (ev.opened && ev.rolled.size && !corpses.hasLoot(ev.room, ev.chest)) { ev.emptyAt ||= t; if (t - ev.emptyAt > 4000) { end(ev); continue; } }
      }
      if (ev.leaveAt && t >= ev.leaveAt && ev.npc && !ev.npc.removed) { ev.room.remove(ev.npc); }
      if (ev.follow) followCheck(ev, t);
      if (ev.done && t >= ev.doneAt) { end(ev); continue; }
      const idleFor = t - ev.born;
      const stale = !ev.follow && !onQuest(ev).length && (idleFor > R.lifeSec * 1000 && (!anyone || anyone.d > 120));
      if (stale || idleFor > R.lifeSec * 4000) end(ev);
    }
  }
  function nearestPlayer(ev) {
    let best = null;
    for (const o of online.values()) if (o.room === ev.room && o.entity && !o.entity.dead) { const d = Math.hypot(o.entity.x - ev.x, o.entity.z - ev.z); if (!best || d < best.d) best = { o, d }; }
    return best;
  }
  function followCheck(ev, t) {
    const o = online.get(ev.follow);
    const n = ev.npc;
    if (!n || n.removed) return;
    // arrived: the escort reached the town's edge (the player may already have crossed into the town room)
    if (ev.town && Math.hypot(n.x - ev.town.x, n.z - ev.town.z) <= (ev.town.r || 40) + 25) return arrive(ev);
    const withThem = o && o.conn && o.room === ev.room && Math.hypot(o.entity.x - n.x, o.entity.z - n.z) < 80;
    const enteredTown = o && o.conn && o.room.kind === 'town' && o.room.name === (ev.town && ev.town.name) && Math.hypot(n.x - ev.town.x, n.z - ev.town.z) <= (ev.town.r || 40) + 90;
    if (enteredTown) return arrive(ev);
    if (withThem) ev.lastWith = t;
    else if (t - ev.lastWith > R.escortGiveUpSec * 1000) {
      for (const p of onQuest(ev)) { const id = Object.keys(p.char.quests.active).find(k => p.char.quests.active[k].def && p.char.quests.active[k].def.road && p.char.quests.active[k].def.road.ev === ev.id); if (id) { bookOf(p).abandon(p.char, id); questSaved(p); sendQuests(p); tell(p, n.name + ' gave up waiting for you and turned back.'); } }
      ev.follow = null; ev.freed = ev.kind === 'rescue' ? ev.freed : false; n.loop('idle');
    }
  }
  function arrive(ev) {
    if (ev.done) return;
    ev.done = true; ev.doneAt = now() + 8000; ev.follow = null;
    const thanks = D.thanks || ['Thank you.'];
    ev.room.emit({ type: 'say', id: ev.npc.id, text: fill(pick(thanks), { town: ev.town ? ev.town.name : 'town' }), style: 'bark' });
    ev.npc.loop('wave');
    for (const o of onQuest(ev)) progress(o, ev, 'arrived');
    counters.roadArrived = (counters.roadArrived || 0) + 1;
  }
  /** ~5 Hz: escorts walk a few metres behind whoever they follow; an ambush every `ambushEveryM` metres walked. */
  function move(dtMs) {
    for (const ev of events.values()) {
      if (!ev.follow || ev.done || !ev.npc || ev.npc.removed) continue;
      const o = online.get(ev.follow);
      if (!o || !o.entity || o.room !== ev.room) { ev.npc.loop('idle'); continue; }
      const n = ev.npc, p = o.entity;
      const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz);
      if (d > 40) { const k = (d - 4) / d; n.moveTo(n.x + dx * k, n.z + dz * k); }                    // fell behind a rider: hurries up
      else if (d > 3) { const stepM = Math.min(d - 3, 7 * dtMs / 1000); n.face(Math.atan2(dx, dz)); n.moveTo(n.x + dx / d * stepM, n.z + dz / d * stepM); n.loop('walk'); }
      else n.loop('idle');
      ev.walked += Math.hypot(n.x - ev.last.x, n.z - ev.last.z); ev.last = { x: n.x, z: n.z };
      if (ev.ambushes < R.maxAmbush && ev.walked >= R.ambushEveryM * (ev.ambushes + 1)) ambush(ev, o);
    }
  }
  function ambush(ev, o) {
    ev.ambushes++;
    const L = ev.pv.L, c = campNear(L, ev.npc.x, ev.npc.z);
    if (!c) return;
    const p = o.entity, a = Math.atan2(p.x - ev.npc.x, p.z - ev.npc.z);
    const n = 2;
    for (let i = 0; i < n; i++) {
      const aa = a + (i ? 0.6 : -0.6);
      let x = p.x + Math.sin(aa) * 16, z = p.z + Math.cos(aa) * 16;
      if (ev.room.walkable && !ev.room.walkable(x, z)) { x = p.x + Math.sin(aa) * 8; z = p.z + Math.cos(aa) * 8; }
      ev.guards.push(ev.room.spawn({ kind: 'monster', type: c.type, level: ev.level, x, z, yaw: aa + Math.PI, rank: 'normal', data: { roadEvent: ev.id, ambush: true } }));
    }
    ev.room.emit({ type: 'say', id: ev.npc.id, text: 'There — in the grass! Here they come!', style: 'bark' });
    counters.roadAmbush = (counters.roadAmbush || 0) + 1;
  }

  return { tick, move, use, offers, accepted, talk, events, spawnFor, end, stats: () => ({ live: events.size, ...Object.fromEntries(Object.entries(counters).filter(([k]) => k.startsWith('road'))) }) };
}

const ROLE_WORD = { smith: 'smith', merchant: 'merchant', innkeeper: 'innkeeper', elder: 'elder', apothecary: 'apothecary', healer: 'healer', provisioner: 'provisioner', tailor: 'tailor', armourer: 'armourer', bowyer: 'bowyer', jeweller: 'jeweller', trader: 'trader', stablehand: 'stablehand' };
function roleWord(r) { return ROLE_WORD[r] || String(r || 'townsperson').replace(/_/g, ' '); }
function plural(type) { const s = String(type || '').replace(/_/g, ' '); return /s$/.test(s) ? s : /(ch|sh|x)$/.test(s) ? s + 'es' : /[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s + 's'; }
function compass(a, b) { const ang = Math.atan2(b.x - a.x, -(b.z - a.z)); const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']; return dirs[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8]; }
