// Play-test 5 (stream A) — T19 feedback (suggestion | bug, the client's context + the server's), T20 the thank-you letter with
// a gift box that opens into a rare-or-better item + the ONE mail API, T21 admins (a flag only a CLI tool sets) reading
// reports and changing their state, the JSONL file and the Markdown report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sanitize, FEEDBACK } from '../../js/sim/feedback.js';
import { rarityRank } from '../../js/sim/crates.js';
import { feedbackSink } from '../../server/load.mjs';
import { rowsFromJsonl } from '../../tools/lib/tv-env.mjs';
import { m3Server, claimedAs, joinAs, run, until } from './m3-helpers.js';

const GAME = fileURLToPath(new URL('../..', import.meta.url));
const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

test('T19 sanitize: control characters go, deep nesting goes, logs are capped by lines and length, the whole thing by size', () => {
  const big = { where: { x: 1.23456, z: 2, zone: 'z12_02', deep: { a: { b: { c: { d: 1 } } } } }, note: 'a\u0000b\u0007c', __proto__: { evil: 1 }, constructor: 'x',
    logs: Array.from({ length: 200 }, (_, i) => 'line ' + i + ' ' + 'x'.repeat(500)), fn: () => 1, n: Infinity };
  const c = sanitize(big);
  assert.equal(c.note, 'abc');
  assert.equal(c.where.x, 1.235);
  assert.ok(!('constructor' in c) || typeof c.constructor !== 'string', 'no constructor key');
  assert.ok(!c.fn && c.n === undefined);
  assert.ok(c.logs.length <= FEEDBACK.logLines && c.logs.every(l => l.length <= FEEDBACK.logLine));
  assert.ok(JSON.stringify(c).length <= FEEDBACK.ctxMax, 'capped: ' + JSON.stringify(c).length);
  assert.ok(c.logs.at(-1).startsWith('line 199'), 'the NEWEST lines are kept');
  assert.deepEqual(sanitize(null), {}); assert.deepEqual(sanitize([1, 2]), {});
  assert.deepEqual(sanitize({ log: ['a'] }).logs, ['a'], '`log` is read as `logs`');
});

test('T19 + T20: a bug report from inside the world is stored with both contexts and written to the JSONL file; the first one mails a gift that opens into a rare or better', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tv-fb-'));
  const file = join(dir, 'feedback-dev.jsonl');
  const { srv, clock, store } = m3Server({ worldOpts: { feedbackSink: feedbackSink('dev', file) } });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Reporter');
  const fr = on(a, 'feedbackR'), mailNew = on(a, 'mailNew');
  // refusals first
  a.feedback('rant', 'hello there'); await until(clock, () => fr.length >= 1);
  assert.equal(fr[0].ok, false); assert.equal(fr[0].why, 'kind');
  a.feedback('bug', ' '); await until(clock, () => fr.length >= 2);
  assert.equal(fr[1].why, 'empty');
  // the report
  a.feedback('bug', 'I killed the wolves and the event did not end.\u0007', { where: { x: 10, z: 20, zone: 'test' }, char: { name: 'Reporter', level: 1 }, logs: ['[net] joined', '[ui] event tracker missing'], ua: 'TestBrowser/1' });
  await until(clock, () => fr.length >= 3);
  assert.equal(fr[2].ok, true, JSON.stringify(fr[2]));
  assert.equal(fr[2].first, true, 'the first report of this character earns a letter');
  const rows = await store.listFeedback({});
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.kind, 'bug'); assert.equal(r.state, 'new'); assert.equal(r.name, 'Reporter');
  assert.equal(r.text, 'I killed the wolves and the event did not end.', 'control characters stripped');
  assert.deepEqual(r.client.logs, ['[net] joined', '[ui] event tracker missing']);
  assert.equal(r.client.where.zone, 'test');
  // the server's own context: where it REALLY was
  assert.ok(r.server.room && Number.isFinite(r.server.x) && Number.isFinite(r.server.z) && r.server.level === 1 && r.server.cls === 'warrior' && r.server.protocol >= 7, JSON.stringify(r.server).slice(0, 300));
  // the file
  assert.ok(existsSync(file));
  const lines = readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(lines.length, 1); assert.equal(lines[0].ev, 'new'); assert.equal(lines[0].id, r.id); assert.equal(lines[0].text, r.text);
  // T20: the letter, taken where I stand (no town needed for a system letter), and the gift opens
  await until(clock, () => mailNew.length);
  const list = on(a, 'mailList'), open = on(a, 'mailOpen'), mr = on(a, 'mailR'), ir = on(a, 'itemR');
  a.mail('list'); await until(clock, () => list.length);
  const letter = list[0].mail[0];
  assert.equal(letter.subject, 'Thank you'); assert.equal(letter.kind, 'system'); assert.equal(letter.items.length, 1);
  a.mail('read', { id: letter.id }); await until(clock, () => open.length);
  assert.match(open[0].mail.body, /taking the time to improve the game/);
  assert.equal(open[0].mail.items[0].kind, 'gift');
  const o = srv.world.online.get(a.joined.you.char);
  srv.world.transfer(o, srv.world.room, { x: srv.world.gate.x + 60, z: srv.world.gate.z + 60 }, 'test');     // out in the wilds
  await run(clock, 200);
  a.mail('take', { id: letter.id }); await until(clock, () => mr.length);
  assert.equal(mr[0].ok, true, 'a system letter is taken anywhere: ' + JSON.stringify(mr[0]));
  const gift = o.char.bag.find(i => i.kind === 'gift');
  assert.ok(gift, 'the gift box is in the bag');
  a.openItem(gift.uid); await until(clock, () => ir.length);
  assert.equal(ir[0].ok, true, JSON.stringify(ir[0]));
  assert.equal(ir[0].opened.from, 'gift');
  assert.ok(ir[0].opened.item && rarityRank(ir[0].opened.item.rarity) >= rarityRank('rare'), 'rare or better: ' + JSON.stringify(ir[0].opened.item));
  assert.ok(!o.char.bag.some(i => i.kind === 'gift'), 'the box is gone');
  assert.ok(o.char.bag.some(i => i.uid === ir[0].opened.item.uid), 'what was inside is in the bag');
  // a second report: thanks, but one gift per character; and the rate limit answers
  a.feedback('suggestion', 'More fish.'); await until(clock, () => fr.length >= 4);
  assert.equal(fr[3].ok, false); assert.equal(fr[3].why, 'slow', 'one every 2 s');
  await run(clock, 2100);
  a.feedback('suggestion', 'More fish.'); await until(clock, () => fr.length >= 5);
  assert.equal(fr[4].ok, true); assert.equal(fr[4].first, false, 'no second gift');
  assert.equal((await store.listFeedback({})).length, 2);
  a.close(); await srv.stop();
});

test('T19: a report from the title screen (gateway socket, no character) is stored too; an oversized context is trimmed, never refused', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Titler');
  const fr = on(a, 'feedbackR');
  a._raw('gw', JSON.stringify({ t: 'feedback', kind: 'suggestion', text: 'A darker title screen please.', ctx: { logs: Array.from({ length: 40 }, (_, i) => 'l' + i + 'y'.repeat(250)) } }));
  await until(clock, () => fr.length);
  assert.equal(fr[0].ok, true, JSON.stringify(fr[0]));
  const r = (await store.listFeedback({}))[0];
  assert.equal(r.server.via, 'gateway');
  assert.ok(JSON.stringify(r.client).length <= FEEDBACK.ctxMax);
  a.close(); await srv.stop();
});

test('T21: only an account with the admin flag reads reports and changes their state (new -> approved / declined / trashed); the flag is read from the store each time', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tv-fb-'));
  const file = join(dir, 'feedback-dev.jsonl');
  const { srv, clock, store } = m3Server({ worldOpts: { feedbackSink: feedbackSink('dev', file) } });
  await srv.ready;
  const boss = await claimedAs(srv, clock, 'Bossy'), pleb = await claimedAs(srv, clock, 'Pleb');
  const fr = on(pleb, 'feedbackR');
  pleb.feedback('bug', 'The gate is sideways.'); await until(clock, () => fr.length);
  await run(clock, 2100);
  pleb.feedback('suggestion', 'Add fishing.'); await until(clock, () => fr.length >= 2);
  // nobody is an admin yet
  const ar = on(boss, 'adminR'), reps = on(boss, 'adminReports');
  boss.adminOp('reports'); await until(clock, () => ar.length);
  assert.equal(ar[0].ok, false); assert.equal(ar[0].why, 'forbidden');
  // what tools/make-admin.mjs does: the store's flag, by username
  const set = await store.setAdmin('bossyx', true);
  assert.equal(set.ok, true);
  assert.equal((await store.setAdmin('nobody-here', true)).err, 'missing');
  boss.adminOp('reports'); await until(clock, () => reps.length);
  assert.equal(reps[0].list.length, 2);
  assert.deepEqual(reps[0].counts, { new: 2, approved: 0, declined: 0, trashed: 0, total: 2 });
  const bug = reps[0].list.find(r => r.kind === 'bug');
  assert.ok(bug.text === 'The gate is sideways.' && bug.name === 'Pleb' && bug.server && bug.ctx, 'a full row');
  boss.adminOp('report', { id: bug.id, state: 'approved', note: 'W is on it' }); await until(clock, () => ar.length >= 2);
  assert.equal(ar[1].ok, true); assert.equal(ar[1].state, 'approved');
  const sug = reps[0].list.find(r => r.kind === 'suggestion');
  boss.adminOp('report', { id: sug.id, state: 'trash' }); await until(clock, () => ar.length >= 3);          // D-UI's word for it
  assert.equal(ar[2].state, 'trashed');
  boss.adminOp('report', { id: sug.id, state: 'bogus' }); await until(clock, () => ar.length >= 4);
  assert.equal(ar[3].ok, false);
  // the default list hides the trash; a state filter shows it; the gateway socket works too
  boss.adminOp('reports'); await until(clock, () => reps.length >= 2);
  assert.deepEqual(reps[1].list.map(r => r.state), ['approved']);
  assert.equal(reps[1].list[0].note, 'W is on it');
  boss._raw('gw', JSON.stringify({ t: 'admin', op: 'reports', state: 'trashed' })); await until(clock, () => reps.length >= 3);
  assert.deepEqual(reps[2].list.map(r => r.id), [sug.id]);
  // the other player still cannot
  const pr = on(pleb, 'adminR');
  pleb.adminOp('report', { id: bug.id, state: 'trashed' }); await until(clock, () => pr.length);
  assert.equal(pr[0].why, 'forbidden');
  assert.equal((await store.listFeedback({ state: 'approved' })).length, 1, 'untouched');
  // the flag is gone at once when it is taken away (no re-login)
  await store.setAdmin('bossyx', false);
  boss.adminOp('reports'); await until(clock, () => ar.length >= 5);
  assert.equal(ar[4].why, 'forbidden');
  // the admin page's handle (127.0.0.1) is the same list
  const page = await srv.world.gateway.admin.feedback({ state: 'approved' });
  assert.equal(page.list.length, 1);
  await srv.world.gateway.admin.feedbackState(bug.id, 'declined');
  assert.equal((await store.listFeedback({ state: 'declined' })).length, 1);
  // the file has every report and every review, and replays to the same states
  const rows = rowsFromJsonl(readFileSync(file, 'utf8'));
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.id === bug.id).state, 'declined');
  assert.equal(rows.find(r => r.id === sug.id).state, 'trashed');
  // tools/feedback-report.mjs prints it as Markdown (here: from the file, as a server without a database leaves it)
  const md = execFileSync(process.execPath, [join(GAME, 'tools/feedback-report.mjs'), '--file', file, '--state', 'all'], { encoding: 'utf8' });
  assert.match(md, /^# Thousandvale feedback/);
  assert.match(md, /## Bug reports \(1\)/); assert.match(md, /> The gate is sideways\./); assert.match(md, /declined/);
  assert.match(md, /## Suggestions \(1\)/); assert.match(md, /> Add fishing\./);
  assert.match(md, /\*\*Where \(server\):\*\*/);
  const md2 = execFileSync(process.execPath, [join(GAME, 'tools/feedback-report.mjs'), '--file', file], { encoding: 'utf8' });
  assert.ok(!/Add fishing/.test(md2), 'trashed reports are left out by default');
  boss.close(); pleb.close(); await srv.stop();
});

test('T21: `authed.admin` / `joined.you.admin` tell the client to show the Reports button', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Flagged');
  assert.ok(!a.joined.you.admin);
  await store.setAdmin('flaggedx', true);
  a.close(); await run(clock, 6000);
  const { makeClient, waitP } = await import('./helpers.js');
  const b = makeClient(srv, clock, { login: { user: 'flaggedx', pass: 'correct horse' } });
  const { settle } = await import('./m3-helpers.js');
  await settle(clock, () => b.status === 'select');
  assert.equal(b.admin, true, 'authed.admin');
  await waitP(clock, b.play(b.chars[0].id));
  assert.equal(b.joined.you.admin, true);
  b.close(); await srv.stop();
});

test('T20: ONE mail API — province.mailTo / gateway.mailTo post items, gold, a gift box or a crate to a character by id or name (offline too)', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Lucky');
  const W = srv.world, o = W.online.get(a.joined.you.char);
  const mailNew = on(a, 'mailNew');
  const r1 = await W.mailTo({ to: o.char.id, subject: 'From the harvest fair', body: 'You won the raffle.', gold: 25, items: [{ name: 'Blue Ribbon', rarity: 'magic', slot: 'neck' }], gift: { minRarity: 'legendary' } });
  assert.equal(r1.ok, true); assert.equal(r1.items, 2);
  const r2 = await W.gateway.mailTo({ to: 'lucky', subject: 'A crate', body: 'For your trouble.', crate: { slot: 'feet', min: 'uncommon' } });
  assert.equal(r2.ok, true);
  assert.equal((await W.mailTo({ to: 'no such person', subject: 'x' })).ok, false);
  await until(clock, () => mailNew.length >= 2);
  const mr = on(a, 'mailR'), list = on(a, 'mailList');
  a.mail('list'); await until(clock, () => list.length);
  assert.equal(list[0].mail.length, 2);
  for (const m of list[0].mail) { const n = mr.length; a.mail('take', { id: m.id }); await until(clock, () => mr.length > n); await run(clock, 100); }
  assert.ok(mr.every(m => m.ok), JSON.stringify(mr));
  assert.equal(o.char.gold, 25);
  assert.equal(o.char.bag.length, 3);
  assert.ok(o.char.bag.find(i => i.kind === 'crate' && i.crate.slot === 'feet'));
  assert.ok(o.char.bag.find(i => i.kind === 'gift' && i.gift.minRarity === 'legendary'));
  assert.equal(new Set(o.char.bag.map(i => i.uid)).size, 3, 'every posted item has its own uid');
  assert.equal((await store.escrow()).items, 0, 'nothing left in escrow');
  // a system letter cannot be sent back
  a.close(); await srv.stop();
});

test('U2 (play-test 6): the owner files reports while play-testing — 2 s apart is fine, and thirty in a row all go through', async () => {
  const { FEEDBACK } = await import('../../js/sim/feedback.js');
  assert.equal(FEEDBACK.gapMs, 2000); assert.ok(FEEDBACK.perHour >= 1000);
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Prolific');
  const fr = on(a, 'feedbackR');
  for (let k = 0; k < 30; k++) { a.feedback('bug', 'Report number ' + k); await until(clock, () => fr.length > k, 2000); await run(clock, 2100); }
  assert.equal(fr.filter(m => m.ok).length, 30, JSON.stringify(fr.filter(m => !m.ok)[0]));
  assert.equal((await store.listFeedback({ limit: 100 })).length, 30);
  a.close(); await srv.stop();
});
