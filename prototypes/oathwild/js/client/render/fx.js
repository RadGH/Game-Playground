// Spell and combat visuals. When the Spell Kit (avatar-3d/spellkit) and its
// data (data/spell-visuals.json) are there, it draws every phase: hands lighting up while you aim (windup), the
// targeting indicator, missiles, impacts and lingering ground effects. Until then — or if it fails to load — this file
// draws the same phases simply: a draped indicator on the ground, glowing bolts, a burst and a ring.
// (Hook: everything goes through fx.*; swapping the simple layer for the kit is the `kit` branch in each call.)
//
//   const fx = await createFx(view, { heightAt, quality })
//   fx.indicator(shape, { at, dir, radius, length, width, angle, kind }) → { set(opts), stop() }
//   fx.windup(object3d, spellId, element) → { stop() }    fx.impact([x,y,z], spellId, element)
//   fx.ground([x,y,z], spellId, element, radius, seconds)  fx.bolts(list, dt) (server projectiles)  fx.update(dt)
import * as THREE from 'three';

export const ELEMENT_COLOUR = { physical: '#e8dcc0', fire: '#ff8a3a', ice: '#8fd8ff', lightning: '#b8b0ff', arcane: '#c58aff', shadow: '#8a5ab0', holy: '#ffe48a', nature: '#8fe07a', poison: '#a8e05a' };

export async function createFx(view, { heightAt, quality = 'medium', spells = null }) {
  const scene = view.scene;
  let kit = null;
  try {
    const [{ createSpellKit }, visuals] = await Promise.all([
      import('../../../../../avatar-3d/spellkit/js/spellkit.js'),
      fetch(new URL('../../../data/spell-visuals.json', import.meta.url)).then(r => (r.ok ? r.json() : null)),
    ]);
    if (visuals) {
      kit = await createSpellKit({ THREE, scene, camera: view.camera, renderer: view.renderer, visuals, heightAt, quality: quality === 'low' ? 'low' : 'high' });
      kit.warm?.();
    }
  } catch (e) { console.info('spell kit not used yet:', e.message); kit = null; }

  // ---------------------------------------------------------------- the simple layer
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 60, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.82, 'rgba(255,255,255,0.22)'); g.addColorStop(0.93, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const SEG = 20;
  function drapedGrid() {
    const n = SEG + 1, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = [];
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    return geo;
  }
  const KIND = { valid: '#8fdcff', friendly: '#9af0a0', hostile: '#ffb070', invalid: '#ff7a7a', neutral: '#ffe6a0' };
  function simpleIndicator(shape, opts) {
    const geo = drapedGrid();
    const mat = new THREE.MeshBasicMaterial({ map: shape === 'circle' ? ringTex : null, color: KIND.valid, transparent: true, opacity: shape === 'circle' ? 0.9 : 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6;
    scene.add(mesh);
    const st = { at: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, radius: 3, length: 8, width: 1.6, angle: Math.PI / 2, kind: 'valid' };
    const h = {
      set(o = {}) {
        if (o.at) st.at = { x: o.at.x ?? o.at[0], z: o.at.z ?? o.at[2] ?? o.at[1] };
        if (o.dir) { const l = Math.hypot(o.dir.x, o.dir.z) || 1; st.dir = { x: o.dir.x / l, z: o.dir.z / l }; }
        for (const k of ['radius', 'length', 'width', 'angle', 'kind']) if (o[k] != null) st[k] = o[k];
        mat.color.set(KIND[st.kind] || KIND.valid);
        const p = geo.attributes.position.array, u = geo.attributes.uv.array, n = SEG + 1;
        const rx = st.dir.z, rz = -st.dir.x;          // right of the aim
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const fu = i / SEG, fv = j / SEG, o = (j * n + i);
          let lx, ly;                                  // local metres: x right, y forward
          if (shape === 'circle') { lx = (fu * 2 - 1) * st.radius; ly = (fv * 2 - 1) * st.radius; }
          else if (shape === 'cone') { const a = (fu - 0.5) * st.angle, r = fv * st.length; lx = Math.sin(a) * r; ly = Math.cos(a) * r; }
          else { lx = (fu - 0.5) * st.width; ly = fv * st.length; }
          const x = st.at.x + rx * lx + st.dir.x * ly, z = st.at.z + rz * lx + st.dir.z * ly;
          p[o * 3] = x; p[o * 3 + 1] = heightAt(x, z) + 0.08; p[o * 3 + 2] = z;
          u[o * 2] = fu; u[o * 2 + 1] = fv;
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.computeBoundingSphere();
        return h;
      },
      stop() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
    };
    h.set(opts);
    return h;
  }

  // pooled glow sprites for bolts, bursts and rings (made once: no material churn mid-fight — rule 29)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const sprites = [];
  for (let i = 0; i < 64; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; scene.add(s); sprites.push({ s, busy: false, life: 0, max: 0, grow: 0, base: 1 }); }
  const take = () => sprites.find(p => !p.busy) || sprites.reduce((a, b) => (a.life < b.life ? a : b));
  function burst(at, colour, size = 1.6, life = 0.35) {
    const p = take(); p.busy = true; p.life = p.max = life; p.base = size * 0.4; p.grow = size;
    p.s.material.color.set(colour); p.s.position.set(at[0], at[1], at[2]); p.s.scale.setScalar(p.base); p.s.visible = true;
  }
  const rings = [];
  function groundRing(at, colour, radius, seconds) {
    const geo = new THREE.RingGeometry(radius * 0.92, radius, 40); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at[0], heightAt(at[0], at[2]) + 0.12, at[2]); m.renderOrder = 5; scene.add(m);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, color: colour, transparent: true, opacity: 0.28, depthWrite: false }));
    fill.position.copy(m.position); fill.position.y -= 0.02; scene.add(fill);
    const r = { m, fill, left: seconds, stop() { scene.remove(m); scene.remove(fill); m.geometry.dispose(); m.material.dispose(); fill.geometry.dispose(); fill.material.dispose(); } };
    rings.push(r);
    return r;
  }

  // server projectiles: one glowing sprite each, moved between snapshots along their direction
  const bolts = new Map();
  function syncBolts(list, elementOf) {
    const seen = new Set();
    for (const [id, x, z, dx, dz, speed, spell] of list || []) {
      seen.add(id);
      let b = bolts.get(id);
      if (!b) {
        const p = take(); p.busy = true; p.life = p.max = 99; p.grow = 0; p.base = spell ? 0.9 : 0.45;
        const col = ELEMENT_COLOUR[elementOf(spell)] || '#ffe6b0';
        p.s.material.color.set(col); p.s.scale.setScalar(p.base); p.s.visible = true;
        b = { p, x, z, dx, dz, speed, spell, col, kh: null };
        // the Spell Kit draws a spell's missile (scaled up a little: small bolts read small from over the shoulder)
        if (kit && spell) { try { b.kh = kit.missile([x, heightAt(x, z) + 1.3, z], null, spell, { dir: new THREE.Vector3(dx, 0, dz), range: 30, speed, scale: 1.4 }); b.kh?.catch?.(() => {}); p.s.visible = false; } catch { b.kh = null; } }
        bolts.set(id, b);
      }
      b.x = x; b.z = z; b.dx = dx; b.dz = dz; b.speed = speed;
    }
    for (const [id, b] of bolts) if (!seen.has(id)) { b.p.busy = false; b.p.s.visible = false; bolts.delete(id); }
  }

  const windups = new Set();
  return {
    kit,
    indicator(shape, opts) { if (kit) { try { return kit.indicator(shape, opts); } catch { /* fall back */ } } return simpleIndicator(shape, opts); },
    windup(obj, spell, element, hands = null) {
      if (kit) { try { const w = kit.windup(obj, spell, { hands }); return { stop: () => w.release() }; } catch { /* simple */ } }
      const p = take(); p.busy = true; p.life = p.max = 99; p.grow = 0; p.base = 0.7; p.s.material.color.set(ELEMENT_COLOUR[element] || '#ffe6b0'); p.s.visible = true;
      const w = { obj, p, stop() { p.busy = false; p.s.visible = false; windups.delete(w); } };
      windups.add(w);
      return w;
    },
    impact(at, spell, element, radius = 1.2) {
      if (kit && spell) { try { kit.impact(at, spell, { radius }); return; } catch { /* simple */ } }
      burst(at, ELEMENT_COLOUR[element] || '#fff1d0', 1.2 + radius * 0.6, 0.3);
    },
    ground(at, spell, element, radius, seconds) {
      if (kit && spell) { try { return kit.ground(at, spell, { radius, seconds }); } catch { /* simple */ } }
      return groundRing(at, ELEMENT_COLOUR[element] || '#ffe6a0', radius, seconds);
    },
    swing(at, colour = '#fff4dc') { burst(at, colour, 0.9, 0.18); },
    bolts: syncBolts,
    update(dt) {
      kit?.update(dt);
      for (const p of sprites) {
        if (!p.busy || p.max > 50) continue;
        p.life -= dt;
        const k = 1 - Math.max(0, p.life) / p.max;
        p.s.scale.setScalar(p.base + p.grow * k);
        p.s.material.opacity = 1 - k;
        if (p.life <= 0) { p.busy = false; p.s.visible = false; p.s.material.opacity = 1; }
      }
      for (const b of bolts.values()) { b.x += b.dx * b.speed * dt; b.z += b.dz * b.speed * dt; b.p.s.position.set(b.x, heightAt(b.x, b.z) + 1.3, b.z); if (b.kh) b.p.s.visible = false; }
      for (const w of windups) { w.obj.getWorldPosition(w.p.s.position); w.p.s.position.y += 1.25; w.p.s.scale.setScalar(0.55 + Math.sin(performance.now() / 90) * 0.12); }
      for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.left -= dt; r.m.material.opacity = 0.35 + 0.2 * Math.sin(performance.now() / 160); if (r.left <= 0) { r.stop(); rings.splice(i, 1); } }
    },
  };
}
