// The console's one line to the world (PLAN §1.2): it sends commands (§3.3), is told the tick rate, and hands back
// frames (chunks + fields + hud + events). The console never changes game state itself. Since M3 the other end is
// always the real sim in its worker — see js/console/world-link.js (the M2 stand-in world is retired).

export { createWorldLink } from './world-link.js';

/** Merge several frames from one pump into one (latest hud/fields win, chunks and events add up). Pure. */
export function mergeFrames(frames) {
  if (!frames.length) return null;
  const out = { tick: 0, base: frames[0].base, size: frames[0].size, chunks: [], entMeta: [], events: [], fields: null, hud: null };
  for (const f of frames) {
    out.tick = f.tick; out.size = f.size || out.size;
    if (f.chunks) out.chunks.push(...f.chunks);
    if (f.entMeta) out.entMeta.push(...f.entMeta);
    if (f.events) out.events.push(...f.events);
    if (f.fields) out.fields = { ...(out.fields || {}), ...f.fields };
    if (f.hud) out.hud = f.hud;
  }
  return out;
}
