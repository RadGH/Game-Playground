#!/usr/bin/env python3
"""Static file server for Tiny RTS with caching turned off, so edits show up on reload."""
import http.server, sys, functools, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8460
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
handler = functools.partial(NoCache, directory=root)
http.server.ThreadingHTTPServer(('0.0.0.0', port), handler).serve_forever()
