// The visual-audit capture tool (tools/visual-capture.mjs) is evidence for docs/VISUAL-AUDIT.md.
// These checks keep it honest without a browser: it refuses to run without a set name, it
// drives only the scenes the browser check already reaches, and every baseline shot the audit
// cites exists with its draw cost recorded. The capture itself needs a browser and a GPU and is
// run by hand, not in CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tool = path.join(root, 'tools', 'visual-capture.mjs');
const baseline = path.join(root, 'docs', 'visual-audit', 'baseline');

test('the capture tool refuses to run without a set name', () => {
  const run = spawnSync(process.execPath, [tool], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Usage: node tools\/visual-capture\.mjs <set-name>/);
});

test('the capture tool drives every step the game has, in the flat and the 3D view', () => {
  const source = readFileSync(tool, 'utf8');
  const scenes = [...source.matchAll(/\[(\d), (?:null|'[\w-]+'), '([\w-]+)', (?:null|\d+)(?:, \[[^\]]*\])?\]/g)];
  assert.deepEqual([...new Set(scenes.map(m => Number(m[1])))].sort(), [0, 1, 2, 3, 4, 5]);
  assert.ok(scenes.some(m => m[2] === 'hold-open'), 'the Hold step is captured with its cusp leaks open as well as closed');
  assert.match(source, /for \(const view of \['flat', '3d'\]\)/);
});

test('the baseline set has every shot the audit cites, with a draw cost for each 3D shot', () => {
  const index = JSON.parse(readFileSync(path.join(baseline, 'index.json'), 'utf8'));
  assert.equal(index.set, 'baseline');
  assert.equal(index.shots.length, 44, 'eleven scenes, two views, two windows');
  for (const shot of index.shots) {
    assert.ok(shot.shown, `${shot.name} was not shown`);
    assert.deepEqual(shot.errors, [], `${shot.name} had page errors`);
    assert.ok(existsSync(path.join(baseline, shot.file)), `${shot.file} is missing`);
    if (shot.view === '3d') assert.ok(shot.drawMs.median > 0 && shot.drawMs.frames >= 60, `${shot.name} has no draw cost`);
  }
  const audit = readFileSync(path.join(root, 'docs', 'VISUAL-AUDIT.md'), 'utf8');
  const hold = index.shots.find(s => s.name === 'hold-3d-desktop').drawMs;
  assert.ok(audit.includes(`${hold.median.toFixed(1)} / ${hold.p95.toFixed(1)}`), 'the audit quotes the baseline draw cost');
});

test('baseline screenshots stay small, since docs/ is in the repository', () => {
  const { statSync, readdirSync } = require('node:fs');
  const total = readdirSync(baseline).reduce((sum, f) => sum + statSync(path.join(baseline, f)).size, 0);
  assert.ok(total < 4 * 1024 * 1024, `baseline set is ${(total / 1024 / 1024).toFixed(1)} MB`);
});
