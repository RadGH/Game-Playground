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
  // the "3x" round (owner 2026-11-26: "Basic projectile wands are still lame, make them all interesting"): every style
  // gets a muzzle at the hand (the element visual's release without the caster bloom), its impacts spread over its
  // true shape (kit.spread: an arc for cones, a line for beams, a ring for novas and bursts, a disc where a lob lands)
  const elVis = el => (kit ? kit.visualFor(null, { kind: 'bolt', element: el || 'arcane' }) : null);
  function muzzle(e, hand, size = 1) {
    if (!kit) return;
    safe(() => {
      const r = kit.resolve(elVis(e.el), { scale: size, school: e.el });
      const body = bodyOf(e.who);
      kit.effect(r, 'release', { caster: body, hands: [v3(hand), v3(hand)] }).addLayers((r.def.release || []).filter(L => L.at !== 'caster'));
    });
  }
  const spread = (vis, o, el, sc = 1) => { if (kit) safe(() => kit.spread(vis, { school: el, scale: sc, ...o })); };

  function attack(e) {
    const L = lookOf(e), el = e.el, sc = L.scale || 1;
    const hand = handOf(e.who);
    if (!hand) return;
    const dir = e.dir ? new THREE.Vector3(e.dir[0], 0, e.dir[1]).normalize() : new THREE.Vector3(0, 0, 1);
    switch (e.shape) {
      case 'cone':
        fx.flash('cone', { at: { x: hand[0], z: hand[2] }, dir, length: e.len, angle: e.arc }, col(el), 0.4);
        muzzle(e, hand, 1.1);
        if (kit) safe(() => kit.impact(v3(hand), L.visual || 'breath_cone', { dir, radius: e.len, school: el, scale: sc }));
        else for (let i = 1; i <= 3; i++) fx.burst([hand[0] + dir.x * e.len * i / 3, hand[1], hand[2] + dir.z * e.len * i / 3], col(el), 1 + i * 0.6, 0.3);
        spread(L.visual || 'breath_cone', { shape: 'arc', at: ground(hand[0], hand[2]), dir, radius: e.len, angle: e.arc || 1.2, n: 5, every: 0.05, area: false }, el, 0.8);
        break;
      case 'beam': {
        const end = ground(hand[0] + dir.x * e.len, hand[2] + dir.z * e.len, 1.1);
        fx.flash('line', { at: { x: hand[0], z: hand[2] }, dir, length: e.len, width: e.w || 1.2 }, col(el), 0.35);
        muzzle(e, hand, 1);
        if (kit) safe(() => kit.beam(v3(hand), [v3(end)], L.visual || 'beam_generic', { seconds: 0.4, school: el, scale: sc }));
        else for (let i = 1; i <= 6; i++) fx.burst([hand[0] + dir.x * e.len * i / 6, hand[1], hand[2] + dir.z * e.len * i / 6], col(el), 0.6 + (e.w || 1), 0.25);
        spread(L.visual || 'beam_generic', { shape: 'line', at: ground(hand[0], hand[2]), dir, length: e.len, n: 6, every: 0.03, area: false }, el, 0.7);
        break;
      }
      case 'nova': {
        const at = ground(hand[0] - dir.x * 0.3, hand[2] - dir.z * 0.3, 0.2);
        if (kit) safe(() => kit.impact(v3(at), L.visual || 'nova_generic', { radius: e.r, school: el, scale: sc }));
        else { fx.burst(at, col(el), e.r * 1.4, 0.4); fx.groundRing(at, col(el), e.r, 0.35); }
        spread(L.visual || 'nova_generic', { shape: 'ring', at: ground(at[0], at[2]), radius: e.r, n: 10, every: 0.02 }, el, 0.8);
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
              spread(L.impact || 'nova_generic', { shape: 'disc', at: p, radius: e.r, n: 6, every: 0.03 }, el, 0.7);
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
        spread(L.linger || 'ground_generic', { shape: 'disc', at, radius: e.r, n: 5, every: 0.04 }, el, 0.7);
        break;
      }
      case 'burst': {      // an orb's Burst rider round the first enemy struck
        const at = ground(e.at[0], e.at[1], 0.6);
        if (kit) safe(() => kit.impact(v3(at), 'nova_generic', { radius: e.r, school: el, scale: 0.8 }));
        else fx.burst(at, col(el), e.r * 1.2, 0.3);
        spread('nova_generic', { shape: 'ring', at: ground(at[0], at[2]), radius: e.r, n: 8, every: 0.02, area: false }, el, 0.6);
        break;
      }
      case 'melee': {
        const at = [hand[0] + dir.x * Math.min(1.6, e.len * 0.6), hand[1] - 0.2, hand[2] + dir.z * Math.min(1.6, e.len * 0.6)];
        if (kit) safe(() => kit.impact(v3(at), L.visual || 'elemental_slash', { dir, school: el, scale: sc, radius: e.len }));
        if (kit) safe(() => kit.swing(ground(hand[0], hand[2]), L.visual || 'elemental_slash', { dir, radius: Math.max(1.6, e.len || 2), angle: 1.8, seconds: 0.2, school: el }));
        else fx.burst(at, col(el), 1.6, 0.25);
        break;
      }
      default:   // a bolt style: a muzzle at the hand as it leaves (the bolts are the server's projectiles, fx.js) —
        // sized by style: a heavy bolt's is big, a fan's three-way spray wide, a chain / fork crackles
        fx.burst(hand, col(el), 0.9 * sc, 0.2);
        muzzle(e, hand, Math.min(1.6, 0.8 * sc));
        if (kit && (e.look === 'chain' || e.look === 'fork' || e.look === 'staff:chain')) safe(() => kit.beam(v3(hand), [v3([hand[0] + dir.x * 1.6, hand[1], hand[2] + dir.z * 1.6])], 'chain_lightning', { seconds: 0.18, school: el, scale: 0.6 }));
        if (kit && e.look === 'fan') for (const a of [-0.35, 0, 0.35]) { const c = Math.cos(a), s2 = Math.sin(a); const dd = new THREE.Vector3(dir.x * c + dir.z * s2, 0, dir.z * c - dir.x * s2); safe(() => kit.impact(v3([hand[0] + dd.x * 0.6, hand[1], hand[2] + dd.z * 0.6]), elVis(el), { school: el, scale: 0.35, dir: dd })); }
    }
  }

  /** A chain bolt's jump, or a fork's shard: a crackle from one body to the next. */
  function hop(e) {
    const a = ground(e.from[0], e.from[1], 1.1), b = ground(e.to[0], e.to[1], 1.1);
    const L = looks[e.look] || {};
    if (kit) safe(() => kit.beam(v3(a), [v3(b)], L.hop || 'chain_lightning', { seconds: 0.34, school: e.el }));
    if (kit) safe(() => kit.impact(v3(b), L.hop || 'chain_lightning', { school: e.el, scale: 0.6 }));
    else { fx.burst(a, col(e.el), 0.8, 0.2); fx.burst(b, col(e.el), 1, 0.25); }
  }

  /** A ward (a warding bolt, an Aegis Ring, a focus's Ward): a shimmer round the body for a moment. */
  function ward(e) {
    const body = bodyOf(e.who);
    if (!body) return;
    if (kit) safe(() => kit.aura(body, 'aura_warded', { seconds: 1.6 }));
    if (kit) { const p = body.position; spread('nova_generic', { shape: 'ring', at: [p.x, p.y, p.z], radius: 1.4, n: 8, every: 0.02, area: false }, 'arcane', 0.5); }
    else { const p = handOf(e.who); if (p) fx.burst(p, '#bfe3ff', 1.8, 0.4); }
  }

  return { attack, hop, ward };
}
