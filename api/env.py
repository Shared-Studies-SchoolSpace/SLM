import os
import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    """
    Dedicated Vercel serverless route for /api/env.
    Supplies environment variables from Vercel Project Settings to the client.
    """

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.end_headers()

    def do_GET(self):
        data = {
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
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)
