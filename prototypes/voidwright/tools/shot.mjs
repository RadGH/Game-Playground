// Screenshot helper: node tools/shot.mjs [name] [script-steps...]  → prototypes/voidwright/shots/<name>.png
import { chromium } from 'playwright';
const name = process.argv[2] || 'shot';
const url = process.env.URL || 'http://localhost:8401/prototypes/voidwright/';
const mobile = process.env.MOBILE === '1';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: mobile ? { width: 402, height: 780 } : { width: 1280, height: 760 }, deviceScaleFactor: 1, hasTouch: mobile });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(url); await p.waitForTimeout(1500);
const steps = process.env.STEPS ? process.env.STEPS.split('~~') : [];
for (const s of steps) {
  const [cmd, ...a] = s.split(':');
  if (cmd === 'click') await p.click(a.join(':'));
  else if (cmd === 'wait') await p.waitForTimeout(+a[0]);
  else if (cmd === 'eval') await p.evaluate(a.join(':'));
  else if (cmd === 'key') await p.keyboard.press(a[0]);
  else if (cmd === 'down') await p.keyboard.down(a[0]);
  else if (cmd === 'up') await p.keyboard.up(a[0]);
  else if (cmd === 'shot') await p.screenshot({ path: `prototypes/voidwright/shots/${a[0]}.png` });
  else if (cmd === 'mouse') { await p.mouse.move(+a[0], +a[1]); }
  else if (cmd === 'mdown') await p.mouse.down(); else if (cmd === 'mup') await p.mouse.up();
}
await p.screenshot({ path: `prototypes/voidwright/shots/${name}.png` });
console.log(JSON.stringify(await p.evaluate(() => window.gameEye?.state?.())).slice(0, 900));
console.log(errs.slice(0, 10).join('\n') || 'no errors');
await b.close();
