"""把 OBJ 的材质按贴图重连一遍，并渲染头部特写，判断这套资产的脸/发够不够细。"""

import math
import os

import bpy
from mathutils import Vector

SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\obj\FW3RWMKGWARHP3DEXWY3XI27O.obj"
TEXDIR = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\obj"
OUT = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\import"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)

# map_Kn 是 OBJ 的非标准扩展，导入器没有接法线；这里按材质名手动补
NORMAL_FOR = {
    "ModelTop1_Material003": "ElsaDress_N.png",
    "ModelCrown1_Material012": "Elsa_CapeO_N.png",
    "ModelCrown2_Material013": "Elsa_CapeO_N.png",
    "ModelHairLong1_Material018": "Elsa_Hair_N.png",
    "ModelHairLong2_Material019": "n_fz202_0d02_N.png",
    "ModelLashes_Material021": "n_fz202_0d05_N.png",
    "ModelShoes_Material022": "n_fz202_0d02_N.png",
    "ModelTeeth_Material023": "Elsa_Mouth_N.png",
    "ModelTongue_Material024": "Elsa_Mouth_N.png",
}
ALPHA_MATS = {"ModelDress1_Material001", "ModelDress2_Material002",
              "ModelTop2_Material004"}

for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        continue
    bsdf.inputs["Roughness"].default_value = 0.42
    bsdf.inputs["Metallic"].default_value = 0.0
    img_node = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
    path = NORMAL_FOR.get(mat.name)
    if path:
        full = os.path.join(TEXDIR, path)
        if os.path.exists(full):
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(full, check_existing=True)
            tex.image.colorspace_settings.name = "Non-Color"
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if mat.name in ALPHA_MATS and img_node:
        # 这几张是「外裙/雪花的遮罩图」：本身没有颜色，只有线稿，
        # 直接当 base color 就是一条纯黑长裙
        bsdf.inputs["Alpha"].default_value = 0.15
        mat.surface_render_method = "BLENDED"

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.view_settings.view_transform = "Standard"
scene.world = bpy.data.worlds.new("W")
if scene.world.node_tree is None:
    scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.70, 0.79, 0.88, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.6

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 85
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

for name, loc, energy, size in (
    ("key", (-2.4, -1.2, 2.0), 500, 1.2),
    ("fill", (1.8, -1.6, 1.4), 200, 1.4),
    ("rim", (0.6, 2.0, 2.2), 400, 1.0),
):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size
    lo = bpy.data.objects.new(name, ld)
    lo.location = loc
    scene.collection.objects.link(lo)
    lo.rotation_euler = (Vector(loc) - Vector((0, 0, 0.9))).to_track_quat("Z", "Y").to_euler()

# 头在 z≈0.9~1.25，脸朝 -X
views = {
    "head_front": ((-0.95, 0, 1.06), (math.pi / 2, 0, -math.pi / 2)),
    "head_q": ((-0.72, -0.55, 1.10), None),
    "face": ((-0.55, 0.02, 1.12), (math.pi / 2, 0, -math.pi / 2)),
}
for name, (loc, rot) in views.items():
    cam.location = loc
    if rot:
        cam.rotation_euler = rot
    else:
        cam.rotation_euler = (Vector(loc) - Vector((0.02, 0, 1.10))).to_track_quat("Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
print("DONE")
