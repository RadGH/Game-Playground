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
//   enc.update(dt, control, player);
//
// Pure-ish: it owns no meshes and no DOM. The enemy field does all the building.

export function createEncounters({ field, zones, terrain, balance = {}, data = {}, onLog = () => {}, isNight = () => false, sites = null }) {
  const cfg = balance.encounters || {};
  const table = (data.encounters || []).filter(e => e.weight > 0);
  let since = 0;
  let live = [];
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
  function pick(rng, { night = false } = {}) {
    const usable = table.filter(e => !e.nightOnly || night);
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

  /** Build one. Returns a record of what was put down, or null. */
  async function run(spec, at, playerLevel) {
    const rng = field.rng;
    let [x, z] = placeFor(spec, at, rng);
    [x, z] = terrain.clampToWorld(x, z);
    if (terrain.underwater(x, z)) return null;
    if (!field.wild(x, z)) return null;             // a set piece does not happen inside a town

    const level = zones ? zones.levelFor(x, z, rng) : playerLevel;
    const owner = ownerOf(x, z);
    const pool = poolFor(spec, x, z, level, owner);
    if (!pool.length) return null;

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
    if (!made.length) return null;

    for (const unit of made) {
      unit.encounter = spec.id;
      // "already awake" is what makes an ambush an ambush
      if (spec.aggro) { unit.state = 'chase'; unit.aggroRange = Math.max(unit.aggroRange, 70); }
      // and "feeding" is the opposite: it will not notice you until you are close
      if (spec.quiet) unit.aggroRange = Math.min(unit.aggroRange, 9);
    }

    history.push(spec.id);
    if (history.length > 6) history.shift();
    const record = { id: spec.id, name: spec.name, x, z, level, units: made, at: Date.now(), owner: owner?.key || null };
    live.push(record);
    // …and say whose they are. "A warband on the road" is a line; "A warband on the road — out of
    // Harrowfen" is a reason to go and find Harrowfen.
    const line = owner ? `${spec.announce || spec.name} — out of ${owner.name}.` : (spec.announce || spec.name);
    onLog(line, spec.aggro ? 'bad' : '');
    return record;
  }

  /** One tick. Rolls a set piece now and then, and forgets the ones that are dead or far away. */
  function update(dt, at, player) {
    live = live.filter(r => r.units.some(u => u.dying == null) && Math.hypot(r.x - at.x, r.z - at.z) < 420);
    since += dt;
    if (since < (cfg.everySeconds ?? 26)) return null;
    since = 0;
    if (live.length >= (cfg.maxLive ?? 3)) return null;
    if (field.paused) return null;
    if (field.enemies.length + field.pending > (balance.spawn?.maxAlive ?? 38) - 6) return null;
    if (field.rng() > (cfg.chance ?? 0.55)) return null;

    const spec = pick(field.rng, { night: isNight() });
    if (!spec) return null;
    run(spec, at, player.level);
    return spec;
  }

  return {
    update, run, pick, table,
    /** Hand over the site field so a set piece near a stronghold is that stronghold's patrol. */
    setSites(s) { siteField = s; },
    get live() { return live; },
    /** Force one, for the debug menu and the tests. */
    force: (id, at, level = 1) => {
      const spec = table.find(e => e.id === id) || table[0];
      return spec ? run(spec, at, level) : null;
    },
    stats: () => ({ kinds: table.length, live: live.length, lastFew: history.slice(-3) }),
  };
}
