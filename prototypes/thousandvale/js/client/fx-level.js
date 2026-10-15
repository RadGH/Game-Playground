// How much spell effect to draw (2026-10-14, owner: "add an option to disable graphics or something"). Pure.
// Settings → Graphics → "Spell effects"; applies at once, no reload. Telegraphs (the danger marks on the ground) are
// never affected — they are rules you have to see, not decoration.
//
//   enhanced  every class's signature shapes (sig-fx.js) on top of the element effects — the default
//   standard  the element effects only (how spells looked before the class signatures)
//   reduced   your own spells, spells aimed at you and at your target get the full effects (signature shapes thinned);
//             everyone else's spells show only what flies (arrows, bolts, beams) — for crowds and slower machines
//   off       only what flies, for everyone; no casting flashes, impacts, ground effects or auras

export const FX_LEVELS = Object.freeze([
  { id: 'enhanced', label: 'Enhanced (class signatures)' },
  { id: 'standard', label: 'Standard' },
  { id: 'reduced', label: 'Reduced (yours and your target’s only)' },
  { id: 'off', label: 'Off (projectiles only)' },
]);
export const FX_DEFAULT = 'enhanced';
export const isFxLevel = v => FX_LEVELS.some(l => l.id === v);

/** Does this event involve you or your target? `focus` = { self, target } (entity ids). */
export function involves(ev, focus = {}) {
  if (!ev || !focus) return false;
  const ids = [ev.s, ev.id, ev.d, ev.target, ev.fromId, ev.to != null && typeof ev.to !== 'object' ? ev.to : null];
  return ids.some(x => x != null && (x === focus.self || (focus.target != null && x === focus.target)));
}

/** What a module should draw for one event at a level: 'full' | 'thin' (signatures, reduced) | 'flight' (projectiles only) | 'none'. */
export function drawFor(level, ev, focus, { signature = false } = {}) {
  const mine = involves(ev, focus);
  if (signature) {
    if (level === 'enhanced') return 'full';
    if (level === 'reduced' && mine) return 'thin';
    return 'none';
  }
  if (level === 'enhanced' || level === 'standard') return 'full';
  if (level === 'reduced' && mine) return 'full';
  return 'flight';
}
