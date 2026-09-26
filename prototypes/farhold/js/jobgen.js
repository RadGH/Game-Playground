// Farhold — jobs made out of what is actually around you.
//
// PURE JavaScript: no Three.js, no DOM.
//
//   import { createJobGen } from './jobgen.js';
//   const jobs = createJobGen({ frames, territory, factions, standings });
//   jobs.offer({ zone, level, candidates });   // 3-5 jobs, all of them about this zone
//
// THE RULE THIS MODULE EXISTS TO ENFORCE. A frame may only be offered if every one of its slots can
// be filled from something that EXISTS RIGHT NOW: a real camp that is still standing, a real caravan
// that is really late, a real named enemy that really did beat you. If a slot cannot be filled the
// frame is skipped in silence. Nothing is invented, so nothing can send you to an empty field.
//
// The other rule is distance. Farhold is a whole planet and crossing one is slow on purpose, so a
// job's pin is in the zone you are standing in. A frame marked `adjacent` may point one zone over and
// its text says so; anything further away is a RUMOUR, which is a sentence, not a marker.
//
// R14 — THAT RULE WAS WRITTEN DOWN AND NEVER ENFORCED.
//
//   "The current quest system generated one to carry wood to another location. That location was
//    hours of foot travel away in a much higher level zone. Rework the quest system to focus on
//    nearby locations, adjacent towns preferred when possible."
//
// `candidatesFrom` pushed EVERY settlement and EVERY dungeon on the whole planet into the bag — it
// is handed `world.nodes`, which is the world, not the zone — and `fits()` had no distance test at
// all. So `walk_it_over`, a frame whose scope is literally `"local"`, would happily bind the town
// forty kilometres away in a level-30 band and call it a local job.
//
// The fix is in three places, all of them here:
//   * every candidate you can stand on now carries `away` (metres, the short way round the world)
//     and `zoneLevel`, computed by `candidatesFrom` when it is told where you are;
//   * a scope carries a METRE BUDGET as well as a hop count, and `fits()` enforces it — a frame
//     that cannot bind inside its own budget is skipped, exactly as it is skipped when a slot has
//     nothing to bind to;
//     (R19: the HOP half of that sentence was not true until R19. `maxMetres` was read and
//     `maxZoneHops` — which is the field the JSON actually carries — was not, so "local" meant
//     "within 4.2 km" and never "in this zone". It means both now.)
//   * `bind()` prefers the near one. Given four towns inside the budget it does not roll flat, it
//     rolls biased to the front of a distance-sorted list, so "adjacent towns preferred" is the
//     default behaviour rather than a lucky roll.
//
// Everything stays backwards compatible: a candidate with no `away` (the node tests hand in plain
// data with no position) is never filtered out, because an unknown distance is not a far one.

import { rewardKindFor, REWARD_SHAPE_KEYS } from './questrewards.js';

/**
 * The quest log only understands four shapes — hunt, visit, gather, clear — because that is what the
 * game already tracks progress against. A frame's goal is more expressive than that, so the richer
 * kind is kept for the words and mapped on to one of the four for the counting. Module scope because
 * the reward rule reads it too, and a job's reward is decided from what the job counts.
 */
const LOG_KIND = {
  kill: 'hunt', hunt: 'hunt',
  gather: 'gather',
  clear: 'clear', clearSites: 'clear',
  visit: 'visit', visitAll: 'visit', escort: 'visit', pay: 'visit', solve: 'visit', deliver: 'visit',
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** A deterministic 0..1 stream, so the same zone in the same state offers the same board. */
function rngFrom(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h >>> 0;
}

/**
 * Does one candidate satisfy one slot?
 *
 * Every test here reads a field the candidate already carries. A slot never asks for something a
 * generator would have to make up.
 */
function fits(need, candidate, ctx) {
  if (!candidate) return false;
  if (need.type && candidate.type !== need.type) return false;
  if (need.hostile != null && !!candidate.hostile !== !!need.hostile) return false;
  if (need.kind && candidate.kind !== need.kind) return false;
  if (need.state && candidate.state !== need.state) return false;
  if (need.rank && candidate.rank !== need.rank) return false;
  if (need.tag && !(candidate.tags || []).includes(need.tag)) return false;
  if (need.faction && candidate.faction !== need.faction) return false;
  if (need.element && !candidate.element) return false;
  if (need.adjacent && !candidate.adjacent) return false;
  // `rival` means "belongs to whoever is pushing in", which is a fact about the territory record
  if (need.rival && candidate.faction !== ctx.contested) return false;
  /**
   * R14 — THE DISTANCE BUDGET.
   *
   * `ctx.maxMetres` comes from the frame's own scope (see SCOPE_METRES). A candidate that does not
   * know where it is has no `away` and is never rejected — an unknown distance is not a far one,
   * and the node tests hand in positionless data on purpose.
   */
  if (ctx.maxMetres != null && Number.isFinite(candidate.away) && candidate.away > ctx.maxMetres) return false;
  /**
   * R19 — AND THE HOP BUDGET, WHICH THE DATA HAS STATED SINCE THE DAY THE FILE LANDED.
   *
   * `data/job-frames.json`'s `scopes` block says `local: maxZoneHops 0`, `adjacent: 1`,
   * `rumour: 99`. R14 read `maxMetres` off the same block and left `maxZoneHops` sitting there —
   * so the ONLY thing stopping a "local" errand pointing across a border was the metre budget,
   * and a metre budget cannot tell the difference between four kilometres of your own valley and
   * four kilometres that cross into a level-22 band. Two zones can share a border a hundred metres
   * from the notice board.
   *
   * A candidate with no `zoneHops` is never rejected, exactly as one with no `away` is not: the
   * node tests hand in positionless data and an unknown distance is not a far one.
   */
  if (ctx.maxHops != null && Number.isFinite(candidate.zoneHops) && candidate.zoneHops > ctx.maxHops) return false;
  /**
   * …and the level band. A town is a fine destination; a town six bands up with everything between
   * here and there able to kill you is not a job, it is a death sentence with a gold reward on it.
   */
  if (ctx.maxLevel != null && Number.isFinite(candidate.zoneLevel) && candidate.zoneLevel > ctx.maxLevel) return false;
  return true;
}

/**
 * How far a frame of each scope may reach, in metres.
 *
 * A zone cell is 640 m across by default, so `local` is a handful of cells — five to ten minutes at
 * a walk, which is the longest an errand should ever be. `adjacent` is one zone over and says so in
 * its own text. A scope may override this in data/job-frames.json with `maxMetres`.
 */
export const SCOPE_METRES = { local: 4200, adjacent: 12000, rumour: Infinity };

/**
 * …and how many ZONE BORDERS a frame of each scope may reach across.
 *
 * The fallback only. `data/job-frames.json` owns these numbers (`scopes.*.maxZoneHops`) and its
 * values are the ones the game runs on; this table is what an unknown scope, or a caller who hands
 * in frames with no `scopes` block, falls back to. Zero borders is "here", which is what `local`
 * means and what it has never enforced.
 */
export const SCOPE_HOPS = { local: 0, adjacent: 1, rumour: 99 };

/** How far above the player's level a job's destination may sit. Two bands, not six. */
export const LEVEL_HEADROOM = 4;

/** Fill one slot, or fail. `count` slots collect several and fail if there are not enough. */
function bind(need, pool, rng, used, ctx) {
  const want = need.count || 1;
  const open = pool.filter(c => fits(need, c, ctx) && !used.has(c));
  if (open.length < want) return null;
  /**
   * R14 — NEAR FIRST.
   *
   * Sorted by distance, then drawn with a squared roll, which lands in the first third of the list
   * about 58% of the time and in the last third about 11%. That is "adjacent towns preferred when
   * possible" without ever being "the same town every time" — the far one is still reachable, it is
   * just no longer as likely as the one next door. Candidates with no position sort last and are
   * drawn exactly as before.
   */
  const ranked = open.every(c => !Number.isFinite(c.away))
    ? open
    : open.slice().sort((a, b) => (a.away ?? Infinity) - (b.away ?? Infinity));
  const draw = bag => {
    const at = Math.min(bag.length - 1, Math.floor(rng() ** 2 * bag.length));
    return bag.splice(at, 1)[0];
  };
  if (want === 1) {
    const picked = draw(ranked.slice());
    used.add(picked);
    return picked;
  }
  const chosen = [];
  const bag = ranked.slice();
  for (let i = 0; i < want && bag.length; i++) {
    const picked = draw(bag);
    used.add(picked);
    chosen.push(picked);
  }
  return chosen.length >= want ? chosen : null;
}

/** `{slot.field}` against the bound slots, plus `{zone.…}` which is always available. */
export function phrase(text, bound) {
  return String(text || '').replace(/\{([\w]+)\.?([\w]*)\}/g, (whole, slot, field) => {
    const value = bound[slot];
    if (value == null) return whole;
    const one = Array.isArray(value) ? value[0] : value;
    if (!field) return one?.name ?? String(one);
    const out = one?.[field];
    return out == null ? (one?.name ?? whole) : String(out);
  });
}

export function createJobGen({ frames: data, territory = null, factions = null, standings = null, incidents = null, seed = 1 } = {}) {
  /**
   * R18 — `incidents` is data/incidents.json, read only for its `resolvedBy` field. See `finish`
   * below: without it four incidents in the game could never be cleared. Optional, so every
   * existing caller and every node test keeps working exactly as it did.
   */
  const frames = data?.frames || [];
  const scopes = data?.scopes || {};
  /** How recently each frame was offered, so a board does not repeat itself. */
  const lastOffered = new Map();
  let offers = 0;

  /**
   * Build the board for one zone.
   *
   * `candidates` is a flat bag of typed things the caller has collected from the live world — sites
   * from the territory record, caravans, patrols, landmarks, NPCs, named enemies, the zone's own
   * bestiary. The generator does not go looking; it is handed what is there.
   */
  function offer({ zone, level = 1, candidates = [], want = 4, exclude = [] } = {}) {
    if (!zone) return [];
    const record = territory?.of?.(zone.id) || null;
    const ctx = { contested: record?.contested || null, holder: record?.holder || null };
    const rng = rngFrom(hash(seed, zone.id, record?.visits ?? 0, offers++));
    // the zone you are standing in is a candidate in its own right, and it is nought borders away
    const pool = candidates.concat([{ type: 'zone', ...zone, name: zone.name, adjacent: false, zoneHops: 0 }]);

    /**
     * Score every frame, then take the best few.
     *
     * `weight` is the designer's thumb on the scale, `heat` and `grip` let the state of the zone push
     * the right frames forward (a zone under pressure should be offering "break the hold", not "put
     * a stone back"), and anything offered in the last few boards is pushed down hard so the notice
     * board does not read like a loop.
     */
    /**
     * R14: what this frame's own scope lets it reach. `scopes` in data/job-frames.json may set
     * `maxMetres`; otherwise SCOPE_METRES decides, and an unknown scope is treated as local.
     */
    const ctxFor = frame => {
      const scope = scopes[frame.scope] || null;
      const metres = scope?.maxMetres ?? SCOPE_METRES[frame.scope] ?? SCOPE_METRES.local;
      /**
       * R19 — the scope's own hop cap. The JSON leads; SCOPE_HOPS is only what an unknown scope
       * gets. `99` (what `rumour` carries) is "anywhere", so it is passed through as no cap at all
       * rather than as a number nothing can exceed.
       */
      const hops = scope?.maxZoneHops ?? SCOPE_HOPS[frame.scope] ?? SCOPE_HOPS.local;
      return {
        ...ctx,
        maxMetres: Number.isFinite(metres) ? metres : null,
        maxHops: Number.isFinite(hops) && hops < 99 ? hops : null,
        maxLevel: frame.scope === 'rumour' ? null : level + LEVEL_HEADROOM,
      };
    };

    /**
     * Which frames a place in this zone can host — see the `usesHere` nudge in the scoring below.
     * Gathered once per board rather than per frame, and tolerant of a territory module that does
     * not offer landmarks at all (the node tests pass none).
     */
    const usesHere = new Set();
    for (const mark of territory?.landmarksIn?.(zone?.id) || []) {
      const list = mark?.uses || mark?.gives?.uses;
      for (const id of (Array.isArray(list) ? list : [list]).filter(Boolean)) usesHere.add(id);
    }

    const scored = [];
    for (const frame of frames) {
      if (exclude.includes(frame.id)) continue;
      const used = new Set();
      const bound = { zone };
      const fctx = ctxFor(frame);
      let ok = true;
      for (const need of frame.needs || []) {
        const value = bind(need, pool, rng, used, fctx);
        if (value == null) { ok = false; break; }
        bound[need.slot] = value;
      }
      if (!ok) continue;

      let score = (frame.weight ?? 5) + rng() * 3;
      const since = offers - (lastOffered.get(frame.id) ?? -99);
      if (since < 4) score -= (4 - since) * 4;
      if (frame.scope === 'adjacent') score -= 3;       // local first, always
      if (record) {
        if (/push_them_out|the_claim/.test(frame.id)) score += record.heat * 6;
        if (/beast_moved_in|the_grudge/.test(frame.id)) score += (1 - record.grip) * 3;
      }
      /**
       * R18 — A PLACE NEARBY THAT CAN HOST THIS ERRAND MAKES IT MORE LIKELY.
       *
       * `data/landmarks.json` and `data/strongholds.json` carry `uses` lists — which job frames a
       * place can host — and nothing read them, so "this ruin is where you would be sent to do
       * that" was written down eleven times and meant nothing. Three of the eleven ids named no
       * frame at all, which is the usual sign that a field has never been resolved against
       * anything.
       *
       * A preference rather than a requirement, deliberately: a board that could only offer errands
       * with a matching landmark in range would go empty in open country, and `fits()` already
       * refuses anything whose slots do not bind. This just means the ruin down the road is the one
       * you get sent to.
       */
      if (usesHere.has(frame.id)) score += 5;
      scored.push({ frame, bound, score });
    }

    /**
     * ONE THING, ONE JOB.
     *
     * Scoring binds each frame against the whole pool, which is right — a frame should be judged on
     * whether it COULD run. But two frames could then both pick the same camp, and the board came out
     * reading "Clear out the Burn Camp at Harrowfield" directly above "Look in on the Burn Camp at
     * Harrowfield". So the board is filled greedily in score order against a shared set, re-binding
     * as it goes, and a frame whose thing has been taken by a better frame is simply skipped.
     */
    scored.sort((a, b) => b.score - a.score);
    const taken = new Set();
    const out = [];
    for (const row of scored) {
      if (out.length >= Math.max(1, want)) break;
      const bound = { zone };
      const fctx = ctxFor(row.frame);
      let ok = true;
      for (const need of row.frame.needs || []) {
        const value = bind(need, pool, rng, taken, fctx);
        if (value == null) { ok = false; break; }
        bound[need.slot] = value;
      }
      if (!ok) continue;
      lastOffered.set(row.frame.id, offers);
      out.push(materialise(row.frame, bound, { zone, level, record, rng }));
    }
    return out;
  }

  /**
   * R16 — WHAT A BOARD JOB PAYS IN, AND THE FOUR EXTRAS THAT WERE NEVER READ.
   *
   * `reward.extras` has been built here since the day this file was written — every key of a frame's
   * `reward` that is not gold, xp or standing — and until `js/questrewards.js` existed nothing on
   * the other end so much as looked at it. Four frames promised a perk point, an opened dungeon, a
   * revealed zone and a brand on your weapon, and paid none of them.
   *
   * It also settles the reward KIND, from the frame if the frame says so and otherwise from the
   * shape of the job. `kind`, `mats` and `matPool` are the reward's own shape, so they are lifted
   * out rather than being swept into `extras` as if they were something to be granted.
   */
  function rewardFor(frame, { kind, level, standing, gold, xp, rng }) {
    const src = frame.reward || {};
    const reward = {
      gold, xp, standing,
      kind: src.kind || null,
      mats: src.mats || null,
      matPool: src.matPool || null,
      extras: Object.fromEntries(Object.entries(src).filter(([k]) => !REWARD_SHAPE_KEYS.includes(k))),
    };
    reward.kind = rewardKindFor({ kind, logKind: LOG_KIND[kind] || 'visit', reward }, { rng, level });
    return reward;
  }

  /** Turn a scored frame into the job object the quest log and the HUD read. */
  function materialise(frame, bound, { zone, level, record, rng }) {
    const scale = 1 + (level - 1) * 0.12;
    const money = frame.reward?.gold || [0, 0];
    const learn = frame.reward?.xp || [0, 0];
    const roll = ([lo, hi]) => Math.round((lo + rng() * (hi - lo)) * scale);
    const at = bound[String(frame.goal?.at || '').replace(/[{}]/g, '')] || null;
    const first = Array.isArray(at) ? at[0] : at;
    const faction = record?.holder || first?.faction || null;

    /**
     * The quest log only understands four shapes — hunt, visit, gather, clear — because that is what
     * the game already tracks progress against. A frame's goal is more expressive than that, so the
     * richer kind is kept for the words and mapped on to one of the four for the counting.
     */
    const kind = frame.goal?.kind || 'visit';

    return {
      id: 'j_' + hash(frame.id, zone.id, offers, Math.floor(rng() * 1e9)).toString(36),
      frame: frame.id,
      kind,
      logKind: LOG_KIND[kind] || 'visit',
      scope: frame.scope || 'local',
      scopeName: scopes[frame.scope]?.name || 'here',
      zoneId: zone.id, zoneName: zone.name,
      faction,
      title: phrase(frame.title, bound),
      text: phrase(frame.text, bound),
      target: phrase(frame.goal?.target || '', bound) || null,
      count: frame.goal?.count || 1,
      progress: 0, done: false, turnedIn: false,
      timed: frame.goal?.timed || null,
      // where the pin goes. An `adjacent` job points at the zone, not at a spot in it, because the
      // player has not been there and a metre-accurate pin would be a lie.
      place: first && Number.isFinite(first.x) && Number.isFinite(first.z)
        ? { x: first.x, z: first.z, name: first.name || zone.name, cell: first.cell || null }
        : null,
      bindings: Object.fromEntries(Object.entries(bound).map(([k, v]) => [
        k, Array.isArray(v) ? v.map(x => x.id ?? x.name) : (v?.id ?? v?.name ?? null),
      ])),
      reward: rewardFor(frame, { kind, level, rng, standing: frame.reward?.standing || 0, gold: roll(money), xp: roll(learn) }),
      onDone: frame.onDone || {},
    };
  }

  /**
   * Finish a job: pay it, move the standing, press on the grip, and hand back the rumour it leaves
   * behind. The caller does the paying; this decides what happens to the WORLD.
   */
  function complete(job) {
    const out = { rumour: null, resolved: null, flipped: null };
    if (!job) return out;
    if (job.faction && standings && job.reward?.standing) {
      standings.add(job.faction, job.reward.standing);
    }
    const after = job.onDone || {};
    if (territory && Number.isFinite(after.grip)) {
      out.flipped = territory.press(job.zoneId, after.grip)?.flipped || null;
    }
    /**
     * R18 — RESOLVE FROM THE INCIDENT'S SIDE AS WELL, WHICH IS WHERE THE DATA SAYS IT.
     *
     * `after.resolve` is a frame naming ONE incident, and only three of the eight frames carry it.
     * data/incidents.json states the join the other way round with `resolvedBy` — and nothing read
     * that at all, so four incidents could never be cleared: `grudge` and `bounty_up` both name the
     * frame `the_grudge`, `collapse` and `road_out` both name `dig_it_out`, and neither frame has an
     * `onDone.resolve`. You did the job, the trouble kept running, and when it timed out its
     * `onExpire` fired the failure rumour and the grip penalty as though you had never turned up.
     *
     * One frame resolving TWO incidents is exactly why a single `onDone.resolve` string could not
     * express it. Reading `resolvedBy` handles that for free, and both directions are honoured so
     * the three frames that already worked keep working.
     */
    if (territory && after.resolve) out.resolved = territory.resolveIncident(job.zoneId, after.resolve);
    if (territory && job.frame) {
      for (const row of incidents?.incidents || []) {
        if (row.resolvedBy !== job.frame) continue;
        const got = territory.resolveIncident(job.zoneId, row.kind);
        if (got) {
          out.resolved = out.resolved || got;
          /**
           * R18 — `deeds.incident_resolved` was declared, shown on the standings screen and
           * credited by nobody. Clearing a zone's trouble is exactly the deed it describes, and
           * this is the one place the game now knows it happened.
           */
          if (job.faction && standings) standings.deed(job.faction, 'incident_resolved');
        }
      }
    }
    if (after.rumour) out.rumour = phrase(after.rumour, { zone: { name: job.zoneName } }) || after.rumour;
    return out;
  }

  /** Walking away from something you took costs you with whoever posted it. */
  function abandon(job) {
    if (job?.faction && standings) standings.deed(job.faction, 'job_abandoned');
    return job;
  }

  return { offer, complete, abandon, phrase, get offers() { return offers; } };
}

/**
 * Turn the live world into the flat bag of typed candidates `offer` wants.
 *
 * One place that knows how to read the game's objects, so the generator itself stays pure and the
 * node tests can hand it plain data. Everything it produces carries `type`, a `name`, and — where
 * the thing is somewhere you can stand — an `x` and a `z` in world metres.
 */
export function candidatesFrom({
  zone, territory = null, bestiary = [], nodes = [], landmarks = [], npcs = [],
  caravans = [], patrols = [], named = [], items = [], metresPerCell = 640, level = 1,
  // R27 M1 — the enemy field's live units, so a champion that is really out there binds first
  live = [],
  /**
   * R14 — WHERE THE BOARD IS STANDING, AND HOW BIG THE WORLD IS.
   *
   * `from` is the notice board's own position in world metres (in practice, the player). Given it,
   * every candidate you can walk to gets an `away` and `jobgen`'s distance budget starts working.
   * Left out — which is what every node test does — nothing gets an `away` and behaviour is exactly
   * what it was before.
   *
   * `wrapM` is the world's east-west width. The map is a sphere unrolled, so a town at the far left
   * edge may be a short walk west rather than a long walk east, and measuring it the naive way is
   * how you get "hours of foot travel" for somewhere that is twenty minutes off.
   *
   * `zoneAt(x, z)` hands back the zone standing at a point, so a destination can be rejected for
   * being six level bands up rather than only for being far.
   */
  from = null, wrapM = 0, zoneAt = null,
  /**
   * R19 — HOW MANY BORDERS APART TWO ZONES ARE, if the caller knows.
   *
   * `(fromZoneId, toZoneId) => number` — the region graph's own hop count, which is what
   * `js/zones.js` builds its level bands out of. Without it a candidate standing in a DIFFERENT
   * zone is counted as one border away, which is the honest floor (it is at least one) and is all
   * the `scopes` block needs to tell `local` from `adjacent`. Same zone is always zero, whoever
   * is asked.
   */
  hopsBetween = null,
} = {}) {
  const out = [];
  const record = territory?.of?.(zone?.id);

  /** Metres from the board to a point, the short way round. */
  const awayTo = (x, z) => {
    if (!from || !Number.isFinite(x) || !Number.isFinite(z)) return undefined;
    let dx = x - from.x;
    if (wrapM > 0) {
      if (dx > wrapM / 2) dx -= wrapM;
      if (dx < -wrapM / 2) dx += wrapM;
    }
    return Math.hypot(dx, z - from.z);
  };
  /** How many borders from the board's zone to this one. Same zone is free; elsewhere is at least one. */
  const hopsTo = other => {
    if (other == null || zone?.id == null) return undefined;
    if (other === zone.id) return 0;
    const asked = hopsBetween ? hopsBetween(zone.id, other) : null;
    return Number.isFinite(asked) ? Math.max(1, asked) : 1;
  };

  /** Stamp `away`, `zoneLevel` and `zoneHops` on anything that knows where it is. */
  const placed = c => {
    const away = awayTo(c.x, c.z);
    if (away != null) c.away = away;
    if (zoneAt && Number.isFinite(c.x) && Number.isFinite(c.z)) {
      const z = zoneAt(c.x, c.z);
      if (z) {
        c.zoneLevel = z.minLevel ?? z.midLevel ?? null; c.zoneName = z.name || null;
        c.adjacent = z.id !== zone?.id;
        const hops = hopsTo(z.id);
        if (hops != null) c.zoneHops = hops;
      }
    }
    return c;
  };

  for (const site of territory?.sitesIn?.(zone?.id) || []) {
    out.push(placed({ ...site, type: 'site' }));
  }
  for (const i of record?.incidents || []) {
    out.push({ type: 'incident', id: i.kind, kind: i.kind, name: i.name || i.kind, blurb: i.blurb || '', spawns: i.spawns || null });
  }
  for (const l of landmarks) out.push(placed({ ...l, type: 'landmark' }));
  for (const n of npcs) out.push(placed({ ...n, type: 'npc' }));
  for (const c of caravans) out.push(placed({ ...c, type: 'caravan' }));
  for (const p of patrols) out.push(placed({ ...p, type: 'patrol' }));
  for (const f of named) out.push({ ...f, type: 'named' });
  for (const it of items) out.push({ ...it, type: 'item' });

  /**
   * R27 M1 — "A BEAST HAS MOVED IN" COULD NEVER BE OFFERED.
   *
   * The rank came from `e.boss` / `e.champion`, and no bestiary def carries either: a champion is
   * not a KIND of enemy, it is a rank any ordinary spawn can roll (js/actors.js `spawnNear` →
   * `rollRank` → `addRanked`). So the one frame that asks for `rank: 'champion'` never bound.
   *
   * Two honest sources now. A LIVE champion or rare out on the field right now (`live`, the enemy
   * field's own units) comes first — that one is really there. Then every def that CAN roll
   * champion — a beast (the frame's slot is a beast), not a pet or a boss, not `rareOnly` — which is
   * the same rule the spawner applies. The kill goal is the def id, so any of its kind counts.
   */
  const seenLive = new Set();
  for (const u of live) {
    if (!u || u.dying != null || u.removed) continue;
    if (u.rank !== 'champion' && u.rank !== 'rare') continue;
    if (u.kind === 'humanoid' || u.boss || seenLive.has(u.defId)) continue;
    seenLive.add(u.defId);
    out.push(placed({ type: 'enemy', id: u.defId, name: u.baseName || u.name, rank: 'champion', element: !!u.element, live: true, x: u.x, z: u.z }));
  }
  // the enemies that actually live at this level, with their rank, so "a champion" means one
  for (const e of bestiary) {
    if ((e.minLevel ?? 1) > level + 3 || (e.maxLevel ?? 99) < level - 1) continue;
    if (seenLive.has(e.id)) continue;
    const canChampion = !e.boss && !e.rareOnly && (e.kind || 'beast') !== 'humanoid';
    out.push({
      type: 'enemy', id: e.id, name: e.name,
      rank: e.boss ? 'boss' : (e.champion || canChampion) ? 'champion' : 'common',
      element: !!e.element,
    });
  }

  // the zone's own dungeons, from the map the world already grew
  for (const n of nodes) {
    if (n.type !== 'dungeon') continue;
    out.push(placed({
      type: 'dungeon', id: 'd' + n.id, name: n.name || 'the ruin',
      x: n.x * metresPerCell, z: n.y * metresPerCell, cell: { x: n.x, y: n.y },
    }));
  }
  for (const n of nodes) {
    if (n.type !== 'settlement' && n.type !== 'port') continue;
    out.push(placed({
      type: 'settlement', id: 't' + n.id, name: n.name || 'the village',
      x: n.x * metresPerCell, z: n.y * metresPerCell, cell: { x: n.x, y: n.y },
    }));
  }
  return out;
}

export { clamp };
