// NEW and UPDATED badges (round 12, owner 2026-10-24: "Mark new and recently updated games as such for 24 hours after
// being updated, or another time scale relative to play time. Similar to the new Top rated badge").
//
// One table: when each game arrived or last changed in a way players would notice. A badge shows while EITHER
//   - it is less than RULE.hours old (24 h by the clock), OR
//   - it has been played fewer than RULE.plays times since (counted by the server from the insights log), as long as
//     it is under RULE.maxDays old — so a game released while nobody is playing still gets its turn in the spotlight.
// The server works out the badges (server/main.mjs `freshCache`, every 10 minutes) and rooms send them with each vote,
// the Custom-mode list and the lobby's minigame picker. With no play counts (tests, a dev server without an insights
// log), only the clock rule applies.
export const RULE = Object.freeze({ hours: 24, plays: 8, maxDays: 7 });

/** id -> { added?: ISO time, updated?: ISO time, what?: one line shown in the tooltip for an update } */
export const FRESH = Object.freeze({
  // round 11 + 12 (published 2026-10-24T18:19:51Z)
  'hoop-frenzy': { added: '2026-10-24T18:19:51Z' },
  'letter-shot': { added: '2026-10-24T18:19:51Z' },
  'court-clash': { added: '2026-10-24T18:19:51Z' },
  'balloon-darts': { added: '2026-10-24T18:19:51Z' },
  'photo-booth': { added: '2026-10-24T18:19:51Z' },
  'duck-derby': { added: '2026-10-24T18:19:51Z' },
  'water-balloon-ambush': { added: '2026-10-24T18:19:51Z' },
  'sketchy-copy': { added: '2026-10-24T18:19:51Z' },
  'bumper-boats': { added: '2026-10-24T18:19:51Z' },
  'downhill-derby': { added: '2026-10-24T18:19:51Z' },
  'carousel-recall': { added: '2026-10-24T18:19:51Z' },
  'pie-toss': { added: '2026-10-24T18:19:51Z' },
  'ring-toss': { added: '2026-10-24T18:19:51Z' },
  'pizza-chef': { added: '2026-10-24T18:19:51Z' },
  'wagon-trail': { added: '2026-10-24T18:19:51Z' },
  'hide-and-seek': { added: '2026-10-24T18:19:51Z' },
  'jousting': { added: '2026-10-24T18:19:51Z' },
  'floor-is-lava': { added: '2026-10-24T18:19:51Z' },
  'dirt-dash': { added: '2026-10-24T18:19:51Z' },
  'wizard-duel': { added: '2026-10-24T18:19:51Z' },
  'tower-pull': { added: '2026-10-24T18:19:51Z' },
  'castle-archers': { added: '2026-10-24T18:19:51Z' },
  'fair-darts': { added: '2026-10-24T18:19:51Z' },
  'flood-rush': { added: '2026-10-24T18:19:51Z' },
  'crane-claw': { added: '2026-10-24T18:19:51Z' },
  'path-trace': { added: '2026-10-24T18:19:51Z' },
  'cups-and-ball': { added: '2026-10-24T18:19:51Z' },
  'monster-rampage': { added: '2026-10-24T18:19:51Z' },
  'zombie-survival': { added: '2026-10-24T18:19:51Z' },
  'broomstick-bumpers': { added: '2026-10-24T18:19:51Z' },
  'coffin-cart-rally': { added: '2026-10-24T18:19:51Z' },
  'witchs-sweep': { added: '2026-10-24T18:19:51Z' },
  'pumpkin-fling': { added: '2026-10-24T18:19:51Z' },
  'monster-line-up': { added: '2026-10-24T18:19:51Z' },
  'monster-makeover': { added: '2026-10-24T18:19:51Z' },
  'slime-slingers': { added: '2026-10-24T18:19:51Z' },
  'patchwork-pal': { added: '2026-10-24T18:19:51Z' },
  'cauldron-bobbing': { added: '2026-10-24T18:19:51Z' },
  'shifty-portraits': { added: '2026-10-24T18:19:51Z' },
  'prize-shelf': { added: '2026-10-24T18:19:51Z' },
  'pair-panic': { added: '2026-10-24T18:19:51Z' },
  'order-up': { added: '2026-10-24T18:19:51Z' },
  'odd-one-out': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "The odd picture is always easy to see on a phone" },
  'kitchen-catastrophe': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "Tidier orders and labels" },
  'long-drive': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "A real Halloween look" },
  'pin-the-tail': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "14 pictures to pin and new scenes" },
  'haunted-hole': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "See the whole course between holes" },
  'putt-party': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "See the whole course between holes" },
  'defuse-together': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "Rebuilt: read the clue, cut the wire" },
  'storm-shelter': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "No vote: just play one card" },
  'portal-routing': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "See where the marble will go; 10 faster stages" },
  'tile-flip-race': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "Tap any tile as your target" },
  'laser-limbo': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "One DODGE button" },
  'mole-mallet': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "Aim help: see which mole you will hit" },
  'fizzpop-pass': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "Clearer passing and a fizz meter" },
  'pillow-fight': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "Only a bop knocks you off" },
  'golem-smash': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "Rock critters crumble in one hit" },
  'bumper-bash': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "5 rinks and a full 70 seconds" },
  'snowball-showdown': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "4 rinks with snow forts" },
  'wobblewheel-rally': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "3 new tracks" },
  'bat-swarm': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "New bat formations" },
  'ghost-tag': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "New layouts" },
  'fling-ring': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "4 new decks" },
  'ring-a-ding-rumble': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "5 boxing halls" },
  'rope-rumble': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "5 grounds and PERFECT streaks" },
  'memory-heist': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "3 vault themes and a new question" },
  'size-up': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "240 things to compare" },
  'apple-bobbing': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "New apple motions and night settings" },
  'costume-catwalk': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "55 more pieces and 16 more themes" },
  'pumpkin-carve-off': { added: '2026-10-01T00:00:00Z', updated: '2026-10-24T18:19:51Z', what: "30 more prompts" },
});

/**
 * -> { id: 'new' | 'updated' } for right now. `playsSince(id, iso)` -> how many times the game was played since that
 * moment (null = unknown: only the clock rule).
 */
export function freshBadges(now = Date.now(), playsSince = () => null, table = FRESH) {
  const out = {};
  for (const [id, f] of Object.entries(table)) {
    const kind = f.updated && (!f.added || f.updated > f.added) ? 'updated' : f.added ? 'new' : null;
    if (!kind) continue;
    const at = Date.parse(kind === 'new' ? f.added : f.updated);
    if (!Number.isFinite(at) || at > now) continue;
    const age = now - at, n = playsSince(id, new Date(at).toISOString());
    if (age < RULE.hours * 3600e3 || (n != null && n < RULE.plays && age < RULE.maxDays * 864e5)) out[id] = kind;
  }
  return out;
}
