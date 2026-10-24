// Small "game feel" helpers any minigame view may use (round 12 polish). Browser only, no rules in here.
//   const juice = createJuice(ctx);
//   juice.flash('#ff5f5f', 220)    a coloured edge flash over the whole screen (your own car was hit, you scored…)
//   juice.shake(0.15, 0.3)         shake the game's 3D group (scenery only; the players' characters live elsewhere)
//   juice.say('Snow Forts', 1400)  a short banner card (the shared .banner.fx style) over the top third, then gone
//   juice.frame(dt, t)             call from the view's frame()
//   juice.dispose()                call from the view's dispose()
// The flash layer has pointer-events: none (a full-screen overlay must never eat taps, see docs/MINIGAMES.md).
export function createJuice(ctx) {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity .25s ease-out', zIndex: '5' });
  ctx.ui.append(el);
  const g = ctx.group, base = { x: g.position.x, y: g.position.y, z: g.position.z };
  const says = [];
  let shakeT = 0, shakeDur = 1, shakeA = 0, fadeT = 0;
  return {
    flash(color = '#ffffff', ms = 200) {
      el.style.transition = 'none';
      el.style.boxShadow = `inset 0 0 70px 24px ${color}`;
      el.style.opacity = '0.85'; fadeT = ms / 1000;
    },
    shake(amp = 0.12, s = 0.25) { if (amp >= shakeA * (shakeT / shakeDur)) { shakeA = amp; shakeT = shakeDur = s; } },
    say(text, ms = 1400, cls = '') {
      const b = document.createElement('div'); b.className = 'banner fx juice-say ' + cls; b.textContent = text; b.style.pointerEvents = 'none';
      ctx.ui.append(b); says.push(b); setTimeout(() => { b.remove(); says.splice(says.indexOf(b), 1); }, ms);
    },
    frame(dt, t) {
      if (fadeT > 0) { fadeT -= dt; if (fadeT <= 0) { el.style.transition = 'opacity .3s ease-out'; el.style.opacity = '0'; } }
      if (shakeT > 0) {
        shakeT -= dt; const k = Math.max(0, shakeT / shakeDur) * shakeA;
        g.position.set(base.x + Math.sin(t * 63) * k, base.y + Math.abs(Math.sin(t * 41)) * k * 0.4, base.z + Math.cos(t * 57) * k);
        if (shakeT <= 0) { g.position.set(base.x, base.y, base.z); shakeA = 0; }
      }
    },
    dispose() { el.remove(); for (const b of says) b.remove(); g.position.set(base.x, base.y, base.z); },
  };
}
