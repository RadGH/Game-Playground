// What KIND of game each minigame is (round 10, live report #25: "Add tags to maps like memory games and a filtering
// option"). The coarse tags in each game's meta (action / puzzle / social / chance / coop / holiday) group the host's
// minigame list; these finer ones are the filter chips above it, and `golf` is what the Golf mode plays.
// One table so a new game is tagged in one place; tests/tags.test.js fails if a minigame is missing here.
export const KINDS = Object.freeze({
  memory: 'Memory', reaction: 'Quick reactions', aim: 'Aim & timing', race: 'Racing', brawl: 'Brawling', dodge: 'Dodging',
  collect: 'Grab & collect', rhythm: 'Rhythm', create: 'Draw & dress up', words: 'Words & talking', bluff: 'Bluffing',
  guess: 'Guessing', logic: 'Logic', boss: 'Boss fights', golf: 'Golf', fishing: 'Fishing',
});

export const GAME_KINDS = Object.freeze({
  'paint-panic': ['collect'], 'trapdoor-treasury': ['guess'], 'meteor-dash': ['dodge'], 'snowball-showdown': ['aim', 'brawl'],
  'stack-attack': ['collect'], 'draw-the-disaster': ['create'], 'memory-heist': ['memory'], 'circuit-scramble': ['logic'],
  'laser-limbo': ['dodge', 'reaction'], 'cannonball-catch': ['reaction'], 'balloon-stampede': ['collect'], 'caption-clash': ['words'],
  'pattern-impostor': ['logic'], coinstorm: ['guess'], 'boardwalk-brawl': ['brawl'], 'fling-ring': ['brawl'], 'wobblewheel-rally': ['race'],
  'ring-a-ding-rumble': ['brawl'], 'costume-catwalk': ['create'], 'one-button-orchestra': ['rhythm'], 'going-going-gone': ['bluff'],
  'tile-flip-race': ['logic'], 'monster-forecast': ['memory', 'reaction'], 'wobble-tower': ['aim'], 'rope-bridge-panic': ['race'],
  'slippery-delivery': ['race'], 'portal-routing': ['logic'], 'word-relay': ['words'], safecracker: ['logic'], 'treasure-map-bluff': ['bluff'],
  'auction-of-chaos': ['bluff'], 'alibi-assembly': ['words'], 'secret-architect': ['words'], 'two-truths-one-goblin': ['bluff'],
  'dragons-weak-spot': ['boss', 'dodge'], 'kitchen-catastrophe': ['collect'], 'castle-defense': ['aim'], 'defuse-together': ['words', 'logic'],
  'ghost-photographer': ['aim'], 'storm-shelter': ['logic'], 'jellybean-jar': ['guess'], 'quick-draw': ['reaction'], 'pin-the-tail': ['memory', 'aim'],
  'size-up': ['reaction', 'guess'], 'tiptoe-tiger': ['reaction'], 'hay-bale-scramble': ['reaction'], 'fizzpop-pass': ['dodge'],
  'bumper-bash': ['brawl', 'race'], 'sheep-shuffle': ['collect'], 'mole-mallet': ['reaction'], 'rope-rumble': ['rhythm'], 'lantern-leap': ['collect'],
  'trick-or-treat-street': ['collect'], 'ghost-tag': ['dodge'], 'pumpkin-carve-off': ['create'], 'apple-bobbing': ['reaction'], 'monster-mash': ['rhythm'],
  'golem-smash': ['boss'], 'kraken-cove': ['boss', 'dodge'], 'sky-serpent': ['boss', 'aim'], 'goblin-kings-crown': ['brawl'], 'pumpkin-knight': ['boss'],
  'witchs-tower': ['boss', 'dodge'], 'hilltop-hold': ['brawl'], 'thin-ice': ['dodge'], 'pillow-fight': ['brawl'], 'odd-one-out': ['reaction', 'logic'],
  'crow-count': ['memory'], 'higher-or-lower': ['guess'], 'shape-sorter': ['reaction'], 'number-climb': ['logic'], 'potion-mixer': ['memory'],
  'mummy-wrap': ['reaction'], 'firefly-catch': ['collect'], 'spotlight-dance': ['dodge'], 'bat-swarm': ['collect'], 'skeleton-stack': ['collect'],
  'putt-party': ['golf', 'aim'], 'haunted-hole': ['golf', 'aim'], 'chip-in': ['golf', 'aim'], 'long-drive': ['golf', 'aim'],
  'reel-rumble': ['fishing'], 'pier-pressure': ['fishing', 'reaction'], 'net-gains': ['fishing'], 'glimmer-ice': ['fishing'],
});

export const kindsOf = id => GAME_KINDS[id] || [];
export const hasKind = (id, k) => kindsOf(id).includes(k);
