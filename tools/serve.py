#!/usr/bin/env python3
"""Playground dev server: static files + a tiny JSON API so the browser can hand data back to Claude.
   POST /api/library/sync   body = library JSON → written to library/synced/library.json (+ timestamped copy in library/synced/inbox/)
   GET  /api/library/sync   → the last synced library JSON (or {} )
   POST /api/inbox/<name>   body = any JSON → library/synced/inbox/<name>-<timestamp>.json  (generic "send this to Claude")
Run: python3 tools/serve.py [port]   (serve.sh does this)"""
import http.server, json, os, sys, time, socketserver
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC_DIR = os.path.join(ROOT, 'library', 'synced'); INBOX = os.path.join(SYNC_DIR, 'inbox')
os.makedirs(INBOX, exist_ok=True)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8400

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        if '/api/' in (args[0] if args else ''): super().log_message(fmt, *args)
    def _json(self, code, obj):
        body = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path.startswith('/api/library/sync'):
            p = os.path.join(SYNC_DIR, 'library.json')
            return self._json(200, json.load(open(p)) if os.path.exists(p) else {})
        if self.path.startswith('/api/inbox'):
            files = sorted(os.listdir(INBOX)); return self._json(200, {'files': files})
        return super().do_GET()
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
        self.send_response(204); self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers', 'Content-Type'); self.end_headers()

class Server(socketserver.ThreadingTCPServer): allow_reuse_address = True
if __name__ == '__main__':
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        print('serving %s on port %d' % (ROOT, PORT)); httpd.serve_forever()
