// Slice 5 of the visual audit (docs/VISUAL-AUDIT.md): the 3D view has three quality levels. Low
// draws as before; medium adds a fresnel rim on the lab look's glass and a depth tint on what
// lies behind the scene's origin in the lab and visible looks; high adds a selective bloom on the
// plasma bodies, Ignite's glow and the bright flash, and nothing else. Under auto the renderer
// starts high on a desktop and medium on a phone, reads its own first 60 frames' draw time, and
// steps down a level while the median is over the budget; the player can pin a level beside the
// 3D view switch, kept on this device. The heat look never gains a tint: its colours are
// temperatures (docs/adr/0004). Node has no WebGL, so this reads the source;
// tests/browser-check.mjs draws a frame at each level.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const source = read('view3d.js'), html = read('index.html'), types = read('types/globals.d.ts');
const capture = read('tools/visual-capture.mjs'), check = read('tests/browser-check.mjs');
const entry = name => {
  const m = source.match(new RegExp(`\\n    '?${name}'?\\(e\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(m, `view3d.js draws '${name}'`); return m[0];
};
const draw = (() => { const m = source.match(/\n    draw\(frame\) \{[\s\S]*?\n    \},\n/); assert.ok(m, 'view3d.js has draw()'); return m[0]; })();

test('there are three levels, low, medium and high, and auto starts high on a desktop and medium on a phone', () => {
  assert.match(source, /\nconst QUALITY = \['low', 'medium', 'high'\];/, 'named once, in order');
  assert.match(source, /quality = 'auto', phone = false/, 'start() takes the player\'s choice, auto by default, and whether this is a phone');
  assert.match(source, /phone \? 'medium' : 'high'/, 'auto\'s starting level');
});

test('auto reads the first 60 frames\' draw time and steps down while the median is over 8 ms', () => {
  assert.match(source, /\nconst QUALITY_FRAMES = 60;/, 'sixty frames');
  assert.match(source, /\nconst QUALITY_BUDGET_MS = 8;/, 'half a 60 Hz frame, leaving room for the 2D canvas and the physics');
  assert.match(draw, /performance\.now\(\)/, 'draw() times itself');
  assert.match(source, /median > QUALITY_BUDGET_MS/, 'the median decides');
  assert.match(source, /QUALITY\[QUALITY\.indexOf\(level\) - 1\]/, 'one level down at a time');
});

test('the renderer reports its level and takes a new one without restarting', () => {
  assert.match(source, /\n    setQuality\(/, 'setQuality(level or auto)');
  assert.match(source, /\n    quality\(\)/, 'quality() says the level, whether auto chose it and the median it read');
  assert.match(types, /setQuality\(choice: 'auto' \| 'low' \| 'medium' \| 'high'\): void/, 'typed');
  assert.match(types, /quality\(\): \{ level: 'low' \| 'medium' \| 'high', auto: boolean, median: number \| null \}/, 'typed');
  assert.match(types, /quality\?: 'auto' \| 'low' \| 'medium' \| 'high', phone\?: boolean, onQuality\?: /, 'start() options typed');
});

test('bloom is selective: the plasma bodies, Ignite\'s glow and the bright flash, and only at high', () => {
  assert.match(source, /\nconst BLOOM = 1;/, 'a layer for what blooms');
  const bloomers = [source.match(/\n  const body = [\s\S]*?\n  \};/)[0], entry('plasma glow'), entry('flash')];
  for (const b of bloomers) assert.match(b, /layers\.enable\(BLOOM\)/, 'is on the bloom layer');
  assert.equal(source.match(/layers\.enable\(BLOOM\)/g).length, 3, 'and nothing else is: not the coils, the orbs, the halos or the leaks');
  assert.match(draw, /if \(level === 'high'\) bloom\(/, 'the pass runs at high alone');
  assert.match(source, /\n  function bloom\(/, 'the pass');
  assert.match(source, /cam\.layers\.set\(BLOOM\)/, 'which draws the bloom layer alone into a render target');
  assert.match(source, /AdditiveBlending/, 'and adds the blur back over the frame');
  assert.doesNotMatch(source, /EffectComposer|UnrealBloomPass/, 'without the addons: the per-view scissor would fight a composer');
});

test('medium adds a depth tint behind the origin in the lab and visible looks, never the heat look, and a fresnel rim on glass', () => {
  assert.match(source, /if \(look === 'lab' \|\| look === 'visible'\) fog = new THREE\.Fog\(/, 'the tint is fog, built for those two looks');
  assert.match(source, /new THREE\.Fog\([^)]*CAMERA_DISTANCE/, 'from the origin plane back');
  assert.match(draw, /world\.scene\.fog = level === 'low' \? null : world\.fog/, 'on at medium and above');
  assert.match(draw, /fog\.color\.copy\(/, 'in the sky\'s colour, as the entry sets it each frame');
  for (const kind of ['orb', 'triangle', 'flash', 'throat']) assert.match(entry(kind), /fog: false/, `${kind} keeps its colour: it is a signal, not scenery`);
  const glass = source.match(/\n  glass: [\s\S]*?\n  \},\n/);
  assert.ok(glass, 'glass material');
  assert.match(glass[0], /onBeforeCompile/, 'the rim is added to the physical shader');
  assert.match(glass[0], /uFresnel/, 'by a uniform');
  assert.match(draw, /uFresnel\.value = level === 'low' \? 0 : 1/, 'off at low');
});

test('the player can pin a level beside the 3D view switch, kept on this device, and the game tells the renderer', () => {
  assert.match(html, /<label for="view-quality">Quality <select id="view-quality">/, 'a labelled select');
  for (const [value, label] of [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) assert.match(html, new RegExp(`<option value="${value}">${label}</option>`), label);
  assert.match(html, /<p id="view-quality-status" class="statusline" role="status"><\/p>/, 'and a line saying what auto chose');
  assert.match(html, /quality: view3d\.quality/, 'the choice is saved beside the switch\'s setting');
  assert.match(html, /view3d\.renderer\.setQuality\(view3d\.quality\)/, 'and a running renderer takes it at once');
  assert.match(html, /phone: matchMedia\('\(pointer: coarse\)'\)\.matches/, 'a coarse pointer makes it a phone');
});

test('the capture tool takes a level and records it, and the browser check draws a frame at each level', () => {
  assert.match(capture, /--quality=/, 'node tools/visual-capture.mjs <set> --quality=<level>');
  assert.match(capture, /quality,/, 'recorded in index.json');
  assert.match(check, /for \(const level of \['low', 'medium', 'high'\]\)/, 'each level');
  assert.match(check, /r\.setQuality\(level\)/, 'set on the running renderer');
});
