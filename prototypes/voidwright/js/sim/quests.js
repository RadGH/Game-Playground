// The quest line (owner: "a simple to follow quest that leads you through the game but is open form").
// Every goal is vague and can be done anywhere — "mine 30 ore", not "go to rock #12". Finishing a goal
// unlocks the next system of the game (PLAN §0 #16 — drip-feed), so the screen starts almost empty and
// grows. Anything a goal unlocks can also be unlocked early by FINDING it (see unlockFromFind).

export const CHAPTERS = [
  { id: 'mine', title: 'First light', text: 'Your hold is empty and so is your wallet. Point your mining laser at an asteroid (hold Fire) and cut out some ore.', goal: g => g.stats.mined, need: 25, unit: 'ore mined', unlock: ['cargo'], reward: { cr: 150 } },
  { id: 'dock', title: 'Somewhere to sell', text: 'Stations buy what you dig. Fly to the station and press Dock (E) when you are close.', goal: g => g.stats.docks, need: 1, unit: 'docked', unlock: ['market', 'repair', 'insurance'], reward: { cr: 100 } },
  { id: 'sell', title: 'Trader\'s first coin', text: 'Sell ore at a market. Prices differ from station to station: the trade screen shows where each thing sells best.', goal: g => g.stats.sold, need: 20, unit: 'units sold', unlock: ['outfitter'], reward: { cr: 200 } },
  { id: 'hunt', title: 'Teeth', text: 'Corsairs raid the lanes. Destroy three hostile ships anywhere. Your laser turret aims by itself.', goal: g => g.stats.kills, need: 3, unit: 'ships destroyed', unlock: ['loot', 'missiles', 'build'], reward: { cr: 400 } },
  { id: 'build', title: 'Make it yours', text: 'Open Build mode (B) — docked or out of combat — and fit a part from your hold. Turret arcs show where each gun can aim.', goal: g => g.stats.built, need: 1, unit: 'parts fitted', unlock: ['shipyard', 'galaxy'], reward: { cr: 300 } },
  // play-test #27 (2026-11-12): the old "Hook, line" goal is gone, and finishing this goal (where it used to sit)
  // opens EVERY feature that is still locked — the drip-feed only covers the first few minutes now
  { id: 'jump', title: 'Further out', text: 'Open the star map (M) and jump to another system. Further from home means tougher enemies — and better loot and shops.', goal: g => g.stats.jumps, need: 1, unit: 'jumps', unlock: ['ALL'], reward: { cr: 600 } },
  { id: 'craft', title: 'Made by hand', text: 'Craft a part from ore at a station Workshop (or anywhere with a Fabricator part on your ship).', goal: g => g.stats.crafted || 0, need: 1, unit: 'parts crafted', unlock: [], reward: { cr: 600 } },
  { id: 'trade', title: 'Buy low, sell high', text: 'Make 3,000 credits of profit from trading goods between stations.', goal: g => Math.floor(g.stats.tradeProfit), need: 3000, unit: 'cr profit', unlock: [], reward: { cr: 800 } },
  { id: 'drones', title: 'Wings', text: 'Fit a drone port, then fit drones to it in build mode (Drones tab). They fly ahead of you, ready for action.', goal: g => g.stats.drones, need: 2, unit: 'drones launched', unlock: [], reward: { cr: 1000 } },
  { id: 'mission', title: 'Odd jobs', text: 'Finish a mission from a station or outpost mission board.', goal: g => g.stats.missions || 0, need: 1, unit: 'missions', unlock: [], reward: { cr: 1200 } },
  { id: 'danger', title: 'Danger pay', text: 'Reach a system of danger 3 or more.', goal: g => g.stats.maxTier, need: 3, unit: 'danger reached', unlock: [], reward: { cr: 2000 } },
  { id: 'alien', title: 'Not alone', text: 'Recover an alien specimen from a destroyed alien ship. Research labs pay for them.', goal: g => g.stats.specimens, need: 1, unit: 'specimens', unlock: [], reward: { cr: 2500 } },
  { id: 'grow', title: 'Room to grow', text: 'Make your ship bigger: refit it into a larger hull class at a shipyard (Grow hull), or buy a bigger ship.', goal: g => clsRank(g) >= 1 ? 1 : 0, need: 1, unit: 'bigger hull', unlock: [], reward: { cr: 1500 } },
  { id: 'colony', title: 'A place of your own', text: 'Found an outpost over a planet (fly over it and press Use). It digs, builds and earns while you are away.', goal: g => (g.colonies || []).length, need: 1, unit: 'outposts', unlock: [], reward: { cr: 3000 } },
  { id: 'merc', title: 'Hired guns', text: 'Hire a mercenary pilot at a station and give them a ship from your hangar.', goal: g => (g.mercs || []).filter(m => m.ship).length, need: 1, unit: 'wingmen', unlock: [], reward: { cr: 3000 } },
  { id: 'bigkill', title: 'Fleet killer', text: 'Destroy a frigate-class ship or bigger.', goal: g => (g.stats.killsCls.frigate || 0) + (g.stats.killsCls.destroyer || 0) + (g.stats.killsCls.cruiser || 0) + (g.stats.killsCls.battleship || 0) + (g.stats.killsCls.carrier || 0) + (g.stats.killsCls.dreadnought || 0), need: 1, unit: 'big kills', unlock: [], reward: { cr: 4000 } },
  { id: 'frigate', title: 'Frigate captain', text: 'Own a frigate. Frigates mount 2×2 parts: heavy turrets, hangars, fusion reactors.', goal: g => clsRank(g) >= 2 ? 1 : 0, need: 1, unit: 'frigate', unlock: [], reward: { cr: 8000 } },
  { id: 'stronghold', title: 'Smoke them out', text: 'Destroy an enemy stronghold. They show on the system map.', goal: g => g.stats.strongholds, need: 1, unit: 'strongholds', unlock: [], reward: { cr: 15000 } },
  { id: 'cruiser', title: 'Capital ship', text: 'Own a cruiser — 4×4 capital parts.', goal: g => clsRank(g) >= 4 ? 1 : 0, need: 1, unit: 'cruiser', unlock: [], reward: { cr: 30000 } },
  { id: 'boss', title: 'Giant slayer', text: 'Hunt down one of the roaming giants on the star map and destroy it.', goal: g => g.stats.bossKills, need: 1, unit: 'giants slain', unlock: [], reward: { cr: 80000 } },
  { id: 'dread', title: 'The biggest thing that flies', text: 'Own a dreadnought.', goal: g => clsRank(g) >= 6 ? 1 : 0, need: 1, unit: 'dreadnought', unlock: [], reward: { cr: 0 } },
];
const RANK = { skiff: 0, corvette: 1, frigate: 2, destroyer: 3, cruiser: 4, battleship: 5, carrier: 5, dreadnought: 6 };
export const clsRank = g => Math.max(RANK[g.ship.cls] || 0, ...(g.hangar || []).map(h => RANK[h.cls] || 0));

/** Names for unlock flags, shown in the "New:" banner. */
export const UNLOCK_NAMES = {
  cargo: 'Cargo readout', market: 'Station markets', repair: 'Repairs', outfitter: 'Outfitter (buy parts)', loot: 'Loot from wrecks',
  missiles: 'Missile button (right mouse)', build: 'Build mode (B)', shipyard: 'Shipyards', galaxy: 'Star map + jumps (M)', refinery: 'Refineries',
  crew: 'Crew halls', workshop: 'Workshops (craft, re-roll, open caches)', harpoon: 'Harpoon (F)', salvage: 'Salvage yards', insurance: 'Ship insurance', bounty: 'Bounty boards', drones: 'Drone shops',
  lab: 'Research labs', blackmarket: 'Black markets', research: 'Research projects', big: '2×2 parts', capital: '4×4 capital parts',
  fabricator: 'Fabricators (craft parts from ore)', missions: 'Mission boards', colonies: 'Outposts over planets', mercs: 'Mercenaries', ALL: 'Everything else in the game',
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
  for (const id of G.quest.done || []) { const ch = CHAPTERS.find(c => c.id === id); if (ch) for (const u of ch.unlock) unlock(G, u); }
  // older saves that were past "Further out" (or on the removed "Hook, line" goal): everything opens
  if ((G.quest.done || []).includes('jump') || (G.quest.done || []).includes('harpoon')) unlock(G, 'ALL');
  // goals that were removed: step past them; goals that were added before your place: count as done
  G.quest.done = (G.quest.done || []).filter(id => id !== 'harpoon' && id !== 'corvette');
  // the goal list changes between versions: your place is the first goal you have not finished
  if (G.quest.atId !== CHAPTERS[G.quest.chapter]?.id) { const i = CHAPTERS.findIndex(c => !G.quest.done.includes(c.id)); G.quest.chapter = i < 0 ? CHAPTERS.length : i; }
  for (let guard = 0; guard < 4; guard++) {
    const ch = CHAPTERS[G.quest.chapter]; if (!ch) break;
    const have = ch.goal(G);
    G.quest.progress[ch.id] = have;
    if (have < ch.need) break;
    G.quest.done.push(ch.id); G.quest.chapter++;
    for (const u of ch.unlock) unlock(G, u);
    if (ch.reward?.cr) G.credits += ch.reward.cr;
    done.push(ch);
  }
  G.quest.atId = CHAPTERS[G.quest.chapter]?.id || 'end';
  return done;
}

/** Unlock one feature, or 'ALL' of them. */
export function unlock(G, u) {
  if (u === 'ALL') { for (const k of Object.keys(UNLOCK_NAMES)) G.unlocked[k] = true; return; }
  G.unlocked[u] = true;
}

/** Finding something can unlock its feature early (PLAN §0 #16). Returns the unlock id or null. */
export function unlockFromFind(G, item) {
  const id = item?.block || '';
  const map = [[/drone_bay/, 'drones'], [/harpoon/, 'harpoon'], [/missile|swarm|torpedo/, 'missiles']];
  for (const [re, u] of map) if (re.test(id) && !G.unlocked[u]) { G.unlocked[u] = true; return u; }
  return null;
}
