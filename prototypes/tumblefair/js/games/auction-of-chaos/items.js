// Auction of Chaos — the curios, as data. Every item has a value "on paper" (v, shown), tags (shown), a CLUE (shown —
// the auctioneer's hint) and a hidden TWIST (fx, plus the line shown when it is revealed at the end).
//
// fx kinds (read by appraise() in sim.js):
//   flat n          the item is worth n more (n < 0: less)
//   eat n           eats your n most valuable OTHER items (they become worth 0)
//   drop            you lose your least valuable other item
//   spoil tag       ruins every other item of yours with that tag
//   clash tag       worth 0 if you own any other item with that tag
//   perTag tag n    n more for each other item of yours with that tag
//   alone n         n more if it is the only item you won
//   crowd min n     n more if you won at least `min` items
//   copy            worth as much as your best other item (on paper)
//   chips n         n more per chip you kept at the end
//   broke n         n more if you kept 3 chips or fewer
//   lastLot n       n more if it was the last lot of the auction
//   rivals n        every other bidder's haul changes by n (n < 0 hurts them)
//   gift            its value goes to the bidder with the smallest haul instead of you
// Tags: food, hot, cold, shiny, animal, toy, music, spooky, paper, plant, magic.
export const ITEMS = [
  { id: 'golden-goose', name: 'Golden Goose', icon: '🦢', v: 9, tags: ['animal', 'shiny'], clue: 'Has a terrible appetite.', fx: { k: 'eat', n: 1 }, twist: 'Gobbled up your best other item!' },
  { id: 'sleeping-dragon', name: 'Sleeping Dragon', icon: '🐉', v: 12, tags: ['animal', 'hot'], clue: 'Whatever you do, don\'t wake it.', fx: { k: 'eat', n: 2 }, twist: 'Woke up hungry and ate two of your items!' },
  { id: 'snow-globe', name: 'Snow Globe', icon: '❄️', v: 5, tags: ['cold', 'shiny'], clue: 'Hates the heat.', fx: { k: 'clash', tag: 'hot' }, twist: 'Melted next to something hot!' },
  { id: 'ice-cream-tower', name: 'Ice Cream Tower', icon: '🍦', v: 6, tags: ['food', 'cold'], clue: 'Keep it away from anything warm.', fx: { k: 'clash', tag: 'hot' }, twist: 'A puddle! Something hot melted it.' },
  { id: 'pepper-crown', name: 'Hot Pepper Crown', icon: '🌶️', v: 4, tags: ['hot', 'food'], clue: 'Spicier with friends at the table.', fx: { k: 'perTag', tag: 'food', n: 2 }, twist: '+2 for every other food you own.' },
  { id: 'haunted-teddy', name: 'Haunted Teddy', icon: '🧸', v: 6, tags: ['toy', 'spooky'], clue: 'Whispers about the neighbours.', fx: { k: 'rivals', n: -2 }, twist: 'Haunts every rival: they each lose 2!' },
  { id: 'lucky-penny', name: 'Lucky Penny', icon: '🪙', v: 2, tags: ['shiny'], clue: 'Loves a fat purse.', fx: { k: 'chips', n: 1 }, twist: '+1 for every chip you kept.' },
  { id: 'piggy-bank', name: 'Greedy Piggy Bank', icon: '🐷', v: 2, tags: ['animal'], clue: 'Counts every coin you didn\'t spend.', fx: { k: 'chips', n: 1 }, twist: '+1 for every chip you kept.' },
  { id: 'boomerang-vase', name: 'Boomerang Vase', icon: '🏺', v: 8, tags: [], clue: 'Always comes back… somewhere.', fx: { k: 'gift' }, twist: 'Flew off to the poorest rival!' },
  { id: 'bouquet', name: 'Prize Bouquet', icon: '💐', v: 6, tags: ['plant'], clue: 'A gift for someone special.', fx: { k: 'gift' }, twist: 'It was for the poorest rival all along!' },
  { id: 'love-letter', name: 'Perfumed Love Letter', icon: '💌', v: 5, tags: ['paper'], clue: 'Addressed to somebody else.', fx: { k: 'gift' }, twist: 'Delivered to the poorest rival!' },
  { id: 'lonely-lantern', name: 'Lonely Lantern', icon: '🏮', v: 3, tags: ['hot'], clue: 'Shines brightest on its own.', fx: { k: 'alone', n: 6 }, twist: '+6 when it is your only prize.' },
  { id: 'robot-dog', name: 'Robot Dog', icon: '🐕', v: 5, tags: ['animal', 'toy'], clue: 'A loyal friend for one.', fx: { k: 'alone', n: 5 }, twist: '+5 when it is your only prize.' },
  { id: 'party-poppers', name: 'Party Popper Pile', icon: '🎉', v: 3, tags: ['toy'], clue: 'The more the merrier.', fx: { k: 'crowd', min: 3, n: 6 }, twist: '+6 if you won 3 or more items.' },
  { id: 'trophy-cup', name: 'Collector\'s Cup', icon: '🏆', v: 6, tags: ['shiny'], clue: 'Only a true collector deserves it.', fx: { k: 'crowd', min: 4, n: 8 }, twist: '+8 if you won 4 or more items.' },
  { id: 'copycat-crystal', name: 'Copycat Crystal', icon: '🔮', v: 1, tags: ['shiny', 'magic'], clue: 'Wants to be like your favourite thing.', fx: { k: 'copy' }, twist: 'Copied the worth of your best item!' },
  { id: 'pirate-parrot', name: 'Pirate Parrot', icon: '🦜', v: 4, tags: ['animal'], clue: 'Repeats everything it sees.', fx: { k: 'copy' }, twist: 'Copied the worth of your best item!' },
  { id: 'royal-cake', name: 'Royal Cake', icon: '🎂', v: 7, tags: ['food'], clue: 'Smells a little funny.', fx: { k: 'flat', n: -9 }, twist: 'Rotten! -9.' },
  { id: 'ugly-painting', name: 'Ugly Painting', icon: '🖼️', v: 1, tags: ['paper'], clue: 'Is that a famous signature?', fx: { k: 'flat', n: 9 }, twist: 'A lost masterpiece! +9.' },
  { id: 'cuckoo-clock', name: 'Cuckoo Clock', icon: '🕰️', v: 5, tags: ['music'], clue: 'Very loud. Animals hate it.', fx: { k: 'perTag', tag: 'animal', n: -2 }, twist: '-2 for every animal you own.' },
  { id: 'cat-statue', name: 'Grumpy Cat Statue', icon: '🐈', v: 4, tags: ['animal'], clue: 'Can\'t stand other pets.', fx: { k: 'clash', tag: 'animal' }, twist: 'Fought your other animal: worth nothing!' },
  { id: 'clockwork-mouse', name: 'Clockwork Mouse', icon: '🐭', v: 3, tags: ['toy', 'animal'], clue: 'Nervous around other animals.', fx: { k: 'clash', tag: 'animal' }, twist: 'Chased off by your other animal!' },
  { id: 'gold-sack', name: 'Sack of Gold', icon: '💰', v: 7, tags: ['shiny'], clue: 'Clinks… a little too softly.', fx: { k: 'flat', n: -4 }, twist: 'Chocolate coins! -4.' },
  { id: 'dragon-egg', name: 'Dragon Egg', icon: '🥚', v: 3, tags: ['animal', 'hot'], clue: 'Warm to the touch…', fx: { k: 'flat', n: 7 }, twist: 'It hatched! +7.' },
  { id: 'music-box', name: 'Music Box', icon: '🎵', v: 4, tags: ['music', 'toy'], clue: 'Loves to play along.', fx: { k: 'perTag', tag: 'music', n: 3 }, twist: '+3 for every other music item.' },
  { id: 'banana-throne', name: 'Banana Peel Throne', icon: '🍌', v: 5, tags: ['food', 'plant'], clue: 'A bit slippery.', fx: { k: 'drop' }, twist: 'You slipped and lost your cheapest item!' },
  { id: 'fairy-jar', name: 'Fairy in a Jar', icon: '🧚', v: 4, tags: ['magic'], clue: 'Rewards big spenders.', fx: { k: 'broke', n: 6 }, twist: '+6 if you kept 3 chips or fewer.' },
  { id: 'eight-ball', name: 'Lucky 8-Ball', icon: '🎱', v: 4, tags: ['toy', 'magic'], clue: 'Loves a gambler.', fx: { k: 'broke', n: 5 }, twist: '+5 if you kept 3 chips or fewer.' },
  { id: 'thunder-drum', name: 'Thunder Drum', icon: '🥁', v: 6, tags: ['music'], clue: 'Wakes the whole street.', fx: { k: 'rivals', n: -1 }, twist: 'Deafened every rival: they each lose 1!' },
  { id: 'campfire-kit', name: 'Campfire Kit', icon: '🔥', v: 5, tags: ['hot'], clue: 'Melts anything chilly.', fx: { k: 'spoil', tag: 'cold' }, twist: 'Melted all your cold things!' },
  { id: 'comet-rock', name: 'Comet Rock', icon: '☄️', v: 8, tags: ['hot', 'shiny'], clue: 'Still glowing hot.', fx: { k: 'spoil', tag: 'cold' }, twist: 'Melted all your cold things!' },
  { id: 'lightning-jar', name: 'Lightning in a Jar', icon: '⚡', v: 5, tags: ['hot', 'magic'], clue: 'Zaps anything shiny.', fx: { k: 'spoil', tag: 'shiny' }, twist: 'Zapped all your shiny things!' },
  { id: 'hungry-cactus', name: 'Hungry Cactus', icon: '🌵', v: 4, tags: ['plant'], clue: 'Snacks on bugs. And lunch.', fx: { k: 'spoil', tag: 'food' }, twist: 'Ate all your food!' },
  { id: 'cursed-crown', name: 'Cursed Crown', icon: '👑', v: 10, tags: ['shiny', 'spooky'], clue: 'Heavy is the head that wears it…', fx: { k: 'flat', n: -12 }, twist: 'Cursed! -12.' },
  { id: 'old-map', name: 'Moth-eaten Map', icon: '🗺️', v: 2, tags: ['paper'], clue: 'X marks… something.', fx: { k: 'flat', n: 6 }, twist: 'It led to real treasure! +6.' },
  { id: 'wind-up-robot', name: 'Wind-up Robot', icon: '🤖', v: 5, tags: ['toy'], clue: 'Needs friends to play with.', fx: { k: 'perTag', tag: 'toy', n: 2 }, twist: '+2 for every other toy.' },
  { id: 'rubber-duck', name: 'Champion Rubber Duck', icon: '🦆', v: 3, tags: ['toy', 'animal'], clue: 'Squeaks louder near toys.', fx: { k: 'perTag', tag: 'toy', n: 2 }, twist: '+2 for every other toy.' },
  { id: 'bee-hive', name: 'Busy Bee Hive', icon: '🐝', v: 5, tags: ['animal'], clue: 'Loves flowers.', fx: { k: 'perTag', tag: 'plant', n: 3 }, twist: '+3 for every plant you own.' },
  { id: 'old-boot', name: 'Old Boot', icon: '👢', v: 1, tags: [], clue: 'Something rattles inside.', fx: { k: 'flat', n: 7 }, twist: 'Full of gems! +7.' },
  { id: 'joker-card', name: 'Joker Card', icon: '🃏', v: 4, tags: ['paper'], clue: 'Plays tricks on rivals.', fx: { k: 'rivals', n: -2 }, twist: 'Tricked every rival: they each lose 2!' },
  { id: 'grinning-skull', name: 'Grinning Skull', icon: '💀', v: 4, tags: ['spooky'], clue: 'Bad luck for everyone… else.', fx: { k: 'rivals', n: -2 }, twist: 'Cursed every rival: they each lose 2!' },
  { id: 'ghost-lamp', name: 'Ghost Lamp', icon: '👻', v: 3, tags: ['spooky'], clue: 'Likes spooky company.', fx: { k: 'perTag', tag: 'spooky', n: 3 }, twist: '+3 for every other spooky thing.' },
  { id: 'doom-trumpet', name: 'Trumpet of Doom', icon: '🎺', v: 6, tags: ['music'], clue: 'Can\'t play in a band.', fx: { k: 'clash', tag: 'music' }, twist: 'Ruined the band: worth nothing!' },
  { id: 'fish-trophy', name: 'Fish Trophy', icon: '🐟', v: 6, tags: ['animal'], clue: 'Starting to smell…', fx: { k: 'flat', n: -5 }, twist: 'A real fish! Stinks: -5.' },
  { id: 'royal-teacup', name: 'Royal Teacup', icon: '☕', v: 5, tags: ['shiny'], clue: 'Part of a matching set.', fx: { k: 'perTag', tag: 'shiny', n: 2 }, twist: '+2 for every other shiny thing.' },
  { id: 'magic-acorn', name: 'Magic Acorn', icon: '🌰', v: 1, tags: ['plant', 'magic'], clue: 'Small now…', fx: { k: 'flat', n: 8 }, twist: 'Grew into a money tree! +8.' },
  { id: 'balloon-bundle', name: 'Balloon Bundle', icon: '🎈', v: 4, tags: ['toy'], clue: 'Might float away.', fx: { k: 'flat', n: -4 }, twist: 'Floated away! -4.' },
  { id: 'snowman-kit', name: 'Snowman Kit', icon: '☃️', v: 5, tags: ['cold'], clue: 'Gets lonely in the cold.', fx: { k: 'perTag', tag: 'cold', n: 3 }, twist: '+3 for every other cold thing.' },
  { id: 'lantern-fish', name: 'Lantern Fish', icon: '🐡', v: 4, tags: ['animal', 'cold'], clue: 'Glows in icy water.', fx: { k: 'perTag', tag: 'cold', n: 2 }, twist: '+2 for every other cold thing.' },
  { id: 'midnight-pumpkin', name: 'Midnight Pumpkin', icon: '🎃', v: 7, tags: ['plant', 'spooky'], clue: 'Only lasts until midnight…', fx: { k: 'flat', n: -7 }, twist: 'Midnight struck! Worth nothing.' },
  { id: 'mystery-gift', name: 'Mystery Gift', icon: '🎁', v: 0, tags: [], clue: 'Could be anything!', fx: { k: 'flat', n: 5 }, twist: 'A nice surprise! +5.' },
  { id: 'cheese-wheel', name: 'Giant Cheese Wheel', icon: '🧀', v: 4, tags: ['food'], clue: 'Goes well with other food.', fx: { k: 'perTag', tag: 'food', n: 2 }, twist: '+2 for every other food.' },
  { id: 'crown-jewel', name: 'Crown Jewel', icon: '💎', v: 9, tags: ['shiny'], clue: 'Too good to be true?', fx: { k: 'flat', n: -6 }, twist: 'Just glass! -6.' },
  { id: 'rattly-box', name: 'Rattly Box', icon: '📦', v: 2, tags: [], clue: 'Rattles nicely.', fx: { k: 'flat', n: 6 }, twist: 'Full of marbles! +6.' },
  { id: 'golden-fiddle', name: 'Golden Fiddle', icon: '🎻', v: 7, tags: ['music', 'shiny'], clue: 'Slightly out of tune.', fx: { k: 'flat', n: -4 }, twist: 'Painted wood! -4.' },
  { id: 'wishing-star', name: 'Wishing Star', icon: '🌟', v: 3, tags: ['magic', 'shiny'], clue: 'Saves the best for last.', fx: { k: 'lastLot', n: 6 }, twist: '+6 because it was the last lot!' },
  { id: 'grandfather-key', name: 'Grandfather\'s Key', icon: '🗝️', v: 2, tags: ['shiny'], clue: 'Opens something you already own.', fx: { k: 'crowd', min: 2, n: 5 }, twist: '+5: it opened one of your other prizes!' },
];
