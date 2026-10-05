// Stream H: the off-machine backup uploader (ops/lib/offsite-upload.mjs) — SigV4 against AWS's published example,
// URL styles, and a full PUT against a local server that checks the signature itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { signV4, target, putObject, configFromEnv } from '../../ops/lib/offsite-upload.mjs';

test('SigV4 matches the AWS documentation example (IAM ListUsers, 20150830T123600Z)', () => {
  const r = signV4({
    method: 'GET', path: '/', query: 'Action=ListUsers&Version=2010-05-08',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Host: 'iam.amazonaws.com', 'X-Amz-Date': '20150830T123600Z' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    accessKeyId: 'AKIDEXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'iam', amzDate: '20150830T123600Z',
  });
  assert.equal(r.signedHeaders, 'content-type;host;x-amz-date');
  assert.match(r.authorization, /Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7$/);
});

test('target: S3 defaults to virtual-hosted style, R2 to path style; keys are encoded per segment', () => {
  const s3 = target({ endpoint: 'https://s3.us-west-2.amazonaws.com', bucket: 'tv-backups', key: 'thousandvale/stable/a b.dump' });
  assert.equal(s3.url, 'https://tv-backups.s3.us-west-2.amazonaws.com/thousandvale/stable/a%20b.dump');
  const r2 = target({ endpoint: 'https://abc123.r2.cloudflarestorage.com', bucket: 'tv', key: 'p/x.dump' });
  assert.equal(r2.url, 'https://abc123.r2.cloudflarestorage.com/tv/p/x.dump');
  assert.equal(r2.style, 'path');
});

test('config: placeholders and plain http endpoints count as missing', () => {
  const { missing } = configFromEnv({ TV_OFFSITE_ENDPOINT: 'http://evil.example', TV_OFFSITE_REGION: 'auto', TV_OFFSITE_BUCKET: '@BUCKET@', TV_OFFSITE_KEY_ID: 'k', TV_OFFSITE_SECRET: 's' });
  assert.ok(missing.includes('bucket'));
  assert.ok(missing.includes('endpoint must be https'));
  assert.deepEqual(configFromEnv({ TV_OFFSITE_ENDPOINT: 'https://x.r2.cloudflarestorage.com', TV_OFFSITE_REGION: 'auto', TV_OFFSITE_BUCKET: 'b', TV_OFFSITE_KEY_ID: 'k', TV_OFFSITE_SECRET: 's' }).missing, []);
});

test('putObject: a real PUT whose signature the receiving server recomputes and accepts', async () => {
  const secret = 'test-secret-not-real';
  let got = null;
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c)).on('end', () => {
      const body = Buffer.concat(chunks);
      const hash = createHash('sha256').update(body).digest('hex');
      const auth = req.headers.authorization || '';
      const signed = /SignedHeaders=([^,]+)/.exec(auth)[1].split(';');
      const headers = Object.fromEntries(signed.map(h => [h, req.headers[h]]));
      const again = signV4({ method: req.method, path: req.url, headers, payloadHash: req.headers['x-amz-content-sha256'], accessKeyId: 'KEY', secret, region: 'auto', service: 's3', amzDate: req.headers['x-amz-date'] });
      const ok = again.authorization === auth && hash === req.headers['x-amz-content-sha256'];
      got = { url: req.url, ok, len: body.length };
      res.writeHead(ok ? 200 : 403); res.end();
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const cfg = { endpoint: `http://127.0.0.1:${srv.address().port}`, region: 'auto', bucket: 'bk', keyId: 'KEY', secret };
  const status = await putObject(cfg, 'thousandvale/stable/x.dump', Buffer.from('PGDMP fake dump'));
  assert.equal(status, 200);
  assert.deepEqual(got, { url: '/bk/thousandvale/stable/x.dump', ok: true, len: 15 });
  await assert.rejects(putObject({ ...cfg, secret: 'wrong' }, 'k', Buffer.from('x'), { tries: 1 }), /upload failed: HTTP 403/);
  assert.equal(got.ok, false);
  srv.close();
});
