"""Candidate local-only read server. Not a public or authenticated endpoint."""
import hashlib, json, os, pathlib, re, sqlite3, threading, unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs,urlsplit
from build_index import query

ROOT=pathlib.Path(os.environ.get("APOIS_ASSET_ROOT","/assets/nordeste-v1"))
HASH="edd896e13cbafb17b11c589e8d72249e66e7ea6618db4cd54d1a655629decfcf"
MAX_RANGE=2*1024*1024
MAX_SEARCH=20
SLOTS=threading.BoundedSemaphore(4)

def validate_assets(root):
    if (root/"COMPLETE").read_text().strip()!="NE_ASSETS_BUILD_VERIFIED":raise ValueError("candidate incomplete")
    manifest={}
    for line in (root/"SHA256SUMS").read_text().splitlines():
        m=re.fullmatch(r"([a-f0-9]{64})  ([a-zA-Z0-9._-]+)",line)
        if not m or m[2] in manifest:raise ValueError("invalid manifest")
        manifest[m[2]]=m[1]
    expected={"nordeste.pmtiles","address-index.sqlite","nordeste-style.json","archive-report.json","address-report.json","toolchain.txt"}
    if set(manifest)!=expected:raise ValueError("unexpected assets")
    for file,digest in manifest.items():
        p=root/file
        if p.is_symlink() or not p.is_file():raise ValueError("unexpected file")
        with p.open("rb") as f:
            if hashlib.file_digest(f,"sha256").hexdigest()!=digest:raise ValueError("digest mismatch")
    return manifest

def parse_range(value,size):
    if not isinstance(value,str) or len(value)>60:return None
    m=re.fullmatch(r"bytes=([0-9]{1,12})-([0-9]{1,12})",value)
    if not m:return None
    start,end=map(int,m.groups())
    if start>end or start>=size or end>=size or end-start+1>MAX_RANGE:return None
    return start,end

def connect(root):
    # Path is server-configured, not selected by the request.
    return sqlite3.connect((root/"address-index.sqlite").resolve().as_uri()+"?mode=ro&immutable=1",uri=True)

def make_handler(root,manifest):
    path=root/"nordeste.pmtiles"
    size=path.stat().st_size
    etag='"'+manifest["nordeste.pmtiles"]+'"'
    class Handler(BaseHTTPRequestHandler):
        protocol_version="HTTP/1.0"
        def log_message(self,*args):pass # never log address queries or request metadata
        def json_response(self,status,obj,head=False):
            data=json.dumps(obj,ensure_ascii=False,separators=(",",":")).encode()
            self.send_response(status)
            self.send_header("Content-Type","application/json; charset=utf-8")
            self.send_header("Cache-Control","no-store")
            self.send_header("Content-Length",str(len(data)))
            self.end_headers()
            if not head:self.wfile.write(data)
        def handle_one_request(self):
            self.connection.settimeout(10)
            if not SLOTS.acquire(blocking=False):return
            try:super().handle_one_request()
            finally:SLOTS.release()
        def do_POST(self):self.json_response(405,{"error":"method_not_allowed"})
        def do_HEAD(self):self.dispatch(True)
        def do_GET(self):self.dispatch(False)
        def dispatch(self,head):
            if len(self.path)>1024:
                return self.json_response(414,{"error":"invalid_request"},head)
            u=urlsplit(self.path)
            if u.scheme or u.netloc or u.fragment:
                return self.json_response(400,{"error":"invalid_request"},head)
            if u.path=="/healthz" and not u.query:
                return self.json_response(200,{"ok":True,"candidate":True,"source_sha256":HASH},head)
            if u.path=="/v1/nordeste.pmtiles" and not u.query:
                ranges=self.headers.get_all("Range") or []
                if head and not ranges:
                    self.send_response(200);self.send_header("Content-Length",str(size));self.send_header("Accept-Ranges","bytes");self.send_header("ETag",etag);self.send_header("Content-Type","application/octet-stream");self.send_header("Cache-Control","no-store");self.end_headers();return
                if len(ranges)!=1:
                    return self.json_response(416,{"error":"single_explicit_range_required"},head)
                span=parse_range(ranges[0],size)
                if not span:
                    self.send_response(416);self.send_header("Content-Range",f"bytes */{size}");self.send_header("Content-Length","0");self.end_headers();return
                match=self.headers.get_all("If-Match") or []
                if match and match!=[etag]:
                    return self.json_response(412,{"error":"asset_version_changed"},head)
                start,end=span;length=end-start+1
                self.send_response(206);self.send_header("Content-Type","application/octet-stream")
                self.send_header("Content-Length",str(length));self.send_header("Content-Range",f"bytes {start}-{end}/{size}")
                self.send_header("Accept-Ranges","bytes");self.send_header("ETag",etag);self.send_header("Cache-Control","no-store");self.end_headers()
                if not head:
                    with path.open("rb") as f:
                        f.seek(start);remaining=length
                        while remaining:
                            data=f.read(min(65536,remaining))
                            if not data:raise IOError("unexpected EOF")
                            self.wfile.write(data);remaining-=len(data)
                return
            if u.path=="/v1/search" and not head:
                try:
                    params=parse_qs(u.query,strict_parsing=True,max_num_fields=2,keep_blank_values=True)
                    if set(params)-{"q","limit"} or len(params.get("q",[]))!=1 or len(params.get("limit",["20"]))!=1:raise ValueError()
                    q=params["q"][0]; lim=int(params.get("limit",["20"])[0])
                    if not 2<=len(q.strip())<=120 or not 1<=lim<=MAX_SEARCH or any(unicodedata.category(c).startswith("C") for c in q):raise ValueError()
                except (ValueError,UnicodeError):
                    return self.json_response(400,{"error":"invalid_query"})
                with connect(root) as db:
                    db.set_progress_handler(lambda: 0,10000)
                    import time
                    deadline=time.monotonic()+1.5
                    db.set_progress_handler(lambda: int(time.monotonic()>deadline),10000)
                    try:rows=query(db,q,lim)
                    except sqlite3.Error:return self.json_response(503,{"error":"search_unavailable"})
                data=[{"osm_node_id":str(i),"kind":kind,"label":label,"city":city or None,"neighborhood":neighborhood or None,"lat":lat,"lng":lon,"eligible_for_ride":False} for i,kind,label,city,neighborhood,lat,lon in rows]
                return self.json_response(200,{"source":"OSM_PBF","extract_sha256":HASH,"candidate":True,"rows":data})
            return self.json_response(404,{"error":"not_found"},head)
    return Handler

if __name__=="__main__":
    manifest=validate_assets(ROOT)
    # Deliberately loopback only until a separately reviewed authentication gateway exists.
    server=ThreadingHTTPServer(("127.0.0.1",18085),make_handler(ROOT,manifest))
    server.daemon_threads=True
    print("NE_ASSETS_LOOPBACK_READY",flush=True)
    server.serve_forever()
