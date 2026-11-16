# Sidene lokalt på port 8000, som «python3 -m http.server -d site», men nettleseren spør hver gang om siden er
# endret. Uten det bruker den en gammel side mot et nytt API i timevis etter en endring. Bare standardbiblioteket.
import functools
import http.server
import sys
from pathlib import Path


class SporHverGang(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
mappe = Path(__file__).resolve().parent.parent / "site"
with http.server.ThreadingHTTPServer(("", port), functools.partial(SporHverGang, directory=str(mappe))) as server:
    print(f"Sidene lokalt: http://localhost:{port}/", flush=True)
    server.serve_forever()
