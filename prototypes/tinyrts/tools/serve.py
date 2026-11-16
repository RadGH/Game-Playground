#!/usr/bin/env python3
"""Static file server for Tiny RTS with caching turned off, so edits show up on reload."""
import http.server, sys, functools, os

# The What's new window comes from the playground's shared/ folder (this game is served from
# playground/prototypes/tinyrts/ there and on games.radgh.com). Standalone, /shared/ maps to it when it is next door.
SHARED = os.path.join(os.path.expanduser('~'), 'claude', 'playground', 'shared')

class NoCache(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split('?', 1)[0].split('#', 1)[0]
        if clean.startswith('/shared/') and os.path.isdir(SHARED):
            rel = os.path.normpath(clean[len('/shared/'):]).lstrip('/')
            if not rel.startswith('..'):
                return os.path.join(SHARED, rel)
        return super().translate_path(path)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8460
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
handler = functools.partial(NoCache, directory=root)
http.server.ThreadingHTTPServer(('0.0.0.0', port), handler).serve_forever()
