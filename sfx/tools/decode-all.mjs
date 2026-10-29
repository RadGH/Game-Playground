// Decode every recording the catalog maps, in a real (headless) browser, through the library itself.
// node sfx/tools/decode-all.mjs   (needs the dev server on 8401)
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('console', m => /warn|error/.test(m.type()) && errs.push(m.text()));
await p.goto('http://localhost:8401/sfx/');
const r = await p.evaluate(async () => {
  const { Sfx } = await import('/sfx/js/sfx.js');
  const sfx = await Sfx.create({ method: 'library', volume: 0 });
  let n = 0, bad = [], loud = [];
  for (const id of sfx.ids()) {
    const e = sfx.entry(id);
    for (let v = 0; v < e.library.files.length; v++) {
      try { const rec = await sfx.load(id, v); n++; if (rec.via && rec.via !== 'library') bad.push(id + ' via ' + rec.via); }
      catch (err) { bad.push(id + ' #' + v + ': ' + err.message); }
    }
  }
  return { n, bad };
});
console.log(JSON.stringify(r), errs.slice(0, 10));
await b.close();
