// Renders every picture in one icons/data/game/*.js file onto a PNG, so an art batch can be looked at before it ships.
//   node icons/tools/contact-sheet.mjs icons/data/game/items-goods.js out.png [--bg=#2a2018] [--only=id1,id2]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [file, out = 'contact-sheet.png'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
if (!file) { console.error('usage: contact-sheet.mjs <data file> <out.png>'); process.exit(1); }
const mod = await import(pathToFileURL(resolve(file)).href);
const data = mod.default;
const only = opt.only ? new Set(opt.only.split(',')) : null;
const box = /ui\.js$/.test(file) ? 32 : 64;
const motif = /fx-motifs/.test(file);
const bg = opt.bg || (motif ? '#151826' : '#2a2018');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cells = Object.entries(data).filter(([id, v]) => v && v.art && (!only || only.has(id))).map(([id, v]) => {
  const svg = px => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${px}" height="${px}" style="${motif ? 'color:#fff' : ''}">${v.art}</svg>`;
  return `<div class="c"><div class="r">${svg(96)}${svg(48)}${svg(24)}</div><b>${esc(id)}</b><i>${esc(v.name || '')}</i></div>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:${bg};font:11px sans-serif;color:#e8dcc0;display:flex;flex-wrap:wrap;gap:6px;padding:8px;width:1580px}
.c{width:186px;background:rgba(0,0,0,.25);border:1px solid #5a4630;padding:4px}.r{display:flex;align-items:flex-end;gap:6px}b,i{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}i{color:#a89878}</style>${cells}`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 800 } });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log(`${Object.keys(data).length} pictures -> ${out}`);
