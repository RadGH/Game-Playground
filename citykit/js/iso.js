// The one view every Arcline picture is drawn from (SimCity 4 style): the camera looks down at 30°, turned 45° to the
// grid, so a 1×1 tile is a 2:1 diamond on screen. Everything that turns world positions into screen pixels — the
// baker here, the game's map drawing later — uses these numbers, so a sprite always lines up with its tile.
//
// World units: 1 unit = 1 tile edge. Heights in the same units (a floor is FLOOR units tall).
// Rotations: 4 camera turns (0..3), each 90°. Directions (creatures, vehicles, turret heads): 8 or 16 headings
// measured ON SCREEN (0 = toward the top-right of the screen, going clockwise), so a sprite for a direction is the same
// whichever way the map is turned.

export const TILE_W = 64;                 // a tile's diamond on screen at zoom 1, px
export const TILE_H = 32;
export const ELEVATION = Math.PI / 6;     // 30°: gives the exact 2:1 diamond
export const PX_PER_UNIT = TILE_W / Math.SQRT2;          // ≈ 45.25 px for one unit along the ground's diagonal
export const PX_PER_HEIGHT = PX_PER_UNIT * Math.cos(ELEVATION); // ≈ 39.2 px for one unit of height
export const FLOOR = 0.22;                // one storey, in tile units (a tile ~16 m, a storey ~3.5 m)

/** three.js: the camera always sits toward world (+x, +z), 30° up, looking at the origin (so screen right = +x −z
 *  and screen down = +x +z, matching toScreen). A map rotation turns the MODEL instead: group.rotation.y = modelTurn(rot)
 *  gives the same picture as toScreen's turnXZ. */
export function modelTurn(rot) { return -(rot & 3) * (Math.PI / 2); }
export const CAM_DIR = [Math.cos(ELEVATION) / Math.SQRT2, Math.sin(ELEVATION), Math.cos(ELEVATION) / Math.SQRT2];

/** World (x, z, y=height) → screen px offset from the world origin, for rotation rot (no zoom). */
export function toScreen(x, z, y = 0, rot = 0) {
  // turn the grid by the rotation, then the fixed 2:1 projection
  const [rx, rz] = turnXZ(x, z, rot);
  return { sx: (rx - rz) * (TILE_W / 2), sy: (rx + rz) * (TILE_H / 2) - y * PX_PER_HEIGHT };
}

/** Screen px (at height 0) → world x, z for rotation rot. The inverse of toScreen at y = 0. */
export function toWorld(sx, sy, rot = 0) {
  const a = sx / (TILE_W / 2), b = sy / (TILE_H / 2);
  const rx = (a + b) / 2, rz = (b - a) / 2;
  return turnXZ(rx, rz, (4 - (rot & 3)) & 3);
}

/** Turn a grid position by rot × 90° about the origin (the map turns, the camera stays). */
export function turnXZ(x, z, rot) {
  switch (rot & 3) {
    case 0: return [x, z];
    case 1: return [-z, x];
    case 2: return [-x, -z];
    default: return [z, -x];
  }
}

/** Screen direction dir (0..n-1): 0 = straight UP the screen, then clockwise (2 of 8 = right, 4 = down, 6 = left).
 *  Returns the world heading (radians, atan2(dz, dx)) that LOOKS like that direction at camera rotation rot. */
export function headingOfDir(dir, n = 8, rot = 0) {
  const th = -Math.PI / 2 + dir * (Math.PI * 2 / n);             // screen angle, y pointing down
  const [x, z] = toWorld(Math.cos(th), Math.sin(th), rot);       // projection is linear: invert the screen vector
  return Math.atan2(z, x);
}

/** The screen direction (0..n-1) a world heading looks like at rotation rot. Inverse of headingOfDir. */
export function dirOfHeading(angle, n = 8, rot = 0) {
  const { sx, sy } = toScreen(Math.cos(angle), Math.sin(angle), 0, rot);
  const th = Math.atan2(sy, sx) + Math.PI / 2;                    // 0 = up
  const step = Math.PI * 2 / n;
  return ((Math.round(th / step) % n) + n) % n;
}

/** Things that run along the grid (vehicles on roads, trams on rails) are baked per GROUND direction instead of screen
 *  direction: n even steps of world heading as seen from the view (0 = along +x at turn 0, then a quarter of the steps
 *  per 90°), so the four road directions are exact steps. A screen-direction step can't do that: a road runs ~26.6°
 *  off the screen's horizontal (the 2:1 diamond), between two of the 8/16 screen steps, so a car baked for the nearest
 *  screen step drives visibly crabwise (owner report 2026-11-16).
 *  The map turning by rot looks the same as everything on it turning by rot × 90° (turnXZ), so the view's heading is
 *  the world heading plus rot quarter turns. Bake step i with headingOfGroundDir(i, n) at view turn 0. */
export function groundDirOfHeading(angle, n = 8, rot = 0) {
  const step = Math.PI * 2 / n, a = angle + (rot & 3) * (Math.PI / 2);
  return ((Math.round(a / step) % n) + n) % n;
}
export function headingOfGroundDir(i, n = 8) { return i * (Math.PI * 2 / n); }
