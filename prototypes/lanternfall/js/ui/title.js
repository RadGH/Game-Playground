// Title screen, save slots, modes list and credits (docs/02 §7, §8, §6). Saves are read through ctx.saves
// (list() -> [summary|null ×3], load(n), remove(n); optional exportSlot/importSlot/backup(n)/restore(n)).
// Modes read their unlocks from the PROFILE (ctx.profile.modes), never from a slot (02 §7, 00 §14).
import { el, btn, clock, hp, fmt, toast, confirmBox, cap } from './menukit.js';
import { loadSettings, saveSettings } from './settings.js';

export const VERSION = 'v0.1.0 · build 2026-09-26';
export const MODES = [
  { id: 'waves', name: 'Floodgate', desc: 'Hold a lit Lamp for 15 waves while the water rises. Build between waves.', rule: 'Beat the Act 1 boss in any save.' },
  { id: 'endless', name: 'The Long Descent', desc: 'An endless seeded descent with a floodline at your heels.', rule: 'Beat the Act 2 boss in any save.' },
  { id: 'daily', name: 'Daily Wick', desc: 'One seeded descent a day: fixed class and wick, one scored try.', rule: 'Beat the Act 2 boss in any save.' },
  { id: 'bossrush', name: 'Boss Rush', desc: 'Every boss you have beaten, back to back, with splits.', rule: 'Beat any three bosses.' },
  { id: 'trials', name: 'Trials', desc: 'Five short challenge rooms with medals and best times.', rule: 'Beat the Act 1 boss in any save.' },
];
const summaryLine = s => `Slot ${s.slot} · Act ${s.act || 1} · Lv ${s.level || 1} · ${clock(s.playTime || 0)}`;
async function slotsOf(ctx) { try { return (await Promise.resolve(ctx.saves?.list?.())) || [null, null, null]; } catch (e) { console.warn(e); return [null, null, null]; } }

export const titleScreen = {
  id: 'title', title: 'Lanternfall', noEscape: true,
  render(root, ctx, args, router) {
    const s = ctx.settings || loadSettings();
    const menu = el('nav', { class: 'lf-mainmenu', 'aria-label': 'Main menu' });
    const page = el('div', { class: 'lf-titlepage' },
      el('h1', { class: 'lf-logo', text: 'LANTERNFALL' }),
      el('p', { class: 'lf-tagline', text: '"Go down, Lamplighter. Light them again."' }), menu,
      el('div', { class: 'lf-foot' }, el('span', { text: VERSION }), el('span', { text: 'Press F1 for keys' })));
    root.append(page);
    if (s.access?.flash_reduction || s.video?.flash_reduction) root.closest('.lf-menus')?.classList.add('flash-safe');
    const p = ctx.profile || {};
    const fill = slots => {
      const used = slots.map((x, i) => x && { ...x, slot: x.slot || i + 1 }).filter(Boolean).sort((a, b) => String(b.lastPlayed || '').localeCompare(String(a.lastPlayed || '')));
      const items = [];
      if (used.length) items.push(btn(el('span', {}, 'Continue'), () => loadSlot(ctx, router, used[0].slot), { cls: 'primary', 'data-autofocus': '' }), );
      if (used.length) items[0].append(el('span', { class: 'note', text: summaryLine(used[0]) }));
      items.push(btn('New Game', () => router.open('slots', { mode: 'new' }), used.length ? {} : { 'data-autofocus': '' }));
      items.push(btn('Load', () => router.open('slots', { mode: 'load' }), { disabled: used.length ? null : 'No saves yet.' }));
      const anyMode = MODES.some(m => p.modes?.[m.id]);
      const modes = btn(el('span', {}, 'Modes'), () => router.open('modes'));
      if (!anyMode) modes.append(el('span', { class: 'note lf-lock', text: 'locked' }));
      items.push(modes);
      const guild = btn(el('span', {}, 'Guild Hall'), () => toast('The Guild Hall opens with its own milestone (09 §15).'), { tip: 'Spend Guild marks on unlocks that carry across saves.' });
      guild.append(el('span', { class: 'note', text: `◆ ${hp(p.marks || 0)} marks` })); items.push(guild);
      items.push(btn('Settings', () => router.open('settings')));
      items.push(btn('Credits', () => router.open('credits')));
      menu.replaceChildren(...items);
      requestAnimationFrame(() => (menu.querySelector('[data-autofocus]') || menu.querySelector('button'))?.focus());
    };
    slotsOf(ctx).then(fill);
    // first launch: the four settings a player may need before seeing anything (02 §7)
    if (!s.firstRunDone && !args.skipFirstRun) firstRun(root, ctx, s);
    if (!args.skipPhone && matchMedia?.('(pointer: coarse)').matches && innerWidth < 900 && !sessionStorageGet('lf-phone-ok')) phoneCard(root);
  },
};
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function phoneCard(root) {
  const card = el('div', { class: 'lf-modal' }, el('div', { class: 'lf-modal-card' }, el('h3', { class: 'lf-h', text: 'Desktop recommended' }),
    el('p', { text: 'Lanternfall is built for a keyboard and mouse, or a gamepad. You can look around on this device, but it will not play well.' }),
    el('div', { class: 'row end' }, btn('Continue anyway', () => { try { sessionStorage.setItem('lf-phone-ok', '1'); } catch {} card.remove(); }, { cls: 'primary' }))));
  card._cancel = () => card.remove(); root.append(card);
}
function firstRun(root, ctx, s) {
  const v = { menu_scale: s.text?.menu_scale ?? 1, flash_reduction: !!s.video?.flash_reduction, subtitles: s.text?.subtitles ?? true, screen_shake: s.video?.screen_shake ?? 0.7 };
  const sel = el('select', { 'aria-label': 'Text size' }, [0.9, 1, 1.25, 1.5, 2].map(x => el('option', { value: x, text: fmt(x * 100) + '%', selected: x === v.menu_scale })));
  const chk = (label, key) => el('label', { class: 'row' }, el('input', { type: 'checkbox', checked: v[key], onchange: e => { v[key] = e.target.checked; } }), label);
  const shake = el('input', { type: 'range', min: 0, max: 1, step: 0.1, value: v.screen_shake, 'aria-label': 'Screen shake', oninput: e => { v.screen_shake = +e.target.value; } });
  const card = el('div', { class: 'lf-modal' }, el('div', { class: 'lf-modal-card' }, el('h3', { class: 'lf-h', text: 'Before you start' }),
    el('label', { class: 'row between' }, 'Text size', sel), chk('Reduce flashing', 'flash_reduction'), chk('Subtitles', 'subtitles'),
    el('label', { class: 'row between' }, 'Screen shake', shake), el('p', { class: 'dim small', text: 'Everything else is in Settings.' }),
    el('div', { class: 'row end' }, btn('Done', () => done(), { cls: 'primary' }))));
  const done = () => {
    v.menu_scale = +sel.value;
    s.text = { ...s.text, menu_scale: v.menu_scale, subtitles: v.subtitles }; s.video = { ...s.video, flash_reduction: v.flash_reduction, screen_shake: v.screen_shake }; s.firstRunDone = true;
    saveSettings(s); ctx.settings = s; ctx.applySettings?.(s); document.querySelector('.lf-menus')?.style.setProperty('--m-scale', v.menu_scale); card.remove();
  };
  card._cancel = done; root.append(card);
}
async function loadSlot(ctx, router, n) {
  const ok = ctx.actions.loadSlot ? await ctx.actions.loadSlot(n) : await ctx.saves?.load?.(n);
  if (ok === false || ok == null && !ctx.actions.loadSlot) { toast('That save could not be loaded.', 'bad'); return; }
  router.closeAll();
}

/** Save slots (02 §8): mode 'new' picks a slot for a new game, 'load' loads one. */
export const slotsScreen = {
  id: 'slots', title: 'Choose a lamp',
  render(root, ctx, args, router) {
    const mode = args.mode || 'load';
    const grid = el('div', { class: 'lf-slots' });
    const frame = el('div', { class: 'lf-frame medium' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: mode === 'new' ? 'Choose a lamp' : 'Load' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body col' }, ctx.saves?.available === false ? el('div', { class: 'lf-banner-bad', text: 'This browser will not keep saves. Export before you close the tab.' }) : null, grid,
        el('p', { class: 'dim small', text: 'Each slot keeps one backup of its previous save.' }),
        el('div', { class: 'row' }, ctx.saves?.importSlot ? btn('Import slot from file', async () => { const r = await ctx.saves.importSlot(); if (r?.error) toast(r.error, 'bad'); else router.refresh(); }) : null,
          el('span', { class: 'grow' }), btn('Back', () => router.back()))));
    root.append(frame);
    slotsOf(ctx).then(slots => {
      for (let i = 0; i < 3; i++) {
        const s = slots[i], n = i + 1;
        if (!s) {
          grid.append(el('button', { type: 'button', class: 'lf-slot empty', onclick: () => mode === 'new' ? router.open('classselect', { slot: n }) : toast('That slot is empty.'), 'aria-label': `Slot ${n}, empty` },
            el('div', { class: 'slot-head' }, el('span', { text: `SLOT ${n}` })), el('div', { text: 'empty' }), mode === 'new' ? el('div', { class: 'gold', text: '+ New' }) : null));
          continue;
        }
        const card = el('div', { class: 'lf-slot', tabindex: 0, role: 'button', 'aria-label': `Slot ${n}: ${s.name}, level ${s.level}` },
          el('div', { class: 'slot-head' }, el('span', { text: `SLOT ${n}` }), s.ironWick ? el('span', { text: '⚑ Iron Wick' }) : null),
          el('div', {}, el('b', { text: `${cap(s.className || s.classId || '')} · "${s.name}"` })),
          el('div', { text: `Act ${s.act || 1}${s.actName ? ' — ' + s.actName : ''}` }),
          el('div', { text: `Level ${s.level || 1} · ${cap(s.difficulty || 'lamplighter')}` }),
          el('div', {}, 'Lamps lit ', el('span', { class: 'pips', text: '●'.repeat(s.lampsLit || 0) + '○'.repeat(6 - (s.lampsLit || 0)) })),
          el('div', { text: `${clock(s.playTime || 0)} · ${hp(s.deaths || 0)} deaths` }),
          el('div', { class: 'dim small', text: `Last played ${s.lastPlayed || '—'}${s.sizeBytes ? ` · ${fmt(s.sizeBytes / 1024, { decimals: 0 })} KB` : ''}` }),
          el('div', { class: 'row' }, ...slotActions(ctx, router, s, n, mode)));
        card.addEventListener('click', e => { if (e.target.closest('button')) return; activate(); });
        const activate = async () => {
          if (mode === 'new') { if (await confirmBox(root, { title: 'Overwrite this slot?', text: `"${s.name}" will be replaced by a new game.`, yes: 'Overwrite', hold: true })) router.open('classselect', { slot: n }); }
          else loadSlot(ctx, router, n);
        };
        grid.append(card);
      }
    });
  },
};
function slotActions(ctx, router, s, n, mode) {
  const out = [btn(mode === 'new' ? 'Use' : 'Load', async () => { if (mode === 'new') router.open('classselect', { slot: n }); else loadSlot(ctx, router, n); }, { cls: 'small primary' })];
  if (ctx.saves?.exportSlot) out.push(btn('Export', () => ctx.saves.exportSlot(n), { cls: 'small' }));
  if (ctx.saves?.restore) out.push(btn('Restore…', async () => {
    const b = await ctx.saves.backup?.(n); if (!b) { toast('No backup for this slot yet.'); return; }
    if (await confirmBox(document.querySelector('.scr-slots'), { title: 'Restore the backup?', text: `Backup from ${b.lastPlayed || '?'} · Act ${b.act || '?'} · ${b.node || ''}`, yes: 'Restore' })) { await ctx.saves.restore(n); router.refresh(); }
  }, { cls: 'small' }));
  out.push(btn('Delete', async () => {
    const host = document.querySelector('.scr-slots');
    if (await confirmBox(host, { title: 'Delete this save?', text: `Type the character's name to confirm. The profile (classes, marks, settings) is kept.`, yes: 'Delete', input: { label: s.name, match: s.name } })) { await ctx.saves.remove(n); toast(`Slot ${n} deleted.`); router.refresh(); }
  }, { cls: 'small danger' }));
  return out;
}

export const modesScreen = {
  id: 'modes', title: 'Modes',
  render(root, ctx, args, router) {
    const p = ctx.profile || {};
    root.append(el('div', { class: 'lf-frame small' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: 'Modes' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body lf-menulist' }, MODES.map(m => {
        const open = !!p.modes?.[m.id];
        const b = btn(el('span', { class: open ? '' : 'lf-lock' }, m.name), () => ctx.actions.startMode?.(m.id), { disabled: open ? null : m.rule, tip: open ? m.desc : null });
        b.append(el('span', { class: 'note', text: open ? (p.best?.[m.id] ? `best ${hp(p.best[m.id])}` : '') : m.rule })); return b;
      }), el('p', { class: 'dim small', text: 'Unlocks belong to your profile and carry across every save.' }))));
  },
};
export const creditsScreen = {
  id: 'credits', title: 'Credits',
  render(root, ctx, args, router) {
    const lines = [['Design & direction', 'Radley Sustaire'], ['Built with', 'the Game Playground: Lingo (words), Voice Lab (voices), Name Forge (names), the damage meter, Sound Lab'],
      ['Fonts', 'Cinzel and Spectral (SIL Open Font License), via Google Fonts'], ['Sounds', 'Kenney sound packs (CC0) through the Sound Lab library method, plus our own synthesized effects'],
      ['Engine', 'Plain JavaScript and WebGL2, no build step'], ['Thanks', 'to everyone who plays in the dark and lights a lamp anyway']];
    root.append(el('div', { class: 'lf-frame small' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: 'Credits' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body lf-credits' }, lines.map(([a, b]) => el('p', {}, el('b', { class: 'gold', text: a }), el('br'), b)), btn('Back', () => router.back(), { 'data-autofocus': '' }))));
  },
};
export const screens = [titleScreen, slotsScreen, modesScreen, creditsScreen];
