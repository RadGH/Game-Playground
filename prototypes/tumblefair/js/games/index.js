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

export const GAMES = Object.freeze(Object.fromEntries([paintPanic, trapdoorTreasury, meteorDash, snowballShowdown, stackAttack, drawTheDisaster, memoryHeist, circuitScramble].map(g => [g.meta.id, g])));
export const gameIds = () => Object.keys(GAMES);
export const metaOf = id => GAMES[id]?.meta || null;
export const loadView = id => import(`./${id}/view.js`);
/** Games that can be played by `n` players, from `pool` (empty = every game). */
export const eligible = (n, pool = []) => gameIds().filter(id => (!pool.length || pool.includes(id)) && GAMES[id].meta.min <= n && GAMES[id].meta.max >= n);
