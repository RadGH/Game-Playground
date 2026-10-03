// skillfx.html: fire every skill and power recipe on fake events (stream C).
import * as THREE from 'three';
import { loadLooks } from '../view/unit-looks.js';
import { createSkillFx } from '../view/skillfx.js';

const $ = id => document.getElementById(id);
const canvas = $('view3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x26303a);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a3f2c, 1.2)); const sun = new THREE.DirectionalLight(0xfff0d6, 2); sun.position.set(-30, 60, 40); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x4f6b34, roughness: 1 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 300);
// the game's middle zoom: pitch 56, 50 m out, looking from +z
const P = THREE.MathUtils.degToRad(56), D = 26; camera.position.set(0, Math.sin(P) * D, 2 + Math.cos(P) * D); camera.lookAt(0, 0, 2);
function resize() { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const looks = await loadLooks();
const heroesData = await (await fetch(new URL('../../data/heroes.json', import.meta.url))).json();
const powersData = await (await fetch(new URL('../../data/powers.json', import.meta.url))).json().catch(() => ({ powers: {} }));
const actors = new Map();
async function place(id, look, x, z, face = 0) {
  const a = await looks.build(look); a.group.scale.setScalar(1.3 * (look.scale || 1)); a.group.position.set(x, 0, z); a.group.rotation.y = face; scene.add(a.group); a.setAnim('ready');
  actors.set(id, { x, z, height: a.height * 1.3 * (look.scale || 1), group: a.group, actor: a }); return a;
}
let hero = null;
async function setHero(id) {
  if (hero) { scene.remove(hero.group); hero.dispose(); }
  hero = await place(1, looks.forHero(id, { color: '#3f86ec' }), 0, 8, Math.PI);
}
for (const [i, uid] of ['levy', 'brute', 'ghoul', 'mauler', 'shieldbearer'].entries()) await place(10 + i, looks.forUnit(uid), -6 + i * 3, -2 + (i % 2) * 1.5);
$('hero').innerHTML = looks.heroIds().map(h => `<option>${h}</option>`).join('');
$('hero').value = new URLSearchParams(location.search).get('hero') || 'pyromancer';
$('hero').onchange = () => setHero($('hero').value);
await setHero($('hero').value);

const fx = await createSkillFx({ scene, camera, actors, tickHz: 20 });
const ids = fx.ids();
function fire(kind, id) {
  const s = heroesData.skills[id] || {}, target = 12, tx = 0, tz = -1;
  if (kind === 'power') { fx.onEvent({ type: 'power', power: id, x: tx, z: tz }); setTimeout(() => fx.onEvent({ type: 'powerHit', power: id, x: tx, z: tz, radius: 5 }), 1500); return; }
  hero.setAnim('cast', 0.1, true);
  fx.onEvent({ type: 'cast', id: 1, skill: id, shape: s.shape, x: s.shape === 'ground' ? tx : 0, z: s.shape === 'ground' ? tz : 8, face: Math.PI, radius: s.radius || 4, arc: s.arc || 2, reach: s.reach || 3, delay: 20 });
  if (s.shape === 'bolt') fx.onEvent({ type: 'bolt', id: 1, skill: id, fromX: 0, fromZ: 8, toX: tx, toZ: tz, ticks: 10, dst: target });
  if (s.shape === 'ground' || s.zone || s.place) setTimeout(() => fx.onEvent({ type: 'zone', zone: 77, skill: id, x: tx, z: tz, radius: s.radius || 4, length: id === 'fire_wall' ? 10 : 0, face: Math.PI / 2, ticks: 80, dmgType: s.element }), 400);
  if (s.shape === 'dash') fx.onEvent({ type: 'dash', id: 1, skill: id, fromX: 0, fromZ: 8, toX: 3, toZ: 1 });
  if (id === 'shrapnel_mine') setTimeout(() => fx.onEvent({ type: 'trap', zone: 78, x: tx, z: tz, radius: 3 }), 1200);
  if (id === 'whirlwind') for (let i = 1; i < 4; i++) setTimeout(() => fx.onEvent({ type: 'pulse', id: 1, skill: id, x: 0, z: 8, radius: 5.5 }), i * 300);
  if (['wolf_shape', 'briarback_shape'].includes(id)) fx.onEvent({ type: 'form', id: 1, form: id.split('_')[0] });
}
const chips = $('chips');
const section = (title, kind, list) => { const h = document.createElement('h3'); h.textContent = title; chips.append(h); for (const id of list) { const b = document.createElement('button'); b.textContent = heroesData.skills[id]?.name || powersData.powers?.[id]?.name || id; b.dataset.id = id; b.onclick = () => fire(kind, id); chips.append(b); } };
section('Skills', 'skill', ids.skills); section('Powers', 'power', ids.powers);
section('Statuses', 'status', []);
for (const st of ['burn', 'bleed', 'root', 'stun', 'slow', 'quarry', 'regen', 'haste', 'barrier']) { const b = document.createElement('button'); b.textContent = st; let on = false; b.onclick = () => { on = !on; fx.onEvent({ type: 'status', id: 11, status: st, on }); }; chips.append(b); }
$('state').textContent = `${ids.skills.length} skills, ${ids.powers.length} powers`;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => { const dt = Math.min(0.05, clock.getDelta()); for (const a of actors.values()) a.actor.update(dt, clock.elapsedTime); hero?.update(dt); fx.update(dt); renderer.render(scene, camera); });
window.skillfxPage = { fire, fx, ready: true, setHero };
