# glTF modellarni bitta kutubxona.blend ga yig'ish (har biri PH_<nom> kolleksiya, asosi z=0, markazi 0,0)
import bpy, os, sys, json, mathutils, glob
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
MAXT = 400000
man = json.load(open(os.path.join(OUT, 'manifest.json'))); ok = []
for m in man['models']:
    g = glob.glob(os.path.join(OUT, '_gltf', m, '*.gltf'))
    if not g: continue
    before = set(bpy.data.objects)
    try: bpy.ops.import_scene.gltf(filepath=g[0])
    except Exception as e: print('!import', m, e); continue
    new = [o for o in bpy.data.objects if o not in before]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in new if o.type == 'MESH')
    if tris > MAXT:
        print('!skip', m, tris)
        for o in new: bpy.data.objects.remove(o)
        continue
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ mathutils.Vector(c) for o in new if o.type == 'MESH' for c in o.bound_box]
    if not pts: continue
    col = bpy.data.collections.new('PH_' + m); bpy.context.scene.collection.children.link(col)
    for o in new:
        for c in list(o.users_collection): c.objects.unlink(o)
        col.objects.link(o)
    mn = [min(p[i] for p in pts) for i in range(3)]; mx = [max(p[i] for p in pts) for i in range(3)]
    col.instance_offset = ((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2])
    col['h'] = mx[2] - mn[2]; col['l'] = max(mx[0] - mn[0], mx[1] - mn[1])
    ok.append(m); print('lib', m, round(col['h'], 2), round(col['l'], 2), len(new), tris)
for c in list(bpy.context.scene.collection.children): bpy.context.scene.collection.children.unlink(c)
for c in bpy.data.collections: c.use_fake_user = True
bpy.ops.outliner.orphans_purge(do_recursive=True) if hasattr(bpy.ops.outliner, 'orphans_purge') else None
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'kutubxona.blend'), compress=True)
man['models'] = ok; json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print('LIB_OK', len(ok))
