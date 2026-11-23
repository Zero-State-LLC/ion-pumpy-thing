// The 3D view's lab look (docs/adr/0007, GLOSSARY.md): the views that depict real apparatus are
// lit by a key, a fill and a rim light, and their props take physically based materials chosen
// by prop kind, glass, copper, brushed or polished metal, in the colour the scene entry gives.
// The other three looks keep their materials; the heat look gains an edge round each cold mark
// (docs/VISUAL-AUDIT.md, finding 5). Node has no WebGL, so this reads the source;
// tests/browser-check.mjs proves the frames draw.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'view3d.js'), 'utf8').replace(/\r\n/g, '\n');
const types = fs.readFileSync(path.join(__dirname, '..', 'types', 'globals.d.ts'), 'utf8');
// A DRAW entry's whole body, from its line to the next entry at the same depth.
const entry = name => {
  const m = source.match(new RegExp(`\\n    '?${name}'?\\(e\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(m, `view3d.js draws '${name}'`); return m[0];
};
const build = (() => {
  const m = source.match(/\n  function build\(look, view, H\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'view3d.js builds a world per look'); return m[0];
})();
const surface = (() => {
  const m = source.match(/\n  const surface = [\s\S]*?\n  \};?\n/);
  assert.ok(m, 'view3d.js has a surface() material chooser'); return m[0];
})();

test('lab is a look the game can ask for', () => {
  assert.equal(types.match(/'heat' \| 'visible' \| 'lab' \| 'diagram'/g)?.length, 2, 'both the view and the frame type name it');
  assert.match(source, /look: 'heat' \| 'visible' \| 'lab' \| 'diagram'/, 'and the renderer\'s own draw() doc does');
});

test('the lab look lights its scene with a key, a fill and a rim light that turn with the camera, over a studio environment for its metals', () => {
  const lab = build.match(/if \(look === 'lab'\) \{[\s\S]*?\n    \}/);
  assert.ok(lab, 'build() has a lab branch');
  for (const light of ['key', 'fill', 'rim']) assert.match(lab[0], new RegExp(`${light}.*DirectionalLight`), `a ${light} light`);
  assert.equal(lab[0].match(/applyAxisAngle\(/g)?.length, 3, 'each turned with the camera, as the visible look\'s sun is');
  assert.match(lab[0], /scene\.environment = /, 'an environment, so polished metal has something to reflect');
  assert.match(source, /PMREMGenerator/, 'made once by the renderer from a studio scene, no image asset');
  assert.doesNotMatch(lab[0], /castShadow|shadowMap/, 'no shadow maps: orthographic side views gain nothing from them');
});

test('lab materials are chosen by prop kind, glass, copper, brushed or polished, and coloured by the entry', () => {
  assert.match(surface, /\(colour, kind\)/, 'surface() takes the prop kind');
  const lab = source.match(/\n  const LAB = \{[\s\S]*?\n  \};/);
  assert.ok(lab, 'one table of lab materials');
  for (const kind of ['glass', 'copper', 'brushed', 'polished']) assert.match(lab[0], new RegExp(`\\n    ${kind}: `), `${kind} is one`);
  assert.match(lab[0], /glass: .*MeshPhysicalMaterial/, 'glass is physical: clearcoat and transmission-free transparency');
  assert.equal(lab[0].match(/metalness: /g)?.length, 4, 'each sets metalness');
  assert.equal(lab[0].match(/roughness: /g)?.length, 4, 'and roughness');
  assert.doesNotMatch(lab[0], /map:|TextureLoader/, 'no textures: a heat view must still colour the same prop by temperature (docs/adr/0004)');
  assert.match(surface, /world\.look === 'lab' \? LAB\[kind\]\(colour\)/, 'the lab look takes the kind\'s material in the entry\'s colour');
});

test('every apparatus prop names its kind: the coil is copper, the plates polished, the jar glass, the rest brushed metal', () => {
  const kinds = {
    'vacuum chamber': 'brushed', 'piston housing': 'brushed', 'pump handle': 'brushed', 'plate mount': 'brushed',
    piston: 'brushed', pipe: 'brushed', 'reactor wall': 'brushed', plate: 'polished', coil: 'copper', 'glass jar': 'glass'
  };
  for (const [name, kind] of Object.entries(kinds)) assert.match(entry(name), new RegExp(`surface\\([^)]*, '${kind}'\\)`), `${name} is ${kind}`);
  assert.match(entry('coil'), /emissive/, 'a coil\'s current, the list\'s opacity, shows as how warmly the copper glows');
});

test('the heat, visible and diagram looks keep their materials', () => {
  assert.match(surface, /world\.look === 'heat' \? heatMaterial\(ramp\)/, 'heat: every surface on the thermal scale');
  assert.match(surface, /world\.look === 'visible' \? new THREE\.MeshLambertMaterial/, 'visible: lit, matte');
  assert.match(surface, /: new THREE\.MeshBasicMaterial\(\{ color: colour/, 'diagram: unlit fills');
});

test('the heat look edges each cold mark in its outline colour, so a cold shape reads at a glance', () => {
  const mark = entry('cold mark');
  assert.match(mark, /world\.outline/, 'the edge takes the heat look\'s outline colour');
  assert.match(mark, /world\.look === 'heat'/, 'and only the heat look draws it');
});
