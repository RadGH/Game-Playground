// The skill bar: slots 1–6 (keys 1–6) on top of the basic strike (F). The server owns the real bar: C's rules.bar(e),
// sent as `joined.you.bar` and again as `you {bar}` after a level-up, form/stance change or talent pick (protocol
// §15.10) — barFromServer() reads it. Only when the field is ABSENT (the stand-in rules) does the client fall back to
// the Farhold data the server builds from — the class's six skills (skills.json `classes[cls]`) unlocking at levels
// 1/3/6/12/18/24 (`unlockAt`) — so every class still has a working bar.
//
// Targeting (the M2 ally-targeting audit): a skill that heals, shields or buffs goes to the friendly target
// you have selected, else to yourself; everything else goes to your hostile target, aimed at it, or straight
// ahead of you when nothing is selected (ground and cone skills).

const DATA = new URL('../../../farhold/data/skills.json', import.meta.url);
let data = null;
export function loadSkillData() {
  if (!data) data = fetch(DATA).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return data;
}

/** Is a skill aimed at friends? Pure — exported for tests. */
export function isAllySkill(sk) {
  if (!sk) return false;
  if (sk.target === 'ally' || sk.target === 'self' || sk.ally) return true;
  if (sk.shape === 'heal' || sk.shape === 'buff' || sk.shape === 'shield' || sk.shape === 'self' || sk.shape === 'aura') return true;
  if (sk.heal || sk.shield || sk.hot) return !sk.mult;
  return /\b(heals?|restores?|shields? an ally|an ally|allies)\b/i.test(sk.desc || '') && !sk.mult;
}

/** The bar for a class at a level from Farhold's data. Pure given the data — exported for tests. */
export function barFromData(d, cls, level = 1) {
  if (!d || !d.skills) return [];
  const ids = (d.classes && d.classes[cls]) || [];
  const unlock = d.unlockAt || [1, 3, 6, 12, 18, 24];
  return ids.slice(0, 6).map((id, i) => {
    const sk = d.skills[id] || {};
    return { slot: i + 1, id, name: sk.name || id, desc: sk.desc || '', cd: (sk.cooldown || 0) * 1000, mp: sk.mp || 0, level: unlock[i] || 1, locked: level < (unlock[i] || 1), ally: isAllySkill(sk), shape: sk.shape || null, range: sk.range || sk.reach || sk.radius || null };
  });
}

/** Two letters for a slot face. */
export const initials = name => String(name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/**
 * The server's bar (§15.10 `[{slot, id, name, desc, cd, mp, level, locked, empty, shape, element, ally, group, charges, form}]`)
 * -> the client's slot list. `ally` comes from the rules (send a friendly target, else yourself); a missing `locked`
 * is worked out from the level. Pure — exported for tests.
 */
export function barFromServer(bar, level = 1) {
  if (!Array.isArray(bar)) return [];
  return bar.filter(Boolean).map((b, i) => ({
    ...b, slot: b.slot ?? i + 1, name: b.name || b.id || '', desc: b.desc || '',
    cd: b.cd || 0, mp: b.mp || 0, level: b.level || 1,
    locked: b.locked ?? (level < (b.level || 1)), empty: !!b.empty || (!b.id && !b.name),
    ally: !!b.ally, group: !!b.group,
  }));
}
