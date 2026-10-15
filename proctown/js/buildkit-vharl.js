// Procedural Towns — the Vharl's own building parts (Thousandvale's Burning Isle, docs/EXPANSION-1.md in that game).
//
// Kept in its own file so no other culture's buildings change: buildkit.js calls these only for the extras the Vharl
// bases list (`stilt_rows`). Each function returns plain part arguments for buildkit's `push`
// [mesh, x, y, z, w, h, d, yaw, colour, tag, massIndex] — unit shapes, origin at the centre of the base.

/**
 * A stilt house stands on ROWS of posts, not four: one under every corner and one every ~2.8 m along each side, each
 * post on a squat basalt footing block so the house reads as lifted clear of the ash and the mud.
 */
export function stiltRowParts(desc) {
  const out = [];
  for (const m of desc.masses) {
    if (!(m.lift > 0)) continue;
    const nx = Math.max(1, Math.round((m.w - 0.8) / 2.8)), nz = Math.max(1, Math.round((m.d - 0.8) / 2.8));
    const px = [], pz = [];
    for (let i = 0; i <= nx; i++) px.push(-m.w / 2 + 0.4 + (m.w - 0.8) * i / nx);
    for (let k = 0; k <= nz; k++) pz.push(-m.d / 2 + 0.4 + (m.d - 0.8) * k / nz);
    const posts = [];
    for (const x of px) for (const z of [pz[0], pz[pz.length - 1]]) posts.push([x, z]);
    for (const z of pz.slice(1, -1)) for (const x of [px[0], px[px.length - 1]]) posts.push([x, z]);
    for (const [x, z] of posts) {
      out.push(['box', m.x + x, 0, m.z + z, 0.62, 0.34, 0.62, 0, '#2c2b2d', 'extra', m.index]);            // basalt footing
      out.push(['cyl', m.x + x, 0.3, m.z + z, 0.26, m.lift - 0.3, 0.26, 0, desc.colour.trim, 'extra', m.index]);
    }
    // a cross-beam under the floor on each long side
    out.push(['box', m.x, m.lift - 0.28, m.z - m.d / 2 + 0.4, m.w - 0.4, 0.22, 0.22, 0, desc.colour.trim, 'extra', m.index]);
    out.push(['box', m.x, m.lift - 0.28, m.z + m.d / 2 - 0.4, m.w - 0.4, 0.22, 0.22, 0, desc.colour.trim, 'extra', m.index]);
  }
  return out;
}
