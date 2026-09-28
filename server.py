#!/usr/bin/env python3
"""
HanziNA — Lightweight Python HTTP Server
Serves the HanziNA workspace with proper MIME types, CORS headers, and cache handling.
Can be executed locally with:
    python3 server.py
or with custom port:
    python3 server.py --port 8080
"""

import os
import sys
import json
import argparse
import mimetypes
from urllib.parse import urlparse
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Ensure correct MIME types for modern web assets
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("image/svg+xml", ".svg")

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))


class HanziNAServerHandler(SimpleHTTPRequestHandler):
    """
    HTTP Request Handler that serves HanziNA assets with CORS headers
    and disables caching during local development.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WORKSPACE_DIR, **kwargs)

    def guess_type(self, path):
        """Ensure reliable MIME types with UTF-8 charset for web assets."""
        if path.endswith("/") or path == "":
            return "text/html; charset=utf-8"
        _, ext = os.path.splitext(path)
        ext = ext.lower()
        if ext == ".html":
            return "text/html; charset=utf-8"
        if ext == ".js":
            return "application/javascript; charset=utf-8"
        if ext == ".css":
            return "text/css; charset=utf-8"
        if ext == ".json":
            return "application/json; charset=utf-8"
        return super().guess_type(path)

    def end_headers(self):
        # Enable CORS for local testing and extension compatibility
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        # Prevent stale cache during active development
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        """Respond to pre-flight CORS requests."""
        self.send_response(200, "OK")
        self.end_headers()

    def do_GET(self):
        """Handle GET requests, intercepting /api/env and /api/health."""
        parsed = urlparse(self.path)
        req_path = parsed.path

        if req_path in ("/api/env", "/api/env/"):
            env_file = os.path.join(WORKSPACE_DIR, ".env")
            env_vars = {}
            if os.path.exists(env_file):
                try:
                    with open(env_file, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith("#") and "=" in line:
                                k, v = line.split("=", 1)
                                env_vars[k.strip()] = v.strip().strip("'\"")
                except Exception:
                    pass

            data = {
                "SUPABASE_URL": env_vars.get("SUPABASE_URL")
                or os.environ.get("SUPABASE_URL", "https://swnzwsohgpjlceplnfcg.supabase.co"),
                "SUPABASE_ANON_KEY": env_vars.get("SUPABASE_ANON_KEY")
                or os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_ejODqwhAMKFrgXlvXMY-Ag_YWKaip6g"),
                "SUPABASE_TABLE": env_vars.get("SUPABASE_TABLE")
                or os.environ.get("SUPABASE_TABLE", "reading_sessions"),
                "OPENAI_API_KEY": env_vars.get("OPENAI_API_KEY")
                or os.environ.get("OPENAI_API_KEY", ""),
                "OPENAI_MODEL": env_vars.get("OPENAI_MODEL")
                or os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            }
            body = json.dumps(data, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if req_path in ("/api/health", "/api/health/", "/api", "/api/"):
            data = {
                "status": "healthy",
                "service": "HanziNA Lightweight Python Server",
                "version": "1.0.0",
                "python_version": sys.version.split()[0],
                "platform": "Local Python Server",
            }
            body = json.dumps(data, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        return super().do_GET()

    def log_message(self, format, *args):
        """Custom clean logging output."""
        sys.stderr.write(f"[{self.log_date_time_string()}] {args[0]} {args[1]}\n")


def run(host="0.0.0.0", port=8000):
    server_address = (host, port)
    httpd = HTTPServer(server_address, HanziNAServerHandler)

    display_host = "localhost" if host in ("0.0.0.0", "") else host
    print("=" * 60)
    print("  HanziNA Lightweight Python Server")
    print("=" * 60)
    print(f"  • Local URL:     http://{display_host}:{port}/")
    print(f"  • Root Dir:      {WORKSPACE_DIR}")
    print(f"  • CORS:          Enabled (Origin: *)")
    print("  • Press Ctrl+C to stop the server.")
    print("=" * 60 + "\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\nShutting down HanziNA server...")
        httpd.server_close()
        print("Server gracefully stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HanziNA Lightweight Python Server")
    default_port = int(os.environ.get("PORT", 8000))
    parser.add_argument("--port", "-p", type=int, default=default_port, help=f"Port to bind (default: {default_port})")
    parser.add_argument("--host", "-H", type=str, default="0.0.0.0", help="Host interface (default: 0.0.0.0)")
    args = parser.parse_args()

    run(host=args.host, port=args.port)
