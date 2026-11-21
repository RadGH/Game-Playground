// Stop-and-go: the road scrolls on until the lead hero reaches a section's fight; the screen locks there until every
// wave (and the boss) is beaten, then GO points on. Pure — called once per step from brawl.js.
import { addCrate, spawnFoe, riseFoe, alive, viewHalf, heroCount } from './brawl.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function stageStart(G) {
  for (const s of G.ch.sections) for (const c of s.crates || []) if (s.at > (G.ch.sections[G.secI - 1]?.at ?? -1)) addCrate(G, c);
  G.camX = Math.max(viewHalf(G), (G.ch.sections[G.secI - 1]?.at ?? 0) + 2);
  G.phase = 'walk'; G.waveI = 0;
}

export function stageStep(G, dt) {
  const sec = G.ch.sections[G.secI];
  const up = G.heroes.filter(alive);
  // clear away the fallen after a moment
  G.foes = G.foes.filter(f => !(f.state === 'dead' && f.st > 2.5));

  if (G.heroes.length && G.heroes.every(h => h.state === 'gone')) {
    G.over = true; G.outcome = 'lost';
    G.events.push({ type: 'chapterLost', section: G.secI });
    return;
  }
  if (G.phase === 'walk') {
    if (!up.length) return;
    const lead = Math.max(...up.map(h => h.x)), avg = up.reduce((a, h) => a + h.x, 0) / up.length;
    const stopAt = sec ? sec.at : G.ch.length;
    const want = clamp(Math.max(avg, lead - viewHalf(G) + 2.5), G.camX, stopAt);   // the road only scrolls forward
    G.camX += (want - G.camX) * Math.min(1, dt * 4);
    if (sec && lead >= sec.at - 1.5) startFight(G, sec);
    else if (!sec && lead >= G.ch.length - 4) { G.over = true; G.outcome = 'won'; G.events.push({ type: 'chapterClear', chapter: G.ch.id }); }
    return;
  }
  if (G.phase === 'fight') {
    G.camX += (sec.at - G.camX) * Math.min(1, dt * 3);
    const left = G.foes.filter(f => f.team === 1 && alive(f));   // a calmed boss is done too
    if (left.length === 0) {
      if (G.waveI < sec.waves.length) spawnWave(G, sec, G.waveI++);
      else clearSection(G, sec);
    } else if (G.waveI < sec.waves.length && left.length <= 1 && !left.some(f => f.boss) && G.waveTime > 6) {
      spawnWave(G, sec, G.waveI++);   // keep the pressure up: the next group arrives while the last straggler stands
    }
    G.waveTime = (G.waveTime || 0) + dt;
  }
}

function startFight(G, sec) {
  G.phase = 'fight'; G.waveI = 0; G.waveTime = 0;
  G.events.push({ type: 'fight', section: G.secI, at: sec.at, boss: sec.boss || null });
  if (sec.banter && !G.said.has(sec.banter)) { G.said.add(sec.banter); G.events.push({ type: 'line', line: sec.banter }); }
  // Acts II/III: a story scene before the boss walks in — everything holds until releaseHold(G) (brawl.js)
  if (sec.boss && G.ch.bossScene && !G.sceneDone?.has(G.secI)) {
    (G.sceneDone ||= new Set()).add(G.secI);
    G.hold = { sec, go: false };
    G.events.push({ type: 'bossScene', scene: G.ch.bossScene, boss: sec.boss, section: G.secI });
    return;
  }
  bossArrives(G, sec);
}

/** The boss (and its partner, for a pair) and the section's first wave arrive. */
export function bossArrives(G, sec) {
  if (sec.boss) {
    const def = G.data.enemies.bosses[sec.boss];
    const b = spawnFoe(G, sec.boss, sec.at + viewHalf(G) + 1.5, 0);
    b.enterT = 1.6;
    G.events.push({ type: 'boss', id: b.id, boss: sec.boss, name: def.name, title: def.title });
    if (def.lines?.start && !G.said.has(def.lines.start)) { G.said.add(def.lines.start); G.events.push({ type: 'line', line: def.lines.start }); }
    if (def.partner) {
      const P = G.data.enemies.bosses[def.partner];
      const p = spawnFoe(G, def.partner, sec.at - viewHalf(G) - 1.5, 0.8);
      p.enterT = 1.6;
      G.events.push({ type: 'boss', id: p.id, boss: def.partner, name: P.name, title: P.title, partnerOf: b.id });
    }
  }
  if (sec.waves.length) spawnWave(G, sec, G.waveI++);
}

/**
 * A wave as the chapter lists it, grown for co-op: every hero after the first adds T.coopFoes × the wave's size more
 * enemies (taken from the same list, in order), never past T.maxFoes on screen at once.
 */
export function waveFor(G, wave) {
  const n = heroCount(G), extra = Math.round(wave.length * G.T.coopFoes * (n - 1));
  const room = Math.max(wave.length, G.T.maxFoes - G.foes.filter(f => f.team === 1 && f.state !== 'dead').length);
  const out = [...wave];
  for (let k = 0; k < extra && out.length < room; k++) {
    const [type, side] = wave[k % wave.length].split('@');
    out.push(`${type}@${side === 'l' ? 'r' : side === 'r' ? 'l' : (k % 2 ? 'l' : 'r')}`);   // the extras come from the other side
  }
  return out;
}

function spawnWave(G, sec, i) {
  const wave = waveFor(G, sec.waves[i]); G.waveTime = 0;
  const half = G.T.viewWidth / 2;
  wave.forEach((spec, k) => {
    const [type, side] = spec.split('@');
    // ground-risers climb out on the street itself (riseFoe keeps them off the heroes and warns first)
    if (G.data.enemies.foes[type]?.rise) { riseFoe(G, type, sec.at + (G.rand() - 0.5) * (G.T.viewWidth - 4), clamp((G.rand() - 0.5) * 4.4, -2.3, 2.3)); return; }
    const fromLeft = side === 'l';
    const x = sec.at + (fromLeft ? -1 : 1) * (half + 1.2 + k * 0.9);
    const z = clamp((G.rand() - 0.5) * 4.4, -2.4, 2.4);
    spawnFoe(G, type, x, z);
  });
  G.events.push({ type: 'wave', section: G.secI, wave: i, count: wave.length });
}

function clearSection(G, sec) {
  G.events.push({ type: 'sectionClear', section: G.secI });
  if (sec.boss) {
    const def = G.data.enemies.bosses[sec.boss];
    if (def.lines?.end) G.events.push({ type: 'line', line: def.lines.end });
  }
  G.secI++; G.phase = 'walk';
  // revive anyone still waiting at the end of a fight (nobody loses a life for a fight the team already won)
  for (const h of G.heroes) if (h.state === 'out') { h.state = 'idle'; h.hp = Math.round(h.max * 0.4); h.invT = 1; G.events.push({ type: 'revive', id: h.id, pid: h.pid }); }
  if (G.secI >= G.ch.sections.length) { G.over = true; G.outcome = 'won'; G.events.push({ type: 'chapterClear', chapter: G.ch.id }); }
  else G.events.push({ type: 'go', section: G.secI });
}
