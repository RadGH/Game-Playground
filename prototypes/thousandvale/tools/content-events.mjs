#!/usr/bin/env node
// Thousandvale — EVENT INFO (stream E, play-test 5 T12: "no indication of what the event was, what to do, how long it
// lasts or what the reward is"). Writes an `info` block onto EVERY event record:
//
//   data/quests/events.json           realm[] and zone[]
//   data/provinces/road-events.json   chests[], deliver[], escort[], rescue[], and `coded` (kinds the server starts
//                                     from code with no record of their own: the escort ambush)
//
//   info: { name, what (ONE sentence), objective: { kind, text, count, unit }, durationSec, onSuccess, onFail, rewardText }
//
// The hand-written words live in TEXT below, keyed by event id. Everything that can be counted is DERIVED from the
// record, so the words can never disagree with the numbers: objective.count (stages = waves + the boss), durationSec
// (durationMinutes x 60, or the road rules), rewardText (composed from the record's own reward).
// Re-running is stable. An event with no entry in TEXT makes the tool exit 1 — write its words first.
//
//   node tools/content-events.mjs            write
//   node tools/content-events.mjs --check    exit 1 when a file would change (tests use eventInfo() directly)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const EVENTS = new URL('data/quests/events.json', ROOT);
const ROAD = new URL('data/provinces/road-events.json', ROOT);

// ---------------------------------------------------------------------------------------------------- the words
// [what, objective text, onSuccess, onFail]
const TEXT = {
  // realm
  world_grimtallow: ['A siege-husk of thorn and bone has risen in its arena in the Blackthorn Scar.', 'Bring down Grimtallow, the Siege-Husk',
    'Grimtallow is down, and the Scar is only ordinarily dangerous again.', 'Grimtallow sinks back into the thorns, undefeated.'],
  siege_torborhold: ['Raiders are storming the gates of Torborhold.', 'Break the three raider waves, then defeat Harl Vesk, the Raider Captain',
    'The raiders are broken and Torborhold still has its gates.', 'The raiders take what they came for and ride off with it.'],
  siege_halsbridge: ['A warband under a red banner is marching on Halsbridge.', 'Cut down the three warband waves, then defeat Castellan Odrun',
    'The red banner is down and Halsbridge holds.', 'The warband sacks the market and marches off before anyone can stop it.'],
  drake_flyover: ['A mire drake is flying its route across four zones and landing to feed.', 'Kill the mire drake at one of its landings',
    'The drake is dead, and the herds can stop looking up.', 'The drake finishes its meal and flies home, fat and unbothered.'],
  // zone
  event_hollin_pass: ['An avalanche above the pass has uncovered something chained in the snow.', 'Clear the three waves from the slope, then defeat the Chained Saint',
    'The thing in the snow lies still, and the pass is quiet.', 'The snow slides again and buries it all, for now.'],
  event_ashcombe: ['The Warden of the ruin is walking the old counting-house wall again.', 'Beat back the three waves of scavengers, then lay the Barrow Warden down',
    'The Warden lies down, and the ruin goes back to being a ruin.', 'The Warden finishes its rounds and returns below, unpaid.'],
  event_brackwater: ['A bell is ringing under the fen and everything in the reeds is coming to it.', 'Cut through the three waves from the reeds, then stop the Bell Ringer',
    'The bell is silent, and the fen is merely damp.', 'The bell rings itself out and sinks, to ring another day.'],
  event_saltmouth: ['Wreckers are lighting false lamps on the headland to bring a ship onto the rocks.', 'Clear the three waves on the beach, then defeat Sergeant Wark',
    'The false lamps are out and the ship sails past.', 'The lamps do their work, and the wreckers go home rich.'],
  event_delvers_hill: ['The old workings have caved in and something big has climbed out.', 'Beat back the three waves from the hole, then kill Rustjaw',
    'Rustjaw is dead, and the hole is only a hole.', 'The thing digs itself back under the hill.'],
  event_grandmother_skein: ['The great spider under the sinkhole has woken and the field is filling with beasts.', 'Clear the three waves drawn to the field, then kill Grandmother Skein',
    'Grandmother Skein is dead, and the barley is safe to stand in.', 'Grandmother Skein goes back down the hole to wait.'],
  event_torbor_cross: ['A drummer is whipping the Halsbridge market into a mob.', 'Put down the three waves of rioters, then stop Drummer Ossa',
    'The drum is broken and the market finds its manners again.', 'The mob tires itself out and takes the stalls home with it.'],
  event_gullwick: ['Sluicegrip has surfaced beside the ferry and the boats cannot cross.', 'Fight off the three waves from the water, then kill Sluicegrip',
    'Sluicegrip sinks for good, and the ferry runs again.', 'Sluicegrip eats a boat and goes back under.'],
  event_wychwood: ['Something is hunting through Wychwood with a pack at its heels.', 'Survive the three waves of the hunt, then kill the pack leader',
    'The pack leader is dead, and the hunt is over.', 'The hunt passes through and on, and takes its kills with it.'],
  event_saint_orrins_rise: ['Something winged is following the pilgrims up the hill road.', 'Guard the road through three waves, then kill the Gallowmother',
    'The Gallowmother is down and the procession reaches the top.', 'The pilgrims scatter, and the Gallowmother takes the slowest.'],
  event_millbrook: ['A harvest cart with far too many teeth has crashed the festival.', 'Clear the three waves from the green, then stop the Hungry Cart',
    'The cart is firewood, and the festival carries on.', 'The cart eats the pies and rolls off into the dark.'],
  event_redcliff: ['Raiders have brought fire and ladders to the walls of Redcliff Fort.', 'Throw back the three waves at the wall, then kill the imp lighting the gate',
    'The gate is scorched but standing, and the raiders are gone.', 'The gate burns, and the raiders help themselves.'],
  event_blackthorn_scar: ['A briar-giant has walked through the thorn wall with a warband behind it.', 'Break the three warband waves, then fell the Briar Colossus',
    'The colossus is down, and the thorn wall closes over the gap.', 'The warband marches on through the breach.'],
  event_coldwater: ['Old Murkfin has come up out of the silt and the shallows are boiling.', 'Fight off the three waves from the mere, then kill Old Murkfin',
    'Old Murkfin floats belly up, and the mere is still.', 'Old Murkfin slides back into the silt.'],
  event_gorse_march: ['Warlord Hask is leading the ladders against Gorsehold Redoubt.', 'Hold the walls through three waves, then defeat Warlord Hask',
    'Hask is beaten, and the redoubt keeps its flag.', 'The redoubt falls, and Hask puts his own flag on it.'],
  event_sunken_wolds: ['Something grey is hunting the hunters of the Wolds.', 'Survive the three waves it drives ahead of it, then kill Greycoat',
    'Greycoat is dead, and the hunters go back to hunting.', 'Greycoat loses interest and pads off into the mist.'],
  // road: chests
  wrecked_cart: ['A cart lies on its side by the road with its load still under the canvas.', 'Search the wrecked cart',
    'You take what the carter left behind.', 'Somebody else got to the cart first.'],
  buried_cache: ['Somebody has buried a strongbox here, and not very well.', 'Dig up the buried cache',
    'The strongbox is yours now.', 'Whoever buried the cache came back for it.'],
  smugglers_stash: ['Smugglers are sitting on an iron-bound chest just off the road.', 'Defeat the smugglers, then open their stash',
    'The smugglers are out of business and their stash is open.', 'The smugglers pack up and move the stash.'],
  // (wrap-up 2026-10-13: it used to promise a dead mule in the grass, and nothing draws one — the bags are what is there)
  fallen_pack_mule: ['Saddlebags lie spilled in the grass where a pack mule bolted, and what chased it is still close by.', 'Kill what chased the mule off, then search the saddlebags',
    'The saddlebags are yours, and the mule is probably still running.', 'The scavengers drag the saddlebags away.'],
  hollow_stump: ['A dry stump by the road has a poacher\'s savings stuffed inside it.', 'Search the hollow stump',
    'The poacher will have to start saving again.', 'The poacher came back and emptied the stump.'],
  toll_strongbox: ['The stolen Hollin toll box sits prised open here, with the thieves still beside it.', 'Defeat the thieves, then open the toll strongbox',
    'The thieves are down and the toll box is yours.', 'The thieves carry the strongbox off into the hills.'],
  pilgrims_offering: ['A sealed offering box stands by the wayside, and something may be watching it.', 'Deal with anything guarding it, then open the offering box',
    'The offerings go to a good cause, namely you.', 'A pilgrim collects the box and carries it on to the shrine.'],
  // road: deliver
  lame_horse: ['A courier with a lame horse needs a parcel carried to {town}.', 'Carry the sealed parcel to {npc} in {town}',
    '{npc} has the parcel, and the post was only slightly late.', 'The courier gave up waiting and limped on with the parcel.'],
  sick_drover: ['A feverish drover needs a letter taken to {town}.', 'Bring the drover\'s letter to {npc} in {town}',
    '{npc} has the letter.', 'The drover found someone else to carry the letter.'],
  herb_woman: ['An old herbalist has roots that must reach {town} before they spoil.', 'Take the wet roots to {npc} in {town}',
    '{npc} has the roots, still fresh enough to sell.', 'The roots have gone bad.'],
  lost_tinker: ['A tinker who lost the way needs a mended lock returned to {town}.', 'Return the mended lock to {npc} in {town}',
    '{npc} has the lock back.', 'The tinker found the road again and went on alone.'],
  // road: escort
  lost_child: ['A lost child is asking the way home to {town}.', 'See {name} safely to {town}',
    '{name} is home in {town}.', '{name} wandered off again.'],
  frightened_pedlar: ['A pedlar who is being followed wants company on the road to {town}.', 'Walk {name} to {town}',
    '{name} reached {town} with every pot and pin.', '{name} lost patience and went on alone.'],
  blind_pilgrim: ['A blind pilgrim whose guide ran off needs an arm to {town}.', 'Lead {name} to {town}',
    '{name} is safe in {town}.', '{name} sat down to wait for a steadier guide.'],
  // road: rescue
  bound_trader: ['A trader is tied up here with the {guards} that robbed them standing guard.', 'Defeat the {guards}, free {name} and bring them home to {town}',
    '{name} is home in {town}, short a few mules.', 'The {guards} moved on and took {name} with them.'],
  caged_scout: ['A scout sits in a cage with the key on one of the {guards} around it.', 'Beat the {guards}, open the cage and see {name} back to {town}',
    '{name} is out of the cage and back in {town}.', 'The {guards} moved the cage, with {name} still in it.'],
  taken_miller: ['A miller taken on the road is being held here by {guards}.', 'Free {name} from the {guards} and walk them home to {town}',
    '{name} is home, and very much not dead.', 'The {guards} moved on and took {name} with them.'],
  // road: coded
  ambush: ['Something has been following the one you are escorting, and it has just caught up.', 'Kill the ambushers before they reach {name}',
    'The ambush is beaten off.', '{name} was struck down on the road.'],
};
const CODED_NAMES = { ambush: 'Ambush on the Road' };

// ------------------------------------------------------------------------------------------------- the numbers
const RARITY = { normal: 'common', common: 'common', magic: 'uncommon', uncommon: 'uncommon', rare: 'rare', epic: 'epic', legendary: 'legendary' };
const xpWords = x => (!x ? '' : x < 0.4 ? 'a little experience' : x < 0.9 ? 'a good share of experience' : x < 1.2 ? 'about a level of experience' : 'more than a level of experience');
const an = w => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w;
const list = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

/** What a runner event (realm / zone) pays, from its own reward block. js/sim/events.js guarantees one rare-or-better each. */
export function runnerRewardText(ev) {
  const rw = ev.reward || {};
  const parts = [];
  const tier = RARITY[(rw.item && rw.item.tier) || 'rare'];
  const chancy = rw.item && rw.item.chance != null && rw.item.chance < 1;
  parts.push((!chancy && tier !== 'rare' ? `${an(tier)} item` : 'a rare item or better') + ' for everyone who takes part');
  if (chancy && tier !== 'rare') parts.push(`a chance of ${an(tier)} one`);
  if (rw.firstKillDaily && rw.firstKillDaily.item) parts.push(`a small chance of ${an(RARITY[rw.firstKillDaily.item.tier])} one on your first kill of the day`);
  if (rw.gold) parts.push('gold');
  if (rw.xp) parts.push(xpWords(rw.xp));
  const s = list(parts);
  return s[0].toUpperCase() + s.slice(1);
}
export function chestRewardText(spec) { return `A chest for everyone who opens it: ${RARITY[spec.tier || 'normal']} loot or better, rolled at your level`; }
export function questRewardText(spec) {
  const parts = [];
  if (spec.gold) parts.push('gold');
  if (spec.xp) parts.push(xpWords(spec.xp));
  if (spec.item && typeof spec.item === 'object') parts.push(`${an(RARITY[spec.item.tier || 'magic'])} item or better`);
  const s = list(parts) + ', paid on the spot';
  return s[0].toUpperCase() + s.slice(1);
}

const words = id => { const t = TEXT[id]; if (!t || t.length !== 4 || t.some(x => !x)) throw new Error(`no event text for "${id}" — add it to TEXT in tools/content-events.mjs`); return t; };
const block = (name, id, objective, durationSec, rewardText) => {
  const [what, text, onSuccess, onFail] = words(id);
  return { name, what, objective: { kind: objective.kind, text, count: objective.count, unit: objective.unit }, durationSec, onSuccess, onFail, rewardText };
};

/** How many stages the event runner plays: every wave, then the boss it always ends with (js/sim/events.js). */
export const stagesOf = ev => (ev.waves || []).length + 1;

export function runnerInfo(ev) {
  const waves = (ev.waves || []).length;
  const obj = waves ? { kind: 'waves_boss', count: stagesOf(ev), unit: 'stages' } : { kind: 'boss', count: 1, unit: 'boss' };
  return block(ev.name, ev.id, obj, Math.round((ev.durationMinutes || 10) * 60), runnerRewardText(ev));
}
/** Road-event durations: a chest packs up after rules.lifeSec; the walking kinds get longer, a rescue (a fight first) longest. */
export const roadDuration = (kind, rules) => { const life = (rules && rules.lifeSec) || 600; return kind === 'chest' ? life : kind === 'rescue' ? life * 2 : kind === 'ambush' ? 120 : Math.round(life * 1.5); };
export function roadInfo(kind, spec, rules) {
  const d = roadDuration(kind, rules);
  if (kind === 'chest') return block(spec.name, spec.id, { kind: 'open', count: 1, unit: 'chest' }, d, chestRewardText(spec));
  if (kind === 'deliver') return block(spec.title, spec.id, { kind: 'deliver', count: 1, unit: 'delivery' }, d, questRewardText(spec));
  if (kind === 'escort') return block(spec.title, spec.id, { kind: 'escort', count: 1, unit: 'arrival' }, d, questRewardText(spec));
  if (kind === 'rescue') return block(spec.title, spec.id, { kind: 'rescue', count: 2, unit: 'steps' }, d, questRewardText(spec));
  throw new Error('unknown road event kind ' + kind);
}
export function codedInfo(rules) {
  return { ambush: { _doc: 'js/sim/roadevents.js ambush(): monsters of the nearest camp jump an escort every rules.ambushEveryM metres walked, at most rules.maxAmbush times. objective.count is a wave; the reward is the escort\'s own.',
    info: block(CODED_NAMES.ambush, 'ambush', { kind: 'defend', count: 1, unit: 'ambush' }, roadDuration('ambush', rules), 'Nothing of its own: it counts toward the escort you are on') } };
}

// ------------------------------------------------------------------------------------------------- the writers
/** Hand-style compact JSON: `{ "a": 1, "b": [0, 0] }` (the look of data/provinces/*.json). */
function inline(v) {
  if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']';
  if (v && typeof v === 'object') { const ks = Object.keys(v); return ks.length ? '{ ' + ks.map(k => JSON.stringify(k) + ': ' + inline(v[k])).join(', ') + ' }' : '{}'; }
  return JSON.stringify(v);
}
export function roadText(d) {
  const out = [];
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) out.push(`  ${JSON.stringify(k)}: [\n${v.map(x => '    ' + inline(x)).join(',\n')}\n  ]`);
    else if (k === 'coded') out.push(`  ${JSON.stringify(k)}: {\n${Object.entries(v).map(([a, b]) => `    ${JSON.stringify(a)}: ${inline(b)}`).join(',\n')}\n  }`);
    else out.push(`  ${JSON.stringify(k)}: ${inline(v)}`);
  }
  return '{\n' + out.join(',\n') + '\n}\n';
}
const DOC_EVENTS = ' INFO (play-test 5 T12, tools/content-events.mjs): every realm and zone event carries `info` = { name, what (one sentence), objective { kind, text, count, unit } (count = what the server counts: stages = waves + the boss), durationSec (the hard limit: at 0 the event FAILS), onSuccess / onFail (the result line), rewardText (a preview composed from `reward`) }. Never edit `info` by hand: change the words in the tool and re-run it.';
const DOC_ROAD = ' INFO (play-test 5 T12, tools/content-events.mjs): every chest and every deliver / escort / rescue variant carries `info` = { name, what (one sentence), objective { kind, text, count, unit }, durationSec, onSuccess, onFail, rewardText } with the same {name} {town} {npc} {guards} slots as the rest of the record; `coded` holds the info of kinds the server starts from code (the escort `ambush`). Never edit `info` by hand: change the words in the tool and re-run it.';

export function build() {
  const ev = JSON.parse(readFileSync(EVENTS, 'utf8'));
  for (const e of [...ev.realm, ...ev.zone]) e.info = runnerInfo(e);
  if (!ev._doc.includes('INFO (play-test 5 T12')) ev._doc += DOC_EVENTS;
  const road = JSON.parse(readFileSync(ROAD, 'utf8'));
  for (const c of road.chests) c.info = roadInfo('chest', c, road.rules);
  for (const k of ['deliver', 'escort', 'rescue']) for (const s of road[k]) s.info = roadInfo(k, s, road.rules);
  road.coded = codedInfo(road.rules);
  if (!road._doc.includes('INFO (play-test 5 T12')) road._doc += DOC_ROAD;
  return { events: JSON.stringify(ev, null, 2) + '\n', road: roadText(road) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let out;
  try { out = build(); } catch (err) { console.error('content-events: ' + err.message); process.exit(1); }
  const check = process.argv.includes('--check');
  let changed = 0;
  for (const [url, text] of [[EVENTS, out.events], [ROAD, out.road]]) {
    if (readFileSync(url, 'utf8') === text) continue;
    changed++;
    if (!check) writeFileSync(url, text);
  }
  console.log(`content-events: ${changed} file(s) ${check ? 'would change' : 'written'}`);
  if (check && changed) process.exit(1);
}
