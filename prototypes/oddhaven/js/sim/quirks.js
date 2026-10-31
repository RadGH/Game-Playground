// Quirks change what people DO, not only what they say (M6). data/people.json gives each quirk a `does` row; this file turns a person's quirks into one small
// set of effects (`c.fx[id]`, worked out at load, never saved). Everything that reads one is at the sim's every detail level.
//   minutes {action: x}   that action takes x as long            cost x          paid treats cost x as much         tips n      staff who serve them like them more
//   skip [site]           will not go to that kind of place      hate [action]   will not do it                     walkPrefer x  drives what others would walk
//   after {action: {need: v}}  a need gets a bump when that action ends       housemate {action: [mood, hours]}  the people they live with feel it
//   wakeShift m  a later body clock (only with no early shift)   leaveLate {chance, minutes}  some mornings the keys cannot be found
//   wrong x  spells go wrong x as often    magicAgain x  casts x as often     recruit p  talks people into the gym   noisy  neighbours notice     knownGain x, likeGain x, stirs, towMood x
const EMPTY = Object.freeze({});

export function buildFx(c, p) {
  const fx = {};
  for (const id of p.quirks) {
    const d = c.quirkById[id]?.does; if (!d) continue;
    for (const [k, v] of Object.entries(d)) {
      if (k === 'minutes' || k === 'after' || k === 'housemate') fx[k] = { ...fx[k], ...v };
      else if (k === 'skip' || k === 'hate') fx[k] = [...(fx[k] || []), ...v];
      else fx[k] = v;
    }
  }
  return fx;
}
export const fxOf = (c, p) => c.fx[p.id] ?? EMPTY;
/** How many minutes this person takes over this action. */
export const minutesFor = (c, p, a, base = a.minutes) => base * (fxOf(c, p).minutes?.[a.id] ?? 1);
export const wontDo = (c, p, a) => { const fx = fxOf(c, p); return !!(fx.skip?.includes(a.site) || fx.hate?.includes(a.id)); };
/** What a paid thing costs this person, whole coins, never free. */
export const costFor = (c, p, cost) => Math.max(1, Math.round(cost * (fxOf(c, p).cost ?? 1)));
