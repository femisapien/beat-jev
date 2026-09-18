import bpy
from mathutils import Quaternion, Vector
from math import pi
from pathlib import Path
ART=Path.cwd()/'work/art-tools'
bpy.ops.wm.open_mainfile(filepath=str(ART/'athlete.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
def rotate(name,x=0,y=0,z=0):
 b=rig.pose.bones[name]
 q=Quaternion((1,0,0),x) @ Quaternion((0,1,0),y) @ Quaternion((0,0,1),z)
 b.rotation_mode='QUATERNION'
 rest=b.bone.matrix_local.to_quaternion()
 b.rotation_quaternion=rest.inverted() @ q @ rest
for side in ['l','r']:
 rotate('thigh_'+side,-1.35)
 rotate('calf_'+side,1.35)
 rotate('upperarm_'+side,-.2,.55 if side=='l' else -.55,0)
 rotate('lowerarm_'+side,.35,0,0)
rig.location.z=-.40
bpy.context.view_layer.update()
keep=[]
colors={'Athlete':(.48,.3,.20,1),'Jersey':(.7,.7,.7,1),'Shorts':(.06,.07,.09,1),'Socks':(.08,.09,.1,1),'Boots':(.03,.03,.035,1),'Hair':(.025,.02,.02,1)}
for obj in list(bpy.data.objects):
 if obj.type!='MESH' or obj.name not in colors: continue
 bpy.context.view_layer.objects.active=obj
 for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
 # Remove the clothing masks' hidden surfaces; reduce only this distant silhouette.
 dec=obj.modifiers.new('Crowd LOD','DECIMATE'); dec.ratio=.025 if obj.name=='Athlete' else .075
 bpy.ops.object.modifier_apply(modifier=dec.name)
 mat=bpy.data.materials.new('crowd-'+('shirt' if obj.name=='Jersey' else obj.name.lower()));mat.use_nodes=True
 p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=colors[obj.name];p.inputs['Roughness'].default_value=1
 obj.data.materials.clear();obj.data.materials.append(mat)
 for face in obj.data.polygons: face.material_index=0
 # Evaluate the entire hierarchy to world coordinates, then remove the rig.
 transform=obj.matrix_world.copy();obj.parent=None;obj.matrix_world.identity();obj.data.transform(transform)
 keep.append(obj)
for obj in list(bpy.data.objects):
 if obj not in keep: bpy.data.objects.remove(obj,do_unlink=True)
print('CROWD',[(o.name,len(o.data.polygons)) for o in keep])
bpy.ops.export_scene.gltf(filepath=str(Path.cwd()/'frontend/public/models/spectator.glb'),export_format='GLB',export_animations=False,export_morph=False)
