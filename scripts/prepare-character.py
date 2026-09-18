"""Optional art build. See docs/art-assets.md; not needed to run or deploy."""
from pathlib import Path
import sys, bpy
ROOT = Path.cwd()
ART = ROOT / 'work/art-tools'
sys.path.insert(0, str(ART / 'mpfb-source'))
bpy.utils.extension_path_user = lambda *a, **kw: str(ART / 'mpfb-user')
import mpfb
bpy.context.preferences.addons.new().module = 'mpfb'
mpfb.register()
mpfb.set_preference('mpfb_user_data', str(ART / 'mpfb-user'))
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1., age=.5, muscle=.72, weight=.48, height=.55, proportions=.6)
macro['race'] = {'asian': .15, 'caucasian': .6, 'african': .25}
body = HumanService.create_human(macro_detail_dict=macro)
body.name = 'Athlete'
rig = HumanService.add_builtin_rig(body, 'game_engine')
assets = ART / 'assets'
HumanService.set_character_skin(str(assets/'skins/young_caucasian_male/young_caucasian_male.mhmat'), body, skin_type='MAKESKIN')
for asset, kind, name in [
 ('eyes/low-poly/low-poly.mhclo', 'Eyes', 'Eyes'),
 ('eyebrows/eyebrow001/eyebrow001.mhclo', 'Eyebrows', 'Brows'),
 ('hair/short01/short01.mhclo','Hair','Hair'),
 ('clothes/toigo_basic_tucked_t-shirt/toigo_basic_tucked_t-shirt.mhclo','Clothes','Jersey'),
 ('clothes/elvs_male_swim_shorts1/elvs_male_swim_shorts1.mhclo','Clothes','Shorts'),
 ('clothes/joepal_crude_high_socks/joepal_crude_high_socks.mhclo','Clothes','Socks'),
 ('clothes/shoes06/shoes06.mhclo','Clothes','Boots'),
 ('clothes/toigo_gloves_short/toigo_gloves_short.mhclo','Clothes','Gloves'),
]:
 print('ASSET', asset, flush=True)
 obj = HumanService.add_mhclo_asset(str(assets/asset), body, asset_type=kind, subdiv_levels=0)
 obj.name = name
 if name in ['Jersey','Shorts','Socks','Boots','Gloves']:
  mat = bpy.data.materials.new(name.lower()); mat.use_nodes=True
  principled=mat.node_tree.nodes.get('Principled BSDF')
  principled.inputs['Base Color'].default_value=(.8,.8,.8,1)
  principled.inputs['Roughness'].default_value=.8
  obj.data.materials.clear(); obj.data.materials.append(mat)
# Use glTF-native PBR materials with one shared skin texture.
def textured(obj, image_path, name, cutout=False):
 mat=bpy.data.materials.new(name); mat.use_nodes=True
 p=mat.node_tree.nodes.get('Principled BSDF'); p.inputs['Roughness'].default_value=.72
 image=mat.node_tree.nodes.new('ShaderNodeTexImage'); image.image=bpy.data.images.load(str(image_path),check_existing=True)
 mat.node_tree.links.new(image.outputs['Color'],p.inputs['Base Color'])
 if cutout:
  mat.node_tree.links.new(image.outputs['Alpha'],p.inputs['Alpha'])
  mat.surface_render_method='DITHERED'
 obj.data.materials.clear(); obj.data.materials.append(mat)
 for face in obj.data.polygons: face.material_index=0
textured(body, assets/'skins/young_caucasian_male/young_lightskinned_male_diffuse.png', 'skin')
textured(bpy.data.objects['Hair'], assets/'hair/short01/short01_diffuse.png', 'hair', True)
textured(bpy.data.objects['Brows'], assets/'eyebrows/eyebrow001/eyebrow001.png', 'brows', True)
textured(bpy.data.objects['Eyes'], assets/'eyes/materials/brown_eye.png', 'eyes')
# Keep fingers on the body so removing gloves for the kicker leaves hands.
for mod in list(body.modifiers):
 if 'toigo_gloves' in mod.name: body.modifiers.remove(mod)
# Bake generated body shape keys, keep armature skinning; apply hide masks.
for obj in list(bpy.data.objects):
 if obj.type != 'MESH': continue
 bpy.context.view_layer.objects.active=obj
 obj.select_set(True)
 if obj.data.shape_keys:
  bpy.ops.object.shape_key_add(from_mix=True)
  for kb in list(obj.data.shape_keys.key_blocks)[:-1]: obj.shape_key_remove(kb)
  obj.shape_key_clear()
 for mod in list(obj.modifiers):
  if mod.type != 'ARMATURE':
   try: bpy.ops.object.modifier_apply(modifier=mod.name)
   except Exception as e: print('MODIFIER',obj.name,mod.name,e)
 for p in obj.data.polygons: p.use_smooth=True
 obj.select_set(False)
# Remove the sock section bundled in the trainers, which overlaps the kit socks.
import bmesh
boots=bpy.data.objects['Boots']
bm=bmesh.new(); bm.from_mesh(boots.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > .13], context='VERTS')
bm.to_mesh(boots.data); bm.free()
socks=bpy.data.objects['Socks']
bm=bmesh.new(); bm.from_mesh(socks.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < .115], context='VERTS')
bm.to_mesh(socks.data); bm.free()
# The shirt tucks into the waistband instead of exposing a gap.
shirt=bpy.data.objects['Jersey']
lowest=min(v.co.z for v in shirt.data.vertices)
for v in shirt.data.vertices:
 if v.co.z < lowest+.035: v.co.z -= .025
# Separate cuff material for the runtime kit colors.
trim=bpy.data.materials.new('trim');trim.use_nodes=True
trim.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.02,.04,.03,1)
shirt.data.materials.append(trim)
for p in shirt.data.polygons:
 c=p.center
 if (abs(c.x)>.29 and c.z>1.25) : p.material_index=1
for obj in list(bpy.data.objects):
 if obj.type!='MESH': continue
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
print('MESHES', [(o.name, len(o.data.vertices)) for o in bpy.data.objects if o.type=='MESH'])
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'athlete.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'frontend/public/models/athlete.glb'), export_format='GLB', export_animations=False, export_morph=False, export_yup=True)
