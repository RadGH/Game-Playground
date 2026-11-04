// The Avatar 3D page menu (2026-11-03): every Avatar 3D page grouped by character VERSION (its builder and its own
// tools) and by the viewers every version shares. One table, so a new page is one row here. `here` marks the open page.
// renderAvatarNav(container, { here }) draws <nav> with one drop-down per group: each is a native <details>, so it opens
// with Enter/Space, and the script adds: one open at a time, Escape closes and returns focus, a click outside closes.
export const AVATAR_NAV = [
  { id: 'v26', label: 'Chibi 2.6', badge: 'new', note: 'Realistic-cartoon proportions. Opt-in for games.', pages: [
    { id: 'builder-26', href: './?v=2.6', label: 'Builder', note: 'This page, building 2.6' },
    { id: 'compare-26', href: './?v=2.6&compare=1', label: 'Side by side with 2.5', note: 'Same look, both versions' },
    { id: 'fit', href: 'fit.html', label: 'Real-world fit', note: 'Car seat, doorway, chair at real scale + clipping check' },
    { id: 'portrait', href: 'portrait.html', label: 'Portrait preview', note: 'Baked 2.6 face pictures' },
  ] },
  { id: 'v25', label: 'Chibi 2.5', badge: 'in games', note: 'What Thousandvale, Tumblefair and the others build today.', pages: [
    { id: 'builder-25', href: './?v=2.5', label: 'Builder', note: 'This page, building 2.5' },
    { id: 'chibi25', href: 'chibi25.html', label: '2.5 vs Chibi 2 builder', note: 'The 2.5 face and body work, side by side with v2' },
    { id: 'chibi25-sheet', href: 'chibi25-sheet.html', label: 'Face sheet', note: 'Every eye, brow, mouth and hair' },
    { id: 'body-robe', href: 'chibi25-body-sheet.html?mode=robe&garment=robe&clip=run&frames=8&size=110', label: 'Robe run sheet', note: 'Side-on run, Chibi 2 vs 2.5' },
    { id: 'body-outfits', href: 'chibi25-body-sheet.html?mode=outfits&set=classes&size=110&cols=1', label: 'Class outfit sheet', note: 'Idle / walk / run / attack per class' },
    { id: 'body-tv', href: 'chibi25-body-sheet.html?mode=outfits&set=tv&size=110&cols=1', label: 'Thousandvale outfit sheet' },
    { id: 'body-bodies', href: 'chibi25-body-sheet.html?mode=bodies&size=100', label: 'Body options sheet' },
  ] },
  { id: 'v2', label: 'Chibi 2', note: 'The shared base: rig, gear, clips.', pages: [
    { id: 'chibi2', href: 'chibi2.html', label: 'Comparison and benchmark', note: 'Rig, clips, crowd and spell-effect fps' },
    { id: 'armour2', href: 'armour2.html', label: 'Tier-2 armour' },
    { id: 'v2-archive', href: 'chibi2-v2.html', label: 'Chibi 2 v2 builder', note: 'Archived: the model before 2.5' },
  ] },
  { id: 'viewers', label: 'Viewers', note: 'Shared by every version.', pages: [
    { id: 'armory', href: '../armory/', label: 'Armory', note: 'Every weapon and wearable, 2.5 / 2.6 switch' },
    { id: 'creatures', href: 'creatures.html', label: 'Creatures' },
    { id: 'mounts', href: 'mounts.html', label: 'Mounts' },
    { id: 'vehicles', href: 'vehicles.html', label: 'Vehicles' },
    { id: 'spellfx', href: 'spellfx.html', label: 'Spell effects' },
  ] },
  { id: 'older', label: 'Archive', note: 'Kept to compare; nothing new is built on these.', pages: [
    { id: 'chibi1', href: 'chibi1.html', label: 'Chibi 1', note: 'Archived' },
    { id: 'chibi3', href: 'chibi3.html', label: 'Chibi 3', note: 'On hold' },
    { id: 'chibi4', href: 'chibi4/', label: 'Chibi 4', note: 'On hold' },
    { id: 'kestrel', href: 'kestrel/', label: 'Kestrel', note: 'Trial' },
  ] },
];

export function renderAvatarNav(container, { here } = {}) {
  const nav = document.createElement('nav');
  nav.className = 'a3-nav'; nav.setAttribute('aria-label', 'Avatar 3D pages');
  for (const group of AVATAR_NAV) {
    const d = document.createElement('details'); d.className = 'a3-nav-group'; d.dataset.group = group.id;
    const current = group.pages.some(p => p.id === here);
    if (current) d.classList.add('current');
    const s = document.createElement('summary');
    s.innerHTML = `<span>${group.label}</span>${group.badge ? `<span class="a3-badge">${group.badge}</span>` : ''}`;
    const menu = document.createElement('div'); menu.className = 'a3-nav-menu';
    if (group.note) { const n = document.createElement('p'); n.className = 'a3-nav-note'; n.textContent = group.note; menu.append(n); }
    const list = document.createElement('ul');
    for (const p of group.pages) {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = p.href; a.innerHTML = `<b>${p.label}</b>${p.note ? `<small>${p.note}</small>` : ''}`;
      if (p.id === here) a.setAttribute('aria-current', 'page');
      li.append(a); list.append(li);
    }
    menu.append(list); d.append(s, menu); nav.append(d);
    d.addEventListener('toggle', () => { if (d.open) for (const o of nav.querySelectorAll('details[open]')) if (o !== d) o.open = false; });
  }
  nav.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = nav.querySelector('details[open]'); if (o) { o.open = false; o.querySelector('summary').focus(); } } });
  document.addEventListener('click', e => { if (!nav.contains(e.target)) for (const o of nav.querySelectorAll('details[open]')) o.open = false; });
  container.append(nav);
  return nav;
}
