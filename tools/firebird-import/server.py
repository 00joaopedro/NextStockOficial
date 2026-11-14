"""Private, opt-in Firebird reader. Run in a separate container without app secrets."""
import csv
import hmac
import io
import json
import os
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

MAX_BYTES = 5 * 1024 * 1024
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
TOKEN = os.environ.get("NEXTSTOCK_FIREBIRD_READER_TOKEN", "")


class Reader(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(8)
        super().setup()

    def log_message(self, *_args):
        pass

    def reply(self, code, value):
        body = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
        if len(body) > MAX_RESPONSE_BYTES:
            code, body = 422, b'{"error":"output_limit"}'
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), f"Bearer {TOKEN}".encode()):
            return self.reply(401, {"error": "unauthorized"})
        url = urlsplit(self.path)
        if url.path != "/inspect":
            return self.reply(404, {"error": "not_found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            params = parse_qs(url.query, keep_blank_values=True, max_num_fields=1)
            table = params.get("table", [None])[0]
            if table is not None and (not table or len(table) > 512 or "\0" in table):
                raise ValueError()
            if self.headers.get("Transfer-Encoding") or not 0 < size <= MAX_BYTES:
                return self.reply(413, {"error": "size"})
        except ValueError:
            return self.reply(400, {"error": "invalid_request"})

        with tempfile.TemporaryDirectory(prefix="nextstock-firebird-web-") as directory:
            data = self.rfile.read(size)
            if len(data) != size:
                return self.reply(400, {"error": "incomplete"})
            (Path(directory) / "source.fdb").write_bytes(data)
            args = [sys.executable, "/tool/export.py", "--web"]
            if table is not None:
                args += ["--table=" + table]
            try:
                output = subprocess.run(
                    args, cwd=directory, timeout=8, check=True, capture_output=True,
                    env={"PATH": os.defpath, "LANG": "C.UTF-8", "PYTHONIOENCODING": "utf-8", "TMPDIR": directory},
                ).stdout.decode("utf-8")
                if table is None:
                    result = json.loads(output)
                else:
                    rows = csv.reader(io.StringIO(output, newline=""))
                    result = {"headers": next(rows), "rows": list(rows)}
            except (subprocess.SubprocessError, ValueError, StopIteration, csv.Error):
                return self.reply(422, {"error": "incompatible_or_invalid"})
        self.reply(200, result)


if __name__ == "__main__":
    if len(TOKEN) < 32:
        sys.exit("NEXTSTOCK_FIREBIRD_READER_TOKEN precisa ter ao menos 32 caracteres.")
    with HTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Reader) as server:
        server.serve_forever()
