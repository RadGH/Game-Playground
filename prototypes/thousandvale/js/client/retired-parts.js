// Play-test 12 (#77, owner: "remove the blindfold decal — it clips through the eyes and doesn't cover them"): avatar
// parts Thousandvale no longer draws. The seeded random face (avatar-2d's randomAvatar, shared with live games and left
// alone) can still roll one, and a saved look or a monster's designed look may still name one; every body and portrait
// in the game goes through `dropRetired` (js/client/looks.js avatarFor, js/client/chibi-version.js createTvBody), which
// swaps a retired part for `none`. Nothing is written back: a saved look keeps its field, it is just drawn without it.
// Pure, exported for tests/W/anim-rest.test.js.

/** slot -> ids no longer drawn in Thousandvale. */
export const RETIRED_PARTS = Object.freeze({ accessory: Object.freeze(['blindfold']) });

/** The avatar with every retired part replaced by `{ id: 'none' }` (the same object when there is nothing to drop). */
export function dropRetired(avatar) {
  if (!avatar || typeof avatar !== 'object') return avatar;
  let out = avatar;
  for (const [slot, ids] of Object.entries(RETIRED_PARTS)) {
    const id = avatar[slot]?.id;
    if (id && ids.includes(id)) { if (out === avatar) out = { ...avatar }; out[slot] = { ...avatar[slot], id: 'none' }; }
  }
  return out;
}
