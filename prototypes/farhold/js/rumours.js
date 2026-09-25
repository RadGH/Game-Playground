// Farhold — the only thing that describes somewhere you are not.
//
// PURE JavaScript: no Three.js, no DOM.
//
//   import { createRumours } from './rumours.js';
//   const talk = createRumours({ territory, factions, seed });
//   talk.hear(zone, { from: 'a minstrel' });   // one line about somewhere
//   talk.about(zoneId);                        // everything you know about a zone
//
// THE POINT. Farhold is a whole planet and crossing one is slow, so a quest marker on the far side of
// the map is a punishment. A rumour is the opposite: a SENTENCE about what is over the hill, with no
// pin, no timer and no obligation. You decide the walk is worth it, or you do not. That is the one
// mechanism in the expansion allowed to talk about anywhere but here.

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

/**
 * The twelve kinds of thing worth passing on. Each one is built from a FACT about a zone's record,
 * so a rumour is never wrong — it can only be out of date, which is its own kind of interesting.
 */
export const KINDS = [
  {
    key: 'named', weight: 9,
    holds: c => !!c.named,
    say: c => `there is something called ${c.named} working ${c.zone} and nobody has stopped it`,
  },
  {
    key: 'pushing_in', weight: 8,
    holds: c => !!c.contested && c.claim > 0.25,
    // "the Cut are pushing in" is right; "the Stone Count are pushing in" is not
    say: c => `${c.contestedName} ${c.contestedPlural ? 'are' : 'is'} pushing into ${c.zone}`
      + ` and ${c.holderName} ${c.holderPlural ? 'are' : 'is'} not winning`,
  },
  {
    key: 'incident', weight: 10,
    holds: c => !!c.incident,
    say: c => `${c.zone} is having a bad week — ${c.incident.blurb}`,
  },
  {
    key: 'unclaimed', weight: 6,
    holds: c => c.unvisitedLandmarks > 0,
    say: c => `there ${c.unvisitedLandmarks === 1 ? 'is a place' : `are ${c.unvisitedLandmarks} places`} in ${c.zone} nobody has put on a chart`,
  },
  {
    key: 'caravan', weight: 7,
    holds: c => !!c.caravan,
    say: c => `${c.caravan} runs out of ${c.zone}, and it runs light on guards`,
  },
  {
    key: 'dungeon', weight: 7,
    holds: c => !!c.dungeon,
    say: c => `${c.dungeon} in ${c.zone} goes down further than anybody has been`,
  },
  {
    key: 'shop', weight: 5,
    holds: c => !!c.stocks,
    say: c => `somebody in ${c.zone} is holding ${c.stocks}, if you get there before the next one does`,
  },
  {
    key: 'bounty', weight: 8,
    holds: c => c.bounty > 0,
    say: c => `there is ${c.bounty} gold on something in ${c.zone}, and it has gone up twice`,
  },
  {
    key: 'grudge', weight: 9,
    holds: c => !!c.grudge,
    say: c => `${c.grudge} has been asking after you by name in ${c.zone}`,
  },
  {
    key: 'wreck', weight: 6,
    holds: c => !!c.wreck,
    say: c => `there is a burnt cart on the ${c.zone} road with its load still on it`,
  },
  {
    key: 'bloom', weight: 4,
    holds: c => !!c.bloom,
    say: c => `everything green in ${c.zone} came up at once. It will not last`,
  },
  {
    key: 'fair', weight: 5,
    holds: c => !!c.fair,
    say: c => `there is a fair on in ${c.zone} and for one day everything is cheap`,
  },
];

export function createRumours({ territory = null, factions = null, seed = 1, max = 40 } = {}) {
  /** What you have been told, newest first. */
  const heard = [];
  let told = 0;

  const rowOf = key => (factions?.factions || []).find(f => f.key === key) || null;
  const nameOf = key => rowOf(key)?.short || rowOf(key)?.name || key;
  const pluralOf = key => rowOf(key)?.plural !== false;

  /** Everything true about a zone that a rumour could be built out of. */
  function factsFor(zone, extra = {}) {
    const record = territory?.of?.(zone.id) || {};
    return {
      zoneId: zone.id,
      zone: zone.name,
      holderName: nameOf(record.holder),
      holderPlural: pluralOf(record.holder),
      contested: record.contested || null,
      contestedName: nameOf(record.contested),
      contestedPlural: pluralOf(record.contested),
      claim: record.claim ?? 0,
      incident: (record.incidents || [])[0] || null,
      unvisitedLandmarks: extra.unvisitedLandmarks ?? 0,
      named: extra.named || null,
      caravan: extra.caravan || null,
      dungeon: extra.dungeon || null,
      stocks: extra.stocks || null,
      bounty: extra.bounty ?? 0,
      grudge: extra.grudge || null,
      wreck: extra.wreck || null,
      bloom: (record.incidents || []).some(i => i.kind === 'bloom'),
      fair: (record.incidents || []).some(i => i.kind === 'fair_day'),
    };
  }

  /**
   * Hear one line about a zone. `from` is who told you, which is worth keeping — "a minstrel said"
   * and "a wounded patroller said" are not the same claim.
   */
  function hear(zone, { from = 'somebody on the road', extra = {} } = {}) {
    if (!zone) return null;
    const facts = factsFor(zone, extra);
    const open = KINDS.filter(k => k.holds(facts));
    if (!open.length) return null;
    const rng = rngFrom(hash(seed, 'rumour', zone.id, told++));
    const total = open.reduce((sum, k) => sum + k.weight, 0);
    let roll = rng() * total, at = 0;
    while (at < open.length - 1 && roll > open[at].weight) { roll -= open[at].weight; at++; }
    const kind = open[at];

    const row = {
      id: 'r' + hash(kind.key, zone.id, told).toString(36),
      kind: kind.key, zoneId: zone.id, zoneName: zone.name,
      text: kind.say(facts), from, at: Date.now(), stale: false,
    };
    // the same fact from a second mouth is not news
    if (heard.some(r => r.kind === row.kind && r.zoneId === row.zoneId)) return null;
    heard.unshift(row);
    if (heard.length > max) heard.length = max;
    return row;
  }

  /** Take a line somebody else wrote (a finished job leaves one behind). */
  function add(text, { zone = null, from = 'word going round' } = {}) {
    if (!text) return null;
    const row = {
      id: 'r' + hash(text, told++).toString(36),
      kind: 'word', zoneId: zone?.id ?? null, zoneName: zone?.name ?? null,
      text, from, at: Date.now(), stale: false,
    };
    heard.unshift(row);
    if (heard.length > max) heard.length = max;
    return row;
  }

  return {
    hear, add, KINDS,
    /** Everything, newest first. */
    all: () => heard.slice(),
    /** What you know about one zone. */
    about: zoneId => heard.filter(r => r.zoneId === zoneId),
    /** The zones you have heard anything about but not been to — the "where next" list. */
    leads(visited = new Set()) {
      const seen = new Map();
      for (const r of heard) {
        if (r.zoneId == null || visited.has(r.zoneId)) continue;
        if (!seen.has(r.zoneId)) seen.set(r.zoneId, { zoneId: r.zoneId, zoneName: r.zoneName, lines: [] });
        seen.get(r.zoneId).lines.push(r.text);
      }
      return [...seen.values()];
    },
    toJSON: () => heard.slice(0, max),
    load(rows) { heard.length = 0; heard.push(...(rows || [])); },
  };
}
