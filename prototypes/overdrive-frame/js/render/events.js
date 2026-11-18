// What every mission event looks and sounds like: muzzle flashes and gun kick, tracers, impacts, explosions with
// shockwaves and scorch, collapsing buildings, swarm deaths, damage numbers by crit tier. One place, so a mortar feels
// the same everywhere (Arcline's battlefx pattern; sounds from the shared Sound Lab).
import { play } from '../../../../citykit/js/world/sound.js';
import { SHOT_COLOURS } from './view.js';

export function makeEventFx(view, { localId = () => null, pan = () => 0, deathSprite = () => null } = {}) {
  const fx = view.fx;
  const near = (x, z) => view.visible(x, z, 0.5);
  const snd = (id, x, z, o = {}) => play(id, { pan: pan(x, z), x, z, ...o });

  return function handle(ev, S) {
    switch (ev.type) {
      case 'fire': {
        const col = SHOT_COLOURS[S.byId.get(ev.id)?.weapons?.[ev.slot]?.spec?.dtype] || '#ffd27a';
        const mx = ev.x + Math.cos(ev.dir) * 0.08, mz = ev.z + Math.sin(ev.dir) * 0.08;
        fx.light(mx, mz, ev.kind === 'rail' || ev.kind === 'plasma' ? 1.4 : 0.6, 0.06, col, 0.9);
        fx.spark(mx, mz, ev.y ?? 0.45, ev.kind === 'pellets' ? 6 : 2, { speed: [2, 4], life: [0.04, 0.09], color: col });
        if (ev.id === localId() && (ev.kind === 'rail' || ev.kind === 'plasma' || ev.kind === 'lob')) fx.shake(0.12);
        const s = { bullet: ['tower.shot', 0.35, 1.3], pellets: ['tower.shot', 0.55, 0.8], missile: ['spell.fire.launch', 0.4, 1.2], lob: ['explosion.small', 0.3, 0.55],
          rail: ['thunder', 0.4, 1.7], beam: ['spell.arcane.launch', 0.35, 1.3], chain: ['spell.lightning.impact', 0.45, 1], flame: ['fire.whoosh', 0.25, 1.2],
          plasma: ['spell.arcane.launch', 0.6, 0.6], blade: ['melee.swing', 0.6, 0.8], repair: ['heal', 0.25, 1], deploy: ['build.place', 0.5, 1] }[ev.kind];
        if (s && !ev.turret) snd(s[0], ev.x, ev.z, { gain: s[1], pitch: s[2] * (0.94 + Math.random() * 0.12) });
        break;
      }
      case 'eshot': {
        const e = S.byId.get(ev.id); if (!e || !near(ev.x, ev.z)) break;
        fx.light(ev.x, ev.z, 0.4, 0.05, S.kinds[e.kind].faction === 'swarm' ? '#9cff6a' : '#ffb35a', 0.7);
        snd(ev.missile ? 'spell.fire.launch' : S.kinds[e.kind].faction === 'swarm' ? 'spell.poison.launch' : 'tower.shot', ev.x, ev.z, { gain: 0.22, pitch: 0.8 });
        break;
      }
      case 'hit': {
        const big = ev.amount > 300;
        if (near(ev.x, ev.z)) {
          fx.spark(ev.x, ev.z, ev.y ?? 0.2, big ? 8 : 3, { speed: [2, 5], life: [0.08, 0.2], color: SHOT_COLOURS[ev.dtype] || '#ffd27a' });
          if (ev.by === localId() || !ev.by) view.number(ev.x, ev.z, ev.y ?? 0.2, ev.amount, ev.tier);
        }
        const e = S.byId.get(ev.id); if (e) e.lastHit = S.time;
        break;
      }
      case 'kill': {
        if (!near(ev.x, ev.z)) break;
        const K = S.kinds[ev.kind] || {};
        const swarm = K.faction === 'swarm';
        // the body: its own death picture thrown away from the hit, spinning, then lying where it lands
        const body = K.boss || K.job === 'ace' ? null : deathSprite(ev.kind, ev);   // a boss lies where she fell; an ace's wreck stays drawn
        if (body) { const a = Math.random() * Math.PI * 2, sp = ev.big ? 0.6 : 1.4 + Math.random(); fx.fling(ev.x, ev.z, Math.cos(a) * sp, Math.sin(a) * sp, ev.big ? 1.5 : 2.5 + Math.random() * 2, body, { colors: swarm ? ['#3a2a22', '#7a3a2a'] : ['#3a3f48', '#55505a'] }); }
        fx.burst?.(ev.x, ev.z, swarm ? ['#3a2a22', '#7a3a2a', '#9cff6a'] : ['#3a3f48', '#55505a', '#ffb35a'], ev.big ? 16 : 7);
        fx.chunks(ev.x, ev.z, ev.big ? 14 : 4, { speed: [1.5, 3.5], up: [2, 4], hot: swarm ? 0 : 0.5, colors: swarm ? ['#3a2a22', '#5a3a2a'] : ['#3a3f48', '#55505a'], stay: [6, 12] });
        if (swarm) fx.spark(ev.x, ev.z, 0.15, ev.big ? 14 : 5, { speed: [1, 3], life: [0.2, 0.5], color: '#9cff6a', up: [1, 3] });
        if (ev.big || !swarm) { fx.light(ev.x, ev.z, ev.big ? 2.2 : 1, 0.25, '#ffb35a', 1.1); if (ev.big) fx.smoke(ev.x, ev.z, 2, { life: [0.8, 1.4], rise: 0.3, size: [8, 14] }); if (ev.big) { fx.ring(ev.x, ev.z, 1.6, 0.25); fx.shake(0.15); view.scorch(ev.x, ev.z, 0.7); } }
        snd(swarm ? 'death.beast' : 'death.construct', ev.x, ev.z, { gain: ev.big ? 0.7 : 0.3, pitch: ev.big ? 0.6 : 1.2 + Math.random() * 0.3 });
        if (ev.big && !swarm) snd('explosion.small', ev.x, ev.z, { gain: 0.6 });
        break;
      }
      case 'boom': {
        const r = ev.r || 0.5;
        fx.light(ev.x, ev.z, r * 3.2, 0.32, ev.dtype === 'fire' ? '#ff7a2a' : '#ffb35a', 1.25);
        fx.ring(ev.x, ev.z, r * 2.4, 0.22);
        fx.spark(ev.x, ev.z, 0.2, Math.round(16 + r * 30), { speed: [3, 7], life: [0.25, 0.5], color: '#ffd27a', up: [1, 4] });
        fx.chunks(ev.x, ev.z, Math.round(6 + r * 10), { speed: [1.5, 3.5], up: [3, 5], hot: 0.5 });
        fx.embers(ev.x, ev.z, Math.round(4 + r * 8), { speed: [0.8, 2], up: [3, 5], life: [1.2, 1.8], g: 6 });
        fx.smoke(ev.x, ev.z, Math.round(1 + r * 2), { life: [0.9, 1.6], rise: 0.3, size: [8, 16] });
        view.scorch(ev.x, ev.z, r * 1.3);
        if (near(ev.x, ev.z)) fx.shake(Math.min(0.45, 0.08 + r * 0.25));
        snd(r > 0.9 ? 'explosion.large' : 'explosion.small', ev.x, ev.z, { gain: Math.min(1, 0.4 + r * 0.5), pitch: 0.85 + Math.random() * 0.25 });
        break;
      }
      case 'line': {
        const col = SHOT_COLOURS[ev.dtype] || '#9fe8ff';
        fx.beam(ev.x, ev.z, ev.y ?? 0.45, ev.x2, ev.z2, ev.y ?? 0.4, { life: 0.16, color: col, width: 4 });
        fx.spark(ev.x2, ev.z2, 0.3, 8, { speed: [3, 7], life: [0.15, 0.35], color: col });
        break;
      }
      case 'chain': fx.arc(ev.pts, { life: 0.14, color: '#b49bff' }); for (const p of ev.pts.slice(1)) fx.light(p[0], p[1], 0.9, 0.16, '#a58bff', 1); break;
      case 'slash': fx.ring(ev.x + Math.cos(ev.dir) * 0.3, ev.z + Math.sin(ev.dir) * 0.3, ev.range, 0.12, 'rgba(160,230,255,0.9)', 4); if (ev.n) snd('melee.hit', ev.x, ev.z, { gain: 0.6, pitch: 0.7 }); break;
      case 'spark': if (near(ev.x, ev.z)) fx.spark(ev.x, ev.z, ev.y ?? 0.3, 3, { speed: [2, 4], life: [0.08, 0.18], color: SHOT_COLOURS[ev.dtype] || '#ffd27a' }); break;
      case 'wreck': {
        const l = S.world.lots.find(x => x.id === ev.lot); if (!l) break;
        const cx = l.x + l.w / 2, cz = l.z + l.d / 2;
        fx.chunks(cx, cz, 8 + ev.stage * 4, { speed: [1, 3], up: [2, 5], hot: ev.stage >= 2 ? 0.5 : 0.1, stay: [20, 40] });
        fx.smoke(cx, cz, ev.stage, { life: [1.2, 2], rise: 0.4, size: [10, 18] });
        snd(ev.stage >= 2 ? 'fragment.crash.medium' : 'stone.crumble', cx, cz, { gain: 0.5 });
        break;
      }
      case 'collapse': {
        const r = Math.max(ev.w, ev.d) * 0.6;
        fx.chunks(ev.x, ev.z, 30, { speed: [1.5, 4], up: [3, 6], hot: 0.4, stay: [30, 60] });
        fx.smoke(ev.x, ev.z, 6, { life: [1.6, 2.6], rise: 0.5, size: [16, 28], spread: r });
        fx.ring(ev.x, ev.z, r * 2.2, 0.4, 'rgba(200,190,170,0.9)', 5);
        view.scorch(ev.x, ev.z, r);
        if (near(ev.x, ev.z)) fx.shake(0.4 + Math.min(0.4, ev.h * 0.08));
        snd('fragment.crash.large', ev.x, ev.z, { gain: 0.9 }); snd('quake.rumble', ev.x, ev.z, { gain: 0.6, delay: 0.1 });
        break;
      }
      case 'phit': if (ev.id === localId()) { fx.shake(Math.min(0.3, 0.05 + ev.amount / 800)); view.hurt = Math.min(1, (view.hurt || 0) + ev.amount / 600); } break;
      case 'qb': fx.smoke(ev.x, ev.z, 3, { life: [0.3, 0.6], size: [6, 10], spread: 0.1, rise: 0.05, color: '#9fb4d8' }); fx.light(ev.x, ev.z, 0.8, 0.12, '#9fe8ff', 0.8); snd('fire.whoosh', ev.x, ev.z, { gain: 0.5, pitch: 1.5 }); break;
      case 'jump': fx.smoke(ev.x, ev.z, 4, { life: [0.4, 0.8], size: [8, 14], spread: 0.15, rise: 0.05, color: '#8a90a0' }); snd('fire.whoosh', ev.x, ev.z, { gain: 0.4, pitch: 0.8 }); break;
      case 'land': fx.smoke(ev.x, ev.z, ev.hard ? 4 : 1, { life: [0.4, 0.9], size: [8, 16], spread: 0.25, rise: 0.02, color: '#6a6e78' }); if (ev.hard) { fx.shake(0.18); fx.ring(ev.x, ev.z, 0.9, 0.2, 'rgba(200,200,210,0.7)', 3); } snd('travel.step', ev.x, ev.z, { gain: ev.hard ? 0.9 : 0.5, pitch: 0.45 }); break;
      case 'overheat': if (ev.id === localId()) snd('steam.hiss', 0, 0, { global: true, gain: 0.7 }); break;
      case 'stall': break;
      case 'pickup': if (ev.owner === S.localPid) snd(ev.part ? 'loot.rare' : 'coin', 0, 0, { global: true, gain: ev.part ? 0.7 : 0.25, pitch: ev.mat === 'exotic' ? 1.4 : ev.mat === 'alloy' ? 1.15 : 1 }); break;
      case 'objective': snd('quest.complete', 0, 0, { global: true, gain: 0.6 }); break;
      case 'objectiveFailed': snd('ui.error', 0, 0, { global: true, gain: 0.5 }); break;
      case 'down': fx.light(ev.x, ev.z, 2, 0.4, '#ff5a3a', 1.2); fx.smoke(ev.x, ev.z, 4, { life: [1.5, 2.2], rise: 0.4 }); snd('hvf.down', ev.x, ev.z, { gain: 0.8 }); break;
      case 'revive': snd('hvf.revive', 0, 0, { global: true, gain: 0.7 }); break;
      case 'ping': view.ping(ev); snd('hvf.bell', 0, 0, { global: true, gain: 0.35, pitch: ev.kind === 'enemy' ? 0.85 : 1.2 }); break;
      case 'joined': fx.light(ev.x, ev.z, 1.6, 0.5, '#3ff0ff', 1); snd('ui.open', 0, 0, { global: true, gain: 0.5 }); break;
      case 'leap': snd('beast.growl', ev.x, ev.z, { gain: 0.3, pitch: 1.4 }); break;
      case 'charge': snd('beast.growl', ev.x, ev.z, { gain: 0.6, pitch: 0.6 }); break;
      case 'fuse': fx.light(ev.x, ev.z, ev.r * 2, 0.8, '#ff7a2a', 0.8); snd('lava.bubble', ev.x, ev.z, { gain: 0.6 }); break;
      case 'emerge': fx.chunks(ev.x, ev.z, 10, { speed: [1, 2.5], up: [2, 4], hot: 0, colors: ['#4a3a2a', '#5a4a38'], stay: [8, 14] }); snd('stone.crumble', ev.x, ev.z, { gain: 0.6 }); break;
      case 'missileWarn': if (ev.target === localId()) snd('hvf.bell', 0, 0, { global: true, gain: 0.45, pitch: 1.6 }); break;
      case 'aimline': if (ev.target === localId()) snd('hvf.bell', 0, 0, { global: true, gain: 0.35, pitch: 2 }); break;
      case 'lock': if (ev.id === localId()) snd('ui.hover', 0, 0, { global: true, gain: 0.25, pitch: 1.6 }); break;
      case 'stick': if (ev.id === localId()) snd('ui.tab', 0, 0, { global: true, gain: 0.4 }); break;
      case 'block': if (ev.id === localId()) snd('melee.block', 0, 0, { global: true, gain: 0.35 }); break;
      // the boss (sim/boss.js) and the rival ace (sim/ace.js)
      case 'boss': snd('quake.rumble', ev.x, ev.z, { gain: 0.8 }); fx.shake(0.25); fx.chunks(ev.x, ev.z, 18, { speed: [1, 3], up: [2, 5], hot: 0, colors: ['#4a3a2a', '#5a4a38'], stay: [20, 40] }); break;
      case 'bossWind': snd('beast.growl', ev.x, ev.z, { gain: 0.7, pitch: ev.kind === 'charge' ? 0.45 : 0.6 }); break;
      case 'bossStrike':
        if (ev.kind === 'claw') { fx.ring(ev.x, ev.z, ev.r * 1.4, 0.18, 'rgba(255,120,90,0.9)', 5); snd('melee.swing', ev.x, ev.z, { gain: 0.9, pitch: 0.5 }); }
        else if (ev.kind === 'charge') { fx.shake(0.3); snd('quake.rumble', ev.x, ev.z, { gain: 0.8 }); }
        else snd('spell.poison.launch', ev.x, ev.z, { gain: 0.8, pitch: 0.6 });
        break;
      case 'bossSac': fx.spark(ev.x, ev.z, 0.4, 8, { speed: [1, 2.5], life: [0.3, 0.6], color: '#a8ff2e', up: [1, 3] }); fx.light(ev.x, ev.z, 0.8, 0.3, '#a8ff2e', 0.9); break;
      case 'bossPart':
        fx.light(ev.x, ev.z, 2.4, 0.4, '#a8ff2e', 1.3); fx.ring(ev.x, ev.z, 1.6, 0.3, 'rgba(168,255,46,0.9)', 5);
        fx.spark(ev.x, ev.z, 0.5, 30, { speed: [2, 6], life: [0.3, 0.7], color: '#a8ff2e', up: [2, 5] });
        fx.chunks(ev.x, ev.z, 18, { speed: [1.5, 4], up: [3, 6], hot: 0, colors: ['#3a2f4e', '#5c4b78', '#ddd2b6'], stay: [20, 40] });
        fx.shake(0.3); view.scorch(ev.x, ev.z, 0.6);
        snd('death.beast', ev.x, ev.z, { gain: 0.9, pitch: 0.55 }); snd('fragment.crash.medium', ev.x, ev.z, { gain: 0.6 });
        break;
      case 'bossOpen': fx.light(ev.x, ev.z, 1.6, 0.6, '#ffcf4a', 1.2); snd('hvf.bell', ev.x, ev.z, { gain: 0.5, pitch: 0.8 }); break;
      case 'bossPhase': fx.shake(0.35); snd('beast.growl', ev.x, ev.z, { gain: 1, pitch: 0.4 }); snd('quake.rumble', ev.x, ev.z, { gain: 0.6, delay: 0.2 }); break;
      case 'bossDown': fx.shake(0.6); fx.light(ev.x, ev.z, 4, 0.8, '#a8ff2e', 1.4); fx.smoke(ev.x, ev.z, 6, { life: [1.6, 2.6], rise: 0.4, size: [16, 26], spread: 0.8 }); view.scorch(ev.x, ev.z, 1.6); snd('death.beast', ev.x, ev.z, { gain: 1, pitch: 0.35 }); break;
      case 'aceIn': snd('fire.whoosh', ev.x, ev.z, { gain: 0.6, pitch: 0.7 }); break;
      case 'aceDown': fx.light(ev.x, ev.z, 2.6, 0.5, '#ff5a3a', 1.3); fx.ring(ev.x, ev.z, 2, 0.35); fx.shake(0.35); snd('explosion.large', ev.x, ev.z, { gain: 0.8 }); break;
      case 'ewarn': break;
      // round 3 mission types (ops.js)
      case 'planted': fx.ring(ev.x, ev.z, 1.2, 0.5, 'rgba(255,176,46,0.9)', 4); fx.light(ev.x, ev.z, 1.6, 0.5, '#ffb02e', 1.2); snd('lever.pull', ev.x, ev.z, { gain: 0.8 }); snd('hvf.bell', 0, 0, { global: true, gain: 0.4, pitch: 1.2 }); break;
      case 'corePick': fx.light(ev.x, ev.z, 1.4, 0.4, '#3ff0ff', 1.2); snd('loot.magic', 0, 0, { global: true, gain: 0.6 }); break;
      case 'coreDrop': fx.ring(ev.x, ev.z, 0.8, 0.4, 'rgba(63,240,255,0.8)', 3); snd('ui.error', 0, 0, { global: true, gain: 0.4 }); break;
      case 'coreHome': snd('quest.complete', 0, 0, { global: true, gain: 0.5 }); break;
      case 'allyHit': if (near(ev.x, ev.z) && Math.random() < 0.3) fx.spark(ev.x, ev.z, 0.2, 2, { speed: [1.5, 3], life: [0.08, 0.16], color: '#ffd27a' }); break;
      case 'allyDown': fx.light(ev.x, ev.z, 2.2, 0.6, '#ff7a2a', 1.4); fx.smoke(ev.x, ev.z, 5, { life: [1.6, 2.4], rise: 0.4 }); fx.shake(0.12); snd('explosion.large', ev.x, ev.z, { gain: 0.8 }); break;
      case 'escaped': snd('ui.error', 0, 0, { global: true, gain: 0.35 }); break;
      case 'orbitalLand': fx.shake(0.45); fx.ring(ev.x, ev.z, 2.4, 0.5, 'rgba(255,190,120,0.95)', 6); fx.ring(ev.x, ev.z, 1.2, 0.3, 'rgba(255,255,255,0.9)', 4); fx.light(ev.x, ev.z, 3.2, 0.7, '#ffb060', 1.6);
        fx.chunks(ev.x, ev.z, 18, { speed: [2, 5], up: [2, 5], hot: 0.4, colors: ['#4a4a52', '#6a5a48'], stay: [6, 12] }); fx.smoke(ev.x, ev.z, 8, { life: [1, 2], size: [12, 22], spread: 0.6, rise: 0.15, color: '#7a7470' }); snd('explosion.large', ev.x, ev.z, { gain: 1 }); break;
      default: break;
    }
  };
}
