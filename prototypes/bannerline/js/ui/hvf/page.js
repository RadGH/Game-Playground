// hvf.html: Hunters vs Farmers on its own page (stream H). Boots the data and stream B's renderer, then
// hands everything to js/ui/hvf/game.js — exactly what main.js does when the mode card is picked.
import { createRenderer } from '../../view/renderer.js';
import { loadData } from '../../sim/data.js';
import { installTooltips } from '../../../../../shared/tooltip.js';
import { createHvfGame } from './game.js';
import { loadBindings } from '../../input/bindings.js';
import { createDeviceManager } from '../../input/devices.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

async function boot() {
  const data = await loadData((name) => fetch(`data/${name}`).then((r) => { if (!r.ok) throw new Error(`data/${name}: ${r.status}`); return r.text(); }));
  await loadBindings();
  installTooltips();
  const gfx = createRenderer($('view'));
  const devices = createDeviceManager({ root: $('app') });
  const game = createHvfGame({ gfx, data, host: $('hvf-host'), params, devices, transportKind: params.get('net') || 'peerjs', onExit: () => { location.href = './'; } });
  window.hvfGame = game;
  $('boot').classList.add('done'); setTimeout(() => $('boot').remove(), 500);
  if (params.get('start')) await game.ready;
  if (params.get('start')) game.start({ seats: [{ role: params.get('role') || 'farmer', device: 'kbm' }], format: params.get('format') || data.hvf.rules.defaultFormat, ai: params.get('ai') || 'recruit', speed: Number(params.get('speed')) || 1, seed: params.get('seed') ? Number(params.get('seed')) : null });
  else game.openSetup();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { game.frame(dt); } catch (err) { console.error(err); }
    if (params.get('render') !== '0') gfx.render();   // render=0: headless net tests (the sim, HUD and lockstep still run)
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
boot().catch((err) => { console.error(err); $('boot').classList.add('error'); $('boot').textContent = 'Hunters vs Farmers failed to load:\n' + (err.stack || err.message); });
