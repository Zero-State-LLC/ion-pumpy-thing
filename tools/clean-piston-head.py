# Turns the Meshy preview of a grooved laboratory vacuum piston head into assets/piston-head.glb.
#   python3 tools/clean-piston-head.py RAW.glb assets/piston-head.glb
# RAW.glb is the untextured preview mesh of Meshy text-to-3d task 01a2211a-b146-72e1-8eba-2e62e853b797
# (model meshy-7.1, 2k geometry, sha256 e2c19d4844ce57278f2c3d0d063b46eab8ec920404d5d1ce54added19fe418b0;
# see docs/ASSETS.md).
# Keeps Y up, centres on the origin, scales evenly so outer radius is PISTON_RADIUS metres, computes
# 35 deg creased smooth normals, and writes one untextured mesh (`piston`) with `radius` and `height`
# in its node extras. Pure Python 3 standard library.
import hashlib, json, math, struct, sys

GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942
PISTON_RADIUS = 0.024
CREASE_COS = math.cos(math.radians(35.0))


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    binary = b[20 + jl + 8:]
    prim = j['meshes'][0]['primitives'][0]

    def acc(i):
        a = j['accessors'][i]
        bv = j['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = {'SCALAR': 1, 'VEC3': 3}[a['type']]
        fmt = {5126: 'f', 5125: 'I', 5123: 'H'}[a['componentType']]
        sz = struct.calcsize('<' + fmt)
        assert not bv.get('byteStride') or bv['byteStride'] == n * sz
        vals = struct.unpack_from(f'<{a["count"] * n}{fmt}', binary, off)
        return [vals[k:k + n] for k in range(0, len(vals), n)] if n > 1 else list(vals)

    pts = acc(prim['attributes']['POSITION'])
    idx = acc(prim['indices'])
    return pts, [(idx[k], idx[k + 1], idx[k + 2]) for k in range(0, len(idx), 3)]


def smooth_by_angle(pts, tris, cos_limit=CREASE_COS):
    weld_map, wpts, remap = {}, [], []
    for x, y, z in pts:
        key = (round(x, 6), round(y, 6), round(z, 6))
        vi = weld_map.get(key)
        if vi is None:
            vi = len(wpts)
            weld_map[key] = vi
            wpts.append((x, y, z))
        remap.append(vi)

    wtris, fnorms, fareas = [], [], []
    v_to_t = [[] for _ in range(len(wpts))]
    for a, b, c in tris:
        ia, ib, ic = remap[a], remap[b], remap[c]
        if ia == ib or ib == ic or ic == ia:
            continue
        ax, ay, az = wpts[ia]
        bx, by, bz = wpts[ib]
        cx, cy, cz = wpts[ic]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        area = math.sqrt(nx * nx + ny * ny + nz * nz)
        if area < 1e-14:
            continue
        ti = len(wtris)
        wtris.append((ia, ib, ic))
        fnorms.append((nx / area, ny / area, nz / area))
        fareas.append(area)
        v_to_t[ia].append(ti)
        v_to_t[ib].append(ti)
        v_to_t[ic].append(ti)

    out_pts, out_nors, out_tris, cache = [], [], [], {}
    for ti, (ia, ib, ic) in enumerate(wtris):
        fnx, fny, fnz = fnorms[ti]
        tri_out = []
        for vi in (ia, ib, ic):
            sx = sy = sz = 0.0
            for tj in v_to_t[vi]:
                nx, ny, nz = fnorms[tj]
                if fnx * nx + fny * ny + fnz * nz >= cos_limit:
                    w = fareas[tj]
                    sx += nx * w
                    sy += ny * w
                    sz += nz * w
            ln = math.sqrt(sx * sx + sy * sy + sz * sz) or 1.0
            nx, ny, nz = sx / ln, sy / ln, sz / ln
            ckey = (vi, round(nx, 3), round(ny, 3), round(nz, 3))
            oi = cache.get(ckey)
            if oi is None:
                oi = len(out_pts)
                cache[ckey] = oi
                out_pts.append(wpts[vi])
                out_nors.append((nx, ny, nz))
            tri_out.append(oi)
        out_tris.append(tuple(tri_out))
    return out_pts, out_nors, out_tris


def main():
    pts, tris = read_glb(sys.argv[1])
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    c = [(lo[i] + hi[i]) / 2.0 for i in range(3)]
    outer_r = max(math.hypot(x - c[0], z - c[2]) for x, _, z in pts)
    k = PISTON_RADIUS / outer_r
    qpts = [((x - c[0]) * k, (y - c[1]) * k, (z - c[2]) * k) for x, y, z in pts]
    out_pts, out_nors, out_tris = smooth_by_angle(qpts, tris)
    qlo = [min(p[i] for p in out_pts) for i in range(3)]
    qhi = [max(p[i] for p in out_pts) for i in range(3)]
    height_m = round(qhi[1] - qlo[1], 6)

    dt, ct = ('H', 5123) if len(out_pts) < 65536 else ('I', 5125)
    pad = lambda b: b + b'\x00' * (-len(b) % 4)
    pos = struct.pack(f'<{len(out_pts) * 3}f', *(v for p in out_pts for v in p))
    nor = struct.pack(f'<{len(out_nors) * 3}f', *(v for n in out_nors for v in n))
    idx = struct.pack(f'<{len(out_tris) * 3}{dt}', *(v for t in out_tris for v in t))
    chunks = [pad(pos), pad(nor), pad(idx)]
    offs = [sum(len(ch) for ch in chunks[:i]) for i in range(3)]
    binary = b''.join(chunks)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'Meshy text-to-3d preview, cleaned by tools/clean-piston-head.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'piston', 'extras': {'radius': PISTON_RADIUS, 'height': height_m}}],
        'meshes': [{'name': 'piston', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': offs[0], 'byteLength': len(pos), 'target': 34962},
            {'buffer': 0, 'byteOffset': offs[1], 'byteLength': len(nor), 'target': 34962},
            {'buffer': 0, 'byteOffset': offs[2], 'byteLength': len(idx), 'target': 34963},
        ],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(out_pts), 'type': 'VEC3', 'min': [float(v) for v in qlo], 'max': [float(v) for v in qhi]},
            {'bufferView': 1, 'componentType': 5126, 'count': len(out_nors), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': ct, 'count': len(out_tris) * 3, 'type': 'SCALAR'},
        ],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    out = struct.pack('<III', GLB_MAGIC, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<II', len(js), CHUNK_JSON) + js + struct.pack('<II', len(binary), CHUNK_BIN) + binary
    dst = sys.argv[2]
    open(dst, 'wb').write(out)
    print('wrote', dst, len(out), 'B', 'verts', len(out_pts), 'tris', len(out_tris),
          'height', height_m, 'extent', [round(qhi[i] - qlo[i], 4) for i in range(3)],
          'sha256', hashlib.sha256(out).hexdigest())


if __name__ == '__main__':
    main()
