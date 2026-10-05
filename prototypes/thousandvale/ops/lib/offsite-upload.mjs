#!/usr/bin/env node
// Thousandvale — nightly OFF-MACHINE backup copy to S3 or Cloudflare R2 (stream H, PLAN §9.6). No dependencies:
// plain Node (the service's /opt/thousandvale/node) + AWS Signature V4, so nothing new has to be installed.
//
//   node ops/lib/offsite-upload.mjs <file.dump>            upload one file (the nightly unit passes the newest daily dump)
//   node ops/lib/offsite-upload.mjs --latest <dir>         upload the newest *.dump in <dir> (what the unit runs)
//   node ops/lib/offsite-upload.mjs --dry-run <file>       print the target URL + signed headers' names, send nothing
//   node ops/lib/offsite-upload.mjs --check                say whether the env is complete (no network)
//
// Configuration (env; the unit loads /etc/thousandvale/offsite.env, owner thousandvale, 0400 — NOT the game's env, so the
// game process never holds the backup key). Template: ops/offsite.env.template.
//   TV_OFFSITE_ENDPOINT   https://<account-id>.r2.cloudflarestorage.com   or   https://s3.<region>.amazonaws.com
//   TV_OFFSITE_REGION     auto (R2)  or  us-east-1 / us-west-2 / ... (S3)
//   TV_OFFSITE_BUCKET     bucket name
//   TV_OFFSITE_PREFIX     key prefix, default "thousandvale/stable/"
//   TV_OFFSITE_KEY_ID     access key id of a WRITE-ONLY key (PutObject on that bucket/prefix, nothing else)
//   TV_OFFSITE_SECRET     its secret
//   TV_OFFSITE_STYLE      virtual | path (default: virtual for amazonaws.com — new S3 buckets refuse path style — path otherwise)
//   TV_OFFSITE_PASSFILE   optional: a passphrase file; when set the dump is encrypted (openssl aes-256-cbc, pbkdf2 200k)
//                         before it leaves the machine. Keep a copy of that passphrase OFF this machine (password manager),
//                         or the offsite copy cannot be opened after losing the VM.
// Retention (14 days) is a LIFECYCLE RULE on the bucket, set once by the owner — the write-only key cannot delete,
// which is the point: someone who steals the key can add files but cannot erase the backups.
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const sha256hex = b => createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
/** RFC 3986 encoding as SigV4 wants it (encodeURIComponent leaves !'()* alone). */
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * AWS Signature V4. Pure. Returns { authorization, signedHeaders, canonicalRequest, stringToSign }.
 * headers: plain object (any case); must include host and x-amz-date. path: already URI-encoded per segment.
 */
export function signV4({ method, path, query = '', headers, payloadHash, accessKeyId, secret, region, service, amzDate }) {
  const date = amzDate.slice(0, 8);
  const h = Object.entries(headers).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim().replace(/\s+/g, ' ')]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const canonicalHeaders = h.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaders = h.map(([k]) => k).join(';');
  const canonicalQuery = query ? query.split('&').map(p => p.split('=')).map(([k, v = '']) => [enc(decodeURIComponent(k)), enc(decodeURIComponent(v))])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&') : '';
  const canonicalRequest = [method, path || '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + secret, date), region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return { authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`, signedHeaders, canonicalRequest, stringToSign };
}

/** Where a key goes: { url, host, path } for virtual-hosted or path style. */
export function target({ endpoint, bucket, key, style }) {
  const u = new URL(endpoint);
  const st = style || (/amazonaws\.com$/.test(u.hostname) ? 'virtual' : 'path');
  const keyPath = '/' + key.split('/').map(enc).join('/');
  const host = st === 'virtual' ? `${bucket}.${u.host}` : u.host;
  const path = st === 'virtual' ? keyPath : `/${enc(bucket)}${keyPath}`;
  return { url: `${u.protocol}//${host}${path}`, host, path, style: st };
}

export function configFromEnv(env = process.env) {
  const c = {
    endpoint: env.TV_OFFSITE_ENDPOINT, region: env.TV_OFFSITE_REGION, bucket: env.TV_OFFSITE_BUCKET,
    prefix: env.TV_OFFSITE_PREFIX ?? 'thousandvale/stable/', keyId: env.TV_OFFSITE_KEY_ID, secret: env.TV_OFFSITE_SECRET,
    style: env.TV_OFFSITE_STYLE || null, passfile: env.TV_OFFSITE_PASSFILE || null,
  };
  const missing = ['endpoint', 'region', 'bucket', 'keyId', 'secret'].filter(k => !c[k] || /^@|CHANGE_ME/.test(c[k]));
  if (c.endpoint && !/^https:\/\//.test(c.endpoint) && !/^http:\/\/127\.0\.0\.1[:/]/.test(c.endpoint)) missing.push('endpoint must be https');
  return { config: c, missing };
}

/** PUT one body. fetchImpl injectable for tests. Returns the HTTP status. */
export async function putObject(cfg, key, body, { fetchImpl = globalThis.fetch, now = new Date(), tries = 3 } = {}) {
  const t = target({ endpoint: cfg.endpoint, bucket: cfg.bucket, key, style: cfg.style });
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const payloadHash = sha256hex(body);
  const headers = { host: t.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, 'content-type': 'application/octet-stream' };
  const { authorization } = signV4({ method: 'PUT', path: t.path, headers, payloadHash, accessKeyId: cfg.keyId, secret: cfg.secret, region: cfg.region, service: 's3', amzDate });
  let last = '';
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetchImpl(t.url, { method: 'PUT', headers: { ...headers, authorization, 'content-length': String(body.length) }, body });
      if (res.ok) return res.status;
      last = `HTTP ${res.status} ${(await res.text()).slice(0, 300)}`;
      if (res.status >= 400 && res.status < 500) break;          // auth/permission problems do not fix themselves
    } catch (err) { last = err.message; }
    if (i < tries) await new Promise(r => setTimeout(r, 2000 * i));
  }
  throw new Error('upload failed: ' + last);
}

function newest(dir) {
  const f = readdirSync(dir).filter(n => n.endsWith('.dump')).map(n => ({ n, t: statSync(join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (!f) throw new Error('no .dump in ' + dir);
  return join(dir, f.n);
}

const isMain = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isMain) {
  const a = process.argv.slice(2);
  const { config, missing } = configFromEnv();
  if (a[0] === '--check') { if (missing.length) { console.log('offsite: NOT configured — missing ' + missing.join(', ')); process.exit(1); } console.log(`offsite: configured -> ${target({ endpoint: config.endpoint, bucket: config.bucket, key: config.prefix + 'x', style: config.style }).url.replace(/x$/, '')} (encrypt: ${config.passfile ? 'yes' : 'no'})`); process.exit(0); }
  const dry = a[0] === '--dry-run'; if (dry) a.shift();
  let file = a[0] === '--latest' ? newest(a[1]) : a[0];
  if (!file) { console.error('usage: offsite-upload.mjs [--dry-run] <file> | --latest <dir> | --check'); process.exit(2); }
  if (missing.length && !dry) { console.error('offsite: not configured (' + missing.join(', ') + ') — see ops/offsite.env.template'); process.exit(1); }
  let body, name = basename(file), tmp = null;
  if (config.passfile) {
    tmp = join(process.env.TMPDIR || tmpdir(), name + '.enc');
    execFileSync('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-pass', 'file:' + config.passfile, '-in', file, '-out', tmp]);
    body = readFileSync(tmp); name += '.enc';
  } else body = readFileSync(file);
  const key = (config.prefix || '') + name;
  try {
    if (dry) {
      const t = target({ endpoint: config.endpoint || 'https://example.r2.cloudflarestorage.com', bucket: config.bucket || 'BUCKET', key, style: config.style });
      console.log(`dry-run: PUT ${t.url} (${body.length} bytes, sha256 ${sha256hex(body).slice(0, 16)}…, ${t.style} style)`);
    } else {
      const st = await putObject(config, key, body);
      console.log(`offsite ok: ${key} (${(body.length / 1048576).toFixed(1)} MB, HTTP ${st})`);
    }
  } finally { if (tmp) try { unlinkSync(tmp); } catch { /* gone */ } }
}
