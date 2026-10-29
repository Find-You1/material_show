"""把 KH3 头贴图在脸正面的五官位置量出来（重心插值 UV + 亮度 ASCII 图）。

输出：眼睛/眉毛/嘴在「头局部坐标」里的中心与尺寸，供 elsa_build.py 精确落位。
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix

SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3\V8NWJ7X2AH6UB9V3CMOUYFSMQ.obj"
TEX = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)
src = next(o for o in bpy.context.selected_objects if o.type == "MESH")

idx = next(i for i, m in enumerate(src.data.materials) if m and m.name.startswith("Modelhead"))
bm = bmesh.new()
bm.from_mesh(src.data)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx], context="FACES")
me = bpy.data.meshes.new("head")
bm.to_mesh(me)
bm.free()
me.validate()
obj = bpy.data.objects.new("head", me)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.update()

ROT = Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X")
me.transform(ROT)
lo = [min(v.co[i] for v in me.vertices) for i in range(3)]
hi = [max(v.co[i] for v in me.vertices) for i in range(3)]
scale = 0.408 / (hi[2] - lo[2])
FIT = (Matrix.Translation((-0.5 * (lo[0] + hi[0]) * scale,
                          -0.170 - lo[1] * scale,
                          -0.150 - lo[2] * scale)) @ Matrix.Scale(scale, 4))
me.transform(FIT)
bpy.context.view_layer.update()

img = bpy.data.images.load(os.path.join(TEX, "Elsa_Head_D.png"), check_existing=True)
W, H = img.size
px = list(img.pixels[:])
uvl = me.uv_layers.active.data
print(f"TEX {W}x{H} verts {len(me.vertices)} polys {len(me.polygons)}")


def uv_at(fidx, loc):
    poly = me.polygons[fidx]
    lis = list(poly.loop_indices)
    if len(lis) < 3:
        return None
    a = me.vertices[me.loops[lis[0]].vertex_index].co
    b = me.vertices[me.loops[lis[1]].vertex_index].co
    c = me.vertices[me.loops[lis[2]].vertex_index].co
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11 = v0.dot(v0), v0.dot(v1), v1.dot(v1)
    d20, d21 = v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-12:
        return None
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    u = 1.0 - v - w
    uvs = [uvl[li].uv for li in lis]
    out = [0.0, 0.0]
    for k, wt in ((0, u), (1, v), (2, w)):
        out[0] += uvs[k][0] * wt
        out[1] += uvs[k][1] * wt
    return out


def lum_at(x, z):
    hit, loc, nor, fidx = obj.ray_cast((x, -0.6, z), (0, 1, 0))
    if not hit:
        return None, None
    uv = uv_at(fidx, loc)
    if uv is None:
        return None, loc
    iu = min(W - 1, max(0, int(uv[0] * W)))
    iv = min(H - 1, max(0, int((1.0 - uv[1]) * H)))
    k = (iv * W + iu) * 4
    r, g, b = px[k], px[k + 1], px[k + 2]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b, loc


NX, NZ = 60, 40
X0, X1 = -0.115, 0.115
Z0, Z1 = -0.145, 0.150
dark, mid = [], []
for iz in range(NZ):
    z = Z1 - (Z1 - Z0) * iz / (NZ - 1)
    line = []
    for ix in range(NX):
        x = X0 + (X1 - X0) * ix / (NX - 1)
        lum, loc = lum_at(x, z)
        if lum is None:
            line.append(" ")
            continue
        if lum < 0.12:
            line.append("#")
            dark.append((x, z))
        elif lum < 0.26:
            line.append("+")
            dark.append((x, z))
        elif lum < 0.42:
            line.append("o")
            mid.append((x, z))
        elif lum < 0.62:
            line.append(":")
        elif lum < 0.80:
            line.append(".")
        else:
            line.append(" ")
    print(f"z={z:+.3f} |" + "".join(line) + "|")

# 按左右和高度分簇
for name, pts in (("DARK", dark), ("MID", mid)):
    for side, sname in ((-1, "left"), (1, "right")):
        sel = [p for p in pts if p[0] * side > 0.008]
        if not sel:
            continue
        xs = [p[0] for p in sel]
        zs = [p[1] for p in sel]
        print(f"{name} {sname}: n={len(sel)} xc={sum(xs)/len(xs):+.4f} "
              f"zc={sum(zs)/len(zs):+.4f} x[{min(xs):+.4f},{max(xs):+.4f}] "
              f"z[{min(zs):+.4f},{max(zs):+.4f}]")
