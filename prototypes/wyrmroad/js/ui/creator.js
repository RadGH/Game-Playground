// Hero creator (its own screen — lessons rule 13): the live 3D hero (wearing the class's starter kit) stays in view on
// phone and desktop; beside/below it a name with a random-name button, then four tabs of ‹ › rows — Class (the four
// classes with their numbers and spells), Face, Hair, Body. Tapping a row's value opens the whole list. Works by
// mouse, thumb, keyboard and controller (the pad walks the buttons). Starting points: Oddhaven creator.js + design.js
// (rows, tabs, body always visible) and Tumblefair editor.js (character visible on phones).
import { heroStats, starterGear } from '../sim/items.js';
import { icon } from './icons.js';
import { esc, CLASS_NAMES, spellText, spellCost, itemName, holdLine } from './text.js';
import { LOOK, randomLook, randomName, classLook } from './looks.js';
import { newHero } from '../save.js';
import { soloParty } from './party.js';
import { openSheet } from './kit.js';
import { hp as n } from '../../../../shared/format.js';

const CLASS_ORDER = ['vanguard', 'duelist', 'arcanist', 'warden'];
const CLASS_ICON = { vanguard: 'heavy', duelist: 'hundred_cuts', arcanist: 'fire_bolt', warden: 'block' };
const TABS = [['class', 'Class'], ['face', 'Face'], ['hair', 'Hair'], ['body', 'Body']];

export function creatorScreen(app, opts = {}) {
  const { data } = app;
  const st = { cls: opts.cls || 'vanguard', tab: 'class', name: randomName(Math.random, app.save.heroes.map(h => h.name)), look: null, spin: true };
  st.look = randomLook(data.classes, st.cls);
  let preview = null, disposed = false;

  app.ui.innerHTML = `<section class="wr-screen wr-creator">
    <header class="wr-bar"><button type="button" class="wr-icon-btn" data-back aria-label="Back">${icon('back')}</button><h2>New hero</h2><div class="wr-grow"></div>
      <button type="button" class="wr-icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button></header>
    <div class="wr-creator-body">
      <div class="wr-creator-stage">
        <canvas class="wr-preview" aria-label="Your hero"></canvas>
        <div class="wr-stage-tools">
          <button type="button" class="wr-btn wr-small" data-act="spin" aria-pressed="true">${icon('swap')}<span>Turn</span></button>
          <button type="button" class="wr-btn wr-small" data-act="random">${icon('dice')}<span>Random look</span></button>
        </div>
        <p class="wr-stage-cls"></p>
      </div>
      <div class="wr-creator-panel">
        <label class="wr-name-row"><span>Name</span><input type="text" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Hero name"><button type="button" class="wr-icon-btn" data-act="rname" aria-label="Random name">${icon('dice')}</button></label>
        <div class="wr-tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" class="wr-tab" data-tab="${id}">${label}</button>`).join('')}</div>
        <div class="wr-tab-body"></div>
        <div class="wr-creator-foot"><button type="button" class="wr-btn wr-big wr-primary" data-act="create">${icon('check')}<span><b>Set off</b><small class="wr-create-sub"></small></span></button></div>
      </div>
    </div>
  </section>`;
  const root = app.ui.firstElementChild;
  const nameIn = root.querySelector('input'), body = root.querySelector('.wr-tab-body'), canvas = root.querySelector('.wr-preview');
  nameIn.value = st.name;
  nameIn.addEventListener('input', () => { st.name = nameIn.value; sub(); });
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } });

  // ---------------------------------------------------------- the live 3D hero
  const gearOf = cls => starterGear(data.items, cls);
  const refresh = () => { try { preview?.setLook(st.look, st.cls, gearOf(st.cls)); } catch (e) { console.warn(e); } root.querySelector('.wr-stage-cls').textContent = `${CLASS_NAMES[st.cls]}`; };
  if (app.render?.createPreview) {
    app.render.createPreview(canvas, { data, quality: app.settings.quality }).then(p => {
      if (disposed) { p.dispose?.(); return; }
      preview = p; p.setAnim('idle'); refresh(); frame();
    }).catch(e => console.warn('[wyrmroad] preview', e?.message));
  }

  // ---------------------------------------------------------- rows
  const optRow = (key, label, list, cur, { note = '', disabled = false } = {}) => {
    const i = Math.max(0, list.findIndex(o => o[0] === cur));
    return `<div class="wr-row${disabled ? ' wr-row-off' : ''}" data-row="${key}">
      <span class="wr-row-label">${esc(label)}</span>
      <button type="button" class="wr-step" data-step="-1" aria-label="Previous ${esc(label)}" ${disabled ? 'disabled' : ''}>${icon('back')}</button>
      <button type="button" class="wr-row-value" data-list="${key}" ${disabled ? 'disabled' : ''}>${esc(disabled && note ? note : list[i][1])}</button>
      <button type="button" class="wr-step" data-step="1" aria-label="Next ${esc(label)}" ${disabled ? 'disabled' : ''}>${icon('next')}</button>
    </div>`;
  };
  const swatches = (key, label, list, cur) => `<div class="wr-row wr-row-swatch" data-row="${key}"><span class="wr-row-label">${esc(label)}</span>
    <div class="wr-swatches" role="radiogroup" aria-label="${esc(label)}">${list.map(([c, n]) => `<button type="button" class="wr-swatch${c === cur ? ' on' : ''}" role="radio" aria-checked="${c === cur}" aria-label="${esc(n)}" data-swatch="${key}" data-v="${c}" style="--sw:${c}"></button>`).join('')}</div></div>`;
  const toggle = (key, label, list, cur, { note = '', disabled = false } = {}) => `<div class="wr-row${disabled ? ' wr-row-off' : ''}" data-row="${key}"><span class="wr-row-label">${esc(label)}</span>
    <div class="wr-toggle">${list.map(([v, n]) => `<button type="button" class="${v === cur ? 'on' : ''}" data-toggle="${key}" data-v="${v}" aria-pressed="${v === cur}" ${disabled ? 'disabled' : ''}>${esc(n)}</button>`).join('')}</div>${disabled && note ? `<span class="wr-row-note">${esc(note)}</span>` : ''}</div>`;

  const FIELDS = {
    eyes: { list: LOOK.eyes, get: () => st.look.eyes.id, set: v => { st.look.eyes.id = v; }, label: 'Eyes' },
    brows: { list: LOOK.brows, get: () => st.look.brows.id, set: v => { st.look.brows.id = v; }, label: 'Brows' },
    extras: { list: LOOK.extras, get: () => st.look.extras.id, set: v => { st.look.extras.id = v; }, label: 'Face marks' },
    facialHair: { list: LOOK.facialHair, get: () => st.look.facialHair.id, set: v => { st.look.facialHair.id = v; }, label: 'Beard' },
    hair: { list: LOOK.hair, get: () => st.look.hair.id, set: v => { st.look.hair.id = v; }, label: 'Style' },
    skin: { list: LOOK.skin, get: () => st.look.skin.color, set: v => { st.look.skin.color = v; st.look.body.skin = v; }, label: 'Skin' },
    eyeColor: { list: LOOK.eyeColor, get: () => st.look.eyes.color, set: v => { st.look.eyes.color = v; }, label: 'Eye colour' },
    hairColor: { list: LOOK.hairColor, get: () => st.look.hair.color, set: v => { st.look.hair.color = v; }, label: 'Colour' },
    form: { list: LOOK.form, get: () => st.look.body.form, set: v => { st.look.body.form = v; if (v === 'masc') st.look.body.chestSize = 'flat'; }, label: 'Body form' },
    chest: { list: LOOK.chest, get: () => st.look.body.chestSize, set: v => { st.look.body.chestSize = v; }, label: 'Chest' },
  };

  function classTab() {
    const C = data.classes.classes[st.cls], s = heroStats(data.classes, data.items, { cls: st.cls, level: 1, gear: gearOf(st.cls) });
    const g = gearOf(st.cls);
    return `<div class="wr-class-pick" role="radiogroup" aria-label="Class">${CLASS_ORDER.map(c => `<button type="button" class="wr-class-btn${c === st.cls ? ' on' : ''}" role="radio" aria-checked="${c === st.cls}" data-cls="${c}">${icon(CLASS_ICON[c])}<span>${CLASS_NAMES[c]}</span></button>`).join('')}</div>
      <div class="wr-class-detail">
        <p class="wr-class-line">${esc(C.line)}</p>
        <div class="wr-class-nums">
          <div><span>${icon('heart')}Health</span><b>${n(s.hp)}</b></div>
          <div><span>${icon('mana')}Mana</span><b>${n(s.mp)}</b></div>
          <div><span>${icon('attack')}Power</span><b>${n(s.power)}</b></div>
          <div><span>${icon('block')}Defence</span><b>${n(s.def)}</b></div>
        </div>
        <p class="wr-class-gear">${icon('weapon')}<span>${esc(itemName(data.items, g.weapon))} · ${esc(holdLine(data.items, g.weapon))}${g.offhand ? ` + ${esc(itemName(data.items, g.offhand))}` : ''}</span></p>
        <h4>Spells</h4>
        <ul class="wr-spell-list">${C.spells.map(id => { const S = data.classes.spells[id]; return `<li>${icon(id)}<div><b>${esc(S.name)}</b><small>${S.level === 1 ? 'From the start' : `Learned at level ${n(S.level)}`} · ${esc(spellCost(S))}</small><p>${esc(spellText(S, s.power, s.spell))}</p></div></li>`; }).join('')}</ul>
      </div>`;
  }
  function draw() {
    root.querySelectorAll('.wr-tab').forEach(t => { const on = t.dataset.tab === st.tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    const fem = st.look.body.form === 'fem';
    if (st.tab === 'class') body.innerHTML = classTab();
    else if (st.tab === 'face') body.innerHTML = swatches('skin', 'Skin', LOOK.skin, st.look.skin.color) + optRow('eyes', 'Eyes', LOOK.eyes, st.look.eyes.id)
      + swatches('eyeColor', 'Eye colour', LOOK.eyeColor, st.look.eyes.color) + optRow('brows', 'Brows', LOOK.brows, st.look.brows.id)
      + optRow('extras', 'Face marks', LOOK.extras, st.look.extras.id) + optRow('facialHair', 'Beard', LOOK.facialHair, st.look.facialHair.id);
    else if (st.tab === 'hair') body.innerHTML = optRow('hair', 'Style', LOOK.hair, st.look.hair.id) + swatches('hairColor', 'Colour', LOOK.hairColor, st.look.hair.color);
    else body.innerHTML = toggle('form', 'Body form', LOOK.form, st.look.body.form) + toggle('chest', 'Chest', LOOK.chest, st.look.body.chestSize, { disabled: !fem, note: 'With the feminine form' });
    sub();
  }
  const sub = () => { root.querySelector('.wr-create-sub').textContent = `${(st.name || '').trim() || 'Name your hero'} · ${CLASS_NAMES[st.cls]}`; };
  /** Face and Hair: the hero faces you, still, framed on the head and shoulders. Class and Body: the whole body turning. */
  function frame() {
    const close = st.tab === 'face' || st.tab === 'hair';
    root.querySelector('.wr-creator-stage').classList.toggle('wr-stage-close', close);
    const b = root.querySelector('[data-act="spin"]');
    b.setAttribute('aria-pressed', st.spin); b.classList.toggle('on', st.spin);
    if (!preview) return;
    preview.spin(st.spin);
    if (!st.spin) preview.setYaw(close ? 0.18 : 0.35);
  }
  function setField(key, v) { FIELDS[key].set(v); draw(); refresh(); }

  root.addEventListener('click', async e => {
    const t = e.target;
    const tab = t.closest('[data-tab]'); if (tab) { const was = st.tab; st.tab = tab.dataset.tab; app.audio.play('ui.tab'); if (was !== st.tab) st.spin = !(st.tab === 'face' || st.tab === 'hair'); draw(); frame(); root.querySelector('.wr-creator-panel').scrollTop = 0; return; }
    const cls = t.closest('[data-cls]');
    if (cls) { st.cls = cls.dataset.cls; st.look.body.build = data.classes.classes[st.cls].look.body?.build; app.audio.play('ui.click'); draw(); refresh(); return; }
    const stp = t.closest('[data-step]');
    if (stp) { const key = stp.closest('[data-row]').dataset.row, F = FIELDS[key], i = F.list.findIndex(o => o[0] === F.get()); setField(key, F.list[(i + +stp.dataset.step + F.list.length) % F.list.length][0]); return; }
    const sw = t.closest('[data-swatch]'); if (sw) return setField(sw.dataset.swatch, sw.dataset.v);
    const tg = t.closest('[data-toggle]'); if (tg) return setField(tg.dataset.toggle, tg.dataset.v);
    const ls = t.closest('[data-list]'); if (ls) return pickList(ls.dataset.list);
    const b = t.closest('[data-act], [data-back]'); if (!b) return;
    if (b.hasAttribute('data-back')) return app.go(app.save.heroes.length ? 'heroes' : 'title');
    switch (b.dataset.act) {
      case 'menu': app.openMenu(); break;
      case 'spin': st.spin = !st.spin; frame(); break;
      case 'random': st.look = randomLook(data.classes, st.cls); app.audio.play('ui.click'); draw(); refresh(); break;
      case 'rname': st.name = nameIn.value = randomName(Math.random, [st.name]); sub(); break;
      case 'create': create(); break;
    }
  });
  function pickList(key) {
    const F = FIELDS[key];
    const sh = openSheet({ title: F.label, body: `<div class="wr-pick-grid">${F.list.map(([v, n]) => `<button type="button" class="wr-pick${v === F.get() ? ' on' : ''}" data-v="${esc(v)}">${esc(n)}</button>`).join('')}</div>` });
    sh.body.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; setField(key, b.dataset.v); sh.close(); });
    setTimeout(() => sh.body.querySelector('.on')?.focus({ preventScroll: true }), 40);
  }
  function create() {
    const name = (st.name || '').trim();
    if (!name) { nameIn.focus(); app.note('Give your hero a name first.'); return; }
    const h = newHero(data, { name, cls: st.cls, look: st.look });
    app.save.heroes.push(h); app.save.lastHero = h.id; app.saveNow();
    app.audio.play('equip');
    if (opts.onDone) return opts.onDone(h);
    app.party = soloParty(h);
    app.go('map', { heroId: h.id, fresh: true });
  }
  root.querySelector('.wr-creator-stage').hidden = false;
  draw(); refresh();
  app.view.setChapter('millbrook'); app.view.scenic(true);
  setTimeout(() => root.querySelector('.wr-tab.on')?.focus({ preventScroll: true }), 40);
  return () => { disposed = true; preview?.dispose?.(); };
}
