// The assets register (docs/ASSETS.md) and the files it lists: every vendored or generated
// file the site ships is listed with the hash of the file as committed, and the airliner and
// plate mount props are what issues #56 and #58 ask for.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const register = read('docs/ASSETS.md').toString('utf8');
const FLIGHT_NAMES = require('./flight-names.cjs');
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const shipped = [...walk('vendor'), ...walk('assets').filter(f => f.endsWith('.glb'))];
// The register's rows: file, then its hash, from the table.
const rows = new Map([...register.matchAll(/^\| `([^`]+)` \|.*\| `([0-9a-f]{64})` \| (\d{4}-\d{2}-\d{2}) \|$/gm)].map(m => [m[1], { hash: m[2], date: m[3] }]));

test('every vendored file and every generated model the site ships is in the assets register, with the hash of the file as committed', () => {
  assert.ok(shipped.length >= 7, 'the files are where the register says');
  for (const file of shipped) {
    assert.ok(rows.has(file), `${file} is listed`);
    assert.equal(rows.get(file).hash, crypto.createHash('sha256').update(read(file)).digest('hex'), `${file}'s hash`);
  }
  for (const file of rows.keys()) assert.ok(fs.existsSync(path.join(root, file)), `${file}, listed, is shipped`);
});

test('no file name or register entry names the flight', () => {
  assert.doesNotMatch(register, FLIGHT_NAMES);
  for (const file of shipped) assert.doesNotMatch(file, FLIGHT_NAMES);
});

test('the vendored three.js is 0.187.0, the release the renderer is type-checked against, and the import map points at it', () => {
  assert.match(read('vendor/three/three.core.js').toString('utf8'), /const REVISION = '187';/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.devDependencies['@types/three'], '0.187.0');
  const html = read('index.html').toString('utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.ok(fs.existsSync(path.join(root, map.three)), map.three);
  for (const file of ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js']) assert.ok(fs.existsSync(path.join(root, map['three/addons/'], file)), file);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/, 'nothing loads from a CDN');
});

// The GLB's JSON chunk.
function gltf(file) {
  const b = read(file);
  assert.equal(b.toString('ascii', 0, 4), 'glTF');
  const length = b.readUInt32LE(12);
  assert.equal(b.toString('ascii', 16, 20), 'JSON');
  return JSON.parse(b.toString('utf8', 20, 20 + length));
}

test('the airliner prop is untextured, 10,000 triangles or fewer, 1 MB or less, Y up with the nose toward -Z, centred, at 60.9 m across the wings and 63.7 m long', () => {
  const file = 'assets/airliner.glb', j = gltf(file);
  assert.ok(read(file).length <= 1024 * 1024, 'at most 1 MB');
  for (const key of ['images', 'textures', 'materials', 'samplers', 'extensionsUsed']) assert.equal(j[key], undefined, `no ${key}`);
  const prims = j.meshes.flatMap(m => m.primitives);
  assert.deepEqual(j.nodes.map(n => n.name).sort(), ['airframe', 'engines']);
  for (const n of j.nodes) for (const key of ['matrix', 'rotation', 'scale', 'translation']) assert.equal(n[key], undefined, `${n.name} is already in place`);
  const triangles = prims.reduce((sum, p) => sum + j.accessors[p.indices].count / 3, 0);
  assert.ok(triangles <= 10000, `${triangles} triangles`);
  const pos = j.accessors[prims[0].attributes.POSITION];
  for (const p of prims) assert.equal(p.attributes.POSITION, prims[0].attributes.POSITION, 'one shared set of positions');
  const size = pos.max.map((hi, i) => hi - pos.min[i]), centre = pos.max.map((hi, i) => (hi + pos.min[i]) / 2);
  assert.ok(Math.abs(size[0] - 60.9) < 0.01, `span ${size[0]} m along X`);
  assert.ok(Math.abs(size[2] - 63.7) < 0.01, `length ${size[2]} m along Z`);
  assert.ok(size[1] > 10 && size[1] < 20, `height ${size[1]} m along Y`);
  for (const c of centre) assert.ok(Math.abs(c) < 1e-3, 'centred on the origin');
  // Nose toward -Z: the fin, the tallest part, stands at the tail, toward +Z.
  const b = read(file), binStart = 20 + b.readUInt32LE(12) + 8, view = j.bufferViews[pos.bufferView];
  const xyz = new Float32Array(b.buffer.slice(b.byteOffset + binStart + (view.byteOffset || 0), b.byteOffset + binStart + (view.byteOffset || 0) + pos.count * 12));
  let top = 0; for (let i = 1; i < pos.count; i++) if (xyz[i * 3 + 1] > xyz[top * 3 + 1]) top = i;
  assert.ok(xyz[top * 3 + 2] > 20, 'the fin top is at the tail, toward +Z');
});

test('the plate mount prop is untextured, 30,000 triangles or fewer, 1 MB or less, Y up at its real 100 mm, with its origin at the tip of its post', () => {
  const file = 'assets/plate-mount.glb', j = gltf(file);
  assert.ok(read(file).length <= 1024 * 1024, 'at most 1 MB');
  for (const key of ['images', 'textures', 'materials', 'samplers', 'extensionsUsed']) assert.equal(j[key], undefined, `no ${key}`);
  assert.deepEqual(j.nodes.map(n => n.name), ['mount']);
  for (const key of ['matrix', 'rotation', 'scale', 'translation']) assert.equal(j.nodes[0][key], undefined, 'already in place');
  const [prim] = j.meshes[0].primitives, pos = j.accessors[prim.attributes.POSITION];
  assert.ok(j.accessors[prim.indices].count / 3 <= 30000, 'at most 30,000 triangles');
  assert.ok(prim.attributes.NORMAL !== undefined, 'with normals, for lighting');
  assert.ok(Math.abs(pos.max[1] - pos.min[1] - 0.1) < 1e-6, `${pos.max[1] - pos.min[1]} m tall`);
  assert.ok(Math.abs(pos.max[1]) < 1e-6, 'the post tip, its top, at the origin');
  for (const i of [0, 2]) assert.ok(pos.max[i] - pos.min[i] > 0.05 && pos.max[i] - pos.min[i] < 0.2, 'a base about as wide as it is tall');
});
