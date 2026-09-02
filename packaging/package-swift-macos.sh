#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="${1:?usage: package-swift-macos.sh <arm64|x86_64|x64>}"
VERSION="0.3.3"
APP="$ROOT/macos/DerivedData/Build/Products/Release/Echo.app"
OUT="$ROOT/artifacts/desktop"
STAGE="$OUT/Echo"

if [ ! -d "$APP" ]; then
  echo "missing $APP"
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/Echo.app"
cp "$ROOT/packaging/open-echo.command" "$STAGE/Open Echo.command"
chmod +x "$STAGE/Open Echo.command"

LABEL="arm64"
if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "x64" ]; then
  LABEL="x64"
fi

(
  cd "$OUT"
  zip -qry "Echo-${VERSION}-${LABEL}-mac.zip" Echo
)
echo "wrote $OUT/Echo-${VERSION}-${LABEL}-mac.zip"
