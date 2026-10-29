"""把下载到的 OBJ 模型导进 Blender，检查尺度/朝向/材质，并渲染一张正面图。

这只是一次性的检查脚本，用来判断外部模型能不能直接替代手工程序化建模。
"""

import math
import os

import bpy

SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\obj\FW3RWMKGWARHP3DEXWY3XI27O.obj"
OUT = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\import"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)

objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
lo = [1e9] * 3
hi = [-1e9] * 3
tris = 0
for o in objs:
    tris += len(o.data.polygons)
    for c in o.bound_box:
        w = o.matrix_world @ __import__("mathutils").Vector(c)
        for i in range(3):
            lo[i] = min(lo[i], w[i])
            hi[i] = max(hi[i], w[i])

print("MESHES", len(objs), "FACES", tris)
print("BBOX", [round(v, 4) for v in lo], [round(v, 4) for v in hi])
print("SIZE", [round(hi[i] - lo[i], 4) for i in range(3)])
for o in objs[:40]:
    mats = [m.name if m else None for m in o.data.materials]
    print("OBJ", o.name, len(o.data.polygons), mats)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 700
scene.render.resolution_y = 1000
scene.view_settings.view_transform = "Standard"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.72, 0.80, 0.88, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.55

cz = (lo[2] + hi[2]) / 2
size = max(hi[2] - lo[2], 1e-3)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
dist = size * 1.55
cam.location = (0, -dist, cz)
cam.rotation_euler = (math.pi / 2, 0, 0)
scene.camera = cam

for name, loc, energy, radius in (
    ("key", (-size * 0.8, -size * 1.0, cz + size * 0.55), 900, 0.8),
    ("fill", (size * 1.0, -size * 0.8, cz + size * 0.2), 320, 1.2),
    ("rim", (size * 0.3, size * 0.9, cz + size * 0.7), 700, 0.8),
):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = radius
    lo_obj = bpy.data.objects.new(name, ld)
    lo_obj.location = loc
    scene.collection.objects.link(lo_obj)
    d = __import__("mathutils").Vector(loc) - __import__("mathutils").Vector((0, 0, cz))
    lo_obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()

os.makedirs(OUT, exist_ok=True)
views = {
    "neg_y": ((0, -dist, cz), (math.pi / 2, 0, 0)),
    "pos_y": ((0, dist, cz), (math.pi / 2, 0, math.pi)),
    "pos_x": ((dist, 0, cz), (math.pi / 2, 0, math.pi / 2)),
    "neg_x": ((-dist, 0, cz), (math.pi / 2, 0, -math.pi / 2)),
}
for name, (loc, rot) in views.items():
    cam.location = loc
    cam.rotation_euler = rot
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)

print("DONE")
