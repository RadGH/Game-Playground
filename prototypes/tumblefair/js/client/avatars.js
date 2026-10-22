// Players' characters, from the same avatar system Thousandvale uses (Chibi 2.5 since 2026-10-21), in the two forms this game needs:
//   actor(member)     a 3D body with a seat-colour ring under its feet, for the board and the arena games
//   portrait(member)  a 2D head-shot (an SVG data URL) for every flat screen: lobby rows, votes, drawing, results
// A look on the wire is tiny — { race, seed, custom? } plus a costume id — and every browser rebuilds the same avatar.
import * as THREE from 'three';
import { randomAvatar, makeRng } from '../../../../avatar-2d/js/random.js';
import { partIds } from '../../../../avatar-2d/js/parts/index.js';
import { randomChibi2 } from '../../../../avatar-3d/js/chibi2-races.js';
import { inSeason, seasonByDate } from '../shared/seasons.js';
import { loadClassOutfits, dressAs } from '../../../../avatar-3d/js/class-outfits.js';
import { CHIBI2_ANIMS } from '../../../../avatar-3d/js/chibi2.js';
import { createTvBody } from '../../../thousandvale/js/client/chibi-version.js';   // Chibi 2.5 bodies, baked in slices (no long stall); ?chibi=2 for the old ones
import { CHIBI2_EMOTE_ANIMS } from '../../../../avatar-3d/js/chibi2-motion.js';
import { applyCustom } from '../../../thousandvale/js/client/ui/appearance-core.js';
import { svgPortrait } from '../../../thousandvale/js/client/ui/svg-portrait.js';
import { SEATS } from '../shared/protocol.js';

/** ONE clip list for the whole game (Chibi 2 caches a body by look + list LENGTH, so two lists would collide). */
export const ANIMS = [...CHIBI2_ANIMS, ...CHIBI2_EMOTE_ANIMS, 'throw', 'punch', 'kick'];
export const RACES = ['human', 'elf', 'dwarf', 'halfling'];
export const RACE_NAMES = { human: 'Human', elf: 'Elf', dwarf: 'Dwarf', halfling: 'Halfling' };

let presets = null, outfits = null, cosmetics = null;
const cache = new Map();
export async function loadAvatarData() {
  if (presets) return;
  const get = async u => (await fetch(new URL(u, import.meta.url))).json();
  [presets, outfits, cosmetics] = await Promise.all([get('../../../../avatar-2d/data/presets.json'), loadClassOutfits(), get('../../data/cosmetics.json')]);
}
export const costumes = () => cosmetics.items;
export const costumeOf = id => cosmetics.items.find(c => c.id === id) || cosmetics.items[0];

/** look + costume -> the full avatar JSON Chibi 2 and the 2D renderer both draw. */
export function avatarOf(look, costume = 'cos_none') {
  const key = JSON.stringify([look, costume]);
  if (cache.has(key)) return cache.get(key);
  const race = RACES.includes(look?.race) ? look.race : 'human', seed = (look?.seed >>> 0) || 1;
  let av = applyCustom(randomChibi2(randomAvatar, presets, { race, seed, makeRng, known: (slot, id) => partIds(slot).includes(id) }), look?.custom || null);
  av.held = { id: 'none' }; av.offhand = { id: 'none' };                       // nobody carries a sword round the fair
  if (!inSeason(costumeOf(costume), seasonByDate())) costume = 'cos_none';     // a holiday costume out of season: own clothes
  const outfit = costumeOf(costume).outfit;
  if (typeof outfit === 'string' && outfits[outfit]) av = dressAs(av, outfits[outfit], { hands: false });
  else if (outfit && typeof outfit === 'object') {                          // round 5: a costume written out slot by slot
    av = { ...av }; for (const [slot, part] of Object.entries(outfit)) if (slot !== 'held' && slot !== 'offhand') av[slot] = { ...(av[slot] || {}), ...part };
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, av);
  return av;
}
const portraits = new Map();
export function portrait(m) {
  const key = JSON.stringify([m.look, m.costume]);
  if (!portraits.has(key)) { try { portraits.set(key, svgPortrait(avatarOf(m.look, m.costume))); } catch { portraits.set(key, ''); } }
  return portraits.get(key);
}

const ringGeo = new THREE.RingGeometry(0.46, 0.62, 28).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(0.46, 28).rotateX(-Math.PI / 2);
/**
 * A character in the 3D scene. -> { group, body, pid, seat, place(x, y, z, yaw), pose(name), setSpeed(v), update(dt), setLook(m), dispose() }
 * `pose` is a held state ('idle' | 'run' | 'hit' | 'dead' | 'cheer' | 'sitGround' ...); one-shots go through play().
 */
export async function createActor(m, { scale = 1 } = {}) {
  const group = new THREE.Group(); group.name = 'actor-' + m.pid;
  const seat = SEATS[m.seat ?? 0];
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: seat.color }));
  const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: seat.color, transparent: true, opacity: 0.28, depthWrite: false }));
  ring.position.y = 0.03; disc.position.y = 0.025; ring.renderOrder = 2; disc.renderOrder = 1;
  group.add(ring, disc);
  let body = await createTvBody(avatarOf(m.look, m.costume), { anims: ANIMS });
  body.group.scale.setScalar(scale); group.add(body.group);
  const A = { group, body, pid: m.pid, seat: m.seat, ring, pose: 'idle', speed: 0, key: JSON.stringify([m.look, m.costume]), height: body.metrics().totalHeight * scale };
  let held = 'idle', shotUntil = 0;
  A.place = (x, y, z, yaw) => { group.position.set(x, y, z); if (yaw != null) body.group.rotation.y = yaw; };
  A.setPose = name => { A.pose = name; };
  A.play = (name, ms = 700) => { shotUntil = performance.now() + ms; body.setAnim(name, 0.08, true); held = name; };
  A.setSpeed = v => { A.speed = v; };
  A.update = dt => {
    if (performance.now() >= shotUntil) {
      const want = A.pose !== 'idle' ? A.pose : A.speed > 0.6 ? 'run' : 'idle';
      if (want !== held) { body.setAnim(want, 0.12); held = want; }
      if (want === 'run') body.setRate(Math.max(0.5, Math.min(1.8, A.speed / 5.4)));
    }
    body.update(dt);
  };
  A.setLook = async m2 => {
    const key = JSON.stringify([m2.look, m2.costume]); if (key === A.key) return;
    A.key = key; const yaw = body.group.rotation.y;
    await body.setAvatar(avatarOf(m2.look, m2.costume)); body.group.rotation.y = yaw; held = '';
  };
  A.setRing = on => { ring.visible = disc.visible = on; };
  A.dispose = () => { group.removeFromParent(); body.dispose(); ring.material.dispose(); disc.material.dispose(); };
  return A;
}
