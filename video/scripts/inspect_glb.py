"""Prints what an avatar GLB contains, so the overlay can be mapped to it: node/bone names,
morph-target (blendshape) names per mesh, mesh sizes and the overall bounding box. No dependencies.
Usage: python3 scripts/inspect_glb.py public/avatar/avatar.glb"""
import json, struct, sys

path = sys.argv[1]
data = open(path, "rb").read()
magic, version, length = struct.unpack("<4sII", data[:12])
assert magic == b"glTF", "not a GLB"
off = 12
chunks = []
while off < length:
    clen, ctype = struct.unpack("<II", data[off:off + 8])
    chunks.append((ctype, data[off + 8:off + 8 + clen]))
    off += 8 + clen
gltf = json.loads(chunks[0][1])
print(f"{path}: {len(data)/1e6:.1f} MB, generator={gltf.get('asset', {}).get('generator')}")
nodes = gltf.get("nodes", [])
skins = gltf.get("skins", [])
print(f"nodes {len(nodes)}, meshes {len(gltf.get('meshes', []))}, skins {len(skins)}, materials {len(gltf.get('materials', []))}, images {len(gltf.get('images', []))}, animations {len(gltf.get('animations', []))}")
for si, skin in enumerate(skins):
    names = [nodes[j].get("name", f"node{j}") for j in skin["joints"]]
    print(f"skin {si}: {len(names)} joints: {', '.join(names)}")
for mi, mesh in enumerate(gltf.get("meshes", [])):
    targets = mesh.get("extras", {}).get("targetNames")
    nprims = len(mesh.get("primitives", []))
    nt = len(mesh["primitives"][0].get("targets", [])) if nprims else 0
    print(f"mesh {mi} '{mesh.get('name')}': {nprims} primitives, {nt} morph targets" + (f": {', '.join(targets)}" if targets else ""))
# bounding box from the POSITION accessors of every mesh node (ignoring skinning)
accessors = gltf.get("accessors", [])
lo = [1e9] * 3; hi = [-1e9] * 3
for mesh in gltf.get("meshes", []):
    for prim in mesh["primitives"]:
        acc = accessors[prim["attributes"]["POSITION"]]
        if "min" in acc and "max" in acc:
            lo = [min(a, b) for a, b in zip(lo, acc["min"])]; hi = [max(a, b) for a, b in zip(hi, acc["max"])]
print(f"bind-pose bounds: x {lo[0]:.3f}..{hi[0]:.3f}  y {lo[1]:.3f}..{hi[1]:.3f}  z {lo[2]:.3f}..{hi[2]:.3f}  (height {hi[1]-lo[1]:.3f})")
for n in nodes:
    if any(k in n.get("name", "").lower() for k in ("head", "neck", "arm", "hand", "spine", "hips", "eye", "jaw")):
        t = n.get("translation"); r = n.get("rotation")
        print(f"  node '{n.get('name')}' translation={t} rotation={r}")
