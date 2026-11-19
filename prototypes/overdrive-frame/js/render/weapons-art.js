// How the round 7 weapons look and sound (sim/weapon-fx.js makes them happen). view.js calls three hooks and events.js
// one, so everything new lives here:
//   drawWeaponGround   zones on the ground (gravity wells, burning ground, nanite clouds, storm shadows, orbital
//                      reticles) and thrown bomblets — drawn under the units
//   drawWeaponOver     status looks on enemies (frost ring, ice block when frozen, void swirl), storm clouds above
//   drawShotFx         shots that are not tracers: seeker orbs, the saw disc, scythe waves, void needles, cryo spray…
//   weaponEventFx      muzzle flashes + sounds of the new kinds, beams, arcs, lightning, the orbital strike, freezes
// Pure canvas drawing through view.P (world → screen); sounds are Sound Lab ids (sfx/README.md), all existing ones.
import { TILE_W } from '../../../../citykit/js/iso.js';

export const ELEMENT_COLOURS = { cryo: '#bfefff', void: '#c38bff' };
const rxOf = (view, r) => r * TILE_W * 0.5 * view.zoom * Math.SQRT2;
const fadeOf = z => Math.min(1, z.t / 0.5, (z.life - z.t) / 0.25 + 0.2);

// ------------------------------------------------------------------------------------------------ ground
export function drawWeaponGround(ctx, view, S, t) {
  const Z = S.zones, B = S.bomblets;
  if (!Z?.length && !B?.length) return;
  ctx.save();
  for (const z of Z || []) {
    if (!view.visible(z.x, z.z, z.r + 1)) continue;
    const g = view.P(z.x, z.z, 0), rx = rxOf(view, z.r), ry = rx / 2, a = Math.max(0, fadeOf(z));
    if (z.kind === 'well') {
      const gr = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, rx);
      gr.addColorStop(0, `rgba(20,0,40,${(0.75 * a).toFixed(2)})`); gr.addColorStop(0.55, `rgba(90,30,160,${(0.35 * a).toFixed(2)})`); gr.addColorStop(1, 'rgba(120,60,220,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {                    // spiral arms turning inward
        ctx.strokeStyle = `rgba(195,139,255,${(0.55 * a).toFixed(2)})`; ctx.beginPath();
        for (let i = 0; i <= 16; i++) { const f = i / 16, ang = t * 2.6 + k * Math.PI / 2 + f * 3.2, rr = (1 - f) * 0.95; const x = g.sx + Math.cos(ang) * rx * rr, y = g.sy + Math.sin(ang) * ry * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(195,139,255,${(0.6 * a).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (z.kind === 'fire') {
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, rx);
      gr.addColorStop(0, `rgba(255,150,40,${(0.45 * a).toFixed(2)})`); gr.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 9; i++) {                    // flame tongues licking up, each on its own beat
        const h1 = Math.sin(i * 91.7) * 0.5 + 0.5, h2 = Math.sin(i * 37.3) * 0.5 + 0.5, k = (t * (1.4 + h1) + h2) % 1;
        const x = g.sx + (h1 - 0.5) * rx * 1.5, y = g.sy + (h2 - 0.5) * ry * 1.4 - k * 14 * view.zoom * 0.5, s = (1 - k) * 5 * view.zoom * 0.5 + 1;
        ctx.fillStyle = k < 0.4 ? `rgba(255,224,138,${(0.8 * a).toFixed(2)})` : `rgba(255,106,42,${(0.7 * a * (1 - k)).toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(x, y, s * 0.7, s, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (z.kind === 'nanite') {
      const gr = ctx.createRadialGradient(g.sx, g.sy - ry * 0.3, 0, g.sx, g.sy, rx);
      gr.addColorStop(0, `rgba(140,170,120,${(0.42 * a).toFixed(2)})`); gr.addColorStop(1, 'rgba(110,140,100,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g.sx, g.sy - ry * 0.3, rx, ry * 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(190,255,140,${(0.8 * a).toFixed(2)})`;
      for (let i = 0; i < 26; i++) {                   // the swarm: specks circling at different heights
        const ang = t * (0.8 + (i % 5) * 0.3) * (i % 2 ? 1 : -1) + i * 2.4, rr = 0.25 + ((i * 37) % 70) / 100;
        ctx.fillRect(g.sx + Math.cos(ang) * rx * rr, g.sy + Math.sin(ang) * ry * rr - ((i * 13) % 20) * view.zoom * 0.5, 2, 2);
      }
      ctx.setLineDash([5, 5]); ctx.strokeStyle = `rgba(170,230,130,${(0.45 * a).toFixed(2)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    } else if (z.kind === 'storm') {
      ctx.fillStyle = `rgba(20,16,40,${(0.22 * a).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();   // its shadow
      ctx.setLineDash([8, 6]); ctx.strokeStyle = `rgba(200,180,255,${(0.55 * a).toFixed(2)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    } else if (z.kind === 'orbital') {
      const k = Math.max(0, Math.min(1, 1 - z.t / Math.max(0.01, z.life)));          // 0 → 1 as the strike comes in
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(160,248,255,0.85)'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx * (1 - k * 0.85), ry * (1 - k * 0.85), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,248,255,0.7)'; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2 + t * 0.8; ctx.moveTo(g.sx + Math.cos(ang) * rx * 1.15, g.sy + Math.sin(ang) * ry * 1.15); ctx.lineTo(g.sx + Math.cos(ang) * rx * 0.7, g.sy + Math.sin(ang) * ry * 0.7); }
      ctx.stroke();
      const top = view.P(z.x, z.z, 6);                // the targeting thread from the sky, thickening as it comes
      ctx.strokeStyle = `rgba(190,250,255,${(0.15 + 0.5 * k).toFixed(2)})`; ctx.lineWidth = 1 + k * 3;
      ctx.beginPath(); ctx.moveTo(top.sx, top.sy); ctx.lineTo(g.sx, g.sy); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  for (const b of B || []) {                          // thrown bomblets: an arc from the blast, a blinking light
    const k = Math.max(0, Math.min(1, 1 - b.t / 0.45)), x = b.x0 + (b.x - b.x0) * Math.min(1, k * 1.6), z = b.z0 + (b.z - b.z0) * Math.min(1, k * 1.6);
    const y = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.35 + 0.04, q = view.P(x, z, y), s = 3 * view.zoom * 0.5 + 1;
    ctx.fillStyle = '#2a2c30'; ctx.beginPath(); ctx.arc(q.sx, q.sy, s, 0, Math.PI * 2); ctx.fill();
    if (Math.sin(t * 40 + x * 9) > 0) { ctx.fillStyle = '#ff4a2a'; ctx.beginPath(); ctx.arc(q.sx, q.sy - s * 0.4, s * 0.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ over the scene
const CHILL = 1, FROZEN = 2, RIFT = 4;
export function drawWeaponOver(ctx, view, S, lerp, t) {
  ctx.save();
  for (const e of S.enemies) {
    const L = e.look | 0; if (!(L & (CHILL | FROZEN | RIFT)) || e.dead || e.hidden) continue;
    const p = lerp(e); if (!view.visible(p.x, p.z, 1)) continue;
    const g = view.P(p.x, p.z, e.flying || 0), rx = rxOf(view, (e.r || 0.1) + 0.06);
    if (L & FROZEN) {                                 // a block of ice around the body
      const h = (e.r || 0.1) * 2.8, top = view.P(p.x, p.z, (e.flying || 0) + h), w = rx * 1.05;
      ctx.fillStyle = 'rgba(190,240,255,0.42)'; ctx.strokeStyle = 'rgba(235,252,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(g.sx - w, g.sy - (g.sy - top.sy) * 0.15); ctx.lineTo(g.sx - w * 0.7, top.sy + (g.sy - top.sy) * 0.1); ctx.lineTo(g.sx - w * 0.1, top.sy);
      ctx.lineTo(g.sx + w * 0.8, top.sy + (g.sy - top.sy) * 0.2); ctx.lineTo(g.sx + w, g.sy - (g.sy - top.sy) * 0.2); ctx.lineTo(g.sx + w * 0.3, g.sy + rx * 0.35); ctx.lineTo(g.sx - w * 0.5, g.sy + rx * 0.3); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.moveTo(g.sx - w * 0.5, top.sy + (g.sy - top.sy) * 0.3); ctx.lineTo(g.sx - w * 0.2, top.sy + (g.sy - top.sy) * 0.15); ctx.stroke();
    } else if (L & CHILL) {                           // frost at the feet, a few glints
      ctx.strokeStyle = 'rgba(190,240,255,0.75)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(230,250,255,0.9)';
      for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * 2.1 + p.x * 3; ctx.fillRect(g.sx + Math.cos(a) * rx * 0.8 - 1, g.sy - 6 - ((t * 20 + i * 7) % 14) * view.zoom * 0.5, 2, 2); }
    }
    if (L & RIFT) {                                   // a small void swirl under it
      ctx.strokeStyle = 'rgba(195,139,255,0.8)'; ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx * 1.2, rx * 0.6, 0, t * 6 + k * Math.PI, t * 6 + k * Math.PI + 2.2); ctx.stroke(); }
    }
  }
  if (view._lances?.size) {                          // the Sweep Lance's held beam: glow, body and a white core that shimmers
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [id, b] of view._lances) {
      if (S.time - b.at > 0.15 || S.time < b.at) { view._lances.delete(id); continue; }    // sim time: a slow frame never drops the beam
      const a = view.P(b.x, b.z, b.y), c = view.P(b.x2, b.z2, b.y), k = 1 + 0.18 * Math.sin(t * 70), zz = view.zoom * 0.5;
      for (const [col, w] of [['rgba(255,170,60,0.22)', 16], ['rgba(255,214,120,0.7)', 6], ['rgba(255,255,240,0.95)', 2]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * zz * k; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(c.sx, c.sy); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const z of S.zones || []) {                    // storm clouds hang over their area
    if (z.kind !== 'storm' || !view.visible(z.x, z.z, z.r + 1)) continue;
    const a = Math.max(0, fadeOf(z)), c = view.P(z.x, z.z, 1.0), rx = rxOf(view, z.r) * 0.9;
    for (let i = 0; i < 7; i++) {
      const ang = i / 7 * Math.PI * 2 + t * 0.3, x = c.sx + Math.cos(ang) * rx * 0.55, y = c.sy + Math.sin(ang) * rx * 0.18, s = rx * (0.38 + ((i * 7) % 5) * 0.04);
      ctx.fillStyle = `rgba(${48 + i * 4},${44 + i * 3},${70 + i * 5},${(0.8 * a).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (Math.sin(t * 23 + z.x) > 0.75) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(200,180,255,${(0.35 * a).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(c.sx, c.sy, rx * 0.6, rx * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ shots
/** A shot that is not a plain tracer. Returns true when drawn. ctx is already in 'lighter' (view._shots). */
export function drawShotFx(ctx, view, s, t) {
  const a = view.P(s.x, s.z, s.y ?? 0.4), z = view.zoom * 0.5;
  if (s.orb || s.kind === 'orb') {
    const r = 6 * z + 2, gr = ctx.createRadialGradient(a.sx, a.sy, 0, a.sx, a.sy, r * 2.2);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, 'rgba(170,220,255,0.8)'); gr.addColorStop(1, 'rgba(120,150,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(a.sx, a.sy, r * 2.2, 0, Math.PI * 2); ctx.fill();
    return true;
  }
  if (s.glaive || s.kind === 'glaive') {
    const r = 7 * z + 2, spin = t * 30;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#9aa3ad'; ctx.strokeStyle = '#e8edf2'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(a.sx, a.sy, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3a3f46'; ctx.beginPath();
    for (let i = 0; i < 4; i++) { const ang = spin + i * Math.PI / 2; ctx.moveTo(a.sx, a.sy); ctx.lineTo(a.sx + Math.cos(ang) * r, a.sy + Math.sin(ang) * r * 0.5); }
    ctx.stroke(); ctx.restore();
    const b = view.P(s.x - s.vx * 0.06, s.z - s.vz * 0.06, s.y ?? 0.35);
    ctx.strokeStyle = 'rgba(255,220,150,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    return true;
  }
  if (s.wave || s.kind === 'wave') {                  // a crescent across the direction of travel
    const sp = Math.hypot(s.vx, s.vz) || 1, ux = s.vx / sp, uz = s.vz / sp, w = 0.42;
    for (const [col, lw] of [['rgba(120,240,255,0.55)', 7], ['rgba(240,255,255,0.95)', 2.5]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const f = i / 10 - 0.5, bend = (0.25 - f * f) * 0.5; const q = view.P(s.x - uz * f * w * 2 + ux * bend, s.z + ux * f * w * 2 + uz * bend, 0.3); i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy); }
      ctx.stroke();
    }
    return true;
  }
  switch (s.look) {
    case 'rift-needler': {
      const b = view.P(s.x - s.vx * 0.06, s.z - s.vz * 0.06, s.y ?? 0.4);
      ctx.strokeStyle = 'rgba(195,139,255,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo((a.sx + b.sx) / 2, (a.sy + b.sy) / 2); ctx.stroke();
      return true;
    }
    case 'grav-anchor': {
      const r = 6 * z + 2;
      ctx.fillStyle = 'rgba(195,139,255,0.55)'; ctx.beginPath(); ctx.arc(a.sx, a.sy, r * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#12061f'; ctx.beginPath(); ctx.arc(a.sx, a.sy, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(230,200,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.sx, a.sy, r * 1.2, t * 8, t * 8 + 4); ctx.stroke();
      return true;
    }
    case 'cryo-projector': {
      const k = s.age / (s.life || 1);              // normal blending: thirty puffs at the nozzle must not add up to white
      ctx.save(); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = k < 0.3 ? 'rgba(205,240,255,0.3)' : `rgba(150,215,250,${(0.26 * (1 - k)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(a.sx, a.sy, (3 + k * 12) * z, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (k > 0.3 && k < 0.7) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(a.sx + Math.sin(s.x * 40) * 6 * z, a.sy + Math.cos(s.z * 40) * 4 * z, 1.5, 1.5); }   // a glint of ice in the mist
      return true;
    }
    case 'firepot': case 'nanite-sprayer': case 'cluster-mortar': {
      const col = s.look === 'firepot' ? '#ff8a3a' : s.look === 'nanite-sprayer' ? '#b6ff7a' : '#ffd27a', r = (s.look === 'cluster-mortar' ? 4.5 : 4) * z + 1.5;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a.sx, a.sy, r, 0, Math.PI * 2); ctx.fill();
      if (s.look === 'firepot') { ctx.fillStyle = 'rgba(255,220,120,0.8)'; ctx.beginPath(); ctx.arc(a.sx + Math.sin(t * 30) * 2, a.sy - r, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    case 'pinball': {
      ctx.fillStyle = '#e8edf2'; ctx.beginPath(); ctx.arc(a.sx, a.sy, 3 * z + 1.5, 0, Math.PI * 2); ctx.fill();
      const b = view.P(s.x - s.vx * 0.04, s.z - s.vz * 0.04, s.y ?? 0.4);
      ctx.strokeStyle = 'rgba(255,210,122,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      return true;
    }
    default: return false;
  }
}

// ------------------------------------------------------------------------------------------------ events
const FIRE_SOUND = {
  'sweep-lance': ['spell.arcane.travel', 0.18, 1.4], prism: ['spell.holy.launch', 0.4, 1.3], 'orbital-lance': ['hvf.bell', 0.35, 1.5],
  scythe: ['melee.swing', 0.6, 1.2], 'rift-needler': ['spell.shadow.launch', 0.22, 1.6], 'cluster-mortar': ['explosion.small', 0.35, 0.5],
  'grav-anchor': ['spell.shadow.launch', 0.6, 0.55], 'cryo-projector': ['spell.ice.launch', 0.18, 1.2], 'tesla-coil': ['spell.lightning.launch', 0.45, 1.1],
  'orb-launcher': ['magic.missile', 0.45, 0.8], 'storm-caller': ['thunder', 0.5, 0.6], 'nanite-sprayer': ['spell.poison.launch', 0.4, 1.1],
  firepot: ['fire.whoosh', 0.4, 0.8], glaive: ['melee.swing', 0.5, 1.7], pinball: ['tower.shot', 0.35, 1.7], sparkplug: ['tower.shot', 0.38, 1.05],
};
const FLASH = { 'sweep-lance': '#fff3c4', prism: '#f4fbff', 'orbital-lance': '#bff8ff', scythe: '#9ffcff', 'rift-needler': '#c38bff', 'grav-anchor': '#c38bff',
  'cryo-projector': '#bfefff', 'tesla-coil': '#a8d8ff', 'orb-launcher': '#c8e8ff', 'storm-caller': '#d8ccff', 'nanite-sprayer': '#b6ff7a', firepot: '#ff8a3a', sparkplug: '#c9b6ff' };

/** The round 7 events (and fire/line events of the new weapons). Returns true when handled. */
export function weaponEventFx(ev, S, fx, view, snd, localId) {
  const near = (x, z) => view.visible(x, z, 0.5);
  switch (ev.type) {
    case 'fire': {
      const look = ev.look; if (!look || !FIRE_SOUND[look]) return false;
      const col = FLASH[look] || '#ffd27a', mx = ev.x + Math.cos(ev.dir) * 0.08, mz = ev.z + Math.sin(ev.dir) * 0.08;
      const rapid = look === 'sweep-lance' || look === 'cryo-projector' || look === 'rift-needler';
      if (look === 'tesla-coil' || look === 'storm-caller' || look === 'orbital-lance') fx.light(ev.x, ev.z, 0.8, 0.12, col, 0.6);
      else if (!rapid || Math.random() < 0.2) { fx.light(mx, mz, look === 'grav-anchor' ? 1.2 : 0.6, 0.06, col, rapid ? 0.5 : 0.9); fx.spark(mx, mz, ev.y ?? 0.45, 2, { speed: [2, 4], life: [0.04, 0.09], color: col }); }
      if (ev.id === localId() && (look === 'grav-anchor' || look === 'cluster-mortar')) fx.shake(0.12);
      const s = FIRE_SOUND[look];
      if (!ev.echo || Math.random() < 0.5) snd(s[0], ev.x, ev.z, { gain: s[1] * (ev.echo ? 0.6 : 1), pitch: s[2] * (0.94 + Math.random() * 0.12) });
      return true;
    }
    case 'line': {
      if (ev.look === 'sweep-lance') {          // a held beam: drawn every frame while the events keep coming (drawWeaponOver)
        (view._lances ||= new Map()).set(ev.owner, { x: ev.x, z: ev.z, y: ev.y ?? 0.45, x2: ev.x2, z2: ev.z2, at: S.time });
        if (near(ev.x2, ev.z2) && Math.random() < 0.4) fx.spark(ev.x2, ev.z2, 0.3, 2, { speed: [2, 5], life: [0.1, 0.25], color: '#ffd27a' });
        if (Math.random() < 0.25) fx.light(ev.x2, ev.z2, 0.6, 0.1, '#ffd27a', 0.5);
        return true;
      }
      if (ev.look === 'prism') {
        fx.beam(ev.x, ev.z, ev.y ?? 0.45, ev.x2, ev.z2, ev.y ?? 0.4, { life: 0.28, color: 'rgba(200,246,255,0.85)', width: ev.y != null && ev.y < 0.35 ? 1.8 : 3.2 });
        fx.beam(ev.x, ev.z, ev.y ?? 0.45, ev.x2, ev.z2, ev.y ?? 0.4, { life: 0.28, color: '#ffffff', width: 1 });
        fx.spark(ev.x2, ev.z2, 0.3, 4, { speed: [2, 5], life: [0.15, 0.3], color: ['#ff9de2', '#9df7ff', '#fff69d'][Math.floor(Math.random() * 3)] });
        return true;
      }
      return false;
    }
    case 'tesla': {
      fx.ring(ev.x, ev.z, ev.r * 0.9, 0.18, 'rgba(160,220,255,0.55)', 2);
      ev.pts.forEach((p, i) => { fx.arc([[ev.x, ev.z], [(ev.x + p[0]) / 2 + (Math.random() - 0.5) * 0.3, (ev.z + p[1]) / 2 + (Math.random() - 0.5) * 0.3], p], { life: 0.2, color: '#a8d8ff' }); if (i < 2) fx.light(p[0], p[1], 0.5, 0.12, '#a8d8ff', 0.45); });
      if (ev.pts.length) snd('spell.lightning.impact', ev.x, ev.z, { gain: 0.35, pitch: 1.3 });
      return true;
    }
    case 'zap': {
      for (const p of ev.pts) fx.arc([[ev.x, ev.z], p], { life: 0.1, color: '#c8e8ff' });
      fx.light(ev.x, ev.z, 0.5, 0.1, '#c8e8ff', 0.4);
      snd('spell.lightning.travel', ev.x, ev.z, { gain: 0.18, pitch: 1.6 });
      return true;
    }
    case 'bolt': {
      fx.beam(ev.x + (Math.random() - 0.5) * 0.2, ev.z + (Math.random() - 0.5) * 0.2, 1.0, ev.x, ev.z, 0, { life: 0.12, color: 'rgba(210,190,255,0.85)', width: 2.5 });
      fx.beam(ev.x, ev.z, 1.0, ev.x, ev.z, 0, { life: 0.12, color: '#ffffff', width: 1 });
      fx.light(ev.x, ev.z, 1.1, 0.16, '#d8ccff', 0.7); fx.spark(ev.x, ev.z, 0.1, 6, { speed: [2, 5], life: [0.15, 0.35], color: '#e2d8ff', up: [1, 3] });
      view.scorch(ev.x, ev.z, 0.25);
      if (Math.random() < 0.6) snd('thunder', ev.x, ev.z, { gain: 0.3, pitch: 0.9 + Math.random() * 0.5 });
      return true;
    }
    case 'stormCall': fx.light(ev.x, ev.z, ev.r * 1.6, 0.5, '#9a88ff', 0.8); snd('quake.rumble', ev.x, ev.z, { gain: 0.35, pitch: 1.4 }); return true;
    case 'orbitalMark': fx.ring(ev.x, ev.z, ev.r * 1.3, 0.3, 'rgba(160,248,255,0.9)', 3); snd('hvf.bell', ev.x, ev.z, { gain: 0.35, pitch: 1.6 }); return true;
    case 'orbitalBeam': {
      fx.beam(ev.x, ev.z, 7, ev.x, ev.z, 0, { life: 0.45, color: 'rgba(160,248,255,0.8)', width: 9 });
      fx.beam(ev.x, ev.z, 7, ev.x, ev.z, 0, { life: 0.45, color: '#ffffff', width: 3.5 });
      fx.ring(ev.x, ev.z, ev.r * 2.2, 0.35, 'rgba(200,250,255,0.95)', 5); fx.light(ev.x, ev.z, ev.r * 4, 0.5, '#bff8ff', 1.6);
      if (near(ev.x, ev.z)) { fx.shake(0.35); fx.screenFlash?.(0.15); }
      snd('spell.holy.impact', ev.x, ev.z, { gain: 0.9, pitch: 0.7 });
      return true;
    }
    case 'well': fx.ring(ev.x, ev.z, ev.r * 1.6, 0.3, 'rgba(195,139,255,0.9)', 3); fx.light(ev.x, ev.z, ev.r * 1.5, 0.5, '#8a4cff', 1); snd('spell.shadow.impact', ev.x, ev.z, { gain: 0.6, pitch: 0.6 }); return true;
    case 'napalm': snd('fire.whoosh', ev.x, ev.z, { gain: 0.45, pitch: 0.7 }); fx.light(ev.x, ev.z, ev.r * 2, 0.6, '#ff7a2a', 1); return true;
    case 'nanite': fx.spark(ev.x, ev.z, 0.2, 10, { speed: [0.5, 2], life: [0.4, 0.8], color: '#b6ff7a', up: [0.5, 2] }); snd('spell.poison.impact', ev.x, ev.z, { gain: 0.5, pitch: 1.2 }); return true;
    case 'bomblets': fx.spark(ev.x, ev.z, 0.3, 8, { speed: [2, 4], life: [0.2, 0.4], color: '#ffd27a', up: [2, 4] }); snd('tower.shot', ev.x, ev.z, { gain: 0.35, pitch: 0.5 }); return true;
    case 'ricochet':
      if (near(ev.x, ev.z)) { fx.spark(ev.x, ev.z, 0.3, 4, { speed: [3, 6], life: [0.06, 0.14], color: '#fff2c8' }); fx.light(ev.x, ev.z, 0.4, 0.06, '#ffd27a', 0.8); }
      snd('melee.block', ev.x, ev.z, { gain: 0.15, pitch: 1.9 });
      return true;
    case 'freeze':
      if (near(ev.x, ev.z)) { fx.spark(ev.x, ev.z, 0.3, 10, { speed: [1.5, 3.5], life: [0.25, 0.5], color: '#e8fbff', up: [1, 3] }); fx.ring(ev.x, ev.z, 0.45, 0.2, 'rgba(200,245,255,0.95)', 2); }
      snd('ice.form', ev.x, ev.z, { gain: 0.45, pitch: 1 + Math.random() * 0.3 });
      return true;
    case 'leech': if (near(ev.x, ev.z)) fx.spark(ev.x, ev.z, 0.5, 4, { speed: [0.3, 1], life: [0.4, 0.7], color: '#7dff9e', up: [1, 2] }); return true;
    case 'overkill': if (near(ev.x, ev.z)) fx.light(ev.x, ev.z, 1, 0.2, ev.dtype === 'void' ? '#c38bff' : '#ffb35a', 1.1); return true;
    case 'catch': snd('ui.tab', ev.x, ev.z, { gain: 0.25, pitch: 0.7 }); return true;
    default: return false;
  }
}
