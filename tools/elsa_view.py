"""GUI 启动后把视口调成「材质预览 + 正面」：用户打开就能直接看造型。"""

import math

import bpy
from mathutils import Euler

for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type != "VIEW_3D":
            continue
        for space in area.spaces:
            if space.type != "VIEW_3D":
                continue
            # MATERIAL = 材质预览：比渲染快，但能看出皮肤 / 头发的质感
            space.shading.type = "MATERIAL"
            space.shading.use_scene_lights = True
            space.shading.use_scene_world = True
            r3d = space.region_3d
            r3d.view_perspective = "PERSP"
            r3d.view_location = (0.0, 0.0, 1.12)
            r3d.view_distance = 3.4
            # 正面：从 -Y 看过去，她的脸正对镜头
            r3d.view_rotation = Euler((math.radians(90), 0.0, 0.0)).to_quaternion()
