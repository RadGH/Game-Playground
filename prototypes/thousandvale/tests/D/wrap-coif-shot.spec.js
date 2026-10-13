// A contact sheet of the chain coif (report #65: "you can see through it at the top front"), for LOOKING at.
// Rows = races / head sizes, columns = front, three-quarter, top-front, top. Writes $COIF_SHOTS/coif-<tag>.png.
//
//   cd ~/claude/playground && COIF_TAG=after flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/wrap-coif-shot.spec.js
import { test, expect } from '@playwright/test';

test('chain coif contact sheet', async ({ page }) => {
  test.setTimeout(240000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/avatar-3d/chibi2.html?view=portrait');
  await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 90000 });
  const made = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { CHIBI2_RACE_IDS } = await import('/avatar-3d/js/chibi2-races.js');
    const W = 260, H = 260;
    const rows = [{ race: 'human' }, { race: 'dwarf' }, { race: CHIBI2_RACE_IDS.find(r => /orc/.test(r)) || CHIBI2_RACE_IDS[3] }, { race: 'human', headSize: 1.25 }, { race: 'human', hat: 'none' }];
    const views = [['front', [0, 0.0, 2.2]], ['3/4', [1.5, 0.25, 1.7]], ['top front', [0, 1.5, 1.6]], ['top', [0, 2.3, 0.25]], ['side', [2.2, 0.1, 0]]];
    const sheet = document.createElement('canvas'); sheet.width = views.length * W; sheet.height = rows.length * H;
    sheet.id = 'coif-sheet'; sheet.style.cssText = 'position:absolute;left:0;top:0;z-index:99999'; document.body.appendChild(sheet);
    const g = sheet.getContext('2d'); g.font = '12px sans-serif';
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H);
    const sc = new THREE.Scene(); sc.background = new THREE.Color('#8894a8');
    sc.add(new THREE.HemisphereLight('#ffffff', '#606070', 2.4));
    const dl = new THREE.DirectionalLight('#fff', 1.4); dl.position.set(2, 4, 3); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 40);
    let n = 0;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      const a = await createChibi2Character({ body: { race: row.race, headSize: row.headSize || 1 }, hat: { id: row.hat || 'chain_coif', color: '#9aa2ac' }, hair: { id: 'short', color: '#c0392b' } });
      a.setAnim('idle'); a.update(0.01); sc.add(a.group);
      a.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(a.group);
      let hp = new THREE.Vector3(0, box.max.y - 0.3, 0);
      a.group.traverse(o => { if (o.isBone && /head/i.test(o.name)) { o.getWorldPosition(hp); hp.y += 0.22; } });
      for (let x = 0; x < views.length; x++) {
        const [label, off] = views[x];
        cam.position.set(hp.x + off[0], hp.y + off[1], hp.z + off[2]); cam.lookAt(hp);
        r.render(sc, cam);
        g.drawImage(r.domElement, x * W, y * H, W, H);
        g.fillStyle = '#000'; g.fillText(`${row.race}${row.headSize ? ' big head' : ''}${row.hat ? ' (no hat)' : ''} — ${label}`, x * W + 6, y * H + 14); n++;
      }
      sc.remove(a.group); a.dispose?.();
    }
    return n;
  });
  await page.waitForTimeout(300);
  await page.locator('#coif-sheet').screenshot({ path: `${process.env.COIF_SHOTS || 'test-results'}/coif-${process.env.COIF_TAG || 'now'}.png` });
  expect(errors, errors.join('\n')).toEqual([]);
  expect(made).toBeGreaterThan(0);
});
