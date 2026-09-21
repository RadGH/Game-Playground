// A contact sheet of the Farhold weapon kit, for looking at rather than asserting on.
//
// Round 14 rebuilt every melee weapon and moved the shield from the fist to the forearm, and the
// bug it was written to fix — a hafted head sitting BEHIND the hand, travelling backwards through
// the swing — is the sort of thing you see in a screenshot in a second and argue about in a test
// for an hour. The assertions live in chibi2-weapons.spec.js; this drops a grid into
// test-results/round14-weapons.png so the models can be eyeballed after a change.
//
// Note the first cell may come back blank: a browser keeps a limited number of live WebGL contexts
// and this page asks for one per weapon, so the oldest is dropped. Reorder the list if the one you
// want to look at is first.

import { test } from '@playwright/test';
test('weapon grid screenshot', async ({ page }) => {
  await page.goto('/avatar-3d/chibi2.html?view=portrait');
  await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    document.body.innerHTML = '<div id="grid" style="display:grid;grid-template-columns:repeat(6,200px)"></div>';
    const ids = ['fh_sword','fh_greatsword','fh_greataxe','fh_hammer','fh_maul','fh_mace','fh_axe','fh_halberd','fh_spear','fh_javelin','fh_rapier','fh_sabre','fh_dagger','fh_daggers','fh_quarterstaff','fh_wand','fh_scepter'];
    for (const id of ids) {
      const wrap = document.createElement('div'); wrap.style.cssText='position:relative';
      const lab = document.createElement('div'); lab.textContent = id; lab.style.cssText='position:absolute;color:#fff;font:11px sans-serif;z-index:2';
      wrap.appendChild(lab); document.getElementById('grid').appendChild(wrap);
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      r.setSize(200, 260); wrap.appendChild(r.domElement);
      const sc = new THREE.Scene(); sc.background = new THREE.Color('#202430');
      sc.add(new THREE.HemisphereLight('#ffffff', '#404050', 2.2));
      const dl = new THREE.DirectionalLight('#fff', 1.4); dl.position.set(2,4,3); sc.add(dl);
      const cam = new THREE.PerspectiveCamera(32, 200/260, 0.1, 40);
      cam.position.set(1.9, 1.1, 2.4); cam.lookAt(0, 0.75, 0);
      const a = await createChibi2Character({ held: { id, color: '#c8ccd6', quality: 3 }, offhand: { id: 'fh_heater_shield', color: '#8d97a3' } });
      a.setAnim('ready'); a.update(0.4); sc.add(a.group);
      r.render(sc, cam);
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/round14-weapons.png', fullPage: true });
});
