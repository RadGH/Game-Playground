// Meshy API helper for Kestrel (https://docs.meshy.ai). The key is read from ~/claude/secrets/.env (RGS_MESHY_API_KEY)
// and never printed or written anywhere. Images are sent as data URIs, so nothing has to be hosted.
//
//   node avatar-3d/kestrel/tools/meshy.mjs balance
//   node avatar-3d/kestrel/tools/meshy.mjs run <kind> '<json>' <outDir>   kind = image-to-3d | multi-image-to-3d | rigging | animations | remesh
//        in the json, "@path/to/file.png" anywhere is replaced by that file as a data URI.
//        Creates the task, polls it, saves task.json + every model/texture/thumbnail URL into outDir.
//   node avatar-3d/kestrel/tools/meshy.mjs get <kind> <id>
//   node avatar-3d/kestrel/tools/meshy.mjs library                     → the animation library (action ids) as JSON
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';

const BASE = 'https://api.meshy.ai/openapi/v1';
const env = readFileSync(join(homedir(), 'claude/secrets/.env'), 'utf8');
const KEY = /^RGS_MESHY_API_KEY=["']?([^"'\r\n]+)/m.exec(env)?.[1];
if (!KEY) { console.error('RGS_MESHY_API_KEY not found in ~/claude/secrets/.env'); process.exit(2); }
const scrub = s => String(s).split(KEY).join('<key>');

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${scrub(text).slice(0, 600)}`);
  try { return JSON.parse(text); } catch { return text; }
}
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const inline = v => typeof v === 'string' && v.startsWith('@')
  ? `data:${MIME[extname(v).toLowerCase()] || 'application/octet-stream'};base64,${readFileSync(v.slice(1)).toString('base64')}`
  : Array.isArray(v) ? v.map(inline) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, inline(x)])) : v;

/** Every http(s) URL in a task object, with a file name made from where it sits. */
function urlsIn(o, prefix = '', out = []) {
  for (const [k, v] of Object.entries(o || {})) {
    const name = prefix ? `${prefix}-${k}` : k;
    if (typeof v === 'string' && /^https?:\/\//.test(v)) out.push([name, v]);
    else if (v && typeof v === 'object') urlsIn(v, name, out);
  }
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [cmd, a, b, c] = process.argv.slice(2);
try {
  if (cmd === 'balance') console.log(JSON.stringify(await api('GET', '/balance')));
  else if (cmd === 'library') console.log(JSON.stringify(await api('GET', '/animations/library'), null, 1));
  else if (cmd === 'get') console.log(JSON.stringify(await api('GET', `/${a}/${b}`), null, 1));
  else if (cmd === 'run') {
    const kind = a, body = inline(JSON.parse(b)), out = c;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'request.json'), JSON.stringify(JSON.parse(b), null, 1));     // the @paths, not the data
    const id = (await api('POST', `/${kind}`, body)).result;
    console.error(`${kind} task ${id}`);
    let t, last = '';
    for (;;) {
      t = await api('GET', `/${kind}/${id}`);
      const line = `${t.status} ${t.progress ?? ''}`; if (line !== last) { console.error(`  ${line}`); last = line; }
      if (!['PENDING', 'IN_PROGRESS'].includes(t.status)) break;
      await sleep(8000);
    }
    writeFileSync(join(out, 'task.json'), JSON.stringify(t, null, 1));
    if (t.status === 'SUCCEEDED') {
      for (const [name, url] of urlsIn(t)) {
        const ext = (new URL(url).pathname.match(/\.[a-z0-9]+$/i) || ['.bin'])[0];
        if (!/\.(glb|png|jpe?g|webp|fbx)$/i.test(ext)) continue;
        const r = await fetch(url); if (!r.ok) { console.error(`  could not fetch ${name}`); continue; }
        writeFileSync(join(out, name + ext), Buffer.from(await r.arrayBuffer()));
      }
    }
    console.log(JSON.stringify({ id, status: t.status, credits: t.consumed_credits ?? null, error: t.task_error?.message || null }));
    if (t.status !== 'SUCCEEDED') process.exit(1);
  } else { console.error('usage: balance | library | get <kind> <id> | run <kind> <json> <outDir>'); process.exit(2); }
} catch (e) { console.error(scrub(e.message)); process.exit(1); }
