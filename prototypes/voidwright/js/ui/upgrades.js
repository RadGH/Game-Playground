// Ship upgrades (owner ruling E10, 2026-11-12): one screen that answers "what should I do next to grow my
// ship?" — the Ship rating, the next hull class with both ways to pay, and the ship's weakest spots, each
// with where to get the fix: buy it, craft it from ore, or take it off a wreck.

import { panel, el, btn, fmt } from './dom.js';
import { CLASSES } from '../data/hulls.js';
import { MATERIALS } from '../data/types.js';
import { BLOCKS } from '../data/blocks.js';
import { growOptions, growCost, rating } from '../sim/hullgrow.js';
import { recipe } from '../sim/craft.js';
import { warpCore, WARP_CORES } from '../sim/galaxy.js';

const ways = (...w) => el('div', { class: 'up-ways' }, ...w.map(([k, t]) => el('span', { class: 'up-way ' + k }, el('b', {}, { buy: 'Buy', craft: 'Craft', loot: 'Loot', build: 'Build', yard: 'Shipyard' }[k]), ` ${t}`)));
const oreText = mats => Object.entries(mats).map(([m, n]) => `${n} ${MATERIALS[m]?.name || m}`).join(', ');

export function openUpgrades(app) {
  const G = app.G; const P = app.P; if (!P) return;
  const wasMode = app.mode; if (app.mode === 'fly') app.mode = 'paused';
  const p = panel('Ship upgrades', () => { if (app.mode === 'paused') app.mode = wasMode === 'paused' ? 'fly' : wasMode; });
  const st = P.stats; const C = CLASSES[G.ship.cls];
  const B = p.body;
  B.append(el('div', { class: 'up-hero' }, el('div', {}, el('div', { class: 'hint' }, 'Ship rating'), el('div', { class: 'up-rating' }, fmt(rating(P)))),
    el('div', { class: 'hint' }, `${G.ship.name} · ${C.name} · ${st.blocks} blocks. The rating rises with damage per second, hull, shields and speed.`)));
  // 1. the next hull
  const next = growOptions(G.ship.cls);
  B.append(el('h3', { class: 'st-h' }, 'Next hull'));
  if (!next.length) B.append(el('p', { class: 'good' }, 'You fly the biggest hull there is.'));
  for (const to of next) {
    const N = CLASSES[to]; const cost = growCost(to);
    B.append(el('div', { class: 'card' }, el('b', {}, `${N.name}: ${N.grid}×${N.grid} build area, parts up to ${N.maxBlock}×${N.maxBlock}`),
      ways(['yard', `Grow hull at ${N.tier <= 2 ? 'any shipyard' : `a shipyard at danger ${N.tier - 1}+`} for ${fmt(cost.cr)} cr`], ['craft', `…or pay ${oreText(cost.mats)} + ${fmt(cost.fee)} cr`], ['buy', 'or buy a ready-made ship there'])));
  }
  // 2. weak spots, worst first
  const tips = [];
  const fix = (sev, title, why, ...w) => tips.push({ sev, el: el('div', { class: 'card' }, el('b', {}, title), el('div', { class: 'hint' }, why), ways(...w)) });
  const rc = id => { const r = recipe(id); return r ? oreText(r.mats) : ''; };
  if (st.cpu >= st.cpuCap - 1) fix(3, 'More CPU', `CPU ${st.cpu} of ${st.cpuCap} used — weapons and tools need it.`, ['build', `Logic racks in Build mode (Computing): ${oreText(BLOCKS.cpu_rack.cost.mats)} each`], ['craft', `CPU node: ${rc('cpu')}`], ['buy', 'Computing shelf at outfitters']);
  if (!st.powerOk) fix(4, 'More power', `Using ${Math.round(st.powerUse)} power but making ${Math.round(st.power)} — everything runs slower.`, ['craft', `Fuel cell: ${rc('battery')}`], ['buy', 'Power shelf at outfitters'], ['loot', 'Reactors drop from bigger ships']);
  if (P.crew < st.crewNeed) fix(3, 'More crew', `${P.crew} crew of ${st.crewNeed} needed — parts run below full strength.`, ['buy', 'Hire at a crew hall'], ['loot', 'Escape pods from human ships'], ['build', st.crewCap < st.crewNeed ? 'Crew quarters or a Hab module for more room' : 'You have room for them']);
  if (st.cargo < 120) fix(1, 'More cargo', `Your hold takes ${fmt(st.cargo)} units.`, ['build', `Cargo bays in Build mode: ${oreText(BLOCKS.cargo.cost.mats)} each — mostly rock`], ['craft', `Cargo pod: ${rc('cargo_pod')}`]);
  if (!st.shieldMax) fix(3, 'A shield', 'No shield: every hit lands on your blocks.', ['craft', `Bubble shield: ${rc('shield_bubble')}`], ['buy', 'Shields shelf at outfitters'], ['loot', 'Shields drop from shielded ships']);
  if ((st.autoSlots || 0) <= (st.autoUsed || 0) && P.turrets.some(t => t.wantsAuto && !t.autoOn)) fix(2, 'More automatic weapons', 'Some guns are set to Auto but have no targeting slot.', ['craft', `Targeting computer: ${rc('targeting')}`], ['buy', 'Computing shelf']);
  if (!st.scanRange) fix(1, 'A scanner', 'Scan (V) only reaches 1.5 km from your bridge.', ['craft', `Scanner: ${rc('scanner')}`], ['buy', 'Utility shelf']);
  if (!st.droneCap) fix(1, 'Drones', 'No drone port: drones fly ahead of you and fight, mine or repair.', ['craft', `Drone port: ${rc('drone_bay')}`], ['buy', 'Drone ports shelf']);
  if (!st.fab) fix(0, 'Craft anywhere', 'A Fabricator lets you craft from ore out in space.', ['craft', `Fabricator: ${rc('fabricator')}`]);
  const core = warpCore(G); const nc = WARP_CORES[core.cls];
  if (nc) fix(2, nc.name, `Your warp core reaches danger ${core.reach}. Further stars have better loot and shops.`, ['buy', `Outfitter (Warp core shelf): ${fmt(nc.cr)} cr + ${oreText(nc.mats)}`]);
  B.append(el('h3', { class: 'st-h' }, 'Weak spots'));
  if (!tips.length) B.append(el('p', { class: 'good' }, 'Nothing obvious. Look for rarer parts — an orange part beats a blue one of the same kind by a lot.'));
  for (const t of tips.sort((a, b) => b.sev - a.sev)) B.append(t.el);
  B.append(el('div', { class: 'row end' }, btn('Close', () => p.close?.() ?? p.el?.remove?.(), 'primary')));
}
