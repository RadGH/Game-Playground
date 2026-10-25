// "My runs": this device's finished Flag Runs (time, site, best) and the vehicle ratings it gave — local only
// (localStorage), shown from the title. Recorded by the UI itself from the room's `run` / `rate` traffic.
import { store, el, esc, fmtTime } from './dom.js';

const KEY = 'roverlands.history';
export function createHistory() {
  const H = store.get(KEY, null) || { runs: [], ratings: [] };
  const save = () => store.set(KEY, H);
  return {
    addRun(r) { H.runs.unshift({ at: Date.now(), ...r }); H.runs = H.runs.slice(0, 60); save(); },
    addRating(r) { H.ratings.unshift({ at: Date.now(), ...r }); H.ratings = H.ratings.slice(0, 60); save(); },
    get runs() { return H.runs; }, get ratings() { return H.ratings; },
    best(seed, site) { const L = H.runs.filter(r => r.seed === seed && r.site === site).map(r => r.ms); return L.length ? Math.min(...L) : null; },
  };
}
export function openHistory({ layers, history, vehicleName = k => k }) {
  const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const bestBy = new Map();
  for (const r of history.runs) { const k = `${r.seed}:${r.site}`; if (!bestBy.has(k) || r.ms < bestBy.get(k).ms) bestBy.set(k, r); }
  const node = el('div', 'rl-modal', `<div class="rl-panel rl-history"><h2>My runs</h2>
    <h3>Best Flag Run times</h3>
    ${bestBy.size ? `<table class="rl-table"><tr><th>Flag site</th><th>Best</th><th>Runs</th></tr>${[...bestBy.values()].map(r => `<tr><td>${esc(r.siteName || r.site)}</td><td><b>${fmtTime(r.ms)}</b></td><td>${history.runs.filter(x => x.site === r.site && x.seed === r.seed).length}</td></tr>`).join('')}</table>` : '<p class="rl-note">No finished runs yet. Bring a flag home to set a time.</p>'}
    <h3>Recent runs</h3>
    ${history.runs.length ? `<table class="rl-table">${history.runs.slice(0, 12).map(r => `<tr><td>${day(r.at)}</td><td>${esc(r.siteName || r.site)}</td><td>${fmtTime(r.ms)}</td><td>${r.online ? 'online' : 'solo'}</td></tr>`).join('')}</table>` : '<p class="rl-note">Nothing yet.</p>'}
    <h3>Vehicles you rated</h3>
    ${history.ratings.length ? `<table class="rl-table">${history.ratings.slice(0, 12).map(r => `<tr><td>${day(r.at)}</td><td>${esc(vehicleName(r.what))}</td><td>${r.up ? '👍' : '👎'}</td><td>${esc((r.labels || []).join(', '))}</td></tr>`).join('')}</table>` : '<p class="rl-note">You rate a vehicle after driving it for a minute.</p>'}
    <div class="rl-row end"><button class="rl-btn primary" data-back>Close</button></div></div>`);
  const rec = layers.push(node, { kind: 'history', onBack: () => rec.close() });
  node.addEventListener('click', e => { if (e.target === node || e.target.closest('[data-back]')) rec.close(); });
  return rec;
}
