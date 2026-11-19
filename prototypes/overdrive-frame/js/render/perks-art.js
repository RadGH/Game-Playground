// How round 7's skills, repair kit and frame rules look and sound (sim/perks.js). Everything is driven by EVENTS, so a
// co-op browser draws the same thing from the event stream without any extra snapshot fields:
//   repair kit     a green ring + rising sparks around the frame
//   Repulsor Pulse a cyan shockwave ring the size of its reach      Arc Nova  lightning from the frame to each target
//   Barrier Dome   a translucent cyan dome for its time              Gravity Well  a violet swirl that tightens, then bursts
//   Decoy Holo     a flickering hologram of the caster's frame      Cryo Burst  a frost ring, ice shards, pale mist
//   Orbital Lance  a gold target mark that closes in, then a beam from the sky (the strike's own blast follows)
//   Overdrive      an amber flare (the HUD counts it down)
//   frame rules    afterburner fire trail, phase dash shimmer, shock landing ring, thermal vent fire burst, reactive
//                  plate flash, static shell crackle
// Pure canvas drawing over the scene (view.draw calls drawPerks), like render/roles-art.js.
import { TILE_W } from '../../../../citykit/js/iso.js';

const rxOf = (view, r) => r * TILE_W * 0.5 * view.zoom * Math.SQRT2;    // a ground circle's screen half-width
const live = view => (view._perk ||= []);

/** One event → its look and sound. Returns true when it was one of ours. */
export function perkFx(ev, S, view, snd, localId) {
  const fx = view.fx, mine = ev.id === localId();
  switch (ev.type) {
    case 'kit':
      fx.ring(ev.x, ev.z, 0.7, 0.45, 'rgba(95,255,176,0.95)', 4); fx.light(ev.x, ev.z, 1.4, 0.5, '#5fffb0', 1.2);
      fx.spark(ev.x, ev.z, 0.2, 18, { speed: [0.5, 1.5], up: [3, 6], life: [0.5, 0.9], color: '#a8ffd6' });
      snd('heal', ev.x, ev.z, { gain: mine ? 0.8 : 0.4, pitch: 1.1 }); return true;
    case 'skill': return skillFx(ev, S, view, snd, mine);
    case 'skillEnd': return true;
    case 'wellBurst':
      fx.ring(ev.x, ev.z, ev.r * 2.2, 0.35, 'rgba(196,107,255,0.95)', 5); fx.light(ev.x, ev.z, ev.r * 3, 0.4, '#b46bff', 1.4);
      fx.spark(ev.x, ev.z, 0.3, 30, { speed: [3, 7], life: [0.2, 0.5], color: '#e0b8ff' }); fx.shake(0.2);
      snd('spell.arcane.impact', ev.x, ev.z, { gain: 0.9, pitch: 0.7 }); return true;
    case 'decoyBurst':
      fx.ring(ev.x, ev.z, ev.r * 2, 0.3, 'rgba(95,255,176,0.9)', 4); fx.light(ev.x, ev.z, ev.r * 2.5, 0.35, '#5fffb0', 1.2);
      fx.spark(ev.x, ev.z, 0.4, 24, { speed: [3, 6], life: [0.2, 0.45], color: '#bfffe0' });
      snd('spell.arcane.impact', ev.x, ev.z, { gain: 0.7, pitch: 1.2 }); return true;
    case 'afterburn': live(view).push({ k: 'trail', ...ev, age: 0 }); snd('fire.whoosh', ev.x, ev.z, { gain: 0.5, pitch: 0.7 }); return true;
    case 'phase': live(view).push({ k: 'phase', id: ev.id, t: ev.t, age: 0 }); snd('spell.arcane.launch', ev.x, ev.z, { gain: mine ? 0.4 : 0.2, pitch: 1.6 }); return true;
    case 'shockland':
      fx.ring(ev.x, ev.z, ev.r * 2, 0.3, 'rgba(180,160,255,0.95)', 5); fx.light(ev.x, ev.z, ev.r * 2.2, 0.3, '#a58bff', 1.3); fx.shake(0.25);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; fx.arc([[ev.x, ev.z], [ev.x + Math.cos(a) * ev.r * 0.8, ev.z + Math.sin(a) * ev.r * 0.8]], { life: 0.16, color: '#c8b8ff' }); }
      snd('spell.lightning.impact', ev.x, ev.z, { gain: 0.8 }); return true;
    case 'vent':
      fx.ring(ev.x, ev.z, ev.r * 2, 0.35, 'rgba(255,122,42,0.95)', 6); fx.light(ev.x, ev.z, ev.r * 2.6, 0.45, '#ff7a2a', 1.5);
      fx.embers(ev.x, ev.z, 26, { speed: [2, 5], up: [3, 6], life: [0.8, 1.4], g: 6 }); fx.smoke(ev.x, ev.z, 4, { life: [0.8, 1.4], rise: 0.5, size: [10, 18], color: '#9a9aa8' });
      snd('steam.hiss', ev.x, ev.z, { gain: 0.8 }); snd('explosion.small', ev.x, ev.z, { gain: 0.6, pitch: 0.7 }); return true;
    case 'reactive':
      fx.ring(ev.x, ev.z, 0.6, 0.2, 'rgba(255,210,90,0.95)', 4); fx.spark(ev.x, ev.z, 0.45, 10, { speed: [3, 6], life: [0.1, 0.25], color: '#ffe08a' });
      snd('melee.block', ev.x, ev.z, { gain: 0.8, pitch: 1.3 }); return true;
    case 'ram':
      fx.spark(ev.x, ev.z, 0.3, 12, { speed: [3, 6], life: [0.1, 0.25], color: '#ffd27a' }); fx.ring(ev.x, ev.z, 0.5, 0.15, 'rgba(255,210,120,0.9)', 3);
      if (mine) fx.shake(0.15); snd('melee.hit', ev.x, ev.z, { gain: 0.8, pitch: 0.55 }); return true;
    case 'static':
      if (view.visible(ev.x, ev.z, 1)) fx.arc([[ev.x - 0.25, ev.z], [ev.x + 0.25, ev.z + 0.1]], { life: 0.08, color: '#c8b8ff' });
      if (Math.random() < 0.3) snd('spell.lightning.travel', ev.x, ev.z, { gain: 0.15, pitch: 1.6 });
      return true;
  }
  return false;
}

function skillFx(ev, S, view, snd, mine) {
  const fx = view.fx;
  switch (ev.kind) {
    case 'repulse':
      fx.ring(ev.x, ev.z, ev.r * 2, 0.35, 'rgba(159,232,255,0.95)', 6); fx.ring(ev.x, ev.z, ev.r * 1.3, 0.25, 'rgba(220,250,255,0.8)', 3);
      fx.light(ev.x, ev.z, ev.r * 2, 0.35, '#9fe8ff', 1.3); fx.shake(mine ? 0.25 : 0.1); snd('spell.arcane.impact', ev.x, ev.z, { gain: 0.9, pitch: 1.1 }); break;
    case 'nova': {
      fx.light(ev.x, ev.z, ev.r, 0.35, '#c8a8ff', 1.4);
      for (const p of ev.pts || []) { fx.arc([[ev.x, ev.z], p], { life: 0.28, color: '#d8c8ff' }); fx.light(p[0], p[1], 0.8, 0.25, '#a58bff', 1); }
      snd('spell.lightning.impact', ev.x, ev.z, { gain: 1 }); snd('thunder', ev.x, ev.z, { gain: 0.4, pitch: 1.3, delay: 0.05 }); break;
    }
    case 'dome': live(view).push({ k: 'dome', x: ev.x, z: ev.z, r: ev.r, t: ev.t, age: 0 }); snd('spell.arcane.launch', ev.x, ev.z, { gain: 0.8, pitch: 0.6 }); break;
    case 'well': live(view).push({ k: 'well', x: ev.x, z: ev.z, r: ev.r, t: ev.t, age: 0 }); snd('spell.arcane.launch', ev.x, ev.z, { gain: 0.9, pitch: 0.45 }); break;
    case 'decoy': live(view).push({ k: 'decoy', id: ev.id, x: ev.x, z: ev.z, t: ev.t, age: 0 }); fx.light(ev.x, ev.z, 1.4, 0.4, '#5fffb0', 1); snd('ui.open', ev.x, ev.z, { gain: 0.6, pitch: 0.8 }); break;
    case 'cryo':
      fx.ring(ev.x, ev.z, ev.r * 2, 0.45, 'rgba(200,240,255,0.95)', 6); fx.light(ev.x, ev.z, ev.r * 2, 0.6, '#bfe9ff', 1.3);
      fx.chunks(ev.x, ev.z, 22, { speed: [2, 5], up: [2, 4], hot: 0, colors: ['#dff4ff', '#a8dcff', '#ffffff'], stay: [1.5, 3] });
      fx.smoke(ev.x, ev.z, 5, { life: [1, 1.8], rise: 0.1, size: [14, 24], spread: ev.r * 0.6, color: '#c8e6ff' });
      live(view).push({ k: 'frost', x: ev.x, z: ev.z, r: ev.r, t: ev.t, age: 0 });
      snd('spell.ice.impact', ev.x, ev.z, { gain: 0.9 }); break;
    case 'lance': live(view).push({ k: 'lance', x: ev.x, z: ev.z, r: ev.r, t: ev.t, age: 0, snd }); snd('hvf.bell', ev.x, ev.z, { gain: 0.5, pitch: 0.7 }); break;
    case 'overdrive': fx.light(ev.x, ev.z, 2.4, 0.6, '#ffb02e', 1.5); fx.spark(ev.x, ev.z, 0.5, 20, { speed: [2, 5], life: [0.2, 0.5], color: '#ffd27a' }); snd('spell.lightning.launch', ev.x, ev.z, { gain: 0.8 }); break;
  }
  return true;
}

/** Lasting looks (domes, wells, decoys, frost, lance marks, fire trails, phase shimmer), over the scene. */
export function drawPerks(ctx, view, S, lerp, t, dt) {
  const L = view._perk; if (!L?.length) return;
  ctx.save();
  for (const p of L) {
    p.age += dt; const left = Math.max(0, p.t - p.age), fade = Math.min(1, left / 0.4, p.age / 0.15);
    if (p.k === 'phase') { const m = S.byId.get(p.id); if (m) ring(ctx, view, lerp(m), 0.32, `rgba(200,240,255,${(0.7 * fade).toFixed(2)})`, 2, 0.35); continue; }
    if (p.k === 'decoy') { drawDecoy(ctx, view, S, p, t, fade); continue; }
    if (!view.visible(p.x, p.z, (p.r || 1) + 1)) continue;
    if (p.k === 'dome') dome(ctx, view, p, t, fade);
    else if (p.k === 'well') well(ctx, view, p, t, fade);
    else if (p.k === 'frost') ring(ctx, view, p, p.r, `rgba(200,240,255,${(0.35 * fade).toFixed(2)})`, 2, 0, true);
    else if (p.k === 'lance' && p.age >= p.t && !p.fired) { p.fired = true; view.fx.beam(p.x, p.z, 9, p.x, p.z, 0, { life: 0.5, color: '#ffe27a', width: 22 }); view.fx.screenFlash(0.25); p.snd('thunder', p.x, p.z, { gain: 1, pitch: 0.8 }); }
    else if (p.k === 'lance') { const k = Math.min(1, p.age / p.t); ring(ctx, view, p, p.r * (1.6 - 0.6 * k), `rgba(255,226,122,${(0.5 + 0.5 * k).toFixed(2)})`, 2 + 2 * k); cross(ctx, view, p, p.r * 0.5, `rgba(255,226,122,${(0.6 + 0.4 * Math.sin(t * 20)).toFixed(2)})`); }
    else if (p.k === 'trail') trail(ctx, view, p, t, fade);
  }
  view._perk = L.filter(p => p.age < p.t);
  ctx.restore();
}

function ring(ctx, view, p, r, color, width = 2, lift = 0, fill = false) {
  const g = view.P(p.x, p.z, lift), rx = rxOf(view, r);
  ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
}
function cross(ctx, view, p, r, color) {
  const g = view.P(p.x, p.z, 0), rx = rxOf(view, r);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.sx - rx, g.sy); ctx.lineTo(g.sx + rx, g.sy); ctx.moveTo(g.sx, g.sy - rx / 2); ctx.lineTo(g.sx, g.sy + rx / 2); ctx.stroke();
}
function dome(ctx, view, p, t, fade) {
  const g = view.P(p.x, p.z, 0), top = view.P(p.x, p.z, 1), rx = rxOf(view, p.r), ry = rx / 2, h = g.sy - top.sy, pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI); ctx.ellipse(g.sx, g.sy, rx, h + ry * 0.2, 0, Math.PI, Math.PI * 2); ctx.closePath();
  const grad = ctx.createRadialGradient(g.sx, g.sy - h * 0.35, rx * 0.1, g.sx, g.sy - h * 0.2, rx);
  grad.addColorStop(0, `rgba(63,240,255,${(0.04 * fade).toFixed(3)})`); grad.addColorStop(1, `rgba(63,240,255,${((0.16 + 0.06 * pulse) * fade).toFixed(3)})`);
  ctx.fillStyle = grad; ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(63,240,255,${((0.5 + 0.25 * pulse) * fade).toFixed(2)})`; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(g.sx, g.sy - h * i / 4.2, rx * Math.sqrt(1 - (i / 4.2) ** 2), ry * Math.sqrt(1 - (i / 4.2) ** 2), 0, Math.PI, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(63,240,255,${(0.22 * fade).toFixed(2)})`; ctx.stroke(); }
  ctx.restore();
}
function well(ctx, view, p, t, fade) {
  const g = view.P(p.x, p.z, 0.05), rx = rxOf(view, p.r);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const k = ((t * 0.9 + i / 4) % 1), r = rx * (1 - k);
    ctx.strokeStyle = `rgba(180,107,255,${((0.15 + 0.5 * k) * fade).toFixed(2)})`; ctx.lineWidth = 1.5 + 2 * k;
    ctx.beginPath(); ctx.ellipse(g.sx, g.sy, r, r / 2, 0, t * 3 + i, t * 3 + i + Math.PI * 1.4); ctx.stroke();
  }
  const core = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, rx * 0.35);
  core.addColorStop(0, `rgba(20,0,40,${(0.9 * fade).toFixed(2)})`); core.addColorStop(0.6, `rgba(120,60,220,${(0.5 * fade).toFixed(2)})`); core.addColorStop(1, 'rgba(120,60,220,0)');
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = core; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx * 0.35, rx * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function trail(ctx, view, p, t, fade) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i <= 8; i++) {
    const f = i / 8, x = p.x + p.dx * p.len * f, z = p.z + p.dz * p.len * f, g = view.P(x, z, 0), fl = 0.6 + 0.4 * Math.sin(t * 14 + i * 1.7);
    const r = rxOf(view, 0.22) * fl, grad = ctx.createRadialGradient(g.sx, g.sy - r * 0.4, 0, g.sx, g.sy - r * 0.4, r);
    grad.addColorStop(0, `rgba(255,220,120,${(0.8 * fade).toFixed(2)})`); grad.addColorStop(0.5, `rgba(255,110,30,${(0.5 * fade).toFixed(2)})`); grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(g.sx, g.sy - r * 0.4, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawDecoy(ctx, view, S, p, t, fade) {
  const owner = S.byId.get(p.id); if (!owner || !view.mechDrawer || !view.visible(p.x, p.z, 2)) return;
  const g = view.P(p.x, p.z, 0), flick = Math.sin(t * 40) > -0.6 ? 1 : 0.4;
  ctx.save(); ctx.globalAlpha = 0.55 * fade * flick; ctx.filter = 'hue-rotate(110deg) saturate(1.6) brightness(1.3)';
  view.mechDrawer(ctx, { ...owner, x: p.x, z: p.z, down: false }, g.sx, g.sy, view.zoom, 0, t, 0);
  ctx.restore();
  ring(ctx, view, p, 0.35, `rgba(95,255,176,${(0.6 * fade).toFixed(2)})`, 2);
}
