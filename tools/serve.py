#!/usr/bin/env python3
"""Playground dev server: static files + a tiny JSON API so the browser can hand data back to Claude.

   POST /api/library/sync   body = library JSON → written to library/synced/library.json (+ timestamped copy in library/synced/inbox/)
   GET  /api/library/sync   → the last synced library JSON (or {} )
   POST /api/inbox/<name>   body = any JSON → library/synced/inbox/<name>-<timestamp>.json  (generic "send this to Claude")

Run: python3 tools/serve.py [port]   (serve.sh does this)

---------------------------------------------------------------------------------------------------
Why this file is more than four lines of http.server (round 16)

    "The game takes a long time to load on my laptop over wifi. I can see each JS file takes 2-5
     seconds to load. It might just be my wifi being slow, because my desktop loads it really
     quickly."

It was not the wifi. Farhold is 190 ES modules and 6.3 MB, and `SimpleHTTPRequestHandler` defaults
to **HTTP/1.0**, which means every single one of those 190 files got its own TCP connection: open,
ask, answer, close, repeat. On a desktop on the same switch the handshake is invisible. Over wifi,
where a round trip is 20-40 ms and the browser will only run six connections at a time, 190 files
turn into minutes — and it gets worse, because a browser cannot discover a module until it has
parsed the one that imports it, and Farhold's import graph is six levels deep.

Three changes, all of them server-side and none of them touching a game file:

  1. **HTTP/1.1 with keep-alive.** One connection carries dozens of files. This is the big one.
  2. **gzip** for text (js/css/html/json/svg), with the compressed bytes cached in memory against
     the file's mtime, so the second load costs nothing. 6.3 MB of source is about 1.4 MB gzipped.
  3. **Revalidation that works** — ETag plus Last-Modified, so a reload answers 304 Not Modified
     for anything unchanged instead of resending it.

The other half of the fix is in the pages themselves: `tools/preload-modules.py` writes a block of
`<link rel="modulepreload">` tags into index.html, which lets the browser fetch all 190 modules at
once rather than discovering them six rounds deep.
"""
import email.utils
import gzip
import hashlib
import http.server
import io
import json
import os
import posixpath
import socketserver
import sys
import threading
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC_DIR = os.path.join(ROOT, 'library', 'synced'); INBOX = os.path.join(SYNC_DIR, 'inbox')
os.makedirs(INBOX, exist_ok=True)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8400

# Text types worth compressing. Images, fonts and audio are already compressed; gzipping them
# spends CPU to make them very slightly bigger.
GZIP_TYPES = ('application/javascript', 'text/javascript', 'text/css', 'text/html',
              'application/json', 'image/svg+xml', 'text/plain', 'text/markdown')
GZIP_MIN = 1024          # below this the header costs more than the saving

# path -> (mtime, size, gzipped bytes, etag). Bounded so a long session cannot eat the box.
_cache = {}
_cache_lock = threading.Lock()
_CACHE_MAX = 400


class Handler(http.server.SimpleHTTPRequestHandler):
    # The whole point: one connection, many files.
    protocol_version = 'HTTP/1.1'
    # Without this, every response costs 40 ms of nothing. A response goes out as two writes —
    # the header block, then the body — and Nagle's algorithm holds the second one back waiting
    # for an ACK that the client's delayed-ACK timer will not send for 40 ms. Over 190 modules
    # that is 7.5 seconds of pure waiting, which is most of what "each file takes 2-5 seconds"
    # actually was. Turning Nagle off lets the body follow the headers immediately.
    disable_nagle_algorithm = True

    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        if '/api/' in (args[0] if args else ''): super().log_message(fmt, *args)

    # ----------------------------------------------------------------- the JSON API (unchanged)
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/api/library/sync'):
            p = os.path.join(SYNC_DIR, 'library.json')
            return self._json(200, json.load(open(p)) if os.path.exists(p) else {})
        if self.path.startswith('/api/inbox'):
            files = sorted(os.listdir(INBOX)); return self._json(200, {'files': files})
        if self._serve_compressed():
            return
        return super().do_GET()

    def do_HEAD(self):
        if self.path.startswith('/api/'):
            return self._json(200, {})
        return super().do_HEAD()

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); raw = self.rfile.read(n)
        try: data = json.loads(raw or b'{}')
        except Exception as e: return self._json(400, {'error': 'bad json: %s' % e})
        stamp = time.strftime('%Y%m%d-%H%M%S')
        if self.path.startswith('/api/library/sync'):
            json.dump(data, open(os.path.join(SYNC_DIR, 'library.json'), 'w'), indent=1)
            json.dump(data, open(os.path.join(INBOX, 'library-%s.json' % stamp), 'w'), indent=1)
            return self._json(200, {'ok': True, 'saved': 'library/synced/library.json', 'entries': len(data.get('entries', [])) if isinstance(data, dict) else None, 'at': stamp})
        if self.path.startswith('/api/inbox/'):
            name = ''.join(c for c in self.path.split('/api/inbox/')[1] if c.isalnum() or c in '-_')[:40] or 'data'
            fn = '%s-%s.json' % (name, stamp); json.dump(data, open(os.path.join(INBOX, fn), 'w'), indent=1)
            return self._json(200, {'ok': True, 'saved': 'library/synced/inbox/' + fn})
        return self._json(404, {'error': 'unknown endpoint'})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    # ------------------------------------------------------------------ gzip + revalidation
    def _local_path(self):
        """The same translation SimpleHTTPRequestHandler does, minus the directory-index part."""
        path = urllib.parse.urlsplit(self.path).path
        path = posixpath.normpath(urllib.parse.unquote(path))
        parts = [w for w in path.split('/') if w and w not in ('.', '..')]
        return os.path.join(ROOT, *parts)

    def _serve_compressed(self):
        """Answer a static text file gzipped. Returns True if it handled the request.

        Anything unusual — a directory, a range request, a client that did not ask for gzip — falls
        through to the stock handler, which still gets keep-alive and 304s from the base class.
        """
        if self.headers.get('Range'):
            return False
        if 'gzip' not in (self.headers.get('Accept-Encoding') or ''):
            return False
        path = self._local_path()
        if not os.path.isfile(path):
            return False
        ctype = self.guess_type(path)
        if ctype.split(';')[0].strip() not in GZIP_TYPES:
            return False
        try:
            st = os.stat(path)
        except OSError:
            return False
        if st.st_size < GZIP_MIN:
            return False

        key = path
        with _cache_lock:
            hit = _cache.get(key)
        if not hit or hit[0] != st.st_mtime_ns or hit[1] != st.st_size:
            with open(path, 'rb') as f:
                raw = f.read()
            buf = io.BytesIO()
            # mtime=0 so the same bytes always compress to the same bytes (stable ETag).
            with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6, mtime=0) as gz:
                gz.write(raw)
            blob = buf.getvalue()
            etag = '"%s"' % hashlib.sha1(raw).hexdigest()[:20]
            hit = (st.st_mtime_ns, st.st_size, blob, etag)
            with _cache_lock:
                if len(_cache) > _CACHE_MAX:
                    _cache.clear()
                _cache[key] = hit
        _, _, blob, etag = hit

        # A reload should cost a round trip, not 6.3 MB.
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return True

        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(blob)))
        self.send_header('ETag', etag)
        self.send_header('Vary', 'Accept-Encoding')
        # no-cache means "ask me, but I will usually say 304" — the right setting for a tree an
        # agent rewrites every few minutes. It is NOT no-store.
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Last-Modified', email.utils.formatdate(st.st_mtime, usegmt=True))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(blob)
        return True


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    # A keep-alive connection holds its thread for as long as the browser keeps it open, so these
    # must not stop the process exiting.
    daemon_threads = True


if __name__ == '__main__':
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        print('serving %s on port %d  (HTTP/1.1 keep-alive, gzip)' % (ROOT, PORT))
        httpd.serve_forever()
