import { icons, classes, categories, filterIcons, iconSvg } from './catalog.js';
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const option = (value, label) => { const o = el('option', '', label); o.value = value; return o; };
const tags = list => { const row = el('span','tags'); row.append(...list.map(t => el('span','tag',t))); return row; };
for (const c of classes) $('class').append(option(c.id, c.name));
for (const c of categories) $('category').append(option(c,c));
for (const n of [...new Set(icons.map(i => i.batch))].filter(Boolean).sort((a, b) => a - b)) $('batch').append(option(n, n === 7 ? 'Batch 7 · Star Blade' : `Batch ${n} · five classes`));   // play-test 11: batch 7 is one class
$('total').textContent = `${icons.length} icons · ${classes.length} classes`;
const params = new URLSearchParams(location.search);
for (const [id,key] of [['search','q'],['class','class'],['category','category'],['batch','batch']]) if (params.has(key)) $(id).value = params.get(key);
let selected = null;
function render() {
  const found = filterIcons({q:$('search').value,classId:$('class').value,category:$('category').value,batch:$('batch').value});
  const size = Number($('size').value);
  $('count').textContent = `${found.length} of ${icons.length} icons`;
  $('empty').hidden = found.length > 0;
  const cards = found.map(i => {
    const b = el('button','icon-card'); b.type = 'button'; b.dataset.icon = i.id; b.setAttribute('aria-label', `${i.name} — ${i.className}`);
    const head = el('span','card-head'), picture = el('span'); picture.innerHTML = iconSvg(i.id,size);
    const title = el('span','card-name',i.name); title.append(el('span','card-class',i.className));
    head.append(picture,title); b.append(head,el('span','card-description',i.description),tags(i.categories));
    b.addEventListener('click',() => show(i)); return b;
  });
  $('grid').replaceChildren(...cards);
  const p = new URLSearchParams();
  for (const [id,key] of [['search','q'],['class','class'],['category','category'],['batch','batch']]) if ($(id).value) p.set(key,$(id).value);
  history.replaceState(null,'',location.pathname+(p.size ? `?${p}` : '')+location.hash);
}
function show(i) {
  selected = i; $('detail-name').textContent = i.name; $('description').textContent = i.description;
  $('detail-class').textContent = `${i.className} · ${i.batch ? `Batch ${i.batch}` : 'Starcaller reference'}`;
  $('detail-categories').replaceChildren(tags(i.categories)); $('icon-id').textContent = i.id; $('copy-status').textContent = '';
  $('preview').replaceChildren(...[26,40,96].map(size => { const p=el('div','preview-size'); p.innerHTML=iconSvg(i.id,size); p.append(el('span','',`${size} px`)); return p; }));
  $('detail').showModal();
}
$('filters').addEventListener('submit',e=>e.preventDefault());
$('filters').addEventListener('input',render);
$('filters').addEventListener('reset',() => { requestAnimationFrame(render); });
$('size').addEventListener('change',render);
$('close').addEventListener('click',()=>$('detail').close());
$('copy-id').addEventListener('click',async () => {
  if (!selected) return;
  try { await navigator.clipboard.writeText(selected.id); $('copy-status').textContent='ID copied.'; }
  catch { $('copy-status').textContent='Select and copy the ID above; clipboard access is unavailable here.'; const r=document.createRange(); r.selectNodeContents($('icon-id')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }
});
$('download').addEventListener('click',() => {
  if (!selected) return;
  const url=URL.createObjectURL(new Blob([iconSvg(selected.id,128,{accessible:true})],{type:'image/svg+xml'}));
  const a=el('a'); a.href=url; a.download=`${selected.id}.svg`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();
