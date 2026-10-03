// Title screen + the M1 "Play vs AI" setup (hero, muster race, opponent, speed).
// The full lobby with slots and device claims replaces the setup panel in M2 (js/ui/lobby.js).

const SPEEDS = [{ v: 1, label: 'Normal' }, { v: 2, label: 'Fast ×2' }, { v: 8, label: 'Debug ×8' }];
const AI_NAMES = { recruit: 'Recruit', veteran: 'Veteran', commander: 'Commander' };
const STORE_KEY = 'bannerline.setup';

export function createTitle({ screen, data, onStart }) {
  const menu = screen.querySelector('#title-menu');
  const setup = screen.querySelector('#title-setup');
  const hint = screen.querySelector('#title-hint');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { saved = {}; }
  const heroes = Object.keys(data.heroes?.heroes || {});
  const races = Object.keys(data.races?.races || {});
  const ais = Object.keys(data.ai?.difficulties || { recruit: 1 });
  const choice = {
    hero: heroes.includes(saved.hero) ? saved.hero : heroes[0],
    race: races.includes(saved.race) ? saved.race : races[0],
    ai: ais.includes(saved.ai) ? saved.ai : ais[0],
    speed: SPEEDS.some((s) => s.v === saved.speed) ? saved.speed : 1,
  };

  function chips(el, items, key) {
    el.innerHTML = items.map((it) => `<button type="button" class="chip${choice[key] === it.v ? ' on' : ''}" data-v="${it.v}" ${it.disabled ? 'disabled' : ''} title="${it.tip || ''}">${it.label}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b || b.disabled) return;
      const v = key === 'speed' ? Number(b.dataset.v) : b.dataset.v;
      choice[key] = v;
      for (const c of el.children) c.classList.toggle('on', c.dataset.v === String(v));
    };
  }
  chips(screen.querySelector('#pick-hero'), heroes.map((id) => ({ v: id, label: data.heroes.heroes[id].name, tip: data.heroes.heroes[id].desc || '' })), 'hero');
  chips(screen.querySelector('#pick-race'), races.map((id) => ({ v: id, label: data.races.races[id].name, tip: data.races.traits?.[data.races.races[id].trait]?.desc || '' })), 'race');
  chips(screen.querySelector('#pick-ai'), ais.map((id) => ({ v: id, label: AI_NAMES[id] || id })), 'ai');
  chips(screen.querySelector('#pick-speed'), SPEEDS.map((s) => ({ v: s.v, label: s.label })), 'speed');

  function showSetup(v) {
    menu.hidden = v; setup.hidden = !v;
    hint.innerHTML = v ? '<kbd>Enter</kbd> march · <kbd>Esc</kbd> back' : 'Keyboard + mouse. Press <kbd>Enter</kbd> to begin.';
    (v ? setup.querySelector('#btn-start') : menu.querySelector('.primary'))?.focus({ preventScroll: true });
  }
  function start() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(choice)); } catch { /* private window */ }
    onStart({ ...choice });
  }
  screen.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'play-ai') showSetup(true);
    if (act === 'back') showSetup(false);
    if (act === 'start') start();
  });
  const onKey = (e) => {
    if (screen.hidden) return;
    if (e.code === 'Escape' && !setup.hidden) { e.preventDefault(); showSetup(false); return; }
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    if (document.activeElement?.tagName === 'BUTTON' && e.code === 'Space') return;   // native button press
    e.preventDefault();
    if (setup.hidden) showSetup(true); else start();
  };
  window.addEventListener('keydown', onKey);

  return {
    show() { screen.hidden = false; showSetup(false); },
    hide() { screen.hidden = true; },
    get choice() { return { ...choice }; },
    destroy() { window.removeEventListener('keydown', onKey); },
  };
}
