// Feedback batch read 2026-10-21 — the interface side: the calling picker's catalog (#98), town sizes and the cart window
// (#101, #105), every city's shops (#101), the map arrow's facing (#111).
// Run: node --test prototypes/thousandvale/tests/D/feedback-tv21-ui.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectMarkers } from '../../js/client/ui/map-data.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (tool, ...a) => execFileSync(process.execPath, [join(GAME, 'tools', tool), ...a], { cwd: GAME, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const J = f => JSON.parse(readFileSync(join(GAME, f), 'utf8'));

test('#98: the calling picker\'s catalog is what the game writes for each class\'s six skills (and is up to date)', () => {
  run('class-catalog.mjs', '--check');
  const C = J('data/rules/class-catalog.json').classes;
  assert.ok(Object.keys(C).length >= 32);
  for (const [id, c] of Object.entries(C)) {
    assert.equal(c.skills.length, 6, id);
    for (const s of c.skills) assert.ok(s.name && s.desc && s.desc.length > 20 && Number.isFinite(s.level), `${id}/${s.id}`);
  }
  assert.equal(C.tactician.role, 'Battlefield Commander');
  assert.ok(C.paladin.skills.some(s => s.name === "Mercy's Touch"), 'Thousandvale\'s own swaps');
});

test('#101 / #105: every settlement has a size; every city and capital has every shop; the cart window says who works there', async () => {
  run('content-town-info.mjs', '--check');
  run('content-cities.mjs', '--check');
  run('content-cities.mjs', '--check', '--province=vharlen');
  const T = J('data/world/town-info.json').towns;
  const sizes = new Set(Object.values(T).map(t => t.size));
  for (const s of ['hamlet', 'village', 'town', 'city', 'capital']) assert.ok(sizes.has(s), s);
  const carts = J('data/provinces/carts.json').stops;
  for (const s of carts) assert.ok(T[s.town], `cart stop ${s.town} has a size`);
  const { CITY_SHOPS } = await import('../../tools/content-cities.mjs');
  const shopRole = { general: 'general', market: 'market', stable: 'stable', inn: 'inn' };
  for (const [name, t] of Object.entries(T)) if (t.size === 'city' || t.size === 'capital') for (const k of CITY_SHOPS) assert.ok(t.services.includes(shopRole[k] || k), `${name} (${t.size}) has a ${k}`);
  // the words (no DOM needed: cart-travel.js exports the rule)
  globalThis.fetch ||= async () => ({ ok: false });
  const { whoWorks } = await import('../../js/client/ui/cart-travel.js');
  const w = whoWorks(T.Ashcombe.services);
  assert.match(w.short, /^Inn · Merchant · Smith · Healer · Stable/); assert.match(w.short, /\+\d+ more$/);
  assert.match(whoWorks([]).short, /Nobody to trade with/);
});

test('#111: the map arrow carries your facing (it always pointed south: the marker dropped `yaw`)', () => {
  const m = collectMarkers({ model: { pois: [], settlements: [], sites: new Map(), zones: new Map() }, room: null, me: { x: 10, z: 20, yaw: 1.3 } }).find(x => x.kind === 'me');
  assert.equal(m.yaw, 1.3);
});
