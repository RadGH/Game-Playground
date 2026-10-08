// Thousandvale — WHO GETS A TITLE OVER THEIR NAME (stream E, owner feedback 8 W27, report #48):
//   "Titles appear over some NPCs' names like their profession. But it also appears for random NPCs like 'woodcutter'
//    who doesn't actually provide any services. … Only show titles for NPCs the player interacts with, intentionally
//    placed for the player to find them. They should not be used for random NPC fillers."
//
// ONE rule, used by every content tool that writes an NPC record (`titled: true | false` on the record) and written
// out as data for bodies the server spawns from code (data/names/titles.json `titled`). Pure; no file access.
//
// An NPC is TITLED when the player can get something from it:
//   - it gives, takes or is part of a quest (it has a quest NPC id, or gives jobs: JOB_ROLES);
//   - it keeps a shop or sells a service (a shops.json kind, a class trainer, a carter, an angler);
//   - it is a traveller that offers something (a pedlar's pack, a delivery, a story and a tip), or a road-event
//     NPC (it IS a quest).
// Everyone else is filler — townsfolk, farm hands, woodcutters, shepherds, pilgrims on the road, guards — and shows
// only a name.

/** Roles that give radiant jobs (js/sim/quests.js JOB_ROLES; a test keeps the two lists the same). */
export const JOB_ROLES = Object.freeze(['elder', 'sergeant', 'captain', 'quartermaster', 'tollkeeper', 'broker', 'innkeeper', 'angler', 'smith', 'apothecary', 'tailor', 'bowyer', 'prospector']);      // the last five: round 8 W9 (P-core) — profession jobs
/** Roles that ARE a service wherever they stand. */
export const SERVICE_ROLES = Object.freeze(['trainer', 'carter', 'angler', 'stablemaster', 'reeve', 'castellan']);

/**
 * @param rec   { role?, npc? | id? (a quest NPC id), shop?, quests? (number it gives/takes), trains?, offers?, curious?, type? }
 * @param ctx   { shopRoles: Set of roles that keep a shops.json kind, questNpcs: Set of ids that give / take / are talked to }
 */
export function titledOf(rec, ctx = {}) {
  if (!rec) return false;
  if (rec.type === 'folk' || rec.type === 'guard' || rec.filler) return false;
  const id = rec.npc || rec.questNpc || (rec.type === 'npc' ? rec.id : null);
  if (id && (!ctx.questNpcs || ctx.questNpcs.has(id))) return true;
  if (rec.shop || rec.trains || rec.offers || rec.curious || rec.cart || rec.angler) return true;
  if (rec.quests > 0) return true;
  const role = rec.role;
  if (!role) return false;
  if (JOB_ROLES.includes(role) || SERVICE_ROLES.includes(role)) return true;
  return !!(ctx.shopRoles && ctx.shopRoles.has(role));
}
