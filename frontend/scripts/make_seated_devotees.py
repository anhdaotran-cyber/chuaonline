"""Cross-legged devotee with palms together, generated with Blender's skin modifier."""
import bpy
from mathutils import Vector

OUT_DIR = "/Users/ttcmobile/chuaonline/frontend/public/models"


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def new_material(name, color, roughness=0.55):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def build(female):
    mesh = bpy.data.meshes.new("Devotee")
    obj = bpy.data.objects.new("Devotee", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj

    shoulder_x = 0.15 if female else 0.17
    points = {
        "pelvis": (0.0, 0.02, 0.18),
        "belly": (0.0, -0.02, 0.30),
        "spine": (0.0, 0.0, 0.38),
        "chest": (0.0, -0.02, 0.48),
        "neck": (0.0, -0.02, 0.57),
        "head": (0.0, -0.03, 0.69),
        "hair": (0.0, 0.045, 0.76),
        "lsh": (-shoulder_x, -0.02, 0.50),
        "lel": (-0.15, -0.15, 0.41),
        "lwr": (-0.025, -0.20, 0.50),
        "rsh": (shoulder_x, -0.02, 0.50),
        "rel": (0.15, -0.15, 0.41),
        "rwr": (0.025, -0.20, 0.50),
        "palms": (0.0, -0.205, 0.52),
        "tips": (0.0, -0.215, 0.62),
        "lhip": (-0.10, 0.02, 0.15),
        "lknee": (-0.30, -0.02, 0.11),
        "lfoot": (0.14, -0.16, 0.045),
        "rhip": (0.10, 0.02, 0.15),
        "rknee": (0.30, -0.02, 0.11),
        "rfoot": (-0.12, -0.12, 0.06),
    }
    order = list(points.keys())
    mesh.from_pydata([points[k] for k in order], [], [])
    index = {name: i for i, name in enumerate(order)}

    def link(a, b):
        mesh.edges.add(1)
        mesh.edges[-1].vertices = (index[a], index[b])

    pairs = [
        ("pelvis", "belly"), ("belly", "spine"), ("spine", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "hair"),
        ("chest", "lsh"), ("lsh", "lel"), ("lel", "lwr"), ("lwr", "palms"),
        ("chest", "rsh"), ("rsh", "rel"), ("rel", "rwr"), ("rwr", "palms"), ("palms", "tips"),
        ("pelvis", "lhip"), ("lhip", "lknee"), ("lknee", "lfoot"),
        ("pelvis", "rhip"), ("rhip", "rknee"), ("rknee", "rfoot"),
    ]
    for a, b in pairs:
        link(a, b)
    mesh.update()

    skin = obj.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.4
    radii = {
        "pelvis": 0.13, "belly": 0.12, "spine": 0.115, "chest": 0.13, "neck": 0.05, "head": 0.10,
        "hair": 0.075,
        "lsh": 0.05, "lel": 0.04, "lwr": 0.03,
        "rsh": 0.05, "rel": 0.04, "rwr": 0.03,
        "palms": 0.028, "tips": 0.02,
        "lhip": 0.08, "lknee": 0.062, "lfoot": 0.042,
        "rhip": 0.08, "rknee": 0.062, "rfoot": 0.042,
    }
    layer = mesh.skin_vertices[0].data
    for name, i in index.items():
        radius = radii[name]
        layer[i].radius = (radius, radius)
        layer[i].use_loose = False
        layer[i].use_root = name == "pelvis"

    def apply_mod(name):
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.context.view_layer.update()
        before = len(obj.data.vertices)
        with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj]):
            result = bpy.ops.object.modifier_apply(modifier=name)
        xs = [v.co.x for v in obj.data.vertices]
        ys = [v.co.y for v in obj.data.vertices]
        zs = [v.co.z for v in obj.data.vertices]
        print(
            " apply", name, result, "verts", before, "->", len(obj.data.vertices),
            "bbox", round(min(xs), 3), round(max(xs), 3), round(min(ys), 3), round(max(ys), 3), round(min(zs), 3), round(max(zs), 3),
        )

    apply_mod("Skin")
    remesh = obj.modifiers.new("Remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.012
    remesh.use_smooth_shade = True
    smooth = obj.modifiers.new("Smooth", "SMOOTH")
    smooth.factor = 0.5
    smooth.iterations = 6
    apply_mod("Remesh")
    apply_mod("Smooth")

    cloth = new_material("clothes.suit", (0.95, 0.92, 0.87), 0.52)
    skin_mat = new_material("body.skin", (0.80, 0.60, 0.46), 0.58)
    hair_mat = new_material("body.hair", (0.06, 0.045, 0.04), 0.7)
    shoe = new_material("clothes.shoe", (0.11, 0.08, 0.07), 0.75)
    for mat in (cloth, skin_mat, hair_mat, shoe):
        mesh.materials.append(mat)

    joints = {name: Vector(points[name]) for name in points}
    for poly in mesh.polygons:
        poly.use_smooth = True
        center = Vector((0, 0, 0))
        for vi in poly.vertices:
            center += mesh.vertices[vi].co
        center /= len(poly.vertices)
        nearest = min(joints, key=lambda name: (joints[name] - center).length)
        if nearest.startswith("hair"):
            poly.material_index = 2
        elif nearest == "head" or nearest in {"palms", "tips"}:
            poly.material_index = 1
        else:
            poly.material_index = 0

    print("body before hair", female, len(mesh.vertices))
    if female:
        hair = add_long_hair()
        bpy.ops.object.select_all(action="DESELECT")
        hair.select_set(True)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        mesh = obj.data

    print(female, "verts", len(mesh.vertices), "faces", len(mesh.polygons))
    return obj


def add_long_hair():
    mesh = bpy.data.meshes.new("Hair")
    obj = bpy.data.objects.new("Hair", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    coords = [(0.0, 0.06, 0.74), (0.0, 0.09, 0.60), (0.0, 0.11, 0.46)]
    mesh.from_pydata(coords, [(0, 1), (1, 2)], [])
    mesh.update()
    skin = obj.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    layer = mesh.skin_vertices[0].data
    for i, radius in enumerate((0.055, 0.042, 0.032)):
        layer[i].radius = (radius, radius)
        layer[i].use_root = i == 0
    bpy.ops.object.modifier_apply(modifier="Skin")
    hair_mat = new_material("body.hair", (0.06, 0.045, 0.04), 0.7)
    mesh.materials.append(hair_mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
        poly.material_index = 0
    return obj


def export(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


def render_preview(path, outfile, location, target):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=path)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.filepath = outfile
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.62, 0.56, 0.5)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 48
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector(location)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.2
    sun_obj = bpy.data.objects.new("Sun", sun)
    sun_obj.rotation_euler = (0.9, 0.1, -0.4)
    bpy.context.collection.objects.link(sun_obj)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    clear_scene()
    male = build(False)
    export(male, f"{OUT_DIR}/devotee-sit.glb")
    female = male.copy()
    female.data = male.data.copy()
    bpy.context.collection.objects.link(female)
    hair = add_long_hair()
    bpy.ops.object.select_all(action="DESELECT")
    hair.select_set(True)
    female.select_set(True)
    bpy.context.view_layer.objects.active = female
    bpy.ops.object.join()
    export(bpy.context.view_layer.objects.active, f"{OUT_DIR}/devotee-sit-nu.glb")
    render_preview(f"{OUT_DIR}/devotee-sit-nu.glb", "/tmp/seated-front.png", (0.9, -1.7, 0.95), (0, -0.05, 0.4))
    render_preview(f"{OUT_DIR}/devotee-sit.glb", "/tmp/seated-back.png", (0.35, 1.9, 1.55), (0, -0.04, 0.28))
