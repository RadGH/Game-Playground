// UI gallery — the frame page's boot (a classic script, so it can put the import map in before any module loads).
//
// 1. Reads the scene from the address:  ui-gallery-frame.html?scene=perks&device=phone-l&layout=proposed&variant=a
// 2. Gives the page its own in-memory localStorage (the gallery must never touch the real game's saved settings on this
//    origin, and every scene must start from the same state), and a clock that starts at the moment the fixtures were
//    recorded (so "starts in 2 minutes" still reads that way a month later).
// 3. Fetches index.html and takes its <link rel="stylesheet"> list, its import map and its <body> markup AS THEY ARE.
// 4. Starts js/client/gallery/stage.js (the same create*() calls main.js makes, on a fake socket).
(function () {
  'use strict';
  var P = new URLSearchParams(location.search.slice(1) || location.hash.slice(1));
  var top = window.parent === window;
  var narrow = Math.min(window.innerWidth, window.innerHeight) < 500;
  var device = P.get('device') || (top && narrow ? 'auto' : 'desktop');
  if (device === 'auto') device = window.innerWidth > window.innerHeight ? 'phone-l' : 'phone-p';
  var phone = device.indexOf('phone') === 0;
  var layout = P.get('layout') || (phone || device === 'pad' ? 'proposed' : 'current');
  var G = window.__gallery = { scene: P.get('scene') || 'hud', device: device, layout: layout, variant: P.get('variant') || 'a', glyphs: P.get('glyphs') || '', top: top, real: top && narrow && (!P.get('device') || P.get('device') === 'auto'), params: P, errors: [] };
  window.addEventListener('error', function (e) { G.errors.push(String(e.message || e.error)); });
  window.addEventListener('unhandledrejection', function (e) { G.errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)); });

  var html = document.documentElement;
  html.dataset.device = device;
  html.dataset.galleryLayout = layout;
  if (G.real) html.dataset.galleryReal = '1';
  // THE phone switch: only the gallery sets it (js/client/input/layout.js keeps the game from doing so until approved).
  if (phone && layout === 'proposed') { html.dataset.layout = 'phone'; html.dataset.variant = G.variant; }
  // 2026-10-16: the Controller frame's proposed layout is the game's controller layout (css/layout-pad.css)
  if (device === 'pad' && layout === 'proposed') html.dataset.layout = 'pad';
  // Safe areas: a real phone reports them through env(); inside a desktop frame we draw an iPhone 15 Pro's.
  if (phone && !G.real) {
    var sa = device === 'phone-l' ? { top: 0, right: 59, bottom: 21, left: 59 } : { top: 59, right: 0, bottom: 34, left: 0 };
    for (var k in sa) html.style.setProperty('--safe-' + k, sa[k] + 'px');
    html.dataset.safeEmulated = '1';
  }

  // ---- storage: in memory, per scene
  try {
    var mem = {};
    var store = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; }, clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] || null; }, get length() { return Object.keys(mem).length; }
    };
    if (P.get('store') !== 'real') Object.defineProperty(window, 'localStorage', { configurable: true, value: store });
  } catch (e) { /* a browser that will not let go of localStorage: the game's own try/catch covers it */ }

  function setClock(recordedAt) {
    if (!recordedAt || P.get('clock') === 'real') return;
    var Real = Date, t0 = Real.now(), frozen = P.get('freeze') === '1';
    var now = function () { return frozen ? recordedAt + 4000 : recordedAt + (Real.now() - t0); };
    function Fake() { var a = arguments; if (!(this instanceof Fake)) return new Real(now()).toString(); return a.length === 0 ? new Real(now()) : new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(a))))(); }
    Fake.prototype = Real.prototype; Fake.now = now; Fake.parse = Real.parse; Fake.UTC = Real.UTC;
    window.Date = Fake;
    G.clock = { recordedAt: recordedAt, frozen: frozen };
  }

  var base = new URL('.', location.href);
  var fx = new URL('js/client/gallery/fixtures/', base);
  var getJson = function (name) { return fetch(new URL(name, fx)).then(function (r) { if (!r.ok) throw new Error(name + ' ' + r.status); return r.json(); }); };

  Promise.all([fetch(new URL('index.html', base)).then(function (r) { return r.text(); }), getJson('session.json'), getJson('moments.json').catch(function () { return {}; })]).then(function (got) {
    var doc = new DOMParser().parseFromString(got[0], 'text/html');
    G.session = got[1]; G.moments = got[2];
    setClock(G.session.recordedAt);
    // the import map first (three.js for portraits and item icons)
    var im = doc.querySelector('script[type="importmap"]');
    if (im) { var s = document.createElement('script'); s.type = 'importmap'; s.textContent = im.textContent; document.head.appendChild(s); }
    // the game's own stylesheets, in its order — then the layers that are still proposals (input + phone)
    var sheets = [].map.call(doc.querySelectorAll('link[rel="stylesheet"]'), function (l) { return l.getAttribute('href'); });
    G.sheets = sheets.slice();
    ['css/input.css', 'css/layout-phone.css'].forEach(function (h) { if (sheets.indexOf(h) < 0) sheets.push(h); });
    var before = document.querySelector('link[href="css/ui-gallery-frame.css"]');
    var waits = sheets.map(function (href) { return new Promise(function (res) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = res; document.head.insertBefore(l, before); }); });
    // the game's markup, untouched (minus its module script — stage.js stands in for main.js)
    [].forEach.call(doc.body.querySelectorAll('script'), function (n) { n.remove(); });
    var frag = document.createDocumentFragment();
    while (doc.body.firstChild) frag.appendChild(document.adoptNode(doc.body.firstChild));
    document.body.insertBefore(frag, document.body.firstChild);
    return Promise.all(waits);
  }).then(function () {
    var m = document.createElement('script'); m.type = 'module'; m.src = 'js/client/gallery/stage.js'; document.body.appendChild(m);
  }).catch(function (e) {
    G.errors.push('boot: ' + e.message);
    var w = document.getElementById('gallery-wait'); if (w) { w.classList.add('failed'); w.querySelector('span').textContent = 'The scene could not start: ' + e.message; }
  });
})();
