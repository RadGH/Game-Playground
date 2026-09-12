// Gallery for the asset library: every scene in the manifest rendered in a 16:9 box with its tags,
// a night switch, tag/name filters, click to enlarge, and the map icons.
import { Assets } from './assets.js';

const $ = id => document.getElementById(id);
const assets = await Assets.open('./');

const state = { night: false, tag: null, search: '' };

/** Cards for every scene that passes the filters. */
async function renderScenes() {
  const grid = $('scene-grid');
  const ids = assets.sceneryIds()
    .filter(id => !state.tag || (assets.sceneryInfo(id).tags || []).includes(state.tag))
    .filter(id => !state.search || id.includes(state.search));
  grid.dataset.night = state.night ? '1' : '0';
  grid.replaceChildren(...ids.map(id => {
    const info = assets.sceneryInfo(id) || {};
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.dataset.id = id;
    card.innerHTML = `<div class="thumb"></div><div class="meta"><b>${id}</b><span class="tags">${(info.tags || []).join(' · ')}${info.night ? ' · <i>drawn as night</i>' : ''}</span></div>`;
    card.addEventListener('click', () => enlarge(id));
    return card;
  }));
  // Fill the thumbnails after the cards are in the page so the grid does not jump around.
  await Promise.all(ids.map(async id => {
    const card = grid.querySelector(`.scene-card[data-id="${id}"]`);
    if (!card) return;
    const svg = await assets.sceneryElement(id, { night: state.night });
    if (svg.dataset.missing) card.classList.add('missing');
    card.querySelector('.thumb').replaceChildren(svg);
  }));
  const missing = grid.querySelectorAll('.scene-card.missing').length;
  $('status').textContent = `${ids.length} of ${assets.sceneryIds().length} scenes · ${assets.iconTypes().length} icons` + (missing ? ` · ${missing} not drawn yet` : '');
}

/** One chip per tag, plus an "all" chip. */
function renderTags() {
  const all = assets.tags();
  $('tags').replaceChildren(...['all', ...all].map(t => {
    const chip = document.createElement('span');
    chip.className = 'chip' + ((state.tag === null && t === 'all') || state.tag === t ? ' on' : '');
    chip.textContent = t;
    chip.addEventListener('click', () => { state.tag = t === 'all' ? null : t; renderTags(); renderScenes(); });
    return chip;
  }));
}

async function renderIcons() {
  const row = $('icon-row');
  const types = assets.iconTypes();
  const els = await Promise.all(types.map(async t => {
    const card = document.createElement('div');
    card.className = 'icon-card';
    card.dataset.id = t;
    card.append(await assets.iconElement(t, { size: 34 }));
    const label = document.createElement('span');
    label.textContent = t;
    card.append(label);
    return card;
  }));
  row.replaceChildren(...els);
}

async function enlarge(id, night = state.night) {
  const info = assets.sceneryInfo(id) || {};
  $('big-name').textContent = id;
  $('big-tags').textContent = (info.tags || []).join(' · ');
  $('big-file').textContent = 'assets/data/' + (info.file || '(not in the manifest)');
  $('big-night').checked = night;
  $('big-box').replaceChildren(await assets.sceneryElement(id, { night }));
  $('big').dataset.id = id;
  if (!$('big').open) $('big').showModal();
}

$('night').addEventListener('change', e => { state.night = e.target.checked; renderScenes(); });
$('search').addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); renderScenes(); });
$('big-night').addEventListener('change', e => enlarge($('big').dataset.id, e.target.checked));
$('big-close').addEventListener('click', () => $('big').close());

renderTags();
await renderIcons();
await renderScenes();

window.assetsDemo = { assets, state, renderScenes, renderTags, renderIcons, enlarge };
document.body.dataset.ready = '1';
