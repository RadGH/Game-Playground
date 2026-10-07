// The window buttons down the right edge (party menu, map, journal, bag, skills, perks, account, help): one icon
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
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  journal: '<path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2Z"/><path d="M5 20V4"/><path d="M9 7h6M9 11h6"/>',
  skills: '<path d="M12 2 15 9l7 1-5 5 1.5 7L12 18.5 5.5 22 7 15 2 10l7-1Z"/>',
  perks: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><circle cx="12" cy="12.5" r="2.2"/><path d="M12 7.2v3.1M10.4 14l-3.8 2.6M13.6 14l3.8 2.6"/>',
  sheet: '<circle cx="12" cy="6" r="3"/><path d="M12 9v7M8 12h8M12 16l-3 5M12 16l3 5"/>',
  feedback: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
};
// Friends, guild, mail and the Group Finder live as TABS of the Party menu (play-test P18, ui/party-hub.js).
export const MENU = [
  { id: 'party', btn: 'party-btn', key: 'P', label: 'Party — friends, guild, mail, group finder' },
  { id: 'map', key: 'M', label: 'Map' },
  { id: 'journal', key: 'J', label: 'Journal — your quests' },
  { id: 'bag', btn: 'bag-btn', key: 'B', label: 'Bag and gear' },
  { id: 'sheet', key: 'V', label: 'Character — stats and damage' },
  { id: 'skills', key: 'K', label: 'Skills and talents' },
  { id: 'perks', key: 'N', label: 'Perk forest' },
  { id: 'account', key: '', label: 'Account' },
  { id: 'feedback', key: '', label: 'Feedback — a suggestion or a bug report' },
  { id: 'help', key: 'F1', label: 'Controls' },
];

export function createMenubar(parent = document.getElementById('hud')) {
  const nav = document.createElement('nav');
  nav.className = 'menubar'; nav.id = 'menubar'; nav.setAttribute('aria-label', 'Windows');
  for (const m of MENU) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mb-btn'; b.id = m.btn || 'menu-' + m.id;
    b.dataset.panel = m.id;
    b.dataset.tip = m.label + (m.key ? ` (${m.key})` : '');
    b.setAttribute('aria-label', m.label);
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[m.id]}</svg>${m.key ? `<kbd>${m.key}</kbd>` : ''}<b></b>`;
    nav.appendChild(b);
  }
  parent.appendChild(nav);
  // the bag/party modules look these up by their old ids; give them a menu-<id> alias for the 'on' state too
  return { nav, btn: id => nav.querySelector(`[data-panel="${id}"]`) };
}
