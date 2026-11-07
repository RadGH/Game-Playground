// The quest line (owner: "a simple to follow quest that leads you through the game but is open form").
// Every goal is vague and can be done anywhere — "mine 30 ore", not "go to rock #12". Finishing a goal
// unlocks the next system of the game (PLAN §0 #16 — drip-feed), so the screen starts almost empty and
// grows. Anything a goal unlocks can also be unlocked early by FINDING it (see unlockFromFind).

export const CHAPTERS = [
  { id: 'mine', title: 'First light', text: 'Your hold is empty and so is your wallet. Point your mining laser at an asteroid (hold Fire) and cut out some ore.', goal: g => g.stats.mined, need: 25, unit: 'ore mined', unlock: ['cargo'], reward: { cr: 150 } },
  { id: 'dock', title: 'Somewhere to sell', text: 'Stations buy what you dig. Fly to the station and press Dock (E) when you are close.', goal: g => g.stats.docks, need: 1, unit: 'docked', unlock: ['market', 'repair'], reward: { cr: 100 } },
  { id: 'sell', title: 'Trader\'s first coin', text: 'Sell ore at a market. Prices differ from station to station: the trade screen shows where each thing sells best.', goal: g => g.stats.sold, need: 20, unit: 'units sold', unlock: ['outfitter'], reward: { cr: 200 } },
  { id: 'hunt', title: 'Teeth', text: 'Corsairs raid the lanes. Destroy three hostile ships anywhere. Your laser turret aims by itself.', goal: g => g.stats.kills, need: 3, unit: 'ships destroyed', unlock: ['loot', 'missiles', 'build'], reward: { cr: 400 } },
  { id: 'build', title: 'Make it yours', text: 'Open Build mode (B) — docked or out of combat — and fit a part from your hold. Turret arcs show where each gun can aim.', goal: g => g.stats.built, need: 1, unit: 'parts fitted', unlock: ['shipyard', 'galaxy'], reward: { cr: 300 } },
  { id: 'jump', title: 'Further out', text: 'Open the star map (M) and jump to another system. Further from home means tougher enemies — and better loot and shops.', goal: g => g.stats.jumps, need: 1, unit: 'jumps', unlock: ['refinery', 'crew'], reward: { cr: 500 } },
  { id: 'harpoon', title: 'Hook, line', text: 'Fit a harpoon (outfitters sell them). Spear an asteroid or a ship with F and drag it around. Press F again to let go.', goal: g => Math.floor(g.stats.dragged / 10), need: 30, unit: '×10 m dragged', unlock: ['harpoon', 'salvage'], reward: { cr: 600 } },
  { id: 'trade', title: 'Buy low, sell high', text: 'Make 3,000 credits of profit from trading goods between stations.', goal: g => Math.floor(g.stats.tradeProfit), need: 3000, unit: 'cr profit', unlock: ['insurance', 'bounty', 'drones'], reward: { cr: 800 } },
  { id: 'drones', title: 'Wings', text: 'Get a drone bay, build drones at a drone shop and launch them. They fly ahead of you, ready for action.', goal: g => g.stats.drones, need: 2, unit: 'drones launched', unlock: [], reward: { cr: 1000 } },
  { id: 'corvette', title: 'Bigger hull', text: 'Buy a corvette or anything bigger at a shipyard.', goal: g => clsRank(g) >= 1 ? 1 : 0, need: 1, unit: 'corvette', unlock: ['lab'], reward: { cr: 1500 } },
  { id: 'danger', title: 'Danger pay', text: 'Reach a system of danger 3 or more.', goal: g => g.stats.maxTier, need: 3, unit: 'danger reached', unlock: ['blackmarket'], reward: { cr: 2000 } },
  { id: 'alien', title: 'Not alone', text: 'Recover an alien specimen from a destroyed alien ship. Research labs pay for them.', goal: g => g.stats.specimens, need: 1, unit: 'specimens', unlock: ['research'], reward: { cr: 2500 } },
  { id: 'bigkill', title: 'Fleet killer', text: 'Destroy a frigate-class ship or bigger.', goal: g => (g.stats.killsCls.frigate || 0) + (g.stats.killsCls.destroyer || 0) + (g.stats.killsCls.cruiser || 0) + (g.stats.killsCls.battleship || 0) + (g.stats.killsCls.carrier || 0) + (g.stats.killsCls.dreadnought || 0), need: 1, unit: 'big kills', unlock: ['claims'], reward: { cr: 4000 } },
  { id: 'frigate', title: 'Frigate captain', text: 'Own a frigate. Frigates mount 2×2 parts: heavy turrets, hangars, fusion reactors.', goal: g => clsRank(g) >= 2 ? 1 : 0, need: 1, unit: 'frigate', unlock: ['big'], reward: { cr: 8000 } },
  { id: 'stronghold', title: 'Smoke them out', text: 'Destroy an enemy stronghold. They show on the system map.', goal: g => g.stats.strongholds, need: 1, unit: 'strongholds', unlock: [], reward: { cr: 15000 } },
  { id: 'cruiser', title: 'Capital ship', text: 'Own a cruiser — 4×4 capital parts.', goal: g => clsRank(g) >= 4 ? 1 : 0, need: 1, unit: 'cruiser', unlock: ['capital'], reward: { cr: 30000 } },
  { id: 'boss', title: 'Giant slayer', text: 'Hunt down one of the roaming giants on the star map and destroy it.', goal: g => g.stats.bossKills, need: 1, unit: 'giants slain', unlock: [], reward: { cr: 80000 } },
  { id: 'dread', title: 'The biggest thing that flies', text: 'Own a dreadnought.', goal: g => clsRank(g) >= 6 ? 1 : 0, need: 1, unit: 'dreadnought', unlock: [], reward: { cr: 0 } },
];
const RANK = { skiff: 0, corvette: 1, frigate: 2, destroyer: 3, cruiser: 4, battleship: 5, carrier: 5, dreadnought: 6 };
export const clsRank = g => Math.max(RANK[g.ship.cls] || 0, ...(g.hangar || []).map(h => RANK[h.cls] || 0));

/** Names for unlock flags, shown in the "New:" banner. */
export const UNLOCK_NAMES = {
  cargo: 'Cargo readout', market: 'Station markets', repair: 'Repairs', outfitter: 'Outfitter (buy parts)', loot: 'Loot from wrecks',
  missiles: 'Missile button (right mouse)', build: 'Build mode (B)', shipyard: 'Shipyards', galaxy: 'Star map + jumps (M)', refinery: 'Refineries',
  crew: 'Crew halls', harpoon: 'Harpoon (F)', salvage: 'Salvage yards', insurance: 'Ship insurance', bounty: 'Bounty boards', drones: 'Drone shops',
  lab: 'Research labs', blackmarket: 'Black markets', research: 'Research projects', claims: 'Mining claims', big: '2×2 parts', capital: '4×4 capital parts',
};

/**
 * Rule: a goal's tools are unlocked by the goal BEFORE it (the star map opens when "Further out" starts,
 * not as its reward — it used to be locked behind itself, so nobody could ever jump). The test in
 * rules.test.mjs checks this for every goal that names a locked feature.
 */
/** Check progress; returns finished chapters (and applies their rewards/unlocks). */
export function checkQuests(G) {
  const done = [];
  // saves made before an unlock moved to an earlier goal: re-apply every finished goal's unlocks
  for (const id of G.quest.done || []) { const ch = CHAPTERS.find(c => c.id === id); if (ch) for (const u of ch.unlock) G.unlocked[u] = true; }
  for (let guard = 0; guard < 4; guard++) {
    const ch = CHAPTERS[G.quest.chapter]; if (!ch) break;
    const have = ch.goal(G);
    G.quest.progress[ch.id] = have;
    if (have < ch.need) break;
    G.quest.done.push(ch.id); G.quest.chapter++;
    for (const u of ch.unlock) G.unlocked[u] = true;
    if (ch.reward?.cr) G.credits += ch.reward.cr;
    done.push(ch);
  }
  return done;
}

/** Finding something can unlock its feature early (PLAN §0 #16). Returns the unlock id or null. */
export function unlockFromFind(G, item) {
  const id = item?.block || '';
  const map = [[/drone_bay/, 'drones'], [/harpoon/, 'harpoon'], [/missile|swarm|torpedo/, 'missiles']];
  for (const [re, u] of map) if (re.test(id) && !G.unlocked[u]) { G.unlocked[u] = true; return u; }
  return null;
}
