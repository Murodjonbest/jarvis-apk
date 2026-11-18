# glTF modellarni bitta kutubxona.blend ga yig'ish (har biri PH_<nom> kolleksiya, asosi z=0, markazi 0,0)
import bpy, os, sys, json, mathutils, glob
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)

import numpy as np, bmesh, random
def thin(o, target):
    """Barglarni siyraklashtirish: mayda 'orolchalar' (barglar)ning bir qismini qoldirib, kattalashtiradi; tana/shoxlar to'liq qoladi."""
    me = o.data; nv, nf = len(me.vertices), len(me.polygons)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris <= target: return tris
    ev = np.zeros(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', ev); a, b = ev[0::2], ev[1::2]
    lab = np.arange(nv)
    for it in range(5000):
        m = np.minimum(lab[a], lab[b]); old = lab.copy(); np.minimum.at(lab, a, m); np.minimum.at(lab, b, m); lab = lab[lab]
        if np.array_equal(old, lab): break
    ls = np.zeros(nf, np.int64); me.polygons.foreach_get('loop_start', ls); lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    fl = lab[lv[ls]]; ids, cnt = np.unique(fl, return_counts=True)
    big = set(ids[cnt > 400].tolist()); small = ids[cnt <= 400]
    if len(small) < 500: return tris
    f = max(0.08, min(1.0, target / tris)); rng = np.random.default_rng(7)
    keep_small = set(small[rng.random(len(small)) < f].tolist()); keep = big | keep_small
    co = np.zeros(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    cntv = np.bincount(lab, minlength=nv).astype(float); cntv[cntv == 0] = 1
    cen = np.stack([np.bincount(lab, weights=co[:, i], minlength=nv) for i in range(3)], 1) / cntv[:, None]
    k = min(1.9, 1 / np.sqrt(f)); ks = np.array(sorted(keep_small)); msk = np.isin(lab, ks)
    co[msk] = cen[lab[msk]] + (co[msk] - cen[lab[msk]]) * k; me.vertices.foreach_set('co', co.ravel()); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    kill = [bm.faces[i] for i in np.nonzero(~np.isin(fl, np.array(sorted(keep))))[0]]
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(me); bm.free(); me.update()
    nt = sum(len(p.vertices) - 2 for p in me.polygons); print('thin', o.name, tris, '->', nt, 'k=%.2f' % k); return nt
MAXT = 450000
man = json.load(open(os.path.join(OUT, 'manifest.json'))); ok = []
for m in man['models']:
    g = glob.glob(os.path.join(OUT, '_gltf', m, '*.gltf'))
    if not g: continue
    before = set(bpy.data.objects)
    try: bpy.ops.import_scene.gltf(filepath=g[0])
    except Exception as e: print('!import', m, e); continue
    new = [o for o in bpy.data.objects if o not in before]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in new if o.type == 'MESH')
    if tris > MAXT and 'tree' in m:
        tris = sum(thin(o, 260000 * len(o.data.polygons) / max(1, sum(len(x.data.polygons) for x in new if x.type == 'MESH'))) for o in new if o.type == 'MESH')
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
