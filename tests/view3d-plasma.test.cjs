// The 3D view's plasma bodies (GLOSSARY.md): Hold's ball and Fuel's core are spheres drawn by
// one shader with a core, a shell, filaments and a turbulent edge, moved by a clock the renderer
// owns. The shader reads nothing but the scene entry and that clock (docs/adr/0003), and the
// clock can be pinned, which is how tests, captures and reduced motion hold the picture still.
// Node has no WebGL, so this reads the source; tests/browser-check.mjs proves the motion.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'view3d.js'), 'utf8').replace(/\r\n/g, '\n');
// A DRAW entry's line, and the body it hands the work to.
const entry = name => {
  const m = source.match(new RegExp(`\\n    '${name}'\\(e\\) \\{.*`));
  assert.ok(m, `view3d.js draws '${name}'`); return m[0];
};
const helper = (() => {
  const m = source.match(/\n  const body = [\s\S]*?\n  \};/);
  assert.ok(m, 'view3d.js has a body helper'); return m[0];
})();
const material = (() => {
  const m = source.match(/function plasmaMaterial\(\) \{([\s\S]*?)\n\}/);
  assert.ok(m, 'view3d.js has plasmaMaterial()'); return m[1];
})();

test('the plasma body shader takes a clock and noise, and nothing from the entry but its colours, opacity and size', () => {
  assert.match(material, /uTime: \{ value: 0 \}/, 'a clock uniform');
  assert.match(material, /uniform float uTime;/, 'the fragment shader reads the clock');
  assert.match(source, /float snoise\(vec3/, 'simplex noise written in GLSL, no texture');
  assert.match(material, /\$\{SNOISE\}/, 'and the fragment shader includes it');
  const uniforms = [...material.matchAll(/uniform \w+ (\w+);/g)].map(m => m[1]).sort();
  assert.deepEqual(uniforms, ['uColour', 'uCore', 'uOpacity', 'uTime'], 'no other input: turbulence does not track beta or any new entry field');
});

test("Hold's ball and Fuel's core are both spheres drawn with the plasma body shader", () => {
  assert.match(helper, /SphereGeometry/, 'a body is a sphere');
  assert.match(helper, /plasmaMaterial\(\)/, 'drawn with the plasma body material');
  assert.match(helper, /uCore\.value.*uColour\.value.*uOpacity\.value/, 'set from its entry');
  for (const name of ['plasma ball', 'core glow']) {
    assert.match(entry(name), /body\('/, `${name} is a body`);
    assert.doesNotMatch(entry(name), /CanvasTexture|createRadialGradient/, `${name} is not a flat gradient disc`);
  }
});

test('the renderer owns one clock, pins it with freeze(t), and pins it at 0 under reduced motion', () => {
  const api = source.slice(source.lastIndexOf('\n  return {'), source.indexOf('\nwindow.IonView3D'));
  assert.match(api, /\n    freeze\n/, 'freeze(t) on the renderer');
  assert.match(source, /\n  function freeze\(t\) \{/, 'and it is the renderer\'s own');
  assert.match(source, /prefers-reduced-motion: reduce/, 'the renderer reads the player\'s setting at start');
  assert.match(source, /freeze\(0\)/, 'and holds the clock at its first frame');
  assert.match(source, /uTime\.value = clock/, 'every frame gives the shader the one clock');
});
