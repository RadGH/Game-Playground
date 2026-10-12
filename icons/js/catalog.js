import batch01 from '../data/batch-01.js';
import batch02 from '../data/batch-02.js';
import batch03 from '../data/batch-03.js';
import batch04 from '../data/batch-04.js';
import batch05 from '../data/batch-05.js';
import batch06 from '../data/batch-06.js';
import { starcaller } from '../data/starcaller.js';

export const icons = Object.freeze([...batch01, ...batch02, ...batch03, ...batch04, ...batch05, ...batch06, ...starcaller]);
const byId = new Map(icons.map(icon => [icon.id, icon]));
if (byId.size !== icons.length) throw new Error('Duplicate icon IDs');
export const iconInfo = id => byId.get(id) || null;
export const iconIds = () => [...byId.keys()];
export const categories = Object.freeze([...new Set(icons.flatMap(i => i.categories))].sort());
export const classes = Object.freeze([...new Map(icons.map(i => [i.classId, { id: i.classId, name: i.className }])).values()].sort((a,b) => a.name.localeCompare(b.name)));
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/** Null for unknown IDs, so consumers can keep a text fallback. No DOM or network needed. */
export function iconSvg(id, size = 32, { accessible = false } = {}) {
  const icon = iconInfo(id);
  if (!icon) return null;
  const px = Number.isFinite(Number(size)) ? Math.max(1, Math.min(1024, Number(size))) : 32;
  const aria = accessible ? `role="img" aria-label="${escape(icon.name)}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="sk-ico" viewBox="0 0 32 32" width="${px}" height="${px}" ${aria}>${accessible ? `<title>${escape(icon.name)}</title><desc>${escape(icon.description)}</desc>` : ''}${icon.body}</svg>`;
}

/** All filters combine, and every search word must occur in the metadata. */
export function filterIcons({ q = '', classId = '', category = '', batch = '' } = {}) {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return icons.filter(i => (!classId || i.classId === classId)
    && (!category || i.categories.includes(category))
    && (batch === '' || i.batch === Number(batch))
    && words.every(w => `${i.id} ${i.name} ${i.description} ${i.className} ${i.categories.join(' ')}`.toLowerCase().includes(w)));
}
