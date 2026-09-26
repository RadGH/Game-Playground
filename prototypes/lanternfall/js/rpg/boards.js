// Skill boards (docs/04 §7): 12 nodes per class in three branches of four, the needs/cost/one-capstone rules,
// the summed effects, and node text generated from the node's own numbers (02 §16.1 — the text cannot lie).
// Pure. Data: data/boards.json. hero.skills = { nodeId: rank }, hero.unspent.skill = banked points.
import { fmt, pct, sign, secs } from '../../../../shared/format.js';

/** The board for a class id (or null). boards = data.boards (the file) or its .boards array. */
export function boardFor(boards, classId) {
  const list = Array.isArray(boards) ? boards : boards?.boards || [];
  return list.find(b => b.class === classId) || null;
}
export const rankOf = (hero, id) => hero.skills?.[id] || 0;
/** Points spent in one branch (0..2) of a board. */
export function branchPoints(hero, board, branch) {
  let n = 0; for (const node of board.nodes) if (node.branch === branch) n += rankOf(hero, node.id) * node.cost; return n;
}
/** Points spent on the whole board. */
export function boardPoints(hero, board) { return board.nodes.reduce((s, n) => s + rankOf(hero, n.id) * n.cost, 0); }

/**
 * Why a node's next rank cannot be taken right now, or null when it can.
 * opts.open = false while the board is still closed (Act 1); opts.points overrides hero.unspent.skill.
 */
export function canTake(hero, board, nodeId, opts = {}) {
  const node = board?.nodes.find(n => n.id === nodeId); if (!node) return `Unknown skill ${nodeId}.`;
  if (opts.open === false) return 'The board opens in Act 2.';
  const r = rankOf(hero, node.id);
  if (r >= node.ranks) return `${node.name} is at its highest rank.`;
  const pts = opts.points ?? hero.unspent?.skill ?? 0;
  if (pts < node.cost) return `Needs ${node.cost} skill point${node.cost === 1 ? '' : 's'} (you have ${pts}).`;
  if (node.tier > 1) {
    const needTier = node.tier === 4 ? 2 : node.tier - 1;
    const prev = board.nodes.find(n => n.branch === node.branch && n.tier === needTier);
    if (prev && rankOf(hero, prev.id) < 1) return `Needs a rank of ${prev.name} first.`;
  }
  if (node.tier === 4) {
    const spent = branchPoints(hero, board, node.branch), need = 5;
    if (spent < need) return `Needs ${need} points spent in ${board.branches[node.branch]} (${spent} so far).`;
    const other = board.nodes.find(n => n.tier === 4 && n.id !== node.id && rankOf(hero, n.id) > 0);
    if (other) return `You carry ${other.name}. Respec at the Ferry to change it.`;
  }
  return null;
}
/** Take one rank. Returns null on success or the refusal reason (hero untouched). */
export function take(hero, board, nodeId, opts = {}) {
  const why = canTake(hero, board, nodeId, opts); if (why) return why;
  const node = board.nodes.find(n => n.id === nodeId);
  hero.skills ||= {}; hero.skills[nodeId] = rankOf(hero, nodeId) + 1;
  hero.unspent ||= { attr: 0, skill: 0 }; hero.unspent.skill -= node.cost;
  return null;
}
/** Give back one rank (used by the screen's Undo before it closes; paid respec is 08's). */
export function untake(hero, board, nodeId) {
  const node = board.nodes.find(n => n.id === nodeId); const r = rankOf(hero, nodeId); if (!node || r <= 0) return false;
  if (r === 1) delete hero.skills[nodeId]; else hero.skills[nodeId] = r - 1;
  hero.unspent.skill += node.cost; return true;
}

/**
 * Everything the board does for this hero, summed (04 §7.3 effect kinds):
 * { stats: {stat: total}, flameMult: {flame: +x}, shapeMult: {shape: +x}, status: {id: {...}}, ability: {id: {...}},
 *   moves: {move: {...}}, rules: {ruleId: params}, unlocks: [id] }
 */
export function skillEffects(hero, board) {
  const out = { stats: {}, flameMult: {}, shapeMult: {}, status: {}, ability: {}, moves: {}, rules: {}, unlocks: [] };
  if (!board) return out;
  for (const node of board.nodes) {
    const r = rankOf(hero, node.id); if (!r) continue;
    const e = node.effect, v = (e.value ?? 0) * r;
    switch (e.kind) {
      case 'stat': if ('set' in e) out.stats[e.stat] = e.set; else out.stats[e.stat] = (out.stats[e.stat] || 0) + v; break;
      case 'flameMult': for (const f of e.flames) out.flameMult[f] = (out.flameMult[f] || 0) + v; break;
      case 'shapeMult': out.shapeMult[e.shape] = (out.shapeMult[e.shape] || 0) + v; break;
      case 'status': case 'ability': case 'move': {
        const key = e.kind === 'status' ? e.status : e.kind === 'ability' ? e.ability : e.move;
        const bag = e.kind === 'status' ? out.status : e.kind === 'ability' ? out.ability : out.moves;
        const o = bag[key] ||= {};
        for (const [k, val] of Object.entries(e)) if (!['kind', 'status', 'ability', 'move', 'value', 'unit', 'stat', 'rule'].includes(k)) o[k] = val;
        if (e.stat) o[e.stat] = (o[e.stat] || 0) + v;
        if (e.rule) out.rules[e.rule] = { ...e, rank: r };
        break;
      }
      case 'rule': out.rules[e.rule] = { ...e, rank: r }; break;
      case 'unlock': out.unlocks.push(e.unlock); break;
    }
  }
  return out;
}

function fmtUnit(v, unit) {
  switch (unit) {
    case 'pct': return sign(v * 100, { decimals: 2 }) + '%';
    case 'x': return sign(v) + '×';
    case 's': return sign(v) + 's';
    default: return sign(v);
  }
}
function fmtToken(v, how) {
  switch (how) {
    case 'pct': return pct(v, 2);
    case 'signpct': return sign(v * 100, { decimals: 2 }) + '%';
    case 'sign': return sign(v);
    case 's': return secs(v).replace(/\.0s$/, 's');
    case 'x': return fmt(v) + '×';
    default: return fmt(v);
  }
}
/** The node's line at a given rank (rank 0 reads as rank 1 — "what the first rank does"). */
export function describeNode(node, rank = 1) {
  const e = node.effect, r = Math.max(1, rank);
  return node.text.replace(/\{(\w+)(?::(\w+))?\}/g, (_, key, how) => {
    if (key === 'value') return fmtUnit((e.value ?? 0) * r, e.unit);
    const v = e[key]; if (typeof v !== 'number') return String(v ?? '');
    return fmtToken(v, how);
  });
}
/** Side-panel text: current rank line, next rank line (null at max), requirement. */
export function nodeSummary(hero, board, node, opts = {}) {
  const r = rankOf(hero, node.id);
  return {
    rank: r, ranks: node.ranks, now: r ? describeNode(node, r) : null, next: r < node.ranks ? describeNode(node, r + 1) : null,
    need: node.tier === 1 ? null : node.tier === 4 ? `a rank of ${board.nodes.find(n => n.branch === node.branch && n.tier === 2)?.name} and 5 points in ${board.branches[node.branch]}` : `a rank of ${board.nodes.find(n => n.branch === node.branch && n.tier === node.tier - 1)?.name}`,
    refusal: canTake(hero, board, node.id, opts), cost: node.cost,
  };
}
