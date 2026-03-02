#!/usr/bin/env python3
"""
HTTP server with built-in Ollama API proxy.

All requests to /api/* are forwarded to Ollama on localhost:11434,
so browsers on the LAN never hit a cross-origin (CORS) error.
"""
import http.server
import socketserver
import socket
import urllib.request
import urllib.error

PORT = 8080
OLLAMA_URL = "http://127.0.0.1:11434"  # explicit IPv4 — avoids localhost→::1 on some systems

# Headers we should NOT forward as-is (handled by the proxy layer)
_HOP_BY_HOP = frozenset([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade',
])


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "your-machine-ip"


class ProxyHandler(http.server.SimpleHTTPRequestHandler):

    # ── Proxy any /api/* request to Ollama ──────────────────────────────
    def do_GET(self):
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            super().do_POST()

    def do_HEAD(self):
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            super().do_HEAD()

    def _proxy(self):
        target = OLLAMA_URL + self.path
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else None

        req = urllib.request.Request(target, data=body, method=self.command)
        req.add_header('Content-Type',
                       self.headers.get('Content-Type', 'application/json'))

        try:
            resp = urllib.request.urlopen(req, timeout=300)
            self.send_response(resp.status)
            for k, v in resp.headers.items():
                if k.lower() not in _HOP_BY_HOP:
                    self.send_header(k, v)
            self.end_headers()
            # Stream in chunks (important for SSE / streaming responses)
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())

    # ── No-cache headers on every response ──────────────────────────────
    def end_headers(self):
        self.send_header('Cache-Control',
                         'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # suppress per-request logs


lan_ip = get_lan_ip()

with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
    print(f"┌──────────────────────────────────────────────────────┐")
    print(f"│  Ollama Chat UI is running!                          │")
    print(f"│                                                      │")
    print(f"│  Local:   http://localhost:{PORT}                    ")
    print(f"│  Network: http://{lan_ip}:{PORT}                     ")
    print(f"│                                                      │")
    print(f"│  Devices on the same network can access the models   │")
    print(f"└──────────────────────────────────────────────────────┘")
    httpd.serve_forever()
