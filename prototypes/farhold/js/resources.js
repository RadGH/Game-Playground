// Farhold — where raw materials come from, and the one decision that makes gathering interesting.
//
// BUILDING_EXPANSION §1. The user asked for exactly one thing here, in these words:
//
//   "I would like the resource system so that I have to choose between a particularly dense node
//    far away with more travel time, or a closer node that produces less per tick."
//
// So that trade-off is not an emergent side effect of this file, it IS this file. Every node
// carries a **richness** (how much comes out per swing) and sits at a **distance** (how long you
// spend not swinging), and `haulReport()` folds both into ONE number — units delivered per minute —
// that the player can read before they commit rather than regret afterwards.
//
//     delivered = carry / (carry / faceRate + 2 * distance / walkSpeed)
//
// Read it as: fill your arms at the face, walk home, walk back. A Mother Lode four hundred metres
// out and a Lean seam behind the workshop can come to the same number, and when they do the choice
// is genuinely yours. `breakEvenDistance()` says exactly where the two cross.
//
// The escape hatch is §8: put a store or a logistics pole within reach of the node and the ore goes
// straight into the pool — distance drops out of the sum and the rich node wins again. Which turns
// the question from "which node do I walk to" into "where do I put the base", and that is the
// better question.
//
//   import { createNodeField, haulReport, compareNodes, mine } from './resources.js';
//   const field = createNodeField({ data: resources, rng, area: { x: 0, z: 0, radius: 300 } });
//   const rep = haulReport(node, { origin: player, data: resources, tool: 'iron_tool' });
//   rep.deliveredPerMinute;   // the number the whole system exists to produce
//
// Pure: no DOM, no Three.js. Placing the meshes and swinging the pick belong to whoever owns the
// scene; this file only knows what is in the ground and what it costs to get it home.

import { makeRng } from '../../emberveil/js/rng.js';

// ---------------------------------------------------------------- the numbers

/** A node's yield at the face, in units a second, with the tool you are holding. */
export function faceRate(node, { data, tool = 'iron_tool' } = {}) {
  const kind = data?.nodeKinds?.[node.kind];
  const t = data?.tools?.[tool] || data?.tools?.hands || { tier: 0, rate: 0.5 };
  if (!kind) return 0;
  if (kind.handMinable === false && !t.structure) return 0;   // a gas vent is not a hand job
  if ((t.tier ?? 0) < (kind.hardness ?? 0)) return 0;          // wrong tool: not slower, impossible
  return kind.baseYield * (node.richness || 1) * (t.rate || 1);
}

/** Units per swing, for the held-tool interaction. A swing that gives 0.4 of an ore is a bad swing. */
export function perSwing(node, ctx = {}) {
  const kind = ctx.data?.nodeKinds?.[node.kind];
  return faceRate(node, ctx) * (kind?.swingSeconds || 1.6);
}

/**
 * How fast you walk carrying this stuff. Stone is miserable and gold is not, and that difference
 * is load-bearing: it is why a quarry two hundred metres out is a worse idea than an ore seam at
 * the same range.
 */
export function walkSpeedFor(res, { data } = {}) {
  const haul = data?.haul || {};
  const weight = data?.materials?.[res]?.weight ?? 1;
  return (haul.walkSpeed ?? 4.6) / (1 + (haul.loadPenalty ?? 0.22) * weight);
}

/** How much of this you can get your arms round in one trip. */
export function carryFor(res, { data, carry = null } = {}) {
  const stack = data?.materials?.[res]?.stack ?? 40;
  return Math.min(carry ?? data?.haul?.carry ?? 40, stack);
}

/**
 * THE TRADE-OFF, as one report.
 *
 * ctx: { data, origin: {x,z}, tool, carry, stores, pooled }
 *   `stores` is a js/stores.js network — if a pool reaches the node the goods go straight into it
 *   and the walk stops existing. Pass `pooled: true` to force that on without a network (tests do).
 *
 * Everything in here is a number the UI is meant to SHOW. Nothing about this decision should have
 * to be learned by getting it wrong.
 */
export function haulReport(node, ctx = {}) {
  const data = ctx.data || {};
  const rate = faceRate(node, ctx);
  const res = node.resource;
  const origin = ctx.origin || { x: 0, z: 0 };
  const distance = Math.hypot((node.x ?? 0) - (origin.x ?? 0), (node.z ?? 0) - (origin.z ?? 0));
  const pooled = ctx.pooled ?? (ctx.stores ? !!ctx.stores.poolAt(node.x, node.z) : false);
  const speed = walkSpeedFor(res, { data });
  const carry = carryFor(res, { data, carry: ctx.carry });

  // the whole sum, in one line, and the reason this file exists
  const walkSeconds = pooled ? 0 : (2 * distance) / speed;
  const tripSeconds = rate > 0 ? carry / rate + walkSeconds : Infinity;
  const delivered = rate > 0 ? carry / tripSeconds : 0;

  const band = data.richnessBands?.find(b => b.key === node.band);
  const name = data.materials?.[res]?.name || res;
  return {
    node: node.id,
    resource: res,
    resourceName: name,
    richness: +(node.richness || 1).toFixed(2),
    band: node.band,
    bandName: band?.name || node.band,
    // what you get standing there
    facePerSecond: +rate.toFixed(3),
    facePerMinute: +(rate * 60).toFixed(1),
    perSwing: +perSwing(node, ctx).toFixed(2),
    // what it costs to get it home
    distance: +distance.toFixed(1),
    pooled,
    carry,
    walkSeconds: +walkSeconds.toFixed(1),
    tripSeconds: Number.isFinite(tripSeconds) ? +tripSeconds.toFixed(1) : Infinity,
    // the number that decides it
    deliveredPerSecond: +delivered.toFixed(3),
    deliveredPerMinute: +(delivered * 60).toFixed(1),
    // how much of your effort the walk eats. 0.6 means you spend more time walking than mining.
    walkShare: Number.isFinite(tripSeconds) && tripSeconds > 0 ? +(walkSeconds / tripSeconds).toFixed(3) : 0,
    remaining: node.infinite ? Infinity : node.amount,
    workable: rate > 0,
    why: rate > 0 ? '' : whyNotWorkable(node, ctx),
  };
}

/**
 * Why you cannot work this, AND WHAT TO DO ABOUT IT.
 *
 * "too hard for an Iron Tool — you need a Steel Tool" is a true sentence that leaves the player
 * stuck, because nothing anywhere in Farhold tells them a tool tier is read off the weapon in their
 * hands. There is no pick slot to go and fill. So the tool's own `from` line comes out with the
 * refusal: the data says where a tier comes from, and every screen that prints a refusal gets the
 * answer for free.
 */
function whyNotWorkable(node, ctx) {
  const data = ctx.data || {};
  const kind = data.nodeKinds?.[node.kind];
  const t = data.tools?.[ctx.tool || 'iron_tool'];
  if (!kind) return 'no such node kind';
  if (kind.handMinable === false) return `${kind.name} has to be taken by a structure, not by hand`;
  if (t && (t.tier ?? 0) < (kind.hardness ?? 0)) {
    // the CHEAPEST tool that clears the bar, not whichever happens to come first in the file
    const need = Object.entries(data.tools || {})
      .filter(([, x]) => (x.tier ?? 0) >= kind.hardness && !x.structure)
      .sort((a, b) => (a[1].tier ?? 0) - (b[1].tier ?? 0))[0];
    const how = need?.[1]?.from ? `. That means ${need[1].from}` : '';
    const a = /^[aeiou]/i.test(t.name || '') ? 'an' : 'a';
    const holding = (t.tier ?? 0) <= 0 ? 'too hard to shift by hand' : `too hard for ${a} ${t.name || 'tool'}`;
    return `${holding}. You need a ${need ? need[1].name : 'better tool'}${how}`;
  }
  if (node.depleted) return 'worked out; it will come back';
  return 'not workable';
}

/**
 * What to call a node: its material and its kind, minus any word they already share. "Iron Ore" in
 * an "Ore Outcrop" is an "Iron Ore Outcrop", not an "Iron Ore Ore Outcrop".
 */
export function nodeLabel(node, ctx = {}) {
  const resourceName = node.resourceName || ctx.data?.materials?.[node.resource]?.name || node.resource;
  const kindName = ctx.data?.nodeKinds?.[node.kind]?.name || node.kind;
  const rest = kindName.split(' ').filter(w => !resourceName.toLowerCase().includes(w.toLowerCase())).join(' ');
  return rest ? `${resourceName} ${rest}` : resourceName;
}

/** One line a player can read off a node before deciding to walk to it. */
export function nodeText(node, ctx = {}) {
  const r = haulReport(node, ctx);
  const what = nodeLabel(node, ctx);
  if (!r.workable) return `${r.bandName} ${what} — ${r.why}`;
  if (r.pooled) return `${r.bandName} ${what} (${r.richness}x) — ${r.facePerMinute}/min, inside the store pool, so nothing to carry.`;
  return `${r.bandName} ${what} (${r.richness}x) — ${r.facePerMinute}/min at the face, ${Math.round(r.distance)} m away, ${r.deliveredPerMinute}/min once you have walked it home.`;
}

/**
 * Rank a handful of nodes by what they would actually deliver, and say why the winner won.
 *
 * The `because` line is the point of the whole feature: "richer, but the walk eats it" is a
 * sentence a player can act on; a sorted list is not.
 */
export function compareNodes(nodes, ctx = {}) {
  const rows = nodes.map(n => haulReport(n, ctx)).sort((a, b) => b.deliveredPerMinute - a.deliveredPerMinute);
  const best = rows[0];
  for (const r of rows) {
    if (!best || r === best) { r.because = r.workable ? 'best delivery you have found' : r.why; continue; }
    if (!r.workable) { r.because = r.why; continue; }
    const richer = r.richness > best.richness;
    const nearer = r.distance < best.distance;
    r.because = richer ? 'richer, but the walk eats the difference'
      : nearer ? 'closer, but there is less in it'
      : 'poorer and further — no reason to work it';
  }
  return rows;
}

/**
 * At what distance does a node of `rate` units a second stop beating `targetPerSecond` delivered?
 *
 * Rearranged straight out of the delivery sum above:
 *
 *     carry / target = carry / rate + 2d / speed   =>   d = speed/2 * (carry/target - carry/rate)
 *
 * A negative answer means the rich node is already losing at zero distance, which happens more
 * often than you would think once a crusher is in the picture. This is the number to put on the
 * map when the player is choosing where to set up.
 */
export function breakEvenDistance(rate, targetPerSecond, { data, resource = 'iron_ore', carry = null } = {}) {
  if (rate <= 0 || targetPerSecond <= 0) return 0;
  const speed = walkSpeedFor(resource, { data });
  const c = carryFor(resource, { data, carry });
  return (speed / 2) * (c / targetPerSecond - c / rate);
}

/**
 * How far out a node of this richness may sit and still beat the one you are working now.
 * The friendly wrapper: two nodes in, one distance out.
 */
export function breakEvenAgainst(richNode, nearNode, ctx = {}) {
  const near = haulReport(nearNode, ctx);
  const rate = faceRate(richNode, ctx);
  const d = breakEvenDistance(rate, near.deliveredPerSecond, { data: ctx.data, resource: richNode.resource, carry: ctx.carry });
  return {
    distance: +Math.max(0, d).toFixed(1),
    beatsIt: (haulReport(richNode, ctx).deliveredPerSecond) > near.deliveredPerSecond,
    text: d <= 0
      ? `Nothing to gain: the ${near.bandName.toLowerCase()} seam wins at any distance.`
      : `Worth walking to anything inside ${Math.round(d)} m. Past that, the near seam delivers more.`,
  };
}

/** What a drill on this node produces per second — the promotion §1 asks hand-mining to earn. */
export function drillRate(node, { data, drill = 'drill', powered = 1 } = {}) {
  const kind = data?.nodeKinds?.[node.kind];
  const d = data?.tools?.[drill];
  if (!kind || !d) return 0;
  if ((d.tier ?? 0) < (kind.hardness ?? 0)) return 0;
  return kind.baseYield * (node.richness || 1) * (d.rate || 1) * Math.max(0, powered);
}

// ---------------------------------------------------------------- working a node

/**
 * Work a node for `seconds`. Returns what came out and leaves the node changed.
 *
 * A node that runs dry is not gone: it goes `depleted` with a timer on it, and comes back a little
 * poorer than it was (§1.20 and `respawn` in the data). So the ground round your house stays
 * workable forever and is never quite as good as walking out to a fresh seam — which is the same
 * tension as the distance trade-off, at a slower tempo.
 */
export function mine(node, seconds, ctx = {}) {
  const data = ctx.data || {};
  if (node.depleted) return { got: 0, depleted: true, why: 'worked out' };
  const rate = ctx.rate ?? faceRate(node, ctx);
  if (rate <= 0) return { got: 0, depleted: false, why: whyNotWorkable(node, ctx) };
  const want = rate * seconds;
  const got = node.infinite ? want : Math.min(want, node.amount);
  if (!node.infinite) node.amount = Math.max(0, node.amount - got);
  node.worked = (node.worked || 0) + got;
  if (!node.infinite && node.amount <= 1e-9) depleteNode(node, data);
  return { got, depleted: !!node.depleted, why: '' };
}

/** Mark a node worked out and set its respawn timer, or retire it for good. */
export function depleteNode(node, data = {}) {
  const kind = data.nodeKinds?.[node.kind] || {};
  const respawn = node.respawnSeconds ?? kind.respawnSeconds ?? 0;
  node.amount = 0;
  node.depleted = true;
  node.respawnIn = respawn > 0 ? respawn : null;
  node.gone = respawn <= 0;         // a wreck, a meteor, a rare seam: it does not come back
  return node;
}

/**
 * Run the respawn clocks. `seconds` is in-game seconds, so the caller decides how fast a day is.
 * Returns the nodes that came back, for a log line or a map refresh.
 */
export function tickNodes(nodes, seconds, data = {}) {
  const cfg = data.respawn || { amountShare: 0.75, richnessDecay: 0.92, richnessFloor: 0.5 };
  const back = [];
  for (const n of nodes) {
    if (!n.depleted || n.gone || n.respawnIn == null) continue;
    n.respawnIn -= seconds;
    if (n.respawnIn > 0) continue;
    n.richness = Math.max(cfg.richnessFloor, +(n.richness * cfg.richnessDecay).toFixed(3));
    n.band = bandFor(n.richness, data);
    n.initial = Math.max(1, Math.round(n.initial * cfg.amountShare));
    n.amount = n.initial;
    n.depleted = false;
    n.respawnIn = null;
    back.push(n);
  }
  return back;
}

/** Which band a richness falls in, so a respawned node relabels itself honestly. */
export function bandFor(richness, data = {}) {
  const bands = data.richnessBands || [];
  for (const b of bands) if (richness >= b.range[0] && richness < b.range[1]) return b.key;
  return bands.length ? (richness < bands[0].range[0] ? bands[0].key : bands[bands.length - 1].key) : 'fair';
}

// ---------------------------------------------------------------- putting them in the ground

/** Pick a richness band, then a richness inside it. The band is what the player is told. */
export function rollRichness(rng, data, bandScale = 1) {
  const bands = data.richnessBands || [{ key: 'fair', range: [0.8, 1.2], weight: 1 }];
  const total = bands.reduce((a, b) => a + (b.weight || 1), 0);
  let r = rng() * total;
  let pick = bands[bands.length - 1];
  for (const b of bands) { r -= (b.weight || 1); if (r <= 0) { pick = b; break; } }
  const richness = +(rng.range(pick.range[0], pick.range[1]) * bandScale).toFixed(2);
  return { band: bandFor(richness, data), richness };
}

/**
 * Which node kinds suit this biome. An empty `biomes` list in the data means "anywhere on land",
 * which is how boulders and wrecks turn up everywhere without being listed twenty-five times.
 */
/**
 * Which node kinds suit this biome ON THE SURFACE.
 *
 * `indoors` and `placedOnly` were in the data from the start and read by nobody, and an empty
 * `biomes` list means "anywhere on land" — so the Deep Vein, whose whole description is
 * *"Underground, and something is usually standing in front of it"*, was scattered across open
 * grassland like any outcrop. It is hardness 2, its heaviest resource weight is iron ore, and the
 * only tier-2 tool is a steel weapon you cannot have yet. Reported in play, exactly: *"I found iron
 * ore but it says I need a steel tool. How do I get steel if I can't mine iron?"* — a wall with no
 * door, made out of one unread flag.
 *
 * Pass `indoors: true` for a dungeon floor and the underground kinds come back instead.
 */
export function kindsForBiome(data, biome, { indoors = false } = {}) {
  return Object.entries(data.nodeKinds || {})
    .filter(([, k]) => !k.fromPlanet && !k.placedOnly)
    .filter(([, k]) => !!k.indoors === !!indoors)
    .filter(([, k]) => !k.biomes?.length || k.biomes.includes(biome));
}

/**
 * R14 — WHERE DOES <THIS> COME FROM?
 *
 *   "We need a way for the player to locate materials, through combination of scanning in the world
 *    or filters on the map."
 *
 * Half of "locate a material" is the sweep; the other half is knowing what you are looking for
 * before you sweep for it. This is the index behind both: material id → the node kinds that yield
 * it, the biomes those kinds live in, the tool tier they need, and whether they want water or a
 * roof. Derived from data/resources.json at load, never written by hand — add a node kind and the
 * Find list and the tooltips follow it on their own.
 */
export function materialIndex(data = {}) {
  const mats = data.materials || {};
  const out = new Map();
  for (const [kindId, kind] of Object.entries(data.nodeKinds || {})) {
    for (const res of Object.keys(kind.resources || {})) {
      if (!out.has(res)) {
        out.set(res, {
          id: res,
          name: mats[res]?.name || res.replace(/_/g, ' '),
          colour: mats[res]?.colour || mats[res]?.color || '#9a9285',
          kinds: [], biomes: new Set(), hardness: Infinity,
          // `indoors` means "you will only find this underground", so it starts true and one
          // surface kind is enough to clear it. Iron comes out of a deep vein AND an ore outcrop;
          // telling a player to go and find a cave for it would be a lie.
          indoors: true, nearWater: false, placedOnly: true, fromPlanet: true,
        });
      }
      const row = out.get(res);
      row.kinds.push({ id: kindId, name: kind.name || kindId, hardness: kind.hardness ?? 1, desc: kind.desc || '' });
      for (const b of kind.biomes || []) row.biomes.add(b);
      row.hardness = Math.min(row.hardness, kind.hardness ?? 1);
      if (!kind.indoors) row.indoors = false;
      // …whereas `nearWater` is a hint about where to look, so any kind that wants water sets it
      if (kind.nearWater) row.nearWater = true;
      // "placed only" and "from the planet" are only true of a material if EVERY kind that makes it
      // is — one ordinary seam is enough to make it something you can go and find
      if (!kind.placedOnly) row.placedOnly = false;
      if (!kind.fromPlanet) row.fromPlanet = false;
    }
  }
  for (const row of out.values()) {
    row.biomes = [...row.biomes];
    if (!Number.isFinite(row.hardness)) row.hardness = 1;
  }
  return out;
}

/**
 * One line saying where to look. "Grassland, marsh or beach, at the water's edge — bare hands."
 *
 * `biomeName` turns a World Forge biome key into the words a player reads; without it the keys go
 * through as they are, which is still better than nothing.
 */
export function whereToFind(row, { biomeName = null, toolNames = null } = {}) {
  if (!row) return '';
  const where = row.indoors
    ? 'underground — in a cave or a mine'
    : row.biomes.length
      ? row.biomes.slice(0, 4).map(b => (biomeName ? biomeName(b) : b)).join(', ')
        + (row.biomes.length > 4 ? ` and ${row.biomes.length - 4} more` : '')
      : 'anywhere on the surface';
  const water = row.nearWater ? ", at the water's edge" : '';
  const tool = row.hardness <= 0
    ? 'bare hands'
    : toolNames?.[row.hardness]
      ? toolNames[row.hardness].toLowerCase()
      : `a tier-${row.hardness} tool`;
  return `${where}${water} \u2014 ${tool}.`;
}

/**
 * Lay out a patch of nodes.
 *
 * opts:
 *   area    { x, z, radius }   where to scatter them
 *   biomeAt (x, z) => key      whoever owns the terrain supplies this; defaults to one biome
 *   band    'low'|'medium'|'high'   the planet's difficulty band — §1.19, a starter world has
 *                                   enough to leave and no more
 *   planet  { rare: ['aetherite', …], elements: {…} }  from universe/data/elements.json, so §1.3's
 *                                   rare seams are the ones this world actually holds
 *   count   how many to try for; density from the band scales it
 *
 * Nodes are spaced apart so two never sit on top of each other — a node you cannot walk round is a
 * node that does not exist.
 */
export function createNodeField({ data = {}, rng = makeRng(1), area = { x: 0, z: 0, radius: 300 }, biomeAt = null, biome = 'grassland', band = 'medium', planet = null, count = 24, minGap = 18,
  /**
   * R14 — `nearWater` IS READ NOW.
   *
   *   "Where do you find clay?"
   *
   * Clay comes from one node kind, `clay_bank`, and it is not rare: marsh, grassland, rainforest,
   * temperate forest, beach and savanna, hardness 0, bare hands will do. Its own description says
   * "Cut out of a riverbank with your hands if you have to" and it carries `nearWater: true` — and
   * `kindsForBiome` never looked at that flag, so clay banks were scattered evenly across six whole
   * biomes instead of sitting at the water's edge where the game tells you to look.
   *
   * This is the same shape of bug as `deep_vein`'s `indoors` one round earlier: a rule written into
   * the data, read by nobody. And it matters more than it sounds, because the furnace costs clay and
   * the kiln costs clay — clay is the gate on the first two machines in the game, so a player who
   * cannot find it cannot start refining at all.
   *
   * `waterNear(x, z)` is supplied by whoever owns the terrain. Without it (the node tests) nothing
   * is filtered and the behaviour is exactly what it was.
   */
  waterNear = null,
} = {}) {
  const bandCfg = data.planetBands?.[band] || data.planetBands?.medium || { richness: 1, density: 1, rareChance: 0.8 };
  const want = Math.max(1, Math.round(count * (bandCfg.density || 1)));
  const nodes = [];
  let seq = 0;

  const tries = want * 8;
  for (let i = 0; i < tries && nodes.length < want; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * area.radius;
    const x = area.x + Math.cos(a) * d, z = area.z + Math.sin(a) * d;
    if (nodes.some(n => Math.hypot(n.x - x, n.z - z) < minGap)) continue;
    const here = biomeAt ? biomeAt(x, z) : biome;
    let kinds = kindsForBiome(data, here);
    if (!kinds.length) continue;
    /**
     * R14: away from water, the kinds that want water are simply not on the table here. Filtering
     * the KINDS rather than rejecting the spot is what keeps the density right — rejecting spots
     * would eat the retry budget and thin every other seam in a dry biome along with the clay.
     */
    if (waterNear && !waterNear(x, z)) {
      const dry = kinds.filter(([, k]) => !k.nearWater);
      if (dry.length) kinds = dry;
    }
    const [kindId, kind] = rng.pick(kinds);
    const res = pickResource(rng, kind);
    if (!res) continue;
    nodes.push(makeNode({ data, rng, seq: seq++, kindId, kind, res, x, z, bandCfg, biome: here }));
  }

  // §1.3 — the rare seam, and only if this planet holds anything rare at all
  for (const key of (planet?.rare || [])) {
    if (!rng.chance(bandCfg.rareChance ?? 0.8)) continue;
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * area.radius;
    const el = planet?.elements?.[key] || { name: key, colour: '#b79cf5' };
    const kind = { ...(data.nodeKinds?.rare_seam || {}), ...(data.rareSeam || {}) };
    const node = makeNode({
      data, rng, seq: seq++, kindId: 'rare_seam', kind, res: key,
      x: area.x + Math.cos(a) * d, z: area.z + Math.sin(a) * d, bandCfg, biome,
    });
    node.rare = true;
    node.resourceName = el.name || key;
    node.colour = el.color || el.colour || '#b79cf5';
    nodes.push(node);
  }

  return nodes;
}

function pickResource(rng, kind) {
  const entries = Object.entries(kind.resources || {});
  if (!entries.length) return null;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [id, w] of entries) { r -= w; if (r <= 0) return id; }
  return entries[entries.length - 1][0];
}

function makeNode({ data, rng, seq, kindId, kind, res, x, z, bandCfg, biome }) {
  const { band: bandKey, richness } = rollRichness(rng, data, bandCfg.richness || 1);
  const [lo, hi] = kind.amountBand || [50, 150];
  const amount = kind.infinite ? Infinity : Math.max(1, Math.round(rng.range(lo, hi) * richness));
  return {
    id: `n${seq}`,
    kind: kindId,
    resource: res,
    biome,
    x: +x.toFixed(2), z: +z.toFixed(2),
    richness, band: bandKey,
    amount, initial: amount,
    infinite: !!kind.infinite,
    radius: kind.radius ?? 2,
    hardness: kind.hardness ?? 1,
    respawnSeconds: kind.respawnSeconds ?? 0,
    handMinable: kind.handMinable !== false,
    guarded: !!kind.guarded,
    depleted: false, gone: false, respawnIn: null, worked: 0,
  };
}

/**
 * A FIXED HANDFUL OF NODES, WITH THE SAME SHAPE AS THE WHOLE-PLANET ORE.
 *
 * A dungeon floor is not a tiled world — it is one room plan that exists while you are in it — so
 * `createNodeWorld` is the wrong tool and a second interaction path would be the wrong answer. This
 * wraps a plain list in the same `near/at/around/byId/noteWorked/tick` interface the surface ore
 * offers, so the E prompt, the seam view and the drills are one code path underground and above.
 *
 * Nothing is saved: a dungeon is regenerated every time you go down it, and its seams come back
 * with it. That is the same bargain the enemies in it already make.
 */
export function createNodePatch(nodes = [], data = {}) {
  const live = nodes.filter(Boolean);
  const around = () => live;
  return {
    around,
    near(x, z, reach = 60) {
      return live
        .map(n => ({ node: n, away: Math.hypot(n.x - x, n.z - z) }))
        .filter(r => r.away <= reach + (r.node.radius || 2))
        .sort((a, b) => a.away - b.away)
        .map(r => r.node);
    },
    at(x, z, reach = 4) { return this.near(x, z, reach)[0] || null; },
    byId(id) { return live.find(n => n.id === id) || null; },
    noteWorked() { /* nothing to remember: the floor is rebuilt on every visit */ },
    tick(seconds) { tickNodes(live, seconds, data); },
    get nodes() { return live; },
    toJSON() { return null; },
    load() { /* not saved — see the note above */ },
  };
}

/**
 * A node the world put there on purpose rather than by scatter: a meteor fall, a cleared camp, a
 * wreck at the landing site. The event systems own where; this owns what is in it.
 */
export function placedNode({ data = {}, rng = makeRng(2), kindId, x = 0, z = 0, band = 'medium', resource = null, id = null } = {}) {
  const kind = data.nodeKinds?.[kindId];
  if (!kind) return null;
  const bandCfg = data.planetBands?.[band] || { richness: 1 };
  const res = resource || pickResource(rng, kind);
  const node = makeNode({ data, rng, seq: 0, kindId, kind, res, x, z, bandCfg, biome: 'placed' });
  if (id) node.id = id;
  return node;
}

// ---------------------------------------------------------------------------- the whole world

/** How wide one tile of ore is, in metres. */
const TILE = 512;

/**
 * ROUND 17 — NOTHING IS DUG OUT OF THE MIDDLE OF A ROAD.
 *
 * *"Try to prevent spawning Clay and other resources directly on the road."*
 *
 * The scatter below picks a spot, asks the biome what grows there and puts a seam down. It has
 * never known where the roads are, so a clay bank on the carriageway is not a rare accident: 1.8%
 * of the seams around the user's own town were on one, boulders and felled-tree stumps included.
 *
 * `roadAt` is the same field the megaflora and the town planner already keep clear of, and 0.45 is
 * the same threshold `js/features.js` uses for a building — the carriageway and its kerb, not the
 * whole eighteen-metre influence field, because a seam BESIDE a road is exactly where a seam wants
 * to be. `bridgedAt` is asked as well: a bridge's footprint is a hole in the ground with a deck
 * over it, so a boulder in one is a boulder floating over a river.
 *
 * THE NODE'S OWN RADIUS IS IN THE QUESTION. A two-metre seam whose centre is a metre off the kerb
 * still has half of itself in the road.
 *
 * **It runs AFTER the scatter, never inside it.** Round 12's density bug is the reason: the tile's
 * rng is shared by everything that comes after it, so rejecting a spot mid-loop (or breaking out of
 * one) consumes a different number of rng calls and every seam downstream moves. Marking `gone` is
 * how the underwater and cliff rejections already work, and it costs the rng nothing.
 */
function onTheRoad(terrain, node) {
  const r = node.radius ?? 2;
  if (terrain.bridgedAt?.(node.x, node.z, r)) return true;
  if (!terrain.roadAt) return false;
  if (terrain.roadAt(node.x, node.z) > 0.45) return true;
  // the edge of the seam, not just its middle
  for (let a = 0; a < 4; a++) {
    const px = node.x + Math.cos((a / 4) * Math.PI * 2) * r;
    const pz = node.z + Math.sin((a / 4) * Math.PI * 2) * r;
    if (terrain.roadAt(px, pz) > 0.45) return true;
  }
  return false;
}

/**
 * Ore across a whole planet, generated a tile at a time and remembered.
 *
 * `createNodeField` above scatters seams inside one circle, which is the right shape for a test and
 * the wrong one for a 163 km world. It was being called as
 * `createNodeField({ data, seed, terrain })` — neither of which it takes — so every seam in the
 * game was scattered around the ORIGIN, about twenty-nine kilometres from where the player actually
 * lands, and nobody could ever have found one.
 *
 * A tile's seed comes from the world seed and the tile's own coordinates, so a seam is in the same
 * place every time you walk back to it, without any of them being stored — the same bargain the
 * terrain itself makes. What IS stored is what you took out: `worked`, `amount` and the respawn
 * clock, and only for tiles you actually touched.
 *
 *   const ore = createNodeWorld({ data, seed, terrain, planet, band });
 *   ore.near(x, z, 60);        // what is in reach
 *   ore.around(x, z);          // everything in the tiles around you, for the map and the drills
 *   ore.tick(seconds);         // respawn clocks
 */
export function createNodeWorld({ data = {}, seed = 1, terrain = null, planet = null, band = 'medium', perTile = 14 } = {}) {
  /** tile key -> the nodes in it. A tile is generated once and then it is history. */
  const tiles = new Map();
  /** What the player has taken, by node id, so a regenerated tile does not refill itself. */
  const worked = new Map();
  /**
   * Seams the WORLD put down rather than the scatter: a meteor fall, most of all.
   *
   * `meteor_site` is the only source of meteoric iron and the only route to tempered alloy that
   * skips the refinery — the data literally says "which is why a meteor fall is worth the walk".
   * It was in the ordinary scatter, where it was a hardness-2 seam holding iron ore that a new
   * player could see and could not work, which is the same wall the Deep Vein was. So it is
   * `placedOnly` now, and this is where a meteor puts one.
   *
   * Filed by tile so `around` finds it, and saved, because a fall is an event and an event that
   * does not survive a reload is not one.
   */
  const placed = new Map();

  const keyOf = (tx, tz) => `${tx},${tz}`;

  function tileAt(tx, tz) {
    const key = keyOf(tx, tz);
    let got = tiles.get(key);
    if (got) return got;
    // a tile's own seed: the world's, folded with where the tile is. Same tile, same seams, always.
    const tileSeed = (seed * 73856093) ^ (tx * 19349663) ^ (tz * 83492791);
    const nodes = createNodeField({
      data,
      rng: makeRng(tileSeed >>> 0),
      area: { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE, radius: TILE * 0.5 },
      biomeAt: terrain ? (x, z) => terrain.biomeAt(x, z).key : null,
      /**
       * R14: a clay bank belongs on a bank. Sampled at four points about thirty metres out rather
       * than at one — a riverbank is a line, and asking only about the spot itself would put a clay
       * bank IN the river, where `gone` would then delete it.
       */
      waterNear: terrain ? (x, z) => {
        const R = 30;
        for (const [dx, dz] of [[R, 0], [-R, 0], [0, R], [0, -R]]) {
          if (terrain.underwater(x + dx, z + dz) || terrain.riverAt(x + dx, z + dz) > 0.25) return true;
        }
        return false;
      } : null,
      band, planet, count: perTile, minGap: 22,
    });
    for (const n of nodes) {
      // an id that survives the tile being dropped and rebuilt, which is what makes `worked` work
      n.id = `${key}:${n.id}`;
      const taken = worked.get(n.id);
      if (taken) Object.assign(n, taken);
      // a seam under the sea or inside a cliff is a seam nobody will ever work
      if (terrain && (terrain.underwater(n.x, n.z) || terrain.slopeAt(n.x, n.z, 4) > 0.8)) n.gone = true;
      if (terrain && onTheRoad(terrain, n)) n.gone = true;
    }
    const live = nodes.filter(n => !n.gone).concat(placed.get(key) || []);
    tiles.set(key, live);
    return live;
  }

  const tileKeyOf = (x, z) => keyOf(Math.floor(x / TILE), Math.floor(z / TILE));

  /** Every node in the nine tiles around a point. */
  function around(x, z) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) out.push(...tileAt(tx + dx, tz + dz));
    return out;
  }

  return {
    TILE,
    around,
    /**
     * Put a seam down by hand. Returns it, or null if the kind is not in the data.
     *
     * The id carries the tile so `byId` can find it again, and `pl` marks it as placed so a reload
     * puts it back where the scatter would never have generated it.
     */
    place({ kindId, x, z, band: atBand = band, rng = null, id = null }) {
      const node = placedNode({ data, rng: rng || makeRng(((x * 73856093) ^ (z * 19349663)) >>> 0), kindId, x, z, band: atBand, id });
      if (!node) return null;
      const key = tileKeyOf(x, z);
      node.id = id || `${key}:pl${(placed.get(key)?.length || 0)}`;
      node.placedHere = true;
      if (!placed.has(key)) placed.set(key, []);
      placed.get(key).push(node);
      // a tile already generated has to be told, or the seam does not exist until you leave and return
      if (tiles.has(key)) tiles.get(key).push(node);
      return node;
    },
    /** What is within `reach` metres, nearest first. */
    near(x, z, reach = 60) {
      return around(x, z)
        .map(n => ({ node: n, away: Math.hypot(n.x - x, n.z - z) }))
        .filter(r => r.away <= reach + (r.node.radius || 2))
        .sort((a, b) => a.away - b.away)
        .map(r => r.node);
    },
    /** The one you are standing at, if any. */
    at(x, z, reach = 4) { return this.near(x, z, reach)[0] || null; },
    byId(id) {
      const [key] = String(id).split(':');
      const [tx, tz] = key.split(',').map(Number);
      return tileAt(tx, tz).find(n => n.id === id) || null;
    },
    /** Remember what came out of one, so walking away and back does not refill it. */
    noteWorked(node) {
      if (!node) return;
      worked.set(node.id, { amount: node.amount, worked: node.worked, depleted: node.depleted, respawnIn: node.respawnIn });
    },
    /** Respawn clocks, for every tile that has been visited. */
    tick(seconds) {
      for (const nodes of tiles.values()) tickNodes(nodes, seconds, data);
      for (const nodes of tiles.values()) for (const n of nodes) if (worked.has(n.id)) this.noteWorked(n);
    },
    get tilesLoaded() { return tiles.size; },
    toJSON() {
      return {
        worked: [...worked.entries()],
        placed: [...placed.values()].flat().map(n => ({ ...n })),
      };
    },
    load(json) {
      worked.clear();
      placed.clear();
      for (const [id, state] of json?.worked || []) worked.set(id, state);
      for (const n of json?.placed || []) {
        const key = tileKeyOf(n.x, n.z);
        if (!placed.has(key)) placed.set(key, []);
        placed.get(key).push({ ...n });
      }
      tiles.clear();
    },
  };
}
