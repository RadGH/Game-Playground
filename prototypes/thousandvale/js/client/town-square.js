// Thousandvale — what stands on a town square, and where (stream W, play-test 8 W6).
//
// PURE (no three, no DOM): js/client/town-view.js draws from it, tools/lib/gate-street-checks.mjs measures against
// it, so the well and the stalls the player sees are the same ones the "is the main street clear?" test looks at.
//
//   squareFurniture({ square: { x, z, r }, stalls })  ->  { well: { x, z, r }, stalls: [{ x, z, r, yaw }] }
//
// `stalls` is the baked list (placements `town_square.data.stalls` = [[x, z], ...], zone metres — add the zone origin
// before calling if you work in world metres): spots the bake chose BESIDE the streets that enter the square, never in
// one. A town_square baked before W6 has no list; then the old ring of four is returned (what the client always drew),
// which is why the checks could call a stall "in the road" on old data.

/** The well's footprint (the stone drum is 1.8 m across; the roof posts stand inside it). */
export const WELL_R = 0.9;
/** A market stall's footprint as a disc (proctown stalls are 2.2-3.2 m wide, 1.4-2 m deep). */
export const STALL_R = 1.7;
/** How far from the middle of the square the old ring of stalls stood. */
export const legacyStallRing = r => r * 1.9 + 2.5;

export function squareFurniture({ square, stalls = null } = {}) {
  const well = { x: square.x, z: square.z, r: WELL_R };
  let list;
  if (Array.isArray(stalls)) list = stalls.map(([x, z]) => ({ x, z }));
  else {
    list = [];
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4, rr = legacyStallRing(square.r); list.push({ x: square.x + Math.cos(a) * rr, z: square.z + Math.sin(a) * rr }); }
  }
  // a stall faces the middle of the square (yaw = atan2(dx, dz), the protocol's)
  return { well, stalls: list.map(s => ({ x: s.x, z: s.z, r: STALL_R, yaw: Math.atan2(square.x - s.x, square.z - s.z) })) };
}
