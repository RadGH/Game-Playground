// Ruling 8: "trust + light checks". A character arrives from someone's browser; before a room runs it, the server
// refuses anything impossible — never anything merely lucky. Pure: `validateCharacter(ch, { items })` returns
// { ok, character, problems } where `character` is a CLEANED copy (unknown fields dropped, numbers clamped).
// M6 plugs the item checks in (`items.checkItem`): base ids that exist, affixes that exist on that kind, values inside a
// tier the item level allows, uniques inside their ranges, quality <= 20, item level <= 65.
import { ATTRS, START_ATTR, LEVEL_CAP, attrPointsFor, xpAtLevel, levelForXp } from './progression.js';
import { cleanName, CHAR_VERSION } from './character.js';

const MAX_LOOK = 4000, MAX_DOC = 60_000;
export function validateCharacter(ch, { items = null, levelCap = LEVEL_CAP } = {}) {
  const problems = [];
  if (!ch || typeof ch !== 'object') return { ok: false, problems: ['no character'], msg: 'That character could not be read.' };
  let size = 0; try { size = JSON.stringify(ch).length; } catch { return { ok: false, problems: ['unreadable'], msg: 'That character could not be read.' }; }
  if (size > MAX_DOC) return { ok: false, problems: ['too big'], msg: 'That character is too big to bring in.' };
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const level = int(ch.level, 1, levelCap) ? ch.level : null;
  if (!level) problems.push(`level ${ch.level} is outside 1-${levelCap}`);
  const xp = Number.isFinite(ch.xp) && ch.xp >= 0 ? Math.floor(ch.xp) : 0;
  if (level && (xp < xpAtLevel(level) || levelForXp(xp) !== level)) problems.push(`experience ${xp} does not match level ${level}`);
  const attrs = {};
  let spent = 0;
  for (const a of ATTRS) {
    const v = ch.attrs?.[a];
    if (!int(v, START_ATTR, 999)) problems.push(`${a} ${v} is not a whole number from ${START_ATTR}`);
    attrs[a] = int(v, START_ATTR, 999) ? v : START_ATTR; spent += attrs[a] - START_ATTR;
  }
  const bonusAttr = int(ch.bonusAttr ?? 0, 0, 50) ? (ch.bonusAttr ?? 0) : 0;
  const unspent = int(ch.unspent ?? 0, 0, 999) ? (ch.unspent ?? 0) : 0;
  if (level && spent + unspent > attrPointsFor(level, bonusAttr)) problems.push(`${spent + unspent} attribute points at level ${level} (most is ${attrPointsFor(level, bonusAttr)})`);
  let look = null;
  if (ch.look != null) { try { const s = JSON.stringify(ch.look); if (s.length <= MAX_LOOK && typeof ch.look === 'object') look = JSON.parse(s); else problems.push('look too big'); } catch { problems.push('look unreadable'); } }
  const gold = Number.isFinite(ch.gold) && ch.gold >= 0 ? Math.floor(ch.gold) : 0;
  if (gold > 50_000_000) problems.push('gold beyond anything the game can pay out');
  // M6: every equipped / bagged / belted item through items.checkItem
  if (items) for (const where of ['equip', 'bag', 'belt']) {
    const list = where === 'equip' ? Object.values(ch.equip || {}) : (ch[where] || []);
    for (const it of list) { if (!it) continue; const r = items.checkItem(it.item || it, { level: level || 1 }); if (!r.ok) problems.push(`${where}: ${r.why}`); }
  }
  if (problems.length) return { ok: false, problems, msg: `That character could not join: ${problems[0]}.` };
  return { ok: true, problems, character: { ...ch, v: ch.v || CHAR_VERSION, name: cleanName(ch.name), look, level, xp, attrs, unspent, bonusAttr, gold } };
}
