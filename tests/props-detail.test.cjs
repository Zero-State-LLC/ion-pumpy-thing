// Slice 4 of the visual audit (docs/VISUAL-AUDIT.md): the two cut-away props, the vacuum chamber
// and the piston housing, have walls. Meshy drew each as one skin, so where the 3D view cuts the
// near half away the cut read as paper. A Blender background script, tools/blender/wall-props.py,
// gives each a wall of real thickness, inward, so the outer size the renderer scales by (the
// wall radius in the node's extras) is unchanged, and the register (docs/ASSETS.md) names the
// script and the Blender release that ran it, with the hash of the file as committed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const register = read('docs/ASSETS.md').toString('utf8');

// The GLB's JSON chunk and the positions of its first primitive.
function prop(file) {
  const b = read(file), length = b.readUInt32LE(12), j = JSON.parse(b.toString('utf8', 20, 20 + length));
  const [prim] = j.meshes[0].primitives, pos = j.accessors[prim.attributes.POSITION];
  const binStart = 20 + length + 8, view = j.bufferViews[pos.bufferView];
  const xyz = new Float32Array(b.buffer.slice(b.byteOffset + binStart + (view.byteOffset || 0), b.byteOffset + binStart + (view.byteOffset || 0) + pos.count * 12));
  return { j, prim, pos, xyz };
}

// The radii, from the Y axis, of the points in the middle three fifths of the prop's height,
// where only the wall and its ribs are.
function middleRadii({ pos, xyz }) {
  const height = pos.max[1] - pos.min[1], radii = [];
  for (let i = 0; i < pos.count; i++) if (Math.abs(xyz[i * 3 + 1]) < 0.3 * height) radii.push(Math.hypot(xyz[i * 3], xyz[i * 3 + 2]));
  return radii.sort((a, b) => a - b);
}

// Each prop's wall: the radius the renderer scales by, and how thick the wall is, inward from it.
const WALLS = { 'assets/vacuum-chamber.glb': { radius: 0.5, thickness: 0.02 }, 'assets/piston-housing.glb': { radius: 0.025, thickness: 0.003 } };

for (const [file, { radius, thickness }] of Object.entries(WALLS)) {
  test(`${file} has a wall ${thickness * 1000} mm thick inside its ${radius} m radius, untextured, and still sized for the renderer`, () => {
    const p = prop(file), { j } = p;
    for (const key of ['images', 'textures', 'materials', 'samplers', 'extensionsUsed']) assert.equal(j[key], undefined, `no ${key}`);
    assert.equal(j.nodes.length, 1, 'one node');
    assert.deepEqual(j.nodes[0].extras, { wallRadius: radius }, 'the wall radius the renderer scales by');
    assert.ok(p.prim.attributes.NORMAL !== undefined, 'with normals, for lighting');
    assert.ok(j.accessors[p.prim.indices].count / 3 <= 30000, 'at most 30,000 triangles');
    assert.ok(read(file).length <= 1024 * 1024, 'at most 1 MB');
    const radii = middleRadii(p);
    // The inner face of the wall is the nearest the middle comes to the axis; the outer face is
    // still at the radius the renderer scales by, with points on it.
    assert.ok(Math.abs(radii[0] - (radius - thickness)) < radius * 1e-3, `inner face ${radii[0]} m from the axis`);
    assert.ok(radii.some(r => Math.abs(r - radius) < radius * 1e-3), `points on the outer face at ${radius} m`);
    // Nothing of the middle sits in the wall itself: the wall is solid, two faces and a gap.
    const inside = radii.filter(r => r > radius - thickness + radius * 2e-3 && r < radius - radius * 2e-3);
    assert.equal(inside.length, 0, `${inside.length} points inside the wall`);
  });
}

test('the register names the wall script and the Blender release for each walled prop, and the script is in the repository', () => {
  assert.ok(fs.existsSync(path.join(root, 'tools/blender/wall-props.py')), 'tools/blender/wall-props.py');
  for (const file of Object.keys(WALLS)) {
    const row = register.split('\n').find(l => l.startsWith(`| \`${file}\` |`));
    assert.ok(row, `${file} is in the register`);
    assert.match(row, /`tools\/blender\/wall-props\.py`/, `${file}'s row names the script`);
    assert.match(row, /Blender \d+\.\d+\.\d+/, `${file}'s row names the Blender release`);
  }
});
