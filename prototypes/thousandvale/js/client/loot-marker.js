// A body with loot on it for you (play-test 2 Q3, play-test 4 S23: "corpse shows an indicator when it holds loot,
// coloured by best rarity if magic or better").
//
// Stream A sends `lootable {id, on, free?, best?}` to you alone (protocol §18.1; `best` = the best rarity on the body for
// you, play-test 4). While it is on, the corpse carries a soft sparkle that bobs over it, tinted by that rarity, and a
// thin column of light for rare and better so you can find it across a field. The body does not fade while it has
// loot (actors.js reads `a.lootMark`). Sprites and one shared beam geometry — no lights, nothing recompiles.
//
//   const lm = createLootMarkers({ actors, glowTexture })
//   lm.set(id, on, best)   // from `lootable`
//   lm.update(dt)

import * as THREE from 'three';

export const RARITY_COLOUR = { normal: '#f3e6b8', magic: '#5a9cff', rare: '#ffd040', set: '#5ae070', legendary: '#ff8a20', unique: '#ff8a20', mythic: '#ff5ad0' };
const RANK = ['normal', 'magic', 'rare', 'set', 'legendary', 'unique', 'mythic'];
/** Pure: the marker for a best rarity -> { colour, beam, size }. Exported for tests. */
export function lootMarkLook(best) {
  const r = RANK.includes(best) ? best : 'normal';
  const k = RANK.indexOf(r);
  return { rarity: r, colour: RARITY_COLOUR[r], beam: k >= 2, size: k >= 1 ? 1.1 + k * 0.12 : 0.8 };
}

export function createLootMarkers({ actors, glowTexture }) {
  const beamGeo = new THREE.CylinderGeometry(0.07, 0.18, 6, 8, 1, true); beamGeo.translate(0, 3, 0);
  const marks = new Map();       // actor id -> { sprite, beam, look, t }
  let t = 0;
  function drop(id) {
    const m = marks.get(id); if (!m) return;
    m.sprite.parent?.remove(m.sprite); m.sprite.material.dispose();
    if (m.beam) { m.beam.parent?.remove(m.beam); m.beam.material.dispose(); }
    const a = actors.get(id); if (a) a.lootMark = null;
    marks.delete(id);
  }
  function set(id, on, best = null) {
    if (!on) { drop(id); return; }
    const a = actors.get(id); if (!a) return;
    const look = lootMarkLook(best);
    const cur = marks.get(id);
    if (cur && cur.look.rarity === look.rarity) return;
    drop(id);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: look.colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: true }));
    sprite.scale.setScalar(look.size); sprite.renderOrder = 4;
    a.group.add(sprite);
    let beam = null;
    if (look.beam) {
      beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: look.colour, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
      a.group.add(beam);
    }
    a.lootMark = look.rarity;
    marks.set(id, { sprite, beam, look, t: Math.random() * 6 });
  }
  function update(dt) {
    t += dt;
    for (const [id, m] of marks) {
      const a = actors.get(id);
      if (!a) { marks.delete(id); continue; }
      m.t += dt;
      m.sprite.position.set(0, 0.55 + Math.sin(m.t * 2.4) * 0.12, 0);
      m.sprite.material.opacity = 0.65 + Math.sin(m.t * 4.1) * 0.25;
      m.sprite.material.rotation = m.t * 0.8;
      if (m.beam) m.beam.material.opacity = 0.22 + Math.sin(m.t * 1.7) * 0.08;
    }
  }
  /** The sparkle + beam materials, visible, for the boot shader warm-up (warmup.js `extras`). */
  function sample() {
    const g = new THREE.Group();
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: '#ffd040', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: true })));
    g.add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffd040', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true })));
    return g;
  }
  return { sample, set, update, marks, clear() { for (const id of [...marks.keys()]) drop(id); } };
}
