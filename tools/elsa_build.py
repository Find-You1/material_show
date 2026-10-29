"""用 bpy 生成雪谷场景里的 Elsa（冰雪奇缘 2 造型）并导出 glTF。

坐标约定：模型与 three.js 里原来的 girl.js 完全同尺度（脚底 z=0、头顶约 2.25），
人朝 -Y（导出后由 glTF 转成 three.js 的 +Z），因此 girl.js 的关节角度可以照旧使用。
节点名就是 JS 侧的骨架：girl / body / waist / head / armL / armR / elbowL / elbowR /
mouth / eyeL / eyeR / browL / browR，glTF 层级原样保留。
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT_GLB = r"D:\material_show\frontend\public\models\elsa.glb"
OUT_BLEND = r"D:\material_show\tools\elsa.blend"
# KH3 版 Elsa 的头颅 / 眼球 / 睫毛 / 嘴（带完整 D/N 贴图）。
# 程序化车出来的脸永远是人偶，这四块直接借过来
HEAD_SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3\V8NWJ7X2AH6UB9V3CMOUYFSMQ.obj"
HEAD_TEX = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3"

bpy.ops.wm.read_factory_settings(use_empty=True)
COLL = bpy.context.collection

TAU = math.pi * 2


# ---------------------------------------------------------------- 基础工具
def material(name, color, rough=0.5, metal=0.0, sheen=0.0, emission=None,
             emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]

    def put(key, value):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value

    put("Base Color", (*color, 1.0))
    put("Roughness", rough)
    put("Metallic", metal)
    put("Sheen Weight", sheen)
    put("Sheen Roughness", 0.4)
    put("Alpha", alpha)
    if emission:
        put("Emission Color", (*emission, 1.0))
        put("Emission Strength", emission_strength)
    if alpha < 1.0:
        mat.surface_render_method = "BLENDED"
        mat.use_transparency_overlap = False
    mat.diffuse_color = (*color, alpha)
    return mat


def new_object(name, verts, faces, mat, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    COLL.objects.link(obj)
    if mat:
        mesh.materials.append(mat)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    return obj


def recalc_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def subsurf(obj, levels=2):
    mod = obj.modifiers.new("subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    return obj


def lathe(name, profile, mat, seg=64, sx=1.0, sy=1.0, fold=None, zshift=None,
          cap=True, levels=2):
    """把 (半径, z) 轮廓绕 Z 轴车成回转面。

    zshift(a, z) 用来给裙摆加后摆（裙裾）—— 只靠半径起伏做不出垂坠，
    一圈等高的裙摆正面永远是一个灯罩。
    """
    verts, faces = [], []
    for r, z in profile:
        for i in range(seg):
            a = TAU * i / seg
            rr = r * (fold(a, z) if fold else 1.0)
            zz = z + (zshift(a, z) if zshift else 0.0)
            verts.append((rr * math.sin(a) * sx, rr * math.cos(a) * sy, zz))
    rows = len(profile)
    for j in range(rows - 1):
        for i in range(seg):
            i2 = (i + 1) % seg
            faces.append((j * seg + i, j * seg + i2, (j + 1) * seg + i2, (j + 1) * seg + i))
    if cap:
        faces.append(tuple(range(seg - 1, -1, -1)))
        faces.append(tuple((rows - 1) * seg + i for i in range(seg)))
    obj = new_object(name, verts, faces, mat)
    recalc_normals(obj)
    if levels:
        subsurf(obj, levels)
    return obj


def catmull(points, per_seg=10):
    pts = [Vector(p) for p in points]
    padded = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = padded[i], padded[i + 1], padded[i + 2], padded[i + 3]
        for j in range(per_seg):
            t = j / per_seg
            t2, t3 = t * t, t * t * t
            out.append(
                0.5 * ((2 * p1) + (-p0 + p2) * t
                       + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                       + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            )
    out.append(pts[-1])
    return out


def tube(name, points, radius, mat, radii=None, cyclic=False, res=14, bevel_res=3):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = bevel_res
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    if radii and len(radii) != len(points):
        # 只给了几段控制点的粗细时，按长度线性摊到每个采样点
        scaled = []
        m = len(radii) - 1
        for i in range(len(points)):
            t = i / max(1, len(points) - 1) * m
            i0 = min(int(t), m - 1) if m else 0
            k = t - i0
            scaled.append(radii[i0] * (1 - k) + radii[min(i0 + 1, m)] * k)
        radii = scaled
    for i, p in enumerate(points):
        spline.points[i].co = (p[0], p[1], p[2], 1.0)
        if radii:
            spline.points[i].radius = radii[i]
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    curve.materials.append(mat)
    COLL.objects.link(obj)
    return obj


def band(name, pts, widths, thick, mat, sides=10, normal_fn=None):
    """沿一串点做一条扁带（发束 / 前襟）：截面是压扁的椭圆。

    normal_fn 给出该点的表面外法线；没给就按发壳椭球的径向，
    所以发束天然贴着头发、前襟天然贴着胸。
    """
    verts, faces = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        if i == 0:
            tan = pts[1] - pts[0]
        elif i == n - 1:
            tan = pts[-1] - pts[-2]
        else:
            tan = pts[i + 1] - pts[i - 1]
        tan.normalize()
        if normal_fn:
            rad = normal_fn(p)
        else:
            rad = Vector((p.x / HAIR_RX ** 2, p.y / HAIR_RY ** 2,
                          (p.z - 0.020) / HAIR_RZ ** 2))
        rad.normalize()
        side = tan.cross(rad)
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        rad = side.cross(tan).normalized()
        for j in range(sides):
            phi = TAU * j / sides
            verts.append(p + side * (math.cos(phi) * widths[i])
                         + rad * (math.sin(phi) * thick))
    for i in range(n - 1):
        for j in range(sides):
            j2 = (j + 1) % sides
            faces.append((i * sides + j, i * sides + j2,
                          (i + 1) * sides + j2, (i + 1) * sides + j))
    faces.append(tuple(range(sides - 1, -1, -1)))
    faces.append(tuple((n - 1) * sides + j for j in range(sides)))
    obj = new_object(name, verts, faces, mat)
    recalc_normals(obj)
    return obj


def ellipsoid(name, loc, scale, mat, seg=32, rings=16, levels=1, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if levels:
        subsurf(obj, levels)
    return obj


def empty(name, loc=(0, 0, 0), parent=None, scale=1.0, rot=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.12
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = (scale, scale, scale)
    COLL.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def set_input(mat, key, value):
    node = mat.node_tree.nodes.get("Principled BSDF")
    if node and key in node.inputs:
        node.inputs[key].default_value = value


def textured(name, color, image=None, normal=None, rough=0.5, alpha=False, sat=1.0,
             mix=0.0):
    mat = material(name, color, rough=rough)
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    if image:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(os.path.join(HEAD_TEX, image),
                                         check_existing=True)
        if sat != 1.0:
            # KH3 的头贴图腮红下手很重，直接贴上来整个人是粉红色的。
            # 压饱和度而不是调亮度，肤色才不会发灰
            hs = nt.nodes.new("ShaderNodeHueSaturation")
            hs.inputs["Saturation"].default_value = sat
            nt.links.new(tex.outputs["Color"], hs.inputs["Color"])
            src = hs.outputs["Color"]
        else:
            src = tex.outputs["Color"]
        if mix > 0.0:
            # 那张贴图是手游风格的：眼窝上一大片紫罗兰眼影、两只巨大的
            # 深棕眼球、青灰色平眉。整块压向肤色，只留 25% 做雀斑和
            # 鼻唇的细微明暗，五官交给真正的几何
            mc = nt.nodes.new("ShaderNodeMixRGB")
            mc.blend_type = "MIX"
            mc.inputs["Fac"].default_value = mix
            mc.inputs["Color2"].default_value = (*color, 1.0)
            nt.links.new(src, mc.inputs["Color1"])
            src = mc.outputs["Color"]
        nt.links.new(src, bsdf.inputs["Base Color"])
        if alpha:
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.surface_render_method = "BLENDED"
    if normal:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = bpy.data.images.load(os.path.join(HEAD_TEX, normal),
                                          check_existing=True)
        ntex.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(ntex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ---------------------------------------------------------------- 材质
# 参考图是瓷白的皮肤 + 近乎全白的发，所以这两个色都很浅；
# 明暗全靠主光和头发/裙子的冷色去拉开
skin = material("Skin", (0.928, 0.802, 0.752), rough=0.46, sheen=0.14)
set_input(skin, "Subsurface Weight", 0.22)
set_input(skin, "Subsurface Radius", (0.9, 0.36, 0.26))

# 白金发的关键不是「白」而是「暖」：纯白在雪地冷光里会退成灰色塑料，
# 压一点黄进去，冷光打上来才是参考图那种奶白金
hair = material("Hair", (0.845, 0.795, 0.660), rough=0.42, sheen=0.30)
hair_braid = material("HairBraid", (0.825, 0.775, 0.640), rough=0.40, sheen=0.32)
dress = material("Dress", (0.395, 0.560, 0.740), rough=0.38, metal=0.04, sheen=0.42)
bodice = material("Bodice", (0.455, 0.610, 0.775), rough=0.36, metal=0.03, sheen=0.36)
# 蕾丝要「薄」：80% 不透明时它就是一块白围兜，参考图里
# 白纱下面透得出蓝色身，只在肩头堆成亮区
lace = material("Lace", (0.930, 0.955, 0.985), rough=0.42, alpha=0.46)
set_input(lace, "Emission Color", (0.85, 0.93, 1.0, 1.0))
set_input(lace, "Emission Strength", 0.12)
lace.use_backface_culling = False
trim = material("Trim", (0.870, 0.940, 1.0), rough=0.22, metal=0.35, sheen=0.2)
# 腰带是参考图里那条灰蓝色的宽带，比裙子深两档，没有金属扣
belt = material("Belt", (0.215, 0.310, 0.445), rough=0.34, metal=0.02, sheen=0.30)
# V 领内衬：比裙子浅半档的冰蓝缎面，不是白 —— 白贴片在正面就是围兜
placket = material("Placket", (0.660, 0.800, 0.925), rough=0.30, sheen=0.30)

# ---------------------------------------------------------------- 骨架（空物体）
girl = empty("girl")
body = empty("body", parent=girl)
waist = empty("waist", loc=(0, 0, 1.30), parent=body)
# 漫画比例：头要略大、颈要细、肩要窄。写实的 1:8 头身配回转体四肢就是木偶，
# 放大到 1:7.4 才落在「动画角色」那一档。头同时微微偏转，但不能再低头 ——
# 低头 1.7° 配上扬的眉会读成委屈，改成极轻微的抬头
head = empty("head", loc=(0, 0, 1.995), parent=body, scale=0.82,
             rot=(-0.008, 0.052, 0.0))

# ---------------------------------------------------------------- 躯干 / 裙
# 上身：肩宽交给袖子和三角肌，躯干只做到胸廓。
# 宽度在上一版基础上再放 9%：0.15 的半宽配 0.026 的胳膊，
# 正面读出来就是「火柴人」——躯干要有胸廓的厚度，人才有分量
bodice_profile = [
    (0.109, 1.285), (0.129, 1.360), (0.148, 1.470), (0.161, 1.570),
    (0.164, 1.650), (0.156, 1.702), (0.142, 1.734), (0.124, 1.758),
    (0.107, 1.774), (0.087, 1.783), (0.070, 1.789),
]


def torso_fold(a, z):
    """躯干不能是等截面的圆筒：真人从肩到腰是一条 S 形。

    回转面只能给出半径随高度的变化，横向的形（胸线、背的平整、腰窝）
    要按角度再叠一层。正面凸一点、背面平一点，侧线才有起伏
    """
    front = max(0.0, -math.cos(a))
    back = max(0.0, math.cos(a))
    f = 1.0
    f += 0.080 * math.exp(-((z - 1.585) / 0.090) ** 2) * front ** 1.5   # 胸线
    f -= 0.026 * math.exp(-((z - 1.610) / 0.130) ** 2) * back ** 1.2    # 肩胛
    f -= 0.024 * math.exp(-((z - 1.340) / 0.070) ** 2) * (1.0 - front)  # 腰窝
    f += 0.018 * math.exp(-((z - 1.300) / 0.060) ** 2) * (1.0 - back)   # 胯
    return f


torso = lathe("bodice", bodice_profile, bodice, seg=64, sy=0.72, levels=2)
torso.parent = body

# 裙：A 字要有弧度，直着下来的两条母线是圆锥。
# 下摆 0.298 只在最低处，往上收到 0.13 的腰
skirt_profile = [
    (0.266, -1.258), (0.264, -1.090), (0.255, -0.890), (0.238, -0.680),
    (0.215, -0.470), (0.188, -0.300), (0.158, -0.160), (0.135, -0.068),
    (0.129, -0.014),
]


def skirt_fold(a, z):
    t = 1.0 - (z + 1.258) / 1.24
    # 褶要一路开到腰下：只在裙摆附近起伏时，整条裙子是一个光滑的漏斗
    amp = 0.34 + 0.66 * max(0.0, min(1.0, t))
    return 1.0 + (math.sin(a * 13 + 0.4) * 0.080 + math.sin(a * 7 - 0.9) * 0.045
                  + math.sin(a * 23 + 1.7) * 0.016) * amp


def skirt_train(a, z):
    """只有下摆附近往后沉：a=0(+Y) 是背面。前摆一圈齐平就是灯罩"""
    t = min(1.0, max(0.0, (-0.95 - z) / 0.31))
    return -0.055 * t * t * (0.5 + 0.5 * math.cos(a))


skirt = lathe("skirt", skirt_profile, dress, seg=128, sy=0.94, fold=skirt_fold,
              zshift=skirt_train, levels=1, cap=False)
skirt.parent = waist

# 裙摆滚边：沿下摆走一圈细管，跟着布褶和后摆一起起伏
hem_pts = []
for i in range(128):
    a = TAU * i / 128
    r = 0.266 * skirt_fold(a, -1.258)
    hem_pts.append((r * math.sin(a), r * math.cos(a) * 0.94, -1.250 + skirt_train(a, -1.258)))
hem = tube("hem", hem_pts, 0.0045, dress, cyclic=True, res=3, bevel_res=2)
hem.parent = waist

# 裙底封口：洞开着会从下缘看见裙子内壁，正面就是脚下一只黑洞
floor_pts = []
for i in range(48):
    a = TAU * i / 48
    r = 0.268 * skirt_fold(a, -1.258) * 0.995
    floor_pts.append((r * math.sin(a), r * math.cos(a) * 0.94, -1.257 + skirt_train(a, -1.258)))
floor_verts = [(0.0, 0.0, -1.257)] + floor_pts
floor_faces = [(0, 1 + i, 1 + (i + 1) % 48) for i in range(48)]
skirt_floor = new_object("skirtFloor", floor_verts, floor_faces, dress)
recalc_normals(skirt_floor)
skirt_floor.parent = waist

# 腰带：参考图里是一条浅冰蓝的宽带（约 5cm），不是一根细箍。
# 半径按上身剖面走，才不会在腰侧塌进去
def profile_radius(prof, z):
    if z <= prof[0][1]:
        return prof[0][0]
    if z >= prof[-1][1]:
        return prof[-1][0]
    for i in range(1, len(prof)):
        r0, z0 = prof[i - 1]
        r1, z1 = prof[i]
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0]


def torso_point(a, z, out=0.0):
    """a=0 是正面（-Y）；和 lathe 一样前后压到 0.74。"""
    r = profile_radius(bodice_profile, z) + out
    return (r * math.sin(a), -r * math.cos(a) * 0.74, z)


belt_profile = []
for i in range(9):
    t = i / 8
    z = 1.248 + 0.098 * t
    r = profile_radius(bodice_profile, z) + 0.013 - 0.004 * math.sin(math.pi * t) ** 0.6
    belt_profile.append((r, z))
belt_obj = lathe("belt", belt_profile, belt, seg=64, sy=0.77, levels=1)
belt_obj.parent = body


# 领口：参考图是贴颈的窄立领，收口要跟着脖子一起变细 ——
# 上口比颈根还粗就是一只套在脖子上的塑料桶
collar = lathe("highCollar",
               [(0.072, 1.768), (0.062, 1.804), (0.055, 1.852), (0.050, 1.896)],
               bodice, seg=48, sy=1.0, levels=1, cap=False)
collar.parent = body

# 立领上缘不起一圈金属线：那圈高光在正面读成一条项链。
# 用布本色的一圈压边
tube("collarEdge",
     [(0.050 * math.sin(TAU * i / 48), -0.050 * math.cos(TAU * i / 48), 1.896)
      for i in range(48)], 0.0026, bodice, cyclic=True, bevel_res=2).parent = body

# 肩纱不做成整圈 lathe：一圈水平边的薄纱在正面就是一块白桌沿。
# 参考图那块纱是顺着肩斜下去的，用回转面做不出来，宁可不做

# 前襟：参考图正面有一条细缝线，但它和衣服同色 ——
# 用浅色缎面就是一条拉链，正面看像开了个口子
placket_pts = []
for i in range(16):
    z = 1.778 - 0.430 * i / 15
    r = profile_radius(bodice_profile, z)
    placket_pts.append(Vector((0.0, -r * 0.74 - 0.0018, z)))
placket_obj = band("placket", placket_pts, [0.0030] * 16, 0.0010, bodice,
                   normal_fn=lambda p: Vector((0, -1, 0)))
placket_obj.parent = body

# 裙腰接缝
tube("bodiceSeam",
     [(profile_radius(bodice_profile, 1.288) * math.sin(TAU * i / 48),
       -profile_radius(bodice_profile, 1.288) * math.cos(TAU * i / 48) * 0.74, 1.288)
      for i in range(48)], 0.0028, placket, cyclic=True, bevel_res=2).parent = body

# 披风不建了。参考图里那块纱从正面几乎看不见，单靠它撑不出剪影；
# 做出来反而只有一条比裙子深一档的硬边 —— 远看像影子，近看像块纸板

# 脖子：只在下巴和领边之间露一小截。等径的圆柱在正面是一根杆子，
# 从颈根 0.064 收到下颌 0.047，才有斜方肌往下颌收的形
neck = lathe("neck", [(0.064, 1.778), (0.054, 1.845), (0.047, 1.905)], skin,
             seg=24, levels=1, cap=False)
neck.parent = body

# ---------------------------------------------------------------- 头
# 头高 / 头宽 ≈ 1.34：再窄就成一张长面模，五官挤在中间
# 下巴收短：之前的 −0.186 让下半张脸比上半张还长，
# 眼—唇—下巴三段接近等分，正面就是一张长鸭蛋脸
head_profile = [
    (0.0, -0.164), (0.032, -0.159), (0.056, -0.150), (0.078, -0.138),
    (0.098, -0.118), (0.118, -0.090), (0.137, -0.055), (0.156, -0.016),
    (0.167, 0.024), (0.172, 0.066), (0.168, 0.110), (0.156, 0.150),
    (0.136, 0.184), (0.107, 0.208), (0.066, 0.222), (0.0, 0.228),
]
HEAD_SX, HEAD_SY = 0.945, 0.99


def interp_radius(prof, z):
    if z <= prof[0][1]:
        return prof[0][0]
    if z >= prof[-1][1]:
        return prof[-1][0]
    for i in range(1, len(prof)):
        r0, z0 = prof[i - 1]
        r1, z1 = prof[i]
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0]


def head_radius(z):
    return interp_radius(head_profile, z)


# 头颅：直接借 KH3 那套带贴图的网格。程序化车出来的蛋面 + 手摆的五官，
# 无论怎么调参数都停在「人偶」这一档；贴图里本来就画好了眉、眼窝阴影、
# 唇色和雀斑，这是手建达不到的一层信息
# 贴图里本来就画好了眉、眼窝、唇色和雀斑，是一层手建达不到的信息；
# 但手游画法的紫罗兰眼影太重，压到 82%：既留一点面部的明暗信息，
# 又不至于变成熊猫眼。压到 94% 会得到一张空白面具，反而更假
head_skin = textured("HeadSkin", (0.928, 0.802, 0.752), image="Elsa_Head_D.png",
                     normal="Elsa_Head_N.png", rough=0.46, sat=0.35, mix=0.82)
mouth_skin = textured("MouthSkin", (0.80, 0.45, 0.45), image="Elsa_Mouth_D.png",
                      normal="Elsa_Mouth_N.png", rough=0.40, sat=0.80)
# 眼球不借了：KH3 的眼球网格贴的是整张虹膜图，塞在眼眶里只能看到一小块
# 棕色（渲染里就是两只空洞的黑眼窝）。下面的 sclera/iris 是重新搭的。
# 虹膜不能做大做艳：0.0132 的半径 + 深蓝轮部，渲染里就是两颗蓝色纽扣
sclera_mat = material("Sclera", (0.905, 0.890, 0.875), rough=0.12)
iris_mat = material("Iris", (0.372, 0.556, 0.690), rough=0.14)
limbal_mat = material("Limbal", (0.170, 0.300, 0.428), rough=0.18)
pupil_mat = material("Pupil", (0.012, 0.012, 0.018), rough=0.22)
glint_mat = material("Glint", (0.98, 0.99, 1.0), rough=0.04)
# 睫毛和眉不能画成墨线。上一版为了「漫画感」压到接近纯黑，
# 在浅色皮肤上就成了一对黑眼圈，整张脸读成骷髅、读成恐怖
lashline_mat = material("LashLine", (0.185, 0.130, 0.118), rough=0.42)
brow_mat = material("Brow", (0.430, 0.335, 0.248), rough=0.54)


def extract_part(src, mat_prefix, name, mat):
    """按材质把源模型拆出一块（源 OBJ 把所有部件合成了一个网格）。"""
    idx = next((i for i, m in enumerate(src.data.materials)
                if m and m.name.startswith(mat_prefix)), None)
    if idx is None:
        print("MISSING PART", mat_prefix)
        return None
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx],
                     context="FACES")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate()
    mesh.materials.clear()
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    COLL.objects.link(obj)
    return obj


bpy.ops.wm.obj_import(filepath=HEAD_SRC)
_src = next(o for o in bpy.context.selected_objects if o.type == "MESH")

head_mesh = extract_part(_src, "Modelhead", "headMesh", head_skin)
mouth_mesh = extract_part(_src, "Modelmouth", "mouthMesh", mouth_skin)

# 源模型是 Y 轴朝上、脸朝 -X：先绕 X 转 +90° 把上方向扶到 +Z，
# 再绕 Z 转 +90° 把脸转成 -Y。之前只绕 Z 转，头是躺着的，
# 于是把「头的厚度」当成了头高，整个人被撑成一颗大头娃娃
ROT = Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X")
head_mesh.data.transform(ROT)
# 嘴是另一块网格，必须吃同一份 ROT —— 之前只转了头，
# 嘴一直躺在源文件的原始坐标里（世界坐标 x≈−1.0），渲染里当然看不到
if mouth_mesh is not None:
    mouth_mesh.data.transform(ROT)
_lo = [min(v.co[i] for v in head_mesh.data.vertices) for i in range(3)]
_hi = [max(v.co[i] for v in head_mesh.data.vertices) for i in range(3)]
HEAD_H = 0.408           # 原颅骨 0.392，加上脖子那一小截留到这个高度
_scale = HEAD_H / max(1e-6, _hi[2] - _lo[2])
print("HEAD RAW", [round(v, 3) for v in _lo], [round(v, 3) for v in _hi],
      "scale", round(_scale, 4))

FIT = Matrix.Translation((-0.5 * (_lo[0] + _hi[0]) * _scale,
                          -0.170 - _lo[1] * _scale,
                          -0.150 - _lo[2] * _scale)) \
    @ Matrix.Scale(_scale, 4)
for obj in (head_mesh, mouth_mesh):
    if obj is None:
        continue
    obj.data.transform(FIT)
    obj.parent = head

# 删掉源模型剩下的部分（头发、裙子、皇冠…），只留头/嘴两块
bpy.data.objects.remove(_src, do_unlink=True)

# 笑意：源模型的嘴是平的一条，正面看就是个中性的小圆点。
# 嘴角按 x² 抬起来，唇线才成一道上弯的弧；这是整张脸「不呆」的关键
if mouth_mesh is not None:
    _mx = [v.co.x for v in mouth_mesh.data.vertices]
    _mw = max(1e-4, max(_mx) - min(_mx)) * 0.5
    for v in mouth_mesh.data.vertices:
        t = max(-1.0, min(1.0, v.co.x / _mw))
        v.co.z += 0.0072 * t * t - 0.0016
        v.co.y += 0.0016 * t * t
    print("SMILE mw", round(_mw, 4))

# 头颅的实际半径：按 z 分格量这张网格，头发必须贴着它铺。
# 之前用旧的 head_profile 当颅骨，发际线因此悬在额前 3cm —— 一顶帽檐
_zh = [v.co.z for v in head_mesh.data.vertices]
HZ0, HZ1 = min(_zh), max(_zh)
NB = 74
_head_tab = []
for i in range(NB):
    z = HZ0 + (HZ1 - HZ0) * i / (NB - 1)
    sel = [abs(v.co.x) for v in head_mesh.data.vertices if abs(v.co.z - z) < 0.0075]
    sy = [(v.co.y, v.co.x) for v in head_mesh.data.vertices if abs(v.co.z - z) < 0.0075]
    if not sel:
        _head_tab.append((z, 0.0, 0.0, 0.0))
        continue
    # 不能用 max：耳廓在那个高度比颅骨宽出 1.5cm，发壳会被耳朵顶出一个鼓包。
    # 取 78 分位，得到的是颅骨的宽度
    sel.sort()
    rx = sel[int(0.78 * (len(sel) - 1))]
    _head_tab.append((z,
                      rx,
                      max((-y for y, _ in sy), default=0.0),
                      max((y for y, _ in sy), default=0.0)))
# 平滑：逐格取最大值会把噪点当成轮廓
for _ in range(3):
    _head_tab = [(
        z,
        (0.25 * _head_tab[max(0, i - 1)][1] + 0.5 * _head_tab[i][1]
         + 0.25 * _head_tab[min(NB - 1, i + 1)][1]),
        (0.25 * _head_tab[max(0, i - 1)][2] + 0.5 * _head_tab[i][2]
         + 0.25 * _head_tab[min(NB - 1, i + 1)][2]),
        (0.25 * _head_tab[max(0, i - 1)][3] + 0.5 * _head_tab[i][3]
         + 0.25 * _head_tab[min(NB - 1, i + 1)][3]),
    ) for i, (z, _, _, _) in enumerate(_head_tab)]


def head_sect(z):
    """返回该高度的 (半宽, 前深, 后深)。"""
    if z <= _head_tab[0][0]:
        return _head_tab[0][1], _head_tab[0][2], _head_tab[0][3]
    if z >= _head_tab[-1][0]:
        return _head_tab[-1][1], _head_tab[-1][2], _head_tab[-1][3]
    t = (z - _head_tab[0][0]) / ((_head_tab[-1][0] - _head_tab[0][0]) / (NB - 1))
    i = min(NB - 2, int(t))
    k = t - i
    return tuple(_head_tab[i][j] * (1 - k) + _head_tab[i + 1][j] * k
                 for j in (1, 2, 3))


print("HEAD SECT",
      " ".join(f"z={_head_tab[i][0]:+.3f}:{_head_tab[i][1]:.3f}"
               for i in range(0, NB, 8)))
print("HEAD DEPTH",
      " ".join(f"z={_head_tab[i][0]:+.3f}:{_head_tab[i][2]:.3f}/{_head_tab[i][3]:.3f}"
               for i in range(0, NB, 8)))


# ---------------------------------------------------------------- 眼睛
# 头颅贴图上本来就画着眼睛，但那是一块深棕圆盘 + 紫眼影，没有巩膜也没有睫毛，
# 渲染出来就是两只空洞的眼窝。这里用脸面射线定位，在贴图的眼球上盖一层
# 真正的眼睛：巩膜、虹膜、瞳孔、高光、上睫毛线
EYE_X, EYE_Z = 0.0555, 0.0925
# 眼片要贴着实际眼窝的大小。放大到填满眼窝，就是在空白面具上贴两只圆眼，
# 那正是恐怖片的做法。回到 0.0225/0.0158 —— 这是看起来还像人的尺寸
EYE_W, EYE_H = 0.0225, 0.0158


def face_hit(x, z):
    hit, loc, nor, fidx = head_mesh.ray_cast((x, -0.6, z), (0, 1, 0))
    return loc if hit else None


def surf_pt(x, z, push):
    p = face_hit(x, z)
    if p is None:
        return None
    return (p.x, p.y - push, p.z)


def eye_disc(name, cx, cz, w, h, mat, push, n=40, tilt=0.075, upper=1.0,
             lower=0.80, offset=(0.0, 0.0)):
    """贴在脸上的椭圆片。顶点逐一投到皮肤上，边缘才不会穿出来。"""
    cx += offset[0]
    cz += offset[1]
    c = surf_pt(cx, cz, push)
    if c is None:
        return None
    verts = [c]
    for i in range(n):
        t = TAU * i / n
        dx = w * math.cos(t)
        dz = (h * upper if math.sin(t) >= 0 else h * lower) * math.sin(t)
        dz += h * tilt * (dx / w)
        p = surf_pt(cx + dx, cz + dz, push)
        if p is None:
            p = c
        verts.append(p)
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    obj = new_object(name, verts, faces, mat, smooth=True)
    recalc_normals(obj)
    # 这片眼睛是浮在眼窝上方 1mm 的壳。让它投影，眼窝里就会落下一圈
    # 又宽又圆的暗环 —— 正面看像两只浮肿的熊猫眼，那正是「哭」的一半
    obj.visible_shadow = False
    obj.parent = head
    return obj


for s in (-1, 1):
    tag = "L" if s < 0 else "R"
    cx = s * EYE_X
    # 眼白：略大于贴图上的深棕圆盘，正好把它整块盖掉
    eye_disc(f"eyeWhite{tag}", cx, EYE_Z, EYE_W, EYE_H, sclera_mat, 0.0009)
    eye_disc(f"eyeIris{tag}", cx, EYE_Z, 0.0112, 0.0112, limbal_mat, 0.0021,
             n=36, tilt=0.0, upper=1.0, lower=1.0)
    eye_disc(f"eyeIrisIn{tag}", cx, EYE_Z, 0.0098, 0.0098, iris_mat, 0.0023,
             n=36, tilt=0.0, upper=1.0, lower=1.0)
    eye_disc(f"eyePupil{tag}", cx, EYE_Z, 0.0040, 0.0040, pupil_mat, 0.0027,
             n=24, tilt=0.0, upper=1.0, lower=1.0)
    eye_disc(f"eyeGlint{tag}", cx, EYE_Z, 0.0028, 0.0028, glint_mat, 0.0031,
             n=20, tilt=0.0, upper=1.0, lower=1.0,
             offset=(-0.0040 * s, 0.0042))

    # 上睫毛线：沿上眼睑走一条由粗到细的深色线，外眼角挑出去。
    # 注意 dx 要乘 s：不乘的话左右眼的睫毛是同一侧画的，左眼那条会横过
    # 眼角爬上太阳穴 —— 特写里就是一道黑色的 Z
    lash = []
    for i in range(19):
        t = -0.02 + 1.06 * i / 18
        ang = math.pi * t
        dx = EYE_W * math.cos(ang) * 1.02
        dz = EYE_H * math.sin(ang) + EYE_H * 0.075 * (dx / EYE_W)
        p = surf_pt(cx + s * dx, EYE_Z + dz, 0.0030)
        lash.append(p if p else lash[-1] if lash else None)
    lash = [p for p in lash if p]
    if lash:
        tube(f"lash{tag}", lash, 0.0014, lashline_mat,
             radii=[0.55, 0.85, 1.0, 1.0, 0.95, 0.95, 0.92, 0.9, 0.9,
                    0.9, 0.9, 0.92, 0.95, 0.9, 0.8, 0.65, 0.5, 0.3, 0.1],
             bevel_res=2).parent = head

    # 眉毛：贴图上那两条青灰平眉压不住，这里盖一条细的、带弓的眉。
    # 弓峰必须在外侧、内侧要低 —— 原来的式子让内端比外端高 1cm，
    # 那正是「哭」的眉形，无论嘴怎么上扬，脸都读成委屈
    brow = []
    for i in range(13):
        u = i / 12
        dx = EYE_W * (2.35 * u - 1.30)
        dz = 0.0158 + 0.0078 * math.sin(math.pi * u ** 0.80) - 0.0038 * u
        p = surf_pt(cx + s * dx, EYE_Z + dz, 0.0034)
        if p:
            brow.append(p)
    if brow:
        tube(f"brow{tag}", brow, 0.0021, brow_mat,
             radii=[0.35, 0.75, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8,
                    0.72, 0.6, 0.45, 0.25, 0.06], bevel_res=2).parent = head

# ---------------------------------------------------------------- 头发
# 头发 = 颅骨表面外扩一层。用固定椭球（0.136/0.148/0.292）做不出来：
# 椭球在额前比额头凸出 3cm，发际线就变成一圈帽檐。
# 所以这里按 head_sect() 实测的截面半径往外推，发壳才真的贴着头长
HAIR_T = 0.025      # 侧面发层厚度（含发量）—— 0.017 在场景里就是一顶白泳帽

# 颅顶：把截面的上半段拟合成椭球 rx² = c0 + c1 z + c2 z²。
# 以前拿「最后几格的半径」当球冠半径往上收，收在 3cm 高度里，头顶就压成
# 一只扁平的贝雷帽。椭球的顶本来就是圆的：把椭球按发层厚度整体放大
# （a+T / c+T），发壳会自己收成一个圆顶，而且和下面的侧面天然连续
_rows = [(z, r * r) for z, r, _, _ in _head_tab if z >= 0.05 and r > 0.0]
if len(_rows) >= 4:
    _s = [0.0] * 5
    _q = [0.0] * 3
    for _z, _r2 in _rows:
        _p = 1.0
        for _k in range(5):
            _s[_k] += _p
            if _k < 3:
                _q[_k] += _r2 * _p
            _p *= _z
    _M = [[_s[0], _s[1], _s[2]], [_s[1], _s[2], _s[3]], [_s[2], _s[3], _s[4]]]
    _b = _q[:]
    for _col in range(3):
        _piv = max(range(_col, 3), key=lambda j: abs(_M[j][_col]))
        _M[_col], _M[_piv] = _M[_piv], _M[_col]
        _b[_col], _b[_piv] = _b[_piv], _b[_col]
        for _row in range(_col + 1, 3):
            _f = _M[_row][_col] / _M[_col][_col]
            for _k in range(_col, 3):
                _M[_row][_k] -= _f * _M[_col][_k]
            _b[_row] -= _f * _b[_col]
    _c2 = _b[2] / _M[2][2]
    _c1 = (_b[1] - _M[1][2] * _c2) / _M[1][1]
    _c0 = (_b[0] - _M[0][1] * _c1 - _M[0][2] * _c2) / _M[0][0]
else:
    _c0, _c1, _c2 = 0.0, 0.0, -1.0

if _c2 < -1e-6:
    SK_ZC = -_c1 / (2.0 * _c2)                                  # 椭球中心高度
    SK_A = math.sqrt(max(0.0, _c0 - _c1 * _c1 / (4.0 * _c2)))    # 颅骨半宽
    SK_C = math.sqrt(max(0.0, (_c0 - _c1 * _c1 / (4.0 * _c2)) / (-_c2)))
else:
    SK_ZC, SK_A, SK_C = 0.5 * (HZ0 + HZ1), 0.10, 0.5 * (HZ1 - HZ0)
HAIR_TOP = SK_ZC + SK_C + HAIR_T      # 发壳颅顶的闭合点
_r9, _f9, _b9 = head_sect(0.090)
RYF_RATIO = _f9 / max(_r9, 1e-4)
RYB_RATIO = _b9 / max(_r9, 1e-4)
print("HAIR FIT a/zc/c", round(SK_A, 4), round(SK_ZC, 4), round(SK_C, 4),
      "top", round(HAIR_TOP, 4), "ry", round(RYF_RATIO, 3), round(RYB_RATIO, 3))


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def hair_edge_z(a):
    """发际线高度：前额 0.196（露额头）、太阳穴 0.090、耳后 0.037、后颈 -0.060。

    以前在 57° 处就一路垂到 0.026（耳廓高度），正面两侧各垂下一片到下颌 ——
    那不是「往后梳」，是一顶波波头。
    """
    aa = abs(a)
    if aa <= 1.10:
        return 0.196 - 0.106 * (aa / 1.10) ** 1.60
    return 0.090 - 0.150 * ((aa - 1.10) / (math.pi - 1.10)) ** 1.25


def groove(a, v):
    """把发束刻进壳面，而不是再往上贴一层发片。

    发片在特写下是一条浮在壳外的直边，两侧各一片就是帽帘。
    这里让同一张曲面带沟槽：相位随 v 偏移，沟槽在头顶汇拢、在发际线展开
    """
    sweep = a + 1.30 * (1.0 - v) ** 1.4
    main = 0.0055 * math.sin(12.0 * sweep)
    fine = 0.0022 * math.sin(25.0 * sweep + 1.1)
    broad = 0.0030 * math.sin(5.0 * sweep - 0.6)
    depth = 0.28 + 0.72 * min(1.0, v * 1.3)
    return (main + fine) * depth + broad * 0.5


def hair_ellipse(z):
    """颅顶椭球外扩发层后，在该高度的半宽。高于闭合点返回 0。"""
    if z <= SK_ZC:
        return SK_A * math.sqrt(max(0.0, 1.0 - ((z - SK_ZC) / SK_C) ** 2)) + HAIR_T
    return (SK_A + HAIR_T) * math.sqrt(
        max(0.0, 1.0 - ((z - SK_ZC) / (SK_C + HAIR_T)) ** 2))


def shell_point(a, v):
    """v=0 在颅顶，v=1 在发际线。半径取自实测颅骨截面 + 发层厚度。"""
    ze = hair_edge_z(a)
    z = ze + (HAIR_TOP - ze) * (1.0 - v) ** 0.86
    # 后脑的发量往后收进辫子：鼓出来的那一坨就是波波头
    gather = smoothstep((abs(a) - 2.20) / 1.00) * smoothstep((v - 0.55) / 0.45)
    # 78 分位的截面比真实颅骨窄，光靠 HAIR_T 会在额头和太阳穴处
    # 让发壳陷进皮肤 —— 那几块浅色斑就是壳体穿出来的地方。加 5mm 底厚
    wall = 0.005 + HAIR_T * (1.0 - 0.55 * smoothstep((v - 0.62) / 0.38)) * (1.0 - 0.45 * gather)
    rx, ryf, ryb = head_sect(z)
    rx += wall
    ryf += wall
    ryb += wall
    if z > 0.045:
        he = hair_ellipse(z)
        k = smoothstep((z - 0.045) / 0.070)
        rx = rx * (1.0 - k) + he * k
        ryf = ryf * (1.0 - k) + he * RYF_RATIO * k
        ryb = ryb * (1.0 - k) + he * RYB_RATIO * k
    ry = ryb if math.cos(a) < 0 else ryf
    base = 1.0 / math.sqrt((math.sin(a) / max(rx, 0.004)) ** 2
                           + (math.cos(a) / max(ry, 0.004)) ** 2)
    # 颅顶的极点必须收成一点：留着沟槽，顶上就是一块平盖
    fade = min(1.0, v / 0.07)
    fade = fade * fade * (3 - 2 * fade)
    g = groove(a, v) * fade * (1.0 - 0.6 * max(0.0, (v - 0.86) / 0.14))
    r = base + g
    return (r * math.sin(a), -r * math.cos(a), z)


# 发壳：一整张连续曲面 + 沟槽，不再叠发片
# 168×40 在特写里能看出经纬的台阶（额头像等高线），加密到 200×56 才平滑
AZ, ROW = 200, 56
verts, faces = [], []
verts.append(shell_point(0.0, 0.0))
for row in range(1, 2 * ROW + 1):
    if row <= ROW:
        v = row / ROW
        inner = False
    else:
        v = (2 * ROW - row + 1) / ROW
        inner = True
    for i in range(AZ):
        a = TAU * i / AZ - math.pi
        p = shell_point(a, v)
        if inner:
            # 内层只做一圈很薄的返边，让发际线有厚度而不是一张纸
            hx, hy = p[0], p[1]
            d = Vector((hx, hy)).normalized() * -0.005 if (hx or hy) else Vector()
            p = (p[0] + d.x, p[1] + d.y, p[2])
        verts.append(p)
for i in range(AZ):
    i2 = (i + 1) % AZ
    faces.append((0, 1 + i, 1 + i2))
for row in range(1, 2 * ROW):
    for i in range(AZ):
        i2 = (i + 1) % AZ
        a0 = row * AZ + i
        a1 = row * AZ + i2
        b0 = (row + 1) * AZ + i
        b1 = (row + 1) * AZ + i2
        if row < ROW:
            faces.append((a0, b0, b1, a1))
        else:
            faces.append((a0, a1, b1, b0))
cap = new_object("hairCap", verts, faces, hair)
recalc_normals(cap)
cap.parent = head


# 发束全部并进发壳的沟槽里了：单独的发片在正面是一圈悬在脸侧的直边，
# 两侧各一片就是帽帘 —— 见上面 groove()

# 发际线上探出来的细碎发也不做：0.0026 的细管横过额头是几道划痕

# 长辫：从后脑下方拧成一股，贴着颈侧过右肩，垂到胸前。
# 坐标是 head 局部坐标（×0.78 才是世界尺寸）：贴在胸前的那几段 y 必须到
# −0.18 一带，否则辫子整根埋在躯干里 —— 正面上什么都看不见
braid_path = catmull([
    (0.023, 0.077, -0.035),
    (0.077, 0.090, -0.109),
    (0.108, 0.038, -0.179),
    (0.126, -0.070, -0.269),
    (0.128, -0.186, -0.372),
    (0.121, -0.182, -0.506),
    (0.110, -0.171, -0.647),
], 9)
TWIST = 8.0
for strand in range(3):
    pts, rads = [], []
    for k, c in enumerate(braid_path):
        t = k / (len(braid_path) - 1)
        if k == 0:
            tan = braid_path[1] - braid_path[0]
        elif k == len(braid_path) - 1:
            tan = braid_path[-1] - braid_path[-2]
        else:
            tan = braid_path[k + 1] - braid_path[k - 1]
        tan.normalize()
        ref = Vector((0, -1, 0))
        if abs(tan.dot(ref)) > 0.95:
            ref = Vector((1, 0, 0))
        n1 = tan.cross(ref).normalized()
        n2 = n1.cross(tan).normalized()
        ang = t * TWIST * TAU + strand * TAU / 3
        # 股心要小到三股互相压进去：0.0123 时三股各自是一根管，
        # 正面看就是一根三线绞的绳。0.0098 才是拧成一股的辫子
        core = 0.0098 + 0.0016 * (1 - t)
        pts.append(c + n1 * (math.cos(ang) * core) + n2 * (math.sin(ang) * core))
        # 粗细起伏：三股在交叉处互相压扁，才有辫子的瓣。
        # 起点要收细，不然辫根是一根被切断的绳头
        rads.append((0.86 + 0.14 * abs(math.cos(ang)))
                    * (1 - 0.26 * t) * (0.35 + 0.65 * smoothstep(t / 0.16)))
    # 0.0142 在场景里细成一根绳：三股合起来的外径还不如头发一侧的厚度
    tube(f"braidStrand{strand}", [(p.x, p.y, p.z) for p in pts], 0.0186,
         hair_braid, radii=rads, bevel_res=3).parent = head

# 辫根：头发在这里拧成一股。这颗团子要盖住三股的端头
root = ellipsoid("braidRoot", (0.030, 0.076, -0.058), (0.030, 0.026, 0.034),
                 hair_braid, seg=20, rings=12)
root.parent = head

# 辫梢：发绳 + 三缕散开的发尾
tip = braid_path[-1]
tangent = (braid_path[-1] - braid_path[-4]).normalized()
ref = Vector((0, -1, 0))
n1 = tangent.cross(ref).normalized()
n2 = n1.cross(tangent).normalized()
tie_pts = []
for i in range(20):
    a = TAU * i / 20
    tie_pts.append(tip + n1 * (math.cos(a) * 0.0135) + n2 * (math.sin(a) * 0.0135))
tube("braidTie", [(p.x, p.y, p.z) for p in tie_pts], 0.0036, trim,
     cyclic=True, bevel_res=2).parent = head
for i in range(3):
    a = TAU * i / 3 + 0.4
    wisp = catmull([
        tip,
        tip + Vector((math.cos(a) * 0.006, math.sin(a) * 0.004, -0.030)),
        tip + Vector((math.cos(a) * 0.011, math.sin(a) * 0.007, -0.062)),
    ], 6)
    tube(f"braidTip{i}", [(p.x, p.y, p.z) for p in wisp], 0.0068, hair_braid,
         radii=[0.9, 0.55, 0.08], bevel_res=2).parent = head

# ---------------------------------------------------------------- 五官
# 五官位置由借来的头颅网格决定，这里只需要知道嘴的高度来摆 mouth 空物体
MOUTH_Z = -0.118


# 眼睛、眉毛、鼻、唇全部长在借来的头颅网格里，连眼窝阴影和雀斑都在贴图上。
# 下面这几个空物体只为 girl.js 的关节名保留：GLB 里找不到同名节点时
# 动画代码会直接报错，留个空壳让它照常跑
for tag in ("L", "R"):
    empty(f"eye{tag}", loc=(0, 0, 0.024), parent=head)
    empty(f"brow{tag}", loc=(0, 0, 0.066), parent=head)
mouth = empty("mouth", loc=(0, 0, MOUTH_Z), parent=head)

# ---------------------------------------------------------------- 手臂
# 手臂：肩轴落在肩斜面上，整条手臂只往外倾 3° ——
# 倾多了会在腋下留出一条缝，正面就是两根悬在身侧的蓝管子
TILT = 0.06
ARM_LEN = 0.295
for side in (-1, 1):
    tag = "L" if side < 0 else "R"
    # 两臂不对称：镜像对称的站姿是木偶的第一特征。右臂多开 4°、
    # 再往前送 2cm，重心就落在一条腿上，整个人是「站」而不是「摆」
    tilt = TILT + (0.040 if side > 0 else 0.0)
    shoulder = empty(f"arm{tag}", loc=(side * 0.166, -0.010 if side > 0 else 0.0, 1.706),
                     parent=body)
    # 袖山不要额外的球：那颗球在渲染里是一对护肩。肩轴压到 1.706、
    # 袖顶收到 1.722，让躯干的斜肩把接缝整个盖住 ——
    # 袖顶高过躯干的地方在正面就是两块方肩章
    # 上臂放粗四成：原来 0.024 的半径在 2.25 米的人身上不到 5 厘米，
    # 远景里就是两根火柴棍。现在从肩 0.05 收到肘 0.034，才有胳膊的体积
    upper = lathe(f"upper{tag}", [(0.034, -ARM_LEN), (0.037, -0.210), (0.041, -0.105),
                                  (0.047, -0.008), (0.051, 0.004), (0.044, 0.012),
                                  (0.0, 0.016)], bodice, seg=20, levels=1)
    upper.rotation_euler = (0, -side * tilt, 0)
    upper.parent = shoulder

    # 三角肌：躯干侧面到袖子的那一步，不做过渡就是一个方肩。
    # 球不能露成两颗护肩：往里压 1cm、竖向拉长，只留肩头那一小段圆弧
    delt = ellipsoid(f"deltoid{tag}", (side * 0.130, -0.002, 1.706),
                     (0.064, 0.058, 0.064), bodice, seg=24, rings=14)
    delt.parent = body

    # 肩上的白纱已经整片做过了（shoulderCape）。这里不再箍一圈蕾丝边：
    # 袖顶那圈白环在正面就是一只泡泡袖的分界

    ex = side * ARM_LEN * math.sin(tilt)
    ez = -ARM_LEN * math.cos(tilt)
    elbow = empty(f"elbow{tag}", loc=(ex, 0, ez), parent=shoulder)
    joint = ellipsoid(f"joint{tag}", (0, 0, 0.0), (0.030, 0.030, 0.033), bodice,
                      seg=16, rings=10)
    joint.rotation_euler = (0, -side * tilt, 0)
    joint.parent = elbow
    # 小臂要收：从肘 0.036 收到腕 0.021，长度不能超过上臂 ——
    # 0.33 的小臂配 0.295 的上臂，手就垂到裙子一半的地方
    # 小臂略往前弯：垂得笔直的胳膊是木偶的第二特征。
    # 0.16 弧度的肘弯让手落在身体前面一点，是「等着做事」的姿态
    forearm = lathe(f"forearm{tag}", [(0.021, -0.262), (0.026, -0.172),
                                      (0.031, -0.082), (0.036, 0.010)],
                    bodice, seg=20, levels=1)
    forearm.rotation_euler = (0.16, -side * 0.07, 0)
    forearm.parent = elbow
    hand = ellipsoid(f"hand{tag}", (side * 0.024, -0.004, -0.288), (0.021, 0.0145, 0.042),
                     skin, seg=18, rings=12)
    hand.rotation_euler = (0.16, -side * 0.10, 0)
    hand.parent = elbow
    thumb = ellipsoid(f"thumb{tag}", (side * 0.014, -0.012, -0.283), (0.010, 0.0105, 0.018),
                      skin, seg=14, rings=10)
    thumb.rotation_euler = (0.2, 0, side * 0.35)
    thumb.parent = elbow

# ---------------------------------------------------------------- 收尾
bpy.context.view_layer.update()
tri = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
print("objects", len(bpy.data.objects), "faces", tri)

for obj in bpy.data.objects:
    obj.select_set(False)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
print("exported", OUT_GLB)
