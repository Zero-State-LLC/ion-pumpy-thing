// Slice 8 of the visual audit (docs/VISUAL-AUDIT.md, issue #102):
// 1. Upgraded Meshy 7.1 (2k Ultra) assets/airliner.glb across Orbit, Open (Throat), and Converge
//    (<= 10,000 tris, <= 1 MB, untextured, split airframe + engines, 60.9 x 18.5 x 63.7 m).
// 2. New Meshy 7.1 (2k Ultra) assets/optical-bench.glb laboratory breadboard rail seated beneath
//    Step 5's Casimir plate mounts in the lab look (<= 15,000 tris, <= 1 MB, untextured).
// 3. Cloudflare Pages _headers file shipped into dist/ so JS modules revalidate via ETag.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const view3d = read('view3d.js').toString('utf8').replace(/\r\n/g, '\n');
const html = read('index.html').toString('utf8');
const register = read('docs/ASSETS.md').toString('utf8');

function gltf(file) {
  const b = read(file);
  assert.equal(b.toString('ascii', 0, 4), 'glTF', `${file} magic`);
  const length = b.readUInt32LE(12);
  assert.equal(b.toString('ascii', 16, 20), 'JSON', `${file} JSON chunk`);
  return { b, j: JSON.parse(b.toString('utf8', 20, 20 + length)), length };
}

test('assets/airliner.glb is upgraded to Meshy 7.1 2k with clean airframe/engines split and 18.5 m real tail height', () => {
  const { b, j } = gltf('assets/airliner.glb');
  assert.ok(b.length <= 1024 * 1024, `<= 1 MB (${b.length} B)`);
  for (const key of ['images', 'textures', 'materials', 'samplers', 'extensionsUsed']) {
    assert.equal(j[key], undefined, `no ${key}`);
  }
  assert.deepEqual(j.nodes.map(n => n.name), ['airframe', 'engines']);
  const [airPrim, engPrim] = j.meshes.map(m => m.primitives[0]);
  assert.equal(airPrim.attributes.POSITION, engPrim.attributes.POSITION, 'shared vertex buffer');
  const airTris = j.accessors[airPrim.indices].count / 3;
  const engTris = j.accessors[engPrim.indices].count / 3;
  assert.ok(airTris + engTris > 7000 && airTris + engTris <= 10000, `upgraded triangle budget (${airTris + engTris})`);
  assert.ok(engTris >= 800 && engTris <= 4500, `substantive twin turbofan engines split (${engTris} tris)`);
  const pos = j.accessors[airPrim.attributes.POSITION];
  const height = pos.max[1] - pos.min[1];
  assert.ok(Math.abs(height - 18.5) < 0.05, `real 777-200ER tail height 18.5 m (got ${height})`);
  const row = register.split('\n').find(l => l.startsWith('| `assets/airliner.glb` |'));
  assert.match(row, /meshy-7\.1/, 'docs/ASSETS.md records meshy-7.1 upgrade for airliner.glb');
});

test('assets/optical-bench.glb is an untextured Meshy 7.1 rail with origin on its top deck and length 1.0 m in extras', () => {
  const { b, j } = gltf('assets/optical-bench.glb');
  assert.ok(b.length <= 1024 * 1024, `<= 1 MB (${b.length} B)`);
  for (const key of ['images', 'textures', 'materials', 'samplers', 'extensionsUsed']) {
    assert.equal(j[key], undefined, `no ${key}`);
  }
  assert.deepEqual(j.nodes.map(n => n.name), ['bench']);
  for (const key of ['matrix', 'rotation', 'scale', 'translation']) {
    assert.equal(j.nodes[0][key], undefined, 'bench baked in place');
  }
  assert.equal(j.nodes[0].extras.length, 1);
  assert.ok(j.nodes[0].extras.height > 0.15 && j.nodes[0].extras.height < 0.5, `height ${j.nodes[0].extras.height}`);
  const [prim] = j.meshes[0].primitives;
  assert.ok(prim.attributes.NORMAL !== undefined, 'smooth normals present');
  const tris = j.accessors[prim.indices].count / 3;
  assert.ok(tris > 1000 && tris <= 15000, `triangle budget (${tris})`);
  const pos = j.accessors[prim.attributes.POSITION];
  assert.ok(Math.abs(pos.max[1]) < 1e-4, `origin sits on top deck (maxY=${pos.max[1]})`);
  assert.ok(Math.abs((pos.max[0] - pos.min[0]) - 1.0) < 1e-3, `normalized length 1.0 m`);
  assert.ok(Math.abs(pos.max[0] + pos.min[0]) < 1e-3, 'centred along X');
});

test('index.html passes opticalBench to IonView3D.start and view3d.js renders it beneath plate mounts in lab look', () => {
  const startCall = html.match(/IonView3D\.start\([\s\S]*?props:\s*\{([^}]*)\}/);
  assert.ok(startCall, 'index.html passes props to IonView3D.start');
  assert.match(startCall[1], /opticalBench:\s*'assets\/optical-bench\.glb'/, 'index.html passes opticalBench');
  assert.match(view3d, /opticalBench/, 'view3d.js loads opticalBench');
  const plateMountEntry = view3d.match(/\n    'plate mount'\(e\) \{[\s\S]*?\n    \}/);
  assert.ok(plateMountEntry, 'view3d.js draws plate mount');
  assert.match(plateMountEntry[0], /bench/, 'plate mount seats an optical bench beneath the posts in lab look');
});

test('Cloudflare Pages _headers revalidates JS modules and is copied by scripts/build-dist.sh', () => {
  const headers = read('_headers').toString('utf8');
  for (const file of ['/view3d.js', '/view3d-shapes.js', '/audio.js', '/audio-cues.js']) {
    assert.match(headers, new RegExp(`${file.replace('.', '\\.')}[\\s\\S]*?max-age=0,\\s*must-revalidate`), `_headers revalidates ${file}`);
  }
  const buildScript = read('scripts/build-dist.sh').toString('utf8');
  assert.match(buildScript, /_headers/, 'scripts/build-dist.sh copies _headers into dist/');
});
