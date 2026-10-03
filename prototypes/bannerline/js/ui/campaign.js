// Campaign screens (stream F, PLAN §13): "Banners of the Vale".
//
//   const cmp = await loadCampaign()                          index + every ready mission
//   const progress = campaignProgress()                       localStorage (shared/store.js, ns 'bannerline')
//   const screen = createCampaignScreen({ screen, campaign: cmp, progress, onPlay, onBack })
//       chapter tabs (one per hero; planned chapters greyed), a mission map, the briefing with its
//       objectives and stars, Play. Keyboard: arrows pick, Enter plays, Esc goes back; a pad maps to
//       screen.nav(dx, dy) / screen.confirm() / screen.back().
//   const { config, session } = campaignSession(mission, { device, deviceType })
//       config -> createSim AS IS (players included: it carries `campaign: mission`, so the sim runs the
//       script, and `scripted` seats that only the script plays); session is in js/ui/lobby.js's shape
//       for main.js's startMatch (its one 'local' slot is the seat to give a device).
//   const overlay = createCampaignOverlay({ root }); overlay.update(sim) every frame
//       objective tracker (top right) + the last line said (bottom centre)
//   showDebrief({ card, sim, mission, progress, next, onNext, onRetry, onMap })
//       victory / defeat, stars, objectives, time; records progress (best stars, best time)
//
// The sim side is js/sim/campaign.js; missions are data/campaign/*.json.

import { h, setText, toggle, clockText } from './dom.js';
import { icon } from './icons.js';
import { campaignInfo } from '../sim/campaign.js';
import { makeStore } from '../../../../shared/store.js';

const BASE = new URL('../../data/campaign/', import.meta.url);

export async function loadCampaign(fetchJson = url => fetch(url).then(r => r.json())) {
  const index = await fetchJson(new URL('index.json', BASE).href);
  const missions = {};
  for (const c of index.chapters) for (const id of c.missions) missions[id] = await fetchJson(new URL(id + '.json', BASE).href);
  return { index, missions };
}

/** Saved progress: { [missionId]: { stars, bestSeconds, wins } }. */
export function campaignProgress(store = makeStore('bannerline', 1)) {
  const KEY = 'campaign';
  const all = () => store.get(KEY, {}) || {};
  return {
    all,
    get: id => all()[id] || null,
    record(id, { won, stars, seconds }) {
      const a = all(), cur = a[id] || { stars: 0, bestSeconds: null, wins: 0 };
      if (won) { cur.wins++; cur.stars = Math.max(cur.stars, stars); cur.bestSeconds = cur.bestSeconds == null ? seconds : Math.min(cur.bestSeconds, seconds); }
      a[id] = cur; store.set(KEY, a);
      return cur;
    },
    /** A mission is open when it is the first of its chapter or the one before it was won. */
    unlocked(chapter, id) { const i = chapter.missions.indexOf(id); return i === 0 || !!(all()[chapter.missions[i - 1]]?.wins); },
    clear() { store.remove(KEY); },
  };
}

/** A mission -> the sim config and a lobby-shaped session (one local seat, the rest AI). */
export function campaignSession(mission, { device = 'kbm', deviceType = 'keyboard' } = {}) {
  const config = { ...mission.config, mode: 'linewar', campaign: mission };
  const perTeam = [0, 0];
  const slots = mission.config.players.map((p, i) => {
    const index = perTeam[p.team]++;
    const base = { key: `${p.team}-${index}`, team: p.team, index, race: p.race, hero: p.hero };
    if (i === (mission.player ?? 0)) return { ...base, kind: 'local', player: 1, device, deviceType, ready: true };
    // a `scripted` seat has no AI and no player: only the mission script sends for it
    if (p.scripted) return { ...base, kind: 'scripted', name: p.name };
    return { ...base, kind: 'ai', ai: (p.ai && p.ai.difficulty) || 'recruit', name: p.name };
  });
  const session = { game: 'linewar', mode: mission.config.format, map: mission.config.map || 'vale', slots, campaign: mission, rules: mission.config.rules || {} };
  return { config, session };
}

const stars = (n, max) => Array.from({ length: max }, (_, i) => `<span class="cp-star${i < n ? ' on' : ''}">${icon('rally')}</span>`).join('');
/** Vertical place of mission i of n on the map, in percent (room left below for the name + stars). */
const nodeY = (i, n) => (n <= 1 ? 40 : 8 + i * (74 / (n - 1)));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createCampaignScreen({ screen, campaign, progress, onPlay, onBack }) {
  const { index, missions } = campaign;
  let chapterIdx = Math.max(0, index.chapters.findIndex(c => c.status === 'ready'));
  let pick = 0;
  const root = h('div', 'campaign');
  screen.replaceChildren(root);

  function chapter() { return index.chapters[chapterIdx]; }
  function firstOpen(c) { let i = 0; for (let k = 0; k < c.missions.length; k++) if (progress.unlocked(c, c.missions[k])) i = k; return i; }

  function render() {
    const c = chapter();
    const ready = c.status === 'ready';
    const ms = c.missions.map(id => missions[id]);
    if (pick >= ms.length) pick = Math.max(0, ms.length - 1);
    const m = ms[pick];
    const prog = m ? progress.get(m.id) : null;
    const open = m ? progress.unlocked(c, m.id) : false;
    const earned = ms.reduce((s, x) => s + (progress.get(x.id)?.stars || 0), 0);
    const maxAll = ms.reduce((s, x) => s + 1 + (x.stars || []).length, 0);
    root.innerHTML = `
      <header class="cp-top">
        <button class="cp-back" data-act="back">‹ Back</button>
        <div class="cp-title"><h1>${esc(index.title)}</h1><span>Campaign · ${earned} / ${maxAll} stars</span></div>
      </header>
      <nav class="cp-chapters">${index.chapters.map((x, i) => `<button class="cp-chapter${i === chapterIdx ? ' on' : ''}${x.status !== 'ready' ? ' locked' : ''}" data-chapter="${i}"
        data-tip="${x.status === 'ready' ? esc(x.blurb) : 'Coming later, with new heroes.'}"><b>${esc(x.name)}</b><small>${esc(x.hero[0].toUpperCase() + x.hero.slice(1))}${x.status === 'ready' ? '' : ' · later'}</small></button>`).join('')}</nav>
      <div class="cp-body">
        <section class="cp-map">
          ${ready ? `<svg class="cp-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="${ms.map((_, i) => `${i ? 'L' : 'M'} ${30 + (i % 2) * 40} ${nodeY(i, ms.length)}`).join(' ')}"/></svg>` : ''}
          ${ready ? ms.map((x, i) => {
            const pr = progress.get(x.id), op = progress.unlocked(c, x.id);
            return `<button class="cp-node${i === pick ? ' on' : ''}${op ? '' : ' locked'}${pr?.wins ? ' won' : ''}" data-pick="${i}" style="left:${30 + (i % 2) * 40}%;top:${nodeY(i, ms.length)}%">
              <span class="cp-num">${i + 1}</span><span class="cp-name">${esc(x.name)}</span><span class="cp-stars">${stars(pr?.stars || 0, 1 + (x.stars || []).length)}</span></button>`;
          }).join('') : `<p class="cp-later">${esc(c.name)} arrives with its hero in a later update.</p>`}
        </section>
        <aside class="cp-brief">${m ? `
          <div class="cp-place">${esc(m.place || '')}</div>
          <h2>${pick + 1}. ${esc(m.name)}</h2>
          ${m.briefing.map(t => `<p>${esc(t)}</p>`).join('')}
          <h3>Objectives</h3>
          <ul class="cp-obj">${m.objectives.filter(o => !o.after).map(o => `<li class="${o.optional ? 'opt' : ''}">${o.optional ? icon('rally') : icon('flag')}<span>${esc(o.text)}</span></li>`).join('')}
            ${m.objectives.some(o => o.after) ? '<li class="more">…and more as the mission goes on</li>' : ''}</ul>
          <div class="cp-best">${stars(prog?.stars || 0, 1 + (m.stars || []).length)}${prog?.bestSeconds != null ? `<span>Best ${clockText(prog.bestSeconds)}</span>` : ''}</div>
          <button class="cp-play${open ? '' : ' off'}" data-act="play" ${open ? '' : 'disabled'}>${open ? 'Play' : 'Win the mission before'} <kbd>Enter</kbd></button>` : '<p>No missions yet.</p>'}
        </aside>
      </div>`;
  }

  function select(i) { const n = chapter().missions.length; if (!n) return; pick = (i + n) % n; render(); }
  function setChapter(i) { chapterIdx = (i + index.chapters.length) % index.chapters.length; pick = chapter().status === 'ready' ? firstOpen(chapter()) : 0; render(); }
  function play() { const c = chapter(); const m = missions[c.missions[pick]]; if (m && progress.unlocked(c, m.id)) onPlay && onPlay(m); }

  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'back') onBack && onBack();
    else if (b.dataset.act === 'play') play();
    else if (b.dataset.pick != null) { if (Number(b.dataset.pick) === pick) play(); else select(Number(b.dataset.pick)); }
    else if (b.dataset.chapter != null) setChapter(Number(b.dataset.chapter));
  });
  const onKey = e => {
    if (root.hidden || !root.isConnected) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { select(pick + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { select(pick - 1); e.preventDefault(); }
    else if (e.key === 'Tab' || e.key === 'PageDown') { setChapter(chapterIdx + (e.shiftKey ? -1 : 1)); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { play(); e.preventDefault(); }
    else if (e.key === 'Escape') onBack && onBack();
  };
  addEventListener('keydown', onKey);
  pick = firstOpen(chapter());
  render();
  return {
    root, render,
    show() { root.hidden = false; render(); }, hide() { root.hidden = true; },
    nav(dx, dy) { if (dy) select(pick + dy); else if (dx) setChapter(chapterIdx + dx); },
    confirm: play, back: () => onBack && onBack(),
    destroy() { removeEventListener('keydown', onKey); root.remove(); },
  };
}

/** In-match objective tracker + dialogue line. Reads the sim; builds once, then only updates text. */
export function createCampaignOverlay({ root }) {
  const el = h('div', 'cp-overlay');
  const box = h('div', 'cp-track');
  const head = h('div', 'cp-track-head');
  const list = h('ul', 'cp-track-list');
  box.append(head, list);
  const say = h('div', 'cp-say');
  const who = h('b'), line = h('span');
  say.append(who, line);
  el.append(box, say);
  root.append(el);
  let lastLog = -1, sayUntil = 0, rows = [];
  return {
    update(sim) {
      const info = campaignInfo(sim.state, sim.data);
      if (!info) return;
      setText(head, info.name + (info.timeLimit ? ` · ${clockText(info.timeLimit - sim.tick / 20)} left` : ''));
      if (rows.length !== info.objectives.length) {
        list.replaceChildren(); rows = info.objectives.map(() => { const li = h('li'); const t = h('span'); const c = h('i'); li.append(t, c); list.append(li); return { li, t, c }; });
      }
      info.objectives.forEach((o, i) => {
        const r = rows[i];
        setText(r.t, o.text); setText(r.c, o.counted && !o.done ? `${o.have}/${o.need}` : o.done ? '✓' : '');
        toggle(r.li, 'done', o.done); toggle(r.li, 'opt', o.optional); toggle(r.li, 'star', o.star);
      });
      const L = info.log[info.log.length - 1];
      if (L && L.tick !== lastLog) { lastLog = L.tick; setText(who, L.who ? L.who + ':' : ''); setText(line, ' ' + L.text); sayUntil = sim.tick + 20 * Math.max(5, L.text.length / 12); }
      toggle(say, 'on', sim.tick < sayUntil);
    },
    destroy() { el.remove(); },
  };
}

/** The end-of-mission card. Records progress; returns { won, stars }. */
export function showDebrief({ card, sim, mission, progress, next, onNext, onRetry, onMap }) {
  const info = campaignInfo(sim.state, sim.data);
  const won = info.outcome === 'won';
  const seconds = Math.round((sim.state.result ? sim.state.result.tick : sim.tick) / 20);
  if (progress) progress.record(mission.id, { won, stars: info.stars, seconds });
  card.innerHTML = `
    <div class="cp-debrief ${won ? 'won' : 'lost'}">
      <div class="cp-place">${esc(mission.place || '')}</div>
      <h1>${won ? 'Victory' : 'Defeat'}</h1>
      <h2>${esc(mission.name)}</h2>
      <div class="cp-stars big">${stars(info.stars, info.maxStars)}</div>
      <ul class="cp-obj">
        <li class="${won ? 'done' : ''}">${icon('flag')}<span>Win the mission</span></li>
        ${info.objectives.map(o => `<li class="${o.done ? 'done' : ''} ${o.optional ? 'opt' : ''}">${icon(o.star ? 'rally' : 'flag')}<span>${esc(o.text)}</span></li>`).join('')}
      </ul>
      <p class="cp-time">Time ${clockText(seconds)}${sim.state.result && sim.state.result.reason === 'time' ? ' · out of time' : ''}</p>
      <div class="cp-buttons">
        ${won && next ? '<button class="cp-play" data-act="next">Next mission <kbd>Enter</kbd></button>' : ''}
        <button data-act="retry">${won ? 'Play again' : 'Try again'}</button>
        <button data-act="map">Campaign map</button>
      </div>
    </div>`;
  card.onclick = e => {
    const a = e.target.closest('button')?.dataset.act;
    if (a === 'next') onNext && onNext(next); else if (a === 'retry') onRetry && onRetry(mission); else if (a === 'map') onMap && onMap();
  };
  return { won, stars: info.stars };
}
