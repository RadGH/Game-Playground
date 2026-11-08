// Story Night (Expansion 1, M8): the little template language the story cards are written in. Pure (no DOM), the
// server and the tests run it. Lingo (playground/lingo/) was the other option; it is built for characters talking by
// intent with a big dictionary and a dark tone, while a story card only needs a few names dropped into short lines,
// so this is twenty lines instead of a dependency.
//
//   "{hero} grabs the reins."            one pass, left to right: a value is never read again for more braces, so a
//                                        player called "{villain}" stays exactly that (and safeName strips braces anyway)
//   text: "one line"                     a card's text is a string, a list of lines, or { "any": [alt, alt, …] }
//   text: ["line 1", "line 2"]           (an alt is itself a string or a list of lines) — one alt is picked with the rng
//   text: { "any": [["a", "b"], "c"] }
//
// A line whose placeholder has no value right now (say {loser} when one person played) is DROPPED, never printed with
// a hole in it. Only the names in KEYS may appear; tests/story.test.js fails on any other.

/** Every placeholder a story line may use. */
export const KEYS = Object.freeze(['hero', 'winner', 'loser', 'villain', 'ally', 'place', 'prize', 'who', 'deed']);
const RE = /\{([a-z]+)\}/g;

/** A player's name as it may appear in a story line: no braces, no control characters, at most 16 characters. */
export function safeName(s) {
  const t = String(s ?? '').replace(/[{}<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  return t || 'Someone';
}

/** Pick the lines of a text field: string | string[] | { any: [...] }. */
export function linesOf(text, rng) {
  if (text == null) return [];
  if (typeof text === 'string') return [text];
  if (Array.isArray(text)) return text.filter(l => typeof l === 'string');
  if (Array.isArray(text.any) && text.any.length) return linesOf(text.any[Math.floor(rng() * text.any.length)], rng);
  return [];
}

/** Fill one line; null when a placeholder it uses has no value. */
export function fill(line, vals) {
  let missing = false;
  const out = line.replace(RE, (_, k) => { const v = vals[k]; if (v == null || v === '') { missing = true; return ''; } return String(v); });
  return missing ? null : out;
}

/** Pick + fill a text field: the lines that could be filled, first letter of each made upper case. */
export function render(text, vals, rng) {
  return linesOf(text, rng).map(l => fill(l, vals)).filter(l => l != null && l.trim()).map(cap);
}
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Every placeholder name a text field could use (all alternatives), for the data tests. */
export function keysIn(text) {
  const all = [];
  const walk = t => { if (typeof t === 'string') for (const m of t.matchAll(RE)) all.push(m[1]); else if (Array.isArray(t)) t.forEach(walk); else if (t && Array.isArray(t.any)) t.any.forEach(walk); };
  walk(text);
  return all;
}

/** Every line a text field could produce (all alternatives), for the data tests. */
export function allLines(text) {
  const out = [];
  const walk = t => { if (typeof t === 'string') out.push(t); else if (Array.isArray(t)) t.forEach(walk); else if (t && Array.isArray(t.any)) t.any.forEach(walk); };
  walk(text);
  return out;
}
