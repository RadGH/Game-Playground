// Sound: fight events → the shared sound library (sfx/js/sfx.js). Built on the first tap or key press (phones only
// allow sound after one), one-shots only — no loops are started for a moment (game-standards §4).
let sfx = null, starting = null, volume = 0.8, muted = false;

export function initAudio() {
  if (sfx || starting) { sfx?.wake?.(); return; }
  starting = import('../../../sfx/js/sfx.js').then(({ Sfx }) => Sfx.create({ method: 'hybrid', volume, muted })).then(s => { sfx = s; }).catch(e => console.info('[grimring] no sound', e?.message));
}
export function setVolume(v) { volume = v; sfx?.setVolume(v); }
export function setMuted(on) { muted = on; sfx?.setMuted(on); }
export function play(id, opts) { try { sfx?.play(id, opts); } catch { /* a missing clip is not worth a crash */ } }

/** One fight's events. `pan(x)` turns a world x into a left/right pan. */
export function soundEvents(F, events, pan) {
  for (const e of events) {
    const f = e.id != null ? F.fighters.find(o => o.id === e.id) : null;
    const p = { pan: f ? pan(f.x) : 0 };
    switch (e.type) {
      case 'swing':
        if (e.special === 'roar' || e.special === 'scream') break;
        if (e.special === 'block') play('status.block.apply', p);
        else if (e.special === 'blast') play('cast.start', p);
        else if (f?.def.kind === 'melee') play('melee.swing', p);
        break;
      case 'shot': play(e.kind === 'archer' ? 'arrow.shot' : 'magic.missile', p); break;
      case 'hit': {
        const to = F.fighters.find(o => o.id === e.to);
        const q = { pan: to ? pan(to.x) : 0 };
        play(e.blocked ? 'melee.block' : e.special ? 'melee.crit' : 'melee.hit', q);
        break;
      }
      case 'miss': if (e.why === 'dodged') play('melee.miss', p); break;
      case 'blast': play('explosion.small', { pan: pan(e.x) }); break;
      case 'shout': play('beast.growl', p); break;
      case 'status': if (e.what === 'stun') play('status.stun.apply', p); else if (e.what === 'slow') play('status.slow.apply', p); break;
      case 'death': play('death.humanoid', p); break;
    }
  }
}
