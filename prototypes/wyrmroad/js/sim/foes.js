// Enemy brains. Each foe picks a target, walks to an attack slot beside it and waits for an attack token (only
// T.attackTokens foes swing at one hero at once — the rest circle), then winds up a move the player can see coming.
// Ranged foes keep their distance and line up on your lane first. Bosses unlock moves by phase. Pure.
import { foesOf, startMove, hittable, viewHalf, DEPTH, alive, summonFoes } from './brawl.js';
import { skyPass } from './big.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sgn = v => (v < 0 ? -1 : 1);
const RANGED = m => !!(m.shot || m.fan || m.aoe || m.rain || m.beam || m.pull || m.summon || m.healFoes || m.cols || m.gust || m.expose);

export function thinkFoe(G, f, dt) {
  const ai = f.ai, T = G.T, D = f.def;
  for (const k in ai.cd) if (ai.cd[k] > 0) ai.cd[k] -= dt;
  ai.think -= dt; if (ai.wait > 0) ai.wait -= dt;
  const targets = foesOf(G, f).filter(o => o.state !== 'gone');
  if (!targets.length) { f.vx = 0; f.vz = 0; f.anim = 'idle'; return; }
  let t = targets.find(o => o.id === ai.target);
  if (!t || ai.think <= 0) {
    ai.think = 0.4 + G.rand() * 0.4;
    t = targets.reduce((b, o) => (score(f, o) < score(f, b) ? o : b), targets[0]);
    ai.target = t.id;
  }
  bossPhaseCheck(G, f);
  const dx = t.x - f.x, adx = Math.abs(dx), dz = t.z - f.z, adz = Math.abs(dz);
  const free = f.boss || f.team === 0;   // bosses and the ally don't queue for a turn
  const moves = D.moves.filter(m => (m.phase || 0) <= ai.phase && (ai.cd[m.id] || 0) <= 0 && !(f.team === 0 && m.summon));
  const canHit = t.state !== 'out' && hittable(t);

  // 1. use a move if one fits right now
  if (canHit && ai.wait <= 0) {
    const ok = moves.filter(m => {
      if (RANGED(m)) {
        const [lo, hi] = m.range || [0, 99];
        if (adx < lo || adx > hi) return false;
        if (m.selfDestruct) return adz < 0.8;
        if (m.healFoes) return G.foes.some(o => o.team === f.team && o !== f && o.state !== 'dead' && o.hp < o.max * 0.7 && Math.hypot(o.x - f.x, o.z - f.z) < m.healFoes.r);
        if (m.shot && !m.shot.seek) return adz < 0.45;
        if (m.beam) return adz < 0.5 && adx < m.beam.len;
        return true;
      }
      if (m.range) { const [lo, hi] = m.range; return adx >= lo && adx <= hi && adz < 0.5 && (free || ai.token || takeToken(G, f, t)); }
      return adx <= (m.reach || 1.2) + 0.15 && adz < 0.45 && (free || ai.token || takeToken(G, f, t));
    });
    if (ok.length) {
      const m = weighted(G, ok);
      f.dir = sgn(dx);
      ai.cd[m.id] = m.cd || 1.5;
      startMove(G, f, m, 'foe', { name: m.id });
      if (D.ai === 'skirmish') ai.wait = 0.8;
      return;
    }
  }

  // 2. otherwise move toward where this brain wants to stand
  let wantX = f.x, wantZ = t.z, speed = D.speed * (f.slowT > 0 ? 1 - f.slowK : 1) * (f.freezeT > 0 ? 0 : 1);
  const hasMelee = D.moves.some(m => !RANGED(m));
  const ranged = ['caster', 'archer', 'healer'].includes(D.ai) || (D.keepAway && !hasMelee);
  if (ranged || (D.keepAway && f.hp < f.max * 0.9 && G.rand() < 0.02)) {
    const keep = D.keepAway || (D.ai === 'healer' ? 5.5 : 6);
    const side = f.x < t.x ? -1 : 1;
    wantX = t.x + side * keep;
    // stay on screen
    wantX = clamp(wantX, G.camX - viewHalf(G) + 1, G.camX + viewHalf(G) - 1);
    if (Math.abs(wantX - t.x) < 2.5) wantX = t.x - side * keep;   // pinned at the edge: go round
    if (D.ai === 'healer') { const hurt = G.foes.find(o => o.team === f.team && o !== f && o.state !== 'dead' && o.hp < o.max * 0.7); if (hurt) { wantX = hurt.x + side * 2; wantZ = hurt.z; } }
  } else {
    const slot = (D.moves.find(m => !RANGED(m) && !m.range)?.reach || 1.2) * 0.85;
    if (free || ai.token || countTokens(G, t) < T.attackTokens) wantX = t.x - sgn(dx) * slot;
    else {
      // waiting for a turn: hover a few steps off and drift up/down
      wantX = t.x - sgn(dx) * (3 + (f.id % 3) * 0.6);
      wantZ = clamp(t.z + ai.strafe * 1.6, -DEPTH + 0.3, DEPTH - 0.3);
      if (G.rand() < 0.01) ai.strafe = -ai.strafe;
      speed *= 0.6;
    }
    // chargers and lungers without a turn back off to where their leap starts (not short of it: they hovered at the edge)
    if (D.ai === 'charger' || D.ai === 'lunger') { const lo = Math.max(2.2, D.moves.find(m => m.range)?.range[0] || 0); if (adx < lo + 0.2 && !ai.token && !free) wantX = t.x - sgn(dx) * (lo + 1); }
  }
  const mx = wantX - f.x, mz = wantZ - f.z;
  f.vx = Math.abs(mx) > 0.15 ? sgn(mx) * speed : 0;
  f.vz = Math.abs(mz) > 0.12 ? sgn(mz) * speed * 0.7 : 0;
  // guards keep their shield toward you; everyone else faces where they walk, or the target when standing
  f.dir = D.ai === 'guard' || Math.abs(f.vx) < 0.01 ? sgn(dx) : sgn(f.vx);
  if (D.ai === 'guard' || ranged) f.dir = sgn(dx);
  f.anim = Math.abs(f.vx) + Math.abs(f.vz) > 0.01 ? 'walk' : 'idle';
}

/**
 * Boss phases: def.phases = health shares where a new phase starts ([0.66, 0.33] = three phases). Emits
 * { type: 'bossPhase', id, phase } (1, 2…) and the line lines.phase (phase 1) / lines.phase2 (phase 2) once. A pair
 * (def.partner / def.pairOf) shares one health pool for this, and one set of lines (the lead's).
 */
export function bossPhaseCheck(G, f) {
  const D = f.def, ai = f.ai;
  if (!f.boss || !D.phases || f.team !== 1) return;
  const pairId = D.partner || D.pairOf;
  const pair = pairId ? G.foes.filter(o => o.boss && o.team === 1 && (o === f || o.kind === pairId)) : [f];
  const frac = pair.reduce((a, o) => a + Math.max(0, o.hp), 0) / pair.reduce((a, o) => a + o.max, 0);
  const p = D.phases.filter(th => frac <= th).length;
  if (p <= ai.phase) return;
  ai.phase = p;
  G.events.push({ type: 'bossPhase', id: f.id, phase: p });
  const lines = D.lines || G.data.enemies.bosses[D.pairOf]?.lines || {};
  const line = lines[p === 1 ? 'phase' : `phase${p}`];
  if (line && !G.said.has(line)) { G.said.add(line); G.events.push({ type: 'line', line }); }
  if (D.skyOnPhase?.includes(p) && G.ch.sky && G.T.skyAlly) { const t = G.heroes.find(alive); skyPass(G, t ? t.z : 0); }
  if (D.summonOnPhase?.[p - 1]) summonFoes(G, D.summonOnPhase[p - 1]);
}

function score(f, o) { return Math.abs(o.x - f.x) + Math.abs(o.z - f.z) * 0.6 + (o.state === 'out' ? 100 : 0) + (o.id === f.ai.target ? -1.5 : 0); }
function countTokens(G, t) { return G.foes.filter(f => f.ai?.token && f.ai.target === t.id && f.state !== 'dead').length; }
function takeToken(G, f, t) { if (countTokens(G, t) < G.T.attackTokens) { f.ai.token = true; return true; } return false; }
export function weighted(G, list) { const tot = list.reduce((a, m) => a + (m.w || 1), 0); let x = G.rand() * tot; for (const m of list) { x -= (m.w || 1); if (x <= 0) return m; } return list[0]; }
