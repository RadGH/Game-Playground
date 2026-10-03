// Deterministic sorting. Array.prototype.sort's algorithm differs between engines (V8 TimSort vs
// SpiderMonkey merge sort) and only stability is promised, so equal keys can come out in a different
// order on a different browser — a lockstep desync. The sim sorts ONLY through sortBy: a plain merge
// sort with an explicit tie-break key (default 'id').
//
//   sortBy(ents, e => e.z)            ascending by z, then by id
//   sortBy(list, x => -x.score, 'unit')

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

/** Returns a NEW sorted array. key: function(item) -> number|string. tieKey: property name or function. */
export function sortBy(arr, key, tieKey = 'id') {
  const tie = typeof tieKey === 'function' ? tieKey : (x => (x == null ? 0 : x[tieKey]));
  const n = arr.length;
  let a = new Array(n), b = new Array(n);
  for (let i = 0; i < n; i++) a[i] = { v: arr[i], k: key(arr[i]), t: tie(arr[i]), i };
  const less = (x, y) => (cmp(x.k, y.k) || cmp(x.t, y.t) || (x.i - y.i)) <= 0;
  for (let w = 1; w < n; w *= 2) {
    for (let lo = 0; lo < n; lo += 2 * w) {
      const mid = Math.min(lo + w, n), hi = Math.min(lo + 2 * w, n);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) b[k++] = less(a[i], a[j]) ? a[i++] : a[j++];
      while (i < mid) b[k++] = a[i++];
      while (j < hi) b[k++] = a[j++];
    }
    const t = a; a = b; b = t;
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i].v;
  return out;
}

/** Sorted copy of an array of strings or numbers (no tie key needed). */
export function sorted(values) { return sortBy(values, v => v, () => 0); }
