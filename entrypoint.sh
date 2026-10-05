#!/bin/sh
# Serve the baked-in data right away and refresh it from the public API in the background.
(
  while true; do
    node src/build.ts || echo "data refresh failed, keeping previous data"
    sleep "$REFRESH_INTERVAL"
  done
) &
exec node src/serve.ts
