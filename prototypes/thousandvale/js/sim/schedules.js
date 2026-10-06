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
const NAMES = { barber: 'Barber', smith: 'Smith', merchant: 'Merchant', innkeeper: 'Innkeeper', elder: 'Elder', healer: 'Healer', unbinder: 'Unbinder', broker: 'Broker',
  stablehand: 'Stablehand', townsfolk: 'Townsfolk', farmer: 'Farmer', miller: 'Miller', guard: 'Guard' };

/** Which block of a schedule applies at day fraction t (blocks start at a phase name or a fraction; the last one wraps past midnight). */
export function blockAt(blocks, t, phases) {
  const at = b => (typeof b.from === 'number' ? b.from : phases[b.from] ?? 0);
  const sorted = blocks.slice().sort((a, b) => at(a) - at(b));
  let cur = sorted[sorted.length - 1];
  for (const b of sorted) if (at(b) <= t) cur = b;
  return cur;
}

/**
 * OFFICES (play-test 2, Q10: "the Elder, merchant, smith, broker, unbinder… all went to the same house and stood on top of
 * each other"). Two faults: every role restarted the plot counter (`used.clear()` per role), so each took the FIRST plot of
 * its kind — or the same fallback — and at night every role walked to the one inn door. Now every NPC with a service gets
 * an office of its own: a plot of the kind it wants that nobody else has claimed (the smith a forge, the merchant a
 * market…), else any unclaimed special building, else a house taken over as a shop. A service NPC stays at its office day
 * and night (its service never switches off, so the player always knows where to find it). `lit` = hang a lamp on it
 * (shops draw the eye; the elder's hall does not). Everybody else is spread out where they gather (a slot each).
 */
export const OFFICES = Object.freeze({
  smith: { want: ['forge'], kind: 'forge', lit: true },
  merchant: { want: ['market'], kind: 'shop', lit: true },
  innkeeper: { want: ['inn'], kind: 'inn', lit: true },
  elder: { want: ['hall'], kind: 'hall', lit: false },
  healer: { want: ['chapel', 'shrine'], kind: 'chapel', lit: false },
  unbinder: { want: ['shrine', 'chapel', 'hall'], kind: 'study', lit: false },
  broker: { want: ['warehouse', 'granary'], kind: 'office', lit: true },
  stablehand: { want: ['stable'], kind: 'stable', lit: true },
  barber: { want: [], kind: 'barber', lit: true },
  miller: { want: ['mill'], kind: 'mill', lit: false },
});
/** A role that sells (E's `service` names a sale) but is not in OFFICES: a shop with a lamp. */
const SHOPLIKE = /sell|buy|trade|goods|wares|craft|repair|potion|food|drink|cloth|tailor|herb|fish|leather|bread/i;
const SPECIAL = new Set(['forge', 'market', 'inn', 'hall', 'chapel', 'shrine', 'warehouse', 'granary', 'stable', 'mill', 'barracks', 'watchpost']);
const NO_OFFICE = new Set(['townsfolk', 'guard', 'farmer']);

export function townFolk(town, { plan = null, schedules, kind = 'town', key = 'town', questNpcs = [], onlyFolk = false, taken = [] }) {
  const S = schedules;
  const plots = (plan && plan.buildings) || [];
  const square = (plan && plan.square) || { x: town.x, z: town.z };
  const front = p => { const d = (p.d || 6) / 2 + 1.2; return { x: p.x + Math.sin(p.yaw || 0) * d, z: p.z + Math.cos(p.yaw || 0) * d, yaw: (p.yaw || 0) + Math.PI }; };
  const used = new Map();          // plot want -> how many have been sent to that kind (round robin over its plots)
  const crowd = new Map();         // an anchor point key -> how many stand there (each gets a slot of its own)
  const claimed = new Set();       // plot ids (or indexes) an office has taken
  const plotKey = p => p.id || (p.x.toFixed(1) + ',' + p.z.toFixed(1));
  // stream E's offices.json already placed the working NPCs (onlyFolk): their doors are taken spots, their plots claimed
  for (const t of taken) { if (t.plot) claimed.add(t.plot); if (Number.isFinite(t.x)) { const k0 = Math.round(t.x * 2) + ',' + Math.round(t.z * 2); crowd.set(k0, (crowd.get(k0) || 0) + 1); } }
  /** Spread the k-th person at the same point along an arc in front of it (no two stand on one spot). */
  function slot(at) {
    const k0 = Math.round(at.x * 2) + ',' + Math.round(at.z * 2);
    const k = crowd.get(k0) || 0; crowd.set(k0, k + 1);
    if (!k) return at;
    const yaw = at.yaw || 0, ring = 1 + Math.floor((k - 1) / 6), side = ((k - 1) % 6) - 2.5;
    const r = 1.4 * ring, a = side * 0.72 / ring;          // ~1 m between neighbours on each ring
    // the arc opens toward where the person faces (away from the door)
    return { x: at.x + Math.sin(yaw + a) * r, z: at.z + Math.cos(yaw + a) * r, yaw };
  }
  function anchor(name, who, depth = 0) {
    const a = S.anchors[name];
    if (!a || depth > 4) return { x: square.x + 2, z: square.z + 2, yaw: 0 };
    if (a.special === 'home' || name === 'home') {
      const homes = plots.filter(p => (p.want === 'house' || p.want === 'hut') && !claimed.has(plotKey(p)));
      if (homes.length) return front(homes[hash(who) % homes.length]);
    } else if (a.special === 'gate' || name === 'gate') {
      const ang = (hash(who) % 4) * Math.PI / 2 + 0.4;
      return { x: town.x + Math.cos(ang) * (town.r - 4), z: town.z + Math.sin(ang) * (town.r - 4), yaw: ang + Math.PI };
    } else if (a.placement === 'town_square' || name === 'square') return { x: square.x + 1.5, z: square.z + 1.5, yaw: 0 };
    else if (a.special === 'settlement centre' || name === 'centre') return { x: town.x, z: town.z, yaw: 0 };
    for (const w of a.want || []) {
      const ps = plots.filter(p => p.want === w);
      if (ps.length) { const n = used.get(w) || 0; used.set(w, n + 1); return front(ps[n % ps.length]); }
    }
    for (const fb of a.fallback || []) if (fb !== name) return anchor(fb, who, depth + 1);
    return { x: square.x + 2, z: square.z + 2, yaw: 0 };
  }
  /** Claim an office for a role: its wanted kinds first, then any free special building, then a free house. */
  function office(role, def, who) {
    const o = OFFICES[role] || (def && (def.service || []).some(x => SHOPLIKE.test(x)) ? { want: ['market', 'warehouse', 'granary'], kind: 'shop', lit: true } : { want: [], kind: 'office', lit: false });
    const free = p => !claimed.has(plotKey(p));
    // stream B tags plots with the role they were planned for (town-offices.json): that plot first, never doubled up
    let p = plots.find(q => q.role === role && free(q)) || null;
    if (!p) for (const w of o.want) { p = plots.find(q => q.want === w && free(q)); if (p) break; }
    if (!p && o.kind !== 'barber') p = plots.find(q => SPECIAL.has(q.want) && q.want !== 'inn' && free(q) && !Object.values(OFFICES).some(x => x.want[0] === q.want && x.kind !== o.kind));
    if (!p) { const homes = plots.filter(q => (q.want === 'house' || q.want === 'hut') && free(q)); if (homes.length) p = homes.slice().sort((a, b) => Math.hypot(a.x - square.x, a.z - square.z) - Math.hypot(b.x - square.x, b.z - square.z))[hash(who) % Math.min(3, homes.length)]; }
    if (!p) {                       // no buildings at all (a camp, a test town): a spot of its own round the square
      const n = claimed.size; claimed.add('spot:' + n);
      const ang = n * 0.9;
      return { at: { x: square.x + Math.cos(ang) * 6, z: square.z + Math.sin(ang) * 6, yaw: ang + Math.PI }, office: { kind: o.kind, plot: null, lit: !!o.lit } };
    }
    claimed.add(plotKey(p));
    const f = front(p);
    return { at: f, office: { kind: o.kind, plot: p.id || null, want: p.want || null, x: round1(p.x), z: round1(p.z), yaw: round2(p.yaw || 0), w: p.w || null, d: p.d || null, lit: !!o.lit } };
  }
  const phases = S.clock.phases;
  const out = [];
  const roles = (S.perTown[kind] || S.perTown.town || []).filter(r => !onlyFolk || NO_OFFICE.has(r));
  const guards = (S.perTown.guards || {})[kind] ?? 0;
  for (let g = 0; g < guards; g++) roles.push('guard');
  // offices first, in a fixed order (the smith gets the forge before anybody falls back to it)
  const order = roles.map((role, i) => ({ role, i })).sort((a, b) => (OFFICES[a.role] ? 0 : 1) - (OFFICES[b.role] ? 0 : 1) || a.i - b.i);
  const made = [];
  for (const { role, i } of order) {
    const who = `npc:${key}:${role}:${i}`;
    const def = role === 'guard' ? S.guard : S.roles[role];
    if (!def) continue;
    const hasService = !NO_OFFICE.has(role) && (OFFICES[role] || (def.service && def.service.length));
    let blocks, off = null;
    if (hasService) {
      const o = office(role, def, who);
      off = o.office;
      blocks = [{ from: 0, at: slot(o.at), do: 'work' }];          // staffed day and night
    } else {
      blocks = (def.blocks || []).map(b => ({ from: typeof b.from === 'number' ? b.from : phases[b.from] ?? 0, at: slot(anchor(b.at, who)), do: b.do || 'stand' }));
    }
    if (!blocks.length) continue;
    const now = blockAt(blocks, 0.5, phases);
    made.push({ i, npc: { type: 'npc', name: def.name || NAMES[role] || role, x: now.at.x, z: now.at.z, yaw: now.at.yaw, key: who,
      npc: { role, says: [], service: def.service || null }, schedule: { blocks, says: def.says || null }, ...(off ? { office: off } : {}) } });
  }
  made.sort((a, b) => a.i - b.i);
  for (const m of made) out.push(m.npc);
  // town quest NPCs keep their spot by day and go to the inn at night (still offering and taking quests there), each
  // with a place of their own at the inn
  const inn = anchor('inn', 'quest');
  for (const q of questNpcs) q.schedule = { blocks: [{ from: phases.dawn, at: { x: q.x, z: q.z, yaw: q.yaw || 0 }, do: 'stand' }, { from: phases.night, at: slot(inn), do: 'drink' }], says: null };
  return out;
}
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;
