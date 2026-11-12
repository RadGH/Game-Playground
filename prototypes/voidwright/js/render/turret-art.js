// Turret graphics: each weapon has its own look, rotates to its aim and kicks back when it fires
// (owner: "Turrets should have their own graphics, rotate at enemies, and have cosmetic knockback").

const STYLES = {
  pulse_laser:  { barrels: 2, len: 0.75, wid: 0.1, gap: 0.16, body: 'round', bodyR: 0.32, tip: '#ff4f7a' },
  gatling:      { barrels: 4, len: 0.7, wid: 0.07, gap: 0.07, body: 'round', bodyR: 0.3, spin: true, tip: '#ffd27a' },
  autocannon:   { barrels: 1, len: 0.85, wid: 0.18, gap: 0, body: 'box', bodyR: 0.34, brake: true, tip: '#ffbf5a' },
  scatter:      { barrels: 1, len: 0.55, wid: 0.2, gap: 0, body: 'round', bodyR: 0.32, flare: true, tip: '#5ff3ff' },
  mass_driver:  { barrels: 2, len: 1.1, wid: 0.07, gap: 0.2, body: 'box', bodyR: 0.36, coils: true, tip: '#fff2c4' },
  rocket_pod:   { body: 'pod', bodyR: 0.4, tubes: 4, tip: '#ff8a2a' },
  missile_rack: { body: 'rack', bodyR: 0.4, tubes: 2, tip: '#ff6a3a' },
  beam_laser:   { barrels: 1, len: 0.6, wid: 0.22, gap: 0, body: 'round', bodyR: 0.34, lens: true, tip: '#ff3366' },
  arc_caster:   { body: 'orb', bodyR: 0.26, orbR: 0.22, tip: '#b48cff' },
  tesla_coil:   { body: 'orb', bodyR: 0.3, orbR: 0.3, rings: true, tip: '#d7b4ff' },
  flak:         { barrels: 4, len: 0.55, wid: 0.08, gap: 0.09, body: 'box', bodyR: 0.34, tip: '#ffc36b' },
  pd_laser:     { barrels: 1, len: 0.5, wid: 0.07, gap: 0, body: 'round', bodyR: 0.24, tip: '#ff9db8' },
  plasma_cannon:{ barrels: 1, len: 0.8, wid: 0.16, gap: 0, body: 'bulb', bodyR: 0.36, tip: '#38e8ff' },
  railgun:      { barrels: 2, len: 1.25, wid: 0.06, gap: 0.14, body: 'box', bodyR: 0.36, coils: true, tip: '#9fd8ff' },
  mine_layer:   { body: 'hatch', bodyR: 0.4, tip: '#ff5050' },
  ion_pulse:    { barrels: 1, len: 0.55, wid: 0.12, gap: 0, body: 'ring', bodyR: 0.34, tip: '#8fb4ff' },
  heavy_laser:  { barrels: 2, len: 0.85, wid: 0.12, gap: 0.2, body: 'box', bodyR: 0.36, tip: '#ff3a6a' },
  flak_battery: { barrels: 4, len: 0.6, wid: 0.09, gap: 0.1, body: 'box', bodyR: 0.38, tip: '#ffc36b' },
  howitzer:     { barrels: 1, len: 0.95, wid: 0.22, gap: 0, body: 'box', bodyR: 0.4, brake: true, tip: '#ffcf80' },
  plasma_lance: { barrels: 1, len: 0.9, wid: 0.2, gap: 0, body: 'bulb', bodyR: 0.4, lens: true, tip: '#40f0ff' },
  swarm_pod:    { body: 'pod', bodyR: 0.42, tubes: 9, tip: '#ff8a5a' },
  siege_cannon: { barrels: 3, len: 1.0, wid: 0.13, gap: 0.16, body: 'box', bodyR: 0.42, brake: true, tip: '#ffe0a0' },
  lance_battery:{ barrels: 1, len: 1.2, wid: 0.18, gap: 0, body: 'box', bodyR: 0.42, lens: true, coils: true, tip: '#ff2050' },
  torpedo_tube: { body: 'rack', bodyR: 0.44, tubes: 1, big: true, tip: '#ff4020' },
  storm_spire:  { body: 'orb', bodyR: 0.36, orbR: 0.34, rings: true, tip: '#c8a0ff' },
  mining_laser: { barrels: 1, len: 0.6, wid: 0.12, gap: 0, body: 'round', bodyR: 0.3, lens: true, tip: '#7dff9a' },
  big_mining_laser: { barrels: 2, len: 0.7, wid: 0.12, gap: 0.16, body: 'round', bodyR: 0.36, lens: true, tip: '#9dffb0' },
  // stepped-up mining lasers (2026-11-12): longer, cooled barrel; tier 3 adds focusing prongs on a ring mount
  mining_laser_2: { barrels: 1, len: 0.68, wid: 0.14, gap: 0, body: 'round', bodyR: 0.32, lens: true, coils: true, tip: '#8dffb0' },
  mining_laser_3: { barrels: 1, len: 0.78, wid: 0.16, gap: 0, body: 'ring', bodyR: 0.34, lens: true, coils: true, prongs: true, tip: '#b0ffd0' },
  // sentries: self-contained automatic mounts — an armoured hexagon dome with a sweeping sensor eye
  sentry_gun:   { barrels: 2, len: 0.55, wid: 0.07, gap: 0.11, body: 'sentry', bodyR: 0.34, brake: true, tip: '#ffe08a' },
  sentry_laser: { barrels: 1, len: 0.66, wid: 0.11, gap: 0, body: 'sentry', bodyR: 0.34, lens: true, prongs: true, tip: '#ff6a9a' },
  harpoon:      { body: 'harpoon', bodyR: 0.3, tip: '#d0d8e0' },
  tractor:      { body: 'ring', bodyR: 0.3, barrels: 0, tip: '#7fd0ff' },
  acid_spitter: { body: 'bulb', bodyR: 0.3, barrels: 1, len: 0.5, wid: 0.14, gap: 0, organic: true, tip: '#a6ff4a' },
  spore_launcher:{ body: 'pod', bodyR: 0.36, tubes: 3, organic: true, tip: '#c8ff6a' },
  lattice_arc:  { body: 'orb', bodyR: 0.24, orbR: 0.2, tip: '#7fe6ff' },
  disassembler: { barrels: 3, len: 0.6, wid: 0.06, gap: 0.12, body: 'ring', bodyR: 0.34, lens: true, tip: '#5fe0ff' },
  prism_lance:  { barrels: 1, len: 0.9, wid: 0.1, gap: 0, body: 'crystal', bodyR: 0.32, tip: '#ff9ef0' },
  refractor:    { barrels: 1, len: 0.7, wid: 0.2, gap: 0, body: 'crystal', bodyR: 0.38, lens: true, tip: '#ffc8ff' },
  magma_mortar: { barrels: 1, len: 0.6, wid: 0.26, gap: 0, body: 'bulb', bodyR: 0.4, brake: true, tip: '#ff7a2a' },
  acid_geyser:  { body: 'pod', bodyR: 0.42, tubes: 6, organic: true, tip: '#b6ff3a' },
  brood_lance:  { barrels: 2, len: 0.7, wid: 0.16, gap: 0.22, body: 'bulb', bodyR: 0.36, organic: true, tip: '#c8ff6a' },
  prism_array:  { barrels: 2, len: 0.95, wid: 0.09, gap: 0.2, body: 'crystal', bodyR: 0.38, tip: '#ffb0f8' },
  forge_battery:{ barrels: 2, len: 1.15, wid: 0.12, gap: 0.24, body: 'box', bodyR: 0.42, coils: true, brake: true, tip: '#ffb070' },
  lattice_web:  { body: 'orb', bodyR: 0.32, orbR: 0.28, rings: true, tip: '#7fe6ff' },
  forge_hammer: { barrels: 2, len: 1.1, wid: 0.1, gap: 0.2, body: 'box', bodyR: 0.4, coils: true, tip: '#ffb070' },
};

/**
 * Draw a turret centred at (0,0) — the caller has already translated + rotated to the aim.
 * S = block side in pixels. kick = 0..1 recoil. t = time (for spin and crackle).
 */
export function drawTurret(c, id, S, kick, t, pal, glowCtx) {
  const st = STYLES[id] || STYLES.pulse_laser;
  const R = S * st.bodyR; const back = -kick * S * 0.22;
  const metal = pal.trim || '#ccc', dark = '#1a1d24', mid = '#3a404c';
  c.lineJoin = 'round';
  // barrels
  if (st.barrels) {
    const n = st.barrels;
    for (let i = 0; i < n; i++) {
      let off = (i - (n - 1) / 2) * st.gap * S;
      if (st.spin) off = Math.sin(t * 30 * (1 + kick) + i * Math.PI * 2 / n) * st.gap * S * 1.6;
      const L = st.len * S, wd = Math.max(1, st.wid * S);
      c.fillStyle = mid; c.fillRect(back, off - wd / 2, L, wd);
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(back, off - wd / 2, L, Math.max(0.6, wd * 0.3));
      if (st.coils) { c.fillStyle = metal; for (let k = 0.25; k < 0.9; k += 0.18) c.fillRect(back + L * k, off - wd * 0.9, L * 0.06, wd * 1.8); }
      if (st.brake) { c.fillStyle = dark; c.fillRect(back + L * 0.86, off - wd * 0.8, L * 0.14, wd * 1.6); }
      if (st.prongs) { c.strokeStyle = metal; c.lineWidth = Math.max(0.7, wd * 0.35); for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(back + L * 0.2, off + sg * wd * 1.5); c.lineTo(back + L * 0.95, off + sg * wd * 0.75); c.stroke(); } }
      if (st.flare) { c.fillStyle = mid; c.beginPath(); c.moveTo(back + L * 0.6, off - wd * 0.5); c.lineTo(back + L, off - wd * 1.4); c.lineTo(back + L, off + wd * 1.4); c.lineTo(back + L * 0.6, off + wd * 0.5); c.fill(); }
      if (st.lens) { c.fillStyle = st.tip; c.fillRect(back + L - wd * 0.6, off - wd * 0.45, wd * 0.6, wd * 0.9); if (glowCtx) { glowCtx.fillStyle = st.tip; glowCtx.fillRect(back + L - wd * 0.6, off - wd * 0.45, wd * 0.6, wd * 0.9); } }
      else { c.fillStyle = st.tip; c.globalAlpha = 0.8; c.fillRect(back + L - Math.max(1, wd * 0.4), off - wd / 2, Math.max(1, wd * 0.4), wd); c.globalAlpha = 1; }
    }
  }
  // body
  c.fillStyle = st.organic ? '#4a6a2a' : mid; c.strokeStyle = dark; c.lineWidth = Math.max(1, S * 0.05);
  switch (st.body) {
    case 'box': c.beginPath(); c.rect(-R + back * 0.4, -R * 0.85, R * 1.7, R * 1.7); c.fill(); c.stroke(); c.fillStyle = metal; c.fillRect(-R * 0.5 + back * 0.4, -R * 0.5, R * 0.6, R * 0.2); break;
    case 'pod': {
      c.beginPath(); c.rect(-R + back * 0.3, -R, R * 2, R * 2); c.fill(); c.stroke();
      const n = st.tubes; const k = Math.ceil(Math.sqrt(n));
      for (let i = 0; i < n; i++) { const tx = -R * 0.5 + (i % k) * R / k * 1.6 + R * 0.4, ty = -R * 0.6 + Math.floor(i / k) * R / k * 1.6 + R * 0.3; c.fillStyle = dark; c.beginPath(); c.arc(tx + back * 0.3, ty - R * 0.25, R * 0.7 / k, 0, 7); c.fill(); c.fillStyle = st.tip; c.beginPath(); c.arc(tx + back * 0.3, ty - R * 0.25, R * 0.3 / k, 0, 7); c.fill(); }
      break;
    }
    case 'rack': {
      c.beginPath(); c.rect(-R + back * 0.3, -R * 0.9, R * 2, R * 1.8); c.fill(); c.stroke();
      const n = st.tubes; for (let i = 0; i < n; i++) { const oy = (i - (n - 1) / 2) * R * 0.9; c.fillStyle = '#d8d8d8'; c.beginPath(); c.moveTo(-R * 0.7 + back * 0.3, oy - R * 0.22); c.lineTo(R * (st.big ? 1.2 : 0.9) + back * 0.3, oy - R * 0.22); c.lineTo(R * (st.big ? 1.45 : 1.15) + back * 0.3, oy); c.lineTo(R * (st.big ? 1.2 : 0.9) + back * 0.3, oy + R * 0.22); c.lineTo(-R * 0.7 + back * 0.3, oy + R * 0.22); c.fill(); c.fillStyle = st.tip; c.fillRect(R * 0.2 + back * 0.3, oy - R * 0.22, R * 0.15, R * 0.44); }
      break;
    }
    case 'orb': {
      c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.stroke();
      const orb = S * st.orbR * (0.9 + 0.1 * Math.sin(t * 12));
      c.fillStyle = st.tip; c.beginPath(); c.arc(0, 0, orb * 0.7, 0, 7); c.fill();
      if (glowCtx) { glowCtx.fillStyle = st.tip; glowCtx.beginPath(); glowCtx.arc(0, 0, orb, 0, 7); glowCtx.fill(); }
      if (st.rings) { c.strokeStyle = st.tip; c.lineWidth = Math.max(1, S * 0.03); c.beginPath(); c.arc(0, 0, orb * 1.25, t * 3, t * 3 + 4); c.stroke(); }
      // little crackles
      c.strokeStyle = '#fff'; c.lineWidth = Math.max(0.6, S * 0.02); c.beginPath();
      for (let i = 0; i < 2; i++) { const an = t * 17 + i * 3; c.moveTo(Math.cos(an) * orb * 0.4, Math.sin(an) * orb * 0.4); c.lineTo(Math.cos(an + 0.4) * orb * 1.3, Math.sin(an + 0.4) * orb * 1.3); }
      c.stroke();
      break;
    }
    case 'bulb': c.beginPath(); c.ellipse(back * 0.3, 0, R * 1.1, R * 0.9, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = st.tip; c.globalAlpha = 0.85; c.beginPath(); c.arc(back * 0.3, 0, R * 0.45, 0, 7); c.fill(); c.globalAlpha = 1; if (glowCtx) { glowCtx.fillStyle = st.tip; glowCtx.beginPath(); glowCtx.arc(back * 0.3, 0, R * 0.55, 0, 7); glowCtx.fill(); } break;
    case 'ring': c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.stroke(); c.strokeStyle = st.tip; c.lineWidth = Math.max(1, S * 0.08); c.beginPath(); c.arc(0, 0, R * 0.6, 0, 7); c.stroke(); break;
    case 'crystal': c.fillStyle = '#6a4a7a'; c.beginPath(); c.moveTo(R * 1.1, 0); c.lineTo(0, -R); c.lineTo(-R * 0.8, 0); c.lineTo(0, R); c.closePath(); c.fill(); c.stroke(); c.fillStyle = st.tip; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(R * 0.6, 0); c.lineTo(0, -R * 0.5); c.lineTo(-R * 0.3, 0); c.lineTo(0, R * 0.5); c.fill(); c.globalAlpha = 1; break;
    case 'hatch': c.beginPath(); c.rect(-R, -R, R * 2, R * 2); c.fill(); c.stroke(); c.fillStyle = '#e8c040'; for (let i = 0; i < 3; i++) c.fillRect(-R + i * R * 0.7, -R, R * 0.3, R * 2); c.fillStyle = st.tip; c.beginPath(); c.arc(0, 0, R * 0.25, 0, 7); c.fill(); break;
    case 'sentry': {
      // hexagon armour dome, dark sensor slot, and a glowing eye that sweeps side to side (it aims by itself)
      c.beginPath(); for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3 + Math.PI / 6; c.lineTo(Math.cos(an) * R + back * 0.3, Math.sin(an) * R); } c.closePath(); c.fill(); c.stroke();
      c.fillStyle = metal; c.globalAlpha = 0.55; c.beginPath(); c.arc(back * 0.3 - R * 0.15, -R * 0.2, R * 0.35, 0, 7); c.fill(); c.globalAlpha = 1;
      c.fillStyle = dark; c.fillRect(back * 0.3 - R * 0.1, -R * 0.55, R * 0.5, R * 1.1);
      const eye = Math.sin(t * 2.4) * R * 0.38;
      c.fillStyle = st.tip; c.beginPath(); c.arc(back * 0.3 + R * 0.15, eye, R * 0.16, 0, 7); c.fill();
      if (glowCtx) { glowCtx.fillStyle = st.tip; glowCtx.beginPath(); glowCtx.arc(back * 0.3 + R * 0.15, eye, R * 0.22, 0, 7); glowCtx.fill(); }
      break;
    }
    case 'harpoon': {
      c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#9aa4ae'; c.fillRect(back, -S * 0.05, S * 0.7, S * 0.1);
      c.fillStyle = '#e0e6ea'; c.beginPath(); c.moveTo(back + S * 0.9, 0); c.lineTo(back + S * 0.62, -S * 0.14); c.lineTo(back + S * 0.62, S * 0.14); c.fill();
      break;
    }
    default: c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.stroke(); c.fillStyle = metal; c.beginPath(); c.arc(-R * 0.2, -R * 0.2, R * 0.25, 0, 7); c.fill();
  }
}

export const TURRET_STYLES = STYLES;
