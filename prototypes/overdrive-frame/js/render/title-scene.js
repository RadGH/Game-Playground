// The title screen's backdrop (owner: "a mech in a workshop being maintained, with sparks flying and other industrial
// features … designed so the mech looks very large scale … forklifts, semi trucks, or other recognizable objects").
// The scene is rendered ONCE from a low, wide camera (a person's eye height, looking up) into a picture — prerendered,
// like everything else — and live 2D layers go on top: welding sparks, steam, a blinking beacon, dust in the light.
// Your own mech stands in the cradle, so the title changes as you rebuild it.
import * as THREE from 'three';
import { RECIPES, build as buildRecipe } from '../../../../citykit/js/kit/buildings.js';
import '../../../../citykit/js/kit/all.js';
import { legsRig, upperRig, idOfKey, PARTS } from '../../../../mechkit/js/rig.js';
import { paintFor } from '../../../../mechkit/js/bake-mech.js';
import { kitBuild } from './mechs.js';

const U = 1;   // world units = tiles (16 m); a mech is ~0.75 tall

function place(scene, id, params, x, z, rotY = 0, { y = 0, scale = 1 } = {}) {
  if (!RECIPES[id]) return null;
  const g = buildRecipe(id, params || {});
  if (g.userData.face) g.userData.face(rotY); else g.rotation.y = rotY;
  g.position.set(x, y, z); g.scale.setScalar(scale);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g); return g;
}

/** Paint the mech's grey paint regions with real colours (the 3D render has no run-time tint). */
function paintMech(group, makerOf, paint) {
  group.traverse(o => {
    if (!o.isMesh) return;
    const key = (() => { let p = o; while (p && !p.userData.partKey) p = p.parent; return p?.userData.partKey; })();
    const maker = makerOf(key);
    const P = paintFor(paint, maker);
    const swap = m => {
      const r = m.userData?.paint; if (!r) return m;
      const c = m.clone(); c.color = new THREE.Color(P[r] || P.primary); return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

function hangar(scene) {
  const concrete = new THREE.MeshStandardMaterial({ color: '#3b3f46', roughness: 0.92, metalness: 0.05 });
  const wall = new THREE.MeshStandardMaterial({ color: '#23272f', roughness: 0.85, metalness: 0.3 });
  const rib = new THREE.MeshStandardMaterial({ color: '#4a505c', roughness: 0.6, metalness: 0.6 });
  const glowWarm = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffcf8a', emissiveIntensity: 2.4 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), concrete); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // back wall with steel ribs, a catwalk and a huge bay door glowing at the far end
  const back = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 0.1), wall); back.position.set(0, 2, -3.2); back.receiveShadow = true; scene.add(back);
  for (let i = -6; i <= 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4, 0.12), rib); r.position.set(i * 0.9, 2, -3.1); r.castShadow = true; scene.add(r); }
  const walk = new THREE.Mesh(new THREE.BoxGeometry(14, 0.03, 0.3), rib); walk.position.set(0, 1.05, -2.95); scene.add(walk);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.012, 0.012), rib); rail.position.set(0, 1.12, -2.82); scene.add(rail);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: '#22406a', emissiveIntensity: 1.1 })); door.position.set(-3.2, 0.95, -3.14); scene.add(door);
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.012, 0.02), rib); s.position.set(-3.2, 0.12 + i * 0.22, -3.12); scene.add(s); }
  // roof trusses + strip lights
  for (let i = -3; i <= 3; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 7), rib); t.position.set(i * 1.6, 3.2, 0.2); scene.add(t);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 1.2), glowWarm); l.position.set(i * 1.6 + 0.4, 3.05, -0.6); scene.add(l);
  }
  return { floor };
}

export class TitleScene {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.img = null; this.t = 0; this.parts = [];
    this.anchors = {};   // screen points (fraction of the picture) for the live layers
  }

  /** Render the backdrop for this build at this size. Returns a promise that resolves when the picture is ready. */
  async render(build, w, h) {
    const kb = kitBuild(build);
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const fit = Math.min(1, 1600 / (w * dpr), 1000 / (h * dpr)), W = Math.round(w * dpr * fit), H = Math.round(h * dpr * fit);   // a backdrop: 1600 × 1000 is plenty, keeps the one-off render quick
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#0a0d14'); scene.fog = new THREE.FogExp2('#141a26', 0.42);
    hangar(scene);

    // the mech, in its cradle — the hero of the picture
    const legs = legsRig(kb.legs), upper = upperRig(kb);
    const { hip } = legs.pose('idle', 0.2); upper.pose('idle', 0.2);
    const mech = new THREE.Group(); mech.add(legs.group); upper.group.position.set(...hip); mech.add(upper.group);
    paintMech(mech, key => (key ? PARTS[idOfKey(kb, key)]?.maker : PARTS[kb.legs]?.maker) || PARTS[kb.core]?.maker, build.paint || 'maker');
    mech.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mech.rotation.y = -1.05; scene.add(mech);                 // three-quarter view toward the camera
    const box = new THREE.Box3().setFromObject(mech), mh = box.max.y;

    // the bay around it: scaffolding behind-left, the welder's lift at its knee, the crane rail far behind,
    // and everyday things in front for scale — a semi truck, a forklift, people
    place(scene, 'ws-gantry', { span: 30, hook: 12 }, -0.2, -1.6, 0);
    place(scene, 'ws-scaffold', { levels: 6 }, -0.55, -0.32, 0.25);
    place(scene, 'ws-scissor', { lift: 5, welder: 1 }, 0.36, 0.22, -0.9);
    place(scene, 'ws-semi', { cab: 3, trailer: 0 }, 0.95, 0.55, -2.5);
    place(scene, 'ws-forklift', { forks: 1 }, -0.42, 0.72, 2.2);
    place(scene, 'ws-drums', { count: 6 }, -0.95, 0.15, 0.4);
    place(scene, 'ws-stack', { kind: 1, count: 3 }, -1.7, -1.0, 0);
    place(scene, 'ws-stack', { kind: 0, count: 5 }, 1.5, -0.6, 0.2);
    place(scene, 'ws-reel', { wound: 3 }, -0.75, 0.6, 0.4);
    place(scene, 'ws-toolcart', { paint: 2 }, 0.15, 0.62, 0.9);
    place(scene, 'ws-palletjack', { load: 1 }, 1.35, 0.35, 1.2);
    for (const [x, z, pose, r] of [[0.18, 0.5, 1, 2.6], [-0.12, 0.82, 0, 0.4], [0.5, 0.42, 2, -1.2], [-0.62, 0.95, 3, 1.1], [1.2, 1.05, 0, 2]]) place(scene, 'ws-crew', { pose }, x, z, r);
    for (const [x, z] of [[-0.5, 0.5], [0.6, 0.3], [-0.1, -0.6], [-1.3, 0.1]]) place(scene, 'ws-lamp', { drop: 3, kind: 0 }, x, z, 0, { y: 1.9 });
    place(scene, 'ws-floor', { kind: 0 }, 0, 0, 0); place(scene, 'ws-floor', { kind: 2 }, 0.95, 0.95, 0);

    // light: warm work lights from above, a cool fill from the bay door, a hard rim behind the mech
    scene.add(new THREE.HemisphereLight('#9fb4d8', '#2a2420', 0.55));
    const key = new THREE.SpotLight('#ffd7a8', 90, 8, 0.55, 0.5, 1.3); key.position.set(1.1, 2.4, 1.6); key.target.position.set(0, mh * 0.55, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); scene.add(key, key.target);
    const rim = new THREE.SpotLight('#7fd8ff', 40, 7, 0.5, 0.6, 1.5); rim.position.set(-1.2, 1.6, -2.2); rim.target.position.set(0, mh * 0.6, 0); scene.add(rim, rim.target);
    const fill = new THREE.PointLight('#3a6aa8', 6, 6, 1.6); fill.position.set(-3, 1, -2.6); scene.add(fill);
    const weld = new THREE.PointLight('#bfe8ff', 3, 1.2, 2); weld.position.set(0.26, mh * 0.4, 0.2); scene.add(weld);

    // camera: a person's eye height (1.7 m = 0.11 tiles) standing near the forklift, looking up past the mech's knee
    const cam = new THREE.PerspectiveCamera(40, W / H, 0.02, 40);
    cam.position.set(1.0, 0.11, 1.75); cam.lookAt(-0.12, mh * 0.6, 0);
    // on narrow (phone) screens step back a little so the whole mech fits
    if (W / H < 1) { cam.fov = 58; cam.position.set(0.45, 0.12, 2.6); cam.lookAt(0, mh * 0.55, 0); }
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);

    const img = document.createElement('canvas'); img.width = W; img.height = H; img.getContext('2d').drawImage(renderer.domElement, 0, 0);
    // where the live layers go: the weld spot on the mech's knee, a vent for steam, the beacon on the gantry
    const proj = v => { const p = new THREE.Vector3(...v).project(cam); return [(p.x + 1) / 2, (1 - p.y) / 2]; };
    this.anchors = { weld: proj([0.26, mh * 0.4, 0.2]), steam: proj([-0.7, 0.05, -0.2]), beacon: proj([0.15, 0.95, -0.3]), head: proj([0, mh * 0.95, 0]) };
    renderer.dispose(); renderer.forceContextLoss?.();
    scene.traverse(o => { o.geometry?.dispose?.(); });
    this.img = img;
    return img;
  }

  /** Live layers: sparks, steam, the beacon, light dust. Call every frame. */
  frame(dt) {
    const g = this.ctx, cw = this.cv.width, ch = this.cv.height; this.t += dt;
    // cover-fit the picture (until it is ready: a dark bay with the live layers already moving)
    const img = this.img || { width: cw, height: ch };
    const k = Math.max(cw / img.width, ch / img.height), iw = img.width * k, ih = img.height * k, ox = (cw - iw) / 2, oy = (ch - ih) / 2;
    if (this.img) g.drawImage(this.img, ox, oy, iw, ih);
    else { const gr = g.createRadialGradient(cw * 0.6, ch * 0.45, 0, cw * 0.6, ch * 0.45, Math.max(cw, ch) * 0.7); gr.addColorStop(0, '#1a2233'); gr.addColorStop(1, '#07090f'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch); }
    const at = a => [ox + a[0] * iw, oy + a[1] * ih];
    const [wx, wy] = at(this.anchors.weld || [0.5, 0.6]);
    // welding: bursts of sparks that fall and bounce, a flickering blue-white glow
    const burst = (Math.sin(this.t * 1.7) > -0.2) && Math.random() < 0.9;
    if (burst) for (let i = 0; i < 4; i++) this.parts.push({ x: wx, y: wy, vx: (Math.random() - 0.3) * 260 * k, vy: (-Math.random() * 160 - 40) * k, life: 0.6 + Math.random() * 0.8, age: 0, kind: 'spark', floor: wy + (60 + Math.random() * 40) * k * 3 });
    if (Math.random() < 0.08) { const [sx, sy] = at(this.anchors.steam || [0.2, 0.9]); this.parts.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 12, vy: -22 - Math.random() * 18, life: 3 + Math.random() * 2, age: 0, kind: 'steam', r: 18 + Math.random() * 20 }); }
    if (Math.random() < 0.15) this.parts.push({ x: ox + Math.random() * iw, y: oy + Math.random() * ih * 0.7, vx: 4 + Math.random() * 6, vy: 2 + Math.random() * 4, life: 6, age: 0, kind: 'dust' });
    g.save();
    if (burst) { const f = 0.55 + Math.random() * 0.45, r = 90 * k * 3 * f; const gr = g.createRadialGradient(wx, wy, 0, wx, wy, r); gr.addColorStop(0, 'rgba(210,240,255,0.85)'); gr.addColorStop(0.2, 'rgba(120,200,255,0.35)'); gr.addColorStop(1, 'rgba(60,140,255,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(wx, wy, r, 0, Math.PI * 2); g.fill(); }
    const keep = [];
    for (const p of this.parts) {
      p.age += dt; if (p.age > p.life) continue; keep.push(p);
      if (p.kind === 'spark') {
        p.vy += 520 * k * dt * 3; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; }
        const a = 1 - p.age / p.life; g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,${180 + 60 * a | 0},${90 + 100 * a | 0},${a})`; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); g.stroke();
      } else if (p.kind === 'steam') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += 10 * dt; const a = 0.16 * Math.sin(Math.PI * p.age / p.life);
        g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(170,185,210,${a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt; const a = 0.35 * Math.sin(Math.PI * p.age / p.life);
        g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,220,170,${a})`; g.fillRect(p.x, p.y, 1.5, 1.5);
      }
    }
    this.parts = keep.slice(-500);
    // the beacon on the crane blinks amber
    const [bx, by] = at(this.anchors.beacon || [0.5, 0.1]), on = (this.t % 1.2) < 0.5;
    if (on) { const gr = g.createRadialGradient(bx, by, 0, bx, by, 40); gr.addColorStop(0, 'rgba(255,170,60,0.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(bx, by, 40, 0, Math.PI * 2); g.fill(); }
    g.restore();
    // a soft vignette so the menu reads over the picture
    if (cw < ch) return;                    // portrait: the screen's own column shading does it
    const v = g.createLinearGradient(0, 0, cw * 0.55, 0); v.addColorStop(0, 'rgba(5,7,12,0.88)'); v.addColorStop(0.6, 'rgba(5,7,12,0.35)'); v.addColorStop(1, 'rgba(5,7,12,0)');
    g.fillStyle = v; g.fillRect(0, 0, cw, ch);
  }
}
