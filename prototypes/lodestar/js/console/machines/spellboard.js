// The Spell Board (PLAN M6): a rack of spell cartridges, the arming key, a repeater of the Mana Gauge with its ghost
// needle, and a guarded FIRE button. A fire mission is two separate actions:
//   1. pull a cartridge (tap it) — the key turns itself, the ARMED lamp lights, the light pen becomes the aiming tool;
//   2. mark the target on the scope (tap; drag for a line spell), then FIRE (or Enter). The guard flips up only when
//      the key has turned and a target is marked.
// SAFE (or Esc, or tapping the pulled cartridge again) puts the cartridge back. Tier II cartridges sit behind a
// shutter stamped with the cap they need until batteries raise it. Every refusal comes back from the sim in plain
// words on the teletype and the status strip.

import { machinePanel } from './panel.js';
import { gaugeFace } from './gauge.js';
import { gridRef } from '../view.js';

export function mountSpellBoard(C) {
  const { el, body } = machinePanel({ id: 'spellboard', title: 'SPELL BOARD', cls: 'machine-spellboard' });
  const A = C.arcane;
  const rows = A.spells.list;
  const tiers = A.mana.tiers;
  body.innerHTML = `
    <div class="sb-status" role="status" aria-live="polite"></div>
    <div class="sb-rack" role="group" aria-label="Spell cartridges">${rows.map((s) => `
      <button type="button" class="sb-cart" data-spell="${s.id}" style="--sc:${s.colour}" aria-label="${s.name}: tier ${tiers[s.tier - 1].name}, ${s.cost} mana">
        <span class="sb-cart-slot"></span>
        <span class="sb-cart-body"><b>${s.short}</b><i>${s.name.toUpperCase()}</i><em>${s.cost}</em><span class="sb-tier">${tiers[s.tier - 1].name}</span></span>
        <span class="sb-cool"></span>
        <span class="sb-shutter">CAP ${tiers[s.tier - 1].cap}</span>
      </button>`).join('')}
    </div>
    <div class="sb-side">
      <div class="sb-repeater"></div>
      <div class="sb-key" aria-hidden="true"><span class="sb-keyhole"><span class="sb-keybit"></span></span><span class="sb-lamp" data-lamp="armed"></span><small>ARMED</small><span class="sb-lamp" data-lamp="target"></span><small>TARGET</small></div>
      <button type="button" class="sb-fire" aria-label="Fire"><span class="sb-guard"></span><span class="sb-fire-cap">FIRE</span></button>
      <button type="button" class="sb-safe" aria-label="Safe — put the cartridge back">SAFE</button>
    </div>`;
  const rep = gaugeFace({ tiers, small: true });
  body.querySelector('.sb-repeater').append(rep.el);
  const status = body.querySelector('.sb-status'), fire = body.querySelector('.sb-fire');
  for (const b of body.querySelectorAll('.sb-cart')) {
    b.addEventListener('click', () => {
      const id = b.dataset.spell;
      if (A.aim.spell === id) { A.safe(); return; }
      if (b.classList.contains('locked')) { C.room.play('locked'); b.classList.add('rattle'); setTimeout(() => b.classList.remove('rattle'), 260); }
      A.arm(id);
    });
  }
  fire.addEventListener('click', () => { if (!fire.classList.contains('ready')) { C.room.play('locked'); fire.classList.add('rattle'); setTimeout(() => fire.classList.remove('rattle'), 260); } A.fire(); });
  body.querySelector('.sb-safe').addEventListener('click', () => { if (!A.safe()) C.room.play('locked'); });

  function draw() {
    const h = A.hud;
    if (!h) return;
    const aim = A.aim, def = aim.spell ? A.rows[aim.spell] : null;
    const armed = h.armed && def && h.armed.spell === def.id;
    const turned = armed && h.armed.ready <= 0;
    rep.set({ store: h.store, cap: h.cap, regenTo: h.regenTo, ghost: def ? h.store - def.cost : null });
    for (const b of body.querySelectorAll('.sb-cart')) {
      const s = A.rows[b.dataset.spell];
      const locked = h.cap < tiers[s.tier - 1].cap;
      b.classList.toggle('locked', locked);
      b.classList.toggle('pulled', aim.spell === s.id);
      b.classList.toggle('short', !locked && h.store < s.cost);
      const cool = h.cooling[s.id] || 0;
      b.classList.toggle('cooling', cool > 0);
      b.style.setProperty('--cool', cool > 0 ? String(Math.min(1, cool / s.cooldown)) : '0');
    }
    body.querySelector('[data-lamp="armed"]').classList.toggle('on', !!turned);
    body.querySelector('[data-lamp="armed"]').classList.toggle('turning', !!armed && !turned);
    body.querySelector('[data-lamp="target"]').classList.toggle('on', !!aim.target);
    el.classList.toggle('armed', !!armed); el.classList.toggle('turned', !!turned);
    const ready = !!(turned && aim.target);
    fire.classList.toggle('ready', ready);
    fire.setAttribute('aria-disabled', String(!ready));
    // the one-line status strip: what to do next, or why not
    let txt, bad = false;
    if (!def) txt = `PULL A CARTRIDGE · MANA ${Math.floor(h.store)} / ${h.cap}`;
    else {
      const T = aim.target;
      const sight = T ? (A.sightOf(T.x, T.y, def.sight) || (T.x2 != null ? A.sightOf(T.x2, T.y2, def.sight) : null)) : null;
      if (h.store < def.cost) { txt = `${def.short}: NEEDS ${def.cost} MANA, STORE ${Math.floor(h.store)}`; bad = true; }
      else if (h.cooling[def.id]) { txt = `${def.short}: RECHARGING ${Math.ceil(h.cooling[def.id] / 20)} S`; bad = true; }
      else if (!armed) txt = `${def.short}: TURNING THE KEY…`;
      else if (!T) txt = `${def.short} · ${def.cost} MANA · ${def.shape === 'line' ? 'DRAG A LINE' : 'MARK A TARGET'} ON THE SCOPE`;
      else if (sight) { txt = `${def.short} · ${gridRef(T.x, T.y)} · ${sight}`; bad = true; }
      else txt = `${def.short} · ${gridRef(T.x, T.y)} · ETA ${(aim.eta / 20).toFixed(1)} S · ${turned ? 'FIRE WHEN READY' : 'KEY TURNING'}`;
    }
    status.textContent = txt; status.classList.toggle('bad', bad);
  }
  const off = A.on(draw);
  draw();
  return { el, draw, dispose: off };
}
