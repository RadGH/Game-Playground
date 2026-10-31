// Sound after a phone has been away. iOS stops every AudioContext when a tab or the app goes to the back (state 'suspended' or 'interrupted'), and will only start one again from
// inside a tap. Several things here own a context (Sfx, the engines, the voices, the siren), some of them shared code that must not change for this game, so this file is loaded first
// and counts every context the page makes. Going away suspends them all, so nothing hums on in a hidden tab; coming back, and every tap or key after it, resumes any that stopped.
// If a tap does not bring one back within half a second it is dead (it happens after a long time away), and onDead lets the owners build new ones.
//   installAudioWake({ onDead })     wake.states()     wake.contexts
const seen = new Set();
const track = ctx => { seen.add(ctx); return ctx; };
for (const name of ['AudioContext', 'webkitAudioContext']) {
  const Real = globalThis[name];
  if (typeof Real !== 'function') continue;
  globalThis[name] = new Proxy(Real, { construct(T, args, nt) { return track(Reflect.construct(T, args, nt)); } });
}

export const needsWaking = state => state === 'suspended' || state === 'interrupted';

export function installAudioWake({ onDead = () => {} } = {}) {
  let parked = false, checking = 0;
  const live = () => [...seen].filter(c => c.state !== 'closed');
  const resumeAll = () => { for (const c of live()) if (needsWaking(c.state)) c.resume?.()?.catch?.(() => {}); };
  const check = () => {
    clearTimeout(checking);
    checking = setTimeout(() => {
      const dead = live().filter(c => needsWaking(c.state));
      if (!dead.length || document.hidden) return;
      for (const c of dead) { seen.delete(c); c.close?.()?.catch?.(() => {}); }
      onDead();
    }, 500);
  };
  const away = () => { parked = true; for (const c of live()) if (c.state === 'running') c.suspend?.()?.catch?.(() => {}); };
  const back = () => { if (document.hidden) return; parked = false; resumeAll(); };
  const touched = () => { if (document.hidden) return; parked = false; if (live().some(c => needsWaking(c.state))) { resumeAll(); check(); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) away(); else back(); });
  addEventListener('pagehide', away); addEventListener('pageshow', back); addEventListener('focus', back);
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) addEventListener(ev, touched, { capture: true, passive: true });
  return { get contexts() { return live(); }, states: () => live().map(c => c.state), get parked() { return parked; } };
}
