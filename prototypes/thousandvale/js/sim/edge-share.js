// Play-test 12 (#84, owner: "the town Mistfall does not show its caravan person until you leave the town … can there be a
// copy in both instances that seamlessly transitions?"). A hub town is its OWN room (a circle, js/sim/realm.js), and an
// object belongs to exactly one room by where it stands: Mistfall's carter Orsk Yorrvenn stands 3 m outside the 40 m
// circle, beside his cart, so he was in the wilds copies only — invisible from the town square ten steps away, then
// there the moment you crossed the edge. The same held the other way for anyone standing just inside a ring.
//
// `edgeShared(L, town)` lists the objects to ADD to a room as copies: for town i, the talk-only things standing just
// outside its ring; for the wilds (town = null), the ones just inside any ring. Talk-only = a placed NPC with no
// schedule, no guard post and no fighting (a guard or a fighter would defend two rooms at once), or a parked cart. The
// copy has the same key, so talking to either copy is talking to the same NPC (quests, carts and shops key on it). On
// the client, js/client/actors.js `park` keeps the body you were looking at across the hand-over and gives it to the
// copy in the new room, so the NPC does not blink. Pure.

export const EDGE_OUT = 16;     // metres past a ring's edge a talk-only thing is also put in the town's room
export const EDGE_IN = 12;      // metres inside a ring's edge a talk-only thing is also put in the wilds copies

const talkOnly = o => !!o && ((o.type === 'npc' && !o.schedule && !o.guard && !o.fighter && !(o.npc && o.npc.role === 'guard')) || o.type === 'cart');

/** The copies to add to town `town`'s room (an index into L.towns), or to the wilds copies (`town` = null). */
export function edgeShared(L, town = null) {
  const towns = (L && L.towns) || [];
  if (town == null) {
    const out = [];
    (L.townObjects || []).forEach((list, i) => {
      const t = towns[i]; if (!t) return;
      for (const o of list || []) if (talkOnly(o) && Math.hypot(o.x - t.x, o.z - t.z) >= t.r - EDGE_IN) out.push({ ...o, edgeCopy: true });
    });
    return out;
  }
  const t = towns[town]; if (!t) return [];
  return (L.objects || []).filter(o => {
    if (!talkOnly(o)) return false;
    const d = Math.hypot(o.x - t.x, o.z - t.z);
    return d >= t.r - 2 && d <= t.r + EDGE_OUT;
  }).map(o => ({ ...o, edgeCopy: true }));
}
