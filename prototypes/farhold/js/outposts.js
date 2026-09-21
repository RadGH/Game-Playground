// Farhold — an outpost is a group of things standing near each other. That is the whole definition.
//
// *"Can we remove the need to build claim stones and instead encourage random outposts? I would
// like to slap down a drill at a remote deposit, connect it to the power grid and storage, and send
// the output back to my base using a travel route."*
//
// Until round 14 a base was a CLAIM — a 64 m circle staked by the first thing you built, and the
// only way to get a second one was a Claim Stone that cost two iron ingots. Which you could not
// have, because iron needs a furnace and a furnace had to stand inside a claim. That deadlock is
// gone (see js/buildplan.js), and with it goes the idea that the player has to declare where a base
// is before they are allowed to build one.
//
// What replaces it is this: **an outpost is worked out from the geometry, after the fact.** Put a
// drill and a crate down on a seam nine hundred metres from home and you have made an outpost; you
// did not decide to, and you did not pay for the privilege. Take the drill away again and the
// outpost stops existing. Nothing is stored, nothing can drift out of step with what is actually
// standing there, and old saves need no migration because there is nothing new in them to migrate.
//
//   import { groupOutposts, outpostAt } from './outposts.js';
//   const posts = groupOutposts(build.entries, { lanes: roads.lanes });
//   posts[0].name      // "Ironrest" — or "Camp 2" if nothing in it has a name
//
// Pure: no Three.js, no DOM, no storage. `entries` are js/buildplan.js's ledger rows and the only
// fields read are `x`, `z`, `w`, `d`, `key`, `name` and `cat`.

/**
 * How big a gap still counts as "the same place", in metres.
 *
 * Measured between FOOTPRINT EDGES, not centres, so a 12 m wide refinery joins the group the same
 * way a 1 m brazier does. Forty is a little further than a logistics pole reaches (22 m) and a
 * little less than a relay mast pair (34 m each), which lines the idea up with the one the storage
 * pools already use: things that can hand each other goods are one place.
 */
export const LINK_GAP = 40;

/**
 * R15 — how far an Outpost Marker's claim reaches, in metres, measured centre to centre.
 *
 * Ninety is chosen to cover "a few drills and a crate around a seam", which is the thing the user
 * described wanting to build, without a marker on one hillside quietly swallowing the camp on the
 * next one. It is deliberately much larger than LINK_GAP: chaining answers "did these grow into one
 * place", and a marker answers "I have decided this is one place", which is a different question.
 */
export const MARKER_REACH = 90;

/** Rough radius of a footprint — half its diagonal, so a rotated box is still covered. */
const radiusOf = e => Math.hypot(e.w || 1, e.d || 1) / 2;

/** Edge-to-edge gap between two pieces. Negative means they overlap, which counts as touching. */
export function gapBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z) - radiusOf(a) - radiusOf(b);
}

/**
 * What an outpost is FOR, in one word, from what is standing in it.
 *
 * The order matters: a place with a waypoint pad is where you travel to whatever else is in it, and
 * a place with a drill is a mine even if somebody left a bed there. This is what lets the map and
 * the build panel label a dot without the player having to name every pile of crates they leave
 * behind on a hillside.
 */
export function roleOf(members, defOf = null) {
  const cats = new Set();
  const keys = new Set();
  for (const e of members) {
    cats.add(e.cat || defOf?.(e.key)?.cat || '');
    keys.add(e.key);
  }
  if (members.some(e => e.waypoint)) return 'hub';
  /**
   * R16 — the category answers this now, and it answers it for the Small Drill too.
   *
   * The id list here knew about `drill` and `pump` and had never heard of `small_drill`, which is
   * the FIRST drill anybody builds — so a camp of small drills round a seam called itself a
   * Workshops outpost. `extract` is the whole family, and a new digger joins it by being data.
   * The old ids stay as a belt-and-braces fallback for a save whose entries predate the category.
   */
  if (cats.has('extract') || keys.has('drill') || keys.has('pump') || keys.has('small_drill')) return 'mine';
  if (cats.has('refine') || cats.has('craft') || keys.has('workshop') || keys.has('manufactory')) return 'works';
  if (cats.has('power')) return 'power';
  if (cats.has('store')) return 'depot';
  if (cats.has('defence')) return 'fort';
  return 'camp';
}

/** The plain-language word for a role, for a label on a map or a heading in a panel. */
export const ROLE_WORDS = {
  hub: 'Hub', mine: 'Mine', works: 'Workshops', power: 'Power', depot: 'Depot', fort: 'Fort', camp: 'Camp',
};

/**
 * Cut the ledger into outposts.
 *
 * Single-linkage clustering: two pieces are in the same outpost if they are within `gap` of each
 * other, or if a chain of pieces joins them. That is deliberately the loosest rule available — a
 * base is a base because you can walk between its parts, and any tighter rule ends up splitting a
 * long base in two at a point the player would not recognise as a border.
 *
 * `lanes` from js/roadplan.js join as well, which is the other half of the user's sentence: a road
 * you laid out to the seam is a statement that the seam is part of your holding, so two clusters
 * with a road running between them come back as one outpost rather than two.
 */
export function groupOutposts(entries = [], { gap = LINK_GAP, lanes = [], defOf = null, names = null } = {}) {
  const list = entries.filter(e => e && Number.isFinite(e.x) && Number.isFinite(e.z));
  if (!list.length) return [];

  const parent = list.map((_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (gapBetween(list[i], list[j]) <= gap) join(i, j);
    }
  }

  /**
   * R15 — A MARKER CLAIMS WHAT IS AROUND IT.
   *
   *   "I realize we should probably use the Outpost marker to establish a base, and attribute
   *    everything nearby to that base."
   *
   * Chaining at forty metres is the right rule for "did these grow into one place", and the wrong
   * one for "I decided this is a base". A few drills scattered over a seam field are ninety metres
   * apart and the chain does not reach, so the player who deliberately walked out, planted a marker
   * and built around it got four separate outposts called Mine 1 through Mine 4.
   *
   * A marker is a DECLARATION, so it gets a longer arm: anything inside `MARKER_REACH` of one joins
   * it, chain or no chain. Two markers close enough to claim each other merge, which is right —
   * planting a second stone beside the first is not how you split a base in two; moving the
   * buildings is.
   */
  const markers = [];
  for (let i = 0; i < list.length; i++) if (list[i].outpostName || list[i].claims) markers.push(i);
  for (const m of markers) {
    for (let i = 0; i < list.length; i++) {
      if (i === m) continue;
      if (Math.hypot(list[m].x - list[i].x, list[m].z - list[i].z) <= MARKER_REACH) join(m, i);
    }
  }

  /**
   * A ROAD IS A JOIN.
   *
   * Without this, the drill at the seam and the smelters at home are two outposts with a track
   * between them — which is technically true and reads as wrong, because the player built that
   * track precisely to say they are one holding. A piece counts as on a lane if it is within the
   * lane's own reach, and everything on one lane is joined to everything else on it.
   */
  for (const lane of lanes || []) {
    const touching = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const pad = (lane.reach || lane.half + 6) + radiusOf(e);
      for (let k = 0; k + 1 < lane.points.length; k++) {
        if (segDist(e.x, e.z, lane.points[k][0], lane.points[k][1], lane.points[k + 1][0], lane.points[k + 1][1]) <= pad) {
          touching.push(i);
          break;
        }
      }
    }
    for (let i = 1; i < touching.length; i++) join(touching[0], touching[i]);
  }

  const byRoot = new Map();
  for (let i = 0; i < list.length; i++) {
    const root = find(i);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(list[i]);
  }

  const out = [];
  let n = 0;
  for (const members of byRoot.values()) {
    n++;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0;
    for (const e of members) {
      cx += e.x; cz += e.z;
      x0 = Math.min(x0, e.x - radiusOf(e)); x1 = Math.max(x1, e.x + radiusOf(e));
      z0 = Math.min(z0, e.z - radiusOf(e)); z1 = Math.max(z1, e.z + radiusOf(e));
    }
    cx /= members.length; cz /= members.length;
    const role = roleOf(members, defOf);
    /**
     * THE NAME COMES FROM THE GEOMETRY TOO, OR FROM A STONE IF YOU PUT ONE DOWN.
     *
     * A Claim Stone no longer permits anything — it is a signpost, and what it does now is carry the
     * name of the group it stands in. Anything without one is called after what it does and how far
     * out it is, which is at least honest: "Mine 3" is a better label than "Camp 7" for a hole in a
     * hillside with a drill in it.
     */
    const stone = members.find(e => e.outpostName);
    const claimId = members.find(e => e.claim)?.claim || null;
    const given = stone?.outpostName || (names && claimId ? names[claimId] : null);
    out.push({
      id: claimId || 'op' + n,
      claim: claimId,
      name: given || `${ROLE_WORDS[role] || 'Camp'} ${n}`,
      named: !!given,
      role,
      x: cx, z: cz,
      bounds: { x0, x1, z0, z1 },
      radius: Math.max(Math.hypot(x1 - x0, z1 - z0) / 2, 6),
      members,
      count: members.length,
      keys: [...new Set(members.map(e => e.key))],
    });
  }
  // biggest first: the base you live in should head any list this ends up in
  out.sort((a, b) => b.count - a.count);
  return out;
}

/** Which outpost is this point in, if any? Used to label a map pin and to name a delivery. */
export function outpostAt(posts, x, z, slack = LINK_GAP) {
  let best = null;
  for (const p of posts) {
    const inside = x >= p.bounds.x0 - slack && x <= p.bounds.x1 + slack
      && z >= p.bounds.z0 - slack && z <= p.bounds.z1 + slack;
    if (!inside) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.d) best = { post: p, d };
  }
  return best?.post || null;
}

/**
 * R17 — AN OUTPOST IS ALSO A PLACE ON THE MAP.
 *
 *   "The outpost marker should put a waypoint on the world and map too. This one should not be
 *    removable unless you destroy the building, but can also be hidden from displaying. The marker
 *    should also let you rename the location which can appear on the map too."
 *
 * Until now an outpost existed only inside the Supply tab. It was worked out from the geometry,
 * listed, linked up with carts — and there was no dot for it on the map and nothing over it in the
 * world, so the base you had spent an hour building was the one thing on the planet you could not
 * navigate back to. Meanwhile js/markers.js already draws on the map, the minimap, in space and (as
 * of this round) in the world, and already rides the save. There was no reason for a second system;
 * there was only a join nobody had made — this file's signature fault, for the thirteenth time.
 *
 * So: one marker per outpost, kept in step with the ledger.
 *
 *   * **created** when an outpost appears, at its centre, named after it;
 *   * **moved and renamed** as the outpost grows, UNLESS the player renamed it themselves — a name
 *     you typed beats a name we worked out, every time, which is why `renamed` is recorded;
 *   * **locked**, so the × never appears and `book.remove()` refuses it (js/markers.js);
 *   * **deleted** — with `force`, the only caller that may — when the buildings are gone, which is
 *     the user's "not removable unless you destroy the building" read literally;
 *   * left alone otherwise, so the two visibility switches and the star the player set survive
 *     every sync.
 *
 * Pure: `book` is a MarkerBook, which is plain data. No DOM, no Three.js, so the node tests drive
 * exactly the code the game does.
 *
 * @param {object} book    a MarkerBook
 * @param {Array}  posts   rows from `groupOutposts()` (or main.js's mapped version of them)
 * @param {object} opts    `metresPerCell` — passed in rather than imported, so this file stays
 *                         free of js/planet.js and the node tests stay free of a world
 * @returns {Array} the markers, in the same order as `posts`
 */
export function syncOutpostMarkers(book, posts = [], { metresPerCell = 640 } = {}) {
  if (!book) return [];
  const live = new Set();
  const out = [];

  for (const post of posts) {
    if (!post || !Number.isFinite(post.x) || !Number.isFinite(post.z)) continue;
    const id = String(post.id);
    live.add(id);
    const cellX = Math.floor(post.x / metresPerCell);
    const cellY = Math.floor(post.z / metresPerCell);

    let marker = book.here().find(m => m.kind === 'outpost' && String(m.from?.id) === id);
    if (!marker) {
      marker = book.add({
        kind: 'outpost', name: post.name || 'Outpost', cellX, cellY,
        // it is not a quest: it does not get to own the minimap arrow until the player says so
        tracked: false, locked: true,
        from: { type: 'outpost', id, label: post.name || 'Outpost' },
      });
    } else {
      // the buildings moved the middle of the place; the marker follows the ground, not the name
      marker.cell.x = cellX;
      marker.cell.y = cellY;
      if (!marker.renamed && post.name) marker.name = post.name;
    }
    marker.role = post.role || 'camp';
    out.push(marker);
  }

  /**
   * And the other half of "not removable unless you destroy the building": when the ledger stops
   * mentioning an outpost, its marker goes — with `force`, because the lock exists to stop the
   * PLAYER deleting it, not to stop the thing that owns it.
   */
  for (const m of book.here()) {
    if (m.kind === 'outpost' && !live.has(String(m.from?.id))) book.remove(m, { force: true });
  }
  return out;
}

/**
 * Rename an outpost's marker, and remember that a person did it.
 *
 * `renamed` is the whole point: without it the next `syncOutpostMarkers()` — which runs every time
 * the map is drawn — would write "Mine 3" straight back over "Ironrest", and the player would watch
 * their name vanish a quarter of a second after typing it.
 */
export function renameOutpostMarker(book, marker, name) {
  if (!book || !marker) return null;
  const clean = String(name || '').trim().slice(0, 48);
  if (!clean) return marker.name;
  marker.name = clean;
  marker.renamed = true;
  return marker.name;
}

/** One line per outpost for a panel: "Mine 3 — 4 pieces, 940 m out". No drawing in it. */
export function outpostLines(posts, from = null) {
  return posts.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    count: p.count,
    metres: from ? Math.round(Math.hypot(p.x - from.x, p.z - from.z)) : null,
    text: `${p.name} — ${p.count} piece${p.count === 1 ? '' : 's'}`
      + (from ? `, ${Math.round(Math.hypot(p.x - from.x, p.z - from.z))} m out` : ''),
  }));
}

function segDist(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2)) : 0;
  return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
}
