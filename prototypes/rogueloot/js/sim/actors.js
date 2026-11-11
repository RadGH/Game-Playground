// Heroes (players) and foes (monsters) as sim actors. Pure.
import { derived } from '../rules/character.js';
import { WALK_SPEED, PLAYER_RADIUS } from './move.js';
import { monsterStats } from './content.js';

export const STARTER_WEAPON = 'footman_sword';
const MELEE_REACH = 1.9;           // metres of reach a one-handed weapon gives, beyond both bodies

/** The weapon a hero swings: their main hand's base, or the starter sword. */
export function weaponOf(w, ch) {
  const id = ch?.equip?.weapon?.base || STARTER_WEAPON;
  const b = w.content.bases?.[id];
  const d = b?.damage || { min: 3, max: 6, speed: 1.2 };
  return { id, min: d.min, max: d.max, speed: d.speed, ranged: !!b?.ranged, reach: b?.ranged ? 24 : (b?.hands === 2 ? 2.4 : MELEE_REACH), type: 'physical' };
}

export function makeHero(w, id, ch) {
  const st = derived({ attrs: ch.attrs || { str: 12, agi: 12, int: 12, vit: 12, spi: 12 }, level: ch.level || 1 });
  return {
    id, kind: 'hero', team: 'hero', name: String(ch.name || 'Wanderer').slice(0, 20), look: cleanLook(ch.look), char: ch,
    level: ch.level || 1, x: 0, z: 0, yaw: 0, r: PLAYER_RADIUS, speed: WALK_SPEED, moving: false,
    input: { mx: 0, mz: 0, seq: 0 }, queue: [], seq: 0,
    hp: st.maxHp, maxHp: st.maxHp, mana: st.maxMana, maxMana: st.maxMana, st,
    crit: st.crit, dodge: st.dodge, armour: 0, resists: {}, block: null,
    weapon: weaponOf(w, ch), target: null, autoOn: false, nextSwing: 0,
    cast: null, gcdUntil: 0, cds: {}, dead: false, diedAt: 0, lastHurt: -99, lastFight: -99,
  };
}
/** A look is drawn by other browsers: keep it small and plain. */
export function cleanLook(l) { if (!l || typeof l !== 'object') return null; const s = JSON.stringify(l); return s.length > 4000 ? null : JSON.parse(s); }

export function makeFoe(w, def, level, x, z, { rank = 'normal', pack = null, hpMult = 1, dmgMult = 1, name = null } = {}) {
  const n = Math.max(1, w.players.size), crowd = 1 + 0.6 * (n - 1);     // more players -> tougher monsters (ruling 5)
  const s = monsterStats(def, level, { hpMult: hpMult * crowd, dmgMult });
  const id = 'm' + (w.nextId++);
  const f = {
    id, kind: 'foe', team: 'foe', def, name: name || def.name, level, rank, pack,
    x, z, yaw: w.rng() * Math.PI * 2, r: def.radius, speed: def.speed, home: { x, z },
    hp: s.maxHp, maxHp: s.maxHp, dmg: s.dmg, attackSpeed: s.attackSpeed, armour: s.armour, resists: def.resists || {},
    crit: 5, dodge: def.role === 'skirmisher' ? 8 : 3, block: null,
    state: 'idle', target: null, threat: new Map(), nextSwing: 0, cast: null, abilityAt: {}, dead: false, diedAt: 0,
    vx: 0, vz: 0, wander: { at: w.time + 2 + w.rng() * 6, x, z }, stuck: 0,
  };
  w.foes.set(id, f);
  return f;
}

/** Slow natural regeneration (ruling 23); faster after 5 s out of combat. */
export function heroRegen(w, p, dt) {
  if (p.dead) return;
  const calm = w.time - p.lastFight > 5;
  p.hp = Math.min(p.maxHp, p.hp + p.st.hpRegen * (calm ? 3 : 1) * dt);
  p.mana = Math.min(p.maxMana, p.mana + p.st.manaRegen * (calm ? 2 : 1) * dt);
}
