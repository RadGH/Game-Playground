// The pilot's save on this device: credits, experience, materials, best grades, the locker (owned parts + chips),
// saved builds, learned recipes, settings. localStorage, wrapped so a blocked store never breaks the game. The account
// copy (shared/rgs-cloudsave.js) carries the same key; save-summary.js describes it for the "which save?" choice.
//
// v1 (round 1) → v2 (round 2, the hangar): every maker's starter frame becomes owned parts + a saved build, round 1's
// unopened part pickups are rolled into real parts, and experience starts at the credits earned so far.
import { starterLocker, allStartersLocker, activeBuild, STARTER_CHIP } from './sim/inventory.js';
import { newUid } from './sim/loot.js';
import { rollItem, openCrate } from './sim/loot.js';
import { learn } from './sim/craft.js';
import { rankOf, xpFor } from './sim/progress.js';

export const SAVE_KEY = 'overdrive-frame:save';
export const SAVE_VERSION = 3;

export function freshSave(ctx) {
  const s = { v: SAVE_VERSION, callsign: 'Frame', credits: 0, xp: 0, mats: { scrap: 0, alloy: 0, exotic: 0, chitin: 0, siegeplate: 0 }, grades: {}, items: [], chips: [], builds: [], active: null,
    seen: [], learned: [], dealer: { turn: -1, sold: [] }, played: 0, playedAt: null, settings: { night: 'mission' }, kit: 1 };
  return s;   // round 7: no frame yet — the first visit picks ONE maker's starter (chooseFirstFrame)
}

/** The first-frame choice (round 7): that maker's starter frame, its chip fitted, nothing else. */
export function chooseFirstFrame(s, ctx, maker) {
  const l = starterLocker(ctx.PARTS, ctx.MAKERS, maker);
  s.items.push(...l.items); s.chips.push(...l.chips); s.builds.push(...l.builds); s.active = l.active;
  s.firstFrame = maker;
  return s;
}
export const needsFirstFrame = s => !s.builds?.length;

/** Bring any older save up to date (never throws away anything the player earned). */
export function upgradeSave(old, ctx) {
  if (!old || typeof old !== 'object') return freshSave(ctx);
  if (old.v === SAVE_VERSION) {
    const s = { ...freshSave(null), ...old, mats: { scrap: 0, alloy: 0, exotic: 0, chitin: 0, siegeplate: 0, ...(old.mats || {}) } };
    if (s.builds.length && !s.builds.some(b => b.id === s.active)) s.active = s.builds[0]?.id || null;
    return s;
  }
  if (old.v === 2) {
    // round 7: keep everything; add the repair kit, a skill + empty tuning on every build, and a firmware chip for a
    // pilot who never found one (owner: "I still haven't seen any firmware … by level 5"). Reputation is no longer used.
    const s = { ...freshSave(null), ...old, v: SAVE_VERSION, mats: { scrap: 0, alloy: 0, exotic: 0, chitin: 0, siegeplate: 0, ...(old.mats || {}) }, kit: old.kit || 1 };
    delete s.rep;
    for (const b of s.builds || []) { b.skill ||= 'repulse'; b.tuning ||= {}; }
    if (!s.chips?.length) {
      const maker = (ctx?.P?.[s.items.find(i => i.uid === activeBuild(s)?.parts?.core)?.id]?.maker) || 'brannoch';
      const chip = { uid: newUid(), id: STARTER_CHIP[maker] || 'keen-edge' }; s.chips = [chip];
      const b = activeBuild(s); if (b) b.chips = [...(b.chips || []), chip.uid];
    }
    if (!s.builds.some(b => b.id === s.active)) s.active = s.builds[0]?.id || null;
    return s;
  }
  if (old.v === 1) {
    const s = freshSave(ctx);
    if (ctx) Object.assign(s, allStartersLocker(ctx.PARTS, ctx.MAKERS));   // a round 1 pilot already had all four
    for (const k of ['callsign', 'credits', 'grades', 'played', 'playedAt', 'settings']) if (old[k] != null) s[k] = old[k];
    s.mats = { ...s.mats, ...(old.mats || {}) };
    s.xp = old.credits || 0;
    if (old.frame && s.builds.some(b => b.id === 'b-' + old.frame)) s.active = 'b-' + old.frame;
    if (ctx) for (const l of old.loot || []) s.items.push(rollItem(ctx.P, { tier: l.tier || 1, seed: l.seed || Math.floor(Math.random() * 1e9), boss: !!l.boss }));
    return s;
  }
  return freshSave(ctx);
}

export function loadSave(ctx) {
  try { const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (raw) return upgradeSave(raw, ctx); } catch { /* blocked or broken: start fresh */ }
  return freshSave(ctx);
}

/** Save. stamp = this was play (a mission, a purchase, a craft) — the time the "which save?" choice shows. */
export function writeSave(s, stamp = true) { if (stamp) s.playedAt = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }

/**
 * Fold a mission result into the save. Pay is the full amount for every player (owner: never split). Part pickups
 * become rolled parts, grade crates open (parts, materials, maybe a chip or a schematic), an S grade can teach a secret
 * recipe. Returns what was gained, for the results screen.
 */
export function applyResult(s, result, missionId, ctx, pid = 'p1') {
  const me = result.perPlayer.find(p => p.id === pid) || result.perPlayer[0];
  if (result.versus) {                       // versus (sim/versus.js): no loot, no grade — experience, and a purse for the winners
    const before = rankOf(s.xp), win = me?.team === result.winner, xp = 400 + (win ? 600 : 0) + (me?.kills || 0) * 50;
    s.xp = (s.xp || 0) + xp; s.credits += win ? 1500 : 500; s.played++;
    const after = rankOf(s.xp);
    return { items: [], chips: [], mats: {}, learned: [], crates: 0, xp, won: win, ...(after.rank > before.rank ? { rankUp: after } : {}) };
  }
  const mission = ctx.mission || ctx.MISSIONS?.find(m => m.id === missionId);
  const tier = ctx.tier || mission?.tier || 1;
  const before = rankOf(s.xp);
  const gained = { items: [], chips: [], mats: { ...(me?.mats || {}) }, learned: [], crates: result.crates || 0 };
  for (const k of Object.keys(s.mats)) s.mats[k] += me?.mats?.[k] || 0;
  const st = ctx.stats || {};
  for (const l of me?.loot || []) { const it = rollItem(ctx.P, { tier: ctx.tier || l.tier || tier, seed: l.seed || 1, boss: !!l.boss }); s.items.push(it); gained.items.push(it); }   // co-op: ctx.tier = your own level
  for (let i = 0; i < (result.crates || 0); i++) {
    const c = openCrate(ctx.P, ctx.CHIPS, { tier, seed: ((result.seed || 1) * 7919 + i * 104729 + s.played) >>> 0, luck: st.partLuck || 0 });
    s.items.push(...c.items); gained.items.push(...c.items);
    if (!c.chips.length && s.chips.length < 3) {   // round 7: the first few crates always carry a chip, so firmware turns up early
      const pool = (ctx.CHIPS || []).filter(x => (x.drop || 1) <= Math.max(1, tier)); if (pool.length) c.chips.push({ uid: newUid(), id: pool[(s.played * 7 + i * 3) % pool.length].id });
    }
    s.chips.push(...c.chips); gained.chips.push(...c.chips);
    for (const k of Object.keys(c.mats)) { s.mats[k] += c.mats[k]; gained.mats[k] = (gained.mats[k] || 0) + c.mats[k]; }
    if (c.schematic) gained.learned.push(...learn(s, ctx.RECIPES, { schematic: c.schematic }, s.played * 31 + i));
  }
  if (result.won && result.grade) gained.learned.push(...learn(s, ctx.RECIPES, { grade: result.grade, mission: missionId }));
  s.seen = [...new Set([...(s.seen || []), ...gained.items.map(i => i.id)])];
  s.played++;
  const xp = xpFor(result, me); s.xp = (s.xp || 0) + xp; gained.xp = xp;
  if (result.won) {
    s.credits += result.pay;
    if (mission?.contract) { s.contractsDone = (s.contractsDone || 0) + 1; return finish(); }
    const order = ['S', 'A', 'B', 'C', 'D'], old = s.grades[missionId];
    if (!old || order.indexOf(result.grade) < order.indexOf(old)) s.grades[missionId] = result.grade;
  }
  return finish();
  function finish() { const after = rankOf(s.xp); if (after.rank > before.rank) gained.rankUp = after; return gained; }
}

export { activeBuild };
