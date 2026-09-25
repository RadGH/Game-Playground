// Farhold — what to do now that you are standing on the marker.
//
//   "quest markers lead nowhere. There should be a quest helper that activates when you get near
//    and says what to do — kill the enemies here, find the chest, talk to this NPC."
//
// The markers were never wrong: a `clear` job points at the dungeon it means, a `visit` job at the
// settlement. The gap is that arriving told you nothing, so a marker with nothing under it and a
// marker you had simply not understood looked identical.
//
// One sentence per quest kind, written in the imperative, and only while you are inside the ring.
// Pure: no DOM and no Three.js, so `node --test` can read every line it will ever say.
//
//   import { helperFor, helpersNear } from './questhelp.js';
//   const line = helperFor(quest, { x, z, ... });   // null when there is nothing to say

/** How close you have to be before a job starts explaining itself, in metres. */
export const REACH = 90;

/**
 * Where a job wants you, or null if it does not care where you are.
 *
 * A `hunt` genuinely has no place — the creature is wherever the creature is — and that is worth
 * saying out loud rather than sending the player to a random field.
 */
export function placeOf(quest) {
  if (!quest) return null;
  if (quest.place) return quest.place;
  if (quest.site) return { x: quest.site.x, z: quest.site.z, name: quest.site.name };
  return null;
}

/** How far you are from where a job wants you, or Infinity when it has no opinion. */
export function distanceTo(quest, at = {}) {
  const place = placeOf(quest);
  if (!place || at.x == null) return Infinity;
  return Math.hypot(place.x - at.x, place.z - at.z);
}

/**
 * The line itself.
 *
 * `left` is what is still owed — the count minus the progress — so the sentence is never "kill 6"
 * when you have killed five of them. Every branch names something the player can actually look for:
 * a creature, a door, a person, a thing in the bag.
 */
export function helperFor(quest, at = {}, opts = {}) {
  if (!quest || quest.done || quest.turnedIn) return null;
  const reach = opts.reach ?? REACH;
  const place = placeOf(quest);
  const away = distanceTo(quest, at);
  // a job with a place only talks once you are AT the place; one without talks whenever it is tracked
  if (place && away > reach) return null;

  const left = Math.max(0, (quest.count ?? 1) - (quest.progress ?? 0));
  const here = place?.name || 'here';

  switch (quest.kind) {
    case 'clear':
      return left > 0
        ? { kind: 'clear', text: `${here}: ${left} more ${quest.targetName || 'of them'} to put out of it. The door is the way in.`, away }
        : { kind: 'clear', text: `${here} is cleared. ${quest.giverName} is waiting to hear it.`, away };
    case 'hunt':
      return left > 0
        ? { kind: 'hunt', text: `${left} more ${quest.targetName || 'of them'}. They are wherever they live — no marker will find them for you.`, away }
        : { kind: 'hunt', text: `That is all of them. Back to ${quest.giverName}.`, away };
    case 'visit':
      return away <= (opts.arriveWithin ?? 25)
        ? { kind: 'visit', text: `You are in ${here}. Find somebody to give the word to.`, away }
        : { kind: 'visit', text: `${here} is just there. Walk in.`, away };
    case 'gather':
      return left > 0
        ? { kind: 'gather', text: `${left} more ${quest.targetName || 'of them'}. Chests, bodies, or a shop — ${quest.giverName} is not proud.`, away }
        : { kind: 'gather', text: `You have what ${quest.giverName} asked for. Take it back.`, away };
    case 'raid':
      return { kind: 'raid', text: `Wave ${(quest.progress ?? 0) + 1} of ${quest.count ?? '?'}. Stand at the wall.`, away };
    /**
     * R17 — THE ONBOARDING LINE, WHICH IS EVERYWHERE AND NOWHERE.
     *
     * It has no `place`, so it talks wherever you are standing — which is right: "press E on a
     * tree" is true in any field. `stepName`/`stepHud` are written onto the quest by
     * js/onboarding.js precisely so this stays pure and never has to read a data file.
     *
     * `away` is Infinity (there is no place), and `helpersNear` sorts on it — so this sentence is
     * the LAST one offered and a real destination you are standing on always wins. That is
     * deliberate: the HUD's objective line is where the step actually lives, and this is only the
     * spoken reminder. Suppressing a "the door is the way in" line for five minutes of tutorial
     * would be the tutorial getting in the way of the game.
     */
    case 'onboard':
      if (!quest.stepName) return null;
      return quest.done
        ? { kind: 'onboard', text: `${quest.title} is done. ${quest.giverName} will settle up — or hand it in from the journal.`, away }
        : { kind: 'onboard', text: `${quest.stepName}${quest.stepHud ? `. ${quest.stepHud}` : ''}.`, away };
    default:
      return left > 0
        ? { kind: quest.kind || 'job', text: `${quest.title}: ${left} to go.`, away }
        : { kind: quest.kind || 'job', text: `${quest.title} is done. Go and say so.`, away };
  }
}

/**
 * Every job that has something to say where you are standing, nearest first.
 *
 * The caller shows ONE of them — a helper that stacks four lines on the screen is a wall of text at
 * exactly the moment the player is trying to look at something.
 */
export function helpersNear(quests = [], at = {}, opts = {}) {
  return quests
    .map(q => ({ quest: q, help: helperFor(q, at, opts) }))
    .filter(r => r.help)
    .sort((a, b) => a.help.away - b.help.away);
}

/**
 * Has the line changed? Used to decide whether to say it again.
 *
 * A helper that repeats itself every frame is noise; one that never repeats is missed. The key is
 * the quest and the sentence, so it speaks again when the sentence itself changes — which is
 * exactly when something happened.
 */
export function helperKey(quest, help) {
  return help ? `${quest.id}:${help.text}` : null;
}
