// Comfort settings (Expansion 1 M3; the design doc's parked "accessibility options"). Saved on this device:
//   Bigger text     the room's cards, the score chips, name tags and screen games' words are drawn larger
//   Less motion     no screen shake or flashes, a calmer camera, no confetti / bats / snow drifting, no bouncing
//                   cards (on by default when the phone itself asks for reduced motion)
//   Practice        practise in the intro (on by default; off = the intro card only, as before)
// The fourth, Longer timers, belongs to the ROOM (everyone shares the same clock): the host's lobby option `timers`,
// see js/sim/room.js. This sheet only says where it is.
// The body carries `big-text` / `calm`; css/learn.css does the rest, and js/client/juice.js + stage.js read `calm`.
const KEY = 'tumblefair.comfort';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const osCalm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Is less motion on right now? (juice.js and stage.js ask; no import needed: it is a body class.) */
export const calmNow = () => typeof document !== 'undefined' && document.body?.classList.contains('calm');

export function createComfort({ onOpen = () => {}, onClose = () => {}, sfx = () => {}, isHost = () => false, inRoom = () => false } = {}) {
  const v = { bigText: false, calm: null, practice: true, ...load() };
  const calm = () => (v.calm == null ? osCalm() : !!v.calm);
  function apply() {
    document.body.classList.toggle('big-text', !!v.bigText);
    document.body.classList.toggle('calm', calm());
  }
  apply();
  const row = (k, title, sub, on) => `<label class="comfort-row"><span><b>${title}</b><small>${sub}</small></span><input type="checkbox" data-c="${k}" ${on ? 'checked' : ''}><i class="switch" aria-hidden="true"></i></label>`;
  function open() {
    const el = document.createElement('div'); el.className = 'modal comfort-sheet';
    el.innerHTML = `<div class="panel"><h2>Comfort</h2><p class="note">Saved on this device.</p>
      ${row('bigText', 'Bigger text', 'Cards, scores and names drawn larger.', v.bigText)}
      ${row('calm', 'Less motion', 'No shaking or flashes, a calmer camera, nothing drifting about.', calm())}
      ${row('practice', 'Practice in the intro', 'Try the controls before each game. Nothing counts.', v.practice)}
      <div class="comfort-row static"><span><b>Longer timers</b><small>${inRoom() ? (isHost() ? 'In the lobby: <i>Timers → Relaxed</i>. Everyone gets more time to vote, read and take their turn.' : 'The host turns this on in the lobby (Timers → Relaxed).') : 'The host turns this on in the lobby (Timers → Relaxed).'}</small></span></div>
      <button class="btn big primary" data-close>Done</button></div>`;
    el.addEventListener('change', e => {
      const k = e.target.dataset?.c; if (!k) return;
      v[k] = !!e.target.checked; save(v); apply(); sfx('tap');
    });
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) { sfx('tap'); close(); } });
    const close = () => { el.remove(); onClose(el); };
    document.body.append(el); onOpen(el, close);
    return el;
  }
  return {
    open, apply,
    get bigText() { return !!v.bigText; }, get calm() { return calm(); }, get practice() { return v.practice !== false; },
    set(k, val) { v[k] = val; save(v); apply(); },
  };
}
