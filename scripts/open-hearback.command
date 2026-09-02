#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DIR/Hearback.app"
if [[ ! -d "$APP" ]]; then
  echo "Hearback.app was not found next to this script."
  exit 1
fi
xattr -cr "$APP"
open "$APP"
