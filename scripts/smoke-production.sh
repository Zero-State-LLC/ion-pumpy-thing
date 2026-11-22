#!/usr/bin/env bash
# Retry production smoke checks for up to three minutes, then fail.
# Usage: scripts/smoke-production.sh [cache-bust-token]
# SMOKE_BASE and SMOKE_SECONDS change the site and the retry time (for tests).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 - "$root" "$@" << 'PY'
import os, re, sys, time, urllib.request, urllib.error
from pathlib import Path

root = Path(sys.argv[1])
cb = sys.argv[2] if len(sys.argv) > 2 else str(int(time.time()))
base = os.environ.get("SMOKE_BASE", "https://ion-pumpy-thing.app").rstrip("/")
deadline = time.time() + float(os.environ.get("SMOKE_SECONDS", "180"))
last = "no successful checks yet"

# The 3D view: its modules must be served as JavaScript, and every prop
# index.html names must be a binary glTF.
scripts = ["view3d.js", "vendor/three/three.module.js", "vendor/three/three.core.js"]
props = sorted(set(re.findall(r"assets/[\w-]+\.glb", (root / "index.html").read_text(encoding="utf-8"))))
if not props:
    print("Production smoke failed: index.html names no .glb props.")
    sys.exit(1)
JS = re.compile(r"^(?:text|application)/(?:x-)?javascript\b")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ion-pumpy-thing-smoke/1"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read(), resp.headers.get("content-type", "")
    except urllib.error.HTTPError as err:
        return err.code, b"", err.headers.get("content-type", "")

def view3d_problems():
    bad = []
    for path in scripts:
        status, _, ctype = fetch(f"{base}/{path}?cb={cb}")
        if status != 200 or not JS.match(ctype):
            bad.append(f"{path} ({status}, {ctype or 'no content type'})")
    for path in props:
        status, body, _ = fetch(f"{base}/{path}?cb={cb}")
        if status != 200 or body[:4] != b"glTF":
            bad.append(f"{path} ({status}, {'glTF' if body[:4] == b'glTF' else 'not glTF'})")
    return bad

while time.time() < deadline:
    try:
        status, html, _ = fetch(f"{base}/?cb={cb}")
        text = html.decode("utf-8", "replace")
        premise = "takes that account as its premise" in text
        p_status, _, _ = fetch(f"{base}/privacy?cb={cb}")
        o_status, png, _ = fetch(f"{base}/assets/og-image.png?cb={cb}")
        png_ok = (
            o_status == 200
            and png[:8] == b"\x89PNG\r\n\x1a\n"
            and png[12:16] == b"IHDR"
            and int.from_bytes(png[16:20], "big") == 1200
            and int.from_bytes(png[20:24], "big") == 630
        )
        bad = view3d_problems()
        last = (
            f"home={status} premise={premise} privacy={p_status} "
            f"og={o_status} og_ok={png_ok} html_bytes={len(html)} "
            f"3d={'ok' if not bad else 'failing: ' + ', '.join(bad)}"
        )
        if status == 200 and premise and p_status == 200 and png_ok and not bad:
            print("Production smoke passed.", last)
            sys.exit(0)
    except Exception as exc:
        last = f"error: {type(exc).__name__}: {exc}"
    time.sleep(max(0, min(10, deadline - time.time())))

print("Production smoke failed after retries.", last)
sys.exit(1)
PY
