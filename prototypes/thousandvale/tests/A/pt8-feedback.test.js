// Owner feedback 8 (stream A) — W28 a report can be COMPLETED with a changelog note the sender reads; W29 a signed-in
// player lists their OWN reports (state, admin note, completion text) and replies with a new report that carries `ref`
// and starts "#<id>"; W7 a report posted by an admin is approved as it arrives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FEEDBACK_STATES } from '../../js/net/protocol.js';
import { feedbackSink } from '../../server/load.mjs';
import { rowsFromJsonl } from '../../tools/lib/tv-env.mjs';
import { adminPage } from '../../server/admin-page.js';
import { m3Server, claimedAs, joinAs, run, until } from './m3-helpers.js';

const GAME = fileURLToPath(new URL('../..', import.meta.url));
const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

test('W28: an admin completes a report with a note; the note is kept apart from the admin note, lands in the JSONL file and in both printers', async () => {
  assert.ok(FEEDBACK_STATES.includes('completed'));
  const dir = mkdtempSync(join(tmpdir(), 'tv-fb8-'));
  const file = join(dir, 'feedback-dev.jsonl');
  const { srv, clock, store } = m3Server({ worldOpts: { feedbackSink: feedbackSink('dev', file) } });
  await srv.ready;
  const boss = await claimedAs(srv, clock, 'Bossy'), pleb = await claimedAs(srv, clock, 'Pleb');
  await store.setAdmin('bossyx', true);
  const fr = on(pleb, 'feedbackR'), ar = on(boss, 'adminR'), reps = on(boss, 'adminReports');
  pleb.feedback('bug', 'The chest vanished before I could open it.'); await until(clock, () => fr.length);
  const id = fr[0].id;
  assert.equal(fr[0].state, 'new');
  boss.adminOp('report', { id, state: 'approved', note: 'A has it' }); await until(clock, () => ar.length >= 1);
  boss.adminOp('report', { id, state: 'completed', note: 'Event chests now stay until everyone has looted, or two minutes pass.' }); await until(clock, () => ar.length >= 2);
  assert.equal(ar[1].ok, true, JSON.stringify(ar[1])); assert.equal(ar[1].state, 'completed');
  assert.equal(ar[1].counts.completed, 1); assert.equal(ar[1].counts.approved, 0);
  const row = await store.getFeedback(id);
  assert.equal(row.state, 'completed');
  assert.equal(row.note, 'A has it', 'the admin note is untouched');
  assert.match(row.done, /stay until everyone has looted/);
  assert.ok(row.doneAt > 0);
  // the admin list can ask for completed ones
  boss.adminOp('reports', { state: 'completed' }); await until(clock, () => reps.length);
  assert.equal(reps[0].list.length, 1); assert.match(reps[0].list[0].done, /two minutes/);
  // the file, and the two printers
  const rows = rowsFromJsonl(readFileSync(file, 'utf8'));
  assert.equal(rows[0].state, 'completed'); assert.match(rows[0].done, /two minutes/); assert.equal(rows[0].note, 'A has it');
  const md = execFileSync(process.execPath, [join(GAME, 'tools/feedback-report.mjs'), '--file', file], { encoding: 'utf8' });
  assert.match(md, /1 completed/); assert.match(md, /#\d+ · completed/); assert.match(md, /\*\*Completed.*:\*\* Event chests now stay/); assert.match(md, /\*\*Admin note:\*\* A has it/);
  const only = execFileSync(process.execPath, [join(GAME, 'tools/feedback-report.mjs'), '--file', file, '--state', 'completed', '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(only).length, 1);
  const html = execFileSync(process.execPath, [join(GAME, 'tools/feedback-page.mjs')], { encoding: 'utf8', input: only });
  assert.match(html, /<b>Completed:<\/b> Event chests now stay/); assert.match(html, /data-f="completed">Completed 1</);
  // the admin page offers it (and its inline script still parses)
  const page = adminPage();
  assert.match(page, />complete<\/button>/);
  for (const m of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]);
  boss.close(); pleb.close(); await srv.stop();
});

test('W29: my own reports — state, admin note and completion text, never another account\'s, never the server context; a reply is a new report with ref and "#<id>"', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const boss = await claimedAs(srv, clock, 'Bossy'), ann = await claimedAs(srv, clock, 'Ann'), bob = await claimedAs(srv, clock, 'Bob');
  await store.setAdmin('bossyx', true);
  const fa = on(ann, 'feedbackR'), fb = on(bob, 'feedbackR'), ar = on(boss, 'adminR'), la = on(ann, 'feedbackMine'), lb = on(bob, 'feedbackMine');
  ann.feedback('bug', 'Firebolt hits at once.'); await until(clock, () => fa.length >= 1);
  await run(clock, 2100);
  ann.feedback('suggestion', 'Ox carts between towns.'); await until(clock, () => fa.length >= 2);
  bob.feedback('bug', 'Bob has a different problem.'); await until(clock, () => fb.length >= 1);
  boss.adminOp('report', { id: fa[0].id, state: 'completed', note: 'Bolts fly now.' }); await until(clock, () => ar.length >= 1);
  boss.adminOp('report', { id: fa[1].id, state: 'declined', note: 'Not this year.' }); await until(clock, () => ar.length >= 2);
  boss.adminOp('report', { id: fb[0].id, state: 'trashed' }); await until(clock, () => ar.length >= 3);
  ann.myReports(); await until(clock, () => la.length);
  assert.equal(la[0].ok, true);
  assert.deepEqual(la[0].list.map(r => r.id), [fa[1].id, fa[0].id], 'mine only, newest first');
  const [sug, bug] = la[0].list;
  assert.equal(bug.state, 'completed'); assert.equal(bug.done, 'Bolts fly now.'); assert.ok(bug.doneAt); assert.equal(bug.note, 'Bolts fly now.', 'note = what to print'); assert.ok(bug.noteAt);
  assert.equal(sug.state, 'declined'); assert.equal(sug.note, 'Not this year.');
  assert.ok(!('server' in bug) && !('account' in bug) && !('client' in bug) && !('stateBy' in bug), 'only what the sender may see: ' + Object.keys(bug));
  // a trashed report reads "closed" to its sender
  bob.myReports(); await until(clock, () => lb.length);
  assert.equal(lb[0].list.length, 1); assert.equal(lb[0].list[0].state, 'closed');
  // the title screen (gateway socket) answers the same list
  ann._raw('gw', JSON.stringify({ t: 'feedback', op: 'mine', limit: 1 })); await until(clock, () => la.length >= 2);
  assert.equal(la[1].list.length, 1); assert.equal(la[1].more, true);
  ann.myReports({ before: la[1].list[0].id }); await until(clock, () => la.length >= 3);
  assert.deepEqual(la[2].list.map(r => r.id), [fa[0].id]);
  // a guest account is told to sign in
  const guest = await joinAs(srv, clock, 'Guesty'); const lg = on(guest, 'feedbackMine');
  guest.myReports(); await until(clock, () => lg.length);
  assert.equal(lg[0].ok, false); assert.equal(lg[0].why, 'guest'); assert.deepEqual(lg[0].list, []);
  guest.close();
  // reply: a NEW report, ref stored, the text starts with the reference
  await run(clock, 2100);
  ann.feedback('bug', 'Still instant for Burning Line.', null, fa[0].id); await until(clock, () => fa.length >= 3);
  assert.equal(fa[2].ok, true, JSON.stringify(fa[2])); assert.equal(fa[2].ref, fa[0].id); assert.notEqual(fa[2].id, fa[0].id);
  const reply = await store.getFeedback(fa[2].id);
  assert.equal(reply.ref, fa[0].id); assert.equal(reply.text, '#' + fa[0].id + ' Still instant for Burning Line.'); assert.equal(reply.state, 'new');
  // already prefixed by the client: not prefixed twice
  await run(clock, 2100);
  ann.feedback('bug', '#' + fa[0].id + ' and one more thing', null, fa[0].id); await until(clock, () => fa.length >= 4);
  assert.equal((await store.getFeedback(fa[3].id)).text, '#' + fa[0].id + ' and one more thing');
  // not to somebody else's report, not to one that does not exist
  await run(clock, 2100);
  ann.feedback('bug', 'me too', null, fb[0].id); await until(clock, () => fa.length >= 5);
  assert.equal(fa[4].ok, false); assert.equal(fa[4].why, 'ref');
  ann.feedback('bug', 'me too', null, 99999); await until(clock, () => fa.length >= 6);
  assert.equal(fa[5].why, 'ref');
  boss.close(); ann.close(); bob.close(); await srv.stop();
});

test('W7: an admin\'s own report is approved as it arrives (in the world and from the title screen); anyone else\'s stays new', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const boss = await claimedAs(srv, clock, 'Bossy'), pleb = await claimedAs(srv, clock, 'Pleb');
  await store.setAdmin('bossyx', true);
  const fb = on(boss, 'feedbackR'), fp = on(pleb, 'feedbackR');
  boss.feedback('bug', 'The gate road runs into a house.'); await until(clock, () => fb.length);
  assert.equal(fb[0].state, 'approved');
  const row = await store.getFeedback(fb[0].id);
  assert.equal(row.state, 'approved'); assert.match(row.stateBy, /admin/);
  await run(clock, 2100);
  boss._raw('gw', JSON.stringify({ t: 'feedback', kind: 'suggestion', text: 'From the title screen.' })); await until(clock, () => fb.length >= 2);
  assert.equal((await store.getFeedback(fb[1].id)).state, 'approved');
  pleb.feedback('bug', 'Mine waits for review.'); await until(clock, () => fp.length);
  assert.equal((await store.getFeedback(fp[0].id)).state, 'new');
  assert.deepEqual(await store.feedbackCounts(), { new: 1, approved: 2, declined: 0, trashed: 0, completed: 0, total: 3 });
  // take the flag away: the next one waits again
  await store.setAdmin('bossyx', false);
  await run(clock, 2100);
  boss.feedback('bug', 'No longer an admin.'); await until(clock, () => fb.length >= 3);
  assert.equal(fb[2].state, 'new');
  boss.close(); pleb.close(); await srv.stop();
});

const HAVE_PG = !!(process.env.PGDATABASE || process.env.DATABASE_URL);
test('W28/W29 on Postgres (schema v6): completed + done note, ref, list by account, an admin row arrives approved', { skip: !HAVE_PG && 'no PG* environment' }, async () => {
  const { createPgStore } = await import('../../server/db/pg-store.js');
  const st = createPgStore();
  await st.init();
  const g1 = await st.createGuest(null), g2 = await st.createGuest(null);
  const ids = [];
  try {
    const a = await st.addFeedback({ at: Date.now() - 5000, kind: 'bug', text: 'pg one', account: g1.account, client: {}, server: {} }); ids.push(a.id);
    const b = await st.addFeedback({ at: Date.now() - 4000, kind: 'bug', text: '#' + a.id + ' pg reply', account: g1.account, ref: a.id, state: 'approved', stateBy: 'admin (own report)', client: {}, server: {} }); ids.push(b.id);
    const c = await st.addFeedback({ at: Date.now() - 3000, kind: 'suggestion', text: 'pg other', account: g2.account, client: {}, server: {} }); ids.push(c.id);
    assert.equal(await st.setFeedbackState(a.id, 'approved', { by: 't', note: 'looking' }), true);
    assert.equal(await st.setFeedbackState(a.id, 'completed', { by: 't', done: 'fixed it' }), true);
    const ra = await st.getFeedback(a.id), rb = await st.getFeedback(b.id);
    assert.equal(ra.state, 'completed'); assert.equal(ra.note, 'looking'); assert.equal(ra.done, 'fixed it'); assert.ok(ra.doneAt > 0); assert.equal(ra.ref, null);
    assert.equal(rb.ref, a.id); assert.equal(rb.state, 'approved'); assert.equal(rb.stateBy, 'admin (own report)'); assert.ok(rb.stateAt > 0);
    const mine = await st.listFeedback({ account: g1.account, limit: 10 });
    assert.deepEqual(mine.map(r => r.id), [b.id, a.id]);
    assert.equal((await st.listFeedback({ state: 'completed', limit: 5000 })).some(r => r.id === a.id), true);
    assert.ok((await st.feedbackCounts()).completed >= 1);
    assert.equal(await st.getFeedback(2147483000), null);
  } finally {
    await st.pool.query('DELETE FROM feedback WHERE id = ANY($1::bigint[])', [ids]).catch(() => {});
    for (const g of [g1, g2]) await st.pool.query('DELETE FROM accounts WHERE id = $1', [g.account]).catch(() => {});
    await st.close();
  }
});
