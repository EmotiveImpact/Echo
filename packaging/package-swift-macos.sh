#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="${1:?usage: package-swift-macos.sh <arm64|x86_64>}"
VERSION="0.3.0"
APP="$ROOT/macos/DerivedData/Build/Products/Release/Echo.app"
OUT="$ROOT/artifacts/desktop"

if [ ! -d "$APP" ]; then
  echo "missing $APP"
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$APP" "$OUT/Echo.app"
# Unsigned CI builds still carry a quarantine-friendly helper.
cp "$ROOT/packaging/open-echo.command" "$OUT/Open Echo.command"
chmod +x "$OUT/Open Echo.command"

LABEL="arm64"
if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "x64" ]; then
  LABEL="x64"
fi

(
  cd "$OUT"
  zip -qry "Echo-${VERSION}-${LABEL}-mac.zip" Echo.app "Open Echo.command"
)
echo "wrote $OUT/Echo-${VERSION}-${LABEL}-mac.zip"
