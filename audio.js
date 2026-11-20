/* Functional game audio. No network or AudioContext until enable(). */
(function (root) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
  const LIMIT = 6;
  const COOLDOWNS = { 'pump-stroke': .16, 'control-tick': .16, 'particle-leak': .25, 'neutron-impact': .25, 'charged-product': .33, caution: 2, 'timing-window': .6, 'lesson-complete': .6 };
  const UI = new Set(['ui-confirm', 'ui-toggle', 'control-tick', 'stage-enter', 'reset', 'ledger']);
  const PRIORITY = { 'timing-window': 5, 'lesson-complete': 5, 'timing-miss': 4, caution: 4, 'wall-loss': 4 };
  const NOISE = new Set(['pump-stroke', 'particle-leak', 'neutron-impact', 'charged-product', 'wall-loss', 'plasma-ignite', 'plasma-fade', 'plate-adjust']);
  const ELECTRICAL = new Set(['plasma-bed', 'field-bed', 'fusion-bed', 'throat-bed', 'formation-bed', 'convergence']);

  class IonSound {
    constructor(cues, env = root) {
      this.cues = cues || {}; this.env = env; this.on = false; this.ac = null;
      this.mode = 'paused'; this.epoch = 0; this.enableEpoch = 0;
      this.buffers = new Map(); this.pending = new Map(); this.failed = new Set();
      this.voices = new Set(); this.loops = new Map(); this.desired = new Map(); this.last = new Map();
      this.volume = .55; this.ambience = .35; this.pulse = true;
    }
    async enable() {
      const token = ++this.enableEpoch;
      try {
        if (!this.ac) {
          const AC = this.env.AudioContext || this.env.webkitAudioContext;
          if (!AC) return false;
          this.ac = new AC(); this.master = this.ac.createGain(); this.master.gain.value = 0;
          this.limiter = this.ac.createDynamicsCompressor();
          this.limiter.threshold.value = -9; this.limiter.knee.value = 6; this.limiter.ratio.value = 12;
          this.limiter.attack.value = .003; this.limiter.release.value = .12;
          this.master.connect(this.limiter); this.limiter.connect(this.ac.destination);
          this.noise = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate);
          const data = this.noise.getChannelData(0); let seed = 2166136261;
          for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
        }
        await this.ac.resume();
        if (token !== this.enableEpoch || this.mode === 'hidden') return false;
        if (this.ac.state && this.ac.state !== 'running') return false;
        this.on = true; this.master.gain.setTargetAtTime(this.volume, this.ac.currentTime, .025);
        // Prime short UI sounds only; stage beds and effects remain lazy.
        for (const id of ['ui-confirm', 'ui-toggle', 'lesson-complete', 'control-tick']) this.load(id);
        return true;
      } catch (_) { this.on = false; return false; }
    }
    disable() {
      ++this.enableEpoch; this.on = false; this.stopAll();
      if (this.ac) this.master.gain.setTargetAtTime(0, this.ac.currentTime, .012);
    }
    setVolume(v) { this.volume = clamp(v, 0, 1); if (this.on) this.master.gain.setTargetAtTime(this.volume, this.ac.currentTime, .025); }
    setAmbience(v) { this.ambience = clamp(v, 0, 1); }
    setPulse(v) { if (this.pulse !== !!v) { this.pulse = !!v; this.stopAll(); } }
    path(id) { const c = this.cues[id]; return c && (!this.pulse && c.pulseOffUrl ? c.pulseOffUrl : c.url); }
    allowed(kind = 'sfx') { return this.on && !['hidden', 'finale'].includes(this.mode) && (this.mode === 'active' || kind === 'ui' || kind === 'completion'); }
    setMode(mode) {
      if (mode === this.mode) return;
      this.mode = mode; ++this.epoch; this.desired.clear();
      for (const v of [...this.voices]) if (!(mode === 'paused' && v.kind === 'completion')) this.stop(v);
      if (mode === 'hidden') ++this.enableEpoch;
    }
    stop(v) {
      if (!this.voices.has(v)) return;
      this.voices.delete(v); if (this.loops.get(v.id) === v) this.loops.delete(v.id);
      try { const now = this.ac.currentTime; v.gain.gain.cancelScheduledValues(now); v.gain.gain.setTargetAtTime(0, now, .008); v.source.stop(now + .04); } catch (_) {}
      // Sources and filters disconnect onended, including after an explicit stop.
    }
    stopAll() { ++this.epoch; this.desired.clear(); for (const v of [...this.voices]) this.stop(v); this.last.clear(); }
    load(id) {
      const url = this.path(id);
      if (!this.on || !url || this.buffers.has(url) || this.failed.has(url)) return Promise.resolve();
      if (this.pending.has(url)) return this.pending.get(url);
      const fetcher = this.env.fetch;
      if (!fetcher) { this.failed.add(url); return Promise.resolve(); }
      const work = Promise.resolve().then(() => fetcher.call(this.env, url, { credentials: 'same-origin' }))
        .then(r => { if (!r.ok) throw Error('audio unavailable'); return r.arrayBuffer(); })
        .then(bytes => this.ac.decodeAudioData(bytes))
        .then(buffer => { this.buffers.set(url, buffer); })
        .catch(() => { this.failed.add(url); })
        .finally(() => this.pending.delete(url));
      // Decoding only fills the cache. It never plays a delayed event.
      this.pending.set(url, work); return work;
    }
    prime(ids) { if (this.on) for (const id of ids) this.load(id); }
    beginFrame() { this.desired.clear(); }
    bed(id, options = {}) { if (this.allowed() && this.cues[id]) this.desired.set(id, { level: 1, brightness: 3000, ...options }); }
    endFrame() {
      const wanted = [...this.desired].slice(0, 2);
      const keep = new Set(wanted.map(([id]) => id));
      for (const [id, v] of this.loops) if (!keep.has(id) || !this.allowed()) this.stop(v);
      for (const [id, opt] of wanted) {
        if (!this.allowed()) break;
        const level = clamp(opt.level, 0, 1) * this.ambience;
        if (!level) { if (this.loops.has(id)) this.stop(this.loops.get(id)); continue; }
        const url = this.path(id), buffer = this.buffers.get(url); this.load(id);
        let v = this.loops.get(id);
        if (v && (v.path !== url || (v.fallback && buffer))) { this.stop(v); v = null; }
        if (!v) {
          if (!buffer && !ELECTRICAL.has(id)) continue;
          if (buffer && opt.once && (opt.offset || 0) >= buffer.duration) continue;
          v = this.start(id, { kind: 'bed', level, buffer, offset: opt.offset || 0, loop: !opt.once, rate: opt.rate || 1, priority: 0 });
          if (v) this.loops.set(id, v);
        }
        if (v) { if (v.source.playbackRate) v.source.playbackRate.setTargetAtTime(clamp(opt.rate || 1, .5, 1), this.ac.currentTime, .025); v.gain.gain.setTargetAtTime(level * (v.fallback ? .045 : 1), this.ac.currentTime, .06); v.filter.frequency.setTargetAtTime(clamp(opt.brightness, 400, 5000), this.ac.currentTime, .08); }
      }
    }
    play(id, options = {}) {
      if (!this.cues[id]) return false;
      const kind = options.kind || (UI.has(id) ? 'ui' : id === 'lesson-complete' ? 'completion' : 'sfx');
      if (!this.allowed(kind)) return false;
      const t = this.ac.currentTime, cooldown = COOLDOWNS[id] ?? .12;
      if (t - (this.last.get(id) ?? -Infinity) < cooldown) return false;
      const priority = PRIORITY[id] || (kind === 'ui' ? 2 : 1);
      const oneShots = [...this.voices].filter(v => v.kind !== 'bed');
      if (oneShots.length >= LIMIT) { const lowest = oneShots.sort((a, b) => a.priority - b.priority)[0]; if (lowest.priority > priority) return false; this.stop(lowest); }
      if (id === 'lesson-complete') for (const v of [...this.voices]) if (v.priority < priority) this.stop(v);
      this.last.set(id, t);
      const buffer = this.buffers.get(this.path(id)); this.load(id);
      return !!this.start(id, { kind, level: clamp(options.level ?? .8, 0, 1), buffer, loop: false, priority });
    }
    start(id, opt) {
      if (!this.allowed(opt.kind) || !this.ac) return null;
      const ac = this.ac, now = ac.currentTime, gain = ac.createGain(), filter = ac.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 4000;
      let source, duration, fallback = !opt.buffer;
      if (opt.buffer) {
        source = ac.createBufferSource(); source.buffer = opt.buffer; source.loop = opt.loop; source.playbackRate.value = clamp(opt.rate || 1, .5, 1);
        if (source.loop) { source.loopStart = 0; source.loopEnd = Math.min(opt.buffer.duration, this.cues[id].seconds); }
        duration = opt.buffer.duration;
      } else if (NOISE.has(id)) {
        source = ac.createBufferSource(); source.buffer = this.noise; source.loop = opt.loop;
        duration = Math.min(this.cues[id].seconds, .25); filter.frequency.value = id === 'neutron-impact' ? 1200 : id === 'wall-loss' ? 350 : 900;
      } else {
        source = ac.createOscillator(); source.type = 'sine';
        source.frequency.value = opt.kind === 'bed' ? 125.28 : id === 'timing-window' ? 501.12 : 250.56;
        duration = Math.min(this.cues[id].seconds, .45);
        if (id === 'timing-miss') { source.frequency.value = 313.2; source.frequency.exponentialRampToValueAtTime(250.56, now + duration); }
      }
      const level = opt.level * (fallback ? (opt.kind === 'bed' ? .045 : .09) : 1);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(level, now + .008);
      const sustained = opt.kind === 'bed';
      if (!sustained) { gain.gain.setValueAtTime(level, now + Math.max(.009, duration - .04)); gain.gain.linearRampToValueAtTime(0, now + duration); }
      source.connect(filter); filter.connect(gain); gain.connect(this.master);
      const v = { id, source, filter, gain, kind: opt.kind, path: this.path(id), fallback, priority: opt.priority };
      this.voices.add(v);
      source.onended = () => { this.voices.delete(v); if (this.loops.get(id) === v) this.loops.delete(id); try { source.disconnect(); filter.disconnect(); gain.disconnect(); } catch (_) {} };
      try {
        if (opt.buffer) source.start(now, Math.min(opt.offset || 0, Math.max(0, duration - .001)));
        else source.start(now);
        if (!sustained) source.stop(now + duration + .015);
      } catch (_) { this.stop(v); return null; }
      return v;
    }
  }
  if (typeof module === 'object' && module.exports) module.exports = IonSound;
  else root.IonSound = IonSound;
})(typeof window !== 'undefined' ? window : globalThis);
