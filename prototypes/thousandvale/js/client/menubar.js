// The window buttons down the right edge (party, friends, guild, mail, Callboard, bag, account, help): one icon
// each with its key letter and a small count badge (`<b>`), e.g. unread mail or friends online. Built before the
// panels so they can find their button by id (menu-<panel id>; the party and bag buttons keep their M1 ids).

const I = {
  party: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  friends: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  guild: '<path d="M4 22V4a1 1 0 0 1 1-1h13l-3 5 3 5H5"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  callboard: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8 10h8M8 14h8M8 18h5"/>',
  bag: '<path d="M5 8h14l-1 13H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
};
export const MENU = [
  { id: 'party', btn: 'party-btn', key: 'P', label: 'Party' },
  { id: 'friends', key: 'O', label: 'Friends' },
  { id: 'guild', key: 'G', label: 'Guild' },
  { id: 'mail', key: 'M', label: 'Mail' },
  { id: 'callboard', key: 'J', label: 'Callboard — find a group' },
  { id: 'bag', btn: 'bag-btn', key: 'B', label: 'Bag and gear' },
  { id: 'account', key: '', label: 'Account' },
  { id: 'help', key: 'F1', label: 'Controls' },
];

export function createMenubar(parent = document.getElementById('hud')) {
  const nav = document.createElement('nav');
  nav.className = 'menubar'; nav.id = 'menubar'; nav.setAttribute('aria-label', 'Windows');
  for (const m of MENU) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mb-btn'; b.id = m.btn || 'menu-' + m.id;
    b.dataset.panel = m.id;
    b.title = m.label + (m.key ? ` (${m.key})` : '');
    b.setAttribute('aria-label', m.label);
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[m.id]}</svg>${m.key ? `<kbd>${m.key}</kbd>` : ''}<b></b>`;
    nav.appendChild(b);
  }
  parent.appendChild(nav);
  // the bag/party modules look these up by their old ids; give them a menu-<id> alias for the 'on' state too
  return { nav, btn: id => nav.querySelector(`[data-panel="${id}"]`) };
}
