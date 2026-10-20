"""Private support-only scan transport. No Blob URLs, spreadsheets or customer data APIs.
Stdlib only. ClamAV is the scanning engine; pdfinfo only checks PDF inspectability.
"""
import base64
import datetime as dt
import hashlib
import hmac
import http.server
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import socket
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import xml.etree.ElementTree as ET
import zipfile

CAP = 10 * 1024 * 1024
EXPANDED = 50 * 1024 * 1024
MAX_FILES = 1000
ENGINE_EOL = dt.datetime(2027, 8, 15, tzinfo=dt.timezone.utc)
TOKEN = os.environ.get("SUPPORT_SCANNER_BEARER_TOKEN", "")
if len(TOKEN) < 32:
    raise RuntimeError("A private scanner bearer token of at least 32 characters is required")
GATE = threading.BoundedSemaphore(1)

class Unavailable(Exception):
    def __init__(self, code, blocked=False):
        self.code, self.blocked = code, blocked

def clamd(command, data_path=None):
    deadline = time.monotonic() + 30
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(30)
        sock.connect("/tmp/support-clamd.sock")
        sock.sendall(b"z" + command + b"\0")
        if data_path:
            with open(data_path, "rb") as source:
                while chunk := source.read(65536):
                    sock.settimeout(max(.01, deadline-time.monotonic()))
                    sock.sendall(struct.pack("!I", len(chunk)) + chunk)
            sock.sendall(struct.pack("!I", 0))
        response = b""
        while b"\0" not in response and len(response) <= 4096:
            sock.settimeout(max(.01, deadline-time.monotonic()))
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk
        if not response.endswith(b"\0") or len(response) > 4096:
            raise Unavailable("SCANNER_PROTOCOL")
        return response[:-1].decode("utf-8", "strict")

def engine_info():
    raw = clamd(b"VERSION")
    match = re.fullmatch(r"ClamAV (1\.4\.(\d+))/(\d+)/(.+)", raw)
    if not match or int(match[2]) < 6:
        raise Unavailable("ENGINE_UNSUPPORTED")
    stamp = dt.datetime.strptime(match[4], "%a %b %d %H:%M:%S %Y").replace(tzinfo=dt.timezone.utc)
    now = dt.datetime.now(dt.timezone.utc)
    if now >= ENGINE_EOL or now-stamp > dt.timedelta(hours=48) or stamp-now > dt.timedelta(minutes=5):
        raise Unavailable("SIGNATURES_STALE")
    return {"engineVersion": match[1], "signatureVersion": match[3], "signatureUpdatedAt": stamp.isoformat()}

def preflight(path, filename):
    ext = Path(filename).suffix.lower()
    head = Path(path).read_bytes()[:8]
    if head.startswith((b"MZ", b"\x7fELF", b"\xca\xfe\xba\xbe", b"#!")):
        raise Unavailable("BLOCKED_CONTENT", True)
    if ext in {".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar"}:
        raise Unavailable("ARCHIVE_REJECTED", True)
    if ext in {".xlsm", ".xlam", ".xltm", ".docm", ".dotm", ".pptm", ".potm", ".ppam", ".ppsm"}:
        raise Unavailable("MACRO_REJECTED", True)
    if ext in {".txt", ".csv", ".tsv"}:
        text = Path(path).read_bytes().decode("utf-8-sig", "strict")
        if any(ord(c) < 32 and c not in "\t\r\n" for c in text):
            raise Unavailable("UNINSPECTABLE", True)
        return
    if ext == ".pdf":
        raw = Path(path).read_bytes()
        if not raw.startswith(b"%PDF-") or b"%%EOF" not in raw[-4096:]:
            raise Unavailable("UNINSPECTABLE", True)
        if re.search(rb"/(Encrypt|EmbeddedFile|JavaScript|Launch|RichMedia)\b", raw):
            raise Unavailable("ENCRYPTED_OR_ACTIVE_PDF", True)
        result = subprocess.run(["pdfinfo", path], capture_output=True, timeout=5, check=False)
        report = result.stdout.decode("utf-8", "replace")
        if result.returncode or result.stderr or not re.search(r"Encrypted:\s+no", report):
            raise Unavailable("UNINSPECTABLE", True)
        pages = re.search(r"Pages:\s+(\d+)", report)
        if not pages or int(pages[1]) > 500:
            raise Unavailable("LIMIT_EXCEEDED", True)
        return
    roots = {".xlsx": ("xl/", "xl/workbook.xml"), ".docx": ("word/", "word/document.xml"), ".pptx": ("ppt/", "ppt/presentation.xml")}
    if ext not in roots:
        raise Unavailable("UNSUPPORTED", True)
    prefix, required = roots[ext]
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            if not infos or len(infos) > MAX_FILES or sum(i.file_size for i in infos) > EXPANDED:
                raise Unavailable("LIMIT_EXCEEDED", True)
            names, exact_names, main_type = set(), set(), None
            for item in infos:
                name = item.filename
                parts = PurePosixPath(name).parts
                if name.lower() in names or ".." in parts or name.startswith("/") or "\\" in name:
                    raise Unavailable("UNINSPECTABLE", True)
                names.add(name.lower()); exact_names.add(name)
                if item.flag_bits & 1:
                    raise Unavailable("ENCRYPTED", True)
                if item.file_size > CAP or item.file_size > max(1, item.compress_size)*100 or item.compress_type not in {0, 8}:
                    raise Unavailable("LIMIT_EXCEEDED", True)
                if item.is_dir():
                    if item.file_size: raise Unavailable("UNINSPECTABLE", True)
                    continue
                if ((item.external_attr >> 16) & 0o170000) == 0o120000:
                    raise Unavailable("UNINSPECTABLE", True)
                if "vba" in name.lower() or "embedding" in name.lower() or "macro" in name.lower():
                    raise Unavailable("MACRO_OR_EMBEDDED_CONTENT", True)
                # Initial Office intake is XML/rels only. Unknown embedded media/binaries fail closed.
                if not (name == "[Content_Types].xml" or name.startswith((prefix, "_rels/", "docProps/"))) or not name.lower().endswith((".xml", ".rels")):
                    raise Unavailable("UNSUPPORTED_OFFICE_PART", True)
                raw = archive.read(item)  # Bounds and ratio checked before decompression; CRC is verified.
                text = raw.decode("utf-8-sig", "strict")
                if re.search(r"<!\s*(DOCTYPE|ENTITY)", text, re.I):
                    raise Unavailable("UNINSPECTABLE", True)
                root = ET.fromstring(text)  # Syntax inspection only; no formulas, macros or external references evaluated.
                if name == "[Content_Types].xml" and any("macroenabled" in str(v).lower() or "vba" in str(v).lower() for node in root.iter() for v in node.attrib.values()):
                    raise Unavailable("MACRO_REJECTED", True)
                if name == "[Content_Types].xml":
                    main_type = next((node.attrib.get("ContentType") for node in root.iter() if node.attrib.get("PartName") == "/"+required), None)
            expected_type = {".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"}[ext]
            if required not in exact_names or "[Content_Types].xml" not in exact_names or "_rels/.rels" not in exact_names or main_type != expected_type:
                raise Unavailable("UNINSPECTABLE", True)
    except (zipfile.BadZipFile, RuntimeError, UnicodeError, ET.ParseError):
        raise Unavailable("UNINSPECTABLE", True)

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "SupportScanner/1"
    def log_message(self, *_args):
        pass  # Never log filename, bytes, tokens or vendor/raw scanner payloads.
    def reply(self, status, value):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
    def do_POST(self):
        if self.path != "/scan" or not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer "+TOKEN):
            self.reply(401, {"code": "UNAUTHORIZED"}); return
        if not GATE.acquire(blocking=False):
            self.reply(429, {"code": "BUSY"}); return
        result, metadata = {}, {}
        try:
            self.connection.settimeout(10)
            attachment_id = self.headers.get("X-Attachment-Id", "")
            attempt_id = self.headers.get("X-Scan-Attempt", "")
            expected = self.headers.get("X-Content-Sha256", "")
            length = int(self.headers.get("Content-Length", "0"))
            filename = base64.b64decode(self.headers.get("X-Filename-Base64", ""), validate=True).decode("utf-8")
            if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", attachment_id) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", attempt_id) or not re.fullmatch(r"[a-f0-9]{64}", expected) or not 0 < length <= CAP or len(filename) > 180:
                raise Unavailable("INVALID_REQUEST")
            result = {"attachmentId": attachment_id, "attemptId": attempt_id, "sha256": expected, "sizeBytes": length, "provider": "private-clamav/v1"}
            with tempfile.TemporaryDirectory(prefix="support-scan-") as directory:
                path = str(Path(directory)/"source")
                sha = hashlib.sha256()
                with open(path, "xb") as target:
                    os.chmod(path, 0o600)
                    remaining = length
                    deadline = time.monotonic()+10
                    while remaining:
                        if time.monotonic() > deadline: raise Unavailable("TIMEOUT")
                        chunk = self.rfile.read(min(65536, remaining))
                        if not chunk: raise Unavailable("INCOMPLETE")
                        sha.update(chunk); target.write(chunk); remaining -= len(chunk)
                actual = sha.hexdigest()
                if actual != expected: raise Unavailable("HASH_MISMATCH")
                metadata = engine_info()
                preflight(path, filename)
                verdict = clamd(b"INSTREAM", path)
                after = engine_info()
                if after != metadata: raise Unavailable("ENGINE_CHANGED")
                if verdict == "stream: OK":
                    result.update(verdict="CLEAN", code="CLEAN")
                elif verdict.startswith("stream: ") and verdict.endswith(" FOUND"):
                    code = "LIMIT_EXCEEDED" if "Exceeded" in verdict else "ENCRYPTED" if "Encrypted" in verdict else "MACRO_REJECTED" if "Macro" in verdict else "DETECTED"
                    result.update(verdict="BLOCKED", code=code)
                else: raise Unavailable("SCANNER_FAILURE")
        except Unavailable as error:
            result.update(verdict="BLOCKED" if error.blocked else "FAILED", code=error.code)
        except (TimeoutError, socket.timeout, subprocess.TimeoutExpired):
            result.update(verdict="FAILED", code="TIMEOUT")
        except Exception:
            result.update(verdict="FAILED", code="SCANNER_FAILURE")
        finally:
            GATE.release()
        result["inspectedComplete"] = result.get("verdict") == "CLEAN"
        result.update(metadata)
        result["scannedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        try: self.reply(200, result)
        except (OSError, ssl.SSLError): pass

if __name__ == "__main__":
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(os.environ["SUPPORT_SCANNER_TLS_CERT"], os.environ["SUPPORT_SCANNER_TLS_KEY"])
    server = http.server.ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("SUPPORT_SCANNER_PORT", "8443"))), Handler)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    # TLS keys are loaded before dropping privileges. No customer bytes are handled as root.
    if os.getuid() == 0:
        identity = pwd.getpwnam("clamav")
        os.setgroups([]); os.setgid(identity.pw_gid); os.setuid(identity.pw_uid)
    server.serve_forever()
