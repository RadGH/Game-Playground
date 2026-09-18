// Farhold — traders on the road, and the four ways to meet one.
//
// PURE JavaScript: no Three.js, no DOM. A caravan is a vehicle, some guards and a manifest, moving
// settlement to settlement along the road graph the world already grew. It is a position and a clock
// until you are near it.
//
//   import { createCaravans } from './caravans.js';
//   const trade = createCaravans({ territory, factions, standings, seed });
//   trade.dispatch(zone, [townA, townB]);   // one sets off
//   trade.update(seconds);                  // it travels, and may be ambushed
//   trade.escort(id);  trade.rob(id);  trade.arrive(id);
//
// THE FOUR WAYS ARE ONE OBJECT. Trade with it, walk it home, rob it, or find its wreck — the same
// caravan, in four states. That is what stops "escort quest" from being a separate content type with
// its own spawner: the thing you escort is the thing that was going to travel anyway.

const SPEED = 2.4;              // metres a second — a loaded cart
const AMBUSH_SHARE = 0.6;       // how far along the road trouble finds an unescorted one

function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h >>> 0;
}
function rngFrom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** The ten manifests. `gives` is what comes off it if you trade, escort or rob it. */
export const CARGO = {
  salt_meat:     { name: 'Salt and cured meat', faction: 'greenhand',     gives: { rations: [8, 20] } },
  forge_iron:    { name: 'Forge iron',          faction: 'emberwrights',  gives: { material: 'scrap', amount: [20, 60] } },
  lamp_oil:      { name: 'Lamp oil',            faction: 'longsight',     gives: { torches: [4, 10] } },
  warded_relics: { name: 'Warded relics',       faction: 'lantern_house', gives: { item: 'magic', tags: ['relic'] } },
  bound_essence: { name: 'Bound essence',       faction: 'deepworn',      gives: { material: 'essence', amount: [4, 12] } },
  wool_hide:     { name: 'Wool and hide',       faction: 'greenhand',     gives: { item: 'normal', category: 'armor' } },
  coast_catch:   { name: 'Coast catch',         faction: 'saltbound',     gives: { rations: [6, 14] } },
  toll_coin:     { name: 'Toll coin',           faction: 'stonecount',    gives: { gold: [200, 700] }, guards: 5 },
  powder_shot:   { name: 'Powder and shot',     faction: 'cutwater',      gives: { quiver: [20, 60] } },
  grave_goods:   { name: 'Grave goods',         faction: 'quiet_wake',    gives: { item: 'rare', cursed: true } },
};

const VEHICLES = ['handCart', 'packMule', 'coveredWagon', 'oxCart', 'closedCoach'];

export function createCaravans({ territory = null, factions = null, standings = null, seed = 1 } = {}) {
  const all = new Map();
  let clock = 0, made = 0;

  /**
   * Send one out. `route` is `[{x,z,name}, …]` — real settlements and the road between them, so the
   * caravan travels somewhere that exists and arrives somewhere that exists.
   */
  function dispatch(zone, route = [], { cargo = null, escorted = false } = {}) {
    if (!zone || route.length < 2) return null;
    const rng = rngFrom(hash(seed, 'caravan', zone.id, made++));
    const record = territory?.of?.(zone.id);
    const holder = (factions?.factions || []).find(f => f.key === record?.holder);
    const key = cargo || holder?.cargo || 'salt_meat';
    const manifest = CARGO[key] || CARGO.salt_meat;
    const name = `the ${manifest.name.toLowerCase()} run`;

    const span = route.reduce((sum, p, i) => i ? sum + Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) : 0, 0);
    const row = {
      id: `c${zone.id}_${made}`,
      type: 'caravan',
      name, cargo: key, manifest,
      faction: manifest.faction, zoneId: zone.id,
      vehicle: VEHICLES[Math.floor(rng() * VEHICLES.length) % VEHICLES.length],
      guards: manifest.guards ?? (2 + Math.floor(rng() * 3)),
      route, leg: 0, t: 0,
      x: route[0].x, z: route[0].z,
      from: route[0].name, to: route[route.length - 1].name,
      span, travelled: 0,
      // seconds until it is expected — a caravan that passes this without arriving is `overdue`,
      // which is exactly what the `overdue_caravan` frame binds to
      due: span / SPEED * 1.35,
      age: 0,
      state: 'loading',        // loading | travelling | ambushed | wrecked | arrived | robbed
      escorted, ambushAt: AMBUSH_SHARE + rng() * 0.25,
      ambushed: false,
    };
    all.set(row.id, row);
    return row;
  }

  /** Travel. Unescorted caravans meet trouble at a point along the road and stop there. */
  function update(seconds, { playerNear = null } = {}) {
    clock += seconds;
    const events = [];
    for (const row of all.values()) {
      if (row.state === 'arrived' || row.state === 'wrecked' || row.state === 'robbed') continue;
      row.age += seconds;
      if (row.state === 'loading') {
        // it waits a little before it goes, which is the window the escort job is offered in
        if (row.age > 60) { row.state = 'travelling'; events.push({ kind: 'caravan-left', id: row.id, name: row.name }); }
        continue;
      }
      if (row.state === 'ambushed') continue;

      const from = row.route[row.leg], to = row.route[row.leg + 1];
      if (!to) { arrive(row.id); events.push({ kind: 'caravan-arrived', id: row.id, name: row.name }); continue; }
      const legSpan = Math.hypot(to.x - from.x, to.z - from.z) || 1;
      const step = SPEED * seconds;
      row.t += step / legSpan;
      row.travelled += step;
      while (row.t >= 1 && row.route[row.leg + 1]) {
        row.t -= 1; row.leg++;
        if (!row.route[row.leg + 1]) break;
      }
      const a = row.route[row.leg], b = row.route[row.leg + 1] || a;
      row.x = a.x + (b.x - a.x) * row.t;
      row.z = a.z + (b.z - a.z) * row.t;

      const share = row.span ? row.travelled / row.span : 1;
      if (!row.ambushed && !row.escorted && share >= row.ambushAt) {
        row.ambushed = true;
        row.state = 'ambushed';
        // if you are not there to see it, it is a wreck by the time anyone walks past
        const close = playerNear && Math.hypot(playerNear.x - row.x, playerNear.z - row.z) < 400;
        if (!close) {
          row.state = 'wrecked';
          if (territory) territory.press(row.zoneId, -0.04, { claim: 0.04 });
        }
        events.push({ kind: close ? 'caravan-attacked' : 'caravan-wrecked', id: row.id, name: row.name, x: row.x, z: row.z });
      }
      if (share >= 1) { arrive(row.id); events.push({ kind: 'caravan-arrived', id: row.id, name: row.name }); }
    }
    return events;
  }

  /** You said you would walk with it. */
  function escort(id) {
    const row = all.get(id);
    if (!row) return null;
    row.escorted = true;
    if (row.state === 'loading') row.state = 'travelling';
    return row;
  }

  /** It got there. Everyone who cares is pleased. */
  function arrive(id) {
    const row = all.get(id);
    if (!row || row.state === 'arrived') return null;
    row.state = 'arrived';
    if (row.escorted) {
      if (standings && row.faction) standings.deed(row.faction, 'caravan_escorted');
      if (territory) territory.press(row.zoneId, 0.04);
    }
    return row;
  }

  /** You took it. This is the one the road remembers. */
  function rob(id) {
    const row = all.get(id);
    if (!row || row.state === 'robbed') return null;
    row.state = 'robbed';
    if (standings && row.faction) standings.deed(row.faction, 'caravan_robbed');
    if (territory) {
      territory.press(row.zoneId, -0.05, { claim: 0.05 });
      // a lost load is why a zone goes short
      territory.addIncident(row.zoneId, {
        kind: 'hunger', name: 'Short rations',
        blurb: 'nothing has come up the road in a week',
      }, 96);
    }
    return row;
  }

  /** Is it late? The `overdue_caravan` frame asks exactly this. */
  function stateOf(row) {
    if (!row) return null;
    if (row.state === 'travelling' && row.age > row.due) return 'overdue';
    return row.state;
  }

  return {
    dispatch, update, escort, arrive, rob,
    get: id => all.get(id) || null,
    inZone: zoneId => [...all.values()].filter(c => c.zoneId === zoneId && c.state !== 'arrived'),
    near(x, z, radius = 400) {
      return [...all.values()]
        .filter(c => c.state !== 'arrived' && Math.hypot(c.x - x, c.z - z) <= radius)
        .map(c => ({ ...c, distance: Math.hypot(c.x - x, c.z - z) }))
        .sort((a, b) => a.distance - b.distance);
    },
    /** For the job generator — with `state` resolved, so `overdue` and `loading` can be bound. */
    candidates: zoneId => [...all.values()]
      .filter(c => c.zoneId === zoneId && c.state !== 'arrived')
      .map(c => ({ ...c, type: 'caravan', state: stateOf(c) })),
    stateOf,
    get hours() { return clock / 3600; },
  };
}
