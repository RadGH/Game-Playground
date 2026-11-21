// Heroes: every saved hero as a card with a portrait drawn from their 3D model (wearing their gear), class, level and
// how far along the road they are. Play takes them to the chapter map; Delete asks in an in-game dialog first.
import { ask } from '../../../../shared/dialog.js';
import { icon } from './icons.js';
import { esc, CLASS_NAMES, chapterPlace, endingOf } from './text.js';
import { progressOf } from '../sim/route.js';
import { soloParty } from './party.js';
import { hp as n } from '../../../../shared/format.js';

export function heroesScreen(app) {
  const draw = () => {
    const { save, data } = app;
    const list = [...save.heroes].sort((a, b) => (a.id === save.lastHero ? -1 : b.id === save.lastHero ? 1 : (b.created || 0) - (a.created || 0)));
    app.ui.innerHTML = `<section class="wr-screen wr-heroes">
      <header class="wr-bar"><button type="button" class="wr-icon-btn" data-back aria-label="Back">${icon('back')}</button><h2>Heroes</h2><div class="wr-grow"></div>
        <button type="button" class="wr-icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button></header>
      <div class="wr-hero-grid">
        ${list.map(h => {
          // where the hero stands on their own road (Acts II/III follow their choices): act + road + chapter
          const pr = progressOf(data, h.story), ch = data.chapters.chapters.find(c => c.id === pr.route[pr.reached]);
          const place = ch ? chapterPlace(data, ch.id) : null, fin = endingOf(data, h.story.finale);
          const done = pr.route.filter(id => h.story.done.includes(id)).length, total = 12;   // one road: 6 + 3 + 3 chapters
          const ends = (h.story.endings || []).length;
          return `<article class="wr-hero-card${h.id === save.lastHero ? ' wr-last' : ''}" data-id="${esc(h.id)}">
            <div class="wr-portrait wr-portrait-lg" data-portrait="${esc(h.id)}"><span class="wr-portrait-wait"></span></div>
            <div class="wr-hero-info">
              <h3>${esc(h.name)}</h3>
              <p class="wr-hero-cls">Level ${n(h.level)} ${esc(CLASS_NAMES[h.cls])}</p>
              <p class="wr-hero-act">${esc(place ? `${place.actName} · ${place.road}` : '')}</p>
              <p class="wr-hero-where">${icon('map')}<span>${fin && done >= total ? `Ending: ${esc(fin.name)}` : esc(ch?.name || '')}</span></p>
              <div class="wr-progress" aria-label="${n(done)} of ${n(total)} chapters on this road"><i style="width:${Math.round(Math.min(1, done / total) * 100)}%"></i></div>
              <p class="wr-hero-meta">${n(done)} of ${n(total)} chapters · ${n(h.gold)} gold${ends ? ` · ${n(ends)} ${ends === 1 ? 'ending' : 'endings'} found` : ''}</p>
            </div>
            <div class="wr-hero-acts">
              <button type="button" class="wr-btn wr-primary" data-act="play">${icon('play')}<span>Play</span></button>
              <button type="button" class="wr-btn wr-ghost" data-act="delete" aria-label="Delete ${esc(h.name)}">${icon('trash')}<span>Delete</span></button>
            </div>
          </article>`;
        }).join('')}
        <button type="button" class="wr-hero-card wr-hero-new" data-act="new">${icon('plus')}<span>New hero</span></button>
      </div>
    </section>`;
    for (const h of list) {
      app.portrait({ look: app.heroLook(h) }, 192).then(url => {
        const el = app.ui.querySelector(`[data-portrait="${CSS.escape(h.id)}"]`);
        if (el && url) el.innerHTML = `<img src="${url}" alt="">`;
      });
    }
    setTimeout(() => app.ui.querySelector('[data-act="play"]')?.focus({ preventScroll: true }), 40);
  };
  draw();
  const onClick = async e => {
    const b = e.target.closest('[data-act], [data-back]'); if (!b) return;
    app.audio.play('ui.click');
    if (b.hasAttribute('data-back')) return app.go('title');
    const card = b.closest('[data-id]'), h = card && app.hero(card.dataset.id);
    switch (b.dataset.act) {
      case 'menu': app.openMenu(); break;
      case 'new': app.go('creator', { then: 'map' }); break;
      case 'play': app.save.lastHero = h.id; app.saveNow(false); app.party = soloParty(h); app.go('map', { heroId: h.id }); break;
      case 'delete': {
        const yes = await ask({ title: `Delete ${h.name}?`, text: `${h.name}, level ${n(h.level)} ${CLASS_NAMES[h.cls]}, and everything they carry will be gone for good.`, ok: 'Delete hero', danger: true });
        if (!yes) return;
        app.save.heroes = app.save.heroes.filter(x => x.id !== h.id);
        if (app.save.lastHero === h.id) app.save.lastHero = app.save.heroes[0]?.id || null;
        app.saveNow(); app.note(`${h.name} was deleted.`);
        if (!app.save.heroes.length) app.go('title'); else draw();
      }
    }
  };
  app.ui.addEventListener('click', onClick);
  app.view.setChapter('millbrook'); app.view.scenic(true);
  return () => app.ui.removeEventListener('click', onClick);
}
