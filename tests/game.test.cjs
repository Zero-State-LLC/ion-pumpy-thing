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
    if (String(key).startsWith('create')) return (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
      drawing.push([key, ...args]); return { addColorStop() {} };
    };
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
  if (!options.noAudioScript) for (const file of ['audio-cues.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
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

// A saved run as a returning player's browser holds it: the fixture goes into
// storage before the game starts and loads through the normal startup path.
// Fixtures leave out the source revision; the current one is stamped in, so a
// source update doesn't invalidate them. A fixture that sets its own keeps it.
let currentRevision;
function readSavedRun(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
}
function bootFromSavedRun(fixture) {
  const saved = typeof fixture === 'string' ? readSavedRun(fixture) : fixture;
  currentRevision ??= boot().lab.SOURCE_REVISION;
  return boot(new Map([['ipt-run-v2', JSON.stringify({ sourceRevision: currentRevision, ...saved })]]));
}

test('sound settings restore without restoring autoplay or changing the experiment', () => {
  const storage = new Map([['ion-pumpy-audio-v1', JSON.stringify({ volume: .2, ambience: .7, pulse: false, on: true })]]);
  const { lab, ids } = boot(storage);
  assert.equal(lab.snd.on, false); assert.equal(lab.snd.ac, null);
  assert.equal(lab.snd.volume, .2); assert.equal(lab.snd.ambience, .7); assert.equal(lab.snd.pulse, false);
  ids.get('sound-volume').oninput({ target: { value: '31' } });
  assert.equal(JSON.parse(storage.get('ion-pumpy-audio-v1')).volume, .31);
  assert.equal(lab.S.mode, 'learn'); assert.equal(lab.S.stage, 0);
});

test('a missing audio script leaves the full game playable', () => {
  const { lab } = boot(new Map(), { noAudioScript: true });
  lab.advance(.1); assert.equal(lab.snd.on, false); prepare(lab); assert.equal(lab.missionReady(), true);
  lab.show(5); lab.advance(.1); assert.equal(lab.S.stage, 5);
});

test('timing cue fires on entry into the opening window, not each frame or a zero-dt redraw', () => {
  const { lab } = boot(); prepare(lab); lab.show(5);
  const cv = lab.STAGES[5], calls = []; lab.snd.play = id => calls.push(id);
  cv.phase = 'closing'; cv.k = .8; lab.seedAudioState(); lab.advance(.4);
  assert.equal(calls.filter(id => id === 'timing-window').length, 1);
  lab.advance(.01); assert.equal(calls.filter(id => id === 'timing-window').length, 1);
  cv.k = .8; lab.seedAudioState(); cv.k = .78; lab.advance(0);
  assert.equal(calls.filter(id => id === 'timing-window').length, 1);
});

test('opening, completion and replay keep the finale audio gate silent immediately', () => {
  const { lab, ids } = boot(); prepare(lab); lab.show(5);
  const cv = lab.STAGES[5], calls = []; lab.snd.play = id => calls.push(id);
  cv.phase = 'closing'; cv.k = .75; lab.syncAudioMode();
  ids.get('cv-go').onclick(); assert.equal(cv.phase, 'flash'); assert.equal(lab.snd.mode, 'finale');
  lab.advance(2); assert.equal(cv.phase, 'gone'); assert.equal(lab.snd.mode, 'finale');
  assert.equal(calls.includes('lesson-complete'), false);
  ids.get('cv-go').onclick(); assert.equal(lab.snd.mode, 'finale');
  ids.get('cv-scrub').value = 25; ids.get('cv-scrub').oninput(); lab.advance(0);
  assert.equal(lab.snd.mode, 'finale');
});

test('source toggles and explicit pause change the sound gate without waiting for a frame', () => {
  const { lab, ids } = boot(); lab.syncAudioMode(); assert.equal(lab.snd.mode, 'active');
  const panel = ids.get('panel'), card = panel.children.find(n => n.attributes.class === 'source-card');
  card.matches = selector => selector === '.source-card'; card.open = true;
  panel.listeners.toggle({ target: card }); assert.equal(lab.snd.mode, 'reading');
  card.open = false; panel.listeners.toggle({ target: card }); assert.equal(lab.snd.mode, 'active');
  ids.get('pause').onclick(); assert.equal(lab.snd.mode, 'paused');
});

test('stage restore is quiet and deliberate ledger navigation gets its own cue', () => {
  const { lab } = boot(); const calls = []; lab.snd.play = id => calls.push(id);
  lab.show(0); assert.deepEqual(calls, []);
  lab.show(0, { user: true }); assert.deepEqual(calls, ['stage-enter']);
  prepare(lab); lab.S.unlocked = 6; lab.show(6, { user: true }); assert.equal(calls.at(-1), 'ledger');
});

test('boots in untimed learning mode and source cards precede controls', () => {
  const { lab, ids } = boot();
  lab.advance(10);
  assert.equal(lab.S.mode, 'learn'); assert.equal(lab.S.elapsed, 0);
  assert.equal(lab.tally().score, null);
  assert.match(ids.get('panel').innerHTML, /<details class="source-card">/);
  assert.match(ids.get('panel').innerHTML, /Sources checked/);
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
  const ready = bootFromSavedRun('ready-to-converge');
  assert.equal(ready.ids.get('step-5').attributes['aria-current'], 'step');
  assert.equal(ready.ids.get('cv-go').disabled, false);
  assert.doesNotMatch(ready.ids.get('mission-checks').innerHTML, /retune required/);
  const slide = (id, value) => ids => { ids.get(id).value = String(value); ids.get(id).oninput(); };
  const retunes = [
    [0, 'Plasma', slide('ig-power', 0)],
    [1, 'Confinement', ids => { const pad = ids.get('ho-pad'); pad.onpointerdown({ clientX: 195, clientY: 292.5, pointerId: 1 }); pad.onpointerup(); }],
    [2, 'Fuel', ids => ids.get('fu-dt').onclick()],
    [3, 'Formation', slide('or-t', 8)],
    [4, 'Throat', ids => ids.get('op-assume').onclick()],
    [4, 'Throat', slide('op-w', 10)]
  ];
  for (const [step, system, retune] of retunes) {
    const { ids } = bootFromSavedRun('ready-to-converge');
    ids.get(`step-${step}`).onclick(); retune(ids); ids.get('step-5').onclick();
    assert.equal(ids.get('cv-go').disabled, true, system);
    assert.match(ids.get('mission-checks').innerHTML, new RegExp(`${system}: retune required`), system);
  }
});

test('a saved run the game would reject starts a fresh run instead', () => {
  const saved = readSavedRun('ready-to-converge');
  saved.stages[3].values.T = 9; // the lap time slider stops at 8 s
  const { ids } = bootFromSavedRun(saved);
  assert.equal(ids.get('step-0').attributes['aria-current'], 'step');
  assert.equal(ids.get('step-5').attributes['aria-disabled'], 'true');
});

test('a completed saved run reopens on its replay', () => {
  const { ids } = bootFromSavedRun('completed-run');
  assert.equal(ids.get('step-5').attributes['aria-current'], 'step');
  assert.equal(ids.get('cv-go').textContent, 'Replay the sequence');
  assert.equal(ids.get('cv-replay').hidden, false);
  assert.equal(ids.get('cv-scrub').disabled, false);
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

test('transit units and geometry describe passage past an entrance, not travel time', () => {
  const { lab } = boot();
  const start = lab.transitModel(0, 61), middle = lab.transitModel(.5, 61), end = lab.transitModel(1, 61);
  assert.equal(start.duration, 63.7 / 250);
  assert.ok(Math.abs(start.clearance - .05) < 1e-12);
  assert.equal(start.centreY - 63.7 / 2, 0, 'nose reaches the entrance at start');
  assert.equal(middle.centreY, 0);
  assert.equal(end.centreY + 63.7 / 2, 0, 'tail clears at the end');
  assert.equal(end.elapsed, end.duration);
  assert.equal(lab.transitModel(-2, 60).fraction, 0);
  assert.equal(lab.transitModel(2, 60).fraction, 1);
  assert.equal(lab.transitModel(.5, 60).fits, false);
  assert.ok(lab.transitModel(.5, 60).clearance < 0);
});

test('transit diagram clips the aircraft at the entrance and exposes changing clearance', () => {
  const { lab, ids, drawing } = boot(); prepare(lab); lab.show(5); const c = lab.STAGES[5];
  ids.get('cv-transit').onclick(); assert.equal(c.view, 'transit');
  c.draw(); assert.ok(drawing.some(call => call[0] === 'clip'));
  assert.ok(drawing.some(call => call.includes('BEYOND ENTRANCE: UNSPECIFIED')));
  const before = JSON.stringify(drawing);
  lab.STAGES[4].w = 70; drawing.length = 0; c.update(0); c.draw();
  assert.notEqual(JSON.stringify(drawing), before);
  assert.match(ids.get('cv-clear').innerHTML, /4.55/);
  assert.match(ids.get('cv-x').innerHTML, /0.255/);
  assert.match(ids.get('cv-view-note').innerHTML, /No destination/);
  assert.equal(ids.get('scale').hidden, true);
});

test('replay cannot bypass the mission and scrub events keep completed playback paused', () => {
  const { lab, ids } = boot(); lab.restart('challenge'); prepare(lab); lab.show(5); const c = lab.STAGES[5];
  const slider = ids.get('cv-scrub');
  slider.value = 100; slider.oninput();
  assert.equal(c.done, false); assert.equal(c.phase, 'orbit');
  assert.equal(slider.disabled, true); assert.equal(ids.get('cv-replay').hidden, true);
  ids.get('cv-go').onclick(); c.k = .75; ids.get('cv-go').onclick(); lab.advance(1.6);
  assert.equal(c.done, true); assert.equal(lab.S.paused, true);
  const result = JSON.stringify(lab.tally()), elapsed = lab.S.elapsed;
  assert.equal(ids.get('cv-replay').hidden, false);
  for (const q of [0, 25, 75, 100, 50]) {
    slider.value = q; slider.oninput();
    // Native input bubbles to the panel after the control's own handler.
    ids.get('panel').listeners.input({ target: { closest: selector => ['.ctl', '#cv-scrub'].includes(selector) ? slider : null } });
    lab.advance(5);
    assert.equal(c.q, q / 100); assert.equal(lab.S.paused, true);
    assert.equal(lab.S.elapsed, elapsed); assert.equal(JSON.stringify(lab.tally()), result);
  }
  assert.equal(ids.get('cv-go').textContent, 'Play from here');
  ids.get('cv-go').onclick(); assert.equal(lab.S.paused, false);
  lab.advance(.8); assert.equal(c.phase, 'gone'); assert.equal(lab.S.paused, true);
  assert.equal(JSON.stringify(lab.tally()), result);
  ids.get('cv-go').onclick(); lab.advance(.4); assert.equal(c.q, .25);
  assert.equal(lab.S.elapsed, elapsed);
});

test('scrubbing retraces one formation and a mid-replay save restores a completed sequence', () => {
  const { lab, ids } = boot(); prepare(lab); lab.show(5); const c = lab.STAGES[5];
  // Learning runs close at half speed: five seconds brings the triangle to 75 %.
  ids.get('cv-go').onclick(); c.update(5); ids.get('cv-go').onclick(); c.update(1.6);
  const slider = ids.get('cv-scrub'); slider.value = 25; slider.oninput();
  const angle = c.ang, tumble = c.tumble;
  slider.value = 75; slider.oninput(); slider.value = 25; slider.oninput();
  assert.equal(c.ang, angle); assert.equal(c.tumble, tumble);
  c.view = 'transit'; const saved = JSON.parse(JSON.stringify(lab.snapshot()));
  const second = boot(); assert.equal(second.lab.restore(saved), true);
  const restored = second.lab.STAGES[5];
  assert.equal(restored.phase, 'gone'); assert.equal(restored.q, 1); assert.equal(restored.view, 'transit');
  const otherSlider = second.ids.get('cv-scrub'); otherSlider.value = 25; otherSlider.oninput();
  assert.equal(restored.ang, angle); assert.equal(restored.tumble, tumble);
});

test('reduced-motion finale draws a static aperture without a pulsing radial fill', () => {
  const { lab, ids, drawing } = boot(new Map(), { reduced: true }); prepare(lab); lab.show(5); const c = lab.STAGES[5];
  ids.get('cv-go').onclick(); c.k = .75; ids.get('cv-go').onclick(); c.update(.96);
  c.view = 'visible'; drawing.length = 0; c.draw();
  assert.ok(drawing.some(call => call.includes('wormhole aperture')));
  assert.equal(drawing.some(call => call[0] === 'createRadialGradient'), false);
});

test('a prior source revision starts a fresh run with a visible explanation', () => {
  const { lab } = boot(); prepare(lab); lab.show(4);
  const prior = JSON.parse(JSON.stringify(lab.snapshot())); prior.sourceRevision = '4orbs-part3-corrected-2026-11-25m24s';
  const storage = new Map([['ipt-run-v2', JSON.stringify(prior)], ['ipt-best-v2', '{"score":1234}']]);
  const next = boot(storage);
  assert.equal(next.lab.S.stage, 0); assert.equal(next.lab.S.mode, 'learn');
  assert.equal(next.ids.get('restore-status').hidden, false);
  assert.match(next.ids.get('restore-status').innerHTML, /Source assumptions have changed/);
  assert.equal(storage.get('ipt-best-v2'), '{"score":1234}');
});

test('restart and mode switches ask before clearing progress, and keep it on cancel', () => {
  const { lab, ids } = boot(); prepare(lab); lab.show(3);
  lab.askRestart('learn');
  assert.equal(ids.get('confirm').hidden, false); assert.equal(lab.S.stage, 3);
  assert.match(ids.get('confirm-text').innerHTML, /Restart this run\? Progress on steps 1–5 will be cleared\. Your timed best stays\./);
  ids.get('confirm-no').onclick(); assert.equal(ids.get('confirm').hidden, true); assert.equal(lab.S.unlocked, 5);
  ids.get('mode-challenge').onclick();
  assert.match(ids.get('confirm-text').innerHTML, /Switch to timed practice\?/);
  assert.equal(ids.get('confirm-yes').textContent, 'Start timed run');
  ids.get('confirm-yes').onclick();
  assert.equal(lab.S.mode, 'challenge'); assert.equal(lab.S.unlocked, 0); assert.equal(lab.S.stage, 0);
  ids.get('mode-challenge').onclick(); assert.equal(ids.get('confirm').hidden, true, 'the current mode does nothing');
});

test('a run with nothing to lose restarts without asking', () => {
  const { lab, ids } = boot(); ids.get('confirm').hidden = true;
  ids.get('mode-challenge').onclick();
  assert.equal(lab.S.mode, 'challenge'); assert.equal(ids.get('confirm').hidden, true);
});

test('sliders give assistive tech the displayed value with units spelled out', () => {
  const { lab, ids } = boot(); prepare(lab);
  lab.show(2); assert.match(ids.get('fu-t').attributes['aria-valuetext'], /^[\d.,]+ (billion|million) kelvin$/);
  lab.show(4); assert.equal(ids.get('op-d').attributes['aria-valuetext'], '1.0 micrometres');
  assert.equal(ids.get('op-w').attributes['aria-valuetext'], '66 metres');
  lab.show(3); assert.equal(ids.get('or-c').attributes['aria-valuetext'], '134 degrees');
  assert.equal(ids.get('or-t').attributes['aria-valuetext'], '2.6 seconds');
  assert.equal(ids.get('fu-t-l'), undefined, 'labels belong to the current step only');
  assert.equal(ids.get('or-c').attributes['aria-labelledby'], 'or-c-l');
});

test('a fresh hold waits for the player instead of opening already lost', () => {
  const { lab } = boot(); lab.S.unlocked = 1; lab.show(1);
  assert.equal(lab.S.paused, true);
  lab.advance(5); assert.equal(lab.STAGES[1].t, 0);
});

test('the hold assist centres the ball in learning runs and the ledger notes it', () => {
  const { lab, ids } = boot(); lab.S.unlocked = 1; lab.show(1); const h = lab.STAGES[1];
  assert.equal(ids.get('ho-assist-row').hidden, false);
  ids.get('ho-assist').onclick(); assert.equal(ids.get('ho-assist').attributes['aria-pressed'], 'true');
  for (let i = 0; i < 400 && !h.done; i++) { h.B = Math.sqrt(lab.plasmaPressure(h.t + .02) * 1000 * 2 * 4e-7 * Math.PI / .9); h.update(.02); }
  assert.equal(h.done, true); assert.equal(h.assisted, true);
  prepare(lab); h.assisted = true; lab.S.unlocked = 6; lab.STAGES[5].done = true; lab.show(6);
  assert.match(ids.get('panel').innerHTML, /centring assist/);
});

test('the assist is learning-only and Show me appears after three misses', () => {
  const timed = boot(); timed.lab.restart('challenge'); timed.lab.S.unlocked = 1; timed.lab.show(1);
  assert.equal(timed.ids.get('ho-assist-row').hidden, true);
  const { lab, ids } = boot(); lab.S.unlocked = 1; lab.show(1); const h = lab.STAGES[1];
  assert.equal(ids.get('ho-show').hidden, true);
  for (let n = 0; n < 3; n++) { h.x = .99; h.trim = 1; h.B = 1; h.update(.1); }
  assert.equal(h.fails >= 3, true); assert.equal(ids.get('ho-show').hidden, false);
  ids.get('ho-show').onclick(); h.B = 0;
  for (let i = 0; i < 1000 && !h.done; i++) h.update(.02);
  assert.equal(h.done, true); assert.equal(h.assisted, true); assert.equal(h.autopilot, false);
});

test('older saves without assist fields still restore', () => {
  const { lab } = boot(); prepare(lab); lab.show(2);
  const saved = JSON.parse(JSON.stringify(lab.snapshot()));
  delete saved.stages[1].values.assist; delete saved.stages[1].values.assisted;
  const second = boot(); assert.equal(second.lab.restore(saved), true);
  assert.equal(second.lab.STAGES[1].assist, false); assert.equal(second.lab.S.stage, 2);
  saved.stages[1].values.assist = 'yes'; assert.equal(second.lab.validSnapshot(saved), false);
});

test('locked steps stay focusable, show a lock and explain themselves', () => {
  const { lab, ids } = boot(); lab.advance(0);
  const steps = ids.get('steps').innerHTML;
  assert.match(steps, /id="step-2" class="locked" aria-disabled="true"/);
  assert.doesNotMatch(steps, /\sdisabled[\s>]/);
  ids.get('step-2').onclick();
  assert.equal(lab.S.stage, 0); assert.match(ids.get('run-status').innerHTML, /Fuel unlocks after Hold\./);
  lab.advance(5); assert.doesNotMatch(ids.get('run-status').innerHTML, /unlocks/);
});

test('Pause and Sound say what they do, without a pressed state', async () => {
  const { lab, ids } = boot(); lab.S.paused = true; lab.advance(0);
  assert.equal(ids.get('pause').textContent, 'Resume'); assert.equal(ids.get('pause').attributes['aria-pressed'], undefined);
  const snd = ids.get('snd'); await snd.onclick({ currentTarget: snd });
  assert.equal(snd.textContent, 'Sound: off'); assert.equal(snd.attributes['aria-pressed'], undefined);
});

test('Space and Enter pump on every keydown, and a held key keeps pumping', () => {
  const { lab, ids } = boot(); const ig = lab.STAGES[0], pump = ids.get('ig-pump');
  const p0 = ig.p; let prevented = 0; const key = k => ({ key: k, preventDefault() { prevented++; } });
  pump.onkeydown(key(' ')); pump.onkeydown(key(' ')); pump.onkeydown(key('Enter'));
  assert.ok(Math.abs(ig.p - p0 * .8 ** 3) < 1e-9); assert.equal(prevented, 3);
  pump.onkeyup(key(' ')); assert.equal(prevented, 4);
});

test('retune buttons and the canvas say what they refer to', () => {
  const { lab, ids } = boot(); prepare(lab);
  lab.show(5); assert.match(ids.get('mission-checks').innerHTML, /aria-label="Retune plasma \(step 1\)"/);
  assert.match(ids.get('mission-checks').innerHTML, /aria-label="Retune throat \(step 5\)"/);
  assert.match(ids.get('cv').attributes['aria-label'], /three orbs around the airliner/);
  lab.show(0); assert.match(ids.get('cv').attributes['aria-label'], /^Glass jar of hydrogen at [\d.,]+ torr: /);
});

test('learning runs and reduced motion close the triangle at half speed; timed runs do not', () => {
  const learn = boot(); prepare(learn.lab); learn.lab.show(5); learn.ids.get('cv-go').onclick(); learn.lab.STAGES[5].update(1);
  assert.ok(Math.abs(learn.lab.STAGES[5].k - .95) < 1e-9);
  const timed = boot(); timed.lab.restart('challenge'); prepare(timed.lab); timed.lab.show(5); timed.ids.get('cv-go').onclick(); timed.lab.STAGES[5].update(1);
  assert.ok(Math.abs(timed.lab.STAGES[5].k - .9) < 1e-9);
  const calm = boot(new Map(), { reduced: true }); calm.lab.restart('challenge'); prepare(calm.lab); calm.lab.show(5); calm.ids.get('cv-go').onclick(); calm.lab.STAGES[5].update(1);
  assert.ok(Math.abs(calm.lab.STAGES[5].k - .95) < 1e-9);
});

test('a met goal promotes the way forward', () => {
  const { lab, ids } = boot(); prepare(lab); lab.show(4); lab.advance(0);
  assert.equal(ids.get('next').disabled, false);
  lab.STAGES[4].assumed = false; lab.advance(0); assert.equal(ids.get('next').disabled, true);
});

test('the game takes the 4orbs account as its premise and names no flight', () => {
  const { lab, ids } = boot(); prepare(lab); lab.STAGES[5].done = true; lab.S.unlocked = 6; lab.show(6);
  const all = html + ids.get('panel').innerHTML;
  assert.doesNotMatch(all, /MH370|MH 370|Malaysia|Flight 370|239 people|8 March 2014/i);
  assert.doesNotMatch(all, /Nobody knows|nobody knows how|visual effects|could not be proven|short by|source nobody has|not a mechanism|on paper/i);
  assert.match(html, /takes that account as its premise/);
  assert.match(html, /Boeing 777-200ER/);
  for (const tag of ['Lab physics', 'Theory', 'Measured', '4orbs account', 'Game rule']) assert.match(html, new RegExp(`class="tag [a-z]+">${tag}<`));
  for (const source of lab.SOURCES) for (const ref of source.refs) assert.ok(typeof ref === 'string');
});


function cuspArcs(drawing) {
  return drawing.filter(call => call[0] === 'arc' && call[5] - call[4] < Math.PI * 2 - 1e-6);
}
function mouthShape(drawing) {
  const arcs = cuspArcs(drawing), mouth = Math.max(...arcs.map(call => call[3]));
  const sweep = Math.max(...arcs.filter(call => Math.abs(call[3] - mouth) < 1e-6).map(call => call[5] - call[4]));
  return { mouth, sweep, count: arcs.length };
}
function coilField(lab, hold, beta) {
  return Math.sqrt(lab.plasmaPressure(hold.t) * 1000 * 2 * 4e-7 * Math.PI / beta);
}

test('hold cusp leaks close inside the beta band and open when beta leaves it', () => {
  const { lab, ids, drawing } = boot();
  lab.S.unlocked = 1; lab.show(1); const h = lab.STAGES[1];
  assert.equal(lab.S.paused, true);
  const sample = beta => {
    h.B = coilField(lab, h, beta); h.update(0); drawing.length = 0; h.draw(); lab.advance(1);
    return { shape: mouthShape(drawing), text: h.describe(), aria: ids.get('cv').attributes['aria-label'], readout: ids.get('ho-beta').innerHTML };
  };
  const closed = sample(0.9);
  assert.match(closed.readout, /balanced/);
  assert.match(closed.text, /Cusp leaks are closed/);
  assert.match(closed.aria, /Cusp leaks are closed/);
  assert.ok(drawing.some(call => call.includes('cusp leaks closed')));
  assert.equal(closed.shape.count, 12);
  assert.ok(closed.shape.sweep < 0.3);
  const leaking = sample(1.8);
  assert.match(leaking.readout, /leaking/);
  assert.match(leaking.text, /Cusp leaks are open/);
  assert.match(leaking.aria, /Cusp leaks are open/);
  assert.ok(drawing.some(call => call.includes('cusp leaks open')));
  assert.equal(leaking.shape.count, 12);
  assert.ok(leaking.shape.mouth > closed.shape.mouth);
  assert.ok(leaking.shape.sweep > closed.shape.sweep);
  const over = sample(0.45);
  assert.match(over.readout, /over-built/);
  assert.match(over.text, /Cusp leaks are open/);
  assert.ok(drawing.some(call => call.includes('cusp leaks open')));
  assert.equal(over.shape.count, 12);
  assert.ok(over.shape.mouth > closed.shape.mouth);
  assert.ok(over.shape.sweep > closed.shape.sweep);
  h.B = 0; h.update(0); drawing.length = 0; h.draw(); lab.advance(1);
  assert.match(ids.get('ho-beta').innerHTML, /coils off/);
  assert.match(h.describe(), /coils off/);
  assert.match(h.describe(), /Cusp leaks are open/);
  assert.match(ids.get('cv').attributes['aria-label'], /Cusp leaks are open/);
  const off = mouthShape(drawing);
  assert.equal(off.count, 12);
  assert.ok(off.mouth > closed.shape.mouth);
  assert.ok(off.sweep > closed.shape.sweep);
});

test('hold cusp leaks keep a steady shape under reduced motion', () => {
  const { lab, drawing } = boot(new Map(), { reduced: true });
  lab.S.unlocked = 1; lab.show(1); const h = lab.STAGES[1];
  h.B = coilField(lab, h, 0.88); h.update(0); drawing.length = 0; h.draw();
  const closed = mouthShape(drawing);
  assert.ok(drawing.some(call => call.includes('cusp leaks closed')));
  assert.equal(closed.count, 12);
  drawing.length = 0; h.draw();
  assert.deepEqual(mouthShape(drawing), closed);
  h.t = 4.2; h.B = coilField(lab, h, 0.88); h.update(0); drawing.length = 0; h.draw();
  const later = mouthShape(drawing);
  assert.ok(Math.abs(later.mouth - closed.mouth) < 1e-6);
  assert.ok(Math.abs(later.sweep - closed.sweep) < 1e-6);
  assert.equal(later.count, closed.count);
  assert.ok(drawing.some(call => call.includes('cusp leaks closed')));
  h.B = coilField(lab, h, 1.6); h.update(0); drawing.length = 0; h.draw();
  const open = mouthShape(drawing);
  assert.ok(drawing.some(call => call.includes('cusp leaks open')));
  assert.equal(open.count, 12);
  assert.ok(open.mouth > closed.mouth + 5);
  assert.ok(open.sweep > closed.sweep);
  h.B = coilField(lab, h, 0.5); h.update(0); drawing.length = 0; h.draw();
  const over = mouthShape(drawing);
  assert.ok(drawing.some(call => call.includes('cusp leaks open')));
  assert.ok(over.mouth > closed.mouth + 5);
});

function fieldRadii(drawing) {
  return drawing.filter(call => call[0] === 'arc' && call[3] >= 12 && call[3] <= 32).map(call => call[3]);
}

test('orbit field builds when the formation sits on the tracked rings', () => {
  const { lab, drawing } = boot();
  lab.S.unlocked = 3; lab.show(3); const o = lab.STAGES[3];
  assert.equal(o.done, false);
  o.r = 40; o.T = 6; o.cam = 40; o.hold = 0; o.update(0);
  drawing.length = 0; o.draw();
  assert.equal(fieldRadii(drawing).length, 0);
  assert.match(o.describe(), /off the tracked rings/);
  assert.doesNotMatch(o.describe(), /field/);
  o.r = 65; o.T = 2.5; o.cam = 132; o.hold = 0.3; o.done = false; o.update(0);
  drawing.length = 0; o.draw();
  const building = fieldRadii(drawing);
  assert.equal(building.length, 6);
  assert.match(o.describe(), /tracked rings/);
  assert.match(o.describe(), /field is building/);
  o.hold = 1.5; o.update(0); drawing.length = 0; o.draw();
  const settled = fieldRadii(drawing);
  assert.equal(settled.length, 6);
  assert.ok(Math.min(...settled) > Math.max(...building));
  assert.match(o.describe(), /settled field/);
});

test('reduced-motion orbit shows a settled field without a grow cycle', () => {
  const { lab, drawing } = boot(new Map(), { reduced: true });
  lab.S.unlocked = 3; lab.show(3); const o = lab.STAGES[3];
  o.r = 65; o.T = 2.5; o.cam = 132; o.done = false; o.hold = 0.15; o.update(0);
  drawing.length = 0; o.draw();
  const early = fieldRadii(drawing);
  assert.equal(early.length, 6);
  assert.match(o.describe(), /settled field/);
  const first = JSON.stringify(drawing);
  drawing.length = 0; o.draw();
  assert.equal(JSON.stringify(drawing), first);
  o.ang += 1.4; o.tumble += 0.7; o.hold = 1.5; o.update(0);
  drawing.length = 0; o.draw();
  assert.deepEqual(fieldRadii(drawing), early);
  const plain = boot(); plain.lab.S.unlocked = 3; plain.lab.show(3); const slow = plain.lab.STAGES[3];
  slow.r = 65; slow.T = 2.5; slow.cam = 132; slow.done = false; slow.hold = 0.15; slow.update(0);
  plain.drawing.length = 0; slow.draw();
  assert.ok(early[0] > Math.max(...fieldRadii(plain.drawing)));
});

test('converge field grows while closing and the flash shows a snap along the path', () => {
  const { lab, ids, drawing } = boot(); prepare(lab); lab.show(5); const c = lab.STAGES[5];
  const fieldArcs = () => drawing.filter(call => call[0] === 'arc' && call[3] >= 16 && call[3] <= 40);
  ids.get('cv-go').onclick(); assert.equal(c.phase, 'closing');
  c.k = 1; c.update(0); drawing.length = 0; c.draw();
  assert.equal(fieldArcs().length, 0);
  c.k = 0.9; c.update(0); drawing.length = 0; c.draw();
  const early = fieldArcs().map(call => call[3]);
  assert.equal(early.length, 3);
  assert.match(c.describe(), /field around them is growing/);
  c.k = 0.75; c.update(0); drawing.length = 0; c.draw();
  const late = fieldArcs().map(call => call[3]);
  assert.equal(late.length, 3);
  assert.ok(Math.min(...late) > Math.max(...early));
  ids.get('cv-visible').onclick(); drawing.length = 0; c.draw();
  assert.equal(fieldArcs().length, 3);
  assert.ok(Math.min(...fieldArcs().map(call => call[3])) > Math.max(...early));
  ids.get('cv-thermal').onclick(); ids.get('cv-go').onclick();
  assert.equal(c.phase, 'flash');
  drawing.length = 0; c.draw();
  assert.ok(drawing.some(call => call.includes('snap along the path')));
  assert.match(c.describe(), /snap runs along the path/);
  c.view = 'visible'; drawing.length = 0; c.draw();
  assert.ok(drawing.some(call => call.includes('snap along the path')));
});

test('reduced-motion flash keeps a static aperture and a static path snap', () => {
  const { lab, ids, drawing } = boot(new Map(), { reduced: true });
  prepare(lab); lab.show(5); const c = lab.STAGES[5];
  ids.get('cv-go').onclick(); c.k = 0.75; ids.get('cv-go').onclick();
  c.update(0.8); c.view = 'visible'; drawing.length = 0; c.draw();
  assert.ok(c.q > 0.45 && c.q < 0.6);
  assert.ok(drawing.some(call => call.includes('wormhole aperture')));
  assert.ok(drawing.some(call => call.includes('snap along the path')));
  assert.equal(drawing.some(call => call[0] === 'createRadialGradient'), false);
  const first = JSON.stringify(drawing);
  c.update(0.32); drawing.length = 0; c.draw();
  assert.ok(c.q > 0.65 && c.q < 0.8);
  assert.equal(JSON.stringify(drawing), first);
  assert.ok(drawing.some(call => call.includes('wormhole aperture')));
  assert.equal(drawing.some(call => call[0] === 'createRadialGradient'), false);
});

test('transit diagram says the airliner keeps flying forward and only the path changes', () => {
  const { lab, ids, drawing } = boot(); prepare(lab); lab.show(5); const c = lab.STAGES[5];
  ids.get('cv-transit').onclick(); assert.equal(c.view, 'transit');
  c.draw();
  const note = ids.get('cv-view-note').innerHTML;
  assert.match(note, /No destination/);
  assert.match(note, /keeps flying forward/);
  assert.match(note, /only its path changes/);
  assert.match(note, /1\.6 seconds/);
  assert.ok(drawing.some(call => call.includes('BEYOND ENTRANCE: UNSPECIFIED')));
  assert.ok(drawing.some(call => call.includes('Airliner keeps flying forward; only the path changes')));
  assert.ok(drawing.some(call => call[0] === 'clip'));
  assert.match(c.describe(), /keeps flying forward and only its path changes/);
  assert.match(c.describe(), /No destination/);
  assert.equal(lab.transitModel(0, 61).duration, 63.7 / 250);
  assert.ok(Math.abs(lab.transitModel(0, 61).clearance - 0.05) < 1e-12);
  assert.equal(lab.transitModel(1, 61).centreY + 63.7 / 2, 0);
});

test('convergence audio follows both closing speeds and resumes at matching source progress', () => {
  for (const [mode, reduced, rate] of [['learn', false, .5], ['challenge', false, 1], ['challenge', true, .5]]) {
    const { lab, ids } = boot(new Map(), { reduced }); lab.restart(mode); prepare(lab); lab.show(5);
    const beds = []; lab.snd.bed = (id, options) => beds.push({ id, options });
    ids.get('cv-go').onclick(); lab.advance(1);
    const bed = beds.filter(b => b.id === 'convergence').at(-1);
    assert.equal(bed.options.rate, rate);
    assert.ok(Math.abs(bed.options.offset - rate) < 1e-9);
    assert.equal(bed.options.once, true);
  }
});
