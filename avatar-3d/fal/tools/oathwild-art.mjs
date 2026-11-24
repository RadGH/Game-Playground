#!/usr/bin/env node
// Write prototypes/oathwild/data/art.json — the art manifest the Oathwild game reads — from the fal catalog,
// data/scenery.json and the scenery drawings. Every id the world uses has a model (status "ready") or a placeholder
// (status "placeholder") the client can draw until the model is paid for:
//   monsters / mount: `fallback: { body, height, tint }` = an existing fal body drawn at that height with a colour tint
//   props: `placeholder: { shape: box|cylinder|cone|house|rock|tree, size: [wide, tall, deep] m, colour }`
//          (colour = the drawing's own mean colour; size from the planned height/length and the drawing's proportions)
//   node avatar-3d/fal/tools/oathwild-art.mjs        (run after build-catalog.mjs; ids never change)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', '..', 'prototypes', 'oathwild', 'data', 'art.json');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const cat = J('data/catalog.json'), scen = J('data/scenery.json');
const body = id => cat.bodies.find(b => b.id === id);
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

// planned monsters not made yet → an existing body that reads close enough, at the planned height, tinted
const FALLBACK = {
  // wolf.glb measured in Blender: top of the back over spine_2 at 0.50 of the model height, 0.283 of it forward of the origin
  'riding-horse': { body: 'wolf', height: 1.75, tint: '#8a4a22', seat: [0, 0.875, 0.5], note: 'a four-legged stand-in with the same bone names (spine_2 for the seat); swap when the horse is made' },
  'goblin-warchief': { body: 'gobw-tripo', height: 1.35, tint: '#c04a2a' },
  'marsh-hag': { body: 'root-caller', height: 1.8, tint: '#6f8a5a' },
  'barrow-king': { body: 'wraith-knight', height: 2.1, tint: '#7a9a6a' },
  'shrine-cultist': { body: 'zealot', height: 1.8, tint: '#a02828' },
  'bog-lurker': { body: 'drowned-brute', height: 2.1, tint: '#5a6a38' },
  'barrow-ghoul': { body: 'hollowborn', height: 1.75, tint: '#8a9a78' },
  'hill-ogre': { body: 'bruiser', height: 2.6, tint: '#b09070' },
  'fen-harpy': { body: 'winged-imp', height: 1.7, tint: '#6a7a98' },
};
const ROLE = { 'riding-horse': 'mount', 'goblin-warchief': 'boss', 'marsh-hag': 'boss', 'barrow-king': 'boss', 'shrine-cultist': 'caster', 'bog-lurker': 'brawler', 'barrow-ghoul': 'undead', 'hill-ogre': 'brawler', 'fen-harpy': 'beast' };
function enemy(id) {
  const b = body(id);
  if (b) return { id, name: b.name, status: 'ready', role: b.role, height: b.height, skeleton: b.skeleton, triangles: b.triangles, weapon: b.weapon || null, offhand: b.offhand || null, ...(b.druidForm ? { druidForm: true } : {}) };
  const f = FALLBACK[id];
  if (!f || !body(f.body)) throw new Error('no model and no fallback for ' + id);
  return { id, status: 'placeholder', role: ROLE[id], drawn: existsSync(join(ROOT, 'ref', id + '.webp')), fallback: f };
}

// prop drawing proportions + colour from the cleaned sheet pictures (python: the bounding box of each quarter's object)
const py = `
import json, sys, os
from PIL import Image
root = sys.argv[1]; out = {}
for s in json.load(open(os.path.join(root, 'data', 'scenery.json')))['sheets']:
    f = os.path.join(root, 'ref', 'sheet-' + s['id'] + '.png')
    if not os.path.exists(f): continue
    im = Image.open(f).convert('RGB'); px = im.load()
    for i, o in enumerate(s['objects']):
        x0, y0 = (i % 2) * 512, (i // 2) * 512
        xs, ys = [], []
        for y in range(y0, y0 + 512, 4):
            for x in range(x0, x0 + 512, 4):
                if px[x, y] != (200, 200, 200): xs.append(x); ys.append(y)
        out[o['id']] = [max(xs) - min(xs) + 1, max(ys) - min(ys) + 1] if xs else [1, 1]
print(json.dumps(out))`;
const aspect = JSON.parse(execFileSync('python3', ['-I', '-c', py, ROOT], { encoding: 'utf8' }));
const colours = {};
for (const s of scen.sheets) { const f = join(ROOT, 'ref', `sheet-${s.id}.colors.json`); if (existsSync(f)) Object.assign(colours, JSON.parse(readFileSync(f, 'utf8'))); }

function shapeOf(o) {
  const id = o.id;
  if (o.kind === 'building') return 'house';
  if (o.kind === 'tree') return /pine|spruce/.test(id) ? 'cone' : 'tree';
  if (o.kind === 'rock' || /sack|bush|bramble|fern|rubble|haystack|pumpkin|loot-sack|junk|stolen|mushrooms\b/.test(id)) return 'rock';
  if (/barrel|well|campfire|pillar|tower|stump|totem|lamp|waystone|standing-stone-a|druid-stone|mushroom-giant|reeds|bog-plant|antler|pool|tent-large|banner|signpost|road-marker/.test(id)) return 'cylinder';
  if (/tent-small/.test(id)) return 'cone';
  return 'box';
}
const r2 = v => Math.round(v * 100) / 100;
function placeholder(o) {
  const [aw, ah] = aspect[o.id] || [1, 1];
  let w, h, d;
  if (o.h) { h = o.h; w = Math.max(0.2, h * aw / ah * 0.75); d = w * (o.kind === 'wall' ? 0.25 : 0.8); }
  else { w = o.w; h = Math.max(0.15, w * ah / aw * 0.8); d = o.kind === 'wall' ? 0.45 : Math.max(0.2, w * (o.kind === 'travel' ? 0.3 : 0.5)); }
  if (o.kind === 'travel' && /bridge|boardwalk/.test(o.id)) { d = o.id === 'bridge-stone' ? 3.5 : 2; h = Math.min(h, o.id === 'bridge-stone' ? 3 : 1.6); }
  return { shape: shapeOf(o), size: [r2(w), r2(h), r2(d)], colour: colours[o.id] ? hex(colours[o.id]) : '#8a7a66' };
}

const scenery = [];
for (const s of scen.sheets) for (const o of s.objects) {
  const c = (cat.scenery || []).find(x => x.id === o.id);
  scenery.push(c
    ? { id: o.id, name: o.name, kind: o.kind, regions: o.regions, status: 'ready', file: 'avatar-3d/fal/' + c.file, size: c.size, triangles: c.triangles }
    : { id: o.id, name: o.name, kind: o.kind, regions: o.regions, status: 'placeholder', drawn: existsSync(join(ROOT, 'ref', s.id + '.webp')), placeholder: placeholder(o) });
}

const list = ids => ids.map(enemy);
const art = {
  _doc: 'Oathwild art manifest — GENERATED by avatar-3d/fal/tools/oathwild-art.mjs (do not edit by hand; ids never change). Bodies: createFalCharacter(id) from avatar-3d/fal/js/fal.js; `height` = real metres (scale the group by it). status "ready" = the model exists; status "placeholder" = not paid for yet (fal budget, owner 2026-11-23): monsters/mount carry `fallback: { body, height, tint }` = draw that existing fal body at that height, tinted; props carry `placeholder: { shape: box|cylinder|cone|house|rock|tree, size: [wide, tall, deep] m, colour }`. Ready props: GLB at `file` (repo-relative), origin = middle of the footprint on the ground, front faces -Z, +Y up, size = [wide x, tall y, deep z] m. `drawn` = its reference picture is ready, so making it later is one paid step (avatar-3d/fal/tools/oathwild-resume.sh).',
  regions: {
    brightwater: { name: 'Brightwater Vale', levels: [1, 5], enemies: {
      ready: list(['bristleback', 'bandit-chief', 'field-scarecrow', 'wolf', 'thug', 'knifer', 'crossbowman', 'bounty-hunter', 'gobw-tripo', 'gobr-tripo', 'gobm-tripo']),
      waiting: list(['goblin-warchief', 'shrine-cultist']) } },
    thornmere: { name: 'Thornmere Wilds', levels: [5, 10], enemies: {
      ready: list(['brown-bear', 'mountain-lion', 'wolf', 'troll', 'orc-grunt', 'skeleton-warrior', 'hollowborn', 'wraith-knight', 'root-caller', 'thornling', 'drowned-brute', 'water-elemental', 'earth-elemental']),
      waiting: list(['marsh-hag', 'barrow-king', 'bog-lurker', 'barrow-ghoul', 'hill-ogre', 'fen-harpy']) } },
  },
  bosses: { brightwater: ['bandit-chief', 'goblin-warchief'], thornmere: ['marsh-hag', 'barrow-king'] },
  druidForms: [{ id: 'wolf', form: 'wolf', druidForm: true, status: 'ready' }, { id: 'brown-bear', form: 'bear', druidForm: true, status: 'ready' }, { id: 'mountain-lion', form: 'cat', druidForm: true, status: 'ready' }],
  mounts: [{ ...enemy('riding-horse'), mount: { bone: 'spine_2', seat: body('riding-horse')?.mount?.seat || FALLBACK['riding-horse'].seat,
    note: 'seat = [x right, y up, z forward] metres from the body origin (three.js), on top of spine_2 (the middle back bone of the four-legged rig); follow spine_2 while it moves. Now measured on the fallback wolf at 1.75 m; re-measured when the horse is made.' } }],
  // summons and odd art ids that prototypes/oathwild/data/monsters.json uses (art: "imp" etc.)
  summons: [
    { id: 'imp', status: 'ready', body: 'winged-imp', height: 0.9, note: 'the warlock\'s bound imp = the fal winged imp' },
    { id: 'shade-double', status: 'placeholder', fallback: { body: 'hollowborn', height: 1.7, tint: '#2a2838', opacity: 0.75 }, note: 'a shadowy double; the client may instead draw a dark copy of the caster' },
    { id: 'turret', status: 'placeholder', placeholder: { shape: 'cylinder', size: [0.8, 1.2, 0.8], colour: '#8a7656' }, note: 'a clockwork field turret (a prop, not a body)' },
  ],
  scenery,
};
writeFileSync(OUT, JSON.stringify(art, null, 1) + '\n');
const n = k => scenery.filter(s => s.status === k).length;
console.log(`art.json: ${n('ready')} props ready, ${n('placeholder')} placeholders; monsters waiting: ${[...art.regions.brightwater.enemies.waiting, ...art.regions.thornmere.enemies.waiting].length}; horse ${art.mounts[0].status}`);
