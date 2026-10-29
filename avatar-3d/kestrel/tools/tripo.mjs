// Tripo3D API helper for Kestrel (v3 API, https://developers.tripo3d.com). The key is read from
// ~/claude/secrets/.env (RGS_TRIPO_API_SECRET_KEY) and never printed or written anywhere.
//
//   node avatar-3d/kestrel/tools/tripo.mjs balance
//   node avatar-3d/kestrel/tools/tripo.mjs upload <image|model>                 → prints the file_token
//   node avatar-3d/kestrel/tools/tripo.mjs post <endpoint> '<json>'             → prints the task_id (v2: endpoint 'task', json has type)
//   node avatar-3d/kestrel/tools/tripo.mjs wait <task_id> [outDir]              → polls, saves task.json + downloads every output URL
//   node avatar-3d/kestrel/tools/tripo.mjs get <task_id>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

// Two APIs, two kinds of key: the older platform (api.tripo3d.ai/v2/openapi, keys start tsk_) and the v3 developer
// platform (openapi.tripo3d.com/v3). Credits are per platform and NOT the website plan's credits. TRIPO_API=v2|v3.
const V = process.env.TRIPO_API || 'v2';
const BASE = V === 'v3' ? 'https://openapi.tripo3d.com/v3' : 'https://api.tripo3d.ai/v2/openapi';
const P = V === 'v3'
  ? { balance: '/account/balance', usage: '/account/usage', upload: '/files', task: id => `/tasks/${id}`, token: d => d.file_token }
  : { balance: '/user/balance', usage: '/user/balance', upload: '/upload', task: id => `/task/${id}`, token: d => d.image_token || d.file_token };
const env = readFileSync(join(homedir(), 'claude/secrets/.env'), 'utf8');
const KEY = /^RGS_TRIPO_API_SECRET_KEY=["']?([^"'\r\n]+)/m.exec(env)?.[1];
if (!KEY) { console.error('RGS_TRIPO_API_SECRET_KEY not found in ~/claude/secrets/.env'); process.exit(2); }
const auth = { Authorization: `Bearer ${KEY}` };
const scrub = s => String(s).split(KEY).join('<key>');

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { ...auth, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error(`${res.status} ${scrub(text).slice(0, 400)}`); }
  if (!res.ok || json.code !== 0) throw new Error(`${res.status} ${scrub(JSON.stringify(json)).slice(0, 600)}`);
  return json.data;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === 'balance') console.log(JSON.stringify(await api('GET', P.balance)));
  else if (cmd === 'usage') console.log(JSON.stringify(await api('GET', P.usage), null, 1));
  else if (cmd === 'upload') {
    const fd = new FormData();
    const type = /\.png$/i.test(a) ? 'image/png' : /\.jpe?g$/i.test(a) ? 'image/jpeg' : 'application/octet-stream';
    fd.append('file', new Blob([readFileSync(a)], { type }), basename(a));
    const d = await api('POST', P.upload, fd); console.log(P.token(d) || JSON.stringify(d));
  } else if (cmd === 'post') {
    const d = await api('POST', a.startsWith('/') ? a : '/' + a, JSON.parse(b)); console.log(d.task_id || JSON.stringify(d));
  } else if (cmd === 'get') console.log(JSON.stringify(await api('GET', P.task(a)), null, 1));
  else if (cmd === 'wait') {
    let t, last = '';
    for (;;) {
      t = await api('GET', P.task(a));
      const line = `${t.status} ${t.progress ?? ''}`; if (line !== last) { console.error(`${a}: ${line}`); last = line; }
      if (!['queued', 'running'].includes(t.status)) break;
      await sleep(5000);
    }
    if (b) {
      mkdirSync(b, { recursive: true });
      writeFileSync(join(b, 'task.json'), JSON.stringify(t, null, 1));
      for (const [k, url] of Object.entries(t.output || {})) {
        if (typeof url !== 'string' || !/^https?:/.test(url)) continue;
        const ext = (new URL(url).pathname.match(/\.[a-z0-9]+$/i) || ['.bin'])[0];
        const r = await fetch(url); writeFileSync(join(b, k + ext), Buffer.from(await r.arrayBuffer()));
        console.error(`saved ${join(b, k + ext)}`);
      }
    }
    console.log(JSON.stringify({ status: t.status, credits: t.credits_consumed, error: t.error_message || t.error_code || null }));
    if (t.status !== 'success') process.exit(1);
  } else { console.error('usage: balance | usage | upload <file> | post <endpoint> <json> | get <id> | wait <id> [dir]'); process.exit(2); }
} catch (e) { console.error(scrub(e.message)); process.exit(1); }
