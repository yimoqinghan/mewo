"""Build the Yanmiao hero cat as editable Blender geometry and export a GLB.

This file intentionally creates separate geometry for every visible part.  The
reference image is loaded as a front-view modelling guide only; it is never
packed into or exported with the runtime model.  Run with Blender 4.x/5.x:

    blender --background --python tools/blender/build_yanmiao_cat.py

Outputs:
    art/yanmiao-cat.blend
    miniprogram/assets/models/yanmiao-cat.glb

The supplied reference is a single front view.  The front silhouette and
accessory placement are therefore matched to that view; the rear surfaces are
constructed as a consistent 3D continuation and should be reviewed in Blender
before calling the asset production-ready.
"""

import math
import os
from mathutils import Vector

import bpy


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
REFERENCE_IMAGE = os.path.join(PROJECT_ROOT, "miniprogram/assets/design/cat-home.png")
TURNAROUND_IMAGE = os.path.join(PROJECT_ROOT, "art/yanmiao-cat-turnaround.png")
TOUCH_TURNAROUND_IMAGE = os.path.join(PROJECT_ROOT, "art/yanmiao-cat-touch-turnaround.png")
MENU_TURNAROUND_IMAGE = os.path.join(PROJECT_ROOT, "art/yanmiao-cat-menu-turnaround.png")
TEXTURE_DIR = os.path.join(PROJECT_ROOT, "art/textures/yanmiao-cat")
VARIANT = os.environ.get("YANMIAO_VARIANT", "home")
BLEND_OUTPUT = os.path.join(PROJECT_ROOT, "art/yanmiao-cat.blend")
GLB_OUTPUT = os.path.join(PROJECT_ROOT, "miniprogram/assets/models/yanmiao-cat.glb")
if VARIANT in ("touch", "menu"):
    BLEND_OUTPUT = os.path.join(PROJECT_ROOT, f"art/yanmiao-cat-{VARIANT}.blend")
    GLB_OUTPUT = os.path.join(PROJECT_ROOT, f"miniprogram/assets/models/yanmiao-cat-{VARIANT}.glb")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def collection(name="YNM_CAT_MODEL"):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def move_to_collection(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def material(name, color, roughness=0.5, metallic=0.0, specular=0.35):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = specular
    return mat


def make_texture_map(name, base, accent, size=128):
    """Create a small per-material albedo map; never use the whole design image."""
    os.makedirs(TEXTURE_DIR, exist_ok=True)
    image_name = f"YNM_{name}_ALBEDO"
    image = bpy.data.images.get(image_name) or bpy.data.images.new(
        image_name, width=size, height=size, alpha=False
    )
    pixels = []
    for y in range(size):
        v = y / max(1, size - 1)
        for x in range(size):
            u = x / max(1, size - 1)
            # Deterministic directional breakup gives fur, fabric and foam a
            # usable texture map without baking the reference artwork into it.
            grain = (
                math.sin((u * 37.0 + v * 11.0) * math.pi)
                + math.sin((u * 71.0 - v * 19.0) * math.pi)
                + math.sin((u * 13.0 + v * 47.0) * math.pi)
            ) / 3.0
            mix = max(0.0, min(1.0, 0.50 + grain * 0.18 + (v - 0.5) * 0.08))
            shade = 0.86 + 0.18 * mix
            pixels.extend((
                min(1.0, (base[0] * (1.0 - mix) + accent[0] * mix) * shade),
                min(1.0, (base[1] * (1.0 - mix) + accent[1] * mix) * shade),
                min(1.0, (base[2] * (1.0 - mix) + accent[2] * mix) * shade),
                1.0,
            ))
    image.pixels = pixels
    image.filepath_raw = os.path.join(TEXTURE_DIR, f"{name}_albedo.png")
    image.file_format = "PNG"
    image.save()
    return image


def attach_texture_map(mat, image, bump_strength=0.08):
    """Attach a real embedded albedo + procedural micro-normal to a material."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    texcoord = nodes.new("ShaderNodeTexCoord")
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.name = f"{image.name}_IMAGE"
    image_node.image = image
    image_node.interpolation = "Linear"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 38.0
    noise.inputs["Detail"].default_value = 4.5
    noise.inputs["Roughness"].default_value = 0.78
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.035
    links.new(texcoord.outputs["UV"], image_node.inputs["Vector"])
    links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # Pack maps into the GLB so the mini-program does not need a second asset URL.
    try:
        image.pack()
    except RuntimeError:
        pass


def unwrap_meshes(col):
    """Give every exported mesh independent UVs for its own material map."""
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for obj in list(col.objects):
        if obj.type != "MESH" or obj.name.startswith("PREVIEW_"):
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.025)
            bpy.ops.object.mode_set(mode="OBJECT")
        except RuntimeError:
            if bpy.context.object and bpy.context.object.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")


def add_rig(root, col):
    """Build a named rigid-part rig and actions exported with the GLB."""
    arm_data = bpy.data.armatures.new("YNM_CAT_ARMATURE")
    armature = bpy.data.objects.new("YNM_CAT_RIG", arm_data)
    col.objects.link(armature)
    armature.parent = root
    armature.show_in_front = True

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {}

    def bone(name, head, tail, parent=None):
        item = arm_data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        if parent:
            item.parent = bones[parent]
            item.use_connect = False
        bones[name] = item
        return item

    bone("root", (0, 0, 0), (0, 0, 0.7))
    bone("pelvis", (0, 0, 0.65), (0, 0, 1.2), "root")
    bone("spine", (0, 0, 1.1), (0, 0, 2.0), "pelvis")
    bone("chest", (0, 0, 1.9), (0, 0, 2.75), "spine")
    bone("neck", (0, 0, 2.65), (0, 0, 3.25), "chest")
    bone("head", (0, 0, 3.15), (0, 0, 4.55), "neck")
    for sign, side in ((-1, "L"), (1, "R")):
        bone(f"ear.{side}", (sign * 0.82, 0, 4.35), (sign * 1.08, 0, 5.18), "head")
        bone(f"upper_arm.{side}", (sign * 0.72, 0, 2.35), (sign * 0.82, 0, 1.55), "chest")
        bone(f"forearm.{side}", (sign * 0.82, 0, 1.65), (sign * 0.72, 0, 0.92), f"upper_arm.{side}")
        bone(f"paw.{side}", (sign * 0.72, 0, 0.95), (sign * 0.72, 0, 0.36), f"forearm.{side}")
        bone(f"thigh.{side}", (sign * 0.72, 0, 1.12), (sign * 0.82, 0, 0.62), "pelvis")
        bone(f"shin.{side}", (sign * 0.82, 0, 0.65), (sign * 0.62, 0, 0.26), f"thigh.{side}")
        bone(f"foot.{side}", (sign * 0.62, 0, 0.28), (sign * 0.62, -0.2, 0.05), f"shin.{side}")
    bone("tail.01", (-0.95, 0.08, 1.45), (-1.55, 0.08, 1.65), "pelvis")
    bone("tail.02", (-1.55, 0.08, 1.65), (-1.85, 0.06, 2.2), "tail.01")
    bone("tail.03", (-1.85, 0.06, 2.2), (-1.55, 0.04, 2.75), "tail.02")
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)

    def side_for(name):
        if "left" in name or name.endswith("_L"):
            return "L"
        if "right" in name or name.endswith("_R"):
            return "R"
        return None

    def target_bone(obj):
        name = obj.name.lower()
        side = side_for(name)
        if name == "tail_root":
            return "tail.01"
        if name.startswith("tail_"):
            return "tail.02"
        if any(token in name for token in ("head", "eye_", "muzzle", "nose", "mouth", "glasses", "headphone", "ear_", "whisker")):
            return "head" if not name.startswith("ear_") else f"ear.{side or 'L'}"
        if name.startswith("front_paw") or name.startswith("front_leg"):
            return f"paw.{side or 'L'}" if "paw" in name else f"upper_arm.{side or 'L'}"
        if name.startswith("back_"):
            return f"thigh.{side or 'L'}"
        if any(token in name for token in ("bag", "collar", "charm", "chest")):
            return "chest"
        if name.startswith("body_"):
            return "spine"
        return "root"

    # Bone-parent independent accessories and groups. Mesh body/head get a
    # rigid armature modifier so this remains a real bind, not a visual fake.
    for obj in list(col.objects):
        if obj in (armature, root) or obj.type in ("CAMERA", "LIGHT") or obj.name.startswith("REFERENCE_"):
            continue
        target = target_bone(obj)
        if obj.type == "MESH" and obj.name in ("body_fur", "head_fur"):
            world = obj.matrix_world.copy()
            obj.parent = armature
            obj.parent_type = "OBJECT"
            obj.matrix_world = world
            group = obj.vertex_groups.get(target) or obj.vertex_groups.new(name=target)
            group.add([vertex.index for vertex in obj.data.vertices], 1.0, "REPLACE")
            modifier = obj.modifiers.new("YNM_RIG_BIND", "ARMATURE")
            modifier.object = armature
            continue
        world = obj.matrix_world.copy()
        obj.parent = armature
        obj.parent_type = "BONE"
        obj.parent_bone = target
        obj.matrix_world = world

    def action(name, frame_end, keys):
        item = bpy.data.actions.new(name)
        slot = item.slots.new(armature.id_type, armature.name)
        armature.animation_data_create()
        armature.animation_data.action = item
        armature.animation_data.action_slot = slot
        for frame, changes in keys:
            for bone_name, rotation in changes.items():
                pose = armature.pose.bones.get(bone_name)
                if not pose:
                    continue
                pose.rotation_euler = rotation
                pose.keyframe_insert(data_path="rotation_euler", frame=frame)
        return item

    idle = action("YNM_IDLE", 72, [
        (1, {"head": (0, 0, -0.035), "tail.02": (0, 0, -0.12)}),
        (24, {"head": (0, 0.025, 0.035), "tail.02": (0, 0, 0.12)}),
        (48, {"head": (0, 0, -0.025), "tail.02": (0, 0, -0.08)}),
        (72, {"head": (0, 0, 0), "tail.02": (0, 0, 0)}),
    ])
    touch = action("YNM_TOUCH", 40, [
        (1, {"head": (0, 0, 0), "upper_arm.R": (0, 0, 0)}),
        (14, {"head": (0, 0, 0.08), "upper_arm.R": (0.0, -0.55, -0.28)}),
        (28, {"head": (0, 0, -0.06), "upper_arm.R": (0.0, -0.72, -0.36)}),
        (40, {"head": (0, 0, 0), "upper_arm.R": (0, 0, 0)}),
    ])
    wave = action("YNM_WAVE", 48, [
        (1, {"upper_arm.R": (0, 0, 0), "forearm.R": (0, 0, 0)}),
        (16, {"upper_arm.R": (0, -0.8, -0.4), "forearm.R": (0.1, 0.2, -0.4)}),
        (32, {"upper_arm.R": (0, -0.72, -0.32), "forearm.R": (-0.12, -0.18, 0.3)}),
        (48, {"upper_arm.R": (0, 0, 0), "forearm.R": (0, 0, 0)}),
    ])
    armature.animation_data_create()
    armature.animation_data.action = idle
    # NLA strips preserve all named clips in the exported GLB.
    for item in (idle, touch, wave):
        track = armature.animation_data.nla_tracks.new()
        track.name = item.name
        strip = track.strips.new(item.name, int(item.frame_range[0]), item)
        strip.action_slot = item.slots[0]
        strip.action_frame_start = item.frame_range[0]
        strip.action_frame_end = item.frame_range[1]
    armature.animation_data.action = None
    return armature


def add_fur_microdetail(mat, scale=5.0, strength=0.12):
    """Add subtle procedural fur breakup without using a flat image texture."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def bevel(obj, amount=0.08, segments=4):
    mod = obj.modifiers.new("soft_edges", "BEVEL")
    mod.width = amount
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return obj


def uv(name, location, scale, mat, col, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    assign(obj, mat)
    move_to_collection(obj, col)
    return obj


def cube(name, location, scale, mat, col, bevel_amount=0.08, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, bevel_amount, 5)
    assign(obj, mat)
    move_to_collection(obj, col)
    return obj


def cylinder(name, location, radius, depth, mat, col, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    smooth(obj)
    assign(obj, mat)
    move_to_collection(obj, col)
    return obj


def cone(name, location, radius, depth, mat, col, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius * 0.08, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    smooth(obj)
    assign(obj, mat)
    move_to_collection(obj, col)
    return obj


def torus(name, location, major, minor, mat, col, rotation=(math.pi / 2, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=16, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    assign(obj, mat)
    move_to_collection(obj, col)
    return obj


def curve_tube(name, points, radius, mat, col):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    col.objects.link(obj)
    assign(obj, mat)
    return obj


def add_reference_guide(col, image_path, name, display_size):
    """Add a non-rendered image guide for checking front silhouette in Blender."""
    if not os.path.exists(image_path):
        return None
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "IMAGE"
    empty.data = bpy.data.images.load(image_path, check_existing=True)
    empty.empty_display_size = display_size
    empty.color[3] = 0.28
    empty.hide_render = True
    empty.hide_viewport = True
    col.objects.link(empty)
    return empty


def find_object(root, name):
    if root.name == name:
        return root
    for child in root.children:
        result = find_object(child, name)
        if result:
            return result
    return None


def mark_hidden_for_export(obj):
    obj.hide_render = True
    obj.hide_viewport = True
    obj["skip_export"] = True


def apply_pose_variant(root, variant):
    """Convert the shared hero rig into the approved home/touch/menu poses."""
    if variant == "home":
        return
    if variant == "touch":
        arm = find_object(root, "front_leg_right")
        paw = find_object(root, "front_paw_right")
        if arm:
            arm.location.x = 1.02
            arm.location.z = 1.94
            arm.rotation_euler[1] = math.radians(-32)
        if paw:
            paw.location.x = 1.38
            paw.location.z = 2.78
            paw.rotation_euler[1] = math.radians(-32)
        for name in ("front_paw_right_toe_-0.22", "front_paw_right_toe_0", "front_paw_right_toe_0.22"):
            toe = find_object(root, name)
            if toe:
                toe.location.x += 0.82
                toe.location.z += 2.10
        return
    if variant == "menu":
        # Menu is a chest-up bust. The UI board provides the ledge, so lower
        # limbs, tail, satchel and charm are excluded from this GLB variant.
        hidden_prefixes = ("front_leg_", "front_paw_", "back_leg_", "tail_", "yellow_cross_body_bag", "bag_", "paw_charm")
        for obj in list(root.children):
            if obj.name.startswith(hidden_prefixes):
                mark_hidden_for_export(obj)
        for name, x in (("front_paw_left", -0.62), ("front_paw_right", 0.62)):
            paw = find_object(root, name)
            if paw:
                paw.location.x = x
                paw.location.z = 2.48
        return


def build_cat():
    clear_scene()
    col = collection()
    add_reference_guide(col, REFERENCE_IMAGE, "REFERENCE_FRONT_GUIDE_DO_NOT_EXPORT", 6.3)
    add_reference_guide(col, TURNAROUND_IMAGE, "REFERENCE_TURNAROUND_GUIDE_DO_NOT_EXPORT", 8.0)
    add_reference_guide(col, TOUCH_TURNAROUND_IMAGE, "REFERENCE_TOUCH_TURNAROUND_GUIDE_DO_NOT_EXPORT", 8.0)
    add_reference_guide(col, MENU_TURNAROUND_IMAGE, "REFERENCE_MENU_TURNAROUND_GUIDE_DO_NOT_EXPORT", 8.0)

    fur = material("fur_black_brown", (0.105, 0.052, 0.042), 0.86, 0.0, 0.25)
    fur_soft = material("fur_warm_highlight", (0.20, 0.105, 0.082), 0.9, 0.0, 0.2)
    fur_dark = material("fur_deep_brown_shadow", (0.035, 0.016, 0.018), 0.9, 0.0, 0.18)
    white = material("warm_white_paws", (0.97, 0.84, 0.9), 0.78, 0.0, 0.25)
    pink = material("ear_and_headphone_pink", (1.0, 0.19, 0.46), 0.44, 0.0, 0.35)
    pink_light = material("paw_highlight", (1.0, 0.62, 0.76), 0.6, 0.0, 0.3)
    yellow = material("sunglasses_and_bag_yellow", (1.0, 0.68, 0.015), 0.32, 0.0, 0.4)
    yellow_light = material("bag_stitch_highlight", (1.0, 0.83, 0.09), 0.42, 0.0, 0.4)
    lens = material("violet_glass", (0.06, 0.035, 0.12), 0.12, 0.15, 0.7)
    eye = material("black_glossy_eyes", (0.005, 0.002, 0.008), 0.08, 0.15, 0.85)
    eye_yellow = material("eye_gold", (1.0, 0.68, 0.01), 0.22, 0.0, 0.65)
    metal = material("bag_hardware", (0.95, 0.56, 0.02), 0.2, 0.5, 0.75)
    add_fur_microdetail(fur, 7.0, 0.16)
    add_fur_microdetail(fur_soft, 9.0, 0.19)
    add_fur_microdetail(fur_dark, 8.0, 0.12)

    # Material maps are generated per surface family and packed into each GLB;
    # the design screenshot is only used as a modelling guide, never as a
    # flattened character texture.
    attach_texture_map(fur, make_texture_map("fur", (0.07, 0.032, 0.035), (0.28, 0.16, 0.18)), 0.16)
    attach_texture_map(fur_soft, make_texture_map("fur_soft", (0.17, 0.075, 0.09), (0.42, 0.24, 0.28)), 0.19)
    attach_texture_map(fur_dark, make_texture_map("fur_dark", (0.018, 0.009, 0.014), (0.10, 0.055, 0.07)), 0.12)
    attach_texture_map(white, make_texture_map("warm_white", (0.82, 0.72, 0.78), (1.0, 0.93, 0.96)), 0.12)
    attach_texture_map(pink, make_texture_map("pink", (0.75, 0.05, 0.20), (1.0, 0.38, 0.58)), 0.08)
    attach_texture_map(yellow, make_texture_map("yellow", (0.82, 0.35, 0.01), (1.0, 0.84, 0.08)), 0.05)

    root = bpy.data.objects.new("cat_root", None)
    col.objects.link(root)
    root.location = (0, 0, 0)
    root.rotation_euler[2] = math.radians(-7.0)

    # Reference proportions: compact head, oversized eyes, short torso, broad tail,
    # white toe tufts, yellow glasses, pink headphones and a diagonal yellow bag.
    body = uv("body_fur", (0, 0, 2.02), (1.08, 0.78, 1.76), fur, col)
    body.parent = root
    chest = uv("chest_white_patch", (0.37, -0.76, 1.96), (0.47, 0.13, 0.98), white, col)
    chest.parent = root

    head = uv("head_fur", (0, -0.01, 3.78), (1.62, 1.10, 1.47), fur, col)
    head.parent = root

    # Ears are broad rounded cones, with pink inset geometry kept independent.
    for side, label in ((-1, "left"), (1, "right")):
        ear = cone(f"ear_{label}_outer", (side * 1.04, 0, 4.92), 0.78, 1.62, fur_dark, col, rotation=(0, side * 0.26, side * -0.17))
        ear.scale = (0.95, 0.62, 1.0)
        ear.parent = root
        inner = cone(f"ear_{label}_pink_inner", (side * 1.04, -0.61, 4.86), 0.45, 1.12, pink, col, rotation=(0, side * 0.26, side * -0.17))
        inner.scale = (0.84, 0.42, 1.0)
        inner.parent = root

    # Huge golden eyes and glossy pupils match the supplied close-up expression.
    for side, label in ((-1, "left"), (1, "right")):
        ex = side * 0.58
        eye_gold = uv(f"eye_{label}_gold", (ex, -1.0, 3.78), (0.53, 0.16, 0.56), eye_yellow, col)
        eye_gold.parent = root
        pupil = uv(f"eye_{label}_pupil", (ex + side * 0.03, -1.16, 3.82), (0.20, 0.055, 0.30), eye, col)
        pupil.parent = root
        glint = uv(f"eye_{label}_glint", (ex - side * 0.10, -1.23, 4.03), (0.075, 0.025, 0.11), white, col, 24, 16)
        glint.parent = root

    muzzle_l = uv("muzzle_left", (-0.23, -1.0, 3.31), (0.38, 0.19, 0.29), fur_soft, col)
    muzzle_r = uv("muzzle_right", (0.23, -1.0, 3.31), (0.38, 0.19, 0.29), fur_soft, col)
    muzzle_l.parent = root
    muzzle_r.parent = root
    nose = uv("nose_pink", (0, -1.22, 3.43), (0.13, 0.055, 0.085), pink_light, col, 32, 20)
    nose.parent = root
    mouth_l = curve_tube("mouth_left", [(0, -1.25, 3.34), (-0.13, -1.26, 3.22), (-0.27, -1.22, 3.27)], 0.028, fur_dark, col)
    mouth_r = curve_tube("mouth_right", [(0, -1.25, 3.34), (0.13, -1.26, 3.22), (0.27, -1.22, 3.27)], 0.028, fur_dark, col)
    mouth_l.parent = root
    mouth_r.parent = root

    # Sunglasses: front-facing rings, dark inset lenses, bridge and side arms.
    for side, label in ((-1, "left"), (1, "right")):
        frame = torus(f"glasses_frame_{label}", (side * 0.60, -1.15, 4.63), 0.37, 0.105, yellow, col, scale=(1.08, 0.68, 1.0))
        frame.parent = root
        glass = uv(f"glasses_lens_{label}", (side * 0.60, -1.13, 4.63), (0.29, 0.045, 0.20), lens, col)
        glass.parent = root
    bridge = cube("glasses_bridge", (0, -1.17, 4.64), (0.34, 0.13, 0.12), yellow, col, 0.055)
    bridge.parent = root

    # Pink headset behind the head and two padded ear cups.
    band = torus("headphone_band", (0, 0.12, 4.03), 1.42, 0.10, pink, col, scale=(1.0, 0.72, 1.0))
    band.parent = root
    for side, label in ((-1, "left"), (1, "right")):
        cup = cylinder(f"headphone_{label}_cup", (side * 1.31, -0.07, 2.90), 0.44, 0.25, pink, col, rotation=(math.pi / 2, 0, 0))
        cup.parent = root
        pad = cylinder(f"headphone_{label}_pad", (side * 1.31, -0.22, 2.90), 0.27, 0.08, white, col, rotation=(math.pi / 2, 0, 0))
        pad.parent = root

    # Legs and soft toe tufts.
    for side, label in ((-1, "left"), (1, "right")):
        leg = uv(f"front_leg_{label}", (side * 0.58, -0.12, 0.98), (0.37, 0.44, 1.20), fur, col)
        leg.parent = root
        paw = uv(f"front_paw_{label}", (side * 0.58, -0.37, 0.23), (0.47, 0.56, 0.31), white, col)
        paw.parent = root
        for toe in (-0.22, 0, 0.22):
            toe_obj = uv(f"front_paw_{label}_toe_{toe}", (side * 0.58 + toe, -0.88, 0.23), (0.13, 0.10, 0.17), white, col, 24, 16)
            toe_obj.parent = root
        back = uv(f"back_leg_{label}", (side * 0.84, 0.14, 1.15), (0.45, 0.48, 1.00), fur, col)
        back.parent = root

    # Tail is segmented so the runtime can animate it as a real articulated part.
    tail_root = bpy.data.objects.new("tail_root", None)
    col.objects.link(tail_root)
    tail_root.parent = root
    tail_root.location = (-1.06, 0.10, 1.50)
    tail_1 = uv("tail_segment_01", (-0.16, 0.10, -0.10), (0.58, 0.58, 0.92), fur_soft, col)
    tail_1.rotation_euler[1] = -0.38
    tail_1.parent = tail_root
    tail_2 = uv("tail_segment_02", (-0.44, 0.06, 0.54), (0.56, 0.56, 0.82), fur_soft, col)
    tail_2.rotation_euler[1] = 0.38
    tail_2.parent = tail_root
    tail_tip = uv("tail_tip", (-0.30, 0.04, 1.10), (0.50, 0.50, 0.70), fur_soft, col)
    tail_tip.parent = tail_root

    # Yellow collar and diagonal cross-body bag are separate, editable pieces.
    collar = torus("yellow_collar", (0, -0.05, 2.78), 0.67, 0.10, yellow, col, rotation=(0, 0, 0), scale=(1.0, 0.72, 1.0))
    collar.parent = root
    strap = cube("bag_strap", (0.12, -0.88, 2.05), (0.16, 0.20, 2.32), yellow, col, 0.06, rotation=(0, math.radians(-23), 0))
    strap.parent = root
    bag = cube("yellow_cross_body_bag", (-0.22, -1.08, 1.40), (1.20, 0.34, 0.88), yellow, col, 0.16, rotation=(0, math.radians(-10), 0))
    bag.parent = root
    flap = cube("bag_flap", (-0.22, -1.29, 1.74), (1.03, 0.14, 0.32), yellow_light, col, 0.09, rotation=(0, math.radians(-10), 0))
    flap.parent = root
    buckle = cube("bag_buckle", (0.08, -1.39, 1.73), (0.16, 0.08, 0.19), metal, col, 0.035)
    buckle.parent = root
    badge_y = uv("bag_cat_badge_yellow", (-0.54, -1.41, 1.73), (0.13, 0.035, 0.13), yellow_light, col, 24, 16)
    badge_y.parent = root
    badge_b = uv("bag_cat_badge_black", (-0.27, -1.41, 1.70), (0.10, 0.035, 0.10), fur_dark, col, 24, 16)
    badge_b.parent = root
    charm = uv("paw_charm", (0.35, -1.35, 1.30), (0.16, 0.08, 0.18), pink_light, col, 24, 16)
    charm.parent = root

    # Whiskers are modeled as curves, not baked pixels.
    for side in (-1, 1):
        for row, z in enumerate((3.38, 3.28, 3.18)):
            start = (side * 0.18, -1.20, z)
            end = (side * (0.92 + row * 0.08), -1.23, z + (row - 1) * 0.06)
            whisker = curve_tube(f"whisker_{'left' if side < 0 else 'right'}_{row}", [start, end], 0.012, white, col)
            whisker.parent = root

    # A continuous inner core removes the segmented-ball look while the
    # separate outer volumes preserve an editable fluffy silhouette.
    tail_core = curve_tube(
        "tail_continuous_core",
        [(-1.12, 0.10, 1.38), (-1.72, 0.08, 1.34), (-1.92, 0.06, 1.95), (-1.60, 0.04, 2.60)],
        0.36,
        fur_soft,
        col,
    )
    tail_core.parent = root

    apply_pose_variant(root, VARIANT)
    unwrap_meshes(col)
    add_rig(root, col)

    # Root animation gives the exported asset a subtle idle life; click feedback
    # remains state-driven in miniprogram/utils/cat3d.js until GLB animation
    # clips are wired to the WeChat runtime.
    root.keyframe_insert(data_path="rotation_euler", frame=1, index=2)
    root.rotation_euler[2] = math.radians(1.8)
    root.keyframe_insert(data_path="rotation_euler", frame=24, index=2)
    root.rotation_euler[2] = math.radians(-1.8)
    root.keyframe_insert(data_path="rotation_euler", frame=48, index=2)
    root.rotation_euler[2] = 0
    root.keyframe_insert(data_path="rotation_euler", frame=72, index=2)
    if root.animation_data and root.animation_data.action:
        root.animation_data.action.name = "YNM_IDLE_SWAY"

    # Ground for Blender preview only; excluded from the GLB selection below.
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "PREVIEW_FLOOR_NOT_EXPORTED"
    assign(floor, material("preview_floor", (0.035, 0.025, 0.05), 0.95, 0.0, 0.1))

    # Camera and soft studio lights for repeatable visual comparison.
    bpy.ops.object.camera_add(location=(-2.35, -15.2, 2.95))
    camera = bpy.context.object
    camera.name = "CAT_FRONT_COMPARISON_CAMERA"
    camera.data.lens = 72
    camera.rotation_euler = (math.radians(90), 0, 0)
    # Point the camera at the cat using a tracking quaternion.
    camera.rotation_euler = (Vector((0, 0, 2.6)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(-4.5, -7, 7.2))
    key = bpy.context.object
    key.name = "soft_key"
    key.data.energy = 950
    key.data.shape = "DISK"
    key.data.size = 5.0
    key.rotation_euler = (Vector((0, 0, 2.5)) - key.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(4.5, -4, 4.0))
    fill = bpy.context.object
    fill.name = "soft_fill"
    fill.data.energy = 600
    fill.data.size = 4.0
    fill.rotation_euler = (Vector((0, 0, 2.6)) - fill.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(0, 3.5, 6.0))
    rim = bpy.context.object
    rim.name = "pink_rim"
    rim.data.energy = 850
    rim.data.color = (1.0, 0.35, 0.55)
    rim.data.size = 3.0
    rim.rotation_euler = (Vector((0, 0, 2.6)) - rim.location).to_track_quat("-Z", "Y").to_euler()

    scene = bpy.context.scene
    # Blender 4.x names this engine BLENDER_EEVEE_NEXT; the current LTS build
    # exposes the compatibility enum as BLENDER_EEVEE.
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 60
    scene.render.image_settings.file_format = "PNG"
    preview_name = "yanmiao-cat-preview.png" if VARIANT == "home" else f"yanmiao-cat-{VARIANT}-preview.png"
    scene.render.filepath = os.path.join(PROJECT_ROOT, "art", preview_name)
    scene.world.color = (0.015, 0.01, 0.025)
    scene.frame_start = 1
    scene.frame_end = 72
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)

    # Select only the editable cat hierarchy for GLB export.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in col.objects:
        if not obj.name.startswith("REFERENCE_") and not obj.get("skip_export", False):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    os.makedirs(os.path.dirname(BLEND_OUTPUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUTPUT), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUTPUT)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUTPUT,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
        export_materials="EXPORT",
    )
    return root


if __name__ == "__main__":
    build_cat()
    print("Yanmeow cat Blender asset written:", VARIANT, GLB_OUTPUT)
