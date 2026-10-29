// Kestrel bodies in Thousandvale — BATCH 1 (2026-10-27), only behind `?chars=kestrel` (chibi-version.js `CHARS`).
//
// The game hands a Chibi 2 avatar JSON to `createTvBody`; under the switch it lands here. The avatar becomes a Kestrel
// kit look (avatar-3d/kestrel/kit/js/from-chibi.js: form, race proportions, colours, stand-in clothes) that carries the
// Chibi look along, so the body is built WITH that look's weapons, shield, focus, cape, pack, belt and (stand-in) hat
// (gear-bridge.js) and plays that look's hold-aware clips retargeted onto the Kestrel rig (retarget.js). The actor has
// Chibi 2's shape (CONTRACT.md §2) plus `gaitDistance` and `faceFrame`, which the game reads where Chibi's numbers were
// hard-coded. Read avatar-3d/kestrel/kit/README.md "Thousandvale" first.
//
//   const body = await createKestrelTvBody(avatar, { anims, slice, budget });

import { createKestrelCharacter, prepareKestrel } from '../../../../avatar-3d/kestrel/kit/js/kestrel.js';
import { kestrelLookFromChibi } from '../../../../avatar-3d/kestrel/kit/js/from-chibi.js';

/**
 * The cycle lengths the game's rate rule (actors.js: walk `speed * 1.05 / 2.0`, run `speed * 0.65 / 3.4`) was written for:
 * Chibi 2's walk carries the body 2.0 m in 1.05 s, its run 3.4 m in 0.65 s. A Kestrel gait covers its own distance in its
 * own time, so the rate the game asks for is turned into the one that keeps a Kestrel foot planted. Pure — exported.
 */
export const CHIBI_GAIT = { walk: { dist: 2.0, len: 1.05 }, run: { dist: 3.4, len: 0.65 } };
export const KIT_GAIT_LEN = { walk: 1.05, run: 0.62 };
export function kestrelRate(asked, anim, dist) {
  const c = CHIBI_GAIT[anim];
  if (!c || !(dist > 0)) return asked;
  return asked * (c.dist / c.len) * (KIT_GAIT_LEN[anim] / dist);
}

const FIRST = new Set(['idle', 'walk', 'run', 'ready']);
export async function createKestrelTvBody(avatar, opts = {}) {
  const look = kestrelLookFromChibi(avatar);
  // batch 5: the gear icons' shop mannequin (ui/item-icons.js) — one colour, a carved face with no eyes; it only stands
  if (opts.mannequin) look.mannequin = true;
  const anims = opts.mannequin ? ['idle'] : opts.anims || ['idle', 'walk', 'run'];
  // the body and the clips it shows first, in slices; every other clip is baked the first time it plays (~2 ms, and
  // shared by every body of the same build and hold)
  const first = anims.filter(n => FIRST.has(n));
  // batch 5: `lod` 0 | 1 — a body built far from the camera starts as the low-detail one (actors.js kestrelLodFor);
  // body.wantLod(l, { slice }) switches later, building the other one in slices
  const lod = opts.mannequin ? 0 : (opts.lod ? 1 : 0);
  if (opts.slice) { try { await prepareKestrel(look, { anims: first, slice: opts.slice, budget: opts.budget ?? 10, lod }); } catch (e) { console.warn('[kestrel] prepare failed', e); } }
  const body = await createKestrelCharacter(look, { anims, lod });
  const raw = body.setRate;
  let asked = 1;
  body.setRate = k => { asked = Number(k) || 1; raw(kestrelRate(asked, body.anim, body.gaitDistance(body.anim))); };
  const play = body.setAnim;
  // a gait's rate depends on which gait: re-derive it whenever the clip changes
  body.setAnim = (name, fade, restart) => { play(name, fade, restart); raw(kestrelRate(asked, body.anim, body.gaitDistance(body.anim))); };
  body.kestrel = true;
  return body;
}
