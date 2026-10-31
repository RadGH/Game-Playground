// Compressed saves. CompressionStream exists in Workers, browsers and node, so one path serves all three.

async function pipe(stream, bytes) {
  const out = stream.readable.getReader(), writer = stream.writable.getWriter();
  writer.write(bytes); writer.close();
  const chunks = [];
  for (;;) { const { done, value } = await out.read(); if (done) break; chunks.push(value); }
  const total = chunks.reduce((n, b) => n + b.length, 0), all = new Uint8Array(total);
  let at = 0;
  for (const b of chunks) { all.set(b, at); at += b.length; }
  return all;
}
export const gzipText = text => pipe(new CompressionStream('gzip'), new TextEncoder().encode(text));
export const gunzipText = async bytes => new TextDecoder().decode(await pipe(new DecompressionStream('gzip'), bytes));
