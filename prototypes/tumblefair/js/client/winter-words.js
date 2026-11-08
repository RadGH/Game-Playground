// Winter Fair (Expansion 1, M6): the board's feed lines told the winter way. Pure (no DOM, no three.js), so node tests
// can read it; js/client/winter.js re-exports it.
/** Board feed lines in winter words (the server writes them; only the board's wording changes, never a number). */
const WORDS = [
  [/^Splat\. /, 'Whumph! Into a snowdrift: '],
  [/^Bumper cart! /, 'Sled ride! '],
  [/BOOM! The cannon fires /, 'FWOOMP! The snow cannon fires '],
  [/found a roll of tickets under the bench/, 'found a roll of tickets under a snowbank'],
  [/dropped their popcorn AND their tickets/, 'dropped their cocoa AND their tickets'],
];
export function winterWords(text) { let t = String(text ?? ''); for (const [a, b] of WORDS) t = t.replace(a, b); return t; }
