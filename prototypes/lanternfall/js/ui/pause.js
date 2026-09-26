// Pause menu (docs/02 §20), the Status panel (what every icon on you means right now) and the Controls help
// overlay (F1: the live binding table from data/bindings.json with the player's rebinds applied).
import { el, btn, toast, confirmBox, clock, hp, secs, cap, statusText, fmt } from './menukit.js';
import { effectiveBindings, keyName, actionName, loadSettings } from './settings.js';

const heroOf = ctx => (typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero) || ctx.game?.hero;
const val = (v, ...a) => (typeof v === 'function' ? v(...a) : v);

export const pauseScreen = {
  id: 'pause', title: 'Paused',
  render(root, ctx, args, router) {
    const H = heroOf(ctx) || {}, g = ctx.game || {}, p = ctx.profile || {};
    const where = val(ctx.where, ctx) || {};
    const rek = ctx.canRekindle ? ctx.canRekindle() : 'Not available here.';
    const rekWhy = rek === true || rek == null ? null : (typeof rek === 'string' ? rek : 'Not while you are fighting.');
    const item = (label, note, fn, opts = {}) => { const b = btn(el('span', {}, label), fn, opts); if (note) b.append(el('span', { class: 'note', text: note })); return b; };
    const atLamp = !!val(ctx.atLampPost);
    root.append(el('div', { class: 'lf-frame lf-pause' },
      el('h2', { class: 'lf-title', text: 'PAUSED' }),
      el('div', { class: 'where' }, `${where.act ? `Act ${where.act}${where.actName ? ' — ' + where.actName : ''}` : ''}${where.node ? ` · Node: ${where.node}${where.rooms ? ` (${where.rooms})` : ''}` : ''}`),
      el('div', { class: 'where' }, `Seed ${g.seed ?? '—'} · ${cap(g.difficultyId || ctx.difficulty || 'lamplighter')} difficulty · ${clock(H.counters?.playTime ?? g.time ?? 0)}`),
      el('nav', { class: 'lf-menulist', 'aria-label': 'Pause menu' },
        item('Resume', null, () => { router.closeAll(); ctx.actions.resume?.(); }, { 'data-autofocus': '' }),
        item('Satchel', 'Inventory · Wicks · Skills · …', () => router.open('inventory')),
        el('div', { class: 'row' }, btn('Character', () => router.open('attributes'), { cls: 'small', key: 'P' }), btn('Skills', () => router.open('skills'), { cls: 'small', key: 'K' }),
          btn('Wick builder', () => router.open('wickbuilder'), { cls: 'small', key: 'B' }), btn('Ledger', () => router.open('ledger'), { cls: 'small', key: 'L' }), btn('Journal', () => router.open('journal'), { cls: 'small', key: 'J' })),
        item('Map', null, () => { router.closeAll(); ctx.actions.openMap?.(); }),
        item('Status panel', 'what every icon on you means right now', () => router.open('status')),
        item('Rekindle this room', rekWhy || 'streams the room back; killed enemies stay dead', async () => {
          if (await confirmBox(root, { title: 'Rekindle?', text: 'The room goes back to how it was built. Levers, doors and your builds keep their state. Killed enemies stay dead.', yes: 'Rekindle' })) { router.closeAll(); ctx.actions.rekindle?.(); }
        }, { disabled: rekWhy }),
        item('Controls', 'F1', () => router.open('controls')),
        item('Settings', null, () => router.open('settings')),
        item('Return to last lamp-post', 'costs what dying costs', async () => {
          if (await confirmBox(root, { title: 'Return to the lamp-post?', text: 'This works like dying, without adding a death: you drop part of your pennies in a purse here.', yes: 'Return' })) { router.closeAll(); ctx.actions.returnToLampPost?.(); }
        }),
        item(g.ironWick ? 'Suspend and quit to title' : 'Save and quit to title', null, async () => {
          const since = val(ctx.sinceLampPost);
          const text = g.ironWick ? 'Iron Wick: the game is suspended here. The suspend save is deleted when you load it.'
            : atLamp ? 'Your progress is saved at this lamp-post.' : `Progress since your last lamp-post${since ? ` (${clock(since)} ago)` : ''} will be kept only up to that lamp-post.`;
          if (await confirmBox(root, { title: 'Quit to title?', text, yes: 'Quit' })) { router.closeAll(); ctx.actions.quitToTitle?.(); }
        })),
      el('div', { class: 'row between small' }, el('span', { class: 'gold', text: `◆ Guild marks: ${hp(p.marks || 0)}` }), el('span', { class: 'dim', text: p.trackedName ? `Tracked: ${p.trackedName}` : '' }))));
  },
};

export const statusScreen = {
  id: 'status', title: 'Status',
  render(root, ctx, args, router) {
    const P = ctx.game?.player || {}, H = heroOf(ctx) || {}, D = ctx.data;
    const sts = Object.entries(P.statuses || {});
    const dark = val(ctx.inDark);
    root.append(el('div', { class: 'lf-frame small' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: 'Status' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body col' },
        sts.length ? el('table', { class: 'lf-table' }, el('thead', {}, el('tr', {}, ['', 'Status', 'From', 'Left', 'What it does'].map(h => el('th', { text: h })))),
          el('tbody', {}, sts.map(([id, s]) => { const def = D.statuses?.byId?.[id] || { name: cap(id) }; return el('tr', {}, el('td', {}, el('span', { style: { color: def.color || '#ccc' }, text: '●' })), el('td', { text: def.name + (s.stacks > 1 ? ` ×${s.stacks}` : '') }), el('td', { text: s.sourceName || s.source?.name || '—' }), el('td', { class: 'n', text: s.t != null ? secs(s.t) : '—' }), el('td', { class: 'small', text: statusText(def) })); })))
          : el('p', { class: 'dim', text: 'Nothing is affecting you right now.' }),
        el('p', {}, `Guild flask: ${H.flask ? `${H.flask.charges} / ${H.flask.max} charges` : '—'} (refilled at lamp-posts)`),
        el('p', { class: dark ? 'bad' : 'dim', text: dark ? 'It is dark here: your oil is not coming back.' : 'There is light here: your oil comes back on its own.' }),
        btn('Back', () => router.back(), { 'data-autofocus': '' }))));
  },
};

export const controlsScreen = {
  id: 'controls', title: 'Controls',
  render(root, ctx, args, router) {
    const B = ctx.data?.bindings; const s = ctx.settings || loadSettings();
    const eff = B ? effectiveBindings(B, s) : null;
    const table = (ctxName, title) => { const k = eff?.keys?.[ctxName]; if (!k) return null; return [el('h3', { class: 'lf-h', text: title }), el('table', { class: 'lf-table' }, el('tbody', {}, Object.entries(k).map(([a, codes]) => el('tr', {}, el('td', { text: actionName(a) }), el('td', { text: codes.map(keyName).join(' / ') })))))]; };
    root.append(el('div', { class: 'lf-frame medium' },
      el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: 'Controls' }), el('button', { class: 'lf-close', type: 'button', 'aria-label': 'Back', text: '✕', onclick: () => router.back() })),
      el('div', { class: 'lf-frame-body col' }, eff ? [table('play', 'Playing'), table('build', 'Build mode'), table('menu', 'Menus')] : el('p', { text: 'Bindings load with the game data.' }),
        el('p', { class: 'dim small', text: 'Change keys in Settings → Controls. Esc and F1 never move.' }), btn('Back', () => router.back(), { 'data-autofocus': '' }))));
  },
};
export const screens = [pauseScreen, statusScreen, controlsScreen];
