#!/bin/bash
set -euo pipefail
DIST="$1"
INDEX="$DIST/index.html"
if [ ! -f "$INDEX" ]; then
  echo "Missing $INDEX"
  exit 1
fi
ts=$(date -u +%Y%m%d%H%M%S)
js="$(ls "$DIST"/assets/index-*.js | head -n 1 || true)"
if [ -n "${js:-}" ]; then
  jsname="$(basename "$js")"
  orig="<script type=\"module\" crossorigin src=\"/assets/${jsname}\"></script>"
  new="<script type=\"module\" crossorigin src=\"/assets/${jsname}?v=${ts}\"></script>"
  tmp="$INDEX.__bust"
  awk -v orig="$orig" -v new="$new" '{
    line=$0
    sub(orig,new,line)
    print line
  }' "$INDEX" > "$tmp" && mv "$tmp" "$INDEX"
fi

reportjs="$(ls "$DIST"/assets/Reports-*.js | head -n 1 || true)"
if [ -n "${reportjs:-}" ]; then
  rname="$(basename "$reportjs")"
  perl -i -pe "s|(src=\"/assets/${rname}\")|\1?v=${ts}|" "$INDEX" || true
fi

echo "Cache busted at ${ts}"
