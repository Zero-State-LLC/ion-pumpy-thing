#!/usr/bin/env bash
# Retry production smoke checks for up to three minutes, then fail.
# Usage: scripts/smoke-production.sh [cache-bust-token]
set -euo pipefail
exec python3 - "$@" << 'PY'
import sys, time, urllib.request, urllib.error
from pathlib import Path

cb = sys.argv[1] if len(sys.argv) > 1 else str(int(time.time()))
base = "https://ion-pumpy-thing.app"
deadline = time.time() + 180
last = "no successful checks yet"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ion-pumpy-thing-smoke/1"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, resp.read()

while time.time() < deadline:
    try:
        status, html = fetch(f"{base}/?cb={cb}")
        text = html.decode("utf-8", "replace")
        premise = "takes that account as its premise" in text
        p_status, _ = fetch(f"{base}/privacy?cb={cb}")
        o_status, png = fetch(f"{base}/assets/og-image.png?cb={cb}")
        png_ok = (
            o_status == 200
            and png[:8] == b"\x89PNG\r\n\x1a\n"
            and png[12:16] == b"IHDR"
            and int.from_bytes(png[16:20], "big") == 1200
            and int.from_bytes(png[20:24], "big") == 630
        )
        last = (
            f"home={status} premise={premise} privacy={p_status} "
            f"og={o_status} og_ok={png_ok} html_bytes={len(html)}"
        )
        if status == 200 and premise and p_status == 200 and png_ok:
            print("Production smoke passed.", last)
            sys.exit(0)
    except Exception as exc:
        last = f"error: {type(exc).__name__}: {exc}"
    time.sleep(10)

print("Production smoke failed after retries.", last)
sys.exit(1)
PY
