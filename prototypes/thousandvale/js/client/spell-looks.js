// What every skill LOOKS like (play-test P20: "Gnawing Dark has no perceivable effect — ALL spells need
// distinct spell effects and on-hit collisions"). Pure: no three, no DOM — tests/D/spells.test.js audits all
// 180 skills of the 30 classes through it.
//
// A look is built from the skill's own data (farhold/data/skills.json: shape, element, radius, reach, arc,
// projectiles, status, heal, summon…) plus a stable hash of its id, so two skills that share a shape and an
// element still differ (projectile body, size, pattern), and every skill a class owns looks unlike its five
// siblings. The runtime (spells.js) turns a look into avatar-3d SpellFx calls:
//
//   cast   — what blooms at the caster when the skill starts: 'hand' (a short element flash), 'circle' (a
//            rune disc under the feet), 'aura' (a rising buff), 'heal', 'summon' (a pillar + circle), null
//   travel — what crosses the gap: { kind:'projectile', body, count, spread } | { kind:'beam' } | { kind:'dash' }
//   area   — what lands on the ground: { kind:'ring'|'fill'|'slash'|'pillar'|'storm'|'vortex'|'burst'|'line', r, arc }
//   impact — the burst on everything it hits: { element, scale }
//   status — the aura the skill leaves on its target (spellfx STATUS_FX key), if any

/** Element names the skill data uses -> the eleven SpellFx draws. */
const ELEMENT = { fire: 'fire', ice: 'ice', cold: 'ice', frost: 'ice', shadow: 'shadow', void: 'shadow', holy: 'holy', light: 'holy', nature: 'nature', arcane: 'arcane', magic: 'arcane', lightning: 'lightning', storm: 'lightning', physical: 'physical', poison: 'poison', bleed: 'bleed', true: 'true' };
export const elementOf = e => ELEMENT[String(e || '').toLowerCase()] || 'arcane';

/** Statuses the rules apply -> the aura SpellFx draws for them (unknown names would be a plain mote). */
export const STATUS_LOOK = {
  burn: 'burn', poison: 'poison', bleed: 'bleed', freeze: 'freeze', chill: 'slow', slow: 'slow', stun: 'stun', shock: 'dazed', sleep: 'sleep',
  fear: 'confused', confused: 'confused', root: 'root', silence: 'silence', weaken: 'curse', curse: 'curse', gnawed: 'curse', strip: 'sunder',
  sunder: 'sunder', regen: 'regen', rally: 'rally', might: 'rally', haste: 'haste', marked: 'marked', mark: 'marked', barrier: 'barrier',
  shield: 'barrier', ward: 'barrier', block: 'block', deflect: 'deflect', enchant: 'enchant', blind: 'blind', disarm: 'disarm', dazed: 'dazed',
};
export const statusLook = s => STATUS_LOOK[String(s || '').toLowerCase()] || null;

/** Projectile bodies that read as each element (SpellFx shapes). */
const BODIES = {
  fire: ['cone', 'spiral', 'drops'], ice: ['shards', 'rune', 'helix'], shadow: ['ribbon', 'helix', 'drops'], holy: ['rune', 'spiral', 'shards'],
  nature: ['spiral', 'bubbles', 'ribbon'], arcane: ['helix', 'shards', 'rune'], lightning: ['bolt', 'helix'], physical: ['arrow', 'shards', 'cone'],
  poison: ['bubbles', 'drops', 'spiral'], bleed: ['drops', 'arrow'], true: ['shards', 'rune'],
};
/** What a ground skill becomes by element: a column of light, a storm, a vortex, a burst of fire… */
const GROUND = { holy: ['pillar', 'fill'], ice: ['storm', 'fill'], shadow: ['vortex', 'fill'], fire: ['burst', 'fill'], lightning: ['pillar', 'storm'], nature: ['vortex', 'fill'], poison: ['vortex', 'fill'], arcane: ['pillar', 'vortex'], physical: ['burst', 'line'], bleed: ['burst', 'fill'], true: ['pillar', 'burst'] };

/** FNV-1a: a stable small number from an id (variety that never changes between sessions). */
export function hashId(id) { let h = 2166136261; for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function skillLook(id, sk = {}) {
  const el = elementOf(sk.elementFrom ? sk.element || 'arcane' : sk.element);
  const h = hashId(id);
  const pick = (list, salt = 0) => list[((h >>> salt) % list.length + list.length) % list.length];
  const scale = +(0.85 + ((h >>> 3) % 6) * 0.09).toFixed(2);
  const r = +(sk.radius || sk.reach || sk.width || 3);
  const look = { id, element: el, shape: sk.shape || 'bolt', scale, cast: null, travel: null, area: null, impact: { element: el, scale }, status: statusLook(sk.status) };
  if (!look.status && Array.isArray(sk.statuses)) look.status = statusLook(sk.statuses[0]?.id || sk.statuses[0]);
  switch (look.shape) {
    case 'bolt': {
      const count = Math.max(1, Math.min(7, sk.projectiles || sk.count || (sk.ricochet ? 1 : 1)));
      look.cast = 'hand';
      look.travel = { kind: 'projectile', body: pick(BODIES[el] || BODIES.arcane, 5), count, spread: count > 1 ? 0.22 : 0, ricochet: !!sk.ricochet };
      if (sk.splash) look.area = { kind: 'burst', r: +sk.splash };
      break;
    }
    case 'beam':
      look.cast = 'hand';
      look.travel = { kind: 'beam', width: +(sk.width || 1.2) };
      look.area = { kind: 'line', r: +(sk.width || 1.2), len: +(sk.range || 12) };
      break;
    case 'ground':
      look.cast = 'circle';
      look.area = { kind: sk.weather ? 'storm' : sk.pool || sk.place ? pick(['vortex', 'storm'], 7) : pick(GROUND[el] || GROUND.arcane, 7), r: +(sk.radius || 4), lingers: !!(sk.pool || sk.place || sk.weather) };
      if (sk.delay || sk.repeats) look.area.repeats = Math.max(1, Math.min(6, sk.repeats || 1));
      break;
    case 'around':
      look.area = { kind: sk.pullIn ? 'vortex' : 'ring', r: +(sk.radius || sk.reach || 4), pulses: Math.max(1, Math.min(5, sk.repeats || 1)) };
      look.cast = sk.taunt || sk.howl ? 'aura' : null;
      break;
    case 'melee':
      look.area = { kind: 'slash', r: +(sk.reach || 3), arc: +(sk.arc || 1.6), heavy: !!sk.knock, hits: Math.max(1, Math.min(5, sk.repeats || 1)) };
      break;
    case 'dash':
      look.travel = { kind: 'dash', afterimage: !!sk.afterimage };
      look.area = { kind: sk.radius ? 'ring' : 'slash', r: +(sk.radius || sk.reach || 2.5), arc: +(sk.arc || 1.4) };
      break;
    case 'summon':
      look.cast = 'summon';
      break;
    case 'self':
    default: {
      const heals = !!(sk.heal || sk.healPets || sk.revive);
      look.cast = heals ? 'heal' : sk.form || sk.forms ? 'form' : 'aura';
      look.pattern = pick(['rise', 'spiral', 'burst', 'ring'], 9);     // how the buff blooms (two self buffs never match)
      if (sk.ward || sk.counter) look.status = look.status || 'barrier';
      if (sk.selfBuff && !look.status) look.status = el === 'lightning' ? 'haste' : el === 'holy' ? 'barrier' : el === 'nature' ? 'regen' : el === 'arcane' ? 'enchant' : 'rally';
      if (sk.radius) look.area = { kind: 'ring', r: +sk.radius, soft: true };
    }
  }
  return look;
}

/** One string that says how a look differs from another (tests: no two skills of a class may share one). */
export function lookSignature(L) {
  const t = L.travel ? `${L.travel.kind}:${L.travel.body || ''}${L.travel.count > 1 ? 'x' + L.travel.count : ''}` : '-';
  const a = L.area ? `${L.area.kind}:${Math.round((L.area.r || 0) * 2) / 2}` : '-';
  return `${L.cast || '-'}${L.pattern ? '/' + L.pattern : ''}|${t}|${a}|${L.element}|${L.status || '-'}|${L.scale}`;
}
