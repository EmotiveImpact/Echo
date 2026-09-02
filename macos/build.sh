#!/bin/bash
# Build an unsigned Echo.app on a Mac. Not used on Linux.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ARCH="${1:-$(uname -m)}"
if [ "$ARCH" = "aarch64" ]; then ARCH=arm64; fi
if [ "$ARCH" = "x86_64" ]; then ARCH=x86_64; fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "Install XcodeGen: brew install xcodegen"
  exit 1
fi

python3 "$ROOT/scripts/generate-icon.py"
cd "$ROOT"
xcodegen generate
rm -rf "$ROOT/DerivedData"
xcodebuild \
  -project Echo.xcodeproj \
  -scheme Echo \
  -configuration Release \
  -derivedDataPath "$ROOT/DerivedData" \
  ARCHS="$ARCH" \
  ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  DEVELOPMENT_TEAM= \
  MACOSX_DEPLOYMENT_TARGET=14.0

APP="$ROOT/DerivedData/Build/Products/Release/Echo.app"
if [ ! -d "$APP" ]; then
  echo "xcodebuild did not produce Echo.app"
  exit 1
fi
echo "$APP"
