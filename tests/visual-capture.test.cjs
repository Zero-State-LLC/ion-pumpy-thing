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

// Slice 2 of docs/VISUAL-AUDIT.md: the plasma bodies' shader must keep Hold's 3D draw under the
// gate the audit set, 3.0 ms median / 4.0 p95 on the desktop window and 3.5 / 5.0 in the 390 px
// window, on the capture machine; the baseline's 4.5 / 8.0 was finding 4's bug, not a budget.
test('the slice-2 set has every shot, with Hold drawn inside its gate and every 3D shot at the same pinned second', () => {
  const slice2 = path.join(root, 'docs', 'visual-audit', 'slice-2');
  const index = JSON.parse(readFileSync(path.join(slice2, 'index.json'), 'utf8'));
  assert.equal(index.set, 'slice-2');
  assert.equal(index.frozenAt, 1, 'every 3D shot is taken at one second on the renderer\'s clock');
  assert.equal(index.shots.length, 48);
  for (const shot of index.shots) assert.ok(existsSync(path.join(slice2, shot.file)), `${shot.file} is missing`);
  const gate = { 'hold-3d-desktop': [3.0, 4.0], 'hold-open-3d-desktop': [3.0, 4.0], 'hold-3d-phone': [3.5, 5.0], 'hold-open-3d-phone': [3.5, 5.0] };
  for (const [name, [median, p95]] of Object.entries(gate)) {
    const d = index.shots.find(s => s.name === name).drawMs;
    assert.ok(d.median <= median && d.p95 <= p95, `${name} draws in ${d.median} / ${d.p95} ms, over its ${median} / ${p95} gate`);
  }
  const { statSync, readdirSync } = require('node:fs');
  const total = readdirSync(slice2).reduce((sum, f) => sum + statSync(path.join(slice2, f)).size, 0);
  assert.ok(total < 4 * 1024 * 1024, `slice-2 set is ${(total / 1024 / 1024).toFixed(1)} MB`);
});

// Slice 5 of docs/VISUAL-AUDIT.md: the set is taken at high, the level auto starts on at a desktop,
// so the bloom's cost is what the gate from slice 2 measures; every 3D shot must still draw inside it.
test('the slice-5 set is taken at high, with every 3D shot inside the slice-2 gate', () => {
  const slice5 = path.join(root, 'docs', 'visual-audit', 'slice-5');
  const index = JSON.parse(readFileSync(path.join(slice5, 'index.json'), 'utf8'));
  assert.equal(index.set, 'slice-5');
  assert.equal(index.quality, 'high', 'the set records the level it was taken at');
  assert.equal(index.frozenAt, 1);
  assert.equal(index.shots.length, 48);
  for (const shot of index.shots) {
    assert.ok(existsSync(path.join(slice5, shot.file)), `${shot.file} is missing`);
    assert.deepEqual(shot.errors, [], `${shot.name} threw`);
    if (shot.view !== '3d') continue;
    const [median, p95] = shot.window === 'phone' ? [3.5, 5.0] : [3.0, 4.0];
    assert.ok(shot.drawMs.median <= median && shot.drawMs.p95 <= p95, `${shot.name} draws in ${shot.drawMs.median} / ${shot.drawMs.p95} ms at high, over the ${median} / ${p95} gate`);
  }
  const { statSync, readdirSync } = require('node:fs');
  const total = readdirSync(slice5).reduce((sum, f) => sum + statSync(path.join(slice5, f)).size, 0);
  assert.ok(total < 4 * 1024 * 1024, `slice-5 set is ${(total / 1024 / 1024).toFixed(1)} MB`);
  const audit = readFileSync(path.join(root, 'docs', 'VISUAL-AUDIT.md'), 'utf8');
  const hold = index.shots.find(s => s.name === 'hold-3d-desktop').drawMs;
  assert.ok(audit.includes(`Slice 5, result`) && audit.includes(`${hold.median.toFixed(1)} / ${hold.p95.toFixed(1)} ms desktop`), 'the audit quotes Hold\'s draw cost at high');
});
