// The skill bar: slots 1–6 (keys 1–6) on top of the basic strike (F). The server owns the real bar (stream C's
// buildSkillBar, all 30 classes); until it sends one (`you.bar`, requested in docs/requests.md D -> A/C), the
// client reads the same Farhold data the server builds it from — the class's six skills (skills.json
// `classes[cls]`) unlocking at levels 1/3/6/12/18/24 (`unlockAt`) — so every class has a working bar.
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
