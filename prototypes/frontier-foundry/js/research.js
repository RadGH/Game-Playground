// Research. Labs turn science packs into progress on one node at a time. Packs are drawn steadily
// as the node advances, so a half-finished node has only eaten half its packs.

import { pull, visible } from './production.js';

/** Labs that are powered and can see packs. */
export function labs(game) {
  return game.structures.filter(s => s.state === 'done' && s.def.researchRate && s.enabled);
}

/** Nodes that could be started right now. */
export function availableTechs(game) {
  return game.data.techs.filter(t => canResearch(game, t.id).ok);
}

export function canResearch(game, id) {
  const t = game.data.tech[id];
  if (!t) return { ok: false, reason: 'no such research' };
  if (game.research.done.includes(id)) return { ok: false, reason: 'already done' };
  for (const req of t.requires || []) if (!game.research.done.includes(req)) return { ok: false, reason: `needs ${game.data.tech[req]?.name || req}` };
  if (t.planetRequirement && !game.planetHas(t.planetRequirement)) return { ok: false, reason: `only on a world with ${t.planetRequirement}` };
  return { ok: true };
}

export function startResearch(game, id) {
  const check = canResearch(game, id);
  if (!check.ok) return check;
  game.research.current = id;
  game.research.progress = 0;
  game.research.consumed = {};
  game.emit('research:started', { id });
  return { ok: true };
}

/** Finish a node outright - used by quest rewards and by an archive carrying research between planets. */
export function completeResearch(game, id, { silent = false } = {}) {
  if (game.research.done.includes(id)) return false;
  game.research.done.push(id);
  if (game.research.current === id) { game.research.current = null; game.research.progress = 0; game.research.consumed = {}; }
  game.unlocked = null;                                   // rebuilt lazily
  if (!silent) game.notify('research_done', { name: game.data.tech[id]?.name || id });
  game.emit('research:done', { id });
  return true;
}

export function tickResearch(game, dt) {
  const cur = game.research.current;
  if (!cur) return;
  const t = game.data.tech[cur];
  if (!t) { game.research.current = null; return; }
  const list = labs(game);
  if (!list.length) return;
  let rate = 0;
  for (const l of list) rate += l.def.researchRate * (l.def.powerUse ? l.powered : 1);
  rate *= game.techEffect('researchRate', 1) * game.diff.research;
  if (rate <= 0) return;

  const work = Math.max(1, t.work);
  let step = rate * dt;
  // draw the packs this step needs; if they are not there, only progress as far as the packs allow
  for (const [res, total] of Object.entries(t.cost || {})) {
    const wantBy = total * Math.min(1, (game.research.progress + step) / work);
    const need = wantBy - (game.research.consumed[res] || 0);
    if (need <= 1e-6) continue;
    let got = 0;
    for (const l of list) { got += pull(game, l, res, need - got); if (got >= need - 1e-6) break; }
    game.research.consumed[res] = (game.research.consumed[res] || 0) + got;
    if (got < need - 1e-6) {
      const share = total > 0 ? ((game.research.consumed[res] || 0) / total) : 1;
      step = Math.max(0, share * work - game.research.progress);
      if (!game.flags.researchStalled) { game.flags.researchStalled = true; game.notify('research_stalled', { resource: game.data.resource[res]?.name || res }); }
    } else game.flags.researchStalled = false;
  }
  game.research.progress += step;
  game.stats.researchSpent += step;
  if (game.research.progress >= work) completeResearch(game, cur);
}

/** Add free progress (quest rewards). Overflow finishes the node. */
export function grantResearch(game, amount) {
  const cur = game.research.current;
  if (!cur) { game.research.bank = (game.research.bank || 0) + amount; return; }
  game.research.progress += amount;
  const t = game.data.tech[cur];
  if (t && game.research.progress >= t.work) completeResearch(game, cur);
}

/** Everything researched so far, as ids the build screen can filter on. */
export function unlockedSet(game) {
  const set = new Set();
  for (const id of game.research.done) for (const u of game.data.tech[id]?.unlocks || []) set.add(u);
  return set;
}

export { visible };
