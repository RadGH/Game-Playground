// Farhold — the people you meet who do not live anywhere.
//
// PURE JavaScript: no Three.js, no DOM. A wanderer is one encounter: a body on or near a road, at a
// landmark, or at a fire after dark. They are the main way a job reaches you without a notice board,
// which matters because the notice board is in a town and the interesting ground is not.
//
//   import { createWanderers } from './wanderers.js';
//   const folk = createWanderers({ data, territory, standings, seed });
//   folk.populate(zone, spots);   // who is out there today
//   folk.near(x, z, 60);          // who you can talk to
//   folk.talk(id);                // what they say, and what they want

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

/** Does this kind belong at this spot, at this hour? */
export function suits(kind, spot, { night = false } = {}) {
  const where = kind.where || [];
  const ok = where.includes('any') || where.some(w => (spot.tags || []).includes(w) || spot.kind === w);
  if (!ok) return false;
  const when = kind.when || ['day', 'night'];
  if (night && !when.includes('night') && !when.includes('dusk')) return false;
  if (!night && !when.includes('day') && !when.includes('dusk')) return false;
  return true;
}

export function createWanderers({ data, territory = null, standings = null, seed = 1 } = {}) {
  const kinds = data?.kinds || [];
  const given = data?.names?.given || ['a stranger'];
  const bynames = data?.names?.bynames || [];
  const byZone = new Map();
  /** Who you have already dealt with, so a pedlar does not sell you the same three things twice. */
  const spent = new Set();

  /**
   * Who is out on the roads of this zone right now.
   *
   * `spots` is a list of `{ x, z, kind, tags }` the caller collected from the real map — road cells,
   * junctions, landmark nodes, camp fires. A wanderer only ever stands somewhere that is there.
   */
  function populate(zone, spots = [], { night = false, level = 1 } = {}) {
    if (!zone) return [];
    const key = `${zone.id}:${night ? 'n' : 'd'}`;
    if (byZone.has(key)) return byZone.get(key);
    const rng = rngFrom(hash(seed, 'wander', zone.id, night ? 1 : 0));
    const record = territory?.of?.(zone.id);
    const want = Math.max(1, Math.min(4, 1 + Math.floor(rng() * 3)));

    const out = [];
    const usedSpots = new Set();
    for (let i = 0; i < want; i++) {
      const open = spots.filter((s, si) => !usedSpots.has(si));
      if (!open.length) break;
      const si = Math.floor(rng() * open.length) % open.length;
      const spot = open[si];
      usedSpots.add(spots.indexOf(spot));

      const fits = kinds.filter(k => suits(k, spot, { night }));
      if (!fits.length) continue;
      // weight, plus a nudge for anyone the zone's own trouble makes more likely
      const weights = fits.map(k => {
        let w = k.weight ?? 5;
        if (record?.incidents?.some(x => x.kind === 'raid_coming') && k.key === 'refugee') w += 8;
        if (record?.incidents?.some(x => x.kind === 'hunger') && k.key === 'pedlar') w += 5;
        if (record?.holder && k.faction === record.holder) w += 3;
        return Math.max(0.1, w);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = rng() * total, at = 0;
      while (at < weights.length - 1 && roll > weights[at]) { roll -= weights[at]; at++; }
      const kind = fits[at];

      /**
       * A PERSON, not a job title. A job that reads "Mercenary Captain is missing somebody" is a job
       * about a stock character; "Tolvi is missing somebody" is a job about a person. A byname turns
       * up about a third of the time, which is enough for the world to feel named without every
       * stranger on the road having an epithet.
       */
      const first = given[Math.floor(rng() * given.length) % given.length];
      const byname = bynames.length && rng() < 0.3
        ? ' ' + bynames[Math.floor(rng() * bynames.length) % bynames.length] : '';

      out.push({
        id: `w${zone.id}_${night ? 'n' : 'd'}_${i}`,
        type: 'npc',
        kind: kind.key, name: first + byname, kindName: kind.name, role: kind.role,
        faction: kind.faction || record?.holder || null,
        blurb: kind.blurb, lines: kind.lines || [],
        wants: kind.wants, gives: kind.gives,
        stock: kind.stock || null, job: kind.job || null, buff: kind.buff || null,
        hire: kind.hire || null, toll: kind.toll || null, cutShare: kind.cutShare || null,
        angers: kind.angers || null, rumourChance: kind.rumourChance ?? 0.3,
        zoneId: zone.id, level,
        x: spot.x, z: spot.z,
        met: false, done: false,
      });
    }
    byZone.set(key, out);
    return out;
  }

  /** Everyone within `radius` metres. */
  function near(x, z, radius = 60) {
    const out = [];
    for (const list of byZone.values()) {
      for (const w of list) {
        if (w.done) continue;
        const d = Math.hypot(w.x - x, w.z - z);
        if (d <= radius) out.push({ ...w, distance: d });
      }
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  /** The line they open with, and what they are after. */
  function talk(id) {
    for (const list of byZone.values()) {
      const w = list.find(x => x.id === id);
      if (!w) continue;
      const first = !w.met;
      w.met = true;
      const line = w.lines[first ? 0 : Math.min(1, w.lines.length - 1)] || w.blurb;
      return { wanderer: w, line, first, wants: w.wants, gives: w.gives };
    }
    return null;
  }

  /**
   * Settle up with one. `how` is what you chose: paid / refused / helped / robbed.
   * Standing moves, and the wanderer is spent.
   */
  function settle(id, how) {
    for (const list of byZone.values()) {
      const w = list.find(x => x.id === id);
      if (!w) continue;
      w.done = true;
      spent.add(w.id);
      if (!standings) return { wanderer: w, how };
      if (how === 'paid' && w.faction) standings.deed(w.faction, 'toll_paid');
      if (how === 'helped' && w.faction) standings.deed(w.faction, 'job_done');
      if (how === 'robbed' && w.faction) standings.deed(w.faction, 'caravan_robbed');
      if (how === 'helped' && w.angers) standings.deed(w.angers, 'job_abandoned');
      return { wanderer: w, how };
    }
    return null;
  }

  return {
    populate, near, talk, settle, suits,
    inZone: zoneId => [...byZone.entries()]
      .filter(([k]) => k.startsWith(zoneId + ':'))
      .flatMap(([, list]) => list.filter(w => !w.done)),
    /** For the job generator. */
    candidates(zoneId) { return this.inZone(zoneId).map(w => ({ ...w, type: 'npc' })); },
    /** Forget a zone's roster so tomorrow has different people on the road. */
    refresh(zoneId) {
      for (const key of [...byZone.keys()]) if (key.startsWith(zoneId + ':')) byZone.delete(key);
    },
    toJSON: () => ({ spent: [...spent] }),
  };
}
