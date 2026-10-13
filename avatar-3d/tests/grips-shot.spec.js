// A contact sheet of HOW WEAPONS SIT IN THE FIST mid-attack, for looking at rather than asserting on.
//
// 2026-10-06 changed how chibi2-motion.js aims a held weapon for every game at once (a dagger rides the fist, no
// hand is ever left un-aimed, blade/wand ready pitches). Thousandvale asked for it; Farhold, Emberveil and
// Bannerline got it too. This draws the cases that change — a dagger user and a dual wielder — with the looks and
// the clips each of those games really plays, a few moments through the swing, into
// test-results/grips-<game>.png (GRIP_SHOTS=<dir> to keep them: the next Playwright run empties test-results). Look at them after any change to carry(), aim() or fistGrip().
//
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/tests/grips-shot.spec.js
import { test, expect } from '@playwright/test';

const STEEL = '#c8ccd6';
const GAMES = {
  // Emberveil plays the base list only: `attack` for every strike
  emberveil: [
    { label: 'rogue: daggers (pair model)', avatar: { held: { id: 'daggers', color: STEEL } }, clips: ['ready', 'attack'] },
    { label: 'dagger + dagger', avatar: { held: { id: 'dagger', color: STEEL }, offhand: { id: 'dagger', color: STEEL } }, clips: ['ready', 'attack'] },
    { label: 'sword + axe', avatar: { held: { id: 'sword', color: STEEL }, offhand: { id: 'axe', color: STEEL } }, clips: ['ready', 'attack'] },
  ],
  // Farhold: a weapon is a pattern of the opt-in melee clips
  farhold: [
    { label: 'fh_dagger', avatar: { held: { id: 'fh_dagger', color: STEEL } }, clips: ['ready', 'jab', 'slash', 'stab'], anims: 'CHIBI2_COMBAT_RIDE' },
    { label: 'fh_dagger x2', avatar: { held: { id: 'fh_dagger', color: STEEL }, offhand: { id: 'fh_dagger', color: STEEL } }, clips: ['ready', 'jab', 'offSlash', 'crossSlash'], anims: 'CHIBI2_COMBAT_RIDE' },
    { label: 'fh_sword + fh_axe', avatar: { held: { id: 'fh_sword', color: STEEL }, offhand: { id: 'fh_axe', color: STEEL } }, clips: ['ready', 'slash', 'offSlash', 'flurry'], anims: 'CHIBI2_COMBAT_RIDE' },
    { label: 'fh_greatsword x2 (Doubled Grasp)', avatar: { held: { id: 'fh_greatsword', color: STEEL }, offhand: { id: 'fh_greatsword', color: STEEL } }, clips: ['ready', 'twinCleave', 'twinSlam', 'walk'], anims: 'CHIBI2_COMBAT_RIDE' },
  ],
  // Bannerline: looks.json's knife fighter (fh_dagger in each hand) and a plain blade, base clips
  bannerline: [
    { label: 'fh_dagger x2 (looks.json)', avatar: { held: { id: 'fh_dagger', color: '#c4ccd4' }, offhand: { id: 'fh_dagger', color: '#c4ccd4' } }, clips: ['ready', 'attack', 'walk', 'run'] },
    { label: 'fh_dagger', avatar: { held: { id: 'fh_dagger', color: '#c4ccd4' } }, clips: ['ready', 'attack', 'walk', 'run'] },
  ],
};

for (const [game, rows] of Object.entries(GAMES)) {
  test(`grip sheet: ${game}`, async ({ page }) => {
    test.setTimeout(240000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/avatar-3d/chibi2.html?view=portrait');
    await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 90000 });
    const made = await page.evaluate(async rows => {
      const THREE = await import('three');
      const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
      const M = await import('/avatar-3d/js/chibi2-motion.js');
      const W = 210, H = 270, MOMENTS = [0.18, 0.32];
      const cols = Math.max(...rows.map(r => r.clips.length)) * MOMENTS.length;
      const sheet = document.createElement('canvas'); sheet.width = cols * W; sheet.height = rows.length * H;
      sheet.id = 'grip-sheet'; sheet.style.cssText = 'position:absolute;left:0;top:0;z-index:99999'; document.body.appendChild(sheet);   // over the host page, which keeps running
      const g = sheet.getContext('2d'); g.font = '12px sans-serif';
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setSize(W, H);
      const sc = new THREE.Scene(); sc.background = new THREE.Color('#202430');
      sc.add(new THREE.HemisphereLight('#ffffff', '#404050', 2.2));
      const dl = new THREE.DirectionalLight('#fff', 1.4); dl.position.set(2, 4, 3); sc.add(dl);
      const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 40);
      cam.position.set(1.7, 1.15, 2.5); cam.lookAt(0, 0.78, 0);
      let n = 0;
      for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        let x = 0;
        for (const clip of row.clips) for (const at of MOMENTS) {
          // a fresh body per cell: a one-shot clip is then sampled `at` seconds in, with no blend from the last one
          const a = await createChibi2Character(row.avatar, row.anims ? { anims: M[row.anims] } : {});
          a.setAnim(clip); a.update(at); sc.add(a.group);
          r.render(sc, cam);
          g.drawImage(r.domElement, x * W, y * H, W, H);
          g.fillStyle = '#fff'; g.fillText(`${row.label}`, x * W + 6, y * H + 14); g.fillStyle = '#ffd27a'; g.fillText(`${clip} @ ${at}s`, x * W + 6, y * H + 30);
          sc.remove(a.group); a.dispose?.(); x++; n++;
        }
      }
      return n;
    }, rows);
    await page.waitForTimeout(300);
    await page.locator('#grip-sheet').screenshot({ path: `${process.env.GRIP_SHOTS || "test-results"}/grips-${game}.png` });
    expect(errors, errors.join('\n')).toEqual([]);
    expect(made).toBeGreaterThan(0);
  });
}
