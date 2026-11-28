# Turns the Meshy preview of a vacuum-jar pedestal manifold into assets/jar-manifold.glb.
#   python3 tools/clean-jar-manifold.py RAW.glb assets/jar-manifold.glb
# RAW.glb is the untextured preview mesh of Meshy text-to-3d task 01a22116-ea44-75bd-81f5-89a247c93e5e
# (model meshy-7.1, 2k geometry, sha256 ea2f03e64ff081be89d57e9af683eb945a4bcce99912a8758d403482980582fb;
# see docs/ASSETS.md).
# Meshy gives it Y up in a unit box. This keeps Y up, puts the origin at the centre of the upper
# circular seating rim where the glass jar rests, scales it evenly so the upper rim radius is
# SEAT_RADIUS metres, welds UV seams and computes angle-creased smooth normals (35 deg), and
# writes one untextured mesh (`manifold`) with `seatRadius` in its node extras.
# Pure Python 3 standard library.
import hashlib, json, math, struct, sys

GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942
SEAT_RADIUS = 0.36  # metres, upper circular ring seat radius
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
    tris = [(idx[k], idx[k + 1], idx[k + 2]) for k in range(0, len(idx), 3)]
    return pts, tris


def smooth_by_angle(pts, tris, cos_limit=CREASE_COS):
    # Weld duplicate positions so UV seam splits do not introduce fake shading creases.
    weld_map = {}
    wpts = []
    remap = []
    for x, y, z in pts:
        key = (round(x, 6), round(y, 6), round(z, 6))
        vi = weld_map.get(key)
        if vi is None:
            vi = len(wpts)
            weld_map[key] = vi
            wpts.append((x, y, z))
        remap.append(vi)

    wtris = []
    fnorms = []
    fareas = []
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
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
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

    out_pts = []
    out_nors = []
    out_tris = []
    cache = {}
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


def write_glb(dst, name, pts, nors, tris, extras, generator):
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    pad = lambda b: b + b'\x00' * (-len(b) % 4)
    pos = struct.pack(f'<{len(pts) * 3}f', *(c for p in pts for c in p))
    nor = struct.pack(f'<{len(nors) * 3}f', *(c for n in nors for c in n))
    dt, ct = ('H', 5123) if len(pts) < 65536 else ('I', 5125)
    idx = struct.pack(f'<{len(tris) * 3}{dt}', *(k for t in tris for k in t))
    chunks = [pad(pos), pad(nor), pad(idx)]
    offs = [sum(len(c) for c in chunks[:k]) for k in range(3)]
    binary = b''.join(chunks)
    node = {'mesh': 0, 'name': name}
    if extras:
        node['extras'] = extras
    gltf = {
        'asset': {'version': '2.0', 'generator': generator},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [node],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': offs[0], 'byteLength': len(pos), 'target': 34962},
            {'buffer': 0, 'byteOffset': offs[1], 'byteLength': len(nor), 'target': 34962},
            {'buffer': 0, 'byteOffset': offs[2], 'byteLength': len(idx), 'target': 34963},
        ],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(pts), 'type': 'VEC3', 'min': [float(v) for v in lo], 'max': [float(v) for v in hi]},
            {'bufferView': 1, 'componentType': 5126, 'count': len(nors), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': ct, 'count': len(tris) * 3, 'type': 'SCALAR'},
        ],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    out = struct.pack('<III', GLB_MAGIC, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<II', len(js), CHUNK_JSON) + js + struct.pack('<II', len(binary), CHUNK_BIN) + binary
    open(dst, 'wb').write(out)
    print('wrote', dst, len(out), 'B', 'verts', len(pts), 'tris', len(tris),
          'extent', [round(hi[i] - lo[i], 4) for i in range(3)], 'sha256', hashlib.sha256(out).hexdigest())


def main():
    pts, tris = read_glb(sys.argv[1])
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    cx = (lo[0] + hi[0]) / 2.0
    cz = (lo[2] + hi[2]) / 2.0
    top_y = hi[1]
    # Measure outer radius of the upper ring seat (top 15% of height).
    top_cut = hi[1] - 0.15 * (hi[1] - lo[1])
    seat_r = max(math.hypot(x - cx, z - cz) for x, y, z in pts if y >= top_cut)
    k = SEAT_RADIUS / seat_r
    qpts = [((x - cx) * k, (y - top_y) * k, (z - cz) * k) for x, y, z in pts]
    out_pts, out_nors, out_tris = smooth_by_angle(qpts, tris)
    write_glb(sys.argv[2], 'manifold', out_pts, out_nors, out_tris,
              {'seatRadius': SEAT_RADIUS},
              'Meshy text-to-3d preview, cleaned by tools/clean-jar-manifold.py')


if __name__ == '__main__':
    main()
