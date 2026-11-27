// Oathwild dungeons — who lives where (brainstorm 2026-11-27-regions §3). Pure, seeded.
//
//   planEncounters(plan, spec, seed, walk?) → { packs: [...], skipped: [...] }
//   pack = { id, kind: 'pack' | 'elite' | 'named' | 'boss' | 'patrol', level, monsterLevel, room, home: [x, z],
//            notice, members: [{ monster, at: [x, z], lead?, elite?, named?, boss? }], route?: [[x, z]…] }
//
// Packs stand on OPEN tiles inside their room: the pack's middle ≥ 3 m from any wall / column / sarcophagus, each member
// ≥ 1.5 m clear and ≥ 2 m from its mates, the middle ≥ 8 m from the room's doors (no ambush in the doorway; 5 m in a small room with doors all round) and big
// rooms hold several packs spread ≥ 12 m apart. Patrols walk a corridor between two rooms (route = room → corridor →
// room). The spec's monster ids come from data/monsters.json (a few new ones are listed in the README).
// `skipped` names any pack that found no room to stand (a test keeps it empty for the shipped dungeons).
import { makeRng, hashStr } from '../../rules/farhold.js';
import { createWalk } from './walk.js';

const r2 = v => Math.round(v * 100) / 100;

export function planEncounters(plan, spec, seed = 1, walk = null) {
  const W = walk || createWalk(plan);
  const rng = makeRng(((seed >>> 0) ^ hashStr(`${spec.id}:encounters`)) >>> 0);
  const clear = W.clearance();
  const packs = [], skipped = [];
  const centres = new Map();          // room id → pack middles already used
  const doorsOf = id => plan.doors.filter(d => d.room === id);
  const notice = spec.notice?.range ?? 16;
  let n = 0;

  function spotFor(room, minSep, doorGap = 8, minClear = 3) {
    const [x0, z0, x1, z1] = room.rect, used = centres.get(room.id) || [];
    const doors = doorsOf(room.id);
    const out = [];
    for (let z = z0 + 1; z < z1; z += W.tile) for (let x = x0 + 1; x < x1; x += W.tile) {
      const t = W.tileOf(x, z);
      if (t < 0 || !W.pass[t] || clear[t] < minClear) continue;
      if (doors.some(d => Math.hypot(x - d.at[0], z - d.at[1]) < doorGap)) continue;
      if (used.some(u => Math.hypot(x - u[0], z - u[1]) < minSep)) continue;
      out.push([x, z]);
    }
    return out.length ? rng.pick(out) : null;
  }
  function memberSpot(home, placed) {
    for (let rad = 2.5; rad <= 7; rad += 0.75) {
      const a0 = rng() * Math.PI * 2;
      for (let j = 0; j < 10; j++) {
        const a = a0 + j * Math.PI * 2 / 10, x = home[0] + Math.sin(a) * rad, z = home[1] + Math.cos(a) * rad;
        const t = W.tileOf(x, z);
        if (t < 0 || !W.pass[t] || clear[t] < 1.5 || !W.fits(x, z, 0.7)) continue;
        if (placed.some(p => Math.hypot(x - p[0], z - p[1]) < 2)) continue;
        return [r2(x), r2(z)];
      }
    }
    return null;
  }
  function placePack(room, L, ids, { kind = 'pack', lead = null, named = null, boss = false } = {}) {
    const min = Math.min(room.rect[2] - room.rect[0], room.rect[3] - room.rect[1]);
    const home = spotFor(room, Math.min(12, min * 0.45)) || spotFor(room, 6) || spotFor(room, 6, 5, 2.5);     // a small crypt with doors on every side: closer to a door
    const id = `${kind}-${room.id}-${n++}`;
    if (!home) { skipped.push({ id, room: room.id }); return; }
    if (!centres.has(room.id)) centres.set(room.id, []);
    centres.get(room.id).push(home);
    const members = [], placed = [];
    if (lead) { members.push({ monster: lead, at: [r2(home[0]), r2(home[1])], lead: true, ...(named ? { named } : {}), ...(kind === 'elite' ? { elite: true } : {}), ...(boss ? { boss: true } : {}) }); placed.push(home); }
    for (const m of ids) {
      const at = memberSpot(home, placed);
      if (!at) { skipped.push({ id, room: room.id, monster: m }); continue; }
      placed.push(at); members.push({ monster: m, at });
    }
    packs.push({ id, kind, level: room.level, monsterLevel: L.monsterLevel, room: room.id, home: [r2(home[0]), r2(home[1])], notice, members });
  }
  function patrolOn(c, L, ids) {
    const into = d => { const p = W.standAt(d.at[0] - Math.sin(d.facing) * 6, d.at[1] - Math.cos(d.facing) * 6, 0.7); return [r2(p.x), r2(p.z)]; };
    const da = plan.doors.find(d => d.corridor === c.id && d.room === c.a), db = plan.doors.find(d => d.corridor === c.id && d.room === c.b);
    const A = into(da), B = into(db);
    const mid = W.standAt((c.rect[0] + c.rect[2]) / 2, (c.rect[1] + c.rect[3]) / 2, 0.7);
    const route = [[A[0], A[1]], [r2(mid.x), r2(mid.z)], [B[0], B[1]]];
    const members = [], placed = [];
    for (const m of ids) { const at = placed.length ? memberSpot(route[0], placed) : route[0]; if (!at) { skipped.push({ id: c.id, monster: m }); continue; } placed.push(at); members.push({ monster: m, at }); }
    packs.push({ id: `patrol-${c.id}-${n++}`, kind: 'patrol', level: c.level, monsterLevel: L.monsterLevel, room: null, corridor: c.id, home: route[0], notice, members, route });
  }

  for (const [li, L] of spec.levels.entries()) {
    const rooms = plan.rooms.filter(r => r.level === li + 1 && !r.entrance);
    for (const e of L.encounters || []) {
      if (e.room) {
        const room = plan.rooms.find(r => r.id === e.room);
        if (!room) { skipped.push({ id: e.room, why: 'no such room' }); continue; }
        placePack(room, L, e.pack || [], { kind: e.named ? 'named' : e.elite ? 'elite' : 'pack', lead: e.lead || null, named: e.named || null });
        continue;
      }
      for (const room of rooms.filter(r => e.rooms.includes(r.kind) && !r.boss)) {
        const [lo, hi] = e.perRoom || [1, 1];
        for (let j = rng.int(lo, hi); j > 0; j--) placePack(room, L, e.pack, {});
      }
    }
    if (L.boss) {
      const room = plan.rooms.find(r => r.id === L.boss.room);
      if (room) placePack(room, L, L.boss.guards || [], { kind: 'boss', lead: L.boss.id, boss: true });
      else skipped.push({ id: L.boss.room, why: 'no such room' });
    }
    const corrs = rng.shuffle(plan.corridors.filter(c => c.level === li + 1 && !c.ramp && !c.gate && !c.secret));
    for (const p of L.patrols || []) for (let j = 0; j < (p.count || 1) && corrs.length; j++) patrolOn(corrs.shift(), L, p.pack);
  }
  return { packs, skipped };
}
