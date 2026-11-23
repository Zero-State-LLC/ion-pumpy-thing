// The 3D view's flat shapes (view3d-shapes.js) are written in place into typed arrays that keep
// their size frame to frame, so a mark that changes shape every frame uploads new positions
// instead of building and discarding geometry. The Hold step's cusp leaks are the first user.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const shapes = () => import(pathToFileURL(path.join(root, 'view3d-shapes.js')).href);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} should be ${b}`);
const vertex = (out, i) => [out[3 * i], out[3 * i + 1], out[3 * i + 2]];

test('a sector writes 2(n+1) vertices, inner then outer at each sampled angle, into the array it is given', async () => {
  const { sector } = await shapes();
  const n = 4, out = new Float32Array(6 * (n + 1));
  assert.equal(sector(out, 2, 3, 0, Math.PI / 2, n), out, 'returns the array it wrote');
  near(vertex(out, 0)[0], 2, 'first inner vertex sits at radius 2 on the x axis');
  near(vertex(out, 1)[0], 3, 'first outer vertex sits at radius 3 on the x axis');
  near(vertex(out, 2 * n)[1], 2, 'last inner vertex sits at radius 2 on the y axis');
  near(vertex(out, 2 * n + 1)[1], 3, 'last outer vertex sits at radius 3 on the y axis');
  for (let i = 0; i < 2 * (n + 1); i++) near(vertex(out, i)[2], 0, `vertex ${i} lies in the plane`);
  // The same array, a different angle: the vertex count does not change, so a shape can follow
  // the model every frame without new buffers.
  assert.equal(sector(out, 2, 3, 1, 1.5, n), out);
  near(Math.hypot(...vertex(out, 0)), 2, 'rewritten inner vertex keeps radius 2');
});

test('a strip runs width wide along its points, open or closed, with the index to draw it', async () => {
  const { strip, stripIndex } = await shapes();
  const points = [[0, 0], [10, 0], [10, 10]], out = new Float32Array(6 * points.length);
  assert.equal(strip(out, points, 2, false), out);
  near(vertex(out, 0)[1], -1, 'at an open end the strip is offset straight across the first segment');
  near(vertex(out, 1)[1], 1, 'by half the width each side');
  near(vertex(out, 4)[0], 9, 'at the far end the strip is offset across the last segment');
  near(vertex(out, 5)[0], 11, 'by half the width each side');
  near(Math.abs(vertex(out, 2)[0] - vertex(out, 3)[0]), 2, 'a right-angle corner is mitred: its two vertices are a width apart in x');
  near(Math.abs(vertex(out, 2)[1] - vertex(out, 3)[1]), 2, 'and a width apart in y');

  const open = stripIndex(points.length, false), closed = stripIndex(points.length, true);
  assert.equal(open.length, 6 * (points.length - 1), 'two triangles per segment, open');
  assert.equal(closed.length, 6 * points.length, 'two triangles per segment, closed');
  assert.ok(Math.max(...closed) < 2 * points.length, 'the closing segment wraps to the first pair');
  assert.ok(Math.max(...open) < 2 * points.length);
});

test('the 3D view draws the cusp leaks with in-place shapes, not geometry built each frame', () => {
  const src = fs.readFileSync(path.join(root, 'view3d.js'), 'utf8');
  const start = src.indexOf("'cusp leaks'(e) {");
  assert.ok(start > 0, 'view3d.js draws the cusp leaks');
  const end = src.indexOf('\n    },', start);
  const body = src.slice(start, end);
  assert.ok(/\bstrip\b/.test(body) && /\bsector\b/.test(body), 'the leaks are strips and sectors');
  assert.ok(!/swapGeometry|new THREE\.\w+Geometry|tube\(/.test(body), 'no geometry is built while drawing a leak');
});
