// The sim's random numbers. step() points this at the world's seeded generator, so the same seed and the
// same inputs always play out the same way (needed for co-op later and for tests). Outside a step (e.g.
// building a ship in a menu) it falls back to Math.random.
let cur = Math.random;
export const rand = () => cur();
export const setRand = f => { cur = f || Math.random; };
