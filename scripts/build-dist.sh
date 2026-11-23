#!/usr/bin/env bash
# Copy the production Pages files into dist/, preserving paths: the 18 listed
# below, then the globbed sound effects, three.js addons and props.
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
  view3d.js
  view3d-shapes.js
  vendor/three/three.module.js
  vendor/three/three.core.js
  vendor/three/LICENSE
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

# Globbed, so a new sound, addon or prop cannot be left out. Each glob must
# match something. Copy only these files, not licence or source notes kept
# alongside them.
shopt -s nullglob globstar
copy_glob() {
  local glob="$1" src rel
  local matches=("$root"/$glob)
  if [[ ${#matches[@]} -eq 0 ]]; then
    echo "missing required files: $glob" >&2
    exit 1
  fi
  for src in "${matches[@]}"; do
    rel="${src#"$root"/}"
    mkdir -p "$dest/$(dirname "$rel")"
    cp -a "$src" "$dest/$rel"
  done
}
# Sound effects referenced by audio-cues.js.
copy_glob 'assets/audio/*.mp3'
# The three.js addons view3d.js imports through the import map.
copy_glob 'vendor/three/addons/**/*.js'
# The props view3d.js loads; index.html passes their paths to IonView3D.start.
copy_glob 'assets/*.glb'
