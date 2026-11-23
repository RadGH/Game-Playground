#!/usr/bin/env node
// Redraw a reference picture with Codex (free on the owner's plan) so image-to-3D gets one clean subject.
//   node avatar-3d/fal/tools/refdraw.mjs <id>            → avatar-3d/fal/ref/<id>.png  (+ ref/<id>.prompt.txt)
//   node avatar-3d/fal/tools/refdraw.mjs <id> --again    → draw again over the old one
// Subjects live in data/refs.json: { style, items: [{ id, kind: 'body'|'enemy'|'beast'|'item', from?, look }] }.
// body = front/left/back turnaround (Rodin takes 3 views); enemy = ONE front view, portrait (Tripo P1 takes one picture);
// beast = one three-quarter view of a four-legged animal, landscape.
// `from` is the owner's original picture (ref/*-original.jpg), attached as the style + likeness source; `fromNote`
// replaces the default "keep its likeness" line (complete goblin enemies keep the species, not the friendly face).
// One Codex job per folder (two jobs in one folder swap each other's pictures) — pattern from model-library/tools/sheet.mjs.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cat = JSON.parse(readFileSync(join(ROOT, 'data', 'refs.json'), 'utf8'));
const id = process.argv[2];
const m = cat.items.find(x => x.id === id);
if (!m) { console.error('unknown id ' + id); process.exit(2); }
const out = join(ROOT, 'ref', id + '.png');
if (existsSync(out) && !process.argv.includes('--again')) { console.log(id + ': already drawn (use --again)'); process.exit(0); }
const job = join(ROOT, 'ref', 'jobs', id);
mkdirSync(job, { recursive: true });
const args = ['exec', '-s', 'danger-full-access', '--skip-git-repo-check'];
if (m.from) { copyFileSync(join(ROOT, 'ref', m.from), join(job, 'source.jpg')); args.push('-i', 'source.jpg'); }
args.push('-');

const body = `Layout: a model turnaround reference sheet for a 3D modeller: THREE full-body views of the SAME character side by side in one row, left to right: FRONT, LEFT SIDE (true profile, facing left), BACK. Identical scale, tops of heads and soles of feet on the same lines, wide empty space between the figures. Face, body and colours identical between views.
Pose: neutral A-pose — standing straight, feet about shoulder width apart, arms straight and angled about 45 degrees down, away from the body with clear empty space between arms and torso and between the legs, hands OPEN and EMPTY with fingers together (no fists), level shoulders, neutral face looking straight ahead.
Projection: orthographic, no perspective. Whole body from the top of the hair to the soles of the feet; nothing cropped. Margin around each figure.`;
const enemy = `Layout: ONE full-body FRONT view of ONE character, centred, standing, filling most of the picture height (top of the head near the top edge, soles near the bottom edge, small even margin), as a 3D modeller's front reference.
Pose: relaxed A-pose — standing straight and upright (NOT hunched), feet about shoulder width apart, arms straight and angled about 35 degrees down and away from the body with clear empty space between arms and torso and between the legs, hands OPEN and EMPTY with fingers together (no fists, nothing held), level shoulders, head LEVEL looking straight at the viewer (not tilted down).
Projection: orthographic, straight-on front view, no perspective. Whole body visible; nothing cropped; nothing in front of the body.`;
const beast = `Layout: ONE full-body view of ONE four-legged creature, three-quarter view from the front-left, centred, large in the frame with a margin all round, as a 3D modeller's reference.
Pose: standing still on all four legs, legs straight and clearly apart from each other (gaps between the legs), head level looking ahead, mouth closed, tail straight out behind and slightly down, wings (if any) folded flat along the back.
Projection: orthographic, no perspective. Whole creature visible; nothing cropped.`;
const item = `Layout: ONE object, centred, shown whole, large in the frame with a margin all round, as a 3D modeller's reference. ${m.view || 'Front view, straight on, orthographic, no perspective.'} Nothing else in the picture: no person, no mannequin, no stand, no hands.`;
const prompt = `Use your image generation tool to create ONE image, ${m.kind === 'body' || m.kind === 'beast' ? 'landscape 1536x1024' : m.kind === 'enemy' ? 'portrait 1024x1536' : 'square 1024x1024'} PNG, and save it in the current working directory as out.png. Do nothing else (do not write code, do not edit other files).
${m.from ? (m.fromNote || 'The attached source.jpg is the owner\'s concept sheet: keep the character\'s likeness, hair, skin tone and proportions from it, but IGNORE its layout, text, close-ups and fists.') + '\n' : ''}${m.kind === 'body' ? body : m.kind === 'enemy' ? enemy : m.kind === 'beast' ? beast : item}
Subject: ${m.look}.
Style: ${cat.style}
Lighting/background: even flat lighting, soft shading that describes the forms, no harsh shadows, plain flat light-grey background (#c8c8c8), no floor shadow, no scenery.
Constraints: no text, no labels, no lettering, no watermark, no extra characters or objects.
`;
writeFileSync(join(ROOT, 'ref', id + '.prompt.txt'), prompt);
const r = spawnSync('codex', args, { cwd: job, input: prompt, encoding: 'utf8', timeout: 15 * 60e3 });
writeFileSync(join(job, 'codex.log'), (r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''));
// Codex sometimes draws the picture but fails to save it (it pastes the whole picture into one shell command, which
// is too long, or leaves an empty file): take its newest picture from ~/.codex/generated_images/<session id>/ instead.
if (!existsSync(join(job, 'out.png')) || statSync(join(job, 'out.png')).size === 0) {
	const sid = ((r.stdout || '') + (r.stderr || '')).match(/session id: ([0-9a-f-]{36})/)?.[1];
	const dir = sid && join(homedir(), '.codex', 'generated_images', sid);
	if (dir && existsSync(dir)) {
		const pngs = readdirSync(dir).filter(f => f.endsWith('.png')).map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
		if (pngs.length) { copyFileSync(pngs[0], join(job, 'out.png')); console.log(id + ': recovered from ' + sid); }
	}
}
if (!existsSync(join(job, 'out.png')) || statSync(join(job, 'out.png')).size === 0) { console.error(id + ': Codex made no picture (see ref/jobs/' + id + '/codex.log)'); process.exit(1); }
copyFileSync(join(job, 'out.png'), out);
console.log(id + ': ref/' + id + '.png');
