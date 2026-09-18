"""Prepare the CC0 Quaternius base mesh for the game. No raster edits.
Usage: python3 scripts/prepare-character.py path/to/unzipped/pack
"""
import json, struct, pathlib, sys, copy
root = pathlib.Path(sys.argv[1])
source = next(root.rglob('Superhero_Male_FullBody.gltf'))
d = json.loads(source.read_text())
blob = bytearray(source.with_suffix('.bin').read_bytes())

def append(data):
    while len(blob) % 4: blob.append(0)
    offset = len(blob); blob.extend(data)
    d['bufferViews'].append(dict(buffer=0, byteOffset=offset, byteLength=len(data)))
    return len(d['bufferViews'])-1

def values(accessor):
    a=d['accessors'][accessor]; v=d['bufferViews'][a['bufferView']]
    components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    fmt={5123:'H',5125:'I',5126:'f'}[a['componentType']]
    return list(struct.iter_unpack('<'+fmt*components, blob[v.get('byteOffset',0)+a.get('byteOffset',0):v.get('byteOffset',0)+a.get('byteOffset',0)+a['count']*components*struct.calcsize(fmt)]))

# Reuse the original skinned topology. Materials form a jersey, shorts, socks and boots.
body=d['meshes'][2]; prim=body['primitives'][0]; positions=values(prim['attributes']['POSITION']); indices=[i[0] for i in values(prim['indices'])]
for name, color in [('jersey',[.92,.94,.88,1]),('shorts',[.035,.09,.07,1]),('socks',[.92,.94,.88,1]),('boots',[.025,.035,.03,1])]:
    d['materials'].append(dict(name=name,pbrMetallicRoughness=dict(baseColorFactor=color,metallicFactor=0,roughnessFactor=.85)))
groups={i:[] for i in range(2,7)}
for i in range(0,len(indices),3):
    tri=indices[i:i+3]; x,y,z=[sum(positions[j][k] for j in tri)/3 for k in range(3)]
    material=2
    if y<.105: material=6
    elif y<.45: material=5
    elif .66<y<1.015: material=4
    elif 1.015<=y<1.50 and abs(x)<.48: material=3
    groups[material].extend(tri)
body['primitives']=[]
for mat, ix in groups.items():
    p=copy.deepcopy(prim); p['attributes']={k:v for k,v in p['attributes'].items() if not k.startswith('COLOR')};p['material']=mat
    view=append(struct.pack('<'+'H'*len(ix),*ix));d['accessors'].append(dict(bufferView=view,componentType=5123,count=len(ix),type='SCALAR'))
    p['indices']=len(d['accessors'])-1;body['primitives'].append(p)
# Only keep textures used on the skin and eyes. The hair uses a matte material.
for m in d['materials']:
    m.pop('normalTexture',None);m.pop('occlusionTexture',None);m.pop('extensions',None)
    m['pbrMetallicRoughness'].pop('metallicRoughnessTexture',None)
    m['pbrMetallicRoughness']['roughnessFactor']=.78
m=d['materials'][0]['pbrMetallicRoughness'];m.pop('baseColorTexture',None);m['baseColorFactor']=[.026,.018,.014,1]
old_images=d['images'];old_textures=d['textures'];d['images']=[];d['textures']=[]
for m in d['materials']:
    t=m['pbrMetallicRoughness'].get('baseColorTexture')
    if t:
        old=old_images[old_textures[t['index']]['source']]; data=(source.parent/old['uri']).read_bytes()
        d['images'].append(dict(bufferView=append(data),mimeType='image/png'))
        d['textures'].append(dict(source=len(d['images'])-1));t['index']=len(d['textures'])-1
# Add cropped hair geometry to the same skeleton, weighted to the head.
hair=next(p for p in root.rglob('Hair_Buzzed.gltf') if 'Origin at 0' in str(p)); h=json.loads(hair.read_text());hb=hair.with_suffix('.bin').read_bytes()
aoffset=len(d['accessors']);voffset=len(d['bufferViews']);bloboffset=len(blob)
while bloboffset%4:blob.append(0);bloboffset+=1
blob.extend(hb)
for v in h['bufferViews']:d['bufferViews'].append({**v,'buffer':0,'byteOffset':v.get('byteOffset',0)+bloboffset})
for a in h['accessors']:d['accessors'].append({**a,'bufferView':a['bufferView']+voffset})
hp=h['meshes'][0]['primitives'][0];attrs={k:v+aoffset for k,v in hp['attributes'].items() if k in ['POSITION','NORMAL','TEXCOORD_0']}
count=h['accessors'][hp['attributes']['POSITION']]['count'];skin_id=next(n['skin'] for n in d['nodes'] if n.get('name')=='SuperHero_Male');head_id=next(i for i,n in enumerate(d['nodes']) if n.get('name')=='Head');joint=d['skins'][skin_id]['joints'].index(head_id)
for attr,data,ctype in [('JOINTS_0',struct.pack('<'+'H'*count*4,*([joint,0,0,0]*count)),5123),('WEIGHTS_0',struct.pack('<'+'f'*count*4,*([1,0,0,0]*count)),5126)]:
    view=append(data);d['accessors'].append(dict(bufferView=view,componentType=ctype,count=count,type='VEC4'));attrs[attr]=len(d['accessors'])-1
d['meshes'].append(dict(name='Cropped hair',primitives=[dict(attributes=attrs,indices=hp['indices']+aoffset,material=0)]))
d['nodes'].append(dict(name='Hair',mesh=len(d['meshes'])-1,skin=skin_id));d['scenes'][0]['nodes'].append(len(d['nodes'])-1)
while len(blob)%4:blob.append(0)
d['buffers']=[dict(byteLength=len(blob))];d['asset']['copyright']='CC0, Quaternius. Football materials and packaging by Beat Jev.'
j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
out=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
pathlib.Path('frontend/public/models/footballer.glb').write_bytes(out)
print('Character prepared:',len(out),'bytes')
