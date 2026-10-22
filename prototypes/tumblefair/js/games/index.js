// Every minigame, by id. A game is two files in its own folder:
//   sim.js   the rules (pure; the SERVER runs it, tests run it): `meta` + `create(ctx)`       — contract in docs/MINIGAMES.md
//   view.js  what a browser draws and which controls it shows: `createView(ctx)`            — loaded only when played
// To add a game: write the two files, add one line here, add a card picture. Nothing else knows the list.
import * as paintPanic from './paint-panic/sim.js';
import * as trapdoorTreasury from './trapdoor-treasury/sim.js';
import * as meteorDash from './meteor-dash/sim.js';
import * as snowballShowdown from './snowball-showdown/sim.js';
import * as stackAttack from './stack-attack/sim.js';
import * as drawTheDisaster from './draw-the-disaster/sim.js';
import * as memoryHeist from './memory-heist/sim.js';
import * as circuitScramble from './circuit-scramble/sim.js';
import * as laserLimbo from './laser-limbo/sim.js';
import * as cannonballCatch from './cannonball-catch/sim.js';
import * as balloonStampede from './balloon-stampede/sim.js';
import * as captionClash from './caption-clash/sim.js';
import * as patternImpostor from './pattern-impostor/sim.js';
import * as coinstorm from './coinstorm/sim.js';
import * as boardwalkBrawl from './boardwalk-brawl/sim.js';
import * as flingRing from './fling-ring/sim.js';
import * as wobblewheelRally from './wobblewheel-rally/sim.js';
import * as ringADingRumble from './ring-a-ding-rumble/sim.js';
import * as costumeCatwalk from './costume-catwalk/sim.js';
import * as oneButtonOrchestra from './one-button-orchestra/sim.js';
import * as goingGoingGone from './going-going-gone/sim.js';

import * as tileFlipRace from './tile-flip-race/sim.js';
import * as monsterForecast from './monster-forecast/sim.js';
import * as wobbleTower from './wobble-tower/sim.js';
import * as ropeBridgePanic from './rope-bridge-panic/sim.js';
import * as slipperyDelivery from './slippery-delivery/sim.js';
import * as portalRouting from './portal-routing/sim.js';
import * as wordRelay from './word-relay/sim.js';
import * as safecracker from './safecracker/sim.js';

import * as treasureMapBluff from './treasure-map-bluff/sim.js';
import * as auctionOfChaos from './auction-of-chaos/sim.js';
import * as kitchenCatastrophe from './kitchen-catastrophe/sim.js';
import * as castleDefense from './castle-defense/sim.js';
import * as defuseTogether from './defuse-together/sim.js';
import * as alibiAssembly from './alibi-assembly/sim.js';
import * as secretArchitect from './secret-architect/sim.js';
import * as twoTruthsOneGoblin from './two-truths-one-goblin/sim.js';
import * as dragonsWeakSpot from './dragons-weak-spot/sim.js';
import * as ghostPhotographer from './ghost-photographer/sim.js';
import * as stormShelter from './storm-shelter/sim.js';
import * as jellybeanJar from './jellybean-jar/sim.js';
import * as quickDraw from './quick-draw/sim.js';
import * as pinTheTail from './pin-the-tail/sim.js';
import * as sizeUp from './size-up/sim.js';
import * as tiptoeTiger from './tiptoe-tiger/sim.js';
import * as hayBaleScramble from './hay-bale-scramble/sim.js';
import * as fizzpopPass from './fizzpop-pass/sim.js';
import * as bumperBash from './bumper-bash/sim.js';
import * as sheepShuffle from './sheep-shuffle/sim.js';
import * as moleMallet from './mole-mallet/sim.js';
import * as ropeRumble from './rope-rumble/sim.js';
import * as lanternLeap from './lantern-leap/sim.js';
import * as trickOrTreatStreet from './trick-or-treat-street/sim.js';
import * as ghostTag from './ghost-tag/sim.js';
import * as pumpkinCarveOff from './pumpkin-carve-off/sim.js';
import * as appleBobbing from './apple-bobbing/sim.js';
import * as monsterMash from './monster-mash/sim.js';
export const GAMES = Object.freeze(Object.fromEntries([paintPanic, trapdoorTreasury, meteorDash, snowballShowdown, stackAttack, drawTheDisaster, memoryHeist, circuitScramble, laserLimbo, cannonballCatch, balloonStampede, captionClash, patternImpostor, coinstorm, boardwalkBrawl, flingRing, wobblewheelRally, ringADingRumble, costumeCatwalk, oneButtonOrchestra, goingGoingGone, tileFlipRace, monsterForecast, wobbleTower, ropeBridgePanic, slipperyDelivery, portalRouting, wordRelay, safecracker, treasureMapBluff, auctionOfChaos, alibiAssembly, secretArchitect, twoTruthsOneGoblin, dragonsWeakSpot, kitchenCatastrophe, castleDefense, defuseTogether, ghostPhotographer, stormShelter, jellybeanJar, quickDraw, pinTheTail, sizeUp, tiptoeTiger, hayBaleScramble, fizzpopPass, bumperBash, sheepShuffle, moleMallet, ropeRumble, lanternLeap, trickOrTreatStreet, ghostTag, pumpkinCarveOff, appleBobbing, monsterMash].map(g => [g.meta.id, g])));
export const gameIds = () => Object.keys(GAMES);
export const metaOf = id => GAMES[id]?.meta || null;
export const loadView = id => import(`./${id}/view.js`);
/** Games that can be played by `n` players, from `pool` (empty = every game). */
/** Games that fit n players, from the host's pool (empty = all), in season (a holiday game only while its season is on). */
export const eligible = (n, pool = [], season = null) => gameIds().filter(id => (!pool.length || pool.includes(id)) && GAMES[id].meta.min <= n && GAMES[id].meta.max >= n && (!GAMES[id].meta.season || GAMES[id].meta.season === season));
