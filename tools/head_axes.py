"""单独渲染 KH3 的头颅，六个轴向各一张，用来确定它的朝向与尺寸。"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3\V8NWJ7X2AH6UB9V3CMOUYFSMQ.obj"
TEX = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3"
OUT = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\axes"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)
src = next(o for o in bpy.context.selected_objects if o.type == "MESH")
print("SRC MATS", [m.name if m else None for m in src.data.materials])

idx = next(i for i, m in enumerate(src.data.materials) if m and m.name.startswith("Modelhead"))
bm = bmesh.new()
bm.from_mesh(src.data)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx], context="FACES")
mesh = bpy.data.meshes.new("head")
bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new("head", mesh)
bpy.context.collection.objects.link(obj)
bpy.data.objects.remove(src, do_unlink=True)

lo = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
hi = [max(v.co[i] for v in mesh.vertices) for i in range(3)]
print("HEAD BBOX", [round(v, 3) for v in lo], [round(v, 3) for v in hi])
print("HEAD SIZE", [round(hi[i] - lo[i], 3) for i in range(3)])
ctr = Vector([(lo[i] + hi[i]) / 2 for i in range(3)])
span = max(hi[i] - lo[i] for i in range(3))

mat = bpy.data.materials.new("skin")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(os.path.join(TEX, "Elsa_Head_D.png"), check_existing=True)
mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.5
mesh.materials.clear()
mesh.materials.append(mat)
for p in mesh.polygons:
    p.use_smooth = True

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 400
scene.render.resolution_y = 400
scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.7, 0.8, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.2

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

ld = bpy.data.lights.new("key", "AREA")
ld.energy = 120
ld.size = 2
lo_obj = bpy.data.objects.new("key", ld)
lo_obj.location = ctr + Vector((0, -3, 1.5))
scene.collection.objects.link(lo_obj)
lo_obj.rotation_euler = (Vector(lo_obj.location) - ctr).to_track_quat("Z", "Y").to_euler()

os.makedirs(OUT, exist_ok=True)
views = {
    "posX": Vector((3, 0, 0)),
    "negX": Vector((-3, 0, 0)),
    "posY": Vector((0, 3, 0)),
    "negY": Vector((0, -3, 0)),
    "posZ": Vector((0, 0, 3)),
    "negZ": Vector((0, 0, -3)),
}
for tag, off in views.items():
    cam.location = ctr + off.normalized() * span * 2.0
    cam.rotation_euler = (cam.location - ctr).to_track_quat("Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, tag + ".png")
    bpy.ops.render.render(write_still=True)
print("DONE")
