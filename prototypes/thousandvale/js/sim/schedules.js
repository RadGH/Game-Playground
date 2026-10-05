// TOWN FOLK and their day (stream A, stream E's data/provinces/schedules.json; PLAN §4.3). Pure.
//
//   townFolk(town, { plan, schedules, kind, seed, questNpcs }) -> npc object specs for the town's room
//   blockAt(schedule, dayFrac, phases) -> the block a schedule is in at that time of day
//
// Each role in `perTown[kind]` (+ guards) becomes an `npc` object whose `schedule.blocks` are [{from: day fraction,
// at: {x, z, yaw}, do}] — anchors resolved against stream B's town plan (data/zones/<zone>/placements.json:
// `building` plots by `want`, `town_square`; `gate` = a point on the ring; `home` = a house/hut picked by a hash of
// the NPC's key). An anchor the town lacks walks its `fallback` list. A role's service never switches off: at night
// the role is at the inn or home and still answers (`npc.role` stays). Barks: `schedule.says {day, night}`.

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const NAMES = { smith: 'Smith', merchant: 'Merchant', innkeeper: 'Innkeeper', elder: 'Elder', healer: 'Healer', unbinder: 'Unbinder', broker: 'Broker',
  stablehand: 'Stablehand', townsfolk: 'Townsfolk', farmer: 'Farmer', miller: 'Miller', guard: 'Guard' };

/** Which block of a schedule applies at day fraction t (blocks start at a phase name or a fraction; the last one wraps past midnight). */
export function blockAt(blocks, t, phases) {
  const at = b => (typeof b.from === 'number' ? b.from : phases[b.from] ?? 0);
  const sorted = blocks.slice().sort((a, b) => at(a) - at(b));
  let cur = sorted[sorted.length - 1];
  for (const b of sorted) if (at(b) <= t) cur = b;
  return cur;
}

export function townFolk(town, { plan = null, schedules, kind = 'town', key = 'town', questNpcs = [] }) {
  const S = schedules;
  const plots = (plan && plan.buildings) || [];
  const square = (plan && plan.square) || { x: town.x, z: town.z };
  const front = p => { const d = (p.d || 6) / 2 + 1.2; return { x: p.x + Math.sin(p.yaw || 0) * d, z: p.z + Math.cos(p.yaw || 0) * d, yaw: (p.yaw || 0) + Math.PI }; };
  const used = new Map();
  function anchor(name, who, depth = 0) {
    const a = S.anchors[name];
    if (!a || depth > 4) return { x: square.x + 2, z: square.z + 2, yaw: 0 };
    if (a.special === 'home' || name === 'home') {
      const homes = plots.filter(p => p.want === 'house' || p.want === 'hut');
      if (homes.length) return front(homes[hash(who) % homes.length]);
    } else if (a.special === 'gate' || name === 'gate') {
      const ang = (hash(who) % 4) * Math.PI / 2 + 0.4;
      return { x: town.x + Math.cos(ang) * (town.r - 4), z: town.z + Math.sin(ang) * (town.r - 4), yaw: ang + Math.PI };
    } else if (a.placement === 'town_square' || name === 'square') return { x: square.x + 1.5, z: square.z + 1.5, yaw: 0 };
    else if (a.special === 'settlement centre' || name === 'centre') return { x: town.x, z: town.z, yaw: 0 };
    for (const w of a.want || []) {
      const ps = plots.filter(p => p.want === w);
      if (ps.length) {
        const n = used.get(w) || 0; used.set(w, n + 1);
        const f = front(ps[n % ps.length]);
        const k = Math.floor(n / ps.length);                       // a few people share a door: stand side by side
        return { x: f.x + Math.cos(f.yaw) * 1.2 * k, z: f.z - Math.sin(f.yaw) * 1.2 * k, yaw: f.yaw };
      }
    }
    for (const fb of a.fallback || []) if (fb !== name) return anchor(fb, who, depth + 1);
    return { x: square.x + 2, z: square.z + 2, yaw: 0 };
  }
  const phases = S.clock.phases;
  const out = [];
  const roles = (S.perTown[kind] || S.perTown.town || []).slice();
  const guards = (S.perTown.guards || {})[kind] ?? 0;
  for (let g = 0; g < guards; g++) roles.push('guard');
  roles.forEach((role, i) => {
    const who = `npc:${key}:${role}:${i}`;
    const def = role === 'guard' ? S.guard : S.roles[role];
    if (!def) return;
    used.clear();
    const blocks = (def.blocks || []).map(b => ({ from: typeof b.from === 'number' ? b.from : phases[b.from] ?? 0, at: anchor(b.at, who), do: b.do || 'stand' }));
    if (!blocks.length) return;
    const now = blockAt(blocks, 0.5, phases);
    out.push({ type: 'npc', name: def.name || NAMES[role] || role, x: now.at.x, z: now.at.z, yaw: now.at.yaw, key: who,
      npc: { role, says: [], service: def.service || null }, schedule: { blocks, says: def.says || null } });
  });
  // town quest NPCs keep their spot by day and go to the inn at night (still offering and taking quests there)
  const inn = anchor('inn', 'quest');
  for (const q of questNpcs) q.schedule = { blocks: [{ from: phases.dawn, at: { x: q.x, z: q.z, yaw: q.yaw || 0 }, do: 'stand' }, { from: phases.night, at: inn, do: 'drink' }], says: null };
  return out;
}
