// Every minigame, by id. A game is two files in its own folder:
//   sim.js   the rules (pure; the SERVER runs it, tests run it): `meta` + `create(ctx)`       — contract in docs/MINIGAMES.md
//   view.js  what a browser draws and which controls it shows: `createView(ctx)`            — loaded only when played
// To add a game: write the two files, add one line here, add a card picture. Nothing else knows the list.
import * as paintPanic from './paint-panic/sim.js';
import * as trapdoorTreasury from './trapdoor-treasury/sim.js';

export const GAMES = Object.freeze(Object.fromEntries([paintPanic, trapdoorTreasury].map(g => [g.meta.id, g])));
export const gameIds = () => Object.keys(GAMES);
export const metaOf = id => GAMES[id]?.meta || null;
export const loadView = id => import(`./${id}/view.js`);
/** Games that can be played by `n` players, from `pool` (empty = every game). */
export const eligible = (n, pool = []) => gameIds().filter(id => (!pool.length || pool.includes(id)) && GAMES[id].meta.min <= n && GAMES[id].meta.max >= n);
