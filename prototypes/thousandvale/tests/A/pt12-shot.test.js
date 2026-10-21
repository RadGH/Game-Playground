// Play-test 12 (#71): a bug report with a screenshot. The report says `shot: true`; its answer says go ahead; the
// picture follows in feedbackShot parts and lands beside the feedback file (feedback-shots/<env>-<id>.jpg), which
// tools/feedback-report.mjs prints. Only the sender, only a real picture, only within the size cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHOT, shotMagic } from '../../js/sim/feedback.js';
import { feedbackSink } from '../../server/load.mjs';
import { rowsFromJsonl } from '../../tools/lib/tv-env.mjs';
import { m3Server, joinAs, until, run } from './m3-helpers.js';

const GAME = fileURLToPath(new URL('../..', import.meta.url));
const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
// a real (tiny) JPEG: SOI + APP0 JFIF header + padding — enough for the magic-number check
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.alloc(30000, 7), Buffer.from([0xff, 0xd9])]);
const DATA = 'data:image/jpeg;base64,' + JPEG.toString('base64');

test('#71: shotMagic believes the bytes, not the label', () => {
  assert.equal(shotMagic('jpeg', JPEG.toString('base64')), true);
  assert.equal(shotMagic('png', JPEG.toString('base64')), false);
  assert.equal(shotMagic('jpeg', Buffer.from('<svg onload=x>').toString('base64')), false);
});

test('#71: a bug report with a screenshot — sent in parts, kept as a file beside the report, printed by the report tool', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tv-shot-'));
  const file = join(dir, 'feedback-dev.jsonl');
  const { srv, clock } = m3Server({ worldOpts: { feedbackSink: feedbackSink('dev', file) } });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Snapper');
  const fr = on(a, 'feedbackR'), sr = on(a, 'feedbackShotR');
  a.feedback('bug', 'The wall is crooked here.', { where: { x: 1, z: 2 } }, undefined, true);
  await until(clock, () => fr.length);
  assert.equal(fr[0].ok, true); assert.equal(fr[0].shot, true, 'go ahead with the picture');
  const n = a.feedbackShot(fr[0].id, DATA);
  assert.ok(n > 1, 'it went in parts: ' + n);
  await until(clock, () => sr.length);
  assert.equal(sr[0].ok, true, JSON.stringify(sr[0])); assert.equal(sr[0].id, fr[0].id);
  const shot = join(dir, 'feedback-shots', `dev-${fr[0].id}.jpg`);
  assert.ok(existsSync(shot)); assert.deepEqual(readFileSync(shot), JPEG);
  const rows = rowsFromJsonl(readFileSync(file, 'utf8'));
  assert.equal(rows.length, 1, 'the shot line names the report, it is not a report of its own');
  assert.equal(rows[0].shotFile, `dev-${fr[0].id}.jpg`);
  const md = execFileSync(process.execPath, [join(GAME, 'tools/feedback-report.mjs'), '--file', file], { encoding: 'utf8' });
  assert.match(md, new RegExp(`\\*\\*Screenshot:\\*\\* .*dev-${fr[0].id}\\.jpg`));
  const json = JSON.parse(execFileSync(process.execPath, [join(GAME, 'tools/feedback-report.mjs'), '--file', file, '--json'], { encoding: 'utf8' }));
  const html = execFileSync(process.execPath, [join(GAME, 'tools/feedback-page.mjs')], { input: JSON.stringify(json), encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.match(html, /<img alt="Screenshot sent with #\d+"[^>]+src="data:image\/jpeg;base64,/);

  // a second picture for the same report is not taken; nor one for a report that did not ask; nor a fake picture
  a.feedbackShot(fr[0].id, DATA); await until(clock, () => sr.length >= 2);
  assert.equal(sr[1].ok, false);
  await run(clock, 2500);
  a.feedback('bug', 'Another one, no picture this time.'); await until(clock, () => fr.length >= 2, 6000);
  assert.ok(fr[1].ok && !fr[1].shot);
  await run(clock, 2500);
  a.feedback('bug', 'A third, with a fake picture.', null, undefined, true); await until(clock, () => fr.length >= 3, 6000);
  a.feedbackShot(fr[2].id, 'data:image/jpeg;base64,' + Buffer.from('not a picture at all, just words').toString('base64'));
  await until(clock, () => sr.length >= 3);
  assert.equal(sr[2].ok, false); assert.equal(sr[2].why, 'kind', JSON.stringify({ fr, sr }));
  // too big
  await run(clock, 2500);
  a.feedback('bug', 'A fourth, far too big.', null, undefined, true); await until(clock, () => fr.length >= 4, 6000);
  a.feedbackShot(fr[3].id, 'data:image/jpeg;base64,' + Buffer.alloc(SHOT.chars, 1).toString('base64'));
  await until(clock, () => sr.length >= 4);
  assert.equal(sr[3].ok, false); assert.ok(['size', 'parts'].includes(sr[3].why), sr[3].why);
  a.close();
});

test('#71: another account cannot attach a picture to my report', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tv-shot-'));
  const { srv, clock } = m3Server({ worldOpts: { feedbackSink: feedbackSink('dev', join(dir, 'feedback-dev.jsonl')) } });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Owner'), b = await joinAs(srv, clock, 'Meddler');
  const fr = on(a, 'feedbackR'), sr = on(b, 'feedbackShotR');
  a.feedback('bug', 'Mine, with a picture coming.', null, undefined, true); await until(clock, () => fr.length);
  b.feedbackShot(fr[0].id, DATA); await until(clock, () => sr.length);
  assert.equal(sr[0].ok, false); assert.equal(sr[0].why, 'unknown');
  assert.ok(!existsSync(join(dir, 'feedback-shots', `dev-${fr[0].id}.jpg`)));
  a.close(); b.close();
});
