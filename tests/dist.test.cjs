const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Set DIST_PREBUILT=1 to check an existing dist/ instead of rebuilding
// (for hosts where node cannot spawn bash).
test('dist/ contains every local file the pages and audio cues load', (t) => {
  if (!process.env.DIST_PREBUILT) {
    try {
      execFileSync('bash', [path.join(root, 'scripts', 'build-dist.sh')], { cwd: root, stdio: 'pipe' });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EPERM') {
        t.skip(`cannot spawn bash (${err.code}); run scripts/build-dist.sh, then DIST_PREBUILT=1`);
        return;
      }
      throw err;
    }
  }

  const refs = new Set();
  for (const page of ['index.html', '404.html', 'privacy.html']) {
    for (const m of read(page).matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith('#') || ref.startsWith('data:')) continue;
      refs.add(ref.replace(/^\//, '').split(/[?#]/)[0]);
    }
  }
  const cues = [...read('audio-cues.js').matchAll(/assets\/audio\/[\w.-]+\.mp3/g)].map((m) => m[0]);
  assert.ok(cues.length > 0, 'audio-cues.js should reference assets/audio files');
  for (const cue of cues) refs.add(cue);

  for (const name of ['audio.js', 'audio-cues.js']) {
    assert.ok(refs.has(name), `index.html should load ${name}`);
  }

  const missing = [...refs].filter((ref) => ref && !fs.existsSync(path.join(dist, ref)));
  assert.deepEqual(missing, [], `missing from dist/: ${missing.join(', ')}`);
});
