// node --test prototypes/thousandvale/tests/C/ally-audit.test.mjs
//
// THE ALLY-TARGETING AUDIT (PLAN §6.2 / §15 M2: "all 30 classes (ally targeting audit)").
//
// Every skill of every class — and every one of its talent nodes picked on its own, and every skill a
// druid shape turns into, and every song's aura and finale — is cast by a level-40 caster standing in a
// party, with the Tab target on a hurt, poisoned party member. What the cast's plan says it does for
// friends (heal, group heal, barrier, ward, cleanse, a group buff, a mend over time, a link, a revive,
// a status for a follower, an empowered next skill) must land on that ally; and nothing may ever land on
//   * a stranger standing just as close (not in the party), or
//   * a party member 120 m away (a group effect reaches ALLY_RANGE, 30 m).
// A personal buff (a stance, War Cry's Might, a counter window) stays on the caster even with a friend
// targeted — the rules are written out in js/rules/README.md "Ally targeting".
//
// `ALLY_AUDIT_WRITE=1 node --test tests/C/ally-audit.test.mjs` rewrites js/rules/ally-audit.md, the
// audit list (one row per skill, what reaches an ally and how).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { engineFor, roomFor } from './setup.mjs';
import { attachFollowers } from '../../js/rules/followers.js';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';
import { applyStatus } from '../../js/rules/farhold.js';
import { allyEffects, groupEffects } from '../../js/rules/ally.js';

const FH = new URL('../../../farhold/data/', import.meta.url);
const CLASSES = JSON.parse(readFileSync(new URL('classes.json', FH), 'utf8')).classes.map(c => c.id);
const SKILLS = JSON.parse(readFileSync(new URL('skills.json', FH), 'utf8'));
const DT = 0.05;

// what a plan promises friends: js/rules/ally.js (the same reading the client's skill bar gets)
const promises = (p, opts) => allyEffects(p, opts);
const groupPromises = groupEffects;

const pick = (row, tier, id) => ({ [row]: { [tier]: id } });

let ENGINE = null;
async function engine() { return ENGINE || (ENGINE = await engineFor(11)); }

/** A party scene: caster, the targeted ally, a fallen member, a far member, a stranger and a fallen stranger. */
async function scene(classId, seed) {
  const eng = await engine();
  const room = roomFor(eng, { seed, id: `audit-${classId}-${seed}` });
  attachFollowers(room, { rng: makeRng((seed ^ 0x9e11) >>> 0) });
  room.combat.tickMonsters = () => {};        // monsters hold still: only the cast changes anything
  const mk = (id, cls, x, z, party = 'P') => {
    const p = createCharacter(eng, { id, classId: cls, level: 40, rng: makeRng(id.length * 31 + seed), x, z });
    p.roomRng = room.streams.get('bars');
    if (party) p.partyId = party;
    room.field.add(p, 'player');
    return p;
  };
  const caster = mk('caster', classId, 0, 0);
  const ally = mk('ally', 'warrior', 2, -1.5);        // 2.5 m: inside the smallest friendly zone (3 m)
  const fallen = mk('fallen', 'warrior', -2, -2);
  const far = mk('far', 'warrior', 0, -120);
  const stranger = mk('stranger', 'warrior', -1.5, -2, null);
  const deadStranger = mk('deadStranger', 'warrior', 1, -2.5, null);
  room.run(() => spawnMonster(room.field, eng.enemyDef('moor_hound'), 40, 3, 0.5));   // beside the ally
  const poison = eng.statuses.poison, bleed = eng.statuses.bleed;
  for (const u of [ally, far, stranger]) {
    u.hp = Math.round(u.maxHp * 0.4);
    applyStatus(u, 'poison', { ...poison, seconds: 30 }, 1);
    applyStatus(u, 'bleed', { ...bleed, seconds: 30 }, 1);
  }
  for (const u of [fallen, deadStranger]) { u.dead = true; u.hp = 0; }
  caster.hp = Math.round(caster.maxHp * 0.6);
  caster.mp = caster.maxMp;
  return { room, caster, ally, fallen, far, stranger, deadStranger };
}

const snap = u => ({ hp: u.hp, barrier: u.barrier || 0, keys: new Set(Object.keys(u.statuses || {})), dead: !!u.dead, empower: u.mech?.empower || null });
/** What reached `u` since `before`: heal (an event), barrier, a new friendly status, a ward, a cleanse, a link, a revive. */
function reached(s, u, before, events) {
  const got = new Set();
  if (events.some(e => e.t === 'heal' && e.dst === u.id && e.amt > 0)) got.add('heal');
  if ((u.barrier || 0) > before.barrier) got.add('barrier');
  const now = Object.keys(u.statuses || {});
  const fresh = now.filter(k => !before.keys.has(k));
  if (fresh.some(k => k.startsWith('ward:'))) got.add('ward');
  if (fresh.some(k => !k.startsWith('ward:') && u.statuses[k]?.kind !== 'debuff' && !['poison', 'bleed'].includes(k))) got.add('status');
  if ((before.keys.has('poison') && !u.statuses?.poison) || (before.keys.has('bleed') && !u.statuses?.bleed)) got.add('cleanse');
  if ([...(s.room.combat.skillRt?.links?.values() || [])].some(l => l.to === u)) got.add('link');
  if (before.dead && !u.dead) got.add('revive');
  if (u.mech?.empower && u.mech.empower !== before.empower && String(u.mech.empower.from).startsWith('ally:')) got.add('empower');
  return got;
}

/** Cast one slot at the ally (talents `picks`), tick a little, and report. */
function castAt(s, slot, { ticks = 24 } = {}) {
  const { room, caster } = s;
  const watched = ['ally', 'fallen', 'far', 'stranger', 'deadStranger'].map(k => [k, s[k]]);
  const before = Object.fromEntries(watched.map(([k, u]) => [k, snap(u)]));
  let plan = null;
  const use = caster.skills.use;
  caster.skills.use = i => (plan = use(i));
  room.field.out.length = 0;
  caster.skills.slots[slot].ready = 0;
  caster.mp = caster.maxMp;
  const res = room.run(() => room.combat.cast(caster, slot, { target: 'ally', aim: { x: s.ally.x, z: s.ally.z } }));
  caster.skills.use = use;
  for (let i = 0; i < ticks; i++) room.run(() => { room.clock.advance(DT); room.combat.tick(DT); });
  const events = room.field.out.slice();
  const got = Object.fromEntries(watched.map(([k, u]) => [k, reached(s, u, before[k], events)]));
  return { res, plan, got };
}

const ROWS = [];
const PROBLEMS = [];

function judge(label, classId, plan, extra, got, res) {
  if (res && !res.ok) { PROBLEMS.push(`${label}: refused (${res.why})`); return; }
  const want = new Set([...promises(plan), ...extra]);
  // the fallen member is who a revive is for; everything else is for the targeted ally
  const allyGot = new Set([...got.ally, ...(got.fallen.has('revive') ? ['revive'] : [])]);
  for (const w of want) if (!allyGot.has(w)) PROBLEMS.push(`${label}: promises "${w}" for a friend, the targeted ally got [${[...allyGot]}]`);
  for (const k of ['stranger', 'deadStranger', 'far']) if (got[k].size) PROBLEMS.push(`${label}: reached the ${k} [${[...got[k]]}]`);
  ROWS.push({ label, classId, want: [...want].sort(), got: [...allyGot].sort() });
}

for (let i = 0; i < CLASSES.length; i += 6) {
  const batch = CLASSES.slice(i, i + 6);
  test(`ally targeting audit, classes ${i + 1}-${i + batch.length} (${batch.join(', ')})`, async () => {
    const before = PROBLEMS.length;
    for (const classId of batch) {
      const ids = SKILLS.classes[classId] || [];
      for (let slot = 0; slot < ids.length; slot++) {
        const id = ids[slot], row = SKILLS.skills[id];
        // the skill bare, then each talent node picked on its own
        const variants = [{ label: `${classId}/${id}`, picks: {} }];
        for (const [tier, t] of Object.entries(row.talents || {})) {
          for (const n of t.nodes || []) variants.push({ label: `${classId}/${id} +${n.id}`, picks: pick(id, tier, n.id) });
          if (t.lib) variants.push({ label: `${classId}/${id} +${t.lib}`, picks: pick(id, tier, t.lib) });
        }
        for (const v of variants) {
          const s = await scene(classId, 3 + slot);
          s.caster.skillTalents = v.picks;
          const r = castAt(s, slot);
          if (r.plan?.kind === 'form') {
            // a form: its aura and onEnter are for friends; a song's finale comes when it is toggled off
            const spec = r.plan.form?.entered?.spec || null;
            judge(v.label, classId, null, [...groupPromises(spec?.onEnter), ...promises(null, { form: spec })], r.got, r.res);
            if (spec?.finale && spec.toggle) {
              const s2 = await scene(classId, 3 + slot);
              s2.caster.skillTalents = v.picks;
              castAt(s2, slot, { ticks: 4 });
              const off = castAt(s2, slot);
              judge(`${v.label} (finale)`, classId, null, [...groupPromises(spec.finale)], off.got, off.res);
            }
            // a druid shape turns the other skills into new ones: audit those too (bare only)
            if (spec?.body && !Object.keys(v.picks).length) {
              for (let other = 0; other < ids.length; other++) {
                if (other === slot || SKILLS.skills[ids[other]]?.form) continue;   // another shape: covered on its own
                const s3 = await scene(classId, 3 + slot);
                castAt(s3, slot, { ticks: 2 });
                const o = castAt(s3, other);
                judge(`${classId}/${ids[other]} @${r.plan.form.entered.id}`, classId, o.plan, [], o.got, o.res);
              }
            }
          } else judge(v.label, classId, r.plan, [], r.got, r.res);
        }
      }
    }
    assert.deepEqual(PROBLEMS.slice(before), []);
  });
}

test('the audit list covers every class and every skill', async () => {
  for (const c of CLASSES) assert.ok(ROWS.some(r => r.classId === c), c);
  const bare = ROWS.filter(r => !r.label.includes(' '));
  assert.equal(new Set(bare.map(r => r.label)).size, 180);
  if (process.env.ALLY_AUDIT_WRITE) {
    const lines = ['# Ally-targeting audit (generated — tests/C/ally-audit.test.mjs)', '',
      'Every skill, each talent node on its own, each druid-shape skill and each song finale, cast with the Tab target on a',
      'hurt, poisoned party member 2.5 m away. **Reaches the ally** = what the plan promises a friend, all of which was',
      'checked to land on that ally (and on nobody outside the party, and on nobody 120 m away). A row with nothing in it',
      'is a skill that does nothing for friends (damage, control, personal buffs).', '',
      `${ROWS.length} casts, ${ROWS.filter(r => r.want.length).length} of them do something for an ally.`, '',
      '| Cast | Reaches the ally |', '|---|---|'];
    for (const r of ROWS) if (r.want.length || !r.label.includes(' ')) lines.push(`| ${r.label} | ${r.want.join(', ') || '—'} |`);
    // play-test 5 T2: the wording table — which words a card uses for whom, and the code that makes each sentence true
    const W = await import('../../js/rules/wording.js');
    const head = ['# Who a card touches (play-test 5, T2) — and the ally-targeting audit', '',
      'Every skill, talent, perk and item-power card goes through `js/rules/wording.js`. One vocabulary:', '',
      '| Words on the card | Exactly who |', '|---|---|',
      '| you | the caster |',
      '| you (or the party member you target) | the friendly target of the cast if it is a party member within 30 m, else the caster |',
      '| your followers | your OWN pets, summons and hired blades — never another player, never their pets |',
      '| party members | the other players in your party within 30 m |',
      '| all allies / allies / every other ally | you + party members within 30 m + your followers + those party members\' own pets ("every other ally" leaves you out) |',
      '', 'What changed in behaviour so the cards are true (js/rules/cast-skills.js):', '',
      '| Effect | Before | Now |', '|---|---|---|',
      '| "For Ns, your followers: …" (`selfBuff.petsOnly`: Stoke the Familiar, Den Guard, Wrath of the Raised…) | every party member and their pets too | your own followers only |',
      '| "Revives every fallen follower" (Farhold `revive`: Unleash the Hound, Stoke the Familiar, Second Rising) | also stood dead party PLAYERS up | your own followers only; a player needs a revive skill (T4) |',
      '| a barrier / status / cleanse for "all allies" (`pets: true`) | skipped a party member\'s own pets | reaches them (one list: `rt.allies`) |',
      '| "swaps places with the aimed follower or enemy" (Reposition, Swap Partner, Fiendish Swap) | the follower half was never ported | swaps with your own aimed follower when no enemy is aimed at (a player is never moved) |',
      '| the heal of Prayer of Dawn (`around` + heal) | always the caster | the party member you target, else you (T3) |',
      '| Mending Post, Greensap | no direct heal | a direct heal on the party member you target, else you (T3) |',
      '| a chained bolt (Forked Bolt, a chaining wand, Arc Lash) | re-struck the same body every hop (Farhold does too) | jumps to the nearest OTHER enemy |',
      '', 'Each sentence Farhold writes, and the code that makes Thousandvale\'s version true (tests/C/playtest5.test.mjs casts one per kind and checks who it lands on):', '',
      '| Farhold\'s phrase (pattern) | Code that carries it out |', '|---|---|',
      ...W.WORDING_RULES.map(r => `| \`${r.pattern.replace(/\|/g, '\\|')}\` | ${r.reader} |`), '', '---', ''];
    writeFileSync(new URL('../../js/rules/ally-audit.md', import.meta.url), head.join('\n') + lines.join('\n') + '\n');
  }
});
