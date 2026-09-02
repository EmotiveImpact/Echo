#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:?usage: package-macos.sh <aarch64-apple-darwin|x86_64-apple-darwin>}"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT/Cargo.toml" | head -n 1)"
BIN="$ROOT/target/$TARGET/release/echo-desktop"
OUT="$ROOT/artifacts/desktop"
STAGE="$OUT/Echo.app"

if [ ! -x "$BIN" ]; then
  echo "missing $BIN"
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE/Contents/MacOS" "$STAGE/Contents/Resources"
cp "$BIN" "$STAGE/Contents/MacOS/echo-desktop"
chmod +x "$STAGE/Contents/MacOS/echo-desktop"
cp "$ROOT/packaging/Info.plist" "$STAGE/Contents/Info.plist"
cp "$ROOT/packaging/open-echo.command" "$OUT/Open Echo.command"
chmod +x "$OUT/Open Echo.command"

ARCH="arm64"
if [ "$TARGET" = "x86_64-apple-darwin" ]; then
  ARCH="x64"
fi

(
  cd "$OUT"
  zip -qry "Echo-${VERSION}-${ARCH}-mac.zip" Echo.app "Open Echo.command"
)
echo "wrote $OUT/Echo-${VERSION}-${ARCH}-mac.zip"
