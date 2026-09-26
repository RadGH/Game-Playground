// Generic actor body + physics for enemies, NPCs and the training dummy (docs/06 §12). Pure.
import { moveBox, grounded, depenetrate, sampleBox } from '../world/collide.js';
import { stepStatuses, speedMult } from '../rpg/status.js';
const DT = 1 / 60;
let NEXT = 1;
export function createActor(kind, props) {
  return { id: props.id || `${kind}_${NEXT++}`, kind, name: props.name || kind, x: props.x, y: props.y, px: props.x, py: props.y, w: props.w || 6, h: props.h || 10, vx: 0, vy: 0, facing: -1,
    hp: props.hp ?? 30, maxHp: props.hp ?? 30, armour: props.armour || 0, resist: props.resist || {}, statusResist: props.statusResist || {}, kbResist: props.kbResist || 0,
    statuses: {}, tags: props.tags || [], team: props.team || 'enemy', grounded: false, gravity: props.gravity ?? 1, flying: !!props.flying, swims: !!props.swims, stepUp: props.stepUp ?? 2,
    def: props.def || null, ai: {}, animT: 0, anim: 'idle', hurtFlash: 0, invuln: 0, dead: false, deadT: 0, ...props.extra };
}
export function stepActorPhysics(game, a) {
  const g = game.grid; a.px = a.x; a.py = a.y; a.animT += DT; if (a.hurtFlash > 0) a.hurtFlash -= DT; if (a.invuln > 0) a.invuln -= DT;
  stepStatuses(game, a, DT);
  if (a.dead) { a.deadT += DT; a.vx *= 0.9; }
  const env = sampleBox(g, a); a.inLiquid = env.liquid;
  if (!a.flying || a.dead) {
    if (env.liquid > 0.5 && !a.swims) { a.vy += (a.sinks ? 200 : -300) * DT; a.vy *= 0.92; a.vx *= 0.92; }
    else if (env.liquid > 0.5 && a.swims) { a.vy *= 0.9; }
    else a.vy = Math.min(420, a.vy + 1100 * a.gravity * DT);
  } else { a.vx *= 0.96; a.vy *= 0.96; }
  if (a.statuses.frozen) { a.vx = 0; if (!a.flying) a.vy = Math.max(0, a.vy); }
  depenetrate(g, a);
  const res = moveBox(g, a, a.vx * DT, a.vy * DT, { stepUp: a.stepUp, stepDown: a.grounded ? 3 : 0, wasGrounded: a.grounded });
  if (res.hitX) { a.vx = 0; a.hitWall = true; } else a.hitWall = false;
  if (res.landed || res.hitY) a.vy = 0;
  a.grounded = grounded(g, a);
  if (a.grounded && !a.ai?.moving) a.vx *= 0.8;
  // falling out of the room
  if (a.y > g.H + 20 && !a.dead) { a.hp = 0; a.dead = true; game.bus?.emit('kill', { source: null, target: a, via: 'fall' }); }
}
export { speedMult };
