"""打印 KH3 各部件（头/嘴/眼/睫毛）的包围盒，确认眼球到底在哪。"""

import bmesh
import bpy

SRC = r"C:\Users\Lenovo\AppData\Local\Temp\elsa\kh3\V8NWJ7X2AH6UB9V3CMOUYFSMQ.obj"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)
src = next(o for o in bpy.context.selected_objects if o.type == "MESH")

for idx, m in enumerate(src.data.materials):
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.faces.ensure_lookup_table()
    verts = set()
    for f in bm.faces:
        if f.material_index == idx:
            verts.update(f.verts)
    if not verts:
        bm.free()
        continue
    lo = [min(v.co[i] for v in verts) for i in range(3)]
    hi = [max(v.co[i] for v in verts) for i in range(3)]
    print(m.name, "faces", len(bm.faces),
          "bbox", [round(v, 3) for v in lo], [round(v, 3) for v in hi])
    bm.free()
