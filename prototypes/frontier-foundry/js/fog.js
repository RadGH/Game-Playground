// Fog of war. Two bits per tile: have you ever seen it, and can you see it right now.
// Vision comes from the landing pod, every structure with a vision radius, your units and vehicles,
// and - once one is in orbit - a satellite, which just reveals the lot.

export function createFog(map) {
  const N = map.width * map.height;
  return { explored: new Uint8Array(N), visible: new Uint8Array(N), width: map.width, height: map.height, everything: false };
}

/** Mark a disc as seen. Returns how many tiles were new. */
export function reveal(fog, x, y, r) {
  let fresh = 0;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(fog.width - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(fog.height - 1, Math.ceil(y + r));
  const rr = r * r;
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    if ((xx - x) ** 2 + (yy - y) ** 2 > rr) continue;
    const i = yy * fog.width + xx;
    fog.visible[i] = 1;
    if (!fog.explored[i]) { fog.explored[i] = 1; fresh++; }
  }
  return fresh;
}

/** Rebuild the "visible right now" layer from every vision source the player owns. */
export function recomputeVisible(game) {
  const fog = game.fog;
  if (fog.everything) { fog.visible.fill(1); fog.explored.fill(1); return 0; }
  fog.visible.fill(0);
  let fresh = 0;
  const bonus = game.techEffect('visionRadius', 1);
  for (const s of game.structures) {
    if (s.state !== 'done' || !s.def.vision) continue;
    if (s.def.nodeOnly) continue;                       // a scanner tower looks down, not out
    fresh += reveal(fog, s.x + s.w / 2, s.y + s.h / 2, s.def.vision * bonus * (s.powered > 0.2 ? 1 : 0.5));
  }
  for (const u of game.units) if (u.alive) fresh += reveal(fog, u.x, u.y, (u.def.vision || 6) * bonus);
  for (const v of game.vehicles) if (v.alive && v.def.vision) fresh += reveal(fog, v.x, v.y, v.def.vision * bonus);
  return fresh;
}

export const isExplored = (fog, x, y) => !!fog.explored[(y | 0) * fog.width + (x | 0)];
export const isVisible = (fog, x, y) => !!fog.visible[(y | 0) * fog.width + (x | 0)];

/** How much of the map has ever been seen, 0..1. */
export function exploredFraction(fog) {
  let n = 0;
  for (let i = 0; i < fog.explored.length; i++) n += fog.explored[i];
  return n / fog.explored.length;
}

/** Pack the explored layer for a save file, and put it back again. */
export function packFog(fog) {
  const out = [];
  let run = 0, cur = fog.explored[0];
  for (let i = 0; i < fog.explored.length; i++) {
    if (fog.explored[i] === cur) run++;
    else { out.push(run); cur = fog.explored[i]; run = 1; }
  }
  out.push(run);
  return { first: fog.explored[0], runs: out };
}

export function unpackFog(fog, packed) {
  if (!packed) return fog;
  let v = packed.first, i = 0;
  for (const run of packed.runs) { for (let k = 0; k < run && i < fog.explored.length; k++) fog.explored[i++] = v; v = v ? 0 : 1; }
  return fog;
}
