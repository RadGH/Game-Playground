// Farhold — encounters: the things that happen to you while you walk.
//
// The problem this fixes, in the user's words: *"the map is so expansive but enemies are few and
// far between. We need more encounters that generate as the player roams around and more
// interesting events than just a single lone straggler."*
//
// Two changes. The spawn ring is denser and packs are the default (that is `balance.spawn` and
// `balance.zones.packChance`). And on top of it, every twenty-odd seconds the walk rolls for a
// **set piece** out of `data/encounters.json`: a warband coming up the road, a hunting pack that
// arrives already awake, an ambush that spawns inside your aggro range, a rare with an escort, a
// swarm, a circle of casters. Each one is a shape — how many, how spread out, where relative to
// you, whether they have already seen you — and the bestiary fills it with whatever lives here.
//
//   const enc = createEncounters({ field, zones, terrain, balance, data, onLog });
//
// R14 — WHICH LINES ARE CHATTER, AND WHICH ARE THE POINT.
//
//   "There are events that happen very frequently in the chat … They happen too often."
//
// This module was the loudest thing in the game: one roll every 26 seconds at 55% is a line every
// 47 seconds, about 76 an hour, into a log that holds twelve lines. So `onLog` now takes a third
// argument on the two calls that ANNOUNCE something — an ambient tag saying which pool the line came
// from and how big that pool is — and js/main.js hands those to `js/ambient.js`, which says no most
// of the time. Everything else (the win, the fail, the trap springing) is untagged and therefore
// never throttled, because those are the consequences of what the player just did and silencing
// them would be much worse than the noise.
//   enc.update(dt, control, player);
//
// ROUND 12 ADDS THE OTHER HALF. "Add more events like that too, to give the world more things to do
// as you wander around." Every one of the eleven set pieces above is the same verb — bodies appear,
// you fight them — so the new ones in `data/events.json` are deliberately NOT that. Five beats, each
// with its own rule in `tickEvents`:
//
//   rescue — guards round a cage. Kill all of them and whoever was inside leaves you what they had.
//   chase  — one body running flat out. Catch it inside the clock and the distance, or it is gone.
//   defend — a strongbox on the ground and a clock. Everything dies or the box does.
//   trap   — a chest sitting in the open. It is real, the loot is real, and so is what erupts at 18 m.
//   find   — no fight at all. Something tucked under a stone, for having walked off the road.
//
// The data file is fetched at import for the same reason js/sites.js fetches its own: nothing
// outside this module had to change to get the events running.
//
// Pure-ish: it owns no meshes and no DOM. The enemy field builds the bodies and the chest field
// builds the boxes.

/**
 * The chest field, looked up lazily.
 *
 * js/chests.js pulls in Three.js and this module is meant to stay loadable in a plain node test, so
 * the lookup is a dynamic import rather than a static one. In the browser it resolves long before
 * the first event rolls; in node it fails quietly and the events that need a box simply do not run.
 */
let chestLookup = null;
import('./chests.js').then(m => { chestLookup = m.currentChests; }).catch(() => {});

/** data/events.json, fetched once at import. A run without it still gets the eleven set pieces. */
let EVENTS = null;
const EVENT_DATA = fetch(new URL('../data/events.json', import.meta.url))
  .then(r => r.json()).then(d => { EVENTS = d; return d; })
  .catch(() => null);


/**
 * R14 — THE LINE THAT NAMES WHAT ACTUALLY TURNED UP.
 *
 *   "They happen too often, and they aren't represented on the minimap or in game very well… make
 *    these events more impactful, clearly visible, and less generic."
 *
 * All twenty-two announce strings named NOTHING — not a creature, not a faction, not a place. "A
 * warband is coming up the road" names no warband and no road, and the game knew both: `made` is
 * the list of bodies that were just spawned, `owner` is whose ground it is, and the zone is right
 * there. It was simply never reached for.
 *
 * Every spec gained a `named` variant with `{tokens}`. This fills them, and returns null the moment
 * one cannot be filled — at which point the caller falls back to the old generic `announce`. That
 * fallback is the important half: a line that says "{beast} is out here" with no beast is worse
 * than the generic line it replaced, and a missing line is worse than both.
 */
export function nameLine(spec, made = [], { owner = null, place = null } = {}) {
  if (!spec?.named) return null;
  const alive = (made || []).filter(Boolean);
  if (!alive.length && /\{beasts?\}|\{count\}/.test(spec.named)) return null;
  // whichever kind there is most of is what the line should be about
  const tally = new Map();
  for (const u of alive) {
    const key = u.defId || u.name;
    if (!key) continue;
    tally.set(key, (tally.get(key) || { n: 0, name: u.baseName || u.name }));
    tally.get(key).n++;
  }
  const top = [...tally.values()].sort((a, b) => b.n - a.n)[0];
  const ctx = {
    beast: top?.name || null,
    beasts: top ? (top.n === 1 ? top.name : plural(top.name)) : null,
    count: alive.length || null,
    owner: owner?.name || null,
    place: place || null,
  };
  let missing = false;
  const out = spec.named.replace(/\{(\w+)\}/g, (whole, key) => {
    const v = ctx[key];
    if (v == null || v === '') { missing = true; return whole; }
    return String(v);
  });
  return missing ? null : out;
}

/** "Moor Hound" -> "Moor Hounds". Enough English for a bestiary of forty-six. */
export function plural(name) {
  const s = String(name || '');
  if (/(?:s|x|z|ch|sh)$/i.test(s)) return s + 'es';
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + 'ies';
  if (/(?:man)$/i.test(s)) return s.slice(0, -3) + 'men';
  return s + 's';
}

export function createEncounters({ field, zones, terrain, balance = {}, data = {}, onLog = () => {}, isNight = () => false, sites = null, chests = null }) {
  const cfg = balance.encounters || {};
  /**
   * ONE TABLE, TWO SHAPES.
   *
   * A plain set piece has no `kind`; an event does. They share the roll, so wandering turns up a
   * mix rather than "a fight every twenty-six seconds" — which was the actual complaint.
   */
  const setPieces = (data.encounters || []).filter(e => e.weight > 0);
  const table = [...setPieces];
  const addEvents = d => {
    for (const e of (d?.events || [])) if (e.weight > 0 && !table.some(t => t.id === e.id)) table.push(e);
  };
  addEvents(data.events || EVENTS);
  if (!EVENTS && !data.events) EVENT_DATA.then(d => addEvents(d));

  /** Handed in if anyone wires one, otherwise whichever chest field is live. See js/chests.js. */
  let chestField = chests;
  const theChests = () => chestField || (chestLookup ? chestLookup() : null);

  let since = 0;
  let live = [];
  let events = [];
  const history = [];
  /**
   * WHO OWNS THE GROUND YOU ARE WALKING OVER.
   *
   * A set piece that rolls two hundred metres from a fort should be that fort's soldiers, not a
   * pack of moor hounds that happen to live in the biome. `js/sites.js` knows where the forts,
   * camps and castles are and what each one garrisons, so when it is handed over the encounter
   * borrows the nearest one's `garrison.prefer` and says whose patrol it is. Without it nothing
   * changes — the table still rolls the way it always did.
   */
  let siteField = sites;
  const OWNED_BY = 380;        // metres. Further than this and a place has no say in what you meet.

  /** The hostile place nearest a point, if it is close enough to have a patrol out here. */
  function ownerOf(x, z) {
    const near = siteField?.visible || siteField?.sites || null;
    if (!near) return null;
    let best = null, bestD = OWNED_BY;
    for (const s of near) {
      if (!s.hostile || s.cleared) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Pick an encounter by weight, skipping the ones that do not belong right now. */
  function pick(rng, { night = false, allow = null } = {}) {
    const usable = table.filter(e => (!e.nightOnly || night) && (!allow || allow(e)));
    if (!usable.length) return null;
    // Never the same set piece twice running: variety is the whole point of the file.
    const fresh = usable.filter(e => e.id !== history[history.length - 1]);
    const pool = fresh.length ? fresh : usable;
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let roll = rng() * total;
    for (const e of pool) { roll -= e.weight; if (roll <= 0) return e; }
    return pool[pool.length - 1] || null;
  }

  /** Where the set piece goes: out of sight, in front of you, or right on top of you. */
  function placeFor(spec, at, rng) {
    const R = cfg.radius ?? 90;
    if (spec.where === 'close') {
      const a = rng() * Math.PI * 2, d = (cfg.ambushRadius ?? 26) * (0.6 + rng() * 0.4);
      return [at.x + Math.cos(a) * d, at.z + Math.sin(a) * d];
    }
    if (spec.where === 'ahead') {
      // down the line the player is walking, so they walk into it rather than turn round to find it
      const yaw = at.yaw ?? 0;
      const d = R * (0.7 + rng() * 0.4);
      const wobble = (rng() - 0.5) * 0.7;
      return [at.x + Math.sin(yaw + wobble) * d, at.z + Math.cos(yaw + wobble) * d];
    }
    const a = rng() * Math.PI * 2, d = R * (0.55 + rng() * 0.45);
    return [at.x + Math.cos(a) * d, at.z + Math.sin(a) * d];
  }

  /**
   * The table entries that fit what this encounter wants, falling back to anything that lives here.
   *
   * A nearby stronghold narrows it first: within `OWNED_BY` metres of a raider stockade you meet
   * raiders, because that is who is out here. If the two asks cannot both be met the encounter's
   * own preference wins — a beast hunt near a fort is still a beast hunt.
   */
  function poolFor(spec, x, z, level, owner = null) {
    const all = field.defsFor(x, z, level);
    if (!all.length) return [];
    const fits = (list, want) => list.filter(d =>
      (!want.families || want.families.includes(d.family)) &&
      (!want.roles || want.roles.includes(d.role)));
    const owned = owner?.spec?.garrison?.prefer ? fits(all, owner.spec.garrison.prefer) : all;
    const base = owned.length ? owned : all;
    const narrow = fits(base, spec.prefer || {});
    if (narrow.length) return narrow;
    const wide = fits(all, spec.prefer || {});
    return wide.length ? wide : all;
  }

  /**
   * THE BODIES, laid out the way the spec asks for them.
   *
   * Pulled out of `run` because the road events need exactly the same thing — a headline body with
   * a ring of escorts, already awake or not — and a second copy of it would have drifted.
   */
  async function spawnBodies(spec, x, z, level, owner, rng) {
    const pool = poolFor(spec, x, z, level, owner);
    if (!pool.length) return [];

    const span = spec.count || [3, 5];
    const count = span[0] + Math.floor(rng() * (span[1] - span[0] + 1));
    const spread = spec.spread ?? 10;
    const made = [];

    // the headline body: the rare, the champion, the captain
    const leaders = spec.leader ? pool.filter(d => d.role === 'leader') : [];
    const headDef = leaders.length ? rng.pick(leaders) : rng.pick(pool);
    const headRank = spec.forceRank || spec.leaderRank
      || field.rpg.rollRank(rng, { bonus: spec.rankBonus || 1 });
    const head = await field.addRanked(headDef, level, x, z, headRank);
    if (head) made.push(head);

    // and the bodies around it
    const escortSpan = spec.escort || [count - 1, count - 1];
    const escort = Math.max(0, escortSpan[0] + Math.floor(rng() * Math.max(1, escortSpan[1] - escortSpan[0] + 1)));
    for (let i = 0; i < escort; i++) {
      const a = rng() * Math.PI * 2, r = 2 + rng() * spread;
      const [ex, ez] = terrain.clampToWorld(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (terrain.underwater(ex, ez) || !field.wild(ex, ez)) continue;
      // a swarm is many weak bodies, so its members are rolled a level or two down
      const lvl = spec.weaken ? Math.max(1, Math.round(level * spec.weaken)) : level;
      const body = await field.addRanked(rng.pick(pool), lvl, ex, ez, 'normal');
      if (body) made.push(body);
    }

    for (const unit of made) {
      unit.encounter = spec.id;
      // "already awake" is what makes an ambush an ambush
      if (spec.aggro) { unit.state = 'chase'; unit.aggroRange = Math.max(unit.aggroRange, 70); }
      // and "feeding" is the opposite: it will not notice you until you are close
      if (spec.quiet) unit.aggroRange = Math.min(unit.aggroRange, 9);
    }
    return made;
  }

  /** Build one. Returns a record of what was put down, or null. */
  async function run(spec, at, playerLevel) {
    const rng = field.rng;
    let [x, z] = placeFor(spec, at, rng);
    [x, z] = terrain.clampToWorld(x, z);
    if (terrain.underwater(x, z)) return null;
    if (!field.wild(x, z)) return null;             // a set piece does not happen inside a town

    const level = zones ? zones.levelFor(x, z, rng) : playerLevel;
    const owner = ownerOf(x, z);
    const made = await spawnBodies(spec, x, z, level, owner, rng);
    if (!made.length) return null;

    history.push(spec.id);
    if (history.length > 6) history.shift();
    const record = { id: spec.id, name: spec.name, x, z, level, units: made, at: Date.now(), owner: owner?.key || null };
    live.push(record);
    // …and say whose they are. "A warband on the road" is a line; "A warband on the road — out of
    // Harrowfen" is a reason to go and find Harrowfen.
    // R14: the specific line if every token in it binds, the old generic one if not
    const where = zones?.at?.(x, z);
    const named = nameLine(spec, made, { owner, place: where && where.id >= 0 ? where.name : null });
    const base = named || spec.announce || spec.name;
    const line = owner && !named ? `${base} — out of ${owner.name}.` : base;
    /**
     * R14: a warband that belongs to somebody is an ACTIVITY — it names a real fort you can walk to
     * and it is worth a line. One that belongs to nobody is flavour, and flavour is rationed.
     */
    onLog(line, spec.aggro ? 'bad' : '', {
      tier: owner ? 'activity' : 'flavour',
      id: spec.id, pool: 'encounter', poolSize: table.filter(e => !e.kind).length,
      at: { x, z },
    });
    return record;
  }

  // ---------------------------------------------------------------- the road events

  /** How many bodies are still on their feet in an event. */
  const standing = ev => ev.units.filter(u => u && !u.removed && u.dying == null).length;

  /** Take an event off the board. Whatever it left on the ground stays there. */
  function closeEvent(i) { events.splice(i, 1); }

  /**
   * START ONE.
   *
   * Three shapes share this: a `bait` kind puts a real chest down first and the chest IS the hook
   * (so no chest field means no event, rather than an announcement about a box that is not there);
   * a `trap` puts the bait down and holds its bodies back until you come close; everything else
   * lays its bodies out the way a set piece does.
   */
  async function runEvent(spec, at, playerLevel) {
    const rng = field.rng;
    let [x, z] = placeFor(spec, at, rng);
    [x, z] = terrain.clampToWorld(x, z);
    if (terrain.underwater(x, z)) return null;
    if (!field.wild(x, z)) return null;             // nothing happens to you inside a town's watch

    const level = zones ? zones.levelFor(x, z, rng) : playerLevel;
    const chests = theChests();
    const ev = {
      id: spec.id, kind: spec.kind, name: spec.name, spec,
      x, z, level, t: 0, units: [], chest: null, runner: null, sprung: false, at: Date.now(),
    };

    if (spec.bait) {
      if (!chests) return null;
      ev.chest = chests.place(spec.bait.kind || 'iron', x, z, {
        key: `event:${spec.id}:${Math.round(x)},${Math.round(z)}`,
        level, facing: rng() * Math.PI * 2, name: spec.bait.name || spec.name,
      });
      if (!ev.chest) return null;
    }

    // a trap holds its bodies back; a find never has any
    if (spec.kind !== 'find' && spec.kind !== 'trap') {
      ev.units = await spawnBodies(spec, x, z, level, ownerOf(x, z), rng);
      if (!ev.units.length) {
        if (ev.chest) chests?.remove(ev.chest);
        return null;
      }
    }

    if (spec.kind === 'chase') {
      // js/actors.js: `quarry` is what keeps a fleeing body turning away from you rather than
      // running its original heading into your swing.
      const runner = ev.units[0];
      runner.quarry = true;
      runner.state = 'flee';
      runner.fleeFor = (spec.seconds ?? 30) + 6;
      ev.runner = runner;
    }

    events.push(ev);
    history.push(spec.id);
    if (history.length > 6) history.shift();
    /**
     * R14: every road event has a clock, a place and a reward, which is the definition of an
     * activity — so this one is always worth its two points, and it also gets a row in the Nearby
     * panel and a beacon in the world (js/nearby.js, js/beacon.js).
     */
    const evWhere = zones?.at?.(ev.x, ev.z);
    const evNamed = nameLine(spec, ev.units, { place: evWhere && evWhere.id >= 0 ? evWhere.name : null });
    onLog(evNamed || spec.announce || spec.name, spec.kind === 'defend' || spec.kind === 'rescue' ? 'bad' : 'level', {
      tier: 'activity', id: spec.id, pool: 'event', poolSize: table.filter(e => e.kind).length,
      at: { x: ev.x, z: ev.z },
    });
    return ev;
  }

  /** A trap goes off: whatever was in the grass comes out of it, already awake. */
  async function springTrap(ev) {
    const made = await spawnBodies({ ...ev.spec, aggro: true }, ev.x, ev.z, ev.level, ownerOf(ev.x, ev.z), field.rng);
    ev.units = made;
    onLog(made.length
      ? 'That was not left there for you.'
      : (ev.spec.win || 'Nobody came. Take it.'), made.length ? 'bad' : 'loot');
  }

  /**
   * THE BEATS.
   *
   * One rule per kind and nothing shared between them, on purpose: a rescue is won by an empty
   * guard list, a chase by a body on the ground inside a clock AND a distance, a defend by an empty
   * attacker list inside a clock, a trap by walking close enough, a find by being announced at all.
   *
   * Walking 520 m away closes any of them with no outcome. That is not a failure — it is a road you
   * decided not to go down, and being told off for it would be worse than saying nothing.
   */
  function tickEvents(dt, at) {
    const chests = theChests();
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      const spec = ev.spec;
      ev.t += dt;
      if (Math.hypot(ev.x - at.x, ev.z - at.z) > 520) { closeEvent(i); continue; }

      if (ev.kind === 'rescue') {
        if (standing(ev) === 0) {
          chests?.rewardBag(ev.x, ev.z, { kind: spec.reward?.kind || 'iron', level: ev.level });
          onLog(spec.win || 'They are out.', 'loot');
          closeEvent(i);
        } else if (spec.seconds && ev.t > spec.seconds) {
          onLog(spec.fail || 'You were too slow.', '');
          closeEvent(i);
        }
        continue;
      }

      if (ev.kind === 'chase') {
        const r = ev.runner;
        if (!r || r.removed) { onLog(spec.fail || 'It gets away.', ''); closeEvent(i); continue; }
        if (r.dying != null) {
          chests?.rewardBag(r.x, r.z, { kind: spec.reward?.kind || 'gilded', level: ev.level });
          onLog(spec.win || 'You run it down.', 'loot');
          closeEvent(i);
          continue;
        }
        // keep it running. `fleeFor` counts down in the field's own update, so it is topped up here
        // rather than set once, or the runner would go back to wandering halfway through the chase.
        r.quarry = true;
        r.state = 'flee';
        r.fleeFor = 4;
        const gap = Math.hypot(r.x - at.x, r.z - at.z);
        if (gap > (spec.escapeAt ?? 180) || ev.t > (spec.seconds ?? 30)) {
          onLog(spec.fail || 'It gets away.', '');
          field.removeUnit?.(r);
          closeEvent(i);
        }
        continue;
      }

      if (ev.kind === 'defend') {
        if (standing(ev) === 0) { onLog(spec.win || 'It is still standing.', 'loot'); closeEvent(i); continue; }
        if (ev.t > (spec.seconds ?? 75)) {
          if (ev.chest && chests) chests.remove(ev.chest);
          ev.chest = null;
          onLog(spec.fail || 'They take it and go.', 'bad');
          closeEvent(i);
        }
        continue;
      }

      if (ev.kind === 'trap') {
        if (ev.sprung) { closeEvent(i); continue; }
        // opening the lid springs it too, which is the honest way round
        if (ev.chest?.opened || Math.hypot(ev.x - at.x, ev.z - at.z) < (spec.springAt ?? 16)) {
          ev.sprung = true;
          springTrap(ev);
        } else if (!chests || !chests.chests.includes(ev.chest)) {
          // the bait was range-culled: you never went near it, so stop holding an event slot open
          closeEvent(i);
        }
        continue;
      }

      /**
       * FIND: the chest IS the whole event.
       *
       * Held open until the lid actually comes up, so the pay-off line lands when the player opens
       * it rather than two lines under the announcement — which read as "you have already got it"
       * while the box was still forty metres away. Closing the event does not take the chest away;
       * it is an ordinary chest from that moment on.
       */
      if (ev.chest?.opened) { onLog(spec.win || 'Somebody hid this and never came back for it.', 'loot'); closeEvent(i); }
      else if (ev.t > 300 || !chests || !chests.chests.includes(ev.chest)) closeEvent(i);
    }
  }

  /** One tick. Rolls a set piece now and then, and forgets the ones that are dead or far away. */
  function update(dt, at, player) {
    live = live.filter(r => r.units.some(u => u.dying == null) && Math.hypot(r.x - at.x, r.z - at.z) < 420);
    tickEvents(dt, at);
    since += dt;
    if (since < (cfg.everySeconds ?? 26)) return null;
    since = 0;
    if (field.paused) return null;
    if (field.rng() > (cfg.chance ?? 0.55)) return null;

    /**
     * WHAT IS ALLOWED TO TURN UP RIGHT NOW.
     *
     * The caps used to sit above the roll, which meant three live set pieces stopped EVERYTHING —
     * including a `find`, which puts no bodies on the ground at all and has no business being
     * blocked by a body budget. So the caps narrow the pool instead of cancelling the roll, and
     * there is always something the world can offer you.
     */
    const room = field.enemies.length + field.pending <= (balance.spawn?.maxAlive ?? 38) - 6;
    const setPieceRoom = room && live.length < (cfg.maxLive ?? 3);
    // Three rather than two: a trap and a find can both sit unresolved while you walk past them,
    // and with a cap of two that was enough to stop anything else ever being offered.
    const eventRoom = events.length < (cfg.maxEvents ?? 3);
    const allow = e => {
      if (!e.kind) return setPieceRoom;
      if (!eventRoom) return false;
      return e.kind === 'find' ? true : room;
    };
    const spec = pick(field.rng, { night: isNight(), allow });
    if (!spec) return null;
    if (spec.kind) runEvent(spec, at, player.level);
    else run(spec, at, player.level);
    return spec;
  }

  return {
    update, run, pick, table,
    /** Hand over the site field so a set piece near a stronghold is that stronghold's patrol. */
    setSites(s) { siteField = s; },
    /** Hand over the chest field, so the events that put a real box on the ground can. */
    setChests(c) { if (c) chestField = c; },
    get live() { return live; },
    /** The road events running right now, with how long each has left. */
    get events() {
      return events.map(e => ({
        id: e.id, kind: e.kind, name: e.name, x: e.x, z: e.z, level: e.level,
        left: e.spec.seconds ? Math.max(0, Math.round(e.spec.seconds - e.t)) : null,
        standing: standing(e), sprung: e.sprung, hasChest: !!e.chest,
      }));
    },
    /** Force one, for the debug menu and the tests. Works for a set piece or an event. */
    force: (id, at, level = 1) => {
      const spec = table.find(e => e.id === id) || table[0];
      if (!spec) return null;
      return spec.kind ? runEvent(spec, at, level) : run(spec, at, level);
    },
    stats: () => ({
      kinds: table.length,
      setPieces: table.filter(e => !e.kind).length,
      eventKinds: table.filter(e => e.kind).length,
      live: live.length, events: events.length, lastFew: history.slice(-3),
    }),
  };
}
