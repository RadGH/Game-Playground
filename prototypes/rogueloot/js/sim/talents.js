// Skills vs talents (owner 2026-11-13, docs/TALENTS.md). Pure.
//   Skills (kind 'active') unlock by themselves at their level for your class (Path) and specialization, and gain a rank
//   every RANK_EVERY levels after that. Talents (passive / synergy / talent) cost talent points and live in trees.
//   skillRankAt(sk, level)       the rank a level gives an unlocked skill
//   isTalent(sk) / talentOpen(ch, t)   is it a talent, and can this hero use it (its `when`)
//   modsFor(skills, ch, id)      every talent mod on one skill, summed: { damage, heal, duration, radius, cost, cooldown, cast, crit } (percent)
//   unlockedAt(skills, ch, L)    the skills that open exactly at level L for this hero
//   migrate(skills, ch)          an older save: Shove off the bar, points that bought skills come back as talent points
export const RANK_EVERY = 2;
export const TALENT_KINDS = new Set(['passive', 'synergy', 'talent']);
export const MOD_STATS = ['damage', 'heal', 'duration', 'radius', 'cost', 'cooldown', 'cast', 'crit'];
export const PATH_ROWS = [2, 4, 6, 8, 11, 14, 17, 20], SPEC_ROWS = [10, 12, 14, 16, 18, 20];
export const TALENT_VERSION = 2;

export const isTalent = s => !!s && TALENT_KINDS.has(s.kind) && s.owner !== 'wanderer' && s.owner !== 'all';
export const isSkill = s => !!s && s.kind === 'active';
export function skillRankAt(sk, level) {
  const L0 = sk?.reqLevel || 1; if (!sk || level < L0) return 0;
  return Math.min(sk.maxRank || 1, 1 + Math.floor((level - L0) / RANK_EVERY));
}
/** Is this skill or talent one of this hero's: their class's, their spec's (or everyone's)? */
export const ownsTree = (ch, s) => !!s && (s.owner === ch?.path || (!!ch?.spec && s.owner === ch.spec));
/** A talent's `when` ({ spec: [...] } / { path: [...] }) — false when it is for another spec or class. */
export function talentOpen(ch, t) {
  const w = t?.when; if (!w) return true;
  if (w.spec && !w.spec.includes(ch?.spec)) return false;
  if (w.path && !w.path.includes(ch?.path)) return false;
  return true;
}

/** The damage types a skill deals, plus 'heal' when it heals or wards. Cached on the row. */
export function skillTypes(sk) {
  if (sk._types) return sk._types;
  const out = new Set(); if (sk.type) out.add(sk.type); if (sk.kind === 'heal') out.add('heal');
  const walk = es => { for (const e of es || []) { if (e.type && e.type !== 'random') out.add(e.type); if (['heal', 'hot', 'shield', 'shieldPct'].includes(e.do)) out.add('heal'); if (e.do === 'weapon') out.add('physical'); walk(e.effects); } };
  walk(sk.effects);
  Object.defineProperty(sk, '_types', { value: out, enumerable: false });
  return out;
}
/** Does a mod's target take this skill? */
export function modHits(to, sk) {
  if (!to || !sk) return false;
  if (to.skill) return to.skill === sk.id;
  if (to.skills) return to.skills.includes(sk.id);
  if (to.owner) return sk.owner === to.owner;
  if (to.tree) return sk.tree === to.tree;
  if (to.type) return skillTypes(sk).has(to.type);
  return false;
}

const cache = new WeakMap();
/** Every talent mod on one skill, summed (percent; crit in points). Learned, open talents only. Cached per character. */
export function modsFor(skills, ch, id) {
  if (!ch) return zero();
  let per = cache.get(ch); if (!per) { per = new Map(); cache.set(ch, per); }
  if (per.has(id)) return per.get(id);
  const sk = skills[id], out = zero();
  if (sk) for (const [tid, r] of Object.entries(ch.skills || {})) {
    const t = skills[tid]; if (!(r > 0) || !t?.mods || !isTalent(t) || !ownsTree(ch, t) || !talentOpen(ch, t)) continue;
    for (const m of t.mods) if (modHits(m.to, sk)) out[m.stat] = (out[m.stat] || 0) + m.perRank * r;
  }
  per.set(id, out);
  return out;
}
const zero = () => Object.fromEntries(MOD_STATS.map(k => [k, 0]));

/** The skills that open at exactly level L for this hero (class + spec). */
export function unlockedAt(skills, ch, L) {
  return Object.values(skills).filter(s => isSkill(s) && !s.hidden && ownsTree(ch, s) && (s.reqLevel || 1) === L);
}
/** Talent points a hero of this level has earned in all: 1 a level from 2, plus the quest points. */
export const talentPointsEarned = ch => Math.max(0, (ch.level || 1) - 1) + (ch.questPoints || 0);

/** Bring an older save up to the skills/talents split. Safe to run more than once. */
export function migrate(skills, ch) {
  if (!ch) return ch;
  let out = ch;
  const bar = (ch.bar || []).map(id => (id && skills[id] ? id : null));
  if (bar.some((id, i) => id !== (ch.bar || [])[i])) out = { ...out, bar };
  if ((ch.tv || 1) < TALENT_VERSION) {
    // points that went into skills come back; talents keep their ranks only if they still fit the new caps
    const keep = {}; let spent = 0;
    for (const [id, r] of Object.entries(ch.skills || {})) { const s = skills[id]; if (isTalent(s) && r > 0) { const k = Math.min(r, s.maxRank || 1); keep[id] = k; spent += k; } }
    out = { ...out, skills: keep, skillPoints: Math.max(0, talentPointsEarned(ch) - spent), tv: TALENT_VERSION };
  }
  return out;
}
