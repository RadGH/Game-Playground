// Skills vs talents (owner 2026-11-13, docs/TALENTS.md). Pure.
//   Skills (kind 'active') become AVAILABLE at their level for your class (Path), specialization and everyone's few, and
//   the player chooses to LEARN them with skill points (owner 2026-11-16, live report #3: "start with only Attack; the
//   other abilities should be learned optionally"). One skill point a level (1 at level 1), learning costs 1, and a
//   learned skill gains a rank every RANK_EVERY levels after its level as before. A learned skill is ch.skills[id] = 1.
//   Talents (passive / synergy / talent) cost talent points and live in trees.
//   skillRankAt(sk, level)       the rank a level gives a learned skill
//   learnable(ch, sk)            can this hero learn that skill at all (theirs, not a stance's, not hidden)
//   learnPointsEarned(ch)        skill points a hero of this level has had: 1 a level
//   fixSkills(skills, ch)        a save's learned skills checked: none above its level, no points it could not have
//   isTalent(sk) / talentOpen(ch, t)   is it a talent, and can this hero use it (its `when`)
//   modsFor(skills, ch, id)      every talent mod on one skill, summed: { damage, heal, duration, radius, cost, cooldown, cast, crit } (percent)
//   unlockedAt(skills, ch, L)    the skills that open exactly at level L for this hero
//   migrate(skills, ch)          an older save: Shove off the bar, points that bought skills come back as talent points;
//                                before v3 every open skill was known: the ones on its bar stay learned, the rest become points
export const RANK_EVERY = 2;
export const TALENT_KINDS = new Set(['passive', 'synergy', 'talent']);
export const MOD_STATS = ['damage', 'heal', 'duration', 'radius', 'cost', 'cooldown', 'cast', 'crit'];
export const PATH_ROWS = [2, 4, 6, 8, 11, 14, 17, 20], SPEC_ROWS = [5, 8, 11, 14, 17, 20];   // spec trees open at the spec pick (level 5, owner 2026-11-16)
export const TALENT_VERSION = 3;

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
/** Skill points (for learning skills) a hero of this level has earned in all: 1 a level, the first at level 1. */
export const learnPointsEarned = ch => Math.max(1, ch?.level || 1);
/** A skill this hero could ever learn: an active of their class, their spec, or everyone's — never a stance's own. */
export const learnable = (ch, s) => isSkill(s) && !s.hidden && !s.stanceOnly && (s.owner === 'wanderer' || ownsTree(ch, s));
/** The skills this hero has learned (ids). */
export const learnedSkills = (skills, ch) => Object.keys(ch?.skills || {}).filter(id => ch.skills[id] > 0 && isSkill(skills[id]));
/** Light checks on a save (ruling 8): a learned skill above the hero's level, or not theirs, is dropped (and off the bar);
 *  skill points are capped at what the level gives minus what is learned. Safe to run more than once. */
export function fixSkills(skills, ch) {
  if (!ch) return ch;
  const L = ch.level || 1, own = {}; let changed = false;
  for (const [id, r] of Object.entries(ch.skills || {})) {
    const s = skills[id];
    if (isSkill(s) && r > 0 && (!learnable(ch, s) || (s.reqLevel || 1) > L)) { changed = true; continue; }
    own[id] = isSkill(s) && r > 0 ? 1 : r;
    if (own[id] !== r) changed = true;
  }
  const n = learnedSkills(skills, { skills: own }).length;
  const pts = Math.max(0, Math.min(Number.isInteger(ch.learnPoints) ? ch.learnPoints : 0, learnPointsEarned(ch) - n));
  const bar = (ch.bar || []).map(id => (id && (own[id] > 0 || !isSkill(skills[id])) ? id : null));
  if (!changed && pts === ch.learnPoints && bar.every((id, i) => id === (ch.bar || [])[i])) return ch;
  return { ...ch, skills: own, learnPoints: pts, bar };
}

/** Bring an older save up to the skills/talents split. Safe to run more than once. */
export function migrate(skills, ch) {
  if (!ch) return ch;
  let out = ch;
  const bar = (ch.bar || []).map(id => (id && skills[id] ? id : null));
  if (bar.some((id, i) => id !== (ch.bar || [])[i])) out = { ...out, bar };
  if ((ch.tv || 1) < 2) {
    // points that went into skills come back; talents keep their ranks only if they still fit the new caps
    const keep = {}; let spent = 0;
    for (const [id, r] of Object.entries(ch.skills || {})) { const s = skills[id]; if (isTalent(s) && r > 0) { const k = Math.min(r, s.maxRank || 1); keep[id] = k; spent += k; } }
    out = { ...out, skills: keep, skillPoints: Math.max(0, talentPointsEarned(ch) - spent), tv: 2 };
  }
  if ((out.tv || 1) < 3) {
    // skills became a choice (owner 2026-11-16): what is on the bar stays learned, the rest of the level's points come back
    const L = out.level || 1, own = { ...(out.skills || {}) };
    for (const id of out.bar || []) { const s = skills[id]; if (s && learnable(out, s) && (s.reqLevel || 1) <= L) own[id] = 1; }
    const n = learnedSkills(skills, { skills: own }).length;
    out = { ...out, skills: own, learnPoints: Math.max(0, learnPointsEarned(out) - n), tv: TALENT_VERSION };
  }
  return fixSkills(skills, out);
}
