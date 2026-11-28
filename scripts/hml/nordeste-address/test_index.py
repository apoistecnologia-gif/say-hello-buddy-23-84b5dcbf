import io,sqlite3,unittest
from build_index import build,query
class Tests(unittest.TestCase):
    def test_index(self):
        src=io.BytesIO(b"""<osm version="0.6"><node id="1" lat="-9.39" lon="-40.5"><tag k="addr:street" v="Rua S&#227;o Jos&#233;"/><tag k="addr:housenumber" v="12"/><tag k="addr:city" v="Petrolina"/></node><node id="2" lat="-7.08" lon="-41.46"><tag k="place" v="town"/><tag k="name" v="Picos"/></node><node id="3" lat="0" lon="0"><tag k="place" v="city"/><tag k="name" v="Outside"/></node></osm>""")
        with sqlite3.connect(":memory:") as db:
            self.assertEqual(build(src,db),2)
            self.assertEqual(query(db,"rua sao jose 12")[0][0],1)
            self.assertEqual(query(db,"Pico")[0][0],2)
            self.assertEqual(query(db,"Outside"),[])
            self.assertEqual(query(db,""),[])
            self.assertEqual(query(db,"a"*121),[])
            self.assertEqual(query(db,"*"),[])
            query(db,'x" OR * --')
if __name__=="__main__":unittest.main()
