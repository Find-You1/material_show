"""打印关键部件的世界坐标包围盒。"""
import bpy
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=r"D:\material_show\tools\elsa.blend")
names = ["headMesh", "mouthMesh", "neck", "highCollar", "bodice", "belt",
         "upperL", "laceCapL", "skirt", "hairCap", "braidRoot", "crown"]
for name in names:
    obj = bpy.data.objects.get(name)
    if not obj:
        print(f"{name}: MISSING")
        continue
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    print(f"{name:12s} x[{lo[0]:+.3f},{hi[0]:+.3f}] "
          f"y[{lo[1]:+.3f},{hi[1]:+.3f}] z[{lo[2]:+.3f},{hi[2]:+.3f}]")
