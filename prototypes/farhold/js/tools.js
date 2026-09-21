// Farhold — the Tool slot, the Scanner, and the bar that fills while you dig.
//
//   "It appears ranged characters can't harvest materials. Let's make it so mousewheel changes
//    between: Weapon, Mining tool, Scanner. The mining tool should be both a pickaxe and axe. The
//    scanner would be a handheld device used to scan (or stop scanning) for nodes… Instead of
//    having tool be based on weapon (no idea how that works) change it so you build new tools.
//    Tools should also be able to come in different rarities that affect mining speed and other
//    things. Change mining behavior instead of press E to collect an item or chop a tree, to press
//    E or attack a mineable resource with the tool equipped = starts a small progress bar above the
//    resource that collects the item when complete."
//
// "No idea how that works" was the correct reaction. The tool tier was a REGEX ON THE WEAPON'S
// NAME — `/steel|adamant|star|void|mithr/` meant a Steel Tool, `/iron|bronze|copper|silver/` an
// Iron Tool, and anything else was bare hands. So a bow was hands. A crystal staff was hands. Two
// of the thirty classes started the game able to mine and nobody was ever told why. Worse, the
// refusal the mining code prints ("you need a Steel Tool") pointed at a slot that did not exist:
// there was no tool to go and get.
//
// This module owns four things, and nothing else in the game needs to know how any of them work:
//
//   * THE TOOL ITEM — built, worn in `player.equipment.tool`, carrying a `toolKey` that is a row in
//     `data/resources.json`'s `tools` table. Every hardness gate, refusal line and drill rate in
//     the game goes on reading exactly what it read before; only where the key comes from changed.
//     One tool is pick AND axe, because carrying two of a thing that does one job is book-keeping.
//   * THE HELD MODE — what the mouse wheel cycles: weapon, tool, scanner, rod. A mode you have not
//     built is not in the ring, so a new character's wheel has two entries and grows.
//   * THE SCANNER — a sweep on a clock that remembers what it found, for ever.
//   * GATHERING — a progress bar with a target, a clock and a cancel rule, which is the whole of
//     "press E or attack a mineable resource… starts a small progress bar above the resource".
//
// Pure: no DOM, no Three.js. The bar is drawn by js/hud.js, the ore comes out through js/mining.js
// and js/props.js, and the marks go in the marker book. This file decides, it does not draw.

/** The ring the mouse wheel turns. Order matters — it is the order you scroll through. */
export const HELD_MODES = ['weapon', 'tool', 'scanner', 'rod'];

/** What each mode is called on screen, and the one-line reminder under it. */
export const HELD_LABELS = {
  weapon: { name: 'Weapon', note: 'Swing at what is in front of you.' },
  tool: { name: 'Tool', note: 'Dig a seam, fell a tree. Hold or press E.' },
  scanner: { name: 'Scanner', note: 'Sweep the ground for what is under it.' },
  rod: { name: 'Command Rod', note: 'Give your people somewhere to be.' },
};

// ---------------------------------------------------------------------------- the tool item

/**
 * Build a tool item from a base and a rarity.
 *
 * It is deliberately NOT an items.json base. Everything in items.json is a weapon, an armour piece
 * or a trinket, it is SHARED with Emberveil, and Emberveil has no tools — putting one in there
 * would mean a sword shop stocking pickaxes in a game that cannot use them. This is the same
 * decision js/gear.js made for quivers and mounts, for the same reason.
 */
export function makeTool(base, rarity = 'normal', data = null, { level = 1 } = {}) {
  if (!base) return null;
  const r = data?.rarity?.[rarity] || data?.rarity?.normal || { speed: 1, yield: 0, reach: 0, scan: 0 };
  return {
    id: `tool_${base.id}_${rarity}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    type: 'tool', slot: 'tool', subtype: 'tool',
    baseKey: base.id, toolKey: base.toolKey,
    name: rarity === 'normal' ? base.name : `${qualityWord(rarity)} ${base.name}`,
    rarity, level: Math.max(base.level || 1, level),
    tier: base.tier || 1,
    speed: r.speed ?? 1, bonusYield: r.yield ?? 0, reachBonus: r.reach ?? 0, scanBonus: r.scan ?? 0,
    desc: base.desc || '',
    icon: 'tool',
  };
}

/** A word in front of the name, so a rare tool reads as one at a glance in the bag. */
function qualityWord(rarity) {
  return rarity === 'legendary' ? 'Masterwork'
    : rarity === 'rare' ? 'Fine'
    : rarity === 'magic' ? 'Trued' : '';
}

/** The tool a player is wearing, or null. */
export const toolItem = player => player?.equipment?.tool || null;

/**
 * WHICH ROW OF `data/resources.json`'s TOOL TABLE THIS PLAYER COUNTS AS.
 *
 * This replaces `toolTierFor` in js/main.js, which read the weapon's name. Bare hands is still a
 * real answer — clay, sand, fibre and camp scrap are all hardness 0 and always were — so a brand
 * new character can still start the chain without having built anything.
 */
export function toolKeyFor(player) {
  return toolItem(player)?.toolKey || 'hands';
}

/** The tier number, for anything that compares against a node's `hardness` or a prop's `tier`. */
export function toolTierOf(player, resources) {
  return resources?.tools?.[toolKeyFor(player)]?.tier ?? 0;
}

/**
 * How fast this player's bar fills. Rarity is most of it; the perk/affix hook is the rest, so a
 * "you work faster" affix has somewhere to land instead of being invented later.
 */
export function toolSpeed(player) {
  const t = toolItem(player);
  const base = t?.speed ?? 1;
  const derived = 1 + (player?.derived?.gatherSpeed || 0);
  return Math.max(0.25, base * derived);
}

/** Extra material off each gather, as a share. A Masterwork tool pays 40% more for the same time. */
export function toolYield(player) {
  return 1 + (toolItem(player)?.bonusYield || 0) + (player?.derived?.gatherYield || 0);
}

/** How far you may stand from a seam and still work it. */
export function toolReach(player, base = 4) {
  return base + (toolItem(player)?.reachBonus || 0);
}

/** Can this player work that node at all? The same question `faceRate` asks, asked early. */
export function canWork(player, node, resources) {
  const kind = resources?.nodeKinds?.[node?.kind];
  if (!kind) return false;
  const t = resources?.tools?.[toolKeyFor(player)];
  if (kind.handMinable === false && !t?.structure) return false;
  return (t?.tier ?? 0) >= (kind.hardness ?? 0);
}

// ---------------------------------------------------------------------------- what you can build

/**
 * Every tool and device this player could make right now, with whether they can pay for it.
 *
 * `have(id)` is anything that answers "how many of this material have I got" — the materials bag or
 * a store pool, so building at a bench beside a full crate does not mean carrying it all first.
 */
export function buildable(data, player, have = () => 0) {
  const rows = [];
  for (const base of data?.bases || []) {
    const cost = base.cost || {};
    const short = Object.entries(cost).filter(([m, n]) => have(m) < n).map(([m, n]) => ({ m, n, got: have(m) }));
    rows.push({
      kind: 'tool', id: base.id, name: base.name, base, cost, at: base.at || 'hand',
      desc: base.desc, made: base.made,
      level: base.level || 1,
      canAfford: short.length === 0,
      short,
      owned: !!(player?.equipment?.tool?.baseKey === base.id
        || (player?.bag || []).some(i => i?.baseKey === base.id)),
    });
  }
  for (const dev of data?.devices || []) {
    const cost = dev.cost || {};
    const short = Object.entries(cost).filter(([m, n]) => have(m) < n).map(([m, n]) => ({ m, n, got: have(m) }));
    rows.push({
      kind: 'device', id: dev.id, name: dev.name, device: dev, cost, at: dev.at || 'workbench',
      desc: dev.desc, made: dev.made, level: dev.level || 1,
      canAfford: short.length === 0, short,
      owned: !!player?.devices?.[dev.id],
    });
  }
  return rows;
}

/** Mark a device as built. Devices are owned, not rolled — there is no rare scanner. */
export function giveDevice(player, id) {
  if (!player) return false;
  player.devices = player.devices || {};
  if (player.devices[id]) return false;
  player.devices[id] = true;
  return true;
}

// ---------------------------------------------------------------------------- the held mode

/**
 * Which modes this player can scroll to. A mode with nothing behind it is not in the ring — the
 * wheel on a new character has two entries and earns the other two.
 */
export function heldModes(player) {
  const out = ['weapon'];
  if (toolItem(player)) out.push('tool');
  if (player?.devices?.scanner) out.push('scanner');
  if (player?.devices?.command_rod) out.push('rod');
  return out;
}

/** The mode right now, clamped to what is actually available. */
export function heldNow(player) {
  const modes = heldModes(player);
  const want = player?.held || 'weapon';
  return modes.includes(want) ? want : modes[0];
}

/** Turn the wheel. Returns the mode it landed on, or null if there is only one thing to hold. */
export function cycleHeld(player, dir = 1) {
  const modes = heldModes(player);
  if (modes.length < 2 || !player) return null;
  const at = Math.max(0, modes.indexOf(heldNow(player)));
  const next = modes[(at + (dir > 0 ? 1 : modes.length - 1)) % modes.length];
  player.held = next;
  return next;
}

/** Put it back to the weapon — what a fight, a dungeon door or a cutscene wants. */
export function holdWeapon(player) { if (player) player.held = 'weapon'; }

// ---------------------------------------------------------------------------- gathering

/**
 * THE PROGRESS BAR OVER THE ROCK.
 *
 * "…starts a small progress bar above the resource that collects the item when complete, similar to
 * World of Warcraft."
 *
 * Deliberately generic: it knows about a target with a place, a duration and a payout, and nothing
 * about ore or timber. That is what lets the same object run a seam, a tree and — in the same round
 * — a manufacturing structure you are turning a crank on.
 */
export function createGathering({ data = {}, onLog = () => {} } = {}) {
  const cfg = data.gather || {};
  let job = null;

  /**
   * Start one. `seconds` is before the tool's speed is applied; `onDone` is called once, with the
   * job, when the bar fills. Starting a new job cancels the old one silently — you changed your
   * mind about which tree, and being told off for it would be noise.
   */
  function begin({ id, kind = 'seam', name = '', x = 0, y = 0, z = 0, seconds = 3, speed = 1, onDone = null, meta = null }) {
    if (job && job.id === id) return job;          // already working this one; do not restart the bar
    job = {
      id, kind, name, x, y, z, meta,
      total: Math.max(0.2, seconds / Math.max(0.25, speed)),
      elapsed: 0, done: false, onDone,
      from: { x, z },
    };
    return job;
  }

  /**
   * A frame. Returns the live job, or null. Cancels itself if the player walks off, and calls
   * `onDone` exactly once when the bar fills — the caller is free to `begin` the same target again
   * on the next press, which is how you mine a seam dry.
   */
  function tick(dt, at = null, { stillThere = () => true } = {}) {
    if (!job) return null;
    if (!stillThere(job)) { job = null; return null; }
    if (at) {
      const moved = Math.hypot(at.x - job.from.x, at.z - job.from.z);
      if (moved > (cfg.moveCancel ?? 3.2)) { job = null; return null; }
    }
    job.elapsed += dt;
    if (job.elapsed >= job.total) {
      const finished = job;
      job = null;
      finished.done = true;
      try { finished.onDone?.(finished); } catch (e) { onLog(`gather failed: ${e.message}`, 'warn'); }
      return null;
    }
    return job;
  }

  return {
    begin, tick,
    cancel() { job = null; },
    get job() { return job; },
    get active() { return !!job; },
    /** What js/hud.js needs to draw a bar in the world: a point, a fraction and a caption. */
    bar() {
      if (!job) return null;
      return {
        x: job.x, y: job.y, z: job.z,
        fraction: Math.max(0, Math.min(1, job.elapsed / job.total)),
        label: job.name, kind: job.kind,
      };
    },
    /** Seconds a gather of this shape would take for this player. */
    secondsFor(kind, speed = 1) {
      const base = kind === 'soft' ? (cfg.softSeconds ?? 1.2)
        : kind === 'prop' ? (cfg.propSeconds ?? 2.4)
        : (cfg.seamSeconds ?? 3.2);
      return base / Math.max(0.25, speed);
    },
  };
}

// ---------------------------------------------------------------------------- the scanner

/**
 * THE SCANNER.
 *
 *   "The scanner would be a handheld device used to scan (or stop scanning) for nodes. When
 *    scanning for nodes, hide all the quest/markers and only show node markers for simplicity, and
 *    show the name of the resource on the floating indicator. The scanner should only work nearby
 *    the player but once a node is scanned it should remain visible on the map."
 *
 * Two halves, and the second is the interesting one. The sweep is short-ranged and local, so
 * prospecting is a thing you DO with your feet rather than a button that reveals a continent. What
 * it finds is permanent — the marker book already persists, so a seam you scanned in act one is
 * still on your chart in act four, and the map's Find tab reads the same list.
 */
export function createScanner({ data = {}, markers = null, onLog = () => {}, label = n => n.resource } = {}) {
  const cfg = data.scan || {};
  /** node id -> the row we remembered. Survives through the marker book, not through this. */
  const found = new Map();
  let on = false;
  let since = 0;
  let ping = 0;

  function setOn(v, player = null) {
    const want = !!v;
    if (want === on) return on;
    on = want;
    since = 0; ping = 0;
    onLog(on
      ? 'The scanner wakes up. It only reads the ground close to you.'
      : 'The scanner goes quiet.', on ? 'good' : '');
    return on;
  }

  /**
   * A sweep. `nodesNear(x, z, range)` hands back whatever node field is live — the surface one, or
   * a dungeon's own patch, so scanning underground finds the deep veins down there.
   *
   * Returns the rows found THIS sweep (new ones only), so the caller can say "iron ore, ninety
   * metres north" once rather than every half second.
   */
  function tick(dt, at, { nodesNear = () => [], player = null } = {}) {
    if (!on || !at) return [];
    ping = Math.max(0, ping - dt);
    since += dt;
    if (since < (cfg.everySeconds ?? 0.45)) return [];
    since = 0;
    const range = (cfg.range ?? 110) + (player?.equipment?.tool?.scanBonus || 0);
    const fresh = [];
    for (const n of nodesNear(at.x, at.z, range)) {
      if (!n || n.gone) continue;
      const id = String(n.id);
      if (found.has(id)) continue;
      if (Math.hypot(n.x - at.x, n.z - at.z) > range) continue;
      const row = {
        id, x: n.x, z: n.z, kind: n.kind,
        resource: n.resource, name: label(n),
        band: n.band || null, hardness: n.hardness ?? 0,
      };
      found.set(id, row);
      fresh.push(row);
      if (found.size > (cfg.maxMarks ?? 400)) {
        // Oldest out. A survey that has grown past four hundred entries is not a survey any more,
        // and the map stops being readable long before the memory becomes a problem.
        const first = found.keys().next().value;
        found.delete(first);
      }
    }
    if (fresh.length && ping <= 0) {
      ping = cfg.pingSeconds ?? 1.6;
      const names = [...new Set(fresh.map(f => f.name))].slice(0, 3).join(', ');
      onLog(`Scanner: ${names}${fresh.length > 3 ? ` and ${fresh.length - 3} more` : ''}.`, 'good');
    }
    return fresh;
  }

  return {
    tick, setOn,
    toggle(player) { return setOn(!on, player); },
    get on() { return on; },
    /** Everything ever scanned, nearest first if you hand in where you are standing. */
    list(at = null) {
      const rows = [...found.values()];
      if (!at) return rows;
      return rows
        .map(r => ({ ...r, distance: Math.hypot(r.x - at.x, r.z - at.z) }))
        .sort((a, b) => a.distance - b.distance);
    },
    has: id => found.has(String(id)),
    get size() { return found.size; },
    /** Remembered across a save, because a survey you have to redo is not a survey. */
    toJSON() { return { on, found: [...found.values()] }; },
    load(saved) {
      if (!saved) return;
      found.clear();
      for (const r of saved.found || []) found.set(String(r.id), r);
      on = !!saved.on;
    },
  };
}
