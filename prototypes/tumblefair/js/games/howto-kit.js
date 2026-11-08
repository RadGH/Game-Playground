// How-to lines (Expansion 1 M3, "Learn by doing"). Every minigame has ONE goal line and ONE controls line, shown big on
// the intro card with a picture of each control (js/client/learn.js draws the pictures). The lines live in
// js/games/howto.js (one row per game, checked against each game's rules in the 2026-11-07 audit); this file is the
// grammar both the browser and tests/howto.test.js read. Pure: no DOM.
//
//   ctl line:  "[stick] walk to paint · [A] grab a paint bomb"   segments joined with " · ", each starting with a token
//   tokens:    [stick] the move stick   [A] the big button   [B] the small button   (their labels come from meta.controls)
//              [tap] [drag] [hold] [type]   things done on the screen
export const TOKENS = Object.freeze(['stick', 'A', 'B', 'tap', 'drag', 'hold', 'type']);
export const LIMITS = Object.freeze({ goal: 60, ctl: 70 });
const TOKEN_RE = /\[(stick|A|B|tap|drag|hold|type)\]/g;

/** "[stick] walk · [A] grab" -> [{ tok: 'stick', text: 'walk' }, { tok: 'A', text: 'grab' }] (a segment with no token: tok null). */
export function parseCtl(line) {
  return String(line || '').split(/\s+·\s+/).map(seg => {
    const m = /^\s*\[(stick|A|B|tap|drag|hold|type)\]\s*/.exec(seg);
    return m ? { tok: m[1], text: seg.slice(m[0].length).trim() } : { tok: null, text: seg.trim() };
  }).filter(s => s.tok || s.text);
}
/** The tokens a line uses. */
export const tokensOf = line => [...String(line || '').matchAll(TOKEN_RE)].map(m => m[1]);
/** The line's length as read (tokens are pictures, not letters). */
export const textLength = line => String(line || '').replace(TOKEN_RE, '').replace(/\s+/g, ' ').trim().length;

/**
 * What is wrong with a game's how-to lines, as a list of short sentences ([] = fine). The tokens must be controls the
 * game really has: [A]/[B] need meta.controls.a/.b; [stick] an arena game with a stick. An arena game must mention
 * every control its layout shows; a screen game must say what to do on the screen.
 */
export function howtoProblems(meta, row) {
  const out = [], c = meta.controls || {}, arena = meta.kind === 'arena';
  if (!row || typeof row.goal !== 'string' || !row.goal.trim()) out.push('no goal line');
  else if (row.goal.length > LIMITS.goal) out.push(`goal line is ${row.goal.length} characters (max ${LIMITS.goal})`);
  if (!row || typeof row.ctl !== 'string' || !row.ctl.trim()) { out.push('no controls line'); return out; }
  if (textLength(row.ctl) > LIMITS.ctl) out.push(`controls line is ${textLength(row.ctl)} characters (max ${LIMITS.ctl})`);
  const toks = new Set(tokensOf(row.ctl));
  if (!toks.size) out.push('controls line shows no control');
  if (parseCtl(row.ctl).some(s => !s.tok)) out.push('a controls segment does not start with a control');
  if (toks.has('A') && !c.a) out.push('names [A] but the game has no A button');
  if (toks.has('B') && !c.b) out.push('names [B] but the game has no B button');
  if (toks.has('stick') && !(arena && c.stick !== false)) out.push('names [stick] but the game has no stick');
  if (arena) {
    if (c.stick !== false && !toks.has('stick')) out.push('arena game does not mention the stick');
    if (c.a && !toks.has('A')) out.push(`does not mention the A button (${c.a})`);
    if (c.b && !toks.has('B')) out.push(`does not mention the B button (${c.b})`);
  } else if (!['tap', 'drag', 'hold', 'type', 'A', 'B'].some(t => toks.has(t))) out.push('screen game does not say what to tap');
  return out;
}

/** A line made from the meta alone (only for a game that has no row yet: a brand-new game before its audit). */
export function fallbackHowto(meta) {
  const c = meta.controls || {}, segs = [];
  if (meta.kind === 'arena') {
    if (c.stick !== false) segs.push('[stick] move');
    if (c.a) segs.push(`[A] ${String(c.a).toLowerCase()}`);
    if (c.b) segs.push(`[B] ${String(c.b).toLowerCase()}`);
  } else segs.push('[tap] your choices on the screen');
  return { goal: String(meta.blurb || '').replace(/!$/, '.').slice(0, LIMITS.goal), ctl: segs.join(' · ') };
}
