import hashlib,io,json,pathlib,sqlite3,tempfile,threading,unittest,urllib.request,urllib.error
from http.server import ThreadingHTTPServer
from build_index import build
from asset_server import validate_assets,make_handler,parse_range
class TestServer(unittest.TestCase):
    def test_local_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            (root/"nordeste.pmtiles").write_bytes(b"PMTiles"+bytes(100))
            for name in ("nordeste-style.json","archive-report.json","address-report.json","toolchain.txt"):
                (root/name).write_text("{}")
            with sqlite3.connect(root/"address-index.sqlite") as db:
                build(io.BytesIO(b'<osm><node id="1" lat="-9.39" lon="-40.5"><tag k="place" v="city"/><tag k="name" v="Petrolina"/></node></osm>'),db)
            names=sorted(p.name for p in root.iterdir())
            (root/"SHA256SUMS").write_text("".join(hashlib.sha256((root/n).read_bytes()).hexdigest()+"  "+n+"\\n" for n in names).replace("\\n","\n"))
            (root/"COMPLETE").write_text("NE_ASSETS_BUILD_VERIFIED\n")
            manifest=validate_assets(root)
            server=ThreadingHTTPServer(("127.0.0.1",0),make_handler(root,manifest))
            t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
            origin="http://127.0.0.1:"+str(server.server_address[1])
            def request(path,code,headers=None,method="GET"):
                req=urllib.request.Request(origin+path,headers=headers or {},method=method)
                try:r=urllib.request.urlopen(req,timeout=5)
                except urllib.error.HTTPError as e:r=e
                with r:
                    self.assertEqual(r.status,code)
                    return r.read(),r.headers
            try:
                body,headers=request("/v1/nordeste.pmtiles",206,{"Range":"bytes=0-6"})
                self.assertEqual(body,b"PMTiles");self.assertEqual(headers["Content-Range"],"bytes 0-6/107")
                request("/v1/nordeste.pmtiles",200,method="HEAD")
                request("/v1/nordeste.pmtiles",416)
                request("/v1/nordeste.pmtiles",416,{"Range":"bytes=0-6,8-10"})
                request("/v1/nordeste.pmtiles",416,{"Range":"bytes=0-107"})
                request("/v1/nordeste.pmtiles",412,{"Range":"bytes=0-6","If-Match":'"wrong"'})
                body,_=request("/v1/search?q=Petro",200)
                row=json.loads(body)["rows"][0];self.assertEqual(row["label"],"Petrolina");self.assertFalse(row["eligible_for_ride"])
                request("/v1/search?q=x&limit=21",400)
                request("/v1/search?q=Petro&q=Other",400)
                request("/v1/search?q=Petro",405,method="POST")
                request("/other",404)
                self.assertIsNone(parse_range("bytes=0-3000000",4000000))
            finally:
                server.shutdown();server.server_close();t.join(timeout=5)
            (root/"nordeste.pmtiles").write_bytes(b"changed")
            with self.assertRaises(ValueError):validate_assets(root)
if __name__=="__main__":unittest.main()
