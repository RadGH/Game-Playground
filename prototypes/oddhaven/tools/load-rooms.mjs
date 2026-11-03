#!/usr/bin/env node
// How much a room costs, measured on a real server process over real sockets. Fake players: each focuses a street, plays someone, walks and drives at the page's real message rate.
//   node tools/load-rooms.mjs [rooms] [players] [seconds] [--drive] [--no-deflate]     --drive: everyone reports at a driver's rate. WARM=25 seconds before the count starts
// Prints the server's CPU as a share of one core (from /proc, so it counts everything: sim, JSON, sockets), its memory, and the bytes each player received and sent.
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number), [roomsN = 1, playersN = 2, seconds = 30] = nums;
const port = 8568, server = new URL('../server/main.mjs', import.meta.url).pathname;
const child = spawn(process.execPath, [server, '--port', String(port), '--dev', '--max-rooms', String(roomsN + 2), '--data', mkdtempSync(join(tmpdir(), 'oddload-')), ...(process.argv.includes('--no-deflate') ? ['--no-deflate'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => { child.stdout.on('data', d => { if (String(d).includes('on http')) r(); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Seconds on a CPU, every thread: the scheduler's own count, in nanoseconds. /proc/pid/stat counts in 10 ms ticks and over-reports something that wakes twenty times a second. */
const cpuSeconds = () => readdirSync(`/proc/${child.pid}/task`).reduce((a, t) => { try { return a + +readFileSync(`/proc/${child.pid}/task/${t}/schedstat`, 'utf8').split(' ')[0] / 1e9; } catch { return a; } }, 0);
const rss = () => Math.round(+readFileSync(`/proc/${child.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024);
const players = [];
function player(code, i, r) {
  return new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), p = { ws, in: 0, out: 0, msgs: 0, snaps: 0, snapBytes: 0, code: null, id: null };
    const send = m => { const t = JSON.stringify(m); p.out += t.length; if (ws.readyState === 1) ws.send(t); };
    p.send = send;
    ws.on('open', () => { send({ type: 'hello', v: 1, token: `load-${r}-${i}-0123456789`, name: `L${i}` }); send({ type: 'join', code, create: { seed: 11 + r } }); });
    ws.on('message', d => { p.in += d.length; p.msgs++; const m = JSON.parse(d); if (m.type === 'snap') { p.snaps++; p.snapBytes += d.length; } if (m.type === 'ready') { p.roster = m.roster; p.id = m.you; p.join = d.length; res(p); } });
    players.push(p);
  });
}
const started = performance.now();
for (let r = 0; r < roomsN; r++) for (let i = 0; i < playersN; i++) await player(`L${r}`, i, r);
console.log(`joined ${players.length} players in ${Math.round(performance.now() - started)} ms; a join is ${Math.round(players[0].join / 1024)} KB before squeezing; server ${rss()} MB`);
// everyone starts near a different person, in the middle of town, and walks in a circle at the rate hands.js does: 4 a second on foot, 8 at the wheel
players.forEach((p, i) => { const pl = p.roster.places[(i * 37) % p.roster.places.length]; p.x = pl.x; p.z = pl.z; p.me = (i * 13 + 5) % 300; p.send({ type: 'control', on: true }); p.send({ type: 'cmd', cmd: { kind: 'take', who: p.me } }); });
await sleep(1000);
let beat = 0;
const walkers = setInterval(() => { beat++; for (const [i, p] of players.entries()) { const a = beat / 20 + i; p.send({ type: 'cmd', cmd: { kind: 'pos', people: [[p.me, +(p.x + Math.cos(a) * 12).toFixed(2), +(p.z + Math.sin(a) * 12).toFixed(2), +a.toFixed(2)]] } }); if (beat % 2 === 0) p.send({ type: 'cmd', cmd: { kind: 'focus', points: [{ x: p.x, z: p.z }], party: [p.me] } }); if (beat % 8 === 0) p.send({ type: 'ping', t: performance.now() }); } }, process.argv.includes('--drive') ? 125 : 250);
await sleep(Number(process.env.WARM ?? 25) * 1000);      // the first seconds are the JIT warming up and the whole town waking at 06:00
for (const p of players) { p.in = 0; p.out = 0; p.msgs = 0; p.snaps = 0; p.snapBytes = 0; }
const t0 = cpuSeconds(), w0 = performance.now();
await sleep(seconds * 1000);
const wall = (performance.now() - w0) / 1000, cpu = cpuSeconds() - t0, n = players.length;
clearInterval(walkers);
const inK = players.reduce((a, p) => a + p.in, 0) / n / wall / 1024, outK = players.reduce((a, p) => a + p.out, 0) / n / wall / 1024, snapAvg = players.reduce((a, p) => a + p.snapBytes, 0) / Math.max(1, players.reduce((a, p) => a + p.snaps, 0));
console.log(JSON.stringify({ rooms: roomsN, players: playersN, seconds: Math.round(wall), cpuPctOfOneCore: +(cpu / wall * 100).toFixed(2), cpuPerRoom: +(cpu / wall * 100 / roomsN).toFixed(2), rssMB: rss(), downKBs: +inK.toFixed(2), upKBs: +outK.toFixed(2), avgSnapBytes: Math.round(snapAvg) }));
for (const p of players) p.ws.terminate();
child.kill();
process.exit(0);
