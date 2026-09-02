#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP=""
for candidate in "$HOME/Downloads/Echo.app" "$DIR/Echo.app"; do
  if [ -d "$candidate" ]; then
    APP="$candidate"
    break
  fi
done
if [ -z "$APP" ]; then
  echo "Put Echo.app in ~/Downloads, then run this again."
  exit 1
fi
xattr -cr "$APP" || true
open "$APP"
