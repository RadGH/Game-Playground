// The control panel and the readouts.
//
// Every knob here changes something you can see. The point of the experiment is wide coverage, so
// nothing is hidden behind a "developer" flag — if a number matters to how the picture looks, it
// is on this panel.

import { el, knob, select, checkbox, button, panel, toast } from '../../shared/ui.js';
import { PRESETS as QUALITY } from './quality.js';
import { WEATHER } from './sky.js';
import { PRESETS as CHARACTERS } from './character.js';

export function createHud(root, app) {
  const side = el('aside', { class: 'hd-side', id: 'hd-side' });
  const stats = el('div', { class: 'hd-stats' });
  const crumb = el('div', { class: 'hd-crumb' });
  const help = buildHelp();
  const widgets = {};

  // --- view -----------------------------------------------------------------------------------
  const viewBtns = el('div', { class: 'hd-seg' },
    button('Strategy', () => app.setCameraMode('overhead'), 'on'),
    button('Third person', () => app.setCameraMode('follow')),
  );
  widgets.viewBtns = viewBtns;
  const viewPanel = panel('View',
    viewBtns,
    checkbox('True isometric (no perspective)', false, v => app.setIsometric(v)),
    knob('Field of view', { min: 35, max: 90, step: 1, value: 55, format: v => v + '°' }, v => app.setFov(v)),
    el('div', { class: 'hd-note', text: 'Wheel zooms. Right-drag spins the strategy view; in third person, drag or click the canvas to look around.' }),
  );

  // --- sky ------------------------------------------------------------------------------------
  const timeKnob = knob('Time of day', { min: 0, max: 24, step: 0.05, value: 9.5, format: hhmm }, v => {
    app.setTime(v);
    widgets.autoDay.set(false);
    app.setDayCycle(false);
  });
  widgets.timeKnob = timeKnob;
  widgets.autoDay = checkbox('Run the day', false, v => app.setDayCycle(v));
  const skyPanel = panel('Sky and weather',
    timeKnob,
    widgets.autoDay,
    knob('Day length', { min: 30, max: 1800, step: 10, value: 300, format: v => Math.round(v) + ' s' }, v => app.setDayLength(v)),
    select('Weather', Object.entries(WEATHER).map(([k, v]) => ({ value: k, label: v.label })), 'clear', v => app.setWeather(v)),
    el('div', { class: 'hd-seg' },
      button('Dawn', () => setTime(6.4)),
      button('Noon', () => setTime(12.5)),
      button('Golden', () => setTime(18.1)),
      button('Night', () => setTime(1.0)),
    ),
  );
  function setTime(v) { timeKnob.set(v); app.setTime(v); widgets.autoDay.set(false); app.setDayCycle(false); }

  // --- atmosphere -----------------------------------------------------------------------------
  const fogPanel = panel('Atmosphere',
    knob('Haze thickness', { min: 0, max: 0.08, step: 0.0005, value: 0.0032, format: v => v.toFixed(4) }, v => app.setFog({ density: v })),
    knob('Haze depth', { min: 8, max: 160, step: 1, value: 85, format: v => v + ' m' }, v => app.setFog({ height: v })),
    knob('Sun glow in the haze', { min: 1, max: 40, step: 0.5, value: 8, format: v => v.toFixed(1) }, v => app.setFog({ sunPower: v })),
    knob('Wind strength', { min: 0, max: 3, step: 0.02, value: 1 }, v => app.setWind({ strength: v })),
    knob('Wind speed', { min: 0, max: 3, step: 0.02, value: 1 }, v => app.setWind({ speed: v })),
    knob('Wind direction', { min: 0, max: 360, step: 1, value: 35, format: v => v + '°' }, v => app.setWind({ direction: v })),
  );

  // --- quality --------------------------------------------------------------------------------
  const q0 = app.quality;
  widgets.quality = select('Preset', Object.entries(QUALITY).map(([k, v]) => ({ value: k, label: v.label })), q0.name, v => app.setQuality(v));
  widgets.bloom = checkbox('Bloom', q0.bloom, v => app.setPost({ bloom: v }));
  widgets.rays = checkbox('Light shafts', q0.godRays, v => app.setPost({ godRays: v }));
  widgets.ssao = checkbox('Ambient occlusion', q0.ssao, v => app.setPost({ ssao: v }));
  widgets.smaa = checkbox('Edge smoothing', q0.smaa, v => app.setPost({ smaa: v }));
  widgets.grassDensity = knob('Grass density', { min: 0, max: 1, step: 0.02, value: 1, format: pct }, v => app.setGrassDensity(v));
  widgets.viewDist = knob('Ground view distance', { min: 200, max: 1200, step: 20, value: q0.terrainViewDistance, format: m }, v => app.setViewDistance(v));
  widgets.treeDist = knob('Tree view distance', { min: 120, max: 900, step: 20, value: q0.treeDistance, format: m }, v => app.setTreeDistance(v));
  widgets.shadowDist = knob('Shadow distance', { min: 60, max: 400, step: 10, value: q0.shadowDistance, format: m }, v => app.setShadowDistance(v));
  widgets.pixelRatio = knob('Resolution', { min: 0.5, max: 2, step: 0.05, value: q0.pixelRatio, format: v => v.toFixed(2) + '×' }, v => app.setPixelRatio(v));
  const qualityPanel = panel('Quality',
    widgets.quality, widgets.bloom, widgets.rays, widgets.ssao, widgets.smaa,
    widgets.grassDensity, widgets.viewDist, widgets.treeDist, widgets.shadowDist, widgets.pixelRatio,
  );

  // --- picture --------------------------------------------------------------------------------
  const gradePanel = panel('Picture',
    knob('Exposure', { min: 0.3, max: 2.2, step: 0.01, value: 1 }, v => app.setGrade({ exposure: v })),
    knob('Contrast', { min: 0.8, max: 1.5, step: 0.01, value: 1.06 }, v => app.setGrade({ contrast: v })),
    knob('Saturation', { min: 0, max: 1.8, step: 0.01, value: 1.06 }, v => app.setGrade({ saturation: v })),
    knob('Vignette', { min: 0, max: 1, step: 0.01, value: 0.34 }, v => app.setGrade({ vignette: v })),
    knob('Split tone', { min: 0, max: 0.4, step: 0.005, value: 0.10 }, v => app.setGrade({ split: v })),
    knob('Grain', { min: 0, max: 0.08, step: 0.002, value: 0.018 }, v => app.setGrade({ grain: v })),
    knob('Bloom strength', { min: 0, max: 1.4, step: 0.01, value: 0.26 }, v => app.setGrade({ bloom: v })),
    knob('Light shaft strength', { min: 0, max: 2, step: 0.02, value: 1 }, v => app.setGrade({ rays: v })),
  );

  // --- character ------------------------------------------------------------------------------
  widgets.clipPicker = select('Play a clip', ['—'], '—', v => { if (v !== '—') app.playClip(v); });
  const charPanel = panel('Character',
    select('Who', Object.entries(CHARACTERS).map(([k, v]) => ({ value: k, label: v.label })), 'ranger', v => app.setCharacter(v)),
    el('div', { class: 'hd-seg' },
      button('Wave', () => app.playState('wave')),
      button('Dance', () => app.playState('dance')),
      button('Sword', () => app.playState('swordIdle')),
      button('Sit', () => app.playState('sit')),
      button('Stand', () => app.playState(null)),
    ),
    widgets.clipPicker,
    el('div', { class: 'hd-note', text: 'In the strategy view, click the ground to send them walking there.' }),
  );

  // --- world ----------------------------------------------------------------------------------
  widgets.seed = el('input', { type: 'number', value: String(app.seed), style: { width: '9em' } });
  const worldPanel = panel('World',
    el('div', { class: 'row' }, el('label', { text: 'Seed' }), widgets.seed,
      button('Rebuild', () => app.rebuild(+widgets.seed.value))),
    el('div', { class: 'hd-seg' },
      button('Go to character', () => app.focusCharacter()),
      button('New spot', () => app.respawn()),
    ),
    knob('Plant density', { min: 0.2, max: 2.0, step: 0.05, value: 1, format: v => v.toFixed(2) + '×' }, v => app.setPlantDensity(v)),
  );

  const shotPanel = el('div', { class: 'hd-seg' },
    button('Screenshot', () => app.screenshot()),
    button('Hide panel  (H)', () => toggle()),
    button('Help  (/)', () => help.classList.toggle('open')),
  );

  side.append(
    el('div', { class: 'hd-title' }, el('a', { href: '../', class: 'hd-back', text: '← Playground' }), el('h1', { text: '3D High Def' })),
    stats, crumb, shotPanel,
    viewPanel, skyPanel, fogPanel, qualityPanel, gradePanel, charPanel, worldPanel,
    el('div', { class: 'hd-note hd-foot', text: 'Every surface, plant and rock here is generated in code — no downloaded models except the character, which is CC0.' }),
  );
  root.append(side, help);

  function toggle() { side.classList.toggle('hidden'); }

  /** Called every frame with the numbers worth watching. */
  function tick(info) {
    stats.innerHTML =
      `<span class="big">${info.fps.toFixed(0)}</span><span class="unit">fps</span>` +
      `<span>${(info.triangles / 1000).toFixed(0)}k tris</span>` +
      `<span>${info.calls} draws</span>` +
      `<span>${info.textures} tex</span>`;
    crumb.textContent = info.crumb;
  }

  function setViewButton(mode) {
    const btns = viewBtns.querySelectorAll('button');
    btns[0].classList.toggle('on', mode === 'overhead');
    btns[1].classList.toggle('on', mode === 'follow');
  }

  function setClips(names) {
    const sel = widgets.clipPicker.select;
    sel.innerHTML = '';
    sel.append(el('option', { value: '—', text: '—' }));
    for (const n of names) sel.append(el('option', { value: n, text: n }));
  }

  /** After a preset change, put every knob back where the preset says it should be. */
  function syncQuality(q) {
    widgets.quality.set(q.name);
    widgets.bloom.set(q.bloom);
    widgets.rays.set(q.godRays);
    widgets.ssao.set(q.ssao);
    widgets.smaa.set(q.smaa);
    widgets.viewDist.set(q.terrainViewDistance);
    widgets.treeDist.set(q.treeDistance);
    widgets.shadowDist.set(q.shadowDistance);
    widgets.pixelRatio.set(q.pixelRatio);
  }

  return { side, tick, toggle, setViewButton, setClips, syncQuality, widgets, toast, help };
}

function buildHelp() {
  const rows = [
    ['W A S D', 'Move — the character in third person, the view in the strategy camera'],
    ['Shift', 'Sprint (or pan the strategy view faster)'],
    ['Space', 'Jump'],
    ['Ctrl / C', 'Crouch'],
    ['Q / E', 'Lower / raise the strategy camera'],
    ['Z / X', 'Spin the strategy camera'],
    ['Mouse wheel', 'Zoom'],
    ['Right-drag', 'Spin and tilt'],
    ['Left-click (strategy)', 'Send the character walking there'],
    ['V', 'Switch between the strategy view and third person'],
    ['F / G / R / B', 'Wave · dance · swing · roll'],
    ['H', 'Show or hide the control panel'],
    ['F2', 'Save a screenshot'],
    ['/', 'This list'],
  ];
  const box = el('div', { class: 'hd-help' },
    el('h2', { text: 'Controls' }),
    el('table', {}, ...rows.map(([k, v]) => el('tr', {}, el('th', { text: k }), el('td', { text: v })))),
    el('p', { class: 'hd-note', text: 'Press / or click anywhere to close.' }),
  );
  box.addEventListener('click', () => box.classList.remove('open'));
  return box;
}

const hhmm = v => {
  const h = Math.floor(v) % 24;
  const mnt = Math.round((v - Math.floor(v)) * 60);
  return String(h).padStart(2, '0') + ':' + String(mnt).padStart(2, '0');
};
const pct = v => Math.round(v * 100) + '%';
const m = v => Math.round(v) + ' m';
