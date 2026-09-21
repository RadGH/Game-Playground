// Farhold — the one place that knows what a given thing on the ground is like to work.
//
// R17. Two modules need the same three facts about a tree and they cannot reach each other:
//
//   js/props.js  owns them. `PROP_HARVEST` says what a bush drops and `data/megaflora.json` says
//                the same for a giant. It also imports Three.js, so nothing pure can import it.
//   js/tools.js  runs the gather bar — how long it takes, and which clip the body plays while it
//                fills. It is pure by design (the node tests drive it) and must stay that way.
//
// js/main.js sits between them, and it is not ours this round: it calls `props.describe()`, reads
// the tier off the answer, and then calls `gathering.begin()` with a length it works out for itself
// from two generic sizes. So a sixteen-second Elder Broadleaf came out as a two-and-a-half second
// bush, and there was nowhere to say which animation a pick swing is.
//
// The obvious fix is to copy the numbers into data/tools.json, and the obvious fix is wrong: a
// second copy of "a Crown Conifer takes eighteen seconds" is a thing that drifts. So instead there
// is ONE tiny registry, with no dependencies at all, that js/props.js WRITES at start-up and
// js/tools.js READS. The numbers stay where they belong — beside the drops, in props.js and in
// data/megaflora.json — and the gather clock looks them up by the kind it parses out of the job id.
//
//   import { harvestInfo } from './harvestinfo.js';
//   harvestInfo.set('elder_broadleaf', { work: 'chop', seconds: 16, tier: 2, verb: 'fell' });
//   harvestInfo.get('elder_broadleaf');           // -> the row, or null
//
// Pure data. No DOM, no Three.js, no fetch — so the node tests can fill it by hand and drive the
// gather clock without a browser.

/** kind -> { work, seconds, tier, verb, name, mega }. Empty until js/props.js has published. */
const rows = new Map();

export const harvestInfo = {
  /**
   * Publish one kind. Called by js/props.js for every `PROP_HARVEST` row at import, and again for
   * every wood-bodied giant once `data/megaflora.json` has arrived — which is asynchronous, so a
   * reader that asks too early gets null and must fall back rather than throw.
   */
  set(kind, row) {
    if (!kind || !row) return null;
    rows.set(kind, { kind, ...row });
    return rows.get(kind);
  },
  /** The row, or null for scenery and for anything nobody has published yet. */
  get(kind) { return (kind && rows.get(kind)) || null; },
  has(kind) { return rows.has(kind); },
  get size() { return rows.size; },
  keys() { return [...rows.keys()]; },
  /** For the tests, which build their own table and must not inherit the last one's. */
  clear() { rows.clear(); },
};

/**
 * THE KIND, OUT OF A GATHER JOB'S ID.
 *
 * js/main.js builds the job id as `prop:${prop.id}`, and a prop's id is `propKey(kind, x, z)` —
 * `"elder_broadleaf@11438.0,3187.0"`. The kind is therefore already in the id, exactly, as a fact
 * rather than as a display name: parsing it is not a guess the way matching "Elder Broadleaf"
 * against a word list would be, and it is the same string `props.js` files the tree under in the
 * felled ledger. A seam's id is `seam:<node id>` and has no prop kind, which is what the null is.
 */
export function propKindFromJobId(id) {
  const s = String(id || '');
  if (!s.startsWith('prop:')) return null;
  const at = s.indexOf('@', 5);
  return at > 5 ? s.slice(5, at) : s.slice(5) || null;
}
