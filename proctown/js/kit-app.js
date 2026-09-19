// Procedural Towns — the building kit gallery (TOWN_EXPANSION 2.15).
//
// Nothing here decides anything about a building. It calls `describeSpecimen` / `describeBuilding`,
// hands the parts to `drawkit.js`, and lays the results out in a grid. If a combination is wrong,
// it is wrong in `buildkit.js` and it is wrong in the game too.

import {
  KIT, CULTURE_KIT, describeBuilding, describeSpecimen, partsFor, describeStall, stallParts,
  BASE_KEYS, ROOF_KEYS, CULTURE_KEYS, heightOf, roofsCover,
} from './buildkit.js';
import { drawBuilding, drawSwatches } from './drawkit.js';

const $ = id => document.getElementById(id);
const grid = $('grid');

for (const key of CULTURE_KEYS) {
  const o = document.createElement('option');
  o.value = key; o.textContent = CULTURE_KIT.cultures[key].name;
  $('culture').append(o);
}
for (const key of BASE_KEYS) {
  const o = document.createElement('option');
  o.value = key; o.textContent = KIT.bases[key].name;
  $('base').append(o);
}

function canvasFor(size) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr * 0.82);
  c.style.width = size + 'px';
  c.style.height = Math.round(size * 0.82) + 'px';
  return c;
}

/** One tile: a canvas with the building on it and a caption under it. */
function tile(desc, caption, size, note = '') {
  const box = document.createElement('figure');
  box.className = 'kit-tile';
  const c = canvasFor(size);
  drawBuilding(c.getContext('2d'), partsFor(desc), { width: c.width, height: c.height });
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${caption}</b>${note ? `<span>${note}</span>` : ''}`;
  box.append(c, cap);
  return box;
}

function render() {
  const view = $('view').value;
  const culture = $('culture').value;
  const baseKey = $('base').value;
  const seed = Math.max(1, Number($('seed').value) || 1);
  const size = Number($('tile').value);
  const onlyCulture = $('only-culture').checked;
  $('tile-val').textContent = size;
  grid.replaceChildren();
  grid.style.setProperty('--tile', size + 'px');

  const cult = CULTURE_KIT.cultures[culture];
  const cultureBases = Object.keys(cult.bases);

  if (view === 'bases') {
    const bases = onlyCulture ? cultureBases : BASE_KEYS;
    for (const b of bases) {
      const def = KIT.bases[b];
      for (const r of def.roofs) {
        const desc = describeSpecimen({ base: b, roof: r, culture, seed });
        grid.append(tile(desc, def.name, size,
          `${KIT.roofs[r].name} &middot; ${KIT.roofMaterials[desc.roofMaterial].name}`));
      }
    }
  } else if (view === 'roofs') {
    for (const r of ROOF_KEYS) {
      const def = KIT.bases[baseKey];
      const allowed = def.roofs.includes(r);
      const desc = describeSpecimen({ base: baseKey, roof: r, culture, seed });
      grid.append(tile(desc, KIT.roofs[r].name, size,
        allowed ? `on a ${def.name.toLowerCase()}` : `not built on a ${def.name.toLowerCase()}`));
    }
  } else if (view === 'materials') {
    for (const wm of Object.keys(KIT.wallMaterials)) {
      for (const rm of Object.keys(KIT.roofMaterials)) {
        const desc = describeSpecimen({ base: baseKey, roof: KIT.bases[baseKey].roofs[0], culture, seed });
        desc.wallMaterial = wm; desc.roofMaterial = rm;
        desc.colour = { ...desc.colour, wall: KIT.wallMaterials[wm].colour, roof: KIT.roofMaterials[rm].colour };
        desc.trim = { ...desc.trim, beams: KIT.wallMaterials[wm].beams };
        grid.append(tile(desc, KIT.wallMaterials[wm].name, size, KIT.roofMaterials[rm].name));
      }
    }
  } else if (view === 'culture') {
    // a row of houses as this culture would actually build them, on plots of the sizes a plan gives
    for (let i = 0; i < 24; i++) {
      const w = 6 + (i % 5) * 2.4, d = 5 + ((i * 3) % 4) * 2.1;
      const wants = ['house', 'house', 'house', 'hut', 'inn', 'forge', 'hall', 'chapel',
        'granary', 'stable', 'mill', 'warehouse'];
      const want = wants[i % wants.length];
      const desc = describeBuilding({
        plot: { cx: i * 7, cz: 0, w, d, angle: 0, facing: Math.PI / 2, want,
          district: i % 4 === 0 ? 'civic' : i % 3 === 0 ? 'craft' : 'residential' },
        culture, seed: seed + i, townSeed: seed,
      });
      grid.append(tile(desc, desc.baseName, size,
        `${want} &middot; ${KIT.roofs[desc.roofType].name} &middot; ${Math.round(heightOf(desc))} m`));
    }
  } else if (view === 'stalls') {
    for (const kind of Object.keys(KIT.stalls.kinds)) {
      for (const c of (onlyCulture ? [culture] : CULTURE_KEYS)) {
        const stall = describeStall({ kind, culture: c, seed });
        const box = document.createElement('figure');
        box.className = 'kit-tile';
        const cv = canvasFor(size);
        drawBuilding(cv.getContext('2d'), stallParts(stall), { width: cv.width, height: cv.height });
        const cap = document.createElement('figcaption');
        cap.innerHTML = `<b>${stall.name}</b><span>${CULTURE_KIT.cultures[c].name}</span>`;
        box.append(cv, cap);
        grid.append(box);
      }
    }
  } else if (view === 'palette') {
    grid.classList.add('wide');
    for (const key of CULTURE_KEYS) {
      const c = CULTURE_KIT.cultures[key];
      const box = document.createElement('figure');
      box.className = 'kit-tile palette';
      const cv = document.createElement('canvas');
      cv.width = 640; cv.height = 96;
      cv.style.width = '100%';
      const ctx = cv.getContext('2d');
      const rows = [
        ['wall', c.palette.wall], ['roof', c.palette.roof],
        ['trim', [...c.palette.trim, ...c.palette.door]],
        ['street', [c.street.colour, c.townWall.colour, c.night.lamp, c.night.flame, c.palette.accent]],
      ];
      rows.forEach(([label, list], i) => {
        ctx.save();
        ctx.translate(0, i * 24);
        drawSwatches(ctx, list, { width: 640, height: 24, labels: list });
        ctx.restore();
        ctx.fillStyle = '#e4ecf7';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(label, 6, i * 24 + 16);
      });
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${c.name}</b><span>${c.blurb}</span>` +
        `<span>Only they build: ${c.signature.map(s => KIT.bases[s].name).join(', ')}</span>` +
        `<span>${c.street.surface} streets &middot; ${c.townWall.kind} wall &middot; ${c.night.lamp} light</span>`;
      box.append(cv, cap);
      grid.append(box);
    }
    return check();
  }
  grid.classList.toggle('wide', view === 'palette');
  check();
}

/**
 * The live verdict: does every roof on screen still sit on its walls?
 *
 * Section 3.20 — "render every combination headless; fail on NaN geometry or a roof that misses its
 * walls". The node test does the whole matrix; this is the same check on whatever is in front of you.
 */
function check() {
  const culture = $('culture').value;
  const seed = Math.max(1, Number($('seed').value) || 1);
  let bad = 0, nan = 0, n = 0;
  for (const b of BASE_KEYS) {
    for (const r of KIT.bases[b].roofs) {
      const desc = describeSpecimen({ base: b, roof: r, culture, seed });
      const parts = partsFor(desc);
      n++;
      if (parts.some(p => [p.x, p.y, p.z, p.w, p.h, p.d, p.yaw].some(v => !Number.isFinite(v)))) nan++;
      if (!roofsCover(desc, parts)) bad++;
    }
  }
  const v = $('verdict');
  if (bad || nan) {
    v.className = 'verdict bad';
    v.textContent = `${bad} roof${bad === 1 ? '' : 's'} missing its walls, ${nan} with NaN geometry, out of ${n}.`;
  } else {
    v.className = 'verdict ok';
    v.textContent = `${n} combinations, every roof on its walls, no NaN geometry.`;
  }
}

/** The whole matrix, in numbers, for a bug report. */
function audit() {
  const rows = [];
  let bad = 0, nan = 0, n = 0, parts = 0;
  for (const culture of CULTURE_KEYS) {
    for (const b of BASE_KEYS) {
      for (const r of KIT.bases[b].roofs) {
        for (const seed of [1, 2, 3, 7, 42]) {
          const desc = describeSpecimen({ base: b, roof: r, culture, seed });
          const list = partsFor(desc);
          n++; parts += list.length;
          if (list.some(p => [p.x, p.y, p.z, p.w, p.h, p.d].some(v => !Number.isFinite(v)))) {
            nan++; rows.push(`NaN  ${culture}/${b}/${r}@${seed}`);
          }
          if (!roofsCover(desc, list)) { bad++; rows.push(`roof ${culture}/${b}/${r}@${seed}`); }
        }
      }
    }
  }
  $('report').textContent =
    `${n} specimens across ${CULTURE_KEYS.length} cultures, ${BASE_KEYS.length} bases, ${ROOF_KEYS.length} roofs\n` +
    `parts   ${parts} total, ${(parts / n).toFixed(1)} per building\n` +
    `roofs   ${bad} missing their walls (must be 0)\n` +
    `NaN     ${nan} (must be 0)\n` +
    (rows.length ? rows.slice(0, 30).join('\n') : 'nothing to report.');
}

for (const id of ['view', 'culture', 'base', 'seed', 'tile', 'only-culture']) {
  $(id).addEventListener('input', render);
  $(id).addEventListener('change', render);
}
$('reroll').onclick = () => { $('seed').value = Math.floor(Math.random() * 99999) + 1; render(); };
$('prev').onclick = () => { $('seed').value = Math.max(1, Number($('seed').value) - 1); render(); };
$('next').onclick = () => { $('seed').value = Number($('seed').value) + 1; render(); };
$('audit').onclick = audit;

render();
document.body.dataset.ready = '1';
