#!/usr/bin/env bash
# The release workflow's Tauri CLI on Linux (tauri-action's `tauriScript`): `pnpm tauri <args>`, then, after a
# build, fix-appimage.sh on the AppImage before tauri-action uploads it.
set -euo pipefail
pnpm tauri "$@"
if [ "${1:-}" = build ]; then
  for appimage in src-tauri/target/release/bundle/appimage/*.AppImage; do
    [ -e "$appimage" ] && "$(dirname "$0")/fix-appimage.sh" "$appimage"
  done
fi
