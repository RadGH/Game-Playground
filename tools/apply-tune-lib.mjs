// The pure half of tools/apply-tune.mjs (tested by tests/tune.test.js): apply a tuning panel's Save block to the text
// of a data/tuning.json, keeping the file's layout. Returns { rows, text, other }.
export function applyBlock(text, lines, { game, widen = false } = {}) {
  const rows = []; let src = text; const data = JSON.parse(text);
  for (const line of lines) {
    const head = line.match(/^Tuned in the panel:\s*(.+)$/);
    if (head) { if (head[1].trim() !== game) return { rows: [['other_game', head[1].trim()]], text, other: true }; continue; }
    const m = line.match(/^([A-Za-z_$][\w$]*)\s+(-?[\d.]+(?:e-?\d+)?)\s*(?:→|->)\s*(-?[\d.]+(?:e-?\d+)?)$/);
    if (!m) { rows.push(['bad_line', line]); continue; }
    const [, key, fromS, toS] = m; const from = +fromS, to = +toS;
    const e = data[key];
    if (!e || typeof e.value !== 'number') { rows.push(['unknown', key]); continue; }
    if (e.value === to) { rows.push(['same', key, to]); continue; }
    if (e.value !== from) { rows.push(['moved', key, from, e.value, to]); continue; }
    let { min = -Infinity, max = Infinity } = e;
    if (to < min || to > max) {
      if (!widen) { rows.push(['out_of_range', key, to, min, max]); continue; }
      const nmin = Math.min(min, to), nmax = Math.max(max, to);
      src = setField(src, key, 'min', nmin); src = setField(src, key, 'max', nmax);
      rows.push(['widened', key, `${min},${max}`, `${nmin},${nmax}`]); e.min = nmin; e.max = nmax;
    }
    src = setField(src, key, 'value', to); e.value = to;
    rows.push(['set', key, from, to]);
  }
  JSON.parse(src);   // never write a broken file
  return { rows, text: src };
}

// Replace one numeric field inside one top-level entry, keeping the file's layout.
function setField(src, key, field, v) {
  const at = src.search(new RegExp(`"${key.replace(/[$]/g, '\\$')}"\\s*:\\s*\\{`));
  if (at < 0) throw new Error(`entry ${key} not found`);
  const end = src.indexOf('}', at);
  const body = src.slice(at, end);
  const re = new RegExp(`("${field}"\\s*:\\s*)(-?[\\d.]+(?:e-?\\d+)?)`);
  if (!re.test(body)) throw new Error(`${key} has no "${field}" number`);
  return src.slice(0, at) + body.replace(re, `$1${v}`) + src.slice(end);
}

