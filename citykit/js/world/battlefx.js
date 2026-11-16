// What every battle event looks and sounds like — built to prototypes/arcline/docs/research-boom-feel.md. Shared by
// the City Kit scene and the Arcline game so a mortar feels the same in both. The owner passes:
//   fx (Fx), pan(x, z) → -1..1, onScreen(x, z) → bool, deathSprite(creature) → sprite or null
// and wires the returned handlers into Defence (onFire/onImpact) and Horde (onKill/onWallBroken).
import * as snd from './sound.js';
import { KINDS } from './horde.js';

export function battleFx({ fx, pan = () => 0, onScreen = () => true, deathSprite = () => null }) {
  let blastKill = false;
  const h = {
    onFire(t, kind, d) {
      if (kind === 'pulse') { fx.light(d.x, d.z, 0.7, 0.06, '#7fe8ff', 0.8); fx.spark(d.x, d.z, d.y, 2, { speed: [1, 2], life: [0.05, 0.1], color: '#bff4ff' }); snd.play('tower.shot', { pan: pan(d.x, d.z), gain: 0.45, pitch: 1.1 + Math.random() * 0.2 }); }
      else if (kind === 'arc') { fx.arc(d.pts, { life: 0.14, color: '#b49bff' }); for (const p of d.pts.slice(1)) fx.light(p[0], p[1], 1.1, 0.18, '#a58bff', 1); snd.play('spell.lightning.impact', { pan: pan(t.x, t.z), gain: 0.55 }); }
      else if (kind === 'rail') { fx.beam(d.muzzle.x, d.muzzle.z, d.muzzle.y, d.end.x, d.end.z, d.end.y, { life: 0.16, color: '#9fe8ff', width: 4 }); fx.light(d.muzzle.x, d.muzzle.z, 1.2, 0.15, '#9fe8ff', 1); if (onScreen(t.x, t.z)) fx.shake(0.1); snd.play('thunder', { pan: pan(t.x, t.z), gain: 0.35, pitch: 1.6 }); }
      else if (kind === 'mortar') { fx.light(d.x, d.z, 1.0, 0.1, '#ffb35a', 0.9); fx.smoke(d.x, d.z, 6, { life: [0.6, 1.1], size: [5, 10], rise: 0.5, spread: 0.15, color: '#6a6a70' }); snd.play('explosion.small', { pan: pan(d.x, d.z), gain: 0.4, pitch: 0.62 + Math.random() * 0.08 }); }
    },
    onImpact(kind, d) {
      if (kind === 'pulse-hit') { fx.light(d.x, d.z, 0.5, 0.08, '#bff4ff', 1); fx.spark(d.x, d.z, 0.25, 7, { speed: [3, 6], life: [0.15, 0.3], color: '#d6f6ff' }); if (Math.random() < 0.5) fx.smoke(d.x, d.z, 1, { life: [0.4, 0.7], size: [3, 6], spread: 0.05 }); snd.play('spell.physical.impact', { pan: pan(d.x, d.z), gain: 0.3 }); }
      else if (kind === 'rail-hit') fx.spark(d.x, d.z, 0.3, 12, { speed: [4, 8], life: [0.2, 0.4], color: '#d6f6ff' });
      else if (kind === 'arc-hit') fx.spark(d.x, d.z, 0.3, 5, { speed: [2, 4], life: [0.1, 0.25], color: '#d2c4ff' });
      else if (kind === 'mortar') {
        const { x, z } = d;
        fx.light(x, z, 3, 0.3, '#ffb35a', 1.2); fx.ring(x, z, 2.2, 0.2); fx.decal(x, z, 1.2, 20);
        fx.spark(x, z, 0.2, 36, { speed: [4, 8], life: [0.25, 0.5], color: '#ffd27a', up: [1, 4] });
        fx.chunks(x, z, 16, { speed: [1.5, 3.5], up: [3, 5], hot: 0.5 });
        fx.embers(x, z, 12, { speed: [0.8, 2], up: [3, 5], life: [1.2, 1.8], g: 6 });
        fx.smoke(x, z, 10, { life: [1.5, 2.5], rise: 0.3 });
        if (onScreen(x, z)) fx.shake(0.22);
        snd.play('explosion.small', { pan: pan(x, z), gain: 0.8, pitch: 0.9 + Math.random() * 0.2 });
        snd.play('fragment.crash.small', { pan: pan(x, z), gain: 0.35, delay: 0.15 + Math.random() * 0.15 });
      }
    },
    onKill(c, from) {
      const k = KINDS[c.kind];
      const dx = c.x - (from?.[0] ?? c.x), dz = c.z - (from?.[1] ?? c.z), l = Math.hypot(dx, dz) || 1;
      const s = blastKill ? 2 + Math.random() * 3 : 0.5 + Math.random();
      fx.fling(c.x, c.z, dx / l * s / (k.mass ** 0.3), dz / l * s / (k.mass ** 0.3), blastKill ? 4 + Math.random() * 3 : 2 + Math.random(), deathSprite(c), { colors: k.colors });
      fx.burst(c.x, c.z, k.colors, 9 + Math.floor(Math.random() * 4));
      snd.play('death.beast', { pan: pan(c.x, c.z), gain: 0.35, pitch: c.kind === 'brute' ? 0.6 : c.kind === 'swarmer' ? 1.4 : 1 });
    },
    onWallBroken(x, z) {
      fx.chunks(x + 0.5, z + 0.5, 14, { speed: [1, 3], up: [2, 4], colors: ['#7a808a', '#5d636c'] });
      fx.smoke(x + 0.5, z + 0.5, 6, { color: '#6b6e74' });
      snd.play('stone.crumble', { pan: pan(x, z), gain: 0.6 });
    },
    /** The orbital strike's impact: the blast rule + the full boom. Returns { hit, killed }. */
    strike(horde, x, z, { radius = 4.5, damage = 520, apply = null } = {}) {
      // `apply` lets the owner run its own damage step (Arcline's ships.strikeImpact also hurts nests); kills inside
      // it still fly far because blastKill is set around it
      blastKill = true;
      const r = apply ? apply() : horde.blast(x, z, { radius, damage, core: radius * 0.6, edge: 0.2, push: 9, lift: 5, stun: 0.5 });
      blastKill = false;
      fx.screenFlash(0.8); fx.light(x, z, radius * 2.2, 0.8, '#ffd6a0', 1.5); fx.light(x, z, 3, 0.5, '#ffffff', 1.5);
      fx.ring(x, z, radius * 1.55, 0.35, 'rgba(255,245,220,0.95)', 5); fx.ring(x, z, radius * 1.1, 1, 'rgba(120,96,70,0.8)', 8);
      fx.decal(x, z, radius * 0.7, 40, 8);
      fx.spark(x, z, 0.3, 160, { speed: [8, 14], life: [0.3, 0.6], color: '#ffe0a0', up: [1, 5] });
      fx.chunks(x, z, 50, { speed: [2, 6], up: [6, 10], hot: 0.6, colors: ['#3a3f48', '#4b4440', '#2c2a2e'] });
      fx.embers(x, z, 50, { speed: [1, 3], up: [4, 7], life: [2, 3], g: 4 });
      fx.smoke(x, z, 32, { life: [3, 5], size: [16, 34], rise: 0.45, spread: radius * 0.35, color: '#3b3d44' });
      fx.shake(0.8); fx.roll = 1;
      const p = pan(x, z);
      snd.play('explosion.large', { pan: p, gain: 1.3, pitch: 0.85 + Math.random() * 0.1 });
      snd.play('quake.rumble', { pan: p, gain: 0.6 });
      snd.play('fragment.crash.large', { pan: p, gain: 0.5, delay: 0.25 });
      snd.play('stone.crumble', { pan: p, gain: 0.35, delay: 0.6 });
      navigator.vibrate?.(80);
      return r;
    },
    /** A landing pod touching down: dust ring, a puff, a soft thump. */
    podLand(x, z) { fx.ring(x, z, 1.2, 0.3, 'rgba(220,230,240,0.8)', 2); fx.smoke(x, z, 5, { life: [0.6, 1.1], size: [5, 10], rise: 0.2, spread: 0.3, color: '#8a8478' }); fx.light(x, z, 1.2, 0.2, '#9fe8ff', 0.9); snd.play('fragment.crash.small', { pan: pan(x, z), gain: 0.25 }); },
  };
  return h;
}
