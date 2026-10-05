#!/usr/bin/env bash
# Regenerates the README screenshots (docs/screenshots/*.png) from a seeded demo: a 2nd-year CS semester with
# "today" frozen at Thu 19 Nov 2026 10:30. Everything runs on a throwaway data folder, never your own data.
#
#   scripts/screenshots/run.sh                 # all of them
#   scripts/screenshots/run.sh notes module    # just these (names as in shots.py)
#
# Needs uv and pnpm. PORT (default 8800) and CHROMIUM (default /usr/bin/chromium) can be overridden.
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
here=$repo/scripts/screenshots
port=${PORT:-8800}
work=$(mktemp -d)
server=""
cleanup() {
  [ -n "$server" ] && kill "$server" 2>/dev/null && wait "$server" 2>/dev/null
  rm -rf "$work"
}
trap cleanup EXIT

echo "Building the frontend..."
(cd "$repo/frontend" && pnpm -s build)
uv run -q --no-project --with reportlab python "$here/brief.py" "$work/cw2-brief.pdf"

echo "Starting the demo server on :$port (data in $work)..."
(cd "$work" && PYTHONPATH="$repo/backend" exec uv run -q --project "$repo/backend" --with time-machine \
  python "$here/serve.py" --port "$port" --data-dir "$work/data" --frontend-dist "$repo/frontend/dist") \
  > "$work/server.log" 2>&1 &
server=$!
for _ in $(seq 120); do
  curl -sf "http://127.0.0.1:$port/api/health" > /dev/null && break
  kill -0 "$server" 2>/dev/null || { cat "$work/server.log"; exit 1; }
  sleep 0.5
done

echo "Seeding..."
uv run -q --no-project --with httpx python "$here/seed.py" "http://127.0.0.1:$port/api" "$work/cw2-brief.pdf"
(cd "$work" && DATABASE_URL="sqlite:///$work/data/studybook.db" UPLOAD_DIR="$work/data/uploads" BACKUP_DIR="$work/data/backups" \
  PYTHONPATH="$repo/backend" uv run -q --project "$repo/backend" python "$here/fixup.py")

echo "Capturing..."
PORT=$port uv run -q --no-project --with playwright --with httpx python "$here/shots.py" "$repo/docs/screenshots" "$@"
echo "Done: $repo/docs/screenshots"
