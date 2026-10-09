// Play-test 10 Y32 — a class resource on your own frame: the Starcaller's Starlight (five pips that fill as stars land,
// glowing when the next big skill will be empowered) — and, by the same code, any other calling's signature resource
// the server reports (Farhold's `unit.mech.res.<id> = { n, max }`: the Swashbuckler's Flair and the rest).
//
// Until round 10 NO class resource was shown anywhere; the rules kept them and nothing sent them. What this reads:
//   joined.you.res / you {res}:  [{ id, name?, n, max }]      (asked of A / C in docs/requests.md "Round 10 contracts — D-UI")
//   or the event `res {id, n, max, name?}` for one resource
// Up to ten pips; a bigger pool is a thin bar with "n / max". Hidden while you have none. DOM only; rule = resView.

const NAMES = { starlight: 'Starlight', flair: 'Flair' };
const TINT = { starlight: '#e6c14a' };
const nice = id => NAMES[id] || String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** Pure: what to draw for a list of resources — the first one that has a real pool. */
export function resView(list) {
  const r = (Array.isArray(list) ? list : list && typeof list === 'object' ? Object.entries(list).map(([id, v]) => ({ id, ...(v || {}) })) : []).find(x => x && Number(x.max) > 0);
  if (!r) return null;
  const max = Math.round(r.max), n = Math.max(0, Math.min(max, Math.round(Number(r.n) || 0)));
  return { id: r.id, name: r.name || nice(r.id), n, max, pips: max <= 10, full: n >= max, tint: TINT[r.id] || '#e6c14a', text: `${r.name || nice(r.id)} ${n} / ${max}` };
}

export function createClassRes({ parent = null } = {}) {
  const host = parent || document.querySelector('#self-frame .uf-body');
  const root = document.createElement('div'); root.className = 'uf-res'; root.hidden = true;
  host?.appendChild(root);
  let cur = {}, sig = '';
  function draw() {
    const v = resView(cur);
    const s = v ? `${v.id}:${v.n}:${v.max}` : '';
    if (s === sig) return;
    sig = s;
    root.hidden = !v;
    if (!v) { root.replaceChildren(); return; }
    root.style.setProperty('--res', v.tint);
    root.classList.toggle('full', v.full);
    root.dataset.tip = `${v.text}${v.full ? ' — full' : ''}`;
    root.dataset.res = v.id;
    const kids = [];
    if (v.pips) for (let i = 0; i < v.max; i++) { const p = document.createElement('i'); if (i < v.n) p.className = 'on'; kids.push(p); }
    else { const bar = document.createElement('span'); bar.className = 'uf-resbar'; const b = document.createElement('b'); b.style.width = (v.n / v.max * 100).toFixed(1) + '%'; bar.append(b); kids.push(bar); }
    const em = document.createElement('em'); em.textContent = v.pips ? v.name : v.text; kids.push(em);
    root.replaceChildren(...kids);
  }
  const set = list => { cur = Array.isArray(list) ? Object.fromEntries(list.filter(r => r && r.id).map(r => [r.id, r])) : list && typeof list === 'object' ? { ...list } : {}; draw(); };
  function wire(n) {
    n.on('joined', j => set(j?.you?.res || null));
    n.on('you', p => { if (p && 'res' in p) set(p.res); });
    n.on('res', m => { if (m && m.id) { cur = { ...cur, [m.id]: { ...(cur[m.id] || {}), ...m } }; draw(); } });
  }
  return { root, wire, set, get state() { return resView(cur); } };
}
