"""渲染 elsa.blend 的正面 / 四分之三 / 头部特写，用于检查造型。"""

import math
import os

import bpy
from mathutils import Vector

BLEND = r"D:\material_show\tools\elsa.blend"
OUT = r"C:\Users\Lenovo\AppData\Local\Temp\elsa"

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
os.makedirs(OUT, exist_ok=True)

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.film_transparent = False
scene.render.resolution_x = 640
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
# 预览用 Standard：AgX 会把浅色压成一片灰白，看不出裙子的冰蓝和肤色
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0

world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
# 5.0 里新建 world 打开 use_nodes 后节点树是空的，取不到 "Background"
nodes = world.node_tree.nodes
nodes.clear()
bg = nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (0.015, 0.022, 0.032, 1)
bg.inputs[1].default_value = 1.0
out = nodes.new("ShaderNodeOutputWorld")
world.node_tree.links.new(bg.outputs[0], out.inputs[0])

# 地面：只为了让剪影有落点
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
floor = bpy.context.object
floor_mat = bpy.data.materials.new("Floor")
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


add_light("key", (-2.4, -3.0, 3.4), 95, 2.4, (1.0, 0.97, 0.92))
add_light("fill", (2.8, -2.2, 1.8), 34, 2.8, (0.86, 0.92, 1.0))
add_light("rim", (0.8, 3.2, 3.0), 190, 2.0, (0.72, 0.86, 1.0))

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam


def shoot(name, loc, target, ortho=None, lens=70, res=(640, 900), crop=None):
    cam.location = loc
    direction = Vector(target) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lens
    scene.render.resolution_x, scene.render.resolution_y = res
    if crop:
        scene.render.use_border = True
        scene.render.use_crop_to_border = True
        scene.render.border_min_x, scene.render.border_max_x = crop[0], crop[1]
        scene.render.border_min_y, scene.render.border_max_y = crop[2], crop[3]
    else:
        scene.render.use_border = False
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("rendered", name)


shoot("front.png", (0, -6.0, 1.13), (0, 0, 1.13), ortho=2.55)
shoot("three_q.png", (2.6, -5.2, 1.7), (0, 0, 1.15), ortho=2.55)
shoot("head.png", (0, -4.0, 2.02), (0, 0, 2.02), ortho=0.50, res=(640, 640))
shoot("head_q.png", (1.6, -3.6, 2.06), (0, 0, 2.00), ortho=0.50, res=(640, 640))
print("done")
