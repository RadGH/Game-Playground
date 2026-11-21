// Acts II/III effects (js/sim/big.js + brawl.js): warned strips across and along the street ('col' / 'row'), each zone
// look's landing (roots, teeth, claws, toll, fire of five kinds, molten bronze, shrieks, wisp bursts, quakes, arrow
// rain, Ossmara's sky fire), lasting hazard patches, things rising out of the ground or fading in, big bodies'
// parts slamming down, wing gusts, a boss calming, a partner enraged, and THE SHOWPIECE: Ossmara flying over and
// breathing a line of fire across the street. Made from fx.js's pooled primitives plus a few pools of its own, all
// made at load (rule 29: nothing compiles mid-fight).
//
//   const acts = createActsFx(fxKit);   acts.handle(ev, G, actors) → true when handled · acts.syncZones(G) ·
//   acts.update(dt, G) · acts.setFlyer(body | null) · acts.clear()
import * as THREE from 'three';
import { clamp01 } from './kit.js';

const DEPTH = 2.6;
/** Each zone look: warning tint, what its landing does, its colours, and how a lasting patch of it looks. */
export const ZONE_LOOKS = {
  roots: { warn: '#ff5a3a', land: 'spikes', color: '#5a3a2a', tip: '#9ad8ff', patch: '#3a2418' },
  teeth: { warn: '#ff4a3a', land: 'spikes', color: '#e8dcc0', tip: '#ffffff' },
  claw: { warn: '#ff3a2a', land: 'slam', color: '#8a7a6a', streak: '#ffffff' },
  handslam: { warn: '#ff4a2a', land: 'slam', color: '#6a5a48' },
  sweep: { warn: '#ff5a2a', land: 'slam', color: '#7a6a58' },
  quake: { warn: '#ff6a2a', land: 'slam', color: '#7a6450' },
  toll: { warn: '#ffc040', land: 'rings', color: '#ffd36a' },
  pulse: { warn: '#ff3a5a', land: 'rings', color: '#ff5a6a' },
  gaze: { warn: '#ff2a4a', land: 'rings', color: '#ff4a5a', pillar: true },
  shriek: { warn: '#c05aff', land: 'rings', color: '#c08aff', vertical: true },
  wispburst: { warn: '#5aff7a', land: 'rings', color: '#7aff9a' },
  fire: { warn: '#ff6a20', land: 'flames', color: '#ff7a20', core: '#ffe080', patch: '#5a1e08' },
  embers: { warn: '#ff7a30', land: 'flames', color: '#ff8a3a', core: '#ffd080', patch: '#3a1a0a' },
  greenfire: { warn: '#5aff6a', land: 'flames', color: '#3aff6a', core: '#e0ffc0', patch: '#0e3a16' },
  glassfire: { warn: '#7affa0', land: 'flames', color: '#5aff8a', core: '#e8ffe8', patch: '#12402a', glass: true },
  molten: { warn: '#ff9a30', land: 'flames', color: '#ff8a20', core: '#fff0a0', patch: '#7a3a10' },
  skyfire_gold: { warn: '#ffd040', land: 'flames', color: '#ffb030', core: '#fff4c0', big: true },
  skyfire_green: { warn: '#6aff6a', land: 'flames', color: '#3aff5a', core: '#e8ffd0', big: true },
  arrows: { warn: '#ff6a40', land: 'arrows', color: '#d8d0c0' },
};
const lookOf = l => ZONE_LOOKS[l] || null;

export function createActsFx({ root, pool, take, give, spawn, sparks, flash, ring, column, debris, text, after, low, flat, glow }) {
  // ---------------------------------------------------------------- pools of our own (made at load)
  const rectG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const frameG = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const spikeG = new THREE.ConeGeometry(0.16, 1, 6).translate(0, 0.5, 0);
  const flameG = new THREE.ConeGeometry(0.3, 1, 7).translate(0, 0.5, 0);
  const streakG = new THREE.PlaneGeometry(1, 0.05);
  pool('rect', flat(rectG, false), 24);
  pool('frame', () => new THREE.LineSegments(frameG, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })), 16);
  pool('spike', () => new THREE.Mesh(spikeG, new THREE.MeshToonMaterial({ color: 0xffffff })), low ? 40 : 90);
  pool('flame', () => new THREE.Mesh(flameG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), low ? 60 : 140);
  pool('puff', () => new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false })), low ? 30 : 70);
  pool('streak', flat(streakG), 40);

  // a zone's shape → points inside it (where its landing plays)
  function pointsIn(zn, step = 0.9) {
    const pts = [];
    if (zn.shape === 'col') for (let z = -DEPTH; z <= DEPTH + 1e-6; z += step) pts.push([zn.x + (Math.random() - 0.5) * zn.r * 1.6, z]);
    else if (zn.shape === 'row') for (let x = zn.x - (zn.len || 6) / 2; x <= zn.x + (zn.len || 6) / 2; x += step) pts.push([x, zn.z + (Math.random() - 0.5) * zn.r * 1.6]);
    else { const n = Math.max(4, Math.round(zn.r * zn.r * 2.4)); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * zn.r; pts.push([zn.x + Math.cos(a) * d, zn.z + Math.sin(a) * d / 1.2]); } }
    return pts;
  }
  /** Where to put a strip's plane: centre and size. */
  function rectOf(zn) {
    if (zn.shape === 'col') return { x: zn.x, z: 0, w: zn.r * 2, d: DEPTH * 2 + 0.4 };
    return { x: zn.x, z: zn.z, w: zn.len || 6, d: zn.r * 2 };
  }

  // ---------------------------------------------------------------- landings
  function flames(zn, L, big = false) {
    const pts = pointsIn(zn, big ? 0.55 : 0.8);
    flash(zn.x, 0.8, zn.z, L.core, big ? 6 : 2.5, 0.25);
    for (const [x, z] of pts) {
      const h = (big ? 2.6 : 1.4) * (0.7 + Math.random() * 0.6), dl = Math.random() * 0.15;
      after(dl, () => spawn('flame', 0.7 + Math.random() * 0.4, (o, k) => { o.scale.set(1 - k * 0.4, h * (k < 0.25 ? k * 4 : 1 - (k - 0.25) * 0.9), 1 - k * 0.4); o.material.opacity = 0.85 * (1 - k); }, o => { o.position.set(x, 0, z); o.material.color.set(Math.random() < 0.3 ? L.core : L.color); o.scale.set(1, 0.01, 1); o.rotation.y = Math.random() * 6; }));
      if (Math.random() < 0.5) sparks(x, 0.4, z, L.core, 2, { speed: 1.2, up: 5, grav: 2, life: 0.9, size: 0.16 });
    }
    if (L.glass) debris('rock', zn.x, 0.6, zn.z, low ? 3 : 6, '#7affa0', { speed: 5, up: 4 });
  }
  function spikes(zn, L) {
    const pts = pointsIn(zn, 0.7);
    for (const [x, z] of pts) {
      const h = 0.7 + Math.random() * 0.9, tilt = (Math.random() - 0.5) * 0.6, dl = Math.random() * 0.12;
      after(dl, () => spawn('spike', 0.9, (o, k) => { const u = k < 0.2 ? k / 0.2 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1; o.scale.set(1, Math.max(0.01, h * u), 1); }, o => { o.position.set(x, -0.05, z); o.material.color.set(L.color); o.rotation.set(tilt, Math.random() * 6, tilt * 0.6); o.scale.set(1, 0.01, 1); }));
    }
    debris('rock', zn.x, 0.2, zn.z, low ? 2 : 5, L.color, { speed: 4, up: 4 });
    if (L.tip) for (const [x, z] of pts.slice(0, 6)) sparks(x, 0.6, z, L.tip, 1, { speed: 0.6, up: 2, size: 0.18, life: 0.6 });
  }
  function slam(zn, L) {
    const pts = pointsIn(zn, 1.2);
    for (const [x, z] of pts) spawn('puff', 0.9, (o, k) => { o.scale.setScalar(0.9 + k * 1.8); o.material.opacity = 0.55 * (1 - k); o.position.y = 0.3 + k * 0.6; }, o => { o.position.set(x, 0.3, z); o.material.color.set(L.color); o.material.opacity = 0.55; });
    debris('rock', zn.x, 0.3, zn.z, low ? 3 : 7, L.color, { speed: 7, up: 6 });
    if (zn.shape !== 'circle') { const R = rectOf(zn); spawn('rect', 0.5, (o, k) => { o.material.opacity = 0.5 * (1 - k); }, o => { o.position.set(R.x, 0.05, R.z); o.scale.set(R.w, 1, R.d); o.material.color.set('#fff0d0'); o.material.opacity = 0.5; }); }
    else ring(zn.x, zn.z, zn.r * 1.2, '#f0e0c0', 0.5);
    if (L.streak) for (let i = -1; i <= 1; i++) spawn('arc', 0.35, (o, k) => { o.material.opacity = 1 - k; o.scale.setScalar(1.2 + k * 0.5); }, o => { o.position.set(zn.x + i * 0.35, 1.1, 0.4); o.rotation.set(0, 0, -0.9 + i * 0.12); o.material.color.set(L.streak); o.material.opacity = 1; o.scale.setScalar(1.2); });
  }
  function rings(zn, L) {
    for (let i = 0; i < 3; i++) after(i * 0.1, () => ring(zn.x, zn.z, (zn.shape === 'circle' ? zn.r : 2.4) * (1.1 + i * 0.25), L.color, 0.6, L.vertical ? { y: 1.2, vertical: true, face: 1 } : {}));
    flash(zn.x, 0.9, zn.z, L.color, 2.6, 0.25);
    if (L.pillar) column(zn.x, zn.z, Math.min(1.6, zn.r || 1), 8, L.color, 0.5);
  }
  function arrows(zn, L) {
    const pts = pointsIn(zn, 0.8).slice(0, low ? 8 : 16);
    for (const [x, z] of pts) {
      const dl = Math.random() * 0.25;
      after(dl, () => spawn('streak', 0.22, (o, k) => { o.position.set(x - 1.2 * (1 - k), 0.2 + 3.5 * (1 - k), z); o.material.opacity = 1; }, o => { o.material.color.set(L.color); o.rotation.set(0, 0, -1.2); o.scale.set(0.7, 1, 1); }));
      after(dl + 0.22, () => sparks(x, 0.1, z, '#e8dcc8', 2, { speed: 1.5, up: 1, size: 0.12, life: 0.3 }));
    }
  }
  function land(zn) {
    const L = lookOf(zn.look); if (!L) return false;
    if (L.land === 'flames') flames(zn, L, !!L.big);
    else if (L.land === 'spikes') spikes(zn, L);
    else if (L.land === 'slam') slam(zn, L);
    else if (L.land === 'rings') rings(zn, L);
    else if (L.land === 'arrows') arrows(zn, L);
    return true;
  }

  // ---------------------------------------------------------------- warnings for strips, lasting patches
  const warns = new Map(), patches = new Map();
  function syncZones(G) {
    const seenW = new Set(), seenP = new Set();
    for (const zn of G.zones) {
      const L = lookOf(zn.look);
      if (zn.kind === 'hazard') {
        seenP.add(zn.id);
        let p = patches.get(zn.id);
        const col = L?.patch || L?.color || '#5a2a10', R = zn.shape === 'circle' ? null : rectOf(zn);
        if (!p) { p = { o: take(R ? 'rect' : 'disc'), name: R ? 'rect' : 'disc', next: 0 }; p.o.material.color.set(col); patches.set(zn.id, p); }
        const life = zn.life || 4, fade = Math.min(1, zn.t * 4, (life - zn.t) * 2);
        if (R) { p.o.position.set(R.x, 0.04, R.z); p.o.scale.set(R.w, 1, R.d); } else { p.o.position.set(zn.x, 0.04, zn.z); p.o.scale.set(zn.r, 1, zn.r / 1.2); }
        p.o.material.opacity = 0.5 * Math.max(0, fade);
        p.next -= 1 / 60;
        if (p.next <= 0 && fade > 0.3) {
          p.next = low ? 0.22 : 0.1;
          const [x, z] = pointsIn(zn, 1.5)[0] || [zn.x, zn.z], c = L?.color || '#ff7a20';
          if (L?.land === 'flames') spawn('flame', 0.6, (o, k) => { o.scale.set(0.7, 0.9 * Math.sin(k * Math.PI), 0.7); o.material.opacity = 0.7 * (1 - k); }, o => { o.position.set(x, 0, z); o.material.color.set(Math.random() < 0.4 ? (L.core || c) : c); });
          else sparks(x, 0.15, z, c, 1, { speed: 0.4, up: 1.5, grav: 0, life: 0.8, size: 0.18 });
        }
        continue;
      }
      if (zn.kind !== 'aoe' || zn.shape === 'circle' || zn.shape == null || !(zn.delay > 0) || zn.t >= zn.delay) continue;
      seenW.add(zn.id);
      let w = warns.get(zn.id);
      const c = L?.warn || (zn.team === 0 ? '#ffd36a' : '#ff4a2a'), R = rectOf(zn);
      if (!w) { w = { base: take('rect'), fill: take('rect'), edge: take('frame') }; for (const o of [w.base, w.fill]) o.material.color.set(c); w.edge.material.color.set(c); warns.set(zn.id, w); }
      const k = clamp01(zn.t / zn.delay);
      w.base.position.set(R.x, 0.05, R.z); w.base.scale.set(R.w, 1, R.d); w.base.material.opacity = 0.16;
      // the fill grows from the strip's middle line out to its edges as the strike comes
      if (zn.shape === 'col') w.fill.scale.set(R.w * k, 1, R.d); else w.fill.scale.set(R.w, 1, R.d * k);
      w.fill.position.set(R.x, 0.06, R.z); w.fill.material.opacity = 0.2 + 0.3 * k;
      w.edge.position.set(R.x, 0.07, R.z); w.edge.scale.set(R.w, 1, R.d); w.edge.material.opacity = 0.7 + 0.3 * Math.sin(zn.t * 18);
    }
    for (const [id, w] of warns) if (!seenW.has(id)) { give('rect', w.base); give('rect', w.fill); give('frame', w.edge); warns.delete(id); }
    for (const [id, p] of patches) if (!seenP.has(id)) { give(p.name, p.o); patches.delete(id); }
  }

  // ---------------------------------------------------------------- Ossmara overhead
  let flyer = null;                                   // { obj, update(dt), play(name) } — built at chapter load (view.js)
  const passes = [];
  function skyPass(ev, G) {
    const gold = ev.fire !== 'green', L = ZONE_LOOKS[gold ? 'skyfire_gold' : 'skyfire_green'];
    const from = (Math.random() < 0.5 ? -1 : 1), x0 = G.camX - from * 22, x1 = G.camX + from * 22, dly = ev.delay || 1.2;
    passes.push({ t: 0, dly, x0, x1, z: ev.z, L, dir: from });
    // a roar and a shadow running ahead of her along the road
    spawn('disc', dly + 0.6, (o, k) => { const x = x0 + (x1 - x0) * Math.min(1, k * 1.05); o.position.set(x, 0.03, ev.z); o.scale.set(4.5, 1, 1.6); o.material.opacity = 0.32 * Math.sin(Math.PI * k); }, o => { o.material.color.set('#000000'); });
  }
  function updatePasses(dt) {
    if (flyer) flyer.obj.visible = passes.length > 0;
    for (let i = passes.length - 1; i >= 0; i--) {
      const P = passes[i]; P.t += dt;
      // she sweeps along just behind the street's back edge, above the rooftops' eaves and in front of the houses, dipping
      // as she breathes — her body and wings fill the top of the screen
      const total = P.dly + 1.5, k = Math.min(1, P.t / total);
      const x = P.x0 + (P.x1 - P.x0) * k, y = -0.2 - Math.sin(k * Math.PI) * 0.9, z = -5.2;     // (her feet; her back and wings reach ~8 m above)
      if (flyer) {
        // turned along her flight, nose dipped toward the street (pitch about her own side axis) so her head and the fire
        // are in the frame, dipping more as she breathes
        flyer.obj.rotation.set(0.22 + 0.16 * Math.sin(k * Math.PI), P.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 'YXZ'); flyer.obj.position.set(x, y + 1.2, z);
        flyer.update(dt);
      }
      // the breath: from her mouth down to the lane, from just before the warning ends until it has passed
      if (P.t > P.dly - 0.45 && P.t < P.dly + 0.6) {
        const mx = x + P.dir * 4.6, my = y + 3.4;
        for (let j = 0; j < (low ? 3 : 8); j++) {
          const u = Math.random(), sx = mx + (Math.random() - 0.5) * 1.4, tx = mx + P.dir * 2 + (Math.random() - 0.5) * 3;
          spawn('spark', 0.45, (o, kk) => { o.position.set(sx + (tx - sx) * kk, my + (0.3 - my) * kk, z + (P.z - z) * kk); o.scale.setScalar(0.8 + kk * 1.5); o.material.opacity = 0.85 * (1 - kk * kk); }, o => { o.material.color.set(u < 0.4 ? P.L.core : P.L.color); });
        }
      }
      if (P.t >= total) passes.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- events
  function handle(ev, G, actors) {
    switch (ev.type) {
      case 'zoneHit': return ev.look ? land(ev) : false;
      case 'rise': {
        if (ev.how === 'fade') {
          for (let i = 0; i < 10; i++) after(i * (ev.time || 1) / 12, () => sparks(ev.x + (Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 1.6, ev.z, '#7affa0', 2, { speed: 0.6, up: 1.4, grav: 0, life: 0.8, size: 0.22 }));
          ring(ev.x, ev.z, 1.1, '#7affa0', ev.time || 1, { opacity: 0.6 });
        } else {
          // the ground cracks and heaves: a dark crater, dust, and clods thrown up as it climbs out
          spawn('disc', (ev.time || 1) + 0.6, (o, k) => { o.scale.set(0.9, 1, 0.7); o.material.opacity = 0.5 * Math.min(1, k * 5) * (k > 0.85 ? (1 - k) / 0.15 : 1); }, o => { o.position.set(ev.x, 0.035, ev.z); o.material.color.set('#140e0a'); });
          for (let i = 0; i < 4; i++) after(i * (ev.time || 1) / 4, () => { debris('rock', ev.x, 0.15, ev.z, low ? 1 : 3, '#5a4a3a', { speed: 2.5, up: 4 }); spawn('puff', 0.8, (o, k) => { o.scale.setScalar(0.6 + k * 1.2); o.material.opacity = 0.45 * (1 - k); o.position.y = 0.2 + k * 0.5; }, o => { o.position.set(ev.x + (Math.random() - 0.5) * 0.6, 0.2, ev.z); o.material.color.set('#6a5a48'); }); });
        }
        return true;
      }
      case 'expose': {
        if (!ev.on) { const a = actors.get(ev.id); const p = a ? a.group.position : ev; spawn('puff', 0.8, (o, k) => { o.scale.setScalar(1 + k * 2.5); o.material.opacity = 0.4 * (1 - k); }, o => { o.position.set(p.x, 0.4, ev.z ?? p.z); o.material.color.set('#7a6a5a'); }); return true; }
        flash(ev.x, 0.6, ev.z, '#fff0c0', 4, 0.3);
        ring(ev.x, ev.z, 2.6, '#ffe08a', 0.6);
        debris('rock', ev.x, 0.3, ev.z, low ? 4 : 9, '#6a5a4a', { speed: 8, up: 7 });
        for (let i = 0; i < 6; i++) spawn('puff', 1, (o, k) => { o.scale.setScalar(1 + k * 2); o.material.opacity = 0.5 * (1 - k); }, o => { const a = i / 6 * Math.PI * 2; o.position.set(ev.x + Math.cos(a) * 1.4, 0.3, ev.z + Math.sin(a) * 0.8); o.material.color.set('#8a7a68'); });
        return true;
      }
      case 'sky': skyPass(ev, G); return true;
      case 'gust': {
        const dir = ev.dir || 1;
        for (let i = 0; i < (low ? 12 : 26); i++) {
          const y = 0.3 + Math.random() * 4, z = -DEPTH + Math.random() * DEPTH * 2.4, len = 1.5 + Math.random() * 3, sp = 18 + Math.random() * 10, x0 = G.camX - dir * (11 + Math.random() * 6);
          spawn('streak', ev.time || 0.9, (o, k, dt2) => { o.position.x += dir * sp * dt2; o.material.opacity = 0.5 * Math.sin(Math.PI * k); }, o => { o.position.set(x0, y, z); o.scale.set(len, 1, 1); o.material.color.set('#f0f4ff'); });
        }
        for (let i = 0; i < 8; i++) spawn('puff', 1, (o, k, dt2) => { o.position.x += dir * 9 * dt2; o.scale.setScalar(0.8 + k * 1.5); o.material.opacity = 0.3 * (1 - k); }, o => { o.position.set(G.camX - dir * 6 + i * dir * 1.6, 0.3, (Math.random() - 0.5) * 4); o.material.color.set('#a89a88'); });
        return true;
      }
      case 'calm': {
        const a = actors.get(ev.id); const p = a ? a.group.position : ev;
        for (let i = 0; i < 3; i++) after(i * 0.3, () => ring(p.x, p.z, 4 + i, '#ffe8b0', 1.2, { opacity: 0.8 }));
        sparks(p.x, 2, p.z, '#fff4d0', 24, { speed: 1.5, up: 2, grav: -0.3, life: 1.6, size: 0.25 });
        text(p.x, (a ? a.height : 3) + 0.6, p.z + 0.2, 'Calmed', '#fff0c0', 0.5, { word: true, life: 1.6, rise: 0.6, kind: 'word' });
        return true;
      }
      case 'enrage': {
        const a = actors.get(ev.id); if (!a) return true; const p = a.group.position;
        flash(p.x, p.y + 1.2, p.z, '#ff3a2a', 3, 0.3); ring(p.x, p.z, 2.2, '#ff4a3a', 0.6);
        sparks(p.x, p.y + 0.5, p.z, '#ff6a4a', 14, { speed: 1.5, up: 4, grav: -0.5, life: 1, size: 0.2 });
        text(p.x, p.y + a.height + 0.5, p.z + 0.2, 'Enraged!', '#ff7a5a', 0.45, { word: true, life: 1.2, rise: 0.6, kind: 'word' });
        return true;
      }
      case 'kill': {
        if (!ev.burst) return false;
        flash(ev.x, 0.9, ev.z, '#c8ffd0', 3.5, 0.25); ring(ev.x, ev.z, 2.4, '#7aff9a', 0.5); sparks(ev.x, 0.9, ev.z, '#7aff9a', 18, { speed: 5, up: 3, size: 0.2 });
        return false;                    // the usual kill effects still play
      }
      default: return false;
    }
  }

  return {
    handle, syncZones, ZONE_LOOKS,
    get flyer() { return flyer; }, get passes() { return passes.length; },
    update(dt) { updatePasses(dt); },
    /** The Ossmara body that flies over (view.js builds it with a chapter that has sky fire); null to drop it. */
    setFlyer(b) { if (flyer?.obj) flyer.obj.visible = false; flyer = b; if (b) { b.obj.visible = false; root.add(b.obj); } },
    clear() {
      for (const w of warns.values()) { give('rect', w.base); give('rect', w.fill); give('frame', w.edge); } warns.clear();
      for (const p of patches.values()) give(p.name, p.o); patches.clear();
      passes.length = 0; if (flyer) flyer.obj.visible = false;
    },
  };
}
