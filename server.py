#!/usr/bin/env python3
"""HTTP server — serves on all interfaces so LAN devices can connect."""
import http.server
import socketserver
import socket

PORT = 8080

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "your-machine-ip"

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs

lan_ip = get_lan_ip()

with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"┌──────────────────────────────────────────────┐")
    print(f"│  Ollama Chat UI is running!                  │")
    print(f"│                                              │")
    print(f"│  Local:   http://localhost:{PORT}              │")
    print(f"│  Network: http://{lan_ip}:{PORT}         │")
    print(f"│                                              │")
    print(f"│  Share the Network URL with family members   │")
    print(f"│  on the same Wi-Fi to access from phones.   │")
    print(f"└──────────────────────────────────────────────┘")
    httpd.serve_forever()
