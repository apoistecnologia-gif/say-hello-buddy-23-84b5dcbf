#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
test "$(id -u)" != 0
test -r /source/candidate/source.osm.pbf
test -d /assets && test -w /assets
test "$(stat -c '%s' /source/candidate/source.osm.pbf)" = 446192268
printf '%s  %s\n' edd896e13cbafb17b11c589e8d72249e66e7ea6618db4cd54d1a655629decfcf /source/candidate/source.osm.pbf | sha256sum -c -
printf '%s  %s\n' f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d /opt/apois/planetiler.jar | sha256sum -c -
test "$(df -B1 --output=avail /assets | tail -1)" -ge 6442450944
# Never overwrite or resume an ambiguous candidate.
mkdir /assets/nordeste-v1
cd /assets/nordeste-v1
trap 'echo "NE_ASSETS_FAILED_LINE=$LINENO" >&2' ERR
ln -s /source/candidate/source.osm.pbf nordeste.osm.pbf
cp /opt/apois/nordeste.yml /opt/apois/nordeste-style.json .
dpkg-query -W openjdk-21-jre-headless osmium-tool python3 > toolchain.txt
java -version
osmium --version
echo NE_ASSET_SOURCE_VERIFIED
/usr/bin/time -v -o cartography-resources.txt java -Xmx4g -jar /opt/apois/planetiler.jar "$PWD/nordeste.yml" --output="$PWD/nordeste.pmtiles" --bounds=-46.8,-18.6,-34.5,-1.0 --minzoom=6 --maxzoom=15 --threads=2
python3 /opt/apois/verify-nordeste-archive.py nordeste.pmtiles nordeste-style.json | tee archive-report.json
osmium tags-filter -R nordeste.osm.pbf n/addr:housenumber n/place -o nodes.osm.pbf
osmium cat nodes.osm.pbf -f osm -o nodes.osm
/usr/bin/time -v -o address-resources.txt python3 /opt/apois/build_index.py nodes.osm address-index.sqlite address-report.json
python3 - <<'PY'
import json
from pathlib import Path
a=json.loads(Path('archive-report.json').read_text())
q=json.loads(Path('address-report.json').read_text())
assert a['addressed_tiles'] == 1067664
assert a['minzoom']==6 and a['maxzoom']==15
assert q['counts']=={'address':303625,'place':52988}
assert q['addresses_with_explicit_city']==214790
assert len(q['city_checks'])==11 and all(x['place_found_near_reference'] for x in q['city_checks'])
assert q['address_query_hits']==20
print('NE_ASSET_REFERENCE_COUNTS_MATCH')
PY
# Only known temporary files created by this job; do not touch source PVC.
rm -- nordeste.osm.pbf nodes.osm.pbf nodes.osm
sha256sum nordeste.pmtiles address-index.sqlite nordeste-style.json archive-report.json address-report.json toolchain.txt > SHA256SUMS
sha256sum -c SHA256SUMS
printf '%s\n' NE_ASSETS_BUILD_VERIFIED > COMPLETE
du -sh .
cat COMPLETE
