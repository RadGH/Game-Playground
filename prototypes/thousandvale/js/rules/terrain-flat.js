// Thousandvale — a flat, dry, unbounded terrain with the exact interface the combat core asks of
// the real one (stream B's js/rules/terrain-read.js). Tests and the parity fixtures use it; a room
// built before its zone is baked can use it too.
//
// The interface every walker (monster AI, knockback, shove-apart) reads, as Farhold's ground.js does:
//   heightAt(x, z) -> metres          slopeAt(x, z, sample) -> rise/run
//   normalAt(x, z, sample, out) -> [nx, ny, nz]
//   waterAt(x, z) -> depth (0 = dry)  underwater(x, z) -> bool
//   roadAt(x, z) -> 0..1              clampToWorld(x, z) -> [x, z]
//   biomeIdAt(x, z) -> id (only the spawner reads it)
//   blocked(x, z) -> bool   OPTIONAL: nav.bin's solid scatter/buildings/deep water (index.js adds it
//                           from `host.terrain.nav`; monster-ai.js slides along it)

export function flatTerrain({ height = 0, size = Infinity } = {}) {
  const half = size / 2;
  const clamp = v => Math.max(-half, Math.min(half, v));
  return {
    heightAt: () => height,
    slopeAt: () => 0,
    normalAt: (x, z, s, out = [0, 1, 0]) => { out[0] = 0; out[1] = 1; out[2] = 0; return out; },
    waterAt: () => 0,
    underwater: () => false,
    roadAt: () => 0,
    clampToWorld: (x, z) => [clamp(x), clamp(z)],
    biomeIdAt: () => 0,
  };
}
