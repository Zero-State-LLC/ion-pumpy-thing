# Turns the Meshy preview of a plate mount into the game's prop, assets/plate-mount.glb.
#   python tools/clean-plate-mount.py RAW.glb assets/plate-mount.glb
# RAW.glb is the untextured preview mesh of Meshy text-to-3d task 01a201df-0f52-7716-991d-dc55dd6e4b36
# (sha256 6011987db014edebec6e0f90b2b9ad40b4e28f5d69a487f757633098d005268c; see docs/ASSETS.md).
# The mount is a round base, a holder block and a post. Meshy gives it Y up in a unit box. This keeps
# Y up, puts the origin at the tip of the post, where the mount holds its plate, scales it evenly
# to 100 mm tall, adds smooth normals, and writes one untextured mesh, the mount.
# Needs Python 3 and numpy.
import json, struct, sys, hashlib
import numpy as np

# The GLB container's magic number and chunk types (glTF 2.0, section 4.4).
GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942
HEIGHT = 0.100  # metres, base to post tip

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

P, I = read_glb(sys.argv[1])
lo, hi = P.min(0), P.max(0)
# The post is the only part in the top tenth of the mesh; its tip is the mesh's top.
top = P[P[:, 1] > hi[1] - 0.1 * (hi[1] - lo[1])]
tip = np.array([(top[:, 0].min() + top[:, 0].max()) / 2, hi[1], (top[:, 2].min() + top[:, 2].max()) / 2])
Q = (P - tip) * (HEIGHT / (hi[1] - lo[1]))
lo, hi = Q.min(0), Q.max(0)
print('post tip (unit box):', tip.round(4).tolist(), 'extent m:', (hi - lo).round(4).tolist())

# Area-weighted smooth normals.
N = np.zeros_like(Q)
fn = np.cross(Q[I[:, 1]] - Q[I[:, 0]], Q[I[:, 2]] - Q[I[:, 0]])
for k in range(3): np.add.at(N, I[:, k], fn)
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

dt, ct = ('<u2', 5123) if len(Q) < 65536 else ('<u4', 5125)
pad = lambda b: b + b'\x00' * (-len(b) % 4)
pos, nor, idx = Q.astype('<f4').tobytes(), N.astype('<f4').tobytes(), I.astype(dt).tobytes()
chunks = [pad(pos), pad(nor), pad(idx)]
offs = [sum(len(c) for c in chunks[:k]) for k in range(len(chunks))]
binary = b''.join(chunks)
gltf = {
  'asset': {'version': '2.0', 'generator': 'Meshy text-to-3d preview, cleaned by tools/clean-plate-mount.py'},
  'scene': 0, 'scenes': [{'nodes': [0]}],
  'nodes': [{'mesh': 0, 'name': 'mount'}],
  'meshes': [{'name': 'mount', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
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
dst = sys.argv[2]
open(dst, 'wb').write(out)
print('wrote', dst, len(out), 'B', 'verts', len(Q), 'tris', len(I), 'sha256', hashlib.sha256(out).hexdigest())
