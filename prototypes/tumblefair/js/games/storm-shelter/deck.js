// STORM SHELTER's cards, as data. Meters are always [heat, roof, food] in that order; a change is { heat, roof, food }.
// EVENTS: what the storm throws at the shelter each beat. `hit` happens whatever you choose; then the team votes one
// of `ch` (2-3 choices, each a trade-off). An event's hit totals 2-3 points; a choice nets -1..+1, never free.
// CARDS: each player's private hand. One card is about +2 of meter.
export const METERS = ['heat', 'roof', 'food'];
export const METER_NAMES = { heat: 'Heat', roof: 'Roof', food: 'Food' };

export const EVENTS = [
  { t: 'Hail!', a: '🧊', d: 'Ice the size of plums hammers the roof.', hit: { roof: -2 }, ch: [{ l: 'Hold up a tarp', fx: { roof: 1, heat: -1 } }, { l: 'Hide under the table', fx: { food: -1, heat: 1 } }] },
  { t: 'A leak!', a: '💧', d: 'Drip, drip, drip — right onto the bread.', hit: { roof: -1, food: -1 }, ch: [{ l: 'Bucket under it', fx: { food: 1, heat: -1 } }, { l: 'Climb up and plug it', fx: { roof: 1, food: -1 } }] },
  { t: 'A stray goat!', a: '🐐', d: 'A soggy goat noses in through the door.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Let it in (it is warm)', fx: { heat: 2, food: -2 } }, { l: 'Shoo it out', fx: { heat: -1, food: 1 } }, { l: 'Milk it', fx: { food: 1, roof: -1 } }] },
  { t: 'Thunder!', a: '⚡', d: 'BOOM. Everyone jumps. The soup spills.', hit: { food: -2 }, ch: [{ l: 'Mop it up', fx: { food: 1, heat: -1 } }, { l: 'Sing louder than it', fx: { heat: 1, roof: -1 } }] },
  { t: 'Freezing gust', a: '🌬️', d: 'The wind finds every crack in the walls.', hit: { heat: -2 }, ch: [{ l: 'Stuff the cracks with socks', fx: { heat: 1, food: -1 } }, { l: 'Huddle up', fx: { heat: 1, roof: -1 } }] },
  { t: 'Shingles fly', a: '🏚️', d: 'Three shingles go spinning off into the dark.', hit: { roof: -2, heat: -1 }, ch: [{ l: 'Chase them', fx: { roof: 2, heat: -1, food: -1 } }, { l: 'Let them go', fx: {} }] },
  { t: 'Mice in the pantry', a: '🐭', d: 'Tiny footsteps. Tiny bites. Big problem.', hit: { food: -2 }, ch: [{ l: 'Set out cheese traps', fx: { food: 1, heat: -1 } }, { l: 'Make friends with them', fx: { heat: 1, food: -1 } }] },
  { t: 'Snow drift', a: '❄️', d: 'Snow piles up against the door.', hit: { heat: -1, roof: -1 }, ch: [{ l: 'Dig it out', fx: { roof: 1, food: -1 } }, { l: 'Pack it as a wall', fx: { heat: 1, roof: -1 } }, { l: 'Melt it for water', fx: { food: 1, heat: -1 } }] },
  { t: 'Chimney smoke', a: '💨', d: 'The chimney blows smoke back inside. Cough!', hit: { heat: -2 }, ch: [{ l: 'Open a window', fx: { heat: -1, roof: 1 } }, { l: 'Poke the chimney', fx: { heat: 1, roof: -1 } }] },
  { t: 'A lost peddler', a: '🎒', d: 'A wet peddler knocks, selling odds and ends.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Trade bread for nails', fx: { roof: 2, food: -1 } }, { l: 'Trade nails for jam', fx: { food: 2, roof: -1 } }, { l: 'Send them on', fx: { heat: 1 } }] },
  { t: 'Flooded floor', a: '🌊', d: 'Water seeps in under the door.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Food on the shelves', fx: { food: 1, roof: -1 } }, { l: 'Sweep it out', fx: { heat: -1, food: 1 } }] },
  { t: 'Branch on the roof', a: '🌳', d: 'CRACK. A big branch lands on top.', hit: { roof: -3 }, ch: [{ l: 'Saw it up for firewood', fx: { heat: 2, roof: -1 } }, { l: 'Push it off', fx: { roof: 1, food: -1 } }] },
  { t: 'Kettle boils dry', a: '🫖', d: 'Someone forgot the kettle. Burnt smell.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Fill it again', fx: { heat: 1, food: -1 } }, { l: 'Drink snow tea', fx: { food: 1, heat: -1 } }] },
  { t: 'Owl in the rafters', a: '🦉', d: 'An owl has moved in. It glares.', hit: { roof: -1, food: -1 }, ch: [{ l: 'Let it hunt the mice', fx: { food: 2, roof: -1 } }, { l: 'Chase it out', fx: { roof: 1, heat: -1 } }] },
  { t: 'Rain sideways', a: '🌧️', d: 'The rain is coming in through the WALLS now.', hit: { roof: -2, heat: -1 }, ch: [{ l: 'Hang blankets', fx: { roof: 1, heat: -1 } }, { l: 'Light more candles', fx: { heat: 1, food: -1 } }] },
  { t: 'Soggy firewood', a: '🪵', d: 'The woodpile got soaked.', hit: { heat: -2 }, ch: [{ l: 'Dry it by the stove', fx: { heat: 1, food: -1 } }, { l: 'Burn the old chair', fx: { heat: 2, roof: -1 } }] },
  { t: 'Bread goes stale', a: '🍞', d: 'Rock-hard loaves. Could break a tooth.', hit: { food: -2 }, ch: [{ l: 'Make bread soup', fx: { food: 1, heat: -1 } }, { l: 'Use them as bricks', fx: { roof: 1, food: -1 } }] },
  { t: 'Door blows open', a: '🚪', d: 'BANG! The door swings wide.', hit: { heat: -2, roof: -1 }, ch: [{ l: 'Nail it shut', fx: { heat: 1, roof: -1 } }, { l: 'Lean the table on it', fx: { heat: 1, food: -1 } }] },
  { t: 'Neighbour\'s chickens', a: '🐔', d: 'Six damp chickens want in.', hit: { heat: -1, roof: -1 }, ch: [{ l: 'Take them in', fx: { food: 2, heat: -1 } }, { l: 'Build them a coop', fx: { roof: -1, food: 1 } }] },
  { t: 'Lightning strike!', a: '🌩️', d: 'The weathervane is glowing. Uh oh.', hit: { roof: -2 }, ch: [{ l: 'Cook on the hot vane', fx: { food: 1, roof: -1 } }, { l: 'Pull it down', fx: { roof: 1, heat: -1 } }] },
  { t: 'Frost on everything', a: '🥶', d: 'Even the spoons are frozen to the table.', hit: { heat: -2, food: -1 }, ch: [{ l: 'Stomp-dance to warm up', fx: { heat: 1, food: -1 } }, { l: 'Bake something', fx: { heat: 1, food: 1, roof: -1 } }] },
  { t: 'Pantry shelf snaps', a: '🥫', d: 'Jars everywhere!', hit: { food: -2 }, ch: [{ l: 'Save the jam', fx: { food: 1, roof: -1 } }, { l: 'Save the pickles', fx: { food: 1, heat: -1 } }] },
  { t: 'The roof creaks', a: '😬', d: 'A long, worrying creeeeak.', hit: { roof: -2 }, ch: [{ l: 'Prop it with a broom', fx: { roof: 1, heat: -1 } }, { l: 'Pretend you heard nothing', fx: { heat: 1, roof: -1 } }] },
  { t: 'A wet dog', a: '🐕', d: 'A big shaggy dog shakes itself dry. On you.', hit: { heat: -2 }, ch: [{ l: 'Cuddle it', fx: { heat: 2, food: -1 } }, { l: 'Give it a bone', fx: { food: -1, roof: 1 } }] },
  { t: 'Gutter overflows', a: '🪣', d: 'A waterfall down the front window.', hit: { roof: -1, heat: -1 }, ch: [{ l: 'Clear the gutter', fx: { roof: 1, food: -1 } }, { l: 'Fill the pots', fx: { food: 1, roof: -1 } }] },
  { t: 'The stove smokes', a: '🔥', d: 'Wrong log. Very smoky.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Smoke some fish', fx: { food: 2, heat: -1 } }, { l: 'Rake it out', fx: { heat: -1, roof: 1 } }] },
  { t: 'Ice on the window', a: '🪟', d: 'The window glass cracks in the cold.', hit: { heat: -1, roof: -1 }, ch: [{ l: 'Board it up', fx: { roof: 1, heat: -1 } }, { l: 'Stuff a pillow in it', fx: { heat: 1, food: -1 } }] },
  { t: 'Hungry raccoon', a: '🦝', d: 'Something is rummaging in the bin.', hit: { food: -2 }, ch: [{ l: 'Bribe it with crusts', fx: { food: -1, heat: 1 } }, { l: 'Lock the pantry', fx: { food: 1, roof: -1 } }] },
  { t: 'Power of the gale', a: '🌪️', d: 'The whole shelter shudders.', hit: { roof: -2, heat: -1 }, ch: [{ l: 'Tie it down with rope', fx: { roof: 2, food: -1, heat: -1 } }, { l: 'Hold on tight', fx: {} }] },
  { t: 'Cold feet', a: '🧦', d: 'Everyone\'s socks are wet.', hit: { heat: -2 }, ch: [{ l: 'Dry them on the stove', fx: { heat: 1, food: -1 } }, { l: 'Wear mittens on your feet', fx: { heat: 1, roof: -1 } }] },
  { t: 'Bees in the wall', a: '🐝', d: 'A sleepy hive, woken by the cold.', hit: { heat: -1, roof: -1 }, ch: [{ l: 'Take some honey', fx: { food: 2, heat: -1 } }, { l: 'Patch the hole', fx: { roof: 1, food: -1 } }] },
  { t: 'Snowball fight', a: '⛄', d: 'Someone started it. Everyone is wet.', hit: { heat: -2 }, ch: [{ l: 'Call a truce, cocoa', fx: { heat: 1, food: -1 } }, { l: 'Build a snow fort wall', fx: { roof: 1, heat: -1 } }] },
  { t: 'Leaky water barrel', a: '🛢️', d: 'The water barrel springs a leak.', hit: { food: -1, roof: -1 }, ch: [{ l: 'Fix it with wax', fx: { food: 1, heat: -1 } }, { l: 'Use the barrel wood', fx: { roof: 1, food: -1 } }] },
  { t: 'Hailstones the size of eggs', a: '🥚', d: 'Wait… some of these ARE eggs?', hit: { roof: -2 }, ch: [{ l: 'Collect the eggs', fx: { food: 2, roof: -1 } }, { l: 'Duck and cover', fx: { roof: 1, heat: -1 } }] },
  { t: 'Draught under the door', a: '🍃', d: 'Leaves blow in and swirl around.', hit: { heat: -2 }, ch: [{ l: 'Roll up a rug', fx: { heat: 1, roof: -1 } }, { l: 'Burn the leaves', fx: { heat: 1, food: -1 } }] },
  { t: 'The oven door falls off', a: '🔧', d: 'Clang. That was important.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Fix it with a fork', fx: { heat: 1, roof: -1 } }, { l: 'Eat cold supper', fx: { food: 1, heat: -1 } }] },
  { t: 'Visitor with soup', a: '🍲', d: 'A neighbour brings soup! Their roof is gone.', hit: { roof: -1, heat: -1 }, ch: [{ l: 'Let them stay', fx: { food: 2, heat: -1 } }, { l: 'Lend them planks', fx: { roof: -1, food: 1, heat: 1 } }] },
  { t: 'Ceiling sags', a: '⚠️', d: 'There is a bulge of water in the ceiling.', hit: { roof: -3 }, ch: [{ l: 'Poke it (carefully)', fx: { roof: 1, food: -1 } }, { l: 'Catch it in the stew pot', fx: { food: 1, roof: -1 } }] },
  { t: 'Wolves howling', a: '🐺', d: 'Far off, but nobody wants to fetch wood now.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Keep the fire roaring', fx: { heat: 1, food: -1 } }, { l: 'Bar the door', fx: { roof: 1, heat: -1 } }] },
  { t: 'Spilled flour', a: '🌾', d: 'A white cloud. Everyone sneezes.', hit: { food: -2 }, ch: [{ l: 'Make pancakes anyway', fx: { food: 1, heat: -1 } }, { l: 'Paste the cracks with it', fx: { roof: 1, food: -1 } }] },
  { t: 'The candles run out', a: '🕯️', d: 'It is very dark. Someone stubs a toe.', hit: { heat: -1, food: -1 }, ch: [{ l: 'Open the stove door', fx: { heat: -1, food: 1 } }, { l: 'Make a candle from lard', fx: { heat: 1, food: -1 } }] },
  { t: 'Roof cat', a: '🐈', d: 'A cat walks across the roof. It is very heavy.', hit: { roof: -2 }, ch: [{ l: 'Coax it inside', fx: { heat: 1, food: -1 } }, { l: 'Shoo it with a broom', fx: { roof: 1, heat: -1 } }] },
  { t: 'Sleet', a: '🌨️', d: 'Not rain. Not snow. Worse.', hit: { heat: -1, roof: -1 }, ch: [{ l: 'Stay by the stove', fx: { heat: 1, roof: -1 } }, { l: 'Sweep the roof', fx: { roof: 1, heat: -1 } }] },
  { t: 'Rumbling tummies', a: '😋', d: 'Everyone is SO hungry.', hit: { food: -2 }, ch: [{ l: 'Big feast', fx: { heat: 1, food: -1 } }, { l: 'Tiny portions', fx: { food: 1, heat: -1 } }] },
  { t: 'Wind chime chaos', a: '🎐', d: 'Clink clink clink clink clink.', hit: { heat: -1, roof: -1 }, ch: [{ l: 'Take it down', fx: { roof: 1, food: -1 } }, { l: 'Dance to it', fx: { heat: 1, food: -1 } }] },
];

/** Action cards. `w` = how many of each go in the shuffled deck. fx { low: 2 } adds 2 to whichever meter is lowest. */
export const CARDS = {
  stove: { n: 'Light the Stove', a: '🔥', fx: { heat: 2 }, w: 3 },
  patch: { n: 'Patch the Roof', a: '🔨', fx: { roof: 2 }, w: 3 },
  forage: { n: 'Forage', a: '🍄', fx: { food: 2 }, w: 3 },
  hammer: { n: 'Hammer Time', a: '🪚', fx: { roof: 3, food: -1 }, w: 2 },
  bake: { n: 'Bake Bread', a: '🥖', fx: { food: 3, heat: -1 }, w: 2 },
  blanket: { n: 'Pile of Blankets', a: '🛏️', fx: { heat: 3, roof: -1 }, w: 2 },
  soup: { n: 'Soup Pot', a: '🍲', fx: { heat: 1, food: 1 }, w: 2 },
  board: { n: 'Board the Windows', a: '🪟', fx: { roof: 1, heat: 1 }, w: 2 },
  shelf: { n: 'Fix the Pantry', a: '🥫', fx: { roof: 1, food: 1 }, w: 2 },
  song: { n: 'Cheery Song', a: '🎵', fx: { low: 2 }, w: 2 },
};
export const CARD_IDS = Object.keys(CARDS);
