#!/usr/bin/env bash
set -Eeuo pipefail
# Ephemeral hosted runner only. No OpenShift credentials or existing PVC.
OUT="$1"
mkdir -p "$OUT"
trap 'echo "BENCHMARK_FAILED_LINE=$LINENO" | tee -a "$OUT/failure.txt" >&2' ERR
test "${GITHUB_ACTIONS:-}" = true
test "${RUNNER_ENVIRONMENT:-}" = github-hosted
WORK=$(mktemp -d)
NAME="apois-nordeste-graph-$$"
IMAGE='ghcr.io/valhalla/valhalla-scripted@sha256:71e4d1cbc96126e59d9a603da6290ccfc14e289deb2b4bd6eaca82a7655615e8'
URL='https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf'
cleanup(){
  rc=$?
  trap - EXIT
  docker logs --tail 200 "$NAME" > "$OUT/valhalla.log" 2>&1 || true
  docker inspect --format '{{json .State}}' "$NAME" > "$OUT/container-state.json" 2>/dev/null || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  df -h "$WORK" > "$OUT/disk-final.txt" || true
  if [[ "$WORK" == /tmp/tmp.* && -d "$WORK" && ! -L "$WORK" ]]; then sudo rm -rf -- "$WORK"; else echo "UNEXPECTED_TEMP_PATH: no deletion performed" >&2; fi
  exit "$rc"
}
trap cleanup EXIT
df -h "$WORK" > "$OUT/disk-start.txt"
free -m > "$OUT/memory-start.txt"
# Bounded CI attempt; insufficient resources are a failed gate, not a partial pass.
test "$(df -B1 --output=avail "$WORK" | tail -1)" -ge 10737418240
test "$(awk '/MemAvailable:/{print $2}' /proc/meminfo)" -ge 6291456
mkdir "$WORK/custom"
curl -fsSL --max-time 60 "$URL.md5" -o "$WORK/before.md5"
curl -fsSL --retry 1 --connect-timeout 20 --max-time 600 --max-filesize 1073741824 -D "$OUT/source-headers.txt" "$URL" -o "$WORK/custom/nordeste.osm.pbf"
curl -fsSL --max-time 60 "$URL.md5" -o "$WORK/after.md5"
cmp "$WORK/before.md5" "$WORK/after.md5"
expected=$(awk 'NR==1{print $1}' "$WORK/before.md5")
[[ "$expected" =~ ^[a-f0-9]{32}$ ]]
actual=$(md5sum "$WORK/custom/nordeste.osm.pbf" | awk '{print $1}')
test "$actual" = "$expected"
sha=$(sha256sum "$WORK/custom/nordeste.osm.pbf" | awk '{print $1}')
printf '%s\n' "$sha" > "$OUT/source.sha256"
printf '%s\n' "$expected" > "$OUT/source.md5"
stat -c '%s' "$WORK/custom/nordeste.osm.pbf" > "$OUT/source-bytes.txt"
printf '%s\n' "$IMAGE" > "$OUT/image.txt"
date -u +%FT%TZ > "$OUT/downloaded-at.txt"
echo "APOIS_NE_SOURCE_VERIFIED SHA256=$sha"
chmod 777 "$WORK/custom" # ephemeral hosted runner, no shared volumes.
docker pull "$IMAGE"
start=$(date +%s)
docker run -d --name "$NAME" --memory=5g --memory-swap=5g --cpus=2 \
  -p 127.0.0.1:18002:8002 -v "$WORK/custom:/custom_files" \
  -e server_threads=2 -e build_admins=False -e build_time_zones=False \
  -e build_elevation=False -e build_transit=False -e use_default_speeds_config=False "$IMAGE"
ready=0
for i in $(seq 1 420); do
  if curl -fsS --max-time 2 http://127.0.0.1:18002/status > "$OUT/status.json"; then ready=1; break; fi
  test "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true
  test "$(df -B1 --output=avail "$WORK" | tail -1)" -ge 1073741824
  if (( i % 20 == 0 )); then echo "NE_GRAPH_BUILD_POLL=$i"; docker stats --no-stream --format '{{json .}}' "$NAME" >> "$OUT/resource-samples.jsonl"; fi
  sleep 5
done
test "$ready" = 1
echo "$(( $(date +%s) - start ))" > "$OUT/build-seconds.txt"
du -sb "$WORK/custom" > "$OUT/storage-bytes.txt"
python3 - "$OUT" <<'PY'
import json, sys, time, urllib.request
from pathlib import Path
out=Path(sys.argv[1])
# Public city-center test coordinates, not customer locations. Distances only
# bounded broadly to catch missing graph, implausible paths and unit errors.
cities={
 "Petrolina_PE":(-9.3891,-40.5031),
 "Juazeiro_BA":(-9.4167,-40.5033),
 "Picos_PI":(-7.0769,-41.4667),
 "Teresina_PI":(-5.0892,-42.8019),
 "Fortaleza_CE":(-3.7319,-38.5267),
 "Salvador_BA":(-12.9714,-38.5014),
 "Sao_Luis_MA":(-2.5307,-44.3068),
 "Joao_Pessoa_PB":(-7.1195,-34.8450),
 "Natal_RN":(-5.7945,-35.2110),
 "Maceio_AL":(-9.6658,-35.7353),
 "Aracaju_SE":(-10.9472,-37.0731),
}
bounds={
 "Juazeiro_BA":(1,30),"Picos_PI":(200,600),"Teresina_PI":(400,1200),
 "Fortaleza_CE":(500,1500),"Salvador_BA":(350,1000),"Sao_Luis_MA":(700,1900),
 "Joao_Pessoa_PB":(550,1600),"Natal_RN":(550,1700),"Maceio_AL":(450,1300),"Aracaju_SE":(350,1100)}
results=[]
for name,(lo,hi) in bounds.items():
    points=[cities["Petrolina_PE"],cities[name]]
    body={"locations":[{"lat":lat,"lon":lon} for lat,lon in points],"costing":"auto","units":"kilometers"}
    start=time.monotonic()
    row={"origin":"Petrolina_PE","destination":name}
    try:
        req=urllib.request.Request("http://127.0.0.1:18002/route",data=json.dumps(body).encode(),headers={"Content-Type":"application/json"})
        with urllib.request.urlopen(req,timeout=90) as r: trip=json.load(r)["trip"]
        summary=trip["summary"]
        distance=summary["length"]
        seconds=summary["time"]
        assert lo<=distance<=hi and 0<seconds<86400*3
        assert trip["status"]==0 and trip["units"]=="kilometers" and len(trip["legs"])==1
        assert isinstance(trip["legs"][0]["shape"],str) and len(trip["legs"][0]["shape"])>30
        row.update(ok=True,distance_km=distance,duration_seconds=seconds)
    except Exception as exc:
        row.update(ok=False,error=type(exc).__name__)
    row["latency_ms"]=round((time.monotonic()-start)*1000)
    results.append(row)
    print(json.dumps(row),flush=True)
    (out/"routes.json").write_text(json.dumps(results,indent=2)+"\n")
assert all(r["ok"] for r in results), "interstate route gate failed"
PY
docker stats --no-stream --format '{{json .}}' "$NAME" >> "$OUT/resource-samples.jsonl"
test "$(docker inspect -f '{{.State.Running}} {{.State.OOMKilled}}' "$NAME")" = 'true false'
echo APOIS_NE_RAW_GRAPH_BENCHMARK_OK
