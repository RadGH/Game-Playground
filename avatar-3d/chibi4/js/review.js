// Chibi 4 review page: one card per step from data/steps.json (shots, how it was made, scorecard, notes).
const host = document.getElementById('steps');
const steps = await (await fetch('data/steps.json', { cache: 'no-store' })).json();
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
for (const s of steps) {
  const card = el('section', 'step' + (s.pending ? ' pending' : ''));
  card.append(el('h2', '', s.title));
  if (s.how) card.append(el('p', 'how', s.how));
  if (s.pending && !s.shots) { card.append(el('p', '', 'Not done yet.')); host.append(card); continue; }
  if (s.shots) {
    const g = el('div', 'shots');
    for (const [src, cap] of s.shots) {
      const f = el('figure'); const a = el('a'); a.href = src; a.target = '_blank';
      const img = el('img'); img.src = src; img.alt = cap; img.loading = 'lazy'; a.append(img);
      f.append(a, el('figcaption', '', cap)); g.append(f);
    }
    card.append(g);
  }
  if (s.review) card.append(el('p', 'review', s.review));
  if (s.score) {
    const t = el('table', 'score');
    for (const [k, v] of s.score) { const tr = el('tr'); tr.append(el('td', '', k), el('td', '', v)); t.append(tr); }
    card.append(t);
  }
  if (s.notes) { const ul = el('ul', 'notes'); for (const n of s.notes) ul.append(el('li', '', n)); card.append(ul); }
  host.append(card);
}
