// Stream E — play-test 5, T25 ANGLING: the text content (data/provinces/angling.json) and the angler job frames.
// Every reference resolves, a newcomer has something to catch, every zone has a legend, every town an angler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const A = J('data/provinces/angling.json');
const PROV = J('data/provinces/torbor_downs.json');
const SHOPS = J('data/provinces/shops.json');
const JOBS = J('data/quests/jobs.json');
const enemies = J('../farhold/data/enemies.json');
const BESTIARY = new Set([...enemies.enemies, ...enemies.bosses].map(e => e.id));
/** the banned-name list of tests/E/content.test.js (read from its source, so importing it does not run its tests here) */
const BANNED = (() => { const src = readFileSync(new URL('tests/E/content.test.js', root), 'utf8'); const a = src.indexOf('export const BANNED = ['), b = src.indexOf('];', a); return JSON.parse(src.slice(a + 21, b + 1).replace(/'/g, '"').replace(/\s+/g, ' ')); })();

const WATERS = ['river', 'lake', 'marsh', 'coast'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic'];
const TIMES = ['any', 'day', 'night', 'dawn', 'dusk'];
const FISH = new Map(A.fish.map(f => [f.id, f]));
const overlaps = (a, b) => a[0] <= b[1] && b[0] <= a[1];
const inZone = (band, water, skill = 100) => A.fish.filter(f => f.water.includes(water) && overlaps(f.bands, band) && f.skill <= skill && !f.pool);
function* strings(v, path = '') { if (typeof v === 'string') yield [path, v]; else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== '_doc') yield* strings(x, `${path}.${k}`); }

test('T25 fish: 40+ original fish, well-formed, unique ids and names, every water kind has nine or more', () => {
  assert.ok(A.fish.length >= 40, `only ${A.fish.length} fish`);
  const ids = new Set(), names = new Set();
  for (const f of A.fish) {
    assert.match(f.id, /^[a-z][a-z0-9_]*$/, f.id);
    assert.ok(!ids.has(f.id), 'duplicate id ' + f.id); ids.add(f.id);
    assert.ok(!names.has(f.name), 'duplicate name ' + f.name); names.add(f.name);
    assert.ok(f.desc && f.desc.length >= 10 && f.desc.length <= 110 && !f.desc.includes('\n'), f.id + ' needs a one-line desc');
    assert.ok(f.water.length && f.water.every(w => WATERS.includes(w)), f.id + ' water');
    assert.ok(f.bands[0] >= 1 && f.bands[0] <= f.bands[1], f.id + ' bands');
    assert.ok(TIMES.includes(f.time), f.id + ' time');
    assert.ok(RARITIES.includes(f.rarity), f.id + ' rarity');
    assert.ok(f.size[0] > 0 && f.size[0] < f.size[1], f.id + ' size');
    assert.ok(f.price > 0 && f.skill >= 0 && f.skill <= 90, f.id + ' price / skill');
  }
  for (const w of WATERS) assert.ok(A.fish.filter(f => f.water.includes(w)).length >= 9, `${w}: fewer than 9 fish`);
  for (const t of TIMES) assert.ok(A.fish.some(f => f.time === t), `no fish bites at ${t}`);
  for (const r of RARITIES) assert.ok(A.fish.some(f => f.rarity === r), `no ${r} fish`);
  assert.ok(FISH.has('silver_perch'), 'the brief names the silver perch');
});

test('T25 fish: rarer fish need more skill and sell for more (on average)', () => {
  const avg = (r, k) => { const l = A.fish.filter(f => f.rarity === r); return l.reduce((a, f) => a + f[k], 0) / l.length; };
  for (let i = 1; i < RARITIES.length; i++) for (const k of ['skill', 'price']) assert.ok(avg(RARITIES[i], k) > avg(RARITIES[i - 1], k), `${RARITIES[i]} ${k}`);
});

test('T25 fish: a newcomer in the first zone has four or more fish in the river and in the lake; every zone has four in every water at low skill', () => {
  const first = PROV.zones.test.band;
  for (const w of ['river', 'lake']) assert.ok(inZone(first, w, 5).length >= 4, `first zone ${w}: ${inZone(first, w, 5).map(f => f.id)}`);
  for (const [id, z] of Object.entries(PROV.zones)) for (const w of WATERS) {
    assert.ok(inZone(z.band, w, 10).length >= 4, `${id} ${w} at skill 10: ${inZone(z.band, w, 10).map(f => f.id)}`);
    assert.ok(inZone(z.band, w).length >= 6, `${id} ${w} at any skill`);
  }
});

test('T25 legends: exactly one per zone of the province, each with a title and a trophy', () => {
  const zones = Object.keys(PROV.zones);
  assert.deepEqual(A.legends.map(l => l.zone).sort(), zones.slice().sort());
  const ids = new Set();
  for (const l of A.legends) {
    assert.ok(!ids.has(l.id) && !FISH.has(l.id), l.id); ids.add(l.id);
    assert.ok(l.name && l.desc && l.title && l.trophy && l.trophy.name && l.trophy.desc, l.id);
    assert.ok(WATERS.includes(l.water) && TIMES.includes(l.time) && l.skill > 0 && l.skill <= 100, l.id);
  }
  assert.equal(new Set(A.legends.map(l => l.title)).size, A.legends.length, 'titles are unique');
  assert.ok(A.legends.find(l => l.zone === 'test').skill <= 20, 'the first zone legend is reachable early');
});

test('T25 junk, crates and things that pull back', () => {
  assert.ok(A.junk.length >= 10);
  for (const j of A.junk) assert.ok(j.id && j.name && j.desc && j.price >= 0 && !FISH.has(j.id), j.id);
  assert.ok(A.crates.chance > 0 && A.crates.chance < 0.2 && A.crates.crate.slot && A.crates.crate.min);
  for (const p of A.pullBack) { assert.ok(BESTIARY.has(p.type), 'unknown monster type ' + p.type); assert.ok(WATERS.includes(p.water) && p.bands[0] <= p.bands[1]); }
  for (const w of WATERS) for (const z of Object.values(PROV.zones)) assert.ok(A.pullBack.some(p => p.water === w && overlaps(p.bands, z.band)), `${w}: nothing pulls back at band ${z.band}`);
});

test('T25 cooking: every recipe resolves to fish and a meal; meals use the shop food shape and known buff stats', () => {
  const stats = new Set(Object.values(SHOPS.goodsCatalog).map(g => g && g.use && g.use.buff && g.use.buff.stat).filter(Boolean));
  const tags = new Set(['any', ...WATERS, ...RARITIES]);
  assert.ok(Object.keys(A.meals).length >= 10);
  for (const [id, m] of Object.entries(A.meals)) {
    assert.ok(!SHOPS.goodsCatalog[id], id + ' collides with a shop good');
    assert.ok(m.name && m.desc && m.use.type === 'food' && m.use.regen > 0 && m.use.seconds > 0, id);
    if (m.use.buff) assert.ok(stats.has(m.use.buff.stat) && m.use.buff.amount > 0 && m.use.buff.minutes > 0, `${id}: buff ${m.use.buff.stat}`);
    assert.ok(A.recipes.some(r => r.makes === id), id + ' has no recipe');
  }
  const ids = new Set();
  for (const r of A.recipes) {
    assert.ok(!ids.has(r.id), r.id); ids.add(r.id);
    assert.ok(A.meals[r.makes], `${r.id}: makes ${r.makes}`);
    assert.ok(r.needs.length && r.skill >= 0, r.id);
    for (const n of r.needs) { assert.ok(n.count >= 1); assert.ok(n.fish ? FISH.has(n.fish) : tags.has(n.tag), `${r.id}: ${n.fish || n.tag}`); }
  }
  assert.ok(A.recipes.some(r => r.skill === 0 && r.needs.length === 1 && r.needs[0].tag === 'any' && r.needs[0].count === 1), 'a first recipe from one fish of any kind');
});

test('T25 rods, bait and anglers: an angler in every shop town, the Torborhold one gives the first quest, everything they sell exists', () => {
  const sold = new Set([...A.tools, ...(A.bait || [])].map(t => t.id));
  assert.ok(A.tools.some(t => t.id === 'angling_rod' && t.minSkill === 0));
  assert.ok(A.tools.length >= 3);
  const towns = Object.entries(SHOPS.towns).filter(([, t]) => t && t.zone);
  for (const [town, t] of towns) {
    const a = A.anglers.filter(x => x.town === town);
    assert.equal(a.length, 1, town + ' needs one angler');
    assert.equal(a[0].zone, t.zone, town);
    assert.ok(a[0].name && a[0].greeting && a[0].buysFish, town);
    assert.ok(a[0].sells.includes('angling_rod') && a[0].sells.every(s => sold.has(s)), town + ' sells');
  }
  assert.equal(new Set(A.anglers.map(a => a.id)).size, A.anglers.length);
  assert.equal(new Set(A.anglers.map(a => a.name)).size, A.anglers.length);
  assert.equal(A.anglers.find(a => a.id === 'angler_torborhold').quest, 'angle_first_cast');
  assert.equal(A.skill.ranks.length, 5);
});

test('T25 angler jobs: four or more frames with a catch goal, fish targets resolve, each binds in the first zone', () => {
  const frames = JOBS.frames.filter(f => f.goal.kind === 'catch');
  assert.ok(frames.length >= 4, `${frames.length} angler frames`);
  for (const f of frames) {
    assert.ok(f.needs.some(n => n.type === 'fish'), f.id + ': needs a fish slot (so it is never offered before the server can count a catch)');
    for (const n of f.needs.filter(n => n.type === 'fish')) {
      if (n.id) { assert.ok(FISH.has(n.id), `${f.id}: ${n.id}`); continue; }
      const cands = A.fish.filter(x => overlaps(x.bands, PROV.zones.test.band) && (!n.rarity || n.rarity.includes(x.rarity)) && (n.maxSkill == null || x.skill <= n.maxSkill));
      assert.ok(cands.length >= 1, `${f.id}: no fish binds in the first zone`);
    }
    const t = f.goal.target;
    assert.ok(t === 'any' || t === 'junk' || /^\{\w+\.id\}$/.test(t) || FISH.has(t), `${f.id}: target ${t}`);
    assert.ok(f.goal.count >= 1 && f.where && f.reward.xp > 0, f.id);
  }
  assert.ok(frames.some(f => f.needs.some(n => n.id === 'silver_perch') && f.goal.count === 3), 'the brief\'s "bring 3 silver perch"');
});

test('T25 banned names: none in the angling file or the angler frames (whole words, plus ember / veil / muster anywhere)', () => {
  const bad = [];
  const sources = { angling: A, frames: JOBS.frames.filter(f => f.goal.kind === 'catch') };
  for (const [src, d] of Object.entries(sources)) for (const [p, s] of strings(d)) {
    for (const w of BANNED) if (new RegExp(`(^|[^A-Za-z])${w.replace(/[+]/g, '\\+')}($|[^A-Za-z])`, 'i').test(s)) bad.push(`${src}${p}: ${w}`);
    for (const w of ['ember', 'veil', 'muster']) if (new RegExp(w, 'i').test(s)) bad.push(`${src}${p}: ${w}`);
  }
  assert.ok(BANNED.length > 40, 'the list was read');
  assert.deepEqual(bad, []);
});
