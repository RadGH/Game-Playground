// Wandering packs + wild events (owner 2026-10-16): the DATA — data/provinces/packs.json, vharlen-packs.json and the routes
// tools/content-packs.mjs writes (pack-routes.json, vharlen-pack-routes.json). Every route is walkable and stays out of
// towns, villages, quest givers' yards, waystones and dungeon doors (js/sim/pack-routes.js routeProblem, on the real
// bake); a pack is only ever made of its zone's own kinds; 5-10 bodies; original names, plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadLayouts } from '../../server/load.mjs';
import { keepOutOf, routeProblem } from '../../js/sim/pack-routes.js';
import { provinceDataSync } from '../../js/sim/province-files.js';
import { rulesEngine } from '../../js/rules/index.js';

const J = p => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const readJ = f => J(f);
const BESTIARY = (() => { const b = rulesEngine().bestiary; return new Set([...b.enemies, ...b.bosses].map(d => d.id)); })();
const MODS = new Set((rulesEngine().bestiary.modifiers || []).map(m => m.id));
// CLAUDE.md convention 9 (+ the playground's own), whole word; "ember"/"veil"/"muster"/"horde" never even inside a word
const BANNED = ['Heroic', 'Mythic', 'keystone', 'War Mode', 'Alliance', 'Hearthstone', 'Delve', 'Renown', 'Rested XP', 'Honored', 'Revered', 'Exalted', 'Fury', 'Focus', 'Rage', 'combo points',
  'Garrote', 'Cheap Shot', 'Prowl', 'Maul', 'Rake', 'Barkskin', 'Blink', 'Counterspell', 'Consecration', 'Last Stand', 'Hellfire', 'Starfall', 'soulbound', 'flight path', 'attunement', 'Chi'];
const SUB = ['ember', 'veil', 'muster', 'horde'];
const banned = t => [...BANNED.filter(w => new RegExp(`(^|[^A-Za-z])${w}($|[^A-Za-z])`, 'i').test(t)), ...SUB.filter(w => new RegExp(w, 'i').test(t))];
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k !== '_doc' && !/^_/.test(k)) strings(v, out); return out; };

const PROVS = [['torbor_downs', 'data/provinces/pack-routes.json'], ['vharlen', 'data/provinces/vharlen-pack-routes.json']];

test('compositions: every body is a real monster, every leader a real elite with real modifiers, 5-10 bodies, original names', () => {
  for (const [prov] of PROVS) {
    const P = provinceDataSync(readJ, prov, 'packs');
    assert.ok(P && P.rules && P.compositions && P.events && P.eventText && P.eventMonsters, prov + ': rules, compositions, events, their words and their bodies');
    for (const [id, C] of Object.entries(P.compositions)) {
      for (const m of C.members) assert.ok(BESTIARY.has(m.type), `${prov} ${id}: ${m.type} is a monster`);
      const lo = C.members.reduce((a, m) => a + m.count[0], 0), hi = C.members.reduce((a, m) => a + m.count[1], 0);
      const [smin, smax] = C.size || P.rules.size;
      assert.ok(smin === 5 && smax === 10, 'the owner\'s 5-10');
      assert.ok(hi >= 4 && lo <= 9, `${prov} ${id}: ${lo}-${hi} members (with a leader: 5-10 after the clamp)`);
      if (C.leader) {
        assert.ok(BESTIARY.has(C.leader.type), `${prov} ${id}: its leader ${C.leader.type}`);
        for (const a of C.leader.affixes) assert.ok(MODS.has(a) || a === 'packleader', `${prov} ${id}: modifier ${a}`);
        assert.ok(C.leader.affixes.includes('packleader'), 'a leader carries the Pack-leader mark (the client hangs its banner on it)');
        assert.ok((C.leader.names || []).length >= 2, `${prov} ${id}: names for its leader`);
        assert.ok(['rout', 'enrage'].includes(C.onLeaderFall), `${prov} ${id}: what its leader's fall does`);
      }
      assert.ok(['hunt', 'graze', 'camp', 'rite', 'march'].includes(C.doing), `${prov} ${id}: what it does at a rest`);
      if (C.doing === 'hunt') assert.ok(BESTIARY.has(C.prey), `${prov} ${id}: its quarry ${C.prey}`);
    }
    for (const t of P.eventMonsters.rift) { for (const x of [...t.types, t.guardian]) assert.ok(BESTIARY.has(x), `${prov} rift: ${x}`); }
    for (const w of P.eventMonsters.warlords) assert.ok(BESTIARY.has(w.type) && w.names.length >= 2, `${prov} warlord ${w.type}`);
    const bad = strings({ c: P.compositions, t: P.eventText, m: P.eventMonsters }).filter(s => banned(s).length);
    assert.deepEqual(bad, [], prov + ': no banned word in any name or line');
  }
  const V = J('data/provinces/vharlen-packs.json');
  const torborOnly = new Set(Object.values(J('data/provinces/packs.json').compositions).flatMap(c => [...c.members.map(m => m.type), c.leader && c.leader.type]).filter(Boolean));
  const tv = new Set(J('data/rules/monsters-tv.json').monsters.map(m => m.id));
  for (const C of Object.values(V.compositions)) for (const t of [...C.members.map(m => m.type), C.leader && C.leader.type, C.prey].filter(Boolean)) assert.ok(tv.has(t), `Vharlen's packs are the island's own bodies (${t})`);
  void torborOnly;
});

test('routes: every route of both provinces is walkable, out of the water, and clear of towns, villages, givers, waystones, doors and arenas', async () => {
  const log0 = console.log; console.log = () => {};
  let L;
  try { L = await loadLayouts(PROVS.map(p => p[0])); } finally { console.log = log0; }
  for (const [i, [prov, file]] of PROVS.entries()) {
    const lay = L.layouts[i];
    const R = J(file).routes;
    const zones = lay.zones.map(z => ({ key: z.key, bounds: z.bounds }));
    const keepOut = keepOutOf(lay);
    const per = {};
    for (const r of R) {
      const bad = routeProblem(r, { terrain: lay.terrain, keepOut, zones });
      assert.equal(bad, null, `${prov} ${r.id}: ${bad && bad.why} at ${bad && Math.round(bad.x)}, ${bad && Math.round(bad.z)}`);
      per[r.zone] = (per[r.zone] || 0) + 1;
      assert.ok(r.length >= 300 && r.length <= 4000, `${r.id}: a lap of ${r.length} m`);
      assert.ok((r.rests || []).every(k => k > 0 && k < r.pts.length), `${r.id}: rests on its own waypoints`);
      // only the zone's own kinds: every member of every composition it lists is in the camps of the zones it crosses
      const camps = new Map();
      for (const c of lay.camps) { const z = zones.find(q => c.x >= q.bounds.minX && c.x < q.bounds.maxX && c.z >= q.bounds.minZ && c.z < q.bounds.maxZ); if (z && r.zones.includes(z.key) && !c.encounter) camps.set(c.type, (camps.get(c.type) || 0) + (c.count || 1)); }
      const C = lay.packs.compositions;
      for (const id of Object.keys(r.comps)) for (const m of C[id].members) assert.ok((camps.get(m.type) || 0) >= 12, `${r.id}: ${id} brings ${m.type}, which its zone holds`);
    }
    for (const z of lay.zones) assert.ok((per[z.key] || 0) >= 6, `${prov} ${z.key}: ${per[z.key] || 0} packs walk it`);
    const kinds = new Set(R.map(r => r.kind));
    for (const k of ['road', 'valley', 'open', 'cross']) assert.ok(kinds.has(k), `${prov}: some packs walk ${k} ground`);
    assert.ok(R.some(r => r.zones.length > 1), prov + ': some walk between zones');
  }
});

test('the routes file is what the tool makes today (nobody edited one without the other)', { timeout: 120000 }, () => {
  for (const [prov] of PROVS) {
    const out = execFileSync(process.execPath, [new URL('../../tools/content-packs.mjs', import.meta.url).pathname, '--check', '--province=' + prov], { encoding: 'utf8' });
    assert.match(out, /is up to date/, out);
  }
});
