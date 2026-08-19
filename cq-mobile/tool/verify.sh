#!/usr/bin/env bash
# The gate that actually runs today: analyze + test, exactly what CI would do
# minus the build (which needs a device toolchain and several minutes).
#
# Usage:  bash tool/verify.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> flutter pub get"
flutter pub get >/dev/null

echo "==> flutter analyze lib test"
flutter analyze lib test

echo "==> flutter test"
flutter test

echo
echo "OK — analyzer clean and all tests passing."
