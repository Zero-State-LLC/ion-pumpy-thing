# Turns the Meshy 7.1 preview of the airliner into the game's prop, assets/airliner.glb.
#   python3 tools/clean-airliner.py RAW.glb assets/airliner.glb
# RAW.glb is the untextured preview mesh of Meshy text-to-3d task 01a22178-f6bd-707d-a698-5ef3a954bd3e
# (model meshy-7.1, 2k geometry, sha256 2dee618e1b600d1d715174d8cd7fd48f2cffa50c5c606a06717cb186c5e0d299;
# see docs/ASSETS.md).
# Rotates to Y up with the nose toward -Z, scales to Boeing 777-200ER dimensions (60.9 m span,
# 18.5 m tail height, 63.7 m length), centres the bounding box on the origin, welds UV seams and
# computes angle-creased smooth normals (35 deg), and writes two untextured meshes sharing one
# vertex buffer: `airframe` and `engines`.
# Pure Python 3 standard library.
import hashlib, json, math, struct, sys

GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942
SPAN_M, HEIGHT_M, LENGTH_M = 60.9, 18.5, 63.7
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


def smooth_by_angle(pts, tris, flags, cos_limit=CREASE_COS):
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
    wflags = []
    fnorms = []
    fareas = []
    v_to_t = [[] for _ in range(len(wpts))]
    for (a, b, c), is_eng in zip(tris, flags):
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
        wflags.append(is_eng)
        fnorms.append((nx / area, ny / area, nz / area))
        fareas.append(area)
        v_to_t[ia].append(ti)
        v_to_t[ib].append(ti)
        v_to_t[ic].append(ti)

    out_pts = []
    out_nors = []
    air_tris = []
    eng_tris = []
    cache = {}
    for ti, ((ia, ib, ic), is_eng) in enumerate(zip(wtris, wflags)):
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
        if is_eng:
            eng_tris.append(tuple(tri_out))
        else:
            air_tris.append(tuple(tri_out))
    return out_pts, out_nors, air_tris, eng_tris


def write_glb(dst, pts, nors, parts, generator):
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    pad = lambda b: b + b'\x00' * (-len(b) % 4)
    pos = struct.pack(f'<{len(pts) * 3}f', *(c for p in pts for c in p))
    nor = struct.pack(f'<{len(nors) * 3}f', *(c for n in nors for c in n))
    dt, ct = ('H', 5123) if len(pts) < 65536 else ('I', 5125)
    idx_chunks = [struct.pack(f'<{len(t) * 3}{dt}', *(k for tri in t for k in tri)) for _, t in parts]
    chunks = [pad(pos), pad(nor)] + [pad(ic) for ic in idx_chunks]
    offs = [sum(len(c) for c in chunks[:k]) for k in range(len(chunks))]
    binary = b''.join(chunks)
    gltf = {
        'asset': {'version': '2.0', 'generator': generator},
        'scene': 0, 'scenes': [{'nodes': list(range(len(parts)))}],
        'nodes': [{'mesh': k, 'name': n} for k, (n, _) in enumerate(parts)],
        'meshes': [{'name': n, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2 + k}]} for k, (n, _) in enumerate(parts)],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': offs[0], 'byteLength': len(pos), 'target': 34962},
            {'buffer': 0, 'byteOffset': offs[1], 'byteLength': len(nor), 'target': 34962},
        ] + [
            {'buffer': 0, 'byteOffset': offs[2 + k], 'byteLength': len(idx_chunks[k]), 'target': 34963}
            for k in range(len(parts))
        ],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(pts), 'type': 'VEC3', 'min': [float(v) for v in lo], 'max': [float(v) for v in hi]},
            {'bufferView': 1, 'componentType': 5126, 'count': len(nors), 'type': 'VEC3'},
        ] + [
            {'bufferView': 2 + k, 'componentType': ct, 'count': len(t) * 3, 'type': 'SCALAR'}
            for k, (_, t) in enumerate(parts)
        ],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    out = struct.pack('<III', GLB_MAGIC, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<II', len(js), CHUNK_JSON) + js + struct.pack('<II', len(binary), CHUNK_BIN) + binary
    open(dst, 'wb').write(out)
    print('wrote', dst, len(out), 'B', 'verts', len(pts), 'tris', sum(len(t) for _, t in parts),
          [(n, len(t)) for n, t in parts], 'extent', [round(hi[i] - lo[i], 3) for i in range(3)],
          'sha256', hashlib.sha256(out).hexdigest())


def main():
    pts, tris = read_glb(sys.argv[1])  # Meshy frame: nose -x, tail +x, up +y, wings +/-z
    # Classify the twin under-wing turbofan engine nacelles (below the pylon neck at y = -0.19).
    flags = []
    for a, b, c in tris:
        cx = (pts[a][0] + pts[b][0] + pts[c][0]) / 3.0
        cy = (pts[a][1] + pts[b][1] + pts[c][1]) / 3.0
        cz = (pts[a][2] + pts[b][2] + pts[c][2]) / 3.0
        is_eng = (0.215 <= abs(cz) <= 0.365) and (cy < -0.190) and (-0.285 <= cx <= 0.065)
        flags.append(is_eng)

    # Rotate: new x = -old z (span), new y = old y (up), new z = old x (nose -x -> -z). Proper rotation.
    rpts = [(-z, y, x) for x, y, z in pts]
    lo = [min(p[i] for p in rpts) for i in range(3)]
    hi = [max(p[i] for p in rpts) for i in range(3)]
    mid = [(lo[i] + hi[i]) / 2.0 for i in range(3)]
    sx = SPAN_M / (hi[0] - lo[0])
    sy = HEIGHT_M / (hi[1] - lo[1])
    sz = LENGTH_M / (hi[2] - lo[2])
    qpts = [((x - mid[0]) * sx, (y - mid[1]) * sy, (z - mid[2]) * sz) for x, y, z in rpts]

    out_pts, out_nors, air_tris, eng_tris = smooth_by_angle(qpts, tris, flags)
    write_glb(sys.argv[2], out_pts, out_nors, [('airframe', air_tris), ('engines', eng_tris)],
              'Meshy text-to-3d preview, cleaned by tools/clean-airliner.py')


if __name__ == '__main__':
    main()
