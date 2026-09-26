// Skill-board names used by the menus brief (canTake / take / skillEffects). The canon file is boards.js (10 §3.6,
// data/boards.json — 10 retired the name skills.json); this module only re-exports it so both names work.
export { boardFor, canTake, take, untake, skillEffects, describeNode, nodeSummary, branchPoints, boardPoints, rankOf } from './boards.js';
