// The monster brain (docs/05 §3-§8): one state machine for everyone, senses keyed to the CPU light grid,
// attack tokens, telegraphed attacks (wind-up -> active -> recovery), poise/stagger, fleeing, burning
// panic, lures, leash. Movement types: walker, crawler, flyer, swimmer. Pure.
import { createActor } from '../entities/actor.js';
import { dealDamage } from '../rpg/damage.js';
import { applyStatus } from '../rpg/status.js';
import { castPlan } from '../spells/instances.js';
import { spawnVoidZone } from '../rpg/voidzones.js';
import { hexToRgb01 } from '../core/math.js';

const DT = 1 / 60;

/** Build a monster actor from its data definition at an area level. */
export function spawnEnemy(game, id, x, y, opts = {}) {
  const def = game.data.enemies.byId[id]; if (!def) throw new Error(`unknown enemy ${id}`);
  const tier = game.data.enemies.tiers[def.tier] || game.data.enemies.tiers.standard;
  const base = game.data.enemies.baseLevel[def.act[0]] ?? 2, L = opts.level ?? base, dL = L - base;
  const diff = game.difficulty || {};
  const hp = Math.round(def.hp * Math.pow(1.12, dL) * (diff.enemyHp ?? 1) * (opts.elite ? 2.2 : 1));
  const e = createActor('enemy', { name: def.name, x, y, w: def.size[0], h: def.size[1], hp, resist: def.resist || {}, armour: def.armour || 0, tags: def.tags || [], flying: def.move === 'flyer', swims: def.move === 'swimmer', stepUp: 3,
    extra: { def, level: L, dmgMult: Math.pow(1.09, dL) * (diff.enemyDamage ?? 1), sprite: def.sprite, eyes: def.eyes ? hexToRgb01(def.eyes) : null, maxPoise: tier.poise, poise: tier.poise, staggerTime: tier.stagger, tokenCost: tier.token,
      anchor: { x, y }, brain: { state: 'idle', t: Math.random() * 3, react: 0, attack: null, phase: null, pt: 0, cds: {}, lastSeen: null, lostT: 0, token: false, thinkT: Math.random() * 0.1, pack: opts.pack || null },
      light: def.light ? { r: def.light.r, color: hexToRgb01(def.light.color), i: 0.8 } : null, color: def.color ? hexToRgb01(def.color) : null, elite: !!opts.elite, flipSprite: false } });
  e.facing = -1;
  game.entities.push(e);
  return e;
}

export function stepAI(game) {
  const p = game.player; if (!p) return;
  const tokens = game.tokens || (game.tokens = { melee: 2, ranged: 2, usedMelee: 0, usedRanged: 0 });
  for (const e of game.entities) {
    if (e.kind !== 'enemy' || e.dead) { if (e.dead && e.brain?.token) releaseToken(game, e); continue; }
    const B = e.brain, def = e.def;
    // statuses that stop thinking
    if (e.statuses.frozen || e.statuses.knocked_out) { if (B.token) releaseToken(game, e); B.attack = null; continue; }
    if (e.statuses.staggered) { B.attack = null; if (B.token) releaseToken(game, e); e.anim = 'idle'; continue; }
    const dx = p.x - e.x, dy = (p.y - 6) - (e.y - e.h / 2), dist = Math.hypot(dx, dy);
    B.thinkT -= DT;
    if (B.thinkT <= 0) { B.thinkT = 0.1; think(game, e, B, def, p, dist); }
    act(game, e, B, def, p, dx, dy, dist);
    // contact attacks and burning panic spread
    if (e.statuses.burn && !e.tags.includes('fears_fire') && !e.tags.includes('wax') && def.tier !== 'heavy') B.state = 'panic';
  }
}

function canSee(game, e, p, def) {
  const L = game.lightGrid ? game.lightGrid.at(p.x, p.y - 6) : 1;
  let range = (def.sight || 120) * Math.max(0.3, Math.min(1, L));
  const facingAway = Math.sign(p.x - e.x) !== Math.sign(e.facing) && Math.abs(p.x - e.x) > 4;
  if (facingAway) range *= 0.4;
  const d = Math.hypot(p.x - e.x, p.y - e.y); if (d > range) return false;
  // line of sight through the grid (water is see-through)
  const g = game.grid, x0 = e.x, y0 = e.y - e.h * 0.7, x1 = p.x, y1 = p.y - 7, n = Math.ceil(d / 2);
  for (let k = 1; k < n; k++) { const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n); if (!g.inside(x, y)) return false; const c = g.mats.cls[g.mat[y * g.W + x]]; if (c === 1 || c === 2) return false; }
  return true;
}

function think(game, e, B, def, p, dist) {
  const sees = !p.dead && canSee(game, e, p, def);
  if (sees) { B.lastSeen = { x: p.x, y: p.y }; B.lostT = 0; } else B.lostT += 0.1;
  // hearing: noise events recorded this tick on game.noises
  if (!sees && game.noises?.length) for (const n of game.noises) { if (Math.hypot(n.x - e.x, n.y - e.y) < n.r * (def.hearing ?? 1)) { if (B.state === 'idle' || B.state === 'patrol' || B.state === 'search') { B.state = 'alert'; B.lastSeen = { x: n.x, y: n.y }; B.react = (def.reaction || 350) / 1000; } } }
  switch (B.state) {
    case 'idle': case 'patrol': case 'search': case 'return':
      if (sees) { B.state = 'alert'; B.react = (def.reaction || 350) / 1000 * (game.act1Grace ? 1.25 : 1); game.bus?.emit('enemy.alert', { enemy: e }); alertPack(game, e); }
      else if (B.state === 'search' && B.lostT > 6) B.state = 'return';
      break;
    case 'alert': if (B.react <= 0) B.state = sees ? 'attack' : 'search'; break;
    case 'attack':
      if (!sees && B.lostT > 4) { B.state = 'search'; if (B.token) releaseToken(game, e); }
      if (def.fleeAt && e.hp / e.maxHp < def.fleeAt && !B.fled) { B.state = 'flee'; B.fled = true; B.fleeT = 3; }
      if (Math.hypot(e.x - e.anchor.x, e.y - e.anchor.y) > (def.move === 'flyer' ? 480 : 320)) B.state = 'return';
      break;
    case 'flee': B.fleeT -= 0.1; if (B.fleeT <= 0) B.state = 'attack'; break;
    case 'panic': if (!e.statuses.burn) B.state = 'attack'; break;
  }
}
function alertPack(game, e) {
  for (const o of game.entities) if (o !== e && o.kind === 'enemy' && !o.dead && o.brain.pack && o.brain.pack === e.brain.pack && Math.hypot(o.x - e.x, o.y - e.y) < 120 && (o.brain.state === 'idle' || o.brain.state === 'patrol')) { o.brain.state = 'alert'; o.brain.react = 0.3; }
}
function takeToken(game, e, kind) {
  if (!e.tokenCost) return true; const T = game.tokens;
  if (kind === 'ranged') { if (T.usedRanged + e.tokenCost > T.ranged) return false; T.usedRanged += e.tokenCost; }
  else { if (T.usedMelee + e.tokenCost > T.melee) return false; T.usedMelee += e.tokenCost; }
  e.brain.token = kind; return true;
}
function releaseToken(game, e) { const T = game.tokens; if (e.brain.token === 'ranged') T.usedRanged = Math.max(0, T.usedRanged - e.tokenCost); else if (e.brain.token) T.usedMelee = Math.max(0, T.usedMelee - e.tokenCost); e.brain.token = false; }

function moveToward(game, e, tx, ty, speed, def) {
  const dx = tx - e.x;
  if (def.move === 'flyer') { const dy = ty - e.y, d = Math.hypot(dx, dy) || 1; e.vx += (dx / d * speed - e.vx) * 0.15; e.vy += (dy / d * speed - e.vy) * 0.15; }
  else if (def.move === 'swimmer') { if (e.inLiquid > 0.3) { const dy = ty - e.y, d = Math.hypot(dx, dy) || 1; e.vx += (dx / d * speed - e.vx) * 0.12; e.vy += (dy / d * speed - e.vy) * 0.12; } }
  else {
    const want = Math.abs(dx) < 3 ? 0 : Math.sign(dx) * speed; e.vx += (want - e.vx) * 0.25;
    if (e.hitWall && e.grounded && def.move === 'walker') e.vy = -Math.sqrt(2 * 1100 * 22); // hop up a ledge
  }
  if (Math.abs(dx) > 1) e.facing = Math.sign(dx);
  e.ai.moving = true;
}

function act(game, e, B, def, p, dx, dy, dist) {
  e.ai.moving = false;
  const spd = def.speed * (e.statuses.chill ? 1 - 0.1 * e.statuses.chill.stacks : 1) * (e.statuses.numbed ? 0.5 : 1) * (game.difficulty?.enemySpeed ?? 1);
  if (B.react > 0) B.react -= DT;
  for (const k in B.cds) if (B.cds[k] > 0) B.cds[k] -= DT;
  e.anim = def.move === 'flyer' ? 'fly' : 'idle';
  // an attack in progress
  if (B.attack) { runAttack(game, e, B, def, p); return; }
  switch (B.state) {
    case 'idle': if (def.move === 'flyer') { e.vx *= 0.9; e.vy = Math.sin(game.time * 2 + e.x) * 10; } e.anim = 'idle'; break;
    case 'alert': e.facing = Math.sign(dx) || e.facing; break;
    case 'search': case 'lured': if (B.lastSeen) moveToward(game, e, B.lastSeen.x + Math.sin(game.time + e.x) * 30, B.lastSeen.y - (def.move === 'flyer' ? 40 : 0), spd * 0.6, def); e.anim = 'walk'; break;
    case 'return': moveToward(game, e, e.anchor.x, e.anchor.y, spd * 0.7, def); e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1 * DT); if (Math.abs(e.x - e.anchor.x) < 6) B.state = 'idle'; e.anim = 'walk'; break;
    case 'flee': case 'panic': { const away = e.x - p.x; moveToward(game, e, e.x + Math.sign(away || 1) * 80, def.move === 'flyer' ? e.y - 40 : e.y, spd * (B.state === 'panic' ? 1.1 : 1), def); e.anim = 'walk';
      if (B.state === 'panic') for (const o of game.entities) if (o !== e && !o.dead && o.kind === 'enemy' && Math.abs(o.x - e.x) < (o.w + e.w) / 2 && Math.abs(o.y - e.y) < 8 && (game.tick % 60 === 0)) applyStatus(game, o, 'burn', { source: e.statuses.burn.source, hitDamage: 4 });
      break; }
    case 'attack': {
      // choose an attack in range and off cooldown
      const choices = def.attacks.filter(a => !(B.cds[a.id] > 0) && dist >= a.range[0] - 2 && dist <= a.range[1] + 2);
      if (choices.length && B.react <= 0) {
        const a = choices[Math.floor(game.rng.ai.next() * choices.length)];
        const kind = a.kind === 'projectile' ? 'ranged' : 'melee';
        if (B.token || takeToken(game, e, kind)) { B.attack = a; B.phase = 'windup'; B.pt = 0; B.aim = { x: p.x, y: p.y - 6 }; e.facing = Math.sign(dx) || e.facing; if (a.kind !== 'contact') game.bus?.emit('enemy.telegraph', { enemy: e, attack: a.id }); return; }
      }
      // position: keep preferred range; without a token, circle at 40-70
      const prefer = def.role === 'flanker' ? 60 : Math.max(...def.attacks.map(a => a.range[1])) * 0.7;
      const holdOff = !B.token && e.tokenCost > 0 ? 55 : 0;
      const target = Math.max(prefer, holdOff);
      if (def.move === 'flyer') moveToward(game, e, p.x + Math.sin(game.time * 1.5 + e.id.length) * 50, p.y - 70, spd, def);
      else if (dist > target + 8) moveToward(game, e, p.x, p.y, spd, def);
      else if (dist < target - 12 && target > 20) moveToward(game, e, e.x - Math.sign(dx) * 30, e.y, spd * 0.7, def);
      else e.facing = Math.sign(dx) || e.facing;
      e.anim = e.ai.moving ? (def.move === 'flyer' ? 'fly' : 'walk') : 'idle';
      break;
    }
  }
}

function runAttack(game, e, B, def, p) {
  const a = B.attack, grace = game.act1Grace ? 1.25 : 1, tele = Math.max(250, a.windup * grace * (game.difficulty?.telegraph ?? 1));
  B.pt += DT * 1000;
  if (B.phase === 'windup') {
    e.anim = 'windup'; e.telegraph = { a, t: B.pt / tele, color: hexToRgb01(a.telegraph?.color || '#e8e2d0'), part: a.telegraph?.part || 'eyes', aim: B.aim };
    if (def.move === 'flyer') { e.vx *= 0.85; e.vy *= 0.85; } else e.vx *= 0.8;
    if (a.kind === 'dive' || a.kind === 'lunge') B.aim = { x: p.x, y: p.y - 6 };
    if (B.pt >= tele) { B.phase = 'active'; B.pt = 0; e.telegraph = null; startActive(game, e, B, a, p); }
    return;
  }
  if (B.phase === 'active') {
    e.anim = 'walk';
    if (a.kind === 'melee' || a.kind === 'contact') { hitPlayerIn(game, e, a, meleeBox(e, a)); }
    if (a.kind === 'lunge' || a.kind === 'dive') { hitPlayerIn(game, e, a, { x: e.x - e.w / 2 - 2, y: e.y - e.h - 2, w: e.w + 4, h: e.h + 4 }); if (e.hitWall || (a.kind === 'dive' && e.grounded)) { B.pt = a.active; if (a.kind === 'dive') e.statuses.staggered = { stacks: 1, t: 0.8 }; } }
    if (B.pt >= a.active) { B.phase = 'recovery'; B.pt = 0; if (a.kind === 'lunge' || a.kind === 'dive') { e.vx *= 0.3; if (def.move === 'flyer') e.vy = -60; } }
    return;
  }
  if (B.phase === 'recovery') { e.anim = 'idle'; if (B.pt >= a.recovery) { B.attack = null; B.phase = null; B.cds[a.id] = a.cooldown; if (B.token) releaseToken(game, e); B.hit = false; } }
}
function meleeBox(e, a) { const [w, h] = a.hitbox || [e.w + 6, e.h]; const front = e.x + e.facing * e.w / 2; return { x: e.facing > 0 ? front : front - w, y: e.y - e.h / 2 - h / 2, w, h }; }
function hitPlayerIn(game, e, a, box) {
  const p = game.player; if (e.brain.hit || p.dead) return;
  const px = p.x - 2, py = p.y - 11, pw = 4, ph = 10; // the forgiving 4x10 hurtbox
  if (px > box.x + box.w || px + pw < box.x || py > box.y + box.h || py + ph < box.y) return;
  e.brain.hit = true;
  hurtPlayer(game, e, a.dmg * e.dmgMult, a.flame || 'physical', { x: e.facing * (a.knock || 60), y: -60 }, a.id);
}
function startActive(game, e, B, a, p) {
  B.hit = false;
  if (a.kind === 'lunge') { const dir = Math.sign(B.aim.x - e.x) || e.facing; e.vx = dir * a.speed; e.vy = -120; e.facing = dir; }
  if (a.kind === 'dive') { const dx = B.aim.x - e.x, dy = B.aim.y - e.y, d = Math.hypot(dx, dy) || 1; e.vx = dx / d * a.speed; e.vy = dy / d * a.speed; }
  if (a.kind === 'projectile') {
    const plan = { flame: a.flame || 'physical', shape: 'lob', charms: [], color: a.color || '#e9e0c4', damage: a.dmg * e.dmgMult, speed: a.speed || 150, gravity: a.gravity || 0, size: 2, lifetime: 3, count: 1, spread: 0, bounces: 0, pierce: 0, seek: 0, dig: 0, knock: 1, light: { r: 14, i: 0.6 }, status: null, oil: 0, enemyOnLand: a.onLand };
    const tip = { ox: e.x + e.facing * 3, oy: e.y - e.h + 2 };
    // aim a lob so it lands near the player
    const dx = B.aim.x - tip.ox, dy = B.aim.y - tip.oy, v = plan.speed, gr = plan.gravity || 1;
    let ang = Math.atan2(dy, dx); if (plan.gravity) { const disc = v ** 4 - gr * (gr * dx * dx + 2 * dy * v * v); if (disc >= 0) ang = Math.atan2(v * v - Math.sqrt(disc), gr * dx) * (dx < 0 ? 1 : 1); if (dx < 0) ang = Math.PI - Math.atan2(v * v - Math.sqrt(Math.max(0, disc)), gr * -dx); }
    castPlan(game, e, plan, { ox: tip.ox, oy: tip.oy, x: tip.ox + Math.cos(ang) * 50, y: tip.oy + Math.sin(ang) * 50 }, { wickId: `enemy:${e.def.id}:${a.id}`, wickName: `${e.name} — ${a.id.replace(/_/g, ' ')}` });
  }
}

/** All player damage from monsters goes through here: invulnerability, knockback, poise, meter. */
export function hurtPlayer(game, src, amount, flame, knock, attackId) {
  const p = game.player; if (p.dead || p.invuln > 0) return 0;
  const taken = dealDamage(game, { source: src, target: p, amount, flame, via: attackId ? `enemy:${attackId}` : 'attack', viaName: attackId ? `${src.name} — ${attackId.replace(/_/g, ' ')}` : src.name, knock });
  if (taken > 0) { p.invuln = game.data.movesets.shared.invulnAfterHit; p.hurtT = 0.4; game.shake?.(taken > p.maxHp * 0.2 ? 0.3 : 0.12); game.bus?.emit('player.hurt', { amount: taken, source: src }); }
  return taken;
}
