import { bakePortrait, svgPortrait } from './chibi26-portrait.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const presetsData = await (await fetch('./data/chibi2-presets.json')).json();
const presets = presetsData.presets;
const preset = $('preset');
for (const row of presets) preset.add(new Option(row.name, row.id));
preset.value = presets.some(p => p.id === params.get('preset')) ? params.get('preset') : 'human_wayfarer';
const baked = $('baked'), svg = $('svg'), renderButton = $('render'), downloadButton = $('download');
let pngUrl = '', svgUrl = '';

function currentLook() {
  const source = presets.find(p => p.id === preset.value)?.avatar || presets[0].avatar;
  const look = structuredClone(source);
  look.body ||= {};
  look.body.v = 2.6;
  look.body.form = $('feminine').checked ? 'fem' : 'masc';
  look.body.chestSize = $('round').checked ? 'round' : 'flat';
  return look;
}

async function render() {
  if (renderButton.disabled) return;
  renderButton.disabled = true;
  downloadButton.disabled = true;
  $('status').textContent = 'Building the 2.6 model and rendering…';
  try {
    const look = currentLook();
    const size = Number($('resolution').value);
    const yawDegrees = Number($('yaw').value);
    $('yaw-value').value = `${yawDegrees}°`;
    const [nextPng, nextSvg] = await Promise.all([
      bakePortrait(look, { width: size, height: size * 1.25, yaw: yawDegrees * Math.PI / 180, graphics: $('graphics').value }),
      Promise.resolve(svgPortrait(look, { width: 320, height: 400 })),
    ]);
    if (pngUrl) URL.revokeObjectURL(pngUrl);
    if (svgUrl) URL.revokeObjectURL(svgUrl);
    pngUrl = nextPng;
    svgUrl = URL.createObjectURL(new Blob([nextSvg], { type: 'image/svg+xml' }));
    baked.src = pngUrl;
    svg.src = svgUrl;
    $('status').textContent = `${preset.selectedOptions[0].text} · ${size} × ${size * 1.25} px · ${$('graphics').value === 'high' ? 'textures on' : 'solid colors'}`;
    const url = new URL(location.href); url.searchParams.set('preset', preset.value); history.replaceState(null, '', url);
    downloadButton.disabled = false;
  } catch (error) {
    console.error(error);
    $('status').textContent = `Render failed: ${error.message}`;
  } finally {
    renderButton.disabled = false;
  }
}

renderButton.addEventListener('click', render);
downloadButton.addEventListener('click', () => {
  if (!pngUrl) return;
  const link = document.createElement('a'); link.href = pngUrl; link.download = `${preset.value}-chibi26-portrait.png`; link.click();
});
for (const id of ['preset', 'resolution', 'graphics', 'round']) $(id).addEventListener('change', render);
$('feminine').addEventListener('change', () => {
  $('round').disabled = !$('feminine').checked;
  if (!$('feminine').checked) $('round').checked = false;
  render();
});
$('round').disabled = !$('feminine').checked;
$('yaw').addEventListener('input', () => { $('yaw-value').value = `${$('yaw').value}°`; });
$('yaw').addEventListener('change', render);
await render();
