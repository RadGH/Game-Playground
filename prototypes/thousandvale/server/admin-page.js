// The admin page itself (stream A): one self-contained HTML page served by server/admin.mjs on 127.0.0.1.
// Plain JS, no libraries; the token is kept in sessionStorage for this tab only.

export function adminPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thousandvale admin</title>
<style>
:root { color-scheme: dark; --bg: #121417; --panel: #1b1f24; --line: #2c333b; --text: #dde3ea; --dim: #8a96a3; --warn: #e0a84a; --bad: #e06a5a; --ok: #6ac48a; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: var(--bg); color: var(--text); }
header { display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
header h1 { font-size: 16px; margin: 0 12px 0 0; }
nav button, .btn { background: #262c33; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
nav button.on { background: #34404c; border-color: #4b5b6b; }
.btn.bad { border-color: #6b3a33; } .btn.warn { border-color: #6b5633; }
main { padding: 16px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: 600; }
.dim { color: var(--dim); } .ok { color: var(--ok); } .bad { color: var(--bad); } .warn { color: var(--warn); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 16px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
.card b { display: block; font-size: 20px; }
input, select { background: #0e1013; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
pre { white-space: pre-wrap; background: #0e1013; padding: 8px; border-radius: 6px; font-size: 12px; }
#msg { margin-left: auto; }
</style></head><body>
<header><h1>Thousandvale admin</h1>
<nav id="tabs"></nav>
<span class="row"><input id="tok" type="password" placeholder="admin token" size="28"><button class="btn" id="save">Use token</button></span>
<span id="msg" class="dim"></span></header>
<main id="main"><p class="dim">Paste the admin token (TV_ADMIN_TOKEN, or the admin-token file next to the server's data).</p></main>
<script>
const TABS = ['overview', 'online', 'rooms', 'chat', 'reports', 'feedback', 'resets', 'economy', 'owner'];
let tab = 'overview', token = '';
try { token = sessionStorage.getItem('tv.admin') || ''; } catch {}
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = t => t ? new Date(t).toLocaleString() : '';
function say(t, cls = 'dim') { const m = $('#msg'); m.textContent = t; m.className = cls; }
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) { say('Wrong token.', 'bad'); throw new Error('token'); }
  return r.json();
}
function tabs() { $('#tabs').innerHTML = TABS.map(t => '<button data-t="' + t + '" class="' + (t === tab ? 'on' : '') + '">' + t + '</button>').join(' '); }
$('#tabs').onclick = e => { const t = e.target.dataset.t; if (t) { tab = t; tabs(); show(); } };
$('#save').onclick = () => { token = $('#tok').value.trim(); try { sessionStorage.setItem('tv.admin', token); } catch {} show(); };
async function act(path, body, label) { try { const r = await api(path, body); say(label + ': ' + (r.ok ? 'done' : (r.why || 'refused')), r.ok ? 'ok' : 'bad'); show(); } catch (e) { say(String(e.message), 'bad'); } }
window.act = act;
const views = {
  async overview() {
    const o = await api('/api/overview'); const s = o.status, g = o.gateway;
    const cards = [['Online', s.ccu], ['Tick p99 ms', s.tick && s.tick.p99], ['Worst tick ms', s.tick && (s.tick.worst10m ?? s.tick.max)], ['Rooms', (s.rooms || []).length], ['Out KB/s', Math.round((s.bytesOutPerSec || 0) / 1024)], ['Heap MB', s.heapMB], ['Parties', g.gateway.parties], ['Guilds (cached)', g.gateway.guilds], ['Reports', g.gateway.reports], ['Chat lines', g.gateway.chatLines], ['Callboard queued', g.callboard.queued], ['Event', g.director.state]];
    return '<div class="cards">' + cards.map(([k, v]) => '<div class="card"><span class="dim">' + k + '</span><b>' + esc(v ?? '-') + '</b></div>').join('') + '</div><pre>' + esc(JSON.stringify(g.director, null, 1)) + '</pre>';
  },
  async online() {
    const l = await api('/api/online');
    return '<table><tr><th>Name</th><th>Lvl</th><th>Class</th><th>Room</th><th>Zone</th><th>Acct</th><th>Claimed</th><th>Muted</th><th></th></tr>' + l.map(p =>
      '<tr><td>' + esc(p.name) + (p.online ? '' : ' <span class="dim">(away)</span>') + '</td><td>' + p.level + '</td><td>' + esc(p.cls) + '</td><td>' + esc(p.room) + '</td><td>' + esc(p.zone) + '</td><td>' + esc(p.account) + '</td><td>' + (p.claimed ? 'yes' : '<span class="dim">guest</span>') + '</td><td>' + (p.mutedUntil > Date.now() ? '<span class="warn">' + when(p.mutedUntil) + '</span>' : '') + '</td><td>' +
      '<button class="btn" onclick="act(\\'/api/kick\\',{char:' + p.char + '},\\'kick\\')">kick</button> ' +
      '<button class="btn warn" onclick="act(\\'/api/mute\\',{char:' + p.char + ',minutes:+prompt(\\'Mute minutes\\',\\'30\\')},\\'mute\\')">mute</button> ' +
      '<button class="btn" onclick="act(\\'/api/unmute\\',{char:' + p.char + '},\\'unmute\\')">unmute</button> ' +
      '<button class="btn bad" onclick="if(confirm(\\'Ban this account?\\'))act(\\'/api/ban\\',{char:' + p.char + ',hours:+prompt(\\'Ban hours\\',\\'24\\'),reason:prompt(\\'Reason\\',\\'\\'),ip:confirm(\\'Also ban their address?\\')},\\'ban\\')">ban</button> ' +
      '<button class="btn" onclick="act(\\'/api/rename\\',{char:' + p.char + ',name:prompt(\\'New name\\')},\\'rename\\')">rename</button></td></tr>').join('') + '</table>' + (l.length ? '' : '<p class="dim">Nobody online.</p>');
  },
  async rooms() { const l = await api('/api/rooms'); return '<table><tr><th>Room</th><th>Kind</th><th>Players</th><th>Monsters</th><th>Entities</th></tr>' + l.map(r => '<tr><td>' + esc(r.id) + ' <span class="dim">' + esc(r.name || '') + '</span></td><td>' + r.kind + '</td><td>' + r.players + '</td><td>' + r.monsters + '</td><td>' + (r.entities ?? '') + '</td></tr>').join('') + '</table>'; },
  async chat() { const l = await api('/api/chat'); return '<table><tr><th>When</th><th>Ch</th><th>From</th><th>To</th><th>Text</th></tr>' + l.slice().reverse().map(r => '<tr><td class="dim">' + when(r.at) + '</td><td>' + esc(r.ch) + '</td><td>' + esc(r.name) + ' <span class="dim">#' + esc(r.from) + '</span></td><td class="dim">' + esc(r.to) + '</td><td>' + esc(r.text) + '</td></tr>').join('') + '</table>'; },
  async reports() { const l = await api('/api/reports'); return '<table><tr><th>When</th><th>About</th><th>From</th><th>Why</th><th>Text / their lines</th><th></th></tr>' + l.map(r => '<tr><td class="dim">' + when(r.created) + '</td><td>' + esc(r.aboutName) + ' <span class="dim">#' + esc(r.aboutChar) + '</span></td><td>' + esc(r.fromName) + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.text) + '<pre>' + esc((r.chat || []).map(c => '[' + c.ch + '] ' + c.text).join('\\n')) + '</pre></td><td>' + (r.handled ? '<span class="ok">done</span>' : '<button class="btn" onclick="act(\\'/api/report-done\\',{id:' + r.id + '},\\'report\\')">mark done</button>') + '</td></tr>').join('') + '</table>'; },
  async feedback() {
    const st = window.fbState || '', kd = window.fbKind || '';
    const r = await api('/api/feedback?state=' + encodeURIComponent(st) + '&kind=' + encodeURIComponent(kd));
    const c = r.counts || {};
    const pick = (name, cur, vals) => vals.map(v => '<button class="btn' + (cur === v[0] ? ' on' : '') + '" onclick="window.' + name + '=\\'' + v[0] + '\\';show()">' + v[1] + '</button>').join(' ');
    const btn = (id, s, label, cls) => '<button class="btn ' + (cls || '') + '" onclick="act(\\'/api/feedback-state\\',{id:' + id + ',state:\\'' + s + '\\'},\\'feedback\\')">' + label + '</button>';
    const ctx = o => Object.entries(o || {}).filter(e => e[0] !== 'logs' && e[1] !== null && typeof e[1] !== 'object').map(e => e[0] + ' ' + e[1]).join(' · ');
    return '<p class="dim">Suggestions and bug reports sent from the game (T19). ' + (c.new || 0) + ' new, ' + (c.approved || 0) + ' approved, ' + (c.declined || 0) + ' declined, ' + (c.completed || 0) + ' completed, ' + (c.trashed || 0) + ' trashed. The same list as Markdown: <code>node tools/feedback-report.mjs</code></p>' +
      '<div class="row">State: ' + pick('fbState', st, [['', 'all but trashed'], ['new', 'new'], ['approved', 'approved'], ['declined', 'declined'], ['completed', 'completed'], ['trashed', 'trashed']]) + ' &nbsp; Kind: ' + pick('fbKind', kd, [['', 'both'], ['bug', 'bugs'], ['suggestion', 'suggestions']]) + '</div>' +
      '<table><tr><th>#</th><th>When</th><th>Kind</th><th>From</th><th>Report</th><th>State</th><th></th></tr>' + (r.list || []).map(f => '<tr><td class="dim">' + f.id + '</td><td class="dim">' + when(f.at) + '</td><td>' + esc(f.kind) + '</td><td>' + esc(f.name || '') + ' <span class="dim">' + (f.level ? 'L' + f.level + ' ' + esc(f.cls || '') : '') + ' acct ' + esc(f.account) + '</span></td><td>' + esc(f.text) +
        '<div class="dim">' + esc(ctx(f.server)) + '</div>' + (ctx(f.client) ? '<div class="dim">client: ' + esc(ctx(f.client)) + '</div>' : '') + ((f.client && f.client.logs && f.client.logs.length) ? '<details><summary>' + f.client.logs.length + ' log lines</summary><pre>' + esc(f.client.logs.join('\\n')) + '</pre></details>' : '') + (f.ref != null ? '<div class="dim">Reply to #' + f.ref + '</div>' : '') + (f.note ? '<div>Note: ' + esc(f.note) + '</div>' : '') + (f.done ? '<div class="ok">Completed: ' + esc(f.done) + '</div>' : '') + '</td><td>' + esc(f.state) + (f.stateBy ? ' <span class="dim">' + esc(f.stateBy) + '</span>' : '') + '</td><td>' +
        btn(f.id, 'approved', 'approve', 'ok') + ' ' + btn(f.id, 'declined', 'decline', 'warn') + ' ' + '<button class="btn ok" onclick="var n=prompt(\\'How was it fixed? (the player who sent it reads this)\\');if(n!==null)act(\\'/api/feedback-state\\',{id:' + f.id + ',state:\\'completed\\',note:n},\\'feedback\\')">complete</button> ' + btn(f.id, 'trashed', 'trash', 'bad') + ' ' + btn(f.id, 'new', 'new', '') + '</td></tr>').join('') + '</table>' + ((r.list || []).length ? '' : '<p class="dim">Nothing here.</p>');
  },
  async resets() { const l = await api('/api/resets'); return '<p class="dim">Password reset codes (the game sends no email). Pass a live code to the player; it works once, for an hour.</p><table><tr><th>When</th><th>Username</th><th>Email</th><th>Code</th><th>State</th></tr>' + l.map(r => '<tr><td class="dim">' + when(r.at) + '</td><td>' + esc(r.username) + '</td><td>' + esc(r.email || '') + '</td><td><b>' + esc(r.code) + '</b></td><td>' + (r.used ? 'used' : r.live ? '<span class="ok">live until ' + when(r.until) + '</span>' : '<span class="dim">expired</span>') + '</td></tr>').join('') + '</table>'; },
  async economy() {
    const e = await api('/api/economy?hours=24'); const s = e.sum;
    const reasons = k => Object.entries(s[k].byReason).sort((a, b) => b[1].gold - a[1].gold).map(([r, v]) => '<tr><td>' + esc(r) + '</td><td>' + v.gold + '</td><td>' + v.items + '</td><td>' + v.count + '</td></tr>').join('');
    return '<div class="cards"><div class="card"><span class="dim">Gold in (24 h)</span><b>' + s.faucet.gold + '</b></div><div class="card"><span class="dim">Gold out (24 h)</span><b>' + s.sink.gold + '</b></div><div class="card"><span class="dim">Items in</span><b>' + s.faucet.items + '</b></div><div class="card"><span class="dim">Items out</span><b>' + s.sink.items + '</b></div></div>' +
      '<h3>Faucets</h3><table><tr><th>Reason</th><th>Gold</th><th>Items</th><th>Count</th></tr>' + reasons('faucet') + '</table><h3>Sinks</h3><table><tr><th>Reason</th><th>Gold</th><th>Items</th><th>Count</th></tr>' + reasons('sink') + '</table>';
  },
  async owner() {
    return '<h3>Announce to everyone</h3><div class="row"><input id="ann" size="60" maxlength="300" placeholder="Server restart in 5 minutes"><button class="btn" onclick="act(\\'/api/announce\\',{text:document.getElementById(\\'ann\\').value},\\'announce\\')">Send</button></div>' +
      '<h3>Start a realm event now</h3><div class="row"><input id="evid" placeholder="world_grimtallow (empty = first)"><button class="btn warn" onclick="act(\\'/api/event\\',{id:document.getElementById(\\'evid\\').value,announceMs:60000},\\'event\\')">Start in 1 min</button></div>' +
      '<h3>Ban by account id</h3><div class="row"><input id="bacct" placeholder="account id" size="10"><button class="btn bad" onclick="act(\\'/api/ban\\',{account:+document.getElementById(\\'bacct\\').value,hours:+prompt(\\'Hours\\',\\'24\\'),reason:prompt(\\'Reason\\',\\'\\')},\\'ban\\')">Ban</button><button class="btn" onclick="act(\\'/api/unban\\',{account:+document.getElementById(\\'bacct\\').value},\\'unban\\')">Unban</button></div>';
  },
};
async function show() {
  tabs();
  if (!token) return;
  try { $('#main').innerHTML = await views[tab](); say('Updated ' + new Date().toLocaleTimeString()); } catch (e) { if (e.message !== 'token') say(String(e.message), 'bad'); }
}
$('#tok').value = token;
show();
setInterval(() => { if (tab === 'overview' || tab === 'online' || tab === 'chat') show(); }, 10000);
</script></body></html>`;
}
