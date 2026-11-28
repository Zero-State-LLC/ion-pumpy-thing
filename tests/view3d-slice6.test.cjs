// Slice 6 visual, geometric and presentation fixes: behavioral tests at the game's drawing and
// scene-list seams (docs/adr/0001, docs/adr/0003) plus source-contract checks for the WebGL
// shaders and lab-look presentation that Node cannot execute without a GPU.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const html = read('index.html');
const view3d = read('view3d.js');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const colourTokens = new Map([...html.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map(m => [m[1], m[2]]));

// Minimal player-facing harness matching tests/game.test.cjs (ADR 0001) at an explicit canvas size.
function bootGame(fixture, { width = 620, height = 465, view3dStub = false } = {}) {
  const ids = new Map(), drawing = [], frames = [], scenes = [];
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (String(key).startsWith('create')) return (...args) => {
        const call = [key, ...args]; drawing.push(call);
        return { addColorStop(...stop) { (call.stops ||= []).push(stop); } };
      };
      return (...args) => { drawing.push([key, ...args]); };
    },
    set(target, key, value) { drawing.push([key, value]); target[key] = value; return true; }
  });
  class Element {
    constructor(attrs = '') {
      this.style = {}; this.dataset = {}; this.attributes = {}; this.children = [];
      this.classList = { toggle() {} }; this.hidden = false; this.open = false; this.listeners = {};
      for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
        this.attributes[m[1]] = m[2];
        if (m[1].startsWith('data-')) this.dataset[m[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = m[2];
      }
      if (this.attributes.id) ids.set(this.attributes.id, this);
    }
    set innerHTML(value) {
      for (const node of this.children) if (node.attributes.id) ids.delete(node.attributes.id);
      this._html = value; this.children = [];
      for (const m of value.matchAll(/<[a-z][\w-]*\b([^>]*)>([^<]*)/g)) {
        const el = new Element(m[1]); el.textContent = m[2]; this.children.push(el);
      }
    }
    get innerHTML() { return this._html || ''; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    focus() {}
    append(...els) { this.children.push(...els); }
    getBoundingClientRect() { return { width, height, left: 0, top: 0 }; }
    getContext() { return context; }
    querySelectorAll(selector) {
      if (selector === '.source-card[open]') return this.children.filter(n => n.attributes.class === 'source-card' && n.open);
      const attribute = selector.match(/^\[([^\]]+)\]$/);
      return attribute ? this.children.filter(n => attribute[1] in n.attributes) : [];
    }
    querySelector(selector) {
      return selector.startsWith('#') ? ids.get(selector.slice(1)) || null : this.querySelectorAll(selector)[0] || null;
    }
  }
  const docRoot = new Element(); docRoot.innerHTML = html.split('<script>')[0];
  const document = {
    hidden: false, documentElement: docRoot,
    querySelector: s => docRoot.querySelector(s),
    getElementById: s => ids.get(s) || null,
    createElement: () => new Element(),
    listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; }
  };
  const storage = new Map();
  const rev = html.match(/const SOURCE_REVISION = '([^']+)'/)[1];
  if (fixture) {
    const run = JSON.parse(read(`tests/fixtures/${fixture}.json`));
    storage.set('ipt-run-v2', JSON.stringify({ sourceRevision: rev, ...run }));
  }
  const window = { listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; }, devicePixelRatio: 1 };
  if (view3dStub) {
    window.IonView3D = {
      async start() {
        return { draw: frame => scenes.push(JSON.parse(JSON.stringify(frame))), setQuality() {}, quality: () => ({ level: 'high', auto: true, median: null }) };
      }
    };
  }
  const sandbox = {
    document, window,
    getComputedStyle: () => ({ getPropertyValue: name => colourTokens.get(name) || '' }),
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: f => frames.push(f),
    performance: { now: () => 0 },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    setTimeout() { return 1; }, clearTimeout() {}, console
  };
  vm.runInNewContext(script, sandbox, { filename: 'index.html' });
  const paint = () => { drawing.length = 0; frames.at(-1)(0); };
  return { ids, drawing, scenes, paint, width, height };
}

const entry = name => {
  const m = view3d.match(new RegExp(`\\n    '?${name}'?\\(e\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(m, `view3d.js draws '${name}'`);
  return m[0];
};

test('Ignite vacuum pipe starts on the curved glass jar boundary in both the flat view and 3D scene list', async () => {
  for (const [width, height] of [[620, 465], [390, 292.5], [288, 216]]) {
    const game = bootGame('fresh-run', { width, height, view3dStub: true });
    game.paint(); // flat frame
    const pipeIdx = game.drawing.findIndex(c => c[0] === 'lineTo');
    const pipeFrom = game.drawing[pipeIdx - 1].slice(1, 3);
    const arcs = game.drawing.filter(c => c[0] === 'arc' && c[1] !== 38);
    const jar = arcs.find(o => arcs.some(h => Math.abs(o[3] - 1 - h[3]) < 1e-6));
    assert.ok(jar, `glass jar drawn at ${width}x${height}`);
    const distFlat = Math.hypot(pipeFrom[0] - jar[1], pipeFrom[1] - jar[2]);
    assert.ok(Math.abs(distFlat - jar[3]) < 1e-4, `flat pipe starts on jar perimeter (dist ${distFlat} vs R ${jar[3]}) at ${width}x${height}`);

    await new Promise(r => setImmediate(r));
    game.paint(); // 3D frame
    const list = game.scenes.at(-1).views[0].list;
    const pipe3d = list.find(e => e.kind === 'pipe');
    const jar3d = list.find(e => e.kind === 'glass jar');
    const dist3d = Math.hypot(pipe3d.from[0] - jar3d.at[0], pipe3d.from[1] - jar3d.at[1]);
    assert.ok(Math.abs(dist3d - jar3d.radius) < 1e-4, `3D pipe starts on jar perimeter (dist ${dist3d} vs R ${jar3d.radius}) at ${width}x${height}`);
  }
});

test('Converge transit diagram keeps the bottom 4orbs claim label strictly below the Boeing 777-200ER tail at desktop and phone sizes', () => {
  for (const [width, height] of [[620, 465], [390, 292.5], [288, 216]]) {
    const game = bootGame('ready-to-converge', { width, height });
    game.ids.get('cv-transit').onclick();
    game.paint();
    const scaleCall = game.drawing.find(c => c[0] === 'scale');
    const transCall = game.drawing.find(c => c[0] === 'translate');
    const claimCall = game.drawing.find(c => c[0] === 'fillText' && c[1] === '4orbs account: constant speed relative to the field');
    assert.ok(scaleCall && transCall && claimCall, `transit plane and claim drawn at ${width}x${height}`);
    // Fuselage half-length is 31.85 m (63.7 m / 2), drawn centred at transCall[2] scaled by scaleCall[2].
    const tailBottomY = transCall[2] + 31.85 * scaleCall[2];
    const fontSize = width < 440 ? 9 : 11;
    const claimTopY = claimCall[3] - fontSize;
    assert.ok(claimTopY > tailBottomY + 4, `claim top (${claimTopY.toFixed(1)}) clears aircraft tail (${tailBottomY.toFixed(1)}) at ${width}x${height}`);
  }
});

test('Hold 3D cusp leaks use radial-fade plasma plume shaders and open flared boundaries with no inner chord', () => {
  assert.match(view3d, /function plumeMaterial\(\)/, 'plumeMaterial shader exists');
  const leaks = entry('cusp leaks');
  assert.match(leaks, /plumeMaterial\(\)/, 'plume fills use plumeMaterial');
  assert.match(leaks, /uTime\.value = clock/, 'plume flow follows the renderer clock so freeze() pins it');
  assert.match(leaks, /strip\(out, \[at\(e\.edge, a - half\), \.\.\.rim, at\(e\.edge, a \+ half\)\], e\.plumeWidth \* 0\.7, false\)/, 'open boundary without inner chord');
});

test('Fuel 3D reactor wall builds a recessed cylindrical lab chamber liner and vessel bulkhead behind the exposure ring', () => {
  const wall = entry('reactor wall');
  assert.match(wall, /CylinderGeometry\(/, 'recessed cylindrical chamber liner');
  assert.match(wall, /vessel\.geometry/, 'machined ConFlat reactor vessel bulkhead');
  assert.match(wall, /world\.look === 'lab'/, 'lab-look presentation only');
});

test('Ignite 3D apparatus uses machined lab hardware for pump handle, pipe coupling, piston head and jar cradle', () => {
  assert.match(entry('pump handle'), /scale\.set\(s, s, s\)/, 'uniform scale on CNC-machined T-handle at exact listed span');
  assert.match(entry('pipe'), /leftCollar && rightCollar && union/, 'coupling collars and inline flange union');
  assert.match(entry('piston'), /pistonHead\.geometry/, 'grooved machined piston head prop');
  assert.match(entry('glass jar'), /jarManifold\.geometry/, 'bolted stainless-steel jar manifold cradle');
});

test('studio environment lights front-facing orthographic metals and Open/Visible views use upgraded shaders and lighting', () => {
  const studio = view3d.match(/function studio\(\) \{[\s\S]*?\n\}/);
  assert.ok(studio, 'studio() exists');
  assert.match(studio[0], /\[0, -0\.4, -4\.9\]/, 'front-facing studio softbox for orthographic plates and mounts');
  assert.match(view3d, /new THREE\.EdgesGeometry\(geometry, 55\)/, 'clean 55-degree edge threshold on plate mount');
  assert.match(entry('gap glow'), /gapGlowMaterial\(\)/, 'standing-mode Casimir cavity glow in lab look');
  assert.match(entry('throat'), /throatMaterial\(\)/, 'gravitational-horizon throat shader');
  assert.match(view3d, /function throatMaterial\(\)[\s\S]*?fog: false/, 'throat shader opts out of depth fog');
  assert.match(entry('cloud'), /glowTexture\(/, 'feathered atmospheric clouds');
  assert.match(view3d, /if \(look === 'visible'\) \{[\s\S]*?skyFill[\s\S]*?rim/, 'three-point visible lighting for airliner contour');
});

test('UI CSS prevents canvas drag text selection, declares panel text color and separates coil pad labels', () => {
  assert.match(html, /\.view \{[^}]*user-select: none;/, 'canvas container disables accidental drag selection');
  assert.match(html, /\.panel \{[^}]*color: var\(--ink\);/, 'panel explicitly declares ink color');
  assert.match(html, /\.padlabels \{[^}]*margin-top: var\(--sp-2\);/, 'coil pad labels clear the bottom knob');
});
