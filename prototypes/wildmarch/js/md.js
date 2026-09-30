/**
 * md.js — a small, dependency-free Markdown renderer for the Wildmarch design bible.
 *
 * Covers the GitHub-flavoured subset the docs use: headings (with anchor ids), paragraphs,
 * **bold**, *italic*, ~~strike~~, `code`, links, images, fenced code blocks, blockquotes,
 * nested ordered/unordered lists (incl. [ ] task boxes), tables with alignment, and rules.
 * Raw HTML in the source is escaped, never executed.
 *
 *   import { renderMarkdown } from './md.js';
 *   const { html, headings } = renderMarkdown(text, { linkDoc: href => '#doc' });
 *
 * `headings` is [{ level, text, id }] for building a table of contents.
 * `linkDoc(href)` lets the caller rewrite relative links (e.g. `05-COMBAT.md#x`) into routes.
 */

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Heading text -> anchor id, GitHub style ("## 3. The Druid" -> "3-the-druid"). */
export function slugify(text) {
  return text.toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Inline formatting. Code spans are cut out first so nothing inside them is formatted. */
function inline(src, opts) {
  const codes = [];
  let s = src.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code) => {
    codes.push(`<code>${esc(code.trim() === '' ? code : code.replace(/^ (.*) $/, '$1'))}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  // images, then links: [text](href "title")
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, alt, href, title) => `<img src="${href}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, text, href, title) => {
    const external = /^[a-z]+:\/\//i.test(href);
    const target = external ? href : (opts.linkDoc ? opts.linkDoc(href) : href);
    return `<a href="${target}"${external ? ' target="_blank" rel="noopener"' : ''}${title ? ` title="${title}"` : ''}>${text}</a>`;
  });
  // bare urls
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}\n|\\\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

/** Split a table row into cells, respecting escaped pipes and code spans. */
function cells(row) {
  let r = row.trim();
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|') && !r.endsWith('\\|')) r = r.slice(0, -1);
  const out = []; let cur = ''; let tick = false;
  for (let i = 0; i < r.length; i++) {
    const c = r[i];
    if (c === '\\' && r[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') tick = !tick;
    if (c === '|' && !tick) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function renderMarkdown(text, opts = {}) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const headings = [];
  const used = new Map();
  const out = [];
  let i = 0;

  const uniqueId = base => {
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };

  const blank = l => /^\s*$/.test(l);
  const startsBlock = l => /^(#{1,6})\s/.test(l) || /^\s*(```|~~~)/.test(l) || /^\s*>/.test(l)
    || listRe.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) || /^\s*\|/.test(l);

  function renderList(start) {
    // Collect the items of one list at one indent, recursing for deeper indents.
    const first = lines[start].match(listRe);
    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const startNum = ordered ? parseInt(first[2], 10) : 1;
    const items = [];
    let j = start;
    while (j < lines.length) {
      const m = lines[j].match(listRe);
      if (m && m[1].length === indent) {
        items.push({ text: [m[3]], children: [] });
        j++;
        continue;
      }
      if (m && m[1].length > indent) {
        const sub = renderList(j);
        items[items.length - 1].children.push(sub.html);
        j = sub.end;
        continue;
      }
      if (!blank(lines[j]) && !m && /^\s+/.test(lines[j]) && items.length && !startsBlock(lines[j].trim())) {
        items[items.length - 1].text.push(lines[j].trim());
        j++;
        continue;
      }
      if (!blank(lines[j]) && !m && !startsBlock(lines[j]) && items.length && !/^\s/.test(lines[j]) && j > 0 && !blank(lines[j - 1])) {
        // lazy continuation line
        items[items.length - 1].text.push(lines[j].trim());
        j++;
        continue;
      }
      if (blank(lines[j])) {
        // a blank line ends the list unless the next line continues it
        const next = lines[j + 1];
        const nm = next && next.match(listRe);
        if (nm && nm[1].length >= indent) { j++; continue; }
      }
      break;
    }
    const tag = ordered ? 'ol' : 'ul';
    const attr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
    const body = items.map(it => {
      let t = it.text.join(' ');
      let cls = '';
      const box = t.match(/^\[([ xX])\]\s+(.*)$/);
      if (box) {
        cls = ' class="task"';
        t = `<input type="checkbox" disabled${box[1] !== ' ' ? ' checked' : ''}> ${inline(box[2], opts)}`;
      } else t = inline(t, opts);
      return `<li${cls}>${t}${it.children.join('')}</li>`;
    }).join('');
    return { html: `<${tag}${attr}>${body}</${tag}>`, end: j };
  }

  while (i < lines.length) {
    const line = lines[i];

    if (blank(line)) { i++; continue; }

    // fenced code
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      const lang = fence[2] ? ` class="lang-${fence[2]}"` : '';
      out.push(`<pre><code${lang}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const raw = h[2];
      const id = uniqueId(slugify(raw) || 'section');
      headings.push({ level, text: raw.replace(/[`*_]/g, ''), id });
      out.push(`<h${level} id="${id}"><a class="anchor" href="#" data-anchor="${id}" aria-label="Link to this section">#</a>${inline(raw, opts)}</h${level}>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // blockquote: strip one level of '>' and render the inside recursively
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      const inner = renderMarkdown(body.join('\n'), opts);
      out.push(`<blockquote>${inner.html}</blockquote>`);
      continue;
    }

    // table
    if (/\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const aligns = cells(lines[i + 1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '');
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && !blank(lines[i])) rows.push(cells(lines[i++]));
      const al = k => aligns[k] ? ` style="text-align:${aligns[k]}"` : '';
      const thead = `<thead><tr>${head.map((c, k) => `<th${al(k)}>${inline(c, opts)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${head.map((_, k) => `<td${al(k)}>${inline(r[k] ?? '', opts)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<div class="table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // list
    if (listRe.test(line)) {
      const l = renderList(i);
      out.push(l.html);
      i = l.end;
      continue;
    }

    // paragraph: gather until a blank line or the start of another block
    const para = [line];
    i++;
    while (i < lines.length && !blank(lines[i]) && !startsBlock(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join('\n'), opts)}</p>`);
  }

  return { html: out.join('\n'), headings };
}
