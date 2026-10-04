// The small /status.html page (stream A): polls /status every 2 s. Read-only numbers.
export function statusPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thousandvale status</title>
<style>
:root{--bg:#14161a;--fg:#e6e2d8;--dim:#8a8f98;--ok:#6fbf73;--warn:#e0a84a;--bad:#e06a5a;--card:#1d2026}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.c{background:var(--card);border-radius:6px;padding:10px}.k{color:var(--dim);font-size:12px}.v{font-size:20px;font-variant-numeric:tabular-nums}
pre{background:var(--card);padding:10px;border-radius:6px;overflow:auto;font-size:12px}
</style></head><body><h1>Thousandvale server</h1><div class="grid" id="g"></div><pre id="raw"></pre>
<script>
const cell=(k,v,cls='')=>'<div class="c"><div class="k">'+k+'</div><div class="v '+cls+'">'+v+'</div></div>';
async function poll(){try{const s=await (await fetch('status',{cache:'no-store'})).json();
const t=s.tick;const tone=v=>v>50?'style="color:var(--bad)"':v>20?'style="color:var(--warn)"':'style="color:var(--ok)"';
document.getElementById('g').innerHTML=cell('Players online',s.ccu)+cell('Tick p50 ms',t.p50)+cell('Tick p99 ms','<span '+tone(t.p99)+'>'+t.p99+'</span>')+cell('Worst tick (10 min)','<span '+tone(t.worst10m)+'>'+t.worst10m+'</span>')+cell('Messages in /s',s.msgsInPerSec)+cell('Bytes out /s',s.bytesOutPerSec)+cell('Saves ok / failed',s.saves.done+' / '+s.saves.failed)+cell('Uptime s',s.uptime)+cell('Heap MB',s.heapMB)+cell('Rules',s.rules)+cell('DB',s.db)+cell('Build',s.build);
document.getElementById('raw').textContent=JSON.stringify(s,null,2);}catch(e){document.getElementById('raw').textContent='offline: '+e.message}}
poll();setInterval(poll,2000);
</script></body></html>`;
}
