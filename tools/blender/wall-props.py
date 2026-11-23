# Gives the game's cut-away props walls: assets/vacuum-chamber.glb and assets/piston-housing.glb.
#   "<blender>" --background --python-exit-code 1 --python tools/blender/wall-props.py -- assets/vacuum-chamber.glb 0.02
#   "<blender>" --background --python-exit-code 1 --python tools/blender/wall-props.py -- assets/piston-housing.glb 0.003
# Meshy drew each prop's side wall as one skin, so where the 3D view cuts the near half away
# (view3d.js) the cut read as paper, and the inside of the wall was the skin's back. This thickens
# the side wall inward by the given metres, so the outer size the renderer scales by, the wall
# radius in the node's extras, is unchanged, and the inside is a face of its own. The lids, flanges
# and ribs are left alone: Meshy drew those solid already. It keeps the node's name, its extras,
# Y up, the origin and the smooth normals, and writes one untextured mesh with no material, in
# place, as the clean-* scripts did. The same input, the same thickness and the same Blender
# release write the same bytes; the register (docs/ASSETS.md) records the release and the hash.
# Needs Blender 5.3 (its glTF add-on ships with it). Run from the repository's root.
import bpy, bmesh, sys, os, math

argv = sys.argv[sys.argv.index('--') + 1:]
if len(argv) != 2: sys.exit('usage: wall-props.py PROP.glb THICKNESS_METRES')
path, thickness = os.path.abspath(argv[0]), float(argv[1])

bpy.ops.wm.read_factory_settings(use_empty=True)
# Merged: the file splits its vertices along the normals' seams, and a skin thickened in pieces
# grows a rim at every seam.
bpy.ops.import_scene.gltf(filepath=path, merge_vertices=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
if len(meshes) != 1: sys.exit(f'{path} holds {len(meshes)} meshes, not one')
prop = meshes[0]
radius = prop.get('wallRadius')
if not radius: sys.exit(f'{path} gives no wall radius')
bpy.context.view_layer.objects.active = prop
prop.select_set(True)
size = [(min(v.co[a] for v in prop.data.vertices), max(v.co[a] for v in prop.data.vertices)) for a in range(3)]

# The wall is the band of faces at the wall radius, give or take five hundredths (the ribs and
# rings start at six), that face nearly straight out, away from the lids: the lids' own rims sit
# at the wall radius too, and they are solid already. (Blender's Z is the file's Y, up.)
half = max(abs(v[2]) for v in prop.bound_box)
def on_wall(f):
    r = [math.hypot(v.co.x, v.co.y) for v in f.verts]
    return all(abs(x - radius) < radius * 0.05 for x in r) and abs(f.normal.z) < 0.2 and abs(f.calc_center_median().z) < 0.9 * half

# Cut the wall off as its own mesh and thicken that; the rest waits, and is joined back after.
wall_bm = bmesh.new(); wall_bm.from_mesh(prop.data)
rest_bm = bmesh.new(); rest_bm.from_mesh(prop.data)
wall_faces = [f for f in wall_bm.faces if on_wall(f)]
if not wall_faces: sys.exit(f'{path} has no faces on its wall')
# The thickening goes in: a wall face's normal points away from the axis, whichever way Meshy
# left it. Blender's own recalculation goes by neighbours, and the skin is not one closed surface.
for f in wall_faces:
    c = f.calc_center_median()
    if f.normal.dot((c.x, c.y, 0)) < 0: f.normal_flip()
bmesh.ops.delete(wall_bm, geom=[f for f in wall_bm.faces if f not in wall_faces], context='FACES')
bmesh.ops.delete(rest_bm, geom=[f for f in rest_bm.faces if on_wall(f)], context='FACES')
wall_bm.to_mesh(prop.data); wall_bm.free()
rest_mesh = bpy.data.meshes.new('rest'); rest_bm.to_mesh(rest_mesh); rest_bm.free()
rest = bpy.data.objects.new('rest', rest_mesh); bpy.context.collection.objects.link(rest)
print(f'{len(wall_faces)} of {len(wall_faces) + len(rest_mesh.polygons)} faces are the wall')

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.customdata_custom_splitnormals_clear()
bpy.ops.object.mode_set(mode='OBJECT')
# Inward (offset -1 is against the normals), each point moved its own normal's way by the thickness
# and no further: an even offset, which stretches the move at folds to keep slopes evenly thick,
# throws points kilometres out where Meshy's mesh folds back on itself. The rim closes the wall
# where it meets the lids and ribs, so the cut shows two faces and the gap between them.
solidify = prop.modifiers.new('wall', 'SOLIDIFY')
solidify.thickness = thickness
solidify.offset = -1
solidify.use_even_offset = False
solidify.use_rim = True
bpy.ops.object.modifier_apply(modifier='wall')

rest.select_set(True); prop.select_set(True); bpy.context.view_layer.objects.active = prop
bpy.ops.object.join()
# Smooth across the round faces, sharp where faces meet at more than 30 degrees, on the new inner
# face as on the old outer one: flat-shaded, a cut-away barrel reads as stripes.
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))

# The outer size is unchanged: the thickening went in.
for axis in range(3):
    lo, hi = min(v.co[axis] for v in prop.data.vertices), max(v.co[axis] for v in prop.data.vertices)
    if abs(lo - size[axis][0]) > 1e-3 or abs(hi - size[axis][1]) > 1e-3:
        sys.exit(f'{path} grew on axis {axis}: {size[axis]} to {(lo, hi)}')

# One mesh, no material, with normals; no animation, skin, camera or light; the extras kept.
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_materials='NONE', export_normals=True, export_tangents=False,
                          export_texcoords=False, export_vertex_color='NONE', export_attributes=False, export_extras=True,
                          export_animations=False, export_skins=False, export_morph=False, export_cameras=False,
                          export_lights=False, export_image_format='NONE')
print(f'wrote {path}: {len(prop.data.polygons)} faces after a {thickness} m wall')
