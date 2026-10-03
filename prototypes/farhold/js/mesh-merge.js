// R27 M8 — moved to avatar-3d/js/mesh-merge.js (2026-10-03) so every game can fold a creature's
// meshes into one skinned mesh per material. This file only re-exports it, so older imports keep working.
export { compactCreature } from '../../../avatar-3d/js/mesh-merge.js';
