#!/usr/bin/env node
// Round 11 (World stream): fill the EMPTY step marks of a province's marks file (data/quests/marks/<province>.json) from
// what the server itself works out for that step (js/sim/quests.js stepAt over the live layout: a use step's set piece, a
// talk step's NPC). Used after quest steps are re-pointed by hand (round 11 moved 21 class quests' steps next to each
// other — #31). Kill / collect steps are tools/content-hunts.mjs's; run this AFTER it. Safe to run more than once: a mark
// that is already there is never changed.
//   node tools/fill-quest-marks.mjs [--province=<id>]
//   node tools/fill-quest-marks.mjs --refresh     ALSO re-point a use / talk step whose mark no longer stands where the server
//                                                 puts that step (play-test 12, #81: the regenerated Torbor Downs moved the set
//                                                 pieces bound to B's farms, mills and stones, and their marks stayed behind)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadLayouts } from '../server/load.mjs';
import { createQuestBook } from '../js/sim/quests.js';
import { provinceArg } from './content-lib.mjs';

const ROOT = new URL('../', import.meta.url);
const PROV = provinceArg(process.argv);
const mf = new URL(`data/quests/marks/${PROV}.json`, ROOT);
const marks = JSON.parse(readFileSync(mf, 'utf8'));
const q = console.log; console.log = () => {};
const L = (await loadLayouts([PROV])).layouts[0];
console.log = q;
const book = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: null, rng: () => 0.3 });
const REFRESH = process.argv.includes('--refresh');
let filled = 0, left = 0, moved = 0;
for (const [id, m] of Object.entries(marks.quests || {})) {
  const d = book.defs.get(id); if (!d || !Array.isArray(m.steps)) continue;
  if (m.steps.length !== d.steps.length) m.steps = d.steps.map((_, i) => m.steps[i] ?? null);
  d.steps.forEach((st, i) => {
    if (m.steps[i] && REFRESH && (st.kind === 'use' || st.kind === 'talk') && st.at && Number.isFinite(st.at.x) && Math.hypot(st.at.x - m.steps[i].x, st.at.z - m.steps[i].z) > 5) {
      m.steps[i] = { zone: L.zoneOf(st.at.x, st.at.z), x: Math.round(st.at.x), z: Math.round(st.at.z), r: Math.round(st.at.r || m.steps[i].r || 10) }; moved++; return;
    }
    if (m.steps[i]) return;
    if (st.at && Number.isFinite(st.at.x)) { m.steps[i] = { zone: L.zoneOf(st.at.x, st.at.z), x: Math.round(st.at.x), z: Math.round(st.at.z), r: Math.round(st.at.r || 10) }; filled++; }
    else left++;
  });
}
writeFileSync(mf, JSON.stringify(marks, null, 1) + '\n');
console.log(`${PROV}: ${filled} step marks filled, ${left} still empty${REFRESH ? `, ${moved} re-pointed` : ''}`);
