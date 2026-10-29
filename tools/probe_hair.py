"""实验：把 KH3 自带的头发网格套到同一个头颅上，并对比「用贴图五官」的效果。

输出两张图：
  khair_front.png  头 + KH3 头发（保留头顶、去掉高髻）
  khair_head.png   同上的特写
  kface.png        只用头贴图、不叠加几何眼睛的面部特写
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

TMP = r"C:\Users\Lenovo\AppData\Local\Temp\elsa"
SRC = os.path.join(TMP, r"kh3\V8NWJ7X2AH6UB9V3CMOUYFSMQ.obj")
TEX = os.path.join(TMP, "kh3")

bpy.ops.wm.read_factory_settings(use_empty=True)
coll = bpy.context.collection
bpy.ops.wm.obj_import(filepath=SRC)
src = next(o for o in bpy.context.selected_objects if o.type == "MESH")


def part(prefix, name):
    idx = next((i for i, m in enumerate(src.data.materials)
                if m and m.name.startswith(prefix)), None)
    if idx is None:
        print("no material", prefix)
        return None
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx],
                     context="FACES")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.validate()
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    return obj


head = part("Modelhead", "head")
hair = part("Modelhair", "hair")
hend = part("Modelhairend", "hairend")

# 与 elsa_build.py 完全一致的朝向修正
ROT = Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X")
head.data.transform(ROT)
lo = [min(v.co[i] for v in head.data.vertices) for i in range(3)]
hi = [max(v.co[i] for v in head.data.vertices) for i in range(3)]
HEAD_H = hi[2] - lo[2]
SC = 0.408 / HEAD_H
FIT = (Matrix.Translation((-0.5 * (lo[0] + hi[0]) * SC,
                          -0.170 - lo[1] * SC,
                          -0.150 - lo[2] * SC)) @ Matrix.Scale(SC, 4))
print(f"HEAD RAW [{lo[0]:.3f}, {lo[1]:.3f}, {lo[2]:.3f}] "
      f"[{hi[0]:.3f}, {hi[1]:.3f}, {hi[2]:.3f}] scale {SC:.4f}")

for obj in (head, hair, hend):
    if obj is None:
        continue
    obj.data.transform(ROT)
    obj.data.transform(FIT)

bpy.data.objects.remove(src, do_unlink=True)

if hair is not None:
    pts = [v.co for v in hair.data.vertices]
    print("HAIR bbox x[%.3f,%.3f] y[%.3f,%.3f] z[%.3f,%.3f]" % (
        min(p.x for p in pts), max(p.x for p in pts),
        min(p.y for p in pts), max(p.y for p in pts),
        min(p.z for p in pts), max(p.z for p in pts)))
    # 沿 z 切：看每一层的截面积，判断高髻从哪里开始
    for zc in (0.30, 0.26, 0.22, 0.18, 0.14, 0.10, 0.06, 0.02, -0.02, -0.06):
        sl = [p for p in pts if abs(p.z - zc) < 0.012]
        if not sl:
            continue
        print(f"  z={zc:+.2f} n={len(sl):4d} "
              f"x[{min(p.x for p in sl):+.3f},{max(p.x for p in sl):+.3f}] "
              f"y[{min(p.y for p in sl):+.3f},{max(p.y for p in sl):+.3f}]")

# 材质
def texmat(name, image, normal=None, alpha_from=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.45
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(os.path.join(TEX, image), check_existing=True)
    nt.links.new(n.outputs["Color"], b.inputs["Base Color"])
    if normal:
        nn = nt.nodes.new("ShaderNodeTexImage")
        nn.image = bpy.data.images.load(os.path.join(TEX, normal), check_existing=True)
        nn.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(nn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return mat


head.data.materials.clear()
head.data.materials.append(texmat("HSkin", "Elsa_Head_D.png", "Elsa_Head_N.png"))
for o, img in ((hair, "Elsa_Hair_D.png"), (hend, "Elsa_Hair_D.png")):
    if o is None:
        continue
    o.data.materials.clear()
    o.data.materials.append(texmat(o.name + "M", img, "Elsa_Hair_N.png"))
    for p in o.data.polygons:
        p.use_smooth = True

# 切掉高髻：z 上方的连体部分（先看切层数据再定阈值）
CUT = 0.255
for o in (hair, hend):
    if o is None:
        continue
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > CUT], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()

# 灯 + 相机
W = bpy.data.worlds.new("W")
bpy.context.scene.world = W
W.use_nodes = True
W.node_tree.nodes["Background"].inputs[0].default_value = (0.045, 0.055, 0.07, 1)
W.node_tree.nodes["Background"].inputs[1].default_value = 1.0


def light(name, loc, energy, size=0.6):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = energy
    d.size = size
    o = bpy.data.objects.new(name, d)
    o.location = loc
    coll.objects.link(o)
    t = o.constraints.new("TRACK_TO")
    t.target = head
    t.track_axis = "TRACK_NEGATIVE_Z"
    t.up_axis = "UP_Y"
    return o


light("key", (-0.9, -1.4, 0.9), 160)
light("fill", (1.3, -1.0, 0.2), 60)
light("rim", (0.4, 1.4, 0.7), 110)

cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 85
cam = bpy.data.objects.new("cam", cam_d)
coll.objects.link(cam)
bpy.context.scene.camera = cam

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = 40
sc.cycles.use_denoising = True
sc.render.resolution_x = 640
sc.render.resolution_y = 640
sc.render.film_transparent = False
sc.view_settings.view_transform = "Standard"

for name, loc, target in (("khair_front", (0.0, -1.02, 0.10), (0, 0, 0.10)),
                          ("khair_q", (0.62, -0.80, 0.16), (0, 0, 0.10))):
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = d.to_track_quat("-Z", "Y")
    sc.render.filepath = os.path.join(TMP, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("saved", name)
