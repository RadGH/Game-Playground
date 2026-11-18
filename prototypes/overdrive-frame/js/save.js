// The pilot's save on this device: credits, materials, best grade per mission, chosen frame, settings.
// (Round 2 adds the hangar's parts and builds; accounts + cloud saves with the conflict kit come with it —
// game-standards §3.) localStorage, wrapped so a blocked store never breaks the game.
const KEY = 'overdrive-frame:save';
export const SAVE_VERSION = 1;

export function freshSave() {
  return { v: SAVE_VERSION, callsign: 'Frame', credits: 0, mats: { scrap: 0, alloy: 0, exotic: 0 }, grades: {}, frame: 'brannoch', builds: {}, loot: [], played: 0, playedAt: null, settings: { night: 'mission' } };
}

export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === SAVE_VERSION) return { ...freshSave(), ...s, mats: { ...freshSave().mats, ...(s.mats || {}) } }; } catch { /* blocked or broken: start fresh */ }
  return freshSave();
}

export function writeSave(s) { s.playedAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }

/** Fold a mission result into the save. Pay is the full amount for every player (owner: never split). */
export function applyResult(s, result, missionId, pid = 'p1') {
  const me = result.perPlayer.find(p => p.id === pid) || result.perPlayer[0];
  for (const k of Object.keys(s.mats)) s.mats[k] += me?.mats?.[k] || 0;
  s.loot.push(...(me?.loot || []));
  s.played++;
  if (result.won) {
    s.credits += result.pay;
    const order = ['S', 'A', 'B', 'C', 'D'], old = s.grades[missionId];
    if (!old || order.indexOf(result.grade) < order.indexOf(old)) s.grades[missionId] = result.grade;
  }
  return s;
}
