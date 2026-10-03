// Dead-data guard (PLAN §19 test 10): every number the sim is supposed to read must change the sim
// when it moves. Comparing a data file to a constant passes even when nothing reads the field; this
// moves each leaf to an odd value and asks the SIM whether anything changed.
//
//   skills:   every numeric/boolean leaf of every skill row in heroes.json (cast in a busy scene)
//   statuses: every numeric leaf of every status in heroes.json
//   econ:     every numeric leaf of econ.json (AI vs AI match), minus a short list of fields that only
//             the econ model or a later milestone reads — each with its reason
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataWith, config, hero } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';
import { addStatus } from '../js/sim/statuses.js';
import { applyStatus } from '../js/sim/skills.js';
import { summonPets } from '../js/sim/pets.js';
import { refreshHero } from '../js/sim/heroes.js';

function leaves(obj, path = []) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_') || k === 'name' || k === 'desc') continue;
    if (typeof v === 'number' || typeof v === 'boolean') out.push([...path, k]);
    else if (Array.isArray(v)) { if (v.every(x => typeof x === 'number')) v.forEach((_, i) => out.push([...path, k, i])); }
    else if (v && typeof v === 'object') out.push(...leaves(v, [...path, k]));
  }
  return out;
}
const getAt = (o, p) => p.reduce((a, k) => a[k], o);
const setAt = (o, p, v) => { const last = p[p.length - 1]; getAt(o, p.slice(0, -1))[last] = v; };
const oddly = v => (typeof v === 'boolean' ? !v : v === 0 ? 0.37 : Number.isInteger(v) ? Math.round(v * 1.37) + 1 : v * 1.37 + 0.07);

// Three scenes, and a field is dead only if NO scene notices it:
//   crowd:  14 static golems around and ahead of the hero (crowd caps, arcs, lines, pools)
//   sparse: 4 slow golems, one just outside unit aggro but inside War Cry (taunts, per-foe caps)
//   burned: like crowd, every golem already carries 4 Burning + 2 Bleeding stacks (detonate, stack caps)
// The hero has a huge mana pool so mana costs never refill to a cap and hide themselves.
function skillScene(data, heroId, slot, kind) {
  const s = createSim(config({ seed: 3, players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: heroId },
    { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), data, { events: false });
  const p = s.state.players[0], h = hero(s, 0);
  p.level = 20; p.skillPts = 0;
  for (const sk of p.skills) sk.rank = 1;
  h.x = s.map.fields[0].cx; h.z = 50; h._ord.k = 'stop';
  h.hp = h.hpMax = 1e6; h.mpMax = 1e9; h.mp = 1e5;
  const o = hero(s, 1); o.x = s.map.fields[1].x0 + 1; o.z = 2;
  const ctx = { state: s.state, data, map: s.map, emit: () => {} };
  const f = s.map.fields[0];
  const spots = kind === 'sparse' ? [[1.5, 53], [0, 59.8], [4, 61], [-5, 66]]
    : [[1.2, 51], [-2, 49], [0, 47.5], [3.5, 52], [-4.5, 50], [0, 54], [0.6, 57], [-0.8, 61], [0, 66], [4, 58], [-4, 58], [8, 58], [2, 60.8], [6, 64], [-6, 64], [0, 70]];
  for (const [dx, z] of spots) {
    // sparse uses warded (spectral) bodies so armour-pierce has a resistance to close
    const e = spawnUnit(ctx, 0, 1, kind === 'sparse' ? 'gravecreeper' : 'iron_golem', { x: f.cx + dx, z }); e.hp = e.hpMax = 1e6; e._spd = kind === 'sparse' ? 0.6 : 0; e._traits = e._traits.filter(t => t !== 'rise');
    if (kind === 'burned') { applyStatus(ctx, h, e, 'burn', 40, { add: 4, max: 5 }); applyStatus(ctx, h, e, 'bleed', 40, { add: 2, max: 5 }); addStatus(ctx, e, 'quarry', { ticks: 2000, power: 0.2, src: h.id }); }
  }
  if (kind.startsWith('form')) {
    // in a shape (form:<id>, from whichever skill grants it), with two wolves out
    p.form = kind.split(':')[1];
    const psk = Object.values(data.heroes.heroes[heroId].slots).find(sid => data.heroes.skills[sid].pet);
    if (psk) summonPets(ctx, h, data.heroes.skills[psk].pet, 2);
    refreshHero(ctx, p); h.hp = h.hpMax = 1e6; h.mpMax = 1e9; h.mp = 1e5;
  }
  if (kind.startsWith('rank')) for (const sk of p.skills) sk.rank = +kind.slice(4);
  if (kind === 'rig' || kind.startsWith('rank')) {
    // a builder hero: turrets already standing and hurt (repair / overcharge have something to work on)
    const tsk = p.skills.find(sk => data.heroes.skills[sk.id].turret);
    if (tsk) {
      for (let i = 0; i < 3; i++) { tsk.readyAt = 0; s.step([{ p: 0, type: 'cast', slot: tsk.slot, x: f.cx + (i - 1) * 2, z: 54 }]); }
      for (const e of s.state.ents) if (e.kind === 'turret') e.hp = e.hpMax * 0.4;
      tsk.readyAt = 0;
    }
  }
  for (let t = 1; t <= 260; t++) {
    const c = [];
    if (kind !== 'sparse' && t % 60 === 1) c.push({ p: 0, type: 'move', x: h.x + (t % 120 === 1 ? 3 : -3), z: 50 + (t % 120 === 1 ? 4 : 0) });
    if (kind !== 'sparse' && t % 60 === 30) c.push({ p: 0, type: 'stop' });
    c.push({ p: 0, type: 'cast', slot, x: f.cx, z: 58 });
    s.step(c);
  }
  return s.hash();
}
const BASE_SCENES = ['crowd', 'sparse', 'burned'];
/** Scenes for one hero: the base three, one per shape it can take, and builder scenes if it builds. */
function scenesFor(data, heroId) {
  const out = BASE_SCENES.slice();
  const sids = Object.values(data.heroes.heroes[heroId].slots);
  for (const sid of sids) if (data.heroes.skills[sid].form) out.push('form:' + data.heroes.skills[sid].form.id);
  if (sids.some(sid => data.heroes.skills[sid].turret)) out.push('rig', 'rank2', 'rank3');
  return out;
}

// skill fields whose effect the scene cannot show, with the reason (keep this list short)
const SKILL_EXEMPT = {
  'meteor.range': 'the scene aims inside every range',
  'flashover.range': 'the scene aims inside every range',
  'fire_wall.range': 'the scene aims inside every range',
  'firebolt.range': 'the first golem on the line is always inside the range',
  'fire_wall.line.every': 'Farhold draws flames every N m; Bannerline hits the whole line (view hint only)',
  'aimed_shot.range': 'the scene aims inside every range', 'hunters_snare.range': 'the scene aims inside every range',
  'multi_shot.range': 'the first body on each line is inside the range', 'rain_of_arrows.range': 'the scene aims inside every range',
  'thornlash.range': 'the first body on the line is inside the range',
  'hunters_snare.place.max': 'needs a third snare inside one scene; tests/ranger-druid.test.js "snares: two at most"',
  'multi_shot.split.range': 'the scene\'s bodies are all inside both ranges; ranger-druid.test.js "split"',
  'thornlash.onHit.healPet': 'needs hurt wolves; ranger-druid.test.js "wolves heal"',
  'thornlash.forms.briarback.arc': 'arc width vs a ring of targets; ranger-druid.test.js "Briarback"',
  'briarback_shape.form.basic.arc': 'arc width vs a ring of targets; ranger-druid.test.js "gore arc"',
  'renew.forms.briarback.barrier.share': 'the barrier outlives nothing in the scene; ranger-druid.test.js "Thornswell"',
  'renew.forms.briarback.barrier.seconds': 'the scene breaks the barrier before it expires; ranger-druid.test.js "lasts barrier.seconds"',
  'renew.forms.briarback.selfBuff.reflect': 'needs units hitting a still hero; ranger-druid.test.js "Thornswell"',
  'briarback_shape.form.onEnter.taunt.seconds': 'units hold the hero anyway in the scene; ranger-druid.test.js "taunts on entering"',
  'call_wolf.forms.briarback.taunt.seconds': 'units hold the wolves anyway; ranger-druid.test.js "Den Guard"',
  'wolf_shape.form.body.scale': 'a look hint for the view; the sim never reads it',
  'call_wolf.forms.wolf.howl.radius': 'needs an allied hero in the field; ranger-druid.test.js "Running Howl reaches allies"',
  'bolt_turret.range': 'the scene aims inside every range', 'shrapnel_mine.range': 'the scene aims inside every range', 'grapnel.dash.range': 'the scene aims inside every range',
  'shrapnel_mine.place.max': 'needs a fourth mine inside one scene; engineer.test.js "three mines at most"',
  'briarback_shape.form.body.scale': 'a look hint for the view (the boar body\'s scale); the sim never reads it',
  'briarback_shape.form.body.colors.body': 'view hint', 'briarback_shape.form.body.colors.belly': 'view hint', 'briarback_shape.form.body.colors.accent': 'view hint', 'briarback_shape.form.body.colors.eyes': 'view hint',
  'fire_wall.line.width': 'Farhold\'s drawn band; the hit band is the skill radius (fallback when a line skill has none)',
};

test('every skill number changes what a cast does', async () => {
  const base = dataWith(() => {});
  const dead = [];
  for (const [hid, h] of Object.entries(base.heroes.heroes)) {
    for (const [slot, sid] of Object.entries(h.slots)) {
      const SCENES = scenesFor(base, hid);
      const refs = SCENES.map(k => skillScene(base, hid, slot, k));
      for (const path of leaves(base.heroes.skills[sid])) {
        const key = [sid, ...path].join('.');
        if (SKILL_EXEMPT[key]) continue;
        const d = dataWith(raw => setAt(raw.heroes.skills[sid], path, oddly(getAt(raw.heroes.skills[sid], path))));
        if (SCENES.every((k, i) => skillScene(d, hid, slot, k) === refs[i])) dead.push(key);
      }
    }
  }
  assert.deepEqual(dead, [], 'skill fields the sim never reads:\n  ' + dead.join('\n  '));
});

const STATUS_EXEMPT = {
  'burn.perSecond': 'default strength for a burn source without its own statusMult; every M3 burn source has one',
};

test('every status number changes the sim', () => {
  const base = dataWith(() => {});
  const scene = data => {
    const s = createSim(config({ seed: 3, players: [
      { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' },
      { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), data, { events: false });
    const h = hero(s, 0); h.hpMax = 1e6; h.hp = 5e5; h.x = s.map.fields[0].cx; h.z = 60;
    const ctx = { state: s.state, data, map: s.map, emit: () => {} };
    const f = s.map.fields[0];
    const u = spawnUnit(ctx, 0, 1, 'iron_golem', { x: f.cx, z: 62 }); u.hpMax = 1e6; u.hp = 5e5;
    const v = spawnUnit(ctx, 0, 1, 'levy', { x: f.cx + 6, z: 20 });
    return { s, h, u, v, ctx };
  };
  const dead = [];
  for (const [sid, def] of Object.entries(base.heroes.statuses)) {
    const runWith = data => {
      const { s, h, u, v, ctx } = scene(data);
      const d = data.heroes.statuses[sid];
      // applied the way skills apply them (def numbers, not test numbers), three times for stacks
      for (const e of [h, u, v]) for (let k = 0; k < 6; k++) applyStatus(ctx, h, e, sid, 40);
      if (d.kind === 'buff' || sid === 'might') addStatus(ctx, h, sid, { ticks: Math.round(d.seconds * 20), power: d.damage || 0, src: h.id });
      for (let t = 0; t < 200; t++) s.step(t === 0 ? [{ p: 0, type: 'attack', target: u.id }] : []);
      return s.hash();
    };
    const ref = runWith(base);
    for (const path of leaves(def)) {
      if (STATUS_EXEMPT[[sid, ...path].join('.')]) continue;
      const d = dataWith(raw => setAt(raw.heroes.statuses[sid], path, oddly(getAt(raw.heroes.statuses[sid], path))));
      if (runWith(d) === ref) dead.push([sid, ...path].join('.'));
    }
  }
  assert.deepEqual(dead, [], 'status fields the sim never reads:\n  ' + dead.join('\n  '));
});

const ECON_EXEMPT = {
  'banners.2v2': '2v2 mode arrives with M6 (team lanes)',
  'banners.3v3': '3v3 mode arrives with M6 (team lanes)',
  'bounty.share': 'fallback only: every unit carries its own bounty share',
  'bounty.toTeamPool': 'always true in the sim (the pool is the only rule); econ-model flag',
  'field.length': 'econ-model field length; the real field length is data/maps.json',
  'field.engageSlow': 'econ-model only (the real sim slows by bodies, not a factor)',
  'field.engageDepth': 'econ-model only',
  'hero.classes.ranger.dpsK': 'Ranger arrives in M6', 'hero.classes.ranger.hpK': 'Ranger arrives in M6', 'hero.classes.ranger.aoe': 'econ-model only',
  'hero.classes.druid.dpsK': 'Druid arrives in M6', 'hero.classes.druid.hpK': 'Druid arrives in M6', 'hero.classes.druid.aoe': 'econ-model only', 'hero.classes.druid.selfHeal': 'Druid arrives in M6',
  'items.slots': 'econ-model slot count; the sim\'s slots are data/items-bl.json `slots`',
  'clock.tickHz': 'the tick rate is fixed in code (TICK_HZ) for the view, input delay and lockstep; core.test.js asserts the two agree',
  'clock.hardCap': 'AI matches end first; gameplay.test.js "the hard cap ends it" moves it',
  'rally.cap': 'not reached in one AI match; gameplay.test.js "Rally" moves it',
  'field.cap': 'not reached in one AI match; gameplay.test.js "field cap" moves it',
  'items.oil.cost': 'the M1 AI does not buy Oil; pyromancer.test.js "Oil" checks the price',
  'hero.respawnCap': 'never binds: 5 s + 1 s x level 20 = 25 s, the cap; kept as a guard if the level cap rises',
  'hero.xpTable.15': 'AI matches end before level 16 at the current balance (owner: balance later)', 'hero.xpTable.16': 'same', 'hero.xpTable.17': 'same', 'hero.xpTable.18': 'same', 'hero.xpTable.19': 'same',
  'hero.xpTable.0': 'level 1 starts at 0 XP by definition (only the UI reads it)',
  'hero.classes.warrior.aoe': 'econ-model only (the real AoE is the skills)', 'hero.classes.pyromancer.aoe': 'econ-model only (the real AoE is the skills)',
};

test('every econ.json number changes an AI-vs-AI match (or is listed with a reason)', () => {
  const base = dataWith(() => {});
  const match = (data, endless) => {
    const s = createSim(config({ seed: 5, rules: { endless }, players: [
      { team: 0, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'freeholds', hero: 'warrior' },
      { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'freeholds', hero: 'pyromancer' }] }), data, { events: false });
    const lim = 32 * 1200;
    while (!s.over && s.tick < lim) s.step([]);
    return s.hash();
  };
  const refs = [match(base, false), match(base, true)];
  const dead = [];
  for (const path of leaves(base.econ)) {
    const key = path.join('.');
    if (ECON_EXEMPT[key]) continue;
    if (key.startsWith('items.')) continue;   // the hero shop moved to items-bl.json (stream I, round 2); econ.json `items` is the econ model's only (tests/items.test.js covers the real items)
    const d = dataWith(raw => setAt(raw.econ, path, oddly(getAt(raw.econ, path))));
    if (match(d, false) === refs[0] && match(d, true) === refs[1]) dead.push(key);
  }
  assert.deepEqual(dead, [], 'econ.json fields the sim never reads:\n  ' + dead.join('\n  '));
});
