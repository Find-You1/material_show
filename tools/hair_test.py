"""测试 KH3 自带的头发网格（带发丝贴图）能不能直接当基础发型用。"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3\V8NWJ7X2AH6UB9V3CMOUYFSMQ.obj"
TEX = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3"
OUT = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\hairtest"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)
src = next(o for o in bpy.context.selected_objects if o.type == "MESH")
mats = [m.name if m else "" for m in src.data.materials]


def strip_alpha(mat):
    """黑底/白底的线稿贴图没有 alpha 通道，用亮度反推。"""
    nt = mat.node_tree
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if not tex:
        return
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(tex.outputs["Color"], bw.inputs["Color"])
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(bw.outputs["Val"], inv.inputs[1])
    nt.links.new(inv.outputs["Value"], bsdf.inputs["Alpha"])
    mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = False


def make(name, image, normal=None, rough=0.5, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(TEX, image), check_existing=True)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if normal:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(TEX, normal), check_existing=True)
        t.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if alpha:
        strip_alpha(mat)
    return mat


HEAD = make("head", "Elsa_Head_D.png", "Elsa_Head_N.png", 0.52)
HAIR = make("hair", "Elsa_Hair_D.png", "Elsa_Hair_N.png", 0.5, alpha=True)
LASH = make("lash", "Elsa_Eyelashes_D.png", "Elsa_Eyelashes_N.png", 0.45, alpha=True)
LASH.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.06, 0.04, 0.035, 1)

parts = {}
for name, mat_prefix, mat in (
    ("head", "Modelhead", HEAD),
    ("hair", "Modelhair", HAIR),
    ("hairend", "Modelhairend", HAIR),
    ("eye", "Modeleye_M", make("eye", "Elsa_Eye_D.png", None, 0.12)),
    ("lash", "Modeleyelashes", LASH),
    ("mouth", "Modelmouth", make("mouth", "Elsa_Mouth_D.png", None, 0.4)),
):
    idx = next((i for i, n in enumerate(mats) if n.startswith(mat_prefix)), None)
    if idx is None:
        continue
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx],
                     context="FACES")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.clear()
    mesh.materials.append(mat)
    for p in mesh.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    parts[name] = ob

bpy.data.objects.remove(src, do_unlink=True)

ROT = Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X")
s = 1.30
for ob in parts.values():
    ob.data.transform(ROT)
    ob.data.transform(Matrix.Scale(s, 4))

# 把头的中心挪到原点，相机好摆
h = parts["head"]
hlo = [min(v.co[i] for v in h.data.vertices) for i in range(3)]
hhi = [max(v.co[i] for v in h.data.vertices) for i in range(3)]
off = Vector((-(hlo[0] + hhi[0]) / 2, -(hlo[1] + hhi[1]) / 2, -(hlo[2] + hhi[2]) / 2))
for ob in parts.values():
    ob.data.transform(Matrix.Translation(off))
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    print(ob.name, [round(v, 3) for v in lo], [round(v, 3) for v in hi])

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 640
scene.render.resolution_y = 780
scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.22, 0.27, 0.34, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 62
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
ctr = Vector((0.0, 0.0, -0.05))
for name, off, eng, size in (("key", (-1.6, -1.6, 1.4), 420, 0.9),
                             ("fill", (1.5, -1.2, 0.2), 150, 1.2),
                             ("rim", (0.4, 1.8, 1.6), 380, 0.8)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = eng
    ld.size = size
    o = bpy.data.objects.new(name, ld)
    o.location = off
    bpy.context.collection.objects.link(o)
    o.rotation_euler = (Vector(off) - ctr).to_track_quat("Z", "Y").to_euler()

os.makedirs(OUT, exist_ok=True)
for tag, off in (("front", Vector((0, -1.5, 0.0))),
                 ("q", Vector((-0.85, -1.25, 0.12))),
                 ("side", Vector((-1.5, 0, 0.0))),
                 ("back", Vector((0, 1.5, 0.0)))):
    cam.location = ctr + off
    cam.rotation_euler = (cam.location - ctr).to_track_quat("Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, tag + ".png")
    bpy.ops.render.render(write_still=True)
print("DONE")
