// Who talks on comms, and the picture beside their words: the speaker's own machine, rendered from its real model
// (owner: "Their machine" — house rule: character pictures come from the 3D model, never a separate 2D drawing).
import { composeMech } from '../../../../mechkit/js/bake-mech.js';
import { drawFit } from './fit.js';

export const SPEAKER_INFO = {
  handler: { name: 'Halyard', role: 'Your handler', colour: '#ffcf4a', recipe: 'of-command-drone', dir: 6 },
  pilot: { name: 'Gannet', role: 'Dropship pilot', colour: '#3ff0ff', recipe: 'of-dropship', dir: 5, params: { cargo: 0 } },
  mechanic: { name: 'Ostrander', role: 'Hangar chief', colour: '#7dff6a', recipe: 'of-command-drone', dir: 3 },
};

/** Speaker table for the HUD: each gets draw(canvas) that paints its machine (baked lazily; blank until ready). */
export function SPEAKERS(sprites, mechArt, build) {
  const out = {};
  for (const [id, s] of Object.entries(SPEAKER_INFO)) {
    out[id] = { ...s, draw(canvas) { portrait(canvas, sprites, s); } };
    sprites.icon(s.recipe, s.params || {}, s.dir);   // bake ahead so it's ready when they speak
  }
  // you (the frame) — your own mech on the channel
  out.you = { name: 'You', colour: '#e4e8ee', draw(canvas) { const g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, canvas.height); try { composeMech(g, mechArt.layersFor(build), 6, 6, 0, build.paint || 'maker', 0, { x: canvas.width / 2, y: canvas.height * 0.92, zoom: 0.55, shadow: false }); } catch { /* not baked yet */ } } };
  return out;
}

function portrait(canvas, sprites, s) {
  const sp = sprites.icon(s.recipe, s.params || {}, s.dir); if (!sp) return;
  drawFit(canvas, sp.day, sp.lights, 0.06, false);
}
