// Heroes (players) and foes (monsters) as sim actors. Pure.
import { sheet } from '../rules/sheet.js';
import { WALK_SPEED, PLAYER_RADIUS } from './move.js';
import { monsterStats } from './content.js';

const MELEE_REACH = 1.9;           // metres of reach a one-handed weapon gives, beyond both bodies

export function makeHero(w, id, ch) {
  const penalty = w.tier?.resistPenalty || 0;
  const st = sheet(ch, w.content.items?.bases ? w.content.items : null, w.content.skills);
  const h = {
    id, kind: 'hero', team: 'hero', name: String(ch.name || 'Wanderer').slice(0, 20), look: cleanLook(ch.look), char: ch,
    level: ch.level || 1, x: 0, z: 0, yaw: 0, r: PLAYER_RADIUS, speed: WALK_SPEED, moving: false,
    input: { mx: 0, mz: 0, seq: 0 }, queue: [], seq: 0,
    hp: st.maxHp, maxHp: st.maxHp, mana: st.maxMana, maxMana: st.maxMana,
    target: null, autoOn: false, nextSwing: 0,
    cast: null, gcdUntil: 0, cds: {}, dead: false, diedAt: 0, lastHurt: -99, lastFight: -99, tierPenalty: penalty,
  };
  applySheet(h, st);
  return h;
}
/** Copy a sheet's fight numbers onto a hero (after equipping, levelling, spending points). Keeps health/mana fractions. */
export function applySheet(h, st) {
  const fh = h.maxHp ? h.hp / h.maxHp : 1, fm = h.maxMana ? h.mana / h.maxMana : 1;
  h.st = st; h.maxHp = st.maxHp; h.maxMana = st.maxMana; h.hp = Math.max(h.dead ? 0 : 1, Math.round(st.maxHp * fh)); h.mana = Math.round(st.maxMana * fm);
  h.crit = st.crit; h.dodge = st.dodge; h.armour = st.armour; h.resists = st.resists; h.block = st.block; h.resistPenalty = h.tierPenalty || 0;
  const wp = st.weapon;
  h.weapon = { min: wp.min, max: wp.max, speed: wp.speed, ranged: !!wp.ranged, reach: wp.ranged ? 24 : (wp.hands === 2 ? 2.4 : MELEE_REACH), type: 'physical', finesse: !!wp.finesse };
  h.speed = WALK_SPEED * (1 + (st.moveSpeed || 0) / 100);
}
export function refreshHero(w, h) { applySheet(h, sheet(h.char, w.content.items?.bases ? w.content.items : null, w.content.skills)); h.level = h.char.level; }
/** A look is drawn by other browsers: keep it small and plain. */
export function cleanLook(l) { if (!l || typeof l !== 'object') return null; const s = JSON.stringify(l); return s.length > 4000 ? null : JSON.parse(s); }

export function makeFoe(w, def, level, x, z, { rank = 'normal', pack = null, hpMult = 1, dmgMult = 1, name = null } = {}) {
  const crowd = w.crowd || 1, T = w.tier || {};
  level += T.levelAdd || 0; hpMult *= T.hpMult || 1; dmgMult *= T.dmgMult || 1;      // Veteran / Legend                                            // more players -> tougher monsters (ruling 5, world.rescaleFoes)
  const s = monsterStats(def, level, { hpMult: hpMult * crowd, dmgMult, base: w.content.baseline, balance: w.content.balance });
  const id = 'm' + (w.nextId++);
  const f = {
    id, kind: 'foe', team: 'foe', def, name: name || def.name, level, rank, pack,
    x, z, yaw: w.rng() * Math.PI * 2, r: def.radius, speed: def.speed, home: { x, z },
    hp: s.maxHp, maxHp: s.maxHp, dmg: s.dmg, attackSpeed: s.attackSpeed, armour: s.armour, resists: def.resists || {},
    crit: 5, dodge: def.role === 'skirmisher' ? 8 : 3, block: null,
    state: 'idle', target: null, threat: new Map(), nextSwing: 0, cast: null, abilityAt: {}, dead: false, diedAt: 0, crowd, hits: 0, flankUntil: 0, silencedUntil: 0, fx: [],
    vx: 0, vz: 0, wander: { at: w.time + 2 + w.rng() * 6, x, z }, stuck: 0,
  };
  w.foes.set(id, f);
  return f;
}

/** Slow natural regeneration (ruling 23); faster after 5 s out of combat. */
export function heroRegen(w, p, dt) {
  if (p.dead) return;
  const calm = w.time - p.lastFight > 5;
  let hot = 0, mot = 0;
  for (const f of p.fx || []) { if (f.kind === 'hot') hot += f.per; if (f.kind === 'mot') mot += f.per; }   // potions refill smoothly
  p.hp = Math.min(p.maxHp, p.hp + (p.st.hpRegen * (calm ? 3 : 1) + hot) * dt);
  p.mana = Math.min(p.maxMana, p.mana + (p.st.manaRegen * (calm ? 2 : 1) + mot) * dt);
}
