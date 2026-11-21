// The party: who plays this chapter, on which device, as which hero. A slot is
//   { pid: 'p1', device: 'solo' | 'kb' | 'kbL' | 'kbR' | 'touch' | 'pad:0', heroId, color, bot?: hero }
// 'solo' = one player on everything at once (whole keyboard + every controller + touch). A bot slot carries its own
// (unsaved) hero and plays itself (sim/bots.js).
// the same four colours as the rings the renderer draws under each player (js/render/actors.js HERO_COLORS)
export const COLORS = ['#f2c14e', '#3ec7c0', '#ef5b4c', '#a77df0'];
export const COLOR_NAMES = ['Gold', 'Teal', 'Red', 'Violet'];

export const soloParty = hero => [{ pid: 'p1', device: 'solo', heroId: hero.id, color: COLORS[0] }];

/** One reader per human slot (merging every device for 'solo'). */
export function readersFor(input, party) {
  const out = {};
  for (const s of party) {
    if (s.bot) continue;
    if (s.device === 'solo') {
      const parts = [input.keyboard('kb'), input.touch(), ...[0, 1, 2, 3].map(i => input.pad(i))];
      out[s.pid] = merged(parts);
    } else out[s.pid] = input.reader(s.device);
  }
  return out;
}

/** Several readers as one (solo play): sticks add up, any press counts. */
export function merged(parts) {
  return {
    scheme: 'solo', kind: 'solo', parts,
    touch: parts.find(p => p.kind === 'touch') || null,
    read() {
      const out = { mx: 0, mz: 0, block: false };
      for (const p of parts) {
        const r = p.read();
        out.mx += r.mx; out.mz += r.mz; out.block ||= r.block;
        for (const [k, v] of Object.entries(r)) if (v === true && k !== 'block') out[k] = true;
      }
      out.mx = Math.max(-1, Math.min(1, out.mx)); out.mz = Math.max(-1, Math.min(1, out.mz));
      return out;
    },
    release() { for (const p of parts) p.release(); },
  };
}

/** The scheme whose keys a slot's hints should show right now (solo: the device used last). */
export function hintScheme(slot, last) {
  if (slot.device === 'solo') return last === 'pad' ? 'pad' : last === 'touch' ? 'touch' : 'kb';
  if (slot.device.startsWith('pad:')) return 'pad';
  return slot.device;
}
