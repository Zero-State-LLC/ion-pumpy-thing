const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// The source register (docs/SOURCES.md): the list of 4orbs pages the lessons cite.
const register = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SOURCES.md'), 'utf8');
// Common ways of naming the flight. The airliner is only ever its make and model.
const FLIGHT_NAMES = /MH370|MH 370|Malaysia|Flight 370|239 people|8 March 2014/i;

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
      for (const m of value.matchAll(/<[a-z][\w-]*\b([^>]*)>([^<]*)/g)) { const el = new Element(m[1]); el.textContent = m[2]; this.children.push(el); }
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
  const document = { hidden: false, documentElement: root, querySelector: s => root.querySelector(s), getElementById: s => ids.get(s) || null, createElement: () => new Element(), listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; } };
  const window = { listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; }, devicePixelRatio: 1 };
  const sandbox = { document, window, getComputedStyle: () => ({ getPropertyValue: () => '#123456' }), matchMedia: () => ({ matches: !!options.reduced }), ResizeObserver: class { observe() {} }, requestAnimationFrame: f => frames.push(f), performance: { now: () => 0 }, localStorage: { getItem: key => { if (options.noStorage) throw Error('blocked'); return storage.get(key) || null; }, setItem: (key, value) => { if (options.noStorage) throw Error('blocked'); storage.set(key, value); } }, setTimeout() { return 1; }, clearTimeout() {}, console };
  // Record every request the game makes of the sound engine, from the moment the page starts.
  const sounds = [];
  if (!options.noAudioScript) {
    for (const file of ['audio-cues.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
    window.IonSound = class extends window.IonSound {
      play(id, o) { sounds.push({ call: 'play', id, options: o }); return super.play(id, o); }
      bed(id, o) { sounds.push({ call: 'bed', id, options: o }); return super.bed(id, o); }
      setMode(mode) { sounds.push({ call: 'mode', id: mode }); return super.setMode(mode); }
    };
  }
  vm.runInNewContext(script, sandbox, { filename: 'index.html' });
  return { lab: window.__lab, ids, document, window, storage, drawing, frames, sounds };
}
// Saved runs, as a returning player's browser holds them. A fixture goes into
// storage before the game starts and loads through the normal startup path.
// Fixtures leave out the source revision; the current one is stamped in, so a
// source update doesn't invalidate them. A fixture that sets its own keeps it.
let currentRevision;
function readSavedRun(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
}
// A saved run open on `step`: earlier steps done as in ready-to-converge, this
// step and later ones untouched.
function savedRunOn(step, edit = () => {}) {
  const ready = readSavedRun('ready-to-converge'), fresh = readSavedRun('fresh-run');
  const saved = { ...ready, stage: step, stages: ready.stages.map((s, i) => i < step ? s : fresh.stages[i]) };
  edit(saved); return saved;
}
function bootFromSavedRun(fixture, options = {}) {
  const saved = typeof fixture === 'string' ? readSavedRun(fixture) : fixture;
  currentRevision ??= boot().lab.SOURCE_REVISION;
  const storage = options.storage || new Map();
  storage.set('ipt-run-v2', JSON.stringify({ sourceRevision: currentRevision, ...saved }));
  return boot(storage, options);
}
const lastSave = game => JSON.parse(game.storage.get('ipt-run-v2'));

// What the player does. A control's own handler runs first; then, for controls
// inside the step panel, the event bubbles to the panel, as in a browser.
function matches(el, selector) {
  return selector.split(',').map(s => s.trim()).some(s =>
    s.startsWith('#') ? el.attributes.id === s.slice(1)
    : s.startsWith('[') ? s.slice(1, -1) in el.attributes
    : s === '.ctl' ? el.attributes.type === 'range' // every slider sits in a .ctl block
    : false);
}
function bubble(game, type, el, event) {
  const panel = game.ids.get('panel');
  if (panel.children.includes(el) && panel.listeners[type]) panel.listeners[type]({ ...event, target: { ...el, closest: s => matches(el, s) ? el : null } });
}
function click(game, id) {
  const el = game.ids.get(id), event = { detail: 1, currentTarget: el };
  const result = el.onclick(event); bubble(game, 'click', el, event); return result;
}
function slide(game, id, value) {
  const el = game.ids.get(id); el.value = String(value);
  if (el.oninput) el.oninput({ target: el });
  bubble(game, 'input', el, {});
}
function press(game, id, key) {
  let prevented = 0; const event = { key, preventDefault() { prevented++; } };
  game.ids.get(id).onkeydown(event); bubble(game, 'keydown', game.ids.get(id), event); return prevented;
}
// Drag the Hold step's coil pad: up raises the field, sideways trims the coils.
function pad(game, kind, { field, trim = 0 }) {
  const el = game.ids.get('ho-pad'), event = { clientX: (trim + 1) / 2 * 390, clientY: (1 - field) * 292.5, pointerId: 1 };
  el['onpointer' + kind](event); if (kind === 'down') bubble(game, 'pointerdown', el, event);
}
function readSource(game, open) {
  const panel = game.ids.get('panel'), card = panel.children.find(n => n.attributes.class === 'source-card');
  card.matches = selector => selector === '.source-card'; card.open = open;
  panel.listeners.toggle({ target: card });
}
const leave = game => game.window.listeners.pagehide();
const paint = game => game.frames.at(-1)(0);

// What the player sees and hears.
const text = (game, id) => game.ids.get(id).innerHTML;
const currentStep = game => [0, 1, 2, 3, 4, 5, 6].find(i => game.ids.get(`step-${i}`).attributes['aria-current'] === 'step');
const locked = (game, i) => game.ids.get(`step-${i}`).attributes['aria-disabled'] === 'true';
const cues = game => game.sounds.filter(s => s.call === 'play').map(s => s.id);
const soundMode = game => game.sounds.filter(s => s.call === 'mode').at(-1)?.id;
const goalBar = game => Math.round(parseFloat(game.ids.get('goalbar').style.width) * 1e6) / 1e6;
// The drawn scene, to a millionth of a pixel.
const scene = game => { game.drawing.length = 0; paint(game); return JSON.stringify(game.drawing, (k, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v); };
const ledgerScore = game => { click(game, 'step-6'); return text(game, 'panel').match(/<dt>Score<\/dt><dd>([^<]+)/)[1]; };

// A player who reads the plasma pressure off the lesson keeps beta at 0.9 with
// the coil pad, for `seconds` of play.
function holdSteady(game, seconds, { trim = 0, from = 0 } = {}) {
  let t = from;
  for (let i = 0; i < Math.round(seconds / .02); i++) {
    t += .02;
    pad(game, t === .02 ? 'down' : 'move', { field: Math.sqrt(game.lab.plasmaPressure(t) * 1000 * 2 * 4e-7 * Math.PI / .9), trim });
    game.lab.advance(.02);
  }
  return t;
}
// Converge: start closing in, then open the throat after `closing` seconds.
function openAfter(game, closing) {
  click(game, 'cv-go'); game.lab.advance(closing); click(game, 'cv-go');
}

test('sound settings restore without restoring autoplay or changing the experiment', () => {
  const storage = new Map([['ion-pumpy-audio-v1', JSON.stringify({ volume: .2, ambience: .7, pulse: false, on: true })]]);
  const game = boot(storage);
  assert.equal(game.ids.get('snd').textContent, 'Sound: off');
  assert.equal(game.ids.get('sound-volume').attributes['aria-valuetext'], '20 percent');
  assert.equal(game.ids.get('sound-ambience').attributes['aria-valuetext'], '70 percent');
  assert.equal(game.ids.get('sound-pulse').checked, false);
  game.ids.get('sound-volume').oninput({ target: { value: '31' } });
  assert.equal(JSON.parse(storage.get('ion-pumpy-audio-v1')).volume, .31);
  assert.equal(game.ids.get('mode-learn').attributes['aria-pressed'], 'true'); assert.equal(currentStep(game), 0);
});

test('a missing audio script leaves the full game playable', () => {
  const game = bootFromSavedRun('ready-to-converge', { noAudioScript: true });
  game.lab.advance(.1); assert.equal(currentStep(game), 5); assert.equal(game.ids.get('cv-go').disabled, false);
  click(game, 'cv-go'); game.lab.advance(1); assert.equal(text(game, 'cv-k'), '95 %');
});

test('timing cue fires on entry into the opening window, not each frame or a zero-dt redraw', () => {
  const game = bootFromSavedRun('ready-to-converge');
  const windowCues = () => cues(game).filter(id => id === 'timing-window').length;
  click(game, 'cv-go'); game.lab.advance(4); assert.equal(windowCues(), 0);
  game.lab.advance(.4); assert.equal(windowCues(), 1);
  game.lab.advance(.01); assert.equal(windowCues(), 1);
  game.lab.advance(0); assert.equal(windowCues(), 1);
});

test('opening, completion and replay keep the finale audio gate silent immediately', () => {
  const game = bootFromSavedRun('ready-to-converge');
  openAfter(game, 5); assert.equal(game.ids.get('cv-go').textContent, 'Opening…'); assert.equal(soundMode(game), 'finale');
  game.lab.advance(2); assert.equal(game.ids.get('cv-go').textContent, 'Replay the sequence'); assert.equal(soundMode(game), 'finale');
  assert.equal(cues(game).includes('lesson-complete'), false);
  click(game, 'cv-go'); assert.equal(soundMode(game), 'finale');
  slide(game, 'cv-scrub', 25); game.lab.advance(0);
  assert.equal(soundMode(game), 'finale');
});

test('source toggles and explicit pause change the sound gate without waiting for a frame', () => {
  const game = boot(); assert.equal(soundMode(game), 'active');
  readSource(game, true); assert.equal(soundMode(game), 'reading');
  readSource(game, false); assert.equal(soundMode(game), 'active');
  click(game, 'pause'); assert.equal(soundMode(game), 'paused');
});

test('stage restore is quiet and deliberate ledger navigation gets its own cue', () => {
  const game = bootFromSavedRun('ready-to-converge'); assert.equal(currentStep(game), 5);
  assert.deepEqual(cues(game).filter(id => ['stage-enter', 'ledger'].includes(id)), []);
  click(game, 'step-0'); assert.equal(cues(game).at(-1), 'stage-enter');
  const done = bootFromSavedRun('completed-run'); click(done, 'step-6'); assert.equal(cues(done).at(-1), 'ledger');
});

test('boots in untimed learning mode and source cards precede controls', () => {
  const game = boot();
  game.lab.advance(10);
  assert.equal(game.ids.get('mode-learn').attributes['aria-pressed'], 'true');
  assert.equal(text(game, 'hud-time'), 'Untimed');
  assert.match(text(game, 'panel'), /<details class="source-card">/);
  assert.match(text(game, 'panel'), /Sources checked/);
});

test('timed practice stops both physics and timer while paused, reading, or hidden', () => {
  const game = boot(); click(game, 'mode-challenge');
  for (let i = 0; i < 3; i++) press(game, 'ig-pump', ' '); // pumped down, the gas leaks back while play runs
  game.lab.advance(1.5); assert.equal(text(game, 'hud-time'), '0:01');
  const pressure = text(game, 'ig-p');
  readSource(game, true); game.lab.advance(12); assert.equal(text(game, 'hud-time'), '0:01'); assert.equal(text(game, 'ig-p'), pressure);
  readSource(game, false); game.document.hidden = true; game.document.listeners.visibilitychange();
  game.lab.advance(12); assert.equal(text(game, 'hud-time'), '0:01'); assert.equal(text(game, 'ig-p'), pressure);
  game.document.hidden = false; click(game, 'pause'); game.lab.advance(12); assert.equal(text(game, 'hud-time'), '0:01');
  click(game, 'pause'); game.lab.advance(1); assert.equal(text(game, 'hud-time'), '0:02');
  game.lab.advance(12); assert.notEqual(text(game, 'ig-p'), pressure, 'the gas leaks back once play resumes');
});

test('timed practice measures active wall time independently of the physics step cap', () => {
  const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = 'challenge'; }));
  click(game, 'cv-go'); game.lab.advance(.05, 1.5);
  assert.equal(text(game, 'hud-time'), '0:01');
  assert.equal(text(game, 'cv-k'), '100 %', 'physics moved 0.05 s, not 1.5 s');
});

test('confinement resets for low beta, high beta, or an off-centre ball', () => {
  const overBuilt = bootFromSavedRun(savedRunOn(1)); click(overBuilt, 'ho-assist');
  holdSteady(overBuilt, 3); assert.equal(goalBar(overBuilt), 50);
  pad(overBuilt, 'move', { field: 1 }); overBuilt.lab.advance(.02); assert.equal(goalBar(overBuilt), 0);
  const leaking = bootFromSavedRun(savedRunOn(1)); click(leaking, 'ho-assist');
  holdSteady(leaking, 3); pad(leaking, 'move', { field: .01 }); leaking.lab.advance(.02); assert.equal(goalBar(leaking), 0);
  const drifting = bootFromSavedRun(savedRunOn(1)); click(drifting, 'ho-assist');
  const t = holdSteady(drifting, 3); click(drifting, 'ho-assist');
  holdSteady(drifting, 2, { trim: 1, from: t });
  assert.equal(goalBar(drifting), 0); assert.match(text(drifting, 'ho-x'), /drifting right|hit the wall/);
});

test('six uninterrupted seconds complete confinement and capture a stable experiment', () => {
  const game = bootFromSavedRun(savedRunOn(1)); click(game, 'ho-assist');
  holdSteady(game, 6.02);
  assert.equal(goalBar(game), 100); assert.match(text(game, 'goaltext'), /^Held near beta one/);
  assert.equal(game.ids.get('next').disabled, false); assert.equal(game.ids.get('pause').textContent, 'Resume');
});

test('neutron exposure accumulates and does not heal when fuel changes', () => {
  const game = bootFromSavedRun(savedRunOn(2));
  slide(game, 'fu-t', 1.85); game.lab.advance(1);
  const dose = game.ids.get('fu-dose').style.width; assert.notEqual(dose, '0%');
  click(game, 'fu-pb'); slide(game, 'fu-t', 0);
  for (let i = 0; i < 1500; i++) game.lab.advance(1 / 60);
  assert.equal(game.ids.get('fu-dose').style.width, dose);
  click(game, 'restart'); click(game, 'confirm-yes'); leave(game);
  assert.equal(lastSave(game).stages[2].values.dose, 0);
});

test('every current preparation condition gates the final mission', () => {
  const ready = bootFromSavedRun('ready-to-converge');
  assert.equal(currentStep(ready), 5);
  assert.equal(ready.ids.get('cv-go').disabled, false);
  assert.doesNotMatch(text(ready, 'mission-checks'), /retune required/);
  const retunes = [
    [0, 'Plasma', game => slide(game, 'ig-power', 0)],
    [1, 'Confinement', game => { pad(game, 'down', { field: 0 }); pad(game, 'up', { field: 0 }); }],
    [2, 'Fuel', game => click(game, 'fu-dt')],
    [3, 'Formation', game => slide(game, 'or-t', 8)],
    [4, 'Throat', game => click(game, 'op-assume')],
    [4, 'Throat', game => slide(game, 'op-w', 10)]
  ];
  for (const [step, system, retune] of retunes) {
    const game = bootFromSavedRun('ready-to-converge');
    click(game, `step-${step}`); retune(game); click(game, 'step-5');
    assert.equal(game.ids.get('cv-go').disabled, true, system);
    assert.match(text(game, 'mission-checks'), new RegExp(`${system}: retune required`), system);
  }
});

test('a completed saved run reopens on its replay', () => {
  const game = bootFromSavedRun('completed-run');
  assert.equal(currentStep(game), 5);
  assert.equal(game.ids.get('cv-go').textContent, 'Replay the sequence');
  assert.equal(game.ids.get('cv-replay').hidden, false);
  assert.equal(game.ids.get('cv-scrub').disabled, false);
});

test('past mastery cannot advance a currently invalid throat', () => {
  const game = bootFromSavedRun('ready-to-converge'); click(game, 'step-4');
  click(game, 'op-assume'); slide(game, 'op-w', 1); game.lab.advance(0);
  assert.match(game.ids.get('step-4').attributes.class, /\bdone\b/); assert.equal(game.ids.get('next').disabled, true);
});

test('finale uses the selected period and aborts when a prerequisite is revoked', () => {
  // A whole number of laps leaves the formation where it started, so two lap
  // times that both fit 2.6 s draw the same scene and a third does not.
  const sceneAfterLaps = lapTime => {
    const game = bootFromSavedRun(savedRunOn(5, d => { d.stages[3].values.T = lapTime; }));
    click(game, 'pause'); game.lab.advance(2.6); return scene(game);
  };
  assert.equal(sceneAfterLaps(2.6), sceneAfterLaps(1.3)); assert.notEqual(sceneAfterLaps(2.6), sceneAfterLaps(2.4));
  const game = bootFromSavedRun('ready-to-converge');
  click(game, 'cv-go'); game.lab.advance(1); assert.equal(game.ids.get('cv-go').textContent, 'Open it now');
  click(game, 'step-4'); click(game, 'op-assume'); click(game, 'step-5'); game.lab.advance(.1);
  assert.equal(game.ids.get('cv-go').textContent, 'Start closing in'); assert.equal(game.ids.get('cv-go').disabled, true);
  assert.equal(game.ids.get('cv-replay').hidden, true);
});

test('completed result stays frozen through retuning and reload', () => {
  const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = 'challenge'; d.elapsed = 20; }));
  openAfter(game, 2.5); game.lab.advance(1.6);
  const score = ledgerScore(game);
  click(game, 'step-4'); slide(game, 'op-w', 100); game.lab.advance(10); assert.equal(ledgerScore(game), score);
  leave(game); const reloaded = boot(game.storage); assert.equal(ledgerScore(reloaded), score);
});

test('ordinary reload restores settings, exposure, mode, elapsed time, and paused state', () => {
  const saved = { ...readSavedRun('ready-to-converge'), stage: 4, mode: 'challenge', elapsed: 80 }; saved.stages[2].values.dose = .4;
  const game = bootFromSavedRun(saved);
  assert.equal(currentStep(game), 4); assert.equal(text(game, 'hud-time'), '1:20');
  assert.equal(game.ids.get('mode-challenge').attributes['aria-pressed'], 'true'); assert.equal(game.ids.get('pause').textContent, 'Resume');
  assert.match(text(game, 'goaltext'), /^Open\. Negative energy from the orbs/);
  click(game, 'step-2'); assert.equal(game.ids.get('fu-dose').style.width, '40%');
  click(game, 'step-3'); assert.equal(String(game.ids.get('or-r').value), '67');
  click(game, 'step-5'); assert.equal(game.ids.get('cv-go').disabled, false);
});

test('startup automatically loads local progress and resets transient closing state', () => {
  const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = 'challenge'; }));
  click(game, 'cv-go'); game.lab.advance(1); assert.equal(text(game, 'cv-k'), '90 %'); leave(game);
  const reloaded = boot(game.storage);
  assert.equal(currentStep(reloaded), 5); assert.equal(reloaded.ids.get('pause').textContent, 'Resume');
  assert.equal(reloaded.ids.get('cv-go').textContent, 'Start closing in'); assert.equal(text(reloaded, 'cv-k'), '100 %');
  assert.equal(reloaded.ids.get('cv-go').disabled, false);
});

test('corrupt or incompatible saves are rejected without partly applying them', () => {
  for (const mutate of [d => d.version = 1, d => d.sourceRevision = 'old', d => d.stage = 7, d => d.stages[0].values.power = '80', d => d.stages[0].values.p = -1, d => d.stages[4].values.assumed = 'true', d => d.elapsed = -1, d => d.stages[2].done = false, d => d.stages[3].values.T = 9]) {
    const saved = readSavedRun('ready-to-converge'); mutate(saved);
    const game = bootFromSavedRun(saved);
    assert.equal(currentStep(game), 0, String(mutate)); assert.equal(locked(game, 1), true, String(mutate));
    assert.equal(String(game.ids.get('ig-power').value), '15', 'the saved drive power of 60 is not applied');
  }
});

test('blocked browser storage leaves the game playable and reports save limits', () => {
  const game = boot(new Map(), { noStorage: true }); game.lab.advance(.1);
  assert.match(text(game, 'save-status'), /cannot save/); assert.equal(currentStep(game), 0);
});

test('unknown save fields cannot replace stage methods or content', () => {
  const saved = readSavedRun('ready-to-converge');
  saved.stages[0].values.update = 'invalid'; saved.stages[0].values.html = '<img src=x onerror=alert(1)>';
  Object.defineProperty(saved.stages[0].values, '__proto__', { value: { poisoned: true }, enumerable: true });
  const game = bootFromSavedRun(saved); assert.equal(currentStep(game), 5);
  click(game, 'step-0'); assert.doesNotMatch(text(game, 'panel'), /<img src=x/);
  assert.equal(String(game.ids.get('ig-power').value), '60');
  click(game, 'pause'); assert.doesNotThrow(() => game.lab.advance(.1));
});

test('formation is a rigid equilateral triangle and cameras project one shared scene', () => {
  const { lab } = boot(); const points = lab.formation(65, .7, 1.2);
  const lengths = points.map((p, i) => Math.hypot(...p.map((v, j) => v - points[(i + 1) % 3][j])));
  lengths.forEach(n => assert.ok(Math.abs(n - 65 * Math.sqrt(3)) < 1e-9));
  const before = JSON.stringify(points); const side = points.map(p => lab.camB(p, 134));
  assert.equal(JSON.stringify(points), before); assert.notEqual(side[0][1], points[0][1]);
});

// Fuel activity against published thermal (Maxwellian) reaction rates (#22). The model
// takes a temperature as log10 of keV, the scale of the Fuel step's temperature slider.
// Deuterium + tritium: <σv> peaks at about 65 keV (US patent 11,744,002, fig. 3); the
// NRL Plasma Formulary's rates at 50 and 100 keV (8.7 and 8.5 × 10⁻¹⁶ cm³/s; UWFDM-1268,
// table 1) bracket it. Hydrogen + boron-11: "peaks at several hundred keV" (Mehlhorn et
// al., "Path to Increasing p-B11 Reactivity via ps and ns Lasers", Laser and Particle
// Beams). Each band is as wide as its sources allow, and no wider.
const DT_PEAK_KEV = 65, DT_PEAK_BAND = [55, 75], PB_PEAK_BAND = [300, 900], KELVIN_PER_KEV = 1.16045e7;
// Every position of the Fuel step's temperature slider, read from the slider itself.
let sliderPositions;
function temperatureSlider() {
  if (!sliderPositions) {
    const game = bootFromSavedRun('ready-to-converge'); click(game, 'step-2');
    const { attributes: a } = game.ids.get('fu-t');
    const min = +a.min, step = +a.step, count = Math.round((+a.max - min) / step) + 1;
    sliderPositions = Array.from({ length: count }, (_, i) => +(min + i * step).toFixed(6));
  }
  return sliderPositions;
}
function peakKeV(lab, fuel) {
  const lo = temperatureSlider()[0], hi = temperatureSlider().at(-1);
  let best = -1, bestLt = lo;
  for (let lt = lo; lt <= hi; lt += .001) { const a = lab.fuelActivity({ fuel, lt }); if (a > best) { best = a; bestLt = lt; } }
  return 10 ** bestLt;
}
const within = (x, [lo, hi]) => x >= lo && x <= hi;

test('fuel activity peaks where the published thermal reaction rates peak', () => {
  const { lab } = boot();
  const dt = peakKeV(lab, 'dt'), pb = peakKeV(lab, 'pb');
  assert.ok(within(dt, DT_PEAK_BAND), `deuterium + tritium peaks at ${dt.toFixed(0)} keV; published about ${DT_PEAK_KEV} keV`);
  assert.ok(within(pb, PB_PEAK_BAND), `hydrogen + boron-11 peaks at ${pb.toFixed(0)} keV; published several hundred keV`);
});

test('deuterium + tritium is the more active fuel at cool temperatures', () => {
  // The Fuel lesson (Lab physics): deuterium + tritium "lights at the lowest temperature".
  // 1 keV is the bottom of the Fuel step's temperature slider.
  const { lab } = boot();
  for (const keV of [1, 10, 30]) {
    const lt = Math.log10(keV);
    assert.ok(lab.fuelActivity({ fuel: 'dt', lt }) > lab.fuelActivity({ fuel: 'pb', lt }), `${keV} keV`);
  }
});

test('hydrogen + boron-11 passes its readiness check only far above the deuterium + tritium peak', () => {
  // The Fuel lesson (Lab physics): hydrogen + boron-11 "needs far higher temperatures to burn",
  // taken here as at least twice the published deuterium + tritium peak. Through the page:
  // choose the fuel, set each slider position, read the temperature the player sees after a
  // frame, then read the Fuel readiness check on Converge.
  const game = bootFromSavedRun('ready-to-converge');
  let coolestReady = null;
  for (const position of temperatureSlider()) {
    click(game, 'step-2'); click(game, 'fu-pb'); slide(game, 'fu-t', position); game.lab.advance(0);
    const shown = text(game, 'fu-t-o');
    click(game, 'step-5');
    if (!/Fuel: retune required/.test(text(game, 'mission-checks'))) { coolestReady = shown; break; }
  }
  assert.ok(coolestReady, 'hydrogen + boron-11 passes its readiness check somewhere on the slider');
  const [, n, unit] = coolestReady.match(/([\d.,]+) (million|billion) K/);
  const kelvin = parseFloat(n.replace(/,/g, '')) * (unit === 'billion' ? 1e9 : 1e6);
  assert.ok(kelvin >= 2 * DT_PEAK_KEV * KELVIN_PER_KEV, `ready from ${coolestReady}`);
});

test('plate controls change drawn geometry and the ideal-model energy magnitude', () => {
  const game = bootFromSavedRun('ready-to-converge'); click(game, 'step-4');
  slide(game, 'op-d', 2); slide(game, 'op-a', 0); game.lab.advance(0);
  game.drawing.length = 0; paint(game); const first = JSON.stringify(game.drawing), energy = text(game, 'op-have');
  slide(game, 'op-d', 3); slide(game, 'op-a', 4); game.lab.advance(0);
  game.drawing.length = 0; paint(game);
  assert.notEqual(JSON.stringify(game.drawing), first); assert.notEqual(text(game, 'op-have'), energy);
  assert.ok(game.drawing.some(c => c.includes('CASIMIR PLATE EXPERIMENT')));
});

test('all stages render finite canvas commands including reduced-motion finale and ledger', () => {
  const game = bootFromSavedRun('ready-to-converge', { reduced: true });
  for (let i = 0; i < 6; i++) { click(game, `step-${i}`); paint(game); }
  openAfter(game, 5); game.lab.advance(.4); paint(game);
  click(game, 'cv-visible'); paint(game); game.lab.advance(1.6);
  click(game, 'step-6'); paint(game);
  assert.match(text(game, 'panel'), /6 experiments complete/);
});

// Every 4orbs page a text links, by address; a link into part of a page cites that page.
const fourOrbsPages = markup => [...markup.matchAll(/(?:https?:)?\/\/(?:[\w-]+\.)*4orbs\.com(?![\w.-])[^\s"'<>)\]]*/gi)].map(m => m[0].split('#')[0]);
// The 4orbs pages the source register lists.
const listedPages = new Set(fourOrbsPages(register));

test("every step's source card cites a 4orbs page, and only pages the source register lists", () => {
  const game = bootFromSavedRun('completed-run');
  for (let i = 0; i < 6; i++) {
    click(game, `step-${i}`);
    const card = text(game, 'panel').match(/<details class="source-card">[\s\S]*?<\/details>/);
    assert.ok(card, `step ${i + 1} has a source card`);
    const cited = fourOrbsPages(card[0]);
    assert.ok(cited.length, `step ${i + 1}'s source card links a 4orbs page`);
    for (const page of cited) assert.ok(listedPages.has(page), `step ${i + 1}'s source card links ${page}, which the source register doesn't list`);
  }
  assert.match(game.lab.SOURCE_REVISION, /corrected/);
  assert.doesNotMatch(html, /% of the best D-T rate|under 1 %/);
});

test('the source register lists no 4orbs page whose address or title names the flight', () => {
  assert.ok(listedPages.size, 'the source register lists 4orbs pages');
  // An address names the flight in its words: mh370, malaysia-airlines-flight-370.
  for (const page of listedPages) assert.doesNotMatch(decodeURIComponent(page).replace(/[-_/.+]+/g, ' '), FLIGHT_NAMES, page);
  // A page's title means its link text in the register.
  for (const [, title, url] of register.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    if (listedPages.has(url.split('#')[0])) assert.doesNotMatch(title, FLIGHT_NAMES, `${title} (${url})`);
  }
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
  const game = bootFromSavedRun('ready-to-converge');
  click(game, 'cv-transit'); assert.match(text(game, 'cv-view-note'), /No destination/);
  game.drawing.length = 0; paint(game);
  assert.ok(game.drawing.some(call => call[0] === 'clip'));
  assert.ok(game.drawing.some(call => call.includes('BEYOND ENTRANCE: UNSPECIFIED')));
  const before = JSON.stringify(game.drawing);
  click(game, 'step-4'); slide(game, 'op-w', 70); click(game, 'step-5');
  game.drawing.length = 0; paint(game);
  assert.notEqual(JSON.stringify(game.drawing), before);
  assert.match(text(game, 'cv-clear'), /4.55/);
  assert.match(text(game, 'cv-x'), /0.255/);
  assert.match(text(game, 'cv-view-note'), /No destination/);
  assert.equal(game.ids.get('scale').hidden, true);
});

test('replay cannot bypass the mission and scrub events keep completed playback paused', () => {
  const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = 'challenge'; }));
  const slider = game.ids.get('cv-scrub');
  slide(game, 'cv-scrub', 100);
  assert.equal(game.ids.get('cv-go').textContent, 'Start closing in');
  assert.equal(slider.disabled, true); assert.equal(game.ids.get('cv-replay').hidden, true);
  openAfter(game, 2.5); game.lab.advance(1.6);
  assert.equal(game.ids.get('pause').textContent, 'Resume'); assert.equal(game.ids.get('cv-replay').hidden, false);
  const score = ledgerScore(game); click(game, 'step-5'); const time = text(game, 'hud-time');
  for (const q of [0, 25, 75, 100, 50]) {
    slide(game, 'cv-scrub', q); game.lab.advance(5);
    assert.equal(text(game, 'cv-scrub-o'), `${q} %`); assert.equal(game.ids.get('pause').textContent, 'Resume');
    assert.equal(text(game, 'hud-time'), time);
  }
  assert.equal(game.ids.get('cv-go').textContent, 'Play from here');
  click(game, 'cv-go'); game.lab.advance(0); assert.equal(game.ids.get('pause').textContent, 'Pause');
  game.lab.advance(.8); assert.equal(game.ids.get('cv-go').textContent, 'Replay the sequence'); assert.equal(game.ids.get('pause').textContent, 'Resume');
  click(game, 'cv-go'); game.lab.advance(.4); assert.equal(text(game, 'cv-scrub-o'), '25 %');
  assert.equal(text(game, 'hud-time'), time); assert.equal(ledgerScore(game), score);
});

test('scrubbing retraces one formation and a mid-replay save restores a completed sequence', () => {
  const game = bootFromSavedRun('ready-to-converge');
  // Learning runs close at half speed: five seconds brings the triangle to 75 %.
  openAfter(game, 5); game.lab.advance(1.6);
  const sceneAt = (g, q) => { slide(g, 'cv-scrub', q); return scene(g); };
  const quarter = sceneAt(game, 25); sceneAt(game, 75);
  assert.equal(sceneAt(game, 25), quarter);
  click(game, 'cv-transit'); leave(game);
  const reloaded = boot(game.storage);
  assert.equal(reloaded.ids.get('cv-go').textContent, 'Replay the sequence'); assert.equal(text(reloaded, 'cv-scrub-o'), '100 %');
  assert.match(text(reloaded, 'cv-view-note'), /No destination/);
  click(reloaded, 'cv-thermal'); assert.equal(sceneAt(reloaded, 25), quarter);
});

test('reduced-motion finale draws a static aperture without a pulsing radial fill', () => {
  const game = bootFromSavedRun('ready-to-converge', { reduced: true });
  openAfter(game, 5); game.lab.advance(.96);
  click(game, 'cv-visible'); game.drawing.length = 0; paint(game);
  assert.ok(game.drawing.some(call => call.includes('wormhole aperture')));
  assert.equal(game.drawing.some(call => call[0] === 'createRadialGradient'), false);
});

test('a prior source revision starts a fresh run with a visible explanation', () => {
  const storage = new Map([['ipt-best-v2', '{"score":1234}']]);
  const game = bootFromSavedRun(savedRunOn(4, d => { d.sourceRevision = '4orbs-part3-corrected-2026-11-25m24s'; }), { storage });
  assert.equal(currentStep(game), 0); assert.equal(game.ids.get('mode-learn').attributes['aria-pressed'], 'true');
  assert.equal(game.ids.get('restore-status').hidden, false);
  assert.match(text(game, 'restore-status'), /Source assumptions have changed/);
  assert.equal(storage.get('ipt-best-v2'), '{"score":1234}');
});

test('restart and mode switches ask before clearing progress, and keep it on cancel', () => {
  const game = bootFromSavedRun('ready-to-converge'); click(game, 'step-3');
  click(game, 'restart');
  assert.equal(game.ids.get('confirm').hidden, false); assert.equal(currentStep(game), 3);
  assert.match(text(game, 'confirm-text'), /Restart this run\? Progress on steps 1–5 will be cleared\. Your timed best stays\./);
  click(game, 'confirm-no'); assert.equal(game.ids.get('confirm').hidden, true); assert.equal(locked(game, 5), false);
  click(game, 'mode-challenge');
  assert.match(text(game, 'confirm-text'), /Switch to timed practice\?/);
  assert.equal(game.ids.get('confirm-yes').textContent, 'Start timed run');
  click(game, 'confirm-yes'); game.lab.advance(0);
  assert.equal(game.ids.get('mode-challenge').attributes['aria-pressed'], 'true'); assert.equal(currentStep(game), 0); assert.equal(locked(game, 1), true);
  click(game, 'mode-challenge'); assert.equal(game.ids.get('confirm').hidden, true, 'the current mode does nothing');
});

test('a run with nothing to lose restarts without asking', () => {
  const game = boot(); game.ids.get('confirm').hidden = true;
  click(game, 'mode-challenge'); game.lab.advance(0);
  assert.equal(game.ids.get('mode-challenge').attributes['aria-pressed'], 'true'); assert.equal(game.ids.get('confirm').hidden, true);
});

test('sliders give assistive tech the displayed value with units spelled out', () => {
  const game = bootFromSavedRun('ready-to-converge');
  click(game, 'step-2'); assert.match(game.ids.get('fu-t').attributes['aria-valuetext'], /^[\d.,]+ (billion|million) kelvin$/);
  click(game, 'step-4'); assert.equal(game.ids.get('op-d').attributes['aria-valuetext'], '1.0 micrometres');
  assert.equal(game.ids.get('op-w').attributes['aria-valuetext'], '66 metres');
  click(game, 'step-3'); assert.equal(game.ids.get('or-c').attributes['aria-valuetext'], '134 degrees');
  assert.equal(game.ids.get('or-t').attributes['aria-valuetext'], '2.6 seconds');
  assert.equal(game.ids.get('fu-t-l'), undefined, 'labels belong to the current step only');
  assert.equal(game.ids.get('or-c').attributes['aria-labelledby'], 'or-c-l');
});

test('a fresh hold waits for the player instead of opening already lost', () => {
  const game = bootFromSavedRun(savedRunOn(1));
  assert.equal(game.ids.get('pause').textContent, 'Resume');
  const field = text(game, 'ho-b');
  game.lab.advance(5); assert.equal(text(game, 'ho-b'), field); assert.doesNotMatch(text(game, 'ho-x'), /hit the wall/);
});

test('the hold assist centres the ball in learning runs and the ledger notes it', () => {
  const game = bootFromSavedRun(savedRunOn(1));
  assert.equal(game.ids.get('ho-assist-row').hidden, false);
  click(game, 'ho-assist'); assert.equal(game.ids.get('ho-assist').attributes['aria-pressed'], 'true');
  holdSteady(game, 8); assert.equal(goalBar(game), 100);
  leave(game); assert.equal(lastSave(game).stages[1].values.assisted, true);
  const done = readSavedRun('completed-run'); done.stages[1].values.assisted = true;
  const ledger = bootFromSavedRun(done); click(ledger, 'step-6');
  assert.match(text(ledger, 'panel'), /centring assist/);
});

test('the assist is learning-only and Show me appears after three misses', () => {
  const timed = bootFromSavedRun(savedRunOn(1, d => { d.mode = 'challenge'; }));
  assert.equal(timed.ids.get('ho-assist-row').hidden, true);
  const game = bootFromSavedRun(savedRunOn(1));
  assert.equal(game.ids.get('ho-show').hidden, true);
  pad(game, 'down', { field: 1, trim: 1 });
  for (let i = 0; i < 600 && game.ids.get('ho-show').hidden; i++) game.lab.advance(.1);
  assert.equal(game.ids.get('ho-show').hidden, false, 'Show me is offered after three misses');
  pad(game, 'up', { field: 1, trim: 1 }); click(game, 'ho-show');
  const held = () => /^Held near beta one/.test(text(game, 'goaltext'));
  for (let i = 0; i < 1000 && !held(); i++) game.lab.advance(.02);
  assert.equal(held(), true, 'Show me runs the whole hold');
  leave(game); assert.equal(lastSave(game).stages[1].values.assisted, true);
});

test('older saves without assist fields still restore', () => {
  const saved = savedRunOn(2);
  delete saved.stages[1].values.assist; delete saved.stages[1].values.assisted;
  const game = bootFromSavedRun(saved); assert.equal(currentStep(game), 2);
  click(game, 'step-1'); assert.equal(game.ids.get('ho-assist').attributes['aria-pressed'], 'false');
  saved.stages[1].values.assist = 'yes'; assert.equal(currentStep(bootFromSavedRun(saved)), 0);
});

test('locked steps stay focusable, show a lock and explain themselves', () => {
  const game = boot(); game.lab.advance(0);
  const steps = text(game, 'steps');
  assert.match(steps, /id="step-2" class="locked" aria-disabled="true"/);
  assert.doesNotMatch(steps, /\sdisabled[\s>]/);
  click(game, 'step-2');
  assert.equal(currentStep(game), 0); assert.match(text(game, 'run-status'), /Fuel unlocks after Hold\./);
  game.lab.advance(5); assert.doesNotMatch(text(game, 'run-status'), /unlocks/);
});

test('Pause and Sound say what they do, without a pressed state', async () => {
  const game = boot(); click(game, 'pause'); game.lab.advance(0);
  assert.equal(game.ids.get('pause').textContent, 'Resume'); assert.equal(game.ids.get('pause').attributes['aria-pressed'], undefined);
  await click(game, 'snd');
  assert.equal(game.ids.get('snd').textContent, 'Sound: off'); assert.equal(game.ids.get('snd').attributes['aria-pressed'], undefined);
});

test('Space and Enter pump on every keydown, and a held key keeps pumping', () => {
  const game = boot(); assert.match(text(game, 'ig-p'), /^760 torr/);
  let prevented = press(game, 'ig-pump', ' ') + press(game, 'ig-pump', ' ') + press(game, 'ig-pump', 'Enter');
  game.lab.advance(0);
  assert.match(text(game, 'ig-p'), /^389 torr/, 'three strokes each remove a fifth: 760 × 0.8³'); assert.equal(prevented, 3);
  game.ids.get('ig-pump').onkeyup({ key: ' ', preventDefault() { prevented++; } }); assert.equal(prevented, 4);
});

test('retune buttons and the canvas say what they refer to', () => {
  const game = bootFromSavedRun('ready-to-converge');
  assert.match(text(game, 'mission-checks'), /aria-label="Retune plasma \(step 1\)"/);
  assert.match(text(game, 'mission-checks'), /aria-label="Retune throat \(step 5\)"/);
  assert.match(game.ids.get('cv').attributes['aria-label'], /three orbs around the airliner/);
  click(game, 'step-0'); assert.match(game.ids.get('cv').attributes['aria-label'], /^Glass jar of hydrogen at [\d.,]+ torr: /);
});

test('learning runs and reduced motion close the triangle at half speed; timed runs do not', () => {
  for (const [mode, reduced, shown] of [['learn', false, '95 %'], ['challenge', false, '90 %'], ['challenge', true, '95 %']]) {
    const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = mode; }), { reduced });
    click(game, 'cv-go'); game.lab.advance(1);
    assert.equal(text(game, 'cv-k'), shown, `${mode}${reduced ? ', reduced motion' : ''}`);
  }
});

test('a met goal promotes the way forward', () => {
  const game = bootFromSavedRun('ready-to-converge'); click(game, 'step-4'); game.lab.advance(0);
  assert.equal(game.ids.get('next').disabled, false);
  click(game, 'op-assume'); game.lab.advance(0); assert.equal(game.ids.get('next').disabled, true);
});

test('the game takes the 4orbs account as its premise and names no flight', () => {
  const game = bootFromSavedRun('completed-run'); let pages = '';
  for (let i = 0; i < 7; i++) { click(game, `step-${i}`); pages += text(game, 'panel'); }
  const all = html + pages;
  assert.doesNotMatch(all, FLIGHT_NAMES);
  assert.doesNotMatch(all, /Nobody knows|nobody knows how|visual effects|could not be proven|short by|source nobody has|not a mechanism|on paper/i);
  assert.match(html, /takes that account as its premise/);
  assert.match(html, /Boeing 777-200ER/);
  for (const tag of ['Lab physics', 'Theory', 'Measured', '4orbs account', 'Game rule']) assert.match(html, new RegExp(`class="tag [a-z]+">${tag}<`));
  assert.doesNotMatch(pages, /\[object Object\]|>undefined</, 'every cited paper renders as text');
});


function cuspArcs(drawing) {
  return drawing.filter(call => call[0] === 'arc' && call[5] - call[4] < Math.PI * 2 - 1e-6);
}
function mouthShape(drawing) {
  const arcs = cuspArcs(drawing), mouth = Math.max(...arcs.map(call => call[3]));
  const sweep = Math.max(...arcs.filter(call => Math.abs(call[3] - mouth) < 1e-6).map(call => call[5] - call[4]));
  return { mouth, sweep, count: arcs.length };
}
function fieldRadii(drawing) {
  return drawing.filter(call => call[0] === 'arc' && call[3] >= 12 && call[3] <= 32).map(call => call[3]);
}
function fieldArcs(drawing) {
  return drawing.filter(call => call[0] === 'arc' && call[3] >= 16 && call[3] <= 40);
}
function holdBeta(game) {
  return Number.parseFloat(text(game, 'ho-beta'));
}
function resume(game) {
  if (game.ids.get('pause').textContent === 'Resume') click(game, 'pause');
}
function setCoil(game, field) {
  pad(game, 'down', { field });
  pad(game, 'up', { field });
}
function tuneHold(game, pattern, targetBeta) {
  let bestField = null, bestScore = Infinity;
  for (let field = 1; field >= -1e-9; field -= 0.002) {
    setCoil(game, Math.max(0, field));
    game.lab.advance(0);
    const readout = text(game, 'ho-beta');
    if (!pattern.test(readout)) continue;
    const score = targetBeta == null ? 0 : Math.abs(holdBeta(game) - targetBeta);
    if (score < bestScore) { bestScore = score; bestField = Math.max(0, field); }
    if (targetBeta == null) break;
  }
  assert.notEqual(bestField, null, `hold readout should match ${pattern}`);
  setCoil(game, bestField);
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  return {
    shape: mouthShape(game.drawing),
    aria: game.ids.get('cv').attributes['aria-label'],
    readout: text(game, 'ho-beta')
  };
}
function setOrbit(game, r, period, cam) {
  slide(game, 'or-r', r);
  slide(game, 'or-t', period);
  slide(game, 'or-c', cam);
}
function trianglePercent(game) {
  return Number.parseFloat(text(game, 'cv-k'));
}

test('hold cusp leaks close inside the beta band and open when beta leaves it', () => {
  const game = bootFromSavedRun('ready-to-converge');
  click(game, 'step-1'); resume(game);
  const closed = tuneHold(game, /balanced/, 0.88);
  assert.match(closed.readout, /balanced/);
  assert.match(closed.aria, /Cusp leaks are closed/);
  assert.ok(game.drawing.some(call => call.includes('cusp leaks closed')));
  assert.equal(closed.shape.count, 12);
  assert.ok(closed.shape.sweep < 0.3);
  const leaking = tuneHold(game, /leaking/);
  assert.match(leaking.readout, /leaking/);
  assert.match(leaking.aria, /Cusp leaks are open/);
  assert.ok(game.drawing.some(call => call.includes('cusp leaks open')));
  assert.equal(leaking.shape.count, 12);
  assert.ok(leaking.shape.mouth > closed.shape.mouth);
  assert.ok(leaking.shape.sweep > closed.shape.sweep);
  const over = tuneHold(game, /over-built/);
  assert.match(over.readout, /over-built/);
  assert.match(over.aria, /Cusp leaks are open/);
  assert.ok(game.drawing.some(call => call.includes('cusp leaks open')));
  assert.equal(over.shape.count, 12);
  assert.ok(over.shape.mouth > closed.shape.mouth);
  assert.ok(over.shape.sweep > closed.shape.sweep);
  setCoil(game, 0);
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  assert.match(text(game, 'ho-beta'), /coils off/);
  assert.match(game.ids.get('cv').attributes['aria-label'], /coils off/);
  assert.match(game.ids.get('cv').attributes['aria-label'], /Cusp leaks are open/);
  const off = mouthShape(game.drawing);
  assert.equal(off.count, 12);
  assert.ok(off.mouth > closed.shape.mouth);
  assert.ok(off.sweep > closed.shape.sweep);
});

test('hold cusp leaks keep a steady shape under reduced motion', () => {
  const game = bootFromSavedRun('ready-to-converge', { reduced: true });
  click(game, 'step-1'); resume(game);
  const closed = tuneHold(game, /balanced/, 0.88);
  assert.ok(game.drawing.some(call => call.includes('cusp leaks closed')));
  assert.equal(closed.shape.count, 12);
  game.drawing.length = 0; paint(game);
  assert.deepEqual(mouthShape(game.drawing), closed.shape);
  click(game, 'ho-assist');
  game.lab.advance(4.2, 4.2);
  const later = tuneHold(game, /balanced/, 0.88);
  assert.ok(Math.abs(later.shape.sweep - closed.shape.sweep) < 1e-3);
  assert.equal(later.shape.count, closed.shape.count);
  assert.ok(game.drawing.some(call => call.includes('cusp leaks closed')));
  const open = tuneHold(game, /leaking/);
  assert.ok(game.drawing.some(call => call.includes('cusp leaks open')));
  assert.equal(open.shape.count, 12);
  assert.ok(open.shape.mouth > later.shape.mouth + 5);
  assert.ok(open.shape.sweep > later.shape.sweep);
  const over = tuneHold(game, /over-built/);
  assert.ok(game.drawing.some(call => call.includes('cusp leaks open')));
  assert.ok(over.shape.mouth > later.shape.mouth + 5);
});

test('orbit field builds when the formation sits on the tracked rings', () => {
  const game = bootFromSavedRun(savedRunOn(3));
  assert.equal(currentStep(game), 3);
  resume(game);
  setOrbit(game, 40, 6, 40);
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  assert.equal(fieldRadii(game.drawing).length, 0);
  assert.match(game.ids.get('cv').attributes['aria-label'], /off the tracked rings/);
  assert.doesNotMatch(game.ids.get('cv').attributes['aria-label'], /field/);
  setOrbit(game, 65, 2.5, 132);
  game.lab.advance(0.3, 1);
  game.drawing.length = 0; paint(game);
  const building = fieldRadii(game.drawing);
  assert.equal(building.length, 6);
  assert.match(game.ids.get('cv').attributes['aria-label'], /tracked rings/);
  assert.match(game.ids.get('cv').attributes['aria-label'], /field is building/);
  game.lab.advance(1.2, 1);
  game.drawing.length = 0; paint(game);
  const settled = fieldRadii(game.drawing);
  assert.equal(settled.length, 6);
  assert.ok(Math.min(...settled) > Math.max(...building));
  assert.match(game.ids.get('cv').attributes['aria-label'], /settled field/);
});

test('reduced-motion orbit shows a settled field without a grow cycle', () => {
  const game = bootFromSavedRun(savedRunOn(3), { reduced: true });
  resume(game);
  setOrbit(game, 65, 2.5, 132);
  game.lab.advance(0.15, 1);
  game.drawing.length = 0; paint(game);
  const early = fieldRadii(game.drawing);
  assert.equal(early.length, 6);
  assert.match(game.ids.get('cv').attributes['aria-label'], /settled field/);
  const first = JSON.stringify(game.drawing);
  game.drawing.length = 0; paint(game);
  assert.equal(JSON.stringify(game.drawing), first);
  game.lab.advance(1.35, 1);
  game.drawing.length = 0; paint(game);
  assert.deepEqual(fieldRadii(game.drawing), early);
  const plain = bootFromSavedRun(savedRunOn(3));
  resume(plain);
  setOrbit(plain, 65, 2.5, 132);
  plain.lab.advance(0.15, 1);
  plain.drawing.length = 0; paint(plain);
  assert.ok(early[0] > Math.max(...fieldRadii(plain.drawing)));
});

test('converge field grows while closing and the flash shows a snap along the path', () => {
  const game = bootFromSavedRun('ready-to-converge');
  assert.equal(game.ids.get('cv-go').textContent, 'Start closing in');
  click(game, 'cv-go');
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  assert.equal(fieldArcs(game.drawing).length, 0);
  assert.equal(game.ids.get('cv-go').textContent, 'Open it now');
  game.lab.advance(2, 1);
  game.drawing.length = 0; paint(game);
  const early = fieldArcs(game.drawing).map(call => call[3]);
  assert.equal(early.length, 3);
  assert.match(game.ids.get('cv').attributes['aria-label'], /field around them is growing/);
  assert.ok(trianglePercent(game) > 85 && trianglePercent(game) < 95);
  game.lab.advance(3, 1);
  game.drawing.length = 0; paint(game);
  const late = fieldArcs(game.drawing).map(call => call[3]);
  assert.equal(late.length, 3);
  assert.ok(Math.min(...late) > Math.max(...early));
  assert.ok(trianglePercent(game) >= 71 && trianglePercent(game) <= 79);
  click(game, 'cv-visible');
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  assert.equal(fieldArcs(game.drawing).length, 3);
  assert.ok(Math.min(...fieldArcs(game.drawing).map(call => call[3])) > Math.max(...early));
  click(game, 'cv-thermal');
  click(game, 'cv-go');
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  assert.ok(game.drawing.some(call => call.includes('snap along the path')));
  assert.match(game.ids.get('cv').attributes['aria-label'], /snap runs along the path/);
  click(game, 'cv-visible');
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  assert.ok(game.drawing.some(call => call.includes('snap along the path')));
});

test('reduced-motion flash keeps a static aperture and a static path snap', () => {
  const game = bootFromSavedRun('ready-to-converge', { reduced: true });
  click(game, 'cv-go');
  game.lab.advance(5, 5);
  assert.ok(trianglePercent(game) >= 71 && trianglePercent(game) <= 79);
  click(game, 'cv-go');
  game.lab.advance(0.8, 0.8);
  click(game, 'cv-visible');
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  assert.ok(game.drawing.some(call => call.includes('wormhole aperture')));
  assert.ok(game.drawing.some(call => call.includes('snap along the path')));
  assert.equal(game.drawing.some(call => call[0] === 'createRadialGradient'), false);
  const first = JSON.stringify(game.drawing);
  game.lab.advance(0.32, 0.32);
  game.drawing.length = 0; paint(game);
  assert.equal(JSON.stringify(game.drawing), first);
  assert.ok(game.drawing.some(call => call.includes('wormhole aperture')));
  assert.equal(game.drawing.some(call => call[0] === 'createRadialGradient'), false);
});

test('transit diagram says the airliner keeps flying forward and only the path changes', () => {
  const game = bootFromSavedRun('ready-to-converge');
  click(game, 'cv-transit');
  game.lab.advance(0, 1);
  game.drawing.length = 0; paint(game);
  const note = text(game, 'cv-view-note');
  assert.match(note, /No destination/);
  assert.match(note, /keeps flying forward/);
  assert.match(note, /only its path changes/);
  assert.match(note, /1\.6 seconds/);
  assert.ok(game.drawing.some(call => call.includes('BEYOND ENTRANCE: UNSPECIFIED')));
  assert.ok(game.drawing.some(call => call.includes('Airliner keeps flying forward; only the path changes')));
  assert.ok(game.drawing.some(call => call[0] === 'clip'));
  assert.match(game.ids.get('cv').attributes['aria-label'], /keeps flying forward and only its path changes/);
  assert.match(game.ids.get('cv').attributes['aria-label'], /No destination/);
  assert.equal(game.lab.transitModel(0, 61).duration, 63.7 / 250);
  assert.ok(Math.abs(game.lab.transitModel(0, 61).clearance - 0.05) < 1e-12);
  assert.equal(game.lab.transitModel(1, 61).centreY + 63.7 / 2, 0);
});

test('convergence audio follows both closing speeds and resumes at matching source progress', () => {
  for (const [mode, reduced, rate] of [['learn', false, .5], ['challenge', false, 1], ['challenge', true, .5]]) {
    const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = mode; }), { reduced });
    click(game, 'cv-go'); game.lab.advance(1);
    const bed = game.sounds.filter(s => s.call === 'bed' && s.id === 'convergence').at(-1);
    assert.equal(bed.options.rate, rate);
    assert.ok(Math.abs(bed.options.offset - rate) < 1e-9);
    assert.equal(bed.options.once, true);
  }
});
