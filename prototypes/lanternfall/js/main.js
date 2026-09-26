// Boot: load data, pick the renderer, build the game, start the loop, route screens (docs/10 §3).
import { loadData, loadRoom } from './core/data.js';
import { createGame, enterRoom } from './core/state.js';
import { tickGame } from './core/tick.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './render/camera.js';
import { createWebGL2Renderer } from './render/webgl2.js';
import { buildAtlas } from './render/sprites.js';
import { buildFrame } from './render/frame.js';
import { hexToRgb01 } from './core/math.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const bootEl = document.getElementById('boot');
const LF = window.lanternfall = { ready: false, errors: [] };

try {
  const data = await loadData();
  data.movement = data.movement || (await (await fetch(new URL('../data/movement.json', import.meta.url))).json());
  LF.data = data;
  const renderer = createWebGL2Renderer(canvas, { mats: data.mats });
  if (!renderer) throw new Error('WebGL2 is not available in this browser.');
  const atlas = buildAtlas(data.sprites); renderer.setAtlas(atlas.rgba, atlas.w, atlas.h);
  const input = createInput(); const cam = createCamera();
  const game = createGame({ data, seed: +(params.get('seed') || 1) });
  game.flags.swimming = params.has('swim');
  game.hurtPlayer = (amount, info) => { game.player.hp = Math.max(info?.noKill ? 1 : 0, (game.player.hp ?? 100) - amount); game.player.hurtT = 0.5; cam.shake(0.2); };
  const roomId = params.get('room') || 'a1_wax_stair_02';
  const roomJson = await loadRoom(data, roomId);
  enterRoom(game, roomJson, params.get('entry') || undefined);
  renderer.setRoom(game.grid);
  const theme = game.room.theme;
  function fit() { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr); cam.fit(canvas.width, canvas.height); }
  addEventListener('resize', fit); fit();
  cam.snap(game.player.x, game.player.y, game.grid);
  addEventListener('keydown', e => { if (input.onKey(e.code, true)) e.preventDefault(); });
  addEventListener('keyup', e => { input.onKey(e.code, false); });
  addEventListener('blur', () => input.clear());
  canvas.addEventListener('mousedown', e => input.onKey('Mouse' + e.button, true));
  addEventListener('mouseup', e => input.onKey('Mouse' + e.button, false));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); input.mouse.x = e.clientX - r.left; input.mouse.y = e.clientY - r.top; });
  const sky = { top: hexToRgb01(theme.sky?.top || '#10141d'), bottom: hexToRgb01(theme.sky?.bottom || '#06080c'), sil: hexToRgb01(theme.sky?.sil || '#161a24') };
  const loop = createLoop({
    tick() {
      const dpr = canvas.width / innerWidth;
      input.mouse.wx = cam.x + input.mouse.x * dpr / cam.scale; input.mouse.wy = cam.y + input.mouse.y * dpr / cam.scale;
      tickGame(game, input.poll(), cam.view());
      cam.update(game.player, game.grid, 1 / 60);
    },
    render(alpha, dt) {
      const f = buildFrame(game, cam, atlas, alpha);
      game.ripples.setOffset(0);
      const x0 = Math.max(0, Math.floor(cam.x) - 1);
      renderer.render({
        cam: { x: cam.x + cam.shakeX, y: cam.y + cam.shakeY }, view: { w: cam.vw, h: cam.vh }, scale: cam.scale, time: game.time,
        lights: f.lights, sprites: f.sprites, overlays: f.overlays, additive: f.additive,
        ripple: game.ripples.h.subarray(x0, x0 + cam.vw + 2),
        ambient: { top: [0.16, 0.18, 0.26], bottom: [0.08, 0.09, 0.13], floor: 0.1 }, sky, rain: { alpha: 1, wind: game.rain.wind }, bloom: 0.35,
      });
    },
  });
  LF.game = game; LF.input = input; LF.cam = cam; LF.renderer = renderer; LF.loop = loop;
  LF.player = () => { const p = game.player; return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, state: p.state, anim: p.anim, hp: p.hp }; };
  LF.step = n => { for (let k = 0; k < n; k++) { tickGame(game, input.poll(), cam.view()); cam.update(game.player, game.grid, 1 / 60); } };
  loop.start();
  bootEl.classList.add('gone'); LF.ready = true;
} catch (e) {
  console.error(e); LF.errors.push(String(e.stack || e)); bootEl.classList.add('error'); bootEl.textContent = 'Lanternfall could not start:\n\n' + (e.stack || e);
}
