// The join code as a QR picture (SVG text). The generator is vendored (vendor/qrcode-generator, MIT) and only loaded
// when a lobby is shown. The address is built from wherever the page was opened, so it works on the LAN and on the
// public link alike — never a baked-in address.
let loading = null;
const lib = () => loading || (loading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../../../../vendor/qrcode-generator/qrcode.js', import.meta.url).href; s.onload = () => res(window.qrcode); s.onerror = rej; document.head.append(s); }));
export const joinUrl = code => `${location.origin}${location.pathname}?code=${code}`;
export async function qrSvg(text, { dark = '#0d2228', light = '#ffffff' } = {}) {
  const qrcode = await lib(), q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
