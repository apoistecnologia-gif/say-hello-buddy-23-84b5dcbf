#!/usr/bin/env bash
set -Eeuo pipefail
OUT="$1"
mkdir -p "$OUT"
trap 'echo "NE_CARTOGRAPHY_FAILED_LINE=$LINENO" | tee -a "$OUT/failure.txt" >&2' ERR
test "${GITHUB_ACTIONS:-}" = true
test "${RUNNER_ENVIRONMENT:-}" = github-hosted
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK=$(mktemp -d)
cleanup(){ if [[ "$WORK" == /tmp/tmp.* && -d "$WORK" && ! -L "$WORK" ]]; then rm -rf -- "$WORK"; fi; }
trap cleanup EXIT
cd "$WORK"
df -h . > "$OUT/disk-start.txt"
test "$(df -B1 --output=avail . | tail -1)" -ge 10737418240
curl -fsSL --proto '=https' --proto-redir '=https' --max-time 900 --max-filesize 1073741824 https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf -o nordeste.osm.pbf
printf '%s  %s\n' edd896e13cbafb17b11c589e8d72249e66e7ea6618db4cd54d1a655629decfcf nordeste.osm.pbf | sha256sum -c -
echo NE_CARTOGRAPHY_SOURCE_VERIFIED
# Use the reviewed Planetiler version and checksum from the previous lab.
curl -fsSL --max-time 300 https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar -o planetiler.jar
printf '%s  %s\n' f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d planetiler.jar | sha256sum -c -
cp "$HERE/nordeste.yml" .
/usr/bin/time -v -o "$OUT/build-resources.txt" java -Xmx4g -jar planetiler.jar "$WORK/nordeste.yml" --output="$WORK/nordeste.pmtiles" --bounds=-46.8,-18.6,-34.5,-1.0 --minzoom=6 --maxzoom=15 --threads=2 2>&1 | tee "$OUT/build.log"
python3 "$HERE/verify-nordeste-archive.py" "$WORK/nordeste.pmtiles" "$HERE/nordeste-style.json" | tee "$OUT/archive-report.json"
sha256sum nordeste.pmtiles > "$OUT/archive-sha256.txt"
cp "$HERE/nordeste-style.json" "$OUT/"
echo NE_CARTOGRAPHY_ARCHIVE_STRUCTURE_OK
