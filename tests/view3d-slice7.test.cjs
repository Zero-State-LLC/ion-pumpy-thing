// Slice 7 of the visual audit (docs/VISUAL-AUDIT.md, issue #98): flagship Meshy 7.1 (2k Ultra)
// laboratory apparatus props across Ignite, Hold, Fuel, and Open. Each prop is untextured (so the
// lab look applies PBR materials and the heat look colours by temperature, ADR 0004 / 0007),
// <= 1 MB, <= 30,000 triangles, normalized in real metres with smooth normals, and wired into
// index.html and view3d.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const view3d = read('view3d.js').toString('utf8').replace(/\r\n/g, '\n');
const html = read('index.html').toString('utf8');

function gltf(file) {
  const b = read(file);
  assert.equal(b.toString('ascii', 0, 4), 'glTF', `${file} magic`);
  const length = b.readUInt32LE(12);
  assert.equal(b.toString('ascii', 16, 20), 'JSON', `${file} JSON chunk`);
  return { b, j: JSON.parse(b.toString('utf8', 20, 20 + length)), length };
}

function checkUntexturedGlb(file, expectedNodes, maxTris = 30000) {
  const { b, j } = gltf(file);
  assert.ok(b.length <= 1024 * 1024, `${file} <= 1 MB (${b.length} B)`);
  for (const key of ['images', 'textures', 'materials', 'samplers', 'extensionsUsed']) {
    assert.equal(j[key], undefined, `${file} has no ${key}`);
  }
  assert.deepEqual(j.nodes.map(n => n.name), expectedNodes, `${file} node names`);
  for (const n of j.nodes) {
    for (const key of ['matrix', 'rotation', 'scale', 'translation']) {
      assert.equal(n[key], undefined, `${file} node ${n.name} baked in place`);
    }
  }
  const prims = j.meshes.flatMap(m => m.primitives);
  for (const p of prims) assert.ok(p.attributes.NORMAL !== undefined, `${file} has smooth normals`);
  const tris = prims.reduce((sum, p) => sum + j.accessors[p.indices].count / 3, 0);
  assert.ok(tris > 500 && tris <= maxTris, `${file} triangle budget (${tris})`);
  return { b, j, prims, tris };
}

test('assets/reactor-vessel.glb is an open-bore bolted flange with boreRadius 1.0 m in extras', () => {
  const { b, j, prims, length } = { ...checkUntexturedGlb('assets/reactor-vessel.glb', ['vessel']), length: read('assets/reactor-vessel.glb').readUInt32LE(12) };
  assert.deepEqual(j.nodes[0].extras, { boreRadius: 1 });
  const pos = j.accessors[prims[0].attributes.POSITION];
  const binStart = 20 + length + 8, view = j.bufferViews[pos.bufferView];
  const xyz = new Float32Array(b.buffer.slice(b.byteOffset + binStart + (view.byteOffset || 0), b.byteOffset + binStart + (view.byteOffset || 0) + pos.count * 12));
  let minR = Infinity, maxR = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(xyz[i * 3], xyz[i * 3 + 1]);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  assert.ok(Math.abs(minR - 1.0) < 0.02, `open circular bore at 1.0 m (got ${minR})`);
  assert.ok(maxR > 1.4 && maxR < 2.0, `flange outer rim (${maxR})`);
});

test('assets/electromagnet-coil.glb splits cleanly into left and right halves around x = 0 with majorRadius 1.0 m', () => {
  const { j, prims } = checkUntexturedGlb('assets/electromagnet-coil.glb', ['left', 'right']);
  assert.equal(prims[0].attributes.POSITION, prims[1].attributes.POSITION, 'shared vertex buffer');
  for (const n of j.nodes) {
    assert.equal(n.extras.majorRadius, 1);
    assert.ok(n.extras.halfHeight > 0.1 && n.extras.halfHeight < 0.6, `halfHeight ${n.extras.halfHeight}`);
  }
});

test('assets/jar-manifold.glb, assets/piston-head.glb, assets/pipe-union.glb, and upgraded assets/pump-handle.glb meet prop geometry contracts', () => {
  const manifold = checkUntexturedGlb('assets/jar-manifold.glb', ['manifold']);
  assert.deepEqual(manifold.j.nodes[0].extras, { seatRadius: 0.36 });
  const mPos = manifold.j.accessors[manifold.prims[0].attributes.POSITION];
  assert.ok(Math.abs(mPos.max[1]) < 1e-4, 'jar-manifold origin sits at top seating rim');

  const piston = checkUntexturedGlb('assets/piston-head.glb', ['piston']);
  assert.equal(piston.j.nodes[0].extras.radius, 0.024);
  assert.ok(piston.j.nodes[0].extras.height > 0.015 && piston.j.nodes[0].extras.height < 0.05);

  const union = checkUntexturedGlb('assets/pipe-union.glb', ['union']);
  assert.deepEqual(union.j.nodes[0].extras, { length: 0.1 });

  const handle = checkUntexturedGlb('assets/pump-handle.glb', ['handle']);
  assert.deepEqual(handle.j.nodes[0].extras, { span: 0.12 });
  const hPos = handle.j.accessors[handle.prims[0].attributes.POSITION];
  assert.ok((hPos.max[1] - hPos.min[1]) / (hPos.max[0] - hPos.min[0]) < 0.55, 'compact T-handle silhouette');
});

test('index.html passes all ten Meshy GLB props to IonView3D.start and view3d.js loads and renders them', () => {
  const startCall = html.match(/IonView3D\.start\([\s\S]*?props:\s*\{([^}]*)\}/);
  assert.ok(startCall, 'index.html passes props to IonView3D.start');
  for (const key of ['reactorVessel', 'jarManifold', 'electromagnetCoil', 'pistonHead', 'pipeUnion']) {
    assert.match(startCall[1], new RegExp(`${key}:\\s*'assets/[^']+\\.glb'`), `index.html passes ${key}`);
  }
  for (const loader of ['loadReactorVessel', 'loadCoil', 'loadMeasuredProp']) {
    assert.match(view3d, new RegExp(`function ${loader}\\(`), `view3d.js defines ${loader}`);
  }
  const reactorWall = view3d.match(/\n    'reactor wall'\(e\) \{[\s\S]*?\n    \}/);
  assert.match(reactorWall[0], /vessel\.geometry/, 'reactor wall renders reactor-vessel.glb in lab look');
  const coilEntry = view3d.match(/\n    coil\(e\) \{[\s\S]*?\n    \}/);
  assert.match(coilEntry[0], /coilProp\.parts/, 'coil renders electromagnet-coil.glb left/right halves in lab look');
  const jarEntry = view3d.match(/\n    'glass jar'\(e\) \{[\s\S]*?\n    \}/);
  assert.match(jarEntry[0], /jarManifold\.geometry/, 'glass jar renders jar-manifold.glb cradle in lab look');
  const pistonEntry = view3d.match(/\n    piston\(e\) \{[\s\S]*?\n    \}/);
  assert.match(pistonEntry[0], /pistonHead\.geometry/, 'piston renders piston-head.glb in lab look');
  const pipeEntry = view3d.match(/\n    pipe\(e\) \{[\s\S]*?\n    \}/);
  assert.match(pipeEntry[0], /pipeUnion\.geometry/, 'pipe renders pipe-union.glb coupling in lab look');
});
