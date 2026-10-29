// Title screen: the bunker hatch. A riveted round door with a locking wheel and the name stencilled across it, and a
// plate of lit push-buttons: NEW GAME (difficulty, map size, seed), CONTINUE, WHAT'S NEW, SETTINGS. Starting spins
// the wheel and swings the hatch open onto the desk — under a second, and skipped with reduced motion.
import { createKnob } from './knob.js';
import { modal, openModal, pushButton, openSettings } from './machines/menu.js';

export const LAST_GAME_KEY = 'lodestar.lastGame';
export function readLastGame() { try { const v = JSON.parse(localStorage.getItem(LAST_GAME_KEY) || 'null'); return v && Number.isInteger(v.seed) ? v : null; } catch { return null; } }
export function writeLastGame(g) { try { localStorage.setItem(LAST_GAME_KEY, JSON.stringify(g)); } catch { /* private window */ } }
export const randomSeed = () => (Math.random() * 900000 + 100000) | 0;

export function mountTitle(C, root, { onStart }) {
  const el = document.createElement('section');
  el.className = 'title'; el.id = 'title';
  el.innerHTML = `
    <div class="hatch-wrap" aria-hidden="true">
      <div class="hatch">
        <div class="hatch-ring">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
        <div class="hatch-door">
          <div class="hatch-stencil top">COMMAND BUNKER · 07</div>
          <div class="hatch-wheel"><i></i><i></i><i></i><b></b></div>
          <div class="hatch-name">LODESTAR</div>
          <div class="hatch-stencil bottom">AUTHORISED COMMANDERS ONLY</div>
        </div>
        <div class="hatch-hinge"></div>
      </div>
    </div>
    <div class="title-panel">
      <i class="rivet tl"></i><i class="rivet tr"></i><i class="rivet bl"></i><i class="rivet br"></i>
      <div class="tp-name">LODESTAR</div>
      <div class="tp-sub">FRONTIER COMMAND</div>
      <div class="tp-buttons"></div>
      <div class="tp-foot">A prototype by Radley Sustaire · sound on for the full bunker</div>
    </div>`;
  root.append(el);
  const btns = el.querySelector('.tp-buttons');
  const newBtn = pushButton('NEW GAME', { lamp: 'green', act: 'new' });
  const contBtn = pushButton('CONTINUE', { lamp: 'amber', act: 'continue' });
  const newsBtn = pushButton("WHAT'S NEW", { lamp: 'amber', act: 'news', cls: 'wn-open' });
  const setBtn = pushButton('SETTINGS', { lamp: 'amber', act: 'settings' });
  btns.append(newBtn, contBtn, newsBtn, setBtn);
  C.news.onUnread(n => newsBtn.classList.toggle('wn-has-new', n > 0));
  const last = readLastGame();
  if (!last) { contBtn.disabled = true; contBtn.title = 'No game yet'; }
  else contBtn.querySelector('.push-label').innerHTML = `CONTINUE<small>SEED ${last.seed}</small>`;

  newBtn.addEventListener('click', () => { C.room.unlock(); C.room.play('press'); openNewGame(); });
  contBtn.addEventListener('click', () => { C.room.unlock(); C.room.play('press'); const g = readLastGame(); if (g) start(g); });
  newsBtn.addEventListener('click', () => { C.room.unlock(); C.room.play('press'); C.news.open(); });
  setBtn.addEventListener('click', () => { C.room.unlock(); C.room.play('press'); openSettings(C); });

  function openNewGame() {
    const NG = C.data.newGame;
    const m = modal({ cls: 'newgame-modal', title: 'NEW GAME', sub: 'Sign for the posting' });
    const knobs = document.createElement('div'); knobs.className = 'settings-knobs';
    const diff = createKnob({ name: 'DIFFICULTY', id: 'ng-difficulty', labels: NG.difficulty.map(d => d.label.slice(0, 4)), names: NG.difficulty.map(d => d.label), index: NG.defaultDifficulty, sound: (s, o) => C.room.play(s, o) });
    const size = createKnob({ name: 'MAP SIZE', id: 'ng-size', labels: NG.mapSize.map(d => d.label.slice(0, 4)), names: NG.mapSize.map(d => `${d.label} ${d.cells} cells`), index: NG.defaultMapSize, sound: (s, o) => C.room.play(s, o) });
    knobs.append(diff.el, size.el);
    const seedRow = document.createElement('div'); seedRow.className = 'seed-row';
    seedRow.innerHTML = `<label class="nixie-label" for="ng-seed">SEED</label><input id="ng-seed" class="nixie" inputmode="numeric" maxlength="9" value="${randomSeed()}" aria-label="Seed number">`;
    const roll = pushButton('ROLL', { lamp: 'amber', act: 'roll', cls: 'small' });
    roll.addEventListener('click', () => { C.room.play('detent', { step: 3, count: 6 }); seedRow.querySelector('input').value = randomSeed(); });
    seedRow.append(roll);
    const go = pushButton('OPEN THE HATCH', { lamp: 'green', act: 'start', cls: 'big' });
    go.addEventListener('click', () => {
      const seed = parseInt(seedRow.querySelector('input').value, 10);
      const g = { seed: Number.isFinite(seed) ? Math.abs(seed) % 1e9 : randomSeed(), difficulty: NG.difficulty[diff.index].id, mapSize: NG.mapSize[size.index].id, cells: NG.mapSize[size.index].cells };
      m.close(); start(g);
    });
    m.body.append(knobs, seedRow, go);
    openModal(C, m);
  }

  function start(g) {
    writeLastGame(g);
    C.room.play('hatch');
    el.classList.add('opening');
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => onStart(g), quick ? 0 : 60);
  }
  return {
    el,
    show() { el.hidden = false; el.classList.remove('opening', 'gone'); const g = readLastGame(); contBtn.disabled = !g; if (g) contBtn.querySelector('.push-label').innerHTML = `CONTINUE<small>SEED ${g.seed}</small>`; },
    hide() { el.classList.add('gone'); setTimeout(() => { el.hidden = true; }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750); },
    openNewGame,
  };
}
