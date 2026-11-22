# Turns the Meshy preview of the airliner into the game's prop, assets/airliner.glb.
#   python tools/clean-airliner.py RAW.glb assets/airliner.glb
# RAW.glb is the untextured preview mesh of Meshy text-to-3d task 01a2019b-00ff-7076-a476-f5d88d89e7d2
# (sha256 edda0b68eef3930d99e2a3d7ffe8056b66e2b91d2d7a1b2609090a4d0599eb78; see docs/ASSETS.md).
# It drops the landing-gear parts the model came with, rotates to Y up with the nose toward -Z,
# scales to 63.7 m long and 60.9 m across the wings, centres the bounding box on the origin,
# adds smooth normals, and writes two untextured meshes: the airframe and the engines.
# Needs Python 3 and numpy.
import json, struct, sys, hashlib
import numpy as np

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

P, I = read_glb(sys.argv[1])   # Meshy frame: nose -x, up +y, wings along z

# Connected components over shared vertex indices (union-find).
parent = np.arange(len(P))
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for t in I:
    ra, rb, rc = find(t[0]), find(t[1]), find(t[2])
    parent[rb] = ra; parent[find(rc)] = ra
roots = np.array([find(v) for v in range(len(P))])
tri_root = roots[I[:, 0]]
keep = np.ones(len(I), bool)
gear = []
for r in np.unique(tri_root):
    tris = I[tri_root == r]; v = P[np.unique(tris)]
    c = v.mean(0)
    if v[:, 1].max() < -0.105 and abs(c[2]) < 0.12:
        keep[tri_root == r] = False; gear.append((int(len(tris)), c.round(3).tolist()))
print('gear components removed:', len(gear), 'tris', sum(g[0] for g in gear))
for g in gear: print('  ', g)
# Engines: nacelle components hanging under the wings, off the centreline.
engine = np.zeros(len(I), bool)
for r in np.unique(tri_root[keep]):
    sel = tri_root == r; v = P[np.unique(I[sel])]; lo, hi = v.min(0), v.max(0); c = v.mean(0)
    is_engine = 0.18 < abs(c[2]) < 0.25 and (hi[2] - lo[2]) < 0.06 and hi[1] < -0.055 and lo[0] > -0.09 and hi[0] < 0.03
    if is_engine: engine[sel] = True
    if '--list' in sys.argv: print('comp', int(sel.sum()), 'x', lo[0].round(3), hi[0].round(3), 'y', lo[1].round(3), hi[1].round(3), 'z', lo[2].round(3), hi[2].round(3), 'ENGINE' if is_engine else '')
print('engine tris', int(engine[keep].sum()))
engine = engine[keep]
I = I[keep]
used = np.unique(I); remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
P = P[used]; I = remap[I]

# Rotate: new x = -old z (span), new y = old y (up), new z = old x (nose -x -> -z). Proper rotation.
Q = np.stack([-P[:, 2], P[:, 1], P[:, 0]], 1)
lo, hi = Q.min(0), Q.max(0); size = hi - lo
sx, sz = 60.9 / size[0], 63.7 / size[2]
Q = (Q - (lo + hi) / 2) * np.array([sx, sz, sz])
lo, hi = Q.min(0), Q.max(0)
print('extent m (span, height, length):', (hi - lo).round(3).tolist(), 'scale x/z ratio', round(sx / sz, 4))

# Area-weighted smooth normals.
N = np.zeros_like(Q)
fn = np.cross(Q[I[:, 1]] - Q[I[:, 0]], Q[I[:, 2]] - Q[I[:, 0]])
for k in range(3): np.add.at(N, I[:, k], fn)
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

pos = Q.astype('<f4').tobytes(); nor = N.astype('<f4').tobytes()
dt = '<u2' if len(Q) < 65536 else '<u4'
parts = [('airframe', I[~engine]), ('engines', I[engine])]
pad = lambda b: b + b'\x00' * (-len(b) % 4)
chunks = [pad(pos), pad(nor)] + [pad(p.astype(dt).tobytes()) for _, p in parts]
offs = [sum(len(c) for c in chunks[:k]) for k in range(len(chunks))]
binary = b''.join(chunks)
ct = 5123 if dt == '<u2' else 5125
gltf = {
  'asset': {'version': '2.0', 'generator': 'Meshy text-to-3d preview, cleaned by clean.py'},
  'scene': 0, 'scenes': [{'nodes': [0, 1]}],
  'nodes': [{'mesh': k, 'name': n} for k, (n, _) in enumerate(parts)],
  'meshes': [{'name': n, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2 + k}]} for k, (n, _) in enumerate(parts)],
  'buffers': [{'byteLength': len(binary)}],
  'bufferViews': [{'buffer': 0, 'byteOffset': offs[0], 'byteLength': len(pos), 'target': 34962},
                  {'buffer': 0, 'byteOffset': offs[1], 'byteLength': len(nor), 'target': 34962}]
               + [{'buffer': 0, 'byteOffset': offs[2 + k], 'byteLength': int(p.size) * (2 if ct == 5123 else 4), 'target': 34963} for k, (_, p) in enumerate(parts)],
  'accessors': [
    {'bufferView': 0, 'componentType': 5126, 'count': len(Q), 'type': 'VEC3', 'min': lo.astype('f4').tolist(), 'max': hi.astype('f4').tolist()},
    {'bufferView': 1, 'componentType': 5126, 'count': len(Q), 'type': 'VEC3'}]
    + [{'bufferView': 2 + k, 'componentType': ct, 'count': int(p.size), 'type': 'SCALAR'} for k, (_, p) in enumerate(parts)],
}
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binary), 0x004E4942) + binary
dst = sys.argv[2]
open(dst, 'wb').write(out)
print('wrote', dst, len(out), 'B', 'verts', len(Q), 'tris', len(I), [(n, len(p)) for n, p in parts], 'sha256', hashlib.sha256(out).hexdigest())
