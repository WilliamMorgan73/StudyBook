#!/usr/bin/env bash
# Removes the Wayland client libraries that Tauri's AppImage bundles from the build machine (Ubuntu 22.04).
# On newer distros (Arch/CachyOS, Fedora...) they clash with the system's Mesa, and WebKit dies at startup
# with "Could not create default EGL display: EGL_BAD_PARAMETER". Every desktop that runs GTK apps has its
# own libwayland (GTK links it), so the system's copies are used instead.
#
#   scripts/fix-appimage.sh path/to/StudyBook.AppImage   # rewrites it in place
set -euo pipefail

appimage=$(realpath "$1")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"

# Neither step needs FUSE: the AppImage and appimagetool both unpack themselves.
"$appimage" --appimage-extract > /dev/null
removed=$(find squashfs-root -name 'libwayland-*.so*' -print -delete)
if [ -z "$removed" ]; then
  echo "fix-appimage: no bundled libwayland in $(basename "$appimage"); left as is"
  exit 0
fi
echo "fix-appimage: removed" $removed

curl -fsSL -o appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
chmod +x appimagetool
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 ./appimagetool --no-appstream squashfs-root fixed.AppImage
mv fixed.AppImage "$appimage"
chmod +x "$appimage"
echo "fix-appimage: rewrote $appimage"
