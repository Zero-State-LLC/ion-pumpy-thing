const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Minimal DOM and drawing boundary. This exercises actual game code, not a
// second implementation of its models. It does not replace browser QA.
function boot(storage = new Map(), options = {}) {
  const ids = new Map(), drawing = [], frames = [];
  const context = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (String(key).startsWith('create')) return () => ({ addColorStop() {} });
    return (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${String(key)} received ${arg}`);
      if (key === 'arc') assert.ok(args[2] >= 0, 'negative radius');
      if (key === 'ellipse') assert.ok(args[2] >= 0 && args[3] >= 0, 'negative ellipse radius');
      drawing.push([key, ...args]);
    };
  } });
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
      for (const m of value.matchAll(/<[a-z][\w-]*\b([^>]*)>/g)) this.children.push(new Element(m[1]));
    }
    get innerHTML() { return this._html || ''; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    focus() {}
    append(...els) { this.children.push(...els); }
    getBoundingClientRect() { return { width: 390, height: 292.5, left: 0, top: 0 }; }
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
  const root = new Element(); root.innerHTML = html.split('<script>')[0];
  const document = { hidden: false, documentElement: root, querySelector: s => root.querySelector(s), getElementById: s => ids.get(s) || null, createElement: () => new Element(), addEventListener() {} };
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const sandbox = { document, window, getComputedStyle: () => ({ getPropertyValue: () => '#123456' }), matchMedia: () => ({ matches: !!options.reduced }), ResizeObserver: class { observe() {} }, requestAnimationFrame: f => frames.push(f), performance: { now: () => 0 }, localStorage: { getItem: key => { if (options.noStorage) throw Error('blocked'); return storage.get(key) || null; }, setItem: (key, value) => { if (options.noStorage) throw Error('blocked'); storage.set(key, value); } }, setTimeout() { return 1; }, clearTimeout() {}, console };
  vm.runInNewContext(script, sandbox, { filename: 'index.html' });
  return { lab: window.__lab, ids, document, storage, drawing, frames };
}
function prepare(lab) {
  const [ig, ho, fu, or, op] = lab.STAGES;
  Object.assign(ig, { p: 1, power: 60, done: true });
  Object.assign(ho, { t: 0, B: Math.sqrt(lab.plasmaPressure(0) * 1000 * 2 * 4e-7 * Math.PI / .9), x: 0, lock: 6, done: true });
  Object.assign(fu, { fuel: 'pb', lt: Math.log10(600), hold: 3, done: true });
  Object.assign(or, { r: 67, T: 2.6, cam: 134, done: true });
  Object.assign(op, { w: 66, assumed: true, done: true });
  lab.S.unlocked = 5;
}

test('boots in untimed learning mode and source cards precede controls', () => {
  const { lab, ids } = boot();
  lab.advance(10);
  assert.equal(lab.S.mode, 'learn'); assert.equal(lab.S.elapsed, 0);
  assert.equal(lab.tally().score, null);
  assert.match(ids.get('panel').innerHTML, /<details class="source-card">/);
  assert.match(ids.get('panel').innerHTML, /corrected/i);
});

test('timed practice stops both physics and timer while paused, reading, or hidden', () => {
  const { lab, ids, document } = boot(); lab.restart('challenge');
  lab.advance(.1); assert.equal(lab.S.elapsed, .1);
  const p = lab.STAGES[0].p;
  const card = ids.get('panel').children.find(n => n.attributes.class === 'source-card'); card.open = true;
  lab.advance(12); assert.equal(lab.S.elapsed, .1); assert.equal(lab.STAGES[0].p, p);
  card.open = false; document.hidden = true; lab.advance(12); assert.equal(lab.S.elapsed, .1);
  document.hidden = false; lab.S.paused = true; lab.advance(12); assert.equal(lab.S.elapsed, .1);
  lab.S.paused = false; lab.advance(.2); assert.ok(Math.abs(lab.S.elapsed - .3) < 1e-9);
});

test('timed practice measures active wall time independently of the physics step cap', () => {
  const { lab } = boot(); lab.restart('challenge'); lab.advance(.05, .5);
  assert.equal(lab.S.elapsed, .5);
  assert.equal(lab.STAGES[0].t, .05);
});

test('confinement resets for low beta, high beta, or an off-centre ball', () => {
  const { lab } = boot(); prepare(lab); const h = lab.STAGES[1];
  h.B = 1; h.lock = 4; h.update(0); assert.equal(h.lock, 0);
  h.B = .01; h.lock = 4; h.update(0); assert.equal(h.lock, 0);
  prepare(lab); h.x = .6; h.lock = 4; h.update(0); assert.equal(h.lock, 0);
});

test('six uninterrupted seconds complete confinement and capture a stable experiment', () => {
  const { lab } = boot(); lab.S.unlocked = 1; lab.show(1); const h = lab.STAGES[1];
  for (let i = 0; i < 301; i++) {
    h.B = Math.sqrt(lab.plasmaPressure(h.t + .02) * 1000 * 2 * 4e-7 * Math.PI / .9);
    h.trim = -h.push(h.t + .02) / 1.2; h.update(.02);
  }
  assert.equal(h.done, true); assert.equal(h.lock, 6); assert.equal(lab.S.paused, true);
});

test('neutron exposure accumulates and does not heal when fuel changes', () => {
  const { lab } = boot(); const f = lab.STAGES[2]; f.lt = Math.log10(64);
  f.update(1); assert.ok(f.dose > 0); const dose = f.dose;
  f.fuel = 'pb'; f.lt = 0;
  for (let i = 0; i < 1500; i++) f.update(1 / 60);
  assert.equal(f.dose, dose); lab.restart(); assert.equal(f.dose, 0);
});

test('every current preparation condition gates the final mission', () => {
  const { lab } = boot(); prepare(lab); assert.equal(lab.missionReady(), true);
  for (const [index, key, value] of [[0, 'power', 0], [1, 'B', 0], [2, 'fuel', 'dt'], [3, 'T', 8], [4, 'assumed', false], [4, 'w', 10]]) {
    prepare(lab); lab.STAGES[index][key] = value; assert.equal(lab.missionReady(), false, key);
  }
});

test('past mastery cannot advance a currently invalid throat', () => {
  const { lab, ids } = boot(); prepare(lab); lab.show(4); const op = lab.STAGES[4];
  op.assumed = false; op.w = 1; lab.advance(0);
  assert.equal(op.done, true); assert.equal(lab.readyToAdvance(4), false); assert.equal(ids.get('next').disabled, true);
});

test('finale uses the selected period and aborts when a prerequisite is revoked', () => {
  const { lab, ids } = boot(); prepare(lab); lab.show(5); const c = lab.STAGES[5];
  ids.get('cv-go').onclick(); assert.equal(c.phase, 'closing');
  const angle = c.ang; c.update(.1); assert.ok(Math.abs(c.ang - angle - 2 * Math.PI / 2.6 * .1) < 1e-9);
  lab.STAGES[4].assumed = false; c.update(.1);
  assert.equal(c.phase, 'orbit'); assert.equal(c.done, false); assert.equal(ids.get('cv-go').disabled, true);
});

test('completed result stays frozen through retuning and reload', () => {
  const { lab, ids } = boot(); lab.restart('challenge'); prepare(lab); lab.S.elapsed = 20; lab.show(5);
  const c = lab.STAGES[5]; ids.get('cv-go').onclick(); c.k = .75; ids.get('cv-go').onclick(); c.update(1.6);
  assert.equal(c.done, true); const result = JSON.stringify(lab.tally());
  lab.STAGES[4].w = 100; lab.advance(10); assert.equal(JSON.stringify(lab.tally()), result);
  const second = boot(); assert.equal(second.lab.restore(JSON.parse(JSON.stringify(lab.snapshot()))), true);
  assert.equal(JSON.stringify(second.lab.tally()), result);
});

test('ordinary reload restores settings, exposure, mode, elapsed time, and paused state', () => {
  const { lab } = boot(); lab.restart('challenge'); prepare(lab); lab.S.elapsed = 80; lab.STAGES[2].dose = .4; lab.show(4);
  const saved = JSON.parse(JSON.stringify(lab.snapshot())); const second = boot(); assert.equal(second.lab.restore(saved), true);
  assert.equal(second.lab.S.mode, 'challenge'); assert.equal(second.lab.S.elapsed, 80); assert.equal(second.lab.S.paused, true);
  assert.equal(second.lab.STAGES[2].dose, .4); assert.equal(second.lab.STAGES[3].r, 67); assert.equal(second.lab.STAGES[4].assumed, true);
  assert.equal(second.lab.missionReady(), true);
});

test('startup automatically loads local progress and resets transient closing state', () => {
  const { lab, storage } = boot(); lab.restart('challenge'); prepare(lab); lab.show(5);
  lab.STAGES[5].phase = 'closing'; lab.STAGES[5].k = .8;
  storage.set('ipt-run-v2', JSON.stringify(lab.snapshot()));
  const reloaded = boot(storage);
  assert.equal(reloaded.lab.S.stage, 5); assert.equal(reloaded.lab.S.paused, true);
  assert.equal(reloaded.lab.STAGES[5].phase, 'orbit'); assert.equal(reloaded.lab.STAGES[5].k, 1);
  assert.equal(reloaded.lab.missionReady(), true);
});

test('corrupt or incompatible saves are rejected without partly applying them', () => {
  const { lab } = boot(); const good = JSON.parse(JSON.stringify(lab.snapshot()));
  for (const mutate of [d => d.version = 1, d => d.sourceRevision = 'old', d => d.stage = 6, d => d.stages[0].values.power = '80', d => d.stages[0].values.p = -1, d => d.stages[4].values.assumed = 'true', d => d.elapsed = Infinity, d => d.stages[4].done = true]) {
    const d = JSON.parse(JSON.stringify(good)); mutate(d); assert.equal(lab.restore(d), false);
    assert.equal(lab.S.stage, 0);
  }
});

test('blocked browser storage leaves the game playable and reports save limits', () => {
  const { lab, ids } = boot(new Map(), { noStorage: true }); lab.advance(.1);
  assert.match(ids.get('save-status').innerHTML, /cannot save/); assert.equal(lab.S.stage, 0);
});

test('unknown save fields cannot replace stage methods, content, or prototypes', () => {
  const { lab } = boot(); const d = JSON.parse(JSON.stringify(lab.snapshot()));
  const original = lab.STAGES[0].html;
  d.stages[0].values.update = 'invalid'; d.stages[0].values.html = '<img src=x onerror=alert(1)>';
  Object.defineProperty(d.stages[0].values, '__proto__', { value: { poisoned: true }, enumerable: true });
  assert.equal(lab.restore(d), true); assert.equal(typeof lab.STAGES[0].update, 'function');
  assert.equal(lab.STAGES[0].html, original); assert.equal(lab.STAGES[0].poisoned, undefined);
});

test('formation is a rigid equilateral triangle and cameras project one shared scene', () => {
  const { lab } = boot(); const points = lab.formation(65, .7, 1.2);
  const lengths = points.map((p, i) => Math.hypot(...p.map((v, j) => v - points[(i + 1) % 3][j])));
  lengths.forEach(n => assert.ok(Math.abs(n - 65 * Math.sqrt(3)) < 1e-9));
  const before = JSON.stringify(points); const side = points.map(p => lab.camB(p, 134));
  assert.equal(JSON.stringify(points), before); assert.notEqual(side[0][1], points[0][1]);
});

test('plate controls change drawn geometry and the ideal-model energy magnitude', () => {
  const { lab, drawing, ids } = boot(); prepare(lab); lab.show(4); const op = lab.STAGES[4];
  op.ld = 2; op.la = 0; op.update(0); op.draw(); const first = JSON.stringify(drawing); const energy = ids.get('op-have').innerHTML;
  drawing.length = 0; op.ld = 3; op.la = 4; op.update(0); op.draw();
  assert.notEqual(JSON.stringify(drawing), first); assert.notEqual(ids.get('op-have').innerHTML, energy);
  assert.ok(drawing.some(c => c.includes('CASIMIR PLATE EXPERIMENT')));
});

test('all stages render finite canvas commands including reduced-motion finale and ledger', () => {
  const { lab, ids } = boot(new Map(), { reduced: true }); prepare(lab);
  for (let i = 0; i < 6; i++) { lab.show(i); lab.STAGES[i].draw(); }
  const c = lab.STAGES[5]; ids.get('cv-go').onclick(); c.k = .75; ids.get('cv-go').onclick(); c.update(.4); c.draw();
  c.view = 'visible'; c.draw(); c.update(1.6); lab.show(6); lab.STAGES[6].draw();
  assert.match(ids.get('panel').innerHTML, /6 experiments complete/);
});

test('scientific source cards use only the approved corrected-source pages', () => {
  const { lab } = boot(); assert.equal(lab.SOURCES.length, 6);
  for (const source of lab.SOURCES) assert.ok(['https://4orbs.com/the-vanishing/part-3-the-science/', 'https://4orbs.com/research/satellite-videos/measurements/'].includes(source.url));
  assert.match(lab.SOURCE_REVISION, /corrected/);
  assert.doesNotMatch(html, /% of the best D-T rate|under 1 %/);
});
