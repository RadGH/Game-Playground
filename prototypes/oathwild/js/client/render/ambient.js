// Ambient life (environment round 2026-11-24, "lived-in"): small moving things that make the world breathe, all drawn
// round the camera only and all cheap (a few hundred points / quads, one draw call each):
//   motes        warm dust and pollen drifting on the wind in the light
//   leaves       a few leaves letting go of the crowns near you and fluttering down
//   smoke        soft grey puffs rising from every chimney within sight (kit-draw.js finds the chimney tops)
//   birds        small flocks wheeling high over the land
//   butterflies  a few over the meadows near you
//   sound        the ambience bed follows where you stand: forest, town, marsh, or wind in the open
// Normal blending everywhere (nothing additive: no bloom bait), no lights, nothing toggled (lessons rule 29).
//
//   const amb = createAmbient(view, { T, trees, chimneys, quality, sound? })   amb.update(dt, at)   amb.dispose()
import * as THREE from 'three';

const TAU = Math.PI * 2;
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
function dotTexture(soft = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(soft, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32); g.rotate(0.6);
  g.beginPath(); g.moveTo(-26, 0); g.bezierCurveTo(-10, -16, 14, -14, 26, 0); g.bezierCurveTo(14, 14, -10, 16, -26, 0); g.fillStyle = '#ffffff'; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-24, 0); g.lineTo(24, 0); g.stroke();
  return new THREE.CanvasTexture(c);
}
// a quad whose corners spread in VIEW space (faces the camera: the same trick as the leaf tufts), with a per-instance fade
function billboardMaterial(opts, fadeAttr = true) {
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...opts });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + (fadeAttr ? 'attribute float aFade; varying float vFade;' : ''))
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( 0.0, 0.0, 0.0, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          float bbS = length( instanceMatrix[0].xyz );
        #else
          float bbS = 1.0;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        mvPosition.xy += position.xy * bbS;
        gl_Position = projectionMatrix * mvPosition;
        ${fadeAttr ? 'vFade = aFade;' : ''}`);
    if (fadeAttr) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vFade );');
  };
  m.customProgramCacheKey = () => 'ow-billboard' + (fadeAttr ? '-fade' : '');
  return m;
}

export function createAmbient(view, { T, trees = [], chimneys = [], quality = 'medium', sound = null }) {
  const low = quality === 'low';
  const scene = view.scene, parts = [];
  const wind = new THREE.Vector2(0.8, 0.6).normalize();
  let t = 0;

  // ---- motes: warm specks in a 36 m box round the camera (wrapped, so they never run out)
  const NM = low ? 90 : 260, BOX = 36;
  const mp = new Float32Array(NM * 3), seed = new Float32Array(NM);
  for (let i = 0; i < NM; i++) { mp[i * 3] = (hash(i, 1) - 0.5) * BOX; mp[i * 3 + 1] = hash(i, 2) * 9; mp[i * 3 + 2] = (hash(i, 3) - 0.5) * BOX; seed[i] = hash(i, 4) * TAU; }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: dotTexture(0.35), color: '#fff0c8', size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false }));
  motes.frustumCulled = false; motes.name = 'ambient motes'; scene.add(motes); parts.push(motes);
  const moteOrigin = new THREE.Vector3();

  // ---- falling leaves: from the broadleaf crowns within 35 m
  const NL = low ? 14 : 36;
  const leafMat = new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: false });
  const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.22), leafMat, NL);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); leafMesh.frustumCulled = false; leafMesh.name = 'ambient leaves';
  const LEAF_COLS = ['#7a9a3a', '#9aa83c', '#c9a23a', '#c9782e', '#8e5a2a'].map(c => new THREE.Color(c));
  const leaves = [];
  for (let i = 0; i < NL; i++) { leaves.push({ live: false, wait: hash(i, 9) * 6 }); leafMesh.setColorAt(i, LEAF_COLS[i % LEAF_COLS.length]); }
  scene.add(leafMesh); parts.push(leafMesh);
  const broad = trees.filter(tr => /oak|birch|willow|marsh|sapling/.test(tr.art) && !/spruce/.test(tr.art));

  // ---- chimney smoke: 9 puffs per chimney, the nearest 14 chimneys (a warm mid grey: light grey vanished against the sky)
  const PUFFS = 9, NC = Math.min(14, chimneys.length);
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, NC * PUFFS)), 1); fade.setUsage(THREE.DynamicDrawUsage);
  smokeGeo.setAttribute('aFade', fade);
  const smoke = NC ? new THREE.InstancedMesh(smokeGeo, billboardMaterial({ map: dotTexture(0.6), color: '#8c857e', opacity: 0.55 }), NC * PUFFS) : null;
  if (smoke) { smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage); smoke.frustumCulled = false; smoke.name = 'ambient smoke'; scene.add(smoke); parts.push(smoke); }
  let nearChim = [];

  // ---- birds: three flocks of seven, wheeling 30-45 m up within ~140 m
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.55, 0.1, -0.1, 0, 0, -0.15, 0, 0, 0.25, 0, 0, -0.15, 0.55, 0.1, -0.1], 3));
  birdGeo.computeVertexNormals();
  const NB = low ? 10 : 21;
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: '#2c2a2a', side: THREE.DoubleSide }), NB);
  birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage); birds.frustumCulled = false; birds.name = 'ambient birds';
  scene.add(birds); parts.push(birds);
  const flocks = [0, 1, 2].map(k => ({ cx: 0, cz: 0, set: false, r: 28 + k * 9, h: 30 + k * 6, sp: 0.18 + k * 0.05, ph: k * 2.1 }));

  // ---- butterflies: a dozen over meadows near you
  const NF = low ? 0 : 12;
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.09, 0, 0.05, -0.08, 0, -0.06, 0, 0, 0, 0.09, 0, 0.05, 0.08, 0, -0.06], 3));
  const flies = NF ? new THREE.InstancedMesh(flyGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), NF) : null;
  const FLY_COLS = ['#f2d24a', '#f2f0e8', '#e8903a', '#9ac0f0'].map(c => new THREE.Color(c));
  if (flies) { flies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flies.frustumCulled = false; flies.name = 'ambient butterflies'; for (let i = 0; i < NF; i++) flies.setColorAt(i, FLY_COLS[i % 4]); scene.add(flies); parts.push(flies); }
  const flyHome = Array.from({ length: NF }, () => ({ x: 0, z: 0, set: false }));

  // ---- sound: the bed for where you stand, re-chosen every 2 s
  let soundT = 0, bed = null;
  const bedFor = (x, z) => {
    const b = T.biomeAt(x, z);
    if (b === 'village' || b === 'road' && T.forestAt(x, z) === 0 && Object.values(T.places).some(p => p.kind === 'town' && Math.hypot(x - p.at[0], z - p.at[1]) < p.radius + 25)) return 'ambience.town';
    if (b === 'marsh' || b === 'water' || b === 'shore') return 'ambience.marsh';
    if (T.forestAt(x, z) > 0.3) return 'ambience.forest';
    return 'ambience.wind';
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const amb = {
    update(dt, at) {
      t += dt;
      const cam = view.camera.position;
      // motes: drift with the wind and bob; wrap into the box round the camera
      moteOrigin.set(Math.floor(cam.x / BOX) * BOX, 0, Math.floor(cam.z / BOX) * BOX);
      const gy = T.heightAt(cam.x, cam.z);
      for (let i = 0; i < NM; i++) {
        let x = mp[i * 3] + wind.x * dt * 0.6, z = mp[i * 3 + 2] + wind.y * dt * 0.6;
        let y = mp[i * 3 + 1] + Math.sin(t * 0.7 + seed[i]) * dt * 0.25;
        const lx = ((x - (cam.x - BOX / 2)) % BOX + BOX) % BOX + cam.x - BOX / 2, lz = ((z - (cam.z - BOX / 2)) % BOX + BOX) % BOX + cam.z - BOX / 2;
        if (lx !== x || lz !== z) y = gy + 0.3 + hash(i, t) * 8;
        if (y < gy || y > gy + 10) y = gy + 0.5 + hash(i, t * 1.3) * 8;
        mp[i * 3] = lx; mp[i * 3 + 1] = y; mp[i * 3 + 2] = lz;
      }
      moteGeo.attributes.position.needsUpdate = true;

      // leaves: wait, then let go from a crown near you; flutter down; rest a moment on the ground; go again
      for (let i = 0; i < NL; i++) {
        const L = leaves[i];
        if (!L.live) {
          L.wait -= dt;
          if (L.wait <= 0) {
            const near = broad.filter(tr => Math.abs(tr.x - at.x) < 35 && Math.abs(tr.z - at.z) < 35);
            if (near.length) {
              const tr = near[Math.floor(hash(i, t) * near.length)];
              const a = hash(i, t + 1) * TAU, d = (tr.crown || 4) * Math.sqrt(hash(i, t + 2)) * 0.8;
              Object.assign(L, { live: true, x: tr.x + Math.cos(a) * d, z: tr.z + Math.sin(a) * d, y: tr.y + (tr.h || 10) * (0.45 + hash(i, t + 3) * 0.2), ph: hash(i, t + 4) * TAU, rest: 0 });
            } else L.wait = 3;
          }
          if (!L.live) { leafMesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        }
        const ground = T.heightAt(L.x, L.z) + 0.02;
        if (L.y > ground) {
          L.y -= dt * (0.7 + 0.35 * Math.sin(t * 2.3 + L.ph));
          L.x += (wind.x * 0.8 + Math.sin(t * 1.7 + L.ph) * 0.6) * dt; L.z += (wind.y * 0.8 + Math.cos(t * 1.3 + L.ph) * 0.6) * dt;
          e.set(Math.sin(t * 3 + L.ph) * 1.2, t * 1.5 + L.ph, Math.cos(t * 2.4 + L.ph) * 1.1);
        } else { L.y = ground; L.rest += dt; e.set(-Math.PI / 2, L.ph, 0); if (L.rest > 4) { L.live = false; L.wait = 1 + hash(i, t) * 5; } }
        leafMesh.setMatrixAt(i, m4.compose(v.set(L.x, L.y, L.z), q.setFromEuler(e), s.set(1, 1, 1)));
      }
      leafMesh.instanceMatrix.needsUpdate = true;

      // smoke: the nearest chimneys (re-picked each second); each puff rises, grows, drifts and fades
      if (smoke) {
        if (Math.floor(t) !== Math.floor(t - dt) || !nearChim.length) nearChim = chimneys.map(c => ({ c, d: Math.hypot(c.x - at.x, c.z - at.z) })).sort((a, b) => a.d - b.d).slice(0, NC).map(o => o.c);
        for (let k = 0; k < NC; k++) {
          const c = nearChim[k];
          for (let j = 0; j < PUFFS; j++) {
            const i = k * PUFFS + j;
            if (!c) { smoke.setMatrixAt(i, m4.makeScale(0, 0, 0)); fade.array[i] = 0; continue; }
            const life = ((t * 0.16 + j / PUFFS + hash(k, 7)) % 1);
            const rise = life * 8, size = 0.8 + life * 3.2;
            v.set(c.x + wind.x * life * 4 + Math.sin(life * 6 + j) * 0.25, c.y + 0.2 + rise, c.z + wind.y * life * 4 + Math.cos(life * 5 + j) * 0.25);
            smoke.setMatrixAt(i, m4.compose(v, q.identity(), s.setScalar(size)));
            fade.array[i] = Math.min(1, life * 9) * Math.pow(1 - life, 1.3);   // there at once at the chimney top, thinning as it rises
          }
        }
        smoke.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
      }

      // birds: each flock circles a slowly wandering centre; wings beat (a scale on the wing span) and glide
      const per = Math.ceil(NB / flocks.length);
      for (let i = 0; i < NB; i++) {
        const f = flocks[Math.floor(i / per)], j = i % per;
        if (!f.set || Math.hypot(f.cx - at.x, f.cz - at.z) > 150) { f.cx = at.x + Math.cos(f.ph) * 70; f.cz = at.z + Math.sin(f.ph) * 70; f.set = true; }
        f.cx += Math.cos(t * 0.03 + f.ph) * dt * 1.2; f.cz += Math.sin(t * 0.027 + f.ph) * dt * 1.2;
        const a = t * f.sp + f.ph + j * 0.16, r = f.r + Math.sin(j * 1.7) * 4;
        v.set(f.cx + Math.cos(a) * r, T.heightAt(f.cx, f.cz) + f.h + Math.sin(j * 2.3 + t * 0.5) * 1.5, f.cz + Math.sin(a) * r);
        const flap = 0.25 + 0.75 * Math.abs(Math.sin(t * 7 + j * 1.3)) * (Math.sin(t * 0.9 + j) > -0.2 ? 1 : 0.15);
        e.set(0, -a, 0);
        birds.setMatrixAt(i, m4.compose(v, q.setFromEuler(e), s.set(1.4, 1.4 * flap, 1.4)));
      }
      birds.instanceMatrix.needsUpdate = true;

      // butterflies: home on a meadow spot near you, flutter round it in loops
      if (flies) {
        for (let i = 0; i < NF; i++) {
          const h = flyHome[i];
          if (!h.set || Math.hypot(h.x - at.x, h.z - at.z) > 30) {
            const a = hash(i, Math.floor(t / 9)) * TAU, d = 6 + hash(i + 3, Math.floor(t / 9)) * 16;
            h.x = at.x + Math.cos(a) * d; h.z = at.z + Math.sin(a) * d; h.set = T.biomeAt(h.x, h.z) === 'meadow' || T.biomeAt(h.x, h.z) === 'wildgrass';
            if (!h.set) { flies.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
          }
          const a = t * (1.1 + (i % 3) * 0.3) + i;
          v.set(h.x + Math.cos(a) * 1.4 + Math.sin(a * 2.3) * 0.5, T.heightAt(h.x, h.z) + 0.6 + Math.abs(Math.sin(a * 1.7)) * 0.7, h.z + Math.sin(a) * 1.4);
          e.set(0, -a, Math.sin(t * 22 + i) * 0.9);
          flies.setMatrixAt(i, m4.compose(v, q.setFromEuler(e), s.set(1, 1, 1)));
        }
        flies.instanceMatrix.needsUpdate = true;
      }

      // ambience bed
      soundT -= dt;
      if (sound && soundT <= 0) { soundT = 2; const want = bedFor(at.x, at.z); if (want !== bed) { bed = want; try { sound().ambience?.(want); } catch { /* no sound yet */ } } }
    },
    stats: { motes: NM, leaves: NL, smoke: NC * PUFFS, birds: NB, butterflies: NF, chimneys: chimneys.length },
    dispose() { for (const p of parts) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); } try { if (bed) sound?.()?.stopLoop?.(bed, 0.6); } catch { /* fine */ } },
  };
  return amb;
}
