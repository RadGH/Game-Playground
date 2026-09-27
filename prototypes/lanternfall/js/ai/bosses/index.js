// Boss scripts, one file each. Each file exports `boss` (a definition; see ../bosskit.js for the hooks), or null
// while it is not written (a null boss falls back to Mother Tallow's script, renamed and scaled: a stand-in).
import * as gnaw from './gnaw.js';
import * as sluicemaw from './sluicemaw.js';
import * as widow from './widow.js';
import * as bellfather from './bellfather.js';
import * as ossery from './ossery.js';
import * as sewerKing from './mb_sewer_king.js';
import * as lockmaster from './mb_lockmaster.js';
import * as matriarch from './mb_lampeater_mother.js';
export const REGISTRY = {};
for (const [id, m] of [['boss_gnaw', gnaw], ['boss_sluicemaw', sluicemaw], ['boss_widow', widow], ['boss_bellfather', bellfather], ['boss_ossery', ossery],
  ['mb_sewer_king', sewerKing], ['mb_lockmaster', lockmaster], ['mb_lampeater_mother', matriarch]]) if (m.boss) REGISTRY[id] = m.boss;
