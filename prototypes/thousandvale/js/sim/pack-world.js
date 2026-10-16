// The province's side of the WANDERING PACKS (owner 2026-10-16). Pure: no DOM, no Node APIs.
// js/sim/province.js makes ONE of these and calls three hooks; everything else lives here, so the province file only
// carries the joins (tagged [Packs]):
//
//   const W = createPackWorld({ P, online, now, isNight, log, counters, tickMs })
//   W.tick()            every province tick: each wilds copy's packs (made on the copy's first tick, js/sim/packs.js)
//   W.observe(ev, r)    a room event: hits on pack members (who is fighting which pack)
//   W.packsOf(r)        the copy's pack runner (tests, the events, ops)
//
// THE SPOILS. When a pack is wiped its spoils are left where it fell: a bundle of packs (a road-event `packs` chest look)
// that only those who fought it can open — one item of at least the tier in packs.json `rules.spoils` (magic; rare for
// a pack that had a leader) and chest gold, once per character — plus a share of a level of experience paid at once,
// and one line in their chat saying so.

import { createPacks } from './packs.js';

export function createPackWorld({ P, online, now, isNight, log = () => {}, counters = {}, tickMs = 50 }) {
  function bandAtFor(L) {
    return (x, z) => { const key = L.zoneOf ? L.zoneOf(x, z) : null; const zs = (L.zones || []).find(q => q.key === key); return (zs && zs.sheet && zs.sheet.band) || (L.sheet && L.sheet.band) || [1, 4]; };
  }
  function make(pv, r) {
    const L = pv.L;
    r.packsMade = true;
    if (!L.packs || !L.packRoutes || !Array.isArray(L.packRoutes.routes) || !L.packRoutes.routes.length) return;
    // the pack dice: a stream of the copy's own (seeded by the room, so a restart rolls new packs: round 11 #6)
    const rng = () => r.host.random('packs');
    try {
      r.packs = createPacks({ room: r, routes: L.packRoutes.routes, comps: L.packs.compositions || {}, rules: L.packs.rules || {}, rng, bandAt: bandAtFor(L), isNight, log,
        onWipe: (info, pk) => spoils(r, info, L.packs.rules || {}, pk), uidPrefix: 'pk:' });
    } catch (err) { log('packs failed', err && err.stack); }
  }
  function tick() {
    for (const pv of P.values()) for (const r of pv.copies) {
      if (!r.packsMade) make(pv, r);
      if (r.packs) { try { r.packs.step(tickMs); } catch (err) { log('packs step', err && err.stack); } }
    }
  }
  function observe(ev, r) {
    if (r.packs && ev.type === 'hit') r.packs.onHit(ev);
  }
  function spoils(r, info, rules, pk) {
    const S = { plain: 'magic', led: 'rare', xpShare: 0.05, xpShareLed: 0.08, minutes: 3, ...(rules.spoils || {}) };
    const who = [...info.contrib.keys()];
    counters.packsWiped = (counters.packsWiped || 0) + 1;
    if (!who.length) return;           // nobody fought it (a body lost some other way): nothing to leave
    const level = Math.max(1, (info.level || 1) + (info.led ? 1 : 0));
    const chest = r.spawn({ kind: 'object', type: 'chest', name: info.lead ? `${info.lead}'s spoils` : `Spoils of the ${info.name}`, x: info.x, z: info.z, team: 0,
      data: { state: 'idle', look: 'packs', packSpoils: info.uid, chest: { key: 'pack:' + info.uid + ':' + Math.round(now()), tier: info.led ? S.led : S.plain, level, only: who, onceMs: 3600000 } } });
    r.host.despawn(chest, S.minutes * 60000);
    counters.packSpoils = (counters.packSpoils || 0) + 1;
    let span = 100;
    try { span = Math.max(1, (r.rules.xpFor(level + 1) || 0) - (r.rules.xpFor(level) || 0)); } catch { /* stand-in rules */ }
    let mult = 1; try { mult = (r.rules.xpMult && r.rules.xpMult('event')) || 1; } catch { /* none */ }
    const xp = Math.round(span * (info.led ? S.xpShareLed : S.xpShare) * mult);
    for (const c of who) {
      const o = online.get(c);
      if (!o || o.room !== r || !o.entity || o.entity.dead) continue;
      r.award(o.entity, { xp, gold: 0, reason: 'pack' });
      if (o.conn) o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: 'The Vale', text: `${info.lead ? info.lead + ' and the ' + info.name.toLowerCase() : 'The ' + info.name.toLowerCase()} ${info.lead ? 'are' : 'is'} broken: +${xp} XP. The spoils lie where they fell — only those who fought can open them.` });
    }
  }
  return { tick, observe, packsOf: r => r.packs || null };
}
