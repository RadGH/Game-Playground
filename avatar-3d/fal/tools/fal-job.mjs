#!/usr/bin/env node
// One paid fal.ai job: upload local inputs, submit to the queue, poll, download every output file, log the spend.
//
//   node avatar-3d/fal/tools/fal-job.mjs <endpoint> <name> --price 0.50 --input '{"image_url":"@ref/male-front.png"}'
//
//   <endpoint>  fal model id, e.g. tripo3d/p1/image-to-3d (see README "Endpoints and prices")
//   <name>      result folder: models/<name>/ (and the spend row's id)
//   --price     the price in US$ read from https://fal.ai/models/<endpoint> for these inputs — REQUIRED, so every
//               paid call is checked first. It is what data/spend.json records.
//   --input     the JSON input. A string value "@<path>" (relative to avatar-3d/fal/) is uploaded to fal storage
//               first and replaced by its URL.
//   --note      free text stored with the spend row.
//
// Safe to run again: the request id is saved in data/jobs/<name>.json right after submit, and a second run resumes
// polling that request instead of submitting (and paying) again. Delete that file to really submit again.
//
// Budget guard (Oathwild 2026-11-23): --tag <name> stores a tag on the spend row; --cap "<prefix>:<US$>,..." refuses to
// SUBMIT when the rows whose tag starts with <prefix> (plus jobs already submitted with such a tag but not logged yet,
// so parallel runs count) plus this price would pass that amount. Resuming a submitted job is never refused.
// FAL_TAG / FAL_CAPS in the environment do the same (tools/run-body.sh passes them through).
//
// The key comes from FALAI_API_KEY (or FAL_KEY) in the environment, else from ~/claude/secrets/.env. It is never
// printed, logged or written anywhere.
import { readFileSync, writeFileSync, mkdirSync, rmdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAL_ORIGINS = ['https://queue.fal.run', 'https://rest.fal.ai'];

function arg(name) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; }

export function falKey() {
	if (process.env.FALAI_API_KEY) return process.env.FALAI_API_KEY;
	if (process.env.FAL_KEY) return process.env.FAL_KEY;
	const env = join(homedir(), 'claude', 'secrets', '.env');
	if (existsSync(env)) {
		for (const line of readFileSync(env, 'utf8').split('\n')) {
			const m = line.match(/^\s*(?:export\s+)?(FALAI_API_KEY|FAL_KEY)\s*=\s*['"]?([^'"\s]+)/);
			if (m) return m[2];
		}
	}
	throw new Error('No fal key: set FALAI_API_KEY');
}

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream' };

async function upload(path, key) {
	const body = readFileSync(path);
	const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
	const init = await fetch('https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
		method: 'POST', headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
		body: JSON.stringify({ content_type: type, file_name: basename(path) }),
	});
	if (!init.ok) throw new Error('upload initiate ' + init.status + ' ' + await init.text());
	const { upload_url, file_url } = await init.json();
	const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body });
	if (!put.ok) throw new Error('upload put ' + put.status);
	return file_url;
}

async function resolveInputs(v, key) {
	if (typeof v === 'string' && v.startsWith('@')) return upload(join(ROOT, v.slice(1)), key);
	if (Array.isArray(v)) return Promise.all(v.map(x => resolveInputs(x, key)));
	if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await resolveInputs(v[k], key); return o; }
	return v;
}

function checkOrigin(url) {
	if (!FAL_ORIGINS.some(o => url.startsWith(o + '/'))) throw new Error('refusing non-fal url ' + url);
	return url;
}

// Every {url, file_name|content_type} object in the result is a file to download.
function files(o, path = [], out = []) {
	if (Array.isArray(o)) o.forEach((x, i) => files(x, path.concat(i), out));
	else if (o && typeof o === 'object') {
		if (typeof o.url === 'string' && /^https?:/.test(o.url)) out.push({ path: path.join('.'), url: o.url, name: o.file_name });
		else for (const k of Object.keys(o)) files(o[k], path.concat(k), out);
	}
	return out;
}

export function capCheck(price, caps, ROOTDIR = ROOT) {
	if (!caps) return;
	const spendFile = join(ROOTDIR, 'data', 'spend.json');
	const spend = existsSync(spendFile) ? JSON.parse(readFileSync(spendFile, 'utf8')) : { jobs: [] };
	const logged = new Set(spend.jobs.map(j => j.id));
	const jobsDir = join(ROOTDIR, 'data', 'jobs');
	const pending = existsSync(jobsDir) ? readdirSync(jobsDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(jobsDir, f), 'utf8'))).filter(j => !j.logged && !logged.has(j.name) && j.tag) : [];
	for (const pair of String(caps).split(',')) {
		const [prefix, amt] = pair.split(':'); const cap = parseFloat(amt);
		const used = spend.jobs.filter(j => (j.tag || '').startsWith(prefix)).reduce((a, j) => a + j.price, 0)
			+ pending.filter(j => j.tag.startsWith(prefix)).reduce((a, j) => a + j.price, 0);
		if (used + price > cap + 1e-9) throw new Error(`BUDGET: ${prefix} has US$${used.toFixed(2)} spent or running; +${price} would pass US$${cap}`);
	}
}

export async function runJob({ endpoint, name, price, input, note, tag, caps }) {
	const key = falKey();
	const auth = { Authorization: 'Key ' + key };
	const jobsDir = join(ROOT, 'data', 'jobs'); mkdirSync(jobsDir, { recursive: true });
	const jobFile = join(jobsDir, name + '.json');
	let job = existsSync(jobFile) ? JSON.parse(readFileSync(jobFile, 'utf8')) : null;
	const t0 = Date.now();
	if (!job) {
		capCheck(price, caps);
		const resolved = await resolveInputs(input, key);
		const r = await fetch('https://queue.fal.run/' + endpoint, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(resolved) });
		const text = await r.text();
		if (!r.ok) throw new Error('submit ' + r.status + ' ' + text);
		const q = JSON.parse(text);
		job = { endpoint, name, price, input, resolved, note, tag, request_id: q.request_id, status_url: checkOrigin(q.status_url), response_url: checkOrigin(q.response_url), submitted: new Date().toISOString() };
		writeFileSync(jobFile, JSON.stringify(job, null, 1));
		console.log(name + ': submitted ' + job.request_id);
	} else console.log(name + ': resuming ' + job.request_id);

	for (;;) {
		const s = await (await fetch(job.status_url, { headers: auth })).json();
		if (s.status === 'COMPLETED') break;
		if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') throw new Error('status ' + JSON.stringify(s));
		await new Promise(res => setTimeout(res, 5000));
	}
	const rr = await fetch(job.response_url, { headers: auth });
	const result = await rr.json();
	const outDir = join(ROOT, 'models', name); mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 1));
	if (!rr.ok) throw new Error('result ' + rr.status + ' ' + JSON.stringify(result).slice(0, 500));
	const saved = [];
	for (const f of files(result)) {
		const fname = (f.path.replace(/[^a-z0-9_.-]/gi, '_') + '-' + (f.name || basename(new URL(f.url).pathname))).slice(-120);
		const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
		writeFileSync(join(outDir, fname), buf);
		saved.push({ file: 'models/' + name + '/' + fname, bytes: buf.length });
	}
	if (!job.logged) {
		// one writer at a time: jobs that finish together would otherwise overwrite each other's row
		const lock = join(ROOT, 'data', '.spend.lock');
		for (let i = 0; ; i++) { try { mkdirSync(lock); break; } catch { if (i > 200) throw new Error('spend.json is locked (remove data/.spend.lock)'); await new Promise(r => setTimeout(r, 50)); } }
		try {
		const spendFile = join(ROOT, 'data', 'spend.json');
		const spend = existsSync(spendFile) ? JSON.parse(readFileSync(spendFile, 'utf8')) : { _doc: 'Every paid fal.ai job (tools/fal-job.mjs). price = US$ from the model page at the time.', total: 0, jobs: [] };
		spend.jobs.push({ id: name, endpoint, request_id: job.request_id, price, input, note, ...(job.tag ? { tag: job.tag } : {}), files: saved, submitted: job.submitted, done: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000) });
		spend.total = Math.round(spend.jobs.reduce((a, j) => a + j.price, 0) * 100) / 100;
		writeFileSync(spendFile, JSON.stringify(spend, null, 1));
		job.logged = true; writeFileSync(jobFile, JSON.stringify(job, null, 1));
		} finally { rmdirSync(lock); }
	}
	console.log(name + ': ' + saved.map(s => s.file + ' (' + Math.round(s.bytes / 1024) + ' KB)').join(', '));
	return { result, saved };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const [endpoint, name] = process.argv.slice(2);
	const price = parseFloat(arg('price'));
	if (!endpoint || !name || !(price >= 0) || !arg('input')) { console.error('usage: fal-job.mjs <endpoint> <name> --price <US$> --input <json> [--note text]'); process.exit(2); }
	runJob({ endpoint, name, price, input: JSON.parse(arg('input')), note: arg('note'), tag: arg('tag') || process.env.FAL_TAG, caps: arg('cap') || process.env.FAL_CAPS }).catch(e => { console.error(name + ': ' + e.message); process.exit(1); });
}
