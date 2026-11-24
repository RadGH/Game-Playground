// How a magic weapon's basic attack LOOKS: the server's 'attack' / 'hop' / 'barrier' events for a wand, tome, staff or
// sceptre, drawn with the Spell Kit in the item's element (js/rules/caster-attack.js sends them; data/casters.json
// `look` says which visual and how big). Each style looks different: a cone of the element sprays from the hand, a
// beam or a tome's column lances out, a ring bursts round the caster, a lob arcs onto the crosshair, a tome's Rune is
// drawn on the ground before it goes off, a chain or fork crackles from body to body, lingering ground stays put, a
// ward glows round the caster, a sceptre's swing leaves an elemental slash. Bolts themselves are server projectiles
// (js/client/render/fx.js draws them by element and style). Without the kit, the simple layer's bursts and rings.
//
//   const cfx = createCasterFx(fx, { heightAt, looks, handOf(id) → [x,y,z] | null, bodyOf(id) → Object3D | null })
//   cfx.attack(e)  cfx.hop(e)  cfx.ward(e)
import * as THREE from 'three';

export function createCasterFx(fx, { heightAt, looks = {}, handOf, bodyOf }) {
  const kit = fx.kit;
  const col = el => fx.ELEMENT_COLOUR[el] || '#fff1d0';
  const v3 = (p, dy = 0) => new THREE.Vector3(p[0], p[1] + dy, p[2]);
  const ground = (x, z, dy = 0) => [x, heightAt(x, z) + dy, z];
  const safe = f => { try { f(); } catch (err) { console.info('caster fx:', err.message); } };
  const lookOf = e => looks[e.look] || {};

  function attack(e) {
    const L = lookOf(e), el = e.el, sc = L.scale || 1;
    const hand = handOf(e.who);
    if (!hand) return;
    const dir = e.dir ? new THREE.Vector3(e.dir[0], 0, e.dir[1]).normalize() : new THREE.Vector3(0, 0, 1);
    switch (e.shape) {
      case 'cone':
        fx.flash('cone', { at: { x: hand[0], z: hand[2] }, dir, length: e.len, angle: e.arc }, col(el), 0.4);
        if (kit) safe(() => kit.impact(v3(hand), L.visual || 'breath_cone', { dir, radius: e.len, school: el, scale: sc }));
        else for (let i = 1; i <= 3; i++) fx.burst([hand[0] + dir.x * e.len * i / 3, hand[1], hand[2] + dir.z * e.len * i / 3], col(el), 1 + i * 0.6, 0.3);
        break;
      case 'beam': {
        const end = ground(hand[0] + dir.x * e.len, hand[2] + dir.z * e.len, 1.1);
        fx.flash('line', { at: { x: hand[0], z: hand[2] }, dir, length: e.len, width: e.w || 1.2 }, col(el), 0.35);
        if (kit) safe(() => kit.beam(v3(hand), [v3(end)], L.visual || 'beam_generic', { seconds: 0.32, school: el, scale: sc }));
        else for (let i = 1; i <= 6; i++) fx.burst([hand[0] + dir.x * e.len * i / 6, hand[1], hand[2] + dir.z * e.len * i / 6], col(el), 0.6 + (e.w || 1), 0.25);
        break;
      }
      case 'nova': {
        const at = ground(hand[0] - dir.x * 0.3, hand[2] - dir.z * 0.3, 0.2);
        if (kit) safe(() => kit.impact(v3(at), L.visual || 'nova_generic', { radius: e.r, school: el, scale: sc }));
        else { fx.burst(at, col(el), e.r * 1.4, 0.4); fx.groundRing(at, col(el), e.r, 0.35); }
        if (L.aura) ward({ who: e.who });
        break;
      }
      case 'lob': case 'ground': {
        const to = ground(e.at[0], e.at[1], 0.1);
        const secs = e.ms ? e.ms / 1000 : 0.35;
        if (kit) {
          // a tome's Rune: the sigil is drawn where it will land while the blast is in the air
          if (L.rune) safe(() => kit.ground(v3(to), L.rune, { radius: e.r, seconds: secs + 0.5, school: el }));
          safe(() => {
            const flight = kit.missile(v3(hand), v3(to), L.visual || 'flask_throw', { speed: Math.max(6, Math.hypot(to[0] - hand[0], to[2] - hand[2]) / Math.max(0.15, secs)), arc: 0.2, school: el, scale: sc });
            flight.then(p => {
              safe(() => kit.impact(p, L.impact || 'nova_generic', { radius: e.r, school: el, scale: 1 }));
              if (e.shape === 'ground' || L.linger) safe(() => kit.ground(p, L.linger || 'ground_generic', { radius: e.r, seconds: e.seconds || 1.2, school: el }));
            }).catch(() => {});
          });
        } else {
          setTimeout(() => { fx.burst(to, col(el), e.r * 1.4, 0.4); if (e.seconds) fx.groundRing(to, col(el), e.r, e.seconds); }, secs * 1000);
        }
        break;
      }
      case 'pool': {
        const at = ground(e.at[0], e.at[1], 0);
        if (kit) safe(() => kit.ground(v3(at), L.linger || 'ground_generic', { radius: e.r, seconds: e.seconds, school: el }));
        else fx.groundRing(at, col(el), e.r, e.seconds);
        break;
      }
      case 'burst': {      // an orb's Burst rider round the first enemy struck
        const at = ground(e.at[0], e.at[1], 0.6);
        if (kit) safe(() => kit.impact(v3(at), 'nova_generic', { radius: e.r, school: el, scale: 0.7 }));
        else fx.burst(at, col(el), e.r * 1.2, 0.3);
        break;
      }
      case 'melee': {
        const at = [hand[0] + dir.x * Math.min(1.6, e.len * 0.6), hand[1] - 0.2, hand[2] + dir.z * Math.min(1.6, e.len * 0.6)];
        if (kit) safe(() => kit.impact(v3(at), L.visual || 'elemental_slash', { dir, school: el, scale: sc, radius: e.len }));
        else fx.burst(at, col(el), 1.6, 0.25);
        break;
      }
      default:   // a bolt: a flash at the hand as it leaves (the bolt is drawn from the server's projectile list)
        fx.burst(hand, col(el), 0.7 * sc, 0.16);
    }
  }

  /** A chain bolt's jump, or a fork's shard: a crackle from one body to the next. */
  function hop(e) {
    const a = ground(e.from[0], e.from[1], 1.1), b = ground(e.to[0], e.to[1], 1.1);
    const L = looks[e.look] || {};
    if (kit) safe(() => kit.beam(v3(a), [v3(b)], L.hop || 'chain_lightning', { seconds: 0.28, school: e.el }));
    else { fx.burst(a, col(e.el), 0.8, 0.2); fx.burst(b, col(e.el), 1, 0.25); }
  }

  /** A ward (a warding bolt, an Aegis Ring, a focus's Ward): a shimmer round the body for a moment. */
  function ward(e) {
    const body = bodyOf(e.who);
    if (!body) return;
    if (kit) safe(() => kit.aura(body, 'aura_warded', { seconds: 1.4 }));
    else { const p = handOf(e.who); if (p) fx.burst(p, '#bfe3ff', 1.8, 0.4); }
  }

  return { attack, hop, ward };
}
