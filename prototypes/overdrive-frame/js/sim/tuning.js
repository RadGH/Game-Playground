// Frame Tuning (round 7 — owner: "more skills and talent type of systems that we talked about"; brief: "a talent-tree-
// like system … but mech-themed, not a fantasy tree"; PLAN §0: no pilot implants). Tuning is calibration work on the
// frame: four boards (Fire Control, Drive, Plating, Systems), five rows each. Points come from pilot rank (2 a rank)
// and from story missions flown (1 each). A row opens once the board has (row − 1) × 2 points in it. Rows 3 and 5 are
// a choice of two keystones that change how the frame works; the rest are steady improvements.
// Re-tuning is free at the Tuning rig in the hangar. Effects use chips.js applyFx (the same keys firmware chips use).
// Pure: the co-op server checks a seat's tuning with cleanTuning.
import { applyFx } from './chips.js';

export const BOARDS = [
  { id: 'fire', name: 'Fire Control', colour: '#ff7a3a', blurb: 'Weapons: damage, fire rate, heat, crits' },
  { id: 'drive', name: 'Drive', colour: '#3ff0ff', blurb: 'Movement: speed, boosting, quick boosts, jumps' },
  { id: 'plating', name: 'Plating', colour: '#ffb02e', blurb: 'Armour, resistances, the repair kit' },
  { id: 'systems', name: 'Systems', colour: '#7dff9a', blurb: 'Energy, cooling, firmware, your skill' },
];

/**
 * Nodes. per = the number one rank gives (shown as "+4% / +8% / +12%" across ranks); fx = chips.js applyFx block for
 * ONE rank. pick = keystone group (one node of a group). text uses {v} for the value at the current rank.
 */
export const NODES = [
  // Fire Control
  { id: 'calibrated', board: 'fire', row: 1, max: 3, name: 'Calibrated Barrels', text: 'Every weapon +{v}% damage', per: 4, fx: { mul: { dmgMulAll: 1.04 } } },
  { id: 'cycle', board: 'fire', row: 1, max: 3, name: 'Cycle Timing', text: 'Every weapon fires {v}% faster', per: 4, fx: { weapon: { rate: 1.04 } } },
  { id: 'routing', board: 'fire', row: 2, max: 2, name: 'Heat Routing', text: 'Weapons make {v}% less heat', per: 10, fx: { weapon: { heat: 0.9 } } },
  { id: 'racks', board: 'fire', row: 2, max: 1, name: 'Ordnance Racks', text: '+1 missile in every salvo and +15% blast radius', fx: { weapon: { salvo: 1, splash: 1.15 } } },
  { id: 'frag', board: 'fire', row: 3, max: 1, pick: 'fire3', name: 'Fragmentation', text: 'Every blast throws 4 bomblets (35% damage each)', fx: { wmod: 'cluster' }, key: true },
  { id: 'arcmesh', board: 'fire', row: 3, max: 1, pick: 'fire3', name: 'Arc Mesh', text: '25% of hits from any weapon spark lightning to 2 enemies nearby', fx: { wmod: 'coupler' }, key: true },
  { id: 'crit', board: 'fire', row: 4, max: 3, name: 'Weak-Point Finder', text: '+{v}% critical hit chance', per: 3, fx: { add: { critChance: 0.03 } } },
  { id: 'overkill', board: 'fire', row: 5, max: 1, pick: 'fire5', name: 'Overkill Cascade', text: 'Kills burst for 40% of the killing hit (13 m blast) — chains through swarms', fx: { wmod: 'overkill' }, key: true },
  { id: 'echo', board: 'fire', row: 5, max: 1, pick: 'fire5', name: 'Echo Firing', text: 'Every weapon fires each shot again 0.3 s later at 50% damage', fx: { wmod: 'echo' }, key: true },
  // Drive
  { id: 'servo', board: 'drive', row: 1, max: 3, name: 'Servo Tuning', text: '+{v}% walking and boosting speed', per: 4, fx: { mul: { speedMul: 1.04, boostMul: 1.04 } } },
  { id: 'trim', board: 'drive', row: 1, max: 3, name: 'Booster Trim', text: 'Boosting uses {v}% less energy', per: 8, fx: { mul: { boostCostMul: 0.92 } } },
  { id: 'qbcap', board: 'drive', row: 2, max: 2, name: 'Dash Capacitor', text: 'Quick boost recovers {v}% faster and costs {v}% less', per: 12, fx: { mul: { qbCooldownMul: 0.88, qbCostMul: 0.88 } } },
  { id: 'fins', board: 'drive', row: 2, max: 2, name: 'Lift Fins', text: '+{v}% jump height and hover', per: 15, fx: { mul: { jumpMul: 1.15, hoverMul: 1.15 } } },
  { id: 'afterburner', board: 'drive', row: 3, max: 1, pick: 'drive3', name: 'Afterburner', text: 'Quick boosts leave a trail of fire that burns enemies for 3 s', fx: { rule: { afterburner: 1 } }, key: true },
  { id: 'phase', board: 'drive', row: 3, max: 1, pick: 'drive3', name: 'Phase Dash', text: 'Nothing can hurt you for 0.35 s at the start of each quick boost', fx: { rule: { phase: 0.35 } }, key: true },
  { id: 'momentum', board: 'drive', row: 4, max: 2, name: 'Momentum', text: 'After a quick boost, +{v}% damage for 2 s', per: 10, fx: { rule: { momentum: 0.1 } } },
  { id: 'shockland', board: 'drive', row: 5, max: 1, pick: 'drive5', name: 'Shock Landing', text: 'Landing from a jump shocks enemies within 32 m and knocks them back', fx: { rule: { shockland: 1 } }, key: true },
  { id: 'doubledash', board: 'drive', row: 5, max: 1, pick: 'drive5', name: 'Double Dash', text: 'Quick boost twice in a row before it needs to recover', fx: { rule: { doubledash: 1 } }, key: true },
  // Plating
  { id: 'reinforced', board: 'plating', row: 1, max: 3, name: 'Reinforced Frame', text: '+{v}% armour points', per: 4, fx: { mul: { hp: 1.04 } } },
  { id: 'weave', board: 'plating', row: 1, max: 3, name: 'Resist Weave', text: '+{v}% resistance to every damage type', per: 3, fx: { res: { all: 0.03 } } },
  { id: 'fieldkit', board: 'plating', row: 2, max: 1, name: 'Field Kit', text: '+1 repair kit charge every mission', fx: { rule: { kitCharges: 1 } } },
  { id: 'foam', board: 'plating', row: 2, max: 2, name: 'Patch Foam', text: 'The repair kit restores {v}% more of your armour', per: 5, fx: { rule: { kitHeal: 0.05 } } },
  { id: 'reactive', board: 'plating', row: 3, max: 1, pick: 'plating3', name: 'Reactive Plate', text: 'Blocks one hit completely every 8 s', fx: { rule: { reactive: 8 } }, key: true },
  { id: 'static', board: 'plating', row: 3, max: 1, pick: 'plating3', name: 'Static Shell', text: 'Enemies touching your frame take 120 electric damage a second', fx: { rule: { static: 1 } }, key: true },
  { id: 'laststand', board: 'plating', row: 4, max: 2, name: 'Last Stand', text: 'Below 30% armour you take {v}% less damage', per: 12, fx: { rule: { laststand: 0.12 } } },
  { id: 'nanite', board: 'plating', row: 5, max: 1, pick: 'plating5', name: 'Nanite Weave', text: 'Repairs 1.2% armour a second after 4 s without being hit', fx: { rule: { nanite: 0.012 } }, key: true },
  { id: 'bulwark', board: 'plating', row: 5, max: 1, pick: 'plating5', name: 'Bulwark Patch', text: 'Using the repair kit also halves the damage you take for 4 s', fx: { rule: { kitShield: 4 } }, key: true },
  // Systems
  { id: 'banks', board: 'systems', row: 1, max: 3, name: 'Capacitor Banks', text: '+{v}% energy capacity', per: 5, fx: { mul: { energyCap: 1.05 } } },
  { id: 'loops', board: 'systems', row: 1, max: 3, name: 'Coolant Loops', text: '+{v}% cooling', per: 6, fx: { mul: { coolMul: 1.06 } } },
  { id: 'expansion', board: 'systems', row: 2, max: 2, name: 'Firmware Expansion', text: '+{v} firmware capacity for chips', per: 1, unit: '', fx: { add: { firmware: 1 } } },
  { id: 'relay', board: 'systems', row: 2, max: 2, name: 'Skill Relay', text: 'Your skill recharges {v}% faster', per: 10, fx: { rule: { skillCd: 0.1 } } },
  { id: 'dynamo', board: 'systems', row: 3, max: 1, pick: 'systems3', name: 'Kinetic Dynamo', text: 'Every 100 damage you take refills 3 energy', fx: { rule: { dynamo: 3 } }, key: true },
  { id: 'vent', board: 'systems', row: 3, max: 1, pick: 'systems3', name: 'Thermal Vent', text: 'Overheating blasts fire around you (48 m) and dumps 40% of the heat', fx: { rule: { vent: 1 } }, key: true },
  { id: 'locksuite', board: 'systems', row: 4, max: 2, name: 'Lock Suite', text: '+{v} missile lock targets, locks {w}% faster', per: 1, per2: 10, fx: { add: { lockCount: 1 }, mul: { lockTimeMul: 0.9 } } },
  { id: 'twinmodule', board: 'systems', row: 5, max: 1, pick: 'systems5', name: 'Twin Module', text: 'Your skill holds 2 charges', fx: { rule: { skillCharges: 1 } }, key: true },
  { id: 'amplifier', board: 'systems', row: 5, max: 1, pick: 'systems5', name: 'Skill Amplifier', text: 'Your skill hits 35% harder, lasts 35% longer and reaches 20% further', fx: { rule: { skillPower: 0.35 } }, key: true },
];
export const NODE_BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));

/** Points a pilot has: 2 a rank (rank 1 starts with 2) + 1 a story mission flown. */
export const tuningPoints = (rank, stories = 0) => rank * 2 + stories;
export const pointsSpent = t => Object.entries(t || {}).reduce((s, [id, r]) => s + (NODE_BY_ID[id] ? r : 0), 0);
export const boardSpent = (t, board) => Object.entries(t || {}).reduce((s, [id, r]) => s + (NODE_BY_ID[id]?.board === board ? r : 0), 0);
export const rowNeed = row => (row - 1) * 2;
/** Points in a board's rows below `row` (what opens that row). */
export const pointsBelow = (t, board, row) => Object.entries(t || {}).reduce((s, [id, r]) => s + (NODE_BY_ID[id]?.board === board && NODE_BY_ID[id].row < row ? r : 0), 0);

/** The text of a node at a rank (rank 0 shows rank 1's numbers). */
export function nodeText(n, rank) {
  const r = Math.max(1, rank);
  return n.text.replaceAll('{v}', String(Math.round((n.per || 0) * r * 10) / 10)).replaceAll('{w}', String(Math.round((n.per2 || 0) * r)));
}

/** Can one more rank go in? Returns null, or the reason in plain words. */
export function canRaise(t, id, points) {
  const n = NODE_BY_ID[id]; if (!n) return 'Unknown';
  const have = t?.[id] || 0;
  if (have >= n.max) return 'Fully tuned';
  if (pointsSpent(t) >= points) return 'No points left — rank up or fly story missions';
  if (pointsBelow(t, n.board, n.row) < rowNeed(n.row)) return `Needs ${rowNeed(n.row)} points in the rows above`;
  if (n.pick && NODES.some(o => o.pick === n.pick && o.id !== id && (t?.[o.id] || 0) > 0)) return 'The other keystone on this row is fitted — take it out first';
  return null;
}

/** Taking a rank out must not leave a higher row without its points. Returns null or the reason. */
export function canLower(t, id) {
  const n = NODE_BY_ID[id]; if (!n || !(t?.[id] > 0)) return 'Nothing to take out';
  const after = { ...t, [id]: t[id] - 1 };
  for (const o of NODES) if (o.board === n.board && (after[o.id] || 0) > 0 && o.row > 1) {
    if (pointsBelow(after, n.board, o.row) < rowNeed(o.row)) return `${o.name} needs it — take that out first`;
  }
  return null;
}

/** A tuning map that obeys every rule within `points` (drops anything that doesn't). The co-op server's check. */
export function cleanTuning(t, points) {
  const out = {};
  if (!t || typeof t !== 'object') return out;
  const ids = NODES.filter(n => Number.isInteger(t[n.id]) && t[n.id] > 0).sort((a, b) => a.row - b.row).map(n => n.id);
  for (const id of ids) for (let i = 0; i < Math.min(t[id], NODE_BY_ID[id].max); i++) if (!canRaise(out, id, points)) out[id] = (out[id] || 0) + 1;
  return out;
}

/** Fold a build's tuning into its stats (before chips, so Firmware Expansion makes room for them). */
export function applyTuning(st, t) {
  for (const [id, r] of Object.entries(t || {})) { const n = NODE_BY_ID[id]; if (n && r > 0) applyFx(st, n.fx, Math.min(r, n.max)); }
  return st;
}
