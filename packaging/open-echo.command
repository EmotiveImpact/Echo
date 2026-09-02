#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DIR/Echo.app"
if [ ! -d "$APP" ]; then
  echo "Echo.app was not found next to this file."
  exit 1
fi
xattr -cr "$APP" || true
open "$APP"
