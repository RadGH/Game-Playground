// The main quest chain (M27 groundwork, rulings 13, 22, 29). Pure. Steps in data/acts.json (text) + data/quests.json
// (what finishes them). A hero's progress: ch.quests = { <stepId>: { n?, done? } }; the active step is the first not
// done. Kills and boss deaths count for EVERY hero in the area whose active step it is (party progress, ruling 13).
import { xpToNext } from '../rules/progression.js';
import { giveXp } from './fight.js';

/** Quests are kept per difficulty (normal: ch.quests; veteran: ch.quests_veteran; legend: ch.quests_legend). */
export const questKey = diff => !diff || diff === 'normal' ? 'quests' : 'quests_' + diff;
export function activeStep(content, ch, diff = 'normal') {
  const order = content.acts?.[0]?.mainQuests || [], Q = ch[questKey(diff)];
  for (const s of order) if (!Q?.[s.id]?.done) return { ...s, rule: content.quests?.steps?.[s.id] || null };
  return null;
}
function complete(w, p, step) {
  const r = step.rule || {}, ch = p.char, key = questKey(w.difficulty);
  const quests = { ...(ch[key] || {}), [step.id]: { done: true } };
  // the act's last step unlocks the next difficulty (data/difficulty.json)
  const D = w.content.difficulty, next = D && Object.entries(D.tiers || {}).find(([, t]) => t.unlockAfter === (w.difficulty || 'normal'))?.[0];
  const unlocks = step.id === D?.unlockQuest && next ? [...new Set([...(ch.difficulties || ['normal']), next])] : ch.difficulties;
  if (unlocks !== ch.difficulties) w.events.push({ k: 'difficulty-unlocked', to: p.id, tier: next, name: D.tiers[next].name });
  p.char = { ...ch, [key]: quests, difficulties: unlocks, skillPoints: (ch.skillPoints || 0) + 1, questPoints: (ch.questPoints || 0) + 1, gold: (ch.gold || 0) + (r.gold || 0) };
  w.charDirty.add(p.id);
  w.events.push({ k: 'quest-done', to: p.id, id: step.id, name: step.name, gold: r.gold || 0 });
  const xp = Math.round(xpToNext(p.char.level) * (r.xpPct || 0) / 100); if (xp > 0 && Number.isFinite(xp)) giveXp(w, p, xp);
  const nx = activeStep(w.content, p.char, w.difficulty); if (nx) w.events.push({ k: 'quest-new', to: p.id, id: nx.id, name: nx.name, text: nx.text });
}
/** A monster died in this world: count it toward kill steps, and boss steps. */
export function questKill(w, f) {
  for (const p of w.players.values()) {
    const s = activeStep(w.content, p.char, w.difficulty); if (!s?.rule) continue;
    if (s.rule.kind === 'boss' && f.def.id === s.rule.boss) { complete(w, p, s); continue; }
    if (s.rule.kind === 'kill' && w.area.id === s.rule.node && Math.hypot(p.x - f.x, p.z - f.z) < 70) {
      const key = questKey(w.difficulty), n = (p.char[key]?.[s.id]?.n || 0) + 1;
      if (n >= s.rule.n) complete(w, p, s);
      else { p.char = { ...p.char, [key]: { ...(p.char[key] || {}), [s.id]: { n } } }; w.charDirty.add(p.id); if (n % 5 === 0) w.events.push({ k: 'quest-progress', to: p.id, id: s.id, n, of: s.rule.n }); }
    }
  }
}
/** A hero walked through an exit: reach steps. */
export function questReach(w, p, from, to) {
  const s = activeStep(w.content, p.char, w.difficulty); if (!s?.rule) return;
  if (s.rule.kind === 'reach' && s.rule.node === from && s.rule.to === to) complete(w, p, s);
}
