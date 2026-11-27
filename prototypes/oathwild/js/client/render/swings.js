// Basic-attack swings (owner report #138, 2026-11-26: "make even auto attacks … have more particle effects. Use a
// similar effect as the Cleave ability but with a little less detail … it should indicate the swing direction and
// motion … different versions for different type of weapons if they have different animations").
//
// Every weapon swing — mine, other heroes', monsters' — starts its clip through actor.act('attack') (render/actors.js),
// which asks this file first (actors.swingHook). For a hero this picks the weapon kind's clip, speed and body move
// (data/swing-visuals.json kinds) and draws the trail ALONG THE CLIP'S OWN MEASURED STROKE (tools/measure-swings.mjs
// writes each kind's path: the grip and the blade's direction, 60 samples a second, in the body's frame), on the clip's
// clock, so the ribbon runs the way the blade really moves (the shared sword clip: high over the right shoulder, down
// across the front to the left hip) and arrives with it. The ribbon lives in the body group's frame, so the hip twist /
// lunge of render/moves.js and the hero's facing (lessons rule 48) carry it. Sparks / dust burst on the body struck at
// the clip's contact moment ('hit' events). Bows: a flash at the hand as the arrow leaves (the arrow itself flies as a
// Spell Kit arrow, render/fx.js). Magic weapons draw their own attack (render/caster-fx.js). Monsters (fal bodies, no
// measured weapon): a light crescent in front at their reach; a SPECIAL blow (a 'windup' event with special:true)
// gets the heavy red slash when its tell ends.
// Everything is Spell Kit effects: pooled ribbons and particles, no lights, no new materials (lessons rules 22, 29);
// layers marked quality:'high' are skipped on Low.
//
//   const sw = createSwings({ fx, actors, moves, data, unitOf, meId })
//   actors.swingHook = sw.hook       sw.event(e) (every server event, before the play screen's own handling)
//   sw.kindOf(gear) → kind id        sw.handles(id) → does a basic attack of this actor go through here
import * as THREE from 'three';

/** The swing kind of a weapon as the server sends gear ({ weapon: { b, s, c, two } }), or a tabardItems-style item. */
export function weaponKind(data, gear) {
  const w = gear?.weapon;
  if (!w) return data.weapons.none;
  const s = w.s ?? w.subtype, c = w.c ?? w.weaponCategory, two = w.two ?? w.twoHanded;
  if (c === 'magic') return data.weapons.magic;
  if (data.weapons[s]) return s === 'sword' && two ? data.weapons.sword2h : (s === 'axe' && two ? data.weapons.axe2h : data.weapons[s]);
  return two ? 'two_hand' : 'one_hand';
}

export function createSwings({ fx, actors, moves, data, unitOf, meId }) {
  const kit = fx.kit;
  const safe = f => { try { return f(); } catch (err) { console.info('swing look:', err.message); return null; } };
  const now = () => (kit ? kit.time : performance.now() / 1000);   // the drawn clock (a hit-stop pauses it too)
  const special = new Map();      // monster id -> until (s): its next swing is a special blow
  const ranged = new Map();       // monster id -> until (s): it is shooting, not swinging (no crescent)
  const last = new Map();         // actor id -> { kind, at (s), contact (s after at) } of its latest swing
  const _p = new THREE.Vector3();

  const kindOf = gear => weaponKind(data, gear);
  const heroBody = a => !!(a && a.body?.isTabard && !a.formBody);

  /** The weapon's [back end, tip] from the grip, measured once per worn weapon (falls back to the kind's sample). */
  function bladeOf(a, K) {
    const hand = a.body?.bones?.hand_r, holder = hand?.children.find(c => /@/.test(c.name));
    if (!holder) return K.blade || [0, 0.9];
    if (holder.userData.swingBlade) return holder.userData.swingBlade;
    a.body.group.updateMatrixWorld(true);
    const inv = holder.matrixWorld.clone().invert(), bb = new THREE.Box3();
    holder.traverse(m => { if (m.isMesh && m.geometry) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv)); } });
    return (holder.userData.swingBlade = bb.isEmpty() ? K.blade || [0, 0.9] : [bb.min.z, bb.max.z]);
  }

  function handPos(a, out) {
    const h = a.body?.bones?.hand_r;
    if (h) return h.getWorldPosition(out);
    return out.copy(a.root.position).setY(a.root.position.y + 1.3);
  }

  /** A hero's swing: the clip + speed for actors.js, the body move, the trail on the clip's clock. */
  function heroSwing(a) {
    const u = unitOf(a.id);
    let id = kindOf(u?.info?.gear ?? a.info?.gear);
    let K = data.kinds[id];
    if (!K || id === 'caster') return null;
    if (K.alt) { const L = last.get(a.id); if (L && now() - L.at < 1.6 && (L.kind === id)) { id = K.alt; K = data.kinds[id]; } }
    const speed = K.speed || 1;
    last.set(a.id, { kind: id, at: now(), contact: (K.contact ?? 0.45) / speed });
    if (K.move && !a.mounted) moves.play(a.id, K.move, { clip: false, speed });
    if (kit && K.visual && K.path?.length) {
      const [back, tip] = id.startsWith('fist') ? K.blade || [-0.06, 0.12] : bladeOf(a, K);
      safe(() => kit.pathSwing(a.body.group, K.visual, {
        path: K.path, speed, b0: id.startsWith('fist') ? back : Math.max(0.1, tip * 0.3), b1: tip, back: back < -0.3 ? back : 0,
        delay: K.path[0][0] / speed, tail: K.tail ?? 0.16,
      }));
    }
    if (kit && K.release) {
      kit.wait((K.contact ?? 0.3) / speed).then(() => safe(() => {
        if (!a.root.parent) return;
        const dir = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y));
        kit.impact(handPos(a, _p).clone().addScaledVector(dir, 0.25), K.release, { dir });
      }));
    }
    return { clip: K.clip, speed };
  }

  /** A monster's (or a druid shape's) blow: a crescent in front, at its reach, when the blow falls. */
  function beastSwing(a, { tell = 0 } = {}) {
    if (!kit || (ranged.get(a.id) || 0) > now()) return null;
    const sp = (special.get(a.id) || 0) > now();
    if (sp) special.delete(a.id);
    const M = data.monsters[sp ? 'special' : 'plain'];
    const h = a.height || 1.8, k = Math.max(0.6, Math.min(2.2, h / 1.8));
    const wait = tell > 0 ? Math.max(0, tell - 0.06) : M.delay;
    last.set(a.id, { kind: sp ? 'special' : 'plain', at: now(), contact: wait + M.seconds * 0.6 });
    kit.wait(wait).then(() => safe(() => {
      if (!a.root.parent || a.dead) return;
      const f = a.root.rotation.y, dir = { x: Math.sin(f), z: Math.cos(f) };
      const at = a.root.position.clone();
      kit.swing(at, M.visual, { dir, radius: M.reach * k, angle: M.angle, seconds: M.seconds, height: M.height * k, inner: 0.35, tail: 1 });
    }));
    return null;
  }

  return {
    kindOf, data,
    /** actors.js asks this before every basic-attack clip: → { clip, speed } to play instead, or null (its own). */
    hook(a, o = {}) {
      if (!a || a.dead) return null;
      if (heroBody(a)) return o.tell ? null : heroSwing(a);
      return beastSwing(a, o);
    },
    /** Does this actor's basic attack get its swing from here (a hero holding a weapon or bare-handed, not a wand)? */
    handles(id) {
      const a = actors.get(id); if (!heroBody(a)) return false;
      const k = kindOf(unitOf(id)?.info?.gear ?? a.info?.gear);
      return !!data.kinds[k] && k !== 'caster';
    },
    /** Every server event, first: special blows are marked; a plain hit gets its contact burst on the clip's moment. */
    event(e) {
      if (e.t === 'windup' && e.special) special.set(e.who, now() + (e.seconds || 1) + 0.6);
      if ((e.t === 'windup' && e.ranged) || (e.t === 'projectile' && !e.spell)) ranged.set(e.who, now() + (e.seconds || 0) + 0.4);
      if (e.t !== 'hit' || e.spell || e.vis || !kit) return;
      const t = unitOf(e.to), from = unitOf(e.from), A = actors.get(e.from);
      if (!t) return;
      const L = last.get(e.from);
      let hit = data.monsters.plain.hit;
      if (heroBody(A)) { const K = data.kinds[L?.kind || kindOf(from?.info?.gear)]; if (!K?.hit) return; hit = K.hit; }
      else if (L?.kind === 'special') hit = data.monsters.special.hit;
      // the burst lands when the blade does (the server's hit comes a round trip after the press; the clip's
      // contact moment is later), never more than half a second late
      const wait = L ? Math.max(0, Math.min(0.5, L.at + L.contact - now())) : 0;
      kit.wait(wait).then(() => safe(() => {
        const tu = unitOf(e.to); if (!tu) return;
        const at = new THREE.Vector3(tu.x, (tu.y || 0) + (tu.height || 1.8) * 0.6, tu.z);
        const dir = from ? new THREE.Vector3(tu.x - from.x, 0, tu.z - from.z).normalize() : new THREE.Vector3(0, 0, 1);
        kit.impact(at, hit, { dir, scale: e.crit ? 1.35 : 1 });
      }));
    },
    /** tests: the latest swing of an actor */
    lastOf: id => last.get(id) || null,
  };
}
