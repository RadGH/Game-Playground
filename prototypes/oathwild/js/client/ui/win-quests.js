// The quest log: the world's quests as js/world/quests.js questLog() sees them for me (progress belongs to the world,
// rewards to each player). Tabs: Active · Ready to hand in · Available · Done. Each quest shows its steps (the current
// one marked, with its count), who gave it and who takes it back, the rewards, a Track toggle (the HUD's tracker lists
// tracked quests) and Show on map.
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { live } from './win-services.js';
import { questLog } from '../../world/quests.js';
import { fmt } from '../../../../../shared/format.js';

const REGION = { brightwater_vale: 'Brightwater Vale', thornmere_wilds: 'Thornmere Wilds' };
const TABS = [['active', 'Active'], ['ready', 'Hand in'], ['available', 'Available'], ['done', 'Done']];

/** The world state in the shape the quest engine reads (from the server's 'wstate'). */
export function wsLike(app) {
  const W = app.ws || {};
  const id = app.me?.char?.id;
  return { quests: W.quests || {}, flags: W.flags || [], playerFlags: id ? { [id]: W.my || [] } : {}, shrines: W.shrines || [] };
}
export function myLog(app) {
  const c = app.me?.char;
  if (!c || !app.W) return { active: [], ready: [], available: [], done: [] };
  return questLog(app.W.book, wsLike(app), { playerId: c.id, level: c.level, flags: app.me?.flags || [] });
}
/** Tracked quest ids (the HUD tracker reads this list; new quests are tracked until the player says otherwise). */
export function tracked(app) { if (!Array.isArray(app.settings.tracked)) app.settings.tracked = []; return app.settings.tracked; }

export function open(app, opts = {}) {
  const w = openWin({
    id: 'quests', title: 'Quests', size: 'wide', cls: 'ow-q', tab: opts.tab || 'active',
    tabs: () => { const log = myLog(app); return TABS.map(([id, label]) => ({ id, label, badge: log[id].length ? String(log[id].length) : '' })); },   // worked out at every render (kit.js)
    render(body, tab, win) {
      const log = myLog(app);
      const list = log[tab] || [];
      const sel = list.find(q => q.id === win.data.sel) || list[0] || null;
      if (!list.length) { body.innerHTML = `<p class="ow-empty">${tab === 'active' ? 'No quests on the go. People with something to ask have a mark over their heads.' : tab === 'ready' ? 'Nothing to hand in.' : tab === 'available' ? 'Nobody you know has more to ask right now.' : 'No quests finished yet.'}</p>`; return; }
      const T = tracked(app);
      body.innerHTML = `<div class="ow-q-cols">
        <ul class="ow-q-list">${list.map(q => `<li><button type="button" class="ow-q-item${sel?.id === q.id ? ' ow-q-sel' : ''}" data-q="${esc(q.id)}">
          <span class="ow-q-lvl">${fmt(q.level)}</span><span class="ow-q-name"><b>${esc(q.title)}</b><small>${q.kind === 'main' ? 'Main story' : 'Side quest'} · ${esc(REGION[q.region] || '')}</small></span>
          ${T.includes(q.id) ? `<span class="ow-q-trk">${glyph('eye', 16)}</span>` : ''}${q.rewardWaiting ? `<span class="ow-q-trk ow-gold">${glyph('star', 16)}</span>` : ''}</button></li>`).join('')}</ul>
        ${sel ? detail(app, sel, tab, T) : ''}
      </div>`;
      body.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { win.data.sel = b.dataset.q; win.render(); }; });
      body.querySelector('[data-track]')?.addEventListener('click', e => {
        const id = e.currentTarget.dataset.track, i = T.indexOf(id);
        if (i >= 0) T.splice(i, 1); else T.push(id);
        app.saveSettings(); win.render();
      });
      body.querySelector('[data-onmap]')?.addEventListener('click', e => app.openWindow('map', { focus: JSON.parse(e.currentTarget.dataset.onmap), label: sel.marker?.label }));
    },
  });
  return live(app, w, ['me', 'wstate']);
}

function detail(app, q, tab, T) {
  const steps = q.steps.map(s => `<li class="${s.done ? 'ow-q-done' : s.current ? 'ow-q-now' : ''}">${glyph(s.done ? 'check' : s.current ? 'next' : 'minus', 16)}<span>${esc(s.text)}${s.current && q.progress ? ` <b class="ow-gold">${esc(q.progress)}</b>` : ''}</span></li>`).join('');
  const who = [];
  if (q.giver) who.push(`From ${esc(q.giver.name)}`);
  if (q.turnIn && q.turnIn.id !== q.giver?.id) who.push(`hand in to ${esc(q.turnIn.name)}`);
  return `<article class="ow-q-detail ow-card">
    <h3>${esc(q.title)}</h3>
    <p class="ow-dim">Level ${fmt(q.level)} · ${q.kind === 'main' ? 'Main story' : 'Side quest'}${who.length ? ` · ${who.join(', ')}` : ''}</p>
    ${q.summary ? `<p>${esc(q.summary)}</p>` : ''}
    ${steps ? `<ol class="ow-q-steps">${steps}</ol>` : ''}
    ${tab === 'ready' ? `<p class="ow-gold">${glyph('check', 16)} Done — go back to ${esc(q.turnIn?.name || 'the one who asked')}.</p>` : ''}
    ${q.rewardWaiting ? `<p class="ow-gold">${glyph('star', 16)} Collect your reward from ${esc(q.turnIn?.name || 'the one who asked')}.</p>` : ''}
    ${q.rewards?.length ? `<div class="ow-q-rewards"><span class="ow-dim">Rewards</span>${q.rewards.map(r => `<span class="ow-svc-chip">${esc(r)}</span>`).join('')}</div>` : ''}
    <div class="ow-row ow-q-acts">
      ${tab === 'active' || tab === 'ready' ? `<button type="button" class="ow-btn ow-small" data-track="${esc(q.id)}" data-primary>${glyph('eye', 16)}<span>${T.includes(q.id) ? 'Stop tracking' : 'Track'}</span></button>` : ''}
      ${q.marker ? `<button type="button" class="ow-btn ow-small" data-onmap="${esc(JSON.stringify(q.marker.at))}">${glyph('globe', 16)}<span>Show on map</span></button>` : q.giver && tab === 'available' ? `<button type="button" class="ow-btn ow-small" data-onmap="${esc(JSON.stringify(q.giver.at))}">${glyph('globe', 16)}<span>Where is ${esc(q.giver.name)}?</span></button>` : ''}
    </div>
  </article>`;
}
