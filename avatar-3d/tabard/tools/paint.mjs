// Tabard: Codex paints an outfit over a body's clay sheet.
//   node avatar-3d/tabard/tools/paint.mjs <body> <outfit> [--again]
// In:  ref/<body>/base.png (tools/sheet.py), data/outfits.json, ref/<body>/skin.png for every outfit but skin
// Out: ref/<body>/<outfit>.png + ref/<body>/<outfit>.prompt.txt; the Codex log in ref/<body>/job-<outfit>/codex.log
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
//   node avatar-3d/tabard/tools/paint.mjs prop <id> [--again]     (a prop from data/props.json, painted over its clay views)
let [body, outfit] = process.argv.slice(2);
const O = JSON.parse(readFileSync(join(ROOT, 'data', 'outfits.json'), 'utf8'));
const PROPS = JSON.parse(readFileSync(join(ROOT, 'data', 'props.json'), 'utf8')).props;
const isProp = body === 'prop';
let o;
if (isProp) {
  const pr = PROPS[outfit];
  if (!pr) { console.error('unknown prop ' + outfit); process.exit(2); }
  o = { all: pr.look, prop: pr }; body = 'prop_' + outfit; outfit = 'paint';
} else {
  o = O.outfits[outfit];
  if (!o || !['male', 'female'].includes(body)) { console.error('usage: paint.mjs <male|female> <outfit> | prop <id>'); process.exit(2); }
}
const dir = join(ROOT, 'ref', body), job = join(dir, 'job-' + outfit);
const out = join(dir, outfit + '.png');
if (existsSync(out) && !process.argv.includes('--again')) { console.log(`${body}/${outfit}: already painted (use --again)`); process.exit(0); }
mkdirSync(job, { recursive: true });
rmSync(join(job, 'painted.png'), { force: true });   // a stale picture from an earlier run must never pass for a new one
// skin: paint over the clay sheet. Every other outfit EDITS the painted skin sheet (one picture in): with two pictures
// Codex tends to draw a fresh figure at a new size, which no longer lines up with the 3D body (2026-11-22).
const src = (isProp || outfit === 'skin') ? 'base.png' : 'skin.png';
copyFileSync(join(dir, src), join(job, 'base.png'));
const imgs = ['base.png'];
const subject = o[body] || o.all;
const intro = isProp
  ? `base.png is a model sheet: the SAME plain clay 3D model of a ${o.prop.kind} shown four times — FRONT, LEFT SIDE, BACK, RIGHT SIDE — on a flat light-grey background.
Task: paint this exact model as a finished game prop texture reference, as if painting directly onto the clay.${o.prop.seeThrough ? ' Where the cloth is torn away (ragged hem, holes), leave the flat light-grey background showing through: those parts become see-through.' : ''}`
  : outfit === 'skin'
  ? `base.png is a model sheet: the SAME plain clay 3D body shown four times — FRONT, LEFT SIDE, BACK, RIGHT SIDE — in an A-pose on a flat light-grey background.
Task: paint this body as a finished game character texture reference, as if painting directly onto the clay statue.`
  : `base.png is a finished model sheet of ONE character shown four times — FRONT, LEFT SIDE, BACK, RIGHT SIDE — on a flat light-grey background.
Task: change ONLY the clothing. Repaint the clothes on these exact figures; keep the face, hair, skin, body shape, pose and every outline pixel-for-pixel where they are. This is an in-place edit of this picture, not a new drawing.`;
const prompt = `Use your image generation tool to EDIT the attached base.png and save the result in the current working directory as painted.png (1536x1024 PNG). Do nothing else (do not write code, do not edit other files).
${intro}
Subject: ${subject}.
Style: ${O.style}.
Hard rules (the painting is projected back onto a 3D model, so alignment matters more than anything):
- Keep the four figures EXACTLY where they are: same pose, same silhouette, same size, same outline, same position on the sheet, same arm angles, same feet, same head size. Do not move, resize, zoom, turn or redraw the bodies; paint on top of them.
${isProp ? '- Paint only on the model: nothing may stick out past its outline; add no other objects.' : '- Everything worn must be tight to the body like paint on a statue: no loose cloth sticking out past the outline, no capes, no wide skirts, no hoods, no hats, no helmets, no shoulder pads, no weapons, no shields, nothing held in the hands. Those are separate 3D pieces.'}
- All four views show the same design consistently (front details on the front view, back details on the back view).
- Even, flat studio lighting; keep the plain flat light-grey background exactly as it is; no floor shadow.
- No text, no labels, no watermark, no extra figures.
`;
writeFileSync(join(dir, outfit + '.prompt.txt'), prompt);
function runCodex() {
  rmSync(join(job, 'painted.png'), { force: true });
  const args = ['exec', '-s', 'danger-full-access', '--skip-git-repo-check'];
  for (const i of imgs) args.push('-i', i);
  args.push('-');
  const r = spawnSync('codex', args, { cwd: job, input: prompt, encoding: 'utf8', timeout: 20 * 60e3, maxBuffer: 256 * 1024 * 1024 });
  const strip = t => (t || '').replace(/[A-Za-z0-9+/=]{200,}/g, '<picture data>');   // keep the log readable
  writeFileSync(join(job, 'codex.log'), strip(r.stdout).slice(-20000) + '\n--- stderr ---\n' + strip(r.stderr).slice(-20000));
  if (existsSync(join(job, 'painted.png'))) return true;
  // Codex sometimes draws the picture but never saves it where asked; it always keeps its own copy under
  // ~/.codex/generated_images/<session id>/ — take the newest one from THIS run's session (2026-11-22, the helm)
  const sid = ((r.stderr || '') + (r.stdout || '')).match(/session id: ([0-9a-f-]+)/)?.[1];
  const gdir = sid && join(homedir(), '.codex', 'generated_images', sid);
  if (gdir && existsSync(gdir)) {
    const pics = readdirSync(gdir).filter(f => f.endsWith('.png')).map(f => join(gdir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (pics.length) { copyFileSync(pics[0], join(job, 'painted.png')); console.error(`${body}/${outfit}: took the picture from Codex's own folder`); return true; }
  }
  return false;
}
// alignment gate: the painted figures must be within 3% of the clay size, else try again (twice at most)
for (let attempt = 1; attempt <= 3; attempt++) {
  if (!runCodex()) { console.error(`${body}/${outfit}: Codex made no picture (try ${attempt}, see ${job}/codex.log)`); continue; }
  copyFileSync(join(job, 'painted.png'), out);
  const a = spawnSync('python3', [join(ROOT, 'tools', 'align.py'), body, outfit, ...(o.prop?.seeThrough ? ['--see-through'] : []), ...(o.prop?.fitWidth ? ['--fit-width'] : [])], { encoding: 'utf8' });
  const rep = JSON.parse(readFileSync(join(ROOT, 'build', `${body}_${outfit}_align.json`), 'utf8'));
  const worst = Math.max(...Object.values(rep).map(v => Math.abs(v.scale - 1)));
  if (worst <= 0.03) { console.log(`${body}/${outfit}: ref/${body}/${outfit}.png (try ${attempt}, worst scale off ${(worst * 100).toFixed(1)}%)`); process.exit(0); }
  console.error(`${body}/${outfit}: figures ${(worst * 100).toFixed(1)}% off the clay size on try ${attempt} — painting again`);
  copyFileSync(out, join(dir, `${outfit}.rejected-${attempt}.png`));
}
console.error(`${body}/${outfit}: no aligned painting after 3 tries`); process.exit(1);
