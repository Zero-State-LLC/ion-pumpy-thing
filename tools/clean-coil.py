# Turns the Meshy preview of an electromagnet Bitter coil ring into assets/electromagnet-coil.glb.
#   python3 tools/clean-coil.py RAW.glb assets/electromagnet-coil.glb
# RAW.glb is the untextured preview mesh of Meshy text-to-3d task 01a2211a-7f0d-74f4-a64d-ccd9389cd659
# (model meshy-7.1, 2k geometry, sha256 8093bc67a185414b0fb98d4257e6c534b2b13eb589024268fd1dd3e9f00673a1;
# see docs/ASSETS.md).
# Meshy stood the ring upright facing Z; this rotates it 90 deg about X so it lies flat in the XZ
# plane with its opening along Y (matching Hold's horizontal coils), centres it on the origin,
# scales it evenly so its mean major radius is MAJOR_RADIUS metres, computes 35 deg creased smooth
# normals, and splits the triangles across x = 0 into two named meshes (`left` and `right`) sharing
# one vertex buffer so left and right coil currents glow independently. Pure Python 3 stdlib.
import hashlib, json, math, struct, sys

GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942
MAJOR_RADIUS = 1.0
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
    # Proper +90 deg rotation about X: (x, y, z) -> (x, -z, y), laying ring flat in XZ plane.
    rpts = [(x, -z, y) for x, y, z in pts]
    lo = [min(p[i] for p in rpts) for i in range(3)]
    hi = [max(p[i] for p in rpts) for i in range(3)]
    c = [(lo[i] + hi[i]) / 2.0 for i in range(3)]
    radii = [math.hypot(x - c[0], z - c[2]) for x, _, z in rpts]
    major = (min(radii) + max(radii)) / 2.0
    k = MAJOR_RADIUS / major
    qpts = [((x - c[0]) * k, (y - c[1]) * k, (z - c[2]) * k) for x, y, z in rpts]
    out_pts, out_nors, out_tris = smooth_by_angle(qpts, tris)
    qlo = [min(p[i] for p in out_pts) for i in range(3)]
    qhi = [max(p[i] for p in out_pts) for i in range(3)]
    half_h = round((qhi[1] - qlo[1]) / 2.0, 6)

    left_tris, right_tris = [], []
    for t in out_tris:
        cx = (out_pts[t[0]][0] + out_pts[t[1]][0] + out_pts[t[2]][0]) / 3.0
        (left_tris if cx < 0.0 else right_tris).append(t)

    parts = [('left', left_tris), ('right', right_tris)]
    dt, ct = ('H', 5123) if len(out_pts) < 65536 else ('I', 5125)
    pad = lambda b: b + b'\x00' * (-len(b) % 4)
    pos = struct.pack(f'<{len(out_pts) * 3}f', *(v for p in out_pts for v in p))
    nor = struct.pack(f'<{len(out_nors) * 3}f', *(v for n in out_nors for v in n))
    idx_bins = [struct.pack(f'<{len(p) * 3}{dt}', *(v for t in p for v in t)) for _, p in parts]
    chunks = [pad(pos), pad(nor)] + [pad(ib) for ib in idx_bins]
    offs = [sum(len(ch) for ch in chunks[:i]) for i in range(len(chunks))]
    binary = b''.join(chunks)
    extras = {'majorRadius': MAJOR_RADIUS, 'halfHeight': half_h}
    gltf = {
        'asset': {'version': '2.0', 'generator': 'Meshy text-to-3d preview, cleaned by tools/clean-coil.py'},
        'scene': 0, 'scenes': [{'nodes': [0, 1]}],
        'nodes': [{'mesh': i, 'name': name, 'extras': extras} for i, (name, _) in enumerate(parts)],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2 + i}]} for i, (name, _) in enumerate(parts)],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': offs[0], 'byteLength': len(pos), 'target': 34962},
            {'buffer': 0, 'byteOffset': offs[1], 'byteLength': len(nor), 'target': 34962},
        ] + [
            {'buffer': 0, 'byteOffset': offs[2 + i], 'byteLength': len(idx_bins[i]), 'target': 34963}
            for i in range(len(parts))
        ],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(out_pts), 'type': 'VEC3', 'min': [float(v) for v in qlo], 'max': [float(v) for v in qhi]},
            {'bufferView': 1, 'componentType': 5126, 'count': len(out_nors), 'type': 'VEC3'},
        ] + [
            {'bufferView': 2 + i, 'componentType': ct, 'count': len(p) * 3, 'type': 'SCALAR'}
            for i, (_, p) in enumerate(parts)
        ],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    out = struct.pack('<III', GLB_MAGIC, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<II', len(js), CHUNK_JSON) + js + struct.pack('<II', len(binary), CHUNK_BIN) + binary
    dst = sys.argv[2]
    open(dst, 'wb').write(out)
    print('wrote', dst, len(out), 'B', 'verts', len(out_pts), 'tris', len(out_tris),
          [(n, len(p)) for n, p in parts], 'halfHeight', half_h,
          'extent', [round(qhi[i] - qlo[i], 4) for i in range(3)],
          'sha256', hashlib.sha256(out).hexdigest())


if __name__ == '__main__':
    main()
