// T25 (play-test 5): the angling interface.
//   cast        X (or the hook button by the action bar, or a click on your rod in the bag) — again to reel in early
//   waiting     a small "Waiting for a bite…" pill; walking away ends it
//   the bite    a big prompt with a shrinking ring: press Space / E, or click or tap it, before the ring runs out
//   the tug     a bar with a green band the fish drags about and a float you hold in it: HOLD (Space, the mouse button or a
//               finger anywhere on the panel) to reel the float up, let go to let it sink. Stay in the band for most of
//               the few seconds it lasts. A rarer fish has a narrower band that moves faster.
//   the catch   a card: the fish, its size, "your biggest", a new species, the skill gained (a crate opens the reveal)
// Plus the cooking window at any fire (recipes, what each needs against what you carry, Cook / Cook all).
//
// Server (A's names; the first ones are D-UI's own and still answered): fish {op:'cast'|'hook'|'land'|'stop'} ·
// fishR {ok, state:'wait'} / {op:'bite'|'tug'|'catch'|'lost'|'miss'|'end'} · fishBite {ms} · fishTug {ms, band, pull, jitter, need}
// · fishCatch {…} · cook {} -> cookList {fire, recipes} · cook {id, n} -> cookR.
// D-world hears `tv:fish` on window: { state: 'cast'|'wait'|'bite'|'tug'|'catch'|'lost'|'idle', tension? } (rod bend, bobber).

import { createPanel, h } from '../ui-panel.js';
import { uiIconSvg } from '../../../../../icons/js/game-icons.js';
import { tugParams, tugStart, tugStep, tugHeld, tugTension, cookRows, rarityWord, rarityClass, anglingText } from './pt5-core.js';
import { fmt } from '../../../../../shared/format.js';

const WHY = { noPool: 'You can only fish at a fishing spot — rippling water with fish jumping. Stand on its bank and press E.', noRod: 'You need a fishing rod. The angler by the water has one for you.', noWater: 'Face some water first — a river, a lake, the shore.', far: 'Too far from the water.', combat: 'Not while you are fighting.', busy: 'You are busy.', swim: 'Not while you are swimming.', dead: 'You are dead.', skill: 'This pool needs a better angler.', notReady: 'The fish are not biting yet.', early: 'Too soon — you pulled before the bite.', late: 'Too late — it spat the hook.' };
export const isRod = it => !!it && (it.tool === 'rod' || it.kind === 'rod' || /(^|_)rod($|_)|angling_rod|fishing/i.test(`${it.id || ''} ${it.baseKey || ''}`) || /\b(fishing|angling) rod\b/i.test(it.name || ''));

export function createAngling({ net, hud, bag, reveal = null, typing = () => false }) {
  const S = { state: 'idle', biteUntil: 0, biteMs: 0, tug: null, holding: false, raf: 0, last: 0, card: 0, hasRod: false };
  const root = h('div.tv-fish', { hidden: true });
  (document.getElementById('hud') || document.body).appendChild(root);
  // play-test 10 (Y34: "why is there a drink button? … it was my fishing pole all along"): the control reads as FISHING —
  // a rod with its line and a fish — and says "Cast a line" in words under it, on its tip and to a screen reader
  const btn = h('button.slot.fish-btn', { type: 'button', hidden: true, dataset: { tip: 'Cast a line (X). Face the water first.' }, 'aria-label': 'Cast a line' },
    h('span.key', {}, 'X'), h('span.fish-glyph', { 'aria-hidden': 'true' }), h('small.fish-cap', {}, 'Cast a line'));
  btn.querySelector('.fish-glyph').innerHTML = uiIconSvg('cast_line', 30, { medallion: true });       // 2026-10-14: the icon library's picture
  // round 11 (P, live #12): the action-bar fishing button is gone — you fish by pressing E at a fish pool (objects.js
  // KINDS.fishpool); its slot is the UI stream's Mount button (Z28). The element is kept off the page so the code below that
  // labels it stays harmless.
  btn.addEventListener('click', () => castOrStop());

  // D-world hears only the agreed names: the moment between the press and the tug still reads 'bite', the wait for the answer 'tug'
  const OUT = { hooked: 'bite', landing: 'tug' };
  const say = (state, extra = {}) => { S.state = state; root.dataset.state = state; btn.classList.toggle('on', state !== 'idle'); { const cap = btn.querySelector('.fish-cap'), txt = state === 'idle' ? 'Cast a line' : state === 'bite' ? 'Hook it!' : 'Reel in'; if (cap) cap.textContent = txt; btn.setAttribute('aria-label', txt); btn.dataset.tip = state === 'idle' ? 'Cast a line (X). Face the water first.' : state === 'bite' ? 'A bite — press X (or Space) now.' : 'Reel in (X).'; } window.dispatchEvent(new CustomEvent('tv:fish', { detail: { state: OUT[state] || state, ...extra } })); };
  const send = (op, a = {}) => { const n = net(); if (!n) return; if (typeof n.fish === 'function') n.fish(op, a); else n._raw?.('game', JSON.stringify({ t: 'fish', op, ...a })); };

  function idle() { cancelAnimationFrame(S.raf); S.tug = null; S.holding = false; root.hidden = true; root.replaceChildren(); say('idle'); }
  function castOrStop(pool = null) {
    if (S.state === 'bite') return hook();
    if (S.state === 'tug') return;
    if (S.state === 'wait' || S.state === 'cast') { send('stop'); idle(); hud.toast('You reel in.', 'info'); return; }
    say('cast');
    root.hidden = false;
    root.replaceChildren(h('div.fish-pill', {}, h('i.fish-dot'), 'Casting…'));
    send('cast', pool != null ? { pool } : {});
    clearTimeout(S.castT); S.castT = setTimeout(() => { if (S.state === 'cast') { idle(); hud.toast(WHY.noPool, 'warn'); } }, 5000);
  }
  function waiting() {
    say('wait');
    root.hidden = false;
    root.replaceChildren(h('div.fish-pill', {}, h('i.fish-dot.bob'), 'Waiting for a bite…', h('small', {}, 'E reels in · walking away ends it')));
  }
  function bite(ms = 1500) {
    S.biteMs = Math.max(400, ms); S.biteUntil = performance.now() + S.biteMs;
    say('bite');
    const b = h('button.fish-bite', { type: 'button', style: `--ms:${S.biteMs}ms`, 'aria-label': 'A bite! Hook it' },
      h('span.fish-ring', { 'aria-hidden': 'true' }), h('strong', {}, 'A bite!'), h('span', {}, 'Press Space or E — or tap here'));
    b.addEventListener('pointerdown', e => { e.preventDefault(); hook(); });
    root.hidden = false; root.replaceChildren(b);
    clearTimeout(S.biteT); S.biteT = setTimeout(() => { if (S.state === 'bite') { root.replaceChildren(h('div.fish-pill.miss', {}, 'It got away.')); say('lost'); setTimeout(() => { if (S.state === 'lost') idle(); }, 1200); } }, S.biteMs + 250);
  }
  function hook() { if (S.state !== 'bite') return; clearTimeout(S.biteT); send('hook'); root.replaceChildren(h('div.fish-pill', {}, h('i.fish-dot'), 'Hooked…')); say('hooked'); S.hookT = setTimeout(() => { if (S.state === 'hooked') idle(); }, 4000); }

  // ---- the tug ----
  function tug(m = {}) {
    clearTimeout(S.hookT);
    const p = tugParams(m.tug || m);
    S.tug = tugStart(p); S.holding = false; S.last = performance.now();
    const band = h('i.tug-band'), float = h('i.tug-float'), time = h('i'), meter = h('i');
    const heft = m.heft === 'huge' ? 'Something huge is on the line!' : m.heft === 'heavy' ? 'A heavy one!' : m.hint || 'Got one!';
    const panel = h('div.fish-tug', { role: 'application', 'aria-label': 'Reel it in: hold to pull the float up, let go to let it sink' },
      h('strong.tug-title' + (m.rarity ? '.r-' + rarityClass(m.rarity) : ''), {}, heft),
      h('div.tug-row', {},
        h('div.tug-bar', {}, band, float),
        h('div.tug-side', {},
          h('span.tug-how', {}, h('b', {}, 'Hold'), ' to reel in', h('br'), h('b', {}, 'Let go'), ' to give line'),
          h('span.tug-keys', {}, 'Space · mouse · finger'),
          h('div.tug-meter', { dataset: { tip: 'How much of the time you have kept the float in the green' } }, meter, h('em', { style: `left:${(p.need * 100).toFixed(0)}%` })),
          h('span.tug-need', {}, `Keep it in the green ${fmt(p.need * 100, { decimals: 0 })}% of the time`))),
      h('div.tug-time', {}, time));
    const hold = on => e => { if (S.state !== 'tug') return; e.preventDefault(); S.holding = on; panel.classList.toggle('holding', on); };
    panel.addEventListener('pointerdown', e => { try { panel.setPointerCapture(e.pointerId); } catch { /* old browser */ } hold(true)(e); });
    panel.addEventListener('pointerup', hold(false)); panel.addEventListener('pointercancel', hold(false));
    panel.addEventListener('contextmenu', e => e.preventDefault());
    root.hidden = false; root.replaceChildren(panel);
    say('tug', { tension: 0.5 });
    const frame = now => {
      if (S.state !== 'tug' || !S.tug) return;
      // real time whatever the frame rate: a slow frame is played as several short steps (one step is capped at 0.1 s)
      let left = Math.min(0.6, (now - S.last) / 1000); S.last = now;
      let s = S.tug;
      do { const d = Math.min(left, 0.05); s = tugStep(S.tug, d, S.holding); left -= d; } while (left > 0.0005 && !s.done);
      band.style.bottom = ((s.centre - p.band / 2) * 100).toFixed(2) + '%'; band.style.height = (p.band * 100).toFixed(2) + '%';
      float.style.bottom = (s.pos * 100).toFixed(2) + '%';
      const inBand = Math.abs(s.pos - s.centre) <= p.band / 2;
      panel.classList.toggle('in', inBand);
      const held = tugHeld(s);
      meter.style.width = (held * 100).toFixed(1) + '%'; meter.className = held >= p.need ? 'ok' : '';
      time.style.width = Math.max(0, 100 - s.t * 1000 / p.ms * 100).toFixed(1) + '%';
      if ((frame.n = (frame.n || 0) + 1) % 6 === 0) window.dispatchEvent(new CustomEvent('tv:fish', { detail: { state: 'tug', tension: tugTension(s) } }));
      if (s.done) { const score = +held.toFixed(3); send('land', { held: score, score }); root.replaceChildren(h('div.fish-pill', {}, h('i.fish-dot'), score >= p.need ? 'Reeling it in…' : 'It is slipping…')); say('landing'); S.landT = setTimeout(() => { if (S.state === 'landing') idle(); }, 5000); return; }
      S.raf = requestAnimationFrame(frame);
    };
    S.raf = requestAnimationFrame(frame);
  }

  // ---- the catch ----
  function caught(m = {}) {
    clearTimeout(S.landT); cancelAnimationFrame(S.raf); S.tug = null;
    if (m.ok === false || m.lost) {
      say('lost');
      root.hidden = false; root.replaceChildren(h('div.fish-pill.miss', {}, m.msg || (m.species?.name ? `The ${m.species.name} slipped the hook.` : 'It slipped the hook.')));
      setTimeout(() => { if (S.state === 'lost') idle(); }, 1800);
      return;
    }
    say('catch', { rarity: m.species?.rarity || m.item?.rarity });
    if (m.monster) { root.replaceChildren(h('div.fish-pill.miss', {}, `Something pulls back — ${typeof m.monster === 'string' ? m.monster : m.monster.name || m.name || 'a thing from the water'} climbs out!`)); root.hidden = false; setTimeout(() => { if (S.state === 'catch') idle(); }, 2600); return; }
    const sp = m.species && typeof m.species === 'object' ? m.species : { id: m.species, name: m.name || m.item?.name, rarity: m.item?.rarity };
    const kind = m.kind || (m.crate ? 'crate' : sp.legend ? 'legend' : 'fish');
    const name = sp.name || m.item?.name || 'Something';
    const r = rarityClass(sp.rarity || m.item?.rarity || 'common');
    const lines = [];
    if (Number.isFinite(m.size)) lines.push(`${fmt(m.size, { decimals: 1 })} cm${m.record || m.best ? ' — your biggest yet' : ''}`);
    if (m.first) lines.push('A new species for your journal');
    if (kind === 'legend') lines.push(m.title ? `A legend. You are now “${m.title}”.` : 'A legend of these waters!');
    if (kind === 'junk') lines.push('Not a fish, but it is yours.');
    if (kind === 'crate') lines.push('A sunken crate — open it from your bag.');
    if (m.skill?.up) lines.push(`Angling is now ${m.skill.level}`);
    else if (m.skill && Number.isFinite(m.skill.xp) && m.skill.next > 0) lines.push(anglingText(m.skill).sub);
    if (m.pool && Number.isFinite(m.pool.left)) lines.push(m.pool.left > 0 ? `This pool has ${m.pool.left} more in it` : 'The pool is fished out — another will stir elsewhere');
    const card = h('div.fish-card.r-' + r + (kind === 'legend' ? '.legend' : ''), {},
      h('span.fish-from', {}, kind === 'junk' ? 'You pull up' : kind === 'crate' ? 'Hauled up' : 'You caught'),
      h('strong.r-' + r, {}, name), kind === 'fish' || kind === 'legend' ? h('em', {}, rarityWord(sp.rarity || 'common')) : null,
      ...lines.map(l => h('span', {}, l)), h('small', {}, 'X casts again'));
    root.hidden = false; root.replaceChildren(card);
    hud.chat?.(`You ${kind === 'junk' ? 'pull up' : 'catch'} ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}${Number.isFinite(m.size) ? ` (${fmt(m.size, { decimals: 1 })} cm${m.record || m.best ? ', your biggest' : ''})` : ''}.`, 'loot rarity-' + r);
    if (m.skill?.up) hud.toast(`Angling ${m.skill.level}`, 'good');
    clearTimeout(S.card); S.card = setTimeout(() => { if (S.state === 'catch') idle(); }, 4500);
  }

  // ---- keys ----
  window.addEventListener('keydown', e => {
    if (typing() || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.state === 'bite' && (e.code === 'Space' || e.code === 'KeyE')) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) hook(); return; }
    if (S.state === 'tug' && e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); S.holding = true; root.firstChild?.classList.add('holding'); return; }
    // round 11 (live #12 / #29): X no longer casts — fishing is E at a fish pool, and X is the UI stream's Mount key
  }, true);
  window.addEventListener('keyup', e => { if (e.code === 'Space' && S.state === 'tug') { S.holding = false; root.firstChild?.classList.remove('holding'); e.stopImmediatePropagation(); } }, true);
  window.addEventListener('blur', () => { S.holding = false; });

  function rodCheck() {
    const b = bag?.state; if (!b) return;
    S.hasRod = isRod(b.equipment?.tool) || (b.bag || []).some(isRod) || !!net()?.joined?.you?.angling?.rod;
    btn.hidden = !S.hasRod;
  }

  // ---- cooking ----
  const C = { recipes: [], fire: true, busy: null, data: null };
  const cook = createPanel({ id: 'cook', title: 'Cooking', width: 400, cls: 'cook-panel', onOpen: () => { askCook(); drawCook(); } });
  // A: net.cook() -> cookList ; net.cook(id, n) -> cookR
  const sendCook = a => { const n = net(); if (!n) return; if (typeof n.cook === 'function') n.cook(a.id, a.n); else n._raw?.('game', JSON.stringify({ t: 'cook', ...a })); };
  function askCook() { const n = net(); if (!n?.joined) return; if (typeof n.cook === 'function') n.cook(); else n._raw?.('game', JSON.stringify({ t: 'cook' })); }
  function bagCount(id, isTag) {
    const items = bag?.state?.bag || [];
    const fishRow = fid => (C.data?.fish || []).find(f => f.id === fid);
    return items.filter(it => {
      const fid = it.species || it.id || it.baseKey;
      if (!isTag) return fid === id;
      if (it.kind !== 'fish' && it.type !== 'fish') return false;
      const f = fishRow(fid) || {};
      return id === 'fish' || id === 'any' || (it.tags || f.tags || []).includes(id) || [].concat(f.water || []).includes(id) || (it.rarity || f.rarity) === id;
    }).length;
  }
  function drawCook() {
    if (!cook.isOpen) return;
    const skill = net()?.joined?.you?.angling?.level || 1;
    const names = Object.fromEntries((C.data?.fish || []).map(f => [f.id, f.name]));
    const rows = cookRows(C.recipes, bagCount, skill, names);
    cook.setTitle('Cooking', C.fire ? 'At the fire' : 'You need a fire');
    cook.fill(
      C.fire ? h('p.tiny-left', {}, 'Fish become meals. A meal is eaten sitting down, like any food, and leaves you with its boon for a while.') : h('p.tiny-left.warn-text', {}, 'Stand at a campfire or an inn hearth to cook. You can read the recipes anywhere.'),
      rows.length ? h('ul.ck-list', {}, ...rows.map(r => h('li.ck-row' + (r.can && C.fire ? '' : '.no'), { dataset: { id: r.id } },
        h('div.ck-main', {}, h('b', {}, r.name), r.text ? h('small', {}, r.text) : null,
          h('span.ck-needs', {}, ...r.needs.map(n => h('span.' + (n.ok ? 'ok' : 'lack'), {}, `${n.have}/${n.want} ${n.name}`))),
          r.why ? h('small.ck-why', {}, r.why) : null),
        h('div.ck-btns', {},
          h('button.primary.small', { type: 'button', disabled: !r.can || !C.fire || C.busy === r.id, dataset: { cook: r.id }, onclick: () => { C.busy = r.id; sendCook({ id: r.id, n: 1 }); drawCook(); setTimeout(() => { if (C.busy === r.id) { C.busy = null; drawCook(); } }, 4000); } }, 'Cook'),
          r.times > 1 ? h('button.ghost.small', { type: 'button', disabled: !C.fire, dataset: { cookall: r.id }, onclick: () => { C.busy = r.id; sendCook({ id: r.id, n: r.times }); drawCook(); setTimeout(() => { if (C.busy === r.id) { C.busy = null; drawCook(); } }, 4000); } }, `All (${r.times})`) : null))))
        : h('p.empty', {}, 'No recipes yet. Catch something first — the angler knows a few.'));
  }
  function openCook(u = {}) {
    if (Array.isArray(u.recipes)) { C.recipes = u.recipes; C.fire = u.fire !== false; }
    else if (!C.recipes.length && C.data?.recipes) C.recipes = C.data.recipes.map(r => ({ ...r, makes: typeof r.makes === 'string' ? { id: r.makes, name: C.data.meals?.[r.makes]?.name, text: C.data.meals?.[r.makes]?.desc } : r.makes }));
    cook.open(); drawCook();
  }

  function wire(n) {
    n.on('joined', () => { idle(); rodCheck(); });
    n.on('bag', () => { rodCheck(); drawCook(); });
    n.on('equip', () => rodCheck());
    n.on('fishR', r => {
      clearTimeout(S.castT);
      const op = r.op || (r.state === 'wait' ? 'cast' : null);
      if (r.ok === false) {
        if (op === 'miss' || r.why === 'early' || r.why === 'late') { root.hidden = false; root.replaceChildren(h('div.fish-pill.miss', {}, r.msg || WHY[r.why] || 'It got away.')); say('lost'); setTimeout(() => { if (S.state === 'lost') idle(); }, 1500); return; }
        idle(); hud.toast(r.msg || WHY[r.why] || 'You cannot fish here.', 'warn'); return;
      }
      if (op === 'cast' || r.state === 'wait') waiting();
      else if (op === 'bite') bite(r.ms);
      else if (op === 'tug') tug(r);
      else if (op === 'catch') caught(r);
      else if (op === 'lost') caught({ ...r, lost: true });
      else if (op === 'miss') { root.replaceChildren(h('div.fish-pill.miss', {}, r.msg || WHY[r.why] || 'It got away.')); say('lost'); setTimeout(() => { if (S.state === 'lost') idle(); }, 1500); }
      else if (op === 'monster') caught({ monster: r.name || true });
      else if (op === 'end' || r.state === 'idle') { if (S.state !== 'catch' && S.state !== 'lost') { idle(); if (r.why === 'moved' || r.why === 'move') hud.toast('You wind the line in as you walk off.', 'info'); else if (r.why === 'hit') hud.toast('You drop the line — you are under attack!', 'warn'); } }
    });
    n.on('fishBite', m => bite(m.ms));
    n.on('fishTug', m => tug(m));
    n.on('fishCatch', m => { caught(m); if (m.crate && m.item && reveal && m.opened) reveal.show(m.item, { from: 'fish' }); });
    n.on('used', u => { if (u.ok && (u.cook || u.kind === 'hearth')) openCook(u); });
    n.on('cookList', m => { C.recipes = m.recipes || []; C.fire = m.fire !== false; if (m.open) cook.open(); drawCook(); });
    n.on('cookR', r => {
      C.busy = null;
      if (r.op === 'list' && Array.isArray(r.recipes)) { C.recipes = r.recipes; C.fire = r.fire !== false; drawCook(); return; }
      if (!r.ok) { hud.toast(r.msg || ({ fire: 'You need a fire to cook on.', lack: 'You do not have what it needs.', skill: 'Your angling is not good enough for that yet.', bagFull: 'Your bag is full.' }[r.why]) || 'That did not work.', 'warn'); drawCook(); return; }
      const made = r.items || r.made || (r.item ? [r.item] : []);
      hud.toast(made.length ? `Cooked: ${made.length > 1 ? made.length + ' × ' : ''}${made[0].name}` : (r.msg || 'Cooked.'), 'good');
      if (cook.isOpen) askCook();
      drawCook();
    });
  }
  /** E's content file (species, recipes, meals): the Catch tab and the cooking window's names. */
  let dataP = null;
  const loadData = () => (dataP ||= fetch(new URL('../../../data/provinces/angling.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => { C.data = d || { fish: [], legends: [], recipes: [] }; return C.data; }));
  loadData();

  return { wire, cook, openCook, castOrStop, loadData, isRod, get data() { return C.data; },
    /** A bag click on a rod casts. */
    useItem(it) { if (!isRod(it) || it.slot) return false; bag?.toggle(false); castOrStop(); return true; },   // a rod with a slot is worn (Tool) by the click; X casts
    get state() { return { state: S.state, hasRod: S.hasRod, holding: S.holding, tug: S.tug ? { pos: S.tug.pos, centre: S.tug.centre, held: tugHeld(S.tug), t: S.tug.t } : null, cook: { open: cook.isOpen, recipes: C.recipes.length, fire: C.fire } }; },
    _test: { bite, tug, caught, waiting, idle } };
}
