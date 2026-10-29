"""检查 KH3 版 Elsa（带完整 D/N/S/AO 贴图）在 Blender 里的实际观感。"""

import math
import os

import bpy
from mathutils import Matrix, Vector

SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3\V8NWJ7X2AH6UB9V3CMOUYFSMQ.obj"
TEX = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3"
OUT = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3out"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)

NORMAL = {
    "Modelcapei_Material002": "Elsa_CapeI_N.png",
    "Modelcapeiskin_Material003": "Elsa_CapeI_N.png",
    "Modelcapeo_Material004": "Elsa_CapeO_N.png",
    "Modeldress_Material005": "Elsa_Dress_N.png",
    "Modelhair_Material007": "Elsa_Hair_N.png",
    "Modelhead_Material008": "Elsa_Head_N.png",
    "Modelmouth_Material009": "Elsa_Mouth_N.png",
    "Modeleyelashes_Material010": "Elsa_Eyelashes_N.png",
    "Modelhairend_Material011": "Elsa_Hair_N.png",
    "Modelcapeoblueenv_Material012": "Elsa_CapeO_N.png",
}

for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        continue
    bsdf.inputs["Roughness"].default_value = 0.45
    path = NORMAL.get(mat.name)
    if path and os.path.exists(os.path.join(TEX, path)):
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(os.path.join(TEX, path), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.7
        nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.context.view_layer.update()
lo = [1e9] * 3
hi = [-1e9] * 3
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        for i in range(3):
            lo[i] = min(lo[i], w[i])
            hi[i] = max(hi[i], w[i])
print("BBOX", [round(v, 3) for v in lo], [round(v, 3) for v in hi])
print("SIZE", [round(hi[i] - lo[i], 3) for i in range(3)])
for o in meshes:
    print("OBJ", o.name, len(o.data.polygons),
          [m.name for m in o.data.materials])

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("W")
if scene.world.node_tree is None:
    scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.70, 0.79, 0.88, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 60
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

for name, loc, energy, size in (
    ("key", (-2.6, -1.6, 2.4), 800, 1.2),
    ("fill", (2.0, -2.0, 1.4), 320, 1.6),
    ("rim", (0.8, 2.4, 2.6), 600, 1.0),
):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size
    lo_obj = bpy.data.objects.new(name, ld)
    lo_obj.location = loc
    scene.collection.objects.link(lo_obj)
    lo_obj.rotation_euler = (Vector(loc) - Vector((0, 0, 1.0))).to_track_quat("Z", "Y").to_euler()

os.makedirs(OUT, exist_ok=True)
cz = (lo[2] + hi[2]) / 2
height = hi[2] - lo[2]
scene.render.resolution_x = 620
scene.render.resolution_y = 940
for tag, loc in (("front", (0, -height * 2.4, cz)),
                 ("back", (0, height * 2.4, cz)),
                 ("left", (-height * 2.4, 0, cz)),
                 ("right", (height * 2.4, 0, cz)),
                 ("q", (-height * 1.5, -height * 1.9, cz))):
    cam.location = loc
    cam.rotation_euler = (Vector(loc) - Vector((0, 0, cz))).to_track_quat("Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, tag + ".png")
    bpy.ops.render.render(write_still=True)

hz = lo[2] + height * 0.90
scene.render.resolution_x = 720
scene.render.resolution_y = 720
for tag, loc in (("face_f", (-0.62, 0, hz)),
                 ("face_q", (-0.45, -0.42, hz + 0.03)),
                 ("face_side", (0, -0.62, hz))):
    cam.location = loc
    cam.rotation_euler = (Vector(loc) - Vector((0, 0, hz))).to_track_quat("Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, tag + ".png")
    bpy.ops.render.render(write_still=True)
print("DONE")
