#!/usr/bin/env bash
set -Eeuo pipefail
OUT="$1"
mkdir -p "$OUT"
trap 'echo "NE_ADDRESS_FAILED_LINE=$LINENO" | tee -a "$OUT/failure.txt" >&2' ERR
test "${GITHUB_ACTIONS:-}" = true
test "${RUNNER_ENVIRONMENT:-}" = github-hosted
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK=$(mktemp -d)
cleanup(){ if [[ "$WORK" == /tmp/tmp.* && -d "$WORK" && ! -L "$WORK" ]]; then rm -rf -- "$WORK"; fi; }
trap cleanup EXIT
cd "$WORK"
df -h . > "$OUT/disk-start.txt"
test "$(df -B1 --output=avail . | tail -1)" -ge 5368709120
osmium --version > "$OUT/osmium-version.txt"
curl -fsSL --proto '=https' --proto-redir '=https' --max-time 900 --max-filesize 1073741824 https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf -o nordeste.osm.pbf
printf '%s  %s\n' edd896e13cbafb17b11c589e8d72249e66e7ea6618db4cd54d1a655629decfcf nordeste.osm.pbf | sha256sum -c -
osmium tags-filter -R nordeste.osm.pbf n/addr:housenumber n/place -o nodes.osm.pbf
osmium cat nodes.osm.pbf -f osm -o nodes.osm
/usr/bin/time -v -o "$OUT/build-resources.txt" python3 "$HERE/build_index.py" nodes.osm address-index.sqlite "$OUT/report.json"
sha256sum address-index.sqlite > "$OUT/index-sha256.txt"
