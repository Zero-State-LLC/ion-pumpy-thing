#!/usr/bin/env bash
# Copy the 11 production Pages files into dist/, preserving paths.
# Fail if any required file is missing. Do not include tests, docs, or .github.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/dist"

files=(
  404.html
  favicon.ico
  ga4.js
  index.html
  privacy.html
  robots.txt
  site.webmanifest
  sitemap.xml
  assets/apple-touch-icon.png
  assets/favicon-64.png
  assets/og-image.png
  audio.js
  audio-cues.js
)

rm -rf "$dest"
mkdir -p "$dest/assets"

missing=0
for f in "${files[@]}"; do
  if [[ ! -f "$root/$f" ]]; then
    echo "missing required file: $f" >&2
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

for f in "${files[@]}"; do
  mkdir -p "$dest/$(dirname "$f")"
  cp -a "$root/$f" "$dest/$f"
done

# Sound effects referenced by audio-cues.js. Copy only the audio files,
# not licence or source notes kept alongside them.
shopt -s nullglob
audio=("$root"/assets/audio/*.mp3)
if [[ ${#audio[@]} -eq 0 ]]; then
  echo "missing required files: assets/audio/*.mp3" >&2
  exit 1
fi
mkdir -p "$dest/assets/audio"
cp -a "${audio[@]}" "$dest/assets/audio/"
