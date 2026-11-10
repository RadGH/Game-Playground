// Floating shop names over the doors in the County towns (Expansion 1 M4): "Dealer", "Outfitter", "Supply Store",
// one small sprite each, drawn on top of the scenery and fading out past ~140 m so a town is not a wall of labels
// (and hidden within 10 m, where it would fill the screen).
// Shop places come from world.sites.shops (js/world/county: { id, kind, name, x, z, y, place }); a place's `door`
// (world.sites.places) is used when the county map gives one.
//
//   const signs = addShopSigns({ THREE, scene, world });   signs.update(camera)   signs.dispose()

const LABEL = { dealer: 'Dealer', outfitter: 'Outfitter', supply: 'Supply Store', market: 'Produce Market' };
const COLOR = { dealer: '#e8a33c', outfitter: '#c47bd6', supply: '#6fb86a', market: '#d9c45a' };

/** Where a shop's door is (the place's door when known, else the shop spot). */
export function doorOf(shop, sites) {
  const pl = (sites?.places || []).find(p => p.id === (shop.place || shop.id));
  return pl?.door && Number.isFinite(pl.door.x) ? { x: pl.door.x, z: pl.door.z } : { x: shop.x, z: shop.z };
}

function labelTexture(THREE, text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '800 54px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(text).width + 70);
  g.fillStyle = 'rgba(14,19,22,0.82)'; g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 92, 46); g.fill();
  g.lineWidth = 6; g.strokeStyle = color; g.stroke();
  g.fillStyle = '#f2ead8'; g.fillText(text, 256, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function addShopSigns({ THREE, scene, world }) {
  const list = [];
  for (const s of world?.sites?.shops || []) {
    const text = LABEL[s.kind]; if (!text) continue;
    const d = doorOf(s, world.sites);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(THREE, text, COLOR[s.kind] || '#f2a33a'), depthTest: false, transparent: true }));
    sp.scale.set(5.2, 1.3, 1); sp.renderOrder = 9;
    sp.position.set(d.x, world.heightAt(d.x, d.z) + 5.2, d.z);
    sp.userData.shop = s.id;
    scene.add(sp); list.push(sp);
  }
  return {
    list,
    update(camera) {
      for (const sp of list) {
        const dist = camera.position.distanceTo(sp.position);
        // gone right under it (drawn over everything, a 5 m label a few metres from the camera filled the screen when
        // you parked a trailer at the market), fading in from 10 m, out past 120 m
        sp.visible = dist > 10 && dist < 160;
        sp.material.opacity = Math.max(0, Math.min(1, (160 - dist) / 40, (dist - 10) / 8));
      }
    },
    dispose() { for (const sp of list) { sp.removeFromParent(); sp.material.map?.dispose(); sp.material.dispose(); } list.length = 0; },
  };
}
