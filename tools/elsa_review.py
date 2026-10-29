"""把 elsa.blend 组装成「可以对着参考图检查」的审阅场景。

模型本身不动，只补上相机 / 三点光 / 地面 / 参考图背板，另存为 elsa_review.blend，
交给 Blender GUI 打开（elsa_build.py 每次重建都会覆盖 elsa.blend，审阅场景单独存）。

参考图背板按「头部对齐」摆放：图里她的发顶 / 下巴 和模型的对上，
这样正面一眼就能看出头身比、脸宽、发量差在哪。
"""

import math

import bpy
from mathutils import Vector

BLEND = r"D:\material_show\tools\elsa.blend"
OUT_BLEND = r"D:\material_show\tools\elsa_review.blend"
REF = r"d:\9b87655d3d10651ef6799ee081f96d76.jpg"

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"

world = scene.world or bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
nodes = world.node_tree.nodes
nodes.clear()
bg = nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (0.020, 0.028, 0.038, 1)
bg.inputs[1].default_value = 1.0
out = nodes.new("ShaderNodeOutputWorld")
world.node_tree.links.new(bg.outputs[0], out.inputs[0])

# 地面：只给剪影一个落点
bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "reviewFloor"
floor_mat = bpy.data.materials.new("ReviewFloor")
floor_mat.use_nodes = True
bsdf = floor_mat.node_tree.nodes.get("Principled BSDF")
if bsdf is None:
    floor_mat.node_tree.nodes.clear()
    bsdf = floor_mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    fout = floor_mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
    floor_mat.node_tree.links.new(bsdf.outputs[0], fout.inputs[0])
bsdf.inputs["Base Color"].default_value = (0.055, 0.075, 0.095, 1)
floor.data.materials.append(floor_mat)


def add_light(name, loc, energy, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    direction = Vector((0, 0, 1.35)) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


add_light("reviewKey", (-2.4, -3.0, 3.4), 95, 2.4, (1.0, 0.97, 0.92))
add_light("reviewFill", (2.8, -2.2, 1.8), 34, 2.8, (0.86, 0.92, 1.0))
add_light("reviewRim", (0.8, 3.2, 3.0), 190, 2.0, (0.72, 0.86, 1.0))

# 参考图摆在模型左边、同高同尺度：两张脸并排，比叠在一起看更容易判断
# （叠在一起时她的脸正好被我们的头挡住，等于没参考）
cam_data = bpy.data.cameras.new("reviewCam")
cam_data.lens = 38
cam = bpy.data.objects.new("reviewCam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, -7.4, 1.15)
cam.rotation_euler = (Vector((0, 0, 1.12)) - Vector(cam.location)).to_track_quat(
    "-Z", "Y").to_euler()
scene.camera = cam

# ---- 参考图背板 ----
# 量出来她的发顶在 y=103、下巴在 y=319（1080 高的原图），头高占 0.20。
# 模型头高 0.386（发顶 2.271、下巴 1.885），所以板子要放成
# 1.93 高 / 3.43 宽、中心 z=1.489 —— 两个人头一样大，才好判断像不像
img = bpy.data.images.load(REF, check_existing=True)
ref_mat = bpy.data.materials.new("ReviewRef")
ref_mat.use_nodes = True
rnodes = ref_mat.node_tree.nodes
rnodes.clear()
tex = rnodes.new("ShaderNodeTexImage")
tex.image = img
emit = rnodes.new("ShaderNodeEmission")
emit.inputs["Strength"].default_value = 1.0
rout = rnodes.new("ShaderNodeOutputMaterial")
ref_mat.node_tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
ref_mat.node_tree.links.new(emit.outputs[0], rout.inputs[0])

bpy.ops.mesh.primitive_plane_add(size=1, location=(-1.88, 0.95, 1.489))
ref = bpy.context.object
ref.name = "reviewRefImage"
ref.scale = (3.43, 1.93, 1)
ref.rotation_euler = (math.pi / 2, 0, 0)
ref.data.materials.append(ref_mat)
ref.hide_select = True

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("saved", OUT_BLEND)
