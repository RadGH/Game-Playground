// Ratings + cookie-free counts (M32, game standards §5). A small card asks "How was <place>?" the first time you leave
// a zone or dungeon (once per place per device) and after a boss falls; 👍/👎 + reasons that say WHAT kind of good or
// bad, and an optional line. Counts: plays, zones entered, deaths, level-ups (no cookies; tests don't count).
const root = () => new URL('../../../../', import.meta.url).href;
const UP = [['fun', 'Fun'], ['pretty', 'Pretty'], ['tense', 'Tense fights'], ['loot', 'Good loot'], ['again', 'Again!'], ['buggy', 'But buggy']];
const DOWN = [['boring', 'Boring'], ['confusing', 'Confusing'], ['hard', 'Too hard'], ['easy', 'Too easy'], ['long', 'Too long'], ['empty', 'Too empty'], ['laggy', 'Laggy'], ['buggy', 'Buggy'], ['unfair', 'Unfair']];
const seenKey = 'rogueloot.rated';
const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { return new Set(); } };
export function maybeRate(zone, name, ctx = {}) {
  if (!zone || seen().has(zone) || document.querySelector('.rate-card')) return;
  const el = document.createElement('div'); el.className = 'rate-card';
  let v = 0; const picked = new Set();
  const draw = () => {
    el.innerHTML = `<b>How was ${name}?</b><div class="thumbs"><button data-v="1" class="${v === 1 ? 'on' : ''}">👍</button><button data-v="-1" class="${v === -1 ? 'on' : ''}">👎</button><button data-x>Not now</button></div>
      ${v ? `<div class="why">${(v > 0 ? UP : DOWN).map(([k, l]) => `<button data-w="${k}" class="${picked.has(k) ? 'on' : ''}">${l}</button>`).join('')}</div><input maxlength="300" placeholder="Tell us more (optional)"><button class="primary" data-send>Send</button>` : ''}`;
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { v = +b.dataset.v; picked.clear(); draw(); });
    el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { picked.has(b.dataset.w) ? picked.delete(b.dataset.w) : picked.add(b.dataset.w); draw(); });
    el.querySelector('[data-x]').onclick = () => { mark(zone); el.remove(); };
    el.querySelector('[data-send]')?.addEventListener('click', () => { send({ zone, v, why: [...picked].join(','), text: el.querySelector('input').value, ...ctx }); mark(zone); el.innerHTML = '<b>Thanks!</b>'; setTimeout(() => el.remove(), 1200); });
  };
  draw(); document.body.append(el);
  setTimeout(() => { if (!v) el.remove(); }, 15000);
}
function mark(z) { const s = seen(); s.add(z); try { localStorage.setItem(seenKey, JSON.stringify([...s])); } catch { /* */ } }
function send(body) { if (navigator.webdriver) return; fetch(root() + 'rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}); }
const queue = []; let timer = 0;
export function tally(name, props) {
  if (navigator.webdriver && !/[?&]tally=1/.test(location.search)) return;
  queue.push({ g: 'rogueloot', e: name, ...(props ? { p: props } : {}) });
  if (!timer) timer = setTimeout(() => { timer = 0; const b = JSON.stringify(queue.splice(0, 20)); fetch(root() + 'tally', { method: 'POST', body: b, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {}); }, 4000);
}
