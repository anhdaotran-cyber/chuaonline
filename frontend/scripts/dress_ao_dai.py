"""Cover the realistic devotees with a plain silk ao dai over their existing body."""
import bpy
import bmesh
from mathutils import Vector

SRC = {
    False: "/Users/ttcmobile/chuaonline/frontend/public/models/devotee.glb",
    True: "/Users/ttcmobile/chuaonline/frontend/public/models/devotee-nu.glb",
}
OUT = {
    False: "/Users/ttcmobile/chuaonline/frontend/public/models/devotee-aodai.glb",
    True: "/Users/ttcmobile/chuaonline/frontend/public/models/devotee-aodai-nu.glb",
}


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def silk_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.42
    bsdf.inputs["Metallic"].default_value = 0.02
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
    return mat


def flatten_cloth(obj, slot_name):
    for mat in obj.data.materials:
        mat.name = slot_name
        if not mat.use_nodes:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        for link in list(mat.node_tree.links):
            if link.to_node == bsdf:
                mat.node_tree.links.remove(link)
        bsdf.inputs["Base Color"].default_value = (0.95, 0.93, 0.9, 1)
        bsdf.inputs["Roughness"].default_value = 0.48
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = 1.0
        mat.blend_method = "OPAQUE"


def tunic_from_suit(suit):
    """One smooth back panel, the part of an ao dai you see from behind."""
    world = [suit.matrix_world @ v.co for v in suit.data.vertices]
    ys = sorted(v.y for v in world)
    back = [v for v in world if v.y >= ys[int(len(ys) * 0.55)]]
    xs = [v.x for v in back]
    zs = [v.z for v in back]
    x_mid = (min(xs) + max(xs)) / 2
    half = (max(xs) - min(xs)) * 0.55
    z_top = sorted(zs)[int(len(zs) * 0.9)]
    z_bot = sorted(zs)[int(len(zs) * 0.08)]
    y = max(v.y for v in back) + 0.008

    bm = bmesh.new()
    cols, rows = 8, 16
    grid = []
    for r in range(rows + 1):
        t = r / rows
        row = []
        z = z_top + (z_bot - z_top) * t
        flare = 1 + 0.22 * t
        for c in range(cols + 1):
            u = c / cols
            x = x_mid + (u - 0.5) * 2 * half * flare
            bend = 0.025 * (1 - abs(u - 0.5) * 2) ** 2
            row.append(bm.verts.new((x, y + bend, z)))
        grid.append(row)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    mesh = bpy.data.meshes.new("AoDai")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("AoDai", mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj.data.materials.append(silk_material("clothes.suit", (0.96, 0.94, 0.9)))
    return obj


def collar(suit):
    world = [suit.matrix_world @ v.co for v in suit.data.vertices]
    zs = sorted(v.z for v in world)
    neck_z = zs[int(len(zs) * 0.9)]
    band = [v for v in world if abs(v.z - neck_z) < 0.03]
    if not band:
        band = world
    center = sum(band, Vector()) / len(band)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.062,
        minor_radius=0.012,
        major_segments=28,
        minor_segments=8,
        location=(center.x, center.y, neck_z),
    )
    obj = bpy.context.active_object
    obj.name = "AoDaiCollar"
    obj.data.materials.append(silk_material("clothes.suit", (0.96, 0.94, 0.9)))
    return obj


def dress(female):
    clear()
    bpy.ops.import_scene.gltf(filepath=SRC[female])
    suit = None
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        name = obj.name.lower()
        if "suit" in name:
            suit = obj
            flatten_cloth(obj, "clothes.pant")
        elif "shoe" in name:
            flatten_cloth(obj, "clothes.shoe")
            for mat in obj.data.materials:
                bsdf = mat.node_tree.nodes.get("Principled BSDF")
                if bsdf:
                    bsdf.inputs["Base Color"].default_value = (0.16, 0.11, 0.09, 1)
                    bsdf.inputs["Roughness"].default_value = 0.7
    bpy.ops.object.select_all(action="SELECT")
    path = OUT[female]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True)
    print("wrote", path)
    return path


def render(path, outfile, location, target):
    clear()
    bpy.ops.import_scene.gltf(filepath=path)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.filepath = outfile
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.color = (0.55, 0.5, 0.46)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 48
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector(location)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.6
    sun_obj = bpy.data.objects.new("Sun", sun)
    sun_obj.rotation_euler = (0.85, 0.15, 0.5)
    bpy.context.collection.objects.link(sun_obj)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    female = dress(True)
    male = dress(False)
    render(female, "/tmp/aodai-f-back.png", (0.9, 1.7, 1.25), (0.05, 0.05, 0.7))
    render(female, "/tmp/aodai-f-front.png", (1.15, -1.7, 1.15), (0.05, 0.0, 0.7))
    render(male, "/tmp/aodai-m-back.png", (0.9, 1.7, 1.25), (0.05, 0.05, 0.7))
