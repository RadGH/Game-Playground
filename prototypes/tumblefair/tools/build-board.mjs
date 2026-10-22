#!/usr/bin/env node
// Writes data/boards/fairground.json: the starter board. A loop of 24 spaces round the fairground with one risky
// shortcut across the middle. Edit the tables here and re-run; the game only ever reads the JSON.
//   node tools/build-board.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const N = 24, RX = 15.5, RZ = 11.5;
// the loop, clockwise from the gate at the bottom
// (round 5: five ticket stands became a duck pond, dice duels and a bumper cart)
const LOOP = ['start', 'ticket', 'chance', 'duck', 'fork', 'pit', 'ticket', 'booth', 'duel', 'chance', 'pit', 'bumper',
  'mirror', 'ticket', 'chance', 'join', 'duck', 'pit', 'ticket', 'booth', 'chance', 'duel', 'pit', 'ticket'];
const SHORT = ['pit', 'chance', 'jackpot', 'pit'];            // the shortcut: 4 spaces instead of 12, two of them bad
const spaces = [];
for (let i = 0; i < N; i++) {
  const a = Math.PI + i * Math.PI * 2 / N;                    // start at the bottom (toward the camera), go clockwise
  const sq = v => Math.sign(v) * Math.pow(Math.abs(v), 0.72); // squash the ellipse toward a rounded rectangle
  spaces.push({ id: 's' + i, type: LOOP[i], x: +(sq(Math.sin(a)) * RX).toFixed(2), z: +(-sq(Math.cos(a)) * RZ).toFixed(2), next: ['s' + (i + 1) % N] });
}
const from = spaces[4], to = spaces[15];          // s15: where the shortcut painted in the backdrop meets the loop
SHORT.forEach((type, k) => { const t = (k + 1) / (SHORT.length + 1); spaces.push({ id: 'c' + k, type, x: +(from.x + (to.x - from.x) * t).toFixed(2), z: +(from.z + (to.z - from.z) * t + Math.sin(t * Math.PI) * 1.5).toFixed(2), next: [k === SHORT.length - 1 ? to.id : 'c' + (k + 1)] }); });
from.next = ['s5', 'c0']; from.labels = ['The long way', 'The shortcut'];
// Positions fitted onto the path painted in the backdrop (tools/fit-board.py) win over the formula above.
const FIT = fileURLToPath(new URL('../data/boards/fairground-fit.json', import.meta.url));
if (existsSync(FIT)) { const fit = JSON.parse(readFileSync(FIT, 'utf8')); for (const s of spaces) if (fit[s.id]) [s.x, s.z] = fit[s.id]; }
const board = {
  id: 'fairground', title: 'The Fairground Loop', backdrop: 'board-fairground-loop', size: 40, start: 's0',
  about: 'Starter board. Walk the loop, pick up tickets, buy prize ribbons at the two booths. The shortcut through the middle saves six spaces and has two puddles and the jackpot on it.',
  types: {
    start: { name: 'Front Gate', icon: 'gate', text: 'Pass the gate: +5 tickets.' },
    ticket: { name: 'Ticket Stand', icon: 'ticket', text: '+3 tickets.' },
    pit: { name: 'Mud Puddle', icon: 'puddle', text: 'Lose 3 tickets.' },
    chance: { name: 'Wheel of Whatever', icon: 'wheel', text: 'Spin for a surprise.' },
    booth: { name: 'Prize Booth', icon: 'ribbon', text: 'Pass by with 10 tickets to buy a ribbon.' },
    mirror: { name: 'Hall of Mirrors', icon: 'mirror', text: 'Swap places with another player.' },
    jackpot: { name: 'Jackpot', icon: 'star', text: '+8 tickets.' },
    fork: { name: 'Crossroads', icon: 'fork', text: 'Choose your way.' },
    join: { name: 'Ticket Stand', icon: 'ticket', text: '+3 tickets.' },
    duck: { name: 'Duck Pond', icon: 'duck', text: 'Pick one of three ducks: each hides 1 to 10 tickets.' },
    duel: { name: 'Dice Duel', icon: 'dice', text: 'Roll against another player: the higher roll takes 4 tickets.' },
    bumper: { name: 'Bumper Cart', icon: 'cart', text: 'Zoom 3 spaces ahead.' },
  },
  spaces,
};
writeFileSync(fileURLToPath(new URL('../data/boards/fairground.json', import.meta.url)), JSON.stringify(board, null, 1) + '\n');
console.log(`fairground: ${spaces.length} spaces`);
