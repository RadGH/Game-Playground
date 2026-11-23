# Check render: a body wearing a baked atlas (shots/<body>_<outfit>_look_*.png), A-pose and rest views.
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L, tb_pose as P
body, outfit = sys.argv[sys.argv.index("--") + 1:][:2]
atlas = sys.argv[sys.argv.index("--") + 3] if len(sys.argv) > sys.argv.index("--") + 3 else os.path.join(L.TABARD, "build", f"{body}_{outfit}_atlas.png")
bpy.ops.wm.open_mainfile(filepath=L.final_blend(body))
mesh = bpy.data.objects["Body"]; arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
m = bpy.data.materials.new("look"); m.use_nodes = True
b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); b.inputs["Roughness"].default_value = 1.0
t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(atlas)
# painted lighting is in the texture: show it mostly as is (emission) with a little real light for form
em = m.node_tree.nodes.new("ShaderNodeEmission"); m.node_tree.links.new(t.outputs[0], em.inputs[0]); em.inputs[1].default_value = 0.75
ad = m.node_tree.nodes.new("ShaderNodeAddShader"); out = next(n for n in m.node_tree.nodes if n.type == "OUTPUT_MATERIAL")
m.node_tree.links.new(t.outputs[0], b.inputs["Base Color"]); b.inputs["Base Color"].default_value = (1, 1, 1, 1)
m.node_tree.links.new(b.outputs[0], ad.inputs[0]); m.node_tree.links.new(em.outputs[0], ad.inputs[1]); m.node_tree.links.new(ad.outputs[0], out.inputs[0])
mesh.data.materials.clear(); mesh.data.materials.append(m)
# swap-in pieces: shown only when named (TB_GEO="robe,bootcuff_l,..."), wearing the same atlas
show = [g for g in os.environ.get("TB_GEO", "").split(",") if g]
for o in bpy.data.objects:
    if o.name.startswith("geo_"):
        o.data.materials.clear(); o.data.materials.append(m)
        o.hide_render = o.name[4:] not in show
P.a_pose(arm, 30)
L.studio(sun=0.8)
L.shot(os.path.join(L.TABARD, "shots", f"{body}_{outfit}_look"), views=("front", "three_quarter", "back", "left"), center=(0, 0, 0.95), dist=2.6, size=512, lens=40)
