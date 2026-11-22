# Turns the Meshy previews of the Ignite step's hand pump into the game's two props:
#   python tools/clean-pump.py housing RAW.glb assets/piston-housing.glb
#   python tools/clean-pump.py handle RAW.glb assets/pump-handle.glb
# RAW.glb is the untextured preview mesh of a Meshy text-to-3d task (see docs/ASSETS.md):
#   housing: task 01a20269-b61a-75f8-921b-73ccb7caf173
#            (sha256 625d31fc21b6e848c5b094495f83f5c63bc95aa2fbbe76c0855630e52b8aec95)
#   handle:  task 01a2026a-b172-74d4-a272-96078fe17bb6
#            (sha256 97e3343bad1f0a767e6ebdb91f542590eca6bad9f7da149be9198e5cd2ddc849)
# Meshy gives each Y up in a unit box. The piston housing is the pump's barrel, a flanged
# cylinder round the Y axis: this puts its origin on its axis at half its height and scales it
# evenly to its real size, its side wall, between the flanges, HOUSING_WALL_RADIUS from the axis.
# The pump handle is a T, its grip bar along X: this puts its origin at the bar's middle and
# scales it evenly so the bar is HANDLE_SPAN long. Each gets smooth normals and is written as
# one untextured mesh, its measure (wallRadius or span, in metres) in its node's extras. The
# game sizes both from the scene list.
# Needs Python 3 and numpy.
import json, struct, sys, hashlib
import numpy as np

# The GLB container's magic number and chunk types (glTF 2.0, section 4.4).
GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942
# Real sizes, in metres, of a lab hand vacuum pump: a barrel 5 cm across inside its wall, and a
# grip bar 12 cm long.
HOUSING_WALL_RADIUS = 0.025
HANDLE_SPAN = 0.12

def read_glb(path):
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl]); binary = b[20 + jl + 8:]
    prim = j['meshes'][0]['primitives'][0]
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = {'SCALAR': 1, 'VEC3': 3}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
        assert not bv.get('byteStride') or bv['byteStride'] == n * np.dtype(dt).itemsize
        return np.frombuffer(binary, dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
    return acc(prim['attributes']['POSITION']).astype(np.float64), acc(prim['indices']).reshape(-1, 3).astype(np.int64)

part, src, dst = sys.argv[1:4]
P, I = read_glb(src)
lo, hi = P.min(0), P.max(0)
centre = (lo + hi) / 2
if part == 'housing':
    r = np.hypot(P[:, 0] - centre[0], P[:, 2] - centre[2])
    # The side wall: the nearest the mesh comes to the axis in the middle three fifths of its
    # height, where only the wall is.
    middle = np.abs(P[:, 1] - centre[1]) < 0.3 * (hi[1] - lo[1])
    measure = r[middle].min()
    name, extras, k = 'housing', {'wallRadius': HOUSING_WALL_RADIUS}, HOUSING_WALL_RADIUS / measure
elif part == 'handle':
    # The grip bar: what stands out along X beyond the stem; its middle height is the origin's.
    bar = np.abs(P[:, 0] - centre[0]) > 0.3 * (hi[0] - lo[0])
    centre[1] = (P[bar, 1].min() + P[bar, 1].max()) / 2
    measure = hi[0] - lo[0]
    name, extras, k = 'handle', {'span': HANDLE_SPAN}, HANDLE_SPAN / measure
else:
    sys.exit('part must be housing or handle')
Q = (P - centre) * k
lo, hi = Q.min(0), Q.max(0)
print(part, 'measure (unit box):', round(float(measure), 4), 'size in metres:', (hi - lo).round(4).tolist())

# Area-weighted smooth normals.
N = np.zeros_like(Q)
fn = np.cross(Q[I[:, 1]] - Q[I[:, 0]], Q[I[:, 2]] - Q[I[:, 0]])
for c in range(3): np.add.at(N, I[:, c], fn)
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

dt, ct = ('<u2', 5123) if len(Q) < 65536 else ('<u4', 5125)
pad = lambda b: b + b'\x00' * (-len(b) % 4)
pos, nor, idx = Q.astype('<f4').tobytes(), N.astype('<f4').tobytes(), I.astype(dt).tobytes()
chunks = [pad(pos), pad(nor), pad(idx)]
offs = [sum(len(c) for c in chunks[:i]) for i in range(len(chunks))]
binary = b''.join(chunks)
gltf = {
  'asset': {'version': '2.0', 'generator': 'Meshy text-to-3d preview, cleaned by tools/clean-pump.py'},
  'scene': 0, 'scenes': [{'nodes': [0]}],
  'nodes': [{'mesh': 0, 'name': name, 'extras': extras}],
  'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
  'buffers': [{'byteLength': len(binary)}],
  'bufferViews': [{'buffer': 0, 'byteOffset': offs[0], 'byteLength': len(pos), 'target': 34962},
                  {'buffer': 0, 'byteOffset': offs[1], 'byteLength': len(nor), 'target': 34962},
                  {'buffer': 0, 'byteOffset': offs[2], 'byteLength': len(idx), 'target': 34963}],
  'accessors': [
    {'bufferView': 0, 'componentType': 5126, 'count': len(Q), 'type': 'VEC3', 'min': lo.astype('f4').tolist(), 'max': hi.astype('f4').tolist()},
    {'bufferView': 1, 'componentType': 5126, 'count': len(Q), 'type': 'VEC3'},
    {'bufferView': 2, 'componentType': ct, 'count': int(I.size), 'type': 'SCALAR'}],
}
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
out = struct.pack('<III', GLB_MAGIC, 2, 12 + 8 + len(js) + 8 + len(binary))
out += struct.pack('<II', len(js), CHUNK_JSON) + js + struct.pack('<II', len(binary), CHUNK_BIN) + binary
open(dst, 'wb').write(out)
print('wrote', dst, len(out), 'B', 'verts', len(Q), 'tris', len(I), 'sha256', hashlib.sha256(out).hexdigest())
