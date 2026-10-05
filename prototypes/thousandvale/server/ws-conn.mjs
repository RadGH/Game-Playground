// One WebSocket -> one sim connection (stream A). Shared by the gateway process and the province processes.
//   wireSocket(ws, ip, path, accept, perIp?)   accept(path, conn) -> { message, close }

/** Send a client's frames for one tick in ONE socket write (cork until the next turn of the event loop). */
export function wireSocket(ws, ip, path, accept, onGone = () => {}) {
  let corked = false;
  const sock = ws._socket;
  const conn = {
    ip,
    send(d) {
      if (ws.readyState !== 1) return;
      if (!corked && sock && sock.cork) { corked = true; sock.cork(); setImmediate(() => { corked = false; try { sock.uncork(); } catch { /* closed */ } }); }
      ws.send(d, { binary: typeof d !== 'string' });
    },
    close(code, reason) { try { ws.close(code >= 4000 ? code : 4000, String(reason || '').slice(0, 100)); } catch { /* ignore */ } },
  };
  const h = accept(path, conn);
  ws.on('message', (data, isBinary) => {
    if (isBinary) h.message(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    else h.message(data.toString('utf8'));
  });
  ws.on('close', () => { onGone(); h.close(); });
  ws.on('error', () => {});
  // keep idle sockets alive through proxies (Cloudflare closes at ~100 s)
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  return h;
}

export function startPinger(wss) {
  return setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* ignore */ } }
  }, 30000);
}
