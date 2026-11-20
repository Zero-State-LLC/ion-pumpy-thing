const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const IonSound = require('../audio.js');
const cues = require('../audio-cues.js');

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function parameter(value = 0) { return { value, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} }; }
function harness({ fetch, resume, decode } = {}) {
  const created = [], requests = []; let contexts = 0;
  class AC {
    constructor() { ++contexts; this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = {}; }
    resume() { return resume ? resume() : Promise.resolve(); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createDynamicsCompressor() { return { threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect() {} }; }
    createBiquadFilter() { return { frequency: parameter(), connect() {}, disconnect() {} }; }
    createBuffer(ch, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
    source(type) { const s = { type, frequency: parameter(), playbackRate: parameter(1), connect() {}, disconnect() { this.disconnected = true; }, start(...args) { this.started = args; }, stop(...args) { this.stopped = args; } }; created.push(s); return s; }
    createBufferSource() { return this.source('buffer'); }
    createOscillator() { return this.source('oscillator'); }
    decodeAudioData() { return decode ? decode() : Promise.resolve({ duration: 8.1736875 }); }
  }
  const env = { AudioContext: AC, fetch: (...args) => { requests.push(args); return fetch ? fetch(...args) : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); } };
  return { sound: new IonSound(cues, env), created, requests, contexts: () => contexts };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('no context, requests or audio before a successful player enable', async () => {
  const h = harness(); h.sound.setMode('active'); h.sound.prime(Object.keys(cues)); h.sound.play('pump-stroke');
  h.sound.beginFrame(); h.sound.bed('field-bed'); h.sound.endFrame();
  assert.equal(h.contexts(), 0); assert.equal(h.requests.length, 0); assert.equal(h.created.length, 0);
  assert.equal(await h.sound.enable(), true); await settle(); assert.equal(h.contexts(), 1); assert.ok(h.requests.length > 0);
});

test('a blocked or rejected resume leaves sound off without an unhandled rejection', async () => {
  const h = harness({ resume: () => Promise.reject(Error('gesture rejected')) });
  assert.equal(await h.sound.enable(), false); assert.equal(h.sound.on, false); assert.equal(h.requests.length, 0);
});

test('mute or hiding during an outstanding enable cannot turn sound back on', async () => {
  for (const action of ['mute', 'hidden']) {
    const wait = deferred(), h = harness({ resume: () => wait.promise }); const enabling = h.sound.enable();
    if (action === 'mute') h.sound.disable(); else h.sound.setMode('hidden');
    wait.resolve(); assert.equal(await enabling, false); assert.equal(h.sound.on, false); assert.equal(h.requests.length, 0);
  }
});

test('late fetch/decode only caches a buffer; it never replays a cancelled event', async () => {
  const wait = deferred(), h = harness({ decode: () => wait.promise });
  await h.sound.enable(); h.sound.setMode('active'); h.sound.play('pump-stroke');
  const count = h.created.length; h.sound.disable(); wait.resolve({ duration: .3 }); await settle();
  assert.equal(h.created.length, count); assert.equal(h.sound.voices.size, 0); assert.ok(h.sound.buffers.size > 0);
});

test('missing media falls back immediately and is not fetched repeatedly per frame', async () => {
  const h = harness({ fetch: async () => ({ ok: false }) }); await h.sound.enable(); h.sound.setMode('active');
  assert.equal(h.sound.play('pump-stroke'), true); await settle(); const before = h.requests.length;
  for (let i = 0; i < 20; i++) { h.sound.ac.currentTime += .2; h.sound.play('pump-stroke'); }
  await settle(); assert.equal(h.requests.length, before); assert.ok(h.created.some(s => s.started));
});

test('pause, reading, hidden tabs and the finale stop loops and pending one-shots', async () => {
  for (const mode of ['paused', 'reading', 'hidden', 'finale']) {
    const h = harness(); await h.sound.enable(); h.sound.setMode('active'); h.sound.play('pump-stroke');
    h.sound.beginFrame(); h.sound.bed('field-bed'); h.sound.endFrame(); assert.equal(h.sound.voices.size, 2);
    h.sound.setMode(mode); assert.equal(h.sound.voices.size, 0); assert.equal(h.sound.loops.size, 0);
    assert.equal(h.sound.play('pump-stroke'), false);
    if (['hidden', 'finale'].includes(mode)) assert.equal(h.sound.play('ui-toggle'), false);
  }
});

test('automatic lesson pause preserves one completion cue; source reading cancels it', async () => {
  const h = harness(); await h.sound.enable(); h.sound.setMode('active');
  h.sound.play('particle-leak'); h.sound.play('lesson-complete');
  h.sound.setMode('paused'); assert.equal(h.sound.voices.size, 1); assert.equal([...h.sound.voices][0].id, 'lesson-complete');
  h.sound.setMode('reading'); assert.equal(h.sound.voices.size, 0);
});

test('decorative events are rate limited and cannot steal a timing cue at the voice limit', async () => {
  const h = harness(); await h.sound.enable(); h.sound.setMode('active');
  assert.equal(h.sound.play('neutron-impact'), true); assert.equal(h.sound.play('neutron-impact'), false);
  h.sound.play('timing-window');
  for (const id of ['pump-stroke', 'particle-leak', 'charged-product', 'ui-confirm', 'ui-toggle', 'alignment', 'plasma-ignite']) h.sound.play(id);
  assert.equal([...h.sound.voices].filter(v => v.kind !== 'bed').length, 6);
  assert.ok([...h.sound.voices].some(v => v.id === 'timing-window'));
});

test('pulse choice swaps the actual loop asset and cancels the prior voice', async () => {
  const h = harness(); await h.sound.enable(); h.sound.setMode('active');
  h.sound.beginFrame(); h.sound.bed('plasma-bed'); h.sound.endFrame();
  const old = [...h.sound.voices][0]; h.sound.setPulse(false); assert.ok(old.source.stopped);
  h.sound.beginFrame(); h.sound.bed('plasma-bed'); h.sound.endFrame(); await settle();
  assert.ok(h.requests.some(([url]) => url === cues['plasma-bed'].pulseOffUrl));
  assert.equal(h.sound.path('plasma-bed'), 'assets/audio/plasma-bed-pulse-off.mp3');
});

test('beds stay bounded, disappear when no longer requested and respect background zero', async () => {
  const h = harness(); await h.sound.enable(); h.sound.setMode('active');
  for (let i = 0; i < 30; i++) { h.sound.beginFrame(); for (const id of ['field-bed', 'plasma-bed', 'fusion-bed']) h.sound.bed(id); h.sound.endFrame(); }
  assert.equal(h.sound.loops.size, 2);
  h.sound.setAmbience(0); h.sound.endFrame(); assert.equal(h.sound.loops.size, 0);
  h.sound.setAmbience(.5); h.sound.beginFrame(); h.sound.bed('field-bed'); h.sound.endFrame(); assert.equal(h.sound.loops.size, 1);
  h.sound.beginFrame(); h.sound.endFrame(); assert.equal(h.sound.loops.size, 0);
});

test('convergence resumes from current simulated progress without looping or replaying a finished clip', async () => {
  const h = harness(); await h.sound.enable(); h.sound.setMode('active');
  h.sound.buffers.set(cues.convergence.url, { duration: 5 });
  h.sound.beginFrame(); h.sound.bed('convergence', { once: true, offset: 2.2, rate: .5 }); h.sound.endFrame();
  const v = h.sound.loops.get('convergence'); assert.equal(v.source.loop, false); assert.deepEqual(v.source.started, [0, 2.2]); assert.equal(v.source.playbackRate.value, .5);
  h.sound.setMode('paused'); h.sound.setMode('active'); h.sound.beginFrame(); h.sound.bed('convergence', { once: true, offset: 5.1 }); h.sound.endFrame();
  assert.equal(h.sound.loops.size, 0);
});

test('natural source endings disconnect audio nodes and release voice slots', async () => {
  const h = harness(); await h.sound.enable(); h.sound.setMode('active'); h.sound.play('ui-confirm');
  const v = [...h.sound.voices][0]; v.source.onended(); assert.equal(h.sound.voices.size, 0); assert.equal(v.source.disconnected, true);
});

test('all cue paths exist, stay local and match the published source hashes', () => {
  const root = path.join(__dirname, '..'), provenance = JSON.parse(fs.readFileSync(path.join(root, 'docs/AUDIO-PROVENANCE.json')));
  assert.equal(Object.keys(cues).length, 29);
  for (const [id, cue] of Object.entries(cues)) {
    for (const url of [cue.url, cue.pulseOffUrl].filter(Boolean)) { assert.match(url, /^assets\/audio\/[a-z-]+\.mp3$/); assert.ok(fs.statSync(path.join(root, url)).size > 1000); }
    const asset = provenance.assets.find(a => a.id === id); assert.ok(asset);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, cue.url))).digest('hex'), asset.mp3_sha256);
    if (cue.pulseOffUrl) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, cue.pulseOffUrl))).digest('hex'), asset.pulse_off_mp3_sha256);
  }
  assert.equal(Object.values(cues).filter(c => c.pulseOffUrl).length, 4);
});
