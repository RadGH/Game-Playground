// Campaign (PLAN §13, stream F): the data, every mission winnable by a scripted bot, objectives and
// the script firing in order, stars, the time limit, snapshots mid-mission, and original names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { data, ROOT } from './_sim.mjs';
import { createSim, restoreSim } from '../js/sim/sim.js';
import { campaignInfo, objectiveProgress } from '../js/sim/campaign.js';

const DIR = join(ROOT, 'data', 'campaign');
const idx = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
const mission = id => JSON.parse(readFileSync(join(DIR, id + '.json'), 'utf8'));
const ready = idx.chapters.filter(c => c.status === 'ready');
const allMissions = ready.flatMap(c => c.missions.map(mission));
const start = (m, seed = 1, events = true) => createSim({ ...m.config, seed, mode: 'linewar', campaign: m }, data, { events });

test('the campaign index: a chapter per hero, the Warrior chapter ready with 3-5 missions, the rest stubs', () => {
  assert.ok(idx.title && !/muster/i.test(idx.title));
  for (const h of Object.keys(data.heroes.heroes)) assert.ok(idx.chapters.some(c => c.hero === h), `a chapter for ${h}`);
  const w = idx.chapters.find(c => c.hero === 'warrior');
  assert.equal(w.status, 'ready');
  assert.ok(w.missions.length >= 3 && w.missions.length <= 5);
  for (const c of idx.chapters) if (c.status !== 'ready') assert.deepEqual(c.missions, []);
  const files = readdirSync(DIR).filter(f => f !== 'index.json').map(f => f.replace('.json', ''));
  for (const c of ready) for (const id of c.missions) assert.ok(files.includes(id), id);
});

test('every mission builds a valid match and names its player, objectives, stars and script correctly', () => {
  for (const m of allMissions) {
    const s = start(m);
    assert.equal(s.state.players[m.player].kind, 'human', m.id);
    assert.equal(s.state.players[m.player].hero, idx.chapters.find(c => c.id === m.chapter).hero, `${m.id}: the chapter's hero`);
    const ids = m.objectives.map(o => o.id);
    for (const st of m.stars) assert.ok(ids.includes(st), `${m.id}: star ${st}`);
    for (const o of m.objectives) if (o.after) assert.ok(ids.includes(o.after));
    for (const sc of m.script) if (sc.when.done) assert.ok(ids.includes(sc.when.done), `${m.id}: script ${sc.id}`);
    for (const o of m.objectives) objectiveProgress(s.state, data, o);   // every kind is known
    assert.ok(m.briefing.length >= 1 && m.name);
  }
});

const BANNED = /muster|\bember|veil\b|heroic|mythic|keystone|war mode|horde|alliance|hearthstone|delve|renown|rested|honored|revered|exalted|\bfury\b|\bfocus\b|\brage\b|combo point|garrote|cheap shot|prowl|\bmaul\b|\brake\b|barkskin|totemic|soul shard|arcane charge|\bblink\b|counterspell|lay on hands|consecration|mass resurrection|healing wave|last stand|mirror image|leap of faith|hellfire|starfall|soulbound|flight path|attunement|\bchi\b|warchief/i;
test('player-facing campaign text uses no banned names', () => {
  const texts = [idx.title, ...idx.chapters.flatMap(c => [c.name, c.blurb])];
  for (const m of allMissions) texts.push(m.name, m.place, ...m.briefing, ...m.objectives.map(o => o.text), ...m.script.flatMap(s => s.do.filter(a => a.do === 'say').flatMap(a => [a.who, a.text])), ...m.config.players.map(p => p.name));
  for (const t of texts) assert.ok(!BANNED.test(t || ''), `banned word in: ${t}`);
});

// the scripted bot: the strongest AI plays the human's seat (online takeover command), which uses the
// Barracks, Outfitter, Drill Yard, Sanctum, Toll and skills exactly as a player's commands would
for (const m of allMissions) {
  test(`${m.name}: winnable by the scripted bot, its objectives fire in order`, () => {
    const s = start(m, 1);
    s.step([{ sys: true, type: 'takeover', player: m.player, difficulty: 'commander' }]);
    const fired = [];
    while (!s.over && s.tick < 35 * 1200) { s.step([]); for (const e of s.drainEvents()) if (e.type === 'objective') fired.push(e.id); }
    const info = campaignInfo(s.state, data);
    assert.equal(info.outcome, 'won', `${m.id}: ${JSON.stringify(s.state.result)}`);
    assert.ok(info.stars >= 1 && info.stars <= info.maxStars);
    const required = m.objectives.filter(o => !o.optional).map(o => o.id);
    if (m.winWhen === 'objectives') for (const id of required) assert.ok(fired.includes(id), `${m.id}: ${id} fired`);
    for (const o of m.objectives) if (o.after && fired.includes(o.id)) assert.ok(fired.indexOf(o.after) < fired.indexOf(o.id), `${o.id} after ${o.after}`);
  });
}

test('the script: lines are said, tagged waves are tracked, slaying them completes the objective', () => {
  const m = allMissions.find(x => x.id === 'w5_tuskchief');
  const s = start(m, 2);
  const said = [];
  let t = 0;
  while (s.tick < 300 * 20 + 2) { s.step([]); for (const e of s.drainEvents()) if (e.type === 'say') said.push(e.who); }
  assert.ok(said.includes('Captain Merrow') && said.includes('The Tuskchief'));
  const tagged = s.state.campaign.tags.filter(x => x.tag === 'chief');
  assert.equal(tagged.length, 3, 'the Tuskchief and two Brutes');
  assert.equal(s.state.ents.find(e => e.id === tagged[0].id).type, 'tuskchief');
  const o = m.objectives.find(x => x.kind === 'slay');
  assert.equal(objectiveProgress(s.state, data, o).done, false);
  for (const x of tagged) { const e = s.state.ents.find(y => y.id === x.id); e.hp = 0; e.alive = false; e._gone = true; }
  s.step([]);
  assert.ok(s.state.campaign.done.includes(o.id));
  t = s.tick; assert.ok(t > 0);
});

test('an idle player loses at the time limit; a lost mission has no stars', () => {
  const m = { ...allMissions[0], timeLimit: 20 };
  const s = start(m, 3);
  while (!s.over) s.step([]);
  assert.equal(s.state.result.reason, 'time');
  const info = campaignInfo(s.state, data);
  assert.equal(info.outcome, 'lost'); assert.equal(info.stars, 0);
});

test('stars: winning is one, each star objective done at the end adds one', () => {
  const m = allMissions.find(x => x.id === 'w2_hold_the_ford');
  const s = start(m, 4);
  const p = s.state.players[0];
  p.skills[0].rank = 3;
  s.state.tick = 300 * 20; p.stats.kills = 50;
  s.step([]);
  const info = campaignInfo(s.state, data);
  assert.equal(info.outcome, 'won');
  assert.equal(info.stars, 3, 'full banners and no deaths: both star objectives');
});

test('a mission snapshots and restores mid-script to the same future', () => {
  const m = allMissions.find(x => x.id === 'w1_first_banner');
  const a = start(m, 5, false);
  for (let i = 0; i < 1000; i++) a.step(i % 40 === 0 ? [{ p: 0, type: 'send', unit: 'levy' }] : []);
  const b = restoreSim(a.snapshot(), data, { events: false });
  for (let i = 0; i < 1200; i++) { const c = i % 40 === 0 ? [{ p: 0, type: 'send', unit: 'levy' }] : []; a.step(c); b.step(c); }
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.state.campaign.done, b.state.campaign.done);
});
