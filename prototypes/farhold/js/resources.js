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

function whyNotWorkable(node, ctx) {
  const data = ctx.data || {};
  const kind = data.nodeKinds?.[node.kind];
  const t = data.tools?.[ctx.tool || 'iron_tool'];
  if (!kind) return 'no such node kind';
  if (kind.handMinable === false) return `${kind.name} has to be taken by a structure, not by hand`;
  if (t && (t.tier ?? 0) < (kind.hardness ?? 0)) {
    const need = Object.entries(data.tools || {}).find(([, x]) => (x.tier ?? 0) >= kind.hardness);
    return `too hard for a ${t.name || 'tool'} — you need a ${need ? need[1].name : 'better tool'}`;
  }
  if (node.depleted) return 'worked out; it will come back';
  return 'not workable';
}

/** One line a player can read off a node before deciding to walk to it. */
export function nodeText(node, ctx = {}) {
  const r = haulReport(node, ctx);
  const kindName = ctx.data?.nodeKinds?.[node.kind]?.name || node.kind;
  if (!r.workable) return `${r.bandName} ${r.resourceName} ${kindName} — ${r.why}`;
  if (r.pooled) return `${r.bandName} ${r.resourceName} ${kindName} (${r.richness}x) — ${r.facePerMinute}/min, inside the store pool, so nothing to carry.`;
  return `${r.bandName} ${r.resourceName} ${kindName} (${r.richness}x) — ${r.facePerMinute}/min at the face, ${Math.round(r.distance)} m away, ${r.deliveredPerMinute}/min once you have walked it home.`;
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
export function kindsForBiome(data, biome) {
  return Object.entries(data.nodeKinds || {})
    .filter(([, k]) => !k.fromPlanet)
    .filter(([, k]) => !k.biomes?.length || k.biomes.includes(biome));
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
export function createNodeField({ data = {}, rng = makeRng(1), area = { x: 0, z: 0, radius: 300 }, biomeAt = null, biome = 'grassland', band = 'medium', planet = null, count = 24, minGap = 18 } = {}) {
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
    const kinds = kindsForBiome(data, here);
    if (!kinds.length) continue;
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
