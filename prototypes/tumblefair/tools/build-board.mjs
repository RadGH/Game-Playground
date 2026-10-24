#!/usr/bin/env node
// Writes the boards: data/boards/<id>.json. Each is a loop of spaces round a rounded rectangle with one shortcut across
// the middle. Edit the tables here and re-run; the game only ever reads the JSON.
//   node tools/build-board.mjs
// Positions fitted onto the path painted in a board's backdrop (tools/fit-board.py -> data/boards/<id>-fit.json) win
// over the formula. A NEW board: add it below, run this, draw its guide (tools/fit-board.py --guide <id> out.png), have
// Codex paint the backdrop over the guide, run tools/art.sh, then tools/fit-board.py <id>, then this again.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMMON_TYPES = {
  start: { name: 'Front Gate', icon: 'gate', text: 'Pass the gate: +5 tickets.' },
  ticket: { name: 'Ticket Stand', icon: 'ticket', text: '+3 tickets.' },
  pit: { name: 'Mud Puddle', icon: 'puddle', text: 'Lose 3 tickets.' },
  chance: { name: 'Wheel of Whatever', icon: 'wheel', text: 'The wheel spins: tap to stop it on a surprise.' },
  booth: { name: 'Prize Booth', icon: 'ribbon', text: 'Pass by with 10 tickets and you buy a ribbon.' },
  mirror: { name: 'Hall of Mirrors', icon: 'mirror', text: 'Swap places with another player.' },
  jackpot: { name: 'Jackpot', icon: 'star', text: '+8 tickets.' },
  fork: { name: 'Crossroads', icon: 'fork', text: 'Choose your way.' },
  join: { name: 'Ticket Stand', icon: 'ticket', text: '+3 tickets.' },
  duck: { name: 'Duck Pond', icon: 'duck', text: 'Pick one of three ducks: each hides 1 to 10 tickets.' },
  duel: { name: 'Dice Duel', icon: 'dice', text: 'You and a rival both tap to roll: the higher roll takes 4 tickets.' },
  bumper: { name: 'Bumper Cart', icon: 'cart', text: 'Zoom 3 spaces ahead.' },
  ghost: { name: 'Friendly Ghost', icon: 'ghost', text: 'Boo! A ghost whisks you somewhere else on the loop.' },
  // round 12 (2026-10-24): live events everyone watches, and the cannon
  striker: { name: 'High Striker', icon: 'hammer', text: 'Tap when the power bar is at the top. Ring the bell for 8 tickets and a prize card.' },
  shell: { name: 'Shell Game', icon: 'cups', text: 'Hide the pea, the cups shuffle, a rival guesses: 3 tickets to whoever wins.' },
  pact: { name: 'Steal or Share', icon: 'hands', text: 'You and a rival each pick in secret. Both share: 3 each. One steals: 6 to the thief. Both steal: both lose 2.' },
  crowd: { name: 'Tomato Toss', icon: 'tomato', text: 'Everyone throws a tomato at someone: the most-hit player goes back 3 spaces.' },
  fortune: { name: 'Fortune Teller', icon: 'card', text: 'Pick one of three face-down cards: a prize card or tickets.' },
  cannon: { name: 'Cannon', icon: 'cannon', text: 'BOOM! Fired across the fair to its landing pad.' },
};

const BOARDS = [
  {
    id: 'fairground', title: 'The Fairground Loop', backdrop: 'board-fairground-loop', seasonBackdrops: { halloween: 'board-fairground-loop-halloween' }, N: 24, RX: 15.5, RZ: 11.5, sq: 0.72,
    about: 'Starter board. Walk the loop, pick up tickets, buy prize ribbons at the two booths. The shortcut through the middle saves six spaces and has two puddles and the jackpot on it.',
    // the loop, clockwise from the gate at the bottom (round 5: five ticket stands became a duck pond, dice duels and a bumper cart)
    // round 12: a High Striker, Fortune Teller, Shell Game, Steal or Share and Tomato Toss took over passive spaces, the
    // last puddle became a cannon that fires you over the gate to the High Striker, and the shortcut costs 3 tickets
    loop: ['start', 'ticket', 'chance', 'striker', 'fork', 'pit', 'ticket', 'booth', 'duel', 'fortune', 'pit', 'bumper',
      'mirror', 'shell', 'chance', 'join', 'duck', 'pact', 'ticket', 'booth', 'crowd', 'duel', 'cannon', 'ticket'],
    short: ['pit', 'chance', 'jackpot', 'pit'], from: 4, to: 15, bow: 1.5, labels: ['The long way', 'The shortcut'], toll: 3,
    cannons: [[22, 3]],
    types: {},
  },
  {
    id: 'pier', title: 'Moonlit Pier', backdrop: 'board-pier', guideField: '#2a4a7a', N: 26, RX: 15.5, RZ: 12, sq: 0.55,
    about: 'Round 5 (2026-10-22): a spooky-but-friendly seaside pier at night. Friendly ghosts whisk you about, and the Ghost Train tunnel straight up the middle is quick but haunted.',
    loop: ['start', 'ticket', 'duck', 'chance', 'striker', 'fork', 'ticket', 'booth', 'ghost', 'shell', 'duel', 'pit', 'bumper',
      'mirror', 'join', 'crowd', 'pit', 'booth', 'pact', 'ghost', 'fortune', 'duel', 'chance', 'cannon', 'ticket', 'bumper'],
    short: ['ghost', 'chance', 'jackpot', 'ghost'], from: 5, to: 13, bow: 0, labels: ['Along the pier', 'The Ghost Train'], toll: 3,
    cannons: [[23, 2]],
    types: {
      start: { name: 'Pier Gate', icon: 'gate', text: 'Pass the gate: +5 tickets.' },
      pit: { name: 'Wave Splash', icon: 'puddle', text: 'A wave soaks you: lose 3 tickets.' },
      bumper: { name: 'Bumper Boat', icon: 'cart', text: 'Zoom 3 spaces ahead.' },
      cannon: { name: 'Pier Cannon', icon: 'cannon', text: 'BOOM! Fired along the pier, over the gate, to the Duck Pond.' },
      striker: { name: 'Strongman Bell', icon: 'hammer', text: 'Tap when the power bar is at the top. Ring the bell for 8 tickets and a prize card.' },
    },
  },
];

function build(B) {
  const spaces = [];
  for (let i = 0; i < B.N; i++) {
    const a = Math.PI + i * Math.PI * 2 / B.N;                  // start at the bottom (toward the camera), go clockwise
    const sq = v => Math.sign(v) * Math.pow(Math.abs(v), B.sq); // squash the ellipse toward a rounded rectangle
    spaces.push({ id: 's' + i, type: B.loop[i], x: +(sq(Math.sin(a)) * B.RX).toFixed(2), z: +(-sq(Math.cos(a)) * B.RZ).toFixed(2), next: ['s' + (i + 1) % B.N] });
  }
  const from = spaces[B.from], to = spaces[B.to];
  B.short.forEach((type, k) => { const t = (k + 1) / (B.short.length + 1); spaces.push({ id: 'c' + k, type, x: +(from.x + (to.x - from.x) * t).toFixed(2), z: +(from.z + (to.z - from.z) * t + Math.sin(t * Math.PI) * B.bow).toFixed(2), next: [k === B.short.length - 1 ? to.id : 'c' + (k + 1)] }); });
  from.next = ['s' + (B.from + 1), 'c0']; from.labels = B.labels; from.type = 'fork';
  if (B.toll) from.toll = [0, B.toll];                                 // round 12: what each way costs (board.js mod 'toll' can change it)
  for (const [a, b] of B.cannons || []) spaces[a].to = 's' + b;        // round 12: a cannon fires you to its landing pad
  const FIT = fileURLToPath(new URL(`../data/boards/${B.id}-fit.json`, import.meta.url));
  if (existsSync(FIT)) { const fit = JSON.parse(readFileSync(FIT, 'utf8')); for (const s of spaces) if (fit[s.id]) [s.x, s.z] = fit[s.id]; }
  const board = { id: B.id, title: B.title, backdrop: B.backdrop, ...(B.guideField ? { guideField: B.guideField } : {}), ...(B.seasonBackdrops ? { seasonBackdrops: B.seasonBackdrops } : {}), size: 40, start: 's0', about: B.about, types: { ...COMMON_TYPES, ...B.types }, spaces };
  writeFileSync(fileURLToPath(new URL(`../data/boards/${B.id}.json`, import.meta.url)), JSON.stringify(board, null, 1) + '\n');
  console.log(`${B.id}: ${spaces.length} spaces`);
}
for (const B of BOARDS) build(B);
