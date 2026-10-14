// Which body a click (or Tab) lands on — the rule, with no three.js in it, so a node test can ask it.
//
// Owner feedback 10, Y8 (report #20): "A looted corpse is no longer selectable; live enemies win over corpses when
// clicking / tab-targeting in combat."
//
//   * a dead monster with nothing left on it FOR YOU cannot be picked at all — the click goes through it to whatever
//     is behind it, or to the ground (the server refuses it as a target anyway: `targetR {ok:false, why:'empty'}`);
//   * a live body under the cursor always beats a corpse under the cursor, however close to the camera the corpse is;
//   * a corpse you clicked on loses to a live ENEMY standing just beside the cursor (within NEAR times its own click
//     size) — in a fight you mean the thing that is still biting you;
//   * Tab never stops on a corpse.
//
// A dead PLAYER stays selectable (a revive is aimed at one).

/** How much fatter a live enemy's click volume is when the thing directly under the cursor is a corpse. */
export const NEAR = 1.6;

/** A dead monster / pet / follower with no loot on it for you. `lootMark` is what `lootable {id, on}` set (loot-marker.js). */
export const emptyCorpse = a => !!a && !!a.dead && a.kind !== 'player' && !a.lootMark;

/** May this body be clicked or hovered at all? */
export const pickable = a => !!a && !emptyCorpse(a);

/**
 * Choose among the bodies a pick ray came near.
 * `cands` = [{ a, t, miss }] — `t` = distance along the ray, `miss` = closest distance to the body's axis divided by its
 * click radius (under 1 = the cursor is ON it; under NEAR = just beside it).
 * -> the chosen `a`, or null.
 */
export function choosePick(cands) {
  let live = null, corpse = null, near = null;
  for (const c of cands || []) {
    if (!c || !pickable(c.a) || !(c.miss < NEAR)) continue;
    if (c.miss < 1) {
      if (!c.a.dead) { if (!live || c.t < live.t) live = c; }
      else if (!corpse || c.t < corpse.t) corpse = c;
    } else if (!c.a.dead && c.a.hostile && (!near || c.miss < near.miss)) near = c;
  }
  if (live) return live.a;
  if (corpse) return near ? near.a : corpse.a;
  return null;                      // a near miss with no corpse under the cursor is a miss, as it always was
}

/** Tab: the id after `current` in `order`, skipping anything `isDead(id)` says is a corpse. 0 when nothing is left. */
export function tabPick(order, current, isDead = () => false) {
  const list = (order || []).filter(id => !isDead(id));
  if (!list.length) return 0;
  return list[(list.indexOf(current) + 1) % list.length];
}
