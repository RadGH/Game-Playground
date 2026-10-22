// Button names that follow the device you are holding (owner 2026-10-22: "keep those messages controller-first, but
// make those controls dynamic based on the device"). Games write their instructions controller-first ("press A to
// sit", "B = bump", "A: load the cannon"); btnText() rewrites those mentions for the device last used:
//   pad   -> A / B (as written)            keys  -> Space / E (controls.js maps Space = A, E = B)
//   touch -> the on-screen button's own label from meta.controls ("press SIT to sit"), or A / B when there is none.
// Only button mentions are touched, never the word "A" in a sentence ("A pad wobbles…"): see BUTTON below.
let kind = null;                                 // last device used: 'pad' | 'keys' | 'touch' (null = guess)
export const setInputKind = k => { kind = k; };
export function inputKind() {
  if (kind) return kind;
  if (typeof navigator !== 'undefined' && [...(navigator.getGamepads?.() || [])].some(p => p && p.connected)) return 'pad';
  if (typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)) return 'touch';
  return 'keys';
}
if (typeof addEventListener !== 'undefined') {
  addEventListener('keydown', () => { kind = 'keys'; }, true);
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') kind = 'touch'; }, true);
  addEventListener('gamepadconnected', () => { kind = 'pad'; });
}
/** Button mentions: after a verb ("press A", "HOLD B", "tap A", "with A"), in brackets or a pair ("(A)", "A/B"), or
 *  a capital A/B followed by "=", " to", ":" , " with the stick" or a verb ending in s at a sentence start ("B barges.",
 *  "A hops a hole."). The word "A" in a sentence ("A pad wobbles", "A block swings") is never matched. */
const VERB = /\b(press|hold|tap|mash|use|with|hit)(\s+)([AB])\b/gi;
const BARE = /(^|[.!?]\s+|\(|\/)([AB])(?=\)|\/|\s*=|\s+to\b|:|\s+with the stick|\s+(?:hops|barges|bumps|fires|grabs|jumps|dashes|steps|throws|shoves)\b)/g;
/** Rewrite the button mentions in `s` for the device. `controls` = the game's meta.controls; `html` wraps them in <kbd>. */
export function btnText(s, controls = {}, { html = false, device = inputKind() } = {}) {
  if (!s || device === 'pad') return s;
  const name = b => { const B = b.toUpperCase(), n = device === 'keys' ? (B === 'A' ? 'Space' : 'E') : String(controls?.[B.toLowerCase()] || B).toUpperCase(); return html ? `<kbd>${n}</kbd>` : n; };
  return String(s).replace(VERB, (all, v, sp, b) => (b === 'A' || b === 'B' ? v + sp + name(b) : all)).replace(BARE, (all, pre, b) => pre + name(b));
}
