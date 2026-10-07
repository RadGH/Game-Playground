// Stream E — play-test 6 U8: "the ward became shielded and it never went away and he became unkillable" / "it wore
// off but it took way too long". Every boss ward in data/encounters: a short stated duration, a break the arena
// really offers, a call-out that says what to do — and no boss can inherit a ward by accident.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const INDEX = J('data/encounters/index.json');
const SCRIPTS = INDEX.files.map(f => J('data/encounters/' + f)).flatMap(d => (d.scripts ? Object.values(d.scripts) : d.id ? [d] : []));
const byId = Object.fromEntries(SCRIPTS.map(s => [s.id, s]));
const MAX = { miniboss: 15, boss: 20, event: 25, world: 25 };
// a ward goes up with `{ shield: { seconds, pool } }` (stream C's shape: it lasts `seconds`, and absorbs `pool` x the boss's health before it shatters)
const raises = ph => (ph.onEnter || []).some(a => a.shield && a.shield !== false);
const warded = SCRIPTS.flatMap(s => (s.phases || []).map((ph, i) => ({ s, ph, i })).filter(x => raises(x.ph)));

test('U8: every ward has a stated, short duration, a way to break it that the arena holds, and a call-out saying what to do and for how long', () => {
  assert.ok(warded.length >= 19, 'warded phases: ' + warded.length);
  const bad = [];
  for (const { s, ph, i } of warded) {
    const w = ph.ward, at = `${s.id} phase ${i} (${ph.name})`;
    if (!w) { bad.push(at + ': no `ward` block'); continue; }
    const max = MAX[s.tier] ?? 20;
    if (!(w.seconds >= 8 && w.seconds <= max)) bad.push(`${at}: ${w.seconds} s (a ${s.tier || 'boss'} ward lasts at most ${max})`);
    if (!w.fade) bad.push(at + ': no line for when it runs out');
    const up = ph.onEnter.find(a => a.shield);
    if (!(up.shield.seconds === w.seconds && up.shield.pool === w.pool && w.pool > 0 && w.pool <= 0.15)) bad.push(`${at}: the shield action (${JSON.stringify(up.shield)}) and the ward block disagree, or the pool is over 15% of its health`);
    // the call-out: said on enter, names the seconds, and tells you to DO something
    const said = (ph.onEnter || []).filter(a => a.say).map(a => a.say);
    if (!said.includes(w.say)) bad.push(at + ': ward.say is not called out when the ward goes up');
    if (!new RegExp(`\\b${w.seconds} seconds\\b`).test(w.say)) bad.push(at + ': the call-out does not say how long');
    if (!/\b(kill|light|burn|tip|smash|force open|ring)\b/i.test(w.say)) bad.push(at + ': the call-out does not say what to do');
    // the break is real
    const trig = (s.triggers || []).find(t => t.when && t.when.phase === i && (t.do || []).some(a => a.shield === false));
    if (w.break === 'objects') {
      const have = ((s.arena && s.arena.objects) || []).filter(o => o.type === w.what).length;
      if (have < w.need) bad.push(`${at}: needs ${w.need} ${w.what}s, the arena has ${have}`);
      if (!trig || trig.when.lit !== w.need) bad.push(at + ': no trigger drops the shield at ' + w.need + ' lit');
    } else if (w.break === 'adds') {
      const n = (ph.onEnter || []).filter(a => a.adds).reduce((a, x) => a + x.adds.count, 0);
      if (!ph.shieldWhileAdds || n !== w.need || n < 1) bad.push(`${at}: breaks with its adds, but shieldWhileAdds ${ph.shieldWhileAdds} / adds ${n} / need ${w.need}`);
    } else bad.push(at + ': break ' + w.break);
    // breaking it early pays: there is a line or an opening for it
    if (!(ph.shieldDown || (trig && trig.do.some(a => a.vuln || a.stun || a.say)))) bad.push(at + ': nothing happens when the ward is broken');
  }
  assert.deepEqual(bad, []);
});

test('U8: a boss with no script of its own can never inherit a ward — the town / any fallback has no shield, no adds, no arena objects and no name', () => {
  const d = INDEX.defaults.boss;
  for (const k of ['town', 'any']) {
    const s = byId[d[k]];
    assert.ok(s, 'defaults.boss.' + k);
    assert.ok(!s.name, k + ': the fallback must not rename the monster');
    assert.ok(!JSON.stringify(s).includes('"shield"') && !(s.arena && s.arena.objects && s.arena.objects.length), k + ': fallback has a ward or furniture');
  }
  // a script that needs furniture is only a default where the furniture is built (a dungeon room, the wilds arena)
  for (const [k, id] of Object.entries(d)) if ((byId[id].phases || []).some(ph => ph.ward && ph.ward.break === 'objects')) assert.equal(k, 'instance', `defaults.boss.${k} = ${id} needs arena objects`);
});

test('U8: the raid on Torborhold ends with Harl Vesk under his own script — no ward, nothing to fetch', () => {
  const siege = J('data/quests/events.json').realm.find(e => e.id === 'siege_torborhold');
  assert.equal(siege.encounter, 'ev_harl_vesk');
  const s = byId.ev_harl_vesk;
  assert.equal(s.name, siege.bossName);
  assert.equal(s.body, siege.monster);
  assert.ok(!JSON.stringify(s).includes('"shield"') && !s.arena);
  // and every event names a script for its boss, or a plain monster that will get the plain fallback (never the Barrow Warden)
  const ev = J('data/quests/events.json');
  for (const e of [...ev.realm, ...ev.zone]) { const id = e.boss || e.encounter; if (id) assert.ok(byId[id], `${e.id}: script ${id}`); }
});
