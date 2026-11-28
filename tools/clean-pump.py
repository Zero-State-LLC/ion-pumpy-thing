# Turns the Meshy previews of the Ignite step's hand pump into the game's two props:
#   python3 tools/clean-pump.py housing RAW.glb assets/piston-housing.glb
#   python3 tools/clean-pump.py handle RAW.glb assets/pump-handle.glb
# RAW.glb is the untextured preview mesh of a Meshy text-to-3d task (see docs/ASSETS.md):
#   housing: task 01a20269-b61a-75f8-921b-73ccb7caf173
#            (sha256 625d31fc21b6e848c5b094495f83f5c63bc95aa2fbbe76c0855630e52b8aec95)
#   handle:  task 01a2211a-a308-76ca-b299-97f579885816 (model meshy-7.1, 2k geometry)
#            (sha256 e83bd8d6cc98c3fc1357b0794cedfc7be50dc77921512dd3de08d71d1cc33587)
# Meshy gives each Y up in a unit box. The piston housing is the pump's barrel, a flanged
# cylinder round the Y axis: this puts its origin on its axis at half its height and scales it
# evenly to its real size, its side wall, between the flanges, HOUSING_WALL_RADIUS from the axis.
# The pump handle is a T, its grip bar along X: this puts its origin at the bar's middle and
# scales it evenly so the bar is HANDLE_SPAN long. Each gets 35 deg creased smooth normals and is
# written as one untextured mesh, its measure (wallRadius or span, in metres) in its node's extras.
# Pure Python 3 standard library.
import hashlib, json, math, struct, sys

GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942
HOUSING_WALL_RADIUS = 0.025
HANDLE_SPAN = 0.12
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
    part, src, dst = sys.argv[1:4]
    pts, tris = read_glb(src)
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    centre = [(lo[i] + hi[i]) / 2.0 for i in range(3)]
    if part == 'housing':
        middle = [math.hypot(x - centre[0], z - centre[2]) for x, y, z in pts if abs(y - centre[1]) < 0.3 * (hi[1] - lo[1])]
        measure = min(middle)
        name, extras, k = 'housing', {'wallRadius': HOUSING_WALL_RADIUS}, HOUSING_WALL_RADIUS / measure
    elif part == 'handle':
        bar_y = [y for x, y, _ in pts if abs(x - centre[0]) > 0.3 * (hi[0] - lo[0])]
        centre[1] = (min(bar_y) + max(bar_y)) / 2.0
        measure = hi[0] - lo[0]
        name, extras, k = 'handle', {'span': HANDLE_SPAN}, HANDLE_SPAN / measure
    else:
        sys.exit('part must be housing or handle')

    qpts = [((x - centre[0]) * k, (y - centre[1]) * k, (z - centre[2]) * k) for x, y, z in pts]
    out_pts, out_nors, out_tris = smooth_by_angle(qpts, tris)
    qlo = [min(p[i] for p in out_pts) for i in range(3)]
    qhi = [max(p[i] for p in out_pts) for i in range(3)]
    print(part, 'measure (unit box):', round(float(measure), 4),
          'size in metres:', [round(qhi[i] - qlo[i], 4) for i in range(3)])

    dt, ct = ('H', 5123) if len(out_pts) < 65536 else ('I', 5125)
    pad = lambda b: b + b'\x00' * (-len(b) % 4)
    pos = struct.pack(f'<{len(out_pts) * 3}f', *(v for p in out_pts for v in p))
    nor = struct.pack(f'<{len(out_nors) * 3}f', *(v for n in out_nors for v in n))
    idx = struct.pack(f'<{len(out_tris) * 3}{dt}', *(v for t in out_tris for v in t))
    chunks = [pad(pos), pad(nor), pad(idx)]
    offs = [sum(len(ch) for ch in chunks[:i]) for i in range(3)]
    binary = b''.join(chunks)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'Meshy text-to-3d preview, cleaned by tools/clean-pump.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': name, 'extras': extras}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
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
    open(dst, 'wb').write(out)
    print('wrote', dst, len(out), 'B', 'verts', len(out_pts), 'tris', len(out_tris), 'sha256', hashlib.sha256(out).hexdigest())


if __name__ == '__main__':
    main()
