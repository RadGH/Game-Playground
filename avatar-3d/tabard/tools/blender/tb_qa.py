# Tabard mesh health check (headless): holes, inside-out faces, loose bits, per mesh in models/<body>.glb.
# Writes build/qa_<body>.json. Usage: blender -b --python tb_qa.py -- <body>
import bpy, bmesh, os, sys, json
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L
body = sys.argv[sys.argv.index("--") + 1]
L.reset(); L.import_glb(os.path.join(L.TABARD, "models", body + ".glb"))
out = {}
for o in bpy.data.objects:
    if o.type != "MESH" or o.name.startswith("Icosphere"): continue   # Icosphere = the importer's bone display shape
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)   # glTF splits UV seams; weld before judging holes
    bm.normal_update()
    boundary = [e for e in bm.edges if e.is_boundary]
    nonman = [e for e in bm.edges if not e.is_manifold and not e.is_boundary]
    # inside-out: a face whose normal points toward the mesh centre line of its nearest bone is hard; use a ray test:
    # cast from just outside the face along its normal; count hits on the same mesh (odd = we started inside = flipped)
    bvh_bm = bm.copy()
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromBMesh(bm)
    flipped = []
    for f in bm.faces:
        c = f.calc_center_median(); n = f.normal
        if n.length < 1e-9: continue
        p = c + n * 1e-4; hits = 0; d = n.copy()
        while True:
            loc, nn, idx, dist = bvh.ray_cast(p, d)
            if loc is None: break
            hits += 1; p = loc + d * 1e-4
            if hits > 50: break
        if hits % 2 == 1: flipped.append(f.index)
    # loose islands
    seen = set(); islands = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; seen.add(v.index); n = 0
        while stack:
            x = stack.pop(); n += 1
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); stack.append(y)
        islands.append(n)
    hole_pts = [list(map(lambda a: round(a, 3), (e.verts[0].co + e.verts[1].co) / 2)) for e in boundary[:40]]
    out[o.name] = dict(tris=sum(len(f.verts) - 2 for f in bm.faces), boundary_edges=len(boundary), nonmanifold=len(nonman),
                       flipped_faces=len(flipped), islands=sorted(islands, reverse=True)[:8], hole_samples=hole_pts)
    bm.free()
# rules: the body is one closed skin (no holes, nothing inside-out, one piece); swap-in pieces are open tubes, so only
# their edges must be clean (inside-out is meaningless for an open tube)
for k, v in out.items():
    if k == "Body": v["ok"] = v["boundary_edges"] == 0 and v["nonmanifold"] == 0 and v["flipped_faces"] == 0 and len(v["islands"]) == 1
    elif k.startswith("geo_"): v["ok"] = v["nonmanifold"] == 0 and len(v["islands"]) == 1
    elif k == "face_layer": v["ok"] = v["nonmanifold"] == 0 and len(v["islands"]) == 1   # an open sheet over the face
    else: v["ok"] = False; v["why"] = "stray object in the body file"
    print(f"QACHECK {body} {'PASS' if v['ok'] else 'FAIL'} {k}")
p = os.path.join(L.TABARD, "build", f"qa_{body}.json"); json.dump(out, open(p, "w"), indent=1)
print("QA", body, json.dumps({k: {kk: v[kk] for kk in ("tris", "boundary_edges", "nonmanifold", "flipped_faces", "islands")} for k, v in out.items()}))
