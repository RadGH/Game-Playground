// Progress on screen (M12): the milestone moment, Info → Progress (next milestone, landmarks to
// place, achievements), and achievements kept in the browser so they carry over to every world.

import { hooks } from '../ui/hooks.js';

const KEY = 'stoneward.achievements';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ } };

hooks.tick.push((msg, ui) => {
  for (const s of msg.said || []) {
    if (s.milestone) celebrate(ui, `👪 ${s.pop} people — ${s.title}!`, `A chest of ${s.gold} gold and goods has arrived${s.landmark ? `, and you may raise a ${s.landmark.toLowerCase()} (Build → Landmarks)` : ''}.`);
    if (s.achieve) {
      const got = load();
      if (!got[s.achieve]) { got[s.achieve] = new Date().toISOString(); save(got); celebrate(ui, `🏆 ${s.name}`, s.text); ui.cloud?.saveSoon?.(); }
    }
  }
});
function celebrate(ui, title, text) {
  const el = document.createElement('div'); el.className = 'celebrate';
  el.innerHTML = `<b>${ui.esc(title)}</b><span>${ui.esc(text)}</span>`;
  el.addEventListener('click', () => el.remove());
  document.querySelector('#hud').append(el);
  ui.sound?.('quest.complete');
  setTimeout(() => el.remove(), 7000);
}

hooks.infoTabs.push({
  id: 'progress', label: 'Progress',
  render(ui, head) {
    const pr = ui.app.stream?.town?.progress; const p = ui.panel(''); p.append(head);
    if (!pr) return;
    const c = document.createElement('div'); c.className = 'card';
    if (pr.next) {
      const prev = pr.reached.at(-1) || 0, f = Math.max(0, Math.min(1, (pr.pop - prev) / (pr.next.pop - prev)));
      c.innerHTML = `<b>Next: ${pr.next.pop} people — ${ui.esc(pr.next.title)}</b><div class="bar"><i style="width:${Math.round(f * 100)}%"></i></div><span>${pr.pop} now · reward: a chest${pr.next.landmark ? ' and a ' + ui.esc(pr.next.landmark.toLowerCase()) : ''}</span>`;
    } else c.innerHTML = '<b>Every milestone reached.</b>';
    p.append(c);
    if (pr.landmarks.length) { const l = document.createElement('div'); l.className = 'card'; l.innerHTML = `<b>Landmarks to place</b><span>${pr.landmarks.map(k => ui.esc(ui.data.kinds[k]?.name || k)).join(', ')} — in Build → Landmarks</span>`; p.append(l); }
    const got = load(), A = ui.data.achievements || {};
    const a = document.createElement('div'); a.className = 'card';
    a.innerHTML = `<b>Achievements (${Object.keys(got).length} of ${Object.keys(A).length})</b>` + Object.entries(A).map(([id, x]) => `<span style="opacity:${got[id] ? 1 : 0.45}">${got[id] ? '🏆' : '·'} ${ui.esc(x.name)} — ${ui.esc(x.text)}</span>`).join('');
    p.append(a);
  },
});
