// SHIFTY PORTRAITS on a screen: a purple-papered hallway wall with gilded frames in a grid (3x2, or 4x2 on hard). Each
// portrait is a small SVG drawn from [subject, accessory, frame colour, facing]. Study: the lights are on and a
// candle-lit banner says "Remember the wall!". Dark: the wall goes nearly black and flickers while a little sheet ghost
// floats across. Guess: the wall is back (changed); a big line says how many changed; tap that many portraits (a tap is
// final, it gets a magnifying-glass badge). Reveal: the changed ones glow green with what happened ("Hat swap!") and a
// small "was" picture of the old portrait in the corner; your wrong taps get a red cross; chips show each +/-.
import { esc, chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';

const INK = '#1a0f26';
const O = (w = 2) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/** Each subject in a 100 x 120 box, facing right (looking at +x). The face sits around (50, 66). */
const SUBJ = {
  ghost: () => `<path d="M24 104 V60 a26 26 0 0 1 52 0 V104 l-8 -7 -9 7 -9 -7 -9 7 -9 -7 Z" fill="#f6f1ff" ${O()}/>
    <ellipse cx="58" cy="62" rx="4.5" ry="6" fill="${INK}"/><ellipse cx="72" cy="62" rx="4" ry="5.5" fill="${INK}"/><ellipse cx="65" cy="76" rx="5" ry="4" fill="${INK}"/>`,
  cat: () => `<path d="M26 104 Q22 74 34 62 L28 38 L46 52 Q50 50 54 52 L72 38 L66 62 Q78 74 74 104 Z" fill="#2a2433" ${O()}/>
    <ellipse cx="56" cy="68" rx="5" ry="6" fill="#ffd23f"/><ellipse cx="70" cy="68" rx="5" ry="6" fill="#ffd23f"/><ellipse cx="58" cy="68" rx="1.8" ry="4.5" fill="${INK}"/><ellipse cx="72" cy="68" rx="1.8" ry="4.5" fill="${INK}"/>
    <path d="M62 78 l3 3 3 -3" fill="#ff9ec8" ${O(1.4)}/><path d="M66 82 q-3 4 -7 2 M66 82 q3 4 7 2" fill="none" stroke="#f6f1ff" stroke-width="1.6"/>`,
  bat: () => `<path d="M50 60 Q30 44 8 54 Q16 62 14 74 Q24 66 32 76 Q36 66 42 72 Z M50 60 Q70 44 92 54 Q84 62 86 74 Q76 66 68 76 Q64 66 58 72 Z" fill="#4a3a6a" ${O()}/>
    <ellipse cx="50" cy="70" rx="15" ry="17" fill="#5a4a7e" ${O()}/><path d="M38 56 L40 46 L46 55 M62 56 L60 46 L54 55" fill="#5a4a7e" ${O()}/>
    <circle cx="51" cy="66" r="4" fill="#fff"/><circle cx="61" cy="66" r="4" fill="#fff"/><circle cx="52.5" cy="66.5" r="2" fill="${INK}"/><circle cx="62.5" cy="66.5" r="2" fill="${INK}"/><path d="M52 77 q4 3 8 0" fill="none" ${O(1.6)}/>`,
  pumpkin: () => `<ellipse cx="50" cy="76" rx="32" ry="26" fill="#ff8a1a" ${O()}/><path d="M38 52 Q34 76 38 100 M62 52 Q66 76 62 100 M50 50 V102" fill="none" stroke="#c45a00" stroke-width="2"/>
    <path d="M48 52 Q47 42 54 38" fill="none" stroke="#3a7a2a" stroke-width="5" stroke-linecap="round"/>
    <path d="M52 66 l6 -7 6 7 Z M66 66 l6 -7 6 7 Z" fill="#ffd23f" ${O(1.5)}/><path d="M50 80 Q62 92 78 80 Q64 86 50 80 Z" fill="#ffd23f" ${O(1.5)}/>`,
  owl: () => `<ellipse cx="50" cy="78" rx="26" ry="28" fill="#a0703c" ${O()}/><ellipse cx="50" cy="86" rx="16" ry="17" fill="#e8c890"/><path d="M28 56 L32 44 L42 54 M72 56 L68 44 L58 54" fill="#a0703c" ${O()}/>
    <circle cx="42" cy="66" r="9" fill="#fff" ${O(1.5)}/><circle cx="60" cy="66" r="9" fill="#fff" ${O(1.5)}/><circle cx="45" cy="66" r="4" fill="${INK}"/><circle cx="63" cy="66" r="4" fill="${INK}"/><path d="M49 72 l3 6 3 -6 Z" fill="#ffb02e" ${O(1.2)}/>`,
  frog: () => `<ellipse cx="50" cy="84" rx="32" ry="20" fill="#5cc85a" ${O()}/><circle cx="38" cy="62" r="11" fill="#5cc85a" ${O()}/><circle cx="62" cy="62" r="11" fill="#5cc85a" ${O()}/>
    <circle cx="40" cy="62" r="6" fill="#fff"/><circle cx="64" cy="62" r="6" fill="#fff"/><circle cx="42.5" cy="62" r="3" fill="${INK}"/><circle cx="66.5" cy="62" r="3" fill="${INK}"/><path d="M36 86 Q52 98 70 86" fill="none" ${O(2)}/><circle cx="30" cy="84" r="3" fill="#ff9ec8" opacity=".7"/><circle cx="72" cy="84" r="3" fill="#ff9ec8" opacity=".7"/>`,
  mummy: () => `<rect x="28" y="42" width="44" height="62" rx="20" fill="#efe6cf" ${O()}/><path d="M28 56 L72 62 M28 70 L72 66 M28 84 L72 90 M30 96 L70 98" stroke="#c8b890" stroke-width="2.4"/>
    <rect x="34" y="62" width="34" height="11" rx="5" fill="#3a2a4a"/><circle cx="50" cy="67" r="3.6" fill="#fff"/><circle cx="62" cy="67" r="3.6" fill="#fff"/><circle cx="51.5" cy="67" r="1.8" fill="${INK}"/><circle cx="63.5" cy="67" r="1.8" fill="${INK}"/><path d="M50 82 q6 4 12 0" fill="none" ${O(1.6)}/>`,
  skull: () => `<path d="M28 74 a22 24 0 0 1 44 0 v10 q0 6 -6 6 h-2 v8 h-28 v-8 h-2 q-6 0 -6 -6 Z" fill="#f4ecd8" ${O()}/>
    <ellipse cx="44" cy="74" rx="7" ry="8" fill="#3a2a4a"/><ellipse cx="62" cy="74" rx="7" ry="8" fill="#3a2a4a"/><circle cx="46" cy="72" r="2.2" fill="#fff"/><circle cx="64" cy="72" r="2.2" fill="#fff"/><path d="M50 84 l3 -5 3 5 Z" fill="#3a2a4a"/><path d="M42 92 q11 6 22 0" fill="none" ${O(1.8)}/>`,
  witch: () => `<path d="M30 112 Q30 88 50 86 Q70 88 70 112 Z" fill="#6a3cb8" ${O()}/><circle cx="50" cy="68" r="19" fill="#9be07a" ${O()}/><path d="M30 60 Q26 76 32 88 M70 60 Q74 76 68 88" fill="none" stroke="#3a2a4a" stroke-width="6" stroke-linecap="round"/>
    <circle cx="51" cy="66" r="3.6" fill="${INK}"/><circle cx="62" cy="66" r="3.6" fill="${INK}"/><path d="M56 72 q5 4 4 8" fill="#7ac85a" ${O(1.4)}/><path d="M48 80 q7 5 14 0" fill="none" ${O(1.6)}/><circle cx="44" cy="75" r="3" fill="#ff9ec8" opacity=".6"/>`,
  spider: () => `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M38 74 Q22 62 14 70 M38 80 Q20 78 12 88 M38 86 Q24 94 18 106 M62 74 Q78 62 86 70 M62 80 Q80 78 88 88 M62 86 Q76 94 82 106"/></g>
    <path d="M50 30 V56" stroke="#d8d0e8" stroke-width="1.5"/><ellipse cx="50" cy="78" rx="18" ry="16" fill="#3a2a4a" ${O()}/>
    <circle cx="51" cy="74" r="5" fill="#fff"/><circle cx="63" cy="74" r="5" fill="#fff"/><circle cx="53" cy="74.5" r="2.4" fill="${INK}"/><circle cx="65" cy="74.5" r="2.4" fill="${INK}"/><path d="M52 85 q5 4 10 0" fill="none" stroke="#ff9ec8" stroke-width="2"/>`,
};
/** Hats and bows: placed on top of the subject (y ~ 44) — never more than a little decoration. */
const ACC = {
  none: () => '',
  tophat: () => `<rect x="38" y="20" width="24" height="22" rx="2" fill="#2a2433" ${O()}/><rect x="31" y="40" width="38" height="6" rx="3" fill="#2a2433" ${O()}/><rect x="38" y="34" width="24" height="5" fill="#e8383d"/>`,
  bow: () => `<path d="M50 40 L34 31 Q30 40 34 49 Z M50 40 L66 31 Q70 40 66 49 Z" fill="#ff7ab8" ${O()}/><circle cx="50" cy="40" r="5" fill="#ff4f9a" ${O(1.6)}/>`,
  crown: () => `<path d="M34 46 L34 28 L42 37 L50 24 L58 37 L66 28 L66 46 Z" fill="#ffd23f" ${O()}/><circle cx="50" cy="38" r="3" fill="#e8383d"/>`,
  flower: () => `<g transform="translate(62 40)">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-7" rx="5" ry="7" transform="rotate(${a})" fill="#fff6a0" ${O(1.2)}/>`).join('')}<circle r="4.5" fill="#ff8a1a" ${O(1.2)}/></g>`,
};
const KIND_TEXT = { subject: 'New face!', acc: 'Hat swap!', frame: 'Repainted!', turn: 'Turned round!', swap: 'Swapped!' };

export function portraitSvg(p, init, { mini = false } = {}) {
  const [s, a, f, left] = p, sub = init.subjects[s], acc = init.accs[a], frame = init.frames[f];
  return `<svg viewBox="0 0 100 120" class="sp-pic${mini ? ' mini' : ''}" aria-label="${esc(init.names[sub])}">
    <rect x="3" y="3" width="94" height="114" rx="8" fill="${frame}" ${O(2.5)}/><rect x="11" y="11" width="78" height="98" rx="4" fill="#2e2148" ${O(1.6)}/>
    <ellipse cx="50" cy="72" rx="34" ry="36" fill="#3d2d60"/>
    <g ${left ? 'transform="translate(100 0) scale(-1 1)"' : ''}>${SUBJ[sub]()}${ACC[acc]()}</g>
    <circle cx="11" cy="11" r="3" fill="#fff" opacity=".5"/></svg>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="sp-top"><span class="sp-title">Shifty Portraits</span><span class="sp-round"></span><span class="clock"><b>--</b></span></div>
    <div class="sp-banner"></div>
    <div class="sp-hall"><div class="sp-wall" style="--cols:${init.cols}"></div><div class="sp-ghost">👻</div></div>
    <div class="sp-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="sp-st"></strong>')).join('')}</div>
    <p class="sp-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.sp-players [data-pid="${me}"]`)?.classList.add('me');
  const wallEl = $('.sp-wall'), tunes = createTunes({ volume: 0.2 });
  const cells = Array.from({ length: init.cols * init.rows }, (_, i) => { const b = document.createElement('button'); b.className = 'sp-cell'; b.dataset.i = i; b.type = 'button'; wallEl.append(b); return b; });
  let phase = '', round = -1, mine = [], need = 0, wallKey = '';
  function drawWall(wall) {
    const key = JSON.stringify(wall); if (key === wallKey) return; wallKey = key;
    wall.forEach((p, i) => { cells[i].innerHTML = portraitSvg(p, init) + '<span class="sp-badge"></span><span class="sp-was"></span>'; });
  }
  function paintMine() {
    cells.forEach((c, i) => c.classList.toggle('picked', mine.includes(i)));
    cells.forEach(c => c.classList.toggle('full', phase === 'guess' && mine.length >= need));
  }
  wallEl.addEventListener('pointerdown', e => {
    const c = e.target.closest('.sp-cell'); if (!c || watching || phase !== 'guess') return;
    const i = +c.dataset.i; if (mine.includes(i) || mine.length >= need) return;
    e.preventDefault(); mine.push(i); ctx.send('tap', i); ctx.sfx('pick'); paintMine(); paintNote();
  });
  const onKey = e => { if (phase !== 'guess' || watching) return; const n = +e.key; if (n >= 1 && n <= cells.length) { const i = n - 1; if (!mine.includes(i) && mine.length < need) { mine.push(i); ctx.send('tap', i); ctx.sfx('pick'); paintMine(); paintNote(); } } };
  addEventListener('keydown', onKey);

  let last = null;
  function enter(g) {
    cells.forEach(c => { c.classList.remove('changed', 'wrong', 'right'); const b = c.querySelector('.sp-badge'), w = c.querySelector('.sp-was'); if (b) b.textContent = ''; if (w) w.innerHTML = ''; });
    if (g.phase === 'study') { mine = []; drawWall(g.wall); ctx.sfx('open'); tunes.fx('chime', 1); }
    if (g.phase === 'dark') { ctx.sfx('trap'); tunes.fx('boo', 1); }
    if (g.phase === 'guess') { mine = []; drawWall(g.wall); ctx.sfx('tap'); }
    if (g.phase === 'reveal') {
      drawWall(g.wall);
      const myTaps = me != null ? g.taps[me] || [] : [];
      g.changed.forEach(i => {
        const c = cells[i]; c.classList.add('changed');
        c.querySelector('.sp-was').innerHTML = `<small>was</small>${portraitSvg(g.before[i], init, { mini: true })}`;
        if (myTaps.includes(i)) c.classList.add('right');
      });
      g.changed.forEach(i => { cells[i].querySelector('.sp-badge').textContent = kindFor(g, i); });
      for (const i of myTaps) if (!g.changed.includes(i)) cells[i].classList.add('wrong');
      if (me != null) ctx.sfx(g.gain[me] > 0 ? 'good' : g.gain[me] < 0 ? 'bad' : 'tap');
    }
    if (g.phase === 'end') { ctx.sfx('win'); tunes.stop(); }
  }
  /** What changed in portrait i (compare before and after). */
  function kindFor(g, i) {
    const a = g.before[i], b = g.wall[i];
    if (a[0] !== b[0]) return g.changed.some(j => j !== i && g.before[j][0] === b[0]) ? KIND_TEXT.swap : KIND_TEXT.subject;
    if (a[1] !== b[1]) return KIND_TEXT.acc; if (a[2] !== b[2]) return KIND_TEXT.frame; if (a[3] !== b[3]) return KIND_TEXT.turn;
    return '';
  }
  function paintNote() {
    const g = last; if (!g) return;
    let t = '';
    if (g.phase === 'ready') t = 'Look closely at every portrait…';
    else if (g.phase === 'study') t = round === 0 ? 'Remember the wall! Faces, hats, frames, which way they look.' : 'Have another look before the lights go…';
    else if (g.phase === 'dark') t = 'Lights out! Something is moving…';
    else if (g.phase === 'guess') t = watching ? `${g.done.filter(n => n >= g.need).length} of ${players.length} done` : mine.length >= need ? 'Done! Waiting for the others…' : `Tap ${need - mine.length} more`;
    else if (g.phase === 'reveal') t = me != null ? (g.gain[me] > 0 ? `+${g.gain[me]} — sharp eyes!` : g.gain[me] < 0 ? `${g.gain[me]} — the ghost fooled you!` : 'No points this time.') : '';
    else if (g.phase === 'end') {
      if (init.solo && me != null) { const s = g.scores[me], m = init.medals; t = `${s} of ${init.max} — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      else t = 'The ghost waves goodbye! Most points wins.';
    }
    $('.sp-note').textContent = t;
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.sp-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.sp-st'); let t = '', cls = '';
      if (g.phase === 'guess') { const i = players.indexOf(p), n = g.done[i] ?? 0; t = `${n}/${g.need}`; cls = n >= g.need ? 'in' : ''; }
      if (g.phase === 'reveal') { const v = g.gain[p.pid]; t = v > 0 ? `+${v}` : String(v); cls = v > 0 ? 'in' : v < 0 ? 'bad' : ''; }
      st.textContent = t; st.className = 'sp-st ' + cls;
    }
  }
  return {
    priv(d) { if (phase === 'guess' && d.taps && d.taps.length > mine.length) { mine = d.taps.slice(); paintMine(); paintNote(); } },
    state(g) {
      last = g;
      if (g.phase !== phase || g.round !== round) {
        if (round === -1 && g.round >= 0) tunes.start('spooky');
        phase = g.phase; round = g.round; enter(g);
      }
      need = g.need || 0;
      ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'guess' && g.left <= 2);
      $('.sp-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      $('.sp-banner').textContent = g.phase === 'study' ? 'Remember the wall!' : g.phase === 'dark' ? 'Lights out…' : g.phase === 'guess' ? `${g.need} changed — tap ${g.need === 1 ? 'it' : 'them'}!` : g.phase === 'reveal' ? 'What the ghost did…' : '';
      paintMine(); paintChips(g); paintNote();
    },
    dispose() { removeEventListener('keydown', onKey); tunes.dispose(); },
  };
}
