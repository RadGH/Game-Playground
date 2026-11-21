// Results after a cleared chapter: time (and a new best), defeats, then a card per hero — damage, defeats, experience
// and levels gained, gold, every item found in its rarity colour. Then a thumbs up/down with reasons that say what kind
// of good or bad (game-standards §5) and a "Tell us more" box — sent like a report (kind 'rating', rgs-api
// playground.reports) and kept on this device. Continue plays the closing scene, then the map.
import { hp as n } from '../../../../shared/format.js';
import { icon } from './icons.js';
import { esc, CLASS_NAMES, itemName, rarityName, rarityColor, timeText } from './text.js';
import { sendReport, context } from './report.js';

const GOOD = ['Great fights', 'The story', 'Good loot', 'Right difficulty', 'Looked lovely', 'The boss'];
const BAD = ['Too hard', 'Too easy', 'Too long', 'Confusing', 'Controls felt off', 'Unfair boss', 'Not enough loot'];
const RATINGS = 'wyrmroad.ratings';

export function resultsScreen(app, { result, leadId, party } = {}) {
  const { data } = app;
  if (!result) { app.go('title'); return; }
  const ch = data.chapters.chapters[result.chIndex];
  const lead = app.hero(leadId);
  const mine = result.rows.filter(r => !r.bot), first = mine.length > 0 && mine.every(r => !r.best), newBest = !first && mine.some(r => r.best && Math.round(result.time) < r.best);
  const vote = { up: null, reasons: new Set(), sent: false };
  app.ui.innerHTML = `<section class="wr-screen wr-results">
    <header class="wr-results-head">
      <p class="wr-kicker">Chapter ${n(result.chIndex + 1)} cleared</p>
      <h2>${esc(ch.name)}</h2>
      <div class="wr-results-sum">
        <span>${icon('clock')}<b>${timeText(result.time)}</b>${first ? '<em>First clear</em>' : newBest ? '<em>New best</em>' : ''}</span>
        <span>${icon('skull')}<b>${n(result.kills)}</b> defeated</span>
      </div>
      <button type="button" class="wr-icon-btn wr-results-menu" data-act="menu" aria-label="Menu">${icon('menu')}</button>
    </header>
    <div class="wr-results-rows">${result.rows.map((r, i) => `<article class="wr-res-card" style="--pc:${r.color || '#ccc'}">
      <div class="wr-portrait wr-portrait-md" data-p="${i}"><span class="wr-portrait-wait"></span></div>
      <div class="wr-res-main">
        <h3>${esc(r.name)} <small>${esc(CLASS_NAMES[r.cls])}${r.bot ? ' · companion' : ''}</small></h3>
        <ul class="wr-res-nums">
          <li><b>${n(r.damage)}</b><span>damage</span></li><li><b>${n(r.kills)}</b><span>defeated</span></li>
          <li><b>+${n(r.xp)}</b><span>experience</span></li><li><b>+${n(r.gold)}</b><span>gold</span></li>
        </ul>
        ${r.to > r.from ? `<p class="wr-res-lv">${icon('arrowUp')}<span>Level ${n(r.from)} → <b>${n(r.to)}</b></span></p>` : `<p class="wr-res-lv wr-dim">Level ${n(r.to || r.from)}</p>`}
        ${r.bot ? '' : `<div class="wr-res-items">${r.items.length ? r.items.map(it => `<span class="wr-res-item" style="--rar:${rarityColor(data.items, it)}">${esc(itemName(data.items, it))} <small>${esc(rarityName(data.items, it))}</small></span>`).join('') : '<span class="wr-dim">No gear found this time</span>'}</div>`}
      </div>
    </article>`).join('')}</div>
    <section class="wr-rate" aria-label="Rate this chapter">
      <h3>How was ${esc(ch.name)}?</h3>
      <div class="wr-rate-thumbs"><button type="button" class="wr-thumb" data-vote="up" aria-pressed="false">${icon('thumbUp')}<span>Liked it</span></button><button type="button" class="wr-thumb" data-vote="down" aria-pressed="false">${icon('thumbDown')}<span>Not for me</span></button></div>
      <div class="wr-rate-more" hidden><p class="wr-rate-q"></p><div class="wr-chips"></div>
        <textarea rows="2" maxlength="800" placeholder="Tell us more (optional)" aria-label="Tell us more"></textarea>
        <button type="button" class="wr-btn wr-small" data-act="send">${icon('next')}<span>Send</span></button></div>
      <p class="wr-rate-msg" role="status"></p>
    </section>
    <footer class="wr-results-foot"><button type="button" class="wr-btn wr-big wr-primary" data-act="next">${icon('next')}<span><b>Continue</b><small>${ch.outro ? 'What happens next' : 'Chapter map'}</small></span></button></footer>
  </section>`;
  const root = app.ui.firstElementChild;
  result.rows.forEach((r, i) => {
    const h = r.bot ? null : app.hero(r.heroId);
    const spec = h ? { look: app.heroLook(h) } : r.look ? { look: r.look } : null;
    if (spec) app.portrait(spec, 160).then(url => { const el = root.querySelector(`[data-p="${i}"]`); if (el && url) el.innerHTML = `<img src="${url}" alt="">`; });
  });
  function chips() {
    const more = root.querySelector('.wr-rate-more');
    more.hidden = vote.up == null;
    root.querySelector('.wr-rate-q').textContent = vote.up ? 'What did you like?' : 'What was wrong?';
    root.querySelector('.wr-chips').innerHTML = (vote.up ? GOOD : BAD).map(r => `<button type="button" class="wr-chip-btn${vote.reasons.has(r) ? ' on' : ''}" data-reason="${esc(r)}" aria-pressed="${vote.reasons.has(r)}">${esc(r)}</button>`).join('');
    root.querySelectorAll('[data-vote]').forEach(b => { const on = (b.dataset.vote === 'up') === vote.up && vote.up != null; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  async function send() {
    if (vote.sent || vote.up == null) return;
    vote.sent = true;
    const more = root.querySelector('textarea').value.trim();
    const rec = { chapter: ch.id, up: vote.up, reasons: [...vote.reasons], more, at: Date.now(), time: Math.round(result.time), players: result.rows.length };
    try { const list = JSON.parse(localStorage.getItem(RATINGS) || '[]'); list.push(rec); localStorage.setItem(RATINGS, JSON.stringify(list.slice(-50))); } catch { /* blocked */ }
    root.querySelector('.wr-rate-msg').textContent = 'Thank you!';
    root.querySelector('.wr-rate-more').hidden = true;
    sendReport({ kind: 'rating', text: `${vote.up ? 'Liked' : 'Disliked'} ${ch.name}${rec.reasons.length ? `: ${rec.reasons.join(', ')}` : ''}${more ? ` — ${more}` : ''}`, rating: rec, ...context(app) }).catch(() => {});
  }
  root.addEventListener('click', e => {
    const v = e.target.closest('[data-vote]'); if (v) { vote.up = v.dataset.vote === 'up'; vote.reasons.clear(); vote.sent = false; root.querySelector('.wr-rate-msg').textContent = ''; chips(); app.audio.play('ui.click'); return; }
    const r = e.target.closest('[data-reason]'); if (r) { const k = r.dataset.reason; if (vote.reasons.has(k)) vote.reasons.delete(k); else vote.reasons.add(k); chips(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'menu') return app.openMenu();
    if (b.dataset.act === 'send') return send();
    if (b.dataset.act === 'next') {
      if (vote.up != null && !vote.sent) send();
      const toMap = () => app.go('map', { heroId: lead?.id });
      if (ch.outro) app.go('story', { scene: ch.outro, chapter: ch.id, heroId: lead?.id, then: toMap, afterEnding: toMap });
      else toMap();
    }
  });
  app.view.scenic(true);
  app.audio.play('quest.complete');
  setTimeout(() => root.querySelector('[data-act="next"]')?.focus({ preventScroll: true }), 60);
}
