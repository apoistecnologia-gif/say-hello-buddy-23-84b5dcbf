"""Offline OSM address-node and place-node index candidate. Never an active ride catalog."""
import argparse, json, math, pathlib, re, sqlite3, unicodedata, xml.etree.ElementTree as ET

MAX_POINTS=2_000_000
BBOX=(-46.8,-18.6,-34.5,-1.0)
def clean(value):
    text=" ".join(unicodedata.normalize("NFC", value or "").split())
    if len(text)>120 or any(unicodedata.category(c).startswith("C") for c in text):
        return ""
    return text
def normalize(value):
    return "".join(c for c in unicodedata.normalize("NFD",value.casefold()) if not unicodedata.combining(c))
def parse_node(node):
    tags={t.get("k"):t.get("v") for t in node.findall("tag")}
    street=clean(tags.get("addr:street")) or clean(tags.get("addr:place"))
    number=clean(tags.get("addr:housenumber"))
    city=clean(tags.get("addr:city"))
    neighborhood=clean(tags.get("addr:suburb")) or clean(tags.get("addr:neighbourhood"))
    name=clean(tags.get("name"))
    place=clean(tags.get("place"))
    if street and number:
        label=f"{street}, {number}"
        kind="address"
    elif place in {"city","town","village","hamlet","suburb","neighbourhood"} and name:
        label=name
        kind="place"
        street=number=""
    else:
        return None
    if len(label)>160:return None
    try:
        osm_id=int(node.get("id","")); lat=float(node.get("lat","")); lon=float(node.get("lon",""))
    except ValueError:
        return None
    if osm_id<=0 or not math.isfinite(lat) or not math.isfinite(lon) or not (BBOX[0]<=lon<=BBOX[2] and BBOX[1]<=lat<=BBOX[3]):
        return None
    return (osm_id,kind,label,street,number,city,neighborhood,lat,lon)
def build(source,db):
    db.executescript("""
    PRAGMA journal_mode=DELETE;
    PRAGMA synchronous=FULL;
    PRAGMA temp_store=FILE;
    CREATE TABLE point(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('address','place')),
      label TEXT NOT NULL,street TEXT NOT NULL,house_number TEXT NOT NULL,city TEXT NOT NULL,
      neighborhood TEXT NOT NULL,lat REAL NOT NULL,lon REAL NOT NULL);
    CREATE VIRTUAL TABLE search USING fts5(label,city,neighborhood,content='point',content_rowid='id',tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE provenance(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    """)
    count=0; batch=[]
    events=ET.iterparse(source,events=("start","end")); event,root=next(events)
    assert event=="start" and root.tag=="osm"
    for event,node in events:
        if event!="end" or node.tag!="node":continue
        row=parse_node(node)
        if row:
            count+=1
            if count>MAX_POINTS:raise ValueError("candidate index capacity exceeded")
            batch.append(row)
            if len(batch)>=1000:
                db.executemany("INSERT INTO point VALUES(?,?,?,?,?,?,?,?,?)",batch);batch.clear()
        root.clear()
    db.executemany("INSERT INTO point VALUES(?,?,?,?,?,?,?,?,?)",batch)
    db.execute("INSERT INTO search(search) VALUES('rebuild')")
    db.executemany("INSERT INTO provenance VALUES(?,?)",[("source","OSM_PBF"),("extract_sha256","edd896e13cbafb17b11c589e8d72249e66e7ea6618db4cd54d1a655629decfcf"),("license","ODbL-1.0"),("attribution","© OpenStreetMap contributors"),("status","candidate_not_authorized")])
    db.commit()
    assert db.execute("PRAGMA integrity_check").fetchone()==("ok",)
    db.execute("INSERT INTO search(search,rank) VALUES('integrity-check',1)")
    db.commit()
    return count
def query(db,text,limit=20):
    if not isinstance(text,str) or len(text)>120 or not isinstance(limit,int) or not 1<=limit<=100:return []
    words=re.findall(r"[^\W_]+",normalize(text),flags=re.UNICODE)
    if not 1<=len(words)<=12:return []
    # Only quoted literal tokens/prefixes. User text never supplies FTS syntax.
    expression=" AND ".join('"'+w+'"' + ("*" if i==len(words)-1 else "") for i,w in enumerate(words))
    return db.execute("SELECT p.id,p.kind,p.label,p.city,p.neighborhood,p.lat,p.lon FROM search s JOIN point p ON p.id=s.rowid WHERE search MATCH ? ORDER BY bm25(search),p.id LIMIT ?",(expression,limit)).fetchall()
def smoke(db):
    cities={"Petrolina":(-9.3891,-40.5031),"Juazeiro":(-9.4167,-40.5033),"Picos":(-7.0769,-41.4667),"Teresina":(-5.0892,-42.8019),"Fortaleza":(-3.7319,-38.5267),"Salvador":(-12.9714,-38.5014),"São Luís":(-2.5307,-44.3068),"João Pessoa":(-7.1195,-34.845),"Natal":(-5.7945,-35.211),"Maceió":(-9.6658,-35.7353),"Aracaju":(-10.9472,-37.0731)}
    checks=[]
    for name,(lat,lon) in cities.items():
        # Search specifically for place nodes: address homonyms must not hide cities.
        expression=" AND ".join('"'+w+'"' for w in re.findall(r"[^\W_]+",normalize(name)))
        rows=db.execute("SELECT p.label,p.lat,p.lon FROM search s JOIN point p ON p.id=s.rowid WHERE search MATCH ? AND p.kind='place' LIMIT 1000",(expression,)).fetchall()
        matched=any(normalize(label)==normalize(name) and abs(y-lat)<.30 and abs(x-lon)<.30 for label,y,x in rows)
        checks.append({"city":name,"place_found_near_reference":matched})
    counts=dict(db.execute("SELECT kind,count(*) FROM point GROUP BY kind").fetchall())
    samples=db.execute("SELECT label FROM point WHERE kind='address' AND length(label)<=100 ORDER BY id LIMIT 20").fetchall()
    address_hits=sum(bool(query(db,label)) for (label,) in samples)
    assert not query(db,"") and not query(db,"a"*121) and not query(db,"*")
    query(db,'x" OR * NEAR (a b) --')
    result={"counts":counts,"city_checks":checks,"address_query_samples":len(samples),"address_query_hits":address_hits,"addresses_with_explicit_city":db.execute("SELECT count(*) FROM point WHERE kind='address' AND city<>''").fetchone()[0],"limits":"OSM nodes only; no ways, address interpolation, reverse geocoding, administrative assignment, validated pickup zones or activation."}
    print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
    return result
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("xml",type=pathlib.Path);p.add_argument("index",type=pathlib.Path);p.add_argument("report",type=pathlib.Path);a=p.parse_args()
    if a.index.exists():raise FileExistsError(a.index)
    with sqlite3.connect(a.index) as db:
        n=build(a.xml,db); report=smoke(db); assert sum(report["counts"].values())==n
    report["index_bytes"]=a.index.stat().st_size
    a.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    assert report["counts"].get("address",0)>0 and report["counts"].get("place",0)>0 and report["address_query_hits"]==20 and all(x["place_found_near_reference"] for x in report["city_checks"]), "search candidate did not satisfy all city and address smoke checks"
    print("NE_ADDRESS_NODE_INDEX_SMOKE_OK")
