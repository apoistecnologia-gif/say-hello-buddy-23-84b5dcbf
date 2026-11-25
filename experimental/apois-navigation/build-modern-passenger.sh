#!/usr/bin/env bash
# Only a disposable private source build. No APK, deployment, live credentials or service calls.
set -euo pipefail
REPO="$(realpath "$1")"
LAB="$(cd "$(dirname "$0")" && pwd)"
: "${RUNNER_TEMP:?RUNNER_TEMP must be set}"
test -d "$RUNNER_TEMP"
BEFORE="$(git -C "$REPO" rev-parse HEAD)"
BEFORE_STATUS="$(git -C "$REPO" status --porcelain)"
REPORT="$(node "$LAB/prepare-modern-passenger.mjs" "$REPO")"
echo "$REPORT"
WORKSPACE="$(node -e 'const s=process.argv[1]; console.log(JSON.parse(s.slice(s.indexOf("{"))).workspace)' "$REPORT")"
test "$WORKSPACE" != "$REPO"
case "$WORKSPACE" in "$RUNNER_TEMP"/apois-modern-passenger-*/workspace) ;; *) exit 2;; esac
trap 'rm -rf "${WORKSPACE%/workspace}"' EXIT
node "$LAB/prepare-pilot-map-build.mjs" "$WORKSPACE" "${APOIS_LAB_PACK_DIR:-}"
cd "$WORKSPACE"
# Inherit no existing application's live environment values. Build only.
export VITE_SUPABASE_URL=https://apois-navigation-lab.invalid
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_navigation_lab_placeholder_not_a_key
export VITE_GOOGLE_MAPS_API_KEY=AIzaSyNavigationLabPlaceholderNotAKey
export VITE_APOIS_SUPERAPP_RIDES_PUSH_ENABLED=0
export VITE_PUBLIC_APP_URL=https://apois-navigation-lab.invalid
# Strip dotenv files from the disposable workspace so a committed environment
# cannot override the explicit synthetic build. Do not inspect or print values.
find . -maxdepth 1 -type f -name '.env*' -delete
bun install --frozen-lockfile
bun add --exact maplibre-gl@4.7.1 pmtiles@3.2.0
node --test experimental/apois-navigation/ui/pilot-runtime.test.mjs experimental/apois-navigation/ui/verified-host-transport.test.mjs experimental/apois-navigation/ui/approved-map-provider.test.mjs
bun run typecheck
bun run build:capacitor
test -s dist/index.html
test -z "$(find . -name '*.apk' -o -name '*.aab' | head -n1)"
test "$(git -C "$REPO" rev-parse HEAD)" = "$BEFORE"
test "$(git -C "$REPO" status --porcelain)" = "$BEFORE_STATUS"
echo APOIS_PRIVATE_MODERN_PASSENGER_BUILD_OK
