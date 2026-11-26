#!/usr/bin/env bash
# Private CI only. Rehearse the real Corridas module build; never package or publish.
set -euo pipefail
REPO="$(realpath "$1")"
CANON="$(realpath "$2")"
LAB="$(cd "$(dirname "$0")" && pwd)"
: "${RUNNER_TEMP:?}"
MODERN=b6b87f02066ef62a8d201ef63a3152bb2364f5cd
CANONICAL=5c0a780b0a4c04573cbe60755877139311af8288
test "$(git -C "$CANON" rev-parse HEAD)" = "$CANONICAL"
BEFORE="$(git -C "$REPO" rev-parse HEAD)"
BEFORE_STATUS="$(git -C "$REPO" status --porcelain)"
CANON_STATUS="$(git -C "$CANON" status --porcelain)"
ROOT="$(mktemp -d "$RUNNER_TEMP/apois-private-superapp-XXXXXXXX")"
WORKSPACE=""
trap 'rm -rf "$ROOT"; if [ -n "$WORKSPACE" ]; then rm -rf "${WORKSPACE%/workspace}"; fi' EXIT
REPORT="$(node "$LAB/prepare-modern-passenger.mjs" "$REPO")"
echo "$REPORT"
WORKSPACE="$(node -e 'const s=process.argv[1]; console.log(JSON.parse(s.slice(s.indexOf("{"))).workspace)' "$REPORT")"
case "$WORKSPACE" in "$RUNNER_TEMP"/apois-modern-passenger-*/workspace) ;; *) exit 2;; esac
node "$LAB/prepare-pilot-map-build.mjs" "$WORKSPACE"
mkdir "$ROOT/canonical"
git -C "$CANON" archive "$CANONICAL" | tar -xf - -C "$ROOT/canonical"
cd "$ROOT/canonical"
mkdir -p sources/apois-corridas-passageiro
git -C "$REPO" archive "$MODERN" | tar -xf - -C sources/apois-corridas-passageiro
find sources/apois-corridas-passageiro -maxdepth 1 -type f -name '.env*' -delete
# Reconcile the exact modern location hook in the disposable adapter only.
node --input-type=module - <<'JS'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
const path='scripts/adapt-module-for-superapp.mjs'
let s=readFileSync(path,'utf8')
for(const [old,next] of [
 ['[checkPermissions, refreshLocation, updateLocationState]', '[checkPermissions, refreshLocation, requestPermission, updateLocationState]'],
 ['[checkPermissions, permissionState, refreshLocation, updateLocationState]', '[checkPermissions, permissionState, refreshLocation, requestPermission, updateLocationState]'],
 ['[destination, orderedStops, origin, route?.decodedPoints, status]', '[compact, destination, emitMapCenter, orderedStops, origin, route?.decodedPoints, selectionMode, status, validDriverLocation]'],
 ['[destination, displayedRoutePoints, orderedStops, origin, route?.decodedPoints, status]', '[compact, destination, displayedRoutePoints, emitMapCenter, orderedStops, origin, route?.decodedPoints, selectionMode, status, validDriverLocation]']
]){
 assert.equal(s.split(old).length,2,'pinned modern adapter anchor')
 s=s.replace(old,()=>next)
}
writeFileSync(path,s)
JS
# Only the disposable manifest and exact adapter anchors are changed; all canonical hardeners and gates run.
node --input-type=module - <<'JS'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
const path='.apois/modules.json',m=JSON.parse(readFileSync(path,'utf8')),c=m.modules.corridas
assert.deepEqual(c.install,['bun','install','--frozen-lockfile'])
assert.equal(c.source,'sources/apois-corridas-passageiro')
assert.equal(c.workspace,'.work/corridas')
assert.equal(c.build[0],'bash');assert.equal(c.build[1],'-c')
const anchor='cd .work/corridas && bun run build:capacitor'
assert.equal(c.build[2].split(anchor).length,2)
c.build[2]=c.build[2].replace(anchor,()=> 'cd .work/corridas && node "$APOIS_PRIVATE_OVERLAY_SCRIPT" "$PWD" "$APOIS_PRIVATE_OVERLAY" && bun add --exact maplibre-gl@4.7.1 pmtiles@3.2.0 && node --test experimental/apois-navigation/ui/pilot-runtime.test.mjs experimental/apois-navigation/ui/verified-host-transport.test.mjs experimental/apois-navigation/ui/approved-map-provider.test.mjs && bun run typecheck && bun run build:capacitor')
writeFileSync(path,JSON.stringify(m,null,2))
JS
export APOIS_PRIVATE_OVERLAY="$WORKSPACE"
export APOIS_PRIVATE_OVERLAY_SCRIPT="$LAB/apply-canonical-passenger-pilot.mjs"
export CORRIDAS_VITE_SUPABASE_URL=https://apois-navigation-lab.invalid
export CORRIDAS_VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_navigation_lab_placeholder_not_a_key
export CORRIDAS_WEB_MAPS_API_KEY=AIzaSyNavigationLabPlaceholderNotAKey
export CORRIDAS_PUBLIC_APP_URL=https://apois-navigation-lab.invalid
export APOIS_SUPERAPP_RIDES_PUSH_ENABLED=0
node scripts/build-isolated-module.mjs corridas
test -s .work/corridas/dist/index.html
grep -Fq 'data-apois-superapp-bridge' .work/corridas/dist/index.html
test ! -e .work/entregas
test "$(git -C "$REPO" rev-parse HEAD)" = "$BEFORE"
test "$(git -C "$REPO" status --porcelain)" = "$BEFORE_STATUS"
test "$(git -C "$CANON" status --porcelain)" = "$CANON_STATUS"
echo APOIS_PRIVATE_CANONICAL_PASSENGER_BUILD_OK
