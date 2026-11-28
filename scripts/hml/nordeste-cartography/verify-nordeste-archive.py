import gzip, json, pathlib, struct, sys
archive=pathlib.Path(sys.argv[1])
style=json.loads(pathlib.Path(sys.argv[2]).read_text())
size=archive.stat().st_size
with archive.open('rb') as f:
 h=f.read(127)
 assert len(h)==127 and h[:7]==b'PMTiles' and h[7]==3
 root_off,root_len,meta_off,meta_len,leaf_off,leaf_len,tile_off,tile_len,addressed,entries,contents=struct.unpack_from('<11Q',h,8)
 assert root_len>0 and 0<meta_len<=1048576 and tile_len>0 and contents>0 and addressed>=entries>=contents
 for off,length in [(root_off,root_len),(meta_off,meta_len),(leaf_off,leaf_len),(tile_off,tile_len)]:
  assert off>=127 and off+length<=size
 assert h[99]==1 and h[100]==6 and h[101]==15
 f.seek(meta_off); raw=f.read(meta_len)
 if h[97]==2: raw=gzip.decompress(raw)
 else: assert h[97]==1
 meta=json.loads(raw)
layers={x['id'] for x in meta['vector_layers']}
required={x['source-layer'] for x in style['layers'] if 'source-layer' in x}
assert required<=layers
assert 'OpenStreetMap' in json.dumps(meta,ensure_ascii=False)
assert style['sources']['regional']['url']=='pmtiles://https://maps.example.invalid/nordeste.pmtiles'
print(json.dumps({'archive_bytes':size,'addressed_tiles':addressed,'tile_entries':entries,'unique_contents':contents,'minzoom':h[100],'maxzoom':h[101],'layers':sorted(layers),'limits':'Structural verification only. No native rendering, glyph delivery, map authorization or real address search.'},indent=2))
