// Skills, talents and the perk forest — the DATA side of the Skills (K) and Perks (N) windows (play-test P6). Pure:
// no DOM, no fetch, no three.js, so tests/D/talents.test.js drives the same rules the windows show.
//
// THE SOURCE. Stream C owns the rules and is writing Thousandvale's own talents and a bigger forest. Until that lands
// the windows read Farhold's: skills.json rows (each row's `talents[1..4]` — two bespoke nodes + one library node per
// tier, tiers opening at TIER_LEVELS 3/8/18/28) and perks.js `buildForest()`. `makeSource()` takes either, so the
// switch is one call in talents.js `loadTalentSource()`:
//
//   const src = makeSource({ skillsData, talentsJson?, perksJson?, treeFor?, forest? });
//   skillLadder(src, cls, level, bar?)      -> [{ id, name, desc, level, unlocked, next, slot, ... }]
//   src.tree(skillId)                       -> { skillId, tiers: [{ tier, level, nodes: [{ id, name, desc, fx }] }] }
//   treeState(tree, picks, level)           -> tiers with each node's state: picked | open | other | locked
//   pickCheck(tree, picks, level, tier, id) -> { ok, why }
//   forestState(forest, perks, level, bonus) / perkCheck(...) / refundCheck(...) — the connected-path rule
//
// The forest rules are Farhold's perks.js rules (canTake / canRefund: a node is open when a neighbour is taken; a node
// goes back only if nothing else then loses its way to the middle), written over any forest's own start node.

import { treeFor as farholdTreeFor, registerSkillRows, TIER_LEVELS as FARHOLD_TIERS } from '../../../../farhold/js/skilltalents.js';
import { buildForest, pointsFor as farholdPointsFor, ARMS as FARHOLD_ARMS } from '../../../../farhold/js/perks.js';

export const DEFAULT_UNLOCK = [1, 3, 6, 12, 18, 24];

// ---------------------------------------------------------------- the source (C's data, else Farhold's)

/** A forest from C's JSON ({ nodes, links, arms?, start? }) into the shape perks.js works on. Pure. */
export function forestFromJson(j) {
  const nodes = (j.nodes || []).map(n => ({ ...n }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const startId = j.start || (byId.has('start') ? 'start' : nodes[0]?.id);
  const links = (j.links || []).filter(([a, b]) => byId.has(a) && byId.has(b));
  const neighbours = new Map();
  for (const [a, b] of links) {
    if (!neighbours.has(a)) neighbours.set(a, []);
    if (!neighbours.has(b)) neighbours.set(b, []);
    neighbours.get(a).push(b); neighbours.get(b).push(a);
  }
  return { nodes, links, byId, neighbours, start: byId.get(startId), arms: j.arms || [] };
}

/**
 * Everything the windows need, from whichever data is present.
 * `skillsData` = Farhold's skills.json (rows, `classes`, `unlockAt`, `statuses`); `talentsJson` = C's
 * `{ tierLevels, skills: { id: { talents } } }` (overrides rows' talents); `perksJson` = C's forest JSON.
 */
export function makeSource({ skillsData = null, talentsJson = null, perksJson = null, forest = null, pointsFor = null, label = null } = {}) {
  // C's files exist as placeholders before they are filled: only a file with real content switches the source over
  if (perksJson && !(Array.isArray(perksJson.nodes) && perksJson.nodes.length)) perksJson = null;
  if (talentsJson && !(talentsJson.skills && Object.keys(talentsJson.skills).length) && !Array.isArray(talentsJson.tierLevels)) talentsJson = null;
  const rows = { ...(skillsData?.skills || {}) };
  if (talentsJson?.skills) for (const [id, t] of Object.entries(talentsJson.skills)) rows[id] = { ...(rows[id] || {}), ...t };
  try { registerSkillRows(rows, skillsData?.statuses || {}); } catch { /* descriptions stay as written */ }
  const tierLevels = talentsJson?.tierLevels || FARHOLD_TIERS;
  const F = forest || (perksJson ? forestFromJson(perksJson) : buildForest());
  if (!F.arms || !F.arms.length) F.arms = FARHOLD_ARMS.map(a => ({ key: a.key, name: a.name, color: a.color, blurb: a.blurb, angle: a.angle }));
  const ppl = pointsFor || (perksJson?.pointsPerLevel ? (lv => Math.max(0, Math.floor((lv - 1) * perksJson.pointsPerLevel))) : farholdPointsFor);
  return {
    label: label || (talentsJson || perksJson ? 'thousandvale' : 'farhold'),
    rows, tierLevels,
    classes: skillsData?.classes || {},
    unlockAt: skillsData?.unlockAt || DEFAULT_UNLOCK,
    forest: F,
    pointsFor: ppl,
    tree(skillId) {
      const row = rows[skillId] || null;
      const t = farholdTreeFor(skillId, row?.shape || 'bolt', row);
      // C's tier levels win over Farhold's when C sends them
      if (talentsJson?.tierLevels) t.tiers.forEach((x, i) => { x.level = tierLevels[i] ?? x.level; });
      return t;
    },
  };
}

// ---------------------------------------------------------------- the skill ladder

/**
 * The class's skills in unlock order: which you have, which unlocks NEXT (and at what level), which are further off.
 * The server's bar (`you.bar`, protocol §15.10) wins where it says something (it knows forms and the real levels).
 */
export function skillLadder(src, cls, level = 1, bar = null) {
  const ids = (src.classes && src.classes[cls]) || [];
  const fromBar = Array.isArray(bar) ? bar.filter(b => b && b.id && !b.empty) : [];
  const list = (fromBar.length ? fromBar.map(b => b.id) : ids).slice(0, 6);
  for (const id of ids) if (!list.includes(id) && list.length < 6) list.push(id);
  const out = list.map((id, i) => {
    const row = src.rows[id] || {};
    const b = fromBar.find(x => x.id === id) || null;
    const lv = b?.level || src.unlockAt[ids.indexOf(id) >= 0 ? ids.indexOf(id) : i] || src.unlockAt[i] || 1;
    return {
      id, slot: b?.slot ?? i + 1, name: b?.name || row.name || id, desc: b?.desc || row.desc || '', level: lv,
      unlocked: level >= lv, cd: b?.cd ?? (row.cooldown || 0) * 1000, mp: b?.mp ?? row.mp ?? 0, element: b?.element || row.element || null,
      shape: b?.shape || row.shape || null, hasTalents: !!row.talents,
    };
  }).sort((a, b) => a.level - b.level || a.slot - b.slot);
  const next = out.find(s => !s.unlocked);
  if (next) next.next = true;
  return out;
}
/** "Next: Whirlwind at level 6 (2 levels to go)" or null when everything is open. Pure. */
export function nextUnlockText(ladder, level) {
  const n = ladder.find(s => s.next);
  if (!n) return null;
  const k = n.level - level;
  return `Next: ${n.name} at level ${n.level} (${k === 1 ? '1 level' : `${k} levels`} to go)`;
}

// ---------------------------------------------------------------- talent trees

/**
 * The server's talent view (C's js/rules/talents.js `talentView`: `[{ skillId, tiers: [{ tier, level, open, picked,
 * nodes: [{ id, name, desc, fx, bespoke, picked }] }] }]`) or a plain picks map -> `{ picks, trees }`. Pure.
 * `trees` (only from a view) are the server's own trees with its own card text; they win over the local ones.
 */
export function talentsFromServer(t) {
  const picks = {}, trees = {};
  if (t && !Array.isArray(t) && Array.isArray(t.skills)) t = t.skills;     // C's rules.talents(e): { tiers, level, skills: [view] }
  if (Array.isArray(t)) {
    for (const s of t) {
      if (!s || !s.skillId) continue;
      picks[s.skillId] = {};
      for (const tier of s.tiers || []) if (tier.picked) picks[s.skillId][tier.tier] = tier.picked;
      trees[s.skillId] = { skillId: s.skillId, offer: 'server', tiers: (s.tiers || []).map(x => ({ tier: x.tier, level: x.level, nodes: (x.nodes || []).map(n => ({ ...n, tier: x.tier })) })) };
    }
  } else if (t && typeof t === 'object') for (const [k, v] of Object.entries(t)) picks[k] = { ...(v || {}) };
  return { picks, trees };
}

/**
 * The server's perk state: a list of taken ids, or C's rules.perks(e) `{ total, spent, left, taken }`. Pure.
 * Returns `{ perks, left }` (left = null when the server did not say).
 */
export function perksFromServer(p) {
  if (Array.isArray(p)) return { perks: p.filter(id => id !== 'start'), left: null };
  if (p && typeof p === 'object' && Array.isArray(p.taken)) return { perks: p.taken.filter(id => id !== 'start'), left: Number.isFinite(p.left) ? p.left : null };
  return null;
}

/** How many tiers are open at a level. */
export const tiersOpenAt = (tierLevels, level) => tierLevels.filter(l => level >= l).length;

/**
 * One tier per row; each node's state: `picked` (yours), `open` (pick it), `other` (this tier is spent on a
 * different node — Farhold's rule: a spent tier is only emptied by an Unbinder), `locked` (tier not open yet,
 * or the skill itself is not unlocked).
 */
export function treeState(tree, picks = {}, level = 1, { skillUnlocked = true } = {}) {
  let waiting = 0;
  const tiers = (tree?.tiers || []).map(t => {
    const open = skillUnlocked && level >= t.level;
    const picked = picks[t.tier] ?? picks[String(t.tier)] ?? null;
    if (open && !picked && t.nodes.length) waiting++;
    return {
      ...t, open, picked,
      nodes: t.nodes.map(n => ({ ...n, state: !open ? 'locked' : picked === n.id ? 'picked' : picked ? 'other' : 'open' })),
    };
  });
  return { tiers, waiting };
}

/** May this node be picked now? Mirrors Farhold's pickTalent rules (the server re-checks). */
export function pickCheck(tree, picks = {}, level = 1, tier, nodeId, { skillUnlocked = true } = {}) {
  const t = (tree?.tiers || []).find(x => x.tier === tier);
  if (!t) return { ok: false, why: 'No such tier.' };
  if (!skillUnlocked) return { ok: false, why: 'Unlock the skill first.' };
  if (level < t.level) return { ok: false, why: `That tier opens at level ${t.level}.` };
  if (!t.nodes.some(n => n.id === nodeId)) return { ok: false, why: 'That talent is not on this skill.' };
  const had = picks[tier] ?? picks[String(tier)];
  if (had === nodeId) return { ok: false, why: 'You already have that one.' };
  if (had) return { ok: false, why: 'This tier is spent. An Unbinder in town can take a talent back off.' };
  return { ok: true };
}

/** Talent picks waiting across the whole ladder (the K button's badge). */
export function talentPicksWaiting(src, ladder, talents = {}, level = 1) {
  let n = 0;
  for (const s of ladder) if (s.unlocked && s.hasTalents) n += treeState(src.tree(s.id), talents[s.id] || {}, level).waiting;
  return n;
}

// ---------------------------------------------------------------- the perk forest

/** Points, and each node's state: taken | open (reachable + a point to spend) | reach (reachable, no point) | locked. */
export function forestState(src, perks = [], level = 1, bonus = 0) {
  const F = src.forest;
  const taken = new Set(perks); if (F.start) taken.add(F.start.id);
  const total = src.pointsFor(level) + (bonus || 0);
  const spent = [...taken].filter(id => id !== F.start?.id).length;
  const left = Math.max(0, total - spent);
  const state = new Map();
  for (const n of F.nodes) {
    if (taken.has(n.id)) { state.set(n.id, 'taken'); continue; }
    const near = (F.neighbours.get(n.id) || []).some(x => taken.has(x));
    state.set(n.id, near ? (left > 0 ? 'open' : 'reach') : 'locked');
  }
  return { total, spent, left, state, taken };
}
/** Can a node be taken? `{ ok, why }` — the path rule (Farhold perks.js canTake), with this source's start + points. */
export function perkCheck(src, perks, level, bonus, id) {
  const st = forestState(src, perks, level, bonus);
  const node = src.forest.byId.get(id);
  if (!node) return { ok: false, why: 'No such perk.' };
  if (st.taken.has(id)) return { ok: false, why: 'You already have that one.' };
  if (st.left <= 0) return { ok: false, why: 'No points left. You earn more as you level.' };
  if (!(src.forest.neighbours.get(id) || []).some(n => st.taken.has(n))) return { ok: false, why: `Nothing you have taken connects to ${node.name || id} yet.` };
  return { ok: true, node };
}
/** Can a node be handed back without cutting others off from the middle? (Farhold perks.js canRefund / orphanedBy.) */
export function refundCheck(src, perks, id) {
  const F = src.forest, start = F.start?.id;
  if (id === start) return { ok: false, why: 'The middle of the forest costs nothing and cannot be given back.' };
  const left = new Set(perks); if (!left.has(id)) return { ok: false, why: 'You have not taken that one.' };
  left.delete(id);
  const seen = new Set([start]), queue = [start];
  while (queue.length) { const at = queue.pop(); for (const nx of F.neighbours.get(at) || []) if (left.has(nx) && !seen.has(nx)) { seen.add(nx); queue.push(nx); } }
  const cut = [...left].filter(x => !seen.has(x)).map(x => F.byId.get(x)?.name || x);
  if (cut.length) return { ok: false, why: cut.length === 1 ? `${cut[0]} only reaches the middle through this one. Give that one back first.` : `${cut.length} perks reach the middle through this one — give those back first.` };
  return { ok: true };
}
/** Stats the taken nodes add up to, for the summary line ("+12% damage, +40 health…"). */
export function perkTotals(src, perks = []) {
  const out = {};
  for (const id of perks) { const n = src.forest.byId.get(id); for (const [k, v] of Object.entries(n?.grants || {})) out[k] = (out[k] || 0) + v; }
  return out;
}
/** World bounds of the forest's layout (for fitting the view). */
export function forestBounds(F) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of F.nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

// ---- play-test 2 Q26: each arm's coloured area is drawn from WHERE ITS NODES ARE, not from a fixed wedge ----------
/**
 * The sector each arm's nodes actually occupy: { key, mid, a0, a1, r0, r1 } in radians / forest units, padded so a node's
 * whole circle sits inside. A branch that grows sideways (The Long Odds' Collector and Fortune's Tithe) widens its own
 * arm's area instead of falling outside it. The hub (no arm) is skipped.
 */
export function armSectors(F, { pad = 0.9 } = {}) {
  const by = new Map();
  for (const n of F.nodes) { if (!n.arm) continue; (by.get(n.arm) || by.set(n.arm, []).get(n.arm)).push(n); }
  const out = [];
  for (const [key, nodes] of by) {
    let sx = 0, sy = 0;
    for (const n of nodes) { const r = Math.hypot(n.x, n.y) || 1; sx += n.x / r; sy += n.y / r; }
    const armDef = (F.arms || []).find(a => a.key === key);
    const mid = armDef && Number.isFinite(armDef.angle) ? armDef.angle : Math.atan2(sy, sx);
    let lo = Infinity, hi = -Infinity, r0 = Infinity, r1 = 0;
    for (const n of nodes) {
      const r = Math.hypot(n.x, n.y);
      const d = Math.atan2(Math.sin(Math.atan2(n.y, n.x) - mid), Math.cos(Math.atan2(n.y, n.x) - mid));
      // with C's slice known, the angle is checked on node CENTRES (a circle pad near the hub would swallow the neighbours)
      const w = armDef && Number.isFinite(armDef.half) ? 0.02 : r > pad ? Math.asin(Math.min(1, pad / r)) : Math.PI;
      lo = Math.min(lo, d - w); hi = Math.max(hi, d + w);
      r0 = Math.min(r0, r - pad); r1 = Math.max(r1, r + pad);
    }
    // C's own slice (arm.angle ± arm.half, play-test 2) is the base; it only grows where a node would poke out of it
    const arm = (F.arms || []).find(a => a.key === key);
    if (arm && Number.isFinite(arm.angle)) {
      const half = Number.isFinite(arm.half) ? arm.half : Math.PI / 8;
      const off = Math.atan2(Math.sin(arm.angle - mid), Math.cos(arm.angle - mid));
      lo = Math.min(lo, off - half); hi = Math.max(hi, off + half); r0 = 0;
    }
    out.push({ key, mid, a0: mid + Math.max(-Math.PI, lo), a1: mid + Math.min(Math.PI, hi), r0: Math.max(0, r0), r1 });
  }
  return out;
}
/** Is the point (x, y) inside a sector from armSectors? */
export function inSector(s, x, y) {
  const r = Math.hypot(x, y);
  if (r < s.r0 - 1e-9 || r > s.r1 + 1e-9) return false;
  const span = s.a1 - s.a0;
  if (span >= Math.PI * 2 - 1e-9) return true;
  const d = ((Math.atan2(y, x) - s.a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return d <= span + 1e-9;
}

// ---- play-test 2 Q23: search the forest -------------------------------------------------------------------------
/** Node ids whose name / kind / arm / text holds every word typed (case-insensitive). textOf(node) adds the card text. */
export function searchForest(F, query, textOf = null) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const armName = new Map((F.arms || []).map(a => [a.key, a.name || a.key]));
  const hits = [];
  for (const n of F.nodes) {
    const hay = `${n.name || ''} ${n.id} ${n.kind || ''} ${armName.get(n.arm) || ''} ${textOf ? textOf(n) || '' : ''}`.toLowerCase();
    if (words.every(w => hay.includes(w))) hits.push(n.id);
  }
  return hits;
}
