#!/usr/bin/env bash
# Rebuild native modules (better-sqlite3, isolated-vm) against Electron's V8 headers.
# isolated-vm has a known .deps directory race condition on macOS, so we build it
# manually with pre-created directories after electron-rebuild handles better-sqlite3.
set -euo pipefail

ELECTRON_VERSION=$(node -e "console.log(require('electron/package.json').version)")
echo "Rebuilding native modules for Electron ${ELECTRON_VERSION}..."

# 1) Rebuild better-sqlite3 via electron-rebuild (no issues)
npx electron-rebuild -o better-sqlite3

# 2) Rebuild isolated-vm manually to work around .deps race condition
IVM_DIR="node_modules/isolated-vm"
if [ -d "$IVM_DIR" ]; then
  echo "Rebuilding isolated-vm..."
  rm -rf "${IVM_DIR}/build"

  # Configure with Electron's node headers
  (cd "$IVM_DIR" && npx node-gyp configure --release \
    --target="${ELECTRON_VERSION}" \
    --arch="$(node -e "console.log(process.arch)")" \
    --dist-url=https://www.electronjs.org/headers)

  # Pre-create .deps directory tree to avoid make race condition
  for dir in \
    nortti/src/external_copy \
    nortti/src/isolate \
    isolated_vm/src/external_copy \
    isolated_vm/src/isolate \
    isolated_vm/src/module \
    isolated_vm/src/lib; do
    mkdir -p "${IVM_DIR}/build/Release/.deps/Release/obj.target/${dir}"
  done

  # Build
  make -C "${IVM_DIR}/build" BUILDTYPE=Release -j"$(sysctl -n hw.ncpu)"
  echo "isolated-vm rebuilt successfully."
else
  echo "isolated-vm not found, skipping."
fi

echo "Native module rebuild complete."
