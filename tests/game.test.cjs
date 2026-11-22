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
const FLIGHT_NAMES = require('./flight-names.cjs');

// The page's colour tokens (`--sky: #0b1330;`), so the canvas draws in the colours a player sees.
const colourTokens = new Map([...html.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map(m => [m[1], m[2]]));

// Minimal DOM and drawing boundary. This exercises actual game code, not a
// second implementation of its models. It does not replace browser QA.
function boot(storage = new Map(), options = {}) {
  const ids = new Map(), drawing = [], frames = [];
  const context = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (String(key).startsWith('create')) return (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
      // A gradient's colour stops are kept on its own command, so they print with it nowhere.
      const call = [key, ...args]; drawing.push(call);
      return { addColorStop(...stop) { (call.stops ||= []).push(stop); } };
    };
    return (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${String(key)} received ${arg}`);
      if (key === 'arc') assert.ok(args[2] >= 0, 'negative radius');
      if (key === 'ellipse') assert.ok(args[2] >= 0 && args[3] >= 0, 'negative ellipse radius');
      drawing.push([key, ...args]);
    };
  },
  // A setting the game gives the canvas, such as its stroke colour, is drawn too: [name, value].
  set(target, key, value) { drawing.push([key, value]); target[key] = value; return true; } });
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
  // A Claude artifact host, when the test gives one (see artifactHost).
  if (options.claude) window.claude = options.claude;
  const sandbox = { document, window, getComputedStyle: () => ({ getPropertyValue: name => colourTokens.get(name) || '' }), matchMedia: () => ({ matches: !!options.reduced }), ResizeObserver: class { observe() {} }, requestAnimationFrame: f => frames.push(f), performance: { now: () => 0 }, localStorage: { getItem: key => { if (options.noStorage) throw Error('blocked'); return storage.get(key) || null; }, setItem: (key, value) => { if (options.noStorage) throw Error('blocked'); storage.set(key, value); } }, setTimeout() { return 1; }, clearTimeout() {}, console };
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
  // The 3D view's renderer, when the test gives one (docs/adr/0003): a stand-in that records
  // every frame the game hands it, scene list and camera, as it was when handed over. Its
  // options say whether it fails to start, as without WebGL, and keep what the game passed it.
  const scenes = [], stand = options.view3d;
  if (stand) window.IonView3D = { async start(canvas, given) {
    Object.assign(stand, { canvas, given });
    if (stand.fails) throw Error('WebGL is off');
    return { draw: frame => scenes.push(JSON.parse(JSON.stringify(frame))) };
  } };
  vm.runInNewContext(script, sandbox, { filename: 'index.html' });
  return { lab: window.__lab, ids, document, window, storage, drawing, frames, sounds, scenes, view3d: stand };
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
// Fails unless the game opened the saved run, so a test can't pass on a fresh
// run by accident. A test that expects the game to reject the save passes
// { rejected: true }, and then fails if the save loads.
function bootFromSavedRun(fixture, options = {}) {
  const saved = typeof fixture === 'string' ? readSavedRun(fixture) : fixture;
  currentRevision ??= boot().lab.SOURCE_REVISION;
  const storage = options.storage || new Map();
  storage.set('ipt-run-v2', JSON.stringify({ sourceRevision: currentRevision, ...saved }));
  const game = boot(storage, options), name = typeof fixture === 'string' ? `"${fixture}"` : 'given';
  const done = saved.stages?.filter(s => s.done).length ?? 0;
  const opened = currentStep(game), open = [0, 1, 2, 3, 4, 5, 6].filter(i => !locked(game, i)).length - 1;
  const loaded = opened === saved.stage && open === done;
  // A rejected save and a save of an untouched run both open a fresh run on Ignite.
  if (options.rejected) assert.ok(!loaded || (saved.stage === 0 && done === 0), `Saved run ${name} loaded, but this test expects the game to reject it.`);
  else assert.ok(loaded, `Saved run ${name} did not load: the game opened ${STEPS[opened]} with ${open} steps done, not ${STEPS[saved.stage]} with ${done}. If this test expects the game to reject it, pass { rejected: true }.`);
  return game;
}
const lastSave = game => JSON.parse(game.storage.get('ipt-run-v2'));
// A Claude artifact host with database access, where the practice board works. It records
// which collections the board reads and what the game writes; every collection is empty.
function artifactHost() {
  const reads = [], writes = [];
  const db = {
    collection: name => { reads.push(name); return { orderBy: () => ({ limit: () => ({ onSnapshot: show => show({ docs: [] }) }) }) }; },
    doc: path => ({ get: async () => ({ exists: false }), set: async value => { writes.push([path, value]); } })
  };
  const user = { id: async () => 'player', profiles: async () => ({}) };
  return { reads, writes, claude: { use: async kind => ({ db, user })[kind] || null } };
}
// Let the game finish what it is waiting on, such as the host's database.
const settle = () => new Promise(resolve => setImmediate(resolve));

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
// Clicking a step tab fails unless that step opens, so a test can't read one step
// while it believes it is on another. clickLockedStep is for a tab that should refuse.
function dispatchClick(game, el) {
  const event = { detail: 1, currentTarget: el };
  const result = el.onclick(event); bubble(game, 'click', el, event); return result;
}
function click(game, id) {
  const result = dispatchClick(game, game.ids.get(id)), tab = id.match(/^step-(\d)$/);
  if (tab) assert.equal(currentStep(game), +tab[1], `Could not open ${STEPS[tab[1]]}: it is locked in this run.`);
  return result;
}
function clickLockedStep(game, i) {
  const before = currentStep(game);
  assert.equal(locked(game, i), true, `${STEPS[i]} is not locked in this run.`);
  dispatchClick(game, game.ids.get(`step-${i}`));
  assert.equal(currentStep(game), before, `${STEPS[i]} opened while locked.`);
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
// Press or let go of the Ignite step's on-screen pump. While it is held, it pumps.
function pumpButton(game, kind) {
  const el = game.ids.get('ig-pump'), event = { pointerId: 1 };
  el['onpointer' + kind](event); if (kind === 'down') bubble(game, 'pointerdown', el, event);
}
// Play on in eighths of a second, which add up exactly.
function playFor(game, seconds) { for (let i = 0; i < Math.round(seconds * 8); i++) game.lab.advance(1 / 8); }
// Ignite: play on while the pressure readout says it is in the band, for at most a minute.
// Returns how long that was.
function playWhileInBand(game) {
  let seconds = 0;
  for (; seconds < 60 && pressureNote(game) === 'in the band'; seconds += 1 / 8) game.lab.advance(1 / 8);
  return seconds;
}
function readSource(game, open) {
  const panel = game.ids.get('panel'), card = panel.children.find(n => n.attributes.class === 'source-card');
  card.matches = selector => selector === '.source-card'; card.open = open;
  panel.listeners.toggle({ target: card });
}
const leave = game => game.window.listeners.pagehide();
const paint = game => game.frames.at(-1)(0);

// What the player sees and hears. New readouts go here, beside the others.
// - Labels, buttons and the HUD timer update on the next frame: after a click, run
//   lab.advance(0) before reading one, unless the test's point is that the change is immediate.
// - A step is complete when its goal text says so; the goal bar can show 100 % a frame early.
// - The HUD timer shows whole seconds, so time a test in whole seconds to read it.
const STEPS = ['Ignite', 'Hold', 'Fuel', 'Orbit', 'Open', 'Converge', 'the Ledger'];
const text = (game, id) => game.ids.get(id).innerHTML;
const currentStep = game => [0, 1, 2, 3, 4, 5, 6].find(i => game.ids.get(`step-${i}`).attributes['aria-current'] === 'step');
const locked = (game, i) => game.ids.get(`step-${i}`).attributes['aria-disabled'] === 'true';
const cues = game => game.sounds.filter(s => s.call === 'play').map(s => s.id);
const soundMode = game => game.sounds.filter(s => s.call === 'mode').at(-1)?.id;
const goalBar = game => Math.round(parseFloat(game.ids.get('goalbar').style.width) * 1e6) / 1e6;
// The step's description, as a screen reader hears the canvas. It refreshes once a second of play.
const description = game => game.ids.get('cv').attributes['aria-label'];
// The drawn scene, to a millionth of a pixel.
const scene = game => { game.drawing.length = 0; paint(game); return JSON.stringify(game.drawing, (k, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v); };
// The words drawn on the canvas in the last frame painted.
const drawnWords = game => game.drawing.filter(call => call[0] === 'fillText').map(call => call[1]);
const ledgerScore = game => { click(game, 'step-6'); return text(game, 'panel').match(/<dt>Score<\/dt><dd>([^<]+)/)[1]; };
// Ignite's pressure readout: the pressure in torr, and its note ('keep pumping', 'in the band', ...).
const torr = game => parseFloat(text(game, 'ig-p'));
const pressureNote = game => text(game, 'ig-p').match(/<small>([^<]+)<\/small>/)[1];
// Whether the Plasma readiness check passes, as Converge lists it. The player then goes back
// to Ignite, which reopens paused as a completed step, and resumes it.
function plasmaReadyOnConverge(game) {
  click(game, 'step-5'); const ready = !/Plasma: retune required/.test(text(game, 'mission-checks'));
  click(game, 'step-0'); click(game, 'pause'); return ready;
}
// The value a canvas setting, such as 'strokeStyle', has when the command at
// `index` in the drawing runs, following save and restore.
function settingAt(drawing, index, name) {
  let value; const saved = [];
  for (const [call, arg] of drawing.slice(0, index)) {
    if (call === 'save') saved.push(value); else if (call === 'restore') value = saved.pop(); else if (call === name) value = arg;
  }
  return value;
}
// The colour the scene's sky is filled with: the first fill of the whole canvas.
function skyColour(game) {
  const sky = game.drawing.findIndex(c => c[0] === 'fillRect' && c[1] === 0 && c[2] === 0);
  return settingAt(game.drawing, sky, 'fillStyle');
}
// How bright a drawn colour (#rrggbb or rgb()/rgba()) is, from 0 for black to 1 for white.
function brightness(colour) {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour), rgb = /^rgba?\(([^)]+)\)$/.exec(colour);
  assert.ok(hex || rgb, `a colour: ${colour}`);
  const [r, g, b] = hex ? [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) : rgb[1].split(',').slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
// The glow round each orb on the canvas. An orb is a soft halo (a radial
// gradient from its centre) round a bright core; a circle about the same
// centre, wider than the halo, is a glow round it. One entry per orb drawn,
// with the glow's radius and colour, or null for both where the orb has none.
function orbGlows(game) {
  game.drawing.length = 0; paint(game);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  return game.drawing.filter(c => c[0] === 'createRadialGradient' && c[3] === 0 && near(c[1], c[4]) && near(c[2], c[5]))
    .map(([, x, y, , , , halo]) => {
      const ring = game.drawing.findIndex(c => c[0] === 'arc' && near(c[1], x) && near(c[2], y) && c[3] > halo + 1e-6);
      return ring < 0 ? { x, y, glow: null, colour: null } : { x, y, glow: game.drawing[ring][3], colour: settingAt(game.drawing, ring, 'strokeStyle') };
    });
}
// Orbit: the orbs in each camera view, nearest that view's title.
function orbitCameras(game) {
  const orbs = orbGlows(game), titles = game.drawing.filter(c => c[0] === 'fillText' && /^CAMERA /.test(c[1])).map(c => c[2]);
  assert.equal(titles.length, 2, 'two camera views');
  return titles.map((x, i) => orbs.filter(o => Math.abs(o.x - x) < Math.abs(o.x - titles[1 - i])));
}
// The one glow size shared by all three orbs in view, or null with no glow.
function glowSize(orbs) {
  assert.equal(orbs.length, 3, 'three orbs in view');
  const sizes = [...new Set(orbs.map(o => o.glow))];
  assert.equal(sizes.length, 1, 'every orb glows alike');
  return sizes[0];
}
// The Formation's ranges as a fresh Orbit step's goal states them, with the
// step of the slider that sets each.
function formationRanges() {
  const game = bootFromSavedRun(savedRunOn(3));
  const m = text(game, 'goaltext').match(/([\d.]+) to ([\d.]+) m out, a lap in ([\d.]+) to ([\d.]+) s, cameras ([\d.]+) to ([\d.]+)°/);
  assert.ok(m, text(game, 'goaltext'));
  const n = m.slice(1).map(Number), step = id => +game.ids.get(id).attributes.step;
  return { 'or-r': [n[0], n[1], step('or-r')], 'or-t': [n[2], n[3], step('or-t')], 'or-c': [n[4], n[5], step('or-c')] };
}

// A player who reads the plasma pressure off the lesson keeps beta at 0.9 (or at
// `beta`) with the coil pad, for `seconds` of play. The field comes from the
// lesson's formula, β = nkT / (B²/2μ₀); an infinite beta is the coils off.
function holdSteady(game, seconds, { trim = 0, from = 0, beta = .9 } = {}) {
  let t = from;
  for (let i = 0; i < Math.round(seconds / .02); i++) {
    t += .02;
    pad(game, t === .02 ? 'down' : 'move', { field: Math.sqrt(game.lab.plasmaPressure(t) * 1000 * 2 * 4e-7 * Math.PI / beta), trim });
    game.lab.advance(.02);
  }
  return t;
}
// The Hold canvas, one frame: the cusp leaks and the words drawn. The field's
// edge round the plasma ball is drawn as the innermost ring of arcs, and each gap
// between neighbouring arcs is a cusp leak, given as the angle it leaves open
// (radians), in order round the ring. Plasma plumes out of each leak to the next
// ring of arcs out. `radius` is the edge's radius and `plume` how far past it the
// plumes reach, in pixels. Whole circles (the ball, its particles) are neither.
function holdView(game) {
  game.drawing.length = 0; paint(game);
  const turn = 2 * Math.PI, round = n => Math.round(n * 1e6) / 1e6, norm = a => round(((a % turn) + turn) % turn) % turn;
  const rings = new Map();
  for (const [call, x, y, r, from, to] of game.drawing) {
    if (call !== 'arc' || to - from >= turn - 1e-9) continue;
    const key = [x, y, r].map(round).join();
    rings.set(key, { r, arcs: [...(rings.get(key)?.arcs || []), { start: norm(from), end: norm(from) + round(to - from) }] });
  }
  const [edge, plumes] = [...rings.values()].filter(ring => ring.arcs.length > 1).sort((a, b) => a.r - b.r);
  const arcs = (edge?.arcs || []).sort((a, b) => a.start - b.start);
  const leaks = arcs.map((arc, i) => norm(arcs[(i + 1) % arcs.length].start - arc.end));
  // Each leak's middle, as an angle round the ring.
  const centres = arcs.map((arc, i) => norm(arc.end + leaks[i] / 2));
  return { leaks, centres, radius: edge && round(edge.r), plume: edge && plumes && round(plumes.r - edge.r), words: drawnWords(game) };
}
// The Ignite canvas, one frame: the glass jar and the compression in it, and the words drawn.
// The jar is the widest whole circle stroked. The compression front is a whole circle stroked
// inside it about the same centre, and arrows press in on it: lines drawn straight in from
// the jar's wall toward its middle. `front` is the front's radius as a fraction of the jar's,
// or null with none drawn; `arrows` are each arrow's tail and head, in jar radii from the
// jar's centre, in the order drawn.
function jarView(game) {
  game.drawing.length = 0; paint(game);
  const round = n => Math.round(n * 1e6) / 1e6, circles = [], lines = [];
  let path = [];
  for (const call of game.drawing) {
    if (call[0] === 'beginPath') path = [];
    else if (['arc', 'moveTo', 'lineTo'].includes(call[0])) path.push(call);
    else if (call[0] === 'stroke') path.forEach(([kind, x, y, r, from, to], i) => {
      if (kind === 'arc' && to - from >= 2 * Math.PI - 1e-9) circles.push({ x, y, r });
      if (kind === 'lineTo' && path[i - 1]?.[0] === 'moveTo') lines.push([path[i - 1].slice(1, 3), [x, y]]);
    });
  }
  const jar = circles.reduce((a, c) => !a || c.r > a.r ? c : a, null);
  const centred = c => Math.abs(c.x - jar.x) < 1e-6 && Math.abs(c.y - jar.y) < 1e-6;
  const front = circles.filter(c => c !== jar && centred(c) && c.r < jar.r).sort((a, b) => b.r - a.r)[0];
  const from = ([x, y]) => [x - jar.x, y - jar.y], size = ([x, y]) => Math.hypot(x, y);
  const arrows = lines.map(([a, b]) => [from(a), from(b)])
    .filter(([a, b]) => Math.abs(a[0] * b[1] - a[1] * b[0]) < 1e-6 * size(a) * size(b) && a[0] * b[0] + a[1] * b[1] > 0 && size(b) < size(a))
    .map(ends => ends.map(end => end.map(v => round(v / jar.r))));
  return { front: front ? round(front.r / jar.r) : null, arrows, words: drawnWords(game) };
}
// The Open step's plasma-cavity view, one frame: the plasma bubble and the words drawn.
// The negative energy is named at the bubble's centre, and the bubble's wall is the
// widest whole circle stroked round those words. `bubble` is its radius in pixels, or
// null with no bubble drawn.
function cavityView(game) {
  game.drawing.length = 0; paint(game);
  const named = game.drawing.find(c => c[0] === 'fillText' && c[1] === 'negative energy');
  let bubble = null, path = [];
  for (const [call, x, y, r, from, to] of game.drawing) {
    if (call === 'beginPath') path = [];
    else if (call === 'arc') path.push({ x, y, r, whole: to - from >= 2 * Math.PI - 1e-9 });
    else if (call === 'stroke' && named) {
      for (const c of path) if (c.whole && Math.hypot(c.x - named[2], c.y - named[3]) < c.r && c.r > (bubble ?? 0)) bubble = c.r;
    }
  }
  return { bubble, words: drawnWords(game) };
}
// Converge: start closing in, then open the throat after `closing` seconds.
function openAfter(game, closing) {
  click(game, 'cv-go'); game.lab.advance(closing); click(game, 'cv-go');
}
// Converge: start closing in, and look at the step as the triangle readout shows each
// size in turn (per cent, from 100 down). Learning runs and reduced motion close at
// half speed, 5 % of the triangle's size each second. Returns what `look` returns.
function closeThrough(game, sizes, look) {
  click(game, 'cv-go'); let size = 100;
  return sizes.map(shown => {
    game.lab.advance((size - shown) / 5); size = shown;
    assert.equal(text(game, 'cv-k'), `${shown} %`);
    return look(shown);
  });
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

test('the Plasma readiness check passes only once a cold plasma has stayed in the pressure band for 3 seconds, and leaving the band first starts the count over', () => {
  const game = bootFromSavedRun('ready-to-converge');
  assert.equal(plasmaReadyOnConverge(game), true, 'the saved run held its cold plasma in the band');
  // Retune at a low drive power, where the plasma stays cold just above the band, so only the band is in question.
  slide(game, 'ig-power', 30); playWhileInBand(game);
  assert.equal(pressureNote(game), 'keep pumping'); assert.equal(text(game, 'ig-state'), 'Cold plasma');
  assert.equal(plasmaReadyOnConverge(game), false, 'a cold plasma above the band');
  // One stroke brings the pressure back in near the top of the band, and it leaks out again before 3 seconds.
  press(game, 'ig-pump', ' '); game.lab.advance(0); assert.equal(pressureNote(game), 'in the band');
  const inBand = playWhileInBand(game);
  assert.ok(inBand > 1 && inBand < 3, `in the band for ${inBand} s`);
  assert.equal(plasmaReadyOnConverge(game), false, 'left the band before 3 seconds');
  // Pumped back in, the count starts over from nothing and needs its full 3 seconds.
  for (let i = 0; i < 4; i++) press(game, 'ig-pump', ' ');
  playFor(game, 3 - 1 / 8); assert.equal(pressureNote(game), 'in the band');
  assert.equal(plasmaReadyOnConverge(game), false, `${3 - 1 / 8} s in the band now, ${inBand + 3 - 1 / 8} s with the stretch before`);
  playFor(game, 1 / 8);
  assert.equal(plasmaReadyOnConverge(game), true, '3 seconds in the band');
});

// Ways to work the Ignite pump, each run until the pressure reads under 1.2 torr and then let
// go. Held on screen, the pump strokes every 0.2 s; a held key strokes on each repeat, 30 a
// second. Each returns how many keydowns it took, or null for the on-screen pump.
const PUMPING = [
  ['the on-screen pump', game => {
    pumpButton(game, 'down'); for (let i = 0; i < 1000 && torr(game) >= 1.2; i++) game.lab.advance(1 / 50);
    pumpButton(game, 'up'); return null;
  }],
  ...[['a held Space', ' '], ['a held Enter', 'Enter']].map(([name, key]) => [name, game => {
    let keydowns = 0;
    for (; keydowns < 1000 && torr(game) >= 1.2; keydowns++) { press(game, 'ig-pump', key); game.lab.advance(1 / 30); }
    game.ids.get('ig-pump').onkeyup({ key, preventDefault() {} }); return keydowns;
  }])
];

test('a learning run reaches a cold plasma and a met Ignite goal from the on-screen pump or a held Space or Enter, the goal filling over 3 seconds in the band', () => {
  for (const [way, pump] of PUMPING) {
    const game = bootFromSavedRun('fresh-run'); slide(game, 'ig-power', 60);
    const keydowns = pump(game);
    assert.equal(pressureNote(game), 'in the band', way); assert.equal(text(game, 'ig-state'), 'Cold plasma', way);
    if (keydowns !== null) assert.equal(cues(game).filter(id => id === 'pump-stroke').length, keydowns, `${way}: every stroke sounds`);
    const before = goalBar(game); assert.ok(before < 100, `${way}: not yet met`);
    playFor(game, 1);
    assert.ok(Math.abs(goalBar(game) - before - 100 / 3) < 1e-5, `${way}: a third of the goal each second, ${before} then ${goalBar(game)}`);
    playFor(game, 2);
    assert.equal(goalBar(game), 100, way); assert.match(text(game, 'goaltext'), /\bheld in the pressure band\b/, way);
    assert.equal(game.ids.get('next').disabled, false, `${way}: the way on to Hold is open`);
  }
});

// Where Ignite's compression front stands, frame by frame, while the pump is worked:
// `strokes` keydowns, one each 1/30 s of play, then `rest` seconds of play. Returns the
// front each frame, with the pressure readout's note.
function frontWhilePumping(game, strokes, rest = 0) {
  const frames = [], look = () => frames.push({ note: pressureNote(game), front: jarView(game).front });
  for (let i = 0; i < strokes; i++) { press(game, 'ig-pump', ' '); game.lab.advance(1 / 30); look(); }
  for (let i = 0; i < rest * 8; i++) { game.lab.advance(1 / 8); look(); }
  return frames;
}
// The widest angle round the jar's middle with no arrow in it, in radians.
function widestGap(arrows) {
  const turn = 2 * Math.PI, angles = arrows.map(([tail]) => (Math.atan2(tail[1], tail[0]) + turn) % turn).sort((a, b) => a - b);
  return angles.length ? Math.max(...angles.map((a, i) => i + 1 < angles.length ? angles[i + 1] - a : angles[0] + turn - a)) : turn;
}

test('the Ignite canvas shows the piston holding the plasma pressed toward the middle of the jar only while the pressure is in its band, and says so', () => {
  // Saved runs at drive power 60, reloaded at full pressure, above, in and below the band.
  const at = p => bootFromSavedRun(savedRunOn(0, d => Object.assign(d.stages[0].values, { power: 60, p })));
  for (const [p, state] of [[760, 'above'], [5, 'above'], [.1, 'below']]) {
    const game = at(p), view = jarView(game);
    assert.equal(view.front, null, `${p} torr, ${state} the band: no compression`); assert.deepEqual(view.arrows, [], `${p} torr: nothing presses in`);
    assert.ok(view.words.includes(`pressure ${state} the band`), view.words.join(' | '));
    assert.match(description(game), new RegExp(`\\b${state} its band\\b`), description(game));
    assert.doesNotMatch(description(game), /compress|pressed|piston/i, `${p} torr: the description speaks of no compression`);
  }
  const held = at(1), view = jarView(held);
  assert.ok(view.front > 0 && view.front < .6, `pressed toward the middle: a front at ${view.front} of the jar's radius`);
  assert.ok(view.arrows.length, 'arrows press in on the front');
  for (const [tail, head] of view.arrows) assert.ok(Math.hypot(...tail) > .9 && Math.hypot(...head) > view.front, 'each from the wall in to the front');
  assert.ok(widestGap(view.arrows) <= Math.PI / 2 + 1e-9, `arrows press in all round the jar: the widest gap is ${widestGap(view.arrows)} rad`);
  assert.ok(view.words.includes('pressure in the band'), view.words.join(' | '));
  assert.ok(view.words.includes('pump · piston'), 'the pump is drawn as the piston');
  assert.match(description(held), /\bin its band\b/); assert.match(description(held), /\bpiston\b[^.]*\bplasma pressed toward the middle\b/, description(held));
});

test('the pump empties the jar, so its strokes never press the Ignite front further in: the front stands where a reloaded run shows it whenever the pressure is in its band, and is gone outside it', () => {
  const settled = jarView(bootFromSavedRun(savedRunOn(0, d => Object.assign(d.stages[0].values, { power: 60, p: 1 })))).front;
  const game = bootFromSavedRun('fresh-run'); slide(game, 'ig-power', 60);
  // Pumped down from 760 torr through the band and below it, then left to leak back in.
  const frames = frontWhilePumping(game, 40, 6);
  for (const state of ['in the band', 'too thin: let it leak back']) assert.ok(frames.some(f => f.note === state), `the pressure passes ${state}`);
  assert.ok(frames.at(-1).note === 'in the band', 'and leaks back into the band');
  for (const [i, { note, front }] of frames.entries()) {
    assert.equal(front, note === 'in the band' ? settled : null, `frame ${i + 1}, ${note}`);
  }
});

test('under reduced motion the compression picture holds still and still shows the pressure state', () => {
  const picture = ({ front, arrows }) => ({ front, arrows });
  const game = bootFromSavedRun('fresh-run', { reduced: true }); slide(game, 'ig-power', 60);
  for (let i = 0; i < 29; i++) press(game, 'ig-pump', ' ');
  game.lab.advance(0); assert.equal(pressureNote(game), 'in the band');
  const first = jarView(game);
  assert.ok(first.front > 0 && first.front < .6, `pressed toward the middle at once: ${first.front}`);
  assert.ok(first.words.includes('pressure in the band'));
  for (let i = 0; i < 8; i++) { playFor(game, 1 / 8); assert.deepEqual(picture(jarView(game)), picture(first), `nothing moves after ${(i + 1) / 8} s of play`); }
  press(game, 'ig-pump', ' '); assert.deepEqual(picture(jarView(game)), picture(first), 'a stroke does not jolt it');
  playFor(game, 2); assert.equal(goalBar(game), 100); assert.deepEqual(picture(jarView(game)), picture(first), 'the met goal pauses the step, still compressed');
  // Resumed, the gas leaks back above the band, and the state still shows.
  click(game, 'pause'); playWhileInBand(game);
  const above = jarView(game);
  assert.equal(above.front, null); assert.ok(above.words.includes('pressure above the band'), above.words.join(' | '));
});

test('the 3 seconds in the Ignite pressure band count only play: a source card stops the count and the timed-practice clock, and closing the card goes on from where it stopped', () => {
  const game = bootFromSavedRun({ ...readSavedRun('fresh-run'), mode: 'challenge' });
  slide(game, 'ig-power', 60);
  for (let i = 0; i < 29; i++) press(game, 'ig-pump', ' '); // pumped down into the band in an instant
  game.lab.advance(0); assert.equal(pressureNote(game), 'in the band'); assert.equal(goalBar(game), 0);
  playFor(game, 1); assert.equal(goalBar(game), 33.333333); assert.equal(text(game, 'hud-time'), '0:01');
  readSource(game, true); playFor(game, 5);
  assert.equal(goalBar(game), 33.333333, 'a source card stops the count where it is'); assert.equal(text(game, 'hud-time'), '0:01', 'and stops the clock');
  readSource(game, false); playFor(game, 1);
  assert.equal(goalBar(game), 66.666667, 'closing it goes on from there'); assert.equal(text(game, 'hud-time'), '0:02');
  playFor(game, 1);
  assert.equal(goalBar(game), 100); assert.match(text(game, 'goaltext'), /\bheld in the pressure band\b/);
  assert.equal(text(game, 'hud-time'), '0:03', 'a met goal pauses the step, and the clock with it');
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

// The Hold lesson (Lab physics, Park et al. 2015): near beta one "the cusp leaks
// close". The band is the step's goal, beta 0.75 to 1.
const IN_BAND = [['beta 0.76', .76], ['beta 0.9', .9], ['beta 0.99', .99]];
const OUT_OF_BAND = [['beta 0.5', .5], ['beta 0.74', .74], ['beta 1.01', 1.01], ['beta 1.5', 1.5], ['coils off', Infinity]];

test('the Hold canvas draws six cusp leaks, tight inside the beta band and open below it, above it or with the coils off', () => {
  const game = bootFromSavedRun(savedRunOn(1)); let t = 0;
  const viewAt = ([name, beta]) => {
    t = holdSteady(game, .1, { beta, from: t });
    assert.match(text(game, 'ho-beta'), isFinite(beta) ? new RegExp(`^${beta.toFixed(2)}<`) : /^∞/, `the player reads ${name}`);
    return { name, ...holdView(game) };
  };
  const tight = IN_BAND.map(viewAt), open = OUT_OF_BAND.map(viewAt);
  for (const { name, leaks } of [...tight, ...open]) assert.equal(leaks.length, 6, `six cusp leaks at ${name}`);
  for (const { name, words } of tight) assert.ok(words.includes('cusp leaks closed'), `the canvas says the cusp leaks are closed at ${name}`);
  for (const { name, words } of open) assert.ok(words.includes('cusp leaks open'), `the canvas says the cusp leaks are open at ${name}`);
  const widestTight = Math.max(...tight.flatMap(v => v.leaks)), narrowestOpen = Math.min(...open.flatMap(v => v.leaks));
  assert.ok(widestTight < narrowestOpen, `every tight leak (up to ${widestTight} rad) is narrower than every open one (from ${narrowestOpen} rad)`);
});

test('the Hold description says the cusp leaks are closed inside the beta band and open outside it', () => {
  assert.match(description(bootFromSavedRun(savedRunOn(1))), /coils off\. The cusp leaks are open\.$/, 'a fresh hold, before the coils are on');
  const game = bootFromSavedRun(savedRunOn(1)); let t = 0;
  for (const [name, beta] of IN_BAND) {
    t = holdSteady(game, 1.1, { beta, from: t });
    assert.match(description(game), /The cusp leaks are closed\.$/, name);
  }
  for (const [name, beta] of OUT_OF_BAND) {
    t = holdSteady(game, 1.1, { beta, from: t });
    assert.match(description(game), /The cusp leaks are open\.$/, name);
  }
});

test('under reduced motion the cusp leaks hold still and follow current beta only', () => {
  // The whole drawn shape of the cusp leaks: their angles, the edge's radius and the plumes' length.
  const shape = ({ leaks, radius, plume }) => ({ leaks, radius, plume });
  const steady = bootFromSavedRun(savedRunOn(1), { reduced: true });
  const t = holdSteady(steady, 1), first = holdView(steady);
  holdSteady(steady, 1, { from: t }); const later = holdView(steady);
  assert.deepEqual(shape(later), shape(first), 'beta held at 0.9 draws the same cusp leaks a second later');
  assert.ok(later.words.includes('cusp leaks closed'), 'the closed state still shows');
  // The same beta at the same moment, reached straight from a leaking ball.
  const fromLeaking = bootFromSavedRun(savedRunOn(1), { reduced: true });
  const u = holdSteady(fromLeaking, 1.98, { beta: 1.8 }), leaking = holdView(fromLeaking);
  assert.ok(leaking.words.includes('cusp leaks open'), 'the open state still shows');
  assert.ok(leaking.radius > later.radius && leaking.plume > later.plume, 'a leaking ball draws a wider edge and longer plumes');
  holdSteady(fromLeaking, .02, { from: u });
  assert.deepEqual(shape(holdView(fromLeaking)), shape(later), 'back at beta 0.9, the leaks, the edge and the plumes are at once as after a steady hold');
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

test('timed practice starts its bests fresh for the 3-second Ignite hold: a best from before it does not show, and new results are kept apart, on this device and on the practice board', async () => {
  const before = JSON.stringify({ score: 9999, secs: 1 }), host = artifactHost();
  const storage = new Map([['ipt-best-v2', before]]);
  const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = 'challenge'; d.elapsed = 20; }), { storage, claude: host.claude });
  openAfter(game, 2.5); game.lab.advance(1.6);
  const score = ledgerScore(game), best = text(game, 'panel').match(/<dt>Your best here<\/dt><dd>([^<]+)/)[1];
  assert.equal(best, score, `the best shown is this run's ${score}, not the 9,999 from before the hold`);
  const points = Number(score.replace(/,/g, ''));
  assert.equal(JSON.parse(storage.get('ipt-best-v3')).score, points, 'the new best is saved under its own key');
  assert.equal(storage.get('ipt-best-v2'), before, 'the best from before stays stored');
  await settle();
  assert.deepEqual(host.reads, ['scores-v3'], 'the practice board shows only results from its own collection');
  assert.deepEqual(host.writes.map(([at, row]) => [at, row.score]), [['scores-v3/player', points]], 'and posts the run there');
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
    const game = bootFromSavedRun(saved, { rejected: true });
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

// Electron screening (#33): the Fuel step's optional control floods the fuel with electrons
// that screen the Coulomb barrier, so fusion goes at lower temperatures (4orbs account). How
// much it helps is a Game rule: a fuel burns as it would hotter, never faster than at its peak.
// Below a fuel's published peak, screening must help; above it, the fuel burns as without it.
test('with electron screening on, each fuel is more active at every temperature below its published peak, as active above it, and never past its peak', () => {
  const { lab } = boot(), slider = temperatureSlider();
  for (const [fuel, [lo, hi]] of [['pb', PB_PEAK_BAND], ['dt', DT_PEAK_BAND]]) {
    const off = lt => lab.fuelActivity({ fuel, lt }), on = lt => lab.fuelActivity({ fuel, lt, screening: true });
    const below = slider.filter(lt => 10 ** lt < lo), above = slider.filter(lt => 10 ** lt > hi);
    assert.ok(below.length && above.length, `${fuel}: the slider reaches both sides of the published peak`);
    for (const lt of below) assert.ok(on(lt) > off(lt), `${fuel} at ${(10 ** lt).toFixed(1)} keV: ${on(lt)} screened, ${off(lt)} not`);
    for (const lt of above) assert.equal(on(lt), off(lt), `${fuel} at ${(10 ** lt).toFixed(0)} keV`);
    // The peak found on a 0.001 grid of log10 keV, so within a part in 10⁵ of the true one.
    const best = off(Math.log10(peakKeV(lab, fuel)));
    for (const lt of slider) assert.ok(on(lt) <= best * (1 + 1e-5), `${fuel} at ${(10 ** lt).toFixed(1)} keV is no more active than at its peak`);
  }
});

// Small counts as the lessons write them.
const NUMBER_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10 };
// Electron screening's Game rule as a text states it: how many times the temperature a screened
// fuel burns as below its peak, capped at the peak temperature, and no change at or above the peak.
function screeningRule(said) {
  const gain = NUMBER_WORDS[said.match(/\bas it would at (\w+) times the temperature\b/)?.[1]];
  assert.ok(gain, `it says how many times the temperature: ${said}`);
  assert.match(said, /\bBelow (a|the|its) fuel's peak temperature\b/i, said);
  assert.match(said, /\bcapped at (the|its) peak temperature\b/, said);
  assert.match(said, /\bAt or above (the|its) peak\b[^.]*\bchanges nothing\b/i, said);
  return gain;
}

test("electron screening's Game rule, as the Fuel lesson and the register state it, is fuel activity's: below a fuel's peak, screened activity is unscreened activity at three times the temperature, capped at the peak; at or above the peak, unchanged", () => {
  const rule = lessonByParagraph(sourceCard(bootFromSavedRun(savedRunOn(2)))).filter(p => p.label === 'Game rule' && /\bscreening\b/.test(p.said));
  assert.equal(rule.length, 1, 'one Game rule paragraph for screening');
  const gain = screeningRule(rule[0].said);
  const fuelRow = register.split(/^## Stage mapping$/m)[1]?.split(/^## /m)[0].split('\n').find(line => line.startsWith('| Fuel |')) || '';
  assert.equal(screeningRule(fuelRow), gain, "the register's Stage mapping states the same rule");
  const { lab } = boot(), step = Math.log10(gain), close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.abs(b);
  for (const fuel of ['dt', 'pb']) {
    const off = lt => lab.fuelActivity({ fuel, lt }), on = lt => lab.fuelActivity({ fuel, lt, screening: true });
    // The peak as found on a 0.001 grid of log10 keV, and the rate there: slider positions that close to it, or
    // whose stated multiple of the temperature is, could fall either side of the true peak, so they are left out.
    const peak = Math.log10(peakKeV(lab, fuel)), top = off(peak), clear = lt => Math.abs(lt - peak) > .001;
    const seen = { below: 0, capped: 0, above: 0 };
    for (const lt of temperatureSlider().filter(lt => clear(lt) && clear(lt + step))) {
      const at = `${fuel} at ${(10 ** lt).toFixed(1)} keV`;
      if (lt > peak) { seen.above++; assert.equal(on(lt), off(lt), `${at}: above the peak, unchanged`); }
      else if (lt + step < peak) { seen.below++; assert.ok(close(on(lt), off(lt + step)), `${at}: as at ${gain} times the temperature`); }
      else { seen.capped++; assert.ok(on(lt) >= top && on(lt) <= top * (1 + 1e-5), `${at}: ${gain} times the temperature passes the peak, so the peak rate`); }
    }
    assert.ok(seen.below && seen.capped && seen.above, `${fuel}: the slider reaches each part of the rule: ${JSON.stringify(seen)}`);
  }
});

const pressed = (game, id) => game.ids.get(id).attributes['aria-pressed'] === 'true';
// A temperature as the Fuel step shows it ("2.9 billion K", "921 million K"), in kelvin.
function shownKelvin(shown) {
  const [, n, unit] = shown.match(/([\d.,]+) (million|billion) K/);
  return parseFloat(n.replace(/,/g, '')) * (unit === 'billion' ? 1e9 : 1e6);
}
// Through the page: choose hydrogen + boron-11 with electron screening on or off, set each
// slider position from the coolest up, and read the Fuel readiness check on Converge. Returns
// the temperature shown at the coolest position that passes, leaving the run there on Converge.
function coolestReady(game, screening) {
  for (const position of temperatureSlider()) {
    click(game, 'step-2'); click(game, 'fu-pb');
    if (pressed(game, 'fu-screen') !== screening) click(game, 'fu-screen');
    slide(game, 'fu-t', position); game.lab.advance(0);
    const shown = text(game, 'fu-t-o');
    click(game, 'step-5');
    if (!/Fuel: retune required/.test(text(game, 'mission-checks'))) return shown;
  }
  return null;
}

test('with electron screening on, hydrogen + boron-11 passes its Fuel readiness check at a lower slider temperature than with it off', () => {
  const game = bootFromSavedRun('ready-to-converge'); click(game, 'step-2');
  const control = game.ids.get('fu-screen');
  assert.ok(control, 'the Fuel step offers electron screening');
  assert.deepEqual([control.attributes.type, control.textContent, control.attributes['aria-pressed']], ['button', 'Electron screening', 'false'], 'off by default');
  const off = coolestReady(game, false), on = coolestReady(game, true);
  assert.ok(off && on, `hydrogen + boron-11 passes somewhere on the slider: ${off} without screening, ${on} with it`);
  assert.ok(shownKelvin(on) < shownKelvin(off), `ready from ${on} with screening, from ${off} without`);
});

test('turning electron screening off where only it lets hydrogen + boron-11 burn fails the Fuel check on Converge, and Fuel stays complete', () => {
  const game = bootFromSavedRun('ready-to-converge');
  const on = coolestReady(game, true);
  assert.ok(on, 'ready with screening somewhere on the slider');
  assert.equal(game.ids.get('cv-go').disabled, false, `ready on Converge at ${on} with screening`);
  click(game, 'step-2'); click(game, 'fu-screen'); assert.equal(pressed(game, 'fu-screen'), false);
  click(game, 'step-5');
  assert.match(text(game, 'mission-checks'), /Fuel: retune required/);
  assert.equal(game.ids.get('cv-go').disabled, true);
  assert.match(game.ids.get('step-2').attributes.class, /\bdone\b/, 'the Fuel step keeps its mastery');
});

test('electron screening leaves neutron exposure cumulative and which fuel sends neutrons into the wall unchanged', () => {
  const game = bootFromSavedRun(savedRunOn(2));
  // What the player is told about the products, at a temperature where the fuel burns either way.
  const products = (fuel, lt, screening) => {
    click(game, `fu-${fuel}`); if (pressed(game, 'fu-screen') !== screening) click(game, 'fu-screen');
    slide(game, 'fu-t', lt); game.lab.advance(1);
    return { out: text(game, 'fu-out'), neutrons: text(game, 'fu-n'), wall: /neutrons striking the wall/.test(description(game)), curling: /charged helium nuclei curling in the field/.test(description(game)) };
  };
  // Each fuel at its published peak: deuterium + tritium's, and the middle of hydrogen + boron-11's band.
  const dtPeak = Math.log10(DT_PEAK_KEV), pbPeak = Math.log10(Math.sqrt(PB_PEAK_BAND[0] * PB_PEAK_BAND[1]));
  const dt = products('dt', dtPeak, true);
  assert.deepEqual(dt, { ...products('dt', dtPeak, false), wall: true, curling: false }, 'deuterium + tritium sends neutrons into the wall, screened or not');
  const dose = game.ids.get('fu-dose').style.width; assert.notEqual(dose, '0%');
  const pb = products('pb', pbPeak, true);
  assert.deepEqual(pb, { ...products('pb', pbPeak, false), wall: false, curling: true }, 'hydrogen + boron-11 keeps its energy on charged helium, screened or not');
  click(game, 'fu-screen'); slide(game, 'fu-t', 0);
  for (let i = 0; i < 600; i++) game.lab.advance(1 / 60);
  assert.equal(game.ids.get('fu-dose').style.width, dose, 'exposure does not heal');
});

test('electron screening saves with the run and reloads, and a saved run from before the control loads with it off', () => {
  const saved = savedRunOn(2);
  assert.equal(saved.stages[2].values.screening, undefined, 'the fixtures predate the control');
  const game = bootFromSavedRun(saved);
  assert.equal(currentStep(game), 2, 'the older saved run resumes'); assert.equal(pressed(game, 'fu-screen'), false);
  click(game, 'fu-screen'); leave(game);
  assert.equal(lastSave(game).stages[2].values.screening, true);
  const reloaded = boot(game.storage);
  assert.equal(currentStep(reloaded), 2); assert.equal(pressed(reloaded, 'fu-screen'), true);
  saved.stages[2].values.screening = 'on';
  assert.equal(currentStep(bootFromSavedRun(saved, { rejected: true })), 0, 'a saved run with a malformed setting starts fresh');
});

// The Fuel canvas, one frame: the electrons drawn, as the legend's electron dot marks them
// (dots of its colour and size, the legend's own dot aside), and the words drawn.
function fuelView(game) {
  game.drawing.length = 0; paint(game);
  const d = game.drawing, named = d.findIndex(c => c[0] === 'fillText' && /^electron\b/.test(c[1]));
  const dot = named < 0 ? -1 : d.slice(0, named).map(c => c[0]).lastIndexOf('arc');
  const like = i => d[i][0] === 'arc' && d[i][3] === d[dot][3] && settingAt(d, i, 'fillStyle') === settingAt(d, dot, 'fillStyle');
  const electrons = dot < 0 ? [] : d.map((c, i) => i !== dot && like(i) ? [c[1], c[2]] : null).filter(Boolean);
  return { electrons, words: drawnWords(game) };
}

test('with electron screening on, the Fuel canvas fills the core with electrons and the description says they screen the Coulomb barrier', () => {
  const game = bootFromSavedRun(savedRunOn(2)); click(game, 'fu-pb'); game.lab.advance(1);
  const before = description(game), reaction = text(game, 'fu-rate');
  assert.deepEqual(fuelView(game).electrons, [], 'screening off: no electrons drawn');
  assert.doesNotMatch(before + reaction, /electron|screen/i);
  click(game, 'fu-screen'); game.lab.advance(1);
  assert.match(text(game, 'fu-rate'), /<small>screened; simplified temperature response<\/small>$/);
  const { electrons, words } = fuelView(game);
  assert.ok(electrons.length >= 12, `the core fills with electrons: ${electrons.length}`);
  assert.ok(words.includes('electron'), words.join(' | '));
  assert.ok(words.includes('REACTOR CORE · P-B11 · SCREENED'), words.join(' | '));
  assert.match(description(game), /^Reactor core burning hydrogen \+ boron-11, flooded with electrons that screen the Coulomb barrier: /);
  click(game, 'fu-screen'); game.lab.advance(1);
  assert.deepEqual(fuelView(game).electrons, [], 'off again: gone');
  assert.equal(description(game), before, 'and the description is as before');
});

test('a hydrogen + boron-11 burn won with electron screening names the temperature it burns at', () => {
  const game = bootFromSavedRun(savedRunOn(2)); click(game, 'fu-pb'); click(game, 'fu-screen');
  let shown = null;
  for (const position of temperatureSlider()) {
    slide(game, 'fu-t', position); game.lab.advance(3.2);
    if (goalBar(game) === 100) { shown = text(game, 'fu-t-o'); break; }
  }
  assert.ok(shown, 'the screened burn is won somewhere on the slider');
  assert.equal(text(game, 'goaltext'), `Burning boron: the energy stays on charged particles the field can catch. With the barrier screened, it burns at ${shown}.`);
});

test('under reduced motion the screening electrons hold still', () => {
  const game = bootFromSavedRun(savedRunOn(2), { reduced: true });
  click(game, 'fu-pb'); click(game, 'fu-screen'); game.lab.advance(0);
  assert.equal(game.ids.get('pause').textContent, 'Pause', 'play runs');
  const first = fuelView(game).electrons;
  assert.ok(first.length, 'the electrons show');
  for (let i = 0; i < 8; i++) { game.lab.advance(.25); assert.deepEqual(fuelView(game).electrons, first, `nothing moves after ${(i + 1) / 4} s of play`); }
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

// The register's "4orbs pages cited" table: each page, whether 4orbs has reviewed it, and the steps it is used in.
function citedPagesTable() {
  const section = register.split(/^## 4orbs pages cited$/m)[1]?.split(/^## /m)[0] || '';
  return [...section.matchAll(/^\| \[[^\]]+\]\(([^)\s]+)\) \| ([^|]+) \| ([^|]+) \|$/gm)]
    .map(([, url, reviewed, usedIn]) => ({ page: url.split('#')[0], reviewed: reviewed.trim(), usedIn: usedIn.trim() }));
}
const sourceCard = game => text(game, 'panel').match(/<details class="source-card">[\s\S]*?<\/details>/)[0];
const lessonParagraphs = card => [...card.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]);
const words = markup => markup.replace(/<[^>]+>/g, '');
// A lesson, paragraph by paragraph: its source label, its markup after the label, and the words it says.
function lessonByParagraph(card) {
  return lessonParagraphs(card).map(p => {
    const [, label = null, rest = p] = p.match(/^<span class="tag [a-z]+">([^<]+)<\/span>([\s\S]*)$/) || [];
    return { label, markup: rest, said: words(rest) };
  });
}

test("no lesson paragraph repeats its own source label in its words: the label says it once", () => {
  const game = bootFromSavedRun('completed-run');
  for (let i = 0; i < 6; i++) {
    click(game, `step-${i}`);
    for (const { label, said } of lessonByParagraph(sourceCard(game)).filter(p => p.label)) {
      assert.ok(!said.toLowerCase().includes(label.toLowerCase()), `step ${i + 1}, a ${label} paragraph: ${said}`);
    }
  }
});

test('every source card says the sources were checked on the day the register was reviewed, the day its newest source was read', () => {
  const reviewed = register.match(/^Reviewed on (\d{1,2} \w+ \d{4})/m)?.[1];
  assert.ok(reviewed, 'the register says when it was reviewed');
  const reads = [...register.matchAll(/\bread (?:in full )?on (\d{1,2} \w+ \d{4})/g)].map(m => m[1]);
  assert.equal(Date.parse(reviewed), Math.max(...reads.map(Date.parse)), `reviewed on ${reviewed}; sources read on ${reads.join(', ')}`);
  const game = bootFromSavedRun('completed-run');
  for (let i = 0; i < 6; i++) {
    click(game, `step-${i}`);
    const checked = sourceCard(game).match(/Sources checked (\d{1,2} \w+ \d{4})\./)?.[1];
    assert.equal(Date.parse(checked), Date.parse(reviewed), `step ${i + 1}'s source card says the sources were checked ${checked}`);
  }
});

test('the source register marks every theory page a source card links as unreviewed', () => {
  const game = bootFromSavedRun('completed-run'), rows = citedPagesTable();
  for (let i = 0; i < 6; i++) {
    click(game, `step-${i}`);
    for (const page of fourOrbsPages(sourceCard(game)).filter(p => p.includes('/library/theories/'))) {
      const row = rows.find(r => r.page === page);
      assert.equal(row?.reviewed, 'No', `step ${i + 1} links ${page}: the register's 4orbs pages cited table marks it unreviewed`);
    }
  }
});

test("the Fuel source card gives Forbes's dense plasma focus reading as 4orbs account, linking the pages the register lists", () => {
  const game = bootFromSavedRun(savedRunOn(2)), card = sourceCard(game), paragraphs = lessonParagraphs(card);
  const reading = paragraphs.find(p => /Forbes reads the ion pumpy schematic\b[^.]* as the dense plasma focus\b/.test(words(p)));
  assert.ok(reading, 'the card says Forbes reads the ion pumpy schematic as a dense plasma focus');
  assert.match(reading, /^<span class="tag read">4orbs account<\/span>/);
  assert.equal(reading.match(/class="tag /g).length, 1, 'one source label');
  // Its links: pages the register lists for Fuel, the reviewed page and a theory page among them.
  const rows = citedPagesTable(), linked = fourOrbsPages(reading).map(page => rows.find(r => r.page === page && /\bFuel\b/.test(r.usedIn)));
  assert.ok(linked.length && linked.every(Boolean), `every page the reading links is in the register for Fuel: ${fourOrbsPages(reading)}`);
  assert.ok(linked.some(r => r.reviewed === 'Yes') && linked.some(r => r.reviewed === 'No'), 'it links the reviewed page and a theory page');
  // Any other dense plasma focus sentence is published physics, labelled so and cited to its paper on the card.
  const papers = [...card.matchAll(/<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g)].filter(m => /dense plasma focus/i.test(m[2]));
  for (const p of paragraphs.filter(p => p !== reading && /dense plasma focus/i.test(words(p)))) {
    assert.match(p, /^<span class="tag (lab|model)">(Lab physics|Theory)<\/span>/, words(p));
    assert.ok(papers.length, `cited to its paper: ${words(p)}`);
    for (const [, url] of papers) assert.ok(register.includes(url), `the register lists ${url}`);
  }
  // The premise is taken as given: the reviewed page's caution stays in the register.
  assert.doesNotMatch(words(paragraphs.join(' ')), /unestablished|chain of custody|compilation|authenticat|alleged/i);
});

// The 4orbs theory page electron screening comes from.
const ELECTRON_SCREENING_PAGE = 'https://4orbs.com/library/theories/electron-screening-for-low-temperature-fusion/';

test("the Fuel source card gives electron screening as the 4orbs account, linking its theory page, Miley's core-electron screening paper as Theory, and how much it helps as the Game rule", () => {
  const game = bootFromSavedRun(savedRunOn(2)), card = sourceCard(game), lesson = lessonByParagraph(card);
  // One claim, one label: flooding the fuel with electrons screens the Coulomb barrier (4orbs account), linked where it is said.
  const reading = lesson.filter(p => fourOrbsPages(p.markup).includes(ELECTRON_SCREENING_PAGE));
  assert.equal(reading.length, 1, 'one lesson paragraph links the electron-screening page');
  assert.equal(reading[0].label, '4orbs account');
  assert.doesNotMatch(reading[0].markup, /class="tag /, 'one source label');
  for (const said of [/\bflood(s|ing)? the fuel with electrons\b/i, /\bscreen the Coulomb barrier\b/, /\blower temperatures\b/]) assert.match(reading[0].said, said);
  // It stays true beside the Game rule, where a screened burn still takes hundreds of millions of kelvin: less heat, not none.
  assert.doesNotMatch(reading[0].said, /\bwithout\b[^.]*\bheat\b|\bno heat\b|\bcold\b/i, reading[0].said);
  const row = citedPagesTable().find(r => r.page === ELECTRON_SCREENING_PAGE);
  assert.equal(row?.reviewed, 'No', 'the register lists the page as unreviewed'); assert.match(row.usedIn, /\bFuel\b/);
  // Miley's paper, as the page names it: labelled Theory and cited to the paper on the card, which the register lists.
  const papers = [...card.matchAll(/<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g)].filter(m => /Screening Effects of Core Electrons/i.test(m[2]));
  assert.equal(papers.length, 1, 'the card cites the core-electron screening paper');
  assert.match(papers[0][2], /\bMiley\b/); assert.ok(register.includes(papers[0][1]), `the register lists ${papers[0][1]}`);
  assert.deepEqual(lesson.filter(p => /\bMiley\b/.test(p.said) && /screen/.test(p.said)).map(p => p.label), ['Theory']);
  // How much screening helps is the Game rule, in the lesson, the card's note and beside the control; no screening claim is Lab physics.
  assert.deepEqual(lesson.filter(p => /\bHow much (electron )?screening helps\b/.test(p.said)).map(p => p.label), ['Game rule']);
  assert.deepEqual(lesson.filter(p => /screen/i.test(p.said) && p.label === 'Lab physics'), []);
  assert.match(card.match(/<p class="source">([\s\S]*?)<\/p>/)[1], /How much electron screening helps is a game rule\./);
  // The note beside the control is about the control: optional, with how much it helps left to the lesson's Game rule. It makes no claim of its own.
  const note = game.ids.get('fu-screen-note').textContent;
  assert.match(note, /\bOptional\b/); assert.match(note, /\bgame rule\b/i); assert.match(note, /\blesson\b/);
  assert.doesNotMatch(note, /electron|Coulomb|barrier|temperature|burn|fusion/i, note);
  // The premise is taken as given: the page's review status stays in the register.
  assert.doesNotMatch(words(card), /speculative|unreviewed|editorial review|auto-generated/i);
});

test('the Converge source card cites the teleportation page for the constant-speed crossing, and the register lists it as unreviewed', () => {
  const page = 'https://4orbs.com/library/theories/four-orbs-teleportation-mechanism/';
  const game = bootFromSavedRun('completed-run'); click(game, 'step-5');
  const claim = lessonParagraphs(sourceCard(game)).find(p => fourOrbsPages(p).includes(page));
  assert.ok(claim, 'the source card links the teleportation page');
  // The page's claim: only the plane and its contents go, as they move at constant speed relative to the field.
  assert.match(claim, /^<span class="tag read">4orbs account<\/span>The airliner crosses the throat at constant speed relative to the field\b/);
  assert.equal(claim.match(/class="tag /g).length, 1, 'one source label');
  const row = citedPagesTable().find(r => r.page === page);
  assert.ok(row, 'the register lists the teleportation page');
  assert.equal(row.reviewed, 'No'); assert.match(row.usedIn, /\bConverge\b/);
});

// The theory pages that read the ion pumpy schematic, and the reviewed pages that weigh it.
const DPF_THEORY_PAGE = 'https://4orbs.com/library/theories/ion-pumpy-thing-as-dpf-fusion-device/';
const REACTOR_THEORY_PAGE = 'https://4orbs.com/library/theories/ion-pumpy-thing-as-compact-fusion-reactor/';
const MILEY_PAGE = 'https://4orbs.com/research/miley-2016-fusion/';
const DPF_101_PAGE = 'https://4orbs.com/science/101/dense-plasma-focus/';

// Leaving the pressure band starts the count toward its 3 seconds over.
const COUNT_STARTS_OVER = /\b(count starts over|starts the count over)\b/;

test("the Ignite source card gives the pump as the piston in full command of the plasma's pressure, so the orbs run continuously, as the 4orbs account, and says leaving the band starts the count over", () => {
  const game = bootFromSavedRun('fresh-run'), card = sourceCard(game), lesson = lessonByParagraph(card);
  // One claim, one label: the theory pages' piston, linked where it is said.
  const reading = lesson.filter(p => fourOrbsPages(p.markup).length);
  assert.equal(reading.length, 1, 'one lesson paragraph links 4orbs pages');
  assert.equal(reading[0].label, '4orbs account'); assert.doesNotMatch(reading[0].markup, /class="tag /, 'one source label');
  assert.match(reading[0].said, /\bpiston\b[^.]*"full command of adiabatic pressure"/, 'it quotes the label Forbes reads on the piston');
  assert.match(reading[0].said, /\bcontinuously\b/, 'the orbs run continuously');
  assert.deepEqual(new Set(fourOrbsPages(reading[0].markup)), new Set([DPF_THEORY_PAGE, REACTOR_THEORY_PAGE, DPF_101_PAGE]));
  // The contrast it draws, a laboratory dense plasma focus that fires once, links the reviewed page that says so.
  const contrast = reading[0].markup.split(/(?<=\.)\s+/).filter(sentence => /\bfires? once\b/.test(words(sentence)));
  assert.equal(contrast.length, 1, 'one sentence says a dense plasma focus fires once');
  assert.match(words(contrast[0]), /\bdense plasma focus\b/); assert.ok(fourOrbsPages(contrast[0]).includes(DPF_101_PAGE), contrast[0]);
  for (const [page, reviewed] of [[DPF_THEORY_PAGE, 'No'], [REACTOR_THEORY_PAGE, 'No'], [DPF_101_PAGE, 'Yes']]) {
    const row = citedPagesTable().find(r => r.page === page);
    assert.equal(row?.reviewed, reviewed, page); assert.match(row.usedIn, /\bIgnite\b/, page);
  }
  // The hand pump stays the control: the Game rule, with the 3 seconds in the band and what leaving it does.
  const rule = lesson.filter(p => p.label === 'Game rule');
  assert.equal(rule.length, 1, 'one Game rule paragraph');
  assert.match(rule[0].said, /\bhand pump\b[^.]*\bpiston\b/, 'the hand pump plays the piston');
  assert.match(rule[0].said, /\b3 seconds\b/);
  assert.match(rule[0].said, /\bLeav\w* the band\b/i); assert.match(rule[0].said, COUNT_STARTS_OVER);
  const goalText = text(game, 'goaltext');
  assert.match(goalText, /\b3 seconds\b/, 'the goal says so, outside the card'); assert.match(goalText, COUNT_STARTS_OVER);
  for (const said of [rule[0].said, goalText]) assert.doesNotMatch(said, /\bhold\b/i, `the Hold step's name stays the Hold step's: ${said}`);
  // No sentence claims self-sustaining fusion.
  const sentences = [...lesson.map(p => p.said), ...words(card).split(/(?<=[.!?])\s+/), description(game), ...jarView(game).words, goalText];
  for (const sentence of sentences) assert.doesNotMatch(sentence, /self-sustain|sustains? itself|self-heat|ignition/i, sentence);
  // The premise is taken as given: the reviewed pages' caution stays in the register.
  assert.doesNotMatch(words(card), /recharge|pulsed|single shots?|no source|open question|unestablished|unreviewed/i);
});

test('the source register records the Ignite piston as a source choice: both reviewed pages, both theory pages, and why the game takes the theory', () => {
  const choices = register.split(/^## Source choices$/m)[1]?.split(/^## /m)[0] || '';
  const entry = choices.split(/^### /m).find(e => /^Ignite\b/.test(e));
  assert.ok(entry, 'an Ignite entry under Source choices');
  const rows = citedPagesTable(), pages = [...new Set(fourOrbsPages(entry))], reviewed = page => rows.find(r => r.page === page)?.reviewed;
  assert.deepEqual(pages.filter(p => !reviewed(p)), [], "every page it links is in the register's 4orbs pages cited table");
  assert.deepEqual(pages.filter(p => reviewed(p) === 'No').sort(), [REACTOR_THEORY_PAGE, DPF_THEORY_PAGE].sort(), 'both theory pages');
  assert.deepEqual(pages.filter(p => reviewed(p) === 'Yes').sort(), [MILEY_PAGE, DPF_101_PAGE].sort(), 'both reviewed pages');
  // What each says, and why the game takes the theory.
  for (const said of [/full command of adiabatic pressure/, /magnetic piston/, /fire once and then recharge/, /\bTeleport\b/]) assert.match(entry, said);
  // Neither theory page ties the piston to continuous running itself: the lesson joins their readings.
  assert.match(entry, /\blesson joins\b/);
});

// The steps, by name, in order.
const STEP_NAMES = STEPS.slice(0, 6);

test("the register's 4orbs pages cited table names every step that links each page on its source card, and every step it is weighed for under Source choices", () => {
  const rows = citedPagesTable(), names = (page, step) => new RegExp(`\\b${step}\\b`).test(rows.find(r => r.page === page)?.usedIn || '');
  // The table lists the pages beyond the corrected Part Three and the measurement page.
  const beyond = page => !/\/the-vanishing\/part-3-the-science\/$|\/research\/satellite-videos\/measurements\/$/.test(page);
  const game = bootFromSavedRun('completed-run');
  STEP_NAMES.forEach((step, i) => {
    click(game, `step-${i}`);
    for (const page of fourOrbsPages(sourceCard(game)).filter(beyond)) assert.ok(names(page, step), `${step}'s source card links ${page}`);
  });
  const choices = register.split(/^## Source choices$/m)[1]?.split(/^## /m)[0] || '';
  // Each choice is a heading that names its steps, then a bullet for each page weighed.
  for (const entry of choices.split(/^### /m).slice(1)) {
    const steps = entry.split(':')[0].split(/,\s*/), weighed = entry.split('\n').filter(line => line.startsWith('- ')).join('\n');
    assert.ok(steps.every(step => STEP_NAMES.includes(step)), `a Source choices heading names its steps: ${entry.split('\n')[0]}`);
    for (const page of fourOrbsPages(weighed).filter(beyond)) for (const step of steps) assert.ok(names(page, step), `${page} is weighed for ${step}`);
  }
});

// The Open step's views, in the order its view control offers them.
const OPEN_VIEWS = ['op-plates', 'op-throat', 'op-cavity'];
// The 4orbs theory page the plasma cavity comes from.
const DYNAMIC_CASIMIR_PAGE = 'https://4orbs.com/library/theories/plasma-orbs-as-dynamic-casimir-effect-generators/';

test('the Open source card gives the orbs generating negative energy as the 4orbs account, linking the dynamic Casimir page, and supplying what the throat needs as the Game rule', () => {
  const game = bootFromSavedRun(savedRunOn(4)), card = sourceCard(game), lesson = lessonByParagraph(card);
  // One claim, one label: the orbs generate negative energy by the dynamic Casimir effect (4orbs account), linked where it is said.
  const reading = lesson.filter(p => fourOrbsPages(p.markup).includes(DYNAMIC_CASIMIR_PAGE));
  assert.equal(reading.length, 1, 'one lesson paragraph links the dynamic Casimir page');
  assert.equal(reading[0].label, '4orbs account');
  for (const said of [/^The orbs generate negative energy themselves, by the dynamic Casimir effect\b/, /An orb collapses its plasma bubble fast, and the collapse turns vacuum fluctuations into real photons and negative energy\./, /plasma wall acts like a moving Casimir surface/]) assert.match(reading[0].said, said);
  // The page has plasmoids act like Casimir surfaces; "plasma cavity" is the game's name for the view, not the page's.
  assert.doesNotMatch(reading[0].said, /acts as a moving Casimir|plasma cavity/i);
  assert.doesNotMatch(reading[0].said, /throat/, 'how much the throat gets is the Game rule, not this claim');
  assert.deepEqual(lesson.filter(p => /dynamic Casimir|plasma bubble|plasma cavity/i.test(p.said)), reading, 'no other paragraph gives the dynamic Casimir reading');
  // That they supply exactly what the throat needs is the Game rule.
  assert.deepEqual(lesson.filter(p => /\borbs supply\b/.test(p.said)).map(p => [p.label, p.said]),
    [['Game rule', "Here the orbs supply exactly the negative energy the throat needs, because in Forbes's account their convergence is what opens the wormhole."]]);
  // The plates' lesson is unchanged.
  assert.ok(lesson.some(p => p.label === 'Lab physics' && /This is the Casimir effect/.test(p.said) && /one over the gap cubed/.test(p.said)));
  // The card cites further 4orbs pages one way: in the lesson, as the Fuel and Converge cards do.
  const source = card.match(/<p class="source">([\s\S]*?)<\/p>/)[1];
  assert.ok(!fourOrbsPages(source).includes(DYNAMIC_CASIMIR_PAGE), 'not again beside the main source');
  // No sentence calls a plasma Casimir a demonstrated macroscopic wormhole.
  click(game, 'op-cavity'); game.lab.advance(1);
  const sentences = [...lesson.map(p => p.said), ...source.split('<br>').map(words), description(game), ...cavityView(game).words].flatMap(s => s.split(/(?<=[.!?])\s+/));
  for (const sentence of sentences.filter(s => /Casimir|plasma (cavity|bubble)/i.test(s))) {
    assert.doesNotMatch(sentence, /(demonstrat|macroscopic|proven)[^.]*wormhole|wormhole[^.]*(demonstrat|macroscopic|proven)/i, sentence);
  }
});

test('the Open step offers a plasma-cavity view beside the plates and the throat, showing a collapsing plasma bubble and its negative energy, labelled 4orbs account', () => {
  const game = bootFromSavedRun(savedRunOn(4)), button = id => game.ids.get(id);
  assert.deepEqual(OPEN_VIEWS.map(id => [button(id).attributes.type, button(id).textContent]), [['button', 'Inspect plates'], ['button', 'Inspect throat'], ['button', 'Inspect plasma cavity']]);
  const order = OPEN_VIEWS.map(id => game.ids.get('panel').children.indexOf(button(id)));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the view control offers them in that order');
  click(game, 'op-cavity'); game.lab.advance(1);
  for (const id of OPEN_VIEWS) assert.equal(button(id).attributes['aria-pressed'], String(id === 'op-cavity'), id);
  const view = cavityView(game);
  assert.ok(view.bubble > 0, 'a plasma bubble, with its negative energy named inside it');
  // The view's claim carries its 4orbs account label where the player sees it: on the canvas and in the description.
  for (const said of ['PLASMA CAVITY · DYNAMIC CASIMIR', 'real photons', '4orbs account: real photons and negative energy', 'Schematic · not to scale']) assert.ok(view.words.includes(said), `${said}: ${view.words.join(' | ')}`);
  assert.match(description(game), /^Plasma cavity\. 4orbs account: an orb collapses its plasma bubble fast, turning vacuum fluctuations into real photons and negative energy\.$/);
  // The plate diagram and its logarithmic controls are still there.
  click(game, 'op-plates'); game.lab.advance(1); scene(game);
  assert.ok(drawnWords(game).includes('Schematic · logarithmic controls · not to scale'));
  assert.match(description(game), /^Casimir plates /);
});

test('the plasma bubble collapses as play runs, and a source card holds it still and stops the timed-practice clock', () => {
  const game = bootFromSavedRun(savedRunOn(4, d => { d.mode = 'challenge'; }));
  click(game, 'op-cavity'); click(game, 'pause'); game.lab.advance(0); // a saved run reloads paused
  assert.equal(game.ids.get('pause').textContent, 'Pause');
  const sizes = [];
  for (let i = 0; i < 4; i++) { game.lab.advance(.25); sizes.push(cavityView(game).bubble); }
  assert.ok(sizes.every((size, i) => i === 0 || size < sizes[i - 1]), `the bubble narrows as it collapses: ${sizes}`);
  const still = scene(game), time = text(game, 'hud-time');
  readSource(game, true); game.lab.advance(5);
  assert.equal(scene(game), still, 'reading a source card holds the plasma cavity still');
  assert.equal(text(game, 'hud-time'), time, 'and stops the clock');
  readSource(game, false); game.lab.advance(.25);
  assert.ok(cavityView(game).bubble < sizes.at(-1), 'closing the card lets the collapse go on');
});

test('under reduced motion the plasma cavity holds still and still shows the bubble and the negative energy', () => {
  const game = bootFromSavedRun(savedRunOn(4), { reduced: true });
  click(game, 'op-cavity'); click(game, 'pause'); game.lab.advance(0);
  assert.equal(game.ids.get('pause').textContent, 'Pause', 'play runs');
  const first = scene(game), { bubble, words } = cavityView(game);
  assert.ok(bubble > 0, 'the plasma bubble shows, with its negative energy named inside it');
  for (const said of ['Schematic · held mid-collapse · not to scale', '4orbs account: real photons and negative energy']) assert.ok(words.includes(said), words.join(' | '));
  for (let i = 0; i < 12; i++) { game.lab.advance(.25); assert.equal(scene(game), first, `nothing moves after ${(i + 1) / 4} s of play`); }
  assert.match(description(game), /^Plasma cavity, held still part-way through the collapse\. 4orbs account: an orb collapses its plasma bubble fast, turning vacuum fluctuations into real photons and negative energy\.$/);
});

test('switching Open views keeps the throat readiness uses and a completed result, and a reload reopens the plasma cavity', () => {
  const game = bootFromSavedRun(savedRunOn(5, d => { d.mode = 'challenge'; d.elapsed = 20; }));
  openAfter(game, 2.5); game.lab.advance(1.6);
  const score = ledgerScore(game);
  click(game, 'step-5'); const throat = text(game, 'mission-checks').match(/Throat: [^<]+/)[0];
  assert.equal(throat, 'Throat: 66 m / held by the orbs');
  click(game, 'step-4'); click(game, 'pause'); // the completed step opens paused; resume it
  for (const id of [...OPEN_VIEWS, 'op-throat', 'op-cavity']) { click(game, id); game.lab.advance(1); }
  assert.equal(game.ids.get('pause').textContent, 'Pause', 'the views were watched in play');
  assert.match(text(game, 'goaltext'), /^Open\. Negative energy from the orbs holds a throat wide enough for the wings/);
  assert.equal(game.ids.get('next').disabled, false, 'the Throat readiness check still passes');
  click(game, 'step-5'); assert.equal(text(game, 'mission-checks').match(/Throat: [^<]+/)[0], throat);
  assert.equal(ledgerScore(game), score, 'the completed result is unchanged');
  click(game, 'step-4'); leave(game);
  const saved = lastSave(game).stages[4];
  assert.deepEqual(saved, { done: true, values: { w: 66, ld: 3, la: 0, assumed: true, view: 'cavity' } });
  const reloaded = boot(game.storage);
  assert.equal(currentStep(reloaded), 4, 'the saved run resumes');
  assert.equal(reloaded.ids.get('op-cavity').attributes['aria-pressed'], 'true');
  assert.ok(cavityView(reloaded).bubble > 0, 'on the plasma cavity');
  assert.equal(ledgerScore(reloaded), score);
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

test('the Orbit glow shows in both cameras exactly when the Formation readiness check passes', () => {
  const ranges = formationRanges();
  // Each range's edges, and the slider positions just outside them.
  const settings = [];
  for (const [id, [lo, hi, step]] of Object.entries(ranges)) {
    const outside = x => +x.toFixed(1); // a slider position, without float noise
    settings.push([id, outside(lo - step), false], [id, lo, true], [id, hi, true], [id, outside(hi + step), false]);
  }
  for (const [id, value, inRange] of settings) {
    const game = bootFromSavedRun('ready-to-converge'); click(game, 'step-3');
    slide(game, id, value); game.lab.advance(1);
    const cameras = orbitCameras(game), said = description(game);
    click(game, 'step-5');
    const ready = !/Formation: retune required/.test(text(game, 'mission-checks'));
    assert.equal(ready, inRange, `readiness with ${id} at ${value}`);
    for (const [i, orbs] of cameras.entries()) {
      const size = glowSize(orbs);
      assert.equal(size !== null, ready, `camera ${i + 1} glow with ${id} at ${value}`);
    }
    assert.equal(/formation is matched/i.test(said), ready, `description with ${id} at ${value}: ${said}`);
    assert.equal(/both views highlight them/.test(said), ready, `description with ${id} at ${value}: ${said}`);
    // The views highlight the match; the orbs themselves do not glow.
    assert.doesNotMatch(said, /field|lock|glow/i);
  }
});

test('the Orbit glow builds while the formation is held, and reduced motion shows it settled at once', () => {
  const ranges = formationRanges();
  const glowOverTheHold = reduced => {
    const game = bootFromSavedRun(savedRunOn(3), { reduced });
    for (const [id, [lo, hi]] of Object.entries(ranges)) slide(game, id, (lo + hi) / 2);
    game.lab.advance(.5); const early = orbitCameras(game).map(glowSize);
    game.lab.advance(1.5); assert.equal(goalBar(game), 100, 'the formation hold completes the step');
    const settled = orbitCameras(game).map(glowSize);
    for (const size of [...early, ...settled]) assert.notEqual(size, null, 'the matched formation glows from the start');
    assert.equal(new Set(early).size, 1, 'both cameras show the same glow'); assert.equal(new Set(settled).size, 1);
    return [early[0], settled[0]];
  };
  const [early, settled] = glowOverTheHold(false);
  assert.ok(early < settled, `the glow builds: ${early} then ${settled}`);
  const [stillEarly, stillSettled] = glowOverTheHold(true);
  assert.equal(stillEarly, stillSettled, 'reduced motion: settled at once');
  assert.equal(stillEarly, settled, 'reduced motion: the same settled glow');
});

test('the Converge glow grows as the triangle closes, shown and described as the throat forming', () => {
  for (const view of ['cv-thermal', 'cv-visible']) {
    const game = bootFromSavedRun('ready-to-converge'); click(game, view);
    const seen = [];
    const look = () => { const size = glowSize(orbGlows(game)); seen.push(description(game), ...drawnWords(game), text(game, 'cv-view-note'), text(game, 'cv-msg')); return size; };
    game.lab.advance(1);
    assert.equal(look(), null, `${view}: no glow before closing in`);
    assert.doesNotMatch(description(game), /throat is forming/);
    // On through the opening band (71 to 79 %) to near the end of the close, so the
    // glow's growth gives no cue of when to open.
    const sizes = closeThrough(game, [95, 85, 75, 65, 55], shown => {
      const size = look();
      assert.match(description(game), /throat is forming as the triangle closes/, `${view} at ${shown} %`);
      assert.ok(drawnWords(game).includes('throat forming'), `${view} at ${shown} %: the canvas says so`);
      return size;
    });
    assert.ok(sizes[0] > 0 && sizes.every((size, i) => i === 0 || size > sizes[i - 1]), `${view}: the glow keeps growing, ${sizes}`);
    // Opened in the band, the flash and what follows say nothing of a snap or a field.
    const opened = bootFromSavedRun('ready-to-converge'); click(opened, view);
    openAfter(opened, 5);
    for (let i = 0; i < 5; i++) { opened.lab.advance(.4); opened.drawing.length = 0; paint(opened); seen.push(description(opened), ...drawnWords(opened)); }
    assert.equal(opened.ids.get('cv-go').textContent, 'Replay the sequence');
    assert.doesNotMatch(seen.join('\n'), /snap|field|lock/i, view);
  }
});

// The Converge lesson (Measured): on the heat camera a faint dark mark, colder than
// the sky, leads each object, and the flash reads black; from above, the flash is bright.
test('on the heat camera the throat-forming glow is drawn colder than the sky, and from above bright', () => {
  for (const [view, colder] of [['cv-thermal', true], ['cv-visible', false]]) {
    const game = bootFromSavedRun('ready-to-converge'); click(game, view);
    closeThrough(game, [85], () => {
      const orbs = orbGlows(game), sky = skyColour(game);
      assert.equal(orbs.length, 3, `${view}: three orbs`);
      for (const { colour } of orbs) assert.equal(brightness(colour) < brightness(sky), colder, `${view}: a ${colour} glow on a ${sky} sky`);
      // A screen reader hears what is drawn: a cold ring on the heat camera, a glow from above.
      if (colder) { assert.match(description(game), /colder than the sky/, view); assert.doesNotMatch(description(game), /glow/, view); }
      else assert.match(description(game), /glow/, view);
    });
  }
});

test('reduced motion holds the throat-forming glow still', () => {
  for (const view of ['cv-thermal', 'cv-visible']) {
    const game = bootFromSavedRun('ready-to-converge', { reduced: true }); click(game, view);
    const sizes = closeThrough(game, [95, 85, 75], () => {
      assert.match(description(game), /throat is forming as the triangle closes/);
      return glowSize(orbGlows(game));
    });
    assert.notEqual(sizes[0], null, `${view}: the close shows a glow`);
    assert.equal(new Set(sizes).size, 1, `${view}: the glow holds still, ${sizes}`);
  }
});

test('a saved run from the previous source revision starts fresh with a visible explanation, and the register names the current one', () => {
  // The revision before the Fuel step gained its electron-screening control.
  const previous = '4orbs-part3-corrected-2026-11-21-ignite-piston';
  const storage = new Map([['ipt-best-v3', '{"score":1234}']]);
  const game = bootFromSavedRun(savedRunOn(4, d => { d.sourceRevision = previous; }), { storage, rejected: true });
  assert.equal(currentStep(game), 0); assert.equal(game.ids.get('mode-learn').attributes['aria-pressed'], 'true');
  assert.equal(game.ids.get('restore-status').hidden, false);
  assert.match(text(game, 'restore-status'), /Source assumptions have changed/);
  assert.equal(storage.get('ipt-best-v3'), '{"score":1234}');
  assert.equal(register.match(/Source revision: `([^`]+)`/)?.[1], game.lab.SOURCE_REVISION, 'the register states the revision the game uses');
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
  saved.stages[1].values.assist = 'yes'; assert.equal(currentStep(bootFromSavedRun(saved, { rejected: true })), 0);
});

test('locked steps stay focusable, show a lock and explain themselves', () => {
  const game = boot(); game.lab.advance(0);
  const steps = text(game, 'steps');
  assert.match(steps, /id="step-2" class="locked" aria-disabled="true"/);
  assert.doesNotMatch(steps, /\sdisabled[\s>]/);
  clickLockedStep(game, 2);
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

// Converge's transit view at this moment: its note, the words drawn and its description.
function transitView(game) {
  game.lab.advance(0, 1); game.drawing.length = 0; paint(game);
  return { note: text(game, 'cv-view-note'), drawn: drawnWords(game), description: description(game) };
}

test('the transit view says the airliner crosses the throat at constant speed relative to the field, labelled 4orbs account, with no destination', () => {
  const game = bootFromSavedRun('ready-to-converge');
  click(game, 'cv-transit');
  // Before the throat opens, halfway through the 1.6 s playback, and once the airliner is gone.
  const views = [transitView(game)];
  openAfter(game, 5); game.lab.advance(.8); views.push(transitView(game));
  game.lab.advance(.8); views.push(transitView(game));
  views.forEach(({ note, drawn, description }, i) => {
    // The note's label goes with the claim alone, in a paragraph of its own; the schematic's presentation has none.
    const paragraphs = lessonParagraphs(note);
    assert.equal(note.replace(/<p>[\s\S]*?<\/p>/g, ''), '', `the note is all paragraphs: ${note}`);
    assert.deepEqual(paragraphs.filter(p => p.includes('class="tag ')), ['<span class="tag read">4orbs account</span> The airliner crosses the throat at constant speed relative to the field.'], note);
    assert.match(words(note), /No destination is drawn/); assert.match(words(note), /1\.6 seconds/);
    assert.ok(drawn.includes('4orbs account: constant speed relative to the field'), drawn.join(' | '));
    // The 63.7 m airliner passes the entrance at 250 m/s, in step with the playback.
    assert.ok(drawn.includes(`${['0.000', '0.127', '0.255'][i]} / 0.255 s at 250 m/s cruise`), drawn.join(' | '));
    assert.match(description, /^Transit diagram\. 4orbs account: the airliner crosses the throat at constant speed relative to the field\./);
    assert.match(description, /No destination\.$/);
    for (const said of [note, ...drawn, description]) assert.doesNotMatch(said, /keeps flying forward|path changes|arriv|comes out|travel time/i);
  });
});

// The Ledger's rows, as the player reads them: each row's source labels and the words it says.
function ledgerRows(game) {
  click(game, 'step-6');
  const list = text(game, 'panel').match(/<ul class="ledger">([\s\S]*?)<\/ul>/)[1], tag = /<span class="tag [a-z]+">([^<]+)<\/span>/g;
  return [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, row]) => ({ labels: [...row.matchAll(tag)].map(m => m[1]), said: words(row.replace(tag, '')) }));
}
const sentencesOf = said => said.split(/(?<=[.!?])\s+/);
// A lesson sentence can end by crediting its 4orbs page ("…, as the 4orbs teleportation page has
// it."), which links there. The claim is the sentence without that credit.
const PAGE_CREDIT = /,\s+as the 4orbs\b[^.!?]*\bpage has it(?=[.!?]$)/;
const claimOf = sentence => sentence.replace(PAGE_CREDIT, '');
// A completed run whose Fuel step the player burned boron in to completion, with electron
// screening on or off, and then set screening to `after`. Fuel is played from a saved run open
// on it, at the temperature the completed run burned boron at; the other steps are the completed run's.
function completedRunFuelled({ screening, after = screening }) {
  const game = bootFromSavedRun(savedRunOn(2)), done = readSavedRun('completed-run');
  click(game, 'fu-pb'); if (pressed(game, 'fu-screen') !== screening) click(game, 'fu-screen');
  slide(game, 'fu-t', done.stages[2].values.lt); playFor(game, 4);
  assert.match(game.ids.get('step-2').attributes.class, /\bdone\b/, 'the Fuel step is complete');
  if (pressed(game, 'fu-screen') !== after) click(game, 'fu-screen');
  leave(game); done.stages[2] = lastSave(game).stages[2];
  return bootFromSavedRun(done);
}
// What the electron-screening row, and no other row, is about: electrons screening the Coulomb barrier.
const SCREENING_ROW = /\bscreens? the Coulomb barrier\b/;
// The links spec #25 added to the chain, in the order the steps come: the step whose lesson
// makes each claim, and what its Ledger row is about.
const NEW_LINKS = [['Ignite', /\bpiston\b/], ['Fuel', /\bdense plasma focus\b/], ['Fuel', SCREENING_ROW], ['Open', /\bdynamic Casimir effect\b/], ['Converge', /\bconstant speed\b/]];
// The Ledger's rows from before spec #25, in order: the step each traces and its source label.
const EARLIER_LINKS = [['Ignite', 'Lab physics'], ['Hold', 'Lab physics'], ['Fuel', 'Lab physics'], ['Orbit', 'Measured'], ['Open', 'Theory'], ['Open', 'Theory'], ['Converge', '4orbs account'], ['Converge', 'Measured'], ['Converge', 'Game rule']];

test("the Ledger keeps all its rows from before and traces the piston, the dense plasma focus, electron screening, the dynamic Casimir effect and the constant-speed crossing among them in step order, each in its lesson's words under its lesson's one source label", () => {
  const game = completedRunFuelled({ screening: true }), rows = ledgerRows(game);
  for (const row of rows) assert.equal(row.labels.length, 1, `one source label: ${row.said}`);
  const traced = NEW_LINKS.map(([step, about]) => {
    const found = rows.filter(row => about.test(row.said));
    assert.equal(found.length, 1, `one row for ${step}'s ${about}: ${found.map(row => row.said).join(' | ')}`);
    const [row] = found;
    assert.deepEqual(row.labels, ['4orbs account'], row.said);
    // The claim is the lesson's: each sentence of the row is a claim its step's lesson makes, under
    // the same label. The row's label already says whose account it is, and the row has no link,
    // so it leaves out the lesson's credit to a 4orbs page.
    click(game, `step-${STEP_NAMES.indexOf(step)}`);
    const claims = lessonByParagraph(sourceCard(game)).filter(p => p.label === row.labels[0]).flatMap(p => sentencesOf(p.said)).map(claimOf);
    for (const sentence of sentencesOf(row.said)) {
      assert.equal(claimOf(sentence), sentence, `the row, labelled ${row.labels[0]}, credits no 4orbs page: ${sentence}`);
      assert.ok(claims.includes(sentence), `${step}'s lesson says, as ${row.labels[0]}: ${sentence}`);
    }
    return row;
  });
  // The rows from before are all still there, in their order and with their labels.
  const earlier = rows.filter(row => !traced.includes(row));
  assert.deepEqual(earlier.map(row => row.labels[0]), EARLIER_LINKS.map(([, label]) => label), `the rows from before: ${earlier.map(row => row.said).join(' | ')}`);
  // Each row comes after the rows of earlier steps and before the rows of later steps.
  const stepOf = row => traced.includes(row) ? NEW_LINKS[traced.indexOf(row)][0] : EARLIER_LINKS[earlier.indexOf(row)][0];
  const order = rows.map(row => STEP_NAMES.indexOf(stepOf(row)));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `in the order the steps come: ${rows.map(row => `${stepOf(row)}: ${row.said}`).join(' | ')}`);
});

test('the Ledger traces electron screening only when the run completed its Fuel step with screening on, whatever screening is set to afterwards', () => {
  const screened = ({ screening, after }) => ledgerRows(completedRunFuelled({ screening, after })).filter(row => SCREENING_ROW.test(row.said)).length;
  assert.equal(screened({ screening: true, after: true }), 1, 'completed with screening on');
  assert.equal(screened({ screening: true, after: false }), 1, 'completed with screening on, then turned off');
  assert.equal(screened({ screening: false, after: false }), 0, 'completed with screening off');
  assert.equal(screened({ screening: false, after: true }), 0, 'completed with screening off, then turned on');
  // It changes nothing else in the Ledger.
  const withIt = ledgerRows(completedRunFuelled({ screening: true })), without = ledgerRows(completedRunFuelled({ screening: false }));
  assert.deepEqual(withIt.filter(row => !SCREENING_ROW.test(row.said)), without);
});

test('a run saves whether its Fuel step was completed with electron screening on, and a saved run without that restores with it off, so its Ledger leaves the screening row out', () => {
  const game = completedRunFuelled({ screening: true }); leave(game);
  const saved = lastSave(game);
  assert.equal(saved.stages[2].values.completedScreened, true, 'Fuel was completed with screening on');
  delete saved.stages[2].values.completedScreened;
  const older = bootFromSavedRun(saved);
  assert.equal(currentStep(older), 5, 'the older saved run resumes');
  assert.equal(ledgerRows(older).filter(row => SCREENING_ROW.test(row.said)).length, 0, 'no screening row');
  saved.stages[2].values.completedScreened = 'yes';
  assert.equal(currentStep(bootFromSavedRun(saved, { rejected: true })), 0, 'a saved run with a malformed value starts fresh');
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

// ───────── The 3D view (docs/adr/0003, 0004) ─────────
// A run booted with the stand-in renderer, after its first flat frame, once the renderer has started.
async function bootIn3D(fixture, options = {}) {
  const game = bootFromSavedRun(fixture, { view3d: {}, ...options });
  paint(game); await settle(); return game;
}
// The frame the 3D view draws next, and the entries of one kind in one of its views: a frame
// holds a view for each camera on screen, side by side, each with its own camera and list.
const nextScene = game => { const before = game.scenes.length; paint(game); return game.scenes.length > before ? game.scenes.at(-1) : null; };
const entries = (frame, kind, view = 0) => frame.views[view].list.filter(e => e.kind === kind);
const cameraOf = (frame, view = 0) => frame.views[view].camera;
const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} is not ${b}`);
const distance = (p, q = [0, 0, 0]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
// ready-to-converge: a learning run, Formation at 67 m and 134° between the cameras, a 66 m throat.
const READY = { r: 67, cam: 134, w: 66 };

test('Converge in 3D draws the airliner at the origin at 63.7 by 60.9 m, and three orbs at the Formation for the current triangle size, from the thermal camera', async () => {
  const game = await bootIn3D('ready-to-converge');
  const frame = nextScene(game);
  assert.equal(frame.look, 'heat'); assert.equal(frame.views.length, 1, 'one camera, over the whole canvas');
  assert.deepEqual([frame.views[0].left, frame.views[0].width, frame.views[0].origin], [0, 390, [195, 292.5 / 2]]);
  assert.equal(cameraOf(frame).angle, READY.cam, 'the thermal camera keeps the angle between the cameras');
  near(cameraOf(frame).scale, Math.min(390, 292.5) / 2 / 122, 'and the flat view\'s pixels per metre');
  const [airliner] = entries(frame, 'airliner');
  assert.deepEqual(airliner.at, [0, 0, 0]); assert.deepEqual(airliner.size, [60.9, 63.7]);
  closeThrough(game, [100, 90, 80], shown => {
    const f = nextScene(game), orbs = entries(f, 'orb'), r = READY.r * shown / 100;
    assert.equal(orbs.length, 3);
    for (const o of orbs) near(distance(o.at), r, `an orb at ${shown} %`);
    for (let i = 0; i < 3; i++) near(distance(orbs[i].at, orbs[(i + 1) % 3].at), r * Math.sqrt(3), 'the triangle is equilateral');
    assert.deepEqual(entries(f, 'triangle')[0].points, orbs.map(o => o.at));
  });
});

test('Converge in 3D: the throat forms only while the triangle closes, and grows steadily', async () => {
  const game = await bootIn3D('ready-to-converge');
  assert.equal(entries(nextScene(game), 'throat forming').length, 0, 'not while orbiting');
  closeThrough(game, [95, 85, 76], shown => {
    const f = nextScene(game), [throat] = entries(f, 'throat forming');
    near(throat.amount, (1 - shown / 100) / 0.5, `formed at ${shown} %`);
    assert.deepEqual(throat.points, entries(f, 'orb').map(o => o.at), 'round the orbs');
  });
  game.lab.advance(0.2); click(game, 'cv-go');
  assert.equal(entries(nextScene(game), 'throat forming').length, 0, 'not once it opens');
});

test('Converge in 3D: the flash grows as the flat view\'s, the airliner leaves after 18 % of it and the orbs after 45 %', async () => {
  const game = await bootIn3D('ready-to-converge');
  openAfter(game, 5);
  let q = 0;
  for (const [to, airliner, orbs] of [[0.1, 1, 3], [0.17, 1, 3], [0.19, 0, 3], [0.44, 0, 3], [0.46, 0, 0], [0.9, 0, 0]]) {
    game.lab.advance((to - q) * 1.6); q = to;
    for (const view of ['thermal', 'visible']) {
      click(game, `cv-${view}`);
      const f = nextScene(game), [flash] = entries(f, 'flash'), R = READY.w / 2 * (0.4 + Math.sin(Math.PI * q));
      assert.equal(entries(f, 'airliner').length, airliner, `airliner at ${q * 100} %, ${view}`);
      assert.equal(entries(f, 'orb').length, orbs, `orbs at ${q * 100} %, ${view}`);
      // The heat camera sees the flash black, colder than the sky; from above it is bright.
      if (view === 'thermal') {
        assert.equal(flash.style, 'dark'); near(flash.radius, R, 'the dark flash');
        // Its rippling edge stays within a fifth of the radius, as the flat view's.
        assert.equal(flash.edge.length, 41);
        for (const [x, y] of flash.edge) assert.ok(Math.abs(Math.hypot(x, y) - R) <= R * 0.19 + 1e-9, 'the dark flash\'s edge');
      }
      else { assert.equal(flash.style, 'bright'); near(flash.radius, R * 1.5, 'the bright flash, to the edge of its glow'); }
    }
  }
});

test('Converge in 3D: the transit diagram draws the airliner crossing at constant speed, cut at the entrance', async () => {
  const game = await bootIn3D('ready-to-converge');
  openAfter(game, 5); click(game, 'cv-transit');
  let q = 0;
  for (const to of [0, 0.25, 0.5, 0.75]) {
    game.lab.advance((to - q) * 1.6); q = to;
    const f = nextScene(game), [airliner] = entries(f, 'airliner');
    assert.equal(f.look, 'diagram'); assert.equal(cameraOf(f).angle, 0);
    assert.deepEqual(airliner.size, [60.9, 63.7]);
    near(airliner.at[1], 63.7 * (0.5 - q), `centred on the entrance's line ${q * 100} % through`);
    assert.equal(airliner.cutBeyond, 0, 'nothing past the entrance is drawn');
  }
});

test('with reduced motion, the 3D view holds still as the flat view does: no camera drift, and a steady aperture instead of a pulse', async () => {
  const game = await bootIn3D('ready-to-converge', { reduced: true });
  const first = nextScene(game); game.lab.advance(1);
  assert.deepEqual(nextScene(game).views.map(v => v.camera), first.views.map(v => v.camera), 'the camera stays put');
  openAfter(game, 5);
  const looks = [0.1, 0.5].map(q => { game.lab.advance(0.2 * 1.6); return entries(nextScene(game), 'flash')[0]; });
  for (const flash of looks) { assert.equal(flash.style, 'steady'); assert.equal(flash.radius, READY.w / 2); }
  assert.deepEqual(looks[0], looks[1], 'the aperture does not change as the flash plays');
  assert.deepEqual(nextScene(game), nextScene(game), 'with no time passing, nothing moves');
});

test('over the 3D view the 2D canvas draws the flat view\'s words and scale bar, and none of its shapes', async () => {
  const actions = game => { closeThrough(game, [85], () => {}); };
  for (const view of ['thermal', 'visible', 'transit']) {
    const flat = bootFromSavedRun('ready-to-converge'); click(flat, `cv-${view}`); actions(flat); scene(flat);
    const in3D = await bootIn3D('ready-to-converge'); click(in3D, `cv-${view}`); actions(in3D); scene(in3D);
    assert.deepEqual(drawnWords(in3D), drawnWords(flat), view);
    assert.ok(in3D.drawing.some(c => c[0] === 'clearRect'), `${view}: the 2D canvas clears to show the 3D view`);
    for (const shape of ['ellipse', 'arc', 'fillRect'].filter(k => view !== 'transit' || k !== 'fillRect')) assert.ok(!in3D.drawing.some(c => c[0] === shape), `${view}: no ${shape} on the 2D canvas`);
    assert.equal(in3D.ids.get('gl').hidden, false, `${view}: the 3D canvas shows`);
  }
});

// Orbit's two cameras, side by side as the flat view draws them: camera 1 looks from above on
// the left half, camera 2 on the right, each centred 6 px below the canvas's middle.
const ORBIT_SCALE = Math.min(195, 292.5) / 2 / 104, ORBIT_CENTRE_Y = 292.5 / 2 + 6;
// The Orbit step of a run whose earlier steps are done, with the Formation set as given.
async function orbitIn3D(settings = {}, options = {}) {
  const game = await bootIn3D(savedRunOn(3), options);
  for (const [id, value] of Object.entries(settings)) slide(game, id, value);
  return game;
}
const orbAts = (frame, view) => entries(frame, 'orb', view).map(o => o.at);

test('Orbit in 3D draws both cameras side by side: camera 1 from above, camera 2 turned by the angle between the cameras the player sets', async () => {
  const game = await orbitIn3D();
  const frame = nextScene(game);
  assert.equal(frame.look, 'visible'); assert.equal(frame.views.length, 2);
  frame.views.forEach((v, i) => {
    assert.deepEqual([v.left, v.width, v.origin], [195 * i, 195, [195 * (i + .5), ORBIT_CENTRE_Y]], `camera ${i + 1} has its half of the canvas`);
    near(v.camera.scale, ORBIT_SCALE, `camera ${i + 1} keeps the flat view's pixels per metre`);
  });
  assert.equal(cameraOf(frame, 0).angle, 0, 'camera 1 looks from above');
  assert.equal(cameraOf(frame, 1).angle, 40, 'camera 2 at the fresh step\'s 40°');
  for (const cam of [123, 134, 180]) { slide(game, 'or-c', cam); assert.equal(cameraOf(nextScene(game), 1).angle, cam, `camera 2 follows the slider to ${cam}°`); }
});

test('Orbit in 3D holds the airliner prop and three orbs at the Formation in both cameras, and each camera shows the orbs where the flat view draws them', async () => {
  const game = await orbitIn3D({ 'or-r': 66, 'or-c': 129 });
  playFor(game, 0.75);
  const frame = nextScene(game);
  for (const view of [0, 1]) {
    const [airliner] = entries(frame, 'airliner', view);
    assert.deepEqual(airliner.at, [0, 0, 0]); assert.deepEqual(airliner.size, [60.9, 63.7]);
    const ats = orbAts(frame, view);
    assert.equal(ats.length, 3);
    for (const at of ats) near(distance(at), 66, `an orb 66 m out in camera ${view + 1}`);
    for (let i = 0; i < 3; i++) near(distance(ats[i], ats[(i + 1) % 3]), 66 * Math.sqrt(3), 'the triangle is equilateral');
    assert.deepEqual(entries(frame, 'triangle', view)[0].points, ats, 'the triangle joins the orbs');
  }
  assert.deepEqual(orbAts(frame, 1), orbAts(frame, 0), 'both cameras see one Formation');
  // The same moment in the flat view: each camera's orbs sit where its camera puts them.
  const toggle = game.ids.get('view-3d'); toggle.checked = false; toggle.onchange();
  const flat = orbitCameras(game);
  frame.views.forEach((v, i) => {
    orbAts(frame, i).forEach((at, j) => {
      const [x, y] = game.lab.camB(at, v.camera.angle);
      near(flat[i][j].x, v.origin[0] + x * v.camera.scale, `camera ${i + 1}, orb ${j + 1} across`);
      near(flat[i][j].y, v.origin[1] + y * v.camera.scale, `camera ${i + 1}, orb ${j + 1} down`);
    });
  });
});

test('Orbit in 3D: the matched Formation\'s glow builds over the hold in both cameras as the flat view\'s, and reduced motion shows it settled at once', async () => {
  const ranges = formationRanges(), matched = Object.fromEntries(Object.entries(ranges).map(([id, [lo, hi]]) => [id, (lo + hi) / 2]));
  const px = n => n / ORBIT_SCALE;
  const glows = frame => [0, 1].map(view => entries(frame, 'formation glow', view));
  const expect = (glow, amount, why) => {
    near(glow.amount, amount, why);
    near(glow.ring, px(12 + 18 * amount), `${why}: rings`); near(glow.pad, px(10 + 14 * amount), `${why}: outline`);
    near(glow.width, px(1.25 + 1.75 * amount), `${why}: line width`); near(glow.opacity, .28 + .67 * amount, `${why}: opacity`);
  };
  const unmatched = await orbitIn3D();
  for (const g of glows(nextScene(unmatched))) assert.equal(g.length, 0, 'no glow while the Formation is off');
  const game = await orbitIn3D(matched);
  let heldSoFar = 0;
  for (const [held, amount] of [[0.5, 1 / 3], [1, 2 / 3], [1.5, 1]]) {
    playFor(game, held - heldSoFar); heldSoFar = held;
    const frame = nextScene(game);
    glows(frame).forEach(([glow], view) => {
      expect(glow, amount, `camera ${view + 1} after ${held} s held`);
      assert.deepEqual(glow.points, orbAts(frame, view), 'round the orbs');
    });
  }
  const still = await orbitIn3D(matched, { reduced: true });
  playFor(still, 0.125);
  for (const [glow] of glows(nextScene(still))) expect(glow, 1, 'reduced motion');
});

test('over Orbit\'s 3D view the 2D canvas draws the titles, scale bar, divider and tracked rings, and no orbs or airliner', async () => {
  const flat = bootFromSavedRun(savedRunOn(3)); scene(flat);
  const in3D = await orbitIn3D(); scene(in3D);
  assert.deepEqual(drawnWords(in3D), drawnWords(flat));
  assert.ok(in3D.drawing.some(c => c[0] === 'clearRect'), 'the 2D canvas clears to show the 3D view');
  for (const shape of ['ellipse', 'fillRect', 'createRadialGradient']) assert.ok(!in3D.drawing.some(c => c[0] === shape), `no ${shape} on the 2D canvas`);
  // The tracked rings are diagram marks: the 2D canvas draws them where the flat view does, and no other circles.
  const rings = game => game.drawing.filter(c => c[0] === 'arc' && c[3] === 7);
  assert.equal(rings(flat).length, 6, 'three tracked rings in each camera');
  assert.deepEqual(rings(in3D), rings(flat));
  assert.equal(in3D.drawing.filter(c => c[0] === 'arc').length, 6, 'no orbs or glow on the 2D canvas');
  assert.equal(in3D.ids.get('gl').hidden, false, 'the 3D canvas shows');
});

// Open's three views in 3D. The throat is at the flat view's scale, in metres. The plates and
// the plasma cavity are schematics: their camera's scale is the lab's, 9 % of the canvas's
// shorter side to the tenth of a metre, so the plate mount prop, at its real 100 mm, stands that tall.
const LAB_SCALE = Math.min(390, 292.5) * 0.9, PLATE_MOUNT_HEIGHT = 0.1;
// The Open step of a run whose earlier steps are done, showing `view`, its sliders set as given.
async function openIn3D(view, settings = {}, options = {}) {
  const game = await bootIn3D(savedRunOn(4), options);
  click(game, `op-${view}`);
  for (const [id, value] of Object.entries(settings)) slide(game, id, value);
  return game;
}

test('the 3D view loads the airliner, the plate mount, the vacuum chamber, the piston housing and the pump handle props', async () => {
  const game = await openIn3D('plates');
  assert.deepEqual({ ...game.view3d.given.props }, { airliner: 'assets/airliner.glb', plateMount: 'assets/plate-mount.glb', vacuumChamber: 'assets/vacuum-chamber.glb', pistonHousing: 'assets/piston-housing.glb', pumpHandle: 'assets/pump-handle.glb' });
});

test('Open\'s plates in 3D: two plates set apart by the gap and as tall as the area the player sets, as the flat view draws them, each held by a plate mount prop at its real 100 mm', async () => {
  for (const [ld, la] of [[3, 0], [1, 6], [4, 2.5]]) {
    const game = await openIn3D('plates', { 'op-d': ld, 'op-a': la }), frame = nextScene(game);
    assert.equal(frame.look, 'diagram', 'a schematic, so drawn as a diagram (docs/adr/0004)'); assert.equal(frame.views.length, 1);
    assert.deepEqual([frame.views[0].left, frame.views[0].width, frame.views[0].origin], [0, 390, [195, 292.5 / 2]]);
    assert.deepEqual(cameraOf(frame), { angle: 0, scale: LAB_SCALE }, 'side on, at the lab\'s scale');
    // The flat view's plates, in pixels: centred 47 % of the way down, the gap and height set by the logarithmic controls.
    const gap = 390 * (0.06 + (ld - 1) / 3 * 0.32), height = 292.5 * (0.22 + la / 6 * 0.25), cy = (292.5 * 0.47 - 292.5 / 2) / LAB_SCALE;
    const plates = entries(frame, 'plate');
    assert.equal(plates.length, 2, `two plates at ${ld}, ${la}`);
    plates.forEach((p, i) => {
      const side = i ? 1 : -1;
      near(p.at[0], side * gap / 2 / LAB_SCALE, 'each plate half the gap from the middle'); near(p.at[1], cy, 'at the flat view\'s height'); assert.equal(p.at[2], 0);
      near(p.size[0], 8 / LAB_SCALE, '8 px thick'); near(p.size[1], height / LAB_SCALE, 'as tall as the flat view\'s');
    });
    const [glow] = entries(frame, 'gap glow');
    near(glow.size[0], gap / LAB_SCALE, 'the glow fills the gap'); near(glow.size[1], height / LAB_SCALE, 'and the plates\' height');
    const mounts = entries(frame, 'plate mount');
    assert.equal(mounts.length, 2);
    mounts.forEach((m, i) => {
      assert.equal(m.height, PLATE_MOUNT_HEIGHT, 'at real size');
      assert.deepEqual(m.at, [plates[i].at[0], plates[i].at[1] + plates[i].size[1] / 2, 0], 'its post holds the plate\'s lower edge');
      assert.deepEqual(Object.keys(m).sort(), ['at', 'colour', 'height', 'kind'], 'kind, place, size and colour only (docs/adr/0003)');
    });
  }
});

// The gap's measure line on the plates view: the straight lines stroked from one plate to the
// other, at the gap's width about the canvas's middle, as [y, from x, to x] in canvas pixels.
function gapMeasureLines(game, ld) {
  const gap = 390 * (0.06 + (ld - 1) / 3 * 0.32), lines = [];
  game.drawing.length = 0; paint(game);
  let at = null;
  for (const call of game.drawing) {
    if (call[0] === 'moveTo') at = call.slice(1, 3);
    else if (call[0] === 'lineTo' && at) {
      if (Math.abs(at[1] - call[2]) < 1e-9 && Math.abs(Math.abs(call[1] - at[0]) - gap) < 1e-9) lines.push([at[1], at[0], call[1]]);
      at = call.slice(1, 3);
    }
  }
  return lines;
}

test('Open\'s plates in 3D keep the gap\'s measure line where the flat view draws it, over the plate mounts', async () => {
  for (const [ld, la] of [[3, 0], [1, 6]]) {
    const flat = bootFromSavedRun(savedRunOn(4));
    click(flat, 'op-plates'); slide(flat, 'op-d', ld); slide(flat, 'op-a', la);
    const shown = await openIn3D('plates', { 'op-d': ld, 'op-a': la });
    const want = gapMeasureLines(flat, ld);
    assert.equal(want.length, 1, `one measure line in the flat view at ${ld}, ${la}`);
    assert.deepEqual(gapMeasureLines(shown, ld), want, 'the same line over the 3D view (the 2D canvas is in front of the mounts)');
  }
});

test('Open\'s throat in 3D: the airliner at the origin, and the throat below it as wide as the player sets and as open as the flat view\'s', async () => {
  const game = await openIn3D('throat', { 'op-w': 80 });
  click(game, 'op-assume');
  const frame = nextScene(game);
  assert.equal(frame.look, 'visible');
  assert.deepEqual(cameraOf(frame), { angle: 0, scale: Math.min(390, 292.5) / 2 / 122 }, 'from above, at the flat view\'s scale');
  const [airliner] = entries(frame, 'airliner'), [throat] = entries(frame, 'throat');
  assert.deepEqual([airliner.at, airliner.size], [[0, 0, 0], [60.9, 63.7]]);
  assert.equal(throat.radius, 40, 'held open by the orbs, half the 80 m width');
  assert.equal(throat.at[0], 0); assert.equal(throat.at[1], 0); assert.ok(throat.at[2] > 0, 'below the airliner, away from the camera');
  slide(game, 'op-w', 30); assert.equal(entries(nextScene(game), 'throat')[0].radius, 15);
  // Without the orbs it pulses open and pinches shut, as the flat view's: never wider than the width set.
  click(game, 'op-assume'); // releasing the throat also resumes play
  const radii = [];
  for (let i = 0; i < 12; i++) { game.lab.advance(0.25); radii.push(entries(nextScene(game), 'throat')[0]?.radius ?? 0); }
  assert.ok(radii.every(r => r >= 0 && r <= 15), radii.join(', '));
  assert.ok(new Set(radii).size > 3, `it moves: ${radii}`);
});

test('Open\'s plasma cavity in 3D: the bubble is as big as the flat view\'s and collapses with it, and reduced motion holds it still', async () => {
  const flat = bootFromSavedRun(savedRunOn(4)); click(flat, 'op-cavity'); click(flat, 'pause');
  const game = await openIn3D('cavity'); click(game, 'pause');
  for (let i = 0; i < 4; i++) {
    flat.lab.advance(0.25); game.lab.advance(0.25);
    const frame = nextScene(game), [bubble] = entries(frame, 'bubble');
    assert.deepEqual(cameraOf(frame), { angle: 0, scale: LAB_SCALE });
    near(bubble.radius * LAB_SCALE, cavityView(flat).bubble, `the bubble at ${(i + 1) / 4} s`);
  }
  assert.ok(entries(nextScene(game), 'specks')[0].points.length > 20, 'the vacuum\'s fluctuations round it');
  const still = await openIn3D('cavity', {}, { reduced: true }); click(still, 'pause');
  const first = nextScene(still);
  for (let i = 0; i < 6; i++) { still.lab.advance(0.25); assert.deepEqual(nextScene(still), first, `nothing moves after ${(i + 1) / 4} s`); }
});

test('over Open\'s 3D views the 2D canvas draws the flat view\'s words and marks, and none of its shapes', async () => {
  for (const view of ['plates', 'throat', 'cavity']) {
    const flat = bootFromSavedRun(savedRunOn(4)); click(flat, `op-${view}`); scene(flat);
    const in3D = await openIn3D(view); scene(in3D);
    assert.deepEqual(drawnWords(in3D), drawnWords(flat), view);
    assert.ok(in3D.drawing.some(c => c[0] === 'clearRect'), `${view}: the 2D canvas clears to show the 3D view`);
    for (const shape of ['fillRect', 'createRadialGradient', 'createLinearGradient']) assert.ok(!in3D.drawing.some(c => c[0] === shape), `${view}: no ${shape} on the 2D canvas`);
    assert.equal(in3D.ids.get('gl').hidden, false, `${view}: the 3D canvas shows`);
  }
  // The throat's marks stay on the 2D canvas: the dashed circle of the width set, and the wingtip rings.
  const flat = bootFromSavedRun(savedRunOn(4)); click(flat, 'op-throat'); slide(flat, 'op-w', 40); scene(flat);
  const in3D = await openIn3D('throat', { 'op-w': 40 }); scene(in3D);
  const sc = Math.min(390, 292.5) / 2 / 122, marks = game => game.drawing.filter(c => c[0] === 'arc' && (c[3] === 7 || Math.abs(c[3] - 20 * sc) < 1e-9));
  assert.equal(marks(flat).length, 3, 'the width circle and two wingtip rings');
  assert.deepEqual(in3D.drawing.filter(c => c[0] === 'arc'), marks(flat));
});

// The Hold step of a run whose first step is done, with the stand-in renderer.
const holdIn3D = (options = {}) => bootIn3D(savedRunOn(1), options);
// Where a point in the Hold and Open schematics' frame falls on the canvas, in pixels: the
// scene's origin is the canvas's middle, 390 by 292.5 px, at the lab's scale.
const labPixels = ([x, y]) => [195 + x * LAB_SCALE, 292.5 / 2 + y * LAB_SCALE];
// The flat Hold canvas's plasma ball, one frame: its glow's centre and radius, in pixels.
function holdBall(game) {
  game.drawing.length = 0; paint(game);
  const glow = game.drawing.find(c => c[0] === 'createRadialGradient' && c[3] === 0);
  return { at: [glow[4], glow[5]], radius: glow[6] };
}
// The flat Hold canvas's coils, one frame: each coil half's box, in pixels, its fill's opacity
// and its outline's colour.
function holdCoils(game) {
  game.drawing.length = 0; paint(game);
  return game.drawing.flatMap((c, i) => c[0] !== 'fillRect' || c[4] !== 12 ? [] : [{
    box: c.slice(1), opacity: +settingAt(game.drawing, i, 'fillStyle').match(/,\s*([\d.]+)\)$/)[1],
    edge: settingAt(game.drawing, game.drawing.findIndex((d, j) => j > i && d[0] === 'strokeRect'), 'strokeStyle')
  }]);
}
// The flat Hold canvas's chamber walls, one frame: the straight up-and-down lines stroked away
// from the canvas's middle, as [x, top, bottom] in pixels.
function holdWalls(game) {
  game.drawing.length = 0; paint(game);
  const walls = [];
  game.drawing.forEach((c, i) => {
    const prev = game.drawing[i - 1];
    if (c[0] === 'lineTo' && prev[0] === 'moveTo' && prev[1] === c[1] && c[1] !== 195) walls.push([c[1], Math.min(prev[2], c[2]), Math.max(prev[2], c[2])]);
  });
  return walls;
}

test('Hold in 3D: a diagram side on at the lab\'s scale, with the plasma ball and its cusp leaks where, as big and as open as the flat view draws them, inside and outside the beta band', async () => {
  for (const reduced of [false, true]) {
    const flat = bootFromSavedRun(savedRunOn(1), { reduced }), game = await holdIn3D({ reduced });
    let t = 0;
    for (const [name, beta] of [...IN_BAND, ...OUT_OF_BAND]) {
      holdSteady(flat, .5, { beta, from: t }); t = holdSteady(game, .5, { beta, from: t });
      const why = `${name}${reduced ? ', reduced motion' : ''}`, frame = nextScene(game);
      assert.equal(frame.look, 'diagram', 'a schematic, so drawn as a diagram (docs/adr/0004)');
      assert.deepEqual(cameraOf(frame), { angle: 0, scale: LAB_SCALE }, 'side on, at the lab\'s scale');
      const want = holdView(flat), ball = holdBall(flat), [drawn] = entries(frame, 'plasma ball'), [leaks] = entries(frame, 'cusp leaks');
      labPixels(drawn.at).forEach((v, k) => near(v, ball.at[k], `the ball where the flat view draws it at ${why}`));
      assert.equal(drawn.at[2], 0); near(drawn.radius * LAB_SCALE, ball.radius, `the ball as big at ${why}`);
      assert.deepEqual(leaks.at, drawn.at, 'the leaks are round the ball');
      // holdView gives the flat view's radii to the nearest millionth of a pixel.
      const px = n => Math.round(n * LAB_SCALE * 1e6) / 1e6;
      assert.equal(px(leaks.edge), want.radius, `the field's edge at ${why}`);
      assert.equal(px(leaks.plume - leaks.edge), want.plume, `the plumes' reach at ${why}`);
      assert.equal(leaks.angles.length, 6, 'six cusp leaks');
      // holdView measures each gap between arcs it has rounded to the millionth of a radian.
      want.leaks.forEach((gap, i) => assert.ok(Math.abs(2 * leaks.halfAngle - gap) < 3e-6, `leak ${i} as open at ${why}: ${2 * leaks.halfAngle} is not ${gap}`));
      const turn = 2 * Math.PI, norm = a => Math.round(((a % turn) + turn) % turn * 1e6) / 1e6 % turn;
      const centres = [...want.centres].sort((a, b) => a - b);
      leaks.angles.map(norm).sort((a, b) => a - b).forEach((a, i) => assert.ok(Math.abs(a - centres[i]) < 3e-6, `the leaks point where the flat view's do at ${why}: ${a} is not ${centres[i]}`));
      const edgeArc = flat.drawing.findIndex(c => c[0] === 'arc' && c[5] - c[4] < turn - 1e-9);
      assert.equal(leaks.colour, settingAt(flat.drawing, edgeArc, 'strokeStyle'), `coloured as the flat view's at ${why}`);
    }
  }
});

test('Hold in 3D: the coils where the flat view draws them, each half as bright as the flat view\'s for the field and trim set', async () => {
  for (const [beta, trim] of [[.9, 0], [.5, 1], [1.5, -1], [Infinity, .5]]) {
    const flat = bootFromSavedRun(savedRunOn(1)), game = await holdIn3D();
    holdSteady(flat, .3, { beta, trim }); holdSteady(game, .3, { beta, trim });
    const halves = holdCoils(flat), coils = entries(nextScene(game), 'coil');
    assert.equal(halves.length, 4, 'the flat view draws two coils, each in two halves'); assert.equal(coils.length, 2, `two coils at beta ${beta}, trim ${trim}`);
    for (const { box: [x, y, w, h], opacity, edge } of halves) {
      const coil = coils.find(c => Math.abs(labPixels(c.at)[1] - (y + h / 2)) < 1e-9);
      assert.ok(coil, `a coil at y ${y + h / 2}`); assert.equal(coil.at[0], 0); assert.equal(coil.at[2], 0);
      near((coil.radius + coil.tube) * LAB_SCALE, w, 'reaching as far out as the flat view\'s'); near(2 * coil.tube * LAB_SCALE, h, 'as thick');
      near(coil.opacity[x < 195 ? 0 : 1], opacity, `the ${x < 195 ? 'left' : 'right'} half as bright at beta ${beta}, trim ${trim}`);
      assert.equal(coil.edge, edge, 'outlined in the flat view\'s colour');
    }
  }
});

test('Hold in 3D: a vacuum chamber prop, its walls where the flat view draws them, listed by kind, place, size and colour only', async () => {
  const flat = bootFromSavedRun(savedRunOn(1)), game = await holdIn3D();
  holdSteady(flat, .3); holdSteady(game, .3);
  const walls = holdWalls(flat), chambers = entries(nextScene(game), 'vacuum chamber');
  assert.equal(walls.length, 2, 'the flat view draws two walls'); assert.equal(chambers.length, 1);
  const [c] = chambers;
  assert.deepEqual(Object.keys(c).sort(), ['at', 'colour', 'height', 'kind', 'radius'], 'kind, place, size and colour only (docs/adr/0003)');
  for (const [x, top, bottom] of walls) {
    near(c.radius * LAB_SCALE, Math.abs(x - 195), 'its wall where the flat view\'s is');
    near(c.height * LAB_SCALE, bottom - top, 'as tall'); near(labPixels(c.at)[1], (top + bottom) / 2, 'at the same height');
  }
  assert.equal(c.at[0], 0); assert.equal(c.at[2], 0);
});

test('Hold in 3D: the plasma\'s particles where the flat view draws them, each as faint', async () => {
  const game = await holdIn3D();
  holdSteady(game, .5, { beta: 1.4 });
  const [specks] = entries(nextScene(game), 'specks');
  const toggle = game.ids.get('view-3d'); toggle.checked = false; toggle.onchange();
  game.drawing.length = 0; paint(game);
  const dots = game.drawing.flatMap((c, i) => c[0] === 'arc' && c[3] === 1.6 ? [{ at: [c[1], c[2]], opacity: settingAt(game.drawing, i, 'globalAlpha') }] : []);
  const fill = settingAt(game.drawing, game.drawing.findIndex(c => c[0] === 'arc' && c[3] === 1.6), 'fillStyle');
  assert.equal(dots.length, 80, 'the flat view draws 80 particles'); assert.equal(specks.points.length, 80);
  dots.forEach((dot, i) => {
    labPixels(specks.points[i]).forEach((v, k) => near(v, dot.at[k], `particle ${i} where the flat view draws it`));
    near(specks.opacities[i], dot.opacity * +fill.match(/,\s*([\d.]+)\)$/)[1], `particle ${i} as faint`);
  });
  near(specks.size * LAB_SCALE, 3.2, 'each as wide as the flat view\'s dots'); assert.equal(specks.round, true, 'round, as the flat view\'s dots');
});

test('over Hold\'s 3D view the 2D canvas draws the flat view\'s words and marks: the walls, the middle line and the field lines, and none of its shapes', async () => {
  for (const beta of [.9, 1.5, Infinity]) {
    const flat = bootFromSavedRun(savedRunOn(1)), in3D = await holdIn3D();
    holdSteady(flat, .3, { beta }); holdSteady(in3D, .3, { beta });
    scene(flat); scene(in3D);
    assert.deepEqual(drawnWords(in3D), drawnWords(flat), `words at beta ${beta}`);
    // The marks the flat view draws before the plasma ball; the cusp leaks round it are in 3D.
    const ball = flat.drawing.findIndex(c => c[0] === 'createRadialGradient');
    // As JSON: each game runs in its own context, so their arrays' prototypes differ.
    const marks = drawing => JSON.stringify(drawing.filter(c => ['moveTo', 'lineTo', 'ellipse', 'setLineDash'].includes(c[0])));
    assert.equal(marks(in3D.drawing), marks(flat.drawing.slice(0, ball)), `marks at beta ${beta}`);
    assert.ok(in3D.drawing.some(c => c[0] === 'clearRect'), 'the 2D canvas clears to show the 3D view');
    for (const shape of ['fillRect', 'strokeRect', 'arc', 'createRadialGradient']) assert.ok(!in3D.drawing.some(c => c[0] === shape), `no ${shape} on the 2D canvas at beta ${beta}`);
  }
});

// The Fuel step of a run whose first two steps are done, with the stand-in renderer.
const fuelIn3D = (options = {}) => bootIn3D(savedRunOn(2), options);
// Sets the Fuel step's fuel, temperature (log10 of keV, as the slider) and electron screening,
// then plays `seconds` of it.
function fuelPlay(game, { fuel, lt, screening, seconds = 2 }) {
  click(game, `fu-${fuel}`); if (pressed(game, 'fu-screen') !== screening) click(game, 'fu-screen');
  slide(game, 'fu-t', lt);
  for (let i = 0; i < seconds * 60; i++) game.lab.advance(1 / 60);
}
// The flat Fuel canvas, one frame, in pixels: its wall, its core's glow, and the dots of each
// size it fills round the core (the legend's dots, at x 38, aside), each with its fill.
function fuelShapes(game) {
  game.drawing.length = 0; paint(game);
  const d = game.drawing, wall = d.findIndex(c => c[0] === 'arc'), glow = d.find(c => c[0] === 'createRadialGradient');
  const dots = r => d.flatMap((c, i) => c[0] === 'arc' && c[3] === r && c[1] !== 38 ? [{ at: [c[1], c[2]], fill: settingAt(d, i, 'fillStyle') }] : []);
  return { wall: { at: d[wall].slice(1, 3), radius: d[wall][3], width: settingAt(d, wall, 'lineWidth'), colour: settingAt(d, wall, 'strokeStyle') },
    glow: glow && { at: glow.slice(1, 3), radius: glow[6], stops: glow.stops },
    helium: dots(2.8), neutrons: dots(2.2), electrons: dots(1.3), spots: dots(5) };
}
// The same frame with the 3D view turned off, so the flat view draws the state the scene showed.
function flatAfter(game) {
  const toggle = game.ids.get('view-3d'); toggle.checked = false; toggle.onchange();
  return fuelShapes(game);
}
const rgba = colour => colour.match(/^rgba?\(([^)]+)\)$/)[1].split(',').map(Number);
const hexOf = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const FUEL_CASES = ['dt', 'pb'].flatMap(fuel => [false, true].flatMap(screening => [[fuel, screening, .3], [fuel, screening, fuel === 'dt' ? 1.8 : 2.8]]));

test('Fuel in 3D: a diagram end on at the lab\'s scale, where what burns and how much come from the fuel\'s activity: the helium and the neutrons where the flat view draws them, for both fuels, with electron screening on and off', async () => {
  const counts = {};
  for (const [fuel, screening, lt] of FUEL_CASES) {
    const game = await fuelIn3D(), why = `${fuel} at ${(10 ** lt).toFixed(1)} keV${screening ? ', screened' : ''}`;
    fuelPlay(game, { fuel, lt, screening });
    const frame = nextScene(game), list = frame.views[0].list, flat = flatAfter(game);
    assert.equal(frame.look, 'diagram', 'a schematic, so drawn as a diagram (docs/adr/0004)');
    assert.deepEqual(cameraOf(frame), { angle: 0, scale: LAB_SCALE }, 'end on, at the lab\'s scale');
    for (const kind of ['helium', 'neutrons']) {
      const dots = flat[kind], [specks] = list.filter(e => e.kind === 'specks' && e.of === kind);
      assert.ok(specks, `${kind} listed at ${why}`);
      assert.equal(specks.points.length, dots.length, `as many ${kind} as the flat view draws at ${why}`);
      if (dots.length) assert.equal(specks.colour, dots[0].fill, `${kind} coloured as the flat view's`);
      dots.forEach((dot, i) => labPixels(specks.points[i]).forEach((v, k) => near(v, dot.at[k], `${kind} ${i} where the flat view draws it at ${why}`)));
      near(specks.size * LAB_SCALE, kind === 'helium' ? 5.6 : 4.4, `${kind} as wide as the flat view's dots`); assert.equal(specks.round, true);
      counts[`${why} ${kind}`] = dots.length;
    }
  }
  // Independently of the flat view: deuterium + tritium throws out neutrons, hydrogen + boron-11
  // none, and a fuel that burns makes more helium than one that barely does.
  assert.ok(counts['dt at 63.1 keV neutrons'] > 0 && counts['dt at 63.1 keV, screened neutrons'] > 0, JSON.stringify(counts));
  for (const key of Object.keys(counts)) if (key.startsWith('pb') && key.endsWith('neutrons')) assert.equal(counts[key], 0, key);
  assert.ok(counts['pb at 631.0 keV helium'] > counts['pb at 2.0 keV helium'], JSON.stringify(counts));
  assert.ok(counts['dt at 63.1 keV helium'] > counts['dt at 2.0 keV helium'], JSON.stringify(counts));
});

test('Fuel in 3D: the screening electrons, when screening is on, where the flat view draws them', async () => {
  for (const screening of [false, true]) {
    const game = await fuelIn3D();
    fuelPlay(game, { fuel: 'pb', lt: 1.5, screening });
    const list = nextScene(game).views[0].list, flat = flatAfter(game);
    const electrons = list.filter(e => e.kind === 'specks' && e.of === 'electrons');
    assert.equal(flat.electrons.length, screening ? 36 : 0, 'the flat view draws 36 electrons when screening is on');
    if (!screening) { assert.equal(electrons.length, 0, 'no electrons listed with screening off'); continue; }
    const [specks] = electrons;
    assert.equal(specks.points.length, 36); assert.equal(specks.colour, flat.electrons[0].fill); assert.equal(specks.round, true);
    near(specks.size * LAB_SCALE, 2.6, 'as wide as the flat view\'s dots');
    flat.electrons.forEach((dot, i) => labPixels(specks.points[i]).forEach((v, k) => near(v, dot.at[k], `electron ${i} where the flat view draws it`)));
  }
});

test('Fuel in 3D: the core glows as big and as bright as the flat view\'s for its temperature, and the wall is where the flat view draws it, coloured by its exposure, with each neutron\'s impact on it', async () => {
  for (const [fuel, screening, lt] of FUEL_CASES) {
    const game = await fuelIn3D(), why = `${fuel} at ${(10 ** lt).toFixed(1)} keV${screening ? ', screened' : ''}`;
    fuelPlay(game, { fuel, lt, screening, seconds: 3 });
    const list = nextScene(game).views[0].list, flat = flatAfter(game);
    const [glow] = list.filter(e => e.kind === 'core glow'), [wall] = list.filter(e => e.kind === 'reactor wall');
    labPixels(glow.at).forEach((v, k) => near(v, flat.glow.at[k], `the glow where the flat view's is at ${why}`));
    near(glow.radius * LAB_SCALE, flat.glow.radius, `as big at ${why}`);
    const [[at0, inner], [at1, outer]] = flat.glow.stops, [r, g, b, a] = rgba(inner), [r1, g1, b1, a1] = rgba(outer);
    assert.deepEqual([at0, at1, a1], [0, 1, 0], 'the flat view fades from the middle to nothing at the edge');
    assert.equal(glow.core, hexOf([r, g, b]), `its middle coloured as the flat view's at ${why}`); near(glow.opacity, a, `as bright at ${why}`);
    assert.equal(glow.colour, hexOf([r1, g1, b1]), 'fading to the flat view\'s edge colour');
    labPixels(wall.at).forEach((v, k) => near(v, flat.wall.at[k], `the wall where the flat view's is at ${why}`));
    near(wall.radius * LAB_SCALE, flat.wall.radius, 'as big'); near(wall.width * LAB_SCALE, flat.wall.width, 'as wide');
    assert.equal(wall.colour, flat.wall.colour, `coloured by the exposure, as the flat view's, at ${why}`);
    const [spots] = list.filter(e => e.kind === 'specks' && e.of === 'impacts');
    assert.equal(spots.points.length, flat.spots.length, `as many impacts as the flat view draws at ${why}`);
    flat.spots.forEach((spot, i) => {
      labPixels(spots.points[i]).forEach((v, k) => near(v, spot.at[k], `impact ${i} where the flat view draws it`));
      const [sr, sg, sb, sa] = rgba(spot.fill);
      assert.equal(spots.colour, hexOf([sr, sg, sb])); near(spots.opacities[i], sa, `impact ${i} as faint`);
    });
    near(spots.size * LAB_SCALE, 10, 'each as wide as the flat view\'s'); assert.equal(spots.round, true);
    if (fuel === 'dt' && lt > 1) assert.ok(flat.spots.length > 0, `neutrons strike the wall at ${why}`);
  }
});

test('over Fuel\'s 3D view the 2D canvas draws the flat view\'s words and marks: the field\'s edge and the legend, and none of its shapes', async () => {
  for (const screening of [false, true]) {
    const flat = bootFromSavedRun(savedRunOn(2)), in3D = await fuelIn3D();
    // Cool, so no products are drawn, and the two runs' random products can't differ.
    for (const game of [flat, in3D]) fuelPlay(game, { fuel: 'dt', lt: 0, screening, seconds: .5 });
    scene(flat); scene(in3D);
    assert.deepEqual(drawnWords(in3D), drawnWords(flat), `words${screening ? ', screened' : ''}`);
    const R = Math.min(390, 292.5) * 0.34;
    // The dashed field's edge, and the legend's dots at x 38, are marks; the rest are shapes, in 3D.
    const marks = drawing => JSON.stringify(drawing.filter(c => c[0] === 'setLineDash' || c[0] === 'arc' && (c[1] === 38 || Math.abs(c[3] - R * 0.6) < 1e-9)));
    assert.equal(marks(in3D.drawing), marks(flat.drawing), `marks${screening ? ', screened' : ''}`);
    assert.ok(in3D.drawing.some(c => c[0] === 'clearRect'), 'the 2D canvas clears to show the 3D view');
    assert.equal(in3D.drawing.filter(c => c[0] === 'arc').length, screening ? 4 : 3, 'only the field\'s edge and the legend\'s dots are arcs');
    for (const shape of ['fillRect', 'createRadialGradient']) assert.ok(!in3D.drawing.some(c => c[0] === shape), `no ${shape} on the 2D canvas`);
  }
});

// The Ignite step reloaded at drive power 60 and `p` torr, with the stand-in renderer.
const igniteAt = (p, options = {}) => bootFromSavedRun(savedRunOn(0, d => Object.assign(d.stages[0].values, { power: 60, p })), options);
const igniteIn3D = (p, options = {}) => bootIn3D(savedRunOn(0, d => Object.assign(d.stages[0].values, { power: 60, p })), options);
// The flat Ignite canvas, one frame, in pixels: the pump's pipe, barrel, piston head, rod and
// handle; the plasma's glow; the jar and the haze in it; the ions and electrons (the legend's
// dots, at x 38, aside); and the dashed front the piston presses the plasma to, or null.
function igniteShapes(game) {
  game.drawing.length = 0; paint(game);
  const d = game.drawing, fills = d.flatMap((c, i) => c[0] === 'fillRect' && (c[1] || c[2]) ? [{ box: c.slice(1), fill: settingAt(d, i, 'fillStyle') }] : []);
  const pipe = d.findIndex(c => c[0] === 'lineTo'), barrel = d.findIndex(c => c[0] === 'strokeRect'), glow = d.find(c => c[0] === 'createRadialGradient');
  const arcs = d.flatMap((c, i) => c[0] === 'arc' && c[1] !== 38 ? [{ at: [c[1], c[2]], r: c[3], i }] : []);
  // The jar: the circle its haze fills a pixel inside.
  const haze = arcs.find(c => arcs.some(o => Math.abs(o.r - 1 - c.r) < 1e-9)), jar = arcs.find(o => Math.abs(o.r - 1 - haze.r) < 1e-9);
  const after = (i, call) => d.slice(i + 1).find(c => c[0] === 'stroke' || c[0] === 'fill')?.[0] === call;
  const ring = arcs.find(c => c !== jar && after(c.i, 'stroke') && JSON.stringify(settingAt(d, c.i, 'setLineDash')) === '[5,4]');
  const dots = r => arcs.filter(c => c.r === r).map(c => ({ at: c.at, fill: settingAt(d, c.i, 'fillStyle') }));
  const [head, rod, handle] = fills;
  return {
    pipe: { from: d[pipe - 1].slice(1, 3), to: d[pipe].slice(1, 3), width: settingAt(d, pipe, 'lineWidth'), colour: settingAt(d, pipe, 'strokeStyle') },
    barrel: { box: d[barrel].slice(1), colour: settingAt(d, barrel, 'strokeStyle') }, head, rod, handle,
    glow: glow ? { at: glow.slice(1, 3), radius: glow[6], stops: glow.stops } : null,
    jar: { at: jar.at, radius: jar.r, width: settingAt(d, jar.i, 'lineWidth'), colour: settingAt(d, jar.i, 'strokeStyle') },
    haze: { radius: haze.r, fill: settingAt(d, haze.i, 'fillStyle') },
    ions: dots(4), electrons: dots(1.8),
    front: ring ? { at: ring.at, radius: ring.r, width: settingAt(d, ring.i, 'lineWidth'), colour: settingAt(d, ring.i, 'strokeStyle'), opacity: settingAt(d, ring.i, 'globalAlpha') } : null
  };
}
// The same frame with the 3D view turned off, so the flat Ignite view draws the state the scene showed.
function flatAfterIgnite(game) {
  const toggle = game.ids.get('view-3d'); toggle.checked = false; toggle.onchange();
  const shapes = igniteShapes(game); toggle.checked = true; toggle.onchange(); return shapes;
}
// A flat box [x, y, width, height] in pixels, from a listed centre and its size in metres.
const boxAround = (at, width, height) => { const [x, y] = labPixels(at), w = width * LAB_SCALE, h = height * LAB_SCALE; return [x - w / 2, y - h / 2, w, h]; };
const nearBox = (a, b, why) => a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < 1e-9, `${why}: [${a}] is not [${b}]`));
// Pressures above, in and below the Ignite band, with what the readout says about each.
const IGNITE_PRESSURES = [[760, 'above'], [5, 'above'], [1, 'in'], [.4, 'in'], [.1, 'below']];

test('Ignite in 3D: a diagram side on at the lab\'s scale, where the piston travels with each stroke and presses the plasma in to its front only while the pressure is in its band, above, in and below it', async () => {
  for (const reduced of [false, true]) for (const [p, band] of IGNITE_PRESSURES) {
    const game = await igniteIn3D(p, { reduced });
    // At rest, a stroke's start, part way and done: each stroke takes a fifth of the pressure.
    const heads = {};
    for (const [moment, strokes, seconds] of [['at rest', 0, .5], ['a stroke starts', 1, 0], ['part way', 0, .1], ['done', 0, .3]]) {
      const before = torr(game);
      for (let i = 0; i < strokes; i++) press(game, 'ig-pump', ' ');
      for (let i = 0; i < Math.round(seconds * 20); i++) game.lab.advance(1 / 20);
      if (strokes) { game.lab.advance(0); assert.ok(torr(game) < before, 'a stroke lowers the pressure'); }
      const inBand = pressureNote(game) === 'in the band', why = `${p} torr ${moment} (${torr(game)} torr)${reduced ? ', reduced motion' : ''}`;
      if (moment === 'at rest') assert.equal(inBand, band === 'in', `${p} torr stays ${band} the band at rest`);
      const frame = nextScene(game), flat = flatAfterIgnite(game);
      assert.equal(frame.look, 'diagram', 'a lab schematic, so drawn as a diagram (docs/adr/0004)');
      assert.deepEqual(cameraOf(frame), { angle: 0, scale: LAB_SCALE }, 'side on, at the lab\'s scale');
      const [piston] = entries(frame, 'piston'), [front] = entries(frame, 'compression front');
      nearBox(boxAround(piston.at, 2 * piston.radius, piston.thickness), flat.head.box, `the piston's head where the flat view draws it at ${why}`);
      const [rx, ry] = labPixels(piston.rodTop), [, hy] = labPixels(piston.at); heads[moment] = piston.at[1];
      nearBox([rx - piston.rodWidth * LAB_SCALE / 2, ry, piston.rodWidth * LAB_SCALE, hy - piston.thickness * LAB_SCALE / 2 - ry], flat.rod.box, `its rod at ${why}`);
      assert.equal(piston.colour, flat.head.fill); assert.equal(piston.colour, flat.rod.fill);
      if (!inBand) { assert.equal(front, undefined, `nothing pressed in at ${why}`); assert.equal(flat.front, null); continue; }
      assert.ok(flat.front, `the flat view draws the front at ${why}`);
      labPixels(front.at).forEach((v, k) => near(v, flat.front.at[k], `the front where the flat view's is at ${why}`));
      near(front.radius * LAB_SCALE, flat.front.radius, `as far in at ${why}`); near(front.radius * LAB_SCALE, flat.jar.radius * .45, 'at the piston\'s front radius');
      near(front.width * LAB_SCALE, flat.front.width, 'as wide'); assert.equal(front.colour, flat.front.colour); near(front.opacity, flat.front.opacity, 'as faint');
      assert.deepEqual(front.dash.map(v => Math.round(v * LAB_SCALE * 1e6) / 1e6), [5, 4], 'dashed as the flat view\'s');
    }
    // The stroke lifts the head to the barrel's top, and it travels back down as the stroke ends.
    assert.ok(heads['a stroke starts'] < heads['part way'] && heads['part way'] < heads.done && heads.done === heads['at rest'], `the piston travels: ${JSON.stringify(heads)}`);
  }
});

test('Ignite in 3D: the piston housing and pump handle props, where the flat view draws the barrel and handle, listed by kind, place, size and colour only', async () => {
  const game = await igniteIn3D(5);
  const frame = nextScene(game), flat = flatAfterIgnite(game);
  const [housing] = entries(frame, 'piston housing'), [handle] = entries(frame, 'pump handle');
  assert.deepEqual(Object.keys(housing).sort(), ['at', 'colour', 'height', 'kind', 'radius'], 'kind, place, size and colour only (docs/adr/0003)');
  assert.deepEqual(Object.keys(handle).sort(), ['at', 'colour', 'kind', 'span'], 'kind, place, size and colour only (docs/adr/0003)');
  nearBox(boxAround(housing.at, 2 * housing.radius, housing.height), flat.barrel.box, 'the housing round the flat view\'s barrel');
  const [x, y, w, h] = flat.handle.box;
  labPixels(handle.at).forEach((v, k) => near(v, [x + w / 2, y + h / 2][k], 'the handle where the flat view\'s is'));
  near(handle.span * LAB_SCALE, w, 'as wide'); assert.equal(handle.colour, flat.handle.fill);
  for (const prop of [housing, handle]) assert.equal(prop.at[2], 0);
  const [pipe] = entries(frame, 'pipe');
  labPixels(pipe.from).forEach((v, k) => near(v, flat.pipe.from[k], 'the pipe from the jar')); labPixels(pipe.to).forEach((v, k) => near(v, flat.pipe.to[k], 'to the barrel'));
  near(pipe.width * LAB_SCALE, flat.pipe.width, 'as wide'); assert.equal(pipe.colour, flat.pipe.colour);
});

test('Ignite in 3D: the jar, its haze, the plasma\'s glow and the ions and electrons where, as big and as bright as the flat view draws them, for both gases', async () => {
  for (const gas of ['h', 'ar']) for (const [p] of IGNITE_PRESSURES) {
    const game = await igniteIn3D(p); if (gas === 'ar') click(game, 'gas-ar');
    for (let i = 0; i < 20; i++) game.lab.advance(1 / 20);
    const why = `${gas} at ${p} torr`, frame = nextScene(game), flat = flatAfterIgnite(game);
    const [jar] = entries(frame, 'glass jar'), glows = entries(frame, 'plasma glow');
    labPixels(jar.at).forEach((v, k) => near(v, flat.jar.at[k], `the jar where the flat view's is at ${why}`));
    near(jar.radius * LAB_SCALE, flat.jar.radius, 'as big'); near(jar.width * LAB_SCALE, flat.jar.width, 'as wide'); assert.equal(jar.colour, flat.jar.colour);
    near(jar.inside * LAB_SCALE, flat.haze.radius, 'its haze as big'); const [hr, hg, hb, ha] = rgba(flat.haze.fill);
    assert.equal(jar.hazeColour, hexOf([hr, hg, hb])); near(jar.haze, ha, `the haze as thick at ${why}`);
    assert.equal(glows.length, flat.glow ? 1 : 0, `a glow when the flat view draws one at ${why}`);
    if (flat.glow) {
      const [glow] = glows;
      labPixels(glow.at).forEach((v, k) => near(v, flat.glow.at[k], `the glow where the flat view's is at ${why}`));
      near(glow.radius * LAB_SCALE, flat.glow.radius, `as big at ${why}`);
      assert.equal(glow.stops.length, flat.glow.stops.length);
      flat.glow.stops.forEach(([at, colour], i) => {
        const [r, g, b, a] = rgba(colour), [lat, lcolour, lopacity] = glow.stops[i];
        near(lat, at, 'the stop at the same place'); assert.equal(lcolour, hexOf([r, g, b]), `stop ${i} coloured as the flat view's at ${why}`); near(lopacity, a, `stop ${i} as bright at ${why}`);
      });
    }
    for (const [kind, size] of [['ions', 8], ['electrons', 3.6]]) {
      const [specks] = frame.views[0].list.filter(e => e.kind === 'specks' && e.of === kind), dots = flat[kind];
      assert.equal(dots.length, 28, `the flat view draws 28 ${kind}`); assert.equal(specks.points.length, 28);
      assert.equal(specks.colour, dots[0].fill); near(specks.size * LAB_SCALE, size, `${kind} as wide as the flat view's dots`); assert.equal(specks.round, true);
      dots.forEach((dot, i) => labPixels(specks.points[i]).forEach((v, k) => near(v, dot.at[k], `${kind} ${i} where the flat view draws it at ${why}`)));
    }
  }
});

test('over Ignite\'s 3D view the 2D canvas draws the flat view\'s words and marks: the arrows pressing on the front and the legend, and none of its shapes', async () => {
  for (const [p] of IGNITE_PRESSURES) {
    const flat = igniteAt(p), in3D = await igniteIn3D(p);
    scene(flat); scene(in3D);
    assert.deepEqual(drawnWords(in3D), drawnWords(flat), `words at ${p} torr`);
    // The arrows: the lines and heads drawn after the front's dashes, as the flat view's.
    const arrows = drawing => JSON.stringify(drawing.slice(drawing.findLastIndex(c => c[0] === 'setLineDash' && !c[1].length) + 1).filter(c => ['moveTo', 'lineTo', 'closePath'].includes(c[0])));
    const flatArrows = flat.drawing.some(c => c[0] === 'setLineDash') ? arrows(flat.drawing) : '[]';
    assert.equal(in3D.drawing.some(c => c[0] === 'setLineDash') ? arrows(in3D.drawing) : JSON.stringify(in3D.drawing.filter(c => ['moveTo', 'lineTo', 'closePath'].includes(c[0]))), flatArrows, `arrows at ${p} torr`);
    assert.ok(in3D.drawing.some(c => c[0] === 'clearRect'), 'the 2D canvas clears to show the 3D view');
    assert.ok(in3D.drawing.filter(c => c[0] === 'arc').every(c => c[1] === 38), 'only the legend\'s dots are arcs');
    for (const shape of ['fillRect', 'strokeRect', 'createRadialGradient']) assert.ok(!in3D.drawing.some(c => c[0] === shape), `no ${shape} on the 2D canvas at ${p} torr`);
  }
});


test('the 3D view switch starts on where the renderer starts, is remembered on this device apart from the saved run, and turning it off draws the flat view', async () => {
  const game = await bootIn3D('ready-to-converge');
  const toggle = game.ids.get('view-3d');
  assert.equal(toggle.checked, true); assert.equal(toggle.disabled, false);
  assert.equal(game.view3d.given.props.airliner, 'assets/airliner.glb');
  assert.ok(nextScene(game), 'it draws in 3D');
  leave(game); const savedBefore = game.storage.get('ipt-run-v2');
  toggle.checked = false; toggle.onchange();
  assert.equal(nextScene(game), null, 'no 3D frame once off'); assert.equal(game.ids.get('gl').hidden, true);
  assert.ok(game.drawing.some(c => c[0] === 'fillRect'), 'the flat view draws');
  assert.deepEqual(JSON.parse(game.storage.get('ion-pumpy-view-v1')), { on: false });
  leave(game); assert.equal(game.storage.get('ipt-run-v2'), savedBefore, 'the saved run is unchanged');
  const again = await bootIn3D('ready-to-converge', { storage: game.storage });
  assert.equal(again.ids.get('view-3d').checked, false, 'remembered off');
  assert.equal(again.view3d.given, undefined, 'and the renderer never loads');
  // Where storage throws, the switch takes its default, and turning it changes nothing else.
  const blocked = await bootIn3D('ready-to-converge', { noStorage: true, rejected: true });
  assert.equal(blocked.ids.get('view-3d').checked, true);
  blocked.ids.get('view-3d').checked = false; assert.doesNotThrow(() => blocked.ids.get('view-3d').onchange());
});

test('where the renderer cannot start, or loses WebGL, the flat view draws and the switch says why', async () => {
  const failed = await bootIn3D('ready-to-converge', { view3d: { fails: true } });
  assert.equal(failed.ids.get('view-3d').checked, false); assert.equal(failed.ids.get('view-3d').disabled, true);
  assert.match(text(failed, 'view-3d-status'), /flat view is showing/);
  assert.equal(nextScene(failed), null); assert.ok(failed.drawing.some(c => c[0] === 'fillRect'), 'the flat view draws');
  const lost = await bootIn3D('ready-to-converge');
  assert.ok(nextScene(lost));
  const savedRunBeforeLoss = lost.storage.get('ipt-run-v2');
  const savedViewBeforeLoss = lost.storage.get('ion-pumpy-view-v1');
  lost.view3d.given.onLost();
  assert.equal(lost.storage.get('ipt-run-v2'), savedRunBeforeLoss, 'context loss does not mutate the saved run');
  assert.equal(lost.storage.get('ion-pumpy-view-v1'), savedViewBeforeLoss, 'context loss does not rewrite the view preference');
  assert.equal(nextScene(lost), null, 'no 3D frame after WebGL is lost'); assert.equal(lost.ids.get('gl').hidden, true);
  assert.match(text(lost, 'view-3d-status'), /lost WebGL, so the flat view is showing/);
  assert.equal(lost.ids.get('view-3d').checked, false);
  assert.equal(lost.ids.get('view-3d').disabled, true, 'disabled until browser restores WebGL');
  lost.ids.get('gl').listeners.webglcontextrestored();
  assert.equal(lost.ids.get('view-3d').disabled, false, 'restoration unlocks the switch');
  assert.equal(lost.ids.get('view-3d').checked, true, 'original preference is preserved');
  assert.equal(lost.storage.get('ipt-run-v2'), savedRunBeforeLoss, 'restoration does not rewrite the saved run');
  assert.equal(lost.storage.get('ion-pumpy-view-v1'), savedViewBeforeLoss, 'restoration does not rewrite preference');
  paint(lost); await settle();
  assert.ok(nextScene(lost), 'a fresh 3D renderer draws after context restoration');
  lost.view3d.given.onLost();
  assert.equal(nextScene(lost), null, 'a second loss falls back to flat again');
  lost.ids.get('gl').listeners.webglcontextrestored();
  paint(lost); await settle();
  assert.ok(nextScene(lost), 'repeated loss and restoration can recover');
});

test('the 3D view draws nothing while the tab is hidden, and steps without a scene list draw flat', async () => {
  const game = await bootIn3D('ready-to-converge');
  game.document.hidden = true; assert.equal(nextScene(game), null, 'hidden tab');
  game.document.hidden = false; assert.ok(nextScene(game), 'visible again');
  click(game, 'step-0'); assert.ok(nextScene(game), 'Ignite draws in 3D');
  const done = await bootIn3D('completed-run'); click(done, 'step-6');
  assert.equal(nextScene(done), null, 'the Ledger has no scene list'); assert.equal(done.ids.get('gl').hidden, true);
});


// Copy acceptance checks follow ADR 0001: verify what the game actually renders
// at each unlocked step instead of matching JavaScript source formatting.
test('all six stages render actionable plain-English instructions and a source card', () => {
  const game = bootFromSavedRun('completed-run');
  const expected = [
    /Hold Pump[\s\S]*marked range for 3 seconds/,
    /Use the control pad[\s\S]*6 seconds/,
    /Choose Hydrogen \+ boron-11/,
    /Move the orbs onto the hollow rings[\s\S]*both camera views/,
    /This is a game model, not a demonstrated method\./,
    /open the gate when the indicator enters the marked range/,
  ];
  for (let i = 0; i < expected.length; i++) {
    click(game, 'step-' + i);
    const panel = text(game, 'panel');
    const brief = panel.match(/<p class="brief">([\s\S]*?)<\/p>/);
    assert.ok(brief, 'Step ' + (i + 1) + ' renders a brief for the player');
    assert.match(brief[1], expected[i], 'Step ' + (i + 1) + ' gives a useful next action');
    assert.match(sourceCard(game), /<summary>Explanation and sources<\/summary>/,
      'Step ' + (i + 1) + ' keeps scientific explanation available');
  }
});

test('science, score and safety qualifications appear in the player interface', () => {
  const game = bootFromSavedRun('completed-run');
  click(game, 'step-1');
  assert.match(text(game, 'panel'), /Beta compares plasma pressure with magnetic pressure\./);
  click(game, 'step-2');
  const hint = game.ids.get('fu-screen-note').textContent;
  assert.match(hint, /\bOptional\b/);
  assert.match(hint, /\bgame rule\b/i);
  assert.match(hint, /\blesson\b/i);
  assert.match(text(game, 'panel'), /not a real radiation dose/);
  click(game, 'step-4');
  assert.match(text(game, 'panel'), /This follows a simplified rule based on the report\./);
  click(game, 'step-5');
  assert.match(text(game, 'panel'), /This final step uses the settings you chose earlier/);
  click(game, 'step-6');
  assert.match(text(game, 'panel'), /not independently verified/);
});


test('dynamic step goals tell players what to adjust and how to recover', () => {
  const plasma = boot();
  assert.match(text(plasma, 'goaltext'), /pressure in the marked range/);
  assert.match(text(plasma, 'goaltext'), /timer restarts/);

  const field = bootFromSavedRun(savedRunOn(1));
  assert.match(text(field, 'goaltext'), /plasma ball centred for 6 seconds/);

  const fuel = bootFromSavedRun(savedRunOn(2));
  assert.match(text(fuel, 'goaltext'), /Hydrogen \+ boron-11/);

  const formation = bootFromSavedRun(savedRunOn(3));
  assert.match(text(formation, 'goaltext'), /Match the hollow rings in both views/);

  const finale = bootFromSavedRun('ready-to-converge');
  assert.match(text(finale, 'goaltext'), /Press Start closing in.*Open it now/);
  click(finale, 'cv-go');
  click(finale, 'cv-go');
  assert.match(text(finale, 'cv-msg'), /Too early\..*try again/);
});
