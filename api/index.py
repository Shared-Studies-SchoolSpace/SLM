import os
import sys
import json
import mimetypes
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

# Ensure MIME types for web files
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("image/svg+xml", ".svg")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class handler(BaseHTTPRequestHandler):
    """
    Vercel Python Serverless Function entry point.
    Handles API health routes and provides fallback file serving.
    """

    def do_OPTIONS(self):
        """Respond to pre-flight CORS requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        req_path = parsed.path

        # 1. API Health & Status Endpoint
        if req_path in ("/api/health", "/api/health/", "/api", "/api/"):
            data = {
                "status": "healthy",
                "service": "HanziNA Lightweight Python Server",
                "version": "1.0.0",
                "python_version": sys.version.split()[0],
                "platform": "Vercel Python Serverless Runtime",
                "configured": {
                    "supabase": bool(
                        os.environ.get("SUPABASE_URL")
                        or os.environ.get("PUBLIC_SUPABASE_URL")
                    ),
                    "openai": bool(os.environ.get("OPENAI_API_KEY")),
                },
            }
            body = json.dumps(data, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        # 2. Environment Configuration Endpoint (feeds Vercel env settings to frontend)
        if req_path in ("/api/env", "/api/env/"):
            env_data = {
                "SUPABASE_URL": os.environ.get("SUPABASE_URL")
                or os.environ.get("PUBLIC_SUPABASE_URL")
                or "https://swnzwsohgpjlceplnfcg.supabase.co",
                "SUPABASE_ANON_KEY": os.environ.get("SUPABASE_ANON_KEY")
                or os.environ.get("PUBLIC_SUPABASE_ANON_KEY")
                or "sb_publishable_ejODqwhAMKFrgXlvXMY-Ag_YWKaip6g",
                "SUPABASE_TABLE": os.environ.get("SUPABASE_TABLE", "reading_sessions"),
                "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", ""),
                "OPENAI_MODEL": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            }
            body = json.dumps(env_data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.end_headers()
            self.wfile.write(body)
            return

        # 2. File Serving (Fallback when routing through Python handler)
        clean_rel = req_path.lstrip("/")
        if not clean_rel or clean_rel == "":
            clean_rel = "index.html"

        target_file = os.path.join(BASE_DIR, clean_rel)

        # Path traversal guard
        real_base = os.path.realpath(BASE_DIR)
        real_target = os.path.realpath(target_file)
        if not real_target.startswith(real_base):
            self.send_response(403)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"403 Forbidden")
            return

        if os.path.isfile(real_target):
            mime_type, _ = mimetypes.guess_type(real_target)
            if not mime_type:
                mime_type = "application/octet-stream"

            with open(real_target, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
            return

        # 3. Not Found
        not_found = json.dumps({"error": f"Resource not found: {req_path}"}).encode(
            "utf-8"
        )
        self.send_response(404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(not_found)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(not_found)
