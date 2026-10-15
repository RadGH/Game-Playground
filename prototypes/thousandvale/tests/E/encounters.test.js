// node --test prototypes/thousandvale/tests/E/encounters.test.js
// Stream E's encounter content (data/encounters/*: the M1 bosses, mini-bosses, elite, rares, the zone
// event boss and per-type specials) — validated by C's own validator and FOUGHT in C's real engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { engineFor, roomFor } from '../C/setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { attachEncounters, validateEncounters } from '../../js/rules/encounter.js';
import { makeRng } from '../../js/rules/rng.js';

const DIR = new URL('../../data/encounters/', import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const INDEX = read('index.json');
/** Stream E's script files: every file with a `tier` field. */
const MINE = readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => [f, read(f)]).filter(([, d]) => d.tier);
const SPECIALS = read('specials_torbor.json');
const STATUSES = Object.keys(JSON.parse(readFileSync(new URL('../../../farhold/data/skills.json', import.meta.url), 'utf8')).statuses);
const BESTIARY = (() => { const d = JSON.parse(readFileSync(new URL('../../../farhold/data/enemies.json', import.meta.url), 'utf8')); return new Set([...[...d.enemies, ...d.bosses].map(e => e.id), ...JSON.parse(readFileSync(new URL('../../data/rules/monsters-tv.json', import.meta.url), 'utf8')).monsters.map(m => m.id)]); })();   // + Thousandvale-only monsters (EXPANSION-1 §5)
const DT = 0.05;

let ENGINE = null;
const engine = async () => (ENGINE ||= await engineFor(1));

test('stream E ships M1 + M2: 8 dungeon bosses, 16 mini-bosses, an elite, 2 rares per zone, a zone event boss, a world boss; every script has a party note', () => {
  const tiers = MINE.map(([, d]) => d.tier);
  assert.ok(tiers.filter(t => t === 'boss').length >= 8);
  assert.ok(tiers.filter(t => t === 'miniboss').length >= 16);
  assert.ok(tiers.filter(t => t === 'rare').length >= 32);
  assert.ok(tiers.includes('elite') && tiers.includes('event') && tiers.includes('world'));
  for (const [f, d] of MINE) assert.ok(d.party, `${f}: party note`);
});

test('every E script is listed in index.json, and the bundle validates with C\'s validator', async () => {
  for (const [f] of MINE) assert.ok(INDEX.files.includes(f), `${f} not in index.json`);
  const eng = await engine();
  assert.deepEqual(validateEncounters(eng.encounters), []);
  for (const [, d] of MINE) assert.ok(eng.encounters.scripts[d.id], `${d.id} loaded`);
});

test('content rules: bodies exist, statuses exist, adds exist, every phase has a tank-facing move, 2-3 phases, wind-ups >= 0.9 s', () => {
  const bad = [];
  const tele = (where, t) => {
    if ((t.wind ?? 1.5) < 0.5) bad.push(`${where}: wind ${t.wind}`);
    const st = typeof t.status === 'string' ? t.status : t.status?.id;
    if (st && !STATUSES.includes(st)) bad.push(`${where}: status ${st}`);
    const lst = t.leave?.status;
    if (lst && !STATUSES.includes(lst)) bad.push(`${where}: leave status ${lst}`);
  };
  for (const [f, d] of MINE) {
    if (!BESTIARY.has(d.body)) bad.push(`${f}: body ${d.body}`);
    if (!(d.phases.length >= 2 && d.phases.length <= (d.tier === 'world' ? 4 : 3))) bad.push(`${f}: ${d.phases.length} phases`);
    if (!d.say?.pull || !d.say?.death) bad.push(`${f}: pull/death lines`);
    if (['boss', 'event', 'miniboss', 'world'].includes(d.tier) && !d.enrage) bad.push(`${f}: no enrage`);
    if (['boss', 'event', 'world'].includes(d.tier) && !d.phases.some(p => p.newBar)) bad.push(`${f}: a boss needs a new health bar phase`);
    for (const [k, ab] of Object.entries(d.abilities)) {
      for (const [i, t] of (ab.telegraphs || []).entries()) {
        tele(`${f} ${k}[${i}]`, t);
        // anything big enough to matter gets warning: >= 0.9 s of wind, or a cast bar on top
        if (t.kind !== 'safe' && (t.wind ?? 1.5) + (ab.cast ?? 0) < 0.9) bad.push(`${f} ${k}: ${(t.wind ?? 1.5) + (ab.cast ?? 0)} s warning`);
        if ((t.damage ?? 1) >= 2.5 && !ab.say && !ab.cast) bad.push(`${f} ${k}: a ${t.damage}x hit needs a call-out or a cast bar`);
      }
      for (const a of ab.actions || []) if (a.adds && !BESTIARY.has(a.adds.type)) bad.push(`${f} ${k}: add ${a.adds.type}`);
    }
    for (const [i, ph] of d.phases.entries()) {
      for (const a of ph.onEnter || []) if (a.adds && !BESTIARY.has(a.adds.type)) bad.push(`${f} phase ${i}: add ${a.adds.type}`);
      // the tank always has something to face: a cone/melee move, or (a shielded phase) adds to hold
      const abs = ph.abilities.map(r => d.abilities[r]);
      const faces = abs.some(ab => ab.melee || (ab.telegraphs || []).some(t => t.shape === 'cone' || (t.at === 'target' && !ab.cast)));
      const adds = (ph.onEnter || []).some(a => a.adds);
      if (!faces && !adds) bad.push(`${f} phase ${i} (${ph.name}): nothing for the tank to face`);
    }
  }
  for (const [type, list] of Object.entries(SPECIALS.types)) {
    if (!BESTIARY.has(type)) bad.push(`specials: type ${type}`);
    for (const ab of list) for (const [i, t] of (ab.telegraphs || []).entries()) { tele(`specials ${type}.${ab.id}[${i}]`, t); if ((t.wind ?? 1.5) < 0.9) bad.push(`specials ${type}.${ab.id}: wind ${t.wind}`); }
  }
  assert.deepEqual(bad, []);
});

/** A room with C's engine, the live data bundle and `n` sturdy players a few metres from the origin. */
async function arena(players = 3) {
  const eng = await engine();
  const room = roomFor(eng, { seed: 11, id: 'e-enc' });
  room.combat.tickMonsters = dt => tickMonsters(room.field, dt);
  const enc = attachEncounters(room, { data: eng.encounters, roomKind: 'instance' });
  const ps = [];
  for (let i = 0; i < players; i++) {
    const p = createCharacter(eng, { id: 'p' + i, classId: 'knight', level: 30, rng: makeRng(i + 1), x: i * 2 - 2, z: -3 });
    p.roomRng = room.streams.get('bars'); p.partyId = 'P'; p.hp = p.maxHp = 1e9;
    room.field.add(p, 'player'); ps.push(p);
  }
  const step = (n = 1) => { for (let i = 0; i < n; i++) room.run(() => { room.clock.advance(DT); room.combat.tick(DT); for (const p of ps) p.hp = p.maxHp; }); };
  return { eng, room, enc, ps, step, events: () => room.field.out };
}

for (const [f, d] of MINE) {
  test(`FIGHT ${d.id}: pulls, uses telegraphs, walks every phase and bar, honours its triggers, enrages, dies`, async () => {
    const s = await arena(3);
    const rank = d.tier === 'elite' ? 'champion' : d.tier === 'rare' ? 'rare' : 'normal';
    const boss = s.room.run(() => spawnMonster(s.room.field, s.eng.enemyDef(d.body), 7, 0, 0, { rank, boss: ['boss', 'event', 'miniboss', 'world'].includes(d.tier) }));
    boss.encounterId = d.id;
    s.step(10);
    const st = s.enc.states.get(boss);
    assert.ok(st && st.script && st.script.id === d.id, 'runs its own script');
    assert.equal(st.phase, 0);
    assert.ok(s.events().some(e => e.t === 'say'), 'a pull line');
    const nObj = (d.arena?.objects || []).length;
    assert.equal([...s.enc.objects.values()].filter(o => o.enc === boss).length, nObj, 'arena objects spawned');
    s.step(20 * 30);                                         // 30 s of fighting phase 0
    const tele = () => new Set(s.events().filter(e => e.t === 'tele' && e.s === boss.id).map(e => e.ab));
    assert.ok(tele().size >= 2, `phase 0 used ${tele().size} telegraphed abilities`);
    // walk the phases: health thresholds, shields (clear adds, light/use objects), new bars
    for (let i = 1; i < d.phases.length; i++) {
      const ph = d.phases[i];
      if (ph.newBar) {
        const bar = st.bar;
        s.room.run(() => { boss.hp = 0; s.room.field.kill(boss); });
        assert.ok(boss.dying == null, `${ph.name}: a new bar instead of death`);
        assert.equal(st.bar, bar + 1);
      } else {
        boss.hp = Math.max(1, Math.floor(boss.maxHp * (ph.at - 0.01)));
        s.step(3);
      }
      assert.equal(st.phase, i, `reached phase ${i} (${ph.name})`);
      if (st.shield) {
        // break it the way players would: kill the adds and light / pull everything usable
        s.room.run(() => { for (const a of st.adds) { a.hp = 0; s.room.field.kill(a); } });
        for (const o of [...s.enc.objects.values()]) if (o.enc === boss && (o.type === 'brazier')) {
          s.ps[0].x = o.x; s.ps[0].z = o.z;
          assert.deepEqual(s.room.run(() => s.enc.use(s.ps[0], o.id)), { ok: true }, `use ${o.key}`);
        }
        s.step(5);
        assert.ok(!st.shield, `${ph.name}: the shield can be broken`);
        s.ps[0].x = -2; s.ps[0].z = -3;
      }
      s.step(20 * 25);
    }
    // enrage at its time
    if (d.enrage?.seconds) {
      s.room.run(() => s.room.clock.advance(d.enrage.seconds));
      s.step(3);
      assert.ok(s.events().some(e => e.t === 'enrage' && e.id === boss.id && e.hard), 'hard enrage');
    }
    s.room.run(() => { boss.hp = 0; s.room.field.kill(boss); });
    assert.equal(boss.dying, 0, 'the last bar is the real death');
    const used = tele();
    const total = new Set(Object.values(d.abilities).filter(a => a.telegraphs).map(a => a.id));
    assert.ok(used.size >= Math.min(4, total.size), `${used.size} of ${total.size} telegraphed abilities seen in the fight`);
  });
}

test('levers and the floor: one-shot levers hurt and stun, a cave-in leaves pits, objects named for players', async () => {
  const s = await arena(3);
  const boss = s.room.run(() => spawnMonster(s.room.field, s.eng.enemyDef('shale_warden'), 7, 0, 0, { boss: true }));
  boss.encounterId = 'boss_deep_foreman';
  s.step(10);
  const st = s.enc.states.get(boss);
  const winch = [...s.enc.objects.values()].find(o => o.key === 'winch');
  const hp = boss.hp;
  s.ps[1].x = winch.x; s.ps[1].z = winch.z;
  assert.deepEqual(s.room.run(() => s.enc.use(s.ps[1], winch.id)), { ok: true });
  assert.ok(boss.hp < hp && boss.stagger > 0, 'the bucket hurt and stunned it');
  assert.equal(s.room.run(() => s.enc.use(s.ps[1], winch.id)).ok, false, 'only once');
  // overtime: the cracked floor caves in and leaves pits that stay
  boss.hp = Math.floor(boss.maxHp * 0.5); s.step(3);
  st.shield && s.room.run(() => { for (const a of st.adds) { a.hp = 0; s.room.field.kill(a); } });
  for (const o of [...s.enc.objects.values()]) if (o.type === 'brazier') { s.ps[0].x = o.x; s.ps[0].z = o.z; s.room.run(() => s.enc.use(s.ps[0], o.id)); }
  s.step(3);
  s.room.run(() => { boss.hp = 0; s.room.field.kill(boss); });
  assert.equal(st.phase, 2);
  s.step(20 * 4);
  const pits = [...s.enc.objects.values()].filter(o => o.type === 'pool' && o.spec.name === 'Open shaft');
  assert.equal(pits.length, 3, 'three pits where the cracked rock was');
  assert.equal([...s.enc.objects.values()].filter(o => o.type === 'cracked_floor').length, 0);
});

test('SPECIALS by type: every Torborhold monster type telegraphs its own attacks', async (t) => {
  const eng = await engine();
  if (!eng.encounters.specials?.types?.moor_hound) { t.todo('waiting on stream C: specials looked up by monster type (docs/requests.md, E -> C)'); return; }
  const missing = [];
  for (const [type, list] of Object.entries(SPECIALS.types)) {
    const s = await arena(1);
    const m = s.room.run(() => spawnMonster(s.room.field, s.eng.enemyDef(type), 5, 0, 2));
    s.step(20 * 40);
    const ids = new Set(s.events().filter(e => e.t === 'tele' && e.s === m.id).map(e => e.ab));
    if (!list.some(ab => ids.has(ab.id))) missing.push(type);
  }
  assert.deepEqual(missing, []);
});
